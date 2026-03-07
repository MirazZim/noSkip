import { LayoutDashboard, Wallet, Target, Settings, LogOut, Palette, Check, Zap } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Expenses", url: "/expenses", icon: Wallet },
  { title: "Habits", url: "/habits", icon: Target },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-bold font-display text-sidebar-foreground">NoSkip</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        {/* Theme picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-3 text-sidebar-foreground/70"
            >
              <Palette className="h-4 w-4" />
              Theme
              {/* tiny color swatch of current theme */}
              <span
                className="ml-auto h-3.5 w-3.5 rounded-full border border-border"
                style={{ background: THEMES.find((t) => t.id === theme)?.color }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-44 p-2">
            <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Choose theme</p>
            <div className="space-y-0.5">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span
                    className="h-4 w-4 rounded-full border border-border flex-shrink-0"
                    style={{ background: t.color }}
                  />
                  <span className="flex-1 text-left">{t.label}</span>
                  {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
