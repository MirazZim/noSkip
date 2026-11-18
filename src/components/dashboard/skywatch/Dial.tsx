import { useId, type CSSProperties } from "react";
import { CONSTELLATIONS, DIAL_STARS, LUME, WATCH_VIEWBOX, moonLitPath, type Sky } from "./sky";
import type { Tone } from "./repeater";

// ─── The dial side of the sky watch ───────────────────────────────────────────
// Layers, back to front (each drifts by its own depth when the watch tilts):
//   sky       — time-of-day gradient, aventurine stars, constellations that wheel
//               once a day, shooting stars after dark, and an aurora once every
//               habit is done;
//   planets   — your habits on the outer orbit: gold once done, bigger with a
//               longer streak, ringed at 7 days, with a moon at 30;
//   carriage  — orbits the central sun once a minute, carrying the time
//               sub-dial, the moon in today's real phase, a double-axis
//               tourbillon and the Earth;
//   glass     — the domed sapphire glare.
// The case carries a crown (pulled out while you set the time) and the
// repeater slide (drawn down while it chimes).

export interface HabitPlanet { id: string; name: string; emoji: string; done: boolean; streak: number }
export interface Burst { id: string; key: number; delay: number }

const C = 60;          // dial centre
const DIAL_R = 53;
const ARM = 27;        // satellite distance from the sun
const ORBIT = 44;      // habit-planet orbit

const spin = (animation: string, ox?: number, oy?: number): CSSProperties =>
  ox === undefined
    ? { animation, transformBox: "fill-box", transformOrigin: "center" }
    : { animation, transformBox: "view-box", transformOrigin: `${ox}px ${oy}px` };

const turn = (deg: number, ox: number, oy: number, ms = 0): CSSProperties => ({
  transform: `rotate(${deg}deg)`,
  transformBox: "view-box",
  transformOrigin: `${ox}px ${oy}px`,
  transition: ms ? `transform ${ms}ms linear` : undefined,
});

/** Crown at 3 o'clock and repeater slide at 9 o'clock. */
export function CaseFlanks({ rg, cab, crownOut, chiming }: { rg: string; cab: string; crownOut: boolean; chiming: boolean }) {
  return (
    <>
      <rect x={-3.5} y={46} width={5.5} height={28} rx={2.6} fill="#3A2318" />
      <rect x={-5} y={47} width={6} height={11} rx={2.8} fill={rg}
        style={{ transform: `translateY(${chiming ? 15 : 0}px)`, transition: "transform 350ms cubic-bezier(0.3,1.4,0.5,1)" }} />
      <g style={{ transform: `translateX(${crownOut ? 3 : 0}px)`, transition: "transform 250ms ease-out" }}>
        <rect x={116} y={56.5} width={5} height={7} rx={1} fill={rg} />
        <rect x={120} y={52.5} width={4.6} height={15} rx={1.8} fill={rg} />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={120.6} y1={54 + i * 1.7} x2={124} y2={54 + i * 1.7} stroke="#7E4F3A" strokeOpacity={0.6} strokeWidth={0.35} />
        ))}
        <circle cx={124.6} cy={60} r={1.9} fill={cab} />
      </g>
    </>
  );
}

export interface DialProps {
  t: number;                 // minutes since today's midnight (the time shown)
  carriage: number;          // carriage angle in degrees (real seconds, never wraps)
  sky: Sky;
  moon: number;              // moon phase 0..1
  moonLabel: string;
  habits: HabitPlanet[];
  bursts: Burst[];
  lume: boolean;
  tilt: { x: number; y: number };
  crownOut: boolean;
  strike: { id: number; tone: Tone } | null;
  chiming: boolean;
  label: string;
}

