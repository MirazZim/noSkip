import { useRef, useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Minus, DollarSign,
  Calendar, BarChart3, Wallet, PiggyBank, Scale,
  Zap, Shield, AlertTriangle, ChevronRight,
} from "lucide-react";
import {
  startOfWeek, endOfWeek, isWithinInterval,
  parseISO, format, getDaysInMonth,
} from "date-fns";
import { Expense, Budget } from "@/hooks/useExpenses";
import { Income } from "@/hooks/useIncomes";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

// ── Semantic accent palette — theme-independent meaning carriers ──────────────
const C = {
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
  sky: "#38bdf8",
  violet: "#8b5cf6",
  indigo: "#6366f1",
} as const;

interface Props {
  expenses: Expense[];
  prevExpenses: Expense[];
  budgets: Budget[];
  incomes: Income[];
  prevIncomes: Income[];
  savedThisCycle: number;
  onBudgetClick?: () => void;
  onSavingsClick?: () => void;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({
  data, color, height = 28, width = 64,
}: { data: number[]; color: string; height?: number; width?: number }) {
  if (!data.length) return null;
  const max = Math.max(...data, 0.01);
  const pts = data.map((v, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = height - (v / max) * height * 0.85;
    return `${x},${y}`;
  }).join(" ");
  const areaBase = `${width},${height} 0,${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`${pts} ${areaBase}`} fill={`url(#sg-${color.replace("#", "")})`} />
      <polyline points={pts} stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ to, duration = 900 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * to));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  return <>{val}</>;
}

// ── Gradient border card ──────────────────────────────────────────────────────
// Uses the `background-clip: padding-box` trick for radius-friendly gradient borders
function GlassCard({
  children, color, glow = false, onClick, delay = 0, className = "",
  featured = false,
}: {
  children: React.ReactNode;
  color: string;
  glow?: boolean;
  onClick?: () => void;
  delay?: number;
  className?: string;
  featured?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: featured ? 22 : 18,
        padding: 1,                       // creates the gradient border thickness
        background: hovered
          ? `linear-gradient(135deg, ${color}70, ${color}20, ${color}50)`
          : `linear-gradient(135deg, ${color}35, hsl(var(--border) / 0.6), ${color}20)`,
        boxShadow: glow || hovered
          ? `0 0 0 1px ${color}15, 0 8px 32px -8px ${color}30, 0 2px 8px -2px hsl(var(--background) / 0.5)`
          : `0 1px 3px hsl(var(--background) / 0.3)`,
        transition: "all 0.3s cubic-bezier(0.34,1.2,0.64,1)",
        transform: hovered && onClick ? "translateY(-2px) scale(1.005)" : "none",
        cursor: onClick ? "pointer" : "default",
        animation: `escFadeUp 0.5s ease both`,
        animationDelay: `${delay}ms`,
      }}
      className={className}
    >
      {/* Glass inner surface */}
      <div style={{
        borderRadius: featured ? 21 : 17,
        background: "hsl(var(--card) / 0.75)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        overflow: "hidden",
        position: "relative",
        height: "100%",
      }}>
        {/* Top gloss edge */}
        <div style={{
          position: "absolute",
          top: 0, left: "10%", right: "10%",
          height: 1,
          background: `linear-gradient(90deg, transparent, hsl(var(--background) / 0.8), transparent)`,
          pointerEvents: "none",
        }} />
        {/* Ambient color wash */}
        <div style={{
          position: "absolute",
          top: "-40%", right: "-20%",
          width: "50%", height: "80%",
          borderRadius: "50%",
          background: color,
          opacity: hovered ? 0.06 : 0.03,
          filter: "blur(40px)",
          pointerEvents: "none",
          transition: "opacity 0.4s ease",
        }} />
        {children}
      </div>
    </div>
  );
}

// ── Status tier logic ─────────────────────────────────────────────────────────
function getSavingsTier(rate: number | null) {
  if (rate === null) return { label: "Untracked", color: "hsl(var(--muted-foreground))", next: null, pctToNext: 0 };
  if (rate >= 30) return { label: "Elite Saver", color: C.violet, next: null, pctToNext: 100 };
  if (rate >= 20) return { label: "Gold Saver", color: C.amber, next: "Elite", pctToNext: Math.round((rate - 20) / 10 * 100) };
  if (rate >= 10) return { label: "Silver Saver", color: C.sky, next: "Gold", pctToNext: Math.round((rate - 10) / 10 * 100) };
  return { label: "Starter", color: C.emerald, next: "Silver", pctToNext: Math.round(rate / 10 * 100) };
}

