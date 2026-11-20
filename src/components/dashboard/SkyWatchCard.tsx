import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Bell, BellRing, Cog, RotateCcw, Sparkles } from "lucide-react";
import { Widget } from "@/components/dashboard/Widget";
import { MAC } from "@/lib/macColors";
import { cn } from "@/lib/utils";
import { LUME, SKYWATCH_CSS, greetingAt, moonName, moonPhase, skyAt } from "./skywatch/sky";
import { useRepeater } from "./skywatch/repeater";
import { Dial, type Burst, type HabitPlanet } from "./skywatch/Dial";
import { Caseback } from "./skywatch/Caseback";
import { CardSky } from "./skywatch/CardSky";
import { RollingTime } from "./skywatch/RollingTime";
import { DayTimeline } from "./skywatch/DayTimeline";
import { forecastSummary, weatherAt } from "./skywatch/weather";
import { WeatherCanvas, type Strike } from "./skywatch/WeatherCanvas";
import { useForecast } from "@/hooks/useWeather";

export type { HabitPlanet } from "./skywatch/Dial";

// ─── SKY WATCH CARD ───────────────────────────────────────────────────────────
// The dashboard's hero card: a living sky with an astronomical watch on it.
//  • Drag around the dial (or along the day strip, or use the arrow keys) to
//    travel through today — the crown pulls out, the sky, sun and stars follow,
//    and the time rolls; let go and it glides back to now.
//  • 🔔 plays a real minute repeater: the hours, quarters and minutes in bells.
//  • ✦ lume: a glow-in-the-dark dial that slowly fades, like real lume.
//  • ⚙ turns the watch over to show the movement, engraved for you.
//  • Habits orbit as planets; finish them all and an aurora lights the dial.
//  • With a weather city set in Settings, the sky shows that city's real
//    weather — and travelling through the day shows that hour's forecast.
//    Rain falls behind the card and splashes on the watch; storms throw
//    lightning that flashes the dial too; a line sums up the rest of the day.

const MemoDial = memo(Dial);
const MemoCaseback = memo(Caseback);

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
const alphaHex = (a: number) => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
const fmtOffset = (o: number) => {
  const a = Math.round(Math.abs(o));
  const h = Math.floor(a / 60), m = a % 60;
  return `${o < 0 ? "−" : "+"}${h ? `${h}h ` : ""}${m}m`;
};

/** The current time, ticking on each whole second. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    id = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(id);
  }, []);
  return now;
}

/** Planets "ignite" as habits get done: one by one when the card opens, then live. */
function usePlanetBursts(habits: HabitPlanet[]): Burst[] {
  const doneKey = habits.filter((h) => h.done).map((h) => h.id).join(",");
  const prev = useRef<Set<string> | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  useEffect(() => {
    const done = new Set(doneKey ? doneKey.split(",") : []);
    const first = prev.current === null;
    const before = prev.current ?? new Set<string>();
    prev.current = done;
    const fresh = [...done].filter((id) => !before.has(id));
    if (!fresh.length) return;
    const stamp = Date.now();
    const added = fresh.map((id, i) => ({ id, key: stamp + i, delay: first ? 500 + i * 180 : 0 }));
    setBursts((b) => [...b, ...added]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => !added.includes(x))), added[added.length - 1].delay + 1500);
  }, [doneKey]);
  return bursts;
}

function Ctl({ label, active, glow, onClick, children }: { label: string; active: boolean; glow: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full transition-all duration-200 [&>svg]:h-3.5 [&>svg]:w-3.5",
        active ? "text-black" : "bg-foreground/[0.07] text-foreground/80 hover:bg-foreground/[0.12] hover:text-foreground"
      )}
      style={active ? { background: glow, boxShadow: `0 0 12px ${glow}88` } : undefined}
    >
      {children}
    </button>
  );
}

