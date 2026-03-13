import { useState, useMemo, useEffect } from "react";
import {
  format, startOfMonth, endOfMonth, addMonths, subMonths,
  setDate, isBefore, isAfter, parseISO,
} from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { AddIncomeDialog } from "@/components/expenses/AddIncomeDialog";
import { AddLoanDialog } from "@/components/expenses/AddLoanDialog";
import { EditExpenseDialog } from "@/components/expenses/EditExpenseDialog";
import { EditIncomeDialog } from "@/components/expenses/EditIncomeDialog";
import { EditLoanDialog } from "@/components/expenses/EditLoanDialog";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { LoanList } from "@/components/expenses/LoanList";
import type { Expense } from "@/hooks/useExpenses";
import type { Income } from "@/hooks/useIncomes";
import type { Loan } from "@/hooks/useLoans";
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
import { LoanOverviewWidget } from "@/components/expenses/LoanOverviewWidget";
import {
  List, CalendarDays, LayoutGrid, ChevronLeft, ChevronRight,
  HandCoins, X, TrendingUp, AlertTriangle, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadCycleConfig, CYCLE_CHANGE_EVENT } from "@/components/expenses/BudgetManager";
import { SavingsTracker } from "@/components/expenses/SavingsTracker";
import { useSavings } from "@/hooks/useSavings";

// ── Semantic meaning-carriers — never theme colors ───────────────────────────
const S = {
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  violet: "#8b5cf6",
} as const;

type Tab = "transactions" | "calendar" | "overview" | "loans";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "transactions", label: "Transactions", icon: List },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "loans", label: "Loans", icon: HandCoins },
];

type CycleType = "calendar" | "payday";
interface CycleConfig { type: CycleType; payday: number }
interface CycleRange { start: Date; end: Date }

