import { useEffect, useRef, type RefObject } from "react";
import type { SkyWeather } from "./weather";

// ─── Live rain, snow, hail and lightning behind the card ─────────────────────
// A canvas between the card's sky and its content, drawn like a weather app's
// live background:
//  • rain at every depth — far drops short, faint and slow; near drops long,
//    bright and fast — each a motion-blurred streak slanting with the wind,
//    which gusts in a storm and sweeps the rain through in sheets;
//  • near drops splash where they land: on the watch case and on the day strip;
//  • snow drifting and swaying; hail that bounces off the watch and the strip;
//  • thunderstorms. Each strike has a real anatomy: a faint leader feeling its
//    way down, the blinding return stroke, one to three re-strikes down the
//    same channel, and a fading afterglow. Bolts are thick and fork (and fork
//    again), tapering toward their tips; some come down beside the watch and
//    light up where they land, some crawl along the cloud base above it, some
//    stay hidden inside the cloud. Bolts never cross the card's text: they keep
//    right of the text column and above the forecast line.
//    Every flash lights the cloud deck from within, and distant flickers glow
//    deep in the clouds in between.
// Strike brightness is published as the CSS variable --strike on the card, so
// the dial, its diamonds and the card itself flash in exact step with it.
// It only runs while something is falling, pauses when the card is off
// screen, and draws a single still frame for people who prefer reduced motion.

export interface Strike { id: number; seed: number; bolt: boolean }

interface Props {
  weather: SkyWeather | null;
  night: number;                          // 0 day … 1 night: rain is dimmer in the dark
  watch: RefObject<HTMLElement>;          // drops splash on its case
  ledge: RefObject<HTMLElement>;          // …and on top of the day strip
  text: RefObject<HTMLElement>;           // the text column: bolts keep to its right…
  footer: RefObject<HTMLElement>;         // …and above the forecast line, never behind text
  onStrike: (s: Strike) => void;          // a lightning strike, so the dial can join in
}

/** Where bolts may be drawn: right of the text column, above the forecast line. */
type Zone = { x0: number; x1: number; y1: number };
type Circle = { cx: number; cy: number; r: number };

const CASE_R = 59.4 / 140;   // the case's radius as a share of the watch's width (see WATCH_VIEWBOX)

