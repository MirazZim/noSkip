import { format } from "date-fns";
import { ArrowLeft, Plus } from "lucide-react";
import { Expense, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import { useDeleteExpense } from "@/hooks/useExpenses";
import { EditExpenseDialog } from "./EditExpenseDialog";
import { toast } from "sonner";

interface DayDetailViewProps {
  date: string;
  expenses: Expense[];
  onBack: () => void;
  onAddExpense: (date: string) => void;
}

export function DayDetailView({ date, expenses, onBack, onAddExpense }: DayDetailViewProps) {
  const { formatAmount } = useCurrency();
  const deleteExpense = useDeleteExpense();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const dayExpenses = expenses.filter((e) => e.date === date);
  const total = dayExpenses.reduce((s, e) => s + e.amount, 0);
  const displayDate = format(new Date(date + "T00:00:00"), "EEEE, MMMM d, yyyy");

  const categoryBreakdown = dayExpenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const handleDelete = async (id: string) => {
    try {
      await deleteExpense.mutateAsync(id);
      toast.success("Expense deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold font-display">{displayDate}</h2>
            <p className="text-sm text-muted-foreground">
              {dayExpenses.length} transaction{dayExpenses.length !== 1 ? "s" : ""} · Total: {formatAmount(total)}
            </p>
          </div>
          <Button size="sm" onClick={() => onAddExpense(date)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Category breakdown */}
        {Object.keys(categoryBreakdown).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(categoryBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amount]) => (
                <div
                  key={cat}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1"
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other }}
                  />
                  <span className="text-xs font-medium">{cat}</span>
                  <span className="text-xs text-muted-foreground">{formatAmount(amount)}</span>
                </div>
              ))}
          </div>
        )}

        {/* Transactions */}
        {dayExpenses.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No expenses on this day.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => onAddExpense(date)}>
                <Plus className="h-3.5 w-3.5" />
                Add an expense
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {dayExpenses.map((exp) => (
                  <div key={exp.id} className="flex items-center gap-3 px-4 py-3 group">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[exp.category as ExpenseCategory] || CATEGORY_COLORS.Other }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{exp.category}</span>
                        <span className="text-sm font-semibold tabular-nums">{formatAmount(exp.amount)}</span>
                      </div>
                      {exp.note && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{exp.note}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => setEditingExpense(exp)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => handleDelete(exp.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <EditExpenseDialog
        expense={editingExpense}
        open={!!editingExpense}
        onOpenChange={(open) => !open && setEditingExpense(null)}
      />
    </>
  );
}
