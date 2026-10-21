/** Warm amber (rarely) → teal (almost always): readable on any theme color. */
export function heatColor(rate: number) {
  const t = Math.max(0, Math.min(1, rate / 100));
  return `hsl(${Math.round(32 + t * 140)} ${Math.round(80 - t * 12)}% ${Math.round(56 - t * 8)}%)`;
}
