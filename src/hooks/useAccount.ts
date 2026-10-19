import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// AuthContext picks up the USER_UPDATED event, so `user` re-renders with the new name.
export function useUpdateDisplayName() {
  return useMutation({
    mutationFn: async (displayName: string) => {
      const { error } = await supabase.auth.updateUser({ data: { display_name: displayName } });
      if (error) throw error;
    },
  });
}
