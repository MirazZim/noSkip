// Life Score: up to 60 points for the share of habits done, and up to 40 for
// keeping the day's spending at or below the previous day's. One formula shared
// by today's score, its 7-day history and the "what if" preview.

export interface LifeScore {
  habitScore: number;   // 0..60
  spendScore: number;   // 10..40
  total: number;        // 0..100
  spendDelta: number;   // % change in spending vs the previous day (0 when there's nothing to compare)
}

export function lifeScore(habitPct: number, spent: number, prevSpent: number): LifeScore {
  const spendDelta = prevSpent ? Math.round(((spent - prevSpent) / prevSpent) * 100) : 0;
  const habitScore = Math.round(Math.max(0, Math.min(1, habitPct)) * 60);
  const spendScore = spendDelta <= 0 ? 40 : spendDelta <= 20 ? 30 : spendDelta <= 50 ? 20 : 10;
  return { habitScore, spendScore, total: habitScore + spendScore, spendDelta };
}

export const LIFE_TIERS = [
  { min: 0, label: "Needs work" },
  { min: 40, label: "Fair" },
  { min: 60, label: "Good" },
  { min: 80, label: "Excellent" },
] as const;

export type LifeTierLabel = (typeof LIFE_TIERS)[number]["label"];

/** The tier a score sits in, and the next one up (if any). */
export function lifeTier(score: number) {
  let i = LIFE_TIERS.length - 1;
  while (i > 0 && score < LIFE_TIERS[i].min) i--;
  return { ...LIFE_TIERS[i], index: i, next: LIFE_TIERS[i + 1] ?? null };
}
