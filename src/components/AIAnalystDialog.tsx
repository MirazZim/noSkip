import { useState } from "react";
import {
  Sparkles, Loader2, AlertTriangle, RefreshCw, X,
  TrendingUp, Target, Heart, Zap, ThumbsUp, ThumbsDown,
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

const A = {
  blue:    "#38BDF8",
  emerald: "#10b981",
  gold:    "#f59e0b",
  red:     "#FF3B5C",
} as const;

const INSIGHT_META: Record<InsightType, { label: string; Icon: LucideIcon; accent: string }> = {
  spending_summary: { label: "Spending Summary",  Icon: TrendingUp,    accent: A.blue    },
  habit_coaching:   { label: "Habit Coaching",    Icon: Target,        accent: A.emerald },
  anomaly:          { label: "Anomaly",           Icon: AlertTriangle, accent: A.gold    },
  financial_health: { label: "Financial Health",  Icon: Heart,         accent: "hsl(var(--primary))" },
  top_action:       { label: "Top Action",        Icon: Zap,           accent: "hsl(var(--primary))" },
};

const ORDERED_TYPES: InsightType[] = [
  "spending_summary",
  "habit_coaching",
  "anomaly",
  "financial_health",
];

const card: React.CSSProperties = {
  background:   "hsl(var(--card))",
  border:       "1px solid hsl(var(--border))",
  borderRadius: 16,
};

const labelSt: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "hsl(var(--muted-foreground))",
};

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

