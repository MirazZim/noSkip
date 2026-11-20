import { useId, type CSSProperties } from "react";
import { CONSTELLATIONS, LUME, STAR_FIELD, WATCH_VIEWBOX, atmosphere, mixHex, moonLitPath, starVisibility, type Sky } from "./sky";
import type { Tone } from "./repeater";
import type { SkyWeather } from "./weather";
import type { Strike } from "./WeatherCanvas";

// ─── The dial side of the sky watch ───────────────────────────────────────────
// A high-jewellery astronomical piece. Layers, back to front (each drifts by
// its own depth when the watch tilts):
//   case      — rose-gold case with lugs and a channel-set bezel of baguette
//               diamonds that catch the light as you tilt, glint now and then,
//               and get a slow sweep of light across them;
//   sky       — an all-sky view looking straight up (zenith in the middle,
//               horizon at the rim): the sun's halo where the sun really is,
//               sunrise / sunset glow with the Earth's shadow opposite, lit
//               clouds drifting by day, and at night stars in their real colours
//               coming out brightest-first, the Milky Way and constellations,
//               all wheeling once a day; shooting stars after dark, and an
//               aurora once every habit is done;
//   chapter   — applied rose-gold batons and a minute track;
//   planets   — your habits on the outer orbit: polished gold once done, bigger
//               with a longer streak, ringed at 7 days, with a moon at 30;
//   carriage  — openwork arms that orbit the sun once a minute, carrying an
//               enamel time sub-dial with blued hands, the moon in today's
//               real phase, a triple-axis tourbillon and a tilted lacquer globe;
//   sun       — a brilliant-cut fancy-yellow diamond that slowly turns in its
//               setting, throwing fire as the light moves;
//   weather   — with a weather city set: real cloud cover (grey and heavy when
//               overcast, dark at night), rain or snow slanting with the wind,
//               lightning in a storm, drifting fog;
//   glass     — the domed sapphire glare and its refracting rim, beaded with
//               raindrops that slide down while it rains.
// The case carries a crown (pulled out while you set the time) and the
// repeater slide (drawn down while it chimes).

export interface HabitPlanet { id: string; name: string; emoji: string; done: boolean; streak: number }
export interface Burst { id: string; key: number; delay: number }

const C = 60;          // dial centre
const DIAL_R = 53;
const ARM = 27;        // satellite distance from the sun
const ORBIT = 44;      // habit-planet orbit
const RAD = Math.PI / 180;
const GOLD = "#E2AE8F";      // solid rose gold, for thin strokes (gradients vanish on straight lines)
const GOLD_DEEP = "#9A6248";

type Pt = [number, number];
/** Point at radius r, `deg` clockwise from 12 o'clock, around (cx, cy). */
const at = (r: number, deg: number, cx = C, cy = C): Pt => [cx + Math.sin(deg * RAD) * r, cy - Math.cos(deg * RAD) * r];
const pts = (...ps: Pt[]) => ps.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

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

// ── Gem-set bezel: 36 channel-set baguettes (step cut: pavilion, crown step, table) ──
const STONE_IN = 54.9;
const STONE_OUT = 58.5;
const STONES = Array.from({ length: 36 }, (_, i) => {
  const a0 = i * 10 + 0.9, a1 = i * 10 + 9.1;
  return {
    mid: i * 10 + 5,
    outer: pts(at(STONE_IN, a0), at(STONE_OUT, a0), at(STONE_OUT, a1), at(STONE_IN, a1)),
    crown: pts(at(57.6, a0 + 1.2), at(STONE_OUT, a0), at(STONE_OUT, a1), at(57.6, a1 - 1.2)),
    table: pts(at(55.8, a0 + 1.8), at(57.6, a0 + 1.2), at(57.6, a1 - 1.2), at(55.8, a1 - 1.8)),
    flash: [at(56, a0 + 2.2), at(57.4, a1 - 2.6)] as [Pt, Pt],
    centre: at(56.7, i * 10 + 5),
  };
});
const GLINTS = [3, 10, 16, 23, 29, 34].map((s, i) => ({ at: STONES[s].centre, delay: i * 1.7 }));
const ring = (r: number) => `M ${C - r} ${C} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0 Z`;
const BEZEL_RING = `${ring(STONE_OUT)} ${ring(STONE_IN)}`;
/** A four-point sparkle centred on the origin. */
const GLINT = "M 0 -2.8 L 0.3 -0.3 L 2.8 0 L 0.3 0.3 L 0 2.8 L -0.3 0.3 L -2.8 0 L -0.3 -0.3 Z";

// ── The sun: a round brilliant seen from above ──────────────────────────────
const GEM_R = 5.4, TABLE_R = 2.5, STAR_R = 3.9;
type Facet = { d: string; angle: number; kind: "star" | "kite" | "girdle" };
const GEM_TABLE = pts(...Array.from({ length: 8 }, (_, k) => at(TABLE_R, k * 45)));
const GEM_FACETS: Facet[] = Array.from({ length: 8 }, (_, k): Facet[] => {
  const a = k * 45;
  const T0 = at(TABLE_R, a), T1 = at(TABLE_R, a + 45);
  const S = at(STAR_R, a + 22.5), Sprev = at(STAR_R, a - 22.5);
  const G0 = at(GEM_R, a), G1 = at(GEM_R, a + 45), M = at(GEM_R, a + 22.5);
  return [
    { d: pts(T0, T1, S), angle: a + 22.5, kind: "star" },
    { d: pts(T0, S, G0, Sprev), angle: a, kind: "kite" },
    { d: pts(S, G0, M), angle: a + 11, kind: "girdle" },
    { d: pts(S, M, G1), angle: a + 34, kind: "girdle" },
  ];
}).flat();
const FACET_WEIGHT = { star: [0.55, 0.3], kite: [0.4, 0.45], girdle: [0.8, 0.25] } as const;

