import { useMemo, useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { useHabits, useHabitCompletions, calculateStreak } from "@/hooks/useHabits";
import { useExpenses, CATEGORY_COLORS, type ExpenseCategory } from "@/hooks/useExpenses";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { useCurrency } from "@/hooks/useCurrency";
import { DashboardExpenseCharts } from "@/components/dashboard/DashboardExpenseCharts";
import { cn } from "@/lib/utils";

// ─── SEMANTIC ACCENT COLORS (universal, theme-independent) ───────────────────
// These convey meaning (danger = red, warning = gold, perfect = emerald)
// and stay constant across themes. Everything structural uses CSS variables.
const A = {
  emerald: "#10b981",   // habit complete / life score excellent
  gold: "#f59e0b",   // warning / medium score
  red: "#FF3B5C",   // danger / over budget / missed
  orange: "#FB923C",   // flame / streak
  pink: "#F472B6",   // confetti
  blue: "#38BDF8",   // motivation fallback
} as const;

// ─── UTILS ────────────────────────────────────────────────────────────────────
function getTimeState() {
  const h = new Date().getHours();
  if (h < 9) return { urgency: "low", label: "Early Bird" };
  if (h < 12) return { urgency: "low", label: "Morning" };
  if (h < 17) return { urgency: "medium", label: "Afternoon" };
  if (h < 20) return { urgency: "high", label: "Evening" };
  return { urgency: "danger", label: "Tonight" };
}

function getMotivation(score: number, done: number, total: number, urgency: string) {
  if (total > 0 && done === total)
    return { msg: "Perfect day. You're unstoppable.", icon: "⚡", glow: A.emerald };
  if (urgency === "danger" && done < total)
    return { msg: `${total - done} habit${total - done > 1 ? "s" : ""} left. Don't break the chain.`, icon: "🔥", glow: A.red };
  if (score >= 80)
    return { msg: "You're in the top tier of your week.", icon: "🎯", glow: "hsl(var(--primary))" };
  if (score >= 60)
    return { msg: "Good momentum. Push through the rest.", icon: "💪", glow: A.orange };
  return { msg: "Every hour is a new start. Go.", icon: "🌀", glow: A.blue };
}

// ─── ARC RING ─────────────────────────────────────────────────────────────────
function Ring({
  pct = 0, size = 120, stroke = 8, color, pulse = false, children,
}: {
  pct: number; size?: number; stroke?: number; color: string;
  pulse?: boolean; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 1));
  const cx = size / 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track uses --muted so it adapts to every theme */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)",
            filter: `drop-shadow(0 0 ${pulse ? 12 : 6}px ${color}90)`,
            animation: pulse ? "dshRingPulse 1.8s ease-in-out infinite" : "none",
          }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {children}
      </div>
    </div>
  );
}

