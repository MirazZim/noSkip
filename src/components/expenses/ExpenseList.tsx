import { useState, useRef } from "react";
import {
  Trash2, Pencil, Receipt, ShoppingCart, Utensils, Car, Home,
  Zap, Heart, Plane, Monitor, Music, BookOpen, Coffee, Gift, MoreHorizontal,
} from "lucide-react";
import {
  Expense, useDeleteExpense, CATEGORY_COLORS, type ExpenseCategory,
} from "@/hooks/useExpenses";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { EditExpenseDialog } from "./EditExpenseDialog";
import { toast } from "sonner";

interface ExpenseListProps {
  expenses: Expense[];
  title?: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Food: Utensils,
  Groceries: ShoppingCart,
  Transport: Car,
  Housing: Home,
  Utilities: Zap,
  Health: Heart,
  Travel: Plane,
  Entertainment: Music,
  Education: BookOpen,
  Tech: Monitor,
  Coffee: Coffee,
  Gifts: Gift,
  Shopping: ShoppingCart,
  Other: MoreHorizontal,
};

const ACTION_WIDTH = 136;
const SWIPE_THRESH = 40;
const EASE = "cubic-bezier(0.25,1,0.5,1)";
const DURATION = "0.28s";

function CategoryIcon({ category, color }: { category: string; color: string }) {
  const Icon = CATEGORY_ICONS[category] ?? MoreHorizontal;
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
      style={{ backgroundColor: `${color}20` }}
    >
      <Icon className="h-4 w-4" style={{ color }} strokeWidth={2} />
    </div>
  );
}

interface SwipeRowProps {
  exp: Expense;
  color: string;
  formatAmount: (n: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

function SwipeRow({ exp, color, formatAmount, onEdit, onDelete, openId, setOpenId }: SwipeRowProps) {
  const isOpen = openId === exp.id;
  const startX = useRef(0);
  const startY = useRef(0);
  const baseX = useRef(0);
  const curX = useRef(0);
  const dragging = useRef(false);
  const axisLocked = useRef<"h" | "v" | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function commit(x: number, animated: boolean) {
    const row = rowRef.current;
    const content = contentRef.current;
    if (!row || !content) return;
    const t = animated ? `${DURATION} ${EASE}` : "none";
    row.style.transition = t;
    row.style.transform = `translateX(${x}px)`;
    const pct = Math.abs(x) / ACTION_WIDTH;
    const opacity = 1 - pct * 0.78;
    content.style.transition = t;
    content.style.opacity = String(opacity);
  }

  function snapTo(open: boolean) {
    commit(open ? -ACTION_WIDTH : 0, true);
    setOpenId(open ? exp.id : null);
  }

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    baseX.current = isOpen ? -ACTION_WIDTH : 0;
    curX.current = baseX.current;
    dragging.current = true;
    axisLocked.current = null;
    commit(baseX.current, false);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (axisLocked.current === null) {
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axisLocked.current !== "h") return;
    e.preventDefault();
    if (openId && openId !== exp.id) setOpenId(null);
    curX.current = Math.max(-ACTION_WIDTH, Math.min(0, baseX.current + dx));
    commit(curX.current, false);
  }

  function onTouchEnd() {
    dragging.current = false;
    if (axisLocked.current !== "h") return;
    const delta = curX.current - baseX.current;
    snapTo(isOpen ? delta < -(SWIPE_THRESH / 2) : curX.current < -SWIPE_THRESH);
  }

  return (
    <div className="relative overflow-hidden">
      {/* Action tray */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH }}>
        <button
          onPointerDown={(e) => { e.stopPropagation(); snapTo(false); onEdit(); }}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-violet-500 text-white select-none active:brightness-90 transition-[filter]"
        >
          <Pencil className="h-4 w-4" />
          <span className="text-[9px] font-black uppercase tracking-widest">Edit</span>
        </button>
        <button
          onPointerDown={(e) => { e.stopPropagation(); snapTo(false); onDelete(); }}
          className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-rose-500 text-white select-none active:brightness-90 transition-[filter]"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-[9px] font-black uppercase tracking-widest">Delete</span>
        </button>
      </div>

      {/* Sliding row */}
      <div
        ref={rowRef}
        className="group relative bg-card will-change-transform"
        style={{ touchAction: "pan-y" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (isOpen) snapTo(false); }}
      >
        {/* Accent bar */}
        <div
          className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
          style={{ backgroundColor: color }}
        />

        <div ref={contentRef} className="flex items-center gap-3 px-4 py-3.5">
          <CategoryIcon category={exp.category} color={color} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate leading-snug">{exp.category}</p>
            {exp.note && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{exp.note}</p>
            )}
          </div>
          <span className="text-sm font-black tabular-nums shrink-0" style={{ color }}>
            {formatAmount(exp.amount)}
          </span>
        </div>

