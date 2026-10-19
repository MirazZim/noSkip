import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/auth/ProviderIcon";
import { SettingsGroup, SettingsRow } from "@/components/settings/SettingsSection";
import { useIdentities, useLinkIdentity, useUnlinkIdentity } from "@/hooks/useIdentities";
import { OAUTH_PROVIDERS, consumeAuthRedirectError } from "@/lib/oauthProviders";

export function LinkedAccounts() {
  const { data: identities = [], isLoading } = useIdentities();
  const link = useLinkIdentity();
  const unlink = useUnlinkIdentity();

  // e.g. "Identity is already linked to another user" after the provider redirect.
  useEffect(() => {
    const description = consumeAuthRedirectError();
    if (description) toast.error(`Couldn't link account: ${description}`);
  }, []);

  const canUnlink = identities.length > 1;

  return (
    <SettingsGroup>
      {OAUTH_PROVIDERS.map(({ id, label }) => {
        const identity = identities.find((i) => i.provider === id);
        const detail = identity?.identity_data?.email ?? identity?.identity_data?.user_name;
        return (
          <SettingsRow
            key={id}
            className="flex-row items-center"
            icon={<ProviderIcon provider={id} />}
            title={label}
            description={
              identity ? (
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">Connected{detail ? ` · ${detail}` : ""}</span>
                </span>
              ) : (
                "Not connected"
              )
            }
          >
            {identity ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl text-muted-foreground hover:text-destructive"
                disabled={!canUnlink || unlink.isPending}
                title={canUnlink ? undefined : "This is your only way to sign in"}
                onClick={() =>
                  unlink.mutate(identity, {
                    onSuccess: () => toast.success(`${label} disconnected`),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                Disconnect
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={isLoading || link.isPending}
                onClick={() => link.mutate(id, { onError: (e) => toast.error(e.message) })}
              >
                Connect
              </Button>
            )}
          </SettingsRow>
        );
      })}
    </SettingsGroup>
  );
}
