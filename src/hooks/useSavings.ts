import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  format, subMonths, startOfMonth,
  addMonths, setDate, parseISO,
} from "date-fns";

// ─── Mirror the exact cycle types from BudgetManager ─────────────────────────

export type CycleType = "calendar" | "payday";

export interface CycleConfig {
  type: CycleType;
  payday: number;
}

export interface CycleRange {
  start: Date;
  end: Date;
  label: string;
}

// ─── Replicate BudgetManager's getCycleRange logic exactly ───────────────────
// Returns the cycle that contains `ref` for the given config.

export function getCycleRangeForDate(config: CycleConfig, ref: Date): CycleRange {
  if (config.type === "calendar") {
    const start = startOfMonth(ref);
    const end = new Date(addMonths(start, 1).getTime() - 86_400_000);
    return {
      start,
      end,
      label: format(start, "MMMM yyyy"),
    };
  }

  // Payday mode — same arithmetic as BudgetManager.getCycleRange
  const day = config.payday;
  let cycleStart: Date;

  if (ref.getDate() >= day) {
    cycleStart = setDate(new Date(ref.getFullYear(), ref.getMonth(), day), day);
  } else {
    const prev = subMonths(ref, 1);
    cycleStart = setDate(new Date(prev.getFullYear(), prev.getMonth(), day), day);
  }

  const cycleEnd = new Date(addMonths(cycleStart, 1).getTime() - 86_400_000);

  return {
    start: cycleStart,
    end: cycleEnd,
    label: `${format(cycleStart, "MMM d")} – ${format(cycleEnd, "MMM d, yyyy")}`,
  };
}

// Returns the cycle range at a given integer offset from today
// offset=0 → current, offset=-1 → previous, etc.
export function getCycleRangeAtOffset(config: CycleConfig, offset: number): CycleRange {
  if (config.type === "calendar") {
    const ref = addMonths(new Date(), offset);
    return getCycleRangeForDate(config, ref);
  }

  // For payday: compute current cycle start, then shift by offset months
  const base = getCycleRangeForDate(config, new Date());
  const shiftedStart = addMonths(base.start, offset);
  const shiftedEnd = new Date(addMonths(shiftedStart, 1).getTime() - 86_400_000);

  return {
    start: shiftedStart,
    end: shiftedEnd,
    label: `${format(shiftedStart, "MMM d")} – ${format(shiftedEnd, "MMM d, yyyy")}`,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavingsEntry {
  id: string;
  user_id: string;
  amount: number;
  cycle_start: string;   // "yyyy-MM-dd" — the cycle's first day
  cycle_type: CycleType;
  note: string | null;
  created_at: string;
}

const QK = ["savings"] as const;
const QK_CYCLE = (cycleStart: string) => ["savings", "cycle", cycleStart] as const;

// ─── Fetch all entries (last 24 months for chart) ────────────────────────────

export function useSavings() {
  const { user } = useAuth();
  // Generous window: fetch 26 months back so the chart never has gaps
  const since = format(subMonths(new Date(), 25), "yyyy-MM-dd");

  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings")
        .select("*")
        .gte("cycle_start", since)
        .order("cycle_start", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SavingsEntry[];
    },
    enabled: !!user,
  });
}

// ─── Fetch the entry for a specific cycle ────────────────────────────────────

export function useSavingsForCycle(cycleStart: Date) {
  const { user } = useAuth();
  const key = format(cycleStart, "yyyy-MM-dd");

  return useQuery({
    queryKey: QK_CYCLE(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings")
        .select("*")
        .eq("cycle_start", key)
        .maybeSingle();
      if (error) throw error;
      return data as SavingsEntry | null;
    },
    enabled: !!user,
  });
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export interface UpsertSavingsPayload {
  amount: number;
  cycleStart: Date;
  cycleType: CycleType;
  note?: string;
}

export function useUpsertSavings() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: UpsertSavingsPayload) => {
      if (!user) throw new Error("Not authenticated");

      const cycleStartStr = format(payload.cycleStart, "yyyy-MM-dd");

      // Check if an entry already exists for this cycle
      const { data: existing } = await supabase
        .from("savings")
        .select("id")
        .eq("cycle_start", cycleStartStr)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("savings")
          .update({
            amount: payload.amount,
            cycle_type: payload.cycleType,
            note: payload.note ?? null,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("savings")
          .insert({
            user_id: user.id,
            amount: payload.amount,
            cycle_start: cycleStartStr,
            cycle_type: payload.cycleType,
            note: payload.note ?? null,
          });
        if (error) throw error;
      }

      return { cycleStartStr, isUpdate: !!existing };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["savings", "cycle"] });
    },
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function useDeleteSavings() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("savings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["savings", "cycle"] });
    },
  });
}