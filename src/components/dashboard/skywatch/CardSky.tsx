import { CARD_STARS, CITY_LIGHTS, CLOUDS, celestial, type Sky } from "./sky";

// ─── The card's own sky ───────────────────────────────────────────────────────
// A small diorama behind the watch: the time-of-day sky, the sun (or moon)
// glowing as it crosses the card on its arc, drifting clouds by day, stars and
// shooting stars by night, and a skyline whose windows light up after dark.
// Layers shift slightly with the pointer for depth.

export function CardSky({ sky, minute, par }: { sky: Sky; minute: number; par: { x: number; y: number } }) {
  const c = celestial(minute);
  const left = 6 + c.p * 88;                        // % across the card
  const top = 80 - Math.sin(Math.PI * c.p) * 64;    // % down the card (an arc)
  const glowColor = c.isSun ? sky.sun : "#E0E7FF";
  const glowAmt = c.isSun ? sky.glow : 0.45;
  const shift = (d: number) => ({
    transform: `translate(${par.x * d}px, ${par.y * d * 0.5}px)`,
    transition: "transform 400ms ease-out",
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 transition-[background] duration-1000" style={{ background: sky.cardBg }} />

      {/* Sun / moon glow on its arc across the card */}
      <div
        className="absolute h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top,opacity] duration-1000"
        style={{
          left: `${left}%`, top: `${top}%`, opacity: glowAmt * 0.75,
          background: `radial-gradient(circle, ${glowColor}66 0%, ${glowColor}22 35%, transparent 70%)`,
        }}
      />

      {/* Stars */}
      <div className="absolute inset-0" style={{ ...shift(-3), opacity: sky.stars }}>
        {CARD_STARS.map((s, i) => (
          <span key={i} className="sko-anim absolute rounded-full bg-white"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, animation: `sko-twinkle 2.6s ease-in-out ${s.d}s infinite` }} />
        ))}
      </div>
      {sky.dark && (
        <span className="sko-anim absolute right-[12%] top-[10%] h-px w-16"
          style={{ background: "linear-gradient(90deg, #fff, transparent)", animation: "sko-card-shoot 11s ease-out 4s infinite" }} />
      )}

      {/* Clouds, tinted by the light of the hour */}
      <div className="absolute inset-0" style={{ ...shift(-6), opacity: sky.clouds * 0.9 }}>
        {CLOUDS.map((cl, i) => (
          <span key={i} className="sko-anim absolute inset-x-0" style={{ top: cl.top, animation: `sko-cloud ${cl.dur}s linear ${cl.delay}s infinite` }}>
            <span className="absolute left-1/2 rounded-full blur-xl"
              style={{ width: cl.w, height: cl.h, background: `color-mix(in srgb, ${sky.light} 30%, white)`, opacity: 0.45 }} />
          </span>
        ))}
      </div>

      {/* Skyline */}
      <svg className="absolute -left-[5%] bottom-0 h-14 w-[110%]" viewBox="0 0 220 40" preserveAspectRatio="none">
        <path d="M0 26 C 30 14, 55 22, 80 18 S 130 8, 160 16 S 200 22, 220 14 L 220 40 L 0 40 Z"
          fill={sky.deep} fillOpacity={0.35} style={shift(-3)} />
        <g style={shift(-7)}>
          <path d="M0 32 C 25 24, 50 30, 75 27 S 120 20, 150 26 S 195 32, 220 26 L 220 40 L 0 40 Z"
            fill="hsl(var(--card))" fillOpacity={0.55} />
          {/* Windows light up after dark (the group fades; each window twinkles inside it) */}
          <g opacity={sky.stars * 0.9}>
            {CITY_LIGHTS.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={0.55} fill="#FDE68A"
                className="sko-anim" style={{ animation: `sko-twinkle ${2 + (i % 4) * 0.7}s ease-in-out ${i * 0.3}s infinite` }} />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
