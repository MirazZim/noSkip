import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, getDay, isToday, isFuture,
} from "date-fns";
import { Expense, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useCurrency } from "@/hooks/useCurrency";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onDayClick?: (date: string) => void;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthCalendarView({ expenses, month, onMonthChange, onDayClick }: Props) {
  const { formatAmount } = useCurrency();
  const { data: customCategories = [] } = useCustomCategories();

  function resolveColor(category: string): string {
    return (
      CATEGORY_COLORS[category as ExpenseCategory] ??
      customCategories.find((c) => c.name === category)?.color ??
      CATEGORY_COLORS.Other
    );
  }

  const { days, leadingBlanks, dayExpenseMap } = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const allDays = eachDayOfInterval({ start, end });
    const firstDow = (getDay(start) + 6) % 7;

    const map: Record<string, { total: number; categories: Record<string, number> }> = {};
    expenses.forEach((e) => {
      if (!map[e.date]) map[e.date] = { total: 0, categories: {} };
      map[e.date].total += e.amount;
      map[e.date].categories[e.category] =
        (map[e.date].categories[e.category] || 0) + e.amount;
    });

    return { days: allDays, leadingBlanks: firstDow, dayExpenseMap: map };
  }, [expenses, month]);

  const maxDayTotal = useMemo(() => {
    return Math.max(1, ...Object.values(dayExpenseMap).map((d) => d.total));
  }, [dayExpenseMap]);

  function getSortedCategories(categories: Record<string, number>) {
    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">

      {/* ── Header with MonthPicker ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Overview
          </p>
          <p className="text-base font-black tracking-tight text-foreground leading-tight">
            {format(month, "MMMM yyyy")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Heat map legend */}
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Low</span>
            {[0.15, 0.35, 0.55, 0.75, 1].map((op, i) => (
              <div
                key={i}
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: `hsl(var(--primary) / ${op})` }}
              />
            ))}
            <span className="text-[10px] text-muted-foreground">High</span>
          </div>

          {/* Month picker */}
          <MonthPicker month={month} onChange={onMonthChange} />
        </div>
      </div>

      <div className="p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {days.map((day, idx) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const data = dayExpenseMap[dateStr];
            const today = isToday(day);
            const future = isFuture(day);
            const intensity = data ? Math.min(data.total / maxDayTotal, 1) : 0;
            const isWeekend = idx % 7 >= 5;

            const topCategory = data
              ? Object.entries(data.categories).sort((a, b) => b[1] - a[1])[0]?.[0]
              : null;
            const topColor = topCategory ? resolveColor(topCategory) : null;

            const sortedCats = data ? getSortedCategories(data.categories) : [];
            const totalForBar = sortedCats.reduce((s, [, v]) => s + v, 0);

            return (
              <button
                key={dateStr}
                onClick={() => !future && onDayClick?.(dateStr)}
                disabled={future}
                style={{
                  animation: "calFadeIn 0.25s ease both",
                  animationDelay: `${(leadingBlanks + idx) * 12}ms`,
                  ...(data && !today
                    ? {
                      backgroundColor: `${topColor}${Math.round(intensity * 28 + 8)
                        .toString(16)
                        .padStart(2, "0")}`,
                    }
                    : {}),
                }}
                className={cn(
                  "group relative flex flex-col items-center rounded-xl transition-all duration-150",
                  "min-h-[52px] sm:min-h-[60px] pt-2 pb-1 px-0.5",
                  !future && !today && "hover:ring-1 hover:ring-border",
                  today && "bg-foreground text-background ring-0",
                  future && "opacity-30 cursor-default",
                  !data && !future && !today && "hover:bg-muted/50",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] tabular-nums font-bold leading-none",
                    today
                      ? "text-background"
                      : isWeekend && !data
                        ? "text-muted-foreground/50"
                        : "text-foreground"
                  )}
                >
                  {format(day, "d")}
                </span>

                {data ? (
                  <>
                    <span
                      className={cn(
                        "text-[9px] sm:text-[10px] font-black tabular-nums mt-1 leading-none",
                        today ? "text-background/80" : "text-foreground/80"
                      )}
                    >
                      {formatAmount(data.total)}
                    </span>

                    {/* Stacked category color bar */}
                    <div className="flex w-full mt-1.5 rounded-full overflow-hidden h-[3px] gap-[1px]">
                      {sortedCats.map(([cat, val]) => {
                        const pct = (val / totalForBar) * 100;
                        return (
                          <div
                            key={cat}
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: today ? "rgba(255,255,255,0.5)" : resolveColor(cat),
                            }}
                          />
                        );
                      })}
                    </div>
                  </>
                ) : !future ? (
                  <div className={cn("mt-1.5 h-[3px] w-4 rounded-full", today ? "bg-background/20" : "bg-border/40")} />
                ) : null}

                {/* Hover tooltip */}
                {data && !future && (
                  <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                    <div className="whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 shadow-lg">
                      <p className="text-[11px] font-bold text-foreground">{formatAmount(data.total)}</p>
                      <p className="text-[10px] text-muted-foreground">{format(day, "MMM d")}</p>
                    </div>
                    <div className="mx-auto h-1.5 w-1.5 -mt-px rotate-45 border-b border-r border-border/60 bg-popover" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes calFadeIn {
          from { opacity: 0; transform: scale(0.88); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
