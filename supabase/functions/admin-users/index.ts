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

  const ip        = req.headers.get("x-forwarded-for") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  try {
    const body = await req.json();
    const { action } = body;

    // ── LIST USERS ─────────────────────────────────────────────────
    if (action === "list_users") {
      const page  = Math.max(1, Number(body.page)  || 1);
      const limit = Math.min(50, Number(body.limit) || 20);

      const { data: authData, error: authErr } = await db.auth.admin.listUsers({
        page,
        perPage: limit,
      });

      if (authErr) {
        return Response.json(
          { error: "Failed to fetch users" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      const userIds = authData.users.map((u) => u.id);

      const { data: profiles } = await db
        .from("profiles")
        .select("id, plan, currency_preference, theme_preference, created_at, updated_at")
        .in("id", userIds);

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p) => [p.id, p])
      );

      const users = authData.users.map((u) => ({
        id:                  u.id,
        email:               u.email,
        created_at:          u.created_at,
        last_sign_in_at:     u.last_sign_in_at,
        email_confirmed_at:  u.email_confirmed_at,
        banned_until:        u.banned_until ?? null,
        plan:                profileMap[u.id]?.plan ?? "free",
        currency_preference: profileMap[u.id]?.currency_preference ?? "INR",
        theme_preference:    profileMap[u.id]?.theme_preference ?? "dark",
        profile_updated_at:  profileMap[u.id]?.updated_at ?? null,
      }));

      return Response.json(
        { users, total: authData.total ?? authData.users.length, page, limit },
        { headers: corsHeaders(origin) }
      );
    }

    // ── UPDATE PLAN ────────────────────────────────────────────────
    if (action === "update_plan") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { user_id, plan } = body;
      const VALID_PLANS = ["free", "pro", "team", "enterprise"];

      if (!user_id || !plan) {
        return Response.json(
          { error: "user_id and plan required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }
      if (!VALID_PLANS.includes(plan)) {
        return Response.json(
          { error: `Invalid plan. Must be one of: ${VALID_PLANS.join(", ")}` },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      const { error: updateErr } = await db
        .from("profiles")
        .update({ plan })
        .eq("id", user_id);

      if (updateErr) {
        return Response.json(
          { error: "Failed to update plan" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        "admin.update_plan",
        p_resource_type: "profile",
        p_resource_id:   user_id,
        p_metadata:      { new_plan: plan },
        p_ip_address:    ip,
        p_user_agent:    userAgent,
      });

      return Response.json({ ok: true }, { headers: corsHeaders(origin) });
    }

    // ── BAN USER ───────────────────────────────────────────────────
    if (action === "ban_user") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { user_id } = body;
      if (!user_id) {
        return Response.json(
          { error: "user_id required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      // 876600h = 100 years = permanent ban
      const { error: banErr } = await db.auth.admin.updateUserById(user_id, {
        ban_duration: "876600h",
      });

      if (banErr) {
        console.error("ban error:", banErr);
        return Response.json(
          { error: "Failed to ban user" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        "admin.ban_user",
        p_resource_type: "user",
        p_resource_id:   user_id,
        p_metadata:      { reason: "manual ban by admin" },
        p_ip_address:    ip,
        p_user_agent:    userAgent,
      });

      return Response.json({ ok: true }, { headers: corsHeaders(origin) });
    }

    // ── UNBAN USER ─────────────────────────────────────────────────
    if (action === "unban_user") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { user_id } = body;
      if (!user_id) {
        return Response.json(
          { error: "user_id required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      const { error: unbanErr } = await db.auth.admin.updateUserById(user_id, {
        ban_duration: "none",
      });

      if (unbanErr) {
        console.error("unban error:", unbanErr);
        return Response.json(
          { error: "Failed to unban user" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        "admin.unban_user",
        p_resource_type: "user",
        p_resource_id:   user_id,
        p_metadata:      {},
        p_ip_address:    ip,
        p_user_agent:    userAgent,
      });

      return Response.json({ ok: true }, { headers: corsHeaders(origin) });
    }

    // ── DELETE USER ────────────────────────────────────────────────
    if (action === "delete_user") {
      if (session.role !== "super_admin") {
        return Response.json(
          { error: "Forbidden — super_admin only" },
          { status: 403, headers: corsHeaders(origin) }
        );
      }

      const { user_id } = body;
      if (!user_id) {
        return Response.json(
          { error: "user_id required" },
          { status: 400, headers: corsHeaders(origin) }
        );
      }

      // Audit before delete so we still have the record
      await db.rpc("log_audit_event", {
        p_actor_id:      session.admin_id,
        p_actor_type:    "admin",
        p_action:        "admin.delete_user",
        p_resource_type: "user",
        p_resource_id:   user_id,
        p_metadata:      {},
        p_ip_address:    ip,
        p_user_agent:    userAgent,
      });

      const { error: deleteErr } = await db.auth.admin.deleteUser(user_id);

      if (deleteErr) {
        console.error("delete error:", deleteErr);
        return Response.json(
          { error: "Failed to delete user" },
          { status: 500, headers: corsHeaders(origin) }
        );
      }

      return Response.json({ ok: true }, { headers: corsHeaders(origin) });
    }

    return Response.json(
      { error: `Unknown action: ${action}` },
      { status: 400, headers: corsHeaders(origin) }
    );

  } catch (err) {
    console.error("admin-users error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders(origin) }
    );
  }
});