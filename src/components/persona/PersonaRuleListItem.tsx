import { useState, useEffect, useRef } from "react";
import { format, subDays } from "date-fns";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Check, MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  calculateStreak,
  useToggleHabitCompletion,
  type HabitCompletion,
} from "@/hooks/useHabits";
import { useDeletePersonaRule, type PersonaRule } from "@/hooks/usePersonaRules";
import { EditPersonaRuleDialog } from "./EditPersonaRuleDialog";
import { PersonaCoachNote } from "./PersonaCoachNote";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  rule: PersonaRule;
  completions: HabitCompletion[];
}

// ── 7-day pip row (same shape as the habit row) ─────────────────────────────────
function SevenDayRow({ completions, ruleId }: { completions: HabitCompletion[]; ruleId: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    return {
      label: format(date, "EEEEE"),
      isToday: i === 6,
      done: completions.some((c) => c.habit_id === ruleId && c.date === format(date, "yyyy-MM-dd")),
    };
  });
  return (
    <div className="flex items-end gap-[5px]">
      {days.map(({ done, isToday, label }, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className={cn(
            "w-[18px] h-[5px] rounded-full transition-all duration-300 origin-bottom",
            done ? "bg-primary scale-y-[1.5]" : isToday ? "bg-primary/30 scale-y-[1.2]" : "bg-muted-foreground/15"
          )} />
          <span className={cn(
            "text-[8px] font-semibold uppercase tracking-[0.05em]",
            isToday ? "text-primary font-extrabold" : "text-muted-foreground/45"
          )}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PersonaRuleListItem({ rule, completions }: Props) {
  const toggle = useToggleHabitCompletion();
  const deleteRule = useDeletePersonaRule();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const isDoneToday = completions.some((c) => c.habit_id === rule.id && c.date === today);
  const streak = calculateStreak(completions, rule.id, rule.start_date);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rule.id });

  // Optimistic done state — reuses the shared toggle mutation verbatim.
  const [optimisticDone, setOptimisticDone] = useState(isDoneToday);
  useEffect(() => {
    if (!toggle.isPending) setOptimisticDone(isDoneToday);
  }, [isDoneToday, toggle.isPending]);

  // Close the menu on any outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const handleToggle = async () => {
    const wasDone = optimisticDone;
    setOptimisticDone(!wasDone);
    try {
      await toggle.mutateAsync({ habitId: rule.id, date: today });
    } catch {
      setOptimisticDone(wasDone);
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    try { await deleteRule.mutateAsync(rule.id); toast.success("Rule deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "rounded-[18px] border border-border/60 bg-card transition-shadow duration-200",
          "hover:shadow-[0_2px_20px_hsl(var(--foreground)/0.06)]",
          isDragging && "z-[999] shadow-[0_24px_56px_hsl(var(--foreground)/0.15)]"
        )}
      >
        <div className="flex items-center gap-[13px] px-4 py-[15px] pl-3">
          {/* Drag handle */}
          <div
            className={cn(
              "flex items-center justify-center w-[22px] h-9 shrink-0 rounded-md",
              "text-muted-foreground/35 cursor-grab select-none touch-none",
              "transition-colors duration-150 hover:text-muted-foreground/70 active:cursor-grabbing",
              isDragging && "cursor-grabbing text-primary"
            )}
            {...attributes} {...listeners}
          >
            <GripVertical className="h-[15px] w-[15px]" />
          </div>

          {/* Icon */}
          <div className="w-[46px] h-[46px] shrink-0 rounded-[14px] bg-muted/70 border border-border/50 flex items-center justify-center text-[22px] leading-none">
            {rule.emoji}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0 flex flex-col gap-[9px]">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={cn(
                "font-semibold text-[14px] tracking-[-0.025em] text-foreground leading-[1.3] min-w-0",
                "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]",
                optimisticDone && "opacity-30 line-through decoration-muted-foreground/40 decoration-[1.5px]"
              )}>
                {rule.name}
              </span>
              {streak > 0 && (
                <span className="shrink-0 inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-full bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                  🔥 {streak}d
                </span>
              )}
            </div>
            <SevenDayRow completions={completions} ruleId={rule.id} />
          </div>

          {/* Right controls */}
          <div className="flex flex-col items-end gap-[9px] shrink-0">
            <div className="relative" ref={menuRef}>
              <button
                className={cn(
                  "flex items-center justify-center w-[30px] h-[30px] rounded-full border-none bg-transparent",
                  "text-muted-foreground/60 cursor-pointer transition-colors duration-150 hover:bg-muted hover:text-foreground",
                  menuOpen && "bg-muted text-foreground"
                )}
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Rule options"
              >
                <MoreVertical className="h-[15px] w-[15px]" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[152px] p-[5px] bg-popover border border-border/80 rounded-[14px] shadow-[0_20px_50px_hsl(var(--foreground)/0.10)] animate-in fade-in-0 zoom-in-95 duration-150">
                  <button
                    className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] bg-transparent text-foreground cursor-pointer text-[13px] font-medium hover:bg-muted/80 transition-colors"
                    onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Reframe rule
                  </button>
                  <div className="h-px bg-border/60 my-[3px]" />
                  <button
                    className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] bg-transparent text-destructive cursor-pointer text-[13px] font-medium hover:bg-destructive/[0.08] transition-colors"
                    onClick={() => { handleDelete(); setMenuOpen(false); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Check button */}
            <button
              className={cn(
                "w-9 h-9 rounded-full border-2 border-border bg-transparent cursor-pointer",
                "flex items-center justify-center shrink-0 transition-all duration-200",
                "hover:border-primary/50 hover:bg-primary/[0.06] active:scale-[0.86]",
                optimisticDone && "border-primary bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.12)]",
                "disabled:opacity-35 disabled:cursor-default"
              )}
              onClick={handleToggle}
              disabled={toggle.isPending}
              aria-label={optimisticDone ? "Mark undone" : "Mark done"}
            >
              <Check className={cn("h-3.5 w-3.5", optimisticDone ? "text-primary-foreground" : "text-muted-foreground/35")} strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* Coach's read — persisted, always visible. Caution offers a reframe. */}
        {rule.coach_note && rule.flag_level !== "none" && (
          <div className="px-4 pb-[15px] pl-[48px]">
            <PersonaCoachNote
              flagLevel={rule.flag_level}
              note={rule.coach_note}
              onReframe={() => setEditOpen(true)}
            />
          </div>
        )}
      </div>

      <EditPersonaRuleDialog rule={rule} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
