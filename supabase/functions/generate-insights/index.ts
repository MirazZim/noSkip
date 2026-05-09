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
- "spending_summary": 4-6 sentences in coach voice — what shifted, what it means, why it matters
- "habit_coaching": 4-6 sentences in coach voice — what's working, what's slipping, what to do
- "anomaly": 1-2 sentences flagging anything unusual ("Nothing weird this period." if clean)
- "financial_health": object with "verdict" only — 1-2 sentences in plain language. Score is computed externally.
- "top_action": one specific thing to do this week, with a number
  (e.g. "Cap food spending at BDT 7,500 next week — that's 20% below your current pace")

Respond with valid JSON only. No markdown code fences. No text outside the JSON object.`;

  if (unhelpfulTypes.length > 0) {
    base += `\n\nThe user previously found these insight types unhelpful: ${unhelpfulTypes.join(", ")}.
Avoid repeating that style of analysis. Be more specific and actionable.`;
  }

  return base;
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
                     savingsMemKey, "most_exceeded_budget_category", "expense_volatility"];
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
