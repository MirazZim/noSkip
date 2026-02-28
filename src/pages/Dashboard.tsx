import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { useHabits, useHabitCompletions, calculateStreak } from "@/hooks/useHabits";
import { DashboardHabitStats } from "@/components/dashboard/DashboardHabitStats";
import { useExpenses } from "@/hooks/useExpenses";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { useCurrency } from "@/hooks/useCurrency";
import { DashboardExpenseCharts } from "@/components/dashboard/DashboardExpenseCharts";
import { CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import {
  CheckCircle2, Circle, Flame, TrendingUp, TrendingDown,
  Wallet, Zap, ArrowRight, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Arc ring (shared design language) ─────────────────────────────── */
function ArcRing({ pct, size = 56, stroke = 5, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct, 1);
  const cx = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.34,1.56,0.64,1)", filter: `drop-shadow(0 0 5px ${color}50)` }}
      />
    </svg>
  );
}

/* ─── Greeting based on time ─────────────────────────────────────────── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: "Good morning", emoji: "☀️" };
  if (h < 17) return { text: "Good afternoon", emoji: "🌤️" };
  return { text: "Good evening", emoji: "🌙" };
}

/* ─── Hero stat card ─────────────────────────────────────────────────── */
function HeroStat({ label, value, sub, icon: Icon, color, pct }: {
  label: string; value: string; sub: string;
  icon: React.ElementType; color: string; pct?: number;
}) {
  return (
    <div className="relative rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden px-5 py-4 flex items-center gap-4">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ background: `radial-gradient(ellipse at 80% 50%, ${color}, transparent 70%)` }}
      />
      <div className="relative shrink-0">
        {pct !== undefined ? (
          <div className="relative">
            <ArcRing pct={pct} size={56} stroke={5} color={color} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
          </div>
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}18` }}>
            <Icon className="h-6 w-6" style={{ color }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tabular-nums tracking-tight leading-none mt-0.5" style={{ color }}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const greeting = getGreeting();

  const { data: habits } = useHabits();
  const { data: completions } = useHabitCompletions();
  const { data: expenses } = useExpenses(today);
  const { formatAmount } = useCurrency();

  useHabitReminders(habits, completions);

  const activeHabits = useMemo(() => habits?.filter((h) => h.is_active) || [], [habits]);

  const completedTodaySet = useMemo(() => {
    if (!completions) return new Set<string>();
    return new Set(completions.filter((c) => c.date === todayStr).map((c) => c.habit_id));
  }, [completions, todayStr]);

  const todayExpenses = useMemo(() => expenses?.filter((e) => e.date === todayStr) || [], [expenses, todayStr]);
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const yesterdayTotal = useMemo(() =>
    (expenses?.filter((e) => e.date === yesterdayStr) || []).reduce((s, e) => s + e.amount, 0),
    [expenses, yesterdayStr]
  );

  const habitPct = activeHabits.length ? completedTodaySet.size / activeHabits.length : 0;
  const habitColor = habitPct === 1 ? "#10b981" : habitPct >= 0.5 ? "#f59e0b" : "hsl(var(--primary))";

  const spendDelta = yesterdayTotal
    ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
    : 0;

  // Top expense category today
  const topCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    todayExpenses.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  }, [todayExpenses]);

  return (
    <AppLayout>
      <div className="space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2"
          style={{ animation: "dashIn 0.35s ease both" }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {format(today, "EEEE, MMMM d")}
            </p>
            <h1 className="text-2xl font-black font-display tracking-tight flex items-center gap-2">
              {greeting.text}
              <span>{greeting.emoji}</span>
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">Your daily overview</p>
        </div>

        {/* ── Hero stats row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div style={{ animation: "dashIn 0.35s ease both", animationDelay: "50ms" }}>
            <HeroStat
              label="Habits Today"
              value={`${completedTodaySet.size}/${activeHabits.length}`}
              sub={habitPct === 1 ? "All done — great work! 🎉" : `${activeHabits.length - completedTodaySet.size} remaining`}
              icon={Zap}
              color={habitColor}
              pct={habitPct}
            />
          </div>
          <div style={{ animation: "dashIn 0.35s ease both", animationDelay: "100ms" }}>
            <HeroStat
              label="Spent Today"
              value={formatAmount(todayTotal)}
              sub={
                spendDelta === 0 ? "Same as yesterday" :
                spendDelta > 0 ? `↑ ${spendDelta}% vs yesterday` :
                `↓ ${Math.abs(spendDelta)}% vs yesterday`
              }
              icon={Wallet}
              color="#8b5cf6"
            />
          </div>
        </div>

        {/* ── Main two-column grid ────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2">

          {/* LEFT — Habits ─────────────────────────────────────────── */}
          <div className="space-y-4" style={{ animation: "dashIn 0.4s ease both", animationDelay: "120ms" }}>

            {/* Today's habits panel */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today</p>
                  <p className="text-base font-black tracking-tight">Habits</p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground tabular-nums">
                  {completedTodaySet.size}/{activeHabits.length}
                </span>
              </div>

              {activeHabits.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {activeHabits.slice(0, 5).map((h, i) => {
                    const done = completedTodaySet.has(h.id);
                    const streak = completions ? calculateStreak(completions, h.id, h.start_date) : 0;
                    const color = h.color || "hsl(var(--primary))";
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-3 px-5 py-3 group"
                        style={{ animation: "dashIn 0.3s ease both", animationDelay: `${i * 40 + 160}ms` }}
                      >
                        {/* Done indicator */}
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
                            done ? "shadow-sm" : "bg-muted"
                          )}
                          style={done ? { backgroundColor: color, boxShadow: `0 0 8px ${color}40` } : {}}
                        >
                          {done
                            ? <CheckCircle2 className="h-4 w-4 text-white" strokeWidth={2.5} />
                            : <Circle className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.5} />
                          }
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold truncate leading-snug", done && "line-through text-muted-foreground")}>
                            {h.emoji} {h.name}
                          </p>
                        </div>

                        {streak > 0 && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Flame className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs font-black text-amber-500 tabular-nums">{streak}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {activeHabits.length > 5 && (
                    <div className="px-5 py-2.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      {activeHabits.length - 5} more in Habits
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No habits yet — head to Habits to create one.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Expenses ──────────────────────────────────────── */}
          <div className="space-y-4" style={{ animation: "dashIn 0.4s ease both", animationDelay: "160ms" }}>

            {/* Today's expenses panel */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Today</p>
                  <p className="text-base font-black tracking-tight">Expenses</p>
                </div>
                <div className="flex items-center gap-2">
                  {spendDelta !== 0 && (
                    <span className={cn(
                      "flex items-center gap-0.5 text-[10px] font-bold",
                      spendDelta > 0 ? "text-rose-500" : "text-emerald-500"
                    )}>
                      {spendDelta > 0
                        ? <TrendingUp className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(spendDelta)}%
                    </span>
                  )}
                  <span className="text-sm font-black tabular-nums text-foreground">{formatAmount(todayTotal)}</span>
                </div>
              </div>

              {todayExpenses.length > 0 ? (
                <div className="divide-y divide-border/40">
                  {todayExpenses.slice(0, 5).map((e, i) => {
                    const color = CATEGORY_COLORS[e.category as ExpenseCategory] || CATEGORY_COLORS.Other;
                    return (
                      <div
                        key={e.id}
                        className="flex items-center gap-3 px-5 py-3"
                        style={{ animation: "dashIn 0.3s ease both", animationDelay: `${i * 40 + 200}ms` }}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}18` }}>
                          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        </div>
                        <span className="flex-1 text-sm font-semibold truncate text-foreground">
                          {e.note || e.category}
                        </span>
                        <span className="text-sm font-black tabular-nums shrink-0" style={{ color }}>
                          {formatAmount(e.amount)}
                        </span>
                      </div>
                    );
                  })}
                  {todayExpenses.length > 5 && (
                    <div className="px-5 py-2.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      {todayExpenses.length - 5} more in Expenses
                    </div>
                  )}
                </div>
              ) : (
                <div className="px-5 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No expenses logged today.</p>
                </div>
              )}
            </div>

            {/* Expense charts */}
            {expenses && (
              <DashboardExpenseCharts expenses={expenses} month={today} />
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dashIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </AppLayout>
  );
}