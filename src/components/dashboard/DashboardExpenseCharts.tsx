import { useMemo } from "react";
import { addDays, format, isAfter, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
import { CalendarRange } from "lucide-react";
import { Expense } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { SectionHeader, Widget } from "@/components/dashboard/Widget";
import { CategoryBreakdownCard } from "@/components/expenses/CategoryBreakdownCard";

interface Props {
  expenses: Expense[];
  month: Date;
  delay?: number;
}

const compactNumber = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// Two medium widgets; the parent grid decides where they sit.
export function DashboardExpenseCharts({ expenses, delay = 0 }: Props) {
  const { formatAmount, symbol } = useCurrency();

  // Mon–Sun of the current week. Days before the 1st of the month read as 0,
  // since the dashboard only loads the current month.
  const week = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const totals: Record<string, number> = {};
    expenses.forEach((e) => { totals[e.date] = (totals[e.date] || 0) + e.amount; });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const key = format(d, "yyyy-MM-dd");
      return {
        key,
        letter: format(d, "EEEEE"),
        name: format(d, "EEE"),
        date: format(d, "d"),
        amount: totals[key] || 0,
        isToday: isSameDay(d, today),
        future: isAfter(startOfDay(d), startOfDay(today)),
      };
    });
  }, [expenses]);

  const past = week.filter((d) => !d.future);
  const weekTotal = past.reduce((s, d) => s + d.amount, 0);
  const avg = past.length ? weekTotal / past.length : 0;
  const max = Math.max(...week.map((d) => d.amount), 1);
  const peak = past.reduce<(typeof week)[number] | null>((p, d) => (d.amount > 0 && (!p || d.amount > p.amount) ? d : p), null);
  const noSpendDays = past.filter((d) => d.amount === 0 && !d.isToday).length;
  const compact = (n: number) => `${symbol}${compactNumber.format(n)}`;

  return (
    <>
      {/* ── This week: capsule chart ─────────────────────────────────────── */}
      <Widget className="col-span-2" delay={delay}>
        <SectionHeader
          icon={<CalendarRange />}
          title="This Week"
          subtitle={`${format(parseISO(week[0].key), "MMM d")} – ${format(parseISO(week[6].key), "MMM d")}`}
          right={
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Daily avg</p>
              <p className="text-[13px] font-semibold tabular-nums">{formatAmount(Math.round(avg))}</p>
            </div>
          }
        />
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{formatAmount(weekTotal)}</p>

        {/* Capsules */}
        <div className="relative mt-5 flex h-[112px] items-end gap-2 sm:gap-3">
          {avg > 0 && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/20"
              style={{ bottom: `${(avg / max) * 100}%` }}
              aria-hidden="true"
            >
              <span className="absolute -top-3.5 right-0 text-[9px] font-medium text-muted-foreground">avg</span>
            </div>
          )}
          {week.map((d) => {
            const isPeak = peak?.key === d.key;
            const h = d.amount > 0 ? Math.max((d.amount / max) * 100, 8) : 0;
            return (
              <div key={d.key} className="group relative flex h-full flex-1 items-end justify-center">
                {/* Value bubble: always on the peak, on hover elsewhere */}
                {d.amount > 0 && (
                  <span
                    className={cn(
                      "absolute z-10 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums transition-opacity",
                      isPeak ? "bg-primary text-primary-foreground opacity-100" : "bg-foreground/80 text-background opacity-0 group-hover:opacity-100"
                    )}
                    style={{ bottom: `calc(${h}% + 6px)` }}
                  >
                    {compact(d.amount)}
                  </span>
                )}
                {d.future ? (
                  <div className="h-3 w-full max-w-[28px] rounded-full border border-dashed border-foreground/15" />
                ) : d.amount > 0 ? (
                  <div
                    className={cn(
                      "w-full max-w-[28px] rounded-full transition-all duration-700",
                      d.isToday
                        ? "bg-gradient-to-t from-primary/60 to-primary shadow-lg shadow-primary/25"
                        : isPeak ? "bg-primary/45" : "bg-primary/20 group-hover:bg-primary/35"
                    )}
                    style={{ height: `${h}%` }}
                    title={`${d.name}: ${formatAmount(d.amount)}`}
                  />
                ) : (
                  <div className="mb-0.5 h-1.5 w-1.5 rounded-full bg-foreground/15" title={`${d.name}: no spend`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Day labels, today circled like the iOS calendar */}
        <div className="mt-2 flex gap-2 sm:gap-3">
          {week.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">{d.letter}</span>
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                  d.isToday ? "bg-primary text-primary-foreground" : d.future ? "text-muted-foreground/50" : "text-foreground"
                )}
              >
                {d.date}
              </span>
            </div>
          ))}
        </div>

        {/* Footer stats */}
        <div className="mt-3 grid grid-cols-2 divide-x divide-border/50 rounded-xl bg-foreground/[0.03] py-2 text-center">
          <div className="min-w-0 px-2">
            <p className="text-[10px] text-muted-foreground">Peak day</p>
            <p className="truncate text-[12px] font-semibold tabular-nums">
              {peak ? `${peak.name} · ${formatAmount(peak.amount)}` : "—"}
            </p>
          </div>
          <div className="min-w-0 px-2">
            <p className="text-[10px] text-muted-foreground">No-spend days</p>
            <p className="text-[12px] font-semibold tabular-nums">{noSpendDays} 🌱</p>
          </div>
        </div>
      </Widget>

      {/* ── By Category: same card as Expenses → Overview ────────────────── */}
      <div
        className="col-span-2 animate-in fade-in zoom-in-95 fill-mode-both duration-500"
        style={{ animationDelay: `${delay + 50}ms` }}
      >
        <CategoryBreakdownCard expenses={expenses} className="h-full" />
      </div>
    </>
  );
}
