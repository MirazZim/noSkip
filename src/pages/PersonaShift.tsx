import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  DndContext,
  DragEndEvent,
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
import { AddPersonaRuleDialog } from "@/components/persona/AddPersonaRuleDialog";
import { PersonaRuleListItem } from "@/components/persona/PersonaRuleListItem";
import { PersonaDetailPanel } from "@/components/persona/PersonaDetailPanel";
import { usePersonaRules, useReorderPersonaRules, type PersonaRule } from "@/hooks/usePersonaRules";
import { useHabitCompletions, type HabitCompletion, type Habit } from "@/hooks/useHabits";
import { Skeleton } from "@/components/ui/skeleton";

const XIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function PersonaRuleDetail({
  rule,
  completions,
  onClose,
}: {
  rule: PersonaRule;
  completions: HabitCompletion[];
  onClose?: () => void;
}) {
  // PersonaRule is structurally compatible with Habit — same required fields
  const habitCompat = rule as unknown as Habit;

  return (
    <div className="hd-inner">
      {onClose && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 14px 0" }}>
          <button className="hd-close" onClick={onClose} aria-label="Close">
            <XIcon />
          </button>
        </div>
      )}
      <div className="hd-section">
        <PersonaDetailPanel habit={habitCompat} completions={completions} description={rule.description} />
      </div>
    </div>
  );
}

