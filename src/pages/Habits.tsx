import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AddHabitDialog } from "@/components/habits/AddHabitDialog";
import { HabitListItem } from "@/components/habits/HabitListItem";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { HabitQuote } from "@/components/habits/HabitQuote";
import { useHabits, useHabitCompletions } from "@/hooks/useHabits";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { Skeleton } from "@/components/ui/skeleton";

export default function Habits() {
  const { data: habits, isLoading: habitsLoading } = useHabits();
  const { data: completions, isLoading: completionsLoading } = useHabitCompletions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useHabitReminders(habits, completions);

  const isLoading = habitsLoading || completionsLoading;
  const activeHabits = habits?.filter((h) => h.is_active) || [];
  const selectedHabit = activeHabits.find((h) => h.id === selectedId) || activeHabits[0] || null;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Habits</h1>
            <p className="text-muted-foreground text-sm">Build and track your daily habits</p>
          </div>
          <AddHabitDialog />
        </div>

        <HabitQuote />

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : activeHabits.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-3xl mb-2">🎯</p>
            <p className="text-muted-foreground">No habits yet. Create one to start building streaks!</p>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Habit list */}
            <div className="flex-1 min-w-0 rounded-xl border border-border bg-card overflow-hidden">
              {activeHabits.map((habit) => (
                <HabitListItem
                  key={habit.id}
                  habit={habit}
                  completions={completions || []}
                  isSelected={habit.id === (selectedHabit?.id)}
                  onSelect={() => setSelectedId(habit.id)}
                />
              ))}
            </div>

            {/* Detail sidebar */}
            {selectedHabit && (
              <div className="hidden lg:block w-[32rem] flex-shrink-0">
                <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
                  <HabitDetailPanel habit={selectedHabit} completions={completions || []} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
