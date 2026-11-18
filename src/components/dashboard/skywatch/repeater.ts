import { useCallback, useEffect, useRef, useState } from "react";

// ─── Minute repeater ──────────────────────────────────────────────────────────
// Like the complication on a fine watch: low gong strikes for the hours,
// high-low pairs for each quarter, then high strikes for the minutes past the
// quarter. The bells are synthesised with WebAudio, so there are no sound files.

export type Tone = "low" | "high";
export interface Strike { at: number; tone: Tone }   // seconds after the start

export interface RepeaterSchedule {
  strikes: Strike[];
  hours: number;
  quarters: number;
  minutes: number;
  duration: number;   // seconds until the last bell has died away
}

export function repeaterSchedule(h: number, m: number): RepeaterSchedule {
  const hours = h % 12 === 0 ? 12 : h % 12;
  const quarters = Math.floor(m / 15);
  const minutes = m % 15;
  const strikes: Strike[] = [];
  let t = 0;
  for (let i = 0; i < hours; i++) { strikes.push({ at: t, tone: "low" }); t += 0.42; }
  if (quarters) {
    t += 0.45;
    for (let i = 0; i < quarters; i++) {
      strikes.push({ at: t, tone: "high" }, { at: t + 0.2, tone: "low" });
      t += 0.62;
    }
  }
  if (minutes) {
    t += 0.45;
    for (let i = 0; i < minutes; i++) { strikes.push({ at: t, tone: "high" }); t += 0.32; }
  }
  const last = strikes[strikes.length - 1]?.at ?? 0;
  return { strikes, hours, quarters, minutes, duration: last + 1.6 };
}

export function describeRepeater(s: Pick<RepeaterSchedule, "hours" | "quarters" | "minutes">) {
  const part = (n: number, word: string) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : null);
  return [part(s.hours, "hour"), part(s.quarters, "quarter"), part(s.minutes, "minute")].filter(Boolean).join(" · ");
}

const TONE_HZ: Record<Tone, number> = { low: 587.33, high: 880 };   // D5 and A5, a fourth apart
const LEAD = 0.08;                                                    // seconds before the first strike

// One struck bell: a fundamental plus two inharmonic partials, fast attack, long decay.
function bell(ctx: AudioContext, out: AudioNode, freq: number, when: number) {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, when);
  env.gain.exponentialRampToValueAtTime(0.35, when + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, when + 1.8);
  env.connect(out);
  for (const [mult, amp] of [[1, 1], [2.76, 0.32], [5.4, 0.1]]) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(env);
    osc.start(when);
    osc.stop(when + 1.9);
  }
}

/** Plays a schedule; returns a function that stops it (with a short fade). */
function playRepeater(strikes: Strike[]): () => void {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => {};
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + LEAD;
  strikes.forEach((s) => bell(ctx, master, TONE_HZ[s.tone], t0 + s.at));

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.15);
    window.setTimeout(() => void ctx.close(), 250);
  };
}

/** React hook: start / stop the repeater, and expose each strike as it happens (for the visuals). */
export function useRepeater() {
  const [caption, setCaption] = useState<string | null>(null);
  const [strike, setStrike] = useState<{ id: number; tone: Tone } | null>(null);
  const run = useRef<{ stop: (() => void) | null; timers: number[] }>({ stop: null, timers: [] });

  const stop = useCallback(() => {
    const r = run.current;
    r.stop?.();
    r.stop = null;
    r.timers.forEach((id) => window.clearTimeout(id));
    r.timers = [];
    setCaption(null);
    setStrike(null);
  }, []);

  const start = useCallback((time: Date) => {
    stop();
    const s = repeaterSchedule(time.getHours(), time.getMinutes());
    const r = run.current;
    r.stop = playRepeater(s.strikes);
    setCaption(describeRepeater(s));
    s.strikes.forEach((st, i) => {
      r.timers.push(window.setTimeout(() => {
        setStrike({ id: i + 1, tone: st.tone });
        navigator.vibrate?.(8);
      }, (st.at + LEAD) * 1000));
    });
    r.timers.push(window.setTimeout(stop, (s.duration + LEAD) * 1000));
  }, [stop]);

  // Silence everything if the card unmounts mid-chime.
  useEffect(() => {
    const r = run.current;
    return () => {
      r.stop?.();
      r.timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return { chiming: caption !== null, caption, strike, start, stop };
}
