import { ReactNode, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AppSidebar } from "@/components/AppSidebar";

const navItems = [
  { path: "/",         label: "Dashboard" },
  { path: "/expenses", label: "Expenses"  },
  { path: "/habits",   label: "Habits"    },
  { path: "/settings", label: "Settings"  },
];

type BoxStyle = { left: number; top: number; width: number; height: number };

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const { signOut } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [box,        setBox]        = useState<BoxStyle | null>(null);
  const [ready,      setReady]      = useState(false);
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

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    try   { await signOut(); toast.success("Signed out"); }
    catch { toast.error("Failed to sign out"); }
  };

  return (
    <div className="min-h-screen bg-background">

      {/* ── Floating navbar ── */}
      <header className="fixed top-4 left-4 right-4 z-50">
        {/* Gradient border wrapper */}
        <div
          className="p-px rounded-2xl"
          style={{ background: "linear-gradient(135deg, hsl(var(--foreground)/0.14), hsl(var(--foreground)/0.03) 50%, hsl(var(--foreground)/0.10))" }}
        >
          <div className="flex items-center h-[50px] rounded-[15px] overflow-hidden bg-background/80 backdrop-blur-3xl shadow-[0_12px_48px_rgba(0,0,0,0.18)]">

            {/* Left slot: hamburger on mobile / logo on desktop */}
            <div
              className="flex items-center h-full shrink-0"
              style={{ borderRight: "1px solid hsl(var(--foreground)/0.06)" }}
            >
              <button
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Toggle menu"
                className="md:hidden flex items-center justify-center w-[50px] h-full text-foreground/50 hover:text-foreground transition-colors"
              >
                {mobileOpen ? <X className="h-[22px] w-[22px]" /> : <Menu className="h-[22px] w-[22px]" />}
              </button>
              <button
                onClick={() => navigate("/")}
                className="hidden md:flex items-center px-5 h-full hover:bg-foreground/[0.03] transition-colors"
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

            {/* Mobile spacer */}
            <div className="flex-1 md:hidden" />

            {/* Right slot: logo on mobile / logout on desktop */}
            <div
              className="flex items-center h-full shrink-0"
              style={{ borderLeft: "1px solid hsl(var(--foreground)/0.06)" }}
            >
              <button
                onClick={() => navigate("/")}
                className="md:hidden flex items-center px-5 h-full hover:bg-foreground/[0.03] transition-colors"
              >
                <span className="flex items-center gap-1 font-display font-bold text-[16px] tracking-tight text-foreground">
                  <Zap
                    className="h-[16px] w-[16px] text-primary fill-primary"
                    style={{ animation: "noskip-zap 2s ease-in-out infinite" }}
                  />
                  No<span className="text-primary">Skip</span>
                </span>
              </button>
              <button
                onClick={handleLogout}
                title="Logout"
                className="hidden md:flex items-center justify-center w-[50px] h-full text-foreground/30 hover:text-foreground transition-colors"
              >
                <LogOut className="h-[15px] w-[15px]" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* ── Mobile backdrop ── */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden transition-opacity duration-300",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* ── Mobile sidebar panel ── */}
      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-64 md:hidden flex flex-col bg-card/90 backdrop-blur-2xl border-r border-white/10 transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <AppSidebar onClose={() => setMobileOpen(false)} />
      </aside>

      {/* ── Page content ── */}
      <main className="pt-24 pb-10 px-3 sm:px-10 md:px-20 lg:px-32 xl:px-48">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
}