function getBudgetInsight(progress: number | null, daysLeft: number, totalSpend: number, budgetAmt: number) {
  if (progress === null) return { text: "Set a budget to unlock insights", urgent: false };
  if (progress >= 100) return { text: `⚠ Over budget by ${Math.round(progress - 100)}%`, urgent: true };
  const dailyBurn = totalSpend / (getDaysInMonth(new Date()) - daysLeft || 1);
  const projected = totalSpend + dailyBurn * daysLeft;
  if (projected > budgetAmt) return { text: `At this rate you'll overspend by month-end`, urgent: true };
  if (progress >= 80) return { text: `Only ${Math.round(100 - progress)}% budget left · ${daysLeft}d remaining`, urgent: true };
  return { text: `${Math.round(100 - progress)}% budget remaining · ${daysLeft}d left`, urgent: false };
}

// ── Main component ─────────────────────────────────────────────────────────────
export function ExpenseSummaryCards({
  expenses, prevExpenses, budgets, incomes,
  prevIncomes, savedThisCycle, onBudgetClick, onSavingsClick,
}: Props) {
  const { formatAmount } = useCurrency();

  // ── Derived data ────────────────────────────────────────────────────────────
  const totalSpend = expenses.reduce((s, e) => s + e.amount, 0);
  const prevSpend = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const spendChange = prevSpend ? Math.round(((totalSpend - prevSpend) / prevSpend) * 100) : 0;

  const totalIncome = incomes.reduce((s, i) => s + i.amount, 0);
  const prevIncome = prevIncomes.reduce((s, i) => s + i.amount, 0);
  const incomeChange = prevIncome ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100) : 0;

  const netBalance = totalIncome - totalSpend - savedThisCycle;
  const isPositive = netBalance >= 0;

  const savingsRate = totalIncome > 0
    ? Math.round((savedThisCycle / totalIncome) * 100) : null;

  const now = new Date();
  const daysLeft = getDaysInMonth(now) - now.getDate();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weeklySpend = expenses
    .filter(e => isWithinInterval(parseISO(e.date), { start: weekStart, end: weekEnd }))
    .reduce((s, e) => s + e.amount, 0);

  // Weekly daily breakdown for sparkline
  const weekDailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const ds = format(d, "yyyy-MM-dd");
    return expenses.filter(e => e.date === ds).reduce((s, e) => s + e.amount, 0);
  });

  // Daily spend over month for sparkline
  const monthDailyData = (() => {
    const map: Record<string, number> = {};
    expenses.forEach(e => { map[e.date] = (map[e.date] || 0) + e.amount; });
    return Object.values(map);
  })();

  const overallBudget = budgets.find(b => b.category === "Overall");
  const budgetProgress = overallBudget
    ? Math.min((totalSpend / overallBudget.amount) * 100, 100) : null;
  const budgetInsight = getBudgetInsight(
    budgetProgress, daysLeft, totalSpend, overallBudget?.amount ?? 0
  );

  const dayTotals: Record<string, number> = {};
  expenses.forEach(e => { dayTotals[e.date] = (dayTotals[e.date] || 0) + e.amount; });
  const highestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];

  const tier = getSavingsTier(savingsRate);

  // Budget bar color
  const budgetColor = budgetProgress === null ? C.emerald
    : budgetProgress >= 90 ? C.rose
      : budgetProgress >= 70 ? C.amber
        : C.emerald;

  // Net balance health score (0-100)
  const healthScore = totalIncome === 0 ? 50
    : Math.min(100, Math.max(0, Math.round((netBalance / totalIncome) * 100) + 50));
  const healthColor = healthScore >= 70 ? C.emerald
    : healthScore >= 45 ? C.amber : C.rose;
  const healthLabel = healthScore >= 70 ? "Healthy" : healthScore >= 45 ? "Moderate" : "At Risk";

  return (
    <>
      <style>{`
        @keyframes escFadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes escPulse {
          0%,100% { opacity: 1; } 50% { opacity: 0.4; }
        }
        @keyframes escShimmer {
          from { background-position: -200% center; }
          to   { background-position: 200% center; }
        }
        @keyframes escBarFill {
          from { width: 0; }
        }
      `}</style>

      <div className="space-y-3 sm:space-y-4">

        {/* ══ HERO COMMAND STRIP ══════════════════════════════════════════ */}
        {/* Dark psychology: sets the frame — "Financial Health" makes user
            care about score, not just numbers. Anchors everything below. */}
        <GlassCard color={healthColor} glow featured delay={0}>
          <div style={{
            padding: "clamp(14px,2.2vw,22px) clamp(16px,2.5vw,26px)",
            display: "flex",
            alignItems: "center",
            gap: "clamp(12px,2vw,24px)",
            flexWrap: "wrap",
          }}>
            {/* Health arc mini */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              <svg width={54} height={54} viewBox="0 0 54 54" style={{ transform: "rotate(-90deg)" }}>
                <circle cx={27} cy={27} r={22} fill="none"
                  stroke="hsl(var(--muted) / 0.4)" strokeWidth={4} />
                <circle cx={27} cy={27} r={22} fill="none"
                  stroke={healthColor} strokeWidth={4}
                  strokeDasharray={`${(healthScore / 100) * 2 * Math.PI * 22} ${2 * Math.PI * 22}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 1.2s cubic-bezier(0.34,1.56,0.64,1)", filter: `drop-shadow(0 0 6px ${healthColor}80)` }}
                />
              </svg>
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 800,
                color: healthColor,
                fontFamily: "'DM Mono', monospace",
              }}>
                {healthScore}
              </div>
            </div>

            {/* Label + status */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: "clamp(11px,1.6vw,13px)",
                  fontWeight: 800, letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "hsl(var(--muted-foreground))",
                }}>
                  Financial Health
                </span>
                {/* Status badge */}
                <span style={{
                  padding: "2px 8px", borderRadius: 999,
                  background: `${healthColor}20`,
                  border: `1px solid ${healthColor}40`,
                  fontSize: 9, fontWeight: 800,
                  letterSpacing: "0.08em",
                  color: healthColor,
                }}>
                  {healthLabel}
                </span>
              </div>

              {/* Progress rail */}
              <div style={{
                height: 5, borderRadius: 999,
                background: "hsl(var(--muted) / 0.5)",
                overflow: "hidden", maxWidth: 280,
              }}>
                <div style={{
                  height: "100%",
                  width: `${healthScore}%`,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${healthColor}aa, ${healthColor})`,
                  boxShadow: `0 0 8px ${healthColor}60`,
                  animation: "escBarFill 1.2s ease both",
                  transition: "width 1s ease",
                }} />
              </div>

              <p style={{
                marginTop: 6, fontSize: "clamp(10px,1.4vw,12px)",
                color: "hsl(var(--muted-foreground))",
                fontWeight: 500,
              }}>
                {totalIncome === 0
                  ? "Log your income to unlock your financial health score"
                  : netBalance > 0
                    ? `You're keeping ${formatAmount(netBalance)} free after all obligations`
                    : `You're ${formatAmount(Math.abs(netBalance))} short of breaking even this cycle`}
              </p>
            </div>

            {/* Right: quick trio */}
            <div style={{
              display: "flex", gap: "clamp(12px,2vw,24px)",
              flexShrink: 0,
            }}>
              {[
                { label: "Income", val: formatAmount(totalIncome), color: C.emerald },
                { label: "Spend", val: formatAmount(totalSpend), color: C.rose },
                { label: "Saved", val: savedThisCycle > 0 ? formatAmount(savedThisCycle) : "—", color: C.violet },
              ].map(x => (
                <div key={x.label} style={{ textAlign: "center" }}>
                  <div style={{
                    fontSize: "clamp(13px,2vw,17px)", fontWeight: 800,
                    color: x.color, fontFamily: "'DM Mono', monospace",
                    letterSpacing: "-0.03em",
                    filter: `drop-shadow(0 0 6px ${x.color}50)`,
                  }}>
                    {x.val}
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "hsl(var(--muted-foreground))",
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}>
                    {x.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* ══ ROW 1: Income / Spend / Net ════════════════════════════════ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">

          {/* Income */}
          <GlassCard color={C.emerald} delay={60}>
            <div style={{ padding: "clamp(14px,2vw,20px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>
                    Total Income
                  </p>
                  {/* Dark psych: framing income growth as achievement */}
                  <p style={{ fontSize: "clamp(10px,1.4vw,11px)", color: incomeChange >= 0 ? C.emerald : C.rose, fontWeight: 600 }}>
                    {incomeChange >= 0 ? `↑ ${incomeChange}%` : `↓ ${Math.abs(incomeChange)}%`} vs last cycle
                  </p>
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: `${C.emerald}18`,
                  border: `1px solid ${C.emerald}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <TrendingUp size={16} color={C.emerald} />
                </div>
              </div>

              <div style={{
                fontSize: "clamp(20px,3.5vw,28px)", fontWeight: 800,
                color: "hsl(var(--foreground))",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 10,
              }}>
                {formatAmount(totalIncome)}
              </div>

              {/* Sparkline + bar */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <Sparkline data={monthDailyData} color={C.emerald} width={72} height={26} />
                <div style={{
                  fontSize: 9, fontWeight: 700,
                  color: C.emerald, padding: "2px 7px",
                  background: `${C.emerald}15`, borderRadius: 999,
                  border: `1px solid ${C.emerald}30`,
                  whiteSpace: "nowrap",
                }}>
                  {prevIncome === 0 ? "First cycle" : incomeChange >= 0 ? "Growing ↑" : "Down ↓"}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Spend */}
          <GlassCard color={C.rose} delay={110}>
            <div style={{ padding: "clamp(14px,2vw,20px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>
                    Total Spend
                  </p>
                  {/* Dark psych: loss framing — spending MORE feels costly */}
                  <p style={{ fontSize: "clamp(10px,1.4vw,11px)", color: spendChange > 0 ? C.rose : C.emerald, fontWeight: 600 }}>
                    {spendChange > 0 ? `↑ ${spendChange}% more than last cycle` : spendChange < 0 ? `↓ ${Math.abs(spendChange)}% less · great` : "Same as last cycle"}
                  </p>
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: `${C.rose}18`,
                  border: `1px solid ${C.rose}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <DollarSign size={16} color={C.rose} />
                </div>
              </div>

              <div style={{
                fontSize: "clamp(20px,3.5vw,28px)", fontWeight: 800,
                color: "hsl(var(--foreground))",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 10,
              }}>
                {formatAmount(totalSpend)}
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                <Sparkline data={monthDailyData} color={C.rose} width={72} height={26} />
                {/* Daily burn rate */}
                <div style={{
                  fontSize: 9, fontWeight: 700,
                  color: "hsl(var(--muted-foreground))",
                  whiteSpace: "nowrap",
                }}>
                  {formatAmount(Math.round(totalSpend / (now.getDate() || 1)))}/day
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Net Balance */}
          <GlassCard color={isPositive ? C.sky : C.amber} delay={160} glow={!isPositive}>
            <div style={{ padding: "clamp(14px,2vw,20px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 2 }}>
                    Net Balance
                  </p>
                  {/* Dark psych: negative balance gets urgent framing */}
                  <p style={{ fontSize: "clamp(10px,1.4vw,11px)", color: isPositive ? C.sky : C.amber, fontWeight: 600, animation: !isPositive ? "escPulse 2s ease-in-out infinite" : "none" }}>
                    {totalIncome === 0 ? "Log income to calculate" : isPositive ? "You're in the clear" : `${daysLeft}d left · tighten up`}
                  </p>
                </div>
                <div style={{
                  width: 36, height: 36, borderRadius: 12,
                  background: `${isPositive ? C.sky : C.amber}18`,
                  border: `1px solid ${isPositive ? C.sky : C.amber}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {isPositive ? <Shield size={16} color={C.sky} /> : <AlertTriangle size={16} color={C.amber} />}
                </div>
              </div>

              <div style={{
                fontSize: "clamp(20px,3.5vw,28px)", fontWeight: 800,
                color: isPositive ? C.sky : C.amber,
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 10,
                filter: `drop-shadow(0 0 8px ${isPositive ? C.sky : C.amber}40)`,
              }}>
                {isPositive ? "+" : ""}{formatAmount(netBalance)}
              </div>

              {/* Income allocation visual */}
              {totalIncome > 0 && (
                <div>
                  <div style={{ display: "flex", gap: 2, height: 4, borderRadius: 999, overflow: "hidden", marginBottom: 5 }}>
                    {[
                      { w: (totalSpend / totalIncome) * 100, color: C.rose },
                      { w: (savedThisCycle / totalIncome) * 100, color: C.violet },
                      { w: Math.max(0, (netBalance / totalIncome) * 100), color: C.sky },
                    ].map((seg, i) => (
                      <div key={i} style={{
                        width: `${Math.min(seg.w, 100)}%`, height: "100%",
                        background: seg.color, borderRadius: 999,
                        transition: "width 1s ease",
                        minWidth: seg.w > 0 ? 2 : 0,
                      }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                    Spend · Saved · Free
                  </p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* ══ ROW 2: Savings / Weekly / Peak / Budget ════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">

          {/* Savings — tier gamification (dark psych: status + loss-to-next-tier) */}
          <GlassCard color={tier.color} onClick={onSavingsClick} delay={200}>
            <div style={{ padding: "clamp(12px,1.8vw,18px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
                  Savings
                </p>
                <PiggyBank size={14} color={tier.color} />
              </div>

              <div style={{
                fontSize: "clamp(17px,3vw,23px)", fontWeight: 800,
                color: savedThisCycle > 0 ? tier.color : "hsl(var(--muted-foreground))",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8,
                filter: savedThisCycle > 0 ? `drop-shadow(0 0 7px ${tier.color}50)` : "none",
              }}>
                {savedThisCycle > 0 ? formatAmount(savedThisCycle) : "—"}
              </div>

              {/* Tier badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                <Zap size={10} color={tier.color} />
                <span style={{ fontSize: 9, fontWeight: 800, color: tier.color, letterSpacing: "0.06em" }}>
                  {tier.label}
                </span>
              </div>

              {/* Progress to next tier — dark psych: near-completion bias */}
              {tier.next && (
                <div>
                  <div style={{ height: 3, borderRadius: 999, background: "hsl(var(--muted) / 0.5)", overflow: "hidden", marginBottom: 3 }}>
                    <div style={{
                      height: "100%", width: `${tier.pctToNext}%`,
                      background: tier.color, borderRadius: 999,
                      transition: "width 1.2s ease",
                      boxShadow: `0 0 6px ${tier.color}60`,
                    }} />
                  </div>
                  <p style={{ fontSize: 8.5, color: "hsl(var(--muted-foreground))", fontWeight: 500 }}>
                    {tier.pctToNext}% to {tier.next} · tap to update
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Weekly */}
          <GlassCard color={C.violet} delay={240}>
            <div style={{ padding: "clamp(12px,1.8vw,18px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
                  This Week
                </p>
                <Calendar size={14} color={C.violet} />
              </div>

              <div style={{
                fontSize: "clamp(17px,3vw,23px)", fontWeight: 800,
                color: "hsl(var(--foreground))",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 10,
              }}>
                {formatAmount(weeklySpend)}
              </div>

              <Sparkline data={weekDailyData} color={C.violet} width={80} height={28} />

              <p style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 5, fontWeight: 500 }}>
                {expenses.length} transaction{expenses.length !== 1 ? "s" : ""} this cycle
              </p>
            </div>
          </GlassCard>

          {/* Peak Day */}
          <GlassCard color={C.amber} delay={280}>
            <div style={{ padding: "clamp(12px,1.8vw,18px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
                  Peak Day
                </p>
                <BarChart3 size={14} color={C.amber} />
              </div>

              <div style={{
                fontSize: "clamp(17px,3vw,23px)", fontWeight: 800,
                color: highestDay ? C.amber : "hsl(var(--muted-foreground))",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 4,
                filter: highestDay ? `drop-shadow(0 0 7px ${C.amber}50)` : "none",
              }}>
                {highestDay ? formatAmount(highestDay[1]) : "—"}
              </div>

              {highestDay && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 999,
                  background: `${C.amber}15`,
                  border: `1px solid ${C.amber}30`,
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: C.amber }}>
                    {format(parseISO(highestDay[0]), "MMM d")}
                  </span>
                </div>
              )}

              {/* Day bars mini chart */}
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 20 }}>
                {Object.entries(dayTotals).slice(-7).map(([d, v], i, arr) => {
                  const maxV = Math.max(...arr.map(a => a[1]), 0.01);
                  const isMax = d === highestDay?.[0];
                  return (
                    <div key={d} style={{
                      flex: 1, borderRadius: 2,
                      background: isMax ? C.amber : `${C.amber}30`,
                      height: `${(v / maxV) * 100}%`,
                      minHeight: 2,
                      boxShadow: isMax ? `0 0 6px ${C.amber}60` : "none",
                      transition: "height 0.8s ease",
                    }} />
                  );
                })}
              </div>
            </div>
          </GlassCard>

          {/* Budget — dark psych: loss + urgency framing */}
          <GlassCard color={budgetColor} onClick={onBudgetClick} delay={320} glow={budgetInsight.urgent}>
            <div style={{ padding: "clamp(12px,1.8vw,18px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))" }}>
                  Budget
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {budgetInsight.urgent && (
                    <AlertTriangle size={11} color={budgetColor} style={{ animation: "escPulse 1.5s ease-in-out infinite" }} />
                  )}
                  <Wallet size={14} color={budgetColor} />
                </div>
              </div>

              {overallBudget ? (
                <>
                  {/* Spent / Total — now clearly visible */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 2 }}>
                      <span style={{
                        fontSize: "clamp(17px,3vw,23px)", fontWeight: 800,
                        color: budgetColor, fontFamily: "'DM Mono', monospace",
                        letterSpacing: "-0.04em", lineHeight: 1,
                        filter: `drop-shadow(0 0 7px ${budgetColor}50)`,
                      }}>
                        {formatAmount(totalSpend)}
                      </span>
                    </div>

                    {/* "of $X · Y% used" subtitle */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{
                        fontSize: "clamp(9px,1.3vw,11px)", fontWeight: 500,
                        color: "hsl(var(--muted-foreground))",
                      }}>
                        of {formatAmount(overallBudget.amount)}
                      </span>
                      {/* Pill: % used */}
                      <span style={{
                        padding: "1px 6px", borderRadius: 999,
                        background: `${budgetColor}18`,
                        border: `1px solid ${budgetColor}30`,
                        fontSize: 9, fontWeight: 800,
                        color: budgetColor, letterSpacing: "0.04em",
                      }}>
                        {Math.round(budgetProgress ?? 0)}% used
                      </span>
                    </div>
                  </div>

                  {/* Remaining callout */}
                  {overallBudget.amount - totalSpend > 0 && (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "5px 8px", borderRadius: 8,
                      background: "hsl(var(--muted) / 0.4)",
                      marginBottom: 7,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 600, color: "hsl(var(--muted-foreground))" }}>
                        Remaining
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 800,
                        fontFamily: "'DM Mono', monospace",
                        color: budgetColor,
                        letterSpacing: "-0.02em",
                      }}>
                        {formatAmount(overallBudget.amount - totalSpend)}
                      </span>
                    </div>
                  )}

                  {/* Segmented budget bar */}
                  <div style={{ height: 5, borderRadius: 999, background: "hsl(var(--muted) / 0.5)", overflow: "hidden", marginBottom: 6 }}>
                    <div style={{
                      height: "100%",
                      width: `${budgetProgress}%`,
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${budgetColor}80, ${budgetColor})`,
                      boxShadow: `0 0 8px ${budgetColor}50`,
                      animation: "escBarFill 1.2s ease both",
                      transition: "width 1s ease",
                    }} />
                  </div>

                  <p style={{
                    fontSize: 9, fontWeight: 600,
                    color: budgetInsight.urgent ? budgetColor : "hsl(var(--muted-foreground))",
                    animation: budgetInsight.urgent ? "escPulse 2.5s ease-in-out infinite" : "none",
                    lineHeight: 1.4,
                  }}>
                    {budgetInsight.text}
                  </p>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: "clamp(11px,1.6vw,13px)", color: "hsl(var(--muted-foreground))", fontWeight: 500, lineHeight: 1.4 }}>
                    No budget set
                  </p>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 999,
                    background: `${C.violet}18`,
                    border: `1px solid ${C.violet}35`,
                    width: "fit-content",
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: C.violet }}>Set budget</span>
                    <ChevronRight size={10} color={C.violet} />
                  </div>
                </div>
              )}
            </div>
          </GlassCard>

        </div>
      </div>
    </>
  );
}