// ── Weather furniture (deterministic, so nothing jumps between renders) ──────
const weatherRnd = (() => {
  let seed = 41;
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
})();
/** Rain streaks: spread wider than the dial so they still cover it when slanted by the wind. */
const RAIN = Array.from({ length: 70 }, () => ({
  x: -12 + weatherRnd() * 144, len: 2.5 + weatherRnd() * 3, dur: 0.45 + weatherRnd() * 0.35, phase: weatherRnd(), op: 0.35 + weatherRnd() * 0.4,
}));
const SNOW = Array.from({ length: 50 }, () => ({
  x: -10 + weatherRnd() * 140, r: 0.35 + weatherRnd() * 0.55, dur: 5 + weatherRnd() * 4, phase: weatherRnd(),
}));
/** Water beads on the crystal; every third one slides down. */
const GLASS_DROPS = (() => {
  const out: { x: number; y: number; r: number; slide: number; delay: number }[] = [];
  while (out.length < 16) {
    const x = 14 + weatherRnd() * 92, y = 14 + weatherRnd() * 92;
    if ((x - C) ** 2 + (y - C) ** 2 > 46 ** 2) continue;
    out.push({ x, y, r: 0.9 + weatherRnd() * 1.1, slide: out.length % 3 === 0 ? 7 + weatherRnd() * 6 : 0, delay: weatherRnd() * 8 });
  }
  return out;
})();
/** A jagged, forked bolt down through the dial's sky, shaped by the strike's seed. */
function dialBolt(seed: number) {
  let s = (seed % 2147483646) + 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  let x = 30 + r() * 60, y = 4;
  const main: Pt[] = [[x, y]];
  for (let i = 6 + Math.floor(r() * 3); i > 0; i--) {
    x += (r() - 0.5) * 12;
    y += 5 + r() * 4;
    main.push([x, y]);
  }
  // One fork off the upper half of the channel.
  let [bx, by] = main[1 + Math.floor(r() * 3)];
  const dir = r() < 0.5 ? -1 : 1;
  const fork: Pt[] = [[bx, by]];
  for (let i = 0; i < 3; i++) {
    bx += dir * (3 + r() * 5);
    by += 3 + r() * 4;
    fork.push([bx, by]);
  }
  return { main: pts(...main), fork: pts(...fork) };
}

/** Leaf-shaped hand pointing at 12, pivoting on (cx, cy). */
const leafHand = (cx: number, cy: number, len: number, w: number) =>
  `M ${cx} ${cy + 1.4} Q ${cx - w} ${cy - len * 0.35} ${cx} ${cy - len} Q ${cx + w} ${cy - len * 0.35} ${cx} ${cy + 1.4} Z`;

/** Archimedean spiral — the tourbillon's hairspring. */
function spiral(cx: number, cy: number, r0: number, r1: number, turns: number) {
  const out: string[] = [];
  for (let i = 0; i <= 60; i++) {
    const th = (i / 60) * Math.PI * 2 * turns;
    const r = r0 + (i / 60) * (r1 - r0);
    out.push(`${(cx + Math.cos(th) * r).toFixed(2)},${(cy + Math.sin(th) * r).toFixed(2)}`);
  }
  return `M ${out.join(" L ")}`;
}

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
        <circle cx={124} cy={59.3} r={0.55} fill="#fff" fillOpacity={0.7} />
      </g>
    </>
  );
}

