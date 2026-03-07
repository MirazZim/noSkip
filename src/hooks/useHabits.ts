import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, subDays, differenceInDays, isAfter, parseISO } from "date-fns";

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

export function useHabits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habits", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Habit[];
    },
    enabled: !!user,
  });
}

export function useHabitCompletions() {
  const { user } = useAuth();
  // Fetch last 365 days of completions
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

export function useAddHabit() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (habit: { name: string; emoji: string; frequency_type: string; custom_days?: string[]; preferred_time?: string | null }) => {
      const { error } = await supabase.from("habits").insert({
        name: habit.name,
        emoji: habit.emoji,
        frequency_type: habit.frequency_type,
        custom_days: habit.custom_days || [],
        preferred_time: habit.preferred_time || null,
        user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["habits"] }),
  });
}

export function useUpdateHabit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name: string; emoji: string; frequency_type: string; custom_days?: string[]; preferred_time?: string | null }) => {
      const { error } = await supabase.from("habits").update({
        name: updates.name,
        emoji: updates.emoji,
        frequency_type: updates.frequency_type,
        custom_days: updates.custom_days || [],
        preferred_time: updates.preferred_time || null,
      }).eq("id", id);
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

export function useToggleHabitCompletion() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ habitId, date }: { habitId: string; date: string }) => {
      // Check if completion exists
      const { data: existing } = await supabase
        .from("habit_completions")
        .select("id")
        .eq("habit_id", habitId)
        .eq("date", date)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("habit_completions").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        const today = format(new Date(), "yyyy-MM-dd");
        const isRetroactive = date !== today;
        const { error } = await supabase.from("habit_completions").insert({
          habit_id: habitId,
          date,
          user_id: user!.id,
          is_retroactive: isRetroactive,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["habit_completions"] }),
  });
}

/** Calculate current streak for a habit */
export function calculateStreak(
  completions: HabitCompletion[],
  habitId: string,
  startDate: string
): number {
  const habitCompletions = completions
    .filter((c) => c.habit_id === habitId)
    .map((c) => c.date)
    .sort((a, b) => b.localeCompare(a));

  const set = new Set(habitCompletions);
  const today = format(new Date(), "yyyy-MM-dd");
  let streak = 0;
  let current = today;

  // If today is not done, start from yesterday
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

/** Calculate longest streak */
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
