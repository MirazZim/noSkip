import { useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { CalendarCheck, Check, ChevronDown, Flame } from "lucide-react";
import { calculateStreak, type Habit, type HabitCompletion } from "@/hooks/useHabits";
import { Widget, WidgetHeader } from "@/components/dashboard/Widget";
import { MAC, PRIMARY } from "@/lib/macColors";
import { cn } from "@/lib/utils";

// ─── WEEKLY COMPLETION ────────────────────────────────────────────────────────
// Seven rings for the last seven days. Days you showed up for are linked into a
// chain (don't break it — no skip), perfect days sparkle, and the header shows
// how this week compares with the one before. Tap a day for which habits made
// its %, or the average for each habit's runs across the week.

type View = { kind: "day"; index: number } | { kind: "week" } | null;

interface DayInfo {
  date: Date;
  label: string;
  isToday: boolean;
  done: Set<string>;
  pct: number;
}

const RING = 38;
const STROKE = 3.5;
const RING_TOP = 6;   // the day button's top padding (py-1.5), above its ring

// ─── One day's ring (tappable) ────────────────────────────────────────────────
function DayRing({ day, index, grown, selected, onClick }: {
  day: DayInfo; index: number; grown: boolean; selected: boolean; onClick: () => void;
}) {
  const missed = !day.isToday && day.pct === 0;
  const perfect = day.pct >= 1;
  const color = missed ? MAC.red : perfect ? MAC.green : PRIMARY;
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const p = grown && !missed ? Math.min(1, day.pct) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${format(day.date, "EEEE")}: ${Math.round(day.pct * 100)}%`}
      className={cn(
        "relative z-[1] flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl py-1.5 transition-colors",
        selected ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"
      )}
    >
      <div className="relative" style={{ width: RING, height: RING }}>
        <svg width={RING} height={RING} className="-rotate-90" aria-hidden="true"
          style={perfect && grown ? { filter: `drop-shadow(0 0 4px ${MAC.green}99)` } : undefined}>
          <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={STROKE} />
          <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeOpacity={day.pct > 0 ? 1 : 0}
            style={{ transition: `stroke-dashoffset 900ms cubic-bezier(0.2,0.8,0.2,1) ${index * 60}ms` }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none tabular-nums" style={{ color }}>
          {Math.round(day.pct * 100)}<span className="text-[7px]">%</span>
        </span>
        {perfect && (
          <span className="absolute -right-1 -top-1 animate-pulse text-[10px] leading-none" style={{ color: MAC.green }} aria-hidden="true">✦</span>
        )}
      </div>
      <span className={cn("text-[10px] font-semibold", day.isToday || selected ? "text-foreground" : "text-muted-foreground")}>
        {day.label}
      </span>
      <span className={cn("h-1 w-1 rounded-full", day.isToday ? "bg-primary" : "bg-transparent")} />
    </button>
  );
}

// ─── WIDGET ───────────────────────────────────────────────────────────────────
export function WeeklyCompletionWidget({
  habits, completions, today, delay = 0,
}: { habits: Habit[]; completions: HabitCompletion[] | undefined; today: Date; delay?: number }) {
  const [view, setView] = useState<View>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const todayStr = format(today, "yyyy-MM-dd");
  const n = habits.length;

  // date → set of habit ids completed that day (regular habits only)
  const doneByDate = useMemo(() => {
    const ids = new Set(habits.map(h => h.id));
    const m = new Map<string, Set<string>>();
    completions?.forEach(c => {
      if (!ids.has(c.habit_id)) return;
      let s = m.get(c.date);
      if (!s) m.set(c.date, (s = new Set()));
      s.add(c.habit_id);
    });
    return m;
  }, [completions, habits]);

  // The last 14 days: this week (index 7–13) and the one before (0–6).
  const fortnight: DayInfo[] = useMemo(() => {
    const base = parseISO(todayStr);
    return Array.from({ length: 14 }, (_, i) => {
      const date = subDays(base, 13 - i);
      const dStr = format(date, "yyyy-MM-dd");
      const done = doneByDate.get(dStr) ?? new Set<string>();
      return { date, label: format(date, "EEEEE"), isToday: dStr === todayStr, done, pct: n ? done.size / n : 0 };
    });
  }, [doneByDate, todayStr, n]);
  const days = fortnight.slice(7);
  const avgOf = (ds: DayInfo[]) => Math.round((ds.reduce((s, d) => s + d.pct, 0) / ds.length) * 100);
  const weekAvg = avgOf(days);
  const vsLastWeek = weekAvg - avgOf(fortnight.slice(0, 7));
  const weekAvgColor = weekAvg >= 70 ? MAC.green : weekAvg >= 40 ? MAC.orange : MAC.red;
  const todayInfo = days[days.length - 1];

  // The chain: consecutive days with at least one habit done. Today only counts
  // once you've started, so an empty morning doesn't break it.
  const chain = useMemo(() => {
    if (!n) return 0;
    let d = parseISO(todayStr);
    if (!doneByDate.get(todayStr)?.size) d = subDays(d, 1);
    let count = 0;
    while ((doneByDate.get(format(d, "yyyy-MM-dd"))?.size ?? 0) > 0 && count < 400) {
      count++;
      d = subDays(d, 1);
    }
    return count;
  }, [doneByDate, todayStr, n]);

  const best = days.reduce((a, b) => (b.pct > a.pct ? b : a), days[0]);

  const toggleDay = (index: number) =>
    setView(v => (v?.kind === "day" && v.index === index ? null : { kind: "day", index }));
  const toggleWeek = () => setView(v => (v?.kind === "week" ? null : { kind: "week" }));

  return (
    <Widget className="col-span-2" delay={delay}>
      <WidgetHeader
        icon={<CalendarCheck />}
        title="Weekly Completion"
        tint={PRIMARY}
        right={
          <button
            type="button"
            onClick={toggleWeek}
            disabled={n === 0}
            aria-expanded={view?.kind === "week"}
            className="-mr-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-foreground/[0.06] disabled:pointer-events-none"
          >
            {n > 0 && vsLastWeek !== 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums"
                style={{ background: `${vsLastWeek > 0 ? MAC.green : MAC.red}22`, color: vsLastWeek > 0 ? MAC.green : MAC.red }}
                title="Compared with the 7 days before">
                {vsLastWeek > 0 ? "▲" : "▼"} {Math.abs(vsLastWeek)}
              </span>
            )}
            <span className="text-[20px] font-semibold leading-none tabular-nums" style={{ color: weekAvgColor }}>
              {weekAvg}%<span className="ml-1 text-[11px] font-medium text-muted-foreground">avg</span>
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", view?.kind === "week" && "rotate-180")}
            />
          </button>
        }
      />

      <div className="flex flex-1 items-center">
        <div className="relative flex w-full">
          {/* Chain links between consecutive days you showed up for. Each day is
              exactly 1/7 wide, and its ring sits RING_TOP px below the row's top. */}
          {days.slice(0, -1).map((d, i) =>
            d.pct > 0 && days[i + 1].pct > 0 ? (
              <span
                key={`link-${i}`}
                className="pointer-events-none absolute h-[3px] rounded-full bg-primary/50 transition-opacity duration-700"
                style={{
                  left: `calc(${((i + 0.5) / 7) * 100}% + ${RING / 2 + 2}px)`,
                  width: `calc(${100 / 7}% - ${RING + 4}px)`,
                  top: RING_TOP + RING / 2 - 1.5,
                  opacity: grown ? 1 : 0,
                }}
                aria-hidden="true"
              />
            ) : null
          )}
          {days.map((d, i) => (
            <DayRing
              key={i}
              day={d}
              index={i}
              grown={grown}
              selected={view?.kind === "day" && view.index === i}
              onClick={() => n > 0 && toggleDay(i)}
            />
          ))}
        </div>
      </div>

      {view?.kind === "day" && n > 0 && <DayList day={days[view.index]} habits={habits} />}
      {view?.kind === "week" && n > 0 && <WeekList days={days} habits={habits} completions={completions} />}

      {!view && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Today {todayInfo.done.size}/{n}</span>
          {chain >= 2 && (
            <>
              <span className="opacity-50">·</span>
              <span title="Days in a row with at least one habit done">🔗 <span className="font-semibold text-foreground">{chain}-day</span> chain</span>
            </>
          )}
          {n > 0 && best.pct > 0 && (
            <>
              <span className="opacity-50">·</span>
              <span>Best {best.isToday ? "today" : format(best.date, "EEE")} {Math.round(best.pct * 100)}%</span>
            </>
          )}
        </p>
      )}
    </Widget>
  );
}

// ─── DAY: which habits made up this day's % ───────────────────────────────────
function DayList({ day, habits }: { day: DayInfo; habits: Habit[] }) {
  const share = Math.round(100 / habits.length);
  const ordered = [...habits].sort((a, b) => Number(day.done.has(b.id)) - Number(day.done.has(a.id)));
  const perfect = day.done.size === habits.length;

  return (
    <div className="mt-3 border-t border-border/50 pt-3 animate-in fade-in duration-200">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[12px] text-muted-foreground">
          {day.isToday ? "Today" : format(day.date, "EEEE, MMM d")} · {day.done.size}/{habits.length} done
        </p>
        {perfect && <span className="text-[11px] font-semibold" style={{ color: MAC.green }}>✦ Perfect day</span>}
      </div>
      {/* one segment per habit, done ones lit */}
      <div className="mb-2 flex h-1.5 gap-[3px]">
        {ordered.map((h, i) => (
          <span key={h.id} className={cn("flex-1 rounded-full transition-colors duration-500", day.done.has(h.id) ? "bg-primary" : "bg-foreground/10")}
            style={{ transitionDelay: `${i * 50}ms` }} />
        ))}
      </div>
      {ordered.map(h => {
        const done = day.done.has(h.id);
        return (
          <div key={h.id} className="flex items-center gap-2.5 py-1">
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                done ? "border-primary bg-primary" : "border-foreground/20"
              )}
            >
              {done && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
            </span>
            <span className="shrink-0 text-[13px] leading-none">{h.emoji}</span>
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", !done && "text-muted-foreground")}>{h.name}</span>
            <span className={cn("shrink-0 text-[12px] tabular-nums", done ? "font-semibold" : "text-muted-foreground/60")}>
              {done ? `+${share}%` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── WEEK: each habit's runs across the week ──────────────────────────────────
function WeekList({ days, habits, completions }: { days: DayInfo[]; habits: Habit[]; completions: HabitCompletion[] | undefined }) {
  const rows = habits
    .map(h => ({
      habit: h,
      count: days.filter(d => d.done.has(h.id)).length,
      streak: completions ? calculateStreak(completions, h.id, h.start_date) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.streak - a.streak);

  return (
    <div className="mt-3 border-t border-border/50 pt-3 animate-in fade-in duration-200">
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="text-[12px] text-muted-foreground">Each habit, last 7 days</p>
        <div className="flex w-[84px] justify-between pr-[2px] text-[9px] font-medium text-muted-foreground/70" aria-hidden="true">
          {days.map((d, i) => <span key={i} className="w-3 text-center">{d.label}</span>)}
        </div>
      </div>
      {rows.map(({ habit: h, count, streak }) => (
        <div key={h.id} className="flex items-center gap-2.5 py-1">
          <span className="shrink-0 text-[13px] leading-none">{h.emoji}</span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{h.name}</span>
          {streak >= 3 && (
            <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground tabular-nums" title={`${streak}-day streak`}>
              <Flame className="h-3 w-3" style={{ color: MAC.orange }} />{streak}
            </span>
          )}
          {/* consecutive done days join into one bar — a run */}
          <div className="flex w-[84px] shrink-0 items-center" aria-label={`${count} of 7 days`}>
            {days.map((d, j) => {
              const on = d.done.has(h.id);
              const prev = j > 0 && days[j - 1].done.has(h.id);
              const next = j < days.length - 1 && days[j + 1].done.has(h.id);
              return (
                <span key={j} className="flex h-2.5 w-3 items-center justify-center">
                  {on ? (
                    <span className="h-2.5 w-full bg-primary"
                      style={{
                        borderTopLeftRadius: prev ? 0 : 9999, borderBottomLeftRadius: prev ? 0 : 9999,
                        borderTopRightRadius: next ? 0 : 9999, borderBottomRightRadius: next ? 0 : 9999,
                        marginLeft: prev ? 0 : 1, marginRight: next ? 0 : 1,
                      }} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/10" />
                  )}
                </span>
              );
            })}
          </div>
          <span className="w-7 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">{count}/7</span>
        </div>
      ))}
    </div>
  );
}
