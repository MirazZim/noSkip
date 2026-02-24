import { useState } from "react";
import { Settings2, X, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUpsertBudget, useDeleteBudget, EXPENSE_CATEGORIES,
  Budget, Expense, CATEGORY_COLORS, type ExpenseCategory,
} from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  budgets: Budget[];
  expenses: Expense[];
  month: Date;
}

function statusColor(pct: number) {
  if (pct >= 90) return "#ef4444"; // rose-500
  if (pct >= 70) return "#f59e0b"; // amber-500
  return "#10b981";                // emerald-500
}

export function BudgetManager({ budgets, expenses, month }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Overall");
  const [amount, setAmount] = useState("");
  const upsertBudget = useUpsertBudget();
  const deleteBudget = useDeleteBudget();
  const { formatAmount } = useCurrency();

  const categoryBudgets = budgets.filter((b) => b.category !== "Overall");

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    try {
      await upsertBudget.mutateAsync({ amount: num, category, month });
      toast.success("Budget saved");
      setAmount("");
    } catch {
      toast.error("Failed to save budget");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBudget.mutateAsync(id);
      toast.success("Budget removed");
    } catch {
      toast.error("Failed to remove budget");
    }
  };

  return (
    <>
      {/* Inline category budget bars — shown on main page */}
      {categoryBudgets.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Limits</p>
              <p className="text-base font-black tracking-tight leading-tight">Category Budgets</p>
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {format(month, "MMM yyyy")}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {categoryBudgets.map((b, i) => {
              const spent = expenses
                .filter((e) => e.category === b.category)
                .reduce((s, e) => s + e.amount, 0);
              const pct = Math.min((spent / b.amount) * 100, 100);
              const color = CATEGORY_COLORS[b.category as ExpenseCategory] || CATEGORY_COLORS.Other;
              const sc = statusColor(pct);
              const remaining = b.amount - spent;

              return (
                <div
                  key={b.id}
                  className="group px-5 py-3"
                  style={{ animation: "fadeSlideIn 0.3s ease both", animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="h-7 w-7 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{b.category}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                          {formatAmount(spent)} of {formatAmount(b.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: sc }}
                      >
                        {remaining >= 0 ? `${formatAmount(remaining)} left` : `${formatAmount(Math.abs(remaining))} over`}
                      </span>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500/10"
                        aria-label="Remove budget"
                      >
                        <X className="h-3 w-3 text-rose-500" />
                      </button>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-[5px] w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: sc,
                        animation: "growWidth 0.7s ease both",
                        animationDelay: `${i * 50 + 100}ms`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialog trigger */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-2 h-9 px-4 rounded-2xl border border-border/60 bg-card text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:shadow-md hover:bg-muted/40 active:scale-95">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Set Budget
          </button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-3xl border-border/60">
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-primary to-emerald-500" />

          <div className="px-6 pt-5 pb-2">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-black tracking-tight flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Set Budget
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Define spending limits per category for {format(month, "MMMM yyyy")}
              </p>
            </DialogHeader>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Category
              </label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 rounded-xl border-border/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="Overall">Overall</SelectItem>
                  {EXPENSE_CATEGORIES.map((cat) => {
                    const color = CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other;
                    return (
                      <SelectItem key={cat} value={cat} className="rounded-xl">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          {cat}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Monthly Limit
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-base">$</span>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="pl-8 h-12 text-xl font-black rounded-xl border-border/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            {/* Save */}
            <Button
              onClick={handleSave}
              className="w-full h-12 rounded-xl text-sm font-bold tracking-wide transition-all hover:scale-[1.01] active:scale-[0.99]"
              disabled={upsertBudget.isPending}
            >
              {upsertBudget.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Saving…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Save Budget
                </span>
              )}
            </Button>

            {/* Active budgets list inside dialog */}
            {budgets.length > 0 && (
              <div className="pt-2 border-t border-border/50 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground pb-1">
                  Active Budgets
                </p>
                {budgets.map((b) => {
                  const color = CATEGORY_COLORS[b.category as ExpenseCategory] || CATEGORY_COLORS.Other;
                  return (
                    <div
                      key={b.id}
                      className="group flex items-center justify-between rounded-xl px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: b.category === "Overall" ? "hsl(var(--primary))" : color }}
                        />
                        <span className="text-sm font-semibold">{b.category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums font-bold text-muted-foreground">
                          {formatAmount(b.amount)}
                        </span>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500/10"
                        >
                          <X className="h-3 w-3 text-rose-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes growWidth {
          from { width: 0%; }
        }
      `}</style>
    </>
  );
}