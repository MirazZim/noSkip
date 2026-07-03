import { useState } from "react";
import {
  Sparkles, Loader2, AlertTriangle, RefreshCw, X,
  TrendingUp, Target, Heart, Zap, ThumbsUp, ThumbsDown, Fingerprint,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { loadCycleConfig } from "@/components/expenses/BudgetManager";
import { getCycleRangeForDate } from "@/hooks/useSavings";
import {
  useAIInsights, type AiInsight, type InsightType,
} from "@/hooks/useAIInsights";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface Props {
  open:         boolean;
  onOpenChange: (o: boolean) => void;
}

interface Memory { memory_key: string; memory_value: string }
interface Snapshot {
  total_income:               number | null;
  total_expenses:             number | null;
  net_savings:                number | null;
  biggest_spending_category:  string | null;
  active_loans_count:         number | null;
  active_loans_total:         number | null;
}

// Fixed accents for card identity (readable on every theme's glass surface);
// health + action always follow the active theme's primary.
const A = {
  blue:    "#38BDF8",
  emerald: "#10b981",
  gold:    "#f59e0b",
} as const;

const INSIGHT_META: Record<InsightType, { label: string; Icon: LucideIcon; accent: string }> = {
  spending_summary: { label: "Spending",  Icon: TrendingUp,    accent: A.blue    },
  habit_coaching:   { label: "Habits",    Icon: Target,        accent: A.emerald },
  anomaly:          { label: "Anomaly",   Icon: AlertTriangle, accent: A.gold    },
  financial_health: { label: "Health",    Icon: Heart,         accent: "hsl(var(--primary))" },
  top_action:       { label: "Top Action", Icon: Zap,          accent: "hsl(var(--primary))" },
};

const ORDERED_TYPES: InsightType[] = [
  "spending_summary",
  "habit_coaching",
  "anomaly",
  "financial_health",
];

function parseInsightContent(insight: AiInsight): { text: string; score?: number } {
  if (insight.insight_type !== "financial_health") return { text: insight.content };
  try {
    const obj = JSON.parse(insight.content) as { score?: number; verdict?: string };
    return {
      text:  obj.verdict ?? insight.content,
      score: typeof obj.score === "number" ? obj.score : undefined,
    };
  } catch {
    return { text: insight.content };
  }
}

// Status tone for the health score — color carries meaning here (good / mid / poor),
// and the number is always shown alongside it.
function scoreTone(score: number): string {
  if (score >= 7) return "hsl(var(--success))";
  if (score >= 4) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

// ─── Shared rating row ────────────────────────────────────────────────────────
function RatingRow({
  rated, busy, onRate,
}: {
  rated: boolean | null;
  busy:  boolean;
  onRate: (useful: boolean) => void;
}) {
  return (
    <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/30 pt-2.5">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
        {rated === null ? "Was this helpful?" : rated ? "Marked helpful" : "Marked not helpful"}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onRate(true)}
          disabled={rated !== null || busy}
          title="Helpful"
          className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 disabled:cursor-default"
          style={{
            borderColor: rated === true ? "hsl(var(--success) / 0.35)" : "hsl(var(--border) / 0.4)",
            background:  rated === true ? "hsl(var(--success) / 0.14)" : "hsl(var(--card) / 0.4)",
            color:       rated === true ? "hsl(var(--success))"        : "hsl(var(--muted-foreground))",
            opacity:     rated === false ? 0.3 : 1,
          }}
        >
          <ThumbsUp size={11} />
          {rated === true && <span>Helpful</span>}
        </button>
        <button
          onClick={() => onRate(false)}
          disabled={rated !== null || busy}
          title="Not helpful"
          className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 disabled:cursor-default"
          style={{
            borderColor: rated === false ? "hsl(var(--destructive) / 0.35)" : "hsl(var(--border) / 0.4)",
            background:  rated === false ? "hsl(var(--destructive) / 0.14)" : "hsl(var(--card) / 0.4)",
            color:       rated === false ? "hsl(var(--destructive))"        : "hsl(var(--muted-foreground))",
            opacity:     rated === true ? 0.3 : 1,
          }}
        >
          <ThumbsDown size={11} />
          {rated === false && <span>Not helpful</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Single insight card ──────────────────────────────────────────────────────
function InsightCard({
  insight, onRate, animDelay,
}: {
  insight:   AiInsight;
  onRate:    (id: string, useful: boolean) => Promise<void>;
  animDelay: number;
}) {
  const meta = INSIGHT_META[insight.insight_type];
  const { text, score } = parseInsightContent(insight);
  const isPrimaryAccent = meta.accent.startsWith("hsl(var");

  const [rated, setRated] = useState<boolean | null>(insight.was_useful ?? null);
  const [busy,  setBusy]  = useState(false);

  const handleRate = async (useful: boolean) => {
    if (rated !== null || busy) return;
    setBusy(true);
    setRated(useful);
    try { await onRate(insight.id, useful); }
    catch { setRated(null); }
    finally { setBusy(false); }
  };

  const tone = score !== undefined ? scoreTone(score) : undefined;

  return (
    <div
      className="ai-glass flex flex-col gap-2.5 rounded-3xl p-4 transition-transform duration-300 sm:p-[18px]"
      style={{ animation: "aiSlideIn 0.4s ease both", animationDelay: `${animDelay}ms` }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: isPrimaryAccent ? "hsl(var(--primary) / 0.12)" : `${meta.accent}1c`,
            boxShadow:  `inset 0 1px 0 hsl(0 0% 100% / 0.15), 0 0 14px ${isPrimaryAccent ? "hsl(var(--primary) / 0.15)" : `${meta.accent}22`}`,
          }}
        >
          <meta.Icon size={13} color={meta.accent} />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {meta.label}
        </span>
        {score !== undefined && tone && (
          <span
            className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold tabular-nums"
            style={{
              color:      tone,
              background: `color-mix(in srgb, ${tone} 14%, transparent)`,
              boxShadow:  "inset 0 1px 0 hsl(0 0% 100% / 0.12)",
            }}
          >
            {score}/10
          </span>
        )}
      </div>

      <p className="flex-1 text-[13px] leading-[1.7] text-foreground/90">
        {text}
      </p>

      {score !== undefined && tone && (
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)` }}
          aria-hidden
        >
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${score * 10}%`, background: tone }}
          />
        </div>
      )}

      <RatingRow rated={rated} busy={busy} onRate={handleRate} />
    </div>
  );
}

