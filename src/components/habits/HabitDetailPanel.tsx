import { useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, subDays, addMonths, subMonths } from "date-fns";
import { Flame, Trophy, Check, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Habit, HabitCompletion, calculateStreak, longestStreak } from "@/hooks/useHabits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HabitDetailPanel({ habit, completions }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date());
  const streak = calculateStreak(completions, habit.id, habit.start_date);
  const best = longestStreak(completions, habit.id);
  const totalDone = completions.filter((c) => c.habit_id === habit.id).length;

  // Build calendar for viewMonth
  const { calendarWeeks, completedDates, streakRanges } = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const completed = new Set(
      completions.filter((c) => c.habit_id === habit.id).map((c) => c.date)
    );

    // Build weeks grid
    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];

    // Pad start (Mon=0)
    const firstDow = (getDay(monthStart) + 6) % 7;
    for (let i = 0; i < firstDow; i++) currentWeek.push(null);

    days.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    // Calculate streak ranges for visual connected blocks
    const sortedDates = completions
      .filter((c) => c.habit_id === habit.id)
      .map((c) => c.date)
      .sort();

    const ranges: { start: string; end: string }[] = [];
    let rangeStart: string | null = null;
    let rangePrev: string | null = null;

    sortedDates.forEach((d) => {
      if (!rangeStart) {
        rangeStart = d;
        rangePrev = d;
      } else {
        const prev = new Date(rangePrev!);
        const curr = new Date(d);
        const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          rangePrev = d;
        } else {
          ranges.push({ start: rangeStart, end: rangePrev! });
          rangeStart = d;
          rangePrev = d;
        }
      }
    });
    if (rangeStart) ranges.push({ start: rangeStart, end: rangePrev! });

    return { calendarWeeks: weeks, completedDates: completed, streakRanges: ranges };
  }, [viewMonth, habit.id, completions]);

  const today = format(new Date(), "yyyy-MM-dd");

  // Check if a date is part of a streak and its position
  const getStreakPosition = (dateStr: string) => {
    for (const range of streakRanges) {
      if (dateStr >= range.start && dateStr <= range.end) {
        const isStart = dateStr === range.start;
        const isEnd = dateStr === range.end;
        const isSingle = isStart && isEnd;
        return { inStreak: true, isStart, isEnd, isSingle };
      }
    }
    return { inStreak: false, isStart: false, isEnd: false, isSingle: false };
  };

  // Calculate monthly completion rate
  const monthDays = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const pastDays = monthDays.filter((d) => format(d, "yyyy-MM-dd") <= today);
  const monthCompletions = pastDays.filter((d) => completedDates.has(format(d, "yyyy-MM-dd"))).length;
  const monthRate = pastDays.length > 0 ? Math.round((monthCompletions / pastDays.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <span className="text-3xl">{habit.emoji}</span>
        <h2 className="font-bold font-display text-lg mt-1">{habit.name}</h2>
        <p className="text-xs text-muted-foreground capitalize">
          {habit.frequency_type}
          {habit.preferred_time && ` at ${new Date(`2000-01-01T${habit.preferred_time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <Flame className="h-4 w-4 text-destructive mx-auto mb-1" />
          <p className="text-lg font-bold">{streak}</p>
          <p className="text-[10px] text-muted-foreground">Current Streak</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <Trophy className="h-4 w-4 text-accent mx-auto mb-1" />
          <p className="text-lg font-bold">{best}</p>
          <p className="text-[10px] text-muted-foreground">Best Streak</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <Check className="h-4 w-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-bold">{totalDone}</p>
          <p className="text-[10px] text-muted-foreground">Total Done</p>
        </div>
      </div>

      {/* Monthly Calendar */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMonth((m) => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-semibold text-sm">{format(viewMonth, "MMMM yyyy")}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-0 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-[10px] text-muted-foreground text-center font-medium py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="space-y-0.5">
          {calendarWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-0">
              {week.map((day, di) => {
                if (!day) return <div key={di} className="h-8" />;
                const dateStr = format(day, "yyyy-MM-dd");
                const isCompleted = completedDates.has(dateStr);
                const isToday = dateStr === today;
                const { inStreak, isStart, isEnd, isSingle } = getStreakPosition(dateStr);

                return (
                  <div key={di} className="relative h-8 flex items-center justify-center">
                    {/* Streak connector background */}
                    {inStreak && !isSingle && (
                      <div
                        className={cn(
                          "absolute inset-y-1 bg-primary/20",
                          isStart && "left-1/2 right-0 rounded-l-full",
                          isEnd && "left-0 right-1/2 rounded-r-full",
                          !isStart && !isEnd && "left-0 right-0"
                        )}
                      />
                    )}
                    {/* Day circle */}
                    <span
                      className={cn(
                        "relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                        !isCompleted && !isToday && "text-foreground",
                        isCompleted && "bg-primary text-primary-foreground",
                        isToday && !isCompleted && "ring-1 ring-primary text-primary font-bold"
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Monthly rate */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">Monthly completion</span>
          <span className="text-sm font-bold">{monthRate}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${monthRate}%` }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {monthCompletions} of {pastDays.length} days completed this month
        </p>
      </div>
    </div>
  );
}
