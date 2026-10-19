import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, LogOut, Mail, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProviderIcon } from "@/components/auth/ProviderIcon";
import { useAuth } from "@/contexts/AuthContext";
import { useIdentities } from "@/hooks/useIdentities";
import { useUpdateDisplayName } from "@/hooks/useAccount";
import { OAUTH_PROVIDERS } from "@/lib/oauthProviders";
import { getAvatarUrl, getDisplayName, getInitials } from "@/lib/userProfile";

export function ProfileHeader({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const { data: identities = [] } = useIdentities();
  const updateName = useUpdateDisplayName();

  // The cached session's user can predate a newly linked identity, so prefer the
  // freshly fetched list.
  const profileUser = user && identities.length ? { ...user, identities } : user;
  const name = getDisplayName(profileUser);
  const avatarUrl = getAvatarUrl(profileUser);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const startEdit = () => { setDraft(name); setEditing(true); };
  const save = () => {
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    updateName.mutate(next, {
      onSuccess: () => { toast.success("Name updated"); setEditing(false); },
      onError: () => toast.error("Couldn't update name"),
    });
  };

  const hasEmail = identities.some((i) => i.provider === "email");
  const linked = OAUTH_PROVIDERS.filter((p) => identities.some((i) => i.provider === p.id));

  return (
    <div className="relative overflow-hidden rounded-[24px] border border-border/60 bg-card/70 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      {/* Backdrop: accent glow + fading dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(55% 70% at 50% 0%, hsl(var(--primary)/0.26), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          backgroundImage: "radial-gradient(hsl(var(--foreground)/0.12) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          maskImage: "linear-gradient(180deg, black, transparent 60%)",
          WebkitMaskImage: "linear-gradient(180deg, black, transparent 60%)",
        }}
      />

      <div className="relative flex flex-col items-center text-center">
        {/* Avatar with a slowly turning accent ring */}
        <div className="relative h-20 w-20 shrink-0">
          <div
            className="absolute inset-0 animate-[spin_10s_linear_infinite] rounded-full motion-reduce:animate-none"
            style={{
              background:
                "conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--primary)/0.1) 35%, hsl(var(--primary)/0.6) 60%, hsl(var(--primary)/0.1) 85%, hsl(var(--primary)))",
            }}
            aria-hidden="true"
          />
          <Avatar className="absolute inset-[2.5px] h-auto w-auto ring-[3px] ring-card">
            {/* Google avatars refuse hotlinking when a Referer is sent. */}
            <AvatarImage src={avatarUrl} alt={name} referrerPolicy="no-referrer" />
            <AvatarFallback className="bg-primary/15 font-display text-xl font-semibold text-primary">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="mt-3 w-full min-w-0 max-w-sm">
          {editing ? (
            <div className="flex items-center justify-center gap-1">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                maxLength={60}
                className="h-8 rounded-lg text-center"
                autoFocus
                aria-label="Display name"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={save} disabled={updateName.isPending} aria-label="Save name">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button onClick={startEdit} className="group mx-auto flex max-w-full items-center gap-1.5" aria-label="Edit name">
              <h2 className="truncate font-display text-xl font-bold tracking-tight">{name}</h2>
              <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
            </button>
          )}

          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>

          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {user?.created_at && <span>Member since {format(parseISO(user.created_at), "MMM yyyy")}</span>}
          {(hasEmail || linked.length > 0) && (
            <>
              <span aria-hidden="true">·</span>
              <span className="flex items-center gap-1">
                {hasEmail && (
                  <span title="Email & password" className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                    <Mail className="h-3 w-3" />
                  </span>
                )}
                {linked.map((p) => (
                  <span key={p.id} title={p.label} className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
                    <ProviderIcon provider={p.id} className="h-3 w-3" />
                  </span>
                ))}
              </span>
            </>
          )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-1 -top-1 h-9 w-9 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
