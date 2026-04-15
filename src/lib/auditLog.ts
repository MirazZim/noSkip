import { supabase } from "@/integrations/supabase/client";

type AuditAction =
    | "user.login"
    | "user.logout"
    | "user.signup"
    | "export.requested";

interface AuditPayload {
    action: AuditAction;
    resource_type?: string;
    resource_id?: string;
    metadata?: Record<string, unknown>;
}

export async function auditLog(payload: AuditPayload): Promise<void> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase.rpc("log_audit_event", {
            p_actor_id: user.id,
            p_actor_type: "user",
            p_action: payload.action,
            p_resource_type: payload.resource_type ?? "client",
            p_resource_id: payload.resource_id ?? null,
            p_metadata: payload.metadata ?? {},
        });
        // Fire and forget — never block the UI
    } catch {
        // Silent fail — audit logging must never break the app
    }
}