import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useCurrency, CURRENCIES } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const { theme, setTheme } = useTheme();
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
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Settings</h1>
          <p className="text-muted-foreground">Manage your preferences</p>
        </div>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="mb-3 block">Theme</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:scale-105",
                    theme === t.id
                      ? "border-primary shadow-md shadow-primary/20"
                      : "border-border hover:border-muted-foreground/40"
                  )}
                >
                  {/* Mini preview swatch */}
                  <span
                    className="h-8 w-8 rounded-full border border-white/10 flex items-center justify-center"
                    style={{ background: t.color }}
                  >
                    {theme === t.id && <Check className="h-4 w-4 text-white" />}
                  </span>
                  <span className="text-xs font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Currency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Currency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-w-xs">
              <Label>Display Currency</Label>
              <Select value={currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
