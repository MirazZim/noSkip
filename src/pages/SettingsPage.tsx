import { useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCurrency, CURRENCIES } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Coins, Link2, LogOut, Palette, SlidersHorizontal, Smartphone } from "lucide-react";
import { SmsImportSettings } from "@/components/expenses/SmsImportSettings";
import { LinkedAccounts } from "@/components/auth/LinkedAccounts";
import { ProfileHeader } from "@/components/settings/ProfileHeader";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/SettingsSection";

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "accounts", label: "Accounts", icon: Link2 },
  { id: "sms", label: "SMS", icon: Smartphone },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const { signOut } = useAuth();
  // The tab lives in the URL so provider redirects can land on ?tab=accounts.
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as TabId) : "appearance";
  const selectTab = (id: TabId) => setParams(id === "appearance" ? {} : { tab: id }, { replace: true });

  const handleLogout = async () => {
    try   { await signOut(); toast.success("Signed out"); }
    catch { toast.error("Failed to sign out"); }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="sr-only">Settings</h1>
        <ProfileHeader onLogout={handleLogout} />

        <SegmentedTabs value={tab} onChange={selectTab} />

        <div key={tab} role="tabpanel" className="animate-in fade-in slide-in-from-bottom-2 pt-1 duration-300">
          {tab === "appearance" && <AppearanceTab />}
          {tab === "general" && <GeneralTab />}
          {tab === "accounts" && <AccountsTab onLogout={handleLogout} />}
          {tab === "sms" && (
            <SettingsSection id="sms" title="SMS import" description="Turn bank and wallet SMS into expenses automatically.">
              <div className="space-y-4">
                <SmsImportSettings />
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

// One track with a highlight that slides to the selected tab.
function SegmentedTabs({ value, onChange }: { value: TabId; onChange: (id: TabId) => void }) {
  const refs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  return (
    <div
      role="tablist"
      className="relative grid grid-cols-4 rounded-full border border-border/60 bg-card/70 p-1 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-xl"
    >
      {box && (
        <div
          className="absolute inset-y-1 rounded-full bg-primary shadow-lg shadow-primary/30 transition-all duration-280 ease-spring motion-reduce:transition-none"
          style={{ left: box.left, width: box.width }}
          aria-hidden="true"
        />
      )}
      {TABS.map(({ id, label, icon: Icon }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            ref={(el) => { refs.current[id] = el; }}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={cn(
              "relative z-10 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-medium transition-colors sm:text-sm",
              selected ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="hidden h-4 w-4 sm:block" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection id="appearance" title="Theme" description="Pick the look that suits you.">
      <SettingsGroup className="p-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {THEMES.map((t) => {
            const selected = theme === t.id;
            const ink = t.dark ? "255,255,255" : "0,0,0";
            return (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                aria-pressed={selected}
                className={cn(
                  "rounded-xl border-2 p-1 text-left transition-all",
                  selected ? "border-primary shadow-lg shadow-primary/15" : "border-transparent hover:border-border"
                )}
              >
                {/* Mini window preview */}
                <div className="relative h-11 overflow-hidden rounded-lg border border-black/10 p-1.5" style={{ background: t.color }}>
                  <div className="h-1 w-8 rounded-full" style={{ background: `rgba(${ink},0.35)` }} />
                  <div className="mt-1 h-1 w-12 max-w-full rounded-full" style={{ background: `rgba(${ink},0.15)` }} />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1">
                    <div className="h-2.5 flex-1 rounded" style={{ background: `rgba(${ink},0.08)` }} />
                    <div className="h-2.5 flex-1 rounded" style={{ background: `rgba(${ink},0.08)` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between px-1 pb-0.5 pt-1.5">
                  <span className="text-xs font-medium">{t.label}</span>
                  {selected && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </SettingsGroup>
    </SettingsSection>
  );
}

function GeneralTab() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const queryClient = useQueryClient();

  const handleCurrencyChange = async (value: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ currency_preference: value })
      .eq("id", user.id);
    if (error) {
      toast.error("Failed to update currency");
    } else {
      toast.success("Currency updated");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  return (
    <SettingsSection id="general" title="General">
      <SettingsGroup>
        <SettingsRow
          icon={<Coins className="h-4 w-4" />}
          title="Display currency"
          description="Used for every amount across NoSkip."
        >
          <Select value={currency} onValueChange={handleCurrencyChange}>
            <SelectTrigger className="w-full rounded-xl sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.symbol} — {c.name} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  );
}

function AccountsTab({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="space-y-5">
      <SettingsSection
        id="connected"
        title="Connected accounts"
        description="Sign in to NoSkip with any account you connect here."
      >
        <LinkedAccounts />
      </SettingsSection>

      <SettingsSection id="session" title="Session">
        <SettingsGroup>
          <SettingsRow
            className="flex-row items-center"
            icon={<LogOut className="h-4 w-4" />}
            title="Sign out"
            description="Sign out of NoSkip on this device."
          >
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onLogout}
            >
              Sign out
            </Button>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </div>
  );
}
