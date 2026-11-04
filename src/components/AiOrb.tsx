import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type AiOrbState = "idle" | "thinking";

interface Props {
  size?:      number;
  state?:     AiOrbState;
  /** 2–4 colors that swirl inside the orb. */
  colors?:    string[];
  className?: string;
}

// Its own palette rather than the theme's primary — some themes use a
// near-white primary, which would turn the orb into a grey marble.
const DEFAULT_COLORS = ["#ff4fa3", "#8b5cf6", "#38bdf8", "#34d399"];

// A glowing glass orb. Two blurred color fields turn inside a dark glass
// shell: slowly at idle, fast while the AI thinks. Keyframes live in
// index.css; reduced-motion users get a still orb.
export function AiOrb({ size = 40, state = "idle", colors = DEFAULT_COLORS, className }: Props) {
  const thinking = state === "thinking";
  const blur     = Math.max(2, size * 0.12);
  const [c1, c2, c3 = c1, c4 = c2] = colors;

  const field = (stops: string, seconds: number, reverse = false): CSSProperties => ({
    background: `conic-gradient(from 0deg, ${stops})`,
    filter:     `saturate(1.3) blur(${blur}px)`,
    animation:  `aiOrbSpin ${seconds}s linear infinite${reverse ? " reverse" : ""}`,
  });

  return (
    <span
      aria-hidden
      data-state={state}
      className={cn("ai-orb relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* Halo */}
      <span
        className="absolute rounded-full"
        style={{
          inset:      -size * 0.2,
          background: `radial-gradient(circle, color-mix(in srgb, ${c2} 55%, transparent), transparent 65%)`,
          filter:     `blur(${size * 0.1}px)`,
          animation:  `aiOrbPulse ${thinking ? 1.1 : 4}s ease-in-out infinite`,
        }}
      />
      {/* Glass shell */}
      <span
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 60%, color-mix(in srgb, ${c2} 30%, transparent), hsl(230 35% 7%) 75%)`,
          animation:  thinking ? "aiOrbBreathe 1.1s ease-in-out infinite" : undefined,
        }}
      >
        <span
          className="absolute -inset-1/4"
          style={field(`${c1}, transparent 25%, ${c2} 45%, transparent 70%, ${c1}`, thinking ? 1.6 : 9)}
        />
        <span
          className="absolute -inset-1/4 opacity-80"
          style={field(`${c3}, transparent 30%, ${c4} 55%, transparent 80%, ${c3}`, thinking ? 2.3 : 14, true)}
        />
        {/* Highlights + rim */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 26%, hsl(0 0% 100% / 0.7), transparent 30%), " +
              "radial-gradient(circle at 70% 82%, hsl(0 0% 100% / 0.14), transparent 38%)",
            boxShadow:
              `inset 0 0 ${size * 0.16}px hsl(0 0% 100% / 0.3), ` +
              `inset 0 -${size * 0.1}px ${size * 0.22}px hsl(0 0% 0% / 0.3)`,
          }}
        />
      </span>
    </span>
  );
}
