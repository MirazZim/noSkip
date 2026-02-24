import { useMemo, useState } from "react";
import { format, eachDayOfInterval, getDay, startOfYear, endOfToday } from "date-fns";
import { HabitCompletion } from "@/hooks/useHabits";
import { cn } from "@/lib/utils";

interface Props {
  habitId: string;
  completions: HabitCompletion[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["M", "W", "F"]; // every other row label

export function StreakGrid({ habitId, completions }: Props) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { grid, monthLabels, totalDone, longestStreak } = useMemo(() => {
    const today = endOfToday();
    const start = startOfYear(today); // Jan 1 of current year
    const days = eachDayOfInterval({ start, end: today });

    const completedSet = new Set(
      completions.filter((c) => c.habit_id === habitId).map((c) => c.date)
    );
    const retroSet = new Set(
      completions.filter((c) => c.habit_id === habitId && c.is_retroactive).map((c) => c.date)
    );

    // Build weeks starting Mon=0
    const weeks: { date: string; done: boolean; retro: boolean; future: boolean }[][] = [];
    let currentWeek: typeof weeks[0] = [];

    // Pad first week so Mon lines up
    const firstDow = (getDay(start) + 6) % 7;
    for (let i = 0; i < firstDow; i++) {
      currentWeek.push({ date: "", done: false, retro: false, future: false });
    }

    days.forEach((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      currentWeek.push({
        date: dateStr,
        done: completedSet.has(dateStr),
        retro: retroSet.has(dateStr),
        future: false,
      });
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });
    // Fill remaining days as future
    if (currentWeek.length) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: "", done: false, retro: false, future: true });
      }
      weeks.push(currentWeek);
    }

    // Month labels — one per new month
    const labels: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstValid = week.find((d) => d.date && !d.future);
      if (firstValid?.date) {
        const m = parseInt(firstValid.date.substring(5, 7)) - 1;
        if (m !== lastMonth) {
          labels.push({ label: MONTHS[m], col: i });
          lastMonth = m;
        }
      }
    });

    // Stats
    const totalDone = completedSet.size;
    let longestStreak = 0;
    let cur = 0;
    days.forEach((day) => {
      if (completedSet.has(format(day, "yyyy-MM-dd"))) {
        cur++;
        longestStreak = Math.max(longestStreak, cur);
      } else {
        cur = 0;
      }
    });

    return { grid: weeks, monthLabels: labels, totalDone, longestStreak };
  }, [habitId, completions]);

  const CELL = 13;
  const GAP = 3;
  const COL_W = CELL + GAP;

  const handleMouseEnter = (day: { date: string; done: boolean; retro: boolean; future: boolean }, e: React.MouseEvent) => {
    if (!day.date) return;
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const containerRect = (e.currentTarget as HTMLElement).closest(".sg-wrap")?.getBoundingClientRect();
    if (!containerRect) return;
    const label = day.done
      ? `✓ ${format(new Date(day.date), "MMM d")}${day.retro ? " · logged late" : ""}`
      : `${format(new Date(day.date), "MMM d")} · not logged`;
    setTooltip({
      text: label,
      x: rect.left - containerRect.left + CELL / 2,
      y: rect.top - containerRect.top - 8,
    });
  };

  return (
    <>
      <style>{`
        .sg-wrap { position: relative; }

        .sg-meta {
          display: flex;
          gap: 16px;
          margin-bottom: 14px;
        }
        .sg-meta-stat {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .sg-meta-val {
          font-size: 15px;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: hsl(var(--foreground));
          line-height: 1;
        }
        .sg-meta-lbl {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: hsl(var(--muted-foreground));
        }
        .sg-meta-divider {
          width: 1px;
          background: hsl(var(--border));
          align-self: stretch;
        }

        .sg-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }

        .sg-month-row {
          position: relative;
          height: 16px;
          margin-bottom: 4px;
          min-width: max-content;
        }
        .sg-month-label {
          position: absolute;
          font-size: 9.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: hsl(var(--muted-foreground) / 0.7);
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
          padding-top: 0;
        }
        .sg-day-label {
          font-size: 9px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: hsl(var(--muted-foreground) / 0.5);
          height: ${CELL}px;
          display: flex;
          align-items: center;
          line-height: 1;
          width: 10px;
        }

        .sg-grid { display: flex; gap: ${GAP}px; }

        .sg-col { display: flex; flex-direction: column; gap: ${GAP}px; }

        .sg-cell {
          width: ${CELL}px;
          height: ${CELL}px;
          border-radius: 3px;
          cursor: default;
          transition: transform 0.1s ease, opacity 0.1s ease;
          position: relative;
        }
        .sg-cell--empty { background: transparent; cursor: default; }
        .sg-cell--future { background: transparent; }
        .sg-cell--blank {
          background: hsl(var(--muted) / 0.4);
        }
        .sg-cell--done {
          background: hsl(var(--primary));
          cursor: pointer;
        }
        .sg-cell--done:hover { transform: scale(1.25); z-index: 2; }
        .sg-cell--retro {
          background: hsl(var(--primary) / 0.5);
          box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.4);
          cursor: pointer;
        }
        .sg-cell--retro:hover { transform: scale(1.25); z-index: 2; }
        .sg-cell--blank:hover { transform: scale(1.2); z-index: 2; opacity: 0.7; }

        /* Intensity levels for done cells based on surrounding days — simple approach: just use primary */

        .sg-legend {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 10px;
        }
        .sg-legend-label {
          font-size: 9.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: hsl(var(--muted-foreground) / 0.6);
        }
        .sg-legend-cells {
          display: flex;
          gap: 3px;
          align-items: center;
        }
        .sg-legend-cell {
          width: 11px;
          height: 11px;
          border-radius: 2px;
        }

        /* Tooltip */
        .sg-tooltip {
          position: absolute;
          background: hsl(var(--popover));
          border: 1px solid hsl(var(--border));
          color: hsl(var(--popover-foreground));
          font-size: 11px;
          font-weight: 500;
          padding: 5px 9px;
          border-radius: 8px;
          white-space: nowrap;
          pointer-events: none;
          z-index: 10;
          box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          transform: translate(-50%, -100%);
          letter-spacing: -0.01em;
        }
      `}</style>

      <div className="sg-wrap" onMouseLeave={() => setTooltip(null)}>
        {/* Mini stats */}
        <div className="sg-meta">
          <div className="sg-meta-stat">
            <span className="sg-meta-val">{totalDone}</span>
            <span className="sg-meta-lbl">This year</span>
          </div>
          <div className="sg-meta-divider" />
          <div className="sg-meta-stat">
            <span className="sg-meta-val">{longestStreak > 0 ? `${longestStreak}d` : "—"}</span>
            <span className="sg-meta-lbl">Best streak</span>
          </div>
          <div className="sg-meta-divider" />
          <div className="sg-meta-stat">
            <span className="sg-meta-val">{new Date().getFullYear()}</span>
            <span className="sg-meta-lbl">Year</span>
          </div>
        </div>

        <div className="sg-scroll">
          {/* Month labels */}
          <div className="sg-month-row" style={{ width: grid.length * COL_W }}>
            {monthLabels.map((m, i) => (
              <span
                key={i}
                className="sg-month-label"
                style={{ left: m.col * COL_W }}
              >
                {m.label}
              </span>
            ))}
          </div>

          {/* Grid + day labels */}
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
                      title={undefined}
                      className={cn(
                        "sg-cell",
                        !day.date && !day.future && "sg-cell--empty",
                        !day.date && day.future && "sg-cell--future",
                        day.date && !day.done && "sg-cell--blank",
                        day.date && day.done && !day.retro && "sg-cell--done",
                        day.date && day.done && day.retro && "sg-cell--retro"
                      )}
                      onMouseEnter={(e) => handleMouseEnter(day, e)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="sg-legend">
          <span className="sg-legend-label">Less</span>
          <div className="sg-legend-cells">
            {[0.12, 0.3, 0.55, 0.75, 1].map((op, i) => (
              <div
                key={i}
                className="sg-legend-cell"
                style={{
                  background: i === 0
                    ? "hsl(var(--muted) / 0.5)"
                    : `hsl(var(--primary) / ${op})`,
                }}
              />
            ))}
          </div>
          <span className="sg-legend-label">More</span>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="sg-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </>
  );
}