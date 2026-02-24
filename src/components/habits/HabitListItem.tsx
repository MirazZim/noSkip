import { useState } from "react";
import { format, subDays, isAfter, parseISO } from "date-fns";
import { Check, Calendar, MoreVertical, Trash2, Pencil } from "lucide-react";
import { Habit, HabitCompletion, useToggleHabitCompletion, useDeleteHabit, calculateStreak } from "@/hooks/useHabits";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditHabitDialog } from "./EditHabitDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
  isSelected: boolean;
  onSelect: () => void;
}

export function HabitListItem({ habit, completions, isSelected, onSelect }: Props) {
  const toggle = useToggleHabitCompletion();
  const deleteHabit = useDeleteHabit();
  const [editOpen, setEditOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const isDoneToday = completions.some((c) => c.habit_id === habit.id && c.date === today);
  const isDoneYesterday = completions.some((c) => c.habit_id === habit.id && c.date === yesterday);
  const canRetroYesterday = !isDoneYesterday && !isAfter(parseISO(habit.start_date), parseISO(yesterday));
  const streak = calculateStreak(completions, habit.id, habit.start_date);
  const totalDone = completions.filter((c) => c.habit_id === habit.id).length;

  const handleToggle = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
    <>
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border hover:bg-muted/50",
          isSelected && "bg-primary/5 border-l-2 border-l-primary"
        )}
      >
        <span className="text-xl flex-shrink-0">{habit.emoji}</span>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{habit.name}</h3>
          <p className="text-xs text-muted-foreground">
            {totalDone} completions · {streak > 0 ? `🔥 ${streak} day streak` : "No active streak"}
          </p>
        </div>

        {canRetroYesterday && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1 h-7"
            onClick={(e) => handleToggle(yesterday, e)}
            disabled={toggle.isPending}
          >
            <Calendar className="h-3 w-3" />
            Yesterday
          </Button>
        )}

        <Button
          variant={isDoneToday ? "default" : "outline"}
          size="sm"
          className={cn("gap-1 h-8 text-xs", isDoneToday && "bg-primary")}
          onClick={(e) => handleToggle(today, e)}
          disabled={toggle.isPending}
        >
          <Check className="h-3.5 w-3.5" />
          {isDoneToday ? "Done" : "Check in"}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <EditHabitDialog habit={habit} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