// ─── Shared rating row ────────────────────────────────────────────────────────
function RatingRow({
  rated, busy, onRate,
}: {
  rated: boolean | null;
  busy:  boolean;
  onRate: (useful: boolean) => void;
}) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      borderTop:      "1px solid hsl(var(--border) / 0.5)",
      paddingTop:     8,
    }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", color: "hsl(var(--muted-foreground))" }}>
        {rated === null ? "Was this helpful?" : rated ? "Marked helpful" : "Marked not helpful"}
      </span>
      <div style={{ display: "flex", gap: 5 }}>
        <button
          onClick={() => onRate(true)}
          disabled={rated !== null || busy}
          title="Helpful"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 9px", borderRadius: 7,
            border:     `1px solid ${rated === true ? `${A.emerald}45` : "hsl(var(--border))"}`,
            background: rated === true ? `${A.emerald}14` : "transparent",
            color:      rated === true ? A.emerald : "hsl(var(--muted-foreground))",
            opacity:    rated === false ? 0.3 : 1,
            fontSize: 11, fontWeight: 600,
            cursor: rated !== null ? "default" : "pointer",
            transition: "all 0.18s",
          }}
        >
          <ThumbsUp size={11} />
          {rated === true && <span>Helpful</span>}
        </button>
        <button
          onClick={() => onRate(false)}
          disabled={rated !== null || busy}
          title="Not helpful"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 9px", borderRadius: 7,
            border:     `1px solid ${rated === false ? `${A.red}45` : "hsl(var(--border))"}`,
            background: rated === false ? `${A.red}14` : "transparent",
            color:      rated === false ? A.red : "hsl(var(--muted-foreground))",
            opacity:    rated === true ? 0.3 : 1,
            fontSize: 11, fontWeight: 600,
            cursor: rated !== null ? "default" : "pointer",
            transition: "all 0.18s",
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

  return (
    <div style={{
      ...card,
      padding:        "clamp(12px,2vw,16px)",
      display:        "flex",
      flexDirection:  "column",
      gap:            10,
      animation:      "aiSlideIn 0.38s ease both",
      animationDelay: `${animDelay}ms`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: isPrimaryAccent ? "hsl(var(--primary) / 0.1)" : `${meta.accent}18`,
          border:     `1px solid ${isPrimaryAccent ? "hsl(var(--primary) / 0.25)" : `${meta.accent}30`}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <meta.Icon size={13} color={meta.accent} />
        </div>
        <span style={labelSt}>{meta.label}</span>
        {score !== undefined && (
          <span style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 700,
            fontFamily: "'DM Mono', monospace",
            color: "hsl(var(--primary))",
            background: "hsl(var(--primary) / 0.1)",
            border: "1px solid hsl(var(--primary) / 0.2)",
            padding: "2px 9px", borderRadius: 8,
          }}>
            {score}/10
          </span>
        )}
      </div>

      <p style={{
        fontSize: "clamp(11px,1.6vw,13px)",
        lineHeight: 1.65,
        color: "hsl(var(--foreground))",
        flex: 1,
      }}>
        {text}
      </p>

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
    <div style={{
      ...card,
      padding:       "clamp(14px,2.4vw,20px)",
      marginBottom:  10,
      display:       "flex",
      flexDirection: "column",
      gap:           12,
      background:    "linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--card)) 60%)",
      border:        "1px solid hsl(var(--primary) / 0.35)",
      boxShadow:     "0 0 24px hsl(var(--primary) / 0.12)",
      animation:     "aiSlideIn 0.38s ease both",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
          background: "hsl(var(--primary) / 0.15)",
          border:     "1px solid hsl(var(--primary) / 0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap size={15} color="hsl(var(--primary))" />
        </div>
        <span style={{ ...labelSt, color: "hsl(var(--primary))" }}>Top Action</span>
        <span style={{
          marginLeft:    "auto",
          fontSize:      9,
          fontWeight:    800,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color:         "hsl(var(--primary-foreground))",
          background:    "hsl(var(--primary))",
          padding:       "3px 9px",
          borderRadius:  7,
        }}>
          This Week
        </span>
      </div>

      <p style={{
        fontSize:      "clamp(13px,2vw,15px)",
        lineHeight:    1.55,
        fontWeight:    600,
        color:         "hsl(var(--foreground))",
        letterSpacing: "-0.01em",
      }}>
        {insight.content}
      </p>

      <RatingRow rated={rated} busy={busy} onRate={handleRate} />
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...card, borderRadius: 10, padding: "8px 10px", minWidth: 0 }}>
      <p style={{ ...labelSt, fontSize: 8, marginBottom: 2 }}>{label}</p>
      <p
        title={value}
        style={{
          fontSize: 12, fontWeight: 700,
          color: "hsl(var(--foreground))",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {value}
      </p>
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
    ? `Pay cycle: ${format(currentCycle.start, "MMM d")} → ${format(currentCycle.end, "MMM d")} (payday on the ${ordinal(cycleConfig.payday)})`
    : `Current month: ${format(currentCycle.start, "MMMM")}`;

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

      // CORRECT FINANCIAL LOGIC: Calculate loan offsets for net savings
      const unpaidLoansGiven = loans
        .filter(l => l.direction === 'lent' && !l.is_paid)
        .reduce((sum, l) => sum + Number(l.amount), 0);

      const unpaidLoansBorrowed = loans
        .filter(l => l.direction === 'borrowed' && !l.is_paid)
        .reduce((sum, l) => sum + Number(l.amount), 0);

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
        net_savings:               totalIncome - totalExpenses - unpaidLoansGiven + unpaidLoansBorrowed,
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
      <DialogContent className="sm:max-w-4xl w-[calc(100vw-32px)] rounded-2xl p-0 overflow-hidden gap-0 max-h-[92dvh] border-border/40">
        <style>{`
          @keyframes aiSlideIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0);     }
          }
        `}</style>

        <div className="flex flex-col max-h-[92dvh]">

          {/* ── Header ── */}
          <div
            className="px-5 pt-5 pb-4 border-b border-border/60 flex-shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(var(--primary) / 0.08), transparent 70%)" }}
          >
            <DialogHeader>
              <DialogTitle className="text-base font-black tracking-tight flex items-center gap-2">
                <Sparkles size={15} color="hsl(var(--primary))" />
                Your Personal AI Finance Analyst
              </DialogTitle>
            </DialogHeader>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Ask for a fresh read on your spending, habits, and where your money's leaking.
            </p>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {/* What I Know */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <p style={labelSt}>What I Know About You</p>
              <span style={{
                fontSize:     10,
                fontWeight:   600,
                color:        "hsl(var(--primary))",
                background:   "hsl(var(--primary) / 0.08)",
                border:       "1px solid hsl(var(--primary) / 0.2)",
                padding:      "2px 8px",
                borderRadius: 6,
                fontFamily:   "'DM Mono', monospace",
                whiteSpace:   "nowrap",
              }}>
                {cycleLabel}
              </span>
            </div>
            {hasContext ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
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
            ) : (
              <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
                First time here — generate your first analysis below.
              </p>
            )}

            {/* Generation control */}
            {error && !isGenerating && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "10px 12px", borderRadius: 10, marginBottom: 10,
                background: "hsl(0 70% 60% / 0.06)",
                border:     "1px solid hsl(0 70% 60% / 0.2)",
              }}>
                <AlertTriangle size={13} color={A.red} style={{ marginTop: 1, flexShrink: 0 }} />
                <p className="text-[11px] text-muted-foreground leading-relaxed">{error}</p>
              </div>
            )}

            <button
              onClick={() => refresh()}
              disabled={isGenerating}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%",
                padding: "11px 16px", borderRadius: 12,
                background: isGenerating ? "hsl(var(--primary) / 0.6)" : "hsl(var(--primary))",
                color:      "hsl(var(--primary-foreground))",
                border:     "none",
                fontSize: 13, fontWeight: 700,
                cursor: isGenerating ? "not-allowed" : "pointer",
                boxShadow: isGenerating ? "none" : "0 0 24px hsl(var(--primary) / 0.3)",
                transition: "opacity 0.2s",
              }}
            >
              <ButtonIcon
                size={14}
                className={isGenerating ? "animate-spin" : undefined}
              />
              {buttonText}
            </button>

            {/* Insights display */}
            {hasInsights && !isLoading && (
              <div style={{ marginTop: 18 }}>
                {insightMap.get("top_action") && (
                  <FeaturedActionCard
                    insight={insightMap.get("top_action")!}
                    onRate={rateInsight}
                  />
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {lastGeneratedAt
                ? `Last generated ${formatDistanceToNow(lastGeneratedAt, { addSuffix: true })}`
                : "No analysis yet"}
            </span>
            <button
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
