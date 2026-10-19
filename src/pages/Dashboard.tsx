import { useMemo, useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { CalendarCheck, Check, ChevronRight, Flame, ListChecks, Sparkles, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useHabits, useHabitCompletions, calculateStreak } from "@/hooks/useHabits";
import { useExpenses, getCategoryColor, getSubCategoryEmoji, getSubCategoryLabel, getParentLabel } from "@/hooks/useExpenses";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { useCurrency } from "@/hooks/useCurrency";
import { DashboardExpenseCharts } from "@/components/dashboard/DashboardExpenseCharts";
import { ActivityRing, SectionHeader, Widget, WidgetHeader } from "@/components/dashboard/Widget";
import { AIAnalystDialog } from "@/components/AIAnalystDialog";
import { MAC, PRIMARY, SF_STACK } from "@/lib/macColors";
import { getAvatarUrl, getDisplayName, getInitials } from "@/lib/userProfile";
import { cn } from "@/lib/utils";

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

// Small muted chevron for tappable cards, as in iOS lists.
const Chevron = () => <ChevronRight className="h-4 w-4 text-muted-foreground/60" />;

// ─── SUN ARC: the day as a sunrise→sunset arc ─────────────────────────────────
function SunArc({ progress }: { progress: number }) {
  const p = Math.max(0, Math.min(progress, 1));
  const theta = Math.PI * (1 - p);
  const sx = 60 + 48 * Math.cos(theta);
  const sy = 56 - 48 * Math.sin(theta);
  const arc = "M 12 56 A 48 48 0 0 1 108 56";
  return (
    <svg viewBox="0 0 120 62" className="w-full" aria-hidden="true">
      <path d={arc} fill="none" stroke="hsl(var(--foreground) / 0.12)" strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />
      <path d={arc} fill="none" stroke={PRIMARY} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray={`${p} 1`} />
      <line x1="4" y1="56" x2="116" y2="56" stroke="hsl(var(--foreground) / 0.12)" strokeWidth={1} />
      <circle cx={sx} cy={sy} r={9} fill={PRIMARY} opacity={0.18} />
      <circle cx={sx} cy={sy} r={5} fill={PRIMARY} />
    </svg>
  );
}

// ─── SPARKLINE: tiny smoothed area chart ──────────────────────────────────────
function Sparkline({ values }: { values: number[] }) {
  const w = 112, h = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - (v / max) * (h - 8)] as const);
  const line = pts.map(([x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `C ${cx} ${py} ${cx} ${y} ${x} ${y}`;
  }).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-28" aria-hidden="true">
      <defs>
        <linearGradient id="dsh-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.28} />
          <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill="url(#dsh-spark)" />
      <path d={line} fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={PRIMARY} />
    </svg>
  );
}

