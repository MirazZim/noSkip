import { useMemo, useState, useRef, useEffect } from "react";
import { format, eachDayOfInterval, getDay, startOfYear, endOfToday, parseISO, addDays } from "date-fns";
import { HabitCompletion } from "@/hooks/useHabits";
import { cn } from "@/lib/utils";

interface Props {
  habitId: string;
  completions: HabitCompletion[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function StreakGrid({ habitId, completions }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { grid, monthLabels, totalDone, longestStreak } = useMemo(() => {
    const today = endOfToday();
    const start = startOfYear(today);
    const days = eachDayOfInterval({ start, end: today });

    const completedSet = new Set(
      completions.filter((c) => c.habit_id === habitId).map((c) => c.date)
    );
    const retroSet = new Set(
      completions.filter((c) => c.habit_id === habitId && c.is_retroactive).map((c) => c.date)
    );

    // Intensity: 1=isolated, 2=has 1 neighbor, 3=both neighbors (middle of streak)
    const intensityMap = new Map<string, number>();
    completedSet.forEach((dateStr) => {
      const d = parseISO(dateStr);
      const prev = format(addDays(d, -1), "yyyy-MM-dd");
      const next = format(addDays(d, 1), "yyyy-MM-dd");
      const hasPrev = completedSet.has(prev);
      const hasNext = completedSet.has(next);
      intensityMap.set(dateStr, hasPrev && hasNext ? 3 : hasPrev || hasNext ? 2 : 1);
    });

    const todayStr = format(today, "yyyy-MM-dd");

    const weeks: { date: string; done: boolean; retro: boolean; future: boolean; intensity: number; isToday: boolean }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    const firstDow = (getDay(start) + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ date: "", done: false, retro: false, future: false, intensity: 0, isToday: false });
    }

    days.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      currentWeek.push({
        date: dateStr,
        done: completedSet.has(dateStr),
        retro: retroSet.has(dateStr),
        future: false,
        intensity: intensityMap.get(dateStr) ?? 0,
        isToday: dateStr === todayStr,
      });
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    });
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push({ date: "", done: false, retro: false, future: true, intensity: 0, isToday: false });
      weeks.push(currentWeek);
    }

    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstValid = week.find((d) => d.date && !d.future);
      if (firstValid?.date) {
        const m = parseInt(firstValid.date.substring(5, 7)) - 1;
        if (m !== lastMonth) { labels.push({ label: MONTHS[m], col: i }); lastMonth = m; }
      }
    });

    const totalDone = completedSet.size;
    let longestStreak = 0, cur = 0;
    days.forEach((day) => {
      if (completedSet.has(format(day, "yyyy-MM-dd"))) { cur++; longestStreak = Math.max(longestStreak, cur); }
      else { cur = 0; }
    });

    return { grid: weeks, monthLabels: labels, totalDone, longestStreak };
  }, [habitId, completions]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [grid]);

  const CELL = 15;
  const GAP = 4;
  const COL_W = CELL + GAP;

  const getCellStyle = (day: { done: boolean; retro: boolean; intensity: number; isToday: boolean }): React.CSSProperties => {
    if (day.retro) return { background: "hsl(var(--primary) / 0.4)", boxShadow: "inset 0 0 0 1px hsl(var(--primary) / 0.3)" };
    if (!day.done) return {};
    if (day.intensity === 1) return { background: "hsl(var(--primary) / 0.55)" };
    if (day.intensity === 2) return { background: "hsl(var(--primary) / 0.78)", boxShadow: "0 0 6px hsl(var(--primary) / 0.35)" };
    return { background: "hsl(var(--primary))", boxShadow: "0 0 10px hsl(var(--primary) / 0.55), 0 0 3px hsl(var(--primary) / 0.4)" };
  };

  const handleMouseEnter = (day: { date: string; done: boolean; retro: boolean; future: boolean; intensity: number; isToday: boolean }, e: React.MouseEvent) => {
    if (!day.date) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = (e.currentTarget as HTMLElement).closest(".sg-wrap")?.getBoundingClientRect();
    if (!containerRect) return;
    const parsed = parseISO(day.date);
    const dateLabel = format(parsed, "MMM d - EEEE");
    const label = day.done
      ? `✓ ${dateLabel}${day.retro ? " · logged late" : ""}`
      : `${dateLabel} · not logged`;
    setTooltip({ text: label, x: rect.left - containerRect.left + CELL / 2, y: rect.top - containerRect.top - 8 });
  };

  const completionRate = Math.round((totalDone / Math.max(1, eachDayOfInterval({ start: startOfYear(new Date()), end: new Date() }).length)) * 100);

  return (
    <>
      <style>{`
        .sg-wrap { position: relative; }

        .sg-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .sg-stat-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 10px 6px;
          border-radius: 12px;
          background: hsl(var(--muted) / 0.45);
          border: 1px solid hsl(var(--border) / 0.6);
          transition: background 0.2s;
        }
        .sg-stat-val {
          font-size: 17px;
          font-weight: 700;
          letter-spacing: -0.04em;
          color: hsl(var(--foreground));
          line-height: 1;
        }
        .sg-stat-val--accent { color: hsl(var(--primary)); text-shadow: 0 0 12px hsl(var(--primary) / 0.4); }
        .sg-stat-lbl {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: hsl(var(--muted-foreground));
          text-align: center;
        }

        .sg-scroll-wrap { position: relative; }
        .sg-scroll-wrap::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 6px;
          width: 28px;
          background: linear-gradient(to right, transparent, hsl(var(--card)));
          pointer-events: none;
          z-index: 1;
        }
        .sg-scroll {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 6px;
          padding-right: 16px;
        }
        .sg-scroll::-webkit-scrollbar { height: 3px; }
        .sg-scroll::-webkit-scrollbar-track { background: transparent; }
        .sg-scroll::-webkit-scrollbar-thumb { background: hsl(var(--primary) / 0.25); border-radius: 99px; }
        .sg-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary) / 0.5); }
        .sg-scroll { scrollbar-width: thin; scrollbar-color: hsl(var(--primary) / 0.25) transparent; }

        .sg-month-row {
          position: relative;
          height: 16px;
          margin-bottom: 4px;
          min-width: max-content;
        }
        .sg-month-label {
          position: absolute;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: hsl(var(--muted-foreground) / 0.55);
          white-space: nowrap;
          top: 0;
          line-height: 16px;
        }

        .sg-body { display: flex; min-width: max-content; }

        .sg-day-labels {
          display: flex;
          flex-direction: column;
          gap: ${GAP}px;
          margin-right: 6px;
        }
        .sg-day-label {
          font-size: 8.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground) / 0.4);
          height: ${CELL}px;
          display: flex;
          align-items: center;
          line-height: 1;
          width: 10px;
        }

        .sg-grid { display: flex; gap: ${GAP}px; }
        .sg-col  { display: flex; flex-direction: column; gap: ${GAP}px; }

        .sg-cell {
          width: ${CELL}px;
          height: ${CELL}px;
          border-radius: 4px;
          cursor: default;
          transition: transform 0.12s ease, box-shadow 0.15s ease;
          position: relative;
        }
        .sg-cell--empty   { background: transparent; }
        .sg-cell--future  { background: transparent; }
        .sg-cell--blank   { background: hsl(var(--muted) / 0.3); }
        .sg-cell--done    { cursor: pointer; }
        .sg-cell--retro   { cursor: pointer; }

        .sg-cell--blank:hover { background: hsl(var(--muted) / 0.5); }
        .sg-cell--done:hover, .sg-cell--retro:hover { transform: scale(1.35); z-index: 2; }

        @keyframes sg-today-pulse {
          0%, 100% { outline-color: rgba(255,255,255,0.7); }
          50%       { outline-color: rgba(255,255,255,1); }
        }
        .sg-cell--today {
          outline: 2.5px solid rgba(255,255,255,0.9);
          outline-offset: 2.5px;
          border-radius: 4px;
          z-index: 3;
          animation: sg-today-pulse 2s ease-in-out infinite;
        }

        .sg-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 12px;
        }
        .sg-rate {
          font-size: 10px;
          font-weight: 600;
          color: hsl(var(--muted-foreground));
        }
        .sg-rate strong { color: hsl(var(--foreground)); }

        .sg-legend { display: flex; align-items: center; gap: 5px; }
        .sg-legend-label {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: hsl(var(--muted-foreground) / 0.5);
        }
        .sg-legend-cells { display: flex; gap: 3px; align-items: center; }
        .sg-legend-cell  { width: 10px; height: 10px; border-radius: 2px; }

        .sg-tooltip {
          position: absolute;
          background: hsl(var(--popover));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--popover-foreground));
          font-size: 11px;
          font-weight: 500;
          padding: 5px 10px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 10;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
          transform: translate(-50%, -100%);
          letter-spacing: -0.01em;
        }
        .sg-tooltip::after {
          content: '';
          position: absolute;
          top: 100%; left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-top-color: hsl(var(--border));
        }
      `}</style>

      <div className="sg-wrap" onMouseLeave={() => setTooltip(null)}>

        {/* Stat pills */}
        <div className="sg-stats">
          <div className="sg-stat-pill">
            <span className={cn("sg-stat-val", totalDone > 0 && "sg-stat-val--accent")}>{totalDone}</span>
            <span className="sg-stat-lbl">This year</span>
          </div>
          <div className="sg-stat-pill">
            <span className={cn("sg-stat-val", longestStreak >= 7 && "sg-stat-val--accent")}>
              {longestStreak > 0 ? `${longestStreak}d` : "—"}
            </span>
            <span className="sg-stat-lbl">Best streak</span>
          </div>
          <div className="sg-stat-pill">
            <span className="sg-stat-val">{completionRate}%</span>
            <span className="sg-stat-lbl">Year rate</span>
          </div>
        </div>

        {/* Grid with fade-right edge */}
        <div className="sg-scroll-wrap">
          <div className="sg-scroll" ref={scrollRef}>
            <div className="sg-month-row" style={{ width: grid.length * COL_W }}>
              {monthLabels.map((m, i) => (
                <span key={i} className="sg-month-label" style={{ left: m.col * COL_W }}>{m.label}</span>
              ))}
            </div>

            <div className="sg-body">
              <div className="sg-day-labels">
                {["M", "", "W", "", "F", "", "S"].map((l, i) => (
                  <span key={i} className="sg-day-label">{l}</span>
                ))}
              </div>

              <div className="sg-grid">
                {grid.map((week, wi) => (
                  <div key={wi} className="sg-col">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        className={cn(
                          "sg-cell",
                          !day.date && !day.future && "sg-cell--empty",
                          !day.date && day.future  && "sg-cell--future",
                          day.date && !day.done    && "sg-cell--blank",
                          day.date && day.done && !day.retro && "sg-cell--done",
                          day.date && day.done &&  day.retro && "sg-cell--retro",
                          day.isToday && "sg-cell--today",
                        )}
                        style={getCellStyle(day)}
                        onMouseEnter={(e) => handleMouseEnter(day, e)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer: year rate + legend */}
        <div className="sg-footer">
          <span className="sg-rate"><strong>{totalDone}</strong> days completed in {new Date().getFullYear()}</span>
          <div className="sg-legend">
            <span className="sg-legend-label">Less</span>
            <div className="sg-legend-cells">
              {[
                "hsl(var(--muted) / 0.3)",
                "hsl(var(--primary) / 0.35)",
                "hsl(var(--primary) / 0.55)",
                "hsl(var(--primary) / 0.78)",
                "hsl(var(--primary))",
              ].map((bg, i) => (
                <div key={i} className="sg-legend-cell" style={{ background: bg }} />
              ))}
            </div>
            <span className="sg-legend-label">More</span>
          </div>
        </div>

        {tooltip && (
          <div className="sg-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.text}
          </div>
        )}
      </div>
    </>
  );
}
