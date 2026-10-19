import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserIdentity } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { OAuthProvider } from "@/lib/oauthProviders";

// Sign-in methods attached to the current account (email, google, facebook, x…).
export function useIdentities() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["identities", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data.identities;
    },
    enabled: !!user,
  });
}

// Redirects to the provider; it returns to /settings with the identity attached
// to this account. Needs "Allow manual linking" on in Supabase Auth settings.
export function useLinkIdentity() {
  return useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${window.location.origin}/settings` },
      });
      if (error) throw error;
    },
  });
}

// Supabase refuses to remove an account's last identity, so the UI only offers
// this when another sign-in method remains.
export function useUnlinkIdentity() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (identity: UserIdentity) => {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["identities", user?.id] });
    },
  });
}
