import {
    createContext, useContext, useState,
    useCallback, useEffect, ReactNode,
} from "react";

export type AdminRole = "super_admin" | "support_agent";

interface AdminUser {
    email: string;
    role: AdminRole;
    token: string;
}

interface AdminAuthContextType {
    admin: AdminUser | null;
    loading: boolean;
    isSuperAdmin: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
}

const SESSION_KEY = "noskip_admin_session";
const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [admin, setAdmin] = useState<AdminUser | null>(null);
    const [loading, setLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(SESSION_KEY);
            if (stored) setAdmin(JSON.parse(stored));
        } catch {
            sessionStorage.removeItem(SESSION_KEY);
        } finally {
            setLoading(false);
        }
    }, []);

    const signIn = useCallback(async (
        email: string,
        password: string,
    ): Promise<{ error: string | null }> => {
        try {
            const res = await fetch(
                `https://ruclkyjuvqmomwdfidet.supabase.co/functions/v1/admin-login`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                }
            );

            const data = await res.json();
            if (!res.ok) return { error: data.error ?? "Login failed" };

            const adminUser: AdminUser = {
                email: data.email,
                role: data.role,
                token: data.token,
            };

            // sessionStorage clears when the browser tab closes
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser));
            setAdmin(adminUser);
            return { error: null };
        } catch {
            return { error: "Network error — please try again" };
        }
    }, []);

    const signOut = useCallback(async () => {
        if (!admin) return;
        try {
            await fetch(
                `https://ruclkyjuvqmomwdfidet.supabase.co/functions/v1/admin-logout`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${admin.token}` },
                }
            );
        } finally {
            sessionStorage.removeItem(SESSION_KEY);
            setAdmin(null);
        }
    }, [admin]);

    return (
        <AdminAuthContext.Provider value={{
            admin,
            loading,
            isSuperAdmin: admin?.role === "super_admin",
            signIn,
            signOut,
        }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}