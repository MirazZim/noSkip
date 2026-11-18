import { useEffect, useMemo, useState } from "react";
import { addDays, format, isAfter, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { CalendarRange, ChevronRight, PieChart as PieChartIcon, Sprout } from "lucide-react";
import { Expense, getCategoryColor, getParentLabel, getSubCategoryEmoji, getSubCategoryLabel } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { MAC } from "@/lib/macColors";
import { SectionHeader, Widget } from "@/components/dashboard/Widget";
import { CategoryBreakdownDialog } from "@/components/expenses/CategoryBreakdownCard";

interface Props {
  expenses: Expense[];
  month: Date;
  delay?: number;
}

// Two medium widgets; the parent grid decides where they sit.
export function DashboardExpenseCharts({ expenses, month, delay = 0 }: Props) {
  return (
    <>
      <ThisWeekCard expenses={expenses} delay={delay} />
      <CategoryCard expenses={expenses} month={month} delay={delay + 50} />
    </>
  );
}

// ─── BY CATEGORY: a donut with an emoji orbit ─────────────────────────────────
// Top categories (plus one merged "more" slice) as a donut; each big slice has
// its emoji floating just outside the ring. Hover / tap a slice or a row and it
// pops out, the centre reads that category, and the glow behind takes its colour.
const TOP_N = 5;
const OTHER_COLOR = "#6B7280";
const SIZE = 184;
const C = SIZE / 2;
const INNER = 50;
const OUTER = 68;
const ORBIT = 84;

const categoryName = (name: string) => getSubCategoryLabel(name) ?? getParentLabel(name);

interface Slice { key: string; label: string; emoji: string | null; color: string; value: number; isOther: boolean }
interface SliceShape { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string }

// Focused slice: thicker, pushed out, with a thin halo.
function PopSlice({ cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill }: SliceShape) {
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 5}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={6} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 8} outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.45} cornerRadius={2} />
    </g>
  );
}