type Drop = { x: number; y: number; z: number; speed: number };
type Bit = { x: number; y: number; vx: number; vy: number; age: number; life: number; r: number; a: number };
type Flake = { x: number; y: number; z: number; phase: number };
type Stone = { x: number; y: number; vx: number; vy: number; r: number; hits: number };
type Channel = { pts: number[]; w: number; a: number };
type Stroke = { at: number; dur: number; power: number };
type Kind = "ground" | "crawler" | "sheet";
type Bolt = {
  born: number;
  kind: Kind;
  channels: Channel[];
  strokes: Stroke[];
  leader: number;                         // ms the leader takes before the first return stroke
  ends: number;                           // ms after which it has faded out
  impact: [number, number] | null;        // where a ground strike lands
  patch: HTMLCanvasElement | null;        // the piece of cloud it lights up
  at: [number, number];
  r: number;
};
type Flicker = { born: number; dur: number; power: number; twice: boolean; patch: HTMLCanvasElement | null; at: [number, number]; r: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const KIND_LIGHT: Record<Kind, number> = { ground: 1, crawler: 0.85, sheet: 0.65 };
const TAPER = [1, 0.9, 0.78, 0.65];
const FADE = [1, 0.94, 0.84, 0.7];

/** A jagged line from (x0, y0) to (x1, y1) by midpoint displacement: [x, y, x, y, …]. */
function jagged(x0: number, y0: number, x1: number, y1: number, rough: number) {
  let pts = [x0, y0, x1, y1];
  const nx = -(y1 - y0), ny = x1 - x0;                 // displace across the line, not along it
  const nl = Math.hypot(nx, ny) || 1;
  for (let pass = 0; pass < 6; pass++, rough *= 0.55) {
    const next = [pts[0], pts[1]];
    for (let j = 0; j < pts.length - 2; j += 2) {
      const off = (Math.random() - 0.5) * rough;
      next.push((pts[j] + pts[j + 2]) / 2 + (nx / nl) * off, (pts[j + 1] + pts[j + 3]) / 2 + (ny / nl) * off, pts[j + 2], pts[j + 3]);
    }
    pts = next;
  }
  return pts;
}

const inZone = (x: number, y: number, z: Zone) => x >= z.x0 && x <= z.x1 && y <= z.y1;

/** The main channel, kept inside the zone: retried with less wander until it fits. */
function fitted(x0: number, y0: number, x1: number, y1: number, rough: number, z: Zone) {
  for (let tries = 0; tries < 8; tries++, rough *= 0.75) {
    const pts = jagged(x0, y0, x1, y1, rough);
    let ok = true;
    for (let i = 0; i < pts.length && ok; i += 2) ok = inZone(pts[i], pts[i + 1], z);
    if (ok) return pts;
  }
  const pts = jagged(x0, y0, x1, y1, rough);
  for (let i = 0; i < pts.length; i += 2) {
    pts[i] = clamp(pts[i], z.x0, z.x1);
    pts[i + 1] = Math.min(pts[i + 1], z.y1);
  }
  return pts;
}

/** A fork that wanders out of the zone simply stops at its edge (or isn't drawn at all). */
function trimmed(pts: number[], z: Zone) {
  for (let i = 0; i < pts.length; i += 2) if (!inZone(pts[i], pts[i + 1], z)) return i >= 6 ? pts.slice(0, i) : null;
  return pts;
}

/** A lightning channel with forks, and forks of forks, each thinner and dimmer — all inside the zone. */
function channel(x0: number, y0: number, x1: number, y1: number, w: number, a: number, depth: number, out: Channel[], z: Zone) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const pts = depth === 0 ? fitted(x0, y0, x1, y1, len * 0.22, z) : trimmed(jagged(x0, y0, x1, y1, len * 0.22), z);
  if (!pts) return;
  out.push({ pts, w, a });
  if (depth >= 2) return;
  const n = pts.length / 2;
  const heading = Math.atan2(x1 - x0, y1 - y0);
  for (let b = depth === 0 ? 2 + Math.floor(Math.random() * 3) : Math.floor(Math.random() * 3); b > 0; b--) {
    const k = Math.floor(rand(0.08, 0.75) * (n - 1)) * 2;
    const ang = heading + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.95);
    const l = len * rand(0.15, 0.4) * (depth ? 0.6 : 1);
    channel(pts[k], pts[k + 1], pts[k] + Math.sin(ang) * l, pts[k + 1] + Math.cos(ang) * l, w * 0.6, a * 0.7, depth + 1, out, z);
  }
}

