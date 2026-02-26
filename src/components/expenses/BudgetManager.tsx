import { useState, useMemo, useEffect } from "react";
import { Settings2, X, Sparkles, TrendingUp, Calendar, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useUpsertBudget, useDeleteBudget, EXPENSE_CATEGORIES,
  Budget, Expense, CATEGORY_COLORS, type ExpenseCategory,
} from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  format, startOfMonth, endOfMonth, setDate,
  addMonths, subMonths, isAfter, isBefore, parseISO,
} from "date-fns";

interface Props {
  budgets: Budget[];
  expenses: Expense[];
  month: Date;
}

/* ─── Cycle helpers ──────────────────────────────────────────────────── */
type CycleType = "calendar" | "payday";
interface CycleConfig { type: CycleType; payday: number; }
interface CycleRange { start: Date; end: Date; label: string; daysLeft: number; daysTotal: number; }

function getCycleRange(config: CycleConfig, ref: Date): CycleRange {
  if (config.type === "calendar") {
    const start = startOfMonth(ref);
    const end   = endOfMonth(ref);
    const daysTotal = end.getDate();
    const daysLeft  = daysTotal - ref.getDate() + 1;
    return { start, end, label: format(ref, "MMMM yyyy"), daysLeft, daysTotal };
  }

  const day = config.payday;
  let cycleStart: Date;
  if (ref.getDate() >= day) {
    cycleStart = setDate(new Date(ref.getFullYear(), ref.getMonth(), day), day);
  } else {
    const prev = subMonths(ref, 1);
    cycleStart = setDate(new Date(prev.getFullYear(), prev.getMonth(), day), day);
  }
  const nextPayday = addMonths(cycleStart, 1);
  const cycleEnd   = new Date(nextPayday.getTime() - 86_400_000);
  const daysTotal  = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86_400_000) + 1;
  const daysLeft   = Math.round((cycleEnd.getTime() - ref.getTime()) / 86_400_000) + 1;

  return {
    start: cycleStart,
    end:   cycleEnd,
    label: `${format(cycleStart, "MMM d")} – ${format(cycleEnd, "MMM d, yyyy")}`,
    daysLeft: Math.max(0, daysLeft),
    daysTotal,
  };
}

function statusColor(pct: number) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#10b981";
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const STORAGE_KEY = "budget_cycle_v1";
function loadConfig(): CycleConfig {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) return JSON.parse(r); } catch {}
  return { type: "calendar", payday: 1 };
}
function saveConfig(c: CycleConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
}

