import { useMemo, useState, ReactNode } from "react";
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, subDays, addMonths, subMonths,
  differenceInDays, parseISO,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Habit, HabitCompletion } from "@/hooks/useHabits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
  description?: string | null;
}

interface DailyCheckScenario {
  title: string;
  prompt: string;
  outcomes: { label: string; text: string }[];
}

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[0].startsWith("**")) {
      nodes.push(<strong key={match.index}>{match[2]}</strong>);
    } else {
      nodes.push(<em key={match.index}>{match[3]}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function parseDailyCheck(content: string): DailyCheckScenario[] {
  const scenarios: DailyCheckScenario[] = [];
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  let current: Partial<DailyCheckScenario> | null = null;

  for (const line of lines) {
    if (line.startsWith("→")) {
      if (current) current.prompt = line.slice(1).trim();
    } else if (line.startsWith("* ")) {
      if (current) {
        if (!current.outcomes) current.outcomes = [];
        const raw = line.slice(1).trim();
        const m = raw.match(/^\*\*(.+?)\*\*[:\s]+(.+)/);
        if (m) current.outcomes.push({ label: m[1], text: m[2] });
        else current.outcomes.push({ label: "", text: raw });
      }
    } else {
      if (current?.title) scenarios.push(current as DailyCheckScenario);
      current = { title: line.replace(/\*\*/g, ""), outcomes: [] };
    }
  }
  if (current?.title) scenarios.push(current as DailyCheckScenario);
  return scenarios;
}

const TrendUp = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const TrendDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
);
const TrendFlat = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export function PersonaDetailPanel({ habit, completions, description }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date());

  const stats = useMemo(() => {
    const mine = completions.filter((c) => c.habit_id === habit.id);
    const completedSet = new Set(mine.map((c) => c.date));
    const today = format(new Date(), "yyyy-MM-dd");

    // Current streak
    let streak = 0;
    let cursor = new Date();
    while (true) {
      const d = format(cursor, "yyyy-MM-dd");
      if (completedSet.has(d)) { streak++; cursor = subDays(cursor, 1); }
      else if (d === today) { cursor = subDays(cursor, 1); } // today not yet done, check yesterday
      else break;
    }

    // Last completed
    const sorted = [...completedSet].sort();
    const lastDate = sorted[sorted.length - 1] || null;
    const daysSinceLast = lastDate
      ? differenceInDays(new Date(), parseISO(lastDate))
      : null;

    // Momentum: last 30 vs prev 30
    const last30Start = format(subDays(new Date(), 29), "yyyy-MM-dd");
    const prev30Start = format(subDays(new Date(), 59), "yyyy-MM-dd");
    const prev30End = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const last30 = mine.filter((c) => c.date >= last30Start && c.date <= today).length;
    const prev30 = mine.filter((c) => c.date >= prev30Start && c.date <= prev30End).length;
    const last30Rate = Math.round((last30 / 30) * 100);
    const prev30Rate = Math.round((prev30 / 30) * 100);
    const delta = last30Rate - prev30Rate;
    const trend = delta > 3 ? "up" : delta < -3 ? "down" : "flat";

    return { streak, daysSinceLast, last30Rate, prev30Rate, delta, trend };
  }, [habit.id, completions]);

  const { calendarWeeks, completedDates, streakRanges } = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const completed = new Set(
      completions.filter((c) => c.habit_id === habit.id).map((c) => c.date)
    );

    const weeks: (Date | null)[][] = [];
    let week: (Date | null)[] = [];
    const firstDow = (getDay(monthStart) + 6) % 7;
    for (let i = 0; i < firstDow; i++) week.push(null);
    days.forEach((day) => {
      week.push(day);
      if (week.length === 7) { weeks.push(week); week = []; }
    });
    if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

    const sortedDates = completions
      .filter((c) => c.habit_id === habit.id)
      .map((c) => c.date).sort();

    const ranges: { start: string; end: string }[] = [];
    let rs: string | null = null, rp: string | null = null;
    sortedDates.forEach((d) => {
      if (!rs) { rs = d; rp = d; return; }
      const diff = differenceInDays(parseISO(d), parseISO(rp!));
      if (diff === 1) { rp = d; }
      else { ranges.push({ start: rs, end: rp! }); rs = d; rp = d; }
    });
    if (rs) ranges.push({ start: rs, end: rp! });

    return { calendarWeeks: weeks, completedDates: completed, streakRanges: ranges };
  }, [viewMonth, habit.id, completions]);

  const today = format(new Date(), "yyyy-MM-dd");

  const getStreakPos = (dateStr: string) => {
    for (const r of streakRanges) {
      if (dateStr >= r.start && dateStr <= r.end) {
        const isStart = dateStr === r.start;
        const isEnd = dateStr === r.end;
        return { inStreak: true, isStart, isEnd, isSingle: isStart && isEnd };
      }
    }
    return { inStreak: false, isStart: false, isEnd: false, isSingle: false };
  };

  const monthDays = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const pastDays = monthDays.filter((d) => format(d, "yyyy-MM-dd") <= today);
  const monthDone = pastDays.filter((d) => completedDates.has(format(d, "yyyy-MM-dd"))).length;
  const monthRate = pastDays.length > 0 ? Math.round((monthDone / pastDays.length) * 100) : 0;

  const { streak, daysSinceLast, last30Rate, prev30Rate, delta, trend } = stats;

  const lastDoneLabel =
    daysSinceLast === null ? "—"
    : daysSinceLast === 0 ? "Today"
    : daysSinceLast === 1 ? "Yesterday"
    : `${daysSinceLast}d ago`;

  return (
    <div className="pdp-root space-y-3">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;500&family=Playfair+Display:wght@700;800&display=swap');
        .pdp-root { font-family: inherit; }

        .pdp-card {
          border-radius: 14px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--card));
          overflow: hidden;
        }
        .pdp-card-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px 0;
        }
        .pdp-card-title {
          font-size: 10px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: hsl(var(--muted-foreground));
        }
        .pdp-card-body { padding: 10px 14px 14px; }

        /* Description / Mindset */
        .pdp-desc-wrap {
          border-radius: 14px;
          background: hsl(var(--muted) / 0.4);
          padding: 12px 14px 14px;
          position: relative; overflow: hidden;
        }
        .pdp-desc-wrap::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0));
        }
        .pdp-desc-label {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.12em; color: hsl(var(--primary) / 0.65);
          display: block; margin-bottom: 8px;
        }
        .pdp-desc-text {
          font-family: 'Lora', Georgia, serif;
          font-size: 15px; line-height: 1.75; font-weight: 400;
          color: hsl(var(--foreground) / 0.82);
          white-space: pre-wrap; word-break: break-word;
        }
        .pdp-desc-power {
          margin-top: 16px;
          padding: 16px 16px 16px 20px;
          border-radius: 10px;
          background: hsl(var(--primary) / 0.07);
          border-left: 3px solid hsl(var(--primary) / 0.7);
          position: relative;
        }
        .pdp-desc-power-quote {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 52px; line-height: 0.8;
          color: hsl(var(--primary) / 0.25);
          display: block; margin-bottom: 6px;
          user-select: none;
        }
        .pdp-desc-power-text {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 17px; font-style: normal; font-weight: 700; line-height: 1.55;
          color: hsl(var(--primary) / 0.95);
          white-space: pre-wrap; word-break: break-word;
          letter-spacing: 0.02em;
        }

        /* Daily Check */
        .pdp-dc-divider {
          margin: 16px 0 14px;
          border: none; border-top: 1px solid hsl(var(--border) / 0.5);
        }
        .pdp-dc-header {
          display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
        }
        .pdp-dc-label {
          font-size: 9px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.12em; color: hsl(var(--muted-foreground) / 0.65);
        }
        .pdp-dc-inner {
          background: hsl(var(--card) / 0.55);
          border: 1px solid hsl(var(--border) / 0.5);
          border-radius: 10px;
          padding: 12px 14px;
          display: flex; flex-direction: column; gap: 0;
        }
        .pdp-dc-scenario {
          padding: 10px 0;
        }
        .pdp-dc-scenario + .pdp-dc-scenario {
          border-top: 1px solid hsl(var(--border) / 0.35);
        }
        .pdp-dc-scenario-title {
          font-size: 12.5px; font-weight: 700;
          color: hsl(var(--foreground) / 0.88);
          margin-bottom: 6px;
        }
        .pdp-dc-prompt {
          display: flex; align-items: baseline; gap: 6px;
          margin-bottom: 8px;
        }
        .pdp-dc-prompt-arrow {
          font-size: 13px; font-weight: 800;
          color: hsl(var(--primary) / 0.7); flex-shrink: 0;
        }
        .pdp-dc-prompt-text {
          font-size: 12px; color: hsl(var(--muted-foreground));
          line-height: 1.5;
        }
        .pdp-dc-outcomes {
          display: flex; flex-direction: column; gap: 5px;
          padding-left: 19px;
        }
        .pdp-dc-outcome {
          display: flex; align-items: baseline; gap: 7px;
          font-size: 12px; line-height: 1.45;
        }
        .pdp-dc-badge {
          padding: 1px 6px; border-radius: 4px;
          font-size: 9.5px; font-weight: 700; flex-shrink: 0;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .pdp-dc-badge--yes {
          background: hsl(var(--primary) / 0.12);
          color: hsl(var(--primary));
        }
        .pdp-dc-badge--no {
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
        }
        .pdp-dc-outcome-text {
          color: hsl(var(--foreground) / 0.72);
        }

        /* Calendar */
        .pdp-cal-nav {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 12px;
        }
        .pdp-cal-title { font-weight: 600; font-size: 13px; }
        .pdp-cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr);
          margin-bottom: 4px;
        }
        .pdp-cal-wd {
          text-align: center; font-size: 9.5px; font-weight: 600;
          color: hsl(var(--muted-foreground)); padding: 2px 0;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .pdp-cal-week { display: grid; grid-template-columns: repeat(7, 1fr); }
        .pdp-cal-day {
          position: relative; height: 32px;
          display: flex; align-items: center; justify-content: center;
        }
        .pdp-cal-connector {
          position: absolute; inset-y: 2px; background: hsl(var(--primary) / 0.18);
        }
        .pdp-cal-dot {
          position: relative; z-index: 1;
          display: flex; width: 28px; height: 28px;
          align-items: center; justify-content: center;
          border-radius: 50%; font-size: 11.5px; font-weight: 500;
          transition: background 0.15s;
        }
        .pdp-month-rate {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 6px;
        }
        .pdp-month-rate-label { font-size: 11px; color: hsl(var(--muted-foreground)); }
        .pdp-month-rate-val { font-size: 13px; font-weight: 700; color: hsl(var(--foreground)); }
        .pdp-month-track {
          height: 5px; border-radius: 99px;
          background: hsl(var(--border)); overflow: hidden; margin-bottom: 6px;
        }
        .pdp-month-fill {
          height: 100%; border-radius: 99px; background: hsl(var(--primary));
          transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .pdp-month-sub { font-size: 10px; color: hsl(var(--muted-foreground)); }

        /* Streak + Momentum */
        .pdp-sm-stats {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px; margin-bottom: 14px;
        }
        .pdp-sm-stat {
          background: hsl(var(--muted) / 0.5);
          border-radius: 10px; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .pdp-sm-stat-val {
          font-size: 18px; font-weight: 700; letter-spacing: -0.03em;
          color: hsl(var(--foreground)); line-height: 1;
        }
        .pdp-sm-stat-val--good { color: hsl(var(--primary)); }
        .pdp-sm-stat-val--warn { color: hsl(var(--destructive)); }
        .pdp-sm-stat-lbl {
          font-size: 9.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: hsl(var(--muted-foreground));
        }
        .pdp-momentum-row { display: flex; align-items: center; gap: 10px; }
        .pdp-momentum-bars { flex: 1; display: flex; flex-direction: column; gap: 7px; }
        .pdp-momentum-track {
          height: 6px; border-radius: 99px;
          background: hsl(var(--border)); overflow: hidden;
        }
        .pdp-momentum-fill {
          height: 100%; border-radius: 99px;
          transition: width 0.5s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .pdp-momentum-fill--now { background: hsl(var(--primary)); }
        .pdp-momentum-fill--prev { background: hsl(var(--muted-foreground) / 0.3); }
        .pdp-momentum-badge {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 9px; border-radius: 20px;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .pdp-momentum-badge--up { background: hsl(var(--primary) / 0.12); color: hsl(var(--primary)); }
        .pdp-momentum-badge--down { background: hsl(var(--destructive) / 0.1); color: hsl(var(--destructive)); }
        .pdp-momentum-badge--flat { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
      `}</style>

      {/* ── 1. Description (if set) ─────────────────────────────────────────── */}
      {description && (() => {
        const [mindsetPart, dailyCheckPart] = description.split(/\n---+\n/);
        const lines = (mindsetPart || "").split("\n");
        const bodyLines: string[] = [];
        const powerLines: string[] = [];
        lines.forEach((line) => {
          if (line.startsWith(">")) powerLines.push(line.slice(1).trim());
          else bodyLines.push(line);
        });
        const body = bodyLines.join("\n").trim();
        const power = powerLines.join("\n").trim();
        const dailyCheck = dailyCheckPart ? parseDailyCheck(dailyCheckPart) : null;

        return (
          <div className="pdp-desc-wrap">
            <span className="pdp-desc-label">Mindset</span>
            {body && <p className="pdp-desc-text">{body}</p>}
            {power && (
              <div className="pdp-desc-power">
                <span className="pdp-desc-power-quote">"</span>
                <p className="pdp-desc-power-text">{power}</p>
              </div>
            )}

            {dailyCheck && dailyCheck.length > 0 && (
              <>
                <hr className="pdp-dc-divider" />
                <div className="pdp-dc-header">
                  <span className="pdp-dc-label">Daily Check</span>
                </div>
                <div className="pdp-dc-inner">
                  {dailyCheck.map((scenario, i) => (
                    <div key={i} className="pdp-dc-scenario">
                      <div className="pdp-dc-scenario-title">{scenario.title}</div>
                      {scenario.prompt && (
                        <div className="pdp-dc-prompt">
                          <span className="pdp-dc-prompt-arrow">→</span>
                          <span className="pdp-dc-prompt-text">{parseInline(scenario.prompt)}</span>
                        </div>
                      )}
                      {scenario.outcomes?.length > 0 && (
                        <div className="pdp-dc-outcomes">
                          {scenario.outcomes.map((o, j) => {
                            const isYes = /^yes$/i.test(o.label);
                            const isNo = /^no$/i.test(o.label);
                            return (
                              <div key={j} className="pdp-dc-outcome">
                                {o.label && (
                                  <span className={cn(
                                    "pdp-dc-badge",
                                    isYes && "pdp-dc-badge--yes",
                                    isNo && "pdp-dc-badge--no",
                                  )}>
                                    {o.label}
                                  </span>
                                )}
                                <span className="pdp-dc-outcome-text">{parseInline(o.text)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── 2. Monthly view ─────────────────────────────────────────────────── */}
      <div className="pdp-card">
        <div className="pdp-card-header">
          <span className="pdp-card-title">Monthly view</span>
        </div>
        <div className="pdp-card-body">
          <div className="pdp-cal-nav">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="pdp-cal-title">{format(viewMonth, "MMMM yyyy")}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              disabled={startOfMonth(viewMonth) >= startOfMonth(new Date())}
              onClick={() => setViewMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="pdp-cal-weekdays">
            {["M","T","W","T","F","S","S"].map((d, i) => (
              <div key={i} className="pdp-cal-wd">{d}</div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="pdp-cal-week">
                {week.map((day, di) => {
                  if (!day) return <div key={di} className="pdp-cal-day" />;
                  const dateStr = format(day, "yyyy-MM-dd");
                  const isCompleted = completedDates.has(dateStr);
                  const isToday = dateStr === today;
                  const { inStreak, isStart, isEnd, isSingle } = getStreakPos(dateStr);
                  return (
                    <div key={di} className="pdp-cal-day">
                      {inStreak && !isSingle && (
                        <div className={cn(
                          "pdp-cal-connector",
                          isStart && "rounded-l-full left-1/2 right-0",
                          isEnd && "rounded-r-full left-0 right-1/2",
                          !isStart && !isEnd && "left-0 right-0",
                        )} />
                      )}
                      <span className={cn(
                        "pdp-cal-dot",
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
            <div className="pdp-month-rate">
              <span className="pdp-month-rate-label">Monthly completion</span>
              <span className="pdp-month-rate-val">{monthRate}%</span>
            </div>
            <div className="pdp-month-track">
              <div className="pdp-month-fill" style={{ width: `${monthRate}%` }} />
            </div>
            <p className="pdp-month-sub">{monthDone} of {pastDays.length} days held this month</p>
          </div>
        </div>
      </div>

      {/* ── 3. Streak & Momentum ────────────────────────────────────────────── */}
      <div className="pdp-card">
        <div className="pdp-card-header">
          <span className="pdp-card-title">Streak & Momentum</span>
        </div>
        <div className="pdp-card-body">
          <div className="pdp-sm-stats">
            <div className="pdp-sm-stat">
              <span className={cn("pdp-sm-stat-val", streak >= 3 && "pdp-sm-stat-val--good")}>
                {streak > 0 ? `${streak}d` : "—"}
              </span>
              <span className="pdp-sm-stat-lbl">{streak > 0 ? "🔥 Current streak" : "Streak"}</span>
            </div>
            <div className="pdp-sm-stat">
              <span className={cn(
                "pdp-sm-stat-val",
                daysSinceLast === 0 || daysSinceLast === 1 ? "pdp-sm-stat-val--good" : "",
                daysSinceLast !== null && daysSinceLast > 3 ? "pdp-sm-stat-val--warn" : "",
              )}>
                {lastDoneLabel}
              </span>
              <span className="pdp-sm-stat-lbl">Last held</span>
            </div>
          </div>

          <div className="pdp-momentum-row">
            <div className="pdp-momentum-bars">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "hsl(var(--foreground))", fontWeight: 600 }}>Last 30 days</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: "hsl(var(--primary))" }}>{last30Rate}%</span>
                </div>
                <div className="pdp-momentum-track">
                  <div className="pdp-momentum-fill pdp-momentum-fill--now" style={{ width: `${last30Rate}%` }} />
                </div>
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: "hsl(var(--muted-foreground))" }}>Previous 30 days</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>{prev30Rate}%</span>
                </div>
                <div className="pdp-momentum-track">
                  <div className="pdp-momentum-fill pdp-momentum-fill--prev" style={{ width: `${prev30Rate}%` }} />
                </div>
              </div>
            </div>

            <div className={cn(
              "pdp-momentum-badge",
              trend === "up" && "pdp-momentum-badge--up",
              trend === "down" && "pdp-momentum-badge--down",
              trend === "flat" && "pdp-momentum-badge--flat",
            )}>
              {trend === "up" && <><TrendUp /> +{delta}%</>}
              {trend === "down" && <><TrendDown /> {delta}%</>}
              {trend === "flat" && <><TrendFlat /> Steady</>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
