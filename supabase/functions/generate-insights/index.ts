import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }   from "../_shared/cors.ts";
import { openrouter, OPENROUTER_MODEL } from "../_shared/openrouter.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── View row types ───────────────────────────────────────────────────────────

interface ExpenseSummaryRow {
  user_id: string;
  month: string;
  category: string;
  total_amount: number;
  transaction_count: number;
  avg_per_transaction: number;
}

interface HabitSummaryRow {
  user_id: string;
  habit_id: string;
  habit_name: string;
  frequency: string;
  total_possible_completions: number;
  actual_completions: number;
  consistency_score: number;
  current_streak: number;
  longest_streak_last_30_days: number;
}

interface FinancialSnapshotRow {
  user_id: string;
  total_income: number;
  total_expenses: number;
  net_savings: number;
  biggest_spending_category: string | null;
  month_over_month_expense_change: number | null;
  active_loans_count: number;
  active_loans_total: number;
}

interface BudgetPerformanceRow {
  user_id: string;
  category: string;
  budget_amount: number;
  spent_amount: number;
  remaining: number;
  utilization_percentage: number;
  status: "on_track" | "warning" | "exceeded";
}

// ─── Derived metrics ──────────────────────────────────────────────────────────

interface DerivedMetrics {
  spending_concentration: number; // 0-100
  expense_volatility: { cv: number; label: "stable" | "moderate" | "erratic" } | null;
  habit_recovery_rate: { rate: number; label: "high" | "moderate" | "low" } | null;
}

// ─── Atomic Habits diagnostics ────────────────────────────────────────────────
// One prescribed behavior-change lever per habit, computed deterministically.
// The LLM applies the lever in coach voice; it never picks the lever itself.

type HabitLever =
  | "two_minute_rule"          // consistency so low the habit is oversized — shrink it
  | "never_miss_twice"         // streak just broke / 2+ consecutive misses — recover, don't restart
  | "habit_stacking"           // mid consistency — anchor to the strongest habit
  | "implementation_intention" // decent but drifting — pin to a time and place
  | "goldilocks"               // near-perfect — boredom is the risk, level it up
  | "maintain";                // working — reinforce, name the compounding

interface HabitDiagnostic {
  habit_name:    string;
  consistency:   number;
  current_streak: number;
  stage:         "starting" | "building" | "established";
  trend:         "improving" | "steady" | "slipping" | "insufficient_data";
  missed_twice:  boolean;       // 2+ consecutive missed days ending yesterday (daily habits)
  weak_weekday:  string | null; // weekday where the habit reliably dies
  lever:         HabitLever;
  anchor:        string | null; // stacking anchor (strongest habit), only for habit_stacking
}

interface PersonaRuleRow {
  id:         string;
  name:       string;
  flag_level: string;
  start_date: string;
}

interface IdentityAlignment {
  rules: Array<{ name: string; votes_last_7: number; votes_last_30: number }>;
  votes_last_7:    number;
  possible_last_7: number;
  alignment_pct:   number | null; // votes cast / possible, last 7 days
}

interface SpendingPersona {
  name:     string; // e.g. "The Weekender"
  evidence: string; // one line, with real numbers
}

interface HealthScoreBreakdown {
  score: number;
  components: { savings: number; budget: number; habit: number; volatility: number };
}

// ─── Cycle bounds ─────────────────────────────────────────────────────────────

interface CycleBounds {
  cycleStart:     string;   // "yyyy-mm-dd"
  cycleEnd:       string;
  prevCycleStart: string;
  prevCycleEnd:   string;
  cycleType:      "calendar" | "payday";
  payday:         number;
}

function defaultCycleBounds(): CycleBounds {
  const now      = new Date();
  const firstOf  = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastOf   = (y: number, m: number) => {
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  };
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const py = m === 0 ? y - 1 : y;
  const pm = m === 0 ? 11    : m - 1;
  return {
    cycleStart:     firstOf(y, m),
    cycleEnd:       lastOf(y, m),
    prevCycleStart: firstOf(py, pm),
    prevCycleEnd:   lastOf(py, pm),
    cycleType:      "calendar",
    payday:         1,
  };
}

function parseCycleBounds(body: unknown): CycleBounds {
  const fallback = defaultCycleBounds();
  if (!body || typeof body !== "object") return fallback;
  const b = body as Record<string, unknown>;
  const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isYmd(b.cycleStart) || !isYmd(b.cycleEnd) || !isYmd(b.prevCycleStart) || !isYmd(b.prevCycleEnd)) {
    return fallback;
  }
  return {
    cycleStart:     b.cycleStart,
    cycleEnd:       b.cycleEnd,
    prevCycleStart: b.prevCycleStart,
    prevCycleEnd:   b.prevCycleEnd,
    cycleType:      b.cycleType === "payday" ? "payday" : "calendar",
    payday:         typeof b.payday === "number" ? b.payday : 1,
  };
}

// ─── Derived metric helpers ───────────────────────────────────────────────────

function computeHabitRecoveryRate(
  habits: HabitSummaryRow[],
  completions: Array<{ habit_id: string; date: string }>,
): { rate: number; label: "high" | "moderate" | "low" } | null {
  const dailyHabits = habits.filter(h => h.frequency === "daily");
  if (dailyHabits.length === 0) return null;

  // Build last 30 days (oldest → newest)
  const days: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const byHabit: Record<string, Set<string>> = {};
  for (const c of completions) {
    (byHabit[c.habit_id] ??= new Set()).add(c.date);
  }

  let recoveries = 0;
  let failedRecoveries = 0;

  for (const h of dailyHabits) {
    const completed = byHabit[h.habit_id] ?? new Set<string>();
    for (let i = 0; i < days.length; i++) {
      if (completed.has(days[i])) continue;
      // Need at least 1 future day to determine recovery
      if (i + 1 >= days.length) continue;
      let recovered = false;
      for (let j = i + 1; j <= i + 3 && j < days.length; j++) {
        if (completed.has(days[j])) { recovered = true; break; }
      }
      if (recovered) recoveries++;
      else failedRecoveries++;
    }
  }

  const total = recoveries + failedRecoveries;
  if (total === 0) return null;
  const rate = recoveries / total;
  const label: "high" | "moderate" | "low" =
    rate > 0.7 ? "high" : rate >= 0.4 ? "moderate" : "low";
  return { rate: Number(rate.toFixed(2)), label };
}

