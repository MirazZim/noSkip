import { useState, useEffect } from "react";
import { format } from "date-fns";
import { AppLayout } from "@/components/AppLayout";
import { AddHabitDialog } from "@/components/habits/AddHabitDialog";
import { HabitListItem } from "@/components/habits/HabitListItem";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { HabitQuote } from "@/components/habits/HabitQuote";
import { StreakGrid } from "@/components/habits/StreakGrid";
import { useHabits, useHabitCompletions, calculateStreak } from "@/hooks/useHabits";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { Skeleton } from "@/components/ui/skeleton";

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

type Habit = NonNullable<ReturnType<typeof useHabits>["data"]>[0];
type Completions = NonNullable<ReturnType<typeof useHabitCompletions>["data"]>;

function HabitDetail({
  habit,
  completions,
  onClose,
}: {
  habit: Habit;
  completions: Completions;
  onClose?: () => void;
}) {
  const streak = calculateStreak(completions, habit.id, habit.start_date);
  const total = completions.filter((c) => c.habit_id === habit.id).length;
  const daysSinceStart = Math.max(
    1,
    Math.ceil((Date.now() - new Date(habit.start_date).getTime()) / 86400000)
  );
  const rate = total > 0 ? Math.round((total / daysSinceStart) * 100) : 0;

  return (
    <div className="hd-inner">
      <div className="hd-hero">
        <div className="hd-emoji">{habit.emoji}</div>
        <div className="hd-hero-text">
          <div className="hd-name">{habit.name}</div>
          <div className="hd-since">Since {format(new Date(habit.start_date), "MMM d, yyyy")}</div>
        </div>
        {onClose && (
          <button className="hd-close" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        )}
      </div>

      <div className="hd-stats">
        <div className="hd-stat">
          <span className="hd-stat-value">{streak > 0 ? streak : "—"}</span>
          <span className="hd-stat-label">{streak > 0 ? "🔥 Streak" : "Streak"}</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-value">{total}</span>
          <span className="hd-stat-label">Total</span>
        </div>
        <div className="hd-stat">
          <span className="hd-stat-value">{rate > 0 ? `${rate}%` : "—"}</span>
          <span className="hd-stat-label">Rate</span>
        </div>
      </div>

      <div className="hd-section">
        <p className="hd-section-title">Year overview</p>
        <StreakGrid habitId={habit.id} completions={completions} />
      </div>

      <div className="hd-section">
        <HabitDetailPanel habit={habit} completions={completions} />
      </div>
    </div>
  );
}

