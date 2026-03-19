import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AdminSession {
  session_id: string;
  admin_id:   string;
  role:       string;
}

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAdminToken(
  db:         SupabaseClient,
  authHeader: string | null,
): Promise<{ session: AdminSession | null; error: string | null }> {
  if (!authHeader) return { session: null, error: "No authorization header" };

  const rawToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!rawToken)  return { session: null, error: "No token provided" };

  const tokenHash = await sha256(rawToken);

  // Verify session is valid and not expired/revoked
  const { data: sessionRow, error: sessionErr } = await db
    .from("admin_sessions")
    .select("id, admin_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (sessionErr || !sessionRow) {
    return { session: null, error: "Invalid or expired session" };
  }

  // Fetch role from admin_users
  const { data: adminRow, error: adminErr } = await db
    .from("admin_users")
    .select("role, is_active")
    .eq("id", sessionRow.admin_id)
    .single();

  if (adminErr || !adminRow || !adminRow.is_active) {
    return { session: null, error: "Admin account not found or inactive" };
  }

  return {
    session: {
      session_id: sessionRow.id,
      admin_id:   sessionRow.admin_id,
      role:       adminRow.role,
    },
    error: null,
  };
}