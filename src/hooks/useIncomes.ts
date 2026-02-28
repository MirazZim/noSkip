import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, format, subMonths } from "date-fns";

// ─── Constants ────────────────────────────────────────────────────────────────

export const INCOME_SOURCES = [
    "Salary",
    "Freelance",
    "Business",
    "Investment",
    "Rental",
    "Gift",
    "Other",
] as const;

export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const INCOME_SOURCE_COLORS: Record<IncomeSource, string> = {
    Salary: "hsl(142, 72%, 45%)",
    Freelance: "hsl(173, 80%, 40%)",
    Business: "hsl(199, 85%, 48%)",
    Investment: "hsl(262, 70%, 58%)",
    Rental: "hsl(32, 95%, 54%)",
    Gift: "hsl(340, 70%, 55%)",
    Other: "hsl(220, 10%, 55%)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Income {
    id: string;
    user_id: string;
    amount: number;
    source: string;
    note: string | null;
    date: string;
    created_at: string;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export function useIncomes(month: Date) {
    const { user } = useAuth();
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    return useQuery({
        queryKey: ["incomes", user?.id, start],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("incomes")
                .select("*")
                .gte("date", start)
                .lte("date", end)
                .order("date", { ascending: false });
            if (error) throw error;
            return data as Income[];
        },
        enabled: !!user,
    });
}

export function usePrevMonthIncomes(month: Date) {
    const { user } = useAuth();
    const prev = subMonths(month, 1);
    const start = format(startOfMonth(prev), "yyyy-MM-dd");
    const end = format(endOfMonth(prev), "yyyy-MM-dd");

    return useQuery({
        queryKey: ["incomes", user?.id, start],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("incomes")
                .select("*")
                .gte("date", start)
                .lte("date", end);
            if (error) throw error;
            return data as Income[];
        },
        enabled: !!user,
    });
}

// ─── Add ─────────────────────────────────────────────────────────────────────

export function useAddIncome() {
    const qc = useQueryClient();
    const { user } = useAuth();

    return useMutation({
        mutationFn: async (income: {
            amount: number;
            source: string;
            date: string;
            note?: string;
        }) => {
            if (!user) throw new Error("Not authenticated");
            const { error } = await supabase.from("incomes").insert({
                ...income,
                user_id: user.id,
            });
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["incomes"] });
        },
    });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function useUpdateIncome() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (income: {
            id: string;
            amount: number;
            source: string;
            date: string;
            note: string | null;
        }) => {
            const { error } = await supabase
                .from("incomes")
                .update({
                    amount: income.amount,
                    source: income.source,
                    date: income.date,
                    note: income.note,
                })
                .eq("id", income.id);
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["incomes"] });
        },
    });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteIncome() {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("incomes").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["incomes"] });
        },
    });
}