import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Entertainment",
  "Health",
  "Shopping",
  "Utilities",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Food: "hsl(32, 95%, 54%)",
  Transport: "hsl(210, 70%, 55%)",
  Entertainment: "hsl(280, 60%, 55%)",
  Health: "hsl(160, 84%, 39%)",
  Shopping: "hsl(340, 70%, 55%)",
  Utilities: "hsl(43, 96%, 56%)",
  Other: "hsl(220, 10%, 55%)",
};

export interface Expense {
  id: string;
  amount: number;
  category: string;
  date: string;
  note: string | null;
  user_id: string;
  created_at: string;
}

export interface Budget {
  id: string;
  amount: number;
  category: string;
  month: string;
  user_id: string;
  created_at: string;
}

export function useExpenses(month: Date) {
  const { user } = useAuth();
  const start = format(startOfMonth(month), "yyyy-MM-dd");
  const end = format(endOfMonth(month), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["expenses", user?.id, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!user,
  });
}

export function usePrevMonthExpenses(month: Date) {
  const { user } = useAuth();
  const prev = subMonths(month, 1);
  const start = format(startOfMonth(prev), "yyyy-MM-dd");
  const end = format(endOfMonth(prev), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["expenses", user?.id, start],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .gte("date", start)
        .lte("date", end);
      if (error) throw error;
      return data as Expense[];
    },
    enabled: !!user,
  });
}

export function useBudgets(month: Date) {
  const { user } = useAuth();
  const monthStr = format(startOfMonth(month), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["budgets", user?.id, monthStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("*")
        .eq("month", monthStr);
      if (error) throw error;
      return data as Budget[];
    },
    enabled: !!user,
  });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (expense: { amount: number; category: string; date: string; note?: string }) => {
      const { error } = await supabase.from("expenses").insert({
        ...expense,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (expense: { id: string; amount: number; category: string; date: string; note: string | null }) => {
      const { error } = await supabase
        .from("expenses")
        .update({
          amount: expense.amount,
          category: expense.category,
          date: expense.date,
          note: expense.note,
        })
        .eq("id", expense.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}

export function useUpsertBudget() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (budget: { amount: number; category: string; month: Date }) => {
      const monthStr = format(startOfMonth(budget.month), "yyyy-MM-dd");
      
      // Check if budget exists
      const { data: existing } = await supabase
        .from("budgets")
        .select("id")
        .eq("month", monthStr)
        .eq("category", budget.category)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("budgets")
          .update({ amount: budget.amount })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("budgets").insert({
          amount: budget.amount,
          category: budget.category,
          month: monthStr,
          user_id: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });
}
