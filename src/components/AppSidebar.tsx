import { LayoutDashboard, Wallet, Target, Settings, LogOut, Palette, Check, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", path: "/",         icon: LayoutDashboard },
  { title: "Expenses",  path: "/expenses", icon: Wallet          },
  { title: "Habits",    path: "/habits",   icon: Target          },
  { title: "Settings",  path: "/settings", icon: Settings        },
];

export function AppSidebar({ onClose }: { onClose?: () => void }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const { signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-5 border-b border-white/10 shrink-0">
        <span className="font-bold text-lg tracking-tight text-white font-display">
          No<span className="text-primary">Skip</span>
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white transition-colors rounded-xl hover:bg-white/10"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col p-3 gap-1 flex-1">
        {navItems.map(({ title, path, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => { navigate(path); onClose?.(); }}
              className={cn(
                "flex items-center gap-3 px-4 h-11 w-full text-sm font-medium rounded-xl transition-colors duration-200",
                isActive
                  ? "bg-white text-zinc-900"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <Icon className="h-5 w-5" />
              {title}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 shrink-0 space-y-1">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex items-center gap-3 px-4 h-11 w-full text-sm font-medium rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-200">
              <Palette className="h-5 w-5" />
              Theme
              <span
                className="ml-auto h-3.5 w-3.5 rounded-full border border-white/20"
                style={{ background: THEMES.find(t => t.id === theme)?.color }}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-44 p-2">
            <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Choose theme</p>
            <div className="space-y-0.5">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="h-4 w-4 rounded-full border border-border flex-shrink-0" style={{ background: t.color }} />
                  <span className="flex-1 text-left">{t.label}</span>
                  {theme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <button
          onClick={signOut}
          className="flex items-center gap-3 px-4 h-11 w-full text-sm font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors duration-200"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </>
  );
}
