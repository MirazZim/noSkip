import { format, subDays, isAfter, parseISO } from "date-fns";
import { Check, Trash2, Flame, Trophy, Calendar } from "lucide-react";
import { Habit, HabitCompletion, useToggleHabitCompletion, useDeleteHabit, calculateStreak, longestStreak } from "@/hooks/useHabits";
import { StreakGrid } from "./StreakGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
}

export function HabitCard({ habit, completions }: Props) {
  const toggle = useToggleHabitCompletion();
  const deleteHabit = useDeleteHabit();
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const isDoneToday = completions.some((c) => c.habit_id === habit.id && c.date === today);
  const isDoneYesterday = completions.some((c) => c.habit_id === habit.id && c.date === yesterday);
  const canRetroYesterday = !isDoneYesterday && !isAfter(parseISO(habit.start_date), parseISO(yesterday));

  const streak = calculateStreak(completions, habit.id, habit.start_date);
  const best = longestStreak(completions, habit.id);
  const totalDone = completions.filter((c) => c.habit_id === habit.id).length;

  const handleToggle = async (date: string) => {
    try {
      await toggle.mutateAsync({ habitId: habit.id, date });
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteHabit.mutateAsync(habit.id);
      toast.success("Habit deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">{habit.emoji}</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold font-display truncate">{habit.name}</h3>
            <p className="text-xs text-muted-foreground capitalize">{habit.frequency_type}</p>
          </div>
          <Button
            variant={isDoneToday ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5 transition-all", isDoneToday && "bg-primary")}
            onClick={() => handleToggle(today)}
            disabled={toggle.isPending}
          >
            <Check className="h-3.5 w-3.5" />
            {isDoneToday ? "Done" : "Check in"}
          </Button>
        </div>

        {/* Retroactive yesterday */}
        {canRetroYesterday && (
          <button
            onClick={() => handleToggle(yesterday)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Calendar className="h-3 w-3" />
            Missed yesterday? Tap to log it
          </button>
        )}

        {/* Stats row */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-destructive" />
            <span className="font-semibold">{streak}</span>
            <span className="text-muted-foreground">streak</span>
          </div>
          <div className="flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-accent-foreground" />
            <span className="font-semibold">{best}</span>
            <span className="text-muted-foreground">best</span>
          </div>
          <div className="flex items-center gap-1">
            <Check className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">{totalDone}</span>
            <span className="text-muted-foreground">total</span>
          </div>
        </div>

        {/* Streak Grid */}
        <StreakGrid habitId={habit.id} completions={completions} />

        {/* Delete */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
