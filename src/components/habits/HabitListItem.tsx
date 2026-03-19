import { useState, useRef, useEffect } from "react";
import { format, subDays, isAfter, parseISO } from "date-fns";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Habit,
  HabitCompletion,
  useToggleHabitCompletion,
  useDeleteHabit,
  calculateStreak,
} from "@/hooks/useHabits";
import { EditHabitDialog } from "./EditHabitDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
  isSelected: boolean;
  onSelect: () => void;
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const DotsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);
const GripIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="opacity-40">
    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
  </svg>
);

// ── 7-day pip row ──────────────────────────────────────────────────────────────
function SevenDayRow({ completions, habitId }: { completions: HabitCompletion[]; habitId: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    return {
      label: format(date, "EEEEE"),
      isToday: i === 6,
      done: completions.some(
        (c) => c.habit_id === habitId && c.date === format(date, "yyyy-MM-dd")
      ),
    };
  });

  return (
    <div className="flex items-end gap-[5px]">
      {days.map(({ done, isToday, label }, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "w-[18px] h-[5px] rounded-full transition-all duration-300 origin-bottom",
              done
                ? "bg-primary scale-y-[1.5]"
                : isToday
                ? "bg-primary/30 scale-y-[1.2]"
                : "bg-muted-foreground/15"
            )}
          />
          <span
            className={cn(
              "text-[8px] font-semibold uppercase tracking-[0.05em]",
              isToday ? "text-primary font-extrabold" : "text-muted-foreground/45"
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Desktop context menu ───────────────────────────────────────────────────────
function ContextMenu({
  onEdit,
  onDelete,
  onClose,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[152px] p-[5px] bg-popover border border-border/80 rounded-[14px] shadow-[0_4px_6px_hsl(var(--foreground)/0.04),0_20px_50px_hsl(var(--foreground)/0.10)] animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
      <button
        className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] border-none bg-transparent text-foreground cursor-pointer text-[13px] font-medium font-[inherit] hover:bg-muted/80 transition-colors duration-100"
        onClick={() => { onEdit(); onClose(); }}
      >
        <PencilIcon /> Edit habit
      </button>
      <div className="h-px bg-border/60 my-[3px]" />
      <button
        className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] border-none bg-transparent text-destructive cursor-pointer text-[13px] font-medium font-[inherit] hover:bg-destructive/[0.08] transition-colors duration-100"
        onClick={() => { onDelete(); onClose(); }}
      >
        <TrashIcon /> Delete
      </button>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const SWIPE_START_THRESHOLD = 10;
const SWIPE_OPEN_AT = 50;
const SWIPE_OPEN_WIDTH = 124;

// ── CheckButton ────────────────────────────────────────────────────────────────
function CheckButton({
  done,
  pending,
  onToggle,
}: {
  done: boolean;
  pending: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  const [pressing, setPressing] = useState(false);

  return (
    <>
      {/* Keyframes cannot be expressed in Tailwind without config edits — kept minimal */}
      <style>{`
        .habit-check-pop { animation: checkPop 0.35s cubic-bezier(0.34,1.56,0.64,1); }
        .habit-icon-in   { animation: iconIn  0.22s ease 0.08s both; }
        @keyframes checkPop {
          0%   { transform: scale(0.65); }
          55%  { transform: scale(1.14); }
          100% { transform: scale(1);    }
        }
        @keyframes iconIn {
          from { opacity: 0; transform: scale(0.4) rotate(-15deg); }
          to   { opacity: 1; transform: scale(1)   rotate(0deg);   }
        }
      `}</style>

      <button
        className={cn(
          "w-9 h-9 rounded-full border-2 border-border bg-transparent cursor-pointer",
          "flex items-center justify-center shrink-0 p-0 select-none isolate",
          "[transform:translateZ(0)] [-webkit-transform:translateZ(0)]",
          "transition-[border-color,background-color,box-shadow] duration-200",
          "[-webkit-tap-highlight-color:transparent] touch-manipulation",
          "hover:border-primary/50 hover:bg-primary/[0.06]",
          "active:scale-[0.86]",
          pressing && !done && "scale-[0.86]",
          done && "border-primary bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.12)] habit-check-pop",
          "disabled:opacity-35 disabled:cursor-default"
        )}
        onClick={onToggle}
        disabled={pending}
        aria-label={done ? "Mark undone" : "Mark done"}
        onTouchStart={(e) => { e.stopPropagation(); setPressing(true); }}
        onTouchEnd={(e) => { e.stopPropagation(); setPressing(false); }}
        onTouchCancel={() => setPressing(false)}
      >
        <span
          className={cn(
            "flex items-center pointer-events-none transition-colors duration-200",
            done ? "text-primary-foreground habit-icon-in" : "text-muted-foreground/35"
          )}
        >
          <CheckIcon size={14} />
        </span>
      </button>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function HabitListItem({ habit, completions, isSelected, onSelect }: Props) {
  const toggle = useToggleHabitCompletion();
  const deleteHabit = useDeleteHabit();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);
  const [isActiveSwipe, setIsActiveSwipe] = useState(false);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeIntent = useRef<"none" | "swipe" | "scroll">("none");

  const today     = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const isDoneToday       = completions.some((c) => c.habit_id === habit.id && c.date === today);
  const isDoneYesterday   = completions.some((c) => c.habit_id === habit.id && c.date === yesterday);
  const canRetroYesterday = !isDoneYesterday && !isAfter(parseISO(habit.start_date), parseISO(yesterday));
  const streak            = calculateStreak(completions, habit.id, habit.start_date);
  const totalDone         = completions.filter((c) => c.habit_id === habit.id).length;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: habit.id });

  // ── Optimistic done state ──────────────────────────────────────────────────
  // Flips instantly on tap so the UI never waits for the server round-trip.
  // The useEffect syncs back ONLY when no mutation is in-flight — this prevents
  // React Query's intermediate re-fetch (where isDoneToday briefly flips back
  // to false) from rolling back the optimistic state before the server confirms.
  const [optimisticDone, setOptimisticDone] = useState(isDoneToday);

  useEffect(() => {
    if (!toggle.isPending) {
      setOptimisticDone(isDoneToday);
    }
  }, [isDoneToday, toggle.isPending]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggle = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (date === today) setOptimisticDone((prev) => !prev); // instant feedback
    try {
      await toggle.mutateAsync({ habitId: habit.id, date });
    } catch {
      if (date === today) setOptimisticDone(isDoneToday); // rollback on error
      toast.error("Failed to update");
    }
  };

  const handleDelete = async () => {
    try { await deleteHabit.mutateAsync(habit.id); toast.success("Habit deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  const closeSwipe = () => { setSwipeX(0); setIsSwipeOpen(false); };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeIntent.current = "none";
    setIsActiveSwipe(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (swipeIntent.current === "none") {
      if (absDx < SWIPE_START_THRESHOLD && absDy < SWIPE_START_THRESHOLD) return;
      swipeIntent.current = absDy > absDx ? "scroll" : "swipe";
    }
    if (swipeIntent.current === "scroll") return;
    e.preventDefault();
    const base    = isSwipeOpen ? -SWIPE_OPEN_WIDTH : 0;
    const raw     = base + dx;
    const clamped = Math.min(0, Math.max(-SWIPE_OPEN_WIDTH - 10, raw));
    setSwipeX(clamped);
  };

  const onTouchEnd = () => {
    setIsActiveSwipe(false);
    if (swipeIntent.current !== "swipe") return;
    const open = swipeX < -SWIPE_OPEN_AT;
    setIsSwipeOpen(open);
    setSwipeX(open ? -SWIPE_OPEN_WIDTH : 0);
  };

  const handleItemClick = () => {
    if (isSwipeOpen) { closeSwipe(); return; }
    onSelect();
  };

  return (
    <>
      {/* ── Outer wrapper: dnd-kit owns transform/transition here ── */}
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "relative rounded-[18px] overflow-hidden",
          "transition-shadow duration-200",
          "hover:shadow-[0_2px_20px_hsl(var(--foreground)/0.06)]",
          isDragging && "z-[999] shadow-[0_24px_56px_hsl(var(--foreground)/0.15),0_6px_16px_hsl(var(--foreground)/0.08)]"
        )}
      >
        {/* ── Swipe action buttons — visible on touch devices only ── */}
        <div
          className={cn(
            "absolute right-[10px] top-1/2 -translate-y-1/2 z-0 flex items-center gap-[7px]",
            "[@media(hover:hover)_and_(pointer:fine)]:hidden",
            isSwipeOpen ? "pointer-events-auto" : "pointer-events-none"
          )}
        >
          <button
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-[52px] h-[52px] rounded-[14px]",
              "bg-primary/[0.12] text-primary border border-primary/20",
              "text-[9px] font-bold uppercase tracking-[0.06em] font-[inherit]",
              "[-webkit-tap-highlight-color:transparent] touch-manipulation",
              "transition-[transform,opacity] duration-200 active:scale-90",
              isSwipeOpen ? "opacity-100" : "opacity-0"
            )}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={() => { setEditOpen(true); closeSwipe(); }}
          >
            <PencilIcon /> Edit
          </button>

          <button
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-[52px] h-[52px] rounded-[14px]",
              "bg-destructive/[0.10] text-destructive border border-destructive/20",
              "text-[9px] font-bold uppercase tracking-[0.06em] font-[inherit]",
              "[-webkit-tap-highlight-color:transparent] touch-manipulation",
              "transition-[transform,opacity] duration-200 active:scale-90",
              isSwipeOpen ? "opacity-100" : "opacity-0"
            )}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={() => { handleDelete(); closeSwipe(); }}
          >
            <TrashIcon /> Delete
          </button>
        </div>

        {/* ── Main card row ── */}
        <div
          className={cn(
            "relative z-[1] flex items-center gap-[13px] px-4 py-[15px] pl-3 cursor-pointer",
            "bg-card rounded-[18px] border border-border/60",
            "touch-pan-y",
            !isActiveSwipe && "transition-transform duration-[280ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
            "hover:bg-muted/60 hover:border-border",
            isSelected && "bg-primary/[0.04] border-primary/25",
            isDragging && "opacity-[0.97]"
          )}
          style={{ transform: `translateX(${swipeX}px)` }}
          onClick={handleItemClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Selected left accent bar */}
          {isSelected && (
            <div className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-primary" />
          )}

          {/* ── Drag handle ── */}
          <div
            className={cn(
              "flex items-center justify-center w-[22px] h-9 shrink-0 rounded-md",
              "text-muted-foreground/35 cursor-grab select-none touch-none",
              "[-webkit-tap-highlight-color:transparent] [-webkit-user-select:none]",
              "transition-colors duration-150 hover:text-muted-foreground/70",
              "active:cursor-grabbing",
              isDragging && "cursor-grabbing text-primary"
            )}
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon />
          </div>

          {/* ── Emoji avatar ── */}
          <div
            className={cn(
              "w-[46px] h-[46px] shrink-0 rounded-[14px]",
              "bg-muted/70 border border-border/50",
              "flex items-center justify-center text-[22px] leading-none",
              "transition-[filter,transform,background-color,border-color] duration-200",
              "hover:scale-105",
              isSelected && "bg-primary/[0.08] border-primary/15"
            )}
            style={{ filter: optimisticDone ? "none" : "grayscale(0.25) opacity(0.8)" }}
          >
            {habit.emoji}
          </div>

          {/* ── Body ── */}
          <div className="flex-1 min-w-0 flex flex-col gap-[9px]">

            {/* Name + badge row */}
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                className={cn(
                  "font-semibold text-[14px] tracking-[-0.025em] text-foreground leading-[1.3]",
                  "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]",
                  "sm:whitespace-nowrap sm:[display:block] sm:overflow-hidden sm:text-ellipsis",
                  "transition-[opacity,color] duration-200",
                  optimisticDone && "opacity-30 line-through decoration-muted-foreground/40 decoration-[1.5px]"
                )}
              >
                {habit.name}
              </span>

              <span className="shrink-0">
                {streak > 0 ? (
                  <span className="inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-full bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/25 text-[11px] font-bold text-amber-700 dark:text-amber-400 tracking-[-0.01em] whitespace-nowrap">
                    🔥 {streak}d
                  </span>
                ) : (
                  <span className="inline-flex items-center px-[7px] py-[2px] rounded-full bg-muted/80 border border-border/60 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                    {totalDone} done
                  </span>
                )}
              </span>
            </div>

            {/* 7-day pip track */}
            <SevenDayRow completions={completions} habitId={habit.id} />
          </div>

          {/* ── Right controls ── */}
          <div className="flex flex-col items-end gap-[9px] shrink-0">
            <div className="flex items-center gap-[5px]">

              {/* Retro-yesterday — always uses real server truth */}
              {canRetroYesterday && (
                <button
                  className={cn(
                    "flex items-center gap-1 px-[9px] py-[5px] rounded-full",
                    "border border-border bg-background text-muted-foreground",
                    "text-[10.5px] font-semibold font-[inherit] whitespace-nowrap tracking-[0.01em]",
                    "transition-all duration-150 cursor-pointer",
                    "hover:border-primary/40 hover:text-primary hover:bg-primary/[0.05]",
                    "active:scale-95",
                    "disabled:opacity-35 disabled:cursor-default",
                    "[-webkit-tap-highlight-color:transparent] touch-manipulation"
                  )}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  onClick={(e) => handleToggle(yesterday, e)}
                  disabled={toggle.isPending}
                >
                  <CalendarIcon /> yday
                </button>
              )}

              {/* Dots menu — desktop only */}
              <div className="hidden [@media(hover:hover)_and_(pointer:fine)]:block relative">
                <button
                  className={cn(
                    "flex items-center justify-center w-[30px] h-[30px] rounded-full",
                    "border-none bg-transparent text-muted-foreground/60 cursor-pointer",
                    "transition-[background-color,color] duration-150",
                    "hover:bg-muted hover:text-foreground",
                    menuOpen && "bg-muted text-foreground"
                  )}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
                >
                  <DotsIcon />
                </button>
                {menuOpen && (
                  <ContextMenu
                    onEdit={() => setEditOpen(true)}
                    onDelete={handleDelete}
                    onClose={() => setMenuOpen(false)}
                  />
                )}
              </div>
            </div>

            {/* Check button — driven by optimisticDone, never waits for server */}
            <CheckButton
              done={optimisticDone}
              pending={toggle.isPending}
              onToggle={(e) => handleToggle(today, e)}
            />
          </div>
        </div>
      </div>

      <EditHabitDialog habit={habit} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}