import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CustomCategory {
  id: string;
  name: string;
  color: string;
}

const QK = ["custom-categories"] as const;

export function useCustomCategories() {
  const { user } = useAuth();
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_categories")
        .select("id, name, color")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CustomCategory[];
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCustomCategory() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (payload: { name: string; color: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("custom_categories")
        .insert({ ...payload, user_id: user.id })
        .select("id, name, color")
        .single();
      if (error) {
        if (error.code === "23505") throw new Error("A category with that name already exists.");
        throw error;
      }
      return data as CustomCategory;
    },
    onSuccess: (newCat) => {
      qc.setQueryData<CustomCategory[]>(QK, (prev = []) => [...prev, newCat]);
    },
  });
}

export function useDeleteCustomCategory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.setQueryData<CustomCategory[]>(QK, (prev = []) => prev.filter((c) => c.id !== id));
    },
  });
}