// ─── Atomic Habits engine (deterministic — the AI only phrases the coaching) ──

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function computeHabitDiagnostics(
  habits: HabitSummaryRow[],
  completions: Array<{ habit_id: string; date: string }>,
): HabitDiagnostic[] {
  if (habits.length === 0) return [];

  const days = lastNDays(30);
  const byHabit: Record<string, Set<string>> = {};
  for (const c of completions) {
    (byHabit[c.habit_id] ??= new Set()).add(c.date);
  }

  // Stacking anchor: the most reliable habit (≥85% consistency) — weak habits
  // get attached AFTER this one ("After I X, I will Y").
  const anchorHabit = habits
    .filter(h => Number(h.consistency_score) >= 85)
    .sort((a, b) => Number(b.consistency_score) - Number(a.consistency_score))[0] ?? null;

  return habits.map((h) => {
    const consistency = Number(h.consistency_score);
    const possible    = Number(h.total_possible_completions);
    const completed   = byHabit[h.habit_id] ?? new Set<string>();

    const stage: HabitDiagnostic["stage"] =
      possible < 14 ? "starting" : consistency >= 80 ? "established" : "building";

    // Trend: first 15 days vs last 15 days of the window
    let trend: HabitDiagnostic["trend"] = "insufficient_data";
    if (possible >= 21) {
      const firstHalf  = days.slice(0, 15).filter(d => completed.has(d)).length;
      const secondHalf = days.slice(15).filter(d => completed.has(d)).length;
      const diff = secondHalf - firstHalf;
      trend = diff >= 2 ? "improving" : diff <= -2 ? "slipping" : "steady";
    }

    // Missed twice: yesterday AND the day before both missed (today doesn't
    // count as missed yet). Only meaningful for daily habits with history.
    const yesterday = days[days.length - 2];
    const dayBefore = days[days.length - 3];
    const missed_twice =
      h.frequency === "daily" &&
      Number(h.actual_completions) > 0 &&
      !completed.has(yesterday) &&
      !completed.has(dayBefore);

    // Weak weekday: a day of the week where the habit reliably dies
    // (rate ≤ 40% and clearly below the habit's own average).
    let weak_weekday: string | null = null;
    if (h.frequency === "daily" && possible >= 21) {
      const done:  number[] = [0, 0, 0, 0, 0, 0, 0];
      const total: number[] = [0, 0, 0, 0, 0, 0, 0];
      for (const d of days) {
        const dow = new Date(d + "T00:00:00Z").getUTCDay();
        total[dow]++;
        if (completed.has(d)) done[dow]++;
      }
      const avgRate = days.filter(d => completed.has(d)).length / days.length;
      let worstDow = -1, worstRate = 1;
      for (let dow = 0; dow < 7; dow++) {
        if (total[dow] === 0) continue;
        const rate = done[dow] / total[dow];
        if (rate < worstRate) { worstRate = rate; worstDow = dow; }
      }
      if (worstDow >= 0 && worstRate <= 0.4 && avgRate - worstRate >= 0.3) {
        weak_weekday = WEEKDAY_NAMES[worstDow];
      }
    }

    // One lever per habit, priority-ordered
    let lever: HabitLever;
    if (consistency < 30) {
      lever = "two_minute_rule";
    } else if (missed_twice || (Number(h.current_streak) === 0 && Number(h.longest_streak_last_30_days) >= 5)) {
      lever = "never_miss_twice";
    } else if (consistency < 65) {
      lever = "habit_stacking";
    } else if (trend === "slipping") {
      lever = "implementation_intention";
    } else if (consistency >= 95 && stage === "established") {
      lever = "goldilocks";
    } else {
      lever = "maintain";
    }

    const anchor =
      lever === "habit_stacking" && anchorHabit && anchorHabit.habit_id !== h.habit_id
        ? anchorHabit.habit_name
        : null;

    return {
      habit_name:     h.habit_name,
      consistency,
      current_streak: Number(h.current_streak),
      stage,
      trend,
      missed_twice,
      weak_weekday,
      lever,
      anchor,
    };
  });
}

// Persona rules are identity votes: each completion is a vote for the person
// the user is becoming (Atomic Habits' identity-based habit model).
function computeIdentityAlignment(
  rules: PersonaRuleRow[],
  completions: Array<{ habit_id: string; date: string }>,
): IdentityAlignment | null {
  if (rules.length === 0) return null;

  const last7  = new Set(lastNDays(7));
  const last30 = new Set(lastNDays(30));
  const byRule: Record<string, string[]> = {};
  for (const c of completions) {
    (byRule[c.habit_id] ??= []).push(c.date);
  }

  const todayMs = new Date(lastNDays(1)[0] + "T00:00:00Z").getTime();
  let votes7 = 0, possible7 = 0;

  const ruleStats = rules.map((r) => {
    const dates = byRule[r.id] ?? [];
    const v7  = dates.filter(d => last7.has(d)).length;
    const v30 = dates.filter(d => last30.has(d)).length;
    const startMs  = new Date(r.start_date + "T00:00:00Z").getTime();
    const daysLive = Math.floor((todayMs - startMs) / 86_400_000) + 1;
    votes7    += v7;
    possible7 += Math.max(0, Math.min(7, daysLive));
    return { name: r.name, votes_last_7: v7, votes_last_30: v30 };
  });

  return {
    rules:           ruleStats,
    votes_last_7:    votes7,
    possible_last_7: possible7,
    alignment_pct:   possible7 > 0 ? Math.round((votes7 / possible7) * 100) : null,
  };
}

