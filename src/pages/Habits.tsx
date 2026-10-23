import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  DndContext,
  DragEndEvent,
  type Modifier,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { AppLayout } from "@/components/AppLayout";
import { AddHabitDialog } from "@/components/habits/AddHabitDialog";
import { HabitListItem } from "@/components/habits/HabitListItem";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { HabitAnalytics } from "@/components/habits/HabitAnalytics";
import { HabitSheet } from "@/components/habits/HabitSheet";
import {
  useHabits,
  useHabitCompletions,
  useReorderHabits,
} from "@/hooks/useHabits";
import { useHabitReminders } from "@/hooks/useHabitReminders";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// The desktop list + detail render under CSS `zoom` (see .hp-body styles).
const DESKTOP_ZOOM = 0.8;
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

// Pointer deltas arrive in screen px but the drag transform is applied inside the
// zoomed list, so divide it back out or the card lags behind the cursor.
const unzoomDrag: Modifier = ({ transform }) =>
  isDesktop() ? { ...transform, x: transform.x / DESKTOP_ZOOM, y: transform.y / DESKTOP_ZOOM } : transform;

type Habit = NonNullable<ReturnType<typeof useHabits>["data"]>[0];
type Completions = NonNullable<ReturnType<typeof useHabitCompletions>["data"]>;

