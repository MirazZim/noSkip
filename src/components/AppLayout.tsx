import { ReactNode, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Zap, LayoutDashboard, Wallet, Target, Compass, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const navItems = [
  { path: "/",         label: "Dashboard" },
  { path: "/expenses", label: "Expenses"  },
  { path: "/habits",   label: "Habits"    },
  { path: "/persona",  label: "Persona"   },
  { path: "/settings", label: "Settings"  },
];

const bottomNavItems = [
  { path: "/",         label: "Dashboard", icon: LayoutDashboard },
  { path: "/expenses", label: "Expenses",  icon: Wallet          },
  { path: "/habits",   label: "Habits",    icon: Target          },
  { path: "/persona",  label: "Persona",   icon: Compass         },
  { path: "/settings", label: "Settings",  icon: Settings        },
];

type BoxStyle = { left: number; top: number; width: number; height: number };

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const { signOut } = useAuth();

  const [box,   setBox]   = useState<BoxStyle | null>(null);
  const [ready, setReady] = useState(false);
  const linkRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useLayoutEffect(() => {
    const measure = () => {
      const idx = navItems.findIndex(item => item.path === location.pathname);
      const el  = linkRefs.current[idx];
      if (!el) return;
      setBox({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [location.pathname]);

  useEffect(() => {
    if (box && !ready) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [box, ready]);

  const handleLogout = async () => {
    try   { await signOut(); toast.success("Signed out"); }
    catch { toast.error("Failed to sign out"); }
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Floating navbar ── */}
      <header className="fixed top-4 left-4 right-4 z-50">
        <div
          className="p-px rounded-2xl"
          style={{ background: "linear-gradient(135deg, hsl(var(--foreground)/0.14), hsl(var(--foreground)/0.03) 50%, hsl(var(--foreground)/0.10))" }}
        >
          <div className="flex items-center h-[50px] rounded-[15px] overflow-hidden bg-background/80 backdrop-blur-3xl shadow-[0_12px_48px_rgba(0,0,0,0.18)]">

            {/* Left slot: logo (desktop only) */}
            <div
              className="hidden md:flex items-center h-full shrink-0"
              style={{ borderRight: "1px solid hsl(var(--foreground)/0.06)" }}
            >
              <button
                onClick={() => navigate("/")}
                className="flex items-center px-5 h-full hover:bg-foreground/[0.03] transition-colors"
              >
                <span className="flex items-center gap-1 font-display font-bold text-[16px] tracking-tight text-foreground">
                  <Zap
                    className="h-[16px] w-[16px] text-primary fill-primary"
                    style={{ animation: "noskip-zap 2s ease-in-out infinite" }}
                  />
                  No<span className="text-primary">Skip</span>
                </span>
              </button>
            </div>

            {/* Center nav — desktop */}
            <nav className="hidden md:flex items-center flex-1 justify-center relative h-full">
              {navItems.map(({ path, label }, i) => {
                const isActive = location.pathname === path;
                return (
                  <button
                    key={path}
                    ref={el => { linkRefs.current[i] = el; }}
                    onClick={() => navigate(path)}
                    className={cn(
                      "relative h-full px-5 text-[13px] font-medium tracking-wide transition-all duration-200",
                      isActive ? "text-foreground" : "text-foreground/35 hover:text-foreground/65"
                    )}
                  >
                    {label}
                  </button>
                );
              })}

              {/* Glowing underline indicator */}
              {box && (
                <div
                  className="absolute bottom-0 h-[2px] rounded-t-full pointer-events-none"
                  style={{
                    left: box.left,
                    width: box.width,
                    background: "linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)",
                    boxShadow: "0 0 10px hsl(var(--primary)/0.7)",
                    transition: ready
                      ? "left 420ms cubic-bezier(0.4,0,0.2,1), width 420ms cubic-bezier(0.4,0,0.2,1)"
                      : "none",
                  }}
                />
              )}
            </nav>

            {/* Mobile: logo centered */}
            <div className="flex md:hidden flex-1 items-center justify-center h-full">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 font-display font-bold text-[16px] tracking-tight text-foreground"
              >
                <Zap
                  className="h-[16px] w-[16px] text-primary fill-primary"
                  style={{ animation: "noskip-zap 2s ease-in-out infinite" }}
                />
                No<span className="text-primary">Skip</span>
              </button>
            </div>

            {/* Right slot: logout (desktop only) */}
            <div
              className="hidden md:flex items-center h-full shrink-0"
              style={{ borderLeft: "1px solid hsl(var(--foreground)/0.06)" }}
            >
              <button
                onClick={handleLogout}
                title="Logout"
                className="flex items-center justify-center w-[50px] h-full text-foreground/30 hover:text-foreground transition-colors"
              >
                <LogOut className="h-[15px] w-[15px]" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ── */}
      <nav className="fixed bottom-5 left-5 right-5 z-50 md:hidden">
        {/* Gradient border using foreground var — matches top navbar */}
        <div
          className="p-px rounded-[36px]"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--foreground)/0.14), hsl(var(--foreground)/0.03) 50%, hsl(var(--foreground)/0.10))",
          }}
        >
          {/* Glass body — same material as top navbar */}
          <div
            className="relative flex items-center justify-around h-[62px] rounded-[35px] overflow-hidden bg-background/75 backdrop-blur-3xl"
            style={{
              boxShadow: "0 12px 48px rgba(0,0,0,0.18), inset 0 1px 0 hsl(var(--foreground)/0.06)",
            }}
          >
            {/* Subtle top rim highlight */}
            <div
              className="absolute top-0 left-8 right-8 h-px pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--foreground)/0.10) 30%, hsl(var(--foreground)/0.10) 70%, transparent)",
              }}
            />

            {bottomNavItems.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  aria-label={label}
                  className="relative flex items-center justify-center flex-1 h-full"
                >
                  {isActive && (
                    <span
                      className="absolute inset-y-[9px] inset-x-[5px] rounded-[22px] bg-foreground/[0.07]"
                      style={{
                        boxShadow: "inset 0 1px 0 hsl(var(--foreground)/0.08)",
                      }}
                    />
                  )}
                  <Icon
                    className={cn(
                      "relative h-[21px] w-[21px] transition-all duration-200",
                      isActive ? "text-foreground" : "text-foreground/35"
                    )}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main className="pt-24 pb-28 md:pb-10 px-3 sm:px-10 md:px-20 lg:px-32 xl:px-48">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
}