/* ═══════════════════════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════════════════════ */
export function BudgetManager({ budgets, expenses, month }: Props) {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState<"budget" | "cycle">("budget");
  const [category, setCategory] = useState("Overall");
  const [amount, setAmount]     = useState("");
  const [config, setConfig]     = useState<CycleConfig>(loadConfig);
  const [draft, setDraft]       = useState<CycleConfig>(loadConfig);

  const upsert = useUpsertBudget();
  const remove = useDeleteBudget();
  const { formatAmount } = useCurrency();

  useEffect(() => { saveConfig(config); }, [config]);

  const cycle = useMemo(() => getCycleRange(config, new Date()), [config]);

  // Expenses scoped to the active cycle window
  const cycleExpenses = useMemo(() =>
    expenses.filter((e) => {
      const d = parseISO(e.date);
      return !isBefore(d, cycle.start) && !isAfter(d, cycle.end);
    }),
    [expenses, cycle]
  );

  const categoryBudgets = budgets.filter((b) => b.category !== "Overall");

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    try {
      await upsert.mutateAsync({ amount: num, category, month });
      toast.success("Budget saved");
      setAmount("");
    } catch { toast.error("Failed to save budget"); }
  };

  const handleDelete = async (id: string) => {
    try { await remove.mutateAsync(id); toast.success("Budget removed"); }
    catch { toast.error("Failed to remove budget"); }
  };

  const handleApply = () => {
    setConfig(draft);
    setOpen(false);
    toast.success(
      draft.type === "calendar"
        ? "Switched to calendar month"
        : `Payday cycle set — starts on the ${ordinal(draft.payday)} 🎉`
    );
  };

  const draftCyclePreview = useMemo(
    () => draft.type === "payday" ? getCycleRange(draft, new Date()) : null,
    [draft]
  );

  const cyclePct = (cycle.daysTotal - cycle.daysLeft) / cycle.daysTotal;

  return (
    <>
      {/* ── Inline budget bars ───────────────────────────────────────── */}
      {categoryBudgets.length > 0 && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Limits</p>
                <p className="text-base font-black tracking-tight">Category Budgets</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {/* Cycle mode badge */}
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                  config.type === "payday"
                    ? "bg-violet-500/15 text-violet-500"
                    : "bg-muted text-muted-foreground"
                )}>
                  {config.type === "payday" ? "💰 Payday" : "📅 Calendar"}
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">{cycle.label}</span>
              </div>
            </div>

            {/* Cycle progress strip */}
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {cycle.daysLeft === 1 ? "Last day of cycle" : `${cycle.daysLeft} days left`}
                </span>
                <span className="text-[10px] font-bold text-muted-foreground">{Math.round(cyclePct * 100)}% through</span>
              </div>
              <div className="h-[3px] w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-foreground/20 transition-all duration-700"
                  style={{ width: `${cyclePct * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Budget rows */}
          <div className="divide-y divide-border/40">
            {categoryBudgets.map((b, i) => {
              const spent = cycleExpenses
                .filter((e) => e.category === b.category)
                .reduce((s, e) => s + e.amount, 0);
              const pct  = Math.min((spent / b.amount) * 100, 100);
              const color = CATEGORY_COLORS[b.category as ExpenseCategory] || CATEGORY_COLORS.Other;
              const sc   = statusColor(pct);
              const remaining = b.amount - spent;

              return (
                <div key={b.id} className="group px-5 py-3"
                  style={{ animation: "fadeSlideIn 0.3s ease both", animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-xl flex items-center justify-center"
                        style={{ backgroundColor: `${color}20` }}>
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none">{b.category}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                          {formatAmount(spent)} of {formatAmount(b.amount)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold tabular-nums" style={{ color: sc }}>
                        {remaining >= 0
                          ? `${formatAmount(remaining)} left`
                          : `${formatAmount(Math.abs(remaining))} over`}
                      </span>
                      <button onClick={() => handleDelete(b.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500/10"
                        aria-label="Remove budget">
                        <X className="h-3 w-3 text-rose-500" />
                      </button>
                    </div>
                  </div>
                  <div className="h-[5px] w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`, backgroundColor: sc,
                        animation: "growWidth 0.7s ease both",
                        animationDelay: `${i * 50 + 100}ms`,
                      }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) { setDraft(config); setTab("budget"); } }}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-2 h-9 px-4 rounded-2xl border border-border/60 bg-card text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:shadow-md hover:bg-muted/40 active:scale-95">
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
            Set Budget
          </button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden rounded-3xl border-border/60">
          {/* Accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-primary to-emerald-500" />

          <div className="px-6 pt-5 pb-3">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-black tracking-tight flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Budget Settings
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active cycle: <span className="font-semibold text-foreground">{cycle.label}</span>
              </p>
            </DialogHeader>
          </div>

          {/* Tab pills */}
          <div className="px-6 pb-3">
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              {(["budget", "cycle"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200",
                    tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                  )}>
                  {t === "budget" ? "💰 Budget" : "📅 Cycle"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Budget tab ──────────────────────────────────────────── */}
          {tab === "budget" && (
            <div className="px-6 pb-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="h-11 rounded-xl border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Overall">Overall</SelectItem>
                    {EXPENSE_CATEGORIES.map((cat) => {
                      const color = CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other;
                      return (
                        <SelectItem key={cat} value={cat} className="rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                            {cat}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  Limit for this cycle
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-base">$</span>
                  <Input type="number" placeholder="0.00" value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    className="pl-8 h-12 text-xl font-black rounded-xl border-border/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                </div>
              </div>

              <Button onClick={handleSave} disabled={upsert.isPending}
                className="w-full h-12 rounded-xl text-sm font-bold tracking-wide transition-all hover:scale-[1.01] active:scale-[0.99]">
                {upsert.isPending
                  ? <span className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Saving…</span>
                  : <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" />Save Budget</span>}
              </Button>

              {budgets.length > 0 && (
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground pb-1">Active Budgets</p>
                  {budgets.map((b) => {
                    const color = CATEGORY_COLORS[b.category as ExpenseCategory] || CATEGORY_COLORS.Other;
                    return (
                      <div key={b.id} className="group flex items-center justify-between rounded-xl px-3 py-2 hover:bg-muted/40 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: b.category === "Overall" ? "hsl(var(--primary))" : color }} />
                          <span className="text-sm font-semibold">{b.category}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm tabular-nums font-bold text-muted-foreground">{formatAmount(b.amount)}</span>
                          <button onClick={() => handleDelete(b.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-500/10">
                            <X className="h-3 w-3 text-rose-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Cycle tab ───────────────────────────────────────────── */}
          {tab === "cycle" && (
            <div className="px-6 pb-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Align your budget window with how you actually receive money — by calendar month or by your payday.
              </p>

              {/* Option A: Calendar month */}
              <button
                onClick={() => setDraft((d) => ({ ...d, type: "calendar" }))}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-150",
                  draft.type === "calendar"
                    ? "border-foreground/20 bg-foreground/[0.04] ring-1 ring-foreground/10"
                    : "border-border/60 hover:bg-muted/40"
                )}>
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  draft.type === "calendar" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                )}>
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">Calendar Month</p>
                  <p className="text-xs text-muted-foreground">1st → last day of every month</p>
                </div>
                <div className={cn(
                  "h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                  draft.type === "calendar" ? "border-foreground" : "border-border"
                )}>
                  {draft.type === "calendar" && <div className="h-2 w-2 rounded-full bg-foreground" />}
                </div>
              </button>

              {/* Option B: Payday */}
              <button
                onClick={() => setDraft((d) => ({ ...d, type: "payday" }))}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-150",
                  draft.type === "payday"
                    ? "border-violet-500/30 bg-violet-500/[0.06] ring-1 ring-violet-500/20"
                    : "border-border/60 hover:bg-muted/40"
                )}>
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                  draft.type === "payday" ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  <Zap className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">Payday-to-Payday</p>
                  <p className="text-xs text-muted-foreground">Starts on your salary date each month</p>
                </div>
                <div className={cn(
                  "h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                  draft.type === "payday" ? "border-violet-500" : "border-border"
                )}>
                  {draft.type === "payday" && <div className="h-2 w-2 rounded-full bg-violet-500" />}
                </div>
              </button>

              {/* Payday day picker */}
              {draft.type === "payday" && (
                <div
                  className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3"
                  style={{ animation: "fadeSlideIn 0.2s ease both" }}>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-violet-500">Salary Date</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Which day of the month do you get paid?</p>
                  </div>

                  {/* Day grid — 1 to 28 */}
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                      const active = draft.payday === d;
                      return (
                        <button key={d}
                          onClick={() => setDraft((c) => ({ ...c, payday: d }))}
                          className={cn(
                            "h-9 w-full rounded-xl text-xs font-bold transition-all duration-150 active:scale-90",
                            active
                              ? "bg-violet-500 text-white shadow-sm shadow-violet-500/30"
                              : "bg-muted/60 text-foreground hover:bg-muted"
                          )}>
                          {d}
                        </button>
                      );
                    })}
                  </div>

                  {/* Live preview */}
                  {draftCyclePreview && (
                    <div
                      className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-0.5"
                      style={{ animation: "fadeSlideIn 0.2s ease both" }}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current cycle</p>
                      <p className="text-sm font-black text-foreground">{draftCyclePreview.label}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {draftCyclePreview.daysLeft} days left · resets on the {ordinal(draft.payday)} each month
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Apply */}
              <Button onClick={handleApply}
                className={cn(
                  "w-full h-12 rounded-xl text-sm font-bold tracking-wide transition-all hover:scale-[1.01] active:scale-[0.99]",
                  draft.type === "payday" && "bg-violet-500 hover:bg-violet-600"
                )}>
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Apply Cycle
                </span>
              </Button>

              {/* Current state */}
              <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground shrink-0">Currently using:</span>
                <span className="text-xs font-bold text-foreground truncate">
                  {config.type === "calendar" ? "Calendar month" : `Payday on the ${ordinal(config.payday)}`}
                </span>
                {config.type === "payday" && (
                  <span className="ml-auto shrink-0 text-[9px] text-violet-500 font-black bg-violet-500/10 px-2 py-0.5 rounded-full">
                    ACTIVE
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes growWidth {
          from { width: 0%; }
        }
      `}</style>
    </>
  );
}