/** A soft, lumpy cloud deck over the top of the card — what a flash lights up from within. */
function cloudDeck(w: number, h: number, dpr: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext("2d");
  if (!g) return null;
  g.scale(dpr, dpr);
  const puff = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(236,240,255,${a})`);
    grad.addColorStop(0.6, `rgba(226,232,255,${a * 0.4})`);
    grad.addColorStop(1, "rgba(226,232,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const big = Math.max(w, h);
  for (let i = 0; i < 18; i++) puff(rand(-0.1, 1.1) * w, rand(0, 0.35) * h, rand(0.1, 0.22) * big, rand(0.35, 0.6));
  // The lumpy underside of the cloud base catches the most light.
  const base = rand(0.36, 0.46) * h;
  for (let x = -20; x < w + 20; x += rand(14, 28)) puff(x, base + rand(-12, 8), rand(14, 30), rand(0.45, 0.7));
  // Gaps and folds, so it reads as cloud rather than glow…
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) puff(rand(0, 1) * w, rand(0, 0.45) * h, rand(8, 26), rand(0.3, 0.6));
  // …and not much below the cloud base.
  g.globalCompositeOperation = "destination-in";
  g.setTransform(1, 0, 0, 1, 0, 0);
  const fade = g.createLinearGradient(0, 0, 0, c.height);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.5, "rgba(0,0,0,0.85)");
  fade.addColorStop(0.72, "rgba(0,0,0,0)");
  g.fillStyle = fade;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The part of the cloud deck around (x, y), soft-edged: what one flash lights up. */
function litPatch(deck: HTMLCanvasElement | null, x: number, y: number, r: number, dpr: number) {
  if (!deck) return null;
  const size = Math.max(1, Math.ceil(r * 2 * dpr));
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(deck, (x - r) * dpr, (y - r) * dpr, size, size, 0, 0, size, size);
  g.globalCompositeOperation = "destination-in";
  const m = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  m.addColorStop(0, "rgba(0,0,0,1)");
  m.addColorStop(0.6, "rgba(0,0,0,0.6)");
  m.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = m;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * A new strike: a bolt down to the horizon, a crawler along the cloud base, or a
 * flash hidden in the cloud. Bolts stay inside the zone — right of the text,
 * above the forecast line — and mostly come down beside the watch, where
 * they're seen rather than hidden behind it.
 */
function makeBolt(w: number, h: number, now: number, deck: HTMLCanvasElement | null, dpr: number, z: Zone, watch: Circle | null): Bolt {
  const roll = Math.random();
  const kind: Kind = roll < 0.45 ? "ground" : roll < 0.7 ? "crawler" : "sheet";
  const channels: Channel[] = [];
  const zx0 = z.x0 + 12, zx1 = Math.max(z.x0 + 13, z.x1 - 12);
  let x = rand(zx0, zx1), y = rand(0.05, 0.2) * h;
  let impact: [number, number] | null = null;
  if (kind === "ground") {
    // Prefer the open sky either side of the watch.
    const sides: [number, number][] = [];
    if (watch) {
      if (watch.cx - watch.r * 0.7 - zx0 > 6) sides.push([zx0, watch.cx - watch.r * 0.7]);
      if (zx1 - (watch.cx + watch.r * 0.7) > 6) sides.push([watch.cx + watch.r * 0.7, zx1]);
    }
    const [a, b] = sides.length && Math.random() < 0.75 ? sides[Math.floor(Math.random() * sides.length)] : [zx0, zx1];
    x = rand(a, b);
    const gx = clamp(x + rand(-0.5, 0.5) * (b - a) + rand(-15, 15), zx0, zx1);
    const gy = z.y1 - rand(4, 24);
    channel(x, -10, gx, gy, 1, 1, 0, channels, z);
    impact = [gx, gy];
  } else if (kind === "crawler") {
    // Along the band of sky above the watch, from one side of the zone toward the other.
    const top = watch ? watch.cy - watch.r : 0.22 * h;
    y = top > 16 ? rand(4, top - 6) : rand(0.05, 0.22) * h;
    const fromLeft = Math.random() < 0.5;
    const run = (zx1 - zx0) * rand(0.5, 0.9);
    const sx = fromLeft ? zx0 : zx1;
    channel(sx, y, sx + (fromLeft ? run : -run), y + rand(-0.03, 0.06) * h, 0.75, 0.9, 0, channels, z);
    x = sx + (fromLeft ? run : -run) / 2;                // light the middle of its run
  }
  // A faint leader feels its way down (slowly, for a crawler), then return strokes
  // light the channel: one to three, the first the brightest.
  const leader = kind === "ground" ? rand(35, 60) : kind === "crawler" ? rand(140, 220) : 0;
  const strokes: Stroke[] = [];
  let t = leader;
  for (let i = kind === "sheet" ? 1 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3); i > 0; i--) {
    const dur = rand(45, 85);
    strokes.push({ at: t, dur, power: strokes.length ? rand(0.5, 0.9) : 1 });
    t += dur + rand(45, 120);
  }
  const r = Math.max(w, h) * (kind === "sheet" ? 0.45 : 0.55);
  const last = strokes[strokes.length - 1];
  return { born: now, kind, channels, strokes, leader, ends: last.at + last.dur + 500, impact, patch: litPatch(deck, x, y, r, dpr), at: [x, y], r };
}

/** How bright a strike is t ms in: blazing during each stroke, then an afterglow that fades. */
function strikeLight(b: Bolt, t: number) {
  let light = 0, lastEnd = -1, lastPower = 0;
  for (const s of b.strokes) {
    if (t >= s.at && t < s.at + s.dur) light = Math.max(light, s.power * (1 - (0.35 * (t - s.at)) / s.dur));
    else if (t >= s.at + s.dur) { lastEnd = s.at + s.dur; lastPower = s.power; }
  }
  if (lastEnd >= 0) light = Math.max(light, lastPower * 0.3 * Math.exp(-(t - lastEnd) / 170));
  return light;
}

/** Draw the channels, `grow` of the way along, tapering and fading toward their tips. */
function drawChannels(ctx: CanvasRenderingContext2D, channels: Channel[], grow: number, glow: number) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const passes: [number, string][] = [
    [14, `rgba(150,170,255,${0.2 * glow})`],                // the halo
    [6, `rgba(200,212,255,${0.55 * glow})`],                // the glow
    [2.6, `rgba(255,255,255,${Math.min(1, 1.15 * glow)})`], // the white-hot core
  ];
  for (const [width, color] of passes) {
    ctx.strokeStyle = color;
    for (const c of channels) {
      const shown = Math.max(2, Math.ceil((c.pts.length / 2) * grow));
      const seg = Math.ceil(shown / TAPER.length);
      for (let s = 0; s < TAPER.length; s++) {
        const from = s * seg, to = Math.min(shown - 1, (s + 1) * seg);
        if (to <= from) break;
        ctx.globalAlpha = c.a * FADE[s];
        ctx.lineWidth = width * c.w * TAPER[s];
        ctx.beginPath();
        ctx.moveTo(c.pts[from * 2], c.pts[from * 2 + 1]);
        for (let i = from + 1; i <= to; i++) ctx.lineTo(c.pts[i * 2], c.pts[i * 2 + 1]);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** A soft round glow. */
function glowAt(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function WeatherCanvas({ weather, night, watch, ledge, text, footer, onStrike }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The animation reads the latest props from here, so it never has to restart for them.
  const live = useRef({ weather, night, watch, ledge, text, footer, onStrike });
  useEffect(() => { live.current = { weather, night, watch, ledge, text, footer, onStrike }; });
  const active = !!weather && (weather.rain > 0 || weather.snow > 0 || weather.hail > 0 || weather.storm);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!active || !canvas || !ctx) return;
    const host = canvas.parentElement;   // the card: --strike is set here for the dial and overlay
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let w = 0, h = 0, dpr = 1;
    let deck: HTMLCanvasElement | null = null;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      deck = w > 0 && h > 0 ? cloudDeck(w, h, dpr) : null;
    };
    resize();

    // Where the watch case, the day strip and the text are, re-measured a few times a second.
    let circle: Circle | null = null;
    let shelf: { y: number; x0: number; x1: number } | null = null;
    let zone: Zone = { x0: 0, x1: 0, y1: 0 };
    let measured = 0;
    const measure = () => {
      const base = canvas.getBoundingClientRect();
      const { watch: wRef, ledge: lRef, text: tRef, footer: fRef } = live.current;
      const wr = wRef.current?.getBoundingClientRect();
      circle = wr && wr.width > 0
        ? { cx: wr.left - base.left + wr.width / 2, cy: wr.top - base.top + wr.height / 2, r: wr.width * CASE_R }
        : null;
      const lr = lRef.current?.getBoundingClientRect();
      shelf = lr && lr.width > 0 ? { y: lr.top - base.top, x0: lr.left - base.left, x1: lr.right - base.left } : null;
      // Bolts keep right of the text column and above the forecast line (or the day strip).
      const tr = tRef.current?.getBoundingClientRect();
      const fr = (fRef.current ?? lRef.current)?.getBoundingClientRect();
      zone = {
        x0: tr && tr.width > 0 ? tr.right - base.left + 10 : w * 0.45,
        x1: w - 6,
        y1: fr && fr.width > 0 ? fr.top - base.top - (fRef.current ? 8 : 14) : h * 0.75,
      };
    };

    let lastStrike = -1;
    const publish = (v: number) => {
      const r = Math.round(v * 100) / 100;
      if (r !== lastStrike) { host?.style.setProperty("--strike", String(r)); lastStrike = r; }
    };

    const drops: Drop[] = [];
    const bits: Bit[] = [];
    const flakes: Flake[] = [];
    const stones: Stone[] = [];
    const flickers: Flicker[] = [];
    let bolt: Bolt | null = null;
    let nextStrike = performance.now() + rand(1500, 5000);
    let nextFlicker = performance.now() + rand(400, 1500);
    let strikeId = 0;

    const newDrop = (anywhere: boolean): Drop => {
      const z = Math.pow(Math.random(), 1.4);   // more far drops than near ones
      return { x: rand(-0.25 * w, 1.25 * w), y: anywhere ? rand(-h, h) : rand(-60, -10), z, speed: lerp(420, 1150, z) * rand(0.9, 1.1) };
    };
    const newStone = (anywhere: boolean): Stone => ({
      x: rand(-0.1 * w, 1.1 * w), y: anywhere ? rand(-h, 0) : rand(-40, -10), vx: rand(-20, 20), vy: rand(500, 750), r: rand(1.1, 2.1), hits: 0,
    });
    const splash = (x: number, y: number, nx: number, ny: number, z: number) => {
      for (let n = 2 + Math.floor(Math.random() * 3); n > 0; n--) {
        const turn = rand(-1.1, 1.1);
        const dx = nx * Math.cos(turn) - ny * Math.sin(turn);
        const dy = nx * Math.sin(turn) + ny * Math.cos(turn);
        const sp = rand(50, 140) * (0.6 + z * 0.6);
        bits.push({ x, y, vx: dx * sp, vy: dy * sp - rand(20, 60), age: 0, life: rand(0.22, 0.42), r: rand(0.5, 1.1) * (0.7 + z * 0.5), a: 0.6 * z });
      }
    };

    let raf = 0;
    let last = performance.now();
    let visible = true;

    const frame = (now: number) => {
      raf = 0;
      const dt = still ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - measured > 250) { measure(); measured = now; }

      const { weather: wx, night: dark } = live.current;
      const rain = wx?.rain ?? 0;
      const snow = wx?.snow ?? 0;
      const hail = wx?.hail ?? 0;
      const storm = !!wx?.storm && !still;
      const area = (w * h) / (420 * 300);
      // The wind slants everything (+ blows to the right) and gusts in a storm.
      const gust = storm ? Math.sin(now / 1300) * 0.07 + Math.sin(now / 470 + 1.3) * 0.03 : rain > 0.6 ? Math.sin(now / 1700) * 0.03 : 0;
      const tilt = wx ? clamp(wx.windX * wx.wind * 0.5 + gust, -0.5, 0.5) : 0;
      const ux = Math.sin(tilt), uy = Math.cos(tilt);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ── Distant flickers, deep in the cloud ──
      if (storm && now >= nextFlicker) {
        const at: [number, number] = [rand(0, 1) * w, rand(0.04, 0.35) * h];
        const r = rand(50, 110);
        flickers.push({ born: now, dur: rand(140, 320), power: rand(0.18, 0.4), twice: Math.random() < 0.5, patch: litPatch(deck, at[0], at[1], r, dpr), at, r });
        nextFlicker = now + rand(700, 2400);
      }
      for (let i = flickers.length - 1; i >= 0; i--) {
        const f = flickers[i];
        const t = (now - f.born) / f.dur;
        if (t >= 1) { flickers.splice(i, 1); continue; }
        const b = f.power * (1 - 0.5 * t) * (f.twice && t > 0.35 && t < 0.55 ? 0.25 : 1);
        if (f.patch) { ctx.globalAlpha = b; ctx.drawImage(f.patch, f.at[0] - f.r, f.at[1] - f.r, f.r * 2, f.r * 2); }
        ctx.globalAlpha = 1;
        glowAt(ctx, f.at[0], f.at[1], f.r, "214,222,255", 0.25 * b);
      }

      // ── Lightning: lights the cloud deck, then the bolt itself ──
      if (storm && !bolt && now >= nextStrike) {
        bolt = makeBolt(w, h, now, deck, dpr, zone, circle);
        live.current.onStrike({ id: ++strikeId, seed: Math.floor(Math.random() * 1e9), bolt: bolt.channels.length > 0 });
        // Now and then a second cell fires right after the first.
        nextStrike = now + (Math.random() < 0.2 ? rand(1000, 1600) : rand(2500, 8000) * (1.3 - 0.5 * rain));
      }
      if (bolt) {
        const t = now - bolt.born;
        const raw = strikeLight(bolt, t);
        const light = raw * KIND_LIGHT[bolt.kind];
        publish(light);
        if (light > 0.005) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(196,206,255,${0.1 * light})`;          // the whole sky brightens a little
          ctx.fillRect(0, 0, w, h);
          if (deck) { ctx.globalAlpha = 0.35 * light; ctx.drawImage(deck, 0, 0, w, h); }   // the cloud deck, faintly
          if (bolt.patch) {                                            // …and brightly around the strike
            ctx.globalAlpha = Math.min(1, 0.95 * light);
            ctx.drawImage(bolt.patch, bolt.at[0] - bolt.r, bolt.at[1] - bolt.r, bolt.r * 2, bolt.r * 2);
          }
          ctx.globalAlpha = 1;
          glowAt(ctx, bolt.at[0], bolt.at[1], bolt.r * 0.8, "232,236,255", 0.3 * light);
          if (bolt.impact) glowAt(ctx, bolt.impact[0], bolt.impact[1], 40, "226,232,255", 0.45 * light);   // where it lands lights up
        }
        if (bolt.channels.length) {
          const leading = t < bolt.leader;
          const glow = leading ? (bolt.kind === "crawler" ? 0.55 : 0.3) : raw;
          if (glow > 0.01) drawChannels(ctx, bolt.channels, leading ? t / bolt.leader : 1, glow);
        }
        if (t > bolt.ends) { bolt = null; publish(0); }
      }

      // ── Rain ──
      const wantDrops = rain > 0 ? Math.round(lerp(70, 420, rain) * area) : 0;
      if (drops.length < wantDrops) {
        while (drops.length < wantDrops) drops.push(newDrop(true));
        drops.sort((a, b) => a.z - b.z);          // far drops first, near ones on top
      } else if (drops.length > wantDrops) {
        drops.length = wantDrops;
      }
      if (drops.length) {
        const streak = ctx.createLinearGradient(0, 0, 0, 1);   // in each drop's own space: tail → head
        streak.addColorStop(0, "rgba(225,235,255,0)");
        streak.addColorStop(1, "rgba(225,235,255,1)");
        ctx.fillStyle = streak;
        const dim = (1 - 0.35 * dark) * (0.75 + 0.25 * rain);
        const sheets = storm || rain > 0.7;      // heavy rain sweeps through in sheets
        for (const d of drops) {
          const step = d.speed * dt * (0.85 + 0.3 * rain);
          const prevY = d.y;
          d.x += ux * step;
          d.y += uy * step;
          // Near drops land on the watch case or the day strip and splash.
          let landed = false;
          if (d.z > 0.4) {
            if (circle && Math.abs(d.x - circle.cx) < circle.r) {
              const top = circle.cy - Math.sqrt(circle.r ** 2 - (d.x - circle.cx) ** 2);
              if (prevY < top && d.y >= top) {
                splash(d.x, top, (d.x - circle.cx) / circle.r, (top - circle.cy) / circle.r, d.z);
                landed = true;
              }
            }
            if (!landed && shelf && d.z > 0.55 && d.x > shelf.x0 && d.x < shelf.x1 && prevY < shelf.y && d.y >= shelf.y) {
              splash(d.x, shelf.y, 0, -1, d.z);
              landed = true;
            }
          }
          const len = d.speed * 0.03;
          if (landed || d.y - len > h) {
            const fresh = newDrop(false);
            d.x = fresh.x; d.y = fresh.y;
            if (landed) continue;
          }
          const wd = lerp(0.6, 1.5, d.z);
          ctx.globalAlpha = lerp(0.1, 0.42, d.z) * dim * (sheets ? 0.65 + 0.35 * Math.sin(d.x * 0.012 - now / 380) : 1);
          ctx.setTransform(uy * wd * dpr, -ux * wd * dpr, ux * len * dpr, uy * len * dpr, (d.x - ux * len) * dpr, (d.y - uy * len) * dpr);
          ctx.fillRect(-0.5, 0, 1, 1);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // ── Splashes ──
      if (bits.length) {
        ctx.fillStyle = "rgb(228,238,255)";
        for (let i = bits.length - 1; i >= 0; i--) {
          const b = bits[i];
          b.age += dt;
          if (b.age >= b.life) { bits.splice(i, 1); continue; }
          b.vy += 900 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          ctx.globalAlpha = b.a * (1 - b.age / b.life) * (1 - 0.3 * dark);
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Hail: ice pellets that bounce off the watch and the day strip ──
      const wantStones = hail > 0 ? Math.round(lerp(14, 60, hail) * area) : 0;
      while (stones.length < wantStones) stones.push(newStone(true));
      if (stones.length > wantStones) stones.length = wantStones;
      if (stones.length) {
        for (const s of stones) {
          const prevY = s.y;
          s.vy += 1400 * dt;
          s.x += (s.vx + ux * 160) * dt;
          s.y += s.vy * dt;
          if (circle) {
            const dx = s.x - circle.cx, dy = s.y - circle.cy;
            const dist = Math.hypot(dx, dy);
            const vn = dist > 0 ? (s.vx * dx + s.vy * dy) / dist : 0;
            if (dist < circle.r + s.r && dist > 0 && vn < 0) {
              const nx = dx / dist, ny = dy / dist;
              s.vx -= 1.4 * vn * nx;              // bounce, losing most of the speed
              s.vy -= 1.4 * vn * ny;
              s.vx += rand(-30, 30);
              s.x = circle.cx + nx * (circle.r + s.r);
              s.y = circle.cy + ny * (circle.r + s.r);
              s.hits++;
            }
          }
          if (shelf && s.vy > 0 && prevY < shelf.y && s.y >= shelf.y && s.x > shelf.x0 && s.x < shelf.x1) {
            s.vy *= -0.4;
            s.y = shelf.y - 0.5;
            s.vx += rand(-40, 40);
            s.hits++;
          }
          if (s.y > h + 10 || s.x < -0.2 * w || s.x > 1.2 * w || s.hits > 3) Object.assign(s, newStone(false));
          ctx.globalAlpha = 0.9 * (1 - 0.25 * dark);
          ctx.fillStyle = "rgb(236,243,255)";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha *= 0.8;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Snow ──
      const wantFlakes = snow > 0 ? Math.round(lerp(40, 220, snow) * area) : 0;
      while (flakes.length < wantFlakes) flakes.push({ x: rand(-0.1 * w, 1.1 * w), y: rand(-h, h), z: Math.random(), phase: rand(0, Math.PI * 2) });
      if (flakes.length > wantFlakes) flakes.length = wantFlakes;
      if (flakes.length) {
        ctx.fillStyle = "#fff";
        for (const f of flakes) {
          const speed = lerp(18, 60, f.z);
          f.y += speed * dt;
          f.x += (ux * speed * 0.8 + Math.cos(now / 900 + f.phase) * lerp(6, 16, f.z)) * dt;
          if (f.y > h + 4) { f.y = rand(-20, -4); f.x = rand(-0.1 * w, 1.1 * w); }
          const r = lerp(0.7, 2.4, f.z);
          ctx.globalAlpha = lerp(0.35, 0.9, f.z) * (1 - 0.25 * dark);
          ctx.beginPath();
          ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
          ctx.fill();
          if (f.z > 0.7) {
            ctx.globalAlpha *= 0.25;
            ctx.beginPath();
            ctx.arc(f.x, f.y, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      if (!still && visible) raf = requestAnimationFrame(frame);
    };

    // Resizing clears the canvas, so the still frame is drawn again.
    const ro = new ResizeObserver(() => { resize(); measure(); if (still) frame(performance.now()); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && !still) { last = performance.now(); raf = requestAnimationFrame(frame); }
    });
    io.observe(canvas);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host?.style.removeProperty("--strike");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
