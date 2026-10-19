import { useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { CalendarDays, Check, Clock, Mail, Pencil, X } from "lucide-react";
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

export function ProfileCard() {
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
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Cover */}
      <div
        className="h-24 sm:h-28"
        style={{
          background:
            "radial-gradient(120% 160% at 0% 0%, hsl(var(--primary)/0.38), transparent 60%)," +
            "radial-gradient(90% 140% at 100% 0%, hsl(var(--primary)/0.16), transparent 60%)," +
            "linear-gradient(180deg, hsl(var(--foreground)/0.03), transparent)",
        }}
      />

      <div className="-mt-10 flex flex-col gap-4 px-5 pb-5 sm:-mt-12 sm:flex-row sm:items-end sm:px-6">
        <Avatar className="h-20 w-20 shadow-xl ring-4 ring-card sm:h-24 sm:w-24">
          {/* Google avatars refuse hotlinking when a Referer is sent. */}
          <AvatarImage src={avatarUrl} alt={name} referrerPolicy="no-referrer" />
          <AvatarFallback className="bg-primary/15 font-display text-2xl font-semibold text-primary">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 sm:pb-1">
          {editing ? (
            <div className="flex max-w-sm items-center gap-1">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
                maxLength={60}
                className="h-9 rounded-xl"
                autoFocus
                aria-label="Display name"
              />
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={save} disabled={updateName.isPending} aria-label="Save name">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditing(false)} aria-label="Cancel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-1.5">
              <h2 className="truncate font-display text-xl font-semibold tracking-tight sm:text-2xl">{name}</h2>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100"
                onClick={startEdit}
                aria-label="Edit name"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground sm:px-6">
        {user?.created_at && (
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Member since {format(parseISO(user.created_at), "MMM yyyy")}
          </span>
        )}
        {user?.last_sign_in_at && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Last sign-in {formatDistanceToNow(parseISO(user.last_sign_in_at), { addSuffix: true })}
          </span>
        )}
        {(hasEmail || linked.length > 0) && (
          <span className="flex items-center gap-1.5">
            Signs in with
            <span className="flex items-center gap-1">
              {hasEmail && (
                <span title="Email & password" className="flex h-5 w-5 items-center justify-center rounded-md bg-muted">
                  <Mail className="h-3 w-3" />
                </span>
              )}
              {linked.map((p) => (
                <span key={p.id} title={p.label} className="flex h-5 w-5 items-center justify-center rounded-md bg-muted">
                  <ProviderIcon provider={p.id} className="h-3 w-3" />
                </span>
              ))}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
