import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, RefreshCw, X, TrendingUp, Target, Zap, ThumbsUp, ThumbsDown,
  Lightbulb, ListChecks, ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AiOrb } from "@/components/AiOrb";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/hooks/useCurrency";
import { getCategoryDisplayLabel, isValidCategory } from "@/hooks/useExpenses";
import { loadCycleConfig } from "@/components/expenses/BudgetManager";
import { getCycleRangeForDate } from "@/hooks/useSavings";
import { getDisplayName } from "@/lib/userProfile";
import { cn } from "@/lib/utils";
import {
  useAIInsights, useAINotes, type AiInsight, type AiNote,
} from "@/hooks/useAIInsights";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

interface Props {
  open:                boolean;
  onOpenChange:        (o: boolean) => void;
  /** Lets the trigger button's orb swirl while an analysis is being made. */
  onGeneratingChange?: (generating: boolean) => void;
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The AI writes currency codes ("BDT 2,000") and sometimes raw category ids
// ("transport:vehicle-maint"); show the user's symbol and the readable label.
function tidy(text: string, currency: string, symbol: string): string {
  return text
    .replace(new RegExp(`\\b${escapeRe(currency)}\\s?(?=\\d)`, "g"), symbol)
    .replace(/\b[a-z]+(?:-[a-z]+)*:[a-z]+(?:-[a-z]+)*\b/g, (m) => (isValidCategory(m) ? getCategoryDisplayLabel(m) : m));
}

const categoryLabel = (c: string) => (isValidCategory(c) ? getCategoryDisplayLabel(c) : c);

function firstSentence(text: string): string {
  return text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() ?? text;
}

// ─── Inline highlight (numbers the eye should land on) ────────────────────────
function Hl({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-md px-1 py-px font-semibold tabular-nums text-foreground"
      style={{
        background: tone ? `color-mix(in srgb, ${tone} 18%, transparent)` : "hsl(var(--primary) / 0.14)",
        color:      tone,
      }}
    >
      {children}
    </span>
  );
}

// Text with **bold**, money amounts and percentages highlighted.
function Rich({ text, symbol }: { text: string; symbol: string }) {
  const re = new RegExp(
    `(\\*\\*[^*]+\\*\\*|${escapeRe(symbol)}\\s?[\\d,]+(?:\\.\\d+)?k?|\\d+(?:\\.\\d+)?%)`,
    "g",
  );
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? <Hl key={i}>{part.replace(/^\*\*|\*\*$/g, "")}</Hl> : part,
      )}
    </>
  );
}

