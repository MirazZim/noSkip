import { useState } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { MonthPicker } from "@/components/expenses/MonthPicker";
import { AddExpenseDialog } from "@/components/expenses/AddExpenseDialog";
import { ExpenseList } from "@/components/expenses/ExpenseList";
import { ExpenseSummaryCards } from "@/components/expenses/ExpenseSummaryCards";
import { ExpenseCharts } from "@/components/expenses/ExpenseCharts";
import { BudgetManager } from "@/components/expenses/BudgetManager";
import { MonthCalendarView } from "@/components/expenses/MonthCalendarView";
import { MedievalQuote } from "@/components/expenses/MedievalQuote";
import { DayDetailView } from "@/components/expenses/DayDetailView";
import { useExpenses, usePrevMonthExpenses, useBudgets } from "@/hooks/useExpenses";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";

export default function Expenses() {
  const [month, setMonth] = useState(new Date());
  const [addDialogDate, setAddDialogDate] = useState<string | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [listDate, setListDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data: expenses, isLoading } = useExpenses(month);
  const { data: prevExpenses } = usePrevMonthExpenses(month);
  const { data: budgets } = useBudgets(month);

  const handleDayClick = (date: string) => {
    setSelectedDay(date);
  };

  const handleAddFromDay = (date: string) => {
    setAddDialogDate(date);
  };

  const filteredExpenses = (expenses || []).filter((e) => e.date === listDate);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Expenses</h1>
            <p className="text-muted-foreground">Track and manage your spending</p>
          </div>
          <div className="flex items-center gap-3">
            <BudgetManager budgets={budgets || []} expenses={expenses || []} month={month} />
            <MonthPicker month={month} onChange={setMonth} />
          </div>
        </div>

        <MedievalQuote />

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[100px] rounded-xl" />)}
            </div>
            <Skeleton className="h-[220px] rounded-xl" />
          </div>
        ) : selectedDay ? (
          <DayDetailView
            date={selectedDay}
            expenses={expenses || []}
            onBack={() => setSelectedDay(null)}
            onAddExpense={handleAddFromDay}
          />
        ) : (
          <>
            <ExpenseSummaryCards expenses={expenses || []} prevExpenses={prevExpenses || []} budgets={budgets || []} />
            <h2 className="text-lg font-semibold font-display">Transactions</h2>
            <ExpenseList expenses={filteredExpenses} />
            <MonthCalendarView expenses={expenses || []} month={month} onDayClick={handleDayClick} />
            <ExpenseCharts expenses={expenses || []} month={month} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                
                <Input
                  type="date"
                  value={listDate}
                  onChange={(e) => setListDate(e.target.value)}
                  className="w-auto h-8 text-sm"
                />
              </div>
            </div>
          </>
        )}
      </div>
      <AddExpenseDialog defaultDate={addDialogDate} onDateUsed={() => setAddDialogDate(undefined)} />
    </AppLayout>
  );
}
