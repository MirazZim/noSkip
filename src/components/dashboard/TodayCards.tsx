import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Widget } from "@/components/dashboard/Widget";
import { MAC, PRIMARY } from "@/lib/macColors";
import { cn } from "@/lib/utils";
import { lifeTier, type LifeScore } from "@/lib/lifeScore";

// ─── LIFE SCORE ───────────────────────────────────────────────────────────────
// A double ring (habits outside, spending inside), the tier in words, one line
// of context, and the last seven days as a quiet bar strip.

const HABIT_COLOR = MAC.green;
const SPEND_COLOR = MAC.teal;
const TIER_COLORS = [MAC.red, MAC.orange, PRIMARY, MAC.green];   // by tier index

export interface ScoreDay { date: string; label: string; total: number }

/** Eases towards `target`; later changes animate from wherever it currently is. */
function useCountUp(target: number, ms = 800) {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = current.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      current.current = v;
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** False on the first frame, then true — lets the rings and bars grow in. */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return grown;
}

export function LifeScoreCard({ score, history, delay = 0 }: {
  score: LifeScore;      // today
  history: ScoreDay[];   // the last 7 days, oldest first, ending today
  delay?: number;
}) {
  const grown = useGrown();
  const shown = useCountUp(score.total);
  const tier = lifeTier(score.total);
  const color = TIER_COLORS[tier.index];
  const yesterday = history.length >= 2 ? history[history.length - 2].total : null;
  const delta = yesterday === null ? null : score.total - yesterday;

  return (
    <Widget className="col-span-2 min-h-[158px]" delay={delay}>
      <div className="flex flex-1 items-center gap-5">
        <DualRing size={128} stroke={11} habit={grown ? score.habitScore / 60 : 0} spend={grown ? score.spendScore / 40 : 0}>
          <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">{shown}</span>
          <span className="mt-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Life score</span>
        </DualRing>

        <div className="min-w-0 flex-1">
          <p className="text-[24px] font-semibold leading-none tracking-tight" style={{ color }} title="Your tier">{tier.label}</p>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            {tier.next ? `${tier.next.min - score.total} pts to ${tier.next.label}` : "Top tier — keep it up"}
            {delta !== null && delta !== 0 && (
              <span style={{ color: delta > 0 ? MAC.green : MAC.red }} title="Compared with yesterday">
                {" · "}{delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
              </span>
            )}
          </p>

          <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground tabular-nums">
            <Legend color={HABIT_COLOR} label="Habits" value={`${score.habitScore}/60`} />
            <Legend color={SPEND_COLOR} label="Spend" value={`${score.spendScore}/40`} />
          </div>

          {/* The last 7 days */}
          {history.length > 1 && (
            <div className="mt-4 flex max-w-[220px] items-end justify-between" aria-label="Life score, last 7 days">
              {history.map((d, i) => {
                const today = i === history.length - 1;
                return (
                  <div key={d.date} className="flex flex-col items-center gap-1.5" title={`${today ? "Today" : d.label} · ${d.total}`}>
                    {/* thin bar: full height = 100 */}
                    <div className="flex h-9 w-1.5 items-end overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div
                        className="w-full rounded-full transition-[height] duration-700 ease-out"
                        style={{
                          height: grown ? `${Math.max(6, d.total)}%` : "0%",
                          background: today ? color : "hsl(var(--foreground) / 0.35)",
                          transitionDelay: `${i * 50}ms`,
                        }}
                      />
                    </div>
                    <span className={cn("text-[9px] font-medium leading-none", today ? "text-foreground" : "text-muted-foreground/70")}>{d.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label} <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}

// ─── Double ring ──────────────────────────────────────────────────────────────
// Activity-style: each arc shades from a deep to a bright tone, and a glossy
// tip with a soft shadow rides the end of the arc as it fills.
const RINGS = {
  habit: { from: "#1E9E4A", to: "#7CF29A", track: HABIT_COLOR },
  spend: { from: "#0A6CFF", to: "#7FE0FF", track: SPEND_COLOR },
};
const EASE = "1s cubic-bezier(0.2,0.8,0.2,1)";

function DualRing({ size, stroke, habit, spend, children }: {
  size: number; stroke: number; habit: number; spend: number; children: ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const c = size / 2;
  const gap = 4;
  const r1 = (size - stroke) / 2;
  const r2 = r1 - stroke - gap;

  const ring = (key: "habit" | "spend", r: number, p: number) => {
    const t = RINGS[key];
    const len = 2 * Math.PI * r;
    const v = Math.max(0, Math.min(1, p));
    return (
      <g key={key}>
        <circle cx={c} cy={c} r={r} fill="none" stroke={t.track} strokeOpacity={0.13} strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={`url(#${key}-${uid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - v)} strokeOpacity={v > 0 ? 1 : 0}
          style={{ transition: `stroke-dashoffset ${EASE}` }} />
        {/* the tip, rotated in step with the arc */}
        {v > 0 && (
          <g style={{ transform: `rotate(${v * 360}deg)`, transformOrigin: `${c}px ${c}px`, transition: `transform ${EASE}` }}>
            <circle cx={c + r} cy={c} r={stroke / 2} fill={t.to} filter={`url(#tip-${uid})`} />
            <circle cx={c + r - stroke * 0.12} cy={c - stroke * 0.12} r={stroke * 0.16} fill="#fff" fillOpacity={0.55} />
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden="true">
        <defs>
          {(["habit", "spend"] as const).map((k) => (
            <linearGradient key={k} id={`${k}-${uid}`} x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RINGS[k].from} />
              <stop offset="100%" stopColor={RINGS[k].to} />
            </linearGradient>
          ))}
          <filter id={`tip-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="-1.5" stdDeviation="1.4" floodColor="#000" floodOpacity="0.45" />
          </filter>
          <radialGradient id={`disc-${uid}`}>
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.07} />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.01} />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={r2 - stroke / 2 - gap} fill={`url(#disc-${uid})`} />
        {ring("habit", r1, habit)}
        {ring("spend", r2, spend)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
