import { cn } from "@/lib/utils";

type Tier = "ember" | "fire" | "blaze" | "blue" | "gold";

const TIERS: Record<Tier, { scale: number; outer: [string, string]; mid: [string, string]; core: [string, string]; spark: string }> = {
  ember: { scale: 0.5, outer: ["#7c3b1d", "#3b1a10"], mid: ["#b4532a", "#5c2414"], core: ["#f3a35d", "#b4532a"], spark: "#f3a35d" },
  fire:  { scale: 0.78, outer: ["#ff9a3c", "#e2461b"], mid: ["#ffc24b", "#ff7a1f"], core: ["#fff4c2", "#ffd166"], spark: "#ffc24b" },
  blaze: { scale: 0.92, outer: ["#ff5e3a", "#c81d25"], mid: ["#ff9f1c", "#ff4d2e"], core: ["#fff1b8", "#ffcf56"], spark: "#ff9f1c" },
  blue:  { scale: 1, outer: ["#5b8cff", "#3a2fd6"], mid: ["#7fd1ff", "#4f7dff"], core: ["#f0fbff", "#a9e6ff"], spark: "#7fd1ff" },
  gold:  { scale: 1.08, outer: ["#ffd34d", "#e08b00"], mid: ["#fff08a", "#ffc21a"], core: ["#ffffff", "#fff3b0"], spark: "#fff08a" },
};

function flameTier(streak: number): Tier {
  if (streak <= 0) return "ember";
  if (streak < 7) return "fire";
  if (streak < 30) return "blaze";
  if (streak < 100) return "blue";
  return "gold";
}

const OUTER = "M50 6 C62 28 86 44 82 74 C79 99 63 114 50 114 C37 114 21 99 18 74 C14 44 38 28 50 6 Z";
const MID = "M50 30 C58 46 74 58 71 80 C69 98 59 108 50 108 C41 108 31 98 29 80 C26 58 42 46 50 30 Z";
const CORE = "M50 56 C55 66 64 74 62 88 C61 99 56 104 50 104 C44 104 39 99 38 88 C36 74 45 66 50 56 Z";

/**
 * A living streak flame: grows and changes color as the streak climbs
 * (ember → fire → blaze → blue → gold) and sputters when today is at risk.
 */
export function StreakFlame({ streak, atRisk, id }: { streak: number; atRisk: boolean; id: string }) {
  const tier = flameTier(streak);
  const t = TIERS[tier];
  const g = (k: string) => `sf-${k}-${id}`;

  return (
    <div className={cn("sf-root", `sf--${tier}`, atRisk && "sf--risk")}>
      <style>{`
        .sf-root { position: relative; width: 84px; height: 96px; flex-shrink: 0; }
        .sf-root svg { position: absolute; inset: 0; overflow: visible; }
        .sf-glow { position: absolute; left: 50%; bottom: 10px; width: 92px; height: 50px; transform: translateX(-50%);
          border-radius: 50%; filter: blur(14px); opacity: 0.55; }
        @keyframes sf-flick-a { 0%,100% { transform: scale(1,1) skewX(0); } 30% { transform: scale(0.97,1.05) skewX(-2deg); } 65% { transform: scale(1.02,0.97) skewX(1.5deg); } }
        @keyframes sf-flick-b { 0%,100% { transform: scale(1,1) skewX(0); } 40% { transform: scale(1.04,0.95) skewX(2deg); } 70% { transform: scale(0.96,1.06) skewX(-2deg); } }
        @keyframes sf-rise { 0% { transform: translate(0,0) scale(1); opacity: 0; } 15% { opacity: 1; } 100% { transform: translate(var(--dx), -54px) scale(0.2); opacity: 0; } }
        @keyframes sf-sputter { 0%,100% { opacity: 1; } 45% { opacity: 0.6; } 50% { opacity: 0.95; } 55% { opacity: 0.55; } }
        .sf-layer { transform-box: view-box; transform-origin: 50px 114px; }
        .sf-outer { animation: sf-flick-a 1.7s ease-in-out infinite; }
        .sf-mid   { animation: sf-flick-b 1.25s ease-in-out infinite; }
        .sf-core  { animation: sf-flick-a 0.9s ease-in-out infinite; }
        .sf-spark { animation: sf-rise 1.8s ease-out infinite; transform-box: fill-box; }
        .sf--risk .sf-flame { animation: sf-sputter 1.1s steps(1, end) infinite; }
        .sf--ember .sf-spark { display: none; }
        @media (prefers-reduced-motion: reduce) { .sf-layer, .sf-spark, .sf-flame { animation: none !important; } }
      `}</style>

      <span className="sf-glow" style={{ background: t.outer[0] }} />
      <svg viewBox="0 0 100 120" aria-hidden>
        <defs>
          {(["outer", "mid", "core"] as const).map((k) => (
            <linearGradient key={k} id={g(k)} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={t[k][1]} />
              <stop offset="100%" stopColor={t[k][0]} />
            </linearGradient>
          ))}
        </defs>
        <g className="sf-flame" transform={`translate(50 114) scale(${t.scale}) translate(-50 -114)`}>
          <path className="sf-layer sf-outer" d={OUTER} fill={`url(#${g("outer")})`} />
          <path className="sf-layer sf-mid" d={MID} fill={`url(#${g("mid")})`} />
          <path className="sf-layer sf-core" d={CORE} fill={`url(#${g("core")})`} />
          {[
            { x: 42, y: 60, dx: "-8px", d: "0s" },
            { x: 58, y: 54, dx: "9px", d: "0.6s" },
            { x: 50, y: 40, dx: "-3px", d: "1.1s" },
            { x: 36, y: 72, dx: "-12px", d: "1.5s" },
          ].map((s, i) => (
            <circle key={i} className="sf-spark" cx={s.x} cy={s.y} r={2.2} fill={t.spark}
              style={{ ["--dx" as string]: s.dx, animationDelay: s.d }} />
          ))}
        </g>
      </svg>

    </div>
  );
}
