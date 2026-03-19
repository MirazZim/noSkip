import { Link } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Shield, LogOut, Users, ScrollText, Flag, Activity } from "lucide-react";

export default function AdminDashboard() {
    const { admin, signOut, isSuperAdmin } = useAdminAuth();

    return (
        <div className="min-h-screen bg-background">

            {/* Top nav */}
            <header className="border-b border-border bg-card px-6 py-4">
                <div className="mx-auto flex max-w-5xl items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10">
                            <Shield className="h-4 w-4 text-destructive" />
                        </div>
                        <div>
                            <p className="text-sm font-black leading-tight">NoSkip Admin</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {admin?.role?.replace("_", " ")}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <p className="hidden text-sm text-muted-foreground sm:block">
                            {admin?.email}
                        </p>
                        <button
                            onClick={signOut}
                            className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Sign out
                        </button>
                    </div>
                </div>
            </header>

            {/* Body */}
            <main className="mx-auto max-w-5xl px-6 py-8">
                <div className="mb-6">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Overview
                    </p>
                    <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <NavCard
                        icon={Users}
                        title="Users"
                        desc="View accounts and profiles"
                        href="/admin/users"
                        available
                    />
                    <NavCard
                        icon={ScrollText}
                        title="Audit Logs"
                        desc="Immutable activity log"
                        href="/admin/audit"
                        available
                    />
                    <NavCard
                        icon={Activity}
                        title="System"
                        desc="Health and stats"
                        href="/admin/system"
                        available={isSuperAdmin}
                    />
                    <NavCard
                        icon={Flag}
                        title="Feature Flags"
                        desc="Control feature rollout"
                        href="/admin/flags"
                        available={isSuperAdmin}
                    />
                </div>

                {!isSuperAdmin && (
                    <p className="mt-5 text-xs text-muted-foreground">
                        🔒 Some sections require super admin access.
                    </p>
                )}
            </main>
        </div>
    );
}

function NavCard({
    icon: Icon, title, desc, href, available,
}: {
    icon: React.ElementType;
    title: string;
    desc: string;
    href: string;
    available: boolean;
}) {
    const inner = (
        <div className={[
            "rounded-2xl border border-border bg-card p-5 transition-colors",
            available
                ? "cursor-pointer hover:border-primary/50 hover:bg-card/80"
                : "opacity-40 cursor-not-allowed pointer-events-none",
        ].join(" ")}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-bold text-sm">
                {title} {!available && "🔒"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
        </div>
    );

    if (!available) return inner;
    return <Link to={href}>{inner}</Link>;
}