// Deterministic spending archetype — a mirror, not a horoscope. Priority-ordered
// decision tree over real cycle signals; the LLM addresses it, never invents it.
function computeSpendingPersona(
  snap:          FinancialSnapshotRow,
  budgets:       BudgetPerformanceRow[],
  derived:       DerivedMetrics,
  cycleExpenses: Array<{ amount: number | string; category: string; date: string }>,
  currency:      string,
): SpendingPersona | null {
  if (cycleExpenses.length < 5) return null; // not enough signal to name a pattern

  const total = cycleExpenses.reduce((s, r) => s + Number(r.amount), 0);
  if (total <= 0) return null;

  const fmt = (n: number) => `${currency} ${Math.round(n)}`;

  // Weekend share: Fri + Sat + Sun (covers both Fri–Sat and Sat–Sun weekends)
  let weekendSpend = 0;
  const byCat: Record<string, { amt: number; count: number }> = {};
  for (const r of cycleExpenses) {
    const dow = new Date(r.date + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 5 || dow === 6) weekendSpend += Number(r.amount);
    const c = (byCat[r.category] ??= { amt: 0, count: 0 });
    c.amt   += Number(r.amount);
    c.count += 1;
  }
  const weekendShare = weekendSpend / total;
  const avgTxn       = total / cycleExpenses.length;
  const topCat = Object.entries(byCat).sort((a, b) => b[1].amt - a[1].amt)[0];

  const savingsRate = snap.total_income > 0 ? snap.net_savings / snap.total_income : null;
  const exceeded    = budgets.filter(b => b.status === "exceeded").length;
  const onTrackPct  = budgets.length > 0 ? budgets.filter(b => b.status === "on_track").length / budgets.length : null;

  if ((savingsRate !== null && savingsRate < 0) || (budgets.length > 0 && exceeded / budgets.length >= 0.5)) {
    return {
      name: "The Firefighter",
      evidence: savingsRate !== null && savingsRate < 0
        ? `spending (${fmt(snap.total_expenses)}) outran income (${fmt(snap.total_income)}) this cycle`
        : `${exceeded} of ${budgets.length} budgets blown this cycle`,
    };
  }
  if (savingsRate !== null && savingsRate >= 0.25 && (onTrackPct === null || onTrackPct >= 0.7)
      && derived.expense_volatility?.label !== "erratic") {
    return {
      name: "The Architect",
      evidence: `saved ${Math.round(savingsRate * 100)}% of income with budgets holding`,
    };
  }
  if (weekendShare >= 0.55) {
    return {
      name: "The Weekender",
      evidence: `${Math.round(weekendShare * 100)}% of spending lands Fri–Sun (${fmt(weekendSpend)} of ${fmt(total)})`,
    };
  }
  if (topCat && topCat[1].count >= 12 && topCat[1].amt / topCat[1].count < avgTxn) {
    return {
      name: "The Drip Spender",
      evidence: `${topCat[1].count} small ${topCat[0]} purchases (avg ${fmt(topCat[1].amt / topCat[1].count)}) quietly added up to ${fmt(topCat[1].amt)}`,
    };
  }
  if (derived.spending_concentration >= 70) {
    return {
      name: "The Big-Ticket Spender",
      evidence: `top 2 categories drive ${derived.spending_concentration}% of all spending`,
    };
  }
  return {
    name: "The Balancer",
    evidence: savingsRate !== null
      ? `spending spread across categories, saving ${Math.round(savingsRate * 100)}% of income`
      : `spending spread across categories, no single runaway pattern`,
  };
}

function computeDerivedMetrics(
  cycleExpenses: Array<{ amount: number | string; category: string }>,
  monthlyExpenses: ExpenseSummaryRow[],
  habits: HabitSummaryRow[],
  habitCompletions: Array<{ habit_id: string; date: string }>,
): DerivedMetrics {
  // spending_concentration: top 2 categories / total of current cycle
  let spending_concentration = 0;
  if (cycleExpenses.length > 0) {
    const byCat: Record<string, number> = {};
    for (const r of cycleExpenses) {
      byCat[r.category] = (byCat[r.category] ?? 0) + Number(r.amount);
    }
    const sorted = Object.values(byCat).sort((a, b) => b - a);
    const total = sorted.reduce((s, v) => s + v, 0);
    if (total > 0) {
      const top2 = (sorted[0] ?? 0) + (sorted[1] ?? 0);
      spending_concentration = Number(((top2 / total) * 100).toFixed(1));
    }
  }

  // expense_volatility: CV of monthly totals from 3-month view
  let expense_volatility: DerivedMetrics["expense_volatility"] = null;
  if (monthlyExpenses.length > 0) {
    const byMonth: Record<string, number> = {};
    for (const r of monthlyExpenses) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + Number(r.total_amount);
    }
    const totals = Object.values(byMonth);
    if (totals.length >= 2) {
      const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
      if (mean > 0) {
        const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
        const cv = stddev / mean;
        const label: "stable" | "moderate" | "erratic" =
          cv < 0.15 ? "stable" : cv <= 0.35 ? "moderate" : "erratic";
        expense_volatility = { cv: Number(cv.toFixed(2)), label };
      }
    }
  }

  const habit_recovery_rate = computeHabitRecoveryRate(habits, habitCompletions);

  return { spending_concentration, expense_volatility, habit_recovery_rate };
}

function computeFinancialHealthScore(
  snap: FinancialSnapshotRow | null,
  budgets: BudgetPerformanceRow[],
  habits: HabitSummaryRow[],
  derived: DerivedMetrics,
): HealthScoreBreakdown {
  // savingsScore (0-10): linear on (net_savings / total_income). >= 0.3 → 10. negative → 0.
  let savingsScore = 7;
  if (snap && snap.total_income > 0) {
    const ratio = snap.net_savings / snap.total_income;
    if (ratio >= 0.3) savingsScore = 10;
    else if (ratio < 0) savingsScore = 0;
    else savingsScore = Math.round((ratio / 0.3) * 10);
  }

  // budgetScore (0-10): % budget categories on_track
  let budgetScore = 7;
  if (budgets.length > 0) {
    const onTrack = budgets.filter(b => b.status === "on_track").length;
    budgetScore = Math.round((onTrack / budgets.length) * 10);
  }

  // habitScore (0-10): avg consistency_score / 10
  let habitScore = 7;
  if (habits.length > 0) {
    const avgConsistency =
      habits.reduce((s, h) => s + Number(h.consistency_score), 0) / habits.length;
    habitScore = Math.round(avgConsistency / 10);
  }

  // volatilityScore (0-10): stable→10, moderate→6, erratic→2, null→7
  let volatilityScore = 7;
  if (derived.expense_volatility) {
    const lbl = derived.expense_volatility.label;
    volatilityScore = lbl === "stable" ? 10 : lbl === "moderate" ? 6 : 2;
  }

  const raw =
    savingsScore   * 0.35 +
    budgetScore    * 0.25 +
    habitScore     * 0.25 +
    volatilityScore * 0.15;
  const score = Math.max(1, Math.min(10, Math.round(raw)));

  return {
    score,
    components: { savings: savingsScore, budget: budgetScore, habit: habitScore, volatility: volatilityScore },
  };
}

