import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Check, ChevronDown, X, Tag, Palette, Loader2, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useAddExpense, EXPENSE_CATEGORIES, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import {
  useCustomCategories,
  useCreateCustomCategory,
  useDeleteCustomCategory,
  type CustomCategory,
} from "@/hooks/useCustomCategories";
import { toast } from "sonner";

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#14b8a6", "#a16207", "#64748b", "#d946ef",
];

// ─── Schema ───────────────────────────────────────────────────────────────────

const expenseSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive").max(99999999, "Too large"),
  category: z.string().min(1, "Pick a category"),
  date: z.date(),
  note: z.string().max(200, "Note too long").optional(),
});

type FormValues = z.infer<typeof expenseSchema>;

// ─── Create Category Panel ────────────────────────────────────────────────────

interface CreateCategoryPanelProps {
  onCreated: (cat: CustomCategory) => void;
  onCancel: () => void;
  existingNames: string[];
}

function CreateCategoryPanel({ onCreated, onCancel, existingNames }: CreateCategoryPanelProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[5]);
  const [error, setError] = useState("");

  const createCategory = useCreateCustomCategory();

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("Name is required"); return; }
    if (trimmed.length > 24) { setError("Max 24 characters"); return; }
    if (existingNames.map((n) => n.toLowerCase()).includes(trimmed.toLowerCase())) {
      setError("Category already exists");
      return;
    }

    try {
      const newCat = await createCategory.mutateAsync({ name: trimmed, color });
      onCreated(newCat);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create category";
      setError(message);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-300"
            style={{ backgroundColor: `${color}20` }}
          >
            <Tag className="h-3.5 w-3.5 transition-colors duration-300" style={{ color }} />
          </div>
          <span className="text-sm font-semibold text-foreground">New Category</span>
        </div>
        <button
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted transition-colors"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Label
        </label>
        <div className="relative">
          <Input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Smoking, Gym, Coffee…"
            maxLength={24}
            className="h-10 rounded-xl border-border/60 pr-10 text-sm"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/50 tabular-nums select-none">
            {name.length}/24
          </span>
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>

      {/* Color */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Palette className="h-3 w-3" /> Color
        </label>
        <div className="grid grid-cols-6 gap-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="h-8 w-full rounded-lg transition-transform duration-150 hover:scale-110 active:scale-95 flex items-center justify-center"
              style={{ backgroundColor: c }}
              aria-label={c}
            >
              {c === color && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors duration-300"
        style={{ backgroundColor: `${color}12` }}
      >
        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium" style={{ color }}>
          {name.trim() || "Your category"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-9 rounded-xl border-border/60 text-xs"
          onClick={onCancel}
          disabled={createCategory.isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1 h-9 rounded-xl text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
          onClick={handleCreate}
          disabled={createCategory.isPending}
        >
          {createCategory.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Create"
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Category Selector ────────────────────────────────────────────────────────

interface CategorySelectorProps {
  value: string;
  onChange: (val: string) => void;
  customCategories: CustomCategory[];
  allNames: string[];
  onCategoryCreated: (cat: CustomCategory) => void;
}

function CategorySelector({
  value,
  onChange,
  customCategories,
  allNames,
  onCategoryCreated,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const deleteCategory = useDeleteCustomCategory();

  const selectedColor = value
    ? CATEGORY_COLORS[value as ExpenseCategory]
    ?? customCategories.find((c) => c.name === value)?.color
    ?? "#64748b"
    : null;

  const handleCreated = (cat: CustomCategory) => {
    onCategoryCreated(cat);
    onChange(cat.name);
    setCreating(false);
    setOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent, cat: CustomCategory) => {
    e.stopPropagation();
    try {
      await deleteCategory.mutateAsync(cat.id);
      if (value === cat.name) onChange("");
      toast.success(`"${cat.name}" removed`);
    } catch {
      toast.error("Failed to delete category");
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreating(false); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full h-11 flex items-center justify-between gap-2 px-3.5 rounded-xl border text-sm transition-all duration-200",
            open
              ? "border-primary/50 ring-2 ring-primary/10"
              : "border-border/60 hover:border-border"
          )}
          style={selectedColor ? { borderColor: `${selectedColor}50` } : {}}
        >
          {value ? (
            <span className="flex items-center gap-2.5 font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: selectedColor ?? undefined }}
              />
              {value}
            </span>
          ) : (
            <span className="text-muted-foreground">Choose a category</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
              open && "rotate-180"
            )}
          />
        </button>
      </PopoverTrigger>

      {/*
        overflow-hidden on PopoverContent stops Radix from stretching it
        beyond the viewport, which would make the inner div never actually
        overflow and therefore never show a scrollbar.
      */}
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-2 rounded-2xl shadow-xl border-border/60 overflow-hidden"
        align="start"
        side="bottom"
        avoidCollisions={false}
        sideOffset={6}
      >
        {/*
          Single scrollable wrapper for both list and create panel.
          - maxHeight uses the Radix CSS var so it never clips off-screen on any device.
          - onWheel / onTouchMove stopPropagation prevent the Dialog's body
            scroll-lock from stealing scroll events before they reach this div.
        */}
        <div
          className="overflow-y-auto"
          style={{ maxHeight: "min(320px, var(--radix-popover-available-height, 320px))" }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {creating ? (
            <CreateCategoryPanel
              onCreated={handleCreated}
              onCancel={() => setCreating(false)}
              existingNames={allNames}
            />
          ) : (
            <div className="flex flex-col gap-0.5">
              {/* Built-in categories */}
              {EXPENSE_CATEGORIES.map((cat) => {
                const color = CATEGORY_COLORS[cat as ExpenseCategory] ?? "#64748b";
                const isSelected = value === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { onChange(cat); setOpen(false); }}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors w-full",
                      isSelected
                        ? "font-semibold"
                        : "hover:bg-muted text-foreground/80 hover:text-foreground"
                    )}
                    style={isSelected ? { backgroundColor: `${color}15`, color } : {}}
                  >
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="flex-1">{cat}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}

              {/* Custom categories */}
              {customCategories.length > 0 && (
                <>
                  <div className="mx-3 my-1.5 h-px bg-border/50" />
                  <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                    Custom
                  </p>
                  {customCategories.map((cat) => {
                    const isSelected = value === cat.name;
                    return (
                      <div
                        key={cat.id}
                        className={cn(
                          "group flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors",
                          isSelected
                            ? "font-semibold"
                            : "hover:bg-muted text-foreground/80 hover:text-foreground"
                        )}
                        style={isSelected ? { backgroundColor: `${cat.color}15`, color: cat.color } : {}}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-2.5 flex-1 text-left"
                          onClick={() => { onChange(cat.name); setOpen(false); }}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="flex-1">{cat.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, cat)}
                          disabled={deleteCategory.isPending}
                          className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-lg hover:bg-destructive/10 transition-all duration-150 shrink-0"
                          aria-label={`Delete ${cat.name}`}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              {/* Create new */}
              <div className="mx-3 my-1.5 h-px bg-border/50" />
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors w-full"
              >
                <Plus className="h-3.5 w-3.5" />
                Create custom category…
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

interface AddExpenseDialogProps {
  defaultDate?: string;
  onDateUsed?: () => void;
}

export function AddExpenseDialog({ defaultDate, onDateUsed }: AddExpenseDialogProps) {
  const [open, setOpen] = useState(false);
  const addExpense = useAddExpense();

  const { data: customCategories = [], isLoading: categoriesLoading } = useCustomCategories();

  const form = useForm<FormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { amount: undefined, category: "", date: new Date(), note: "" },
  });

  const watchedCategory = form.watch("category");

  const accentColor = watchedCategory
    ? CATEGORY_COLORS[watchedCategory as ExpenseCategory]
    ?? customCategories.find((c) => c.name === watchedCategory)?.color
    ?? null
    : null;

  const allCategoryNames = [
    ...EXPENSE_CATEGORIES,
    ...customCategories.map((c) => c.name),
  ];

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
      {/* FAB */}
      <DialogTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Add expense"
        >
          <span className="absolute inset-0 rounded-2xl bg-foreground/10 scale-100 group-hover:scale-110 transition-transform duration-300" />
          <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg shadow-foreground/20 transition-all duration-200 group-hover:rounded-xl group-active:scale-95">
            <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[390px] p-0 gap-0 overflow-hidden rounded-3xl border-border/40 shadow-2xl">
        {/* Accent strip */}
        <div
          className="h-[3px] w-full transition-all duration-500"
          style={{ backgroundColor: accentColor ?? "hsl(var(--primary))" }}
        />

        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight leading-none flex items-center gap-2">
              Add Expense
              {accentColor && watchedCategory && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                >
                  {watchedCategory}
                </span>
              )}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">Track where your money goes</p>
          </DialogHeader>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-5 pb-5 space-y-3.5">

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Amount
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-base select-none pointer-events-none">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        className="pl-8 h-12 text-2xl font-bold rounded-xl border-border/60 focus-visible:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        style={
                          accentColor
                            ? { "--tw-ring-color": accentColor, borderColor: `${accentColor}40` } as React.CSSProperties
                            : {}
                        }
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Category
                  </FormLabel>
                  <FormControl>
                    {categoriesLoading ? (
                      <div className="h-11 rounded-xl border border-border/60 flex items-center px-3.5 gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading…
                      </div>
                    ) : (
                      <CategorySelector
                        value={field.value}
                        onChange={field.onChange}
                        customCategories={customCategories}
                        allNames={allCategoryNames}
                        onCategoryCreated={() => { }}
                      />
                    )}
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Date & Note */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Date
                    </FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "h-11 rounded-xl border-border/60 font-normal justify-start gap-2 text-sm w-full px-3",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">
                              {field.value ? format(field.value, "MMM d") : "Today"}
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
                    <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Note
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional…"
                        className="resize-none rounded-xl border-border/60 text-sm h-11 min-h-[44px] py-3 leading-tight"
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
              className="w-full h-11 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 hover:opacity-90 active:scale-[0.98] mt-1"
              disabled={addExpense.isPending}
              style={
                accentColor
                  ? {
                    backgroundColor: accentColor,
                    color: "#fff",
                    border: "none",
                    boxShadow: `0 4px 16px ${accentColor}40`,
                  }
                  : {}
              }
            >
              {addExpense.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding…
                </span>
              ) : (
                "Add Expense"
              )}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}