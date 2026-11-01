import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays, differenceInDays, parseISO } from "date-fns";
import { toast } from "sonner";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  frequency_type: string;
  custom_days: string[] | null;
  preferred_time: string | null;
  start_date: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  sort_order: number;
}

export interface HabitCompletion {
  id: string;
  habit_id: string;
  date: string;
  status: string;
  is_retroactive: boolean;
  user_id: string;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────

export function useHabits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .eq("category", "habit")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Habit[];
    },
    enabled: !!user,
  });
}

export function useHabitCompletions() {
  const { user } = useAuth();
  const start = format(subDays(new Date(), 365), "yyyy-MM-dd");
  return useQuery({
    queryKey: ["habit_completions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habit_completions")
        .select("*")
        .gte("date", start);
      if (error) throw error;
      return data as HabitCompletion[];
    },
    enabled: !!user,
  });
}

// ─────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────

export function useAddHabit() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (habit: {
      name: string;
      emoji: string;
      frequency_type: string;
      custom_days?: string[];
      preferred_time?: string | null;
    }) => {
      const { data: existing } = await supabase
        .from("habits")
        .select("sort_order")
        .eq("user_id", user!.id)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

      const { error } = await supabase.from("habits").insert({
        name: habit.name,
        emoji: habit.emoji,
        frequency_type: habit.frequency_type,
        custom_days: habit.custom_days || [],
        preferred_time: habit.preferred_time || null,
        user_id: user!.id,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["habits"] }),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name: string;
      emoji: string;
      frequency_type: string;
      custom_days?: string[];
      preferred_time?: string | null;
    }) => {
      const { error } = await supabase
        .from("habits")
        .update({
          name: updates.name,
          emoji: updates.emoji,
          frequency_type: updates.frequency_type,
          custom_days: updates.custom_days || [],
          preferred_time: updates.preferred_time || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["habits"] }),
  });
}

export function useDeleteHabit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("habits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["habit_completions"] });
    },
  });
}

/**
 * Toggle a habit's completion for a date.
 *
 * Optimistic: the completions cache flips instantly, so streaks, rings and
 * totals update on tap. The write is a single round trip — the direction
 * (insert vs delete) comes from the cache rather than a SELECT first — and
 * there's no full refetch afterwards; the inserted row replaces the
 * placeholder. On error the snapshot is restored.
 */
export function useToggleHabitCompletion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const key = ["habit_completions", user?.id];

  return useMutation({
    onMutate: async ({ habitId, date }: { habitId: string; date: string }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<HabitCompletion[]>(key) ?? [];
      const wasDone = snapshot.some((c) => c.habit_id === habitId && c.date === date);
      const tempId = `temp-${habitId}-${date}`;

      queryClient.setQueryData<HabitCompletion[]>(key, wasDone
        ? snapshot.filter((c) => !(c.habit_id === habitId && c.date === date))
        : [...snapshot, {
            id: tempId,
            habit_id: habitId,
            date,
            status: "completed",
            is_retroactive: date !== format(new Date(), "yyyy-MM-dd"),
            user_id: user!.id,
            created_at: new Date().toISOString(),
          }]);

      return { snapshot, tempId };
    },

    mutationFn: async ({ habitId, date }: { habitId: string; date: string }) => {
      // onMutate has already run, so the cache holds the *target* state.
      const target = queryClient.getQueryData<HabitCompletion[]>(key) ?? [];
      const nowDone = target.some((c) => c.habit_id === habitId && c.date === date);

      if (!nowDone) {
        const { error } = await supabase
          .from("habit_completions")
          .delete()
          .eq("habit_id", habitId)
          .eq("date", date);
        if (error) throw error;
        return null;
      }

      const { data, error } = await supabase
        .from("habit_completions")
        .insert({
          habit_id: habitId,
          date,
          user_id: user!.id,
          is_retroactive: date !== format(new Date(), "yyyy-MM-dd"),
        })
        .select()
        .single();
      if (error) throw error;
      return data as HabitCompletion;
    },

    onSuccess: (row, _vars, context) => {
      if (!row || !context) return;
      queryClient.setQueryData<HabitCompletion[]>(key, (old = []) =>
        old.map((c) => (c.id === context.tempId ? row : c))
      );
    },

    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(key, context.snapshot);
      queryClient.invalidateQueries({ queryKey: ["habit_completions"] });
    },
  });
}

/**
 * Bulk reorder — fires after a drag-and-drop ends.
 * Receives the full new ordered array and writes sort_order
 * for every habit in parallel (Promise.all).
 *
 * Optimistic: cache is updated instantly. On error the snapshot
 * is restored and a toast informs the user.
 */
export function useReorderHabits() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    onMutate: async ({ orderedHabits }: { orderedHabits: Habit[] }) => {
      await queryClient.cancelQueries({ queryKey: ["habits", user?.id] });
      const snapshot = queryClient.getQueryData<Habit[]>(["habits", user?.id]);

      // Assign 1-based sort_order matching the new visual order
      const optimistic = orderedHabits.map((h, i) => ({
        ...h,
        sort_order: i + 1,
      }));
      queryClient.setQueryData(["habits", user?.id], optimistic);

      return { snapshot };
    },

    mutationFn: async ({ orderedHabits }: { orderedHabits: Habit[] }) => {
      // Fire all updates in parallel — O(n) but n is tiny for habits
      const results = await Promise.all(
        orderedHabits.map((habit, index) =>
          supabase
            .from("habits")
            .update({ sort_order: index + 1 })
            .eq("id", habit.id)
        )
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(["habits", user?.id], context.snapshot);
      }
      toast.error("Couldn't save order — changes rolled back");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

// ─────────────────────────────────────────────────────────
// Pure utility functions (unchanged)
// ─────────────────────────────────────────────────────────

export function calculateStreak(
  completions: HabitCompletion[],
  habitId: string,
  startDate: string
): number {
  const set = new Set(
    completions.filter((c) => c.habit_id === habitId).map((c) => c.date)
  );
  const today = format(new Date(), "yyyy-MM-dd");
  let streak = 0;
  let current = today;

  if (!set.has(today)) {
    const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
    if (!set.has(yesterday)) return 0;
    current = yesterday;
  }

  while (set.has(current) && current >= startDate) {
    streak++;
    current = format(subDays(parseISO(current), 1), "yyyy-MM-dd");
  }
  return streak;
}

export function longestStreak(
  completions: HabitCompletion[],
  habitId: string
): number {
  const dates = completions
    .filter((c) => c.habit_id === habitId)
    .map((c) => c.date)
    .sort();
  if (!dates.length) return 0;

  let max = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (differenceInDays(parseISO(dates[i]), parseISO(dates[i - 1])) === 1) {
      run++;
      max = Math.max(max, run);
    } else {
      run = 1;
    }
  }
  return max;
}