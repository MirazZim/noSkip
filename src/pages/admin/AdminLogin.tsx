import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Shield, Eye, EyeOff } from "lucide-react";

export default function AdminLogin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { signIn, admin } = useAdminAuth();
    const navigate = useNavigate();

    if (admin) {
        navigate("/admin", { replace: true });
        return null;
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        const { error } = await signIn(email, password);
        if (error) {
            setError(error);
            setLoading(false);
        } else {
            navigate("/admin", { replace: true });
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <div className="w-full max-w-sm">

                {/* Header */}
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
                        <Shield className="h-7 w-7 text-destructive" />
                    </div>
                    <h1 className="text-2xl font-black tracking-tight">Admin Access</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        NoSkip internal — authorised personnel only
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                            Email
                        </label>
                        <input
                            type="email"
                            autoComplete="username"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 ring-ring transition-shadow"
                            placeholder="admin@noskip.com"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPw ? "text" : "password"}
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-11 text-sm outline-none focus:ring-2 ring-ring transition-shadow"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPw(!showPw)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {showPw
                                    ? <EyeOff className="h-4 w-4" />
                                    : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-foreground py-2.5 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {loading ? "Verifying…" : "Sign in to admin"}
                    </button>
                </form>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    Session expires after 8 hours and when this tab closes.
                </p>
            </div>
        </div>
    );
}