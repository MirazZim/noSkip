import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface Props {
    children: React.ReactNode;
    requiresSuper?: boolean;
}

export function AdminProtectedRoute({ children, requiresSuper = false }: Props) {
    const { admin, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (!admin) return <Navigate to="/admin/login" replace />;

    if (requiresSuper && admin.role !== "super_admin") {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <div className="text-center space-y-2">
                    <p className="text-lg font-bold">Access Denied</p>
                    <p className="text-sm text-muted-foreground">
                        This section requires super admin access.
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}