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
// When a loan is created, we also mirror it as an expense or income entry
// so the Overview section always reflects your true cash position.
//
//   You lent money   → cash went OUT  → recorded as Expense ("Loan Given")
//   You borrowed     → cash came IN   → recorded as Income  ("Loan Received")

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

      // 1. Save the loan record
      const { error: loanError } = await supabase.from("loans").insert({
        ...loan,
        user_id: user.id,
      });
      if (loanError) throw loanError;

      // 2. Mirror as expense or income
      if (loan.direction === "lent") {
        // Money left your pocket — record as expense
        const { error } = await supabase.from("expenses").insert({
          user_id: user.id,
          amount: loan.amount,
          category: "Loan Given",
          date: loan.loan_date,
          note: `Lent to ${loan.person_name}${loan.note ? ` — ${loan.note}` : ""}`,
        });
        if (error) throw error;
      } else {
        // Money entered your pocket — record as income
        const { error } = await supabase.from("incomes").insert({
          user_id: user.id,
          amount: loan.amount,
          source: "Loan Received",
          date: loan.loan_date,
          note: `Borrowed from ${loan.person_name}${loan.note ? ` — ${loan.note}` : ""}`,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
    },
  });
}

// ─── Mark Paid ────────────────────────────────────────────────────────────────
// When a loan is settled, mirror the reverse transaction:
//
//   You lent → they paid back  → cash came IN  → Income  ("Loan Recovered")
//   You borrowed → you repaid  → cash went OUT → Expense ("Loan Repaid")
//
// When UNMARKED as paid, we remove the mirrored entry to keep things clean.

export function useMarkLoanPaid() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, is_paid, loan }: {
      id: string;
      is_paid: boolean;
      loan: Loan;
    }) => {
      if (!user) throw new Error("Not authenticated");

      const today = format(new Date(), "yyyy-MM-dd");

      // 1. Update the loan record
      const { error: updateError } = await supabase
        .from("loans")
        .update({
          is_paid,
          paid_date: is_paid ? today : null,
        })
        .eq("id", id);
      if (updateError) throw updateError;

      if (is_paid) {
        // 2a. Settling — mirror the reverse transaction
        if (loan.direction === "lent") {
          // You got your money back → income
          const { error } = await supabase.from("incomes").insert({
            user_id: user.id,
            amount: loan.amount,
            source: "Loan Recovered",
            date: today,
            note: `${loan.person_name} paid you back${loan.note ? ` — ${loan.note}` : ""}`,
          });
          if (error) throw error;
        } else {
          // You paid someone back → expense
          const { error } = await supabase.from("expenses").insert({
            user_id: user.id,
            amount: loan.amount,
            category: "Loan Repaid",
            date: today,
            note: `Repaid ${loan.person_name}${loan.note ? ` — ${loan.note}` : ""}`,
          });
          if (error) throw error;
        }
      } else {
        // 2b. Unmarking — delete the settlement entry we created above
        if (loan.direction === "lent") {
          // Remove the "Loan Recovered" income entry
          await supabase
            .from("incomes")
            .delete()
            .eq("user_id", user.id)
            .eq("source", "Loan Recovered")
            .eq("amount", loan.amount)
            .eq("note", `${loan.person_name} paid you back${loan.note ? ` — ${loan.note}` : ""}`);
        } else {
          // Remove the "Loan Repaid" expense entry
          await supabase
            .from("expenses")
            .delete()
            .eq("user_id", user.id)
            .eq("category", "Loan Repaid")
            .eq("amount", loan.amount)
            .eq("note", `Repaid ${loan.person_name}${loan.note ? ` — ${loan.note}` : ""}`);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
    },
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────
// When a loan is updated, we need to update the mirrored expense/income entry

export function useUpdateLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
      oldLoan,
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
      oldLoan: Loan;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Update the loan record
      const { error: updateError } = await supabase
        .from("loans")
        .update(updates)
        .eq("id", id);
      if (updateError) throw updateError;

      // 2. Delete old mirrored entry
      if (oldLoan.direction === "lent") {
        await supabase
          .from("expenses")
          .delete()
          .eq("user_id", user.id)
          .eq("category", "Loan Given")
          .eq("amount", oldLoan.amount)
          .eq("date", oldLoan.loan_date);
      } else {
        await supabase
          .from("incomes")
          .delete()
          .eq("user_id", user.id)
          .eq("source", "Loan Received")
          .eq("amount", oldLoan.amount)
          .eq("date", oldLoan.loan_date);
      }

      // 3. Create new mirrored entry with updated values
      const newDirection = updates.direction ?? oldLoan.direction;
      const newAmount = updates.amount ?? oldLoan.amount;
      const newDate = updates.loan_date ?? oldLoan.loan_date;
      const newPersonName = updates.person_name ?? oldLoan.person_name;
      const newNote = updates.note ?? oldLoan.note;

      if (newDirection === "lent") {
        const { error } = await supabase.from("expenses").insert({
          user_id: user.id,
          amount: newAmount,
          category: "Loan Given",
          date: newDate,
          note: `Lent to ${newPersonName}${newNote ? ` — ${newNote}` : ""}`,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("incomes").insert({
          user_id: user.id,
          amount: newAmount,
          source: "Loan Received",
          date: newDate,
          note: `Borrowed from ${newPersonName}${newNote ? ` — ${newNote}` : ""}`,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────
// When a loan is deleted, also remove the original mirrored entry so your
// expenses/incomes don't have a ghost record.

export function useDeleteLoan() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (loan: Loan) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Delete the loan record
      const { error } = await supabase.from("loans").delete().eq("id", loan.id);
      if (error) throw error;

      // 2. Remove the original mirrored entry
      if (loan.direction === "lent") {
        await supabase
          .from("expenses")
          .delete()
          .eq("user_id", user.id)
          .eq("category", "Loan Given")
          .eq("amount", loan.amount)
          .eq("date", loan.loan_date);
      } else {
        await supabase
          .from("incomes")
          .delete()
          .eq("user_id", user.id)
          .eq("source", "Loan Received")
          .eq("amount", loan.amount)
          .eq("date", loan.loan_date);
      }

      // 3. If already settled, also remove the settlement entry
      if (loan.is_paid) {
        if (loan.direction === "lent") {
          await supabase
            .from("incomes")
            .delete()
            .eq("user_id", user.id)
            .eq("source", "Loan Recovered")
            .eq("amount", loan.amount);
        } else {
          await supabase
            .from("expenses")
            .delete()
            .eq("user_id", user.id)
            .eq("category", "Loan Repaid")
            .eq("amount", loan.amount);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["incomes"] });
    },
  });
}