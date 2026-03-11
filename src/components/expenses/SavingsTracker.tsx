import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell, ReferenceLine,
} from "recharts";
import { format, parseISO, isEqual } from "date-fns";
import {
  PiggyBank, Loader2, Pencil, Trash2,
  ChevronLeft, ChevronRight, Sparkles,
  Zap, Calendar, Flame, TrendingUp, TrendingDown, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useSavings, useSavingsForCycle, useUpsertSavings, useDeleteSavings,
  getCycleRangeForDate, getCycleRangeAtOffset,
  type CycleConfig, type CycleRange,
} from "@/hooks/useSavings";
import { loadCycleConfig, CYCLE_CHANGE_EVENT } from "@/components/expenses/BudgetManager";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Income } from "@/hooks/useIncomes";
import type { Expense } from "@/hooks/useExpenses";


// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  cycleExpenses: Expense[];
  cycleIncomes: Income[];
  cycleStart: Date;
  cycleEnd: Date;
}


// ─── iOS-style swipeable row (mobile only) ─────────────────────────────────
interface SwipeItemProps {
  children: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

function SwipeableItem({ children, onEdit, onDelete }: SwipeItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const MAX = 128;

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || !isMobile) return;
    const delta = startX.current - e.touches[0].clientX;
    if (delta < 0) { setOffsetX(0); return; }
    setOffsetX(Math.min(delta, MAX));
  };

  const onTouchEnd = () => {
    if (!isMobile) return;
    isDragging.current = false;
    setOffsetX(offsetX < MAX * 0.35 ? 0 : MAX);
  };

  const close = () => setOffsetX(0);

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-y-0 right-0 flex" style={{ width: MAX }}>
        <button
          onClick={() => { close(); onEdit(); }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5
                     bg-indigo-600 text-white text-[9px] font-black uppercase tracking-wider"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={() => { close(); onDelete(); }}
          className="flex-1 flex flex-col items-center justify-center gap-0.5
                     bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
      <div
        className="bg-card"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(-${offsetX}px)`,
          transition: isDragging.current ? "none" : "transform 0.32s cubic-bezier(0.34,1.56,0.64,1)",
          position: "relative",
          zIndex: 1,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}


// ─── Narrative generator ──────────────────────────────────────────────────────
function getNarrative(rate: number | null, amount: number, fmt: (n: number) => string) {
  if (!rate || amount === 0) return { headline: "Nothing saved yet", sub: "Tap Log — even a small amount builds the habit" };
  if (rate >= 30) return { headline: `${rate}% saved 🏆`, sub: "Top-tier. You're in the top 5% of savers." };
  if (rate >= 20) return { headline: `${rate}% saved 🎯`, sub: "You hit the golden 20% rule. Financial pros love this." };
  if (rate >= 10) return { headline: `${rate}% saved 📈`, sub: "Good progress. Push to 20% and watch wealth grow." };
  return { headline: `${rate}% saved 🌱`, sub: "Small start. Every habit begins somewhere." };
}


// ─── Chart Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, formatAmount, average }: any) {
  if (!active || !payload?.length) return null;
  const rec = payload.find((p: any) => p.dataKey === "recorded");
  if (!rec) return null;

  const isEmpty = !rec.value || rec.value === 0;
  const isAboveAvg = average > 0 && rec.value > average;

  return (
    <div
      className="rounded-2xl border border-white/8 bg-zinc-900/97 backdrop-blur-xl
                 px-4 py-3 shadow-2xl min-w-[148px]"
      style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)" }}
    >
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500 pb-2 mb-2 border-b border-white/8">
        {label}
      </p>

      {isEmpty ? (
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          <span className="text-[11px] text-zinc-500 italic">Nothing saved</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0
                               shadow-[0_0_6px_hsl(142,72%,55%)]" />
              <span className="text-[10px] text-zinc-400">Saved</span>
            </div>
            <span className="text-sm font-black text-emerald-400 tabular-nums">
              {formatAmount(rec.value)}
            </span>
          </div>

          {average > 0 && (
            <div className="pt-1.5 border-t border-white/6">
              <span className={cn(
                "text-[9px] font-black px-2 py-0.5 rounded-full",
                isAboveAvg
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/15 text-amber-400"
              )}>
                {isAboveAvg ? "↑ above average" : "↓ below average"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Main ─────────────────────────────────────────────────────────────────────
export function SavingsTracker({ cycleExpenses, cycleIncomes, cycleStart, cycleEnd }: Props) {
  const { formatAmount } = useCurrency();

  const [cycleConfig, setCycleConfig] = useState<CycleConfig>(loadCycleConfig);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<CycleConfig>).detail;
      setCycleConfig(d ?? loadCycleConfig());
    };
    window.addEventListener(CYCLE_CHANGE_EVENT, h);
    return () => window.removeEventListener(CYCLE_CHANGE_EVENT, h);
  }, []);

  const [chartOffset, setChartOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCycleStart, setEditingCycleStart] = useState<Date>(cycleStart);

  const { data: allSavings = [] } = useSavings();
  const { data: currentEntry } = useSavingsForCycle(cycleStart);
  const upsert = useUpsertSavings();
  const del = useDeleteSavings();

  const totalIncome = cycleIncomes.reduce((s, i) => s + i.amount, 0);
  const totalSpend = cycleExpenses.reduce((s, e) => s + e.amount, 0);
  const surplus = totalIncome - totalSpend;
  const recorded = currentEntry?.amount ?? 0;
  const savingsRate = totalIncome > 0 ? Math.round((recorded / totalIncome) * 100) : null;
  const totalSaved = allSavings.reduce((s, e) => s + e.amount, 0);

  // Streak
  const streak = useMemo(() => {
    const sorted = [...allSavings].sort((a, b) => b.cycle_start.localeCompare(a.cycle_start));
    let c = 0;
    for (const e of sorted) { if (e.amount > 0) c++; else break; }
    return c;
  }, [allSavings]);

  // ── Chart data (no cumulative — replaced with trend + metadata) ────────────
  const chartData = useMemo(() => {
    const cycles: CycleRange[] = [];
    for (let i = -11; i <= 0; i++) cycles.push(getCycleRangeAtOffset(cycleConfig, chartOffset + i));

    const map: Record<string, number> = {};
    allSavings.forEach((e) => { map[e.cycle_start] = e.amount; });

    const currentKey = format(cycleStart, "yyyy-MM-dd");

    const raw = cycles.map((c) => {
      const key = format(c.start, "yyyy-MM-dd");
      const rec = map[key] ?? 0;
      return {
        key,
        label: cycleConfig.type === "payday"
          ? format(c.start, "MMM d")
          : format(c.start, "MMM yy"),
        recorded: rec,
        isCurrent: key === currentKey,
        hasSaved: rec > 0,
      };
    });

    // 3-period moving average (includes zeros — honestly reflects habit)
    return raw.map((d, i, arr) => {
      const window = arr.slice(Math.max(0, i - 2), i + 1);
      const trend = Math.round(window.reduce((s, x) => s + x.recorded, 0) / window.length);
      return { ...d, trend };
    });
  }, [allSavings, cycleConfig, chartOffset, cycleStart]);

  // Chart-level stats (used in header + tooltip)
  const chartAvg = useMemo(() => {
    const nonZero = chartData.filter((d) => d.hasSaved);
    if (!nonZero.length) return 0;
    return Math.round(nonZero.reduce((s, d) => s + d.recorded, 0) / nonZero.length);
  }, [chartData]);

  const cyclesSaved = useMemo(() => chartData.filter((d) => d.hasSaved).length, [chartData]);

  const currentCycleRange = useMemo(() => getCycleRangeForDate(cycleConfig, cycleStart), [cycleConfig, cycleStart]);
  const narrative = getNarrative(savingsRate, recorded, formatAmount);
  const progressPct = Math.min(((savingsRate ?? 0) / 20) * 100, 100);

  const openForCycle = useCallback((start: Date) => {
    setEditingCycleStart(start);
    const key = format(start, "yyyy-MM-dd");
    const ex = allSavings.find((e) => e.cycle_start === key);
    setAmount(ex ? String(ex.amount) : "");
    setNote(ex?.note ?? "");
    setConfirmDelete(false);
    setDialogOpen(true);
  }, [allSavings]);

  const handleSave = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error("Enter an amount greater than 0"); return; }
    const key = format(editingCycleStart, "yyyy-MM-dd");
    const existing = allSavings.find((e) => e.cycle_start === key);
    const range = getCycleRangeForDate(cycleConfig, editingCycleStart);
    try {
      await upsert.mutateAsync({ amount: num, cycleStart: editingCycleStart, cycleType: cycleConfig.type, note: note || undefined });
      setDialogOpen(false);
      toast.success(existing ? "Savings updated 👍" : "Savings recorded! 🎉", {
        description: `${formatAmount(num)} · ${range.label}`,
        duration: 4000,
      });
    } catch { toast.error("Couldn't save. Try again."); }
  };

  const handleDelete = async () => {
    const key = format(editingCycleStart, "yyyy-MM-dd");
    const entry = allSavings.find((e) => e.cycle_start === key);
    if (!entry) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await del.mutateAsync(entry.id);
      setDialogOpen(false);
      toast.success("Entry removed");
    } catch { toast.error("Couldn't delete. Try again."); }
  };

  const handleSwipeDelete = (id: string, label: string, amount: number) => {
    toast(
      <div className="space-y-2.5">
        <p className="text-sm font-bold">Remove this entry?</p>
        <p className="text-xs text-muted-foreground">{label} · {formatAmount(amount)}</p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try { await del.mutateAsync(id); toast.dismiss(); toast.success("Removed"); }
              catch { toast.error("Failed"); }
            }}
            className="flex-1 text-xs font-bold py-2 rounded-xl bg-rose-500 text-white active:scale-95"
          >Yes, remove</button>
          <button
            onClick={() => toast.dismiss()}
            className="flex-1 text-xs font-bold py-2 rounded-xl bg-muted text-foreground active:scale-95"
          >Cancel</button>
        </div>
      </div>,
      { duration: 8000 }
    );
  };

  const editingKey = format(editingCycleStart, "yyyy-MM-dd");
  const editingEntry = allSavings.find((e) => e.cycle_start === editingKey);
  const isEditMode = !!editingEntry;
  const isPending = upsert.isPending || del.isPending;
  const editingRange = getCycleRangeForDate(cycleConfig, editingCycleStart);
  const isAtCurrent = isEqual(
    new Date(format(cycleStart, "yyyy-MM-dd")),
    new Date(format(currentCycleRange.start, "yyyy-MM-dd"))
  );


  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-3xl border border-border/50 bg-card overflow-hidden shadow-sm"
      style={{ animation: "fadeSlideIn 0.35s ease both" }}>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-5 pt-5 pb-4 bg-gradient-to-br from-emerald-950/40 via-card to-card">
        <div className="absolute -top-10 -right-10 h-36 w-36 rounded-full bg-emerald-500/8 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-violet-500/6 blur-2xl pointer-events-none" />

        <div className="flex items-center gap-1.5 flex-wrap mb-3 relative">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-emerald-500 bg-emerald-500/12 px-2.5 py-0.5 rounded-full">
            💰 Savings
          </span>
          {streak >= 2 && (
            <span className="text-[9px] font-black uppercase tracking-wider text-amber-500 bg-amber-500/12 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Flame className="h-2.5 w-2.5" />{streak} cycle streak
            </span>
          )}
          {cycleConfig.type === "payday"
            ? <span className="text-[9px] font-black uppercase tracking-wider text-violet-500 bg-violet-500/12 px-2 py-0.5 rounded-full flex items-center gap-1"><Zap className="h-2.5 w-2.5" />Payday</span>
            : <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />Monthly</span>
          }
        </div>

        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex-1 min-w-0">
            {recorded > 0 ? (
              <>
                <p className="text-3xl font-black tabular-nums tracking-tight leading-none text-foreground">
                  {formatAmount(recorded)}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 font-medium leading-relaxed">{narrative.headline}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{narrative.sub}</p>
              </>
            ) : (
              <>
                <p className="text-xl font-black text-muted-foreground/50 leading-tight">Nothing logged yet</p>
                <p className="text-xs text-muted-foreground mt-1">{narrative.sub}</p>
              </>
            )}
          </div>
          <button
            onClick={() => openForCycle(cycleStart)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-black px-4 py-2.5 rounded-2xl text-white shadow-lg shrink-0 transition-all duration-150 active:scale-95",
              recorded > 0
                ? "bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-500"
                : "bg-emerald-500 shadow-emerald-500/25 hover:bg-emerald-400"
            )}
          >
            {recorded > 0 ? <><Pencil className="h-3 w-3" />Edit</> : <><PiggyBank className="h-3.5 w-3.5" />Log</>}
          </button>
        </div>

        {totalIncome > 0 && (
          <div className="mt-4 space-y-1.5 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-muted-foreground">
                {progressPct >= 100 ? "🎯 20% goal — achieved!" : "Progress toward 20% savings goal"}
              </span>
              <span className={cn("text-[10px] font-black", progressPct >= 100 ? "text-emerald-500" : "text-muted-foreground")}>
                {savingsRate ?? 0}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700",
                  progressPct >= 100 ? "bg-emerald-500" : progressPct >= 60 ? "bg-sky-500" : "bg-violet-500"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {surplus > 0 && recorded === 0 && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-0.5">
                You have {formatAmount(surplus)} unallocated — consider saving some 👆
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── STAT PILLS ───────────────────────────────────────────────────── */}
      <div className="flex divide-x divide-border/40 border-b border-border/40">
        {[
          { label: "Surplus", val: totalIncome > 0 ? formatAmount(surplus) : "—", sub: "income − spend", color: surplus >= 0 ? "text-sky-500" : "text-rose-500", Icon: surplus >= 0 ? TrendingUp : TrendingDown },
          { label: "All-time", val: totalSaved > 0 ? formatAmount(totalSaved) : "—", sub: "total saved ever", color: "text-violet-500", Icon: PiggyBank },
        ].map(({ label, val, sub, color, Icon }) => (
          <div key={label} className="flex-1 px-4 py-3">
            <div className="flex items-center gap-1 mb-0.5">
              <Icon className={cn("h-3 w-3", color)} />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
            </div>
            <p className={cn("text-base font-black tabular-nums", color)}>{val}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── CHART ────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-4">

        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              {cycleConfig.type === "payday" ? "Last 12 pay cycles" : "Last 12 months"}
            </p>
            {allSavings.length > 0 && (
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                {cyclesSaved} of 12 cycles saved
                {cyclesSaved >= 10 ? " 🔥" : cyclesSaved >= 6 ? " 💪" : " 📈"}
              </p>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-0.5 bg-muted/40 rounded-xl p-0.5">
            <button
              onClick={() => setChartOffset((o) => o - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-lg
                         hover:bg-background/80 transition-all active:scale-90"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {chartOffset < 0 && (
              <button
                onClick={() => setChartOffset(0)}
                className="text-[9px] font-black text-emerald-500 px-2 py-1
                           rounded-lg hover:bg-emerald-500/10 transition-colors"
              >
                Now
              </button>
            )}
            <button
              onClick={() => setChartOffset((o) => o + 1)}
              disabled={chartOffset >= 0}
              className="h-7 w-7 flex items-center justify-center rounded-lg
                         hover:bg-background/80 transition-all active:scale-90
                         disabled:opacity-25 disabled:pointer-events-none"
            >
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {allSavings.length > 0 ? (
          <>
            {/* Average context badge */}
            {chartAvg > 0 && (
              <div className="flex items-center gap-1.5 mb-3">
                <div className="flex items-center gap-1.5 bg-amber-500/8 border border-amber-500/18
                                rounded-full px-2.5 py-1">
                  <span className="text-[9px] font-black text-amber-500/80 uppercase tracking-wider">
                    avg
                  </span>
                  <span className="text-[9px] font-black text-amber-400">
                    {formatAmount(chartAvg)} / cycle
                  </span>
                </div>
              </div>
            )}

            {/* Chart */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(180deg, hsl(var(--muted)/0.14) 0%, transparent 100%)",
                border: "1px solid hsl(var(--border)/0.28)",
              }}
            >
              <div className="h-[186px] px-2 pt-4 pb-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
                    barCategoryGap="28%"
                  >
                    <defs>
                      {/* Normal bar gradient */}
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142,68%,46%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(142,55%,34%)" stopOpacity={1} />
                      </linearGradient>
                      {/* Current-cycle bar — brighter */}
                      <linearGradient id="barGradCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(142,90%,62%)" stopOpacity={1} />
                        <stop offset="100%" stopColor="hsl(142,72%,44%)" stopOpacity={1} />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      vertical={false}
                      stroke="hsl(var(--border))"
                      strokeOpacity={0.18}
                      strokeDasharray="2 8"
                    />

                    {/* Average reference line */}
                    {chartAvg > 0 && (
                      <ReferenceLine
                        y={chartAvg}
                        stroke="hsl(45,85%,58%)"
                        strokeOpacity={0.45}
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                      />
                    )}

                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))", fontWeight: 700 }}
                      interval="preserveStartEnd"
                      tickMargin={10}
                    />
                    <YAxis hide />

                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted)/0.28)", radius: 8 }}
                      content={(p) => (
                        <ChartTooltip {...p} formatAmount={formatAmount} average={chartAvg} />
                      )}
                    />

                    {/* Bars — one per cycle */}
                    <Bar
                      dataKey="recorded"
                      radius={[5, 5, 2, 2]}
                      maxBarSize={32}
                      isAnimationActive
                      animationDuration={550}
                      animationEasing="ease-out"
                    >
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.isCurrent
                              ? "url(#barGradCurrent)"
                              : entry.hasSaved
                                ? "url(#barGrad)"
                                : "hsl(var(--muted))"
                          }
                          fillOpacity={
                            entry.isCurrent ? 1 : entry.hasSaved ? 0.7 : 0.22
                          }
                        />
                      ))}
                    </Bar>

                    {/* Trend line — 3-period MA, soft and secondary */}
                    <Line
                      type="natural"
                      dataKey="trend"
                      stroke="hsl(142,72%,56%)"
                      strokeWidth={1.8}
                      strokeOpacity={0.45}
                      dot={false}
                      activeDot={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Consistency dots row */}
            <div className="flex items-center justify-between mt-3 px-0.5">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-wider shrink-0">
                  Habit
                </span>
                <div className="flex items-center gap-[4.5px]">
                  {chartData.map((d, i) => (
                    <div
                      key={i}
                      title={`${d.label}${d.hasSaved ? ` · ${formatAmount(d.recorded)}` : " · skipped"}`}
                      className={cn(
                        "rounded-full transition-all duration-300",
                        d.isCurrent
                          ? "h-[11px] w-[11px] bg-emerald-400 ring-2 ring-emerald-400/30"
                          : d.hasSaved
                            ? "h-[8px] w-[8px] bg-emerald-500/65"
                            : "h-[8px] w-[8px] border border-muted-foreground/20 bg-transparent"
                      )}
                    />
                  ))}
                </div>
              </div>

              <span className={cn(
                "text-[10px] font-black tabular-nums",
                cyclesSaved >= 10 ? "text-emerald-500" : cyclesSaved >= 6 ? "text-sky-500" : "text-muted-foreground/50"
              )}>
                {cyclesSaved}/12
              </span>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mt-2.5 px-0.5">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-[3px] bg-emerald-500/75 shrink-0" />
                <span className="text-[10px] text-muted-foreground">Per cycle</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-[2px] w-4 rounded-full bg-emerald-400/45 shrink-0" />
                <span className="text-[10px] text-muted-foreground">Trend</span>
              </div>
              {chartAvg > 0 && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="h-[2px] w-4 shrink-0 opacity-50"
                    style={{
                      background: "repeating-linear-gradient(90deg, hsl(45,85%,55%) 0, hsl(45,85%,55%) 5px, transparent 5px, transparent 9px)",
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">Average</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-[160px] rounded-2xl gap-3"
            style={{
              border: "1.5px dashed hsl(var(--border)/0.45)",
              background: "hsl(var(--muted)/0.07)",
            }}
          >
            <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-muted-foreground/25" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-xs font-bold text-muted-foreground">No savings yet</p>
              <p className="text-[11px] text-muted-foreground/45">Log your first cycle to see your chart</p>
            </div>
          </div>
        )}
      </div>

      {/* ── HISTORY LIST ─────────────────────────────────────────────────── */}
      {allSavings.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">History</p>
            <p className="text-[9px] text-muted-foreground/40 italic">swipe left to edit or delete</p>
          </div>
          <div className="space-y-1.5">
            {[...allSavings].reverse().slice(0, 6).map((entry, idx) => {
              const entryRange = getCycleRangeForDate({ ...cycleConfig, type: entry.cycle_type }, parseISO(entry.cycle_start));
              const isCurrent = entry.cycle_start === format(cycleStart, "yyyy-MM-dd");

              return (
                <SwipeableItem
                  key={entry.id}
                  onEdit={() => openForCycle(parseISO(entry.cycle_start))}
                  onDelete={() => handleSwipeDelete(entry.id, entryRange.label, entry.amount)}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between px-3.5 py-3 rounded-2xl transition-colors cursor-pointer",
                      isCurrent ? "bg-card hover:bg-muted/40" : "bg-card hover:bg-muted/30"
                    )}
                    style={{ animation: "fadeSlideIn 0.28s ease both", animationDelay: `${idx * 30}ms` }}
                    onClick={() => openForCycle(parseISO(entry.cycle_start))}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("h-9 w-9 rounded-xl shrink-0 flex items-center justify-center",
                        isCurrent ? "bg-emerald-500/20" : "bg-muted/60"
                      )}>
                        <PiggyBank className={cn("h-4 w-4", isCurrent ? "text-emerald-500" : "text-muted-foreground/40")} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-foreground truncate">{entryRange.label}</p>
                          {isCurrent && (
                            <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              This cycle
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
                          {entry.note || "No note"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm font-black tabular-nums text-emerald-500">{formatAmount(entry.amount)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/25" />
                    </div>
                  </div>
                </SwipeableItem>
              );
            })}
          </div>
        </div>
      )}

      {/* ── DIALOG ──────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setConfirmDelete(false); }}>
        <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden rounded-3xl border-border/40 shadow-2xl">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-violet-500" />

          <div className="px-5 pt-5 pb-2">
            <DialogHeader>
              <DialogTitle className="text-lg font-black tracking-tight flex items-center gap-2 leading-none">
                <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-emerald-500/15">
                  <PiggyBank className="h-4 w-4 text-emerald-500" />
                </span>
                {isEditMode ? "Update savings" : "How much did you save?"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-1.5">
                {editingRange.label} · {cycleConfig.type === "payday" ? "Payday cycle" : "Calendar month"}
              </p>
            </DialogHeader>
          </div>

          <div className="px-5 pb-6 space-y-4">
            {isAtCurrent && totalIncome > 0 && (
              <div className={cn(
                "flex items-start gap-3 rounded-2xl px-4 py-3 border text-sm",
                surplus > 0 ? "bg-sky-500/8 border-sky-500/20" : "bg-rose-500/8 border-rose-500/20"
              )}>
                {surplus > 0 ? <TrendingUp className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" /> : <TrendingDown className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-bold text-foreground text-xs">
                    {surplus > 0 ? "You have " : "You're "}
                    <span className={cn("font-black", surplus > 0 ? "text-sky-500" : "text-rose-500")}>{formatAmount(Math.abs(surplus))}</span>
                    {surplus < 0 ? " over budget" : " left after spending"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {surplus > 0 ? "That's your saveable amount this cycle" : "Saving more than surplus means dipping into reserves"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount saved</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xl pointer-events-none">৳</span>
                <Input
                  type="number" step="1" inputMode="decimal" placeholder="0"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="pl-9 h-14 text-3xl font-black rounded-2xl border-2 border-border/50 focus-visible:border-emerald-500 focus-visible:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  autoFocus
                />
              </div>
              {isAtCurrent && surplus > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Quick fill:</span>
                  {[100, 75, 50, 25].map((pct) => (
                    <button key={pct} type="button"
                      onClick={() => setAmount(String(Math.round((surplus * pct) / 100)))}
                      className="text-[10px] font-black px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors active:scale-95"
                    >{pct}%</button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                What's this for? <span className="normal-case font-normal text-muted-foreground/50">(optional)</span>
              </label>
              <Input placeholder="e.g. Emergency fund, vacation, laptop…"
                value={note} onChange={(e) => setNote(e.target.value)}
                className="h-11 rounded-2xl border-border/50 text-sm focus-visible:ring-1 focus-visible:ring-emerald-500"
              />
            </div>

            {isEditMode ? (
              <div className="flex gap-2">
                <button type="button" onClick={handleDelete} disabled={isPending}
                  className={cn(
                    "flex items-center gap-1.5 h-12 px-4 rounded-2xl text-sm font-black border-2 transition-all duration-200",
                    confirmDelete
                      ? "bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-500/25 scale-[1.02]"
                      : "border-rose-500/30 text-rose-500 hover:bg-rose-500/8"
                  )}
                >
                  {del.isPending ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Trash2 className="h-3.5 w-3.5" />{confirmDelete ? "Sure?" : "Delete"}</>}
                </button>
                <Button variant="outline" disabled={isPending}
                  className="flex-1 h-12 rounded-2xl border-2 border-border/50 text-sm font-bold"
                  onClick={() => { setDialogOpen(false); setConfirmDelete(false); }}
                >Cancel</Button>
                <button type="button" onClick={handleSave} disabled={isPending}
                  className="flex-1 h-12 rounded-2xl text-sm font-black text-white transition-all active:scale-[0.98]"
                  style={{ background: "linear-gradient(135deg, hsl(142,72%,38%), hsl(142,72%,48%))", boxShadow: "0 4px 14px hsl(142 72% 45% / 0.3)" }}
                >
                  {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Save"}
                </button>
              </div>
            ) : (
              <button type="button" onClick={handleSave} disabled={isPending}
                className="w-full h-12 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, hsl(142,72%,38%), hsl(142,72%,48%))", boxShadow: "0 4px 18px hsl(142 72% 45% / 0.32)" }}
              >
                {upsert.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</>
                  : <><Sparkles className="h-4 w-4" />Record my savings</>
                }
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
