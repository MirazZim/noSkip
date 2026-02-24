import { useMemo } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { useHabits, useHabitCompletions, calculateStreak } from "@/hooks/useHabits";
import { DashboardHabitStats } from "@/components/dashboard/DashboardHabitStats";
import { useExpenses } from "@/hooks/useExpenses";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { useCurrency } from "@/hooks/useCurrency";
import { DashboardExpenseCharts } from "@/components/dashboard/DashboardExpenseCharts";
import { CheckCircle2, Circle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const { data: habits } = useHabits();
  const { data: completions } = useHabitCompletions();
  const { data: expenses } = useExpenses(today);
  const { formatAmount } = useCurrency();

  useHabitReminders(habits, completions);

  const activeHabits = useMemo(() => habits?.filter((h) => h.is_active) || [], [habits]);
  const completedToday = useMemo(() => {
    if (!completions) return new Set<string>();
    return new Set(completions.filter((c) => c.date === todayStr).map((c) => c.habit_id));
  }, [completions, todayStr]);

  const todayExpenses = useMemo(
    () => expenses?.filter((e) => e.date === todayStr) || [],
    [expenses, todayStr]
  );
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Dashboard</h1>
          <p className="text-muted-foreground">Your daily overview at a glance</p>
        </div>

        {/* Two-column layout: Habits left, Expenses right */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT — Habits */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today's Habits</CardTitle>
              </CardHeader>
              <CardContent>
                {activeHabits.length > 0 ? (
                  <div className="space-y-2">
                    {activeHabits.slice(0, 5).map((h) => {
                      const done = completedToday.has(h.id);
                      const streak = completions ? calculateStreak(completions, h.id, h.start_date) : 0;
                      return (
                        <div key={h.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {done ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <Circle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={done ? "line-through text-muted-foreground" : ""}>
                              {h.emoji} {h.name}
                            </span>
                          </div>
                          {streak > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <TrendingUp className="h-3 w-3" /> {streak}d
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-xs text-muted-foreground pt-1">
                      {completedToday.size}/{activeHabits.length} completed
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No habits yet. Head to Habits to create one.</p>
                )}
              </CardContent>
            </Card>

            {habits && completions && habits.length > 0 && (
              <DashboardHabitStats habits={habits} completions={completions} />
            )}
          </div>

          {/* RIGHT — Expenses */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Today's Expenses</CardTitle>
              </CardHeader>
              <CardContent>
                {todayExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {todayExpenses.slice(0, 5).map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground truncate max-w-[60%]">
                          {e.note || e.category}
                        </span>
                        <span className="font-medium tabular-nums">{formatAmount(e.amount)}</span>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground pt-1">
                      Total: {formatAmount(todayTotal)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No expenses logged today.</p>
                )}
              </CardContent>
            </Card>

            {expenses && <DashboardExpenseCharts expenses={expenses} month={today} />}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
