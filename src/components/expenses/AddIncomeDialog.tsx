import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronDown, Loader2, TrendingUp, Plus, Trash2 } from "lucide-react";
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
import {
    Income,
    useAddIncome,
    useUpdateIncome,
    useDeleteIncome,
    INCOME_SOURCES,
    INCOME_SOURCE_COLORS,
    type IncomeSource,
} from "@/hooks/useIncomes";
import { toast } from "sonner";

// ─── Schema ───────────────────────────────────────────────────────────────────

const incomeSchema = z.object({
    amount: z.coerce.number().positive("Amount must be positive").max(99999999, "Too large"),
    source: z.string().min(1, "Pick a source"),
    date: z.date(),
    note: z.string().max(200, "Note too long").optional(),
});

type FormValues = z.infer<typeof incomeSchema>;

const emerald = "hsl(142, 72%, 45%)";

// ─── Source Selector ──────────────────────────────────────────────────────────

function SourceSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
    const [open, setOpen] = useState(false);

    const selectedColor = value
        ? INCOME_SOURCE_COLORS[value as IncomeSource] ?? INCOME_SOURCE_COLORS.Other
        : null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
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
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedColor ?? undefined }} />
                            {value}
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Choose a source</span>
                    )}
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0", open && "rotate-180")} />
                </button>
            </PopoverTrigger>

            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-2 rounded-2xl shadow-xl border-border/60 overflow-hidden"
                align="start"
                side="bottom"
                avoidCollisions={false}
                sideOffset={6}
            >
                <div
                    className="overflow-y-auto"
                    style={{ maxHeight: "min(320px, var(--radix-popover-available-height, 320px))" }}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-0.5">
                        {INCOME_SOURCES.map((source) => {
                            const color = INCOME_SOURCE_COLORS[source as IncomeSource] ?? INCOME_SOURCE_COLORS.Other;
                            const isSelected = value === source;
                            return (
                                <button
                                    key={source}
                                    type="button"
                                    onClick={() => { onChange(source); setOpen(false); }}
                                    className={cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left transition-colors w-full",
                                        isSelected ? "font-semibold" : "hover:bg-muted text-foreground/80 hover:text-foreground"
                                    )}
                                    style={isSelected ? { backgroundColor: `${color}15`, color } : {}}
                                >
                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className="flex-1">{source}</span>
                                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddIncomeDialogProps {
    // Add mode
    defaultDate?: string;
    onDateUsed?: () => void;
    // Edit mode (controlled externally — e.g. from swipe row)
    income?: Income | null;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddIncomeDialog({
    defaultDate,
    onDateUsed,
    income,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: AddIncomeDialogProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const isEditMode = !!income;

    // Use controlled state when in edit mode, internal when in add mode
    const open = isEditMode ? (controlledOpen ?? false) : internalOpen;
    const setOpen = isEditMode
        ? (v: boolean) => controlledOnOpenChange?.(v)
        : (v: boolean) => { setInternalOpen(v); if (!v) setConfirmDelete(false); };

    const addIncome = useAddIncome();
    const updateIncome = useUpdateIncome();
    const deleteIncome = useDeleteIncome();

    const form = useForm<FormValues>({
        resolver: zodResolver(incomeSchema),
        defaultValues: { amount: undefined, source: "", date: new Date(), note: "" },
    });

    const watchedSource = form.watch("source");
    const accentColor = watchedSource
        ? INCOME_SOURCE_COLORS[watchedSource as IncomeSource] ?? null
        : null;
    const activeColor = accentColor ?? emerald;

    // Populate form when editing
    useEffect(() => {
        if (income && open) {
            form.reset({
                amount: income.amount,
                source: income.source,
                date: new Date(income.date + "T00:00:00"),
                note: income.note ?? "",
            });
            setConfirmDelete(false);
        }
    }, [income, open, form]);

    // defaultDate trigger (add mode) - only set date, don't auto-open
    useEffect(() => {
        if (defaultDate && !isEditMode) {
            form.setValue("date", new Date(defaultDate + "T00:00:00"));
            // Don't auto-open, just set the date for when user manually opens
            onDateUsed?.();
        }
    }, [defaultDate, form, onDateUsed, isEditMode]);

    const onSubmit = async (values: FormValues) => {
        try {
            if (isEditMode && income) {
                await updateIncome.mutateAsync({
                    id: income.id,
                    amount: values.amount,
                    source: values.source,
                    date: format(values.date, "yyyy-MM-dd"),
                    note: values.note || null,
                });
                toast.success("Income updated");
            } else {
                await addIncome.mutateAsync({
                    amount: values.amount,
                    source: values.source,
                    date: format(values.date, "yyyy-MM-dd"),
                    note: values.note || undefined,
                });
                toast.success("Income added");
                form.reset({ amount: undefined, source: "", date: new Date(), note: "" });
            }
            setOpen(false);
        } catch {
            toast.error(isEditMode ? "Failed to update income" : "Failed to add income");
        }
    };

    const handleDelete = async () => {
        if (!income) return;
        if (!confirmDelete) { setConfirmDelete(true); return; }
        try {
            await deleteIncome.mutateAsync(income.id);
            toast.success("Income deleted");
            setOpen(false);
        } catch {
            toast.error("Failed to delete income");
        }
    };

    const isPending = addIncome.isPending || updateIncome.isPending || deleteIncome.isPending;

    const dialogContent = (
        <DialogContent className="sm:max-w-[390px] p-0 gap-0 overflow-hidden rounded-3xl border-border/40 shadow-2xl">

            {/* Accent strip */}
            <div className="h-[3px] w-full transition-all duration-500" style={{ backgroundColor: activeColor }} />

            {/* Header */}
            <div className="px-5 pt-5 pb-3">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold tracking-tight leading-none flex items-center gap-2">
                        <span
                            className="flex h-7 w-7 items-center justify-center rounded-xl transition-colors duration-300"
                            style={{ backgroundColor: `${activeColor}20` }}
                        >
                            <TrendingUp className="h-4 w-4" style={{ color: activeColor }} />
                        </span>
                        {isEditMode ? "Edit Income" : "Add Income"}
                        {accentColor && watchedSource && (
                            <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
                            >
                                {watchedSource}
                            </span>
                        )}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        {isEditMode ? "Update this income entry" : "Log money coming in"}
                    </p>
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
                                            style={{ "--tw-ring-color": activeColor, borderColor: `${activeColor}40` } as React.CSSProperties}
                                            {...field}
                                        />
                                    </div>
                                </FormControl>
                                <FormMessage className="text-xs" />
                            </FormItem>
                        )}
                    />

                    {/* Source */}
                    <FormField
                        control={form.control}
                        name="source"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                    Source
                                </FormLabel>
                                <FormControl>
                                    <SourceSelector value={field.value} onChange={field.onChange} />
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

                    {/* ── Edit mode: Delete + Save ── */}
                    {isEditMode ? (
                        <div className="flex gap-2 pt-1">
                            {/* Delete button — first click arms, second confirms */}
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isPending}
                                className={cn(
                                    "flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-sm font-semibold border transition-all duration-200",
                                    confirmDelete
                                        ? "bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/30 scale-[1.02]"
                                        : "border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                                )}
                            >
                                {deleteIncome.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <Trash2 className="h-3.5 w-3.5" />
                                        {confirmDelete ? "Confirm?" : "Delete"}
                                    </>
                                )}
                            </button>

                            {/* Cancel */}
                            <Button
                                type="button"
                                variant="outline"
                                className="flex-1 h-11 rounded-xl border-border/60 text-sm font-semibold"
                                onClick={() => { setOpen(false); setConfirmDelete(false); }}
                                disabled={isPending}
                            >
                                Cancel
                            </Button>

                            {/* Save */}
                            <Button
                                type="submit"
                                className="flex-1 h-11 rounded-xl text-sm font-semibold tracking-wide text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98]"
                                disabled={isPending}
                                style={{
                                    backgroundColor: activeColor,
                                    border: "none",
                                    boxShadow: `0 4px 16px ${activeColor}40`,
                                }}
                            >
                                {updateIncome.isPending ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving…
                                    </span>
                                ) : "Save"}
                            </Button>
                        </div>
                    ) : (
                        /* ── Add mode: single submit ── */
                        <Button
                            type="submit"
                            className="w-full h-11 rounded-xl text-sm font-semibold tracking-wide transition-all duration-150 hover:opacity-90 active:scale-[0.98] mt-1 text-white"
                            disabled={isPending}
                            style={{
                                backgroundColor: activeColor,
                                border: "none",
                                boxShadow: `0 4px 16px ${activeColor}40`,
                            }}
                        >
                            {addIncome.isPending ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Adding…
                                </span>
                            ) : (
                                "Add Income"
                            )}
                        </Button>
                    )}
                </form>
            </Form>
        </DialogContent>
    );

    // Edit mode: controlled dialog, no trigger
    if (isEditMode) {
        return (
            <Dialog open={open} onOpenChange={setOpen}>
                {dialogContent}
            </Dialog>
        );
    }

    // Add mode: dialog with trigger button
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    className={cn(
                        "group inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2",
                        "text-xs font-bold tracking-wide transition-all duration-200",
                        "hover:scale-[1.02] active:scale-[0.97]",
                        "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
                        "hover:bg-emerald-500/20 hover:border-emerald-500/50 hover:shadow-md hover:shadow-emerald-500/10"
                    )}
                >
                    <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500 text-white transition-transform duration-200 group-hover:scale-110">
                        <Plus className="h-3 w-3" />
                    </span>
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Income</span>
                </button>
            </DialogTrigger>
            {dialogContent}
        </Dialog>
    );
}