import { TrendingUp, TrendingDown, Minus, DollarSign, Calendar, BarChart3, Wallet } from "lucide-react";
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } from "date-fns";
import { Expense, Budget } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
  prevExpenses: Expense[];
  budgets: Budget[];
}

interface CardProps {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ReactNode;
  accent: "emerald" | "violet" | "amber" | "rose";
}

const ACCENT_MAP = {
  emerald: {
    iconWrap: "bg-emerald-500/10 text-emerald-500",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
  },
  violet: {
    iconWrap: "bg-violet-500/10 text-violet-500",
    dot: "bg-violet-500",
    ring: "ring-violet-500/20",
  },
  amber: {
    iconWrap: "bg-amber-500/10 text-amber-500",
    dot: "bg-amber-500",
    ring: "ring-amber-500/20",
  },
  rose: {
    iconWrap: "bg-rose-500/10 text-rose-500",
    dot: "bg-rose-500",
    ring: "ring-rose-500/20",
  },
} as const;

function SummaryCard({ label, value, sub, icon, accent }: CardProps) {
  const a = ACCENT_MAP[accent];
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl bg-card border border-border/60 p-4 shadow-sm",
        "ring-1", a.ring,
        "transition-shadow duration-200 hover:shadow-md"
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-none pt-0.5">
          {label}
        </p>
        <span className={cn("flex items-center justify-center rounded-xl p-2", a.iconWrap)}>
          {icon}
        </span>
      </div>

      {/* Value */}
      <div className="flex flex-col gap-1">
        <div className="text-xl sm:text-2xl font-bold font-display leading-none tracking-tight text-foreground">
          {value}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full flex-shrink-0", a.dot)} />
          {sub}
        </div>
      </div>
    </div>
  );
}

export function ExpenseSummaryCards({ expenses, prevExpenses, budgets }: Props) {
  const { formatAmount } = useCurrency();

  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const changePercent = prevTotal
    ? Math.round(((totalSpend - prevTotal) / prevTotal) * 100)
    : 0;

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weeklySpend = expenses
    .filter((e) => {
      const d = parseISO(e.date);
      return isWithinInterval(d, { start: weekStart, end: weekEnd });
    })
    .reduce((s, e) => s + e.amount, 0);

  const dayTotals: Record<string, number> = {};
  expenses.forEach((e) => {
    dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount;
  });
  const highestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

  const overallBudget = budgets.find((b) => b.category === "Overall");
  const budgetProgress =
    overallBudget ? Math.min((totalSpend / overallBudget.amount) * 100, 100) : null;

  const budgetBarColor =
    budgetProgress === null
      ? ""
      : budgetProgress >= 90
      ? "bg-rose-500"
      : budgetProgress >= 70
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Total Spend */}
      <SummaryCard
        label="Total Spend"
        accent="emerald"
        icon={<DollarSign className="h-4 w-4" />}
        value={formatAmount(totalSpend)}
        sub={
          <span className="flex items-center gap-1">
            {changePercent > 0 ? (
              <TrendingUp className="h-3 w-3 text-rose-500" />
            ) : changePercent < 0 ? (
              <TrendingDown className="h-3 w-3 text-emerald-500" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            <span
              className={cn(
                changePercent > 0
                  ? "text-rose-500"
                  : changePercent < 0
                  ? "text-emerald-500"
                  : "text-muted-foreground"
              )}
            >
              {Math.abs(changePercent)}% vs last month
            </span>
          </span>
        }
      />

      {/* This Week */}
      <SummaryCard
        label="This Week"
        accent="violet"
        icon={<Calendar className="h-4 w-4" />}
        value={formatAmount(weeklySpend)}
        sub={`${expenses.length} transaction${expenses.length !== 1 ? "s" : ""}`}
      />

      {/* Highest Day */}
      <SummaryCard
        label="Peak Day"
        accent="amber"
        icon={<BarChart3 className="h-4 w-4" />}
        value={highestDay ? formatAmount(highestDay[1]) : "—"}
        sub={highestDay ? format(parseISO(highestDay[0]), "MMM d") : "No data yet"}
      />

      {/* Budget */}
      <SummaryCard
        label="Budget"
        accent="rose"
        icon={<Wallet className="h-4 w-4" />}
        value={
          overallBudget ? (
            <span>
              {formatAmount(totalSpend)}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                / {formatAmount(overallBudget.amount)}
              </span>
            </span>
          ) : (
            <span className="text-base font-medium text-muted-foreground">Not set</span>
          )
        }
        sub={
          overallBudget && budgetProgress !== null ? (
            <span className="flex items-center gap-2 w-full">
              <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <span
                  className={cn("h-full rounded-full block transition-all duration-500", budgetBarColor)}
                  style={{ width: `${budgetProgress}%` }}
                />
              </span>
              <span>{Math.round(budgetProgress)}%</span>
            </span>
          ) : (
            "Set a budget to track"
          )
        }
      />
    </div>
  );
}