// ─── IOS DAY RING ───────────────────────────────────────────────────────────────
function IOSDayRing({ pct, day, isToday }: { pct: number | null; day: string; isToday: boolean }) {
  const isUpcoming = pct === null;
  const val = pct ?? 0;
  const isMissed = val === 0 && !isUpcoming && !isToday;

  // ── Responsive ring sizing via CSS custom property injected inline ──────────
  // sm: 32px  |  md: 40px  |  lg: 48px  → driven by clamp
  const SIZE = 44; // SVG canvas — we scale the outer wrapper via CSS transform
  const R = 15;
  const C = 2 * Math.PI * R;
  const dash = Math.min(1, val) * C;

  const ringColor = isUpcoming ? "transparent"
    : isMissed ? A.red
      : val >= 1 ? A.emerald
        : "hsl(var(--primary))";

  const trackFill = isUpcoming ? "hsl(var(--muted) / 0.5)"
    : isMissed ? `${A.red}12`
      : "hsl(var(--primary) / 0.08)";

  const centerLabel = isUpcoming ? "·" : val >= 1 ? "✓" : isMissed ? "✕" : `${Math.round(val * 100)}`;

  const centerColor = isUpcoming ? "hsl(var(--muted-foreground) / 0.4)"
    : isMissed ? A.red
      : val >= 1 ? A.emerald
        : "hsl(var(--primary))";

  const isBig = val >= 1 || isMissed; // ✓ / ✕ need bigger font

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      // flex: 1 so all 7 columns share space equally
      gap: "clamp(3px, 0.7vw, 6px)",
      flex: 1,
      minWidth: 0,
    }}>
      {/* ── Scaled ring wrapper ──────────────────────────────────────── */}
      <div style={{
        // Scale SVG canvas to fit available space; clamp gives sm→lg sizes
        width: "clamp(28px, 6vw, 48px)",
        height: "clamp(28px, 6vw, 48px)",
        position: "relative",
        flexShrink: 0,
        filter: isToday
          ? `drop-shadow(0 0 clamp(5px,1vw,9px) hsl(var(--primary) / 0.55))`
          : undefined,
        transition: "filter 0.3s ease",
      }}>
        {/* SVG is fixed at SIZE×SIZE, we scale down with CSS */}
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{
            transform: "rotate(-90deg)",
            display: "block",
            width: "100%",
            height: "100%",
          }}
        >
          {/* Track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={R}
            fill={trackFill}
            stroke={isUpcoming ? "hsl(var(--border) / 0.55)" : "none"}
            strokeWidth={1.5}
          />
          {/* Progress arc */}
          {!isUpcoming && val > 0 && (
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth={4}
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
              style={{
                transition: "stroke-dasharray 0.7s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            />
          )}
        </svg>

        {/* Center label — sized relative to ring wrapper */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isBig
            ? "clamp(8px, 1.8vw, 13px)"
            : "clamp(6px, 1.4vw, 10px)",
          fontWeight: 800,
          color: centerColor,
          fontFamily: isBig ? "'DM Sans', sans-serif" : "'DM Mono', monospace",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          // prevent label overflow on tiny screens
          overflow: "hidden",
        }}>
          {centerLabel}
        </div>
      </div>

      {/* Day label */}
      <span style={{
        fontSize: "clamp(7px, 1.2vw, 10px)",
        fontWeight: isToday ? 800 : 500,
        color: isToday
          ? "hsl(var(--foreground))"
          : "hsl(var(--muted-foreground))",
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        lineHeight: 1,
        // single letter — never wraps
        whiteSpace: "nowrap",
      }}>
        {day}
      </span>

      {/* Today indicator dot */}
      <div style={{
        width: "clamp(3px, 0.5vw, 5px)",
        height: "clamp(3px, 0.5vw, 5px)",
        borderRadius: "50%",
        background: isToday ? "hsl(var(--primary))" : "transparent",
        flexShrink: 0,
      }} />
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterStr = format(subDays(today, 1), "yyyy-MM-dd");

  const { data: habits } = useHabits();
  const { data: completions } = useHabitCompletions();
  const { data: expenses } = useExpenses(today);
  const { formatAmount } = useCurrency();
  useHabitReminders(habits, completions);

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeHabits = useMemo(() => habits?.filter(h => h.is_active) ?? [], [habits]);

  const completedTodaySet = useMemo(() => {
    if (!completions) return new Set<string>();
    return new Set(completions.filter(c => c.date === todayStr).map(c => c.habit_id));
  }, [completions, todayStr]);

  const todayExpenses = useMemo(() => expenses?.filter(e => e.date === todayStr) ?? [], [expenses, todayStr]);
  const yesterExpenses = useMemo(() => expenses?.filter(e => e.date === yesterStr) ?? [], [expenses, yesterStr]);
  const todayTotal = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const yesterTotal = yesterExpenses.reduce((s, e) => s + e.amount, 0);

  const doneCount = completedTodaySet.size;
  const habitPct = activeHabits.length ? doneCount / activeHabits.length : 0;
  const spendDelta = yesterTotal ? Math.round(((todayTotal - yesterTotal) / yesterTotal) * 100) : 0;

  // ── Life Score ────────────────────────────────────────────────────────────
  const habitScore = Math.round(habitPct * 60);
  const spendScore = spendDelta <= 0 ? 40 : spendDelta <= 20 ? 30 : spendDelta <= 50 ? 20 : 10;
  const lifeScore = habitScore + spendScore;
  // Life score color: uses semantic colors, primary for mid-range
  const lifeColor = lifeScore >= 80 ? A.emerald : lifeScore >= 60 ? "hsl(var(--primary))" : A.red;

  // ── Time ─────────────────────────────────────────────────────────────────
  const ts = getTimeState();
  const timeUrgent = ts.urgency === "danger";
  const motivation = getMotivation(lifeScore, doneCount, activeHabits.length, ts.urgency);
  const now = new Date();
  const dayProgress = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // ── Semantic colors ───────────────────────────────────────────────────────
  // Ring color: primary (theme accent) when healthy, gold when warning, red when danger
  const habitRingColor = habitPct === 1 ? A.emerald : habitPct >= 0.5 ? "hsl(var(--primary))" : A.gold;
  const budgetColor = spendDelta <= 0 ? A.emerald : spendDelta <= 20 ? A.gold : A.red;

  // ── Best streak ───────────────────────────────────────────────────────────
  const bestStreak = activeHabits.length
    ? Math.max(...activeHabits.map(h => completions ? calculateStreak(completions, h.id, h.start_date) : 0))
    : 0;
  const bestStreakHabit = activeHabits.find(h =>
    completions ? calculateStreak(completions, h.id, h.start_date) === bestStreak : false
  );

  // ── Weekly heatmap ────────────────────────────────────────────────────────
  const weekData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = subDays(today, 6 - i);
      const dStr = format(d, "yyyy-MM-dd");
      const isT = dStr === todayStr;
      const label = format(d, "EEEEE");
      if (isT) return { day: label, pct: habitPct, isToday: true };
      if (!completions || activeHabits.length === 0)
        return { day: label, pct: d < today ? 0 : null, isToday: false };
      const uniqueDone = new Set(completions.filter(c => c.date === dStr).map(c => c.habit_id)).size;
      return {
        day: label,
        pct: d < today ? uniqueDone / activeHabits.length : null,
        isToday: false,
      };
    });
  }, [completions, todayStr, habitPct, activeHabits.length]);

  // ── Confetti ──────────────────────────────────────────────────────────────
  const [particles, setParticles] = useState<{ id: number; x: number; color: string; size: number }[]>([]);
  const [celebrated, setCelebrated] = useState(false);
  useEffect(() => {
    if (habitPct === 1 && activeHabits.length > 0 && !celebrated) {
      setCelebrated(true);
      setParticles(Array.from({ length: 32 }, (_, i) => ({
        id: i, x: Math.random() * 100,
        color: [A.emerald, A.orange, A.pink, A.gold, A.blue][i % 5],
        size: Math.random() * 7 + 4,
      })));
      setTimeout(() => setParticles([]), 3500);
    }
    if (habitPct < 1) setCelebrated(false);
  }, [habitPct, activeHabits.length]);

  // ─── Card surface — uses theme CSS vars ───────────────────────────────────
  const card: React.CSSProperties = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 18,
  };

  // ─── Muted label style ────────────────────────────────────────────────────
  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "hsl(var(--muted-foreground))",
  };

  return (
    <AppLayout>

      {/* ── Fonts + keyframes ──────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@500;700&family=Instrument+Serif&display=swap');

        @keyframes dshFadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dshSlideIn {
          from { opacity: 0; transform: translateX(-7px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes dshRingPulse {
          0%,100% { filter: drop-shadow(0 0 8px ${A.red}80); }
          50%      { filter: drop-shadow(0 0 20px ${A.red}cc); }
        }
        @keyframes dshAtRisk {
          0%,100% { box-shadow: none; }
          50%      { box-shadow: 0 0 0 4px ${A.red}20; }
        }
        @keyframes dshFlame {
          0%,100% { transform: rotate(-3deg) scale(1); }
          50%      { transform: rotate(3deg) scale(1.15); }
        }
        @keyframes dshBlink {
          0%,100% { opacity: 1; } 50% { opacity: 0.3; }
        }
        @keyframes dshParticle {
          to { transform: translateY(110vh) rotate(720deg); opacity: 0; }
        }
        @keyframes dshMotivGlow {
          0%,100% { box-shadow: 0 0 20px hsl(var(--primary) / 0.06); }
          50%      { box-shadow: 0 0 36px hsl(var(--primary) / 0.14); }
        }
        @keyframes dshScanLine {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(200vh); }
        }
        @keyframes dshScoreIn {
          from { opacity: 0; transform: scale(0.82); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Confetti */}
      {particles.map(p => (
        <div key={p.id} style={{
          position: "fixed", zIndex: 9999, pointerEvents: "none",
          left: `${p.x}%`, top: "-2%",
          width: p.size, height: p.size, borderRadius: 2,
          background: p.color, boxShadow: `0 0 6px ${p.color}`,
          animation: `dshParticle ${1.5 + Math.random() * 1.5}s ease forwards`,
          animationDelay: `${Math.random() * 0.4}s`,
        }} />
      ))}

      {/* Ambient scan line — uses theme primary */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute", left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, hsl(var(--primary) / 0.06), transparent)",
          animation: "dshScanLine 14s linear infinite",
        }} />
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 1, fontFamily: "'DM Sans', sans-serif" }}
        className="space-y-4 sm:space-y-5">

        {/* ══ TOP BAR ══════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-between gap-3"
          style={{ animation: "dshFadeUp 0.35s ease both" }}>
          <div className="min-w-0">
            <p style={{ ...labelStyle, marginBottom: 2 }}>
              {ts.label} · {timeStr}
            </p>
            <h1 style={{ fontSize: "clamp(17px,3vw,22px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, color: "hsl(var(--foreground))" }}>
              {format(today, "EEEE, MMMM d")}
            </h1>
          </div>

          {/* Day progress pill */}
          <div style={{ ...card, borderRadius: 14, padding: "8px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 100 }}>
            <span style={labelStyle}>Day</span>
            <div style={{ width: "100%", height: 3, background: "hsl(var(--muted))", borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${dayProgress * 100}%`,
                background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                borderRadius: 2, transition: "width 2s ease",
              }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--muted-foreground))", fontFamily: "'DM Mono', monospace" }}>
              {Math.round(dayProgress * 100)}%
            </span>
          </div>
        </div>

        {/* ══ LIFE SCORE + MOTIVATION + HEATMAP ════════════════════════════ */}
        <div style={{
          display: "grid", gridTemplateColumns: "auto 1fr",
          gap: "clamp(12px,2vw,20px)",
          animation: "dshFadeUp 0.45s ease both", animationDelay: "70ms",
        }}>
          {/* Life Score ring */}
          <div style={{ ...card, padding: "clamp(14px,2.5vw,22px) clamp(12px,2vw,20px)", display: "flex", flexDirection: "column", alignItems: "center", gap: "clamp(6px,1.2vw,10px)" }}>
            <span style={labelStyle}>Life Score</span>

            <div className="hidden sm:block">
              <Ring pct={lifeScore / 100} size={128} stroke={9} color={lifeColor} pulse={lifeScore < 50}>
                <span style={{
                  fontFamily: "'Instrument Serif', serif", fontSize: 38,
                  color: lifeColor, lineHeight: 1,
                  filter: `drop-shadow(0 0 12px ${lifeColor}60)`,
                  animation: "dshScoreIn 0.6s ease both 400ms",
                }}>
                  {lifeScore}
                </span>
                <span style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", fontFamily: "'DM Mono', monospace" }}>/ 100</span>
              </Ring>
            </div>
            <div className="block sm:hidden">
              <Ring pct={lifeScore / 100} size={84} stroke={7} color={lifeColor} pulse={lifeScore < 50}>
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 26, color: lifeColor, lineHeight: 1 }}>
                  {lifeScore}
                </span>
                <span style={{ fontSize: 8, color: "hsl(var(--muted-foreground))" }}>/ 100</span>
              </Ring>
            </div>

            <span style={{
              fontSize: 10, fontWeight: 700, color: lifeColor,
              background: `${lifeColor}18`, padding: "2px 10px",
              borderRadius: 10, border: `1px solid ${lifeColor}30`,
            }}>
              {lifeScore >= 80 ? "Excellent" : lifeScore >= 60 ? "Good" : lifeScore >= 40 ? "Fair" : "Needs Work"}
            </span>

            {/* Habit / Spend breakdown */}
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: A.emerald, fontFamily: "'DM Mono', monospace" }}>{habitScore}</div>
                <div style={{ fontSize: 8, fontWeight: 800, color: "hsl(var(--muted-foreground))", letterSpacing: "0.06em" }}>HABITS</div>
              </div>
              <div style={{ width: 1, background: "hsl(var(--border))" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: budgetColor, fontFamily: "'DM Mono', monospace" }}>{spendScore}</div>
                <div style={{ fontSize: 8, fontWeight: 800, color: "hsl(var(--muted-foreground))", letterSpacing: "0.06em" }}>SPEND</div>
              </div>
            </div>
          </div>

          {/* Right column: motivation + heatmap */}
          <div style={{ display: "flex", flexDirection: "column", gap: "clamp(10px,1.8vw,14px)", minWidth: 0 }}>

            {/* Motivation banner — border uses motivation glow color, bg is themed */}
            <div style={{
              background: "hsl(var(--card))",
              border: `1px solid ${motivation.glow}30`,
              borderRadius: 14, padding: "clamp(10px,1.8vw,14px) clamp(12px,2vw,18px)",
              display: "flex", alignItems: "center", gap: 12,
              boxShadow: `0 0 24px ${motivation.glow}08`,
              animation: "dshMotivGlow 3s ease-in-out infinite",
            }}>
              <span style={{ fontSize: "clamp(18px,3vw,22px)", flexShrink: 0 }}>{motivation.icon}</span>
              <div className="min-w-0">
                <p style={{ fontSize: "clamp(11px,1.8vw,13px)", fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.01em", color: "hsl(var(--foreground))" }}>
                  {motivation.msg}
                </p>
                <p style={{ fontSize: "clamp(9px,1.4vw,10px)", color: "hsl(var(--muted-foreground))", marginTop: 3 }}>
                  {doneCount}/{activeHabits.length} habits · {formatAmount(todayTotal)} today
                </p>
              </div>
            </div>

            {/* Weekly Heatmap — iOS Style · Fully Responsive */}
            <div style={{
              ...card,
              padding: "clamp(12px, 2.2vw, 22px)",
              flex: 1,
              borderRadius: "clamp(14px, 2vw, 22px)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              position: "relative",
              overflow: "hidden",
              minWidth: 0, // allow flex shrink
            }}>
              {/* Top gloss */}
              <div style={{
                position: "absolute",
                top: 0, left: 0, right: 0,
                height: "45%",
                background: "linear-gradient(180deg, hsl(var(--background) / 0.05) 0%, transparent 100%)",
                pointerEvents: "none",
                borderRadius: "inherit",
              }} />

              {/* ── Header: title + avg badge ─────────────────────────────────── */}
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "clamp(10px, 1.8vw, 16px)",
                gap: 8,
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ ...labelStyle, marginBottom: 3 }}>This Week</p>
                  {/* Hide sub-label on xs to save space */}
                  <p style={{
                    fontSize: "clamp(11px, 1.8vw, 14px)",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "hsl(var(--foreground))",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>
                    Habit Completion
                  </p>
                </div>

                {/* Avg badge — collapses gracefully */}
                {(() => {
                  const activeDays = weekData.filter(d => d.pct !== null);
                  const avg = activeDays.length
                    ? Math.round(activeDays.reduce((s, d) => s + (d.pct ?? 0), 0) / activeDays.length * 100)
                    : 0;
                  const avgColor = avg >= 70 ? A.emerald : avg >= 40 ? A.gold : A.red;
                  return (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: "clamp(16px, 3vw, 24px)",
                        fontWeight: 800,
                        letterSpacing: "-0.04em",
                        color: avgColor,
                        lineHeight: 1,
                        filter: `drop-shadow(0 0 7px ${avgColor}55)`,
                        fontFamily: "'DM Mono', monospace",
                      }}>
                        {avg}%
                      </div>
                      <div style={{
                        fontSize: "clamp(8px, 1.2vw, 10px)",
                        color: "hsl(var(--muted-foreground))",
                        fontWeight: 500,
                        marginTop: 2,
                      }}>
                        avg
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── 7 rings — each takes equal flex share ────────────────────── */}
              <div style={{
                display: "flex",
                // gap scales: 3px on mobile → 8px on desktop
                gap: "clamp(3px, 0.8vw, 8px)",
                alignItems: "flex-start",
                // ensure rings never overflow the card
                overflow: "hidden",
              }}>
                {weekData.map((d, i) => (
                  <IOSDayRing key={i} pct={d.pct} day={d.day} isToday={d.isToday} />
                ))}
              </div>

              {/* Divider */}
              <div style={{
                margin: "clamp(8px, 1.5vw, 14px) 0 clamp(8px, 1.5vw, 12px)",
                height: 1,
                background: "hsl(var(--border) / 0.5)",
              }} />

              {/* ── iOS pill legend ───────────────────────────────────────────── */}
              <div style={{
                display: "flex",
                gap: "clamp(4px, 0.8vw, 8px)",
                flexWrap: "wrap",
                alignItems: "center",
              }}>
                {[
                  { label: "Complete", dot: A.emerald, bg: `${A.emerald}18`, color: A.emerald },
                  { label: "Missed", dot: A.red, bg: `${A.red}18`, color: A.red },
                  {
                    label: "Upcoming",
                    dot: "hsl(var(--muted-foreground) / 0.4)",
                    bg: "hsl(var(--muted) / 0.7)",
                    color: "hsl(var(--muted-foreground))",
                  },
                ].map(l => (
                  <span
                    key={l.label}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "clamp(3px, 0.5vw, 5px)",
                      // pill grows a bit on larger screens
                      padding: "clamp(2px, 0.4vw, 4px) clamp(7px, 1.2vw, 11px) clamp(2px, 0.4vw, 4px) clamp(5px, 0.8vw, 7px)",
                      borderRadius: 999,
                      background: l.bg,
                      fontSize: "clamp(7.5px, 1.2vw, 10px)",
                      fontWeight: 600,
                      color: l.color,
                      letterSpacing: "0.03em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{
                      width: "clamp(5px, 0.8vw, 7px)",
                      height: "clamp(5px, 0.8vw, 7px)",
                      borderRadius: "50%",
                      background: l.dot,
                      flexShrink: 0,
                    }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ══ QUICK STATS ROW ══════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3"
          style={{ animation: "dshFadeUp 0.45s ease both", animationDelay: "140ms" }}>
          {[
            {
              label: "Best Streak", icon: "🔥",
              value: String(bestStreak), unit: "days",
              note: bestStreakHabit ? bestStreakHabit.name : "Keep it up!",
              noteColor: A.gold, color: A.orange,
            },
            {
              label: "Spent Today", icon: "💰",
              value: formatAmount(todayTotal), unit: "",
              note: spendDelta === 0 ? "Same as yesterday"
                : spendDelta > 0 ? `↑ ${spendDelta}% vs yesterday`
                  : `↓ ${Math.abs(spendDelta)}% vs yesterday`,
              noteColor: budgetColor, color: budgetColor,
            },
            {
              label: "Habits Done", icon: "⚡",
              value: `${doneCount}/${activeHabits.length}`, unit: "",
              note: habitPct === 1 ? "All done! 🎉" : `${activeHabits.length - doneCount} remaining`,
              noteColor: habitRingColor, color: habitRingColor,
            },
          ].map((s, i) => (
            <div key={i} style={{
              ...card,
              padding: "clamp(10px,2vw,14px) clamp(10px,1.8vw,16px)",
              animation: "dshFadeUp 0.4s ease both",
              animationDelay: `${140 + i * 55}ms`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <span style={labelStyle}>{s.label}</span>
                <span style={{ fontSize: "clamp(12px,2.2vw,15px)" }}>{s.icon}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                <span style={{
                  fontFamily: "'DM Mono', monospace", fontWeight: 700,
                  fontSize: "clamp(14px,2.8vw,22px)", color: s.color, letterSpacing: "-0.03em",
                  filter: `drop-shadow(0 0 7px ${s.color}50)`,
                }}>
                  {s.value}
                </span>
                {s.unit && (
                  <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>{s.unit}</span>
                )}
              </div>
              <div style={{ fontSize: "clamp(8px,1.3vw,9px)", fontWeight: 700, color: s.noteColor, letterSpacing: "0.03em" }}>
                {s.note}
              </div>
            </div>
          ))}
        </div>

        {/* ══ HABITS + EXPENSES ════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:gap-4"
          style={{ animation: "dshFadeUp 0.45s ease both", animationDelay: "210ms" }}>

          {/* ── HABITS ─────────────────────────────────────────────────── */}
          <div style={{ ...card, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "clamp(10px,2vw,16px) clamp(12px,2.2vw,20px) clamp(8px,1.5vw,12px)",
              borderBottom: "1px solid hsl(var(--border))",
            }}>
              <div>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Today</p>
                <p style={{ fontSize: "clamp(13px,2.2vw,16px)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(var(--foreground))" }}>Habits</p>
              </div>
              <div className="hidden sm:block">
                <Ring pct={habitPct} size={34} stroke={3} color={habitRingColor}>
                  <span style={{ fontSize: 7, fontWeight: 700, color: "hsl(var(--muted-foreground))", fontFamily: "'DM Mono', monospace" }}>
                    {doneCount}/{activeHabits.length}
                  </span>
                </Ring>
              </div>
              <span className="block sm:hidden" style={{ fontSize: "clamp(11px,2vw,13px)", fontWeight: 800, color: habitRingColor, fontFamily: "'DM Mono', monospace" }}>
                {doneCount}/{activeHabits.length}
              </span>
            </div>

            {/* Habit rows */}
            {activeHabits.length > 0 ? (
              <div>
                {activeHabits.slice(0, 5).map((h, i) => {
                  const done = completedTodaySet.has(h.id);
                  const streak = completions ? calculateStreak(completions, h.id, h.start_date) : 0;
                  // Use habit color, or fall back to theme primary
                  const color = (h as any).color || "hsl(var(--primary))";
                  const atRisk = !done && timeUrgent;

                  return (
                    <div
                      key={h.id}
                      style={{
                        display: "flex", alignItems: "center",
                        gap: "clamp(8px,1.5vw,12px)",
                        padding: "clamp(8px,1.5vw,11px) clamp(12px,2.2vw,20px)",
                        borderBottom: "1px solid hsl(var(--border) / 0.5)",
                        transition: "background 0.2s",
                        animation: "dshSlideIn 0.35s ease both",
                        animationDelay: `${i * 55 + 230}ms`,
                        cursor: "default",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "hsl(var(--muted))"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                    >
                      {/* Status icon */}
                      <div style={{
                        flexShrink: 0,
                        width: "clamp(24px,3.8vw,30px)", height: "clamp(24px,3.8vw,30px)",
                        borderRadius: 8,
                        background: done ? `${color}20` : atRisk ? `${A.red}15` : "hsl(var(--muted))",
                        border: `1.5px solid ${done ? color : atRisk ? `${A.red}60` : "hsl(var(--border))"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "clamp(10px,1.8vw,14px)",
                        color: done ? color : "hsl(var(--muted-foreground))",
                        boxShadow: done ? `0 0 8px ${color}30` : "none",
                        transition: "all 0.3s",
                        animation: atRisk ? "dshAtRisk 2s ease-in-out infinite" : "none",
                      }}>
                        {done ? "✓" : h.emoji}
                      </div>

                      {/* Name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: "clamp(10px,1.8vw,13px)", fontWeight: 600,
                          color: done ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                          textDecoration: done ? "line-through" : "none",
                          textDecorationColor: "hsl(var(--muted-foreground))",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {h.name}
                        </p>
                        {atRisk && (
                          <span style={{
                            fontSize: "clamp(6px,1vw,8px)", fontWeight: 800, letterSpacing: "0.07em",
                            color: A.red, background: `${A.red}15`,
                            padding: "1px 5px", borderRadius: 4,
                            animation: "dshBlink 1.2s ease-in-out infinite",
                          }}>
                            AT RISK
                          </span>
                        )}
                      </div>

                      {/* Streak flame */}
                      {streak > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                          <span style={{
                            fontSize: "clamp(10px,1.6vw,13px)",
                            animation: !atRisk ? "dshFlame 2.2s ease-in-out infinite" : "none",
                            filter: atRisk ? "grayscale(0.8) opacity(0.35)" : `drop-shadow(0 0 4px ${A.orange}90)`,
                          }}>🔥</span>
                          <span style={{
                            fontSize: "clamp(10px,1.6vw,12px)", fontWeight: 700,
                            color: atRisk ? "hsl(var(--muted-foreground))" : A.orange,
                            fontFamily: "'DM Mono', monospace",
                          }}>
                            {streak}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {activeHabits.length > 5 && (
                  <p style={{ padding: "8px clamp(12px,2.2vw,20px)", fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                    +{activeHabits.length - 5} more
                  </p>
                )}
              </div>
            ) : (
              <p style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                No habits yet — head to Habits to create one.
              </p>
            )}

            {/* Footer progress bar */}
            <div style={{
              padding: "clamp(8px,1.5vw,12px) clamp(12px,2.2vw,20px)",
              borderTop: "1px solid hsl(var(--border))",
              background: habitPct === 1 ? `${A.emerald}08` : "transparent",
              transition: "background 0.5s",
            }}>
              {habitPct === 1 ? (
                <p style={{ fontSize: "clamp(10px,1.6vw,12px)", fontWeight: 700, color: A.emerald }}>🎉 All habits complete!</p>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: "hsl(var(--muted))", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${habitPct * 100}%`,
                      background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))",
                      borderRadius: 2, transition: "width 1.2s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "hsl(var(--muted-foreground))", fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                    {Math.round(habitPct * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── EXPENSES ───────────────────────────────────────────────── */}
          <div style={{ ...card, overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "clamp(10px,2vw,16px) clamp(12px,2.2vw,20px) clamp(8px,1.5vw,12px)",
              borderBottom: "1px solid hsl(var(--border))",
            }}>
              <div>
                <p style={{ ...labelStyle, marginBottom: 2 }}>Today</p>
                <p style={{ fontSize: "clamp(13px,2.2vw,16px)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(var(--foreground))" }}>Expenses</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: "clamp(13px,2.4vw,18px)", fontWeight: 700,
                  color: budgetColor, letterSpacing: "-0.04em",
                  fontFamily: "'DM Mono', monospace",
                  filter: `drop-shadow(0 0 7px ${budgetColor}40)`,
                }}>
                  {formatAmount(todayTotal)}
                </div>
                {spendDelta !== 0 && (
                  <div style={{ fontSize: "clamp(8px,1.3vw,10px)", fontWeight: 700, color: spendDelta > 0 ? A.red : A.emerald }}>
                    {spendDelta > 0 ? `↑${spendDelta}%` : `↓${Math.abs(spendDelta)}%`}
                  </div>
                )}
              </div>
            </div>

            {/* Expense rows */}
            {todayExpenses.length > 0 ? (
              <div>
                {todayExpenses.slice(0, 5).map((e, i) => {
                  const color = CATEGORY_COLORS[e.category as ExpenseCategory] || CATEGORY_COLORS.Other;
                  const pct = todayTotal > 0 ? e.amount / todayTotal : 0;
                  return (
                    <div
                      key={e.id}
                      style={{
                        display: "flex", alignItems: "center",
                        gap: "clamp(8px,1.5vw,12px)",
                        padding: "clamp(8px,1.5vw,10px) clamp(12px,2.2vw,20px)",
                        borderBottom: "1px solid hsl(var(--border) / 0.5)",
                        transition: "background 0.2s",
                        animation: "dshSlideIn 0.35s ease both",
                        animationDelay: `${i * 55 + 250}ms`,
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "hsl(var(--muted))"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                    >
                      <div style={{
                        flexShrink: 0,
                        width: "clamp(24px,3.8vw,30px)", height: "clamp(24px,3.8vw,30px)",
                        borderRadius: 8,
                        background: `${color}18`, border: `1px solid ${color}30`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: "clamp(10px,1.8vw,13px)", fontWeight: 600,
                          color: "hsl(var(--foreground))",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3,
                        }}>
                          {e.note || e.category}
                        </p>
                        <div style={{ height: 2, borderRadius: 1, background: "hsl(var(--muted))", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", width: `${pct * 100}%`, background: color,
                            transition: "width 1s ease", boxShadow: `0 0 4px ${color}`,
                          }} />
                        </div>
                      </div>

                      <span style={{ fontSize: "clamp(10px,1.8vw,13px)", fontWeight: 700, color, fontFamily: "'DM Mono', monospace", flexShrink: 0 }}>
                        {formatAmount(e.amount)}
                      </span>
                    </div>
                  );
                })}

                {todayExpenses.length > 5 && (
                  <p style={{ padding: "8px clamp(12px,2.2vw,20px)", fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
                    +{todayExpenses.length - 5} more
                  </p>
                )}
              </div>
            ) : (
              <p style={{ padding: "32px 20px", textAlign: "center", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                No expenses logged today.
              </p>
            )}

            {/* Category chips */}
            {todayExpenses.length > 0 && (() => {
              const cats: Record<string, number> = {};
              todayExpenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
              return (
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 5,
                  padding: "clamp(8px,1.5vw,10px) clamp(12px,2.2vw,20px)",
                  borderTop: "1px solid hsl(var(--border))",
                }}>
                  {Object.entries(cats).map(([cat, amt]) => {
                    const color = CATEGORY_COLORS[cat as ExpenseCategory] || CATEGORY_COLORS.Other;
                    return (
                      <div key={cat} style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: `${color}12`, border: `1px solid ${color}22`,
                        borderRadius: 7, padding: "2px 7px",
                      }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span className="hidden sm:inline" style={{ fontSize: 8, fontWeight: 700, color: "hsl(var(--muted-foreground))" }}>{cat}</span>
                        <span style={{ fontSize: "clamp(8px,1.3vw,9px)", fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>
                          {formatAmount(amt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ══ STREAK SHOWCASE ══════════════════════════════════════════════ */}
        {activeHabits.length > 0 && (
          <div
            className={cn(
              "grid gap-2 sm:gap-3",
              activeHabits.slice(0, 5).length === 5 ? "grid-cols-5" :
                activeHabits.slice(0, 5).length === 4 ? "grid-cols-4" :
                  activeHabits.slice(0, 5).length === 3 ? "grid-cols-3" : "grid-cols-2"
            )}
            style={{ animation: "dshFadeUp 0.45s ease both", animationDelay: "280ms" }}
          >
            {activeHabits.slice(0, 5).map((h, i) => {
              const streak = completions ? calculateStreak(completions, h.id, h.start_date) : 0;
              const color = (h as any).color || "hsl(var(--primary))";
              const ringPct = Math.min(streak / 30, 1);

              return (
                <div
                  key={h.id}
                  style={{
                    ...card,
                    padding: "clamp(10px,2vw,16px) clamp(8px,1.5vw,12px)",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    gap: "clamp(6px,1.2vw,10px)",
                    transition: "border-color 0.3s, background 0.2s",
                    cursor: "default",
                    animation: "dshFadeUp 0.4s ease both",
                    animationDelay: `${280 + i * 50}ms`,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = `${color}45`;
                    el.style.background = "hsl(var(--muted))";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.borderColor = "hsl(var(--border))";
                    el.style.background = "hsl(var(--card))";
                  }}
                >
                  <div className="hidden sm:block">
                    <Ring pct={ringPct} size={50} stroke={4} color={color}>
                      <span style={{ fontSize: 15 }}>{h.emoji}</span>
                    </Ring>
                  </div>
                  <div className="block sm:hidden">
                    <Ring pct={ringPct} size={36} stroke={3} color={color}>
                      <span style={{ fontSize: 11 }}>{h.emoji}</span>
                    </Ring>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{
                      fontSize: "clamp(16px,3vw,22px)", fontWeight: 700,
                      color, lineHeight: 1, fontFamily: "'DM Mono', monospace",
                      filter: `drop-shadow(0 0 6px ${color}50)`,
                    }}>
                      {streak}
                    </div>
                    <div style={{ fontSize: "clamp(7px,1.2vw,8px)", fontWeight: 700, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>days</div>
                  </div>
                  <p style={{
                    fontSize: "clamp(8px,1.4vw,10px)", fontWeight: 600,
                    color: "hsl(var(--muted-foreground))", textAlign: "center",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
                  }}>
                    {h.name}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ EXPENSE CHARTS ═══════════════════════════════════════════════ */}
        {expenses && (
          <div style={{ animation: "dshFadeUp 0.45s ease both", animationDelay: "340ms" }}>
            <DashboardExpenseCharts expenses={expenses} month={today} />
          </div>
        )}

      </div>
    </AppLayout>
  );
}