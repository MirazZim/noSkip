import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type LoanDirection = "borrowed" | "lent";

export interface Loan {
  id: string;
  user_id: string;
  person_name: string;
  amount: number;
  direction: LoanDirection;
  due_date: string | null;
  note: string | null;
  is_paid: boolean;
  created_at: string;
}

const QK = ["loans"] as const;

export function useLoans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Loan[];
    },
    enabled: !!user,
  });
}

export function useAddLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (loan: {
      person_name: string;
      amount: number;
      direction: LoanDirection;
      due_date?: string | null;
      note?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("loans").insert({
        ...loan,
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useMarkLoanPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_paid }: { id: string; is_paid: boolean }) => {
      const { error } = await supabase
        .from("loans")
        .update({ is_paid })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}