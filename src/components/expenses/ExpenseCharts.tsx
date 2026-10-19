import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  eachDayOfInterval, startOfMonth, endOfMonth,
  format, isBefore,
} from "date-fns";
import { Expense } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { CategoryBreakdownCard } from "@/components/expenses/CategoryBreakdownCard";

interface Props {
  expenses: Expense[];
  month: Date;
}

/* ─── Custom bar tooltip ─────────────────────────────────────────────── */
function DailyTooltip({ active, payload, label, formatAmount }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">Day {label}</p>
      <p className="text-sm font-black text-foreground tabular-nums">{formatAmount(payload[0].value)}</p>
    </div>
  );
}

/* ─── Custom bar shape with rounded top only ─────────────────────────── */
function RoundedBar(props: any) {
  const { x, y, width, height, fill } = props;
  if (!height) return null;
  const r = Math.min(4, width / 2);
  return (
    <path
      d={`M${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} L${x},${y + height} Z`}
      fill={fill}
    />
  );
}

export function ExpenseCharts({ expenses, month }: Props) {
  const { formatAmount } = useCurrency();

  const dailyData = useMemo(() => {
    const start = startOfMonth(month);
    const end = isBefore(endOfMonth(month), new Date()) ? endOfMonth(month) : new Date();
    const days = eachDayOfInterval({ start, end });
    const dayTotals: Record<string, number> = {};
    expenses.forEach((e) => { dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount; });
    return days.map((d) => ({
      day: format(d, "d"),
      amount: dayTotals[format(d, "yyyy-MM-dd")] || 0,
    }));
  }, [expenses, month]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* ── Category breakdown ───────────────────────────────────────── */}
      <CategoryBreakdownCard expenses={expenses} />

      {/* ── Daily spending ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Activity</p>
            <p className="text-base font-black tracking-tight leading-tight">Daily Spending</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{format(month, "MMM yyyy")}</p>
            <p className="text-sm font-bold text-foreground">{formatAmount(total)}</p>
          </div>
        </div>

        {dailyData.some((d) => d.amount > 0) ? (
          <div className="p-4 h-[172px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} barCategoryGap="30%">
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} strokeDasharray="3 3" />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", radius: 6 }}
                  content={(props) => <DailyTooltip {...props} formatAmount={formatAmount} />}
                />
                <Bar
                  dataKey="amount"
                  fill="url(#barGrad)"
                  shape={<RoundedBar />}
                  activeBar={<RoundedBar fill="hsl(var(--primary))" />}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[160px]">
            <p className="text-xs text-muted-foreground">No data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