export function DayCard({
  name, habits, bestStreak, since, delay = 0,
}: {
  name: string;
  habits: HabitPlanet[];
  bestStreak: number;
  since: string | null;      // earliest habit start date (yyyy-MM-dd)
  delay?: number;
}) {
  const now = useNow();
  const realMinute = minutesOf(now);
  const [offset, setOffset] = useState(0);          // minutes travelled away from now
  const [scrubbing, setScrubbing] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });  // watch tilt, −1..1
  const [par, setPar] = useState({ x: 0, y: 0 });    // card parallax, −1..1
  const [lume, setLume] = useState(false);
  const [lumeKey, setLumeKey] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const repeater = useRepeater();
  const bursts = usePlanetBursts(habits);
  const { data: forecast } = useForecast();
  const watchRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);         // lightning keeps clear of the text…
  const summaryRef = useRef<HTMLParagraphElement>(null); // …and of the forecast line
  const [lightning, setLightning] = useState<Strike | null>(null);

  // The carriage angle follows real seconds but counts up from when the card
  // opened, so it never spins backwards at midnight.
  const [base] = useState(() => ({ epoch: Math.floor(Date.now() / 1000), sec: new Date().getSeconds() }));
  const carriage = (Math.floor(now.getTime() / 1000) - base.epoch + base.sec) * 6;

  const t = realMinute + offset;                       // the minute being shown
  const shown = new Date(now.getTime() + offset * 60_000);
  const sky = useMemo(() => skyAt(t), [t]);
  const moon = moonPhase(shown);
  const [moonEmoji, moonLabel] = moonName(moon);
  const habitsLeft = habits.filter((h) => !h.done).length;
  const allDone = habits.length > 0 && habitsLeft === 0;
  const shifted = Math.abs(offset) >= 1;
  const timeLabel = shown.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const weather = forecast ? weatherAt(forecast, shown.getTime(), now.getTime()) : null;
  const summary = forecast ? forecastSummary(forecast, now.getTime()) : null;
  const greeting = greetingAt(now);   // from the card's own ticking clock, so it changes on the hour

  // ── Time travel ──────────────────────────────────────────────────────────
  const offsetRef = useRef(0);
  const realRef = useRef(realMinute);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { realRef.current = realMinute; }, [realMinute]);

  const timers = useRef<{ back?: number; raf?: number; strike?: number }>({});
  useEffect(() => {
    const tm = timers.current;
    return () => {
      window.clearTimeout(tm.back);
      window.clearTimeout(tm.strike);
      if (tm.raf) cancelAnimationFrame(tm.raf);
    };
  }, []);

  // A lightning strike in the card's storm: the dial mounts its strike layers
  // (their brightness follows --strike frame by frame), then drops them once
  // the strike — leader, re-strikes and afterglow — is over.
  const onStrike = (s: Strike) => {
    setLightning(s);
    window.clearTimeout(timers.current.strike);
    timers.current.strike = window.setTimeout(() => setLightning(null), 1500);
  };

  const cancelReturn = () => {
    window.clearTimeout(timers.current.back);
    if (timers.current.raf) cancelAnimationFrame(timers.current.raf);
  };
  const glideToNow = () => {
    cancelReturn();
    const from = offsetRef.current;
    if (Math.abs(from) < 0.01) return;
    const start = performance.now();
    const step = (ts: number) => {
      const k = Math.min(1, (ts - start) / 900);
      setOffset(from * Math.pow(1 - k, 3));
      if (k < 1) timers.current.raf = requestAnimationFrame(step);
    };
    timers.current.raf = requestAnimationFrame(step);
  };
  // Keep the shown time inside today.
  const clampOffset = (o: number) => Math.max(-realRef.current, Math.min(1439.9 - realRef.current, o));
  const beginScrub = () => { cancelReturn(); setScrubbing(true); };
  const endScrub = () => {
    setScrubbing(false);
    window.clearTimeout(timers.current.back);
    timers.current.back = window.setTimeout(glideToNow, 3500);
  };

  // ── Watch gestures: drag around the dial = travel (1° = 1 minute), tap = lume ──
  const drag = useRef<{ startOffset: number; last: number; acc: number; moved: boolean } | null>(null);
  const angleAt = (el: HTMLElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    return (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
  };
  const toggleLume = () => { setLume((l) => !l); setLumeKey((k) => k + 1); };
  const toggleFlip = () => {
    setFlipping(true);
    setFlipped((f) => !f);
    window.setTimeout(() => setFlipping(false), 850);
  };
  const tap = () => (flipped ? toggleFlip() : toggleLume());

  const onWatchDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startOffset: offsetRef.current, last: angleAt(e.currentTarget, e.clientX, e.clientY), acc: 0, moved: false };
  };
  const onWatchMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || flipped) {
      const r = e.currentTarget.getBoundingClientRect();
      setTilt({ x: clamp1(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp1(((e.clientY - r.top) / r.height) * 2 - 1) });
      return;
    }
    const a = angleAt(e.currentTarget, e.clientX, e.clientY);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    d.last = a;
    d.acc += delta;
    if (!d.moved && Math.abs(d.acc) > 6) {
      d.moved = true;
      beginScrub();
      setTilt({ x: 0, y: 0 });
    }
    if (d.moved) setOffset(clampOffset(d.startOffset + d.acc));
  };
  const onWatchUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) endScrub();
    else tap();
  };
  const onWatchCancel = () => {
    if (drag.current?.moved) endScrub();
    drag.current = null;
  };
  const onWatchKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); return; }
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 15 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -15 : 0;
    if (!step || flipped) return;
    e.preventDefault();
    beginScrub();
    setOffset((o) => clampOffset(o + step));
    endScrub();
  };

  // ── Card parallax (mouse only) ───────────────────────────────────────────
  const onCardMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    setPar({ x: clamp1(((e.clientX - r.left) / r.width) * 2 - 1), y: clamp1(((e.clientY - r.top) / r.height) * 2 - 1) });
  };

  const sinceYear = since ? Number(since.slice(0, 4)) : null;

  return (
    <Widget
      className="col-span-2 min-h-[158px] self-start"
      delay={delay}
      onPointerMove={onCardMove}
      onPointerLeave={() => setPar({ x: 0, y: 0 })}
    >
      <style>{SKYWATCH_CSS}</style>
      <CardSky sky={sky} minute={t} par={par} weather={weather} />
      <WeatherCanvas weather={weather} night={sky.stars} watch={watchRef} ledge={barRef} text={textRef} footer={summaryRef} onStrike={onStrike} />

      <div className="relative flex flex-1 items-center gap-3 sm:gap-5">
        {/* ── Left: greeting, habits, the time, controls ── */}
        <div ref={textRef} className="flex min-w-0 flex-1 flex-col self-stretch">
          <p className="text-[13px] font-medium text-muted-foreground">{greeting},</p>
          <p className="truncate text-[20px] font-semibold leading-tight tracking-tight">{name}</p>
          {habits.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={allDone ? { background: `${MAC.green}22`, color: MAC.green } : { background: "hsl(var(--foreground) / 0.08)" }}
                title="Your habits orbit the watch as planets — gold once done"
              >
                {allDone ? "All done ✓" : `${habitsLeft} to go`}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {allDone ? "✨ Aurora unlocked" : "🌌 finish all for the aurora"}
              </span>
            </div>
          )}

          <div className="mt-auto pt-3">
            <RollingTime date={shown} />
            {shifted ? (
              <button
                type="button"
                onClick={glideToNow}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[10px] font-semibold transition-colors hover:bg-foreground/[0.14]"
              >
                <RotateCcw className="h-3 w-3" /> {fmtOffset(offset)} · back to now
              </button>
            ) : (
              <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={repeater.caption ?? `Moon tonight: ${moonLabel}`}>
                {repeater.caption ? `🔔 ${repeater.caption}` : `${moonEmoji} ${moonLabel}`}
              </p>
            )}
            <div className="mt-2.5 flex items-center gap-1.5">
              <Ctl
                label={repeater.chiming ? "Stop the chime" : "Minute repeater — chime the time"}
                active={repeater.chiming}
                glow={sky.sun}
                onClick={() => (repeater.chiming ? repeater.stop() : repeater.start(shown))}
              >
                {repeater.chiming ? <BellRing className="animate-pulse" /> : <Bell />}
              </Ctl>
              <Ctl label={lume ? "Lume off" : "Lume — glow in the dark"} active={lume} glow={LUME} onClick={toggleLume}>
                <Sparkles />
              </Ctl>
              <Ctl label={flipped ? "Show the dial" : "Turn over — see the movement"} active={flipped} glow="#F3C9AE" onClick={toggleFlip}>
                <Cog className="sko-anim" style={flipped ? { animation: "sko-spin 6s linear infinite" } : undefined} />
              </Ctl>
            </div>
          </div>
        </div>

        {/* ── Right: the watch ── */}
        <div className="relative w-[164px] shrink-0 sm:w-[212px]">
          <div
            className="pointer-events-none absolute -inset-3 rounded-full blur-2xl transition-[background] duration-1000"
            style={{ background: `radial-gradient(circle, ${sky.sun}${alphaHex(sky.glow * 0.35)} 0%, transparent 68%)` }}
            aria-hidden="true"
          />
          <button
            ref={watchRef}
            type="button"
            onPointerDown={onWatchDown}
            onPointerMove={onWatchMove}
            onPointerUp={onWatchUp}
            onPointerCancel={onWatchCancel}
            onPointerLeave={() => { if (!drag.current) setTilt({ x: 0, y: 0 }); }}
            onKeyDown={onWatchKey}
            aria-label={flipped
              ? "Watch movement. Press to turn the watch back over."
              : `Sky watch at ${timeLabel}. Drag around the dial or use the arrow keys to travel through the day; press for lume.`}
            title={flipped ? "Tap to turn the watch back over" : "Drag around the dial to travel through the day · tap for lume"}
            className={cn(
              "relative block w-full touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              !flipped && "cursor-grab active:cursor-grabbing"
            )}
            style={{
              transformStyle: "preserve-3d",
              transform: `perspective(700px) rotateX(${-tilt.y * 12}deg) rotateY(${(flipped ? 180 : 0) + tilt.x * 12}deg)`,
              transition: `transform ${flipping ? 800 : 250}ms cubic-bezier(0.2,0.8,0.2,1)`,
            }}
          >
            <div className="drop-shadow-[0_12px_20px_rgba(0,0,0,0.55)]" style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
              <div key={lumeKey} className="sko-anim" style={lume ? { animation: "sko-lume 40s ease-out forwards" } : undefined}>
                <MemoDial
                  t={t}
                  carriage={carriage}
                  sky={sky}
                  moon={moon}
                  moonLabel={moonLabel}
                  habits={habits}
                  bursts={bursts}
                  lume={lume}
                  tilt={tilt}
                  crownOut={scrubbing}
                  strike={repeater.strike}
                  chiming={repeater.chiming}
                  label={`${timeLabel} · ${weather ? `${weather.label} · ` : ""}${moonLabel}`}
                  weather={weather}
                  lightning={lightning}
                />
              </div>
            </div>
            <div
              className="absolute inset-0 drop-shadow-[0_12px_20px_rgba(0,0,0,0.55)]"
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <MemoCaseback
                tilt={tilt}
                name={name}
                bestStreak={bestStreak}
                habitCount={habits.length}
                sinceYear={sinceYear}
                strike={repeater.strike}
                chiming={repeater.chiming}
              />
            </div>
          </button>
        </div>
      </div>

      {/* ── The rest of the day's weather, in a sentence ── */}
      {summary && (
        <p ref={summaryRef} className="relative mt-3 border-b border-foreground/10 pb-2 text-[12px] font-medium leading-snug text-foreground/85">
          {summary}
        </p>
      )}

      {/* ── Today as a strip of sky you can drag through ── */}
      <DayTimeline
        barRef={barRef}
        minute={Math.max(0, Math.min(1439.9, t))}
        realMinute={realMinute}
        glow={sky.sun}
        onScrub={(m) => { beginScrub(); setOffset(clampOffset(m - realRef.current)); }}
        onScrubEnd={endScrub}
      />

      {/* In a storm, each flash lights up the whole card, text and watch included */}
      {weather?.storm && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20"
          style={{ background: "#E2E8FF", mixBlendMode: "soft-light", opacity: "calc(var(--strike, 0) * 0.5)" }} />
      )}
    </Widget>
  );
}
