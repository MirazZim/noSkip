import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauthProviders";
import { ProviderIcon } from "@/components/auth/ProviderIcon";

export function SocialAuthButtons() {
  const { signInWithProvider } = useAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState<OAuthProvider | null>(null);

  const handleClick = async (provider: OAuthProvider) => {
    setPending(provider);
    const { error } = await signInWithProvider(provider);
    // On success the browser is already navigating to the provider.
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
      setPending(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {OAUTH_PROVIDERS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            className="border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800 hover:text-slate-50"
            disabled={pending !== null}
            onClick={() => handleClick(id)}
            aria-label={`Continue with ${label}`}
          >
            <ProviderIcon provider={id} />
            <span className="text-xs">{pending === id ? "…" : label}</span>
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-500">
        <div className="h-px flex-1 bg-slate-800" />
        or with email
        <div className="h-px flex-1 bg-slate-800" />
      </div>
    </div>
  );
}