function CategoryCard({ expenses, month, delay }: { expenses: Expense[]; month: Date; delay: number }) {
  const { formatAmount } = useCurrency();
  const [sel, setSel] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
    return Object.entries(totals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [expenses]);

  const total = categoryData.reduce((s, c) => s + c.value, 0);

  const slices: Slice[] = useMemo(() => {
    const top: Slice[] = categoryData.slice(0, TOP_N).map((c) => ({
      key: c.name,
      label: categoryName(c.name),
      emoji: getSubCategoryEmoji(c.name) ?? null,
      color: getCategoryColor(c.name),
      value: c.value,
      isOther: false,
    }));
    const rest = categoryData.slice(TOP_N);
    if (rest.length) {
      top.push({
        key: "__other",
        label: `${rest.length} more`,
        emoji: null,
        color: OTHER_COLOR,
        value: rest.reduce((s, c) => s + c.value, 0),
        isOther: true,
      });
    }
    return top;
  }, [categoryData]);

  // Where each slice's emoji floats: on the orbit, at the slice's mid-angle.
  // The pie runs clockwise from 12 o'clock (startAngle 90 → endAngle -270).
  const orbit = useMemo(() => {
    let cum = 0;
    return slices.map((s) => {
      const mid = 90 - ((cum + s.value / 2) / (total || 1)) * 360;
      cum += s.value;
      const rad = (mid * Math.PI) / 180;
      return { x: C + ORBIT * Math.cos(rad), y: C - ORBIT * Math.sin(rad) };
    });
  }, [slices, total]);

  const pctOf = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const selected = sel !== null ? slices[sel] : null;
  const top = slices[0];
  const toggle = (i: number) => setSel((s) => (s === i ? null : i));
  const top3 = pctOf(slices.filter((s) => !s.isOther).slice(0, 3).reduce((s, c) => s + c.value, 0));
  const perDay = total / Math.max(1, new Date().getDate());

  return (
    <Widget className="col-span-2" delay={delay}>
      <SectionHeader
        icon={<PieChartIcon />}
        title="By Category"
        subtitle={format(month, "MMMM")}
        right={
          categoryData.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              All <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )
        }
      />

      {categoryData.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <span className="text-2xl">🧾</span>
          <p className="text-[13px] text-muted-foreground">No spending yet this month.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center" onMouseLeave={() => setSel(null)}>
            {/* Donut + emoji orbit */}
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
              <div
                className="absolute inset-10 rounded-full blur-2xl transition-colors duration-500"
                style={{ background: (selected ?? top).color, opacity: 0.22 }}
                aria-hidden="true"
              />
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    cx="50%"
                    cy="50%"
                    innerRadius={INNER}
                    outerRadius={OUTER}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                    paddingAngle={3}
                    cornerRadius={6}
                    activeIndex={sel ?? undefined}
                    activeShape={(p: unknown) => <PopSlice {...(p as SliceShape)} />}
                    onMouseEnter={(_, i) => setSel(i)}
                    onClick={(_, i) => (slices[i]?.isOther ? setOpen(true) : toggle(i))}
                  >
                    {slices.map((s, i) => (
                      <Cell
                        key={s.key}
                        fill={s.color}
                        fillOpacity={sel === null || sel === i ? 1 : 0.25}
                        className="cursor-pointer outline-none transition-[fill-opacity] duration-300"
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Emoji orbit */}
              {slices.map((s, i) =>
                s.emoji && pctOf(s.value) >= 6 ? (
                  <span
                    key={s.key}
                    className={cn(
                      "pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-card text-[12px] shadow-md",
                      "transition-all duration-500",
                      grown ? "opacity-100" : "opacity-0",
                      sel === i && "scale-125",
                      sel !== null && sel !== i && "opacity-40"
                    )}
                    style={{ left: orbit[i].x, top: orbit[i].y, transitionDelay: grown ? `${300 + i * 80}ms` : "0ms" }}
                  >
                    {s.emoji}
                  </span>
                ) : null
              )}

              {/* Centre readout */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                {selected ? (
                  <div key={selected.key} className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
                    <span className="text-[18px] leading-none">{selected.emoji ?? "•••"}</span>
                    <span className="mt-1 max-w-[84px] truncate text-[10px] font-medium text-muted-foreground">{selected.label}</span>
                    <span className="text-[15px] font-semibold leading-tight tabular-nums">{formatAmount(selected.value)}</span>
                    <span className="text-[11px] font-semibold tabular-nums" style={{ color: selected.color }}>{pctOf(selected.value)}%</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center animate-in fade-in duration-200">
                    <span className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Total</span>
                    <span className="text-[16px] font-semibold leading-tight tabular-nums">{formatAmount(total)}</span>
                    <span className="text-[10px] text-muted-foreground">{categoryData.length} categories</span>
                  </div>
                )}
              </div>
            </div>

            {/* Ranked rows, in sync with the donut */}
            <div className="flex w-full min-w-0 flex-1 flex-col gap-0.5">
              {slices.map((s, i) => {
                const isSel = sel === i;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onMouseEnter={() => setSel(i)}
                    onClick={() => (s.isOther ? setOpen(true) : toggle(i))}
                    className={cn(
                      "w-full rounded-xl px-2 py-1.5 text-left transition-all duration-200",
                      isSel && "bg-foreground/[0.06]",
                      sel !== null && !isSel && "opacity-45"
                    )}
                  >
                    <span className="flex items-center gap-2 text-[12px]">
                      <span className="w-4 shrink-0 text-center leading-none">
                        {s.emoji ?? <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{formatAmount(s.value)}</span>
                    </span>
                    <span className="ml-6 mt-1 block h-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <span
                        className="block h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{ width: grown ? `${pctOf(s.value)}%` : "0%", background: s.color, transitionDelay: `${i * 60}ms` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* One-line insight */}
          {top && (
            <p className="mt-3 rounded-xl bg-foreground/[0.03] px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              💡 <span className="font-semibold text-foreground">{top.label}</span> takes {pctOf(top.value)}%
              {slices.length > 3 && <> · top 3 make up <span className="font-semibold text-foreground">{top3}%</span></>}
              {" "}· about <span className="font-semibold text-foreground">{formatAmount(Math.round(perDay))}</span>/day
            </p>
          )}
        </>
      )}

      <CategoryBreakdownDialog
        open={open}
        onOpenChange={setOpen}
        categoryData={categoryData}
        total={total}
        formatAmount={formatAmount}
      />
    </Widget>
  );
}

// ─── THIS WEEK: liquid tubes you can scrub ────────────────────────────────────
// Each day is a glass tube that fills with that day's spend. Hover / tap a
// tube and the headline switches to that day; let go and it shows the week.
function ThisWeekCard({ expenses, delay }: { expenses: Expense[]; delay: number }) {
  const { formatAmount } = useCurrency();
  const [sel, setSel] = useState<number | null>(null);
  const [grown, setGrown] = useState(false);

  // Let the tubes start empty, then fill on the next frame.
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Mon–Sun of the current week. Days before the 1st of the month read as 0,
  // since the dashboard only loads the current month.
  const week = useMemo(() => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const totals: Record<string, number> = {};
    expenses.forEach((e) => { totals[e.date] = (totals[e.date] || 0) + e.amount; });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const key = format(d, "yyyy-MM-dd");
      return {
        key,
        letter: format(d, "EEEEE"),
        name: format(d, "EEE"),
        full: format(d, "EEEE, MMM d"),
        date: format(d, "d"),
        amount: totals[key] || 0,
        isToday: isSameDay(d, today),
        future: isAfter(startOfDay(d), startOfDay(today)),
      };
    });
  }, [expenses]);

  const past = week.filter((d) => !d.future);
  const weekTotal = past.reduce((s, d) => s + d.amount, 0);
  const avg = past.length ? weekTotal / past.length : 0;
  const max = Math.max(...week.map((d) => d.amount), 1);
  const peak = past.reduce<(typeof week)[number] | null>((p, d) => (d.amount > 0 && (!p || d.amount > p.amount) ? d : p), null);
  const noSpendDays = past.filter((d) => d.amount === 0 && !d.isToday).length;
  const todayAmount = week.find((d) => d.isToday)?.amount ?? 0;
  const projected = Math.round(avg * 7);

  const selected = sel !== null ? week[sel] : null;

  return (
    <Widget className="col-span-2" delay={delay}>
      <SectionHeader
        icon={<CalendarRange />}
        title="This Week"
        subtitle={`${format(parseISO(week[0].key), "MMM d")} – ${format(parseISO(week[6].key), "MMM d")}`}
        right={
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">On pace for</p>
            <p className="text-[13px] font-semibold tabular-nums">{formatAmount(projected)}</p>
          </div>
        }
      />

      {/* Headline: the week, or whichever day you're pointing at */}
      <div key={sel ?? "week"} className="min-h-[58px] animate-in fade-in slide-in-from-bottom-1 duration-200">
        <p className="text-[11px] font-medium text-muted-foreground">
          {selected
            ? `${selected.full}${selected.isToday ? " · today" : ""}`
            : `Spent this week · ${past.length} of 7 days`}
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">
            {selected ? (selected.future ? "—" : formatAmount(selected.amount)) : formatAmount(weekTotal)}
          </p>
          <HeadlineChip day={selected} avg={avg} weekTotal={weekTotal} formatAmount={formatAmount} />
        </div>
      </div>

      {/* Tubes */}
      <div className="relative mt-4 flex h-[120px] gap-2 sm:gap-3" onMouseLeave={() => setSel(null)}>
        {avg > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-foreground/25"
            style={{ bottom: `${(avg / max) * 100}%` }}
            aria-hidden="true"
          >
            <span className="absolute -top-2 right-0 rounded-full bg-card px-1.5 text-[9px] font-medium leading-4 text-muted-foreground">
              avg
            </span>
          </div>
        )}

        {week.map((d, i) => {
          const isSel = sel === i;
          const dimmed = sel !== null && !isSel;
          const h = d.amount > 0 ? Math.max((d.amount / max) * 100, 10) : 0;
          return (
            <button
              key={d.key}
              type="button"
              onMouseEnter={() => setSel(i)}
              onFocus={() => setSel(i)}
              onBlur={() => setSel(null)}
              onClick={() => setSel((s) => (s === i ? null : i))}
              aria-label={`${d.full}: ${d.future ? "upcoming" : formatAmount(d.amount)}`}
              className="flex h-full flex-1 justify-center outline-none"
            >
              <div
                className={cn(
                  "relative h-full w-full max-w-[30px] overflow-hidden rounded-full transition-all duration-300",
                  d.future ? "bg-foreground/[0.025]" : "bg-foreground/[0.06]",
                  isSel && "bg-foreground/[0.1] ring-1 ring-foreground/25",
                  dimmed && "opacity-50"
                )}
              >
                {d.amount > 0 && (
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-700 ease-out",
                      d.isToday
                        ? "bg-gradient-to-t from-primary/60 to-primary shadow-[0_0_18px_hsl(var(--primary)/0.45)]"
                        : isSel ? "bg-primary/75" : "bg-primary/35"
                    )}
                    style={{ height: grown ? `${h}%` : "0%", transitionDelay: grown ? `${i * 60}ms` : "0ms" }}
                  >
                    {/* glassy highlight down the left side */}
                    <span className="absolute inset-y-1 left-1 w-1 rounded-full bg-white/25" />
                  </div>
                )}
                {!d.future && d.amount === 0 && !d.isToday && (
                  <Sprout className="absolute bottom-2 left-1/2 h-3.5 w-3.5 -translate-x-1/2" style={{ color: MAC.green }} />
                )}
                {d.isToday && (
                  <span className="absolute left-1/2 top-2 h-1.5 w-1.5 -translate-x-1/2 animate-pulse rounded-full bg-primary" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day labels, today circled like the iOS calendar */}
      <div className="mt-2 flex gap-2 sm:gap-3">
        {week.map((d, i) => (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-0.5">
            <span className={cn("text-[10px] font-medium", sel === i ? "text-foreground" : "text-muted-foreground")}>{d.letter}</span>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                d.isToday ? "bg-primary text-primary-foreground" : d.future ? "text-muted-foreground/50" : "text-foreground"
              )}
            >
              {d.date}
            </span>
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="mt-3 grid grid-cols-3 divide-x divide-border/50 rounded-2xl bg-foreground/[0.03] py-2 text-center">
        <Stat label="Peak" value={peak ? `${peak.name} · ${formatAmount(peak.amount)}` : "—"} />
        <Stat label="No-spend" value={`${noSpendDays} day${noSpendDays === 1 ? "" : "s"}`} icon={<Sprout className="h-3 w-3" style={{ color: MAC.green }} />} />
        <Stat label="Today" value={formatAmount(todayAmount)} />
      </div>
    </Widget>
  );
}

function HeadlineChip({
  day, avg, weekTotal, formatAmount,
}: {
  day: { amount: number; future: boolean; isToday: boolean } | null;
  avg: number;
  weekTotal: number;
  formatAmount: (n: number) => string;
}) {
  const chip = "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums";

  if (!day) {
    return avg > 0
      ? <span className={cn(chip, "bg-foreground/[0.07] text-muted-foreground")}>{formatAmount(Math.round(avg))}/day</span>
      : null;
  }
  if (day.future) return <span className={cn(chip, "bg-foreground/[0.07] text-muted-foreground")}>Upcoming</span>;
  if (day.amount === 0) {
    return day.isToday
      ? <span className={cn(chip, "bg-foreground/[0.07] text-muted-foreground")}>Nothing yet</span>
      : <span className={chip} style={{ background: `${MAC.green}22`, color: MAC.green }}>No-spend day 🌱</span>;
  }

  const share = weekTotal ? Math.round((day.amount / weekTotal) * 100) : 0;
  const diff = avg ? Math.round(((day.amount - avg) / avg) * 100) : 0;
  const over = diff > 0;
  return (
    <>
      <span className={cn(chip, "bg-foreground/[0.07] text-muted-foreground")}>{share}% of week</span>
      {diff !== 0 && (
        <span className={chip} style={{ background: `${over ? MAC.red : MAC.green}22`, color: over ? MAC.red : MAC.green }}>
          {over ? "▲" : "▼"} {Math.abs(diff)}% vs avg
        </span>
      )}
    </>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="flex items-center justify-center gap-1 truncate text-[12px] font-semibold tabular-nums">
        <span className="truncate">{value}</span>
        {icon}
      </p>
    </div>
  );
}