export default function PersonaShift() {
  const { data: rules, isLoading: rulesLoading } = usePersonaRules();
  const { data: completions, isLoading: completionsLoading } = useHabitCompletions();
  const reorder = useReorderPersonaRules();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isLoading = rulesLoading || completionsLoading;
  const activeRules = (rules || []).filter((r) => r.is_active);
  const selectedRule = activeRules.find((r) => r.id === selectedId) || activeRules[0] || null;

  const today = format(new Date(), "yyyy-MM-dd");
  const heldToday = activeRules.filter((r) =>
    (completions || []).some((c) => c.habit_id === r.id && c.date === today)
  ).length;
  const total = activeRules.length;
  const progressPct = total > 0 ? (heldToday / total) * 100 : 0;

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeRules.findIndex((r) => r.id === active.id);
    const newIndex = activeRules.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeRules, oldIndex, newIndex);
    reorder.mutate({ orderedRules: reordered });
  };

  return (
    <AppLayout>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        .psp-root { font-family: 'DM Sans', var(--font-sans, sans-serif); }

        .psp-body { display: flex; gap: 24px; align-items: flex-start; }
        .psp-list-col { flex: 1; min-width: 0; }

        @media (max-width: 1023px) {
          .psp-list-col { padding-bottom: calc(96px + env(safe-area-inset-bottom, 16px)); }
        }

        .psp-detail-col { flex: 1; min-width: 0; display: none; position: sticky; top: 80px; }
        @media (min-width: 1024px) { .psp-detail-col { display: block; } }
        .psp-detail-card { border-radius: 18px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); overflow: hidden; }

        .psp-overlay {
          position: fixed; inset: 0; z-index: 40;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
          animation: pspOverlayIn 0.2s ease forwards;
        }
        @keyframes pspOverlayIn { from { opacity: 0; } to { opacity: 1; } }

        .psp-sheet {
          position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
          background: hsl(var(--background));
          border-radius: 24px 24px 0 0;
          max-height: 90dvh; overflow-y: auto;
          overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
          box-shadow: 0 -12px 60px rgba(0,0,0,0.25);
          animation: pspSheetIn 0.34s cubic-bezier(0.32, 1, 0.46, 1) forwards;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        @media (min-width: 1024px) { .psp-sheet, .psp-overlay { display: none !important; } }
        @keyframes pspSheetIn {
          from { transform: translateY(100%); opacity: 0.6; }
          to   { transform: translateY(0);    opacity: 1; }
        }

        .psp-handle-wrap { display: flex; justify-content: center; padding: 12px 0 6px; }
        .psp-handle-bar { width: 40px; height: 4px; border-radius: 99px; background: hsl(var(--muted-foreground) / 0.25); }

        /* Shared detail styles */
        .hd-inner { display: flex; flex-direction: column; }

        .hd-hero {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 20px 20px 18px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .hd-emoji {
          width: 56px; height: 56px; border-radius: 16px; flex-shrink: 0;
          background: linear-gradient(135deg, hsl(var(--primary) / 0.22) 0%, hsl(var(--primary) / 0.06) 100%);
          border: 1px solid hsl(var(--primary) / 0.18);
          display: flex; align-items: center; justify-content: center; font-size: 28px;
        }
        .hd-hero-text { flex: 1; min-width: 0; padding-top: 2px; }
        .hd-name {
          font-size: 17px; font-weight: 800; letter-spacing: -0.03em;
          color: hsl(var(--foreground)); line-height: 1.3;
        }
        .hd-since {
          font-size: 11.5px; color: hsl(var(--muted-foreground)); margin-top: 5px;
          display: flex; align-items: center; gap: 5px;
        }
        .hd-since::before {
          content: ''; display: inline-block;
          width: 5px; height: 5px; border-radius: 50%;
          background: hsl(var(--primary) / 0.5); flex-shrink: 0;
        }
        .hd-close {
          width: 30px; height: 30px; border-radius: 50%;
          border: none; background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; margin-top: 2px;
          transition: background 0.15s, color 0.15s;
        }
        .hd-close:hover { background: hsl(var(--border)); color: hsl(var(--foreground)); }

        .hd-stats {
          display: flex; gap: 8px;
          padding: 14px 16px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .hd-stat {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 4px; padding: 10px 6px;
          background: hsl(var(--muted) / 0.5);
          border-radius: 12px;
        }
        .hd-stat-value {
          font-size: 20px; font-weight: 700; letter-spacing: -0.04em;
          color: hsl(var(--foreground)); line-height: 1;
        }
        .hd-stat-label {
          font-size: 9.5px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: hsl(var(--muted-foreground)); text-align: center;
        }

        .hd-section { padding: 16px 20px; border-bottom: 1px solid hsl(var(--border)); }
        .hd-section:last-child { border-bottom: none; padding-bottom: max(20px, env(safe-area-inset-bottom)); }
        .hd-section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
      `}</style>

      <div className="psp-root">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-bold tracking-[-0.035em] leading-[1.1] text-foreground">
                Persona Shift
              </h1>
              <p className="text-[13px] text-muted-foreground mt-[3px]">
                {format(new Date(), "EEEE, MMMM d")} · {heldToday} of {total} held today
              </p>
            </div>
            <AddPersonaRuleDialog />
          </div>

          {total > 0 && (
            <div className="flex items-center gap-[14px]">
              <div className="flex-1 h-[5px] rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[12px] font-semibold text-muted-foreground whitespace-nowrap">
                <strong className="text-foreground">{Math.round(progressPct)}%</strong> held
              </span>
            </div>
          )}
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="flex flex-col gap-1">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : activeRules.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-[10px] py-16 px-6 rounded-[18px] border-[1.5px] border-dashed border-border">
            <span className="text-[40px] leading-none">🧭</span>
            <p className="text-[14px] text-muted-foreground max-w-[260px] leading-[1.5]">
              No persona rules yet. Write an identity you want to live by — the coach will read it before you commit.
            </p>
          </div>
        ) : (
          <div className="psp-body">
            {/* Rule list */}
            <div className="psp-list-col">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={activeRules.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {activeRules.map((rule) => (
                      <PersonaRuleListItem
                        key={rule.id}
                        rule={rule}
                        completions={completions || []}
                        isSelected={rule.id === selectedRule?.id}
                        onSelect={() => handleSelect(rule.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Desktop sidebar */}
            {selectedRule && (
              <div className="psp-detail-col">
                <div className="psp-detail-card">
                  <PersonaRuleDetail rule={selectedRule} completions={completions || []} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile bottom sheet */}
        {sheetOpen && selectedRule && (
          <>
            <div className="psp-overlay" onClick={() => setSheetOpen(false)} />
            <div className="psp-sheet" role="dialog" aria-modal="true" aria-label={selectedRule.name}>
              <div className="psp-handle-wrap">
                <div className="psp-handle-bar" />
              </div>
              <PersonaRuleDetail
                rule={selectedRule}
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
