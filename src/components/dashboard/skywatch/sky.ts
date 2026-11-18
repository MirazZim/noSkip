// Sky model for the dashboard's sky watch: continuous time-of-day colours,
// where the sun / moon sit, the real moon phase, and the star furniture.
// Pure (no React) so it can be unit-tested.

export const SUNRISE = 6 * 60;   // nominal sunrise, minutes after midnight
export const SUNSET = 18 * 60;   // nominal sunset
export const LUME = "#7CFFB2";
/** Watch drawing space: a 120×120 case centred at (60, 60), with room either side for the crown and slide. */
export const WATCH_VIEWBOX = "-10 0 140 120";

const mod = (n: number, m: number) => ((n % m) + m) % m;

interface SkyKey {
  m: number;        // minute of day
  light: string;    // dial centre / lower sky
  deep: string;     // dial edge / zenith
  alpha: number;    // strength of the card's sky wash
  stars: number;    // 0..1
  sun: string;      // sun tint
  glow: number;     // sun brightness 0..1
}

// Hand-tuned keyframes through the day; everything in between is interpolated,
// so the sky drifts continuously instead of jumping between a few phases.
const KEYS: SkyKey[] = [
  { m: 0,    light: "#1B2556", deep: "#02040F", alpha: 0.45, stars: 1,    sun: "#FDBA74", glow: 0.3 },  // night
  { m: 270,  light: "#1B2556", deep: "#02040F", alpha: 0.45, stars: 1,    sun: "#FDBA74", glow: 0.3 },
  { m: 330,  light: "#3B4A8C", deep: "#0B1030", alpha: 0.4,  stars: 0.7,  sun: "#FDBA74", glow: 0.4 },  // blue hour
  { m: 375,  light: "#FFB36B", deep: "#5B2A5E", alpha: 0.38, stars: 0.25, sun: "#FFB340", glow: 0.8 },  // sunrise
  { m: 450,  light: "#9FD3FF", deep: "#2C5FA8", alpha: 0.3,  stars: 0.08, sun: "#FFD27A", glow: 0.95 }, // morning
  { m: 720,  light: "#7EC8FF", deep: "#0F4C9C", alpha: 0.28, stars: 0.04, sun: "#FFE066", glow: 1 },    // noon
  { m: 990,  light: "#FFD08A", deep: "#2F5C9E", alpha: 0.3,  stars: 0.06, sun: "#FFC24D", glow: 1 },    // golden afternoon
  { m: 1080, light: "#FF8A5C", deep: "#4A1F55", alpha: 0.36, stars: 0.3,  sun: "#FF7A45", glow: 0.85 }, // sunset
  { m: 1125, light: "#B57CFF", deep: "#1E1040", alpha: 0.4,  stars: 0.65, sun: "#FF8A3D", glow: 0.5 },  // dusk
  { m: 1200, light: "#22306A", deep: "#03061A", alpha: 0.45, stars: 1,    sun: "#FDBA74", glow: 0.3 },  // night
  { m: 1440, light: "#1B2556", deep: "#02040F", alpha: 0.45, stars: 1,    sun: "#FDBA74", glow: 0.3 },
];

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mixHex = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, "0")).join("");
};
const rgb = (h: string) => hex(h).join(", ");

export interface Sky {
  light: string;
  deep: string;
  cardBg: string;   // CSS gradient for the card behind the watch
  stars: number;    // 0..1
  clouds: number;   // 0..1, daytime only
  sun: string;
  glow: number;
  dark: boolean;    // dark enough for shooting stars and city lights
}

