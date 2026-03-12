import { format, isToday, isYesterday, parseISO } from "date-fns";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Expense, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { Income, INCOME_SOURCE_COLORS, type IncomeSource } from "@/hooks/useIncomes";
import { useCurrency } from "@/hooks/useCurrency";
import { useState, useRef, useCallback } from "react";
import { useDeleteExpense } from "@/hooks/useExpenses";
import { useDeleteIncome } from "@/hooks/useIncomes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DayDetailViewProps {
  date: string;
  expenses: Expense[];
  incomes: Income[];
  onBack: () => void;
  onAddExpense: (date: string) => void;
  onAddIncome: (date: string) => void;
  onEditExpense?: (expense: Expense) => void;
  onEditIncome?: (income: Income) => void;
}

type TabType = "expenses" | "income";

// ── Snapshot insight generator ────────────────────────────────────────────────
function getDayInsight(
  spent: number,
  earned: number,
  txCount: number,
  date: string
): { emoji: string; text: string } {
  const dateObj = parseISO(date);
  if (txCount === 0) {
    if (isToday(dateObj)) return { emoji: "✨", text: "Nothing logged yet today" };
    return { emoji: "😴", text: "Quiet day — no activity" };
  }
  const net = earned - spent;
  if (earned > 0 && spent === 0) return { emoji: "🏆", text: "Income only — zero spending" };
  if (spent > 0 && earned === 0) {
    if (txCount === 1) return { emoji: "💸", text: "Single expense day" };
    return { emoji: "💸", text: `${txCount} expenses logged` };
  }
  if (net > 0) return { emoji: "📈", text: `Earned more than spent — +${Math.round((net / earned) * 100)}% surplus` };
  if (net === 0) return { emoji: "⚖️", text: "Perfectly balanced day" };
  return { emoji: "📉", text: `Spent ${Math.abs(net).toLocaleString()} more than earned` };
}

// ── iOS-style Swipeable Row ────────────────────────────────────────────────────
interface SwipeableRowProps {
  onEdit?: () => void;
  onDelete: () => void;
  children: React.ReactNode;
  showEdit?: boolean;
}