function getCycleRangeForOffset(config: CycleConfig, offset: number): CycleRange {
  if (config.type === "calendar") {
    const ref = addMonths(new Date(), offset);
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  const day = config.payday;
  const today = new Date();
  let currentStart: Date;
  if (today.getDate() >= day) {
    currentStart = setDate(new Date(today.getFullYear(), today.getMonth(), day), day);
  } else {
    const prev = subMonths(today, 1);
    currentStart = setDate(new Date(prev.getFullYear(), prev.getMonth(), day), day);
  }
  const targetStart = addMonths(currentStart, offset);
  const targetEnd = new Date(addMonths(targetStart, 1).getTime() - 86_400_000);
  return { start: targetStart, end: targetEnd };
}

// ── Days remaining in cycle ───────────────────────────────────────────────────
function daysRemaining(end: Date) {
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

export default function Expenses() {
  const [month, setMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<Tab>("transactions");
  const [addDialogDate, setAddDialogDate] = useState<string | undefined>();
  const [addIncomeDialogDate, setAddIncomeDialogDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [txDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [cycleOffset, setCycleOffset] = useState(0);
  const [cycleConfig, setCycleConfig] = useState<CycleConfig>(loadCycleConfig);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<CycleConfig>).detail;
      setCycleConfig(detail ?? loadCycleConfig());
    };
    window.addEventListener(CYCLE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(CYCLE_CHANGE_EVENT, handler);
  }, []);

  useEffect(() => { setCycleOffset(0); }, [cycleConfig.type]);

  useEffect(() => {
    if (!savingsModalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSavingsModalOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [savingsModalOpen]);

  const { data: expenses, isLoading } = useExpenses(month);
  const { data: prevExpenses } = usePrevMonthExpenses(month);
  const { data: budgets } = useBudgets(month);
  const { data: incomes } = useIncomes(month);
  const { data: prevIncomes } = usePrevMonthIncomes(month);
  const { data: loans } = useLoans();

  const allExpenses = expenses || [];
  const allPrev = prevExpenses || [];
  const allBudgets = budgets || [];
  const allIncomes = incomes || [];
  const allPrevIncomes = prevIncomes || [];
  const allLoans = loans || [];

  const cycleRange = useMemo(
    () => getCycleRangeForOffset(cycleConfig, cycleOffset),
    [cycleConfig, cycleOffset],
  );

  const cycleMonth1 = useMemo(() => startOfMonth(cycleRange.start), [cycleRange]);
  const cycleMonth2 = useMemo(() => startOfMonth(cycleRange.end), [cycleRange]);

  const { data: cycleM1Expenses } = useExpenses(cycleMonth1);
  const { data: cycleM2Expenses } = useExpenses(cycleMonth2);
  const { data: cycleM1Incomes } = useIncomes(cycleMonth1);
  const { data: cycleM2Incomes } = useIncomes(cycleMonth2);

  const cycleExpenses = useMemo(() => {
    const seen = new Set<string>();
    return [...(cycleM1Expenses || []), ...(cycleM2Expenses || [])].filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      const d = parseISO(e.date);
      return !isBefore(d, cycleRange.start) && !isAfter(d, cycleRange.end);
    });
  }, [cycleM1Expenses, cycleM2Expenses, cycleRange]);

  const cycleIncomes = useMemo(() => {
    const seen = new Set<string>();
    return [...(cycleM1Incomes || []), ...(cycleM2Incomes || [])].filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      const d = parseISO(i.date);
      return !isBefore(d, cycleRange.start) && !isAfter(d, cycleRange.end);
    });
  }, [cycleM1Incomes, cycleM2Incomes, cycleRange]);

  const { data: allSavings = [] } = useSavings();

  const savedThisCycle = useMemo(() => {
    const key = format(cycleRange.start, "yyyy-MM-dd");
    const entry = allSavings.find(s => s.cycle_start === key);
    return entry?.amount ?? 0;
  }, [allSavings, cycleRange.start]);

  const isCurrentCycle = cycleOffset === 0;
  const activeLoans = allLoans.filter(l => !l.is_paid).length;
  const txExpenses = allExpenses.filter(e => e.date === txDate);
  const txIncomes = allIncomes.filter(i => i.date === txDate);
  const [txType, setTxType] = useState<"expenses" | "income">("expenses");

  const cycleLabel =
    cycleConfig.type === "payday"
      ? `${format(cycleRange.start, "MMM d")} – ${format(cycleRange.end, "MMM d, yyyy")}`
      : format(cycleRange.start, "MMMM yyyy");

  // Dark psych: days-left urgency
  const daysLeft = daysRemaining(cycleRange.end);
  const daysUrgent = daysLeft <= 5 && isCurrentCycle;

  // Total spend this cycle for header context
  const cycleTotal = cycleExpenses.reduce((s, e) => s + e.amount, 0);

  const handleDayClick = (date: string) => setSelectedDay(date);
  const handleAddFromDay = (date: string) => setAddDialogDate(date);
  const handleAddIncomeFromDay = (date: string) => setAddIncomeDialogDate(date);
  const switchTab = (tab: Tab) => { setActiveTab(tab); setSelectedDay(null); };
  const handleEditExpense = (expense: Expense) => setEditingExpense(expense);
  const handleEditIncome = (income: Income) => setEditingIncome(income);
  const handleEditLoan = (loan: Loan) => setEditingLoan(loan);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) return (
    <AppLayout>
      <div className="space-y-5 pb-28 sm:pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-14 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-2xl" />
          </div>
          <Skeleton className="h-9 w-28 rounded-2xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-10 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <style>{`@keyframes expIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </AppLayout>
  );

  return (
    <AppLayout>
      <style>{`
        @keyframes expIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pillIn {
          from { transform: translateX(-50%) scaleX(0); opacity: 0; }
          to   { transform: translateX(-50%) scaleX(1); opacity: 1; }
        }
        @keyframes fabIn {
          from { opacity: 0; transform: scale(0.75) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes sheetUp {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes urgentPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
        @keyframes fabPulse {
          0%,100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4); }
          60%     { box-shadow: 0 0 0 10px hsl(var(--primary) / 0); }
        }
        html, body { overflow-x: hidden; max-width: 100vw; }
        @media (max-width: 639px) {
          .exp-header-actions button,
          .exp-header-actions [role="button"] {
            height: 32px !important;
            padding-left: 10px !important;
            padding-right: 10px !important;
            font-size: 11px !important;
            border-radius: 12px !important;
          }
          .exp-header-actions svg { width: 13px !important; height: 13px !important; }
        }
      `}</style>

      <div
        className="space-y-4 pb-32 sm:pb-24 w-full overflow-x-hidden"
        style={{ animation: "expIn 0.3s ease both" }}
      >

        {/* ══ HEADER ════════════════════════════════════════════════════════ */}
        {/* Dark psych: "Finance Command" framing + days-left urgency strip   */}
        <div
          className="flex flex-col gap-3"
          style={{ animation: "expIn 0.32s ease both" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-[10px] font-black uppercase tracking-[0.18em] mb-0.5"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Finance
              </p>
              <h1
                className="text-[clamp(22px,4vw,30px)] font-black tracking-tight leading-none"
                style={{
                  color: "hsl(var(--foreground))",
                  letterSpacing: "-0.03em",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Expenses
              </h1>
            </div>

            {/* Right actions */}
            <div className="exp-header-actions flex items-center gap-1.5 flex-nowrap shrink-0">
              <BudgetManager
                budgets={allBudgets}
                expenses={cycleExpenses}
                month={month}
                open={budgetDialogOpen}
                onOpenChange={setBudgetDialogOpen}
              />
              <div className="hidden sm:block h-5 w-px" style={{ background: "hsl(var(--border) / 0.6)" }} />
              <AddIncomeDialog
                defaultDate={activeTab === "transactions" ? addIncomeDialogDate : undefined}
                onDateUsed={() => setAddIncomeDialogDate(undefined)}
              />
            </div>
          </div>

          {/* ── Urgency context strip (dark psych: countdown + cycle total) */}
          {isCurrentCycle && (
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-2.5 overflow-hidden"
              style={{
                background: "hsl(var(--card) / 0.7)",
                border: `1px solid ${daysUrgent ? `${S.rose}35` : "hsl(var(--border) / 0.5)"}`,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: daysUrgent
                  ? `0 0 0 1px ${S.rose}15, inset 0 1px 0 hsl(var(--background)/0.4)`
                  : "inset 0 1px 0 hsl(var(--background)/0.4)",
              }}
            >
              {/* Days left pill */}
              <div
                className="flex items-center gap-1.5 shrink-0"
                style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  background: daysUrgent ? `${S.rose}18` : "hsl(var(--muted) / 0.6)",
                  border: `1px solid ${daysUrgent ? `${S.rose}40` : "hsl(var(--border)/0.4)"}`,
                  animation: daysUrgent ? "urgentPulse 2s ease-in-out infinite" : "none",
                }}
              >
                {daysUrgent
                  ? <AlertTriangle size={10} color={S.rose} />
                  : <Sparkles size={10} style={{ color: "hsl(var(--primary))" }} />
                }
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                    color: daysUrgent ? S.rose : "hsl(var(--primary))",
                    fontFamily: "'DM Mono', monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {daysLeft === 0 ? "Last day" : `${daysLeft}d left`}
                </span>
              </div>

              {/* Cycle label */}
              <span
                className="text-xs font-semibold truncate flex-1"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                {cycleLabel}
              </span>

              {/* Dark psych: daily burn rate displayed prominently */}
              {cycleTotal > 0 && (
                <div className="flex flex-col items-end shrink-0">
                  <span
                    className="text-[11px] font-black leading-none"
                    style={{ color: "hsl(var(--foreground))", fontFamily: "'DM Mono', monospace" }}
                  >
                    {/* We show total this cycle */}
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cycleTotal)}
                  </span>
                  <span style={{ fontSize: 8, color: "hsl(var(--muted-foreground))", fontWeight: 600, letterSpacing: "0.05em" }}>
                    CYCLE SPEND
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Quote ── */}
        <div style={{ animation: "expIn 0.36s ease both", animationDelay: "40ms" }}>
          <MedievalQuote />
        </div>

        {/* ══ DESKTOP TAB BAR ═══════════════════════════════════════════════ */}
        {/* Premium pill tabs — active tab is an elevated glass card          */}
        <div
          className="hidden sm:flex gap-1 p-1 rounded-2xl"
          style={{
            background: "hsl(var(--muted) / 0.5)",
            border: "1px solid hsl(var(--border) / 0.4)",
            backdropFilter: "blur(8px)",
            animation: "expIn 0.36s ease both",
            animationDelay: "55ms",
          }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className="flex-1 relative flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95"
                style={{
                  background: active ? "hsl(var(--card))" : "transparent",
                  boxShadow: active
                    ? "0 1px 3px hsl(var(--background)/0.4), inset 0 1px 0 hsl(var(--background)/0.5)"
                    : "none",
                  border: active ? "1px solid hsl(var(--border)/0.5)" : "1px solid transparent",
                  color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                <Icon
                  className="shrink-0"
                  size={13}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: active ? 800 : 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>

                {/* Loan alert badge */}
                {id === "loans" && activeLoans > 0 && (
                  <span
                    className="flex items-center justify-center rounded-full tabular-nums"
                    style={{
                      width: 18, height: 18,
                      fontSize: 9, fontWeight: 900,
                      background: active ? "hsl(var(--muted))" : S.rose,
                      color: active ? "hsl(var(--foreground))" : "#fff",
                    }}
                  >
                    {activeLoans}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ══ TAB: TRANSACTIONS ═════════════════════════════════════════════ */}
        {activeTab === "transactions" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>

            {/* Expense / Income toggle — premium segmented control */}
            <div
              className="flex gap-1 p-1 rounded-2xl"
              style={{
                background: "hsl(var(--muted) / 0.5)",
                border: "1px solid hsl(var(--border) / 0.4)",
              }}
            >
              {/* Expenses */}
              <button
                onClick={() => setTxType("expenses")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95"
                style={{
                  background: txType === "expenses" ? "hsl(var(--card))" : "transparent",
                  boxShadow: txType === "expenses"
                    ? "0 1px 3px hsl(var(--background)/0.4), inset 0 1px 0 hsl(var(--background)/0.5)"
                    : "none",
                  border: txType === "expenses"
                    ? "1px solid hsl(var(--border)/0.5)"
                    : "1px solid transparent",
                  color: txType === "expenses"
                    ? "hsl(var(--foreground))"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                <span style={{ fontSize: 13 }}>💸</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Expenses
                </span>
                {txExpenses.length > 0 && (
                  <span
                    className="rounded-full tabular-nums px-1.5 py-0.5"
                    style={{
                      fontSize: 9, fontWeight: 800,
                      background: txType === "expenses" ? "hsl(var(--muted))" : "hsl(var(--muted)/0.6)",
                      color: txType === "expenses" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {txExpenses.length}
                  </span>
                )}
              </button>

              {/* Income */}
              <button
                onClick={() => setTxType("income")}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-95"
                style={{
                  background: txType === "income"
                    ? S.emerald
                    : "transparent",
                  boxShadow: txType === "income"
                    ? `0 2px 8px ${S.emerald}40, inset 0 1px 0 ${S.emerald}60`
                    : "none",
                  border: txType === "income"
                    ? `1px solid ${S.emerald}50`
                    : "1px solid transparent",
                  color: txType === "income"
                    ? "#fff"
                    : "hsl(var(--muted-foreground))",
                }}
              >
                <span style={{ fontSize: 13 }}>💰</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Income
                </span>
                {txIncomes.length > 0 && (
                  <span
                    className="rounded-full tabular-nums px-1.5 py-0.5"
                    style={{
                      fontSize: 9, fontWeight: 800,
                      background: txType === "income" ? "rgba(255,255,255,0.25)" : "hsl(var(--muted)/0.6)",
                      color: txType === "income" ? "#fff" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {txIncomes.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            {txType === "expenses" && (
              txExpenses.length > 0 ? (
                <ExpenseList expenses={txExpenses} />
              ) : (
                <EmptyState
                  icon="🧾"
                  title="Nothing logged today"
                  // Dark psych: implies something is missing / incomplete
                  sub={`Every untracked expense is a blind spot. Log for ${format(new Date(txDate + "T12:00:00"), "MMM d")}.`}
                  accent={S.rose}
                />
              )
            )}

            {txType === "income" && (
              txIncomes.length > 0 ? (
                <IncomeList incomes={txIncomes} />
              ) : (
                <EmptyState
                  icon="💰"
                  title="No income logged today"
                  sub="Tap Income in the header to record it — don't leave gaps in your cycle."
                  accent={S.emerald}
                />
              )
            )}
          </div>
        )}

        {/* ══ TAB: CALENDAR ════════════════════════════════════════════════ */}
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
            {/* Premium back breadcrumb */}
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setSelectedDay(null)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 transition-all active:scale-95"
                style={{
                  fontSize: 12, fontWeight: 700,
                  color: "hsl(var(--muted-foreground))",
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border)/0.5)",
                }}
              >
                <ChevronLeft size={14} />
                Calendar
              </button>
              <p
                style={{
                  fontSize: 14, fontWeight: 800,
                  color: "hsl(var(--foreground))",
                  letterSpacing: "-0.02em",
                }}
              >
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

        {/* ══ TAB: OVERVIEW ════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>

            {/* ── Cycle Navigator — premium glass strip ───────────────────── */}
            <div
              className="flex items-center gap-2 rounded-2xl px-2 py-2"
              style={{
                background: "hsl(var(--card) / 0.8)",
                border: "1px solid hsl(var(--border) / 0.5)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                boxShadow: "inset 0 1px 0 hsl(var(--background)/0.5)",
              }}
            >
              <button
                onClick={() => setCycleOffset(o => o - 1)}
                className="flex items-center justify-center rounded-xl transition-all active:scale-90"
                style={{
                  width: 34, height: 34, flexShrink: 0,
                  background: "hsl(var(--muted)/0.6)",
                  border: "1px solid hsl(var(--border)/0.4)",
                  color: "hsl(var(--muted-foreground))",
                }}
                aria-label="Previous cycle"
              >
                <ChevronLeft size={15} />
              </button>

              <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  {cycleConfig.type === "payday" && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5"
                      style={{
                        fontSize: 9, fontWeight: 900,
                        letterSpacing: "0.07em", textTransform: "uppercase",
                        color: S.violet,
                        background: `${S.violet}18`,
                        border: `1px solid ${S.violet}30`,
                      }}
                    >
                      💰 Payday
                    </span>
                  )}
                  <span
                    className="font-bold truncate"
                    style={{ fontSize: 13, color: "hsl(var(--foreground))", letterSpacing: "-0.01em" }}
                  >
                    {cycleLabel}
                  </span>
                  {/* Dark psych: "History" badge implies you're looking at the past */}
                  {!isCurrentCycle && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5"
                      style={{
                        fontSize: 9, fontWeight: 900,
                        letterSpacing: "0.07em", textTransform: "uppercase",
                        color: S.amber,
                        background: `${S.amber}18`,
                        border: `1px solid ${S.amber}30`,
                      }}
                    >
                      History
                    </span>
                  )}
                </div>
                {!isCurrentCycle && (
                  <button
                    onClick={() => setCycleOffset(0)}
                    className="transition-all hover:underline leading-none"
                    style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--primary))" }}
                  >
                    ↩ Back to current cycle
                  </button>
                )}
              </div>

              <button
                onClick={() => setCycleOffset(o => o + 1)}
                disabled={isCurrentCycle}
                className="flex items-center justify-center rounded-xl transition-all active:scale-90 disabled:opacity-25 disabled:pointer-events-none"
                style={{
                  width: 34, height: 34, flexShrink: 0,
                  background: "hsl(var(--muted)/0.6)",
                  border: "1px solid hsl(var(--border)/0.4)",
                  color: "hsl(var(--muted-foreground))",
                }}
                aria-label="Next cycle"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            <ExpenseSummaryCards
              expenses={cycleExpenses}
              prevExpenses={allPrev}
              budgets={allBudgets}
              incomes={cycleIncomes}
              prevIncomes={allPrevIncomes}
              savedThisCycle={savedThisCycle}
              onBudgetClick={() => setBudgetDialogOpen(true)}
              onSavingsClick={() => setSavingsModalOpen(true)}
            />

            {allLoans.some(l => !l.is_paid) && (
              <LoanOverviewWidget loans={allLoans} onGoToLoans={() => switchTab("loans")} />
            )}

            {allBudgets.filter(b => b.category !== "Overall").length > 0 && (
              <BudgetManager
                budgets={allBudgets}
                expenses={cycleExpenses}
                month={month}
                open={budgetDialogOpen}
                onOpenChange={setBudgetDialogOpen}
              />
            )}

            <ExpenseCharts expenses={cycleExpenses} month={cycleMonth1} />
          </div>
        )}

        {/* ══ TAB: LOANS ═══════════════════════════════════════════════════ */}
        {activeTab === "loans" && (
          <div className="space-y-4" style={{ animation: "expIn 0.28s ease both" }}>
            <div className="flex items-center justify-between">
              {/* Dark psych: "active" vs "all settled" framing */}
              <p
                className="text-xs font-bold"
                style={{
                  color: activeLoans > 0 ? S.rose : S.emerald,
                  letterSpacing: "0.05em",
                }}
              >
                {activeLoans > 0
                  ? `${activeLoans} active loan${activeLoans > 1 ? "s" : ""} outstanding`
                  : "✓ All loans settled"}
              </p>
              <AddLoanDialog />
            </div>
            <LoanList loans={allLoans} onEdit={handleEditLoan} />
          </div>
        )}
      </div>

      {/* ══ SAVINGS MODAL ════════════════════════════════════════════════════ */}
      {savingsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ animation: "fadeIn 0.18s ease both" }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: "hsl(var(--background) / 0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            onClick={() => setSavingsModalOpen(false)}
          />

          {/* Sheet */}
          <div
            className="relative z-10 w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto"
            style={{
              borderRadius: "24px 24px 0 0",
              background: "hsl(var(--card) / 0.95)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              border: "1px solid hsl(var(--border) / 0.5)",
              borderBottom: "none",
              boxShadow: "0 -8px 40px hsl(var(--background) / 0.5), inset 0 1px 0 hsl(var(--background)/0.4)",
              animation: "sheetUp 0.22s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="sm:hidden rounded-full"
                style={{ width: 36, height: 4, background: "hsl(var(--muted-foreground) / 0.3)" }}
              />
            </div>

            {/* Modal header */}
            <div
              className="sticky top-0 z-10 flex items-center justify-between px-5 pt-3 pb-3"
              style={{
                background: "hsl(var(--card) / 0.9)",
                backdropFilter: "blur(12px)",
                borderBottom: "1px solid hsl(var(--border) / 0.4)",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16 }}>💰</span>
                <p
                  style={{
                    fontSize: 12, fontWeight: 900,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    color: "hsl(var(--foreground))",
                  }}
                >
                  Savings Tracker
                </p>
              </div>
              <button
                onClick={() => setSavingsModalOpen(false)}
                className="flex items-center justify-center rounded-xl transition-colors active:scale-90"
                style={{
                  width: 30, height: 30,
                  background: "hsl(var(--muted))",
                  border: "1px solid hsl(var(--border)/0.4)",
                }}
                aria-label="Close"
              >
                <X size={13} style={{ color: "hsl(var(--muted-foreground))" }} />
              </button>
            </div>

            <div className="p-4">
              <SavingsTracker
                cycleExpenses={cycleExpenses}
                cycleIncomes={cycleIncomes}
                cycleStart={cycleRange.start}
                cycleEnd={cycleRange.end}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══ DESKTOP FAB ══════════════════════════════════════════════════════ */}
      {activeTab === "transactions" && !selectedDay && (
        <div
          className="hidden sm:block fixed bottom-8 right-8 z-40"
          style={{ animation: "fabIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both", animationDelay: "200ms" }}
        >
          {/* Dark psych: pulse if nothing logged yet today */}
          <div style={{ animation: txExpenses.length === 0 ? "fabPulse 2.4s ease-in-out infinite" : "none" }}>
            <AddExpenseDialog />
          </div>
        </div>
      )}

      {/* Calendar tab hidden dialogs */}
      {activeTab === "calendar" && selectedDay && (
        <div className="hidden">
          <AddExpenseDialog
            defaultDate={addDialogDate}
            onDateUsed={() => setAddDialogDate(undefined)}
          />
          <AddIncomeDialog
            defaultDate={addIncomeDialogDate}
            onDateUsed={() => setAddIncomeDialogDate(undefined)}
          />
        </div>
      )}

      {activeTab === "calendar" && selectedDay && (
        <>
          <EditExpenseDialog
            expense={editingExpense}
            open={!!editingExpense}
            onOpenChange={open => !open && setEditingExpense(null)}
          />
          <EditIncomeDialog
            income={editingIncome}
            open={!!editingIncome}
            onOpenChange={open => !open && setEditingIncome(null)}
          />
        </>
      )}

      <EditLoanDialog
        loan={editingLoan}
        open={!!editingLoan}
        onOpenChange={open => !open && setEditingLoan(null)}
      />

      {/* ══ MOBILE BOTTOM NAV ════════════════════════════════════════════════ */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <nav
          className="flex items-stretch"
          style={{
            background: "hsl(var(--card) / 0.92)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            borderTop: "1px solid hsl(var(--border) / 0.5)",
            boxShadow: "0 -4px 24px hsl(var(--background) / 0.3)",
          }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className="flex-1 flex flex-col items-center justify-center pt-3 pb-7 gap-1 relative transition-all duration-200 active:scale-95"
              >
                {/* Active indicator line */}
                {active && (
                  <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
                    style={{
                      width: 32, height: 3,
                      background: "hsl(var(--foreground))",
                      animation: "pillIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both",
                    }}
                  />
                )}

                <div className="relative">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.75}
                    style={{
                      color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                      transition: "color 0.2s, stroke-width 0.2s",
                    }}
                  />
                  {/* Loan badge */}
                  {id === "loans" && activeLoans > 0 && !active && (
                    <span
                      className="absolute -top-1 -right-1.5 flex items-center justify-center rounded-full font-black text-white"
                      style={{
                        width: 16, height: 16, fontSize: 9,
                        background: S.rose,
                        boxShadow: `0 0 8px ${S.rose}70`,
                      }}
                    >
                      {activeLoans > 9 ? "9+" : activeLoans}
                    </span>
                  )}
                </div>

                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 800 : 600,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                    color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                    transition: "color 0.2s",
                  }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile FAB */}
      {activeTab === "transactions" && (
        <div
          className="sm:hidden fixed z-40"
          style={{
            bottom: "calc(env(safe-area-inset-bottom) + 72px)",
            right: 12,
            animation: "fabIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both",
            animationDelay: "200ms",
          }}
        >
          <div style={{ animation: txExpenses.length === 0 ? "fabPulse 2.4s ease-in-out infinite" : "none" }}>
            <AddExpenseDialog />
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ── Empty State component ─────────────────────────────────────────────────────
function EmptyState({
  icon, title, sub, accent,
}: { icon: string; title: string; sub: string; accent: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center rounded-3xl"
      style={{
        background: "hsl(var(--card) / 0.5)",
        border: `1px dashed ${accent}30`,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="flex items-center justify-center rounded-2xl"
        style={{
          width: 52, height: 52, fontSize: 26,
          background: `${accent}12`,
          border: `1px solid ${accent}25`,
        }}
      >
        {icon}
      </div>
      <div className="space-y-1 max-w-xs">
        <p
          style={{
            fontSize: 14, fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "hsl(var(--foreground))",
          }}
        >
          {title}
        </p>
        <p
          style={{
            fontSize: 12, lineHeight: 1.5,
            color: "hsl(var(--muted-foreground))",
            fontWeight: 500,
          }}
        >
          {sub}
        </p>
      </div>
    </div>
  );
}