import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────
// Persona Shift = identity-based rules tracked with the EXISTING habit engine.
// A persona rule is a habit row with category = 'persona_shift'. Completions,
// streaks, check-off and reorder are all shared with habits — see useHabits.
// The only thing genuinely new here is the AI coach reaction at create/edit.
// ─────────────────────────────────────────────────────────

export type FlagLevel = "healthy" | "caution" | "none";

export interface PersonaRule {
  id: string;
  name: string; // the rule text
  emoji: string;
  frequency_type: string;
  custom_days: string[] | null;
  preferred_time: string | null;
  start_date: string;
  is_active: boolean;
  user_id: string;
  created_at: string;
  sort_order: number;
  category: string;
  coach_note: string | null;
  flag_level: FlagLevel;
  description: string | null;
}

export interface CoachReaction {
  flag_level: FlagLevel;
  coach_note: string;
}

const PERSONA_CATEGORY = "persona_shift";
const PERSONA_EMOJI = "🧭";

// ─────────────────────────────────────────────────────────
// Coach reaction — ONE round-trip through the edge function.
// Never throws: any failure resolves to a 'none' reaction so the rule still
// saves. The coach advises, it never gates rule creation.
// ─────────────────────────────────────────────────────────
async function evaluateRule(ruleText: string): Promise<CoachReaction> {
  try {
    const { data, error } = await supabase.functions.invoke("evaluate-persona-rule", {
      body: { ruleText },
    });
    if (error) throw error;
    const flag = (data as CoachReaction)?.flag_level;
    const note = (data as CoachReaction)?.coach_note;
    if ((flag === "healthy" || flag === "caution") && typeof note === "string") {
      return { flag_level: flag, coach_note: note };
    }
    return { flag_level: "none", coach_note: "" };
  } catch (err) {
    console.error("evaluate-persona-rule failed:", err);
    return { flag_level: "none", coach_note: "" };
  }
}

// ─────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────

export function usePersonaRules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["persona_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("habits")
        .select("*")
        .eq("category", PERSONA_CATEGORY)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as PersonaRule[];
    },
    enabled: !!user,
  });
}

// ─────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────

export function useAddPersonaRule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    // Returns the coach reaction so the caller can surface it right after save.
    mutationFn: async ({ text, description }: { text: string; description?: string }): Promise<CoachReaction> => {
      const reaction = await evaluateRule(text);

      const { data: existing } = await supabase
        .from("habits")
        .select("sort_order")
        .eq("user_id", user!.id)
        .eq("category", PERSONA_CATEGORY)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

      const { error } = await supabase.from("habits").insert({
        name: text,
        emoji: PERSONA_EMOJI,
        frequency_type: "daily",
        category: PERSONA_CATEGORY,
        coach_note: reaction.coach_note || null,
        flag_level: reaction.flag_level,
        user_id: user!.id,
        sort_order: nextOrder,
        description: description?.trim() || null,
      });
      if (error) throw error;

      return reaction;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["persona_rules"] }),
  });
}

export function useUpdatePersonaRule() {
  const queryClient = useQueryClient();
  return useMutation({
    // Editing the rule text re-fires the coach reaction (one round-trip).
    mutationFn: async ({ id, text, description }: { id: string; text: string; description?: string }): Promise<CoachReaction> => {
      const reaction = await evaluateRule(text);

      const { error } = await supabase
        .from("habits")
        .update({
          name: text,
          coach_note: reaction.coach_note || null,
          flag_level: reaction.flag_level,
          description: description?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;

      return reaction;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["persona_rules"] }),
  });
}

export function useDeletePersonaRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("habits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["persona_rules"] });
      queryClient.invalidateQueries({ queryKey: ["habit_completions"] });
    },
  });
}

/**
 * Bulk reorder — mirrors useReorderHabits exactly, but scoped to the
 * persona_rules cache key. Optimistic with snapshot rollback.
 */
export function useReorderPersonaRules() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    onMutate: async ({ orderedRules }: { orderedRules: PersonaRule[] }) => {
      await queryClient.cancelQueries({ queryKey: ["persona_rules", user?.id] });
      const snapshot = queryClient.getQueryData<PersonaRule[]>(["persona_rules", user?.id]);

      const optimistic = orderedRules.map((r, i) => ({ ...r, sort_order: i + 1 }));
      queryClient.setQueryData(["persona_rules", user?.id], optimistic);

      return { snapshot };
    },

    mutationFn: async ({ orderedRules }: { orderedRules: PersonaRule[] }) => {
      const results = await Promise.all(
        orderedRules.map((rule, index) =>
          supabase
            .from("habits")
            .update({ sort_order: index + 1 })
            .eq("id", rule.id)
        )
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(["persona_rules", user?.id], context.snapshot);
      }
      toast.error("Couldn't save order — changes rolled back");
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["persona_rules"] });
    },
  });
}