// ─── WEEK DAY RING ────────────────────────────────────────────────────────────
function DayRing({ pct, day, isToday }: { pct: number | null; day: string; isToday: boolean }) {
  const upcoming = pct === null;
  const val = pct ?? 0;
  const missed = !upcoming && !isToday && val === 0;
  const color = missed ? MAC.red : val >= 1 ? MAC.green : PRIMARY;

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      {upcoming ? (
        <div className="h-[38px] w-[38px] rounded-full border-[3.5px] border-dashed border-foreground/10" />
      ) : (
        <ActivityRing pct={missed ? 0 : val} size={38} stroke={3.5} color={color}>
          <span className="text-[9px] font-semibold leading-none tabular-nums" style={{ color }}>
            {Math.round(val * 100)}<span className="text-[7px]">%</span>
          </span>
        </ActivityRing>
      )}
      <span className={cn("text-[10px] font-semibold", isToday ? "text-foreground" : "text-muted-foreground")}>{day}</span>
      <span className={cn("h-1 w-1 rounded-full", isToday ? "bg-primary" : "bg-transparent")} />
    </div>
  );
}

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
  const { formatAmount } = useCurrency();
  useHabitReminders(habits, completions);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeHabits = useMemo(() => habits?.filter(h => h.is_active) ?? [], [habits]);

  // Only IDs that belong to regular habits — excludes persona_shift rules
  const habitIdSet = useMemo(() => new Set(activeHabits.map(h => h.id)), [activeHabits]);

  const completedTodaySet = useMemo(() => {
    if (!completions) return new Set<string>();
    return new Set(
      completions
        .filter(c => c.date === todayStr && habitIdSet.has(c.habit_id))
        .map(c => c.habit_id)
    );
  }, [completions, todayStr, habitIdSet]);

  const todayExpenses = useMemo(() => expenses?.filter(e => e.date === todayStr) ?? [], [expenses, todayStr]);
  const yesterExpenses = useMemo(() => expenses?.filter(e => e.date === yesterStr) ?? [], [expenses, yesterStr]);
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const yesterTotal = yesterExpenses.reduce((s, e) => s + e.amount, 0);

  const doneCount = completedTodaySet.size;
  const habitPct = activeHabits.length ? doneCount / activeHabits.length : 0;
  const spendDelta = yesterTotal ? Math.round(((todayTotal - yesterTotal) / yesterTotal) * 100) : 0;

  // ── Life Score ────────────────────────────────────────────────────────────
  const habitScore = Math.round(habitPct * 60);
  const spendScore = spendDelta <= 0 ? 40 : spendDelta <= 20 ? 30 : spendDelta <= 50 ? 20 : 10;
  const lifeScore = habitScore + spendScore;
  const lifeColor = lifeScore >= 80 ? MAC.green : lifeScore >= 60 ? PRIMARY : lifeScore >= 40 ? MAC.orange : MAC.red;
  const lifeLabel = lifeScore >= 80 ? "Excellent" : lifeScore >= 60 ? "Good" : lifeScore >= 40 ? "Fair" : "Needs work";

  // ── Time ─────────────────────────────────────────────────────────────────
  const ts = getTimeState();
  const timeUrgent = ts.urgency === "danger";
  const now = new Date();
  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);

  // ── Streak per habit (shown in the Habits list) ───────────────────────────
  const streaks = useMemo(
    () => activeHabits.map(h => ({ habit: h, streak: completions ? calculateStreak(completions, h.id, h.start_date) : 0 })),
    [activeHabits, completions]
  );

  // ── Weekly heatmap ────────────────────────────────────────────────────────
  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const dStr = format(d, "yyyy-MM-dd");
      const isT = dStr === todayStr;
      const label = format(d, "EEEEE");
      if (isT) return { day: label, pct: habitPct, isToday: true };
      if (!completions || activeHabits.length === 0)
        return { day: label, pct: d < today ? 0 : null, isToday: false };
      const uniqueDone = new Set(completions.filter(c => c.date === dStr && habitIdSet.has(c.habit_id)).map(c => c.habit_id)).size;
      return {
        day: label,
        pct: d < today ? uniqueDone / activeHabits.length : null,
        isToday: false,
      };
    });
  }, [completions, todayStr, habitPct, activeHabits.length]);

  const weekActive = weekData.filter(d => d.pct !== null);
  const weekAvg = weekActive.length
    ? Math.round(weekActive.reduce((s, d) => s + (d.pct ?? 0), 0) / weekActive.length * 100)
    : 0;
  const weekAvgColor = weekAvg >= 70 ? MAC.green : weekAvg >= 40 ? MAC.orange : MAC.red;

  // ── Today's spending by category (for the stacked bar) ────────────────────
  const todayByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    todayExpenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]);
  }, [todayExpenses]);

  // ── Last 7 days of spending (sparkline) ───────────────────────────────────
  const last7 = useMemo(
    () => Array.from({ length: 7 }, (_, i) => format(subDays(today, 6 - i), "yyyy-MM-dd")),
    [todayStr]
  );
  const spend7 = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses?.forEach(e => { totals[e.date] = (totals[e.date] || 0) + e.amount; });
    return last7.map(d => totals[d] || 0);
  }, [expenses, last7]);

  // ── AI Analyst modal ──────────────────────────────────────────────────────
  const [analystOpen, setAnalystOpen] = useState(false);

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
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-foreground/[0.08] bg-card/70 text-primary shadow-md backdrop-blur-xl transition-transform active:scale-95"
              aria-label="Ask your AI Finance Analyst"
              title="AI Finance Analyst"
            >
              <span
                className="absolute inset-0 rounded-full opacity-60"
                style={{ background: "radial-gradient(circle at 30% 25%, hsl(var(--primary)/0.35), transparent 60%)" }}
                aria-hidden="true"
              />
              <Sparkles className="relative h-[18px] w-[18px]" />
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

          {/* ── Life Score (small) — unchanged ───────────────────────────── */}
          <Widget className="min-h-[158px] items-center justify-center text-center" delay={0}>
            <ActivityRing pct={lifeScore / 100} size={84} stroke={10} color={lifeColor}>
              <span className="text-[24px] font-semibold leading-none tabular-nums">{lifeScore}</span>
            </ActivityRing>
            <p className="mt-2.5 text-[13px] font-semibold">Life Score</p>
            <p className="text-[11px] font-medium" style={{ color: lifeColor }}>{lifeLabel}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
              Habits {habitScore} · Spend {spendScore}
            </p>
          </Widget>

          {/* ── Today: the sun travelling across the day (small) ─────────── */}
          <Widget className="min-h-[158px]" delay={40}>
            <p className="text-[13px] font-medium text-muted-foreground">{ts.greeting},</p>
            <p className="truncate text-[17px] font-semibold leading-tight tracking-tight">{name.split(" ")[0]}</p>
            <div className="mt-auto pt-2">
              <SunArc progress={dayProgress} />
              <div className="mt-1 flex items-baseline justify-between">
                <span className="text-[15px] font-semibold tabular-nums">
                  {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{Math.round(dayProgress * 100)}% of day</span>
              </div>
            </div>
          </Widget>

          {/* ── Habit Completion (medium) — unchanged ────────────────────── */}
          <Widget className="col-span-2" delay={80}>
            <WidgetHeader
              icon={<CalendarCheck />}
              title="Weekly Completion"
              tint={PRIMARY}
              right={
                <span className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: weekAvgColor }}>
                  {weekAvg}%<span className="ml-1 text-[11px] font-medium text-muted-foreground">avg</span>
                </span>
              }
            />
            <div className="flex flex-1 items-center gap-1">
              {weekData.map((d, i) => <DayRing key={i} pct={d.pct} day={d.day} isToday={d.isToday} />)}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Last 7 days · today {doneCount}/{activeHabits.length}
            </p>
          </Widget>

          {/* ── Habits list (medium, iOS inset list) ─────────────────────── */}
          <Widget className="col-span-2" onClick={() => navigate("/habits")} delay={120}>
            <SectionHeader
              icon={<ListChecks />}
              title="Habits"
              subtitle={
                activeHabits.length === 0 ? "Nothing scheduled"
                  : habitPct === 1 ? "All done for today"
                  : `${activeHabits.length - doneCount} left today`
              }
              right={<Chevron />}
            />
            {/* Story-style segments, one per habit */}
            {activeHabits.length > 0 && (
              <div className="mb-1 flex gap-1">
                {activeHabits.map(h => (
                  <div
                    key={h.id}
                    className={cn("h-1 flex-1 rounded-full transition-colors duration-500", completedTodaySet.has(h.id) ? "bg-primary" : "bg-foreground/10")}
                  />
                ))}
              </div>
            )}
            {activeHabits.length > 0 ? (
              <div className="flex-1 divide-y divide-border/50">
                {activeHabits.slice(0, 5).map((h) => {
                  const done = completedTodaySet.has(h.id);
                  const streak = streaks.find(s => s.habit.id === h.id)?.streak ?? 0;
                  const atRisk = !done && timeUrgent;
                  return (
                    <div key={h.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className={cn(
                          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                          done ? "border-primary bg-primary" : "border-foreground/20"
                        )}
                      >
                        {done && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                      </span>
                      <span className="shrink-0 text-[15px] leading-none">{h.emoji}</span>
                      <span className={cn("min-w-0 flex-1 truncate text-[15px]", done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                        {h.name}
                      </span>
                      {atRisk && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: MAC.red }} title="At risk" />}
                      {streak > 0 && (
                        <span className="flex shrink-0 items-center gap-0.5 text-[12px] text-muted-foreground tabular-nums">
                          <Flame className="h-3 w-3" />{streak}
                        </span>
                      )}
                    </div>
                  );
                })}
                {activeHabits.length > 5 && (
                  <p className="pt-2.5 text-[12px] text-muted-foreground">+{activeHabits.length - 5} more</p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted-foreground">Create your first habit to get started.</p>
            )}
          </Widget>

          {/* ── Spending (medium) ────────────────────────────────────────── */}
          <Widget className="col-span-2" onClick={() => navigate("/expenses")} delay={160}>
            <SectionHeader
              icon={<Wallet />}
              title="Spending"
              subtitle={
                !yesterTotal ? "Today"
                  : spendDelta === 0 ? "Same as yesterday"
                  : `${Math.abs(spendDelta)}% ${spendDelta > 0 ? "more" : "less"} than yesterday`
              }
              right={<Chevron />}
            />
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[28px] font-semibold leading-none tracking-tight tabular-nums">{formatAmount(todayTotal)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">today · 7-day trend</p>
              </div>
              <Sparkline values={spend7} />
            </div>

            {todayByCategory.length > 0 && (
              <div className="mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full">
                {todayByCategory.map(([cat, amt]) => (
                  <div
                    key={cat}
                    className="h-full rounded-full opacity-80"
                    style={{ width: `${(amt / todayTotal) * 100}%`, background: getCategoryColor(cat) }}
                  />
                ))}
              </div>
            )}

            {todayExpenses.length > 0 ? (
              <div className="mt-2 flex-1 divide-y divide-border/50">
                {todayExpenses.slice(0, 4).map((e) => {
                  const color = getCategoryColor(e.category);
                  const emoji = getSubCategoryEmoji(e.category);
                  return (
                    <div key={e.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px]"
                        style={{ background: `${color}1f` }}
                      >
                        {emoji ?? <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] leading-tight">{getSubCategoryLabel(e.category) ?? getParentLabel(e.category)}</p>
                        {e.note && <p className="truncate text-[12px] leading-tight text-muted-foreground">{e.note}</p>}
                      </div>
                      <span className="shrink-0 text-[15px] tabular-nums">{formatAmount(e.amount)}</span>
                    </div>
                  );
                })}
                {todayExpenses.length > 4 && (
                  <p className="pt-2.5 text-[12px] text-muted-foreground">+{todayExpenses.length - 4} more</p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-[13px] text-muted-foreground">No expenses logged today.</p>
            )}
          </Widget>

          {/* ── Expense charts (two medium) ──────────────────────────────── */}
          {expenses && <DashboardExpenseCharts expenses={expenses} month={today} delay={280} />}
        </div>

        <AIAnalystDialog open={analystOpen} onOpenChange={setAnalystOpen} />
      </div>
    </AppLayout>
  );
}
