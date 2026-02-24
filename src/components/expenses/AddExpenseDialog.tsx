import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Sparkles } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useAddExpense, EXPENSE_CATEGORIES, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { toast } from "sonner";

const schema = z.object({
  amount: z.coerce.number().positive("Amount must be positive").max(99999999, "Amount too large"),
  category: z.string().min(1, "Pick a category"),
  date: z.date(),
  note: z.string().max(200, "Note too long").optional(),
});

type FormValues = z.infer<typeof schema>;

interface AddExpenseDialogProps {
  defaultDate?: string;
  onDateUsed?: () => void;
}

export function AddExpenseDialog({ defaultDate, onDateUsed }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const addExpense = useAddExpense();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: undefined, category: "", date: new Date(), note: "" },
  });

  const watchedCategory = form.watch("category");
  const accentColor = watchedCategory
    ? CATEGORY_COLORS[watchedCategory as ExpenseCategory] || CATEGORY_COLORS.Other
    : null;

  useEffect(() => {
    if (defaultDate) {
      form.setValue("date", new Date(defaultDate + "T00:00:00"));
      setOpen(true);
      onDateUsed?.();
    }
  }, [defaultDate, form, onDateUsed]);

  const onSubmit = async (values: FormValues) => {
    try {
      await addExpense.mutateAsync({
        amount: values.amount,
        category: values.category,
        date: format(values.date, "yyyy-MM-dd"),
        note: values.note || undefined,
      });
      toast.success("Expense added");
      form.reset({ amount: undefined, category: "", date: new Date(), note: "" });
      setOpen(false);
    } catch {
      toast.error("Failed to add expense");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 group flex items-center justify-center"
          aria-label="Add expense"
        >
          {/* Pulse ring */}
          <span className="absolute h-14 w-14 rounded-full bg-primary/20 animate-ping opacity-60" />
          <span
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-2xl transition-transform duration-200 group-hover:scale-110 group-active:scale-95"
          >
            <Plus className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-3xl border-border/60">
        {/* Color accent bar — reacts to selected category */}
        <div
          className="h-1 w-full transition-colors duration-500"
          style={{ backgroundColor: accentColor ?? "hsl(var(--primary))" }}
        />

        <div className="px-6 pt-5 pb-2">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black tracking-tight flex items-center gap-2">
              New Expense
              {accentColor && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full transition-all duration-300"
                  style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
                >
                  {watchedCategory}
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Log what you spent and where</p>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 pb-6 space-y-4">

            {/* Amount — hero field */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Amount
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-base">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-8 h-12 text-xl font-black rounded-xl border-border/60 focus:border-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={accentColor ? { "--tw-ring-color": accentColor } as React.CSSProperties : {}}
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Category grid */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Category
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger
                        className="h-11 rounded-xl border-border/60"
                        style={accentColor ? { borderColor: `${accentColor}50` } : {}}
                      >
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="rounded-2xl">
                      {EXPENSE_CATEGORIES.map((cat) => {
                        const color = CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other;
                        return (
                          <SelectItem key={cat} value={cat} className="rounded-xl">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              {cat}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Date + Note side by side on larger screens */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Date
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-11 rounded-xl border-border/60 text-left font-normal justify-start gap-2",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm">
                              {field.value ? format(field.value, "MMM d, yyyy") : "Pick a date"}
                            </span>
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date()}
                          initialFocus
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Note <span className="normal-case text-muted-foreground/50">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What was this for?"
                        className="resize-none rounded-xl border-border/60 text-sm h-11 min-h-[44px]"
                        rows={1}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              disabled={addExpense.isPending}
              style={
                accentColor
                  ? { backgroundColor: accentColor, color: "#fff", border: "none" }
                  : {}
              }
            >
              {addExpense.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Adding…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Add Expense
                </span>
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}