export default function Habits() {
  const { data: habits, isLoading: habitsLoading } = useHabits();
  const { data: completions, isLoading: completionsLoading } = useHabitCompletions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useHabitReminders(habits, completions);

  const isLoading = habitsLoading || completionsLoading;
  const activeHabits = habits?.filter((h) => h.is_active) || [];
  const selectedHabit = activeHabits.find((h) => h.id === selectedId) || activeHabits[0] || null;

  const today = format(new Date(), "yyyy-MM-dd");
  const completedToday = activeHabits.filter((h) =>
    (completions || []).some((c) => c.habit_id === h.id && c.date === today)
  ).length;
  const totalHabits = activeHabits.length;
  const progressPct = totalHabits > 0 ? (completedToday / totalHabits) * 100 : 0;

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setSheetOpen(true);
    }
  };

  return (
    <AppLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .hp-root { font-family: 'DM Sans', var(--font-sans, sans-serif); }

        /* Header */
        .hp-header { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .hp-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .hp-title { font-size: 28px; font-weight: 700; letter-spacing: -0.035em; color: hsl(var(--foreground)); line-height: 1.1; }
        .hp-subtitle { font-size: 13px; color: hsl(var(--muted-foreground)); margin-top: 3px; }

        /* Progress */
        .hp-progress-strip { display: flex; align-items: center; gap: 14px; }
        .hp-progress-track { flex: 1; height: 5px; border-radius: 99px; background: hsl(var(--border)); overflow: hidden; }
        .hp-progress-fill { height: 100%; border-radius: 99px; background: hsl(var(--primary)); transition: width 0.6s cubic-bezier(0.34, 1.2, 0.64, 1); }
        .hp-progress-label { font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground)); white-space: nowrap; flex-shrink: 0; }
        .hp-progress-label strong { color: hsl(var(--foreground)); }

        /* Body */
        .hp-body { display: flex; gap: 24px; align-items: flex-start; }
        .hp-list-col { flex: 1; min-width: 0; }
        .hp-list { display: flex; flex-direction: column; gap: 2px; }
        .hp-item-wrap { animation: hpFadeUp 0.35s ease both; }
        @keyframes hpFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Empty */
        .hp-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 64px 24px; border-radius: 18px; border: 1.5px dashed hsl(var(--border));
          text-align: center; gap: 10px;
        }
        .hp-empty-emoji { font-size: 40px; line-height: 1; }
        .hp-empty-text { font-size: 14px; color: hsl(var(--muted-foreground)); max-width: 220px; line-height: 1.5; }

        /* Skeletons */
        .hp-skeleton-list { display: flex; flex-direction: column; gap: 4px; }

        /* Desktop sidebar */
        .hp-detail-col { width: 540px; flex-shrink: 0; display: none; position: sticky; top: 80px; }
        @media (min-width: 1024px) { .hp-detail-col { display: block; } }
        .hp-detail-card { border-radius: 18px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); overflow: hidden; }

        /* Mobile sheet overlay */
        .hp-overlay {
          position: fixed; inset: 0; z-index: 40;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          animation: hpOverlayIn 0.2s ease forwards;
        }
        @keyframes hpOverlayIn { from { opacity: 0; } to { opacity: 1; } }

        /* Mobile bottom sheet */
        .hp-sheet {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
          background: hsl(var(--background));
          border-radius: 24px 24px 0 0;
          max-height: 90dvh;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          box-shadow: 0 -12px 60px rgba(0,0,0,0.25);
          animation: hpSheetIn 0.34s cubic-bezier(0.32, 1, 0.46, 1) forwards;
        }
        @media (min-width: 1024px) { .hp-sheet, .hp-overlay { display: none !important; } }
        @keyframes hpSheetIn {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        /* Sheet handle */
        .hp-handle-wrap { display: flex; justify-content: center; padding: 12px 0 6px; }
        .hp-handle-bar { width: 40px; height: 4px; border-radius: 99px; background: hsl(var(--muted-foreground) / 0.25); }

        /* ── Shared detail styles ── */
        .hd-inner { display: flex; flex-direction: column; }

        .hd-hero {
          display: flex; align-items: center; gap: 14px;
          padding: 18px 20px 16px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .hd-emoji {
          width: 52px; height: 52px; border-radius: 14px;
          background: hsl(var(--muted)); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 26px;
        }
        .hd-hero-text { flex: 1; min-width: 0; }
        .hd-name {
          font-size: 17px; font-weight: 700; letter-spacing: -0.025em;
          color: hsl(var(--foreground)); line-height: 1.2;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .hd-since { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; }

        .hd-close {
          width: 32px; height: 32px; border-radius: 50%;
          border: none; background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s;
        }
        .hd-close:hover { background: hsl(var(--border)); color: hsl(var(--foreground)); }

        .hd-stats { display: flex; border-bottom: 1px solid hsl(var(--border)); }
        .hd-stat {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 3px; padding: 16px 8px;
        }
        .hd-stat + .hd-stat { border-left: 1px solid hsl(var(--border)); }
        .hd-stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.04em; color: hsl(var(--foreground)); line-height: 1; }
        .hd-stat-label { font-size: 10px; font-weight: 600; color: hsl(var(--muted-foreground)); text-transform: uppercase; letter-spacing: 0.07em; }

        .hd-section { padding: 16px 20px; border-bottom: 1px solid hsl(var(--border)); }
        .hd-section:last-child { border-bottom: none; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
        .hd-section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
      `}</style>

      <div className="hp-root">
        {/* Header */}
        <div className="hp-header">
          <div className="hp-title-row">
            <div>
              <h1 className="hp-title">Habits</h1>
              <p className="hp-subtitle">
                {format(new Date(), "EEEE, MMMM d")} · {completedToday} of {totalHabits} done today
              </p>
            </div>
            <AddHabitDialog />
          </div>

          {totalHabits > 0 && (
            <div className="hp-progress-strip">
              <div className="hp-progress-track">
                <div className="hp-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="hp-progress-label">
                <strong>{Math.round(progressPct)}%</strong> complete
              </span>
            </div>
          )}

          <HabitQuote />
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="hp-skeleton-list">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : activeHabits.length === 0 ? (
          <div className="hp-empty">
            <span className="hp-empty-emoji">🎯</span>
            <p className="hp-empty-text">No habits yet. Create one to start building streaks!</p>
          </div>
        ) : (
          <div className="hp-body">
            {/* Habit list */}
            <div className="hp-list-col">
              <div className="hp-list">
                {activeHabits.map((habit, i) => (
                  <div key={habit.id} className="hp-item-wrap" style={{ animationDelay: `${i * 55}ms` }}>
                    <HabitListItem
                      habit={habit}
                      completions={completions || []}
                      isSelected={habit.id === selectedHabit?.id}
                      onSelect={() => handleSelect(habit.id)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop sidebar */}
            {selectedHabit && (
              <div className="hp-detail-col">
                <div className="hp-detail-card">
                  <HabitDetail habit={selectedHabit} completions={completions || []} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile bottom sheet */}
        {sheetOpen && selectedHabit && (
          <>
            <div className="hp-overlay" onClick={() => setSheetOpen(false)} />
            <div className="hp-sheet" role="dialog" aria-modal="true" aria-label={selectedHabit.name}>
              <div className="hp-handle-wrap">
                <div className="hp-handle-bar" />
              </div>
              <HabitDetail
                habit={selectedHabit}
                completions={completions || []}
                onClose={() => setSheetOpen(false)}
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}