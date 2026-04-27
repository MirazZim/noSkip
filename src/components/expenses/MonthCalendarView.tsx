import { useMemo } from "react";
import {
  startOfMonth, endOfMonth, eachDayOfInterval,
  format, getDay, isToday, isFuture,
} from "date-fns";
import { Expense, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { Income } from "@/hooks/useIncomes";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useCurrency } from "@/hooks/useCurrency";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
  incomes: Income[];
  month: Date;
  onMonthChange: (month: Date) => void;
  onDayClick?: (date: string) => void;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthCalendarView({ expenses, incomes, month, onMonthChange, onDayClick }: Props) {
  const { formatAmount } = useCurrency();
  const { data: customCategories = [] } = useCustomCategories();

  function resolveColor(category: string): string {
    return (
      CATEGORY_COLORS[category as ExpenseCategory] ??
      customCategories.find((c) => c.name === category)?.color ??
      CATEGORY_COLORS.Other
    );
  }

  const { days, leadingBlanks, dayExpenseMap, dayIncomeMap } = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const allDays = eachDayOfInterval({ start, end });
    const firstDow = (getDay(start) + 6) % 7;

    const expenseMap: Record<string, { total: number; categories: Record<string, number> }> = {};
    expenses.forEach((e) => {
      if (!expenseMap[e.date]) expenseMap[e.date] = { total: 0, categories: {} };
      expenseMap[e.date].total += e.amount;
      expenseMap[e.date].categories[e.category] =
        (expenseMap[e.date].categories[e.category] || 0) + e.amount;
    });

    const incomeMap: Record<string, number> = {};
    incomes.forEach((i) => {
      incomeMap[i.date] = (incomeMap[i.date] || 0) + i.amount;
    });

    return { days: allDays, leadingBlanks: firstDow, dayExpenseMap: expenseMap, dayIncomeMap: incomeMap };
  }, [expenses, incomes, month]);

  function getSortedCategories(categories: Record<string, number>) {
    return Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">

      {/* ── Header ── */}
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
            const incomeAmount = dayIncomeMap[dateStr];
            const today = isToday(day);
            const future = isFuture(day);
            const isWeekend = idx % 7 >= 5;

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
                }}
                className={cn(
                  "group relative flex flex-col items-center rounded-xl transition-all duration-150",
                  "min-h-[52px] sm:min-h-[60px] pt-2 pb-1 px-0.5",
                  !future && !today && "hover:ring-1 hover:ring-border",
                  future && "opacity-30 cursor-default",
                  !data && !future && !today && "hover:bg-muted/50",
                )}
              >
                {/* ── Income: green line pinned to the very top of the cell ── */}
                {incomeAmount && !future && (
                  <div
                    className="absolute top-0 left-1 right-1 h-[3px] rounded-full"
                    style={{ backgroundColor: "hsl(142 71% 45%)" }}
                    title={`Income: ${formatAmount(incomeAmount)}`}
                  />
                )}

                {/* ── Today: red circle behind the date number ── */}
                <span className="relative flex items-center justify-center w-6 h-6">
                  {today && (
                    <span className="absolute inset-0 rounded-full bg-red-500" />
                  )}
                  <span
                    className={cn(
                      "relative z-10 text-[11px] tabular-nums font-bold leading-none",
                      today
                        ? "text-white"
                        : isWeekend && !data
                          ? "text-muted-foreground/50"
                          : "text-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </span>

                {data ? (
                  <>
                    <span
                      className={cn(
                        "text-[9px] sm:text-[10px] font-black tabular-nums mt-0.5 leading-none",
                        today ? "text-red-500" : "text-foreground/80"
                      )}
                    >
                      {formatAmount(data.total)}
                    </span>

                    {/* Stacked expense category bar — bottom */}
                    <div className="flex w-full mt-1.5 rounded-full overflow-hidden h-[3px] gap-[1px]">
                      {sortedCats.map(([cat, val]) => {
                        const pct = (val / totalForBar) * 100;
                        return (
                          <div
                            key={cat}
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: resolveColor(cat),
                            }}
                          />
                        );
                      })}
                    </div>
                  </>
                ) : !future ? (
                  <div className="mt-1.5 h-[3px] w-4 rounded-full bg-border/40" />
                ) : null}

                {/* Hover tooltip */}
                {(data || incomeAmount) && !future && (
                  <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
                    <div className="whitespace-nowrap rounded-lg border border-border/60 bg-popover px-2.5 py-1.5 shadow-lg">
                      {incomeAmount && (
                        <p className="text-[11px] font-semibold" style={{ color: "hsl(142 71% 45%)" }}>
                          ＋{formatAmount(incomeAmount)}
                        </p>
                      )}
                      {data && (
                        <p className="text-[11px] font-bold text-foreground">
                          {formatAmount(data.total)}
                        </p>
                      )}
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

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <div className="h-[3px] w-4 rounded-full" style={{ backgroundColor: "hsl(142 71% 45%)" }} />
          <span className="text-[10px] text-muted-foreground">Income</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-[3px] w-4 rounded-full bg-primary/60" />
          <span className="text-[10px] text-muted-foreground">Expense</span>
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