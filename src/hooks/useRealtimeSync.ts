import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

// Table → query keys to refresh when one of the user's rows changes on any device.
// expenses / sms_messages are handled by useSmsRealtime (it also raises the review toast).
const TABLE_KEYS: Record<string, string[][]> = {
  incomes: [["incomes"]],
  habits: [["habits"], ["persona_rules"]],
  habit_completions: [["habit_completions"]],
  budgets: [["budgets"]],
  loans: [["loans"]],
  savings: [["savings"]],
  custom_categories: [["custom-categories"]],
  profiles: [["profile"]],
};

/** Keeps the cache in sync with changes made elsewhere (phone, another tab, SMS import). Mount once. */
export function useRealtimeSync() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A burst of row changes (e.g. a reorder) becomes one refetch per table.
    const refresh = (table: string) => {
      pending.add(table);
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending.forEach((t) => TABLE_KEYS[t].forEach((queryKey) => qc.invalidateQueries({ queryKey })));
        pending.clear();
      }, 300);
    };

    let channel = supabase.channel(`sync:${user.id}`);
    for (const table of Object.keys(TABLE_KEYS)) {
      const filter = table === "profiles" ? `id=eq.${user.id}` : `user_id=eq.${user.id}`;
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => refresh(table));
    }

    let subscribedOnce = false;
    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      // After a reconnect (laptop sleep, phone backgrounded) events may have been
      // missed, so refetch everything once.
      if (subscribedOnce) qc.invalidateQueries();
      subscribedOnce = true;
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]); // eslint-disable-line react-hooks/exhaustive-deps
}
