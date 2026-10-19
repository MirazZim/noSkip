import { useEffect, useState } from "react";
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
import { Check, Coins, Link2, LogOut, Palette, SlidersHorizontal, Smartphone, UserRound } from "lucide-react";
import { SmsImportSettings } from "@/components/expenses/SmsImportSettings";
import { LinkedAccounts } from "@/components/auth/LinkedAccounts";
import { ProfileCard } from "@/components/settings/ProfileCard";
import { SettingsGroup, SettingsRow, SettingsSection } from "@/components/settings/SettingsSection";

const SECTIONS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { id: "connected", label: "Connected accounts", icon: Link2 },
  { id: "sms", label: "SMS import", icon: Smartphone },
  { id: "account", label: "Account", icon: UserRound },
];

// Highlights the section currently in the upper part of the viewport.
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  return active;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { currency } = useCurrency();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const active = useActiveSection();

  const handleLogout = async () => {
    try   { await signOut(); toast.success("Signed out"); }
    catch { toast.error("Failed to sign out"); }
  };

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
    <AppLayout>
      <div className="space-y-8">
        <div className="px-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Your profile, preferences and connected accounts</p>
        </div>

        <ProfileCard />

        <div className="grid gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
          {/* Section nav — desktop */}
          <nav className="hidden md:block">
            <ul className="sticky top-28 space-y-1">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <button
                    onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      active === id
                        ? "bg-foreground/[0.06] font-medium text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active === id && "text-primary")} />
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">
            <SettingsSection id="appearance" title="Appearance" description="Pick the look that suits you.">
              <SettingsGroup className="p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {THEMES.map((t) => {
                    const selected = theme === t.id;
                    const ink = t.dark ? "255,255,255" : "0,0,0";
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        aria-pressed={selected}
                        className={cn(
                          "group rounded-2xl border-2 p-1.5 text-left transition-all",
                          selected
                            ? "border-primary shadow-lg shadow-primary/15"
                            : "border-transparent hover:border-border"
                        )}
                      >
                        {/* Mini window preview */}
                        <div
                          className="relative h-16 overflow-hidden rounded-xl border border-black/10 p-2"
                          style={{ background: t.color }}
                        >
                          <div className="h-1.5 w-10 rounded-full" style={{ background: `rgba(${ink},0.35)` }} />
                          <div className="mt-1.5 h-1.5 w-16 rounded-full" style={{ background: `rgba(${ink},0.15)` }} />
                          <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                            <div className="h-4 flex-1 rounded-md" style={{ background: `rgba(${ink},0.08)` }} />
                            <div className="h-4 flex-1 rounded-md" style={{ background: `rgba(${ink},0.08)` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between px-1.5 pb-0.5 pt-2">
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

            <SettingsSection id="preferences" title="Preferences">
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

            <SettingsSection
              id="connected"
              title="Connected accounts"
              description="Sign in to NoSkip with any account you connect here."
            >
              <LinkedAccounts />
            </SettingsSection>

            <SettingsSection id="sms" title="SMS import" description="Turn bank and wallet SMS into expenses automatically.">
              <div className="space-y-4">
                <SmsImportSettings />
              </div>
            </SettingsSection>

            <SettingsSection id="account" title="Account">
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
                    onClick={handleLogout}
                  >
                    Sign out
                  </Button>
                </SettingsRow>
              </SettingsGroup>
            </SettingsSection>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
