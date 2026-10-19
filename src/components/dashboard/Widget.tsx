import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PRIMARY } from "@/lib/macColors";

// A macOS Sonoma-style desktop widget: frosted squircle tile that pops in.
export function Widget({
  children, className, onClick, delay = 0,
}: { children: ReactNode; className?: string; onClick?: () => void; delay?: number }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
      className={cn(
        "relative flex min-w-0 flex-col overflow-hidden rounded-[22px] border border-foreground/[0.07] bg-card/75 p-4 backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05),0_10px_30px_-14px_rgba(0,0,0,0.5)]",
        "animate-in fade-in zoom-in-95 fill-mode-both duration-500",
        onClick && "cursor-pointer transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985]",
        className
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// App-glyph + tinted title, the way macOS widgets label themselves.
export function WidgetHeader({
  icon, title, tint, right,
}: { icon: ReactNode; title: string; tint: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] [&>svg]:h-3 [&>svg]:w-3"
        style={{ background: tint, color: tint === PRIMARY ? "hsl(var(--primary-foreground))" : "#fff" }}
      >
        {icon}
      </span>
      <span className="truncate text-[13px] font-semibold" style={{ color: tint }}>{title}</span>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  );
}

// iOS-style card header: icon in a softly tinted circle, plain title.
export function SectionHeader({
  icon, title, subtitle, tint = PRIMARY, right,
}: { icon: ReactNode; title: string; subtitle?: string; tint?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4"
        style={{ background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold leading-tight tracking-tight">{title}</p>
        {subtitle && <p className="truncate text-[12px] leading-tight text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto flex shrink-0 items-center gap-1">{right}</div>}
    </div>
  );
}

// Apple Activity-style ring: tinted track, rounded progress arc.
export function ActivityRing({
  pct, size, stroke, color, children,
}: { pct: number; size: number; stroke: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 1));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
        {clamped > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={c} strokeDashoffset={c * (1 - clamped)} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.2,0.8,0.2,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