function SwipeableRow({ onEdit, onDelete, children, showEdit = true }: SwipeableRowProps) {
  const [offset, setOffset] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentOffset = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);

  const ACTION_WIDTH = showEdit ? 132 : 72;
  const SNAP_THRESHOLD = ACTION_WIDTH * 0.35;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    isHorizontal.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isHorizontal.current = Math.abs(dx) > Math.abs(dy);
      }
      return;
    }
    if (!isHorizontal.current) return;
    e.preventDefault();

    const raw = currentOffset.current + dx;
    const clamped = Math.min(0, Math.max(-ACTION_WIDTH, raw));
    setOffset(clamped);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current || !isHorizontal.current) {
      isDragging.current = false;
      return;
    }
    isDragging.current = false;
    const dx = e.changedTouches[0].clientX - startX.current;
    const landed = currentOffset.current + dx;

    if (landed < -SNAP_THRESHOLD) {
      currentOffset.current = -ACTION_WIDTH;
      setOffset(-ACTION_WIDTH);
    } else {
      currentOffset.current = 0;
      setOffset(0);
    }
  };

  const close = useCallback(() => {
    currentOffset.current = 0;
    setOffset(0);
  }, []);

  const handleDelete = () => { close(); setTimeout(onDelete, 250); };
  const handleEdit = () => { close(); setTimeout(() => onEdit?.(), 250); };

  return (
    <div
      className="relative overflow-hidden select-none group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Swipe actions (mobile) */}
      <div className="absolute inset-y-0 right-0 flex items-stretch sm:hidden" style={{ width: ACTION_WIDTH }}>
        {showEdit && onEdit && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleEdit}
            className="flex-1 flex flex-col items-center justify-center bg-blue-500 active:bg-blue-600 transition-colors gap-1"
          >
            <Pencil className="h-4 w-4 text-white" />
            <span className="text-[10px] font-bold text-white tracking-wide">Edit</span>
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          className="flex-1 flex flex-col items-center justify-center bg-red-500 active:bg-red-600 transition-colors gap-1"
        >
          <Trash2 className="h-4 w-4 text-white" />
          <span className="text-[10px] font-bold text-white tracking-wide">Delete</span>
        </button>
      </div>

      {/* Draggable layer */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging.current ? "none" : "transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "transform",
        }}
        className="relative bg-card"
      >
        {children}

        {/* Desktop hover actions */}
        <div className={cn(
          "hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 gap-1.5 transition-all duration-200",
          isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
        )}>
          {showEdit && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); handleEdit(); }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold">Edit</span>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white shadow-sm transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function DayDetailView({
  date,
  expenses,
  incomes,
  onBack,
  onAddExpense,
  onAddIncome,
  onEditExpense,
  onEditIncome,
}: DayDetailViewProps) {
  const { formatAmount } = useCurrency();
  const deleteExpense = useDeleteExpense();
  const deleteIncome = useDeleteIncome();
  const [activeTab, setActiveTab] = useState<TabType>("expenses");

  const dayExpenses = expenses.filter((e) => e.date === date);
  const dayIncomes = incomes.filter((i) => i.date === date);
  const expenseTotal = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const incomeTotal = dayIncomes.reduce((s, i) => s + i.amount, 0);
  const net = incomeTotal - expenseTotal;
  const totalTx = dayExpenses.length + dayIncomes.length;

  const insight = getDayInsight(expenseTotal, incomeTotal, totalTx, date);

  const categoryBreakdown = dayExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const sourceBreakdown = dayIncomes.reduce<Record<string, number>>((acc, i) => {
    acc[i.source] = (acc[i.source] || 0) + i.amount;
    return acc;
  }, {});

  const handleDeleteExpense = async (id: string) => {
    try { await deleteExpense.mutateAsync(id); toast.success("Expense deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const handleDeleteIncome = async (id: string) => {
    try { await deleteIncome.mutateAsync(id); toast.success("Income deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  // Net color logic
  const netPositive = net > 0;
  const netZero = net === 0;
  const netColor = netPositive ? "text-emerald-500" : netZero ? "text-muted-foreground" : "text-rose-500";
  const netBg = netPositive ? "bg-emerald-500/10 border-emerald-500/20" : netZero ? "bg-muted/40 border-border/40" : "bg-rose-500/10 border-rose-500/20";
  const NetIcon = netPositive ? TrendingUp : netZero ? Minus : TrendingDown;

  return (
    <div className="space-y-4">

      {/* ── Daily Snapshot Card (replaces the redundant date header) ── */}
      <div className={cn(
        "rounded-2xl border p-4 transition-all duration-300",
        netBg
      )}>
        <div className="flex items-center justify-between gap-3">
          {/* Left: net + insight */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <NetIcon className={cn("h-3.5 w-3.5 shrink-0", netColor)} />
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {netPositive ? "Net gain" : netZero ? "Breakeven" : "Net spent"}
              </span>
            </div>
            <p className={cn("text-2xl font-black tabular-nums leading-none tracking-tight", netColor)}>
              {net === 0 ? "—" : `${netPositive ? "+" : ""}${formatAmount(Math.abs(net))}`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
              {insight.emoji} {insight.text}
            </p>
          </div>

          {/* Right: mini stat pills */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {expenseTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-500/70">Out</span>
                <span className="text-xs font-black tabular-nums text-rose-500">{formatAmount(expenseTotal)}</span>
              </div>
            )}
            {incomeTotal > 0 && (
              <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-500/70">In</span>
                <span className="text-xs font-black tabular-nums text-emerald-500">+{formatAmount(incomeTotal)}</span>
              </div>
            )}
            {totalTx > 0 && (
              <div className="flex items-center justify-center rounded-xl bg-muted/60 px-2.5 py-1">
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  {totalTx} tx
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab Selector ── */}
      <div className="relative flex rounded-2xl bg-muted/40 border border-border/40 p-1 gap-1">
        <div
          className={cn(
            "absolute top-1 bottom-1 w-[calc(50%-6px)] rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            activeTab === "expenses"
              ? "left-1 bg-card shadow-sm"
              : "left-[calc(50%+2px)] bg-emerald-500 shadow-md shadow-emerald-500/25"
          )}
        />
        <button
          onClick={() => setActiveTab("expenses")}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-200 z-10",
            activeTab === "expenses" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>💸</span>
          <span>Expenses</span>
          {dayExpenses.length > 0 && (
            <span className={cn(
              "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center",
              activeTab === "expenses" ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"
            )}>
              {dayExpenses.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("income")}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors duration-200 z-10",
            activeTab === "income" ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span>💰</span>
          <span>Income</span>
          {dayIncomes.length > 0 && (
            <span className={cn(
              "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-bold min-w-[18px] text-center",
              activeTab === "income" ? "bg-white/25 text-white" : "bg-muted/60 text-muted-foreground"
            )}>
              {dayIncomes.length}
            </span>
          )}
        </button>
      </div>

      {/* ══ EXPENSES TAB ══ */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {dayExpenses.length === 0
                ? "No expenses yet"
                : `${dayExpenses.length} item${dayExpenses.length !== 1 ? "s" : ""} · ${formatAmount(expenseTotal)}`}
            </p>
            <button
              onClick={() => onAddExpense(date)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-foreground text-background hover:opacity-85 transition-opacity shadow-sm"
            >
              <Plus className="h-3 w-3" />
              Add Expense
            </button>
          </div>

          {Object.keys(categoryBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(categoryBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, amount]) => (
                  <div key={cat} className="flex items-center gap-1.5 rounded-full border border-border/50 bg-card px-2.5 py-1 shadow-sm">
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other }} />
                    <span className="text-[11px] font-medium text-foreground">{cat}</span>
                    <span className="text-[11px] text-muted-foreground">{formatAmount(amount)}</span>
                  </div>
                ))}
            </div>
          )}

          {dayExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-border/60 bg-muted/20">
              <div className="text-3xl mb-2.5 opacity-60">💸</div>
              <p className="text-sm font-bold text-muted-foreground">No expenses on this day</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tap Add Expense to log one</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm divide-y divide-border/40">
              {dayExpenses.map((exp) => (
                <SwipeableRow
                  key={exp.id}
                  onEdit={onEditExpense ? () => onEditExpense(exp) : undefined}
                  onDelete={() => handleDeleteExpense(exp.id)}
                  showEdit={!!onEditExpense}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div
                      className="h-8 w-8 rounded-xl shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${CATEGORY_COLORS[exp.category as ExpenseCategory] || CATEGORY_COLORS.Other}18` }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[exp.category as ExpenseCategory] || CATEGORY_COLORS.Other }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{exp.category}</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">{formatAmount(exp.amount)}</span>
                      </div>
                      {exp.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{exp.note}</p>}
                    </div>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ INCOME TAB ══ */}
      {activeTab === "income" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {dayIncomes.length === 0
                ? "No income yet"
                : `${dayIncomes.length} item${dayIncomes.length !== 1 ? "s" : ""} · ${formatAmount(incomeTotal)}`}
            </p>
            <button
              onClick={() => onAddIncome(date)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/30"
            >
              <Plus className="h-3 w-3" />
              Add Income
            </button>
          </div>

          {Object.keys(sourceBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(sourceBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([source, amount]) => (
                  <div key={source} className="flex items-center gap-1.5 rounded-full border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/30 px-2.5 py-1">
                    <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: INCOME_SOURCE_COLORS[source as IncomeSource] || INCOME_SOURCE_COLORS.Other }} />
                    <span className="text-[11px] font-medium text-foreground">{source}</span>
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{formatAmount(amount)}</span>
                  </div>
                ))}
            </div>
          )}

          {dayIncomes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 rounded-2xl border border-dashed border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10">
              <div className="text-3xl mb-2.5 opacity-60">💰</div>
              <p className="text-sm font-bold text-muted-foreground">No income on this day</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tap Add Income to log some</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 bg-card overflow-hidden shadow-sm divide-y divide-border/40">
              {dayIncomes.map((inc) => (
                <SwipeableRow
                  key={inc.id}
                  onEdit={onEditIncome ? () => onEditIncome(inc) : undefined}
                  onDelete={() => handleDeleteIncome(inc.id)}
                  showEdit={!!onEditIncome}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div
                      className="h-8 w-8 rounded-xl shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: `${INCOME_SOURCE_COLORS[inc.source as IncomeSource] || INCOME_SOURCE_COLORS.Other}18` }}
                    >
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: INCOME_SOURCE_COLORS[inc.source as IncomeSource] || INCOME_SOURCE_COLORS.Other }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{inc.source}</span>
                        <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">+{formatAmount(inc.amount)}</span>
                      </div>
                      {inc.note && <p className="text-xs text-muted-foreground truncate mt-0.5">{inc.note}</p>}
                    </div>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}