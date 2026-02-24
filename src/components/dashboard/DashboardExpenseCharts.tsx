import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  startOfWeek, endOfWeek, eachDayOfInterval, format, parseISO,
  startOfMonth, endOfMonth, isBefore, isWithinInterval,
} from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Expense, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";

interface Props {
  expenses: Expense[];
  month: Date;
}

export function DashboardExpenseCharts({ expenses, month }: Props) {
  const { formatAmount } = useCurrency();
  const today = new Date();

  // --- This week's daily spending ---
  const weekData = useMemo(() => {
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: isBefore(weekEnd, today) ? weekEnd : today });
    const dayTotals: Record<string, number> = {};
    expenses.forEach((e) => {
      const d = parseISO(e.date);
      if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
        dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount;
      }
    });
    return days.map((d) => ({
      day: format(d, "EEE"),
      amount: dayTotals[format(d, "yyyy-MM-dd")] || 0,
    }));
  }, [expenses, today]);

  const weekTotal = weekData.reduce((s, d) => s + d.amount, 0);

  // --- This month's category breakdown ---
  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    });
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Weekly bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>This Week</span>
            <span className="text-xs text-muted-foreground font-normal">{formatAmount(weekTotal)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weekData.length > 0 ? (
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData}>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <YAxis hide />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border border-border bg-popover px-3 py-1.5 text-xs shadow-md">
                          <span className="font-medium">{formatAmount(payload[0].value as number)}</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No spending this week</p>
          )}
        </CardContent>
      </Card>

      {/* Monthly category pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <span>{format(month, "MMMM")} by Category</span>
            <span className="text-xs text-muted-foreground font-normal">{formatAmount(monthTotal)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          {categoryData.length > 0 ? (
            <>
              <div className="w-[120px] h-[120px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="hsl(var(--card))"
                    >
                      {categoryData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={CATEGORY_COLORS[entry.name as ExpenseCategory] || CATEGORY_COLORS.Other}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1">
                {categoryData.slice(0, 5).map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[cat.name as ExpenseCategory] || CATEGORY_COLORS.Other }}
                      />
                      <span className="text-muted-foreground text-xs">{cat.name}</span>
                    </div>
                    <span className="font-medium text-xs tabular-nums">{formatAmount(cat.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center w-full">No expenses this month</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
