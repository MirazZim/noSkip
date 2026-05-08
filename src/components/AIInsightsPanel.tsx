import { useState } from "react";
import {
  TrendingUp, Target, AlertTriangle, Heart,
  ThumbsUp, ThumbsDown, RefreshCw, Sparkles, Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAIInsights, type AiInsight, type InsightType } from "@/hooks/useAIInsights";

// ─── Semantic accent palette (mirrors Dashboard's A constants) ────────────────
const A = {
  blue:    "#38BDF8",
  emerald: "#10b981",
  gold:    "#f59e0b",
  red:     "#FF3B5C",
} as const;

// ─── Insight display config ───────────────────────────────────────────────────
const INSIGHT_META: Record<InsightType, { label: string; Icon: LucideIcon; accent: string }> = {
  spending_summary: { label: "Spending Summary",  Icon: TrendingUp,    accent: A.blue    },
  habit_coaching:   { label: "Habit Coaching",    Icon: Target,        accent: A.emerald },
  anomaly:          { label: "Anomaly",           Icon: AlertTriangle, accent: A.gold    },
  financial_health: { label: "Financial Health",  Icon: Heart,         accent: "hsl(var(--primary))" },
};

// Render in this order regardless of DB return order
const ORDERED_TYPES: InsightType[] = [
  "spending_summary",
  "habit_coaching",
  "anomaly",
  "financial_health",
];

// ─── Shared style constants (matches Dashboard card / labelStyle pattern) ──────
const card: React.CSSProperties = {
  background:   "hsl(var(--card))",
  border:       "1px solid hsl(var(--border))",
  borderRadius: 18,
};

const labelSt: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "hsl(var(--muted-foreground))",
};

// ─── financial_health content is JSON: {score, verdict} ──────────────────────
function parseInsightContent(insight: AiInsight): { text: string; score?: number } {
  if (insight.insight_type !== "financial_health") return { text: insight.content };
  try {
    const obj = JSON.parse(insight.content) as { score?: number; verdict?: string };
    return {
      text:  obj.verdict ?? insight.content,
      score: typeof obj.score === "number" ? obj.score : undefined,
    };
  } catch {
    return { text: insight.content };
  }
}

