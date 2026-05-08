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

// ─── Memory extraction (Part A) ───────────────────────────────────────────────

function extractMemories(
  snap:     FinancialSnapshotRow | null,
  expenses: ExpenseSummaryRow[],
  budgets:  BudgetPerformanceRow[],
  habits:   HabitSummaryRow[],
  userId:   string,
  currency: string,
): Array<{ user_id: string; memory_key: string; memory_value: string; confidence: number; last_updated: string }> {
  const now = new Date().toISOString();
  const out: Array<{ user_id: string; memory_key: string; memory_value: string; confidence: number; last_updated: string }> = [];

  const push = (key: string, value: string) =>
    out.push({ user_id: userId, memory_key: key, memory_value: value, confidence: 1.0, last_updated: now });

  // biggest_spending_category
  if (snap?.biggest_spending_category) {
    push("biggest_spending_category", snap.biggest_spending_category);
  }

  // weakest_habit / strongest_habit
  if (habits.length > 0) {
    const sorted    = [...habits].sort((a, b) => Number(a.consistency_score) - Number(b.consistency_score));
    const weakest   = sorted[0];
    const strongest = sorted[sorted.length - 1];
    push("weakest_habit",   `${weakest.habit_name} (${weakest.consistency_score}% consistency)`);
    push("strongest_habit", `${strongest.habit_name} (${strongest.consistency_score}% consistency)`);
  }

  // current_month_savings — net savings for the current month only
  if (snap) {
    push("current_month_savings", `${currency} ${Number(snap.net_savings).toFixed(0)}`);
  }

  // most_exceeded_budget_category — prefer exceeded, fall back to highest utilization
  if (budgets.length > 0) {
    const exceeded = budgets.filter(b => b.status === "exceeded");
    const pool     = exceeded.length > 0 ? exceeded : budgets;
    const worst    = pool.reduce((a, b) =>
      Number(b.utilization_percentage) > Number(a.utilization_percentage) ? b : a
    );
    push("most_exceeded_budget_category", worst.category);
  }

  // income_stability — coefficient of variation of monthly expense totals
  // CV < 0.2 → stable, otherwise variable
  if (expenses.length > 0) {
    const byMonth: Record<string, number> = {};
    for (const r of expenses) {
      byMonth[r.month] = (byMonth[r.month] ?? 0) + Number(r.total_amount);
    }
    const totals = Object.values(byMonth);
    if (totals.length >= 2) {
      const mean = totals.reduce((s, v) => s + v, 0) / totals.length;
      if (mean > 0) {
        const stddev = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / totals.length);
        push("income_stability", stddev / mean < 0.2 ? "stable" : "variable");
      }
    }
  }

  return out;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildSystemPrompt(unhelpfulTypes: string[]): string {
  let base = `You are a personal finance and habit coach analyzing real data from a personal tracking app.
Be specific — reference actual numbers from the data. Be direct — no generic advice, no filler.

Return a JSON object with exactly these 4 keys:
- "spending_summary": string — 2-3 sentences on spending patterns, category trends, and notable observations
- "habit_coaching": string — 2-3 sentences on habit consistency, streak quality, and behavioral patterns
- "anomaly": string — 1 sentence flagging anything unusual or worth the user's attention ("No anomalies detected." if nothing stands out)
- "financial_health": object with "score" (integer 1-10, where 10 is excellent) and "verdict" (1 sentence overall assessment)

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
): string {
  const lines: string[] = [];

  // ── What I know about you (Part B) ───────────────────────────────────────
  const knownKeys = ["biggest_spending_category", "weakest_habit", "strongest_habit",
                     "current_month_savings", "most_exceeded_budget_category", "income_stability"];
  if (knownKeys.some(k => memoriesMap[k])) {
    lines.push("## What I know about you");
    if (memoriesMap.biggest_spending_category)
      lines.push(`- Biggest spending category: ${memoriesMap.biggest_spending_category}`);
    if (memoriesMap.weakest_habit)
      lines.push(`- Weakest habit: ${memoriesMap.weakest_habit}`);
    if (memoriesMap.strongest_habit)
      lines.push(`- Strongest habit: ${memoriesMap.strongest_habit}`);
    if (memoriesMap.current_month_savings)
      lines.push(`- Savings this month: ${memoriesMap.current_month_savings}`);
    if (memoriesMap.most_exceeded_budget_category)
      lines.push(`- Most exceeded budget category: ${memoriesMap.most_exceeded_budget_category}`);
    if (memoriesMap.income_stability)
      lines.push(`- Income: ${memoriesMap.income_stability}`);
    lines.push("");
  }

  // ── Financial snapshot ────────────────────────────────────────────────────
  if (snap) {
    lines.push("## Current Month Financial Snapshot");
    lines.push(`Income:   ${currency} ${snap.total_income}`);
    lines.push(`Expenses: ${currency} ${snap.total_expenses}`);
    lines.push(`Net savings: ${currency} ${snap.net_savings}`);
    if (snap.biggest_spending_category) {
      lines.push(`Biggest spending category: ${snap.biggest_spending_category}`);
    }
    if (snap.month_over_month_expense_change !== null) {
      const dir = snap.month_over_month_expense_change >= 0 ? "up" : "down";
      lines.push(`Expenses vs last month: ${dir} ${Math.abs(snap.month_over_month_expense_change)}%`);
    } else {
      lines.push("Expenses vs last month: no prior data available");
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
    lines.push("## Budget Performance (Current Month)");
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

    // 2. Fetch all data in parallel ───────────────────────────────────────────
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 3);
    const startMonth = cutoff.toISOString().slice(0, 7) + "-01";

    const [
      { data: expenses,         error: expErr  },
      { data: habits,           error: habErr  },
      { data: snapshot,         error: snapErr },
      { data: budgets,          error: budErr  },
      { data: profile,          error: profErr },
      { data: storedMemories,   error: memErr  },
      { data: existingInsights, error: insErr  },
    ] = await Promise.all([
      userClient.from("ai_expense_summary").select("*").eq("user_id", userId).gte("month", startMonth),
      userClient.from("ai_habit_summary").select("*").eq("user_id", userId),
      userClient.from("ai_financial_snapshot").select("*").eq("user_id", userId).maybeSingle(),
      userClient.from("ai_budget_performance").select("*").eq("user_id", userId),
      userClient.from("profiles").select("currency_preference").eq("id", userId).single(),
      // Part B: existing memories for prompt context
      serviceClient.from("ai_memories").select("memory_key, memory_value").eq("user_id", userId),
      // Part C + idMap: single read covers both was_useful filtering and ID reuse
      serviceClient.from("ai_insights").select("id, insight_type, was_useful").eq("user_id", userId),
    ]);

    if (expErr)  console.error("ai_expense_summary:",    expErr.message);
    if (habErr)  console.error("ai_habit_summary:",      habErr.message);
    if (snapErr) console.error("ai_financial_snapshot:", snapErr.message);
    if (budErr)  console.error("ai_budget_performance:", budErr.message);
    if (profErr) console.error("profiles:",              profErr.message);
    if (memErr)  console.error("ai_memories:",           memErr.message);
    if (insErr)  console.error("ai_insights:",           insErr.message);

    const currency = profile?.currency_preference ?? "INR";

    // Part B: build memories map
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

    // idMap: reuse existing row IDs so was_useful ratings survive upsert
    const idMap = new Map(typedInsights.map(r => [r.insight_type, r.id]));

    // 3. Build prompts ─────────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(unhelpfulTypes);
    const userPrompt   = buildUserPrompt(
      snapshot  as FinancialSnapshotRow | null,
      (expenses ?? []) as ExpenseSummaryRow[],
      (budgets  ?? []) as BudgetPerformanceRow[],
      (habits   ?? []) as HabitSummaryRow[],
      currency,
      memoriesMap,
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

    // 6. Upsert ai_insights ────────────────────────────────────────────────────
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const INSIGHT_TYPES = ["spending_summary", "habit_coaching", "anomaly", "financial_health"] as const;

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
      snapshot  as FinancialSnapshotRow | null,
      (expenses ?? []) as ExpenseSummaryRow[],
      (budgets  ?? []) as BudgetPerformanceRow[],
      (habits   ?? []) as HabitSummaryRow[],
      userId,
      currency,
    );

    if (memoryRows.length > 0) {
      const { error: memSaveErr } = await serviceClient
        .from("ai_memories")
        .upsert(memoryRows, { onConflict: "user_id,memory_key" });
      if (memSaveErr) {
        // Non-fatal — insights already saved, memories are a best-effort enhancement
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
