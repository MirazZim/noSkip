import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Habit, useUpdateHabit } from "@/hooks/useHabits";
import { toast } from "sonner";

const EMOJIS = ["✅", "💪", "📖", "🏃", "🧘", "💧", "🎯", "🔥", "🌱", "💤", "🍎", "✍️"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const schema = z.object({
  name: z.string().min(1, "Name required").max(50),
  emoji: z.string().min(1),
  frequency_type: z.string().min(1),
  custom_days: z.array(z.string()).optional(),
  preferred_time: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  habit: Habit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditHabitDialog({ habit, open, onOpenChange }: Props) {
  const updateHabit = useUpdateHabit();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: habit.name,
      emoji: habit.emoji,
      frequency_type: habit.frequency_type,
      custom_days: habit.custom_days || [],
      preferred_time: habit.preferred_time || "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: habit.name,
        emoji: habit.emoji,
        frequency_type: habit.frequency_type,
        custom_days: habit.custom_days || [],
        preferred_time: habit.preferred_time || "",
      });
    }
  }, [open, habit]);

  const frequencyType = form.watch("frequency_type");

  const onSubmit = async (values: FormValues) => {
    try {
      await updateHabit.mutateAsync({
        id: habit.id,
        name: values.name,
        emoji: values.emoji,
        frequency_type: values.frequency_type,
        custom_days: values.frequency_type === "custom" ? values.custom_days : undefined,
        preferred_time: values.preferred_time || null,
      });
      toast.success("Habit updated!");
      onOpenChange(false);
    } catch {
      toast.error("Failed to update habit");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Edit Habit</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Habit name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Read 30 minutes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="emoji"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => field.onChange(e)}
                        className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center border transition-colors ${
                          field.value === e
                            ? "border-primary bg-primary/10"
                            : "border-border bg-muted/50 hover:bg-muted"
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="frequency_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="daily">Every day</SelectItem>
                      <SelectItem value="custom">Custom days</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {frequencyType === "custom" && (
              <FormField
                control={form.control}
                name="custom_days"
                render={() => (
                  <FormItem>
                    <FormLabel>Select days</FormLabel>
                    <div className="flex flex-wrap gap-3">
                      {DAYS.map((day) => (
                        <FormField
                          key={day}
                          control={form.control}
                          name="custom_days"
                          render={({ field }) => (
                            <label className="flex items-center gap-1.5 text-sm">
                              <Checkbox
                                checked={field.value?.includes(day)}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  field.onChange(
                                    checked
                                      ? [...current, day]
                                      : current.filter((d) => d !== day)
                                  );
                                }}
                              />
                              {day}
                            </label>
                          )}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="preferred_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preferred time (optional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={updateHabit.isPending}>
              {updateHabit.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
