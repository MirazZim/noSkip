import { useMemo } from "react";
import { format, subDays, eachDayOfInterval, getDay } from "date-fns";
import { HabitCompletion } from "@/hooks/useHabits";
import { cn } from "@/lib/utils";

interface Props {
  habitId: string;
  completions: HabitCompletion[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function StreakGrid({ habitId, completions }: Props) {
  const { grid, monthLabels } = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 364);
    const days = eachDayOfInterval({ start, end: today });

    const completedSet = new Set(
      completions.filter((c) => c.habit_id === habitId).map((c) => c.date)
    );
    const retroSet = new Set(
      completions.filter((c) => c.habit_id === habitId && c.is_retroactive).map((c) => c.date)
    );

    // Build weeks (columns), each week has 7 rows (Sun=0..Sat=6 → reorder to Mon=0)
    const weeks: { date: string; done: boolean; retro: boolean; future: boolean }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    // Pad first week
    const firstDow = (getDay(start) + 6) % 7; // Mon=0
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ date: "", done: false, retro: false, future: false });
    }

    days.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      currentWeek.push({
        date: dateStr,
        done: completedSet.has(dateStr),
        retro: retroSet.has(dateStr),
        future: false,
      });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push({ date: "", done: false, retro: false, future: true });
      weeks.push(currentWeek);
    }

    // Month labels
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstValid = week.find((d) => d.date);
      if (firstValid?.date) {
        const m = parseInt(firstValid.date.substring(5, 7)) - 1;
        if (m !== lastMonth) {
          labels.push({ label: MONTHS[m], col: i });
          lastMonth = m;
        }
      }
    });

    return { grid: weeks, monthLabels: labels };
  }, [habitId, completions]);

  const cellSize = 11;
  const gap = 2;
  const colWidth = cellSize + gap;

  return (
    <div className="overflow-x-auto">
      {/* Month labels */}
      <div className="relative mb-1" style={{ height: 14 }}>
        {monthLabels.map((m, i) => (
          <span
            key={i}
            className="text-[10px] text-muted-foreground absolute"
            style={{ left: `${m.col * colWidth}px` }}
          >
            {m.label}
          </span>
        ))}
      </div>
      {/* Grid */}
      <div className="flex gap-[2px]">
        {grid.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {week.map((day, di) => (
              <div
                key={di}
                title={day.date || undefined}
                className={cn(
                  "h-[11px] w-[11px] rounded-[2px] transition-colors",
                  !day.date && "bg-transparent",
                  day.date && !day.done && "bg-muted/60",
                  day.date && day.done && !day.retro && "bg-primary",
                  day.date && day.done && day.retro && "bg-primary/60 ring-1 ring-primary/30"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