// ─── Single insight card ──────────────────────────────────────────────────────
function InsightCard({
  insight,
  onRate,
  animDelay,
}: {
  insight:   AiInsight;
  onRate:    (id: string, useful: boolean) => Promise<void>;
  animDelay: number;
}) {
  const meta             = INSIGHT_META[insight.insight_type];
  const { text, score }  = parseInsightContent(insight);
  const isPrimaryAccent  = meta.accent.startsWith("hsl(var");

  // Optimistic rating — initialised from DB value
  const [rated, setRated] = useState<boolean | null>(insight.was_useful ?? null);
  const [busy,  setBusy]  = useState(false);

  const handleRate = async (useful: boolean) => {
    if (rated !== null || busy) return;
    setBusy(true);
    setRated(useful);           // optimistic
    try {
      await onRate(insight.id, useful);
    } catch {
      setRated(null);           // rollback on failure
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      ...card,
      padding:        "clamp(12px,2vw,16px)",
      display:        "flex",
      flexDirection:  "column",
      gap:            10,
      animation:      "aiSlideIn 0.38s ease both",
      animationDelay: `${animDelay}ms`,
    }}>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Icon chip */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: isPrimaryAccent ? "hsl(var(--primary) / 0.1)" : `${meta.accent}18`,
          border:     `1px solid ${isPrimaryAccent ? "hsl(var(--primary) / 0.25)" : `${meta.accent}30`}`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <meta.Icon size={13} color={meta.accent} />
        </div>
        <span style={labelSt}>{meta.label}</span>
        {/* Score badge for financial_health */}
        {score !== undefined && (
          <span style={{
            marginLeft:  "auto",
            fontSize:    11,
            fontWeight:  700,
            fontFamily:  "'DM Mono', monospace",
            color:       "hsl(var(--primary))",
            background:  "hsl(var(--primary) / 0.1)",
            border:      "1px solid hsl(var(--primary) / 0.2)",
            padding:     "2px 9px",
            borderRadius: 8,
          }}>
            {score}/10
          </span>
        )}
      </div>

      {/* ── Content text ──────────────────────────────────────────── */}
      <p style={{
        fontSize:   "clamp(11px,1.8vw,13px)",
        lineHeight: 1.65,
        color:      "hsl(var(--foreground))",
        flex:       1,
      }}>
        {text}
      </p>

      {/* ── Rating row ────────────────────────────────────────────── */}
      <div style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        borderTop:       "1px solid hsl(var(--border) / 0.5)",
        paddingTop:      8,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: "0.04em",
          color: "hsl(var(--muted-foreground))",
        }}>
          {rated === null
            ? "Was this helpful?"
            : rated
              ? "Marked helpful"
              : "Marked not helpful"}
        </span>

        <div style={{ display: "flex", gap: 5 }}>
          {/* Thumbs Up */}
          <button
            onClick={() => handleRate(true)}
            disabled={rated !== null || busy}
            title="Helpful"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 9px", borderRadius: 7,
              border:      `1px solid ${rated === true  ? `${A.emerald}45` : "hsl(var(--border))"}`,
              background:  rated === true  ? `${A.emerald}14` : "transparent",
              color:       rated === true  ? A.emerald : "hsl(var(--muted-foreground))",
              opacity:     rated === false ? 0.3 : 1,
              fontSize:    11, fontWeight: 600,
              cursor:      rated !== null  ? "default" : "pointer",
              transition:  "all 0.18s",
            }}
          >
            <ThumbsUp size={11} />
            {rated === true && <span>Helpful</span>}
          </button>

          {/* Thumbs Down */}
          <button
            onClick={() => handleRate(false)}
            disabled={rated !== null || busy}
            title="Not helpful"
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 9px", borderRadius: 7,
              border:      `1px solid ${rated === false ? `${A.red}45`     : "hsl(var(--border))"}`,
              background:  rated === false ? `${A.red}14`     : "transparent",
              color:       rated === false ? A.red     : "hsl(var(--muted-foreground))",
              opacity:     rated === true  ? 0.3 : 1,
              fontSize:    11, fontWeight: 600,
              cursor:      rated !== null  ? "default" : "pointer",
              transition:  "all 0.18s",
            }}
          >
            <ThumbsDown size={11} />
            {rated === false && <span>Not helpful</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton card (shown while isLoading) ────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{ ...card, padding: "clamp(12px,2vw,16px)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Skeleton className="h-7 w-7 shrink-0" style={{ borderRadius: 8 }} />
        <Skeleton className="h-2.5 w-24" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-11/12" />
        <Skeleton className="h-2.5 w-4/6" />
      </div>
      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 5,
        borderTop: "1px solid hsl(var(--border) / 0.4)", paddingTop: 8,
      }}>
        <Skeleton className="h-6 w-14" style={{ borderRadius: 7 }} />
        <Skeleton className="h-6 w-14" style={{ borderRadius: 7 }} />
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export function AIInsightsPanel() {
  const { insights, isLoading, isGenerating, error, refresh, rateInsight } = useAIInsights();

  // Build an ordered map so ORDERED_TYPES controls display sequence
  const insightMap = new Map(
    (insights ?? []).map((i) => [i.insight_type, i])
  );

  return (
    <>
      {/* Keyframes scoped here so they don't pollute Dashboard's style tag */}
      <style>{`
        @keyframes aiSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);     }
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
      `}</style>

      <div style={{ animation: "dshFadeUp 0.45s ease both", animationDelay: "400ms" }}>

        {/* ── Section header ──────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={14} color="hsl(var(--primary))" />
            <div>
              <p style={labelSt}>AI Insights</p>
              <p style={{
                fontSize: "clamp(13px,2.2vw,16px)", fontWeight: 800,
                letterSpacing: "-0.02em", color: "hsl(var(--foreground))",
              }}>
                Personal Analysis
              </p>
            </div>
          </div>

          {/* Refresh button — only when idle with data */}
          {!isLoading && !isGenerating && insights && insights.length > 0 && (
            <button
              onClick={refresh}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 12px", borderRadius: 10,
                border:      "1px solid hsl(var(--border))",
                background:  "transparent",
                color:       "hsl(var(--muted-foreground))",
                fontSize:    11, fontWeight: 600,
                cursor:      "pointer", transition: "all 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget).style.background = "hsl(var(--muted))"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = "transparent"; }}
            >
              <RefreshCw size={11} />
              Refresh
            </button>
          )}
        </div>

        {/* ── Generating banner (shown above cards while Edge Function runs) ── */}
        {isGenerating && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 14px", borderRadius: 12, marginBottom: 12,
            background: "hsl(var(--primary) / 0.06)",
            border:     "1px solid hsl(var(--primary) / 0.18)",
            animation:  "aiPulse 2s ease-in-out infinite",
          }}>
            <Loader2
              size={13}
              color="hsl(var(--primary))"
              style={{ animation: "spin 1s linear infinite" }}
            />
            <span style={{
              fontSize: 12, fontWeight: 600, color: "hsl(var(--primary))",
              letterSpacing: "-0.01em",
            }}>
              Analyzing your data…
            </span>
          </div>
        )}

        {/* ── Error state ─────────────────────────────────────────────── */}
        {error && !isGenerating && (
          <div style={{
            ...card,
            padding: "clamp(20px,3vw,28px)",
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 12, textAlign: "center",
          }}>
            <AlertTriangle size={22} color={A.gold} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 4 }}>
                Could not generate insights
              </p>
              <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, maxWidth: 300 }}>
                {error}
              </p>
            </div>
            <button
              onClick={refresh}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 10,
                border:     "1px solid hsl(var(--border))",
                background: "hsl(var(--muted))",
                color:      "hsl(var(--foreground))",
                fontSize:   12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <RefreshCw size={12} />
              Try again
            </button>
          </div>
        )}

        {/* ── Skeleton cards (initial DB load) ────────────────────────── */}
        {isLoading && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* ── Empty state (no insights, not loading, no error) ────────── */}
        {!isLoading && !error && !isGenerating && (!insights || insights.length === 0) && (
          <div style={{
            ...card,
            padding: "clamp(24px,4vw,36px)",
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 14, textAlign: "center",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "hsl(var(--primary) / 0.1)",
              border:     "1px solid hsl(var(--primary) / 0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Sparkles size={20} color="hsl(var(--primary))" />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 5 }}>
                No insights yet
              </p>
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.5, maxWidth: 260 }}>
                Generate a personalised AI analysis of your spending and habit patterns.
              </p>
            </div>
            <button
              onClick={refresh}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "9px 20px", borderRadius: 10,
                background: "hsl(var(--primary))",
                color:      "hsl(var(--primary-foreground))",
                border:     "none",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 0 20px hsl(var(--primary) / 0.3)",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => { (e.currentTarget).style.opacity = "0.88"; }}
              onMouseLeave={(e) => { (e.currentTarget).style.opacity = "1"; }}
            >
              <Sparkles size={13} />
              Generate Insights
            </button>
          </div>
        )}

        {/* ── Insight cards (normal state) ────────────────────────────── */}
        {!isLoading && !error && insights && insights.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {ORDERED_TYPES.map((type, i) => {
              const insight = insightMap.get(type);
              if (!insight) return null;
              return (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onRate={rateInsight}
                  animDelay={i * 60}
                />
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}
