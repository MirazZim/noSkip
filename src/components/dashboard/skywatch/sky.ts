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
export const mixHex = (a: string, b: string, t: number) => {
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

// ── The sun in the sky, for the dial's all-sky view ──────────────────────────
// A mid-latitude sky at the equinox, so the sun rises due east at 6:00, crosses
// the south at noon and sets due west at 18:00 (matching SUNRISE / SUNSET).
const LATITUDE = 24;
const RAD = Math.PI / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Sun altitude above the horizon and azimuth (0 = north, 90 = east), in degrees. */
export function sunPosition(minute: number): { alt: number; az: number } {
  const h = ((mod(minute, 1440) - 720) / 1440) * 2 * Math.PI;   // hour angle
  const phi = LATITUDE * RAD;
  const alt = Math.asin(Math.cos(phi) * Math.cos(h)) / RAD;
  const az = mod(Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi)) / RAD + 180, 360);
  return { alt, az };
}

export interface Atmosphere {
  zenith: string;     // straight up: the dial's centre
  mid: string;
  horizon: string;    // the dial's rim
  /** The sun on an all-sky view (looking up, north at the top, east on the left):
   *  a unit disc whose edge is the horizon; beyond 1 once the sun has set. */
  sun: { x: number; y: number };
  day: number;        // 0..1 — the sun is up (drives the halo around it)
  twilight: number;   // 0..1 — sunrise / sunset glow on the sun's side of the horizon
  cloudLit: string;   // sunlit side of the clouds
  cloudShade: string; // their shadowed undersides
  lightAz: number;    // light direction for shading the clouds (SVG feDistantLight)
  lightEl: number;
}

// Sky colour overhead and at the horizon by the sun's altitude. The sky stays
// blue overhead through sunrise and sunset — the warm colours come from the
// glow on the sun's side (drawn separately), not from tinting the whole dome.
const SKY_BY_ALT: { alt: number; zenith: string; horizon: string }[] = [
  { alt: -90, zenith: "#02040F", horizon: "#0E1533" },
  { alt: -18, zenith: "#02040F", horizon: "#0E1533" },   // astronomical night
  { alt: -12, zenith: "#0A1030", horizon: "#1F2A5C" },   // nautical twilight
  { alt: -6, zenith: "#1A2456", horizon: "#4A4F8F" },    // blue hour
  { alt: -1, zenith: "#2A3F84", horizon: "#9A93C4" },
  { alt: 4, zenith: "#2E5AA6", horizon: "#C9D9EE" },     // golden hour
  { alt: 15, zenith: "#1F5FB5", horizon: "#B5DAFB" },
  { alt: 40, zenith: "#1458B8", horizon: "#A6D4FF" },
  { alt: 90, zenith: "#0F55B8", horizon: "#9ED0FF" },
];

function skyByAltitude(alt: number) {
  let i = 0;
  while (i < SKY_BY_ALT.length - 2 && SKY_BY_ALT[i + 1].alt <= alt) i++;
  const a = SKY_BY_ALT[i], b = SKY_BY_ALT[i + 1];
  const t = clamp01((alt - a.alt) / (b.alt - a.alt));
  return { zenith: mixHex(a.zenith, b.zenith, t), horizon: mixHex(a.horizon, b.horizon, t) };
}

/** Everything the dial needs to paint a believable sky at a minute of the day. */
export function atmosphere(minute: number): Atmosphere {
  const { alt, az } = sunPosition(minute);
  const r = (90 - alt) / 90;
  const sun = { x: -Math.sin(az * RAD) * r, y: -Math.cos(az * RAD) * r };
  const day = clamp01(alt / 12);
  const twilight = clamp01(1 - Math.abs(alt + 2) / 14);
  const { zenith, horizon } = skyByAltitude(alt);
  return {
    zenith,
    mid: mixHex(zenith, horizon, 0.45),
    horizon,
    sun,
    day,
    twilight,
    cloudLit: mixHex("#FFFFFF", "#FFB27A", twilight * 0.85),
    cloudShade: mixHex("#AEB9CB", "#6B4E7A", twilight),
    lightAz: Math.atan2(sun.y, sun.x) / RAD,
    lightEl: Math.max(4, Math.min(60, alt)),
  };
}

/** The card's greeting for the hour it is now. */
export function greetingAt(d: Date) {
  const h = d.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

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

// Star colours by temperature, hot blue-white to cool orange, and how common each is.
const STAR_COLOURS: [string, number][] = [
  ["#A9BFFF", 0.08], ["#CAD7FF", 0.17], ["#F2F4FF", 0.35], ["#FFF6EA", 0.22], ["#FFE2B8", 0.12], ["#FFC58A", 0.06],
];

/** A deterministic star field across the dial (120×120 space). `b` is brightness 0..1 —
 *  most stars are faint, a few are bright, so they come out in that order at dusk. */
export const STAR_FIELD = (() => {
  let seed = 23;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number; r: number; b: number; color: string; tw: number; d: number }[] = [];
  while (out.length < 160) {
    const x = 6 + rnd() * 108, y = 6 + rnd() * 108;
    if ((x - 60) ** 2 + (y - 60) ** 2 >= 52 ** 2) continue;
    const b = Math.pow(rnd(), 3.2);
    let pick = rnd(), color = STAR_COLOURS[0][0];
    for (const [c, w] of STAR_COLOURS) { if ((pick -= w) <= 0) { color = c; break; } }
    out.push({ x, y, r: 0.2 + b * 0.75, b, color, tw: 2 + rnd() * 3, d: rnd() * 4 });
  }
  return out;
})();

/** How visible a star of brightness `b` is when the sky shows `stars` (0..1). */
export const starVisibility = (b: number, stars: number) => clamp01((stars * 1.25 - (1 - b)) * 2.5);

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
@keyframes sko-scint { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes sko-rain { from { transform: translateY(0); } to { transform: translateY(150px); } }
@keyframes sko-snow {
  0% { transform: translate(0, 0); }
  25% { transform: translate(2px, 37px); }
  50% { transform: translate(-1.5px, 75px); }
  75% { transform: translate(2px, 112px); }
  100% { transform: translate(0, 150px); }
}
@keyframes sko-slide {
  0% { transform: translateY(0); opacity: 0; }
  12% { opacity: 1; }
  70% { transform: translateY(12px); opacity: 1; }
  100% { transform: translateY(20px); opacity: 0; }
}
@keyframes sko-fog { from { transform: translateX(-8px); } to { transform: translateX(8px); } }
@keyframes sko-glint {
  0%, 70%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
  80% { transform: scale(1) rotate(45deg); opacity: 1; }
  90% { transform: scale(0.2) rotate(90deg); opacity: 0; }
}
@keyframes sko-sweep {
  0% { transform: rotate(-30deg); opacity: 0; }
  8%, 47% { opacity: 1; }
  55%, 100% { transform: rotate(330deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .sko-anim { animation: none !important; } }
`;
