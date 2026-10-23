import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─────────────────────────────────────────────────────────
// AI-written coach pep talks for the habit detail panel.
// The situation and numbers are computed in HabitDetailPanel; the
// habit-pep-talk edge function only writes the words around them.
// Cached per habit, per day, per set of facts (and persisted with the rest of
// the query cache), so the LLM runs once when something actually changes.
// ─────────────────────────────────────────────────────────

export type PepTalkSituation =
  | "at_risk" | "comeback" | "personal_best" | "gone_quiet"
  | "momentum_up" | "momentum_down" | "steady" | "new";

export interface PepTalkFacts {
  currentStreak: number;
  bestStreak: number;
  doneToday: boolean;
  last30Rate: number;
  prev30Rate: number;
  showUpRate: number;
  totalDone: number;
  daysSinceLast: number;
  bestDay: string | null;
  bestDayRate: number | null;
  worstDay: string | null;
}

/**
 * Makes an AI line safe for PepTalk's **mark** parser: fills the {time_left}
 * token (bolding it only when it isn't already inside a mark), drops marks if
 * they're unbalanced, and un-marks spans too long to read as a highlight.
 */
export function cleanPepLine(line: string, timeLeft: string) {
  const parts = line.split("**");
  if (parts.length % 2 === 0) {
    return line.replace(/\*\*/g, "").replace(/\{time_left\}/g, timeLeft);
  }
  return parts
    .map((part, i) => {
      const inMark = i % 2 === 1;
      if (!inMark) return part.replace(/\{time_left\}/g, `**${timeLeft}**`);
      const text = part.replace(/\{time_left\}/g, timeLeft);
      return text.trim().split(/\s+/).length > 5 ? text : `**${text}**`;
    })
    .join("");
}

export function useHabitPepTalk(
  habit: { id: string; name: string },
  situation: PepTalkSituation,
  facts: PepTalkFacts,
) {
  const { user } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    // Keyed on what changes the story (situation, streak), not every stat, so a
    // check-off doesn't always cost an LLM call. Bump the version when the prompt changes.
    queryKey: ["habit_pep_talk", "v4", user?.id, habit.id, habit.name, today, situation, facts.currentStreak],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("habit-pep-talk", {
        body: { habitName: habit.name, situation, facts },
      });
      if (error) throw error;
      const lines = (data as { lines?: unknown })?.lines;
      if (!Array.isArray(lines) || lines.length === 0) throw new Error("No pep talk lines");
      return lines.filter((l): l is string => typeof l === "string");
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 60 * 24,
    // Failures are almost always the LLM quota — retrying just burns more of it.
    // The panel falls back to built-in lines; a reload tries again.
    retry: false,
    retryOnMount: false,
  });
}
