import { useMemo, useState } from "react";
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, subDays, addMonths, subMonths,
  differenceInDays, parseISO, startOfYear, endOfToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Habit, HabitCompletion, calculateStreak, longestStreak } from "@/hooks/useHabits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

// ── Tiny trend arrow icon ──────────────────────────────────────────────────────
const TrendUp = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const TrendDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);
const TrendFlat = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const CalendarProjectIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
  </svg>
);

export function HabitDetailPanel({ habit, completions }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date());

  // ── All data derived in one pass ─────────────────────────────────────────────
  const insights = useMemo(() => {
    const habitCompletions = completions.filter((c) => c.habit_id === habit.id);
    const completedSet = new Set(habitCompletions.map((c) => c.date));
    const today = format(new Date(), "yyyy-MM-dd");

    // ── 1. Weekly pattern ──────────────────────────────────────────────────────
    // Count how many times each weekday (0=Mon … 6=Sun) was completed
    // vs how many times that weekday occurred since habit start
    const dayCompletions = Array(7).fill(0);   // completed count per weekday
    const dayOccurrences = Array(7).fill(0);   // total occurrences per weekday

    const startDate = parseISO(habit.start_date);
    const allDays = eachDayOfInterval({ start: startDate, end: new Date() });
    allDays.forEach((day) => {
      const dow = (getDay(day) + 6) % 7; // Mon=0 … Sun=6
      dayOccurrences[dow]++;
      if (completedSet.has(format(day, "yyyy-MM-dd"))) {
        dayCompletions[dow]++;
      }
    });

    const weeklyRates = dayOccurrences.map((occ, i) =>
      occ > 0 ? Math.round((dayCompletions[i] / occ) * 100) : null
    );
    const definedRates = weeklyRates.filter((r) => r !== null) as number[];
    const bestDayIdx = definedRates.length
      ? weeklyRates.indexOf(Math.max(...definedRates))
      : -1;
    const worstDayIdx = definedRates.length
      ? weeklyRates.indexOf(Math.min(...definedRates))
      : -1;

    // ── 2. Momentum (last 30 vs prev 30) ──────────────────────────────────────
    const last30Start = format(subDays(new Date(), 29), "yyyy-MM-dd");
    const prev30Start = format(subDays(new Date(), 59), "yyyy-MM-dd");
    const prev30End = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const last30Count = habitCompletions.filter(
      (c) => c.date >= last30Start && c.date <= today
    ).length;
    const prev30Count = habitCompletions.filter(
      (c) => c.date >= prev30Start && c.date <= prev30End
    ).length;

    const last30Rate = Math.round((last30Count / 30) * 100);
    const prev30Rate = Math.round((prev30Count / 30) * 100);
    const momentumDelta = last30Rate - prev30Rate;
    const momentumTrend =
      momentumDelta > 3 ? "up" : momentumDelta < -3 ? "down" : "flat";

    // ── 3. Best streak context ─────────────────────────────────────────────────
    const sortedDates = [...completedSet].sort();

    // Find all gaps (missed day runs) between completions
    let longestGap = 0;
    let longestGapAfterDate = "";
    let longestRecovery = 0; // days until next completion after longest gap

    for (let i = 1; i < sortedDates.length; i++) {
      const gap = differenceInDays(parseISO(sortedDates[i]), parseISO(sortedDates[i - 1])) - 1;
      if (gap > longestGap) {
        longestGap = gap;
        longestGapAfterDate = sortedDates[i - 1];
        // Recovery = days between gap start and resumption
        longestRecovery = gap;
      }
    }

    // Last missed streak (days since last completion or since start if never done)
    const lastCompletionDate = sortedDates[sortedDates.length - 1] || null;
    const daysSinceLast = lastCompletionDate
      ? differenceInDays(new Date(), parseISO(lastCompletionDate))
      : differenceInDays(new Date(), startDate);

    const bestStreak = (() => {
      let max = 0;
      let run = 0;
      sortedDates.forEach((d, i) => {
        if (i === 0) { run = 1; max = 1; return; }
        if (differenceInDays(parseISO(d), parseISO(sortedDates[i - 1])) === 1) {
          run++;
          max = Math.max(max, run);
        } else {
          run = 1;
        }
      });
      return max;
    })();

    // ── 4. Projected annual ────────────────────────────────────────────────────
    const yearStart = startOfYear(new Date());
    const dayOfYear = differenceInDays(new Date(), yearStart) + 1;
    const yearCompletions = habitCompletions.filter(
      (c) => c.date >= format(yearStart, "yyyy-MM-dd")
    ).length;
    const dailyRate = dayOfYear > 0 ? yearCompletions / dayOfYear : 0;
    const projectedAnnual = Math.round(dailyRate * 365);
    const daysRemaining = 365 - dayOfYear;
    const projectedRemaining = Math.round(dailyRate * daysRemaining);
    const perfectYearGap = 365 - yearCompletions;

    return {
      weeklyRates,
      bestDayIdx,
      worstDayIdx,
      last30Rate,
      prev30Rate,
      momentumDelta,
      momentumTrend,
      longestGap,
      longestGapAfterDate,
      longestRecovery,
      lastCompletionDate,
      daysSinceLast,
      bestStreak,
      projectedAnnual,
      yearCompletions,
      projectedRemaining,
      perfectYearGap,
      dailyRate,
    };
  }, [habit.id, habit.start_date, completions]);

  // ── Calendar ─────────────────────────────────────────────────────────────────
  const { calendarWeeks, completedDates, streakRanges } = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const completed = new Set(
      completions.filter((c) => c.habit_id === habit.id).map((c) => c.date)
    );

    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    const firstDow = (getDay(monthStart) + 6) % 7;
    for (let i = 0; i < firstDow; i++) currentWeek.push(null);

    days.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    });
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    const sortedDates = completions
      .filter((c) => c.habit_id === habit.id)
      .map((c) => c.date).sort();

    const ranges: { start: string; end: string }[] = [];
    let rangeStart: string | null = null;
    let rangePrev: string | null = null;
    sortedDates.forEach((d) => {
      if (!rangeStart) { rangeStart = d; rangePrev = d; return; }
      const diff = differenceInDays(parseISO(d), parseISO(rangePrev!));
      if (diff === 1) { rangePrev = d; }
      else { ranges.push({ start: rangeStart, end: rangePrev! }); rangeStart = d; rangePrev = d; }
    });
    if (rangeStart) ranges.push({ start: rangeStart, end: rangePrev! });

    return { calendarWeeks: weeks, completedDates: completed, streakRanges: ranges };
  }, [viewMonth, habit.id, completions]);

  const today = format(new Date(), "yyyy-MM-dd");

  const getStreakPosition = (dateStr: string) => {
    for (const range of streakRanges) {
      if (dateStr >= range.start && dateStr <= range.end) {
        const isStart = dateStr === range.start;
        const isEnd = dateStr === range.end;
        return { inStreak: true, isStart, isEnd, isSingle: isStart && isEnd };
      }
    }
    return { inStreak: false, isStart: false, isEnd: false, isSingle: false };
  };

  const monthDays = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const pastDays = monthDays.filter((d) => format(d, "yyyy-MM-dd") <= today);
  const monthCompletions = pastDays.filter((d) => completedDates.has(format(d, "yyyy-MM-dd"))).length;
  const monthRate = pastDays.length > 0 ? Math.round((monthCompletions / pastDays.length) * 100) : 0;

  const { weeklyRates, bestDayIdx, worstDayIdx,
    last30Rate, prev30Rate, momentumDelta, momentumTrend,
    longestGap, daysSinceLast, bestStreak,
    projectedAnnual, yearCompletions, projectedRemaining, perfectYearGap,
  } = insights;

  const maxWeeklyRate = Math.max(...(weeklyRates.filter(r => r !== null) as number[]), 1);

  return (
    <div className="hdp-root space-y-3">
      <style>{`
        .hdp-root { font-family: inherit; }

        /* ── Shared card shell ── */
        .hdp-card {
          border-radius: 14px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          overflow: hidden;
        }
        .hdp-card-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px 0;
        }
        .hdp-card-title {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: hsl(var(--muted-foreground));
        }
        .hdp-card-body { padding: 10px 14px 14px; }

        /* ── KPI pill row ── */
        .hdp-kpi-row {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1px; background: hsl(var(--border));
          border-radius: 14px; overflow: hidden;
        }
        .hdp-kpi {
          display: flex; flex-direction: column; align-items: center;
          gap: 3px; padding: 14px 8px;
          background: hsl(var(--card));
        }
        .hdp-kpi-val {
          font-size: 20px; font-weight: 700; letter-spacing: -0.04em;
          color: hsl(var(--foreground)); line-height: 1;
        }
        .hdp-kpi-val--accent { color: hsl(var(--primary)); }
        .hdp-kpi-val--warn { color: hsl(var(--destructive)); }
        .hdp-kpi-lbl {
          font-size: 9.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: hsl(var(--muted-foreground));
          text-align: center; line-height: 1.3;
        }

        /* ── Weekly bar chart ── */
        .hdp-week-chart {
          display: flex; align-items: flex-end; gap: 5px;
          height: 64px; padding-top: 4px;
        }
        .hdp-week-col {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 5px; height: 100%;
        }
        .hdp-week-bar-wrap {
          flex: 1; width: 100%; display: flex;
          align-items: flex-end; justify-content: center;
        }
        .hdp-week-bar {
          width: 100%; border-radius: 4px 4px 0 0;
          min-height: 3px;
          background: hsl(var(--border));
          transition: height 0.4s cubic-bezier(0.34, 1.3, 0.64, 1), background 0.2s;
          position: relative;
        }
        .hdp-week-bar--best { background: hsl(var(--primary)); }
        .hdp-week-bar--worst { background: hsl(var(--destructive) / 0.55); }
        .hdp-week-bar--mid { background: hsl(var(--primary) / 0.45); }
        .hdp-week-bar--null { background: hsl(var(--border) / 0.4); }
        .hdp-week-label {
          font-size: 9px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.05em; color: hsl(var(--muted-foreground) / 0.6);
        }
        .hdp-week-label--best { color: hsl(var(--primary)); font-weight: 700; }
        .hdp-week-label--worst { color: hsl(var(--destructive)); font-weight: 700; }

        /* ── Momentum ── */
        .hdp-momentum-row {
          display: flex; align-items: center; gap: 10px;
        }
        .hdp-momentum-bars {
          flex: 1; display: flex; flex-direction: column; gap: 7px;
        }
        .hdp-momentum-track {
          height: 7px; border-radius: 99px;
          background: hsl(var(--border)); overflow: hidden;
        }
        .hdp-momentum-fill {
          height: 100%; border-radius: 99px;
          transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .hdp-momentum-fill--current { background: hsl(var(--primary)); }
        .hdp-momentum-fill--prev { background: hsl(var(--muted-foreground) / 0.35); }
        .hdp-momentum-meta {
          display: flex; flex-direction: column; align-items: flex-end;
          gap: 4px; flex-shrink: 0;
        }
        .hdp-momentum-badge {
          display: flex; align-items: center; gap: 4px;
          padding: 4px 8px; border-radius: 20px;
          font-size: 11px; font-weight: 700;
        }
        .hdp-momentum-badge--up {
          background: hsl(var(--primary) / 0.12);
          color: hsl(var(--primary));
        }
        .hdp-momentum-badge--down {
          background: hsl(var(--destructive) / 0.1);
          color: hsl(var(--destructive));
        }
        .hdp-momentum-badge--flat {
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
        }
        .hdp-momentum-period {
          font-size: 9.5px; color: hsl(var(--muted-foreground));
          text-align: right; line-height: 1.4;
        }

        /* ── Streak context ── */
        .hdp-streak-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .hdp-streak-stat {
          background: hsl(var(--muted) / 0.5);
          border-radius: 10px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .hdp-streak-stat-val {
          font-size: 17px; font-weight: 700; letter-spacing: -0.03em;
          color: hsl(var(--foreground)); line-height: 1;
        }
        .hdp-streak-stat-val--good { color: hsl(var(--primary)); }
        .hdp-streak-stat-val--warn { color: hsl(142 71% 45%); }
        .hdp-streak-stat-lbl {
          font-size: 9.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: hsl(var(--muted-foreground));
          line-height: 1.3;
        }

        /* ── Projection ── */
        .hdp-proj-main {
          display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px;
        }
        .hdp-proj-number {
          font-size: 36px; font-weight: 700; letter-spacing: -0.05em;
          color: hsl(var(--foreground)); line-height: 1;
        }
        .hdp-proj-unit {
          font-size: 13px; font-weight: 600;
          color: hsl(var(--muted-foreground));
        }
        .hdp-proj-track {
          height: 6px; border-radius: 99px;
          background: hsl(var(--border)); overflow: hidden; margin-bottom: 8px;
        }
        .hdp-proj-fill {
          height: 100%; border-radius: 99px;
          background: hsl(var(--primary));
          transition: width 0.6s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .hdp-proj-fill--behind { background: hsl(var(--destructive) / 0.6); }
        .hdp-proj-row {
          display: flex; justify-content: space-between;
          font-size: 10.5px; color: hsl(var(--muted-foreground));
        }
        .hdp-proj-row strong { color: hsl(var(--foreground)); font-weight: 600; }

        /* ── Calendar (existing) ── */
        .hdp-cal-nav {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .hdp-cal-title { font-weight: 600; font-size: 13px; }
        .hdp-cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr);
          margin-bottom: 4px;
        }
        .hdp-cal-wd {
          text-align: center; font-size: 9.5px; font-weight: 600;
          color: hsl(var(--muted-foreground)); padding: 2px 0;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .hdp-cal-week { display: grid; grid-template-columns: repeat(7, 1fr); }
        .hdp-cal-day {
          position: relative; height: 32px;
          display: flex; align-items: center; justify-content: center;
        }
        .hdp-cal-connector {
          position: absolute; inset-y: 2px; background: hsl(var(--primary) / 0.18);
        }
        .hdp-cal-dot {
          position: relative; z-index: 1;
          display: flex; width: 28px; height: 28px;
          align-items: center; justify-content: center;
          border-radius: 50%; font-size: 11.5px; font-weight: 500;
          transition: background 0.15s;
        }

        /* ── Monthly rate ── */
        .hdp-month-rate {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
        }
        .hdp-month-rate-label { font-size: 11px; color: hsl(var(--muted-foreground)); }
        .hdp-month-rate-val { font-size: 13px; font-weight: 700; color: hsl(var(--foreground)); }
        .hdp-month-track {
          height: 5px; border-radius: 99px;
          background: hsl(var(--border)); overflow: hidden; margin-bottom: 6px;
        }
        .hdp-month-fill {
          height: 100%; border-radius: 99px;
          background: hsl(var(--primary));
          transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .hdp-month-sub {
          font-size: 10px; color: hsl(var(--muted-foreground));
        }
      `}</style>



      <div className="hdp-card">
        <div className="hdp-card-header">
          <span className="hdp-card-title">Monthly view</span>
        </div>
        <div className="hdp-card-body">
          <div className="hdp-cal-nav">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="hdp-cal-title">{format(viewMonth, "MMMM yyyy")}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="hdp-cal-weekdays">
            {WEEKDAYS.map((d) => (
              <div key={d} className="hdp-cal-wd">{d.slice(0, 1)}</div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="hdp-cal-week">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="hdp-cal-day" />;
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCompleted = completedDates.has(dateStr);
                  const isToday = dateStr === today;
                  const { inStreak, isStart, isEnd, isSingle } = getStreakPosition(dateStr);

                  return (
                    <div key={di} className="hdp-cal-day">
                      {inStreak && !isSingle && (
                        <div className={cn(
                          "hdp-cal-connector",
                          isStart && "rounded-l-full left-1/2 right-0",
                          isEnd && "rounded-r-full left-0 right-1/2",
                          !isStart && !isEnd && "left-0 right-0",
                        )} />
                      )}
                      <span className={cn(
                        "hdp-cal-dot",
                        isCompleted && "bg-primary text-primary-foreground",
                        isToday && !isCompleted && "ring-1 ring-primary text-primary font-bold",
                        !isCompleted && !isToday && "text-foreground",
                      )}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="hdp-month-rate">
              <span className="hdp-month-rate-label">Monthly completion</span>
              <span className="hdp-month-rate-val">{monthRate}%</span>
            </div>
            <div className="hdp-month-track">
              <div className="hdp-month-fill" style={{ width: `${monthRate}%` }} />
            </div>
            <p className="hdp-month-sub">
              {monthCompletions} of {pastDays.length} days completed this month
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Weekly pattern ─────────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-card-header">
          <span className="hdp-card-title">Weekly pattern</span>
          <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
            {bestDayIdx >= 0 && (
              <span>💪 Best: <strong style={{ color: "hsl(var(--primary))" }}>{WEEKDAYS[bestDayIdx]}</strong>
                {worstDayIdx >= 0 && worstDayIdx !== bestDayIdx &&
                  <> · Weakest: <strong style={{ color: "hsl(var(--destructive))" }}>{WEEKDAYS[worstDayIdx]}</strong></>
                }</span>
            )}
          </span>
        </div>
        <div className="hdp-card-body">
          <div className="hdp-week-chart">
            {weeklyRates.map((rate, i) => {
              const isNull = rate === null;
              const isBest = i === bestDayIdx && !isNull;
              const isWorst = i === worstDayIdx && !isNull && worstDayIdx !== bestDayIdx;
              const heightPct = isNull ? 8 : Math.max(8, Math.round(((rate ?? 0) / maxWeeklyRate) * 100));
              return (
                <div key={i} className="hdp-week-col">
                  <div className="hdp-week-bar-wrap">
                    <div
                      className={cn(
                        "hdp-week-bar",
                        isNull && "hdp-week-bar--null",
                        !isNull && !isBest && !isWorst && "hdp-week-bar--mid",
                        isBest && "hdp-week-bar--best",
                        isWorst && "hdp-week-bar--worst",
                      )}
                      style={{ height: `${heightPct}%` }}
                      title={isNull ? "No data" : `${rate}%`}
                    />
                  </div>
                  <span className={cn(
                    "hdp-week-label",
                    isBest && "hdp-week-label--best",
                    isWorst && "hdp-week-label--worst",
                  )}>
                    {WEEKDAYS_SHORT[i]}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginTop: 8 }}>
            Completion rate per weekday since habit started
          </p>
        </div>
      </div>

      {/* ── 3. Momentum ───────────────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-card-header">
          <span className="hdp-card-title">Momentum</span>
        </div>
        <div className="hdp-card-body">
          <div className="hdp-momentum-row">
            <div className="hdp-momentum-bars">
              {/* Last 30 days */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "hsl(var(--foreground))", fontWeight: 600 }}>Last 30 days</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--primary))" }}>{last30Rate}%</span>
                </div>
                <div className="hdp-momentum-track">
                  <div className="hdp-momentum-fill hdp-momentum-fill--current" style={{ width: `${last30Rate}%` }} />
                </div>
              </div>
              {/* Prev 30 days */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>Previous 30 days</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>{prev30Rate}%</span>
                </div>
                <div className="hdp-momentum-track">
                  <div className="hdp-momentum-fill hdp-momentum-fill--prev" style={{ width: `${prev30Rate}%` }} />
                </div>
              </div>
            </div>

            {/* Trend badge */}
            <div className="hdp-momentum-meta">
              <div className={cn(
                "hdp-momentum-badge",
                momentumTrend === "up" && "hdp-momentum-badge--up",
                momentumTrend === "down" && "hdp-momentum-badge--down",
                momentumTrend === "flat" && "hdp-momentum-badge--flat",
              )}>
                {momentumTrend === "up" && <TrendUp />}
                {momentumTrend === "down" && <TrendDown />}
                {momentumTrend === "flat" && <TrendFlat />}
                {momentumTrend === "up" && `+${momentumDelta}%`}
                {momentumTrend === "down" && `${momentumDelta}%`}
                {momentumTrend === "flat" && "Steady"}
              </div>
              <span className="hdp-momentum-period">
                {momentumTrend === "up" && "Improving 🔥"}
                {momentumTrend === "down" && "Declining"}
                {momentumTrend === "flat" && "Consistent"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Streak context ─────────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-card-header">
          <span className="hdp-card-title">Streak history</span>
        </div>
        <div className="hdp-card-body">
          <div className="hdp-streak-grid">
            <div className="hdp-streak-stat">
              <span className={cn("hdp-streak-stat-val", bestStreak >= 7 && "hdp-streak-stat-val--good")}>
                {bestStreak > 0 ? `${bestStreak}d` : "—"}
              </span>
              <span className="hdp-streak-stat-lbl">Best streak ever</span>
            </div>
            <div className="hdp-streak-stat">
              <span className={cn(
                "hdp-streak-stat-val",
                longestGap === 0 && "hdp-streak-stat-val--good",
                longestGap > 7 && "hdp-streak-stat-val--warn",
              )}>
                {longestGap > 0 ? `${longestGap}d` : "None"}
              </span>
              <span className="hdp-streak-stat-lbl">Longest gap missed</span>
            </div>
            <div className="hdp-streak-stat">
              <span className={cn(
                "hdp-streak-stat-val",
                daysSinceLast <= 1 && "hdp-streak-stat-val--good",
                daysSinceLast > 3 && "hdp-streak-stat-val--warn",
              )}>
                {daysSinceLast === 0 ? "Today" : daysSinceLast === 1 ? "Yday" : `${daysSinceLast}d ago`}
              </span>
              <span className="hdp-streak-stat-lbl">Last completed</span>
            </div>
            <div className="hdp-streak-stat">
              <span className={cn(
                "hdp-streak-stat-val",
                insights.longestRecovery <= 2 && "hdp-streak-stat-val--good",
              )}>
                {insights.longestRecovery > 0 ? `${insights.longestRecovery}d` : "—"}
              </span>
              <span className="hdp-streak-stat-lbl">Longest recovery</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5. Projected annual ───────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-card-header">
          <span className="hdp-card-title">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <CalendarProjectIcon /> Projected {new Date().getFullYear()}
            </span>
          </span>
        </div>
        <div className="hdp-card-body">
          <div className="hdp-proj-main">
            <span className="hdp-proj-number">{projectedAnnual}</span>
            <span className="hdp-proj-unit">completions / year</span>
          </div>

          {/* Progress toward 365 */}
          <div className="hdp-proj-track">
            <div
              className={cn("hdp-proj-fill", projectedAnnual < 200 && "hdp-proj-fill--behind")}
              style={{ width: `${Math.min(100, Math.round((projectedAnnual / 365) * 100))}%` }}
            />
          </div>

          <div className="hdp-proj-row">
            <span><strong>{yearCompletions}</strong> done so far</span>
            <span>+<strong>{projectedRemaining}</strong> projected remaining</span>
          </div>

          {perfectYearGap > 0 && (
            <p style={{
              marginTop: 8, fontSize: 10.5,
              color: "hsl(var(--muted-foreground))",
              background: "hsl(var(--muted) / 0.5)",
              borderRadius: 8, padding: "7px 10px",
            }}>
              {perfectYearGap <= projectedRemaining
                ? `✅ On track — you could hit ${yearCompletions + projectedRemaining} by year end`
                : `Need ${Math.round((perfectYearGap - projectedRemaining) / Math.max(1, 365 - (new Date().getDate())))} more days/week to reach 365`
              }
            </p>
          )}
        </div>
      </div>
    </div>
  );
}