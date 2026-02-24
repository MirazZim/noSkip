import { useState } from "react";
import { format } from "date-fns";
import {
  Trash2, Pencil, Receipt, ShoppingCart, Utensils, Car, Home,
  Zap, Heart, Plane, Monitor, Music, BookOpen, Coffee, Gift, MoreHorizontal,
} from "lucide-react";
import {
  Expense, useDeleteExpense, CATEGORY_COLORS, type ExpenseCategory,
} from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { EditExpenseDialog } from "./EditExpenseDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

export function ExpenseList({ expenses, title }: ExpenseListProps) {
  const { formatAmount } = useCurrency();
  const deleteExpense = useDeleteExpense();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const grouped = expenses.reduce<Record<string, Expense[]>>((acc, exp) => {
    (acc[exp.date] ??= []).push(exp);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

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
        <div
          className="flex h-14 w-14 items-center justify-center rounded-3xl"
          style={{ background: "linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)" }}
        >
          <Receipt className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground tracking-tight">Nothing here yet</p>
          <p className="text-xs text-muted-foreground">Tap + to log your first expense</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {title && <h2 className="text-lg font-semibold font-display mb-4">{title}</h2>}

      <div className="relative space-y-0">
        {/* Continuous vertical spine */}
        <div
          className="absolute left-[28px] top-6 bottom-6 w-px pointer-events-none"
          style={{
            background:
              "linear-gradient(to bottom, transparent, hsl(var(--border)) 8%, hsl(var(--border)) 92%, transparent)",
          }}
        />

        {sortedDates.map((date, dateIdx) => {
          const dayExpenses = grouped[date];
          const dayTotal = dayExpenses.reduce((s, e) => s + e.amount, 0);
          const d = new Date(date + "T00:00:00");
          const isToday = date === format(new Date(), "yyyy-MM-dd");

          return (
            <div
              key={date}
              className="relative pl-14 pb-5"
              style={{
                animation: "fadeSlideIn 0.35s ease both",
                animationDelay: `${dateIdx * 60}ms`,
              }}
            >
              {/* Date stamp node */}
              <div className="absolute left-0 top-1 flex flex-col items-center w-14">
                <div
                  className={cn(
                    "flex h-[58px] w-[44px] flex-col items-center justify-center rounded-2xl border text-center shadow-sm",
                    isToday
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/70 bg-card text-foreground"
                  )}
                >
                  <span className="text-[10px] font-bold uppercase tracking-widest leading-none opacity-60">
                    {format(d, "MMM")}
                  </span>
                  <span className="text-xl font-black leading-tight tabular-nums">
                    {format(d, "d")}
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-widest leading-none opacity-50">
                    {format(d, "EEE")}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="space-y-1.5">
                {/* Day summary badge */}
                <div className="flex items-center justify-end pb-0.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[15px] font-semibold text-muted-foreground tabular-nums">
                    Total Amount · {formatAmount(dayTotal)}
                  </span>
                </div>

                {dayExpenses.map((exp, expIdx) => {
                  const color =
                    CATEGORY_COLORS[exp.category as ExpenseCategory] ||
                    CATEGORY_COLORS.Other;

                  return (
                    <div
                      key={exp.id}
                      className="group relative flex items-center gap-3 rounded-2xl border border-border/50 bg-card px-3.5 py-3 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md hover:bg-muted/20"
                      style={{
                        animation: "fadeSlideIn 0.3s ease both",
                        animationDelay: `${dateIdx * 60 + expIdx * 40 + 40}ms`,
                      }}
                    >
                      {/* Left color accent bar */}
                      <div
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full opacity-60"
                        style={{ backgroundColor: color }}
                      />

                      <CategoryIcon category={exp.category} color={color} />

                      <div className="flex flex-1 min-w-0 flex-col">
                        <span className="text-sm font-semibold leading-snug truncate text-foreground">
                          {exp.category}
                        </span>
                        {exp.note && (
                          <span className="text-xs text-muted-foreground truncate leading-snug mt-0.5">
                            {exp.note}
                          </span>
                        )}
                      </div>

                      {/* Amount */}
                      <span
                        className="text-base font-black tabular-nums shrink-0 tracking-tight"
                        style={{ color }}
                      >
                        {formatAmount(exp.amount)}
                      </span>

                      {/* Floating action tray on hover */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150">
                        <div className="flex items-center gap-0.5 rounded-xl border border-border/70 bg-card/95 shadow-sm px-0.5 py-0.5 backdrop-blur-sm">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg"
                            onClick={() => setEditingExpense(exp)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg hover:bg-rose-500/10"
                            onClick={() => handleDelete(exp.id)}
                          >
                            <Trash2 className="h-3 w-3 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
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