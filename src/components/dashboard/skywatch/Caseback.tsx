import { useId, type CSSProperties } from "react";
import { CaseFlanks, CaseLugs } from "./Dial";
import { WATCH_VIEWBOX } from "./sky";
import type { Tone } from "./repeater";

// ─── The caseback: an open, working movement ──────────────────────────────────
// Through the sapphire back you see the gear train turning, the escape wheel
// ticking once a second, the balance wheel swinging, and the two repeater
// hammers striking their gongs whenever the watch chimes. The skeleton rotor
// hangs under gravity and swings as you tilt the watch. Your name, best streak
// and how long you've been at it are engraved round the case.

const C = 60;

const spin = (animation: string, ox: number, oy: number): CSSProperties => ({
  animation,
  transformBox: "view-box",
  transformOrigin: `${ox}px ${oy}px`,
});

/** Outline of a toothed wheel. */
function gearPath(cx: number, cy: number, r: number, teeth: number, depth = 1.2) {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [ang, rad] of [[a, r - depth], [a + step * 0.15, r], [a + step * 0.45, r], [a + step * 0.6, r - depth]]) {
      pts.push(`${(cx + Math.sin(ang) * rad).toFixed(2)},${(cy - Math.cos(ang) * rad).toFixed(2)}`);
    }
  }
  return `M ${pts.join(" L ")} Z`;
}

/** A balance hairspring: an Archimedean spiral. */
function hairspring(cx: number, cy: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * Math.PI * 2 * 4.5;
    const rr = 1.6 + (i / 120) * 5;
    pts.push(`${(cx + Math.cos(th) * rr).toFixed(2)},${(cy + Math.sin(th) * rr).toFixed(2)}`);
  }
  return `M ${pts.join(" L ")}`;
}

// The going train. Meshing wheels turn in opposite directions, and each one's
// period is proportional to its tooth count, so the teeth pass in step.
const TRAIN = [
  { x: 42, y: 74, r: 17, teeth: 60, period: 90, reverse: false, spokes: 5 },   // barrel
  { x: 60, y: 50, r: 14, teeth: 50, period: 75, reverse: true, spokes: 5 },    // centre wheel
  { x: 82, y: 58, r: 10.6, teeth: 38, period: 57, reverse: false, spokes: 4 }, // third wheel
  { x: 76, y: 76, r: 9.5, teeth: 34, period: 51, reverse: true, spokes: 4 },   // fourth wheel
];
const ESCAPE = { x: 50, y: 29, r: 5.5, teeth: 15 };
const BALANCE = { x: 35, y: 40, r: 11 };
const PALLET = { x: 43.5, y: 35 };
const HAMMERS: { tone: Tone; a: number }[] = [{ tone: "low", a: 20 }, { tone: "high", a: 40 }];
const JEWELS: [number, number][] = [[35, 40], [42, 74], [60, 50], [82, 58], [76, 76], [50, 29]];
const SCREWS: [number, number][] = [[21, 55], [26, 80], [58, 87]];

export interface CasebackProps {
  tilt: { x: number; y: number };
  name: string;
  bestStreak: number;
  habitCount: number;
  sinceYear: number | null;
  strike: { id: number; tone: Tone } | null;
  chiming: boolean;
}