/** The sky at a minute of the day (any number; wraps around midnight). */
export function skyAt(minute: number): Sky {
  const m = mod(minute, 1440);
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].m <= m) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = (m - a.m) / (b.m - a.m);
  const light = mixHex(a.light, b.light, t);
  const deep = mixHex(a.deep, b.deep, t);
  const alpha = lerp(a.alpha, b.alpha, t);
  const stars = lerp(a.stars, b.stars, t);
  return {
    light,
    deep,
    cardBg:
      `linear-gradient(180deg, rgba(${rgb(deep)}, ${alpha.toFixed(3)}) 0%, ` +
      `rgba(${rgb(light)}, ${(alpha * 0.55).toFixed(3)}) 58%, rgba(${rgb(light)}, ${(alpha * 0.2).toFixed(3)}) 100%)`,
    stars,
    clouds: Math.max(0, Math.min(1, (0.6 - stars) / 0.55)),
    sun: mixHex(a.sun, b.sun, t),
    glow: lerp(a.glow, b.glow, t),
    dark: stars >= 0.6,
  };
}

/** The whole day's sky as a horizontal gradient (for the timeline). */
export const DAY_SPECTRUM = `linear-gradient(90deg, ${KEYS.map((k) => `${k.light} ${(k.m / 14.4).toFixed(2)}%`).join(", ")})`;

/** Where the sun (by day) or moon (by night) is on its arc: p runs 0 → 1, rise → set. */
export function celestial(minute: number): { isSun: boolean; p: number } {
  const m = mod(minute, 1440);
  if (m >= SUNRISE && m < SUNSET) return { isSun: true, p: (m - SUNRISE) / (SUNSET - SUNRISE) };
  return { isSun: false, p: mod(m - SUNSET, 1440) / (1440 - (SUNSET - SUNRISE)) };
}

// ── Real moon phase (0 = new, 0.5 = full), from a known new moon ──────────────
const SYNODIC_DAYS = 29.530588853;
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export function moonPhase(d: Date) {
  const days = (d.getTime() - KNOWN_NEW_MOON) / 86_400_000;
  return mod(days, SYNODIC_DAYS) / SYNODIC_DAYS;
}

export function moonName(p: number): [string, string] {
  if (p < 0.03 || p > 0.97) return ["🌑", "New moon"];
  if (p < 0.22) return ["🌒", "Waxing crescent"];
  if (p < 0.28) return ["🌓", "First quarter"];
  if (p < 0.47) return ["🌔", "Waxing gibbous"];
  if (p < 0.53) return ["🌕", "Full moon"];
  if (p < 0.72) return ["🌖", "Waning gibbous"];
  if (p < 0.78) return ["🌗", "Last quarter"];
  return ["🌘", "Waning crescent"];
}