// ─── Memory extraction (Part A) ───────────────────────────────────────────────

function extractMemories(
  snap:      FinancialSnapshotRow | null,
  budgets:   BudgetPerformanceRow[],
  habits:    HabitSummaryRow[],
  derived:   DerivedMetrics,
  userId:    string,
  currency:  string,
  cycleType: "calendar" | "payday",
  persona:   SpendingPersona | null,
  identity:  IdentityAlignment | null,
): Array<{ user_id: string; memory_key: string; memory_value: string; confidence: number; last_updated: string }> {
  const now = new Date().toISOString();
  const out: Array<{ user_id: string; memory_key: string; memory_value: string; confidence: number; last_updated: string }> = [];

  const push = (key: string, value: string) =>
    out.push({ user_id: userId, memory_key: key, memory_value: value, confidence: 1.0, last_updated: now });

  if (snap?.biggest_spending_category) {
    push("biggest_spending_category", snap.biggest_spending_category);
  }

  if (habits.length > 0) {
    const sorted    = [...habits].sort((a, b) => Number(a.consistency_score) - Number(b.consistency_score));
    const weakest   = sorted[0];
    const strongest = sorted[sorted.length - 1];
    push("weakest_habit",   `${weakest.habit_name} (${weakest.consistency_score}% consistency)`);
    push("strongest_habit", `${strongest.habit_name} (${strongest.consistency_score}% consistency)`);
  }

  if (snap) {
    const key = cycleType === "payday" ? "current_cycle_savings" : "current_month_savings";
    push(key, `${currency} ${Number(snap.net_savings).toFixed(0)}`);
  }

  if (budgets.length > 0) {
    const exceeded = budgets.filter(b => b.status === "exceeded");
    const pool     = exceeded.length > 0 ? exceeded : budgets;
    const worst    = pool.reduce((a, b) =>
      Number(b.utilization_percentage) > Number(a.utilization_percentage) ? b : a
    );
    push("most_exceeded_budget_category", worst.category);
  }

  // expense_volatility (replaces the old, mislabeled income_stability key)
  if (derived.expense_volatility) {
    push("expense_volatility", derived.expense_volatility.label);
  }

  if (persona) {
    push("spending_persona", `${persona.name} — ${persona.evidence}`);
  }

  if (identity?.alignment_pct !== null && identity?.alignment_pct !== undefined) {
    push("identity_alignment",
      `${identity.alignment_pct}% (${identity.votes_last_7} of ${identity.possible_last_7} identity votes cast this week)`);
  }

  return out;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(unhelpfulTypes: string[]): string {
  let base = `You are a friendly, no-nonsense personal finance and habit coach.
Talk like a real coach, not an analyst. Warm, direct, human.

VOICE RULES:
- Talk TO the user, not ABOUT them. Use "you" and "your".
- Use everyday words. Say "spending" not "expenditure". Say "jumped" not "increased significantly".
- Numbers are essential — but wrap them in plain language.
- One observation, then one specific suggestion. Don't over-explain.
- Sound like a friend who happens to know money, not a textbook.

FORBIDDEN WORDS (do not use ever):
"month-over-month", "indicates", "concentration", "discretionary", "consumption",
"trajectory", "metrics", "represents", "demonstrates", "exhibits"

BEHAVIORAL LEVERAGE — use these techniques surgically, not constantly.
Aim for roughly 1 leverage technique per 3 observations.

LOSS FRAMING: When the user is leaking money or breaking a streak, frame as a
loss not a missed gain. "You're bleeding BDT 500 a week to food you don't
remember eating" hits harder than "You could save BDT 500."

IDENTITY ANCHORING: Reference who the user is becoming or claims to be.
"Disciplined operators don't break a 12-day streak for a snack."

IMPLEMENTATION INTENTIONS: When prescribing action, use if-then format.
"When Friday hits and takeout temptation rises, order one item not three"
beats "spend less on food."

SUNK-COST AS ASSET: For long streaks, name the investment. "You've banked
12 days. Don't bankrupt the run for one night."

FUTURE-SELF CONFRONTATION (use sparingly, max once per response):
"The version of you in six months is being decided by Friday's choice."

STRATEGIC DISSATISFACTION: Even on a good month, name the next gap.
Never let the user feel done.

COMPARATIVE PRESSURE: Compare the user only to their PAST SELF — never to
other people. "Last month-you saved BDT 12k. This month-you is on track
for BDT 8k. Where did the BDT 4k go?"

HABIT COACHING PLAYBOOK — habit_coaching runs on these behavior-change
principles. The data includes a "Habit Diagnostics" section that prescribes
ONE lever per habit; apply that lever with the user's real numbers. Never pick
a different lever, never lecture theory, never name a book or a "law" — speak
the principle in plain coach language.

IDENTITY VOTES: Every completion is a vote for the person the user is becoming;
every skip is a vote for the old self. When Identity Rules are listed, quote the
user's own rule text back at them — those are their words about who they want
to be. "You wrote 'stay calm under pressure' — 5 votes this week says you meant it."

THE FOUR LAWS: A habit sticks when it's obvious (visible cue), attractive
(paired with something wanted), easy (low friction), and satisfying (immediate
reward). Diagnose the ONE that's missing; fix that one, not all four.

NEVER MISS TWICE: Missing once is an accident. Missing twice is the start of a
new (worse) habit. When a streak just broke, the target is ONE completion
tomorrow — not a perfect week, not guilt about the miss.

TWO-MINUTE RULE: A habit under 30% isn't a discipline problem, it's oversized.
Shrink it until it's almost silly to skip ("read one page", "put on your shoes")
and prescribe that exact starter version.

HABIT STACKING: Attach a weak habit to a reliable one, in this exact shape:
"After I [anchor habit], I will [new habit]." Use the anchor named in the
diagnostics; if none exists, anchor to a fixed daily event (after breakfast,
after locking the door).

GOLDILOCKS RULE: A habit at ~100% is at risk of boredom, not failure.
Prescribe a just-manageable step up so it stays alive.

PLATEAU OF LATENT POTENTIAL: When effort is up but results lag, say the work
is being stored, not wasted — like ice melting at 31°F, nothing visible until 32.

EXPENSE PERSONA: When a "Spending Persona" is given, it was computed from this
cycle's real numbers. Address it by name once ("That's a classic Weekender
move"), aim advice at its defining pattern, and frame it as this cycle's
identity, not a life sentence — name who they could become instead. Connect
money and habits through identity: budgets fail, identities don't.

EVIDENCE RULE: Every claim must be traceable to a number in the data. If the
data doesn't show it, don't say it.

HARD LINES — never cross these:
- No shame tactics around body, weight, gym performance, eating, or appearance
- No self-worth attacks ("you're lazy", "you have no discipline")
- No catastrophizing ("you'll fail", "this always happens")
- Strategic dissatisfaction = pointing at the gap. Identity erosion = attacking
  the person. Do the first, never the second.

PRIORITIES (in order):
1. What changed in the user's behavior and why it matters
2. Risk patterns worth flagging
3. Specific numbers — always
4. One concrete action

If evidence is sparse or weak, say so plainly. Don't pretend to know more than the data shows.

EXAMPLE OF BAD OUTPUT (analyst voice):
"Food spending increased 38% month-over-month and now represents 41% of total expenses,
indicating spending concentration in discretionary consumption."

EXAMPLE OF GOOD OUTPUT (coach voice):
"Food's eating up almost half your money this month — BDT 9,200 of your BDT 22,000 spend.
That's a 38% jump from last month, and it's not groceries doing it. Try capping takeout
at 2 days a week. You'll feel that difference fast."

ANOTHER GOOD EXAMPLE:
"Your morning run is rock solid — 12 days straight. But reading dropped from 84% to 50%
this month. When one habit takes off, another usually pays the price. Block 20 minutes
after dinner three nights a week and you'll get reading back without losing the run."

Return a JSON object with exactly these 5 keys:
- "spending_summary": 4-6 sentences in coach voice — what shifted, what it means, why it
  matters. If a Spending Persona is given, address it by name once.
- "habit_coaching": 4-6 sentences in coach voice covering at most 2 habits: the biggest
  win (with its streak or consistency number) and the most fixable slip — fixed with its
  prescribed lever from Habit Diagnostics as one concrete, doable prescription. When
  Identity Rules exist, tie one point to the user's own rule text.
- "anomaly": 1-2 sentences flagging anything unusual ("Nothing weird this period." if clean)
- "financial_health": object with "verdict" only — 1-2 sentences in plain language. Score is computed externally.
- "top_action": one specific thing to do this week, with a number, aimed at the Spending
  Persona's defining pattern when one is given
  (e.g. "Cap food spending at BDT 7,500 next week — that's 20% below your current pace")

Respond with valid JSON only. No markdown code fences. No text outside the JSON object.`;

  if (unhelpfulTypes.length > 0) {
    base += `\n\nThe user previously found these insight types unhelpful: ${unhelpfulTypes.join(", ")}.
Avoid repeating that style of analysis. Be more specific and actionable.`;
  }

  return base;
}

// Plain-language rendering of each lever so the LLM applies it instead of
// interpreting a slug.
function leverInstruction(d: HabitDiagnostic): string {
  switch (d.lever) {
    case "two_minute_rule":
      return "TWO-MINUTE RULE — the habit is oversized; prescribe an exact scaled-down starter version";
    case "never_miss_twice":
      return "NEVER MISS TWICE — streak recovery mode; the target is one completion tomorrow, not a perfect week";
    case "habit_stacking":
      return d.anchor
        ? `HABIT STACKING — prescribe: "After I ${d.anchor}, I will [this habit]"`
        : `HABIT STACKING — anchor it to a fixed daily event (after breakfast, after locking the door)`;
    case "implementation_intention":
      return "IMPLEMENTATION INTENTION — pin it to a time and place: 'I will [habit] at [time] in [place]'";
    case "goldilocks":
      return "GOLDILOCKS — near-perfect; boredom is the risk, prescribe a just-manageable step up";
    case "maintain":
      return "MAINTAIN — it's working; reinforce the compounding, don't prescribe changes";
  }
}

function buildUserPrompt(
  snap:        FinancialSnapshotRow | null,
  expenses:    ExpenseSummaryRow[],
  budgets:     BudgetPerformanceRow[],
  habits:      HabitSummaryRow[],
  currency:    string,
  memoriesMap: Record<string, string>,
  cycle:       CycleBounds,
  derived:     DerivedMetrics,
  health:      HealthScoreBreakdown,
  diagnostics: HabitDiagnostic[],
  identity:    IdentityAlignment | null,
  persona:     SpendingPersona | null,
): string {
  const cycleLabel = cycle.cycleType === "payday"
    ? `Current Pay Cycle (${cycle.cycleStart} → ${cycle.cycleEnd}, payday on the ${cycle.payday})`
    : `Current Month (${cycle.cycleStart} → ${cycle.cycleEnd})`;
  const periodWord = cycle.cycleType === "payday" ? "cycle"      : "month";
  const vsLabel    = cycle.cycleType === "payday" ? "last cycle" : "last month";
  const lines: string[] = [];

  // ── What I know about you (Part B) ───────────────────────────────────────
  const savingsMemKey = cycle.cycleType === "payday" ? "current_cycle_savings" : "current_month_savings";
  const knownKeys = ["biggest_spending_category", "weakest_habit", "strongest_habit",
                     savingsMemKey, "most_exceeded_budget_category", "expense_volatility",
                     "spending_persona", "identity_alignment"];
  if (knownKeys.some(k => memoriesMap[k])) {
    lines.push("## What I know about you");
    if (memoriesMap.biggest_spending_category)
      lines.push(`- Biggest spending category: ${memoriesMap.biggest_spending_category}`);
    if (memoriesMap.weakest_habit)
      lines.push(`- Weakest habit: ${memoriesMap.weakest_habit}`);
    if (memoriesMap.strongest_habit)
      lines.push(`- Strongest habit: ${memoriesMap.strongest_habit}`);
    if (memoriesMap[savingsMemKey])
      lines.push(`- Savings this ${periodWord}: ${memoriesMap[savingsMemKey]}`);
    if (memoriesMap.most_exceeded_budget_category)
      lines.push(`- Most exceeded budget category: ${memoriesMap.most_exceeded_budget_category}`);
    if (memoriesMap.expense_volatility)
      lines.push(`- Expense volatility: ${memoriesMap.expense_volatility}`);
    if (memoriesMap.spending_persona)
      lines.push(`- Spending persona last cycle: ${memoriesMap.spending_persona}`);
    if (memoriesMap.identity_alignment)
      lines.push(`- Identity alignment last analysis: ${memoriesMap.identity_alignment}`);
    lines.push("");
  }

  // ── Financial snapshot ────────────────────────────────────────────────────
  if (snap) {
    lines.push(`## ${cycleLabel} Financial Snapshot`);
    lines.push(`Income:   ${currency} ${snap.total_income}`);
    lines.push(`Expenses: ${currency} ${snap.total_expenses}`);
    lines.push(`Net savings: ${currency} ${snap.net_savings}`);
    if (snap.biggest_spending_category) {
      lines.push(`Biggest spending category: ${snap.biggest_spending_category}`);
    }
    if (snap.month_over_month_expense_change !== null) {
      const dir = snap.month_over_month_expense_change >= 0 ? "up" : "down";
      lines.push(`Expenses vs ${vsLabel}: ${dir} ${Math.abs(snap.month_over_month_expense_change)}%`);
    } else {
      lines.push(`Expenses vs ${vsLabel}: no prior data available`);
    }
    lines.push(`Active unpaid loans: ${snap.active_loans_count} (${currency} ${snap.active_loans_total} outstanding)`);
    lines.push("");
  }

  // ── Spending breakdown (last 3 months, grouped by month) ──────────────────
  if (expenses.length > 0) {
    const byMonth: Record<string, ExpenseSummaryRow[]> = {};
    for (const r of expenses) {
      (byMonth[r.month] ??= []).push(r);
    }
    lines.push("## Spending Breakdown (Last 3 Months)");
    for (const month of Object.keys(byMonth).sort()) {
      const rows  = byMonth[month].sort((a, b) => Number(b.total_amount) - Number(a.total_amount));
      const total = rows.reduce((s, r) => s + Number(r.total_amount), 0);
      lines.push(`\n${month}  |  Total: ${currency} ${total.toFixed(0)}`);
      for (const r of rows) {
        lines.push(
          `  ${r.category}: ${currency} ${Number(r.total_amount).toFixed(0)}` +
          ` (${r.transaction_count} transactions, avg ${currency} ${Number(r.avg_per_transaction).toFixed(0)})`
        );
      }
    }
    lines.push("");
  }

  // ── Budget performance ────────────────────────────────────────────────────
  if (budgets.length > 0) {
    lines.push(`## Budget Performance (Current ${cycle.cycleType === "payday" ? "Cycle" : "Month"})`);
    for (const b of budgets) {
      const flag =
        b.status === "exceeded" ? "[EXCEEDED]" :
        b.status === "warning"  ? "[WARNING]"  : "[on track]";
      lines.push(
        `  ${b.category}: ${currency} ${Number(b.spent_amount).toFixed(0)}` +
        ` / ${currency} ${Number(b.budget_amount).toFixed(0)}` +
        ` (${b.utilization_percentage ?? 0}%)  ${flag}`
      );
    }
    lines.push("");
  }

  // ── Habit summary (sorted worst → best consistency) ───────────────────────
  if (habits.length > 0) {
    lines.push("## Habit Summary (Last 30 Days)");
    const sorted = [...habits].sort((a, b) => Number(a.consistency_score) - Number(b.consistency_score));
    for (const h of sorted) {
      lines.push(
        `  ${h.habit_name} (${h.frequency}): ` +
        `${h.actual_completions}/${h.total_possible_completions} days, ` +
        `${h.consistency_score}% consistent, ` +
        `current streak ${h.current_streak}d, ` +
        `longest streak this period ${h.longest_streak_last_30_days}d`
      );
    }
    lines.push("");
  }

  // ── Habit diagnostics (precomputed levers — the AI applies, never picks) ──
  if (diagnostics.length > 0) {
    lines.push("## Habit Diagnostics (computed — one prescribed lever per habit)");
    for (const d of diagnostics) {
      const facts: string[] = [
        `${d.consistency}% consistent`,
        `streak ${d.current_streak}d`,
        `stage ${d.stage}`,
      ];
      if (d.trend !== "insufficient_data") facts.push(`trend ${d.trend}`);
      if (d.missed_twice)                  facts.push("missed 2+ days running");
      if (d.weak_weekday)                  facts.push(`reliably dies on ${d.weak_weekday}s`);
      lines.push(`  ${d.habit_name}: ${facts.join(", ")}.`);
      lines.push(`    LEVER: ${leverInstruction(d)}`);
    }
    lines.push("");
  }

  // ── Identity rules (Persona Shift — every completion is an identity vote) ─
  if (identity) {
    lines.push("## Identity Rules — who the user says they're becoming");
    lines.push("These are the user's own words. Each daily completion is a vote for that identity.");
    for (const r of identity.rules) {
      lines.push(`  "${r.name}": ${r.votes_last_7}/7 votes this week, ${r.votes_last_30} in the last 30 days`);
    }
    if (identity.alignment_pct !== null) {
      lines.push(
        `Identity alignment this week: ${identity.alignment_pct}% ` +
        `(${identity.votes_last_7} of ${identity.possible_last_7} possible votes cast)`
      );
    }
    lines.push("");
  }

  // ── Spending persona (deterministic archetype for this cycle) ─────────────
  if (persona) {
    lines.push(`## Spending Persona (computed from this cycle's data)`);
    lines.push(`${persona.name} — ${persona.evidence}`);
    lines.push("");
  }

  // ── Behavioral signals (derived) ──────────────────────────────────────────
  const sigLines: string[] = [];
  if (derived.spending_concentration > 0) {
    sigLines.push(`- Spending concentration: ${derived.spending_concentration}% (top 2 categories drive most spending)`);
  }
  if (derived.expense_volatility) {
    sigLines.push(`- Expense volatility: ${derived.expense_volatility.label} (CV ${derived.expense_volatility.cv})`);
  }
  if (derived.habit_recovery_rate) {
    sigLines.push(`- Habit recovery rate: ${derived.habit_recovery_rate.label} (${derived.habit_recovery_rate.rate})`);
  }
  if (sigLines.length > 0) {
    lines.push("## Behavioral Signals");
    lines.push(...sigLines);
    lines.push("");
  }

  // ── Computed financial health score ───────────────────────────────────────
  lines.push(`## Computed Financial Health Score: ${health.score}/10`);
  lines.push(
    `Components: savings ${health.components.savings}/10, ` +
    `budget ${health.components.budget}/10, ` +
    `habits ${health.components.habit}/10, ` +
    `volatility ${health.components.volatility}/10`
  );
  lines.push("");

  if (lines.length === 0) {
    lines.push("No tracking data available yet. User may be new to the app.");
  }

  return lines.join("\n");
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1. Authenticate ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { error: "Missing Authorization header" },
        { status: 401, headers: corsHeaders(origin) }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global:  { headers: { Authorization: `Bearer ${jwt}` } },
      auth:    { persistSession: false },
    });

    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders(origin) }
      );
    }

    const userId = user.id;

    // 1b. Cycle bounds (from request body — falls back to current calendar month)
    let bodyJson: unknown = null;
    try { bodyJson = await req.json(); } catch { /* no body / not JSON */ }
    const cycle = parseCycleBounds(bodyJson);

    const budgetMonth = cycle.cycleStart.slice(0, 8) + "01";

    // 2. Fetch all data in parallel ───────────────────────────────────────────
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const startMonth = cutoff.toISOString().slice(0, 7) + "-01";

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const [
      { data: expenses,            error: expErr   },
      { data: habits,              error: habErr   },
      { data: cycleExpenseRows,    error: cExpErr  },
      { data: prevExpenseRows,     error: pExpErr  },
      { data: cycleIncomeRows,     error: incErr   },
      { data: activeLoansRows,     error: loanErr  },
      { data: cycleBudgetRows,     error: budErr   },
      { data: profile,             error: profErr  },
      { data: storedMemories,      error: memErr   },
      { data: existingInsights,    error: insErr   },
      { data: habitCompletionRows, error: hcErr    },
      { data: personaRuleRows,     error: prErr    },
    ] = await Promise.all([
      userClient.from("ai_expense_summary").select("*").eq("user_id", userId).gte("month", startMonth),
      userClient.from("ai_habit_summary").select("*").eq("user_id", userId),
      userClient.from("expenses").select("amount, category, date")
        .eq("user_id", userId).gte("date", cycle.cycleStart).lte("date", cycle.cycleEnd),
      userClient.from("expenses").select("amount")
        .eq("user_id", userId).gte("date", cycle.prevCycleStart).lte("date", cycle.prevCycleEnd),
      userClient.from("incomes").select("amount")
        .eq("user_id", userId).gte("date", cycle.cycleStart).lte("date", cycle.cycleEnd),
      userClient.from("loans").select("amount").eq("user_id", userId).eq("is_paid", false),
      userClient.from("budgets").select("category, amount")
        .eq("user_id", userId).eq("month", budgetMonth),
      userClient.from("profiles").select("currency_preference").eq("id", userId).single(),
      serviceClient.from("ai_memories").select("memory_key, memory_value").eq("user_id", userId),
      serviceClient.from("ai_insights").select("id, insight_type, was_useful").eq("user_id", userId),
      userClient.from("habit_completions").select("habit_id, date")
        .eq("user_id", userId).gte("date", thirtyDaysAgoStr),
      userClient.from("habits").select("id, name, flag_level, start_date")
        .eq("user_id", userId).eq("category", "persona_shift").eq("is_active", true),
    ]);

    if (expErr)  console.error("ai_expense_summary:", expErr.message);
    if (habErr)  console.error("ai_habit_summary:",   habErr.message);
    if (cExpErr) console.error("expenses (cycle):",   cExpErr.message);
    if (pExpErr) console.error("expenses (prev):",    pExpErr.message);
    if (incErr)  console.error("incomes (cycle):",    incErr.message);
    if (loanErr) console.error("loans:",              loanErr.message);
    if (budErr)  console.error("budgets:",            budErr.message);
    if (profErr) console.error("profiles:",           profErr.message);
    if (memErr)  console.error("ai_memories:",        memErr.message);
    if (insErr)  console.error("ai_insights:",        insErr.message);
    if (hcErr)   console.error("habit_completions:",  hcErr.message);
    if (prErr)   console.error("persona rules:",      prErr.message);

    const currency = profile?.currency_preference ?? "INR";

    type ExpenseRow = { amount: number | string; category: string; date: string };
    const cycleExpenses    = (cycleExpenseRows    ?? []) as ExpenseRow[];
    const cycleIncomes     = (cycleIncomeRows     ?? []) as Array<{ amount: number | string }>;
    const prevExpenses     = (prevExpenseRows     ?? []) as Array<{ amount: number | string }>;
    const activeLoans      = (activeLoansRows     ?? []) as Array<{ amount: number | string }>;
    const cycleBudgets     = (cycleBudgetRows     ?? []) as Array<{ category: string; amount: number | string }>;
    const habitCompletions = (habitCompletionRows ?? []) as Array<{ habit_id: string; date: string }>;

    const sumAmt = <T extends { amount: number | string }>(rows: T[]) =>
      rows.reduce((s, r) => s + Number(r.amount), 0);

    const cycleExpenseTotal = sumAmt(cycleExpenses);
    const prevExpenseTotal  = sumAmt(prevExpenses);
    const cycleIncomeTotal  = sumAmt(cycleIncomes);
    const loansTotal        = sumAmt(activeLoans);

    const spentByCategory: Record<string, number> = {};
    for (const r of cycleExpenses) {
      spentByCategory[r.category] = (spentByCategory[r.category] ?? 0) + Number(r.amount);
    }
    let biggestCategory: string | null = null;
    let biggestCategoryAmt = 0;
    for (const [cat, amt] of Object.entries(spentByCategory)) {
      if (amt > biggestCategoryAmt) { biggestCategory = cat; biggestCategoryAmt = amt; }
    }

    const snapshot: FinancialSnapshotRow = {
      user_id:                          userId,
      total_income:                     cycleIncomeTotal,
      total_expenses:                   cycleExpenseTotal,
      net_savings:                      cycleIncomeTotal - cycleExpenseTotal,
      biggest_spending_category:        biggestCategory,
      month_over_month_expense_change:  prevExpenseTotal > 0
        ? Number((((cycleExpenseTotal - prevExpenseTotal) / prevExpenseTotal) * 100).toFixed(1))
        : null,
      active_loans_count:               activeLoans.length,
      active_loans_total:               loansTotal,
    };

    const budgets: BudgetPerformanceRow[] = cycleBudgets.map((b) => {
      const budgetAmt = Number(b.amount);
      const spent     = spentByCategory[b.category] ?? 0;
      const utilization = budgetAmt > 0
        ? Number(((spent / budgetAmt) * 100).toFixed(1))
        : 0;
      const status: BudgetPerformanceRow["status"] =
        spent > budgetAmt        ? "exceeded" :
        spent > budgetAmt * 0.8  ? "warning"  : "on_track";
      return {
        user_id:                userId,
        category:               b.category,
        budget_amount:          budgetAmt,
        spent_amount:           spent,
        remaining:              budgetAmt - spent,
        utilization_percentage: utilization,
        status,
      };
    });

    // Derived metrics + computed health score (deterministic)
    const monthlyExpenses = (expenses ?? []) as ExpenseSummaryRow[];
    const habitsTyped     = (habits   ?? []) as HabitSummaryRow[];
    const derived         = computeDerivedMetrics(cycleExpenses, monthlyExpenses, habitsTyped, habitCompletions);
    const health          = computeFinancialHealthScore(snapshot, budgets, habitsTyped, derived);

    // Atomic Habits engine: per-habit levers, identity votes, spending persona.
    // All deterministic — the AI only phrases what these computed.
    const personaRules    = (personaRuleRows ?? []) as PersonaRuleRow[];
    const diagnostics     = computeHabitDiagnostics(habitsTyped, habitCompletions);
    const identity        = computeIdentityAlignment(personaRules, habitCompletions);
    const spendingPersona = computeSpendingPersona(snapshot, budgets, derived, cycleExpenses, currency);

    // Memories map (Part B prompt context)
    const memoriesMap: Record<string, string> = {};
    for (const m of storedMemories ?? []) {
      memoriesMap[m.memory_key] = m.memory_value;
    }

    // Part C: collect unhelpful insight types (deduplicated)
    type ExistingInsightRow = { id: string; insight_type: string; was_useful: boolean | null };
    const typedInsights = (existingInsights ?? []) as ExistingInsightRow[];

    const unhelpfulTypes: string[] = [...new Set(
      typedInsights.filter(r => r.was_useful === false).map(r => r.insight_type)
    )];

    const idMap = new Map(typedInsights.map(r => [r.insight_type, r.id]));

    // 3. Build prompts ─────────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(unhelpfulTypes);
    const userPrompt   = buildUserPrompt(
      snapshot,
      monthlyExpenses,
      budgets,
      habitsTyped,
      currency,
      memoriesMap,
      cycle,
      derived,
      health,
      diagnostics,
      identity,
      spendingPersona,
    );

    // 4. Call OpenRouter ───────────────────────────────────────────────────────
    const completion = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      response_format: { type: "json_object" },
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";

    // 5. Parse AI response ─────────────────────────────────────────────────────
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("AI returned non-JSON:", rawContent);
      return Response.json(
        { error: "AI returned malformed response" },
        { status: 502, headers: corsHeaders(origin) }
      );
    }

    // Overwrite financial_health.score with deterministic value (AI's score is discarded)
    if (parsed.financial_health && typeof parsed.financial_health === "object") {
      (parsed.financial_health as Record<string, unknown>).score = health.score;
    } else {
      parsed.financial_health = { score: health.score, verdict: "" };
    }

    // 6. Upsert ai_insights ────────────────────────────────────────────────────
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const INSIGHT_TYPES = ["spending_summary", "habit_coaching", "anomaly", "financial_health", "top_action"] as const;

    const insightRows = INSIGHT_TYPES
      .filter((t) => parsed[t] !== undefined)
      .map((t) => ({
        id:           idMap.get(t) ?? crypto.randomUUID(),
        user_id:      userId,
        insight_type: t,
        content:      typeof parsed[t] === "string"
                        ? (parsed[t] as string)
                        : JSON.stringify(parsed[t]),
        generated_at: now,
        expires_at:   expiresAt,
      }));

    const { data: saved, error: saveErr } = await serviceClient
      .from("ai_insights")
      .upsert(insightRows, { onConflict: "id" })
      .select();

    if (saveErr) {
      console.error("ai_insights upsert:", saveErr.message);
      return Response.json(
        { error: "Failed to persist insights" },
        { status: 500, headers: corsHeaders(origin) }
      );
    }

    // 7. Part A: extract and upsert ai_memories ───────────────────────────────
    const memoryRows = extractMemories(
      snapshot,
      budgets,
      habitsTyped,
      derived,
      userId,
      currency,
      cycle.cycleType,
      spendingPersona,
      identity,
    );

    if (memoryRows.length > 0) {
      const { error: memSaveErr } = await serviceClient
        .from("ai_memories")
        .upsert(memoryRows, { onConflict: "user_id,memory_key" });
      if (memSaveErr) {
        console.error("ai_memories upsert:", memSaveErr.message);
      }
    }

    // 8. Return ────────────────────────────────────────────────────────────────
    return Response.json(
      { insights: saved },
      { headers: corsHeaders(origin) }
    );

  } catch (err) {
    console.error("generate-insights unhandled error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});
