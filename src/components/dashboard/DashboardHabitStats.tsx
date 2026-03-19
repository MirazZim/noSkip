import { useMemo } from "react";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Trophy, Target, Calendar } from "lucide-react";
import { Habit, HabitCompletion, calculateStreak, longestStreak } from "@/hooks/useHabits";

interface Props {
  habits: Habit[];
  completions: HabitCompletion[];
}

export function DashboardHabitStats({ habits, completions }: Props) {
  const today = format(new Date(), "yyyy-MM-dd");

  const stats = useMemo(() => {
    if (!habits.length) return null;

    const activeHabits = habits.filter((h) => h.is_active);

    // Best current streak across all habits
    let bestCurrentStreak = 0;
    let bestCurrentHabit: Habit | null = null;

    // Best all-time streak across all habits
    let bestAllTimeStreak = 0;
    let bestAllTimeHabit: Habit | null = null;

    activeHabits.forEach((h) => {
      const current = calculateStreak(completions, h.id, h.start_date);
      if (current > bestCurrentStreak) {
        bestCurrentStreak = current;
        bestCurrentHabit = h;
      }
      const allTime = longestStreak(completions, h.id);
      if (allTime > bestAllTimeStreak) {
        bestAllTimeStreak = allTime;
        bestAllTimeHabit = h;
      }
    });

    // 7-day completion rate
    const last7 = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    }).map((d) => format(d, "yyyy-MM-dd"));

    let totalPossible = activeHabits.length * 7;
    let totalDone = 0;
    const completionSet = new Set(completions.map((c) => `${c.habit_id}:${c.date}`));
    activeHabits.forEach((h) => {
      last7.forEach((day) => {
        if (completionSet.has(`${h.id}:${day}`)) totalDone++;
      });
    });
    const weeklyRate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

    // Total completions
    const totalCompletions = completions.length;

    return {
      bestCurrentStreak,
      bestCurrentHabit,
      bestAllTimeStreak,
      bestAllTimeHabit,
      weeklyRate,
      totalCompletions,
    };
  }, [habits, completions]);

  if (!stats) return null;

  const cards = [
    {
      title: "Best Active Streak",
      value: `${stats.bestCurrentStreak}d`,
      sub: stats.bestCurrentHabit
        ? `${(stats.bestCurrentHabit as Habit).emoji} ${(stats.bestCurrentHabit as Habit).name}`
        : "—",
      icon: Flame,
    },
    {
      title: "Longest Ever",
      value: `${stats.bestAllTimeStreak}d`,
      sub: stats.bestAllTimeHabit
        ? `${(stats.bestAllTimeHabit as Habit).emoji} ${(stats.bestAllTimeHabit as Habit).name}`
        : "—",
      icon: Trophy,
    },
    {
      title: "7-Day Rate",
      value: `${stats.weeklyRate}%`,
      sub: "Completion rate",
      icon: Target,
    },
    {
      title: "Total Check-ins",
      value: stats.totalCompletions.toLocaleString(),
      sub: "All time",
      icon: Calendar,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c) => (
        <Card key={c.title}>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{c.title}</p>
                <p className="text-2xl font-bold tabular-nums">{c.value}</p>
                <p className="text-xs text-muted-foreground truncate">{c.sub}</p>
              </div>
              <c.icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