export function Caseback({ tilt, name, bestStreak, habitCount, sinceYear, strike, chiming }: CasebackProps) {
  const uid = useId().replace(/:/g, "");
  const rg = `url(#rg-${uid})`;
  const brass = `url(#brass-${uid})`;
  const engraving = [
    name.toUpperCase(),
    `BEST STREAK ${bestStreak} ${bestStreak === 1 ? "DAY" : "DAYS"}`,
    `${habitCount} ${habitCount === 1 ? "HABIT" : "HABITS"}`,
    sinceYear ? `EST. ${sinceYear}` : null,
  ].filter(Boolean).join("  ·  ");
  const rotor = 180 + tilt.x * 70;   // hangs under gravity, swings with the tilt

  return (
    <svg viewBox={WATCH_VIEWBOX} className="block h-auto w-full" role="img"
      aria-label={`Watch movement, engraved: ${engraving}`}>
      <defs>
        <linearGradient id={`rg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBE3D3" />
          <stop offset="30%" stopColor="#C98F6E" />
          <stop offset="55%" stopColor="#F3C9AE" />
          <stop offset="100%" stopColor="#7E4F3A" />
        </linearGradient>
        <linearGradient id={`brass-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5D9A8" />
          <stop offset="50%" stopColor="#C9A063" />
          <stop offset="100%" stopColor="#8A6A3B" />
        </linearGradient>
        <radialGradient id={`cab-${uid}`} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="55%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </radialGradient>
        <radialGradient id={`plate-${uid}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#3A251A" />
          <stop offset="100%" stopColor="#140C08" />
        </radialGradient>
        <pattern id={`cotes-${uid}`} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width={2.5} height={5} fill="#fff" fillOpacity={0.05} />
        </pattern>
        <linearGradient id={`dome-${uid}`} x1="1" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="40%" stopColor="#fff" stopOpacity={0.04} />
          <stop offset="41%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={`back-${uid}`}><circle cx={C} cy={C} r={53.5} /></clipPath>
        <path id={`ring-${uid}`} d={`M ${C - 56.6} ${C} A 56.6 56.6 0 1 1 ${C + 56.6} ${C} A 56.6 56.6 0 1 1 ${C - 56.6} ${C}`} />
        <path id={`rotorarc-${uid}`} d={`M ${C - 44.5} ${C} A 44.5 44.5 0 0 1 ${C + 44.5} ${C}`} />
      </defs>

      {/* Seen from the back, the crown and slide swap sides. */}
      <g transform="matrix(-1 0 0 1 120 0)">
        <CaseFlanks rg={rg} cab={`url(#cab-${uid})`} crownOut={false} chiming={chiming} />
      </g>
      <CaseLugs rg={rg} />

      {/* Case back with the engraving */}
      <circle cx={C} cy={C} r={59} fill={rg} />
      <text fontSize={2.9} fontWeight={600} letterSpacing={0.35} fill="#4A2C20" fillOpacity={0.85}>
        <textPath href={`#ring-${uid}`} startOffset="25%" textAnchor="middle">{engraving}</textPath>
      </text>

      <g clipPath={`url(#back-${uid})`}>
        {/* Main plate with Côtes de Genève stripes */}
        <circle cx={C} cy={C} r={54} fill={`url(#plate-${uid})`} />
        <circle cx={C} cy={C} r={54} fill={`url(#cotes-${uid})`} />

        {/* Repeater gongs */}
        <circle cx={C} cy={C} r={47.4} fill="none" stroke="#D4D4D8" strokeOpacity={0.7} strokeWidth={0.45} />
        <circle cx={C} cy={C} r={46.3} fill="none" stroke="#D4D4D8" strokeOpacity={0.5} strokeWidth={0.4} />
        {strike && (
          <circle key={`gong-${strike.id}`} cx={C} cy={C} r={strike.tone === "low" ? 47.4 : 46.3} fill="none"
            stroke="#FDE68A" strokeWidth={0.8} className="sko-anim" style={{ animation: "sko-flash 500ms ease-out forwards" }} />
        )}

        {/* Going train */}
        {TRAIN.map((g, gi) => (
          <g key={gi} className="sko-anim"
            style={spin(`${g.reverse ? "sko-spin-rev" : "sko-spin"} ${g.period}s linear infinite`, g.x, g.y)}>
            <path d={gearPath(g.x, g.y, g.r, g.teeth)} fill={brass} stroke="#7A5230" strokeWidth={0.25} />
            <circle cx={g.x} cy={g.y} r={g.r * 0.68} fill="#1C120C" />
            {Array.from({ length: g.spokes }, (_, i) => {
              const a = (i / g.spokes) * Math.PI * 2;
              return (
                <line key={i} x1={g.x} y1={g.y} x2={g.x + Math.sin(a) * g.r * 0.7} y2={g.y - Math.cos(a) * g.r * 0.7}
                  stroke={brass} strokeWidth={g.r * 0.11} strokeLinecap="round" />
              );
            })}
            <circle cx={g.x} cy={g.y} r={g.r * 0.2} fill={brass} />
          </g>
        ))}

        {/* Escape wheel: one tooth a second */}
        <g className="sko-anim" style={spin("sko-spin 15s steps(15) infinite", ESCAPE.x, ESCAPE.y)}>
          <path d={gearPath(ESCAPE.x, ESCAPE.y, ESCAPE.r, ESCAPE.teeth, 1.6)} fill="#D6D3D1" stroke="#78716C" strokeWidth={0.2} />
          <circle cx={ESCAPE.x} cy={ESCAPE.y} r={ESCAPE.r * 0.55} fill="#1C120C" />
        </g>

        {/* Pallet fork */}
        <g className="sko-anim" style={spin("sko-pallet 0.42s ease-in-out infinite alternate", PALLET.x, PALLET.y)}>
          <line x1={39.5} y1={38} x2={48} y2={31.5} stroke="#A8A29E" strokeWidth={1} strokeLinecap="round" />
          <rect x={46.8} y={30.2} width={1.4} height={1.4} fill="#E11D48" />
          <rect x={38.6} y={37.2} width={1.4} height={1.4} fill="#E11D48" />
        </g>

        {/* Balance wheel + hairspring */}
        <path d={hairspring(BALANCE.x, BALANCE.y)} fill="none" stroke="#9CA3AF" strokeOpacity={0.8} strokeWidth={0.28} />
        <g className="sko-anim" style={spin("sko-balance 0.42s ease-in-out infinite alternate", BALANCE.x, BALANCE.y)}>
          <circle cx={BALANCE.x} cy={BALANCE.y} r={BALANCE.r} fill="none" stroke={brass} strokeWidth={1.5} />
          {[0, 120, 240].map((a) => {
            const r = (a * Math.PI) / 180;
            return (
              <line key={a} x1={BALANCE.x} y1={BALANCE.y}
                x2={BALANCE.x + Math.sin(r) * BALANCE.r} y2={BALANCE.y - Math.cos(r) * BALANCE.r}
                stroke={brass} strokeWidth={0.8} />
            );
          })}
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={BALANCE.x + Math.sin(a) * BALANCE.r} cy={BALANCE.y - Math.cos(a) * BALANCE.r} r={0.55} fill="#F5D9A8" />;
          })}
        </g>

        {/* Bridges */}
        <path d="M 35 40 L 21 55" stroke={rg} strokeWidth={5.5} strokeLinecap="round" />
        <path d="M 26 80 L 42 74 L 58 87" stroke={rg} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M 60 50 L 82 58 L 76 76" stroke={rg} strokeWidth={4.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />

        {/* Jewels and screws */}
        {JEWELS.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={1.3} fill="#BE123C" />
            <circle cx={x - 0.4} cy={y - 0.4} r={0.45} fill="#fff" fillOpacity={0.6} />
          </g>
        ))}
        {SCREWS.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={1.5} fill="#E7E5E4" stroke="#78716C" strokeWidth={0.3} />
            <line x1={x - 1.1} y1={y + 0.5} x2={x + 1.1} y2={y - 0.5} stroke="#57534E" strokeWidth={0.35} />
          </g>
        ))}

        {/* Repeater hammers — each strikes its gong */}
        {HAMMERS.map((h) => {
          const a = (h.a * Math.PI) / 180;
          const head = ((h.a - 8) * Math.PI) / 180;
          const px = C + Math.sin(a) * 38.5, py = C - Math.cos(a) * 38.5;
          const hx = C + Math.sin(head) * 45.6, hy = C - Math.cos(head) * 45.6;
          const hit = strike?.tone === h.tone;
          return (
            <g key={hit ? `${h.tone}-${strike!.id}` : h.tone} className="sko-anim"
              style={hit ? spin("sko-hammer 220ms ease-out", px, py) : undefined}>
              <line x1={px} y1={py} x2={hx} y2={hy} stroke="#A8A29E" strokeWidth={1.3} strokeLinecap="round" />
              <circle cx={hx} cy={hy} r={1.5} fill="#D6D3D1" />
              <circle cx={px} cy={py} r={1.1} fill="#E7E5E4" stroke="#78716C" strokeWidth={0.25} />
            </g>
          );
        })}

        {/* Skeleton rotor */}
        <g style={{
          transform: `rotate(${rotor}deg)`, transformBox: "view-box", transformOrigin: `${C}px ${C}px`,
          transition: "transform 900ms cubic-bezier(0.3,1.5,0.5,1)",
        }}>
          <path d={`M ${C - 48} ${C} A 48 48 0 0 1 ${C + 48} ${C} L ${C + 41} ${C} A 41 41 0 0 0 ${C - 41} ${C} Z`}
            fill={rg} fillOpacity={0.95} />
          {[-60, 0, 60].map((d) => {
            const r = (d * Math.PI) / 180;
            return <line key={d} x1={C} y1={C} x2={C + Math.sin(r) * 41} y2={C - Math.cos(r) * 41} stroke={rg} strokeWidth={2.6} strokeLinecap="round" />;
          })}
          <text fontSize={3.3} fontWeight={700} letterSpacing={0.6} fill="#5A3627" fillOpacity={0.85}>
            <textPath href={`#rotorarc-${uid}`} startOffset="50%" textAnchor="middle">NO SKIP · AUTOMATIC</textPath>
          </text>
          <circle cx={C} cy={C} r={4.5} fill={rg} />
          <circle cx={C} cy={C} r={1.6} fill="#E7E5E4" stroke="#78716C" strokeWidth={0.3} />
        </g>

        {/* Sapphire glare */}
        <path d={`M ${C + 50} ${C} A 50 50 0 0 0 ${C - 35} ${C - 36} Q ${C + 5} ${C - 30} ${C + 50} ${C}`} fill={`url(#dome-${uid})`} />
      </g>
      <circle cx={C} cy={C} r={53.5} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={1.2} />
    </svg>
  );
}
