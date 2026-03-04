import { useState } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { AddIncomeDialog } from "@/components/expenses/AddIncomeDialog";
import { AddLoanDialog } from "@/components/expenses/AddLoanDialog";
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog";
import { EditIncomeDialog } from "@/components/expenses/EditIncomeDialog";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { LoanList } from "@/components/expenses/LoanList";
import type { Expense } from "@/hooks/useExpenses";
import type { Income } from "@/hooks/useIncomes";
import { ExpenseSummaryCards } from "@/components/expenses/ExpenseSummaryCards";
import { ExpenseCharts } from "@/components/expenses/ExpenseCharts";
import { BudgetManager } from "@/components/expenses/BudgetManager";
import { MonthCalendarView } from "@/components/expenses/MonthCalendarView";
import { MedievalQuote } from "@/components/expenses/MedievalQuote";
import { DayDetailView } from "@/components/expenses/DayDetailView";
import { useExpenses, usePrevMonthExpenses, useBudgets } from "@/hooks/useExpenses";
import { useIncomes, usePrevMonthIncomes } from "@/hooks/useIncomes";
import { useLoans } from "@/hooks/useLoans";
import { IncomeList } from "@/components/expenses/IncomeList";
import { Skeleton } from "@/components/ui/skeleton";
import { List, CalendarDays, LayoutGrid, ChevronLeft, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "transactions" | "calendar" | "overview" | "loans";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "transactions", label: "Transactions", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "loans", label: "Loans", icon: HandCoins },
];