// ─── Featured top_action card ─────────────────────────────────────────────────
function FeaturedActionCard({
  insight, onRate,
}: {
  insight: AiInsight;
  onRate:  (id: string, useful: boolean) => Promise<void>;
}) {
  const [rated, setRated] = useState<boolean | null>(insight.was_useful ?? null);
  const [busy,  setBusy]  = useState(false);

  const handleRate = async (useful: boolean) => {
    if (rated !== null || busy) return;
    setBusy(true);
    setRated(useful);
    try { await onRate(insight.id, useful); }
    catch { setRated(null); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="ai-glass relative mb-3 flex flex-col gap-3 overflow-hidden rounded-3xl p-4 sm:p-5"
      style={{
        animation: "aiSlideIn 0.4s ease both",
        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.16), inset 0 0 0 1px hsl(var(--primary) / 0.18), 0 16px 48px -20px hsl(var(--primary) / 0.45)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-14 -top-20 h-48 w-48 rounded-full blur-3xl"
        style={{ background: "hsl(var(--primary) / 0.22)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-10 h-44 w-44 rounded-full blur-3xl"
        style={{ background: "hsl(var(--accent) / 0.14)" }}
      />

      <div className="relative flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_0_18px_hsl(var(--primary)/0.3)]">
          <Zap size={15} className="text-primary" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
          Top Action
        </span>
        <span className="ml-auto rounded-full bg-primary px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.12em] text-primary-foreground shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.6)]">
          This Week
        </span>
      </div>

      <p className="relative font-display text-[15px] font-semibold leading-normal tracking-tight text-foreground">
        {insight.content}
      </p>

      <RatingRow rated={rated} busy={busy} onRate={handleRate} />
    </div>
  );
}

// ─── Stat chip (inside the glass context panel — wraps, never truncates) ──────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-foreground/[0.04] px-3 py-2.5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.08)]">
      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="break-words text-[12.5px] font-semibold leading-snug tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

// ─── Spending persona banner ──────────────────────────────────────────────────
function PersonaBanner({ memory }: { memory: string }) {
  const sep = memory.indexOf(" — ");
  const name     = sep > -1 ? memory.slice(0, sep)  : memory;
  const evidence = sep > -1 ? memory.slice(sep + 3) : "";

  return (
    <div className="mb-2 flex items-start gap-3 rounded-2xl bg-primary/[0.07] px-3.5 py-3 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.1),inset_0_0_0_1px_hsl(var(--primary)/0.15)]">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.15)]">
        <Fingerprint size={14} className="text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Spending Persona
        </p>
        <p className="text-[13px] leading-snug">
          <span className="font-display font-bold text-foreground">{name}</span>
          {evidence && <span className="text-muted-foreground"> — {evidence}</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function AIAnalystDialog({ open, onOpenChange }: Props) {
  const { user }                                                            = useAuth();
  const { formatAmount }                                                    = useCurrency();
  const { insights, isLoading, isGenerating, error, refresh, rateInsight }  = useAIInsights();

  // Same cycle source of truth the Edge Function gets (BudgetManager + useSavings)
  const cycleConfig  = loadCycleConfig();
  const currentCycle = getCycleRangeForDate(cycleConfig, new Date());
  const cycleStart   = format(currentCycle.start, "yyyy-MM-dd");
  const cycleEnd     = format(currentCycle.end,   "yyyy-MM-dd");

  const cycleLabel = cycleConfig.type === "payday"
    ? `${format(currentCycle.start, "MMM d")} → ${format(currentCycle.end, "MMM d")} · payday ${ordinal(cycleConfig.payday)}`
    : format(currentCycle.start, "MMMM");

  const { data: memories } = useQuery({
    queryKey: ["ai_memories", user?.id],
    enabled:  !!user && open,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("ai_memories")
        .select("memory_key, memory_value");
      if (error) throw error;
      return (data ?? []) as Memory[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Cycle-bound snapshot — mirrors the Edge Function's logic so the preview
  // matches what the AI will analyze (the calendar-month view can't do this).
  const { data: snapshot } = useQuery({
    queryKey: ["ai_cycle_snapshot", user?.id, cycleStart, cycleEnd],
    enabled:  !!user && open,
    queryFn:  async (): Promise<Snapshot> => {
      const [
        { data: expRows,  error: expErr  },
        { data: incRows,  error: incErr  },
        { data: loanRows, error: loanErr },
      ] = await Promise.all([
        supabase.from("expenses").select("amount, category")
          .eq("user_id", user!.id)
          .gte("date", cycleStart).lte("date", cycleEnd),
        supabase.from("incomes").select("amount")
          .eq("user_id", user!.id)
          .gte("date", cycleStart).lte("date", cycleEnd),
        supabase.from("loans").select("amount")
          .eq("user_id", user!.id)
          .eq("is_paid", false),
      ]);
      if (expErr)  throw expErr;
      if (incErr)  throw incErr;
      if (loanErr) throw loanErr;

      const expenses = (expRows  ?? []) as Array<{ amount: number | string; category: string }>;
      const incomes  = (incRows  ?? []) as Array<{ amount: number | string }>;
      const loans    = (loanRows ?? []) as Array<{ amount: number | string }>;

      const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount), 0);
      const totalIncome   = incomes.reduce((s, r)  => s + Number(r.amount), 0);
      const loansTotal    = loans.reduce((s, r)    => s + Number(r.amount), 0);

      const byCat: Record<string, number> = {};
      for (const r of expenses) {
        byCat[r.category] = (byCat[r.category] ?? 0) + Number(r.amount);
      }
      let biggest: string | null = null;
      let biggestAmt = 0;
      for (const [cat, amt] of Object.entries(byCat)) {
        if (amt > biggestAmt) { biggest = cat; biggestAmt = amt; }
      }

      return {
        total_income:              totalIncome,
        total_expenses:            totalExpenses,
        net_savings:               totalIncome - totalExpenses,
        biggest_spending_category: biggest,
        active_loans_count:        loans.length,
        active_loans_total:        loansTotal,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const memMap: Record<string, string> = {};
  for (const m of memories ?? []) memMap[m.memory_key] = m.memory_value;

  const hasContext =
    (memories && memories.length > 0) ||
    (snapshot && (snapshot.total_income || snapshot.total_expenses));

  const insightMap  = new Map((insights ?? []).map((i) => [i.insight_type, i]));
  const hasInsights = (insights?.length ?? 0) > 0;

  const lastGeneratedAt = (insights ?? [])
    .map((i) => i.generated_at ? new Date(i.generated_at) : null)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const buttonText = isGenerating
    ? "Analyzing your spending and habits…"
    : error
      ? "Try again"
      : hasInsights
        ? "Regenerate Analysis"
        : "Generate Analysis";

  const ButtonIcon = isGenerating ? Loader2 : error ? RefreshCw : Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[calc(100vw-20px)] gap-0 overflow-hidden rounded-3xl border-border/30 bg-background/80 p-0 backdrop-blur-2xl sm:max-w-4xl">
        <style>{`
          @keyframes aiSlideIn {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0);    }
          }
          @keyframes aiDrift {
            0%   { transform: translate3d(0, 0, 0) scale(1); }
            50%  { transform: translate3d(24px, -18px, 0) scale(1.12); }
            100% { transform: translate3d(-16px, 14px, 0) scale(0.95); }
          }
          .ai-glass {
            background: linear-gradient(150deg, hsl(var(--card) / 0.62), hsl(var(--card) / 0.34));
            border: 1px solid hsl(var(--border) / 0.55);
            box-shadow:
              inset 0 1px 0 hsl(0 0% 100% / 0.1),
              0 12px 40px -18px hsl(220 60% 3% / 0.35);
            backdrop-filter: blur(18px) saturate(1.35);
            -webkit-backdrop-filter: blur(18px) saturate(1.35);
          }
          @media (prefers-reduced-motion: reduce) {
            .ai-drift { animation: none !important; }
          }
        `}</style>

        <div className="relative flex max-h-[94dvh] flex-col">

          {/* ── Liquid backdrop: drifting color blobs the glass panels sit on ── */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="ai-drift absolute -top-24 right-[-10%] h-72 w-72 rounded-full blur-3xl"
              style={{ background: "hsl(var(--primary) / 0.2)", animation: "aiDrift 14s ease-in-out infinite alternate" }}
            />
            <div
              className="ai-drift absolute top-1/3 left-[-12%] h-64 w-64 rounded-full blur-3xl"
              style={{ background: "hsl(var(--accent) / 0.13)", animation: "aiDrift 18s ease-in-out infinite alternate-reverse" }}
            />
            <div
              className="ai-drift absolute bottom-[-15%] right-[15%] h-60 w-60 rounded-full blur-3xl"
              style={{ background: "hsl(var(--primary) / 0.12)", animation: "aiDrift 16s ease-in-out infinite alternate" }}
            />
          </div>

          {/* ── Header ── */}
          <div className="shrink-0 border-b border-border/30 px-4 pb-4 pt-5 sm:px-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2),0_0_24px_hsl(var(--primary)/0.28)]">
                  <Sparkles size={17} className="text-primary" />
                </span>
                <span className="flex min-w-0 flex-col text-left">
                  <span className="font-display text-[16px] font-bold tracking-tight">
                    AI Finance Analyst
                  </span>
                  <span className="text-[11px] font-normal leading-relaxed text-muted-foreground">
                    A fresh read on your money, your habits, and who you're becoming.
                  </span>
                </span>
              </DialogTitle>
            </DialogHeader>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">

            {/* What I Know */}
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                What I Know About You
              </p>
              <span className="whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold tabular-nums text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.1)]">
                {cycleLabel}
              </span>
            </div>

            {hasContext ? (
              <div className="ai-glass mb-4 rounded-3xl p-3 sm:p-3.5">
                {memMap.spending_persona && <PersonaBanner memory={memMap.spending_persona} />}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {snapshot?.total_income != null && (
                    <Stat label="Income" value={formatAmount(Number(snapshot.total_income))} />
                  )}
                  {snapshot?.total_expenses != null && (
                    <Stat label="Expenses" value={formatAmount(Number(snapshot.total_expenses))} />
                  )}
                  {snapshot?.net_savings != null && (
                    <Stat label="Net Savings" value={formatAmount(Number(snapshot.net_savings))} />
                  )}
                  {snapshot?.biggest_spending_category && (
                    <Stat label="Top Category" value={snapshot.biggest_spending_category} />
                  )}
                  {memMap.strongest_habit && (
                    <Stat label="Strongest Habit" value={memMap.strongest_habit} />
                  )}
                  {memMap.weakest_habit && (
                    <Stat label="Weakest Habit" value={memMap.weakest_habit} />
                  )}
                  {memMap.identity_alignment && (
                    <Stat label="Identity Votes" value={memMap.identity_alignment} />
                  )}
                  {snapshot?.active_loans_count != null && snapshot.active_loans_count > 0 && (
                    <Stat
                      label="Active Loans"
                      value={`${snapshot.active_loans_count} · ${formatAmount(Number(snapshot.active_loans_total ?? 0))}`}
                    />
                  )}
                  {memMap.expense_volatility && (
                    <Stat label="Volatility" value={memMap.expense_volatility} />
                  )}
                </div>
              </div>
            ) : (
              <p className="mb-4 text-[12px] leading-relaxed text-muted-foreground">
                First time here — generate your first analysis below.
              </p>
            )}

            {/* Generation control */}
            {error && !isGenerating && (
              <div className="mb-2.5 flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-3.5 py-3 shadow-[inset_0_0_0_1px_hsl(var(--destructive)/0.25)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-destructive" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">{error}</p>
              </div>
            )}

            <button
              onClick={() => refresh()}
              disabled={isGenerating}
              className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-primary px-4 py-3.5 text-[13px] font-bold text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25),0_10px_32px_-10px_hsl(var(--primary)/0.6)] transition-all duration-200 hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
              />
              <ButtonIcon
                size={14}
                className={isGenerating ? "animate-spin" : undefined}
              />
              {buttonText}
            </button>

            {/* Skeleton while generating the very first analysis */}
            {isGenerating && !hasInsights && (
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="ai-glass h-28 animate-pulse rounded-3xl"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}

            {/* Insights display */}
            {hasInsights && !isLoading && (
              <div className="mt-4" style={{ opacity: isGenerating ? 0.55 : 1, transition: "opacity 0.3s" }}>
                {insightMap.get("top_action") && (
                  <FeaturedActionCard
                    insight={insightMap.get("top_action")!}
                    onRate={rateInsight}
                  />
                )}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
                  {ORDERED_TYPES.map((type, i) => {
                    const insight = insightMap.get(type);
                    if (!insight) return null;
                    return (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        onRate={rateInsight}
                        animDelay={i * 60}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex shrink-0 items-center justify-between border-t border-border/30 px-4 py-3 sm:px-6">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {lastGeneratedAt ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
                  Last generated {formatDistanceToNow(lastGeneratedAt, { addSuffix: true })}
                </>
              ) : (
                "No analysis yet"
              )}
            </span>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              <X size={12} />
              Close
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
