import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

function useAllFlags() {
    const { user } = useAuth();

    return useQuery({
        queryKey: ["feature_flags_resolved", user?.id],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_my_flags");
            if (error) return {} as Record<string, boolean>;
            return data as Record<string, boolean>;
        },
        enabled: !!user,
        staleTime: Infinity,       // flags don't change mid-session
        gcTime: 1000 * 60 * 60, // 1 hour
    });
}

// Use this everywhere in the app
// e.g. const canSeeLoans = useFeatureFlag("loans_tracker");
export function useFeatureFlag(flagName: string): boolean {
    const { data } = useAllFlags();
    return data?.[flagName] ?? false;
}

// Use this if you need all flags at once (e.g. admin panel)
export function useFeatureFlags() {
    return useAllFlags();
}