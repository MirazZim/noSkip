import { format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { heatColor } from "./colors";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAYS_LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Sunburst dial: one rounded spoke per weekday, length and color by show-up
 * rate. The center shows today's odds; today's label sits in a pill.
 */
export function WeekDial({ rates, bestIdx }: { rates: (number | null)[]; bestIdx: number }) {
  const S = 142, C = S / 2, R_IN = 25, R_MAX = 50, SLICE = 360 / 7;
  const ti = (getDay(new Date()) + 6) % 7;
  const todayRate = rates[ti];

  return (
    <svg className="wd-root" width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img"
      aria-label={`Show-up rate per weekday. Today ${DAYS[ti]}: ${todayRate ?? "no data"}%`}>
      <style>{`
        .wd-root { flex-shrink: 0; }
        @keyframes wd-grow { from { transform: scale(0.3); } to { transform: none; } }
        .wd-core { fill: hsl(var(--foreground) / 0.05); stroke: hsl(var(--foreground) / 0.08); }
        .wd-track { stroke: hsl(var(--foreground) / 0.07); stroke-width: 11; stroke-linecap: round; }
        .wd-spoke {
          stroke-width: 11; stroke-linecap: round; transform-box: view-box; transform-origin: ${C}px ${C}px;
          animation: wd-grow 0.75s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 70ms);
        }
        .wd-spoke:hover { filter: brightness(1.15); }
        .wd-spoke--best { filter: drop-shadow(0 0 5px currentColor); }
        .wd-star { font-size: 8px; fill: hsl(0 0% 100%); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
        .wd-today { fill: hsl(var(--foreground)); }
        .wd-lbl { font-size: 11px; font-weight: 700; fill: hsl(var(--muted-foreground)); text-anchor: middle; dominant-baseline: central; }
        .wd-lbl--today { fill: hsl(var(--background)); font-weight: 800; }
        .wd-val { font-size: 14px; font-weight: 800; fill: hsl(var(--foreground)); text-anchor: middle; letter-spacing: -0.03em; }
        .wd-sub { font-size: 7.5px; font-weight: 600; fill: hsl(var(--muted-foreground)); text-anchor: middle; text-transform: uppercase; letter-spacing: 0.06em; }
        @media (prefers-reduced-motion: reduce) { .wd-spoke { animation: none; } }
      `}</style>
      <circle cx={C} cy={C} r={R_IN - 3} className="wd-core" />
      {rates.map((rate, i) => {
        const ang = ((i + 0.5) * SLICE - 90) * (Math.PI / 180);
        const isNull = rate === null;
        const isBest = i === bestIdx && !isNull;
        const isToday = i === ti;
        const r0 = R_IN + 6;
        const r1 = r0 + Math.max(0.04, (rate ?? 0) / 100) * (R_MAX - r0);
        const pt = (r: number) => [C + r * Math.cos(ang), C + r * Math.sin(ang)] as const;
        const [x0, y0] = pt(r0);
        const [x1, y1] = pt(r1);
        const [xt, yt] = pt(R_MAX);
        const [xl, yl] = pt(R_MAX + 12);
        return (
          <g key={i}>
            <line className="wd-track" x1={x0} y1={y0} x2={xt} y2={yt} />
            {!isNull && (
              <line
                className={cn("wd-spoke", isBest && "wd-spoke--best")}
                x1={x0} y1={y0} x2={x1} y2={y1}
                stroke={heatColor(rate)}
                style={{ ["--i" as string]: i, color: heatColor(rate) }}
              >
                <title>{DAYS_LONG[i]}: {rate}%</title>
              </line>
            )}
            {isBest && <text className="wd-star" x={x1} y={y1 + 0.5}>★</text>}
            {isToday && <circle className="wd-today" cx={xl} cy={yl} r={7.5} />}
            <text className={cn("wd-lbl", isToday && "wd-lbl--today")} x={xl} y={yl}>{LETTERS[i]}</text>
          </g>
        );
      })}
      <text className="wd-val" x={C} y={C + 3}>{todayRate === null ? "—" : `${todayRate}%`}</text>
      <text className="wd-sub" x={C} y={C + 13}>{DAYS[ti]} odds</text>
    </svg>
  );
}

/** Sky color for an hour of the day: night → dawn → day → golden hour → dusk. */
function skyColor(h: number) {
  if (h >= 5 && h <= 7) return "hsl(28 92% 60%)";
  if (h >= 8 && h <= 15) return "hsl(199 85% 58%)";
  if (h >= 16 && h <= 18) return "hsl(38 95% 56%)";
  if (h >= 19 && h <= 21) return "hsl(278 55% 62%)";
  return "hsl(235 55% 60%)";
}

const hourLabel = (h: number) => format(new Date(2000, 0, 1, h), "h a");

/** 24 bars, one per hour, tinted like the sky at that hour; the peak hour glows. */
export function HourStrip({ counts, peak }: { counts: number[]; peak: number }) {
  const max = Math.max(1, ...counts);
  return (
    <div className="hs-root">
      <style>{`
        .hs-bars {
          display: flex; align-items: flex-end; gap: 2px; height: 44px; padding: 0 1px; border-radius: 8px;
          background: linear-gradient(90deg,
            hsl(235 50% 50% / 0.10), hsl(28 90% 60% / 0.10) 25%, hsl(199 85% 58% / 0.08) 50%,
            hsl(38 95% 56% / 0.10) 72%, hsl(278 55% 62% / 0.10) 85%, hsl(235 50% 50% / 0.10));
        }
        @keyframes hs-rise { from { transform: scaleY(0); } to { transform: none; } }
        .hs-bar {
          flex: 1; min-width: 0; border-radius: 3px 3px 1px 1px; background: hsl(var(--foreground) / 0.08);
          transform-origin: bottom; animation: hs-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
          animation-delay: calc(300ms + var(--i) * 18ms);
        }
        .hs-bar--peak { box-shadow: 0 0 10px currentColor; filter: saturate(1.2) brightness(1.08); outline: 1.5px solid hsl(var(--foreground) / 0.5); outline-offset: 1px; }
        .hs-axis { display: flex; justify-content: space-between; margin-top: 5px; font-size: 10px; color: hsl(var(--muted-foreground) / 0.8); }
        @media (prefers-reduced-motion: reduce) { .hs-bar { animation: none; } }
      `}</style>
      <div className="hs-bars" role="img" aria-label={`Check-ins by hour, peaking at ${hourLabel(peak)}`}>
        {counts.map((n, h) => (
          <span
            key={h}
            className={cn("hs-bar", h === peak && "hs-bar--peak")}
            title={`${hourLabel(h)}: ${n} check-in${n === 1 ? "" : "s"}`}
            style={{
              height: `${n ? Math.max(14, (n / max) * 100) : 6}%`,
              background: n ? skyColor(h) : undefined,
              color: skyColor(h),
              ["--i" as string]: h,
            }}
          />
        ))}
      </div>
      <div className="hs-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
    </div>
  );
}
