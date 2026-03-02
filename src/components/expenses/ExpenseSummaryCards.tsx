import { TrendingUp, TrendingDown, Minus, DollarSign, Calendar, BarChart3, Wallet, PiggyBank, Scale } from "lucide-react";
import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format } from "date-fns";
import { Expense, Budget } from "@/hooks/useExpenses";
import { Income } from "@/hooks/useIncomes";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
  prevExpenses: Expense[];
  budgets: Budget[];
  incomes: Income[];
  prevIncomes: Income[];
  onBudgetClick?: () => void;
}

interface CardProps {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ReactNode;
  accent: "emerald" | "violet" | "amber" | "rose" | "sky" | "indigo";
  onClick?: () => void;
}

const ACCENT_MAP = {
  emerald: { iconWrap: "bg-emerald-500/10 text-emerald-500", dot: "bg-emerald-500", ring: "ring-emerald-500/20" },
  violet: { iconWrap: "bg-violet-500/10 text-violet-500", dot: "bg-violet-500", ring: "ring-violet-500/20" },
  amber: { iconWrap: "bg-amber-500/10 text-amber-500", dot: "bg-amber-500", ring: "ring-amber-500/20" },
  rose: { iconWrap: "bg-rose-500/10 text-rose-500", dot: "bg-rose-500", ring: "ring-rose-500/20" },
  sky: { iconWrap: "bg-sky-500/10 text-sky-500", dot: "bg-sky-500", ring: "ring-sky-500/20" },
  indigo: { iconWrap: "bg-indigo-500/10 text-indigo-500", dot: "bg-indigo-500", ring: "ring-indigo-500/20" },
} as const;

function SummaryCard({ label, value, sub, icon, accent, onClick }: CardProps) {
  const a = ACCENT_MAP[accent];
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex flex-col gap-3 rounded-2xl bg-card border border-border/60 p-4 shadow-sm",
        "ring-1", a.ring,
        "transition-all duration-200",
        isClickable ? "cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98]" : "hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-none pt-0.5">
          {label}
        </p>
        <span className={cn("flex items-center justify-center rounded-xl p-2", a.iconWrap)}>
          {icon}
        </span>
      </div>
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

export function ExpenseSummaryCards({ expenses, prevExpenses, budgets, incomes, prevIncomes, onBudgetClick }: Props) {
  const { formatAmount } = useCurrency();

  // ── Expenses ──────────────────────────────────────────────────────────────
  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const prevSpend = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const spendChange = prevSpend
    ? Math.round(((totalSpend - prevSpend) / prevSpend) * 100)
    : 0;

  // ── Incomes ───────────────────────────────────────────────────────────────
  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const prevIncome = prevIncomes.reduce((s, i) => s + i.amount, 0);
  const incomeChange = prevIncome
    ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100)
    : 0;

  // ── Net balance ───────────────────────────────────────────────────────────
  const netBalance = totalIncome - totalSpend;
  const isPositive = netBalance >= 0;

  // ── Savings rate ──────────────────────────────────────────────────────────
  const savingsRate = totalIncome > 0
    ? Math.round(((totalIncome - totalSpend) / totalIncome) * 100)
    : null;

  // ── Weekly spend ──────────────────────────────────────────────────────────
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weeklySpend = expenses
    .filter((e) => isWithinInterval(parseISO(e.date), { start: weekStart, end: weekEnd }))
    .reduce((s, e) => s + e.amount, 0);

  // ── Budget ────────────────────────────────────────────────────────────────
  const overallBudget = budgets.find((b) => b.category === "Overall");
  const budgetProgress = overallBudget
    ? Math.min((totalSpend / overallBudget.amount) * 100, 100)
    : null;
  const budgetBarColor =
    budgetProgress === null ? "" :
      budgetProgress >= 90 ? "bg-rose-500" :
        budgetProgress >= 70 ? "bg-amber-500" :
          "bg-emerald-500";

  // ── Peak day ──────────────────────────────────────────────────────────────
  const dayTotals: Record<string, number> = {};
  expenses.forEach((e) => { dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount; });
  const highestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-3 sm:space-y-4">

      {/* ── Row 1: The money picture — Income / Spend / Net ─────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">

        {/* Total Income */}
        <SummaryCard
          label="Total Income"
          accent="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
          value={formatAmount(totalIncome)}
          sub={
            <span className="flex items-center gap-1">
              {incomeChange > 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : incomeChange < 0 ? (
                <TrendingDown className="h-3 w-3 text-rose-500" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span className={cn(
                incomeChange > 0 ? "text-emerald-500" :
                  incomeChange < 0 ? "text-rose-500" :
                    "text-muted-foreground"
              )}>
                {Math.abs(incomeChange)}% vs last month
              </span>
            </span>
          }
        />

        {/* Total Spend */}
        <SummaryCard
          label="Total Spend"
          accent="rose"
          icon={<DollarSign className="h-4 w-4" />}
          value={formatAmount(totalSpend)}
          sub={
            <span className="flex items-center gap-1">
              {spendChange > 0 ? (
                <TrendingUp className="h-3 w-3 text-rose-500" />
              ) : spendChange < 0 ? (
                <TrendingDown className="h-3 w-3 text-emerald-500" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span className={cn(
                spendChange > 0 ? "text-rose-500" :
                  spendChange < 0 ? "text-emerald-500" :
                    "text-muted-foreground"
              )}>
                {Math.abs(spendChange)}% vs last month
              </span>
            </span>
          }
        />

        {/* Net Balance */}
        <SummaryCard
          label="Net Balance"
          accent={isPositive ? "sky" : "amber"}
          icon={<Scale className="h-4 w-4" />}
          value={
            <span className={cn("font-bold", isPositive ? "text-sky-500" : "text-amber-500")}>
              {isPositive ? "+" : ""}{formatAmount(netBalance)}
            </span>
          }
          sub={
            totalIncome === 0
              ? "Log income to see balance"
              : isPositive
                ? "You're in the green this month"
                : "Spending exceeds income"
          }
        />
      </div>

      {/* ── Row 2: Savings Rate + Weekly + Peak Day + Budget ─────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

        {/* Savings Rate */}
        <SummaryCard
          label="Savings Rate"
          accent="indigo"
          icon={<PiggyBank className="h-4 w-4" />}
          value={
            savingsRate !== null ? (
              <span className={cn(
                savingsRate >= 20 ? "text-emerald-500" :
                  savingsRate >= 0 ? "text-amber-500" :
                    "text-rose-500"
              )}>
                {savingsRate}%
              </span>
            ) : (
              <span className="text-base font-medium text-muted-foreground">—</span>
            )
          }
          sub={
            savingsRate === null ? "Add income to calculate" :
              savingsRate >= 20 ? "Great savings habit 🎉" :
                savingsRate >= 0 ? "Try to reach 20%" :
                  "Spending more than earning"
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

        {/* Peak Day */}
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
          onClick={onBudgetClick}
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
              "Click to set a budget"
            )
          }
        />
      </div>
    </div>
  );
}