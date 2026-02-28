import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Habit, HabitCompletion } from "@/hooks/useHabits";

/**
 * Shows in-app toast reminders for habits whose preferred_time
 * has passed today but haven't been completed yet.
 * Only fires once per page load.
 */
export function useHabitReminders(
  habits: Habit[] | undefined,
  completions: HabitCompletion[] | undefined
) {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current || !habits?.length || !completions) return;
    hasFired.current = true;

    const today = format(new Date(), "yyyy-MM-dd");
    const now = format(new Date(), "HH:mm");

    const completedToday = new Set(
      completions.filter((c) => c.date === today).map((c) => c.habit_id)
    );

    const dueHabits = habits.filter(
      (h) =>
        h.is_active &&
        h.preferred_time &&
        h.preferred_time <= now &&
        !completedToday.has(h.id)
    );

    if (dueHabits.length === 0) return;

    // Small delay so the page renders first
    const timer = setTimeout(() => {
      if (dueHabits.length === 1) {
        const h = dueHabits[0];
        toast.info(`${h.emoji} Time for "${h.name}"!`, {
          description: `Scheduled at ${formatTime(h.preferred_time!)}`,
          duration: 6000,
        });
      } else {
        toast.info(`⏰ ${dueHabits.length} habits waiting for you`, {
          description: dueHabits.map((h) => `${h.emoji} ${h.name}`).join(", "),
          duration: 8000,
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [habits, completions]);
}

function formatTime(time: string): string {
  try {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return time;
  }
}
