import { useCallback } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const BASE_URL = "https://ruclkyjuvqmomwdfidet.supabase.co/functions/v1";

interface AdminFetchOptions {
  action: string;
  [key: string]: unknown;
}

interface AdminFetchResult<T> {
  data: T | null;
  error: string | null;
}

export function useAdminFetch() {
  const { admin } = useAdminAuth();

  const adminFetch = useCallback(async <T>(
    functionName: string,
    body: AdminFetchOptions,
  ): Promise<AdminFetchResult<T>> => {
    if (!admin?.token) {
      return { data: null, error: "Not authenticated" };
    }

    try {
      const res = await fetch(`${BASE_URL}/${functionName}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${admin.token}`,
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        return { data: null, error: json.error ?? `Request failed (${res.status})` };
      }

      return { data: json as T, error: null };
    } catch {
      return { data: null, error: "Network error — please try again" };
    }
  }, [admin?.token]);

  return { adminFetch };
}