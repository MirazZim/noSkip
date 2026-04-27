import { ReactNode, useState, useRef, useEffect, useLayoutEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X, LogOut } from "lucide-react";
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

const glassPill =
  "bg-white/[0.06] rounded-2xl ring-1 ring-inset ring-white/[0.08] backdrop-blur-2xl shadow-lg shadow-black/20";

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

      {/* ── Floating top bar ── */}
      <header className="fixed top-4 left-4 right-4 z-50 flex items-center justify-between gap-3">

        {/* Logo pill — right on mobile (order-2), left on desktop */}
        <button
          onClick={() => navigate("/")}
          className={cn("order-2 md:order-none flex items-center h-12 px-5", glassPill, "hover:bg-white/[0.08] transition-colors")}
        >
          <span className="font-bold text-lg tracking-tight text-foreground font-display">
            No<span className="text-primary">Skip</span>
          </span>
        </button>

        {/* Center nav pill — desktop only */}
        <nav className={cn("hidden md:flex items-center relative p-2", glassPill)}>
          {navItems.map(({ path, label }, i) => {
            const isActive = location.pathname === path;
            return (
              <button
                key={path}
                ref={el => { linkRefs.current[i] = el; }}
                onClick={() => navigate(path)}
                className={cn(
                  "relative z-10 grid items-center h-9 px-5 text-sm font-medium tracking-wide rounded-xl transition-colors duration-300",
                  isActive ? "text-zinc-900" : "text-foreground/50 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}

          {/* Sliding active pill */}
          {box && (
            <div
              className="absolute z-0 pointer-events-none"
              style={{
                left: box.left, top: box.top, width: box.width, height: box.height,
                transition: ready
                  ? "left 550ms cubic-bezier(0.34,1.56,0.64,1), width 550ms cubic-bezier(0.34,1.56,0.64,1)"
                  : "none",
              }}
            >
              <div
                key={location.pathname}
                className={cn(
                  "relative w-full h-full bg-white rounded-xl overflow-hidden",
                  "shadow-[0_0_24px_2px_rgba(255,255,255,0.25),0_6px_22px_rgba(168,85,247,0.45)]",
                  ready && "animate-pill-morph"
                )}
              >
                <span className="absolute inset-y-0 -left-1/3 w-1/2 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-pill-shine" />
              </div>
            </div>
          )}
        </nav>

        {/* Logout pill — desktop only */}
        <button
          onClick={handleLogout}
          className={cn(
            "hidden md:flex items-center gap-2 h-12 px-5 text-sm font-medium text-foreground/80 hover:text-foreground",
            glassPill, "hover:bg-white/[0.08] transition-colors"
          )}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>

        {/* Hamburger — mobile left (order-1) */}
        <button
          onClick={() => setMobileOpen(v => !v)}
          className={cn(
            "order-1 md:hidden flex items-center justify-center h-12 w-12 text-foreground/80 hover:text-foreground",
            glassPill, "hover:bg-white/[0.08] transition-colors"
          )}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
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
      <main className="pt-24 pb-10 px-8 sm:px-16 md:px-24 lg:px-36 xl:px-56">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
}
