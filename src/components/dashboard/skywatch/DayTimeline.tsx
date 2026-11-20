import { useRef, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { DAY_SPECTRUM, SUNRISE, SUNSET } from "./sky";

// ─── Today as a strip of sky ──────────────────────────────────────────────────
// The whole day's colours from midnight to midnight. The ring marks the real
// time; drag the knob (or use the arrow keys) to travel through the day — the
// watch and the card's sky follow along.

const pct = (m: number) => `${(m / 1440) * 100}%`;
const fmt = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = Math.floor(m % 60);
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function DayTimeline({
  minute, realMinute, glow, onScrub, onScrubEnd, barRef,
}: {
  minute: number;              // the time being shown, minutes after midnight
  realMinute: number;          // the actual time now
  glow: string;                // sun / moon colour for the knob's halo
  onScrub: (minute: number) => void;
  onScrubEnd: () => void;
  barRef?: Ref<HTMLDivElement>;  // the coloured bar itself (rain splashes on it)
}) {
  const bar = useRef<HTMLDivElement>(null);
  const active = useRef(false);

  const minuteAt = (e: PointerEvent) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1439.9, ((e.clientX - r.left) / r.width) * 1440));
  };
  const end = () => {
    if (!active.current) return;
    active.current = false;
    onScrubEnd();
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 60 : 15;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onScrub(Math.min(1439.9, minute + step));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onScrub(Math.max(0, minute - step));
    else return;
    e.preventDefault();
    onScrubEnd();
  };

  return (
    <div className="relative mt-3">
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Travel through today"
        aria-valuemin={0}
        aria-valuemax={1440}
        aria-valuenow={Math.round(minute)}
        aria-valuetext={fmt(minute)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          active.current = true;
          onScrub(minuteAt(e));
        }}
        onPointerMove={(e) => { if (active.current) onScrub(minuteAt(e)); }}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKey}
        className="relative h-6 cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:cursor-grabbing"
      >
        <div ref={barRef} className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full ring-1 ring-inset ring-white/10" style={{ background: DAY_SPECTRUM }} />
        {[SUNRISE, SUNSET].map((m) => (
          <span key={m} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-foreground/35" style={{ left: pct(m) }} />
        ))}
        {/* the real "now" */}
        <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/70"
          style={{ left: pct(realMinute) }} />
        {/* the time being shown */}
        <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/90"
          style={{ left: pct(minute), boxShadow: `0 0 0 3px ${glow}55, 0 0 14px ${glow}` }} />
      </div>
      <div className="relative mt-0.5 h-3 text-[9px] font-medium text-muted-foreground/70 tabular-nums" aria-hidden="true">
        <span className="absolute left-0">12a</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(SUNRISE) }}>☀ 6a</span>
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>12p</span>
        <span className="absolute -translate-x-1/2" style={{ left: pct(SUNSET) }}>☾ 6p</span>
        <span className="absolute right-0">12a</span>
      </div>
    </div>
  );
}
