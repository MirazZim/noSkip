import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InsightType =
  | "spending_summary"
  | "habit_coaching"
  | "anomaly"
  | "financial_health";

// Matches the ai_insights table schema from the Step 2 migration exactly.
export interface AiInsight {
  id: string;
  user_id: string;
  insight_type: InsightType;
  content: string;           // plain string, or JSON string for financial_health
  context_hash: string | null;
  generated_at: string;      // ISO timestamp
  expires_at: string | null; // ISO timestamp; null → treat as stale
  was_useful: boolean | null; // null until user rates it
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Insights are stale when any of them is past its expires_at, or none exist yet.
function areInsightsStale(insights: AiInsight[]): boolean {
  if (insights.length === 0) return true;
  const now = new Date();
  return insights.some(
    (i) => !i.expires_at || new Date(i.expires_at) < now
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAIInsights() {
  const { user }       = useAuth();
  const queryClient    = useQueryClient();

  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError]         = useState<string | null>(null);

  // Prevent concurrent Edge Function calls (e.g. StrictMode double-invoke,
  // or refresh() fired while auto-generation is already running).
  const generatingRef      = useRef(false);
  // Auto-trigger fires at most once per mount — prevents an update loop where
  // invalidating the query cache after generation re-triggers the effect.
  const hasAutoTriggered   = useRef(false);

  // ── Fetch cached insights from the DB ───────────────────────────────────────
  const { data: insights, isLoading } = useQuery({
    queryKey: ["ai_insights", user?.id],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiInsight[];
    },
    enabled:   !!user,
    // Never auto-refetch — freshness is controlled via invalidateQueries after
    // generation and via the expires_at staleness check below.
    staleTime: Infinity,
    gcTime:    60 * 60 * 1000, // keep in memory for 1 hour (matches useFeatureFlag)
  });

  // ── Call the Edge Function to regenerate ────────────────────────────────────
  const generate = useCallback(async () => {
    if (generatingRef.current || !user) return;
    generatingRef.current = true;
    setIsGenerating(true);
    setGenError(null);

    try {
      const { error } = await supabase.functions.invoke("generate-insights");
      if (error) throw new Error(error.message);
      // Pull the freshly saved rows into the cache
      await queryClient.invalidateQueries({ queryKey: ["ai_insights", user.id] });
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : "Failed to generate insights"
      );
    } finally {
      setIsGenerating(false);
      generatingRef.current = false;
    }
  }, [user, queryClient]);

  // ── Auto-trigger once per mount when data is stale ──────────────────────────
  useEffect(() => {
    // Wait for the initial fetch to settle, and only act once per mount.
    if (isLoading || !user || hasAutoTriggered.current) return;
    hasAutoTriggered.current = true;

    if (areInsightsStale(insights ?? [])) {
      generate();
    }
  }, [isLoading, user, insights, generate]);

  // ── Rate an insight (was_useful feedback) ───────────────────────────────────
  const rateInsightMutation = useMutation({
    mutationFn: async ({ id, useful }: { id: string; useful: boolean }) => {
      const { error } = await supabase
        .from("ai_insights")
        .update({ was_useful: useful })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai_insights", user?.id] });
    },
  });

  const rateInsight = useCallback(
    async (id: string, useful: boolean): Promise<void> => {
      await rateInsightMutation.mutateAsync({ id, useful });
    },
    [rateInsightMutation]
  );

  return {
    insights:     insights ?? null,
    isLoading,
    isGenerating,
    error:        genError,
    refresh:      generate,      // manual trigger — always regenerates regardless of staleness
    rateInsight,
  };
}