/** Lit part of a moon disc: the limb arc plus an elliptical terminator. */
export function moonLitPath(cx: number, cy: number, r: number, p: number) {
  const waxing = p < 0.5;
  const k = Math.cos(p * 2 * Math.PI);           // 1 new → 0 quarter → −1 full
  const rx = Math.max(0.01, Math.abs(k) * r);
  const limb = waxing ? 1 : 0;
  const term = waxing ? (k > 0 ? 0 : 1) : (k > 0 ? 1 : 0);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${limb} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${term} ${cx} ${cy - r} Z`;
}

// ── Star furniture ────────────────────────────────────────────────────────────

/** Deterministic "aventurine" sparkle across the dial (120×120 space). */
export const DIAL_STARS = (() => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number; r: number; d: number }[] = [];
  while (out.length < 70) {
    const x = 8 + rnd() * 104, y = 8 + rnd() * 104;
    if ((x - 60) ** 2 + (y - 60) ** 2 < 50 ** 2) out.push({ x, y, r: rnd() < 0.15 ? 0.8 : 0.35, d: rnd() * 3 });
  }
  return out;
})();

/** Constellations as offsets from the dial centre: stars + the lines joining them. */
export const CONSTELLATIONS: { stars: [number, number][]; lines: [number, number][] }[] = [
  { // Big Dipper
    stars: [[-38, -14], [-31, -19], [-24, -18], [-18, -14], [-17, -6], [-9, -4], [-10, -12]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  { // Orion
    stars: [[14, 14], [27, 12], [18, 22], [21, 23], [24, 24], [28, 35], [15, 33]],
    lines: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 6], [4, 5], [0, 1]],
  },
  { // Cassiopeia
    stars: [[-2, -42], [5, -36], [11, -41], [17, -34], [24, -39]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
];

/** Stars over the card itself (percent positions). */
export const CARD_STARS = [
  { x: 6, y: 10, s: 1.5, d: 0 }, { x: 14, y: 22, s: 2, d: 0.7 }, { x: 22, y: 6, s: 1.5, d: 1.4 },
  { x: 31, y: 16, s: 1, d: 0.2 }, { x: 38, y: 30, s: 1.5, d: 1.9 }, { x: 46, y: 9, s: 2, d: 0.9 },
  { x: 53, y: 24, s: 1, d: 1.2 }, { x: 61, y: 5, s: 1.5, d: 0.4 }, { x: 68, y: 18, s: 1, d: 2.1 },
  { x: 74, y: 8, s: 2, d: 1.6 }, { x: 81, y: 27, s: 1.5, d: 0.6 }, { x: 88, y: 12, s: 1, d: 1.8 },
  { x: 94, y: 22, s: 1.5, d: 0.3 }, { x: 10, y: 40, s: 1, d: 1.1 }, { x: 58, y: 40, s: 1, d: 2.4 },
  { x: 90, y: 42, s: 1, d: 0.8 },
];

/** Drifting daytime clouds over the card. */
export const CLOUDS = [
  { top: "12%", w: 130, h: 30, dur: 80, delay: -12 },
  { top: "30%", w: 90, h: 22, dur: 110, delay: -60 },
  { top: "6%", w: 70, h: 18, dur: 140, delay: -95 },
];

/** Windows on the skyline that light up after dark (220×40 hill space). */
export const CITY_LIGHTS: [number, number][] = [
  [18, 35], [24, 36.5], [41, 34], [58, 33.5], [63, 35.5], [96, 31],
  [101, 33], [128, 30], [149, 33], [154, 34.5], [181, 35], [203, 32.5],
];

// ── Keyframes shared by every part of the watch and card ─────────────────────
export const SKYWATCH_CSS = `
@keyframes sko-spin { to { transform: rotate(360deg); } }
@keyframes sko-spin-rev { to { transform: rotate(-360deg); } }
@keyframes sko-drift { from { transform: translateX(0); } to { transform: translateX(-16px); } }
@keyframes sko-flipx { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(-1); } }
@keyframes sko-flipy { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(-1); } }
@keyframes sko-shoot {
  0% { transform: translate(0, 0); opacity: 0; }
  1.5% { opacity: 1; }
  7% { transform: translate(-46px, 26px); opacity: 0; }
  100% { transform: translate(-46px, 26px); opacity: 0; }
}
@keyframes sko-card-shoot {
  0% { transform: translate(0, 0) rotate(-28deg); opacity: 0; }
  2% { opacity: 1; }
  9% { transform: translate(-180px, 96px) rotate(-28deg); opacity: 0; }
  100% { transform: translate(-180px, 96px) rotate(-28deg); opacity: 0; }
}
@keyframes sko-wave { from { transform: scale(0.15); opacity: 0.75; } to { transform: scale(1); opacity: 0; } }
@keyframes sko-flash { from { stroke-opacity: 0.9; } to { stroke-opacity: 0; } }
@keyframes sko-ignite {
  0% { transform: scale(0.6); opacity: 0; }
  10% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(4); opacity: 0; }
}
@keyframes sko-aurora {
  0%, 100% { transform: translateX(-5px) scaleY(0.9); opacity: 0.65; }
  50% { transform: translateX(5px) scaleY(1.12); opacity: 1; }
}
@keyframes sko-balance { from { transform: rotate(-150deg); } to { transform: rotate(150deg); } }
@keyframes sko-pallet { from { transform: rotate(-9deg); } to { transform: rotate(9deg); } }
@keyframes sko-hammer { 0% { transform: rotate(0deg); } 35% { transform: rotate(10deg); } 100% { transform: rotate(0deg); } }
@keyframes sko-lume { from { filter: brightness(1.3) saturate(1.25); } to { filter: brightness(0.82) saturate(0.9); } }
@keyframes sko-cloud { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
@keyframes sko-twinkle { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .sko-anim { animation: none !important; } }
`;