        {/* Desktop hover actions */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center
          opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0
          transition-all duration-150 pointer-events-none group-hover:pointer-events-auto">
          <div className="flex gap-0.5 rounded-xl border border-border/70 bg-card/95 shadow-sm px-0.5 py-0.5 backdrop-blur-sm">
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg" onClick={onEdit}>
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg hover:bg-rose-500/10" onClick={onDelete}>
              <Trash2 className="h-3 w-3 text-rose-500" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ExpenseList
═══════════════════════════════════════════════════════════════════════ */
export function ExpenseList({ expenses, title }: ExpenseListProps) {
  const { formatAmount } = useCurrency();
  const deleteExpense = useDeleteExpense();
  const { data: customCategories = [] } = useCustomCategories();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  function resolveColor(category: string): string {
    return (
      CATEGORY_COLORS[category as ExpenseCategory] ??
      customCategories.find((c) => c.name === category)?.color ??
      CATEGORY_COLORS.Other
    );
  }

  const dayTotal = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  const handleDelete = async (id: string) => {
    try {
      await deleteExpense.mutateAsync(id);
      toast.success("Expense deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (!expenses.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-border/60 bg-card/30 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-muted">
          <Receipt className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-bold tracking-tight">Nothing here yet</p>
          <p className="text-xs text-muted-foreground">Tap + to log your first expense</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {title && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
          {title}
        </p>
      )}

      {/* Day total */}
      <div className="flex items-center justify-end mb-4">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/20 via-blue-500/20 to-cyan-500/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <div className="relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-violet-500/10 via-blue-500/10 to-cyan-500/10 border border-violet-200/30 px-4 py-2.5 shadow-lg shadow-violet-500/5 backdrop-blur-sm">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white">
              <span className="text-[10px] font-black">Σ</span>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Total
            </span>
            <span className="text-sm font-black bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent tabular-nums">
              {formatAmount(dayTotal)}
            </span>
          </div>
        </div>
      </div>

      <p className="sm:hidden text-[10px] text-muted-foreground/35 text-right mb-1.5 select-none pr-1">
        ← swipe to edit · delete
      </p>

      <div className="rounded-2xl border border-border/60 overflow-hidden divide-y divide-border/40 shadow-sm">
        {expenses.map((exp, idx) => (
          <div
            key={exp.id}
            style={{ animation: "rowIn 0.3s ease both", animationDelay: `${idx * 35}ms` }}
          >
            <SwipeRow
              exp={exp}
              color={resolveColor(exp.category)}
              formatAmount={formatAmount}
              onEdit={() => setEditingExpense(exp)}
              onDelete={() => handleDelete(exp.id)}
              openId={openRowId}
              setOpenId={setOpenRowId}
            />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <EditExpenseDialog
        expense={editingExpense}
        open={!!editingExpense}
        onOpenChange={(open) => !open && setEditingExpense(null)}
      />
    </>
  );
}