function HabitDetail({
  habit,
  completions,
  onClose,
  hideHeader,
}: {
  habit: Habit;
  completions: Completions;
  onClose?: () => void;
  /** Desktop panel skips the name header; the mobile sheet keeps it as its drag handle. */
  hideHeader?: boolean;
}) {
  return (
    <div className="hd-inner">
      {!hideHeader && <div className="hd-hero" data-sheet-grab>
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
      </div>}

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
  const [activeTab, setActiveTab] = useState("habits");
  const reorderHabits = useReorderHabits();

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

  /**
   * PointerSensor — desktop mouse.
   * distance: 8 prevents accidental drags on single clicks.
   *
   * TouchSensor — mobile finger.
   * delay: 150ms + tolerance: 5px cleanly separates a deliberate
   * vertical drag from a tap or the horizontal swipe gesture.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeHabits.findIndex((h) => h.id === active.id);
    const newIndex = activeHabits.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // arrayMove produces new array — never mutates the original
    const reordered = arrayMove(activeHabits, oldIndex, newIndex);
    reorderHabits.mutate({ orderedHabits: reordered });
  };

  return (
    <AppLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .hp-root { font-family: 'DM Sans', var(--font-sans, sans-serif); }

        /* ── Header ── */
        .hp-header { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
        .hp-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .hp-title { font-size: calc(28px * var(--tz, 1)); font-weight: 700; letter-spacing: -0.035em; color: hsl(var(--foreground)); line-height: 1.1; }
        .hp-subtitle { font-size: calc(13px * var(--tz, 1)); color: hsl(var(--muted-foreground)); margin-top: 3px; }

        /* ── Progress ── */
        .hp-progress-strip { display: flex; align-items: center; gap: 14px; }
        .hp-progress-track { flex: 1; height: 5px; border-radius: 99px; background: hsl(var(--border)); overflow: hidden; }
        .hp-progress-fill { height: 100%; border-radius: 99px; background: hsl(var(--primary)); transition: width 0.6s cubic-bezier(0.34, 1.2, 0.64, 1); }
        .hp-progress-label { font-size: calc(12px * var(--tz, 1)); font-weight: 600; color: hsl(var(--muted-foreground)); white-space: nowrap; flex-shrink: 0; }
        .hp-progress-label strong { color: hsl(var(--foreground)); }

        /* ── Body ── */
        .hp-body { display: flex; gap: 24px; align-items: flex-start; }
        .hp-list-col { flex: 1; min-width: 0; }
        .hp-list { display: flex; flex-direction: column; gap: 2px; }
        .hp-item-wrap { animation: hpFadeUp 0.35s ease both; }
        @keyframes hpFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Empty state ── */
        .hp-empty {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 64px 24px; border-radius: 18px; border: 1.5px dashed hsl(var(--border));
          text-align: center; gap: 10px;
        }
        .hp-empty-emoji { font-size: calc(40px * var(--tz, 1)); line-height: 1; }
        .hp-empty-text { font-size: calc(14px * var(--tz, 1)); color: hsl(var(--muted-foreground)); max-width: 220px; line-height: 1.5; }

        /* ── Skeletons ── */
        .hp-skeleton-list { display: flex; flex-direction: column; gap: 4px; }

        /* ── Desktop sidebar ── */
        .hp-detail-col { flex: 1; min-width: 0; display: none; position: sticky; top: 80px; }
        @media (min-width: 1024px) {
          /* Desktop density: lay out at 80% (like browser zoom) but scale text back
             up via --tz so it stays readable. Keep in sync with DESKTOP_ZOOM. */
          .hp-body { zoom: ${DESKTOP_ZOOM}; --tz: 1.15; }
          /* both columns are capped and the pair sits centred on wide screens */
          .hp-body { justify-content: center; }
          .hp-detail-col { display: block; flex: 0 1 620px; top: calc(80px / ${DESKTOP_ZOOM}); }
          .hp-list-col { flex: 0 1 480px; min-width: 340px; }
        }
        .hp-detail-card { border-radius: 18px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); overflow: hidden; }

        /* ── Mobile bottom spacing ── */
        @media (max-width: 1023px) {
          .hp-list-col {
            padding-bottom: calc(96px + env(safe-area-inset-bottom, 16px));
          }
        }

        /* ── Shared detail styles ── */
        .hd-inner { display: flex; flex-direction: column; }
        .hd-hero {
          display: flex; align-items: center; gap: 14px;
          padding: 12px 14px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .hd-emoji {
          width: 40px; height: 40px; border-radius: 11px;
          background: hsl(var(--muted)); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: calc(21px * var(--tz, 1));
        }
        .hd-hero-text { flex: 1; min-width: 0; }
        .hd-name {
          font-size: calc(17px * var(--tz, 1)); font-weight: 700; letter-spacing: -0.025em;
          color: hsl(var(--foreground)); line-height: 1.2;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .hd-since { font-size: calc(12px * var(--tz, 1)); color: hsl(var(--muted-foreground)); margin-top: 2px; }
        .hd-close {
          width: 32px; height: 32px; border-radius: 50%;
          border: none; background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: background 0.15s, color 0.15s;
        }
        .hd-close:hover { background: hsl(var(--border)); color: hsl(var(--foreground)); }
        .hd-section { padding: 10px; border-bottom: 1px solid hsl(var(--border)); }
        .hd-section:last-child { border-bottom: none; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
        .hd-section-title { font-size: calc(10.5px * var(--tz, 1)); font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
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
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid max-w-md grid-cols-2 mb-6 mx-auto">
            <TabsTrigger value="habits">Habits</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="habits" className="mt-0">
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
                {/* Habit list — wrapped in DnD context */}
                <div className="hp-list-col">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    modifiers={[restrictToVerticalAxis, unzoomDrag]}
                  >
                    <SortableContext
                      items={activeHabits.map((h) => h.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="hp-list">
                        {activeHabits.map((habit, i) => (
                          <div
                            key={habit.id}
                            className="hp-item-wrap"
                            style={{ animationDelay: `${i * 55}ms` }}
                          >
                            <HabitListItem
                              habit={habit}
                              completions={completions || []}
                              isSelected={habit.id === selectedHabit?.id}
                              onSelect={() => handleSelect(habit.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>

                {/* Desktop sidebar */}
                {selectedHabit && (
                  <div className="hp-detail-col">
                    <div className="hp-detail-card">
                      <HabitDetail habit={selectedHabit} completions={completions || []} hideHeader />
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <HabitAnalytics habits={habits || []} completions={completions || []} />
          </TabsContent>
        </Tabs>

        {/* Mobile bottom sheet (iOS / Spotify style: drag down to close) */}
        {sheetOpen && selectedHabit && (
          <HabitSheet label={selectedHabit.name} onClose={() => setSheetOpen(false)}>
            {() => <HabitDetail habit={selectedHabit} completions={completions || []} />}
          </HabitSheet>
        )}
      </div>
    </AppLayout>
  );
}