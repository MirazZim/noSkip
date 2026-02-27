import { useState } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { AddIncomeDialog } from "@/components/expenses/AddIncomeDialog";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { ExpenseSummaryCards } from "@/components/expenses/ExpenseSummaryCards";
import { ExpenseCharts } from "@/components/expenses/ExpenseCharts";
import { BudgetManager } from "@/components/expenses/BudgetManager";
import { MonthCalendarView } from "@/components/expenses/MonthCalendarView";
import { MedievalQuote } from "@/components/expenses/MedievalQuote";
import { DayDetailView } from "@/components/expenses/DayDetailView";
import { useExpenses, usePrevMonthExpenses, useBudgets } from "@/hooks/useExpenses";
import { useIncomes, usePrevMonthIncomes } from "@/hooks/useIncomes";
import { Skeleton } from "@/components/ui/skeleton";
import { List, CalendarDays, LayoutGrid, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "transactions" | "calendar" | "overview";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "transactions", label: "Transactions", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "overview", label: "Overview", icon: LayoutGrid },
];

export default function Expenses() {
  const [month, setMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [addDialogDate, setAddDialogDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [txDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: expenses, isLoading } = useExpenses(month);
  const { data: prevExpenses } = usePrevMonthExpenses(month);
  const { data: budgets } = useBudgets(month);
  // Inside the component, alongside existing hooks:
  const { data: incomes } = useIncomes(month);
  const { data: prevIncomes } = usePrevMonthIncomes(month);

  const allExpenses = expenses || [];
  const allPrev = prevExpenses || [];
  const allBudgets = budgets || [];
  const allIncomes = incomes || [];
  const allPrevIncomes = prevIncomes || [];


  const txExpenses = allExpenses.filter((e) => e.date === txDate);

  const handleDayClick = (date: string) => setSelectedDay(date);
  const handleAddFromDay = (date: string) => { setAddDialogDate(date); setSelectedDay(null); };
  const switchTab = (tab: Tab) => { setActiveTab(tab); setSelectedDay(null); };

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
      <div className="space-y-5 pb-32 sm:pb-24" style={{ animation: "expIn 0.3s ease both" }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Finance</p>
            <h1 className="text-2xl font-black font-display tracking-tight">Expenses</h1>
          </div>

          {/*
            Action cluster — right side of header.
            Income button sits between BudgetManager and MonthPicker,
            visually grouped but distinct from the budget controls.
          */}
          {/* flex-nowrap keeps all three on one row on every screen size */}
          <div className="flex items-center gap-2 flex-nowrap min-w-0">
            <BudgetManager budgets={allBudgets} expenses={allExpenses} month={month} />

            {/* Divider between budget controls and income */}
            <div className="hidden sm:block h-5 w-px bg-border/60 shrink-0" />

            <AddIncomeDialog
              defaultDate={addDialogDate}
              onDateUsed={() => setAddDialogDate(undefined)}
            />

            <MonthPicker month={month} onChange={setMonth} />
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
                "flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200",
                activeTab === id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════
            TAB: TRANSACTIONS
        ══════════════════════════════════════════════════════════════ */}
        {activeTab === "transactions" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>
            {txExpenses.length > 0 ? (
              <ExpenseList expenses={txExpenses} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 py-16 text-center">
                <div className="text-4xl">🧾</div>
                <div className="space-y-1">
                  <p className="text-sm font-bold tracking-tight">No transactions</p>
                  <p className="text-xs text-muted-foreground">
                    Nothing logged for {format(new Date(txDate + "T12:00:00"), "EEEE, MMM d")}
                  </p>
                </div>
              </div>
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
              month={month}
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
              onBack={() => setSelectedDay(null)}
              onAddExpense={handleAddFromDay}
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
            />
            {allBudgets.filter((b) => b.category !== "Overall").length > 0 && (
              <BudgetManager budgets={allBudgets} expenses={allExpenses} month={month} />
            )}
            <ExpenseCharts expenses={allExpenses} month={month} />
          </div>
        )}
      </div>

      {/* DESKTOP FAB — only on transactions tab */}
      {activeTab === "transactions" && (
        <div
          className="hidden sm:block fixed bottom-8 right-8 z-50"
          style={{ animation: "fabIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both", animationDelay: "200ms" }}
        >
          <AddExpenseDialog
            defaultDate={addDialogDate}
            onDateUsed={() => setAddDialogDate(undefined)}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE: income in a slim bar above the nav + expense FAB in nav
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Bottom nav */}
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
                <Icon
                  className={cn(
                    "h-[22px] w-[22px] transition-all duration-200",
                    active ? "text-foreground" : "text-muted-foreground"
                  )}
                  strokeWidth={active ? 2.5 : 1.75}
                />
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
          <AddExpenseDialog
            defaultDate={addDialogDate}
            onDateUsed={() => setAddDialogDate(undefined)}
          />
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
      `}</style>
    </AppLayout>
  );
}