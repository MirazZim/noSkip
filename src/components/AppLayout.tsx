import { ReactNode, useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, Zap, LayoutDashboard, Wallet, Target, Compass, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const navItems = [
  { path: "/", label: "Dashboard" },
  { path: "/expenses", label: "Expenses" },
  { path: "/habits", label: "Habits" },
  { path: "/persona", label: "Persona" },
  { path: "/settings", label: "Settings" },
];

const bottomNavItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/expenses", label: "Expenses", icon: Wallet },
  { path: "/habits", label: "Habits", icon: Target },
  { path: "/persona", label: "Persona", icon: Compass },
  { path: "/settings", label: "Settings", icon: Settings },
];

type BoxStyle = { left: number; top: number; width: number; height: number };

// Liquid pill: stretches between tabs using a sine-wave envelope on the fractional position
const getPillStyle = (fi: number) => {
  const n = bottomNavItems.length;
  const tabPct = 100 / n;
  const frac = fi - Math.floor(fi);
  const w = (tabPct - 2) + tabPct * 0.7 * Math.sin(frac * Math.PI);
  const center = (fi + 0.5) * tabPct;
  return { left: `${center - w / 2}%`, width: `${w}%` };
};

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [box, setBox] = useState<BoxStyle | null>(null);
  const [ready, setReady] = useState(false);
  const linkRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Bottom nav scrub-drag state
  const [floatIdx, setFloatIdx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const dragRef = useRef({ startX: 0, active: false, moved: false, startIdx: 0 });
  const snapIdxRef = useRef<number | null>(null);
  const navBodyRef = useRef<HTMLDivElement>(null);
  const activeIdxRef = useRef(0);

  const activeIdx = bottomNavItems.findIndex(item => item.path === location.pathname);
  activeIdxRef.current = activeIdx;
  // Continuous float position: drives pill geometry + icon brightness
  const displayFi = (isDragging && floatIdx !== null) ? floatIdx : activeIdx;
  const pillStyle = getPillStyle(displayFi);

  const onNavPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    dragRef.current = { startX: e.clientX, active: true, moved: false, startIdx: activeIdxRef.current };
    setIsPressed(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onNavPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < 10) return;
    d.moved = true;
    setIsPressed(false);
    setIsDragging(true);
    const navWidth = navBodyRef.current?.offsetWidth ?? (window.innerWidth - 40);
    const tabWidth = navWidth / bottomNavItems.length;
    const fi = Math.max(0, Math.min(bottomNavItems.length - 1, d.startIdx + dx / tabWidth));
    snapIdxRef.current = Math.round(fi);
    setFloatIdx(fi);
  }, []);

  const onNavPointerUp = useCallback(() => {
    const d = dragRef.current;
    d.active = false;
    setIsPressed(false);
    setIsDragging(false);
    if (d.moved && snapIdxRef.current !== null) {
      navigate(bottomNavItems[snapIdxRef.current].path);
    }
    snapIdxRef.current = null;
    setFloatIdx(null);
  }, [navigate]);

  const onNavClick = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const idx = navItems.findIndex(item => item.path === location.pathname);
      const el = linkRefs.current[idx];
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
    try { await signOut(); toast.success("Signed out"); }
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
      <nav
        className="fixed bottom-5 left-5 right-5 z-50 md:hidden"
        onPointerDown={onNavPointerDown}
        onPointerMove={onNavPointerMove}
        onPointerUp={onNavPointerUp}
        onPointerCancel={onNavPointerUp}
        onClick={onNavClick}
        style={{
          touchAction: "none",
          transform: isPressed ? "scale(0.97)" : "scale(1)",
          transition: isPressed
            ? "transform 60ms ease-out"
            : "transform 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Gradient border */}
        <div
          className="p-px rounded-[40px]"
          style={{
            background: isDragging
              ? "linear-gradient(135deg, hsl(var(--foreground)/0.22), hsl(var(--foreground)/0.06) 50%, hsl(var(--foreground)/0.18))"
              : "linear-gradient(135deg, hsl(var(--foreground)/0.14), hsl(var(--foreground)/0.03) 50%, hsl(var(--foreground)/0.10))",
            transition: "background 200ms ease",
          }}
        >
          {/* Glass body */}
          <div
            ref={navBodyRef}
            className="relative flex items-center justify-around h-[72px] rounded-[39px] overflow-hidden backdrop-blur-3xl"
            style={{
              background: isDragging ? "hsl(var(--background)/0.65)" : "hsl(var(--background)/0.75)",
              boxShadow: isDragging
                ? "0 16px 52px rgba(0,0,0,0.24), inset 0 1px 0 hsl(var(--foreground)/0.08)"
                : "0 12px 48px rgba(0,0,0,0.18), inset 0 1px 0 hsl(var(--foreground)/0.06)",
              transition: "background 200ms ease, box-shadow 200ms ease",
            }}
          >
            {/* Top rim highlight */}
            <div
              className="absolute top-0 left-8 right-8 h-px pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(var(--foreground)/0.10) 30%, hsl(var(--foreground)/0.10) 70%, transparent)",
              }}
            />

            {/* Liquid pill — stretches as it passes between tabs */}
            <div
              className="absolute inset-y-[10px] rounded-[26px] bg-foreground/[0.07] pointer-events-none"
              style={{
                left: pillStyle.left,
                width: pillStyle.width,
                boxShadow: "inset 0 1px 0 hsl(var(--foreground)/0.08)",
                transition: isDragging
                  ? "none"
                  : "left 500ms cubic-bezier(0.34, 1.56, 0.64, 1), width 500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            />

            {bottomNavItems.map(({ path, label, icon: Icon }, i) => {
              // Continuous brightness: full at current float, fades linearly to 0.35 one tab away
              const dist = Math.abs(displayFi - i);
              const brightness = Math.max(0, 1 - dist);
              const opacity = 0.35 + 0.65 * brightness;
              const sw = 1.5 + 0.5 * brightness;
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  aria-label={label}
                  className="relative flex items-center justify-center flex-1 h-full"
                >
                  <Icon
                    className="relative h-[24px] w-[24px]"
                    style={{
                      color: `hsl(var(--foreground) / ${opacity})`,
                      strokeWidth: sw,
                      transition: isDragging ? "none" : "color 300ms ease",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Page content ── */}
      <main className="pt-24 pb-32 md:pb-10 px-3 sm:px-10 md:px-20 lg:px-32 xl:px-48">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </main>

    </div>
  );
}
