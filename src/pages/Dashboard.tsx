import { useMemo, useState, useEffect } from "react";
import { format, parseISO, subDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useHabits, useHabitCompletions, calculateStreak, longestStreak } from "@/hooks/useHabits";
import { useBudgets, useExpenses, usePrevMonthExpenses } from "@/hooks/useExpenses";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { DashboardExpenseCharts } from "@/components/dashboard/DashboardExpenseCharts";
import { WeeklyCompletionWidget } from "@/components/dashboard/WeeklyCompletionWidget";
import { LifeScoreCard } from "@/components/dashboard/TodayCards";
import { SpendingCard } from "@/components/dashboard/SpendingCard";
import { DayCard } from "@/components/dashboard/SkyWatchCard";
import { AIAnalystDialog } from "@/components/AIAnalystDialog";
import { AiOrb } from "@/components/AiOrb";
import { MAC, SF_STACK } from "@/lib/macColors";
import { lifeScore } from "@/lib/lifeScore";
import { getAvatarUrl, getDisplayName, getInitials } from "@/lib/userProfile";

// ─── UTILS ────────────────────────────────────────────────────────────────────
function getTimeState() {
  const h = new Date().getHours();
  if (h < 5) return { urgency: "danger", label: "Late night", greeting: "Still up" };
  if (h < 12) return { urgency: "low", label: "Morning", greeting: "Good morning" };
  if (h < 17) return { urgency: "medium", label: "Afternoon", greeting: "Good afternoon" };
  if (h < 20) return { urgency: "high", label: "Evening", greeting: "Good evening" };
  return { urgency: "danger", label: "Tonight", greeting: "Good evening" };
}

