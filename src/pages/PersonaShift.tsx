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
import { usePersonaRules, useReorderPersonaRules } from "@/hooks/usePersonaRules";
import { useHabitCompletions } from "@/hooks/useHabits";
import { Skeleton } from "@/components/ui/skeleton";

export default function PersonaShift() {
  const { data: rules, isLoading: rulesLoading } = usePersonaRules();
  const { data: completions, isLoading: completionsLoading } = useHabitCompletions();
  const reorder = useReorderPersonaRules();

  const isLoading = rulesLoading || completionsLoading;
  const activeRules = (rules || []).filter((r) => r.is_active);

  const today = format(new Date(), "yyyy-MM-dd");
  const heldToday = activeRules.filter((r) =>
    (completions || []).some((c) => c.habit_id === r.id && c.date === today)
  ).length;
  const total = activeRules.length;
  const progressPct = total > 0 ? (heldToday / total) * 100 : 0;

  // Same sensor tuning as the Habits page.
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
      <div style={{ fontFamily: "'DM Sans', var(--font-sans, sans-serif)" }}>
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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </AppLayout>
  );
}