export default function Expenses() {
  const [month, setMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [addDialogDate, setAddDialogDate] = useState<string | undefined>();
  const [addIncomeDialogDate, setAddIncomeDialogDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [txDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);

  const { data: expenses, isLoading } = useExpenses(month);
  const { data: prevExpenses } = usePrevMonthExpenses(month);
  const { data: budgets } = useBudgets(month);
  const { data: incomes } = useIncomes(month);
  const { data: prevIncomes } = usePrevMonthIncomes(month);
  const { data: loans } = useLoans();
  const [txType, setTxType] = useState<"expenses" | "income">("expenses");

  const allExpenses = expenses || [];
  const allPrev = prevExpenses || [];
  const allBudgets = budgets || [];
  const allIncomes = incomes || [];
  const allPrevIncomes = prevIncomes || [];
  const allLoans = loans || [];

  // Active (unpaid) loan counts for badge
  const activeLoans = allLoans.filter((l) => !l.is_paid).length;

  const txExpenses = allExpenses.filter((e) => e.date === txDate);
  const txIncomes = allIncomes.filter((i) => i.date === txDate);

  const handleDayClick = (date: string) => setSelectedDay(date);
  const handleAddFromDay = (date: string) => { setAddDialogDate(date); };
  const handleAddIncomeFromDay = (date: string) => { setAddIncomeDialogDate(date); };
  const switchTab = (tab: Tab) => { setActiveTab(tab); setSelectedDay(null); };
  const handleEditExpense = (expense: Expense) => setEditingExpense(expense);
  const handleEditIncome = (income: Income) => setEditingIncome(income);

  /* ── Skeleton ──────────────────────────────────────────────────────── */
  if (isLoading) return (
    <AppLayout>
      <div className="space-y-5 pb-28 sm:pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-3 w-16 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-xl" />
          </div>
          <Skeleton className="h-9 w-28 rounded-2xl" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout>
      <div className="space-y-5 pb-32 sm:pb-24 w-full overflow-x-hidden" style={{ animation: "expIn 0.3s ease both" }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Finance</p>
            <h1 className="text-2xl font-black font-display tracking-tight">Expenses</h1>
          </div>

          <div className="header-actions flex items-center gap-1.5 sm:gap-2 flex-nowrap min-w-0 max-w-full overflow-hidden">
            <BudgetManager
              budgets={allBudgets}
              expenses={allExpenses}
              month={month}
              open={budgetDialogOpen}
              onOpenChange={setBudgetDialogOpen}
            />

            <div className="hidden sm:block h-5 w-px bg-border/60 shrink-0" />

            <AddIncomeDialog
              defaultDate={activeTab === "transactions" ? addIncomeDialogDate : undefined}
              onDateUsed={() => setAddIncomeDialogDate(undefined)}
            />
          </div>
        </div>

        {/* ── Quote ────────────────────────────────────────────────────── */}
        <div style={{ animation: "expIn 0.35s ease both", animationDelay: "30ms" }}>
          <MedievalQuote />
        </div>

        {/* ── Desktop tab bar ───────────────────────────────────────────── */}
        <div
          className="hidden sm:flex gap-1 rounded-2xl bg-muted/60 border border-border/40 p-1"
          style={{ animation: "expIn 0.35s ease both", animationDelay: "50ms" }}
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 relative",
                activeTab === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
              {/* Badge for active loans */}
              {id === "loans" && activeLoans > 0 && (
                <span className={cn(
                  "text-[9px] font-black px-1.5 py-0.5 rounded-full tabular-nums",
                  activeTab === "loans"
                    ? "bg-muted text-foreground"
                    : "bg-rose-500 text-white"
                )}>
                  {activeLoans}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB: TRANSACTIONS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "transactions" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>

            {/* Inner type toggle */}
            <div className="flex gap-1 rounded-2xl bg-muted/50 border border-border/40 p-1">
              <button
                onClick={() => setTxType("expenses")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200",
                  txType === "expenses"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>💸</span>
                <span>Expenses</span>
                {txExpenses.length > 0 && (
                  <span className={cn(
                    "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-bold",
                    txType === "expenses" ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
                  )}>
                    {txExpenses.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTxType("income")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200",
                  txType === "income"
                    ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>💰</span>
                <span>Income</span>
                {txIncomes.length > 0 && (
                  <span className={cn(
                    "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-bold",
                    txType === "income" ? "bg-white/20 text-white" : "bg-muted/60 text-muted-foreground"
                  )}>
                    {txIncomes.length}
                  </span>
                )}
              </button>
            </div>

            {txType === "expenses" && (
              txExpenses.length > 0 ? (
                <ExpenseList expenses={txExpenses} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 py-16 text-center">
                  <div className="text-4xl">🧾</div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold tracking-tight">No expenses today</p>
                    <p className="text-xs text-muted-foreground">
                      Nothing logged for {format(new Date(txDate + "T12:00:00"), "EEEE, MMM d")}
                    </p>
                  </div>
                </div>
              )
            )}

            {txType === "income" && (
              txIncomes.length > 0 ? (
                <IncomeList incomes={txIncomes} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 py-16 text-center">
                  <div className="text-4xl">💰</div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold tracking-tight">No income today</p>
                    <p className="text-xs text-muted-foreground">Tap Income in the header to log some</p>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: CALENDAR
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "calendar" && !selectedDay && (
          <div style={{ animation: "expIn 0.28s ease both" }}>
            <MonthCalendarView
              expenses={allExpenses}
              incomes={allIncomes}
              month={month}
              onMonthChange={setMonth}
              onDayClick={handleDayClick}
            />
          </div>
        )}

        {activeTab === "calendar" && selectedDay && (
          <div style={{ animation: "expIn 0.28s ease both" }}>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors rounded-xl px-3 py-1.5 bg-muted hover:bg-muted/80"
              >
                <ChevronLeft className="h-4 w-4" />
                Calendar
              </button>
              <p className="text-sm font-bold text-foreground">
                {format(new Date(selectedDay + "T12:00:00"), "EEEE, MMMM d")}
              </p>
            </div>
            <DayDetailView
              date={selectedDay}
              expenses={allExpenses}
              incomes={allIncomes}
              onBack={() => setSelectedDay(null)}
              onAddExpense={handleAddFromDay}
              onAddIncome={handleAddIncomeFromDay}
              onEditExpense={handleEditExpense}
              onEditIncome={handleEditIncome}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-5" style={{ animation: "expIn 0.28s ease both" }}>
            <ExpenseSummaryCards
              expenses={allExpenses}
              prevExpenses={allPrev}
              budgets={allBudgets}
              incomes={allIncomes}
              prevIncomes={allPrevIncomes}
              onBudgetClick={() => setBudgetDialogOpen(true)}
            />
            {allBudgets.filter((b) => b.category !== "Overall").length > 0 && (
              <BudgetManager
                budgets={allBudgets}
                expenses={allExpenses}
                month={month}
                open={budgetDialogOpen}
                onOpenChange={setBudgetDialogOpen}
              />
            )}
            <ExpenseCharts expenses={allExpenses} month={month} />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            TAB: LOANS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "loans" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {activeLoans > 0 ? `${activeLoans} active loan${activeLoans > 1 ? "s" : ""}` : "All settled"}
              </p>
              <AddLoanDialog />
            </div>
            <LoanList loans={allLoans} />
          </div>
        )}
      </div>

      {/* DESKTOP FAB — only on transactions tab */}
      {activeTab === "transactions" && !selectedDay && (
        <div
          className="hidden sm:block fixed bottom-8 right-8 z-50"
          style={{ animation: "fabIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both", animationDelay: "200ms" }}
        >
          <AddExpenseDialog />
        </div>
      )}

      {/* Dialogs for calendar tab */}
      {activeTab === "calendar" && selectedDay && (
        <>
          <AddExpenseDialog
            defaultDate={addDialogDate}
            onDateUsed={() => setAddDialogDate(undefined)}
          />
          <AddIncomeDialog
            defaultDate={addIncomeDialogDate}
            onDateUsed={() => setAddIncomeDialogDate(undefined)}
          />
          <EditExpenseDialog
            expense={editingExpense}
            open={!!editingExpense}
            onOpenChange={(open) => !open && setEditingExpense(null)}
          />
          <EditIncomeDialog
            income={editingIncome}
            open={!!editingIncome}
            onOpenChange={(open) => !open && setEditingIncome(null)}
          />
        </>
      )}

      {/* ── Mobile bottom nav ───────────────────────────────────────── */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav className="flex items-stretch bg-card/95 backdrop-blur-md border-t border-border/60">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className="flex-1 flex flex-col items-center justify-center pt-4 pb-6 gap-1 relative transition-all duration-200 active:scale-95"
              >
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-full bg-foreground"
                    style={{ animation: "pillIn 0.2s cubic-bezier(0.34,1.56,0.64,1) both" }}
                  />
                )}
                <div className="relative">
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px] transition-all duration-200",
                      active ? "text-foreground" : "text-muted-foreground"
                    )}
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                  {/* Mobile badge */}
                  {id === "loans" && activeLoans > 0 && !active && (
                    <span className="absolute -top-1 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white">
                      {activeLoans > 9 ? "9+" : activeLoans}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider leading-none transition-colors duration-200",
                  active ? "text-foreground" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile expense FAB — transactions tab only */}
      {activeTab === "transactions" && (
        <div
          className="sm:hidden fixed bottom-16 right-2 z-50"
          style={{ animation: "fabIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both", animationDelay: "200ms" }}
        >
          <AddExpenseDialog />
        </div>
      )}

      <style>{`
  @keyframes expIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pillIn {
    from { transform: translateX(-50%) scaleX(0); opacity: 0; }
    to   { transform: translateX(-50%) scaleX(1); opacity: 1; }
  }
  @keyframes fabIn {
    from { opacity: 0; transform: scale(0.8) translateY(8px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }

  html, body {
    overflow-x: hidden;
    max-width: 100vw;
  }

  @media (max-width: 639px) {
    .header-actions button,
    .header-actions [role="button"] {
      height: 32px !important;
      padding-left: 10px !important;
      padding-right: 10px !important;
      font-size: 11px !important;
      border-radius: 12px !important;
    }
    .header-actions svg {
      width: 13px !important;
      height: 13px !important;
    }
  }
`}</style>
    </AppLayout>
  );
}