import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";

export type LoanDirection = "borrowed" | "lent";

export interface Loan {
  id: string;
  user_id: string;
  person_name: string;
  amount: number;
  direction: LoanDirection;
  loan_date: string;        // when money actually moved
  due_date: string | null;  // when it should be paid back
  note: string | null;
  is_paid: boolean;
  paid_date: string | null; // when it was settled
  created_at: string;
}

const QK = ["loans"] as const;

// ─── Fetch ────────────────────────────────────────────────────────────────────

export function useLoans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .order("loan_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Loan[];
    },
    enabled: !!user,
  });
}

// ─── Add ──────────────────────────────────────────────────────────────────────
// CORRECT FINANCIAL LOGIC:
// Loans are asset/liability transfers, NOT income or expenses.
// They only affect cash balance through the net balance formula.
// We NEVER write to income or expense tables.

export function useAddLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (loan: {
      person_name: string;
      amount: number;
      direction: LoanDirection;
      loan_date: string;
      due_date?: string | null;
      note?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Save the loan record — that's it!
      const { error } = await supabase.from("loans").insert({
        ...loan,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

// ─── Mark Paid ────────────────────────────────────────────────────────────────
// CORRECT FINANCIAL LOGIC:
// When a loan is marked paid, we simply update is_paid and paid_date.
// The net balance formula automatically adjusts because unpaid loans are filtered out.
// No income/expense entries needed.

export function useMarkLoanPaid() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, is_paid }: {
      id: string;
      is_paid: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const today = format(new Date(), "yyyy-MM-dd");

      // Update the loan record — that's it!
      const { error } = await supabase
        .from("loans")
        .update({
          is_paid,
          paid_date: is_paid ? today : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────
// CORRECT FINANCIAL LOGIC:
// Update the loan record directly. No income/expense manipulation needed.

export function useUpdateLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        person_name?: string;
        amount?: number;
        direction?: LoanDirection;
        loan_date?: string;
        due_date?: string | null;
        note?: string | null;
      };
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Update the loan record — that's it!
      const { error } = await supabase
        .from("loans")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────
// CORRECT FINANCIAL LOGIC:
// Delete from loans table only. No cleanup of income/expense entries needed.

export function useDeleteLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (loanId: string) => {
      if (!user) throw new Error("Not authenticated");

      // Delete the loan record — that's it!
      const { error } = await supabase.from("loans").delete().eq("id", loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}