/** Four sculpted lugs, shared by the dial and the caseback. */
export function CaseLugs({ rg }: { rg: string }) {
  return (
    <>
      {[33, -33, 147, -147].map((a) => (
        <g key={a} transform={`rotate(${a} ${C} ${C})`}>
          {/* Tapered horn: wide where it meets the case, slimmer at the tip */}
          <path d={`M ${C - 4.6} ${C - 54} L ${C - 3} ${C - 66.6} Q ${C} ${C - 68.2} ${C + 3} ${C - 66.6} L ${C + 4.6} ${C - 54} Z`} fill={rg} />
          <path d={`M ${C - 0.5} ${C - 58} L ${C - 0.35} ${C - 66.4} L ${C + 0.35} ${C - 66.4} L ${C + 0.5} ${C - 58} Z`} fill="#FFF4EC" fillOpacity={0.55} />
          <path d={`M ${C - 3.9} ${C - 58} L ${C - 2.7} ${C - 66.2}`} stroke={GOLD_DEEP} strokeOpacity={0.6} strokeWidth={0.3} />
          <circle cx={C + 2.1} cy={C - 64.6} r={0.5} fill={GOLD_DEEP} fillOpacity={0.8} />
        </g>
      ))}
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
  weather: SkyWeather | null;  // live weather for the user's city; null = default fair sky
  lightning: Strike | null;    // the latest lightning strike in the card's storm
}

export function Dial({ t, carriage, sky, moon, moonLabel, habits, bursts, lume, tilt, crownOut, strike, chiming, label, weather, lightning }: DialProps) {
  const uid = useId().replace(/:/g, "");
  const hourDeg = (t / 60) * 30;
  const minDeg = t * 6;
  const skyDeg = -(t / 1440) * 360;           // constellations wheel once a day
  const allDone = habits.length > 0 && habits.every((h) => h.done);
  // Where the light comes from: top-left, swinging as the watch tilts.
  const light = 315 + tilt.x * 50 + tilt.y * 30;
  const facing = (deg: number) => (1 + Math.cos((deg - light) * RAD)) / 2;   // 0 away … 1 toward the light

  const TOP = { x: C, y: C - ARM };           // time sub-dial
  const RIGHT = { x: C + ARM, y: C };         // moon
  const BOTTOM = { x: C, y: C + ARM };        // tourbillon
  const LEFT = { x: C - ARM, y: C };          // earth

  // All-sky view, looking straight up: zenith in the middle, horizon at the rim.
  const atm = atmosphere(t);
  const dial = lume ? ["#000000", "#03100A", "#06140D"] : [atm.zenith, atm.mid, atm.horizon];
  const wx = lume ? null : weather;
  const cover = wx?.cloud ?? 0;
  const starAmt = lume ? 0.2 : sky.stars * (1 - Math.pow(cover, 1.5) * 0.9);   // cloud hides the stars
  const night = sky.stars;                    // 0 day … 1 night, for darkening clouds and rain
  // Overcast skies go grey; rain and storms darker still.
  const gloom = wx ? Math.min(0.85, cover * cover * 0.55 + wx.rain * 0.25 + (wx.storm ? 0.2 : 0)) : 0;
  const rainy = wx ? Math.min(1, wx.rain * 0.9 + wx.snow * 0.5 + (wx.storm ? 0.3 : 0)) : 0;
  const heavy = Math.max(0, Math.min(1, (cover - 0.6) / 0.4)) * 0.6;   // a full deck of cloud is grey, not white
  const cloudLit = mixHex(mixHex(mixHex(atm.cloudLit, "#BCC3CD", heavy), "#4A5263", night), "#8A929E", rainy * (1 - night));
  const cloudShade = mixHex(mixHex(mixHex(atm.cloudShade, "#6B7584", heavy), "#151A24", night), "#3B4250", rainy * (1 - night));
  // Clouds: with real weather the noise threshold follows the cloud cover; without, a fair-weather default by day.
  const showClouds = !lume && (wx ? cover > 0.04 : sky.clouds > 0.02);
  const cloudThreshold = wx ? 0.66 - 0.36 * cover : 0.54;
  const cloudOpacity = wx ? 0.95 : sky.clouds * 0.9;
  const windTilt = wx ? Math.max(-30, Math.min(30, -wx.windX * wx.wind * 40)) : 0;
  const rainCount = wx && wx.rain > 0 ? Math.round(15 + wx.rain * 55) : 0;
  const snowCount = wx && wx.snow > 0 ? Math.round(10 + wx.snow * 40) : 0;
  const beads = wx && wx.rain > 0 ? Math.round(4 + wx.rain * 12) : 0;
  const sunX = C + atm.sun.x * DIAL_R, sunY = C + atm.sun.y * DIAL_R;
  const sunR = Math.hypot(atm.sun.x, atm.sun.y) || 1;
  const antiX = C - (atm.sun.x / sunR) * DIAL_R * 1.05, antiY = C - (atm.sun.y / sunR) * DIAL_R * 1.05;
  const milkyWay = lume ? 0 : Math.max(0, (starAmt - 0.5) / 0.5) * 0.55;
  // Clouds blow across the dial as the day goes by — faster, and the real way, in the wind.
  const drift = t * 0.4 * (wx ? 1 + wx.wind * 5 : 1);
  const driftX = drift * (wx ? wx.windX : 1), driftY = drift * (wx ? wx.windY : 0);
  const subFace = lume ? "#07100B" : `url(#enamel-${uid})`;
  const subInk = lume ? LUME : "#111827";
  const glow = lume ? `url(#lume-${uid})` : undefined;
  const rg = `url(#rg-${uid})`;
  const waveColor = strike?.tone === "low" ? sky.sun : "#BFDBFE";
  const [poleN, poleS] = [at(8.5, -23.4, LEFT.x, LEFT.y), at(8.5, 156.6, LEFT.x, LEFT.y)];

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
        <radialGradient id={`dial-${uid}`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r={DIAL_R + 1}>
          <stop offset="0%" stopColor={dial[0]} />
          <stop offset="58%" stopColor={dial[1]} />
          <stop offset="100%" stopColor={dial[2]} />
        </radialGradient>
        {/* Bright scattered light around the sun while it's up */}
        <radialGradient id={`halo-${uid}`} gradientUnits="userSpaceOnUse" cx={sunX} cy={sunY} r={28}>
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
          <stop offset="20%" stopColor={sky.sun} stopOpacity={0.35} />
          <stop offset="100%" stopColor={sky.sun} stopOpacity={0} />
        </radialGradient>
        {/* Sunrise / sunset glow, on the sun's side of the horizon */}
        <radialGradient id={`twi-${uid}`} gradientUnits="userSpaceOnUse" cx={sunX} cy={sunY} r={62}>
          <stop offset="0%" stopColor="#FFE2A8" stopOpacity={0.95} />
          <stop offset="22%" stopColor={sky.sun} stopOpacity={0.75} />
          <stop offset="52%" stopColor="#F472B6" stopOpacity={0.28} />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
        </radialGradient>
        {/* Opposite the sun: the Earth's shadow, with the pink belt of Venus above it */}
        <radialGradient id={`belt-${uid}`} gradientUnits="userSpaceOnUse" cx={antiX} cy={antiY} r={36}>
          <stop offset="0%" stopColor="#1E1B4B" stopOpacity={0.6} />
          <stop offset="26%" stopColor="#312E81" stopOpacity={0.35} />
          <stop offset="42%" stopColor="#F9A8D4" stopOpacity={0.32} />
          <stop offset="72%" stopColor="#F9A8D4" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`mwband-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0} />
          <stop offset="50%" stopColor="#fff" stopOpacity={1} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        {/* Clouds: fractal noise thresholded into cloud masses, then lit from the sun's direction */}
        <filter id={`clouds-${uid}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.028 0.05" numOctaves={4} seed={9} result="noise" />
          <feColorMatrix in="noise" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 ${(-5 * cloudThreshold).toFixed(3)}`} result="mass" />
          <feGaussianBlur in="mass" stdDeviation="0.5" result="soft" />
          <feDiffuseLighting in="soft" surfaceScale={4} diffuseConstant={1.1} lightingColor={cloudLit} result="lit">
            <feDistantLight azimuth={atm.lightAz} elevation={atm.lightEl} />
          </feDiffuseLighting>
          <feFlood floodColor={cloudShade} result="ambient" />
          <feComposite in="lit" in2="ambient" operator="arithmetic" k1={0} k2={0.75} k3={0.55} k4={0} result="shaded" />
          <feComposite in="shaded" in2="soft" operator="in" />
        </filter>
        {/* The same cloud masses, glowing: lightning lighting them from within */}
        <filter id={`cloudslit-${uid}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.028 0.05" numOctaves={4} seed={9} result="noise" />
          <feColorMatrix in="noise" type="matrix" values={`0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 ${(-5 * cloudThreshold).toFixed(3)}`} result="mass" />
          <feGaussianBlur in="mass" stdDeviation="0.6" result="soft" />
          <feFlood floodColor="#EEF1FF" result="glow" />
          <feComposite in="glow" in2="soft" operator="in" />
        </filter>
        {/* The Milky Way: mottled noise inside a soft band */}
        <filter id={`mw-${uid}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves={3} seed={4} result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.85  0 0 0 0 0.88  0 0 0 0 1  2.2 0 0 0 -0.75" result="neb" />
          <feComposite in="neb" in2="SourceGraphic" operator="arithmetic" k1={1} k2={0} k3={0} k4={0} />
        </filter>
        <radialGradient id={`sun-${uid}`} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#FFFDF0" />
          <stop offset="45%" stopColor={sky.sun} />
          <stop offset="100%" stopColor="#B45309" />
        </radialGradient>
        <radialGradient id={`corona-${uid}`}>
          <stop offset="0%" stopColor={sky.sun} stopOpacity={0.8} />
          <stop offset="100%" stopColor={sky.sun} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`earth-${uid}`} cx="70%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="60%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#172554" />
        </radialGradient>
        {/* Earth's night side faces away from the central sun. */}
        <linearGradient id={`earthnight-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity={0.7} />
          <stop offset="55%" stopColor="#000" stopOpacity={0} />
        </linearGradient>
        <radialGradient id={`spec-${uid}`}>
          <stop offset="0%" stopColor="#fff" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`moon-${uid}`} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#F9FAFB" />
          <stop offset="100%" stopColor="#A1A1AA" />
        </radialGradient>
        <radialGradient id={`gold-${uid}`}>
          <stop offset="0%" stopColor="#FFD60A" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#FFD60A" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`pgold-${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#FFF7CC" />
          <stop offset="45%" stopColor="#FFD60A" />
          <stop offset="100%" stopColor="#A16207" />
        </radialGradient>
        <radialGradient id={`pdark-${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="40%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0B1220" />
        </radialGradient>
        <radialGradient id={`enamel-${uid}`} cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E9E4D8" />
        </radialGradient>
        <linearGradient id={`blued-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F6BED" />
          <stop offset="100%" stopColor="#1E2A78" />
        </linearGradient>
        <radialGradient id={`ruby-${uid}`} cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FDA4AF" />
          <stop offset="50%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#881337" />
        </radialGradient>
        <pattern id={`perlage-${uid}`} width={1.8} height={1.8} patternUnits="userSpaceOnUse">
          <circle cx={0.9} cy={0.9} r={0.8} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={0.18} />
        </pattern>
        <linearGradient id={`sweep-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity={0} />
          <stop offset="50%" stopColor="#fff" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
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
          <stop offset="0%" stopColor="#fff" stopOpacity={0.36} />
          <stop offset="40%" stopColor="#fff" stopOpacity={0.06} />
          <stop offset="41%" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`rim-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.35} />
          <stop offset="45%" stopColor="#fff" stopOpacity={0} />
          <stop offset="100%" stopColor="#A5B4FC" stopOpacity={0.3} />
        </linearGradient>
        <linearGradient id={`streak-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EEF4FF" stopOpacity={0} />
          <stop offset="100%" stopColor="#EEF4FF" stopOpacity={1} />
        </linearGradient>
        {/* A water bead on the crystal: clear middle, dark refracting edge, bright rim */}
        <radialGradient id={`bead-${uid}`} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity={0.06} />
          <stop offset="65%" stopColor="#fff" stopOpacity={0.12} />
          <stop offset="85%" stopColor="#0B1220" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#fff" stopOpacity={0.55} />
        </radialGradient>
        <clipPath id={`dialclip-${uid}`}><circle cx={C} cy={C} r={DIAL_R} /></clipPath>
        <clipPath id={`bezel-${uid}`}><path d={BEZEL_RING} clipRule="evenodd" /></clipPath>
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
      <CaseLugs rg={rg} />

      {/* ── Case + channel-set baguette bezel ── */}
      <circle cx={C} cy={C} r={59.4} fill={rg} />
      <circle cx={C} cy={C} r={59.2} fill="none" stroke={GOLD_DEEP} strokeOpacity={0.6} strokeWidth={0.4} />
      {STONES.map((s, i) => {
        const b = facing(s.mid);
        const fire = Math.pow(b, 8);
        const vary = (i % 3) * 3;
        return (
          <g key={i}>
            <polygon points={s.outer} fill={lume ? "#0C1712" : `hsl(212 28% ${36 + vary + 26 * (1 - b)}%)`} />
            <polygon points={s.crown} fill="#fff" fillOpacity={lume ? 0.04 : 0.15 + 0.45 * b} />
            <polygon points={s.table} fill={lume ? "#13261C" : `hsl(205 45% ${72 + vary + 22 * b}%)`} />
            {!lume && fire > 0.03 && (
              <line x1={s.flash[0][0]} y1={s.flash[0][1]} x2={s.flash[1][0]} y2={s.flash[1][1]}
                stroke="#fff" strokeOpacity={fire} strokeWidth={0.35} strokeLinecap="round" />
            )}
          </g>
        );
      })}
      <circle cx={C} cy={C} r={STONE_OUT + 0.25} fill="none" stroke="#5A3627" strokeOpacity={0.55} strokeWidth={0.3} />
      <circle cx={C} cy={C} r={STONE_IN - 0.25} fill="none" stroke="#5A3627" strokeOpacity={0.55} strokeWidth={0.3} />
      {!lume && (
        <>
          {/* A slow sweep of light across the stones */}
          <g clipPath={`url(#bezel-${uid})`}>
            <g className="sko-anim" style={spin("sko-sweep 9s ease-in-out infinite", C, C)}>
              <path d={`M ${C} ${C} L ${C - 9} ${C - 62} L ${C + 9} ${C - 62} Z`} fill={`url(#sweep-${uid})`} />
            </g>
          </g>
          {GLINTS.map((g, i) => (
            <g key={i} transform={`translate(${g.at[0].toFixed(2)} ${g.at[1].toFixed(2)})`}>
              <path d={GLINT} fill="#fff" filter={`url(#lume-${uid})`}
                className="sko-anim" style={{ ...spin(`sko-glint 5.5s ease-in-out ${g.delay}s infinite`), opacity: 0 }} />
            </g>
          ))}
        </>
      )}
      {/* In a lightning flash the diamonds flare */}
      {lightning && !lume && (
        <g style={{ opacity: "var(--strike, 0)" }}>
          <g clipPath={`url(#bezel-${uid})`}>
            <circle cx={C} cy={C} r={STONE_OUT} fill="#F4F7FF" opacity={0.45} />
          </g>
          {STONES.filter((_, i) => i % 3 === lightning.id % 3).map((s, i) => (
            <g key={i} transform={`translate(${s.centre[0].toFixed(2)} ${s.centre[1].toFixed(2)}) scale(0.8)`}>
              <path d={GLINT} fill="#fff" filter={`url(#lume-${uid})`} />
            </g>
          ))}
        </g>
      )}
      <circle cx={C} cy={C} r={54.5} fill="#2A1810" />
      <circle cx={C} cy={C} r={54.1} fill={rg} />
      {strike && (
        <circle key={`flash-${strike.id}`} cx={C} cy={C} r={56.7} fill="none" stroke={waveColor} strokeWidth={1.4}
          className="sko-anim" style={{ animation: "sko-flash 600ms ease-out forwards" }} />
      )}

      <g clipPath={`url(#dialclip-${uid})`}>
        {/* ── Sky layer ── */}
        <g style={depth(-1.6)}>
          <circle cx={C} cy={C} r={DIAL_R + 3} fill={`url(#dial-${uid})`} />
          {!lume && atm.day > 0 && <circle cx={C} cy={C} r={DIAL_R + 3} fill={`url(#halo-${uid})`} opacity={atm.day * (1 - 0.75 * cover)} />}
          {!lume && atm.twilight > 0.02 && (
            <>
              <circle cx={C} cy={C} r={DIAL_R + 3} fill={`url(#twi-${uid})`} opacity={atm.twilight * (1 - 0.6 * cover)} />
              <circle cx={C} cy={C} r={DIAL_R + 3} fill={`url(#belt-${uid})`} opacity={atm.twilight * (1 - 0.8 * cover)} />
            </>
          )}
          {/* Overcast: the whole sky goes grey */}
          {gloom > 0.01 && (
            <circle cx={C} cy={C} r={DIAL_R + 3} fill={mixHex("#7D8794", "#0B0F18", night)} opacity={gloom} />
          )}

          {/* The night sky wheels once a day: Milky Way, stars, constellations */}
          <g style={turn(skyDeg, C, C)}>
            {milkyWay > 0.01 && (
              <g transform={`rotate(-28 ${C} ${C})`} opacity={milkyWay}>
                <rect x={C - 62} y={C - 4} width={124} height={26} fill={`url(#mwband-${uid})`} filter={`url(#mw-${uid})`} />
                <rect x={C - 62} y={C + 7.5} width={124} height={3.5} fill="#000" fillOpacity={0.5} filter={`url(#soft-${uid})`} />
              </g>
            )}
            {STAR_FIELD.map((s, i) => {
              const vis = starVisibility(s.b, starAmt);
              if (vis <= 0.01) return null;
              const twinkles = s.b > 0.45;
              return (
                <g key={i} opacity={vis * (0.45 + 0.55 * s.b)}>
                  {s.b > 0.7 && !lume && <circle cx={s.x} cy={s.y} r={s.r * 2.6} fill={s.color} opacity={0.18} />}
                  <circle cx={s.x} cy={s.y} r={s.r} fill={lume ? LUME : s.color}
                    className={twinkles ? "sko-anim" : undefined}
                    style={twinkles ? { animation: `sko-scint ${s.tw.toFixed(2)}s ease-in-out ${s.d.toFixed(2)}s infinite` } : undefined} />
                </g>
              );
            })}
            {CONSTELLATIONS.map((c, ci) => (
              <g key={ci} opacity={0.15 + 0.85 * starVisibility(0.85, starAmt)}>
                {c.lines.map(([a, b], li) => (
                  <line key={li}
                    x1={C + c.stars[a][0]} y1={C + c.stars[a][1]} x2={C + c.stars[b][0]} y2={C + c.stars[b][1]}
                    stroke={lume ? LUME : "#fff"} strokeOpacity={0.16} strokeWidth={0.3} />
                ))}
                {c.stars.map(([x, y], si) => <circle key={si} cx={C + x} cy={C + y} r={0.75} fill={lume ? LUME : "#F2F4FF"} />)}
              </g>
            ))}
          </g>

          {/* Clouds, lit gold and pink at sunrise and sunset, grey in the rain, dark at night.
              The noise is sampled further along as time passes, so they drift with the
              wind (and race when you scrub). */}
          {showClouds && (
            <g transform={`translate(${driftX.toFixed(2)} ${driftY.toFixed(2)})`} opacity={cloudOpacity}>
              <rect x={C - 58 - driftX} y={2 - driftY} width={116} height={116} filter={`url(#clouds-${uid})`} />
            </g>
          )}

          {/* Lightning: each strike in the card's storm lights the dial's clouds from within.
              Brightness comes from --strike, which the card's storm sets frame by frame. */}
          {lightning && !lume && (() => {
            const bolt = lightning.bolt ? dialBolt(lightning.seed) : null;
            return (
              <g key={`strike-${lightning.id}`}>
                {showClouds && (
                  <g transform={`translate(${driftX.toFixed(2)} ${driftY.toFixed(2)})`} style={{ opacity: "calc(var(--strike, 0) * 0.7)" }}>
                    <rect x={C - 58 - driftX} y={2 - driftY} width={116} height={116} filter={`url(#cloudslit-${uid})`} />
                  </g>
                )}
                <circle cx={C} cy={C} r={DIAL_R + 3} fill="#E8EEFF" style={{ opacity: "calc(var(--strike, 0) * 0.3)" }} />
                {bolt && (
                  <g fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ opacity: "var(--strike, 0)" }}>
                    {/* soft violet glow round the channel… */}
                    <g stroke="#B8C4FF" strokeOpacity={0.5} filter={`url(#soft-${uid})`}>
                      <polyline points={bolt.main} strokeWidth={3.2} />
                      <polyline points={bolt.fork} strokeWidth={2} />
                    </g>
                    {/* …and the white-hot core */}
                    <g stroke="#F8FAFF" filter={`url(#lume-${uid})`}>
                      <polyline points={bolt.main} strokeWidth={1.5} />
                      <polyline points={bolt.fork} strokeWidth={0.9} />
                    </g>
                  </g>
                )}
              </g>
            );
          })()}

          {/* Fog: a milky veil with banks drifting through it */}
          {wx && wx.fog > 0 && (
            <g>
              <circle cx={C} cy={C} r={DIAL_R + 3} fill={mixHex("#D5DBE3", "#2A3140", night)} opacity={wx.fog * 0.45} />
              <g filter={`url(#soft-${uid})`} className="sko-anim" style={{ animation: "sko-fog 18s ease-in-out infinite alternate" }}>
                <ellipse cx={C} cy={C + 18} rx={62} ry={7} fill={mixHex("#E5E9EF", "#3A4252", night)} opacity={wx.fog * 0.55} />
                <ellipse cx={C - 8} cy={C - 16} rx={56} ry={6} fill={mixHex("#E5E9EF", "#3A4252", night)} opacity={wx.fog * 0.4} />
              </g>
            </g>
          )}

          {/* Aurora: the reward for finishing every habit */}
          {allDone && (
            <g filter={`url(#soft-${uid})`} opacity={0.55 + 0.45 * starAmt}>
              <g className="sko-anim" style={spin("sko-aurora 7s ease-in-out infinite", C, 38)}>
                <path d="M 4 44 C 24 22, 44 50, 64 30 S 100 26, 118 38 L 118 52 C 96 42, 76 58, 58 46 S 22 60, 4 58 Z" fill={`url(#aurora-${uid})`} />
                <path d="M 4 32 C 30 12, 50 36, 70 18 S 104 16, 118 26 L 118 36 C 100 30, 80 44, 62 32 S 26 44, 4 44 Z" fill={`url(#aurora-${uid})`} opacity={0.7} />
              </g>
            </g>
          )}

          {(sky.dark || lume) && cover < 0.6 && (
            <g className="sko-anim" style={{ animation: "sko-shoot 9s ease-out 2s infinite" }}>
              <line x1={92} y1={24} x2={104} y2={17} stroke={`url(#shoot-${uid})`} strokeWidth={0.8} strokeLinecap="round" />
            </g>
          )}
        </g>

        {/* ── Rain and snow, slanting with the wind ── */}
        {(rainCount > 0 || snowCount > 0) && (
          <g style={depth(-0.8)}>
            <g transform={`rotate(${windTilt.toFixed(1)} ${C} ${C})`}>
              {RAIN.slice(0, rainCount).map((d, i) => {
                const dur = d.dur / (0.7 + wx!.rain * 0.6);
                // Motion-blurred streak: faint tail, bright head.
                return (
                  <rect key={i} x={d.x - 0.22} y={C - 75} width={0.45} height={d.len * 1.6} rx={0.22}
                    fill={`url(#streak-${uid})`} opacity={Math.min(1, d.op + 0.15) * (1 - 0.3 * night)}
                    className="sko-anim" style={{ animation: `sko-rain ${dur.toFixed(2)}s linear ${(-d.phase * dur).toFixed(2)}s infinite` }} />
                );
              })}
              {SNOW.slice(0, snowCount).map((f, i) => (
                <circle key={i} cx={f.x} cy={C - 75} r={f.r} fill="#fff" fillOpacity={0.85}
                  className="sko-anim" style={{ animation: `sko-snow ${f.dur.toFixed(2)}s linear ${(-f.phase * f.dur).toFixed(2)}s infinite` }} />
              ))}
            </g>
          </g>
        )}

        {/* Sound wave across the sky on each repeater strike */}
        {strike && (
          <circle key={`wave-${strike.id}`} cx={C} cy={C} r={DIAL_R} fill="none" stroke={waveColor} strokeWidth={0.8}
            className="sko-anim" style={spin("sko-wave 900ms ease-out forwards")} />
        )}

        {/* ── Chapter ring: minute track + applied rose-gold batons ── */}
        {Array.from({ length: 60 }, (_, i) => {
          const five = i % 5 === 0;
          const [x1, y1] = at(51.9, i * 6), [x2, y2] = at(52.8, i * 6);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={lume ? LUME : "#fff"}
            strokeOpacity={five ? 0.75 : 0.4} strokeWidth={five ? 0.35 : 0.2} />;
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const main = i % 3 === 0;
          const w = main ? 1.7 : 1.1;
          const top = main ? 46.6 : 47.8;
          return (
            <g key={i} transform={`rotate(${i * 30} ${C} ${C})`}>
              {(i === 0 ? [-1.25, 1.25] : [0]).map((o) => (
                <g key={o}>
                  <rect x={C + o - w / 2} y={C - 51.3} width={w} height={51.3 - top} rx={w / 2} fill={lume ? LUME : rg} filter={glow} />
                  {!lume && <rect x={C + o - w * 0.15} y={C - 50.9} width={w * 0.3} height={51.3 - top - 0.8} rx={w * 0.15} fill="#FFF4EC" fillOpacity={0.7} />}
                </g>
              ))}
            </g>
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
                      <circle cx={C} cy={C} r={r} fill={lume ? LUME : `url(#pgold-${uid})`} filter={glow} />
                    </>
                  ) : (
                    <circle cx={C} cy={C} r={r} fill={`url(#pdark-${uid})`} stroke="#fff" strokeOpacity={0.5} strokeWidth={0.4} />
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
            {/* Openwork rose-gold arms */}
            {[0, 90].map((rot) => (
              <g key={rot} transform={`rotate(${rot} ${C} ${C})`}>
                <rect x={C - 1.4} y={C - ARM} width={2.8} height={ARM * 2} rx={1.4} fill={rg} />
                <rect x={C - 1.05} y={C - ARM + 1} width={0.4} height={ARM * 2 - 2} rx={0.2} fill="#FFF4EC" fillOpacity={0.45} />
                {[-1, 1].map((s) => (
                  <rect key={s} x={C - 0.42} y={s < 0 ? C - ARM + 5.5 : C + 9.5} width={0.84} height={ARM - 15} rx={0.42}
                    fill="#1A0F0A" fillOpacity={0.85} />
                ))}
              </g>
            ))}

            {/* Time sub-dial: grand-feu enamel, blued leaf hands — counter-rotates so it always reads upright */}
            <g style={turn(-carriage, TOP.x, TOP.y, 1000)}>
              <circle cx={TOP.x} cy={TOP.y} r={11.4} fill={rg} />
              {Array.from({ length: 48 }, (_, i) => {
                const [x1, y1] = at(10.55, i * 7.5, TOP.x, TOP.y), [x2, y2] = at(11.35, i * 7.5, TOP.x, TOP.y);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#7E4F3A" strokeOpacity={0.45} strokeWidth={0.2} />;
              })}
              <circle cx={TOP.x} cy={TOP.y} r={10.2} fill={subFace} />
              {!lume && [2.4, 3.6, 4.8, 6, 7.2].map((r) => (
                <circle key={r} cx={TOP.x} cy={TOP.y} r={r} fill="none" stroke="#7C6F5A" strokeOpacity={0.09} strokeWidth={0.14} />
              ))}
              <circle cx={TOP.x} cy={TOP.y} r={8.5} fill="none" stroke={subInk} strokeOpacity={0.45} strokeWidth={0.12} />
              <circle cx={TOP.x} cy={TOP.y} r={9.4} fill="none" stroke={subInk} strokeOpacity={0.45} strokeWidth={0.12} />
              {Array.from({ length: 12 }, (_, i) => {
                if (i % 3) {
                  const [x, y] = at(8.95, i * 30, TOP.x, TOP.y);
                  return <circle key={i} cx={x} cy={y} r={0.38} fill={subInk} filter={glow} />;
                }
                return (
                  <g key={i} transform={`rotate(${i * 30} ${TOP.x} ${TOP.y})`}>
                    {(i === 0 ? [-0.6, 0.6] : [0]).map((o) => (
                      <rect key={o} x={TOP.x + o - 0.32} y={TOP.y - 9.4} width={0.64} height={2.7} rx={0.2} fill={subInk} filter={glow} />
                    ))}
                  </g>
                );
              })}
              <path d={leafHand(TOP.x, TOP.y, 5.4, 1.7)} fill={lume ? LUME : `url(#blued-${uid})`} filter={glow}
                style={turn(hourDeg, TOP.x, TOP.y)} />
              <path d={leafHand(TOP.x, TOP.y, 8.3, 1.25)} fill={lume ? LUME : `url(#blued-${uid})`} filter={glow}
                style={turn(minDeg, TOP.x, TOP.y)} />
              <circle cx={TOP.x} cy={TOP.y} r={1.05} fill={rg} />
              <circle cx={TOP.x} cy={TOP.y} r={0.4} fill={`url(#ruby-${uid})`} />
            </g>

            {/* Moon in today's real phase — counter-rotates to stay oriented */}
            <g style={turn(-carriage, RIGHT.x, RIGHT.y, 1000)}>
              <title>{moonLabel}</title>
              <circle cx={RIGHT.x} cy={RIGHT.y} r={6.2} fill="#111827" fillOpacity={0.9} />
              <g clipPath={`url(#moonclip-${uid})`}>
                <circle cx={RIGHT.x} cy={RIGHT.y} r={6.2} fill={lume ? LUME : `url(#moon-${uid})`} fillOpacity={lume ? 0.85 : 1} />
                <circle cx={RIGHT.x - 2} cy={RIGHT.y - 1.4} r={1.3} fill="#6B7280" fillOpacity={0.35} />
                <circle cx={RIGHT.x + 2.1} cy={RIGHT.y + 1.8} r={0.95} fill="#6B7280" fillOpacity={0.35} />
                <circle cx={RIGHT.x + 0.6} cy={RIGHT.y - 3} r={0.65} fill="#6B7280" fillOpacity={0.35} />
                <circle cx={RIGHT.x - 2.6} cy={RIGHT.y + 2.4} r={0.5} fill="#6B7280" fillOpacity={0.3} />
              </g>
              <circle cx={RIGHT.x} cy={RIGHT.y} r={6.9} fill="none" stroke={rg} strokeWidth={0.9} />
            </g>

            {/* Triple-axis tourbillon on a perlage-finished cock */}
            <circle cx={BOTTOM.x} cy={BOTTOM.y} r={9} fill={rg} />
            <circle cx={BOTTOM.x} cy={BOTTOM.y} r={8.1} fill="#0B0705" />
            {!lume && <circle cx={BOTTOM.x} cy={BOTTOM.y} r={8.1} fill={`url(#perlage-${uid})`} />}
            {[30, 150, 270].map((a) => {
              const [x, y] = at(8.55, a, BOTTOM.x, BOTTOM.y);
              return <circle key={a} cx={x} cy={y} r={0.42} fill="#F5F5F4" stroke="#78716C" strokeWidth={0.12} />;
            })}
            <g className="sko-anim" style={spin("sko-spin 8s linear infinite", BOTTOM.x, BOTTOM.y)}>
              <circle cx={BOTTOM.x} cy={BOTTOM.y} r={6.7} fill="none" stroke={GOLD} strokeWidth={0.7} />
              <circle cx={BOTTOM.x} cy={BOTTOM.y} r={6} fill="none" stroke={GOLD_DEEP} strokeWidth={0.25} />
              {[0, 120, 240].map((a) => {
                const [x, y] = at(6.7, a, BOTTOM.x, BOTTOM.y);
                return (
                  <g key={a}>
                    <line x1={BOTTOM.x} y1={BOTTOM.y} x2={x} y2={y} stroke={GOLD} strokeWidth={0.75} strokeLinecap="round" />
                    <circle cx={x} cy={y} r={0.65} fill={GOLD} />
                  </g>
                );
              })}
            </g>
            <g className="sko-anim" style={spin("sko-flipx 2.6s ease-in-out infinite", BOTTOM.x, BOTTOM.y)}>
              <circle cx={BOTTOM.x} cy={BOTTOM.y} r={5} fill="none" stroke="#E5C07B" strokeWidth={0.6} />
              <circle cx={BOTTOM.x - 5} cy={BOTTOM.y} r={0.45} fill="#E5C07B" />
              <circle cx={BOTTOM.x + 5} cy={BOTTOM.y} r={0.45} fill="#E5C07B" />
              <g className="sko-anim" style={spin("sko-flipy 3.8s ease-in-out infinite", BOTTOM.x, BOTTOM.y)}>
                <path d={spiral(BOTTOM.x, BOTTOM.y, 0.5, 2.4, 3.5)} fill="none" stroke="#CBD5E1" strokeOpacity={0.9} strokeWidth={0.14} />
                <circle cx={BOTTOM.x} cy={BOTTOM.y} r={3.3} fill="none" stroke={lume ? LUME : GOLD} strokeWidth={0.65} filter={glow} />
                <line x1={BOTTOM.x - 3.3} y1={BOTTOM.y} x2={BOTTOM.x + 3.3} y2={BOTTOM.y} stroke={GOLD} strokeWidth={0.45} />
                {Array.from({ length: 8 }, (_, i) => {
                  const [x, y] = at(3.3, i * 45, BOTTOM.x, BOTTOM.y);
                  return <circle key={i} cx={x} cy={y} r={0.3} fill="#FDE68A" />;
                })}
              </g>
            </g>
            <circle cx={BOTTOM.x} cy={BOTTOM.y} r={0.95} fill={`url(#ruby-${uid})`} />
            <circle cx={BOTTOM.x - 0.3} cy={BOTTOM.y - 0.3} r={0.28} fill="#fff" fillOpacity={0.7} />

            {/* Lacquer globe on its 23.4° axis: drifting continents, graticule, night side away from the sun */}
            <g clipPath={`url(#earthclip-${uid})`}>
              <circle cx={LEFT.x} cy={LEFT.y} r={7} fill={`url(#earth-${uid})`} />
              <g transform={`rotate(-23.4 ${LEFT.x} ${LEFT.y})`}>
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
                <g fill="none" stroke="#E0F2FE" strokeOpacity={0.22} strokeWidth={0.18}>
                  <ellipse cx={LEFT.x} cy={LEFT.y} rx={7} ry={1.9} />
                  <ellipse cx={LEFT.x} cy={LEFT.y - 3.7} rx={5.95} ry={1.6} />
                  <ellipse cx={LEFT.x} cy={LEFT.y + 3.7} rx={5.95} ry={1.6} />
                  <ellipse cx={LEFT.x} cy={LEFT.y} rx={3.6} ry={7} />
                  <line x1={LEFT.x} y1={LEFT.y - 7} x2={LEFT.x} y2={LEFT.y + 7} />
                </g>
              </g>
              <circle cx={LEFT.x} cy={LEFT.y} r={7} fill={`url(#earthnight-${uid})`} />
              <circle cx={LEFT.x + 2.4} cy={LEFT.y - 2.4} r={2.8} fill={`url(#spec-${uid})`} />
            </g>
            <circle cx={LEFT.x} cy={LEFT.y} r={7.4} fill="none" stroke="#93C5FD" strokeOpacity={0.45} strokeWidth={0.5} />
            {/* Meridian ring and pole pins, like a desk globe */}
            <path d={`M ${poleN[0].toFixed(2)} ${poleN[1].toFixed(2)} A 8.5 8.5 0 0 0 ${poleS[0].toFixed(2)} ${poleS[1].toFixed(2)}`}
              fill="none" stroke={GOLD} strokeWidth={0.85} strokeLinecap="round" />
            <circle cx={poleN[0]} cy={poleN[1]} r={0.7} fill={GOLD} />
            <circle cx={poleS[0]} cy={poleS[1]} r={0.7} fill={GOLD} />
          </g>

          {/* The sun: a brilliant-cut fancy-yellow diamond at the heart of the orrery */}
          <circle cx={C} cy={C} r={13} fill={`url(#corona-${uid})`} opacity={0.25 + sky.glow * 0.65}
            className="sko-anim animate-pulse" style={{ animationDuration: "3.2s" }} />
          <g className="sko-anim" style={spin("sko-spin 30s linear infinite", C, C)} opacity={0.3 + sky.glow * 0.6}>
            {Array.from({ length: 16 }, (_, i) => {
              const a = i * 22.5;
              return <polygon key={i} points={pts(at(6.3, a - 3.5), at(i % 2 ? 8.4 : 10.2, a), at(6.3, a + 3.5))} fill={sky.sun} />;
            })}
          </g>
          <g className="sko-anim" style={spin("sko-spin-rev 40s linear infinite", C, C)}>
            <circle cx={C} cy={C} r={GEM_R + 0.65} fill={rg} />
            {[30, 90, 150, 210, 270, 330].map((a) => {
              const [x, y] = at(GEM_R + 0.35, a);
              return <circle key={a} cx={x} cy={y} r={0.8} fill={rg} stroke={GOLD_DEEP} strokeOpacity={0.5} strokeWidth={0.12} />;
            })}
            <circle cx={C} cy={C} r={GEM_R} fill={lume ? LUME : `url(#sun-${uid})`} fillOpacity={lume ? 0.85 : 1} filter={glow} />
            {GEM_FACETS.map((f, i) => {
              const b = facing(f.angle);
              const v = 2 * b - 1;
              const [wo, ko] = FACET_WEIGHT[f.kind];
              const fire = f.kind === "girdle" && b > 0.82 ? ((b - 0.82) / 0.18) * 0.7 : 0;
              return (
                <g key={i}>
                  <polygon points={f.d} fill={v > 0 ? "#fff" : "#000"} fillOpacity={v > 0 ? v * wo : -v * ko}
                    stroke="#fff" strokeOpacity={0.22} strokeWidth={0.1} strokeLinejoin="round" />
                  {!lume && fire > 0 && <polygon points={f.d} fill={`hsl(${Math.round(f.angle * 4) % 360} 95% 68%)`} fillOpacity={fire} />}
                </g>
              );
            })}
            <polygon points={GEM_TABLE} fill={lume ? LUME : `url(#sun-${uid})`} fillOpacity={0.9}
              stroke="#fff" strokeOpacity={0.35} strokeWidth={0.12} />
            <polygon points={GEM_TABLE} fill="#fff" fillOpacity={0.12 + 0.3 * facing(315)} />
          </g>
          {!lume && (
            <g transform={`translate(${C - 2.2} ${C - 2.6})`}>
              <path d={GLINT} fill="#fff" filter={`url(#lume-${uid})`}
                className="sko-anim" style={{ ...spin("sko-glint 3.8s ease-in-out 0.6s infinite"), opacity: 0 }} />
            </g>
          )}
        </g>

        {/* ── Domed sapphire glare, sliding against the tilt ── */}
        <g style={depth(-3.2)}>
          <path d={`M ${C - 50} ${C} A 50 50 0 0 1 ${C + 35} ${C - 36} Q ${C - 5} ${C - 30} ${C - 50} ${C}`} fill={`url(#dome-${uid})`} />
          <ellipse cx={C + 27} cy={C + 31} rx={9} ry={2.2} transform={`rotate(-42 ${C + 27} ${C + 31})`} fill="#fff" fillOpacity={0.08} />
          {/* …and the glass catches the flash */}
          {lightning && !lume && (
            <path d={`M ${C - 50} ${C} A 50 50 0 0 1 ${C + 35} ${C - 36} Q ${C - 5} ${C - 30} ${C - 50} ${C}`} fill="#fff"
              style={{ opacity: "calc(var(--strike, 0) * 0.35)" }} />
          )}
        </g>
        {/* Raindrops beaded on the crystal; some slide down */}
        {beads > 0 && (
          <g style={depth(-3.2)}>
            {GLASS_DROPS.slice(0, beads).map((b, i) => (
              <g key={i} className={b.slide ? "sko-anim" : undefined}
                style={b.slide ? { animation: `sko-slide ${b.slide.toFixed(1)}s ease-in ${b.delay.toFixed(1)}s infinite` } : undefined}>
                <ellipse cx={b.x} cy={b.y} rx={b.r} ry={b.r * 1.08} fill={`url(#bead-${uid})`} />
                <circle cx={b.x - b.r * 0.35} cy={b.y - b.r * 0.4} r={b.r * 0.22} fill="#fff" fillOpacity={0.8} />
              </g>
            ))}
          </g>
        )}
        <circle cx={C} cy={C} r={52.3} fill="none" stroke={`url(#rim-${uid})`} strokeWidth={1.6} />
      </g>
      <circle cx={C} cy={C} r={DIAL_R} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={1.2} />
    </svg>
  );
}