const CONFETTI = [MAC.orange, MAC.green, MAC.blue, MAC.purple, MAC.pink];

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterStr = format(subDays(today, 1), "yyyy-MM-dd");

  const { data: habits } = useHabits();
  const { data: completions } = useHabitCompletions();
  const { data: expenses } = useExpenses(today);
  const { data: prevExpenses } = usePrevMonthExpenses(today);
  const { data: budgets } = useBudgets(today);
  useHabitReminders(habits, completions);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeHabits = useMemo(() => habits?.filter(h => h.is_active) ?? [], [habits]);

  // Only IDs that belong to regular habits — excludes persona_shift rules
  const habitIdSet = useMemo(() => new Set(activeHabits.map(h => h.id)), [activeHabits]);

  // date → habits done that day
  const doneByDate = useMemo(() => {
    const m = new Map<string, Set<string>>();
    completions?.forEach(c => {
      if (!habitIdSet.has(c.habit_id)) return;
      let s = m.get(c.date);
      if (!s) m.set(c.date, (s = new Set()));
      s.add(c.habit_id);
    });
    return m;
  }, [completions, habitIdSet]);
  const completedTodaySet = useMemo(() => doneByDate.get(todayStr) ?? new Set<string>(), [doneByDate, todayStr]);

  // date → total spent, across last month and this one (so "yesterday" works on the 1st)
  const dayTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of [...(prevExpenses ?? []), ...(expenses ?? [])]) m.set(e.date, (m.get(e.date) ?? 0) + e.amount);
    return m;
  }, [expenses, prevExpenses]);
  const todayTotal = dayTotals.get(todayStr) ?? 0;
  const yesterTotal = dayTotals.get(yesterStr) ?? 0;

  const doneCount = completedTodaySet.size;
  const habitPct = activeHabits.length ? doneCount / activeHabits.length : 0;

  // ── Life Score: today, the last 7 days, and what's left to boost it ───────
  const score = lifeScore(habitPct, todayTotal, yesterTotal);
  const scoreHistory = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = subDays(parseISO(todayStr), 6 - i);
      const ds = format(d, "yyyy-MM-dd");
      const prev = format(subDays(d, 1), "yyyy-MM-dd");
      const pct = activeHabits.length ? (doneByDate.get(ds)?.size ?? 0) / activeHabits.length : 0;
      return { date: ds, label: format(d, "EEEEE"), total: lifeScore(pct, dayTotals.get(ds) ?? 0, dayTotals.get(prev) ?? 0).total };
    }),
    [todayStr, activeHabits.length, doneByDate, dayTotals]
  );
  const overallBudget = budgets?.find(b => b.category === "Overall")?.amount ?? null;

  // ── Time ─────────────────────────────────────────────────────────────────
  const ts = getTimeState();

  // ── Sky watch: habits orbit as planets (streak sizes them) + caseback engraving ─
  const planets = useMemo(
    () => activeHabits.map(h => ({
      id: h.id,
      name: h.name,
      emoji: h.emoji,
      done: completedTodaySet.has(h.id),
      streak: completions ? calculateStreak(completions, h.id, h.start_date) : 0,
    })),
    [activeHabits, completions, completedTodaySet]
  );
  const bestStreak = useMemo(
    () => (completions ? Math.max(0, ...activeHabits.map(h => longestStreak(completions, h.id))) : 0),
    [activeHabits, completions]
  );
  const habitsSince = useMemo(
    () => activeHabits.reduce<string | null>((min, h) => (!min || h.start_date < min ? h.start_date : min), null),
    [activeHabits]
  );

  // ── AI Analyst modal ──────────────────────────────────────────────────────
  const [analystOpen, setAnalystOpen] = useState(false);
  const [analystThinking, setAnalystThinking] = useState(false);

  // ── Confetti ──────────────────────────────────────────────────────────────
  const [particles, setParticles] = useState<{ id: number; x: number; color: string; size: number }[]>([]);
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (habitPct === 1 && activeHabits.length > 0 && !celebrated) {
      setCelebrated(true);
      setParticles(Array.from({ length: 32 }, (_, i) => ({
        id: i, x: Math.random() * 100,
        color: CONFETTI[i % CONFETTI.length],
        size: Math.random() * 7 + 4,
      })));
      setTimeout(() => setParticles([]), 3500);
    }
    if (habitPct < 1) setCelebrated(false);
  }, [habitPct, activeHabits.length]);

  const name = getDisplayName(user);

  return (
    <AppLayout>
      <style>{`
        @keyframes dshParticle {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
      `}</style>

      {/* Soft ambient wash behind the frosted cards */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-[360px] w-[360px] rounded-full bg-primary/[0.04] blur-3xl" />
      </div>

      {/* Confetti */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: "fixed", zIndex: 9999, pointerEvents: "none",
          left: `${p.x}%`, top: "-2%",
          width: p.size, height: p.size, borderRadius: 2,
          background: p.color,
          animation: `dshParticle ${1.5 + Math.random() * 1.5}s ease forwards`,
          animationDelay: `${Math.random() * 0.4}s`,
        }} />
      ))}

      <div className="relative space-y-6" style={{ fontFamily: SF_STACK }}>

        {/* ══ LARGE TITLE ═══════════════════════════════════════════════════ */}
        <div className="flex items-end justify-between gap-3 px-1 animate-in fade-in slide-in-from-bottom-1 duration-500">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {format(today, "EEEE, MMMM d")}
            </p>
            <h1 className="text-[32px] font-bold leading-tight tracking-tight sm:text-[34px]">Today</h1>
          </div>
          <div className="mb-1 flex shrink-0 items-center gap-2">
            <button
              onClick={() => setAnalystOpen(true)}
              className="rounded-full transition-transform hover:scale-105 active:scale-95"
              aria-label="Ask your AI coach"
              title={analystThinking ? "Your AI coach is thinking…" : "Your AI coach"}
            >
              <AiOrb size={40} state={analystThinking ? "thinking" : "idle"} />
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="rounded-full transition-transform active:scale-95"
              aria-label="Open profile"
            >
              <Avatar className="h-10 w-10 ring-2 ring-background shadow-md">
                <AvatarImage src={getAvatarUrl(user)} alt={name} referrerPolicy="no-referrer" />
                <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">{getInitials(name)}</AvatarFallback>
              </Avatar>
            </button>
          </div>
        </div>

        {/* ══ WIDGET GRID ══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">

          {/* ── Row 1: the sky-orrery watch (habits orbit as planets) ───── */}
          <DayCard
            greeting={ts.greeting}
            name={name.split(" ")[0]}
            habits={planets}
            bestStreak={bestStreak}
            since={habitsSince}
            delay={0}
          />

          {/* ── Row 1: Weekly Completion — the chain, rings, drill-downs ── */}
          <WeeklyCompletionWidget habits={activeHabits} completions={completions} today={today} delay={40} />

          {/* ── Row 2: Life Score — rings, tier ladder, trend, "what if" ─── */}
          <LifeScoreCard score={score} history={scoreHistory} delay={80} />

          {/* ── Row 2: Spending — today as a staircase against the allowance ─ */}
          <SpendingCard
            expenses={expenses ?? []}
            prevExpenses={prevExpenses}
            overallBudget={overallBudget}
            onOpen={() => navigate("/expenses")}
            delay={120}
          />

          {/* ── Row 3: expense charts (two medium) ───────────────────────── */}
          {expenses && <DashboardExpenseCharts expenses={expenses} month={today} delay={160} />}
        </div>

        <AIAnalystDialog open={analystOpen} onOpenChange={setAnalystOpen} onGeneratingChange={setAnalystThinking} />
      </div>
    </AppLayout>
  );
}
