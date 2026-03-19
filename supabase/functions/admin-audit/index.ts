import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }      from "../_shared/cors.ts";
import { verifyAdminToken } from "../_shared/adminAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { session, error: authError } = await verifyAdminToken(
    db, req.headers.get("authorization")
  );
  if (!session) {
    return Response.json(
      { error: authError },
      { status: 401, headers: corsHeaders(origin) }
    );
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "list_logs") {
      const page    = Math.max(1, Number(body.page)  || 1);
      const limit   = Math.min(100, Number(body.limit) || 50);
      const offset  = (page - 1) * limit;
      const filters = body.filters ?? {};

      let query = db
        .from("audit_logs")
        .select(
          "id, timestamp, actor_id, actor_type, action, resource_type, resource_id, metadata, ip_address",
          { count: "exact" }
        )
        .order("timestamp", { ascending: false })
        .range(offset, offset + limit - 1);

      if (filters.action)        query = query.eq("action", filters.action);
      if (filters.actor_id)      query = query.eq("actor_id", filters.actor_id);
      if (filters.actor_type)    query = query.eq("actor_type", filters.actor_type);
      if (filters.resource_type) query = query.eq("resource_type", filters.resource_type);
      if (filters.from)          query = query.gte("timestamp", filters.from);
      if (filters.to)            query = query.lte("timestamp", filters.to);

      const { data: logs, count, error: logsErr } = await query;

      if (logsErr) {
        console.error("audit fetch error:", logsErr);
        return Response.json(
          { error: "Failed to fetch audit logs" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      // ── Resolve actor emails ───────────────────────────────────
      const emailMap: Record<string, string> = {};

      const userActorIds = [...new Set(
        (logs ?? [])
          .filter((l) => l.actor_type === "user" && l.actor_id)
          .map((l) => l.actor_id as string)
      )];

      const adminActorIds = [...new Set(
        (logs ?? [])
          .filter((l) => l.actor_type === "admin" && l.actor_id)
          .map((l) => l.actor_id as string)
      )];

      // Fetch user emails via auth.admin
      for (const uid of userActorIds) {
        try {
          const { data } = await db.auth.admin.getUserById(uid);
          if (data?.user?.email) emailMap[uid] = data.user.email;
        } catch {
          // skip if not found
        }
      }

      // Fetch admin emails from admin_users table
      if (adminActorIds.length > 0) {
        const { data: adminRows } = await db
          .from("admin_users")
          .select("id, email")
          .in("id", adminActorIds);

        for (const row of adminRows ?? []) {
          emailMap[row.id] = row.email;
        }
      }

      // Merge email into each log entry
      const enrichedLogs = (logs ?? []).map((log) => ({
        ...log,
        actor_email: log.actor_id ? (emailMap[log.actor_id] ?? null) : null,
      }));

      return Response.json(
        { logs: enrichedLogs, total: count ?? 0, page, limit },
        { headers: corsHeaders(origin) }
      );
    }

    return Response.json(
      { error: `Unknown action: ${action}` },
      { status: 400, headers: corsHeaders(origin) }
    );

  } catch (err) {
    console.error("admin-audit error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});