export function Dial({ t, carriage, sky, moon, moonLabel, habits, bursts, lume, tilt, crownOut, strike, chiming, label }: DialProps) {
  const uid = useId().replace(/:/g, "");
  const hourDeg = (t / 60) * 30;
  const minDeg = t * 6;
  const skyDeg = -(t / 1440) * 360;           // constellations wheel once a day
  const allDone = habits.length > 0 && habits.every((h) => h.done);

  const TOP = { x: C, y: C - ARM };           // time sub-dial
  const RIGHT = { x: C + ARM, y: C };         // moon
  const BOTTOM = { x: C, y: C + ARM };        // tourbillon
  const LEFT = { x: C - ARM, y: C };          // earth

  const dial = lume ? ["#06140D", "#000000"] : [sky.light, sky.deep];
  const starAmt = lume ? 0.2 : sky.stars;
  const index = lume ? LUME : "#F3C9AE";
  const subFace = lume ? "#07100B" : "#FBFAF6";
  const subInk = lume ? LUME : "#111827";
  const glow = lume ? `url(#lume-${uid})` : undefined;
  const rg = `url(#rg-${uid})`;
  const waveColor = strike?.tone === "low" ? sky.sun : "#BFDBFE";

  const depth = (d: number): CSSProperties => ({
    transform: `translate(${tilt.x * d}px, ${tilt.y * d}px)`,
    transition: "transform 250ms ease-out",
  });

  return (
    <svg viewBox={WATCH_VIEWBOX} className="block h-auto w-full" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`rg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FBE3D3" />
          <stop offset="30%" stopColor="#C98F6E" />
          <stop offset="55%" stopColor="#F3C9AE" />
          <stop offset="100%" stopColor="#7E4F3A" />
        </linearGradient>
        <radialGradient id={`cab-${uid}`} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="55%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </radialGradient>
        <radialGradient id={`dial-${uid}`} cx="50%" cy="38%" r="65%">
          <stop offset="0%" stopColor={dial[0]} />
          <stop offset="100%" stopColor={dial[1]} />
        </radialGradient>
        <radialGradient id={`sun-${uid}`} cx="40%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#FFFBE6" />
          <stop offset="100%" stopColor={sky.sun} />
        </radialGradient>
        <radialGradient id={`corona-${uid}`}>
          <stop offset="0%" stopColor={sky.sun} stopOpacity={0.8} />
          <stop offset="100%" stopColor={sky.sun} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`earth-${uid}`} cx="70%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="60%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E3A8A" />
        </radialGradient>
        {/* Earth's night side faces away from the central sun. */}
        <linearGradient id={`earthnight-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity={0.65} />
          <stop offset="55%" stopColor="#000" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`moon-${uid}`} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#F9FAFB" />
          <stop offset="100%" stopColor="#A1A1AA" />
        </radialGradient>
        <radialGradient id={`gold-${uid}`}>
          <stop offset="0%" stopColor="#FFD60A" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#FFD60A" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`shoot-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity={1} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`aurora-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A855F7" stopOpacity={0} />
          <stop offset="45%" stopColor="#34D399" stopOpacity={0.85} />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`dome-${uid}`} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.34} />
          <stop offset="40%" stopColor="#fff" stopOpacity={0.05} />
          <stop offset="41%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={`dialclip-${uid}`}><circle cx={C} cy={C} r={DIAL_R} /></clipPath>
        <clipPath id={`earthclip-${uid}`}><circle cx={LEFT.x} cy={LEFT.y} r={7} /></clipPath>
        <clipPath id={`moonclip-${uid}`}><path d={moonLitPath(RIGHT.x, RIGHT.y, 6.2, moon)} /></clipPath>
        <filter id={`lume-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id={`soft-${uid}`} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      <CaseFlanks rg={rg} cab={`url(#cab-${uid})`} crownOut={crownOut} chiming={chiming} />

      {/* ── Case + engraved bezel ── */}
      <circle cx={C} cy={C} r={59} fill={rg} />
      <circle cx={C} cy={C} r={55} fill="#4A2C20" />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180;
        const r1 = i % 5 === 0 ? 55.6 : 56.4;
        return (
          <line key={i}
            x1={C + Math.sin(a) * r1} y1={C - Math.cos(a) * r1}
            x2={C + Math.sin(a) * 58} y2={C - Math.cos(a) * 58}
            stroke="#fff" strokeOpacity={i % 5 === 0 ? 0.65 : 0.3} strokeWidth={i % 5 === 0 ? 0.7 : 0.35} />
        );
      })}
      {strike && (
        <circle key={`flash-${strike.id}`} cx={C} cy={C} r={57} fill="none" stroke={waveColor} strokeWidth={1.4}
          className="sko-anim" style={{ animation: "sko-flash 600ms ease-out forwards" }} />
      )}

      <g clipPath={`url(#dialclip-${uid})`}>
        {/* ── Sky layer ── */}
        <g style={depth(-1.6)}>
          <circle cx={C} cy={C} r={DIAL_R + 3} fill={`url(#dial-${uid})`} />
          {DIAL_STARS.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={starAmt}
              className="sko-anim animate-pulse" style={{ animationDelay: `${s.d}s`, animationDuration: "2.8s" }} />
          ))}

          {/* Aurora: the reward for finishing every habit */}
          {allDone && (
            <g filter={`url(#soft-${uid})`} opacity={0.55 + 0.45 * starAmt}>
              <g className="sko-anim" style={spin("sko-aurora 7s ease-in-out infinite", C, 38)}>
                <path d="M 4 44 C 24 22, 44 50, 64 30 S 100 26, 118 38 L 118 52 C 96 42, 76 58, 58 46 S 22 60, 4 58 Z" fill={`url(#aurora-${uid})`} />
                <path d="M 4 32 C 30 12, 50 36, 70 18 S 104 16, 118 26 L 118 36 C 100 30, 80 44, 62 32 S 26 44, 4 44 Z" fill={`url(#aurora-${uid})`} opacity={0.7} />
              </g>
            </g>
          )}

          <g style={turn(skyDeg, C, C)}>
            {CONSTELLATIONS.map((c, ci) => (
              <g key={ci} opacity={0.25 + 0.75 * starAmt}>
                {c.lines.map(([a, b], li) => (
                  <line key={li}
                    x1={C + c.stars[a][0]} y1={C + c.stars[a][1]} x2={C + c.stars[b][0]} y2={C + c.stars[b][1]}
                    stroke={lume ? LUME : "#fff"} strokeOpacity={0.35} strokeWidth={0.35} />
                ))}
                {c.stars.map(([x, y], si) => <circle key={si} cx={C + x} cy={C + y} r={0.85} fill={lume ? LUME : "#fff"} />)}
              </g>
            ))}
          </g>

          {(sky.dark || lume) && (
            <g className="sko-anim" style={{ animation: "sko-shoot 9s ease-out 2s infinite" }}>
              <line x1={92} y1={24} x2={104} y2={17} stroke={`url(#shoot-${uid})`} strokeWidth={0.8} strokeLinecap="round" />
            </g>
          )}
        </g>

        {/* Sound wave across the sky on each repeater strike */}
        {strike && (
          <circle key={`wave-${strike.id}`} cx={C} cy={C} r={DIAL_R} fill="none" stroke={waveColor} strokeWidth={0.8}
            className="sko-anim" style={spin("sko-wave 900ms ease-out forwards")} />
        )}

        {/* ── Indices ── */}
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const r1 = i === 0 ? 47.5 : 49;
          return (
            <line key={i}
              x1={C + Math.sin(a) * r1} y1={C - Math.cos(a) * r1}
              x2={C + Math.sin(a) * 52} y2={C - Math.cos(a) * 52}
              stroke={index} strokeWidth={i % 3 === 0 ? 1.6 : 0.9} strokeLinecap="round" filter={glow} />
          );
        })}

        {/* ── Habit planets ── */}
        <g style={depth(0.6)}>
          <circle cx={C} cy={C} r={ORBIT} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={0.35} />
          <g className="sko-anim" style={spin("sko-spin 240s linear infinite", C, C)}>
            {habits.map((h, i) => {
              const n = habits.length;
              // Spread evenly round the orbit — or gathered into a conjunction once all are done.
              const a = allDone ? ((i - (n - 1) / 2) * 11 * Math.PI) / 180 : (i / n) * Math.PI * 2;
              const r = 1.7 + (Math.min(h.streak, 30) / 30) * 1.3;
              return (
                <g key={h.id} style={{
                  transform: `translate(${Math.sin(a) * ORBIT}px, ${-Math.cos(a) * ORBIT}px)`,
                  transition: "transform 1.6s cubic-bezier(0.2,0.8,0.2,1)",
                }}>
                  <title>{`${h.emoji} ${h.name} — ${h.done ? "done" : "to go"}${h.streak ? ` · ${h.streak}-day streak` : ""}`}</title>
                  {h.done ? (
                    <>
                      <circle cx={C} cy={C} r={r * 2.2} fill={`url(#gold-${uid})`} />
                      <circle cx={C} cy={C} r={r} fill={lume ? LUME : "#FFD60A"} filter={glow} />
                    </>
                  ) : (
                    <circle cx={C} cy={C} r={r} fill={dial[1]} stroke="#fff" strokeOpacity={0.6} strokeWidth={0.5} />
                  )}
                  {h.streak >= 7 && (
                    <ellipse cx={C} cy={C} rx={r * 2.2} ry={r * 0.7} transform={`rotate(-22 ${C} ${C})`}
                      fill="none" stroke={h.done ? "#FDE68A" : "#fff"} strokeOpacity={0.75} strokeWidth={0.35} />
                  )}
                  {h.streak >= 30 && (
                    <g className="sko-anim" style={spin("sko-spin 6s linear infinite", C, C)}>
                      <circle cx={C + r * 2.7} cy={C} r={0.55} fill="#E5E7EB" />
                    </g>
                  )}
                  {bursts.filter((b) => b.id === h.id).map((b) => (
                    <circle key={b.key} cx={C} cy={C} r={r} fill="none" stroke="#FDE68A" strokeWidth={0.7}
                      className="sko-anim" style={spin(`sko-ignite 1.2s ease-out ${b.delay}ms both`)} />
                  ))}
                </g>
              );
            })}
          </g>
        </g>

        {/* ── Orbiting carriage ── */}
        <g style={depth(1.6)}>
          <circle cx={C} cy={C} r={ARM} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={0.35} strokeDasharray="1 2" />
          <g style={turn(carriage, C, C, 1000)}>
            <line x1={C} y1={C - ARM} x2={C} y2={C + ARM} stroke={rg} strokeWidth={2.2} strokeLinecap="round" />
            <line x1={C - ARM} y1={C} x2={C + ARM} y2={C} stroke={rg} strokeWidth={2.2} strokeLinecap="round" />
            <line x1={C} y1={C - ARM + 4} x2={C} y2={C + ARM - 4} stroke="#2A1810" strokeOpacity={0.5} strokeWidth={0.55} />
            <line x1={C - ARM + 4} y1={C} x2={C + ARM - 4} y2={C} stroke="#2A1810" strokeOpacity={0.5} strokeWidth={0.55} />

            {/* Time sub-dial — counter-rotates so it always reads upright */}
            <g style={turn(-carriage, TOP.x, TOP.y, 1000)}>
              <circle cx={TOP.x} cy={TOP.y} r={11.2} fill={rg} />
              <circle cx={TOP.x} cy={TOP.y} r={10} fill={subFace} />
              {Array.from({ length: 12 }, (_, i) => {
                const a = (i * 30 * Math.PI) / 180;
                const r1 = i % 3 === 0 ? 7.2 : 8.2;
                return (
                  <line key={i}
                    x1={TOP.x + Math.sin(a) * r1} y1={TOP.y - Math.cos(a) * r1}
                    x2={TOP.x + Math.sin(a) * 9.2} y2={TOP.y - Math.cos(a) * 9.2}
                    stroke={subInk} strokeWidth={i % 3 === 0 ? 0.75 : 0.35} strokeLinecap="round" filter={glow} />
                );
              })}
              <line x1={TOP.x} y1={TOP.y + 1.1} x2={TOP.x} y2={TOP.y - 5} stroke={subInk} strokeWidth={1.25} strokeLinecap="round"
                filter={glow} style={turn(hourDeg, TOP.x, TOP.y)} />
              <line x1={TOP.x} y1={TOP.y + 1.4} x2={TOP.x} y2={TOP.y - 7.6} stroke={subInk} strokeWidth={0.75} strokeLinecap="round"
                filter={glow} style={turn(minDeg, TOP.x, TOP.y)} />
              <circle cx={TOP.x} cy={TOP.y} r={0.9} fill="#C98F6E" />
            </g>

            {/* Moon in today's real phase — counter-rotates to stay oriented */}
            <g style={turn(-carriage, RIGHT.x, RIGHT.y, 1000)}>
              <title>{moonLabel}</title>
              <circle cx={RIGHT.x} cy={RIGHT.y} r={6.2} fill="#1F2937" fillOpacity={0.85} stroke="#fff" strokeOpacity={0.15} strokeWidth={0.4} />
              <g clipPath={`url(#moonclip-${uid})`}>
                <circle cx={RIGHT.x} cy={RIGHT.y} r={6.2} fill={lume ? LUME : `url(#moon-${uid})`} fillOpacity={lume ? 0.85 : 1} />
                <circle cx={RIGHT.x - 2} cy={RIGHT.y - 1.4} r={1.3} fill="#6B7280" fillOpacity={0.35} />
                <circle cx={RIGHT.x + 2.1} cy={RIGHT.y + 1.8} r={0.95} fill="#6B7280" fillOpacity={0.35} />
                <circle cx={RIGHT.x + 0.6} cy={RIGHT.y - 3} r={0.65} fill="#6B7280" fillOpacity={0.35} />
              </g>
            </g>

            {/* Double-axis tourbillon */}
            <circle cx={BOTTOM.x} cy={BOTTOM.y} r={8.6} fill="#120A07" fillOpacity={0.8} stroke={rg} strokeWidth={1} />
            <g className="sko-anim" style={spin("sko-spin 8s linear infinite", BOTTOM.x, BOTTOM.y)}>
              {[0, 120, 240].map((a) => {
                const r = (a * Math.PI) / 180;
                return (
                  <line key={a} x1={BOTTOM.x} y1={BOTTOM.y}
                    x2={BOTTOM.x + Math.sin(r) * 7.4} y2={BOTTOM.y - Math.cos(r) * 7.4}
                    stroke="#F3C9AE" strokeWidth={0.8} strokeLinecap="round" />
                );
              })}
            </g>
            <g className="sko-anim" style={spin("sko-flipx 2.6s ease-in-out infinite", BOTTOM.x, BOTTOM.y)}>
              <ellipse cx={BOTTOM.x} cy={BOTTOM.y} rx={5.2} ry={5.2} fill="none" stroke="#E5C07B" strokeWidth={0.75} />
              <g className="sko-anim" style={spin("sko-flipy 3.8s ease-in-out infinite", BOTTOM.x, BOTTOM.y)}>
                <ellipse cx={BOTTOM.x} cy={BOTTOM.y} rx={3.1} ry={3.1} fill="none" stroke={lume ? LUME : "#F3C9AE"} strokeWidth={0.55} filter={glow} />
                <line x1={BOTTOM.x - 3.1} y1={BOTTOM.y} x2={BOTTOM.x + 3.1} y2={BOTTOM.y} stroke="#F3C9AE" strokeWidth={0.4} />
              </g>
            </g>
            <circle cx={BOTTOM.x} cy={BOTTOM.y} r={1} fill="#E11D48" />

            {/* Earth: drifting continents, night side away from the sun */}
            <g clipPath={`url(#earthclip-${uid})`}>
              <circle cx={LEFT.x} cy={LEFT.y} r={7} fill={`url(#earth-${uid})`} />
              <g className="sko-anim" style={{ animation: "sko-drift 14s linear infinite" }}>
                {[0, 16].map((off) => (
                  <g key={off} fill={lume ? LUME : "#34D399"} fillOpacity={0.85}>
                    <ellipse cx={LEFT.x - 3.5 + off} cy={LEFT.y - 2.6} rx={2.8} ry={1.8} />
                    <ellipse cx={LEFT.x + 1.8 + off} cy={LEFT.y + 2.2} rx={2.1} ry={2.8} />
                    <ellipse cx={LEFT.x + 7 + off} cy={LEFT.y - 1} rx={1.8} ry={1.2} />
                    <ellipse cx={LEFT.x - 8 + off} cy={LEFT.y + 3} rx={1.4} ry={1.1} />
                  </g>
                ))}
              </g>
              <circle cx={LEFT.x} cy={LEFT.y} r={7} fill={`url(#earthnight-${uid})`} />
            </g>
            <circle cx={LEFT.x} cy={LEFT.y} r={7.6} fill="none" stroke="#93C5FD" strokeOpacity={0.5} strokeWidth={0.55} />
          </g>

          {/* The sun at the heart of the orrery */}
          <circle cx={C} cy={C} r={12} fill={`url(#corona-${uid})`} opacity={0.25 + sky.glow * 0.65}
            className="sko-anim animate-pulse" style={{ animationDuration: "3.2s" }} />
          <g className="sko-anim" style={spin("sko-spin 30s linear infinite", C, C)} opacity={0.3 + sky.glow * 0.6}>
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              const len = i % 2 ? 7.4 : 8.6;
              return (
                <line key={i}
                  x1={C + Math.sin(a) * 5.6} y1={C - Math.cos(a) * 5.6}
                  x2={C + Math.sin(a) * len} y2={C - Math.cos(a) * len}
                  stroke={sky.sun} strokeWidth={0.8} strokeLinecap="round" />
              );
            })}
          </g>
          <circle cx={C} cy={C} r={4.4} fill={`url(#sun-${uid})`} stroke={rg} strokeWidth={0.6} />
        </g>

        {/* ── Domed sapphire glare, sliding against the tilt ── */}
        <g style={depth(-3.2)}>
          <path d={`M ${C - 50} ${C} A 50 50 0 0 1 ${C + 35} ${C - 36} Q ${C - 5} ${C - 30} ${C - 50} ${C}`} fill={`url(#dome-${uid})`} />
        </g>
      </g>
      <circle cx={C} cy={C} r={DIAL_R} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1.2} />
    </svg>
  );
}