// ─── A message from the coach ─────────────────────────────────────────────────
function Bubble({
  children, delay = 0, className,
}: {
  children:   ReactNode;
  delay?:     number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-[92%] rounded-[18px] rounded-tl-md border border-border/40 bg-card/60 px-3.5 py-2.5",
        "text-[13px] leading-[1.6] text-foreground/90 backdrop-blur-xl",
        className,
      )}
      style={{ animation: "aiSlideIn 0.4s ease both", animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <Bubble className="inline-flex w-fit items-center gap-2.5 text-[12.5px] text-muted-foreground">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary"
            style={{ animation: "aiDot 1.2s ease-in-out infinite", animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      {label}
    </Bubble>
  );
}

// ─── Helpful? row ─────────────────────────────────────────────────────────────
function Rating({
  insight, onRate,
}: {
  insight: AiInsight;
  onRate:  (id: string, useful: boolean) => Promise<void>;
}) {
  const [rated, setRated] = useState<boolean | null>(insight.was_useful ?? null);
  const [busy,  setBusy]  = useState(false);

  // Insight ids survive a regeneration — reset when the words change
  useEffect(() => {
    setRated(insight.was_useful ?? null);
  }, [insight.id, insight.generated_at, insight.was_useful]);

  const rate = async (useful: boolean) => {
    if (rated !== null || busy) return;
    setBusy(true);
    setRated(useful);
    try { await onRate(insight.id, useful); }
    catch { setRated(null); }
    finally { setBusy(false); }
  };

  const btn = (useful: boolean, Icon: LucideIcon, label: string) => {
    const active = rated === useful;
    const tone   = useful ? "var(--success)" : "var(--destructive)";
    return (
      <button
        onClick={() => rate(useful)}
        disabled={rated !== null || busy}
        title={label}
        aria-label={label}
        className="flex h-5 w-5 items-center justify-center rounded-full transition-colors enabled:hover:bg-foreground/[0.06] disabled:cursor-default"
        style={{
          color:      active ? `hsl(${tone})` : "hsl(var(--muted-foreground))",
          background: active ? `hsl(${tone} / 0.14)` : undefined,
          opacity:    rated !== null && !active ? 0.3 : 1,
        }}
      >
        <Icon size={11} />
      </button>
    );
  };

  return (
    <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-muted-foreground">
      <span className="mr-1">
        {rated === null ? "Helpful?" : rated ? "Thanks — noted" : "Noted, I'll change it up"}
      </span>
      {btn(true, ThumbsUp, "Helpful")}
      {btn(false, ThumbsDown, "Not helpful")}
    </div>
  );
}

// ─── Collapsible detail row ───────────────────────────────────────────────────
function Section({
  Icon, label, teaser, children,
}: {
  Icon:     LucideIcon;
  label:    string;
  teaser?:  string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <Icon size={13} className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-foreground">{label}</span>
          {!open && teaser && (
            <span className="block truncate text-[11.5px] text-muted-foreground">{teaser}</span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={cn("shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-2.5 pl-10 text-[13px] leading-[1.6] text-foreground/90">
          {children}
        </div>
      )}
    </div>
  );
}

function TrackRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-medium text-foreground">{children}</span>
    </div>
  );
}

// "Practice vocabularies (80% consistency)" → name + highlighted rate
function HabitValue({ value }: { value: string }) {
  const m = value.match(/^(.*) \((\d+(?:\.\d+)?)% consistency\)$/);
  if (!m) return <>{value}</>;
  return <>{m[1]} <Hl>{m[2]}%</Hl></>;
}

// "0% (0 of 49 identity votes cast this week)" → "0 of 49 this week"
function identityValue(value: string): ReactNode {
  const m = value.match(/^\d+(?:\.\d+)?% \((\d+) of (\d+)/);
  if (!m) return value;
  return <><Hl>{m[1]} of {m[2]}</Hl> this week</>;
}

function NotesList({ notes, onDismiss }: { notes: AiNote[]; onDismiss: (id: string) => void }) {
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n) => (
          <li key={n.id} className="flex items-start gap-2">
            <p className="flex-1">
              {n.memory_value}
              <span className="ml-1.5 text-[10.5px] text-muted-foreground">
                · {formatDistanceToNow(new Date(n.last_updated), { addSuffix: true })}
              </span>
            </p>
            <button
              onClick={() => onDismiss(n.id)}
              title="Not true — forget this"
              aria-label="Not true — forget this"
              className="mt-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Wrong? Tap × and I won't assume it again. Notes I can't keep confirming fade after 60 days.
      </p>
    </>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────
export function AIAnalystDialog({ open, onOpenChange, onGeneratingChange }: Props) {
  const { user }                                                            = useAuth();
  const { currency, symbol, formatAmount }                                  = useCurrency();
  const { insights, isLoading, isGenerating, error, refresh, rateInsight }  = useAIInsights();
  const { notes, dismissNote }                                              = useAINotes(open);

  useEffect(() => {
    onGeneratingChange?.(isGenerating);
  }, [isGenerating, onGeneratingChange]);

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

  const insightMap  = new Map((insights ?? []).map((i) => [i.insight_type, i]));
  const hasInsights = (insights?.length ?? 0) > 0;
  const say         = (text: string) => <Rich text={tidy(text, currency, symbol)} symbol={symbol} />;
  const teaser      = (text?: string) => (text ? tidy(firstSentence(text), currency, symbol) : undefined);

  const lastGeneratedAt = (insights ?? [])
    .map((i) => i.generated_at ? new Date(i.generated_at) : null)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  // ── The opening message, written from the numbers ──────────────────────────
  const firstName = getDisplayName(user).split(" ")[0];
  const income    = Number(snapshot?.total_income   ?? 0);
  const spent     = Number(snapshot?.total_expenses ?? 0);
  const kept      = income - spent;

  let moneyLine: ReactNode = null;
  if (income > 0 && kept >= 0) {
    moneyLine = (
      <>
        You brought in <Hl>{formatAmount(income)}</Hl>, spent <Hl>{formatAmount(spent)}</Hl> and
        kept <Hl>{formatAmount(kept)}</Hl> — <Hl>{Math.round((kept / income) * 100)}%</Hl> of what came in.
      </>
    );
  } else if (income > 0) {
    moneyLine = (
      <>
        You brought in <Hl>{formatAmount(income)}</Hl> but spent <Hl>{formatAmount(spent)}</Hl> —
        that's <Hl tone="hsl(var(--destructive))">{formatAmount(-kept)}</Hl> more than came in.
      </>
    );
  } else if (spent > 0) {
    moneyLine = (
      <>
        You've spent <Hl>{formatAmount(spent)}</Hl> so far. Log your income and I can tell you how much
        you're keeping.
      </>
    );
  }

  const healthInsight = insightMap.get("financial_health");
  const health        = healthInsight ? parseInsightContent(healthInsight) : null;
  const actionInsight = insightMap.get("top_action");

  const personaSep = memMap.spending_persona?.indexOf(" — ") ?? -1;
  const persona    = memMap.spending_persona
    ? personaSep > -1
      ? { name: memMap.spending_persona.slice(0, personaSep), why: memMap.spending_persona.slice(personaSep + 3) }
      : { name: memMap.spending_persona, why: "" }
    : null;

  const spending = insightMap.get("spending_summary");
  const habits   = insightMap.get("habit_coaching");
  const anomaly  = insightMap.get("anomaly");
  const topCat   = snapshot?.biggest_spending_category ?? memMap.biggest_spending_category;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[calc(100vw-20px)] gap-0 overflow-hidden rounded-3xl border-border/30 bg-background/80 p-0 backdrop-blur-2xl sm:max-w-3xl lg:max-w-4xl">
        <style>{`
          @keyframes aiSlideIn {
            from { opacity: 0; transform: translateY(10px); }
            to   { opacity: 1; transform: translateY(0);    }
          }
          @keyframes aiDrift {
            0%   { transform: translate3d(0, 0, 0) scale(1); }
            50%  { transform: translate3d(24px, -18px, 0) scale(1.12); }
            100% { transform: translate3d(-16px, 14px, 0) scale(0.95); }
          }
          @keyframes aiDot {
            0%, 60%, 100% { transform: translateY(0);    opacity: 0.4; }
            30%           { transform: translateY(-3px); opacity: 1;   }
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
          /* Transparent scrollbar: no track or arrows, a faint thumb that firms up on hover */
          .ai-scroll {
            scrollbar-width: thin;
            scrollbar-color: hsl(var(--foreground) / 0.12) transparent;
          }
          .ai-scroll:hover { scrollbar-color: hsl(var(--foreground) / 0.25) transparent; }
          .ai-scroll::-webkit-scrollbar              { width: 6px; background: transparent; }
          .ai-scroll::-webkit-scrollbar-track        { background: transparent; }
          .ai-scroll::-webkit-scrollbar-button       { display: none; }
          .ai-scroll::-webkit-scrollbar-thumb        { background: hsl(var(--foreground) / 0.12); border-radius: 999px; }
          .ai-scroll:hover::-webkit-scrollbar-thumb  { background: hsl(var(--foreground) / 0.25); }
          @media (prefers-reduced-motion: reduce) {
            .ai-drift { animation: none !important; }
          }
        `}</style>

        {/* min-w-0: DialogContent is a grid, and the one-line teasers below would
            otherwise stretch this column past the dialog's edge */}
        <div className="relative flex min-w-0 max-h-[94dvh] flex-col">

          {/* ── Liquid backdrop ── */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="ai-drift absolute -top-24 right-[-10%] h-72 w-72 rounded-full blur-3xl"
              style={{ background: "hsl(var(--primary) / 0.16)", animation: "aiDrift 14s ease-in-out infinite alternate" }}
            />
            <div
              className="ai-drift absolute bottom-[-15%] left-[-10%] h-64 w-64 rounded-full blur-3xl"
              style={{ background: "hsl(var(--accent) / 0.12)", animation: "aiDrift 18s ease-in-out infinite alternate-reverse" }}
            />
          </div>

          {/* ── Header: the orb is the coach ── */}
          <div className="relative flex shrink-0 items-center gap-3 border-b border-border/30 py-3 pl-4 pr-12 sm:pl-5 sm:pr-14">
            <AiOrb size={34} state={isGenerating ? "thinking" : "idle"} />
            <DialogHeader className="min-w-0 flex-1 space-y-0 text-left">
              <DialogTitle className="font-display text-[15px] font-bold tracking-tight">
                Your AI coach
              </DialogTitle>
              <DialogDescription className="truncate text-[11px]">
                {isGenerating
                  ? "Thinking…"
                  : lastGeneratedAt
                    ? `${cycleLabel} · updated ${formatDistanceToNow(lastGeneratedAt, { addSuffix: true })}`
                    : cycleLabel}
              </DialogDescription>
            </DialogHeader>
            <button
              onClick={() => refresh()}
              disabled={isGenerating}
              title="Get a fresh read"
              aria-label="Get a fresh read"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-card/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw size={14} className={isGenerating ? "animate-spin" : undefined} />
            </button>
          </div>

          {/* ── The briefing ── */}
          <div className="relative flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-4 py-3.5 ai-scroll sm:px-5">

            {/* Greeting + the numbers */}
            <Bubble>
              <p>
                Hey {firstName} — here's your read on{" "}
                <span className="font-semibold text-foreground">{cycleLabel}</span>.
              </p>
              {moneyLine && <p className="mt-1">{moneyLine}</p>}
              {persona && (
                <p className="mt-1">
                  This cycle you're <Hl>{persona.name}</Hl>
                  {persona.why && <> — {say(persona.why)}</>}.
                </p>
              )}
              {health && health.score !== undefined && (
                <p className="mt-1">
                  Overall health:{" "}
                  <Hl tone={scoreTone(health.score)}>{health.score}/10</Hl>
                  {health.text ? <>. {say(health.text)}</> : "."}
                </p>
              )}
              {healthInsight && <Rating insight={healthInsight} onRate={rateInsight} />}
            </Bubble>

            {isGenerating && (
              <Typing label={hasInsights ? "Taking a fresh look at your numbers…" : "Reading your cycle…"} />
            )}

            {error && !isGenerating && (
              <Bubble className="border-destructive/30 bg-destructive/10">
                <p className="flex items-start gap-2">
                  <AlertTriangle size={14} className="mt-1 shrink-0 text-destructive" />
                  <span>{error}</span>
                </p>
                <button
                  onClick={() => refresh()}
                  className="mt-2 rounded-full bg-foreground/[0.08] px-3 py-1 text-[12px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.12]"
                >
                  Try again
                </button>
              </Bubble>
            )}

            {!hasInsights && !isGenerating && !error && !isLoading && (
              <Bubble>
                I haven't looked at this cycle yet.{" "}
                <button onClick={() => refresh()} className="font-semibold text-primary underline-offset-2 hover:underline">
                  Get my first read
                </button>
              </Bubble>
            )}

            {hasInsights && !isLoading && (
              <div
                className="flex flex-col gap-2"
                style={{ opacity: isGenerating ? 0.55 : 1, transition: "opacity 0.3s" }}
              >
                {/* This week's one thing */}
                {actionInsight && (
                  <Bubble delay={100} className="border-primary/30 bg-primary/[0.08]">
                    <p className="mb-0.5 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-primary">
                      <Zap size={11} /> This week
                    </p>
                    <p className="font-display text-[14px] font-semibold leading-snug tracking-tight text-foreground">
                      {say(actionInsight.content)}
                    </p>
                    <Rating insight={actionInsight} onRate={rateInsight} />
                  </Bubble>
                )}

                <p
                  className="mt-1 px-1 text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                  style={{ animation: "aiSlideIn 0.4s ease both", animationDelay: "220ms" }}
                >
                  Want the details?
                </p>
                <div
                  className="ai-glass overflow-hidden rounded-[20px]"
                  style={{ animation: "aiSlideIn 0.4s ease both", animationDelay: "260ms" }}
                >
                  {spending && (
                    <Section Icon={TrendingUp} label="Spending" teaser={teaser(spending.content)}>
                      {say(spending.content)}
                      <Rating insight={spending} onRate={rateInsight} />
                    </Section>
                  )}
                  {habits && (
                    <Section Icon={Target} label="Habits" teaser={teaser(habits.content)}>
                      {say(habits.content)}
                      <Rating insight={habits} onRate={rateInsight} />
                    </Section>
                  )}
                  {anomaly && (
                    <Section Icon={AlertTriangle} label="Anything unusual" teaser={teaser(anomaly.content)}>
                      {say(anomaly.content)}
                      <Rating insight={anomaly} onRate={rateInsight} />
                    </Section>
                  )}
                  {notes.length > 0 && (
                    <Section
                      Icon={Lightbulb}
                      label="Patterns I've noticed"
                      teaser={notes.length === 1 ? notes[0].memory_value : `${notes.length} patterns across your past cycles`}
                    >
                      <NotesList notes={notes} onDismiss={dismissNote} />
                    </Section>
                  )}
                  <Section Icon={ListChecks} label="What I'm keeping an eye on" teaser="Top category, habits, identity votes">
                    {topCat && <TrackRow label="Top category">{categoryLabel(topCat)}</TrackRow>}
                    {memMap.strongest_habit && (
                      <TrackRow label="Strongest habit"><HabitValue value={memMap.strongest_habit} /></TrackRow>
                    )}
                    {memMap.weakest_habit && (
                      <TrackRow label="Needs help"><HabitValue value={memMap.weakest_habit} /></TrackRow>
                    )}
                    {memMap.identity_alignment && (
                      <TrackRow label="Identity votes">{identityValue(memMap.identity_alignment)}</TrackRow>
                    )}
                    {memMap.expense_volatility && (
                      <TrackRow label="Spending pattern">
                        <span className="capitalize">{memMap.expense_volatility}</span>
                      </TrackRow>
                    )}
                    {snapshot?.active_loans_count != null && snapshot.active_loans_count > 0 && (
                      <TrackRow label="Unpaid loans">
                        {snapshot.active_loans_count} · <Hl>{formatAmount(Number(snapshot.active_loans_total ?? 0))}</Hl>
                      </TrackRow>
                    )}
                  </Section>
                </div>
              </div>
            )}

            {/* Skeleton while the very first analysis loads */}
            {isLoading && (
              <div className="flex flex-col gap-2.5">
                {[0, 1].map((i) => (
                  <div key={i} className="ai-glass h-20 max-w-[92%] animate-pulse rounded-[22px] rounded-tl-md" />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
