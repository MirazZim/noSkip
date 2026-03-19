import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }      from "../_shared/cors.ts";
import { verifyAdminToken } from "../_shared/adminAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type EntityType = "user" | "plan" | "global";

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

    // ── LIST FLAGS ─────────────────────────────────────────────────
    if (action === "list_flags") {
      const { data: flags, error: flagsErr } = await db
        .from("feature_flags")
        .select("id, flag_name, entity_type, entity_id, enabled, created_at, updated_at")
        .order("flag_name", { ascending: true })
        .order("entity_type", { ascending: true });

      if (flagsErr) {
        return Response.json(
          { error: "Failed to fetch flags" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      return Response.json(
        { flags: flags ?? [] },
        { headers: corsHeaders(origin) }
      );
    }

    // ── UPSERT FLAG ────────────────────────────────────────────────
    // Only super_admin can modify flags
    if (action === "upsert_flag") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { flag_name, entity_type, entity_id, enabled } = body;
      const VALID_ENTITY_TYPES: EntityType[] = ["user", "plan", "global"];

      if (!flag_name || !entity_type) {
        return Response.json(
          { error: "flag_name and entity_type required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      if (!VALID_ENTITY_TYPES.includes(entity_type)) {
        return Response.json(
          { error: "entity_type must be user, plan, or global" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      if (typeof enabled !== "boolean") {
        return Response.json(
          { error: "enabled must be a boolean" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      // Can't use standard upsert — unique index uses COALESCE(entity_id, '__null__')
      // So: find existing row, then insert or update
      const entityIdValue = entity_id ?? null;

      let existingQuery = db
        .from("feature_flags")
        .select("id")
        .eq("flag_name", flag_name)
        .eq("entity_type", entity_type);

      if (entityIdValue === null) {
        existingQuery = existingQuery.is("entity_id", null);
      } else {
        existingQuery = existingQuery.eq("entity_id", entityIdValue);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      let upsertErr;
      if (existing) {
        const { error } = await db
          .from("feature_flags")
          .update({ enabled })
          .eq("id", existing.id);
        upsertErr = error;
      } else {
        const { error } = await db
          .from("feature_flags")
          .insert({ flag_name, entity_type, entity_id: entityIdValue, enabled });
        upsertErr = error;
      }

      if (upsertErr) {
        console.error("upsert flag error:", upsertErr);
        return Response.json(
          { error: "Failed to save flag" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      const ip = req.headers.get("x-forwarded-for") ?? "unknown";
      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        existing ? "admin.flag_updated" : "admin.flag_created",
        p_resource_type: "feature_flag",
        p_resource_id:   `${flag_name}:${entity_type}:${entityIdValue ?? "global"}`,
        p_metadata:      { flag_name, entity_type, entity_id: entityIdValue, enabled },
        p_ip_address:    ip,
        p_user_agent:    req.headers.get("user-agent") ?? "unknown",
      });

      return Response.json(
        { ok: true },
        { headers: corsHeaders(origin) }
      );
    }

    // ── DELETE FLAG ────────────────────────────────────────────────
    if (action === "delete_flag") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { flag_id } = body;
      if (!flag_id) {
        return Response.json(
          { error: "flag_id required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      // Fetch flag info before deleting (for audit log)
      const { data: flag } = await db
        .from("feature_flags")
        .select("flag_name, entity_type, entity_id")
        .eq("id", flag_id)
        .single();

      const { error: deleteErr } = await db
        .from("feature_flags")
        .delete()
        .eq("id", flag_id);

      if (deleteErr) {
        return Response.json(
          { error: "Failed to delete flag" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      const ip = req.headers.get("x-forwarded-for") ?? "unknown";
      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        "admin.flag_deleted",
        p_resource_type: "feature_flag",
        p_resource_id:   flag_id,
        p_metadata:      flag ?? {},
        p_ip_address:    ip,
        p_user_agent:    req.headers.get("user-agent") ?? "unknown",
      });

      return Response.json(
        { ok: true },
        { headers: corsHeaders(origin) }
      );
    }

    return Response.json(
      { error: `Unknown action: ${action}` },
      { status: 400, headers: corsHeaders(origin) }
    );

  } catch (err) {
    console.error("admin-flags error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});