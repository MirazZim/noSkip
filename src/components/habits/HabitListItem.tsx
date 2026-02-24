import { useState, useRef } from "react";
import { format, subDays, isAfter, parseISO } from "date-fns";
import { Habit, HabitCompletion, useToggleHabitCompletion, useDeleteHabit, calculateStreak } from "@/hooks/useHabits";
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
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);
const PencilIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const DotsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
  </svg>
);

// ── 7-day pip row ──────────────────────────────────────────────────────────────
function SevenDayRow({ completions, habitId }: { completions: HabitCompletion[]; habitId: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    return {
      label: format(date, "EEEEE"),
      isToday: i === 6,
      done: completions.some((c) => c.habit_id === habitId && c.date === format(date, "yyyy-MM-dd")),
    };
  });
  return (
    <div className="hi-7day">
      {days.map(({ done, isToday, label }, i) => (
        <div key={i} className="hi-7day-col">
          <div className={cn("hi-7day-pip", done && "hi-7day-pip--done", isToday && !done && "hi-7day-pip--today")} />
          <span className={cn("hi-7day-label", isToday && "hi-7day-label--today")}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Circular check ─────────────────────────────────────────────────────────────
function CircleCheck({ done, pending, onToggle }: { done: boolean; pending: boolean; onToggle: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={cn("hi-circle-check", done && "hi-circle-check--done")}
      onClick={onToggle}
      disabled={pending}
      aria-label={done ? "Mark undone" : "Mark done"}
    >
      <span className="hi-circle-check-icon"><CheckIcon size={15} /></span>
    </button>
  );
}

// ── Desktop context menu ───────────────────────────────────────────────────────
function ContextMenu({ onEdit, onDelete, onClose }: { onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <div className="hi-menu">
      <button className="hi-menu-item" onClick={() => { onEdit(); onClose(); }}><PencilIcon /> Edit habit</button>
      <button className="hi-menu-item hi-menu-item--danger" onClick={() => { onDelete(); onClose(); }}><TrashIcon /> Delete</button>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const SWIPE_START_THRESHOLD = 10;
const SWIPE_OPEN_AT = 50;
const SWIPE_OPEN_WIDTH = 124; // just enough for two small pill buttons

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

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const isDoneToday = completions.some((c) => c.habit_id === habit.id && c.date === today);
  const isDoneYesterday = completions.some((c) => c.habit_id === habit.id && c.date === yesterday);
  const canRetroYesterday = !isDoneYesterday && !isAfter(parseISO(habit.start_date), parseISO(yesterday));
  const streak = calculateStreak(completions, habit.id, habit.start_date);
  const totalDone = completions.filter((c) => c.habit_id === habit.id).length;

  const handleToggle = async (date: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try { await toggle.mutateAsync({ habitId: habit.id, date }); }
    catch { toast.error("Failed to update"); }
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
    const base = isSwipeOpen ? -SWIPE_OPEN_WIDTH : 0;
    const raw = base + dx;
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
      <style>{`
        .hi-wrap {
          position: relative;
          border-radius: 14px;
          /* overflow hidden clips the swipe buttons */
          overflow: hidden;
        }

        /* ── Swipe actions: two small floating pills ── */
        .hi-swipe-actions {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          gap: 6px;
          z-index: 0;
          pointer-events: none;
        }
        .hi-swipe-actions.hi-swipe-visible {
          pointer-events: auto;
        }
        .hi-swipe-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          width: 50px;
          height: 50px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-size: 9.5px;
          font-weight: 700;
          font-family: inherit;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: transform 0.15s, filter 0.15s, opacity 0.2s;
          opacity: 0;
        }
        .hi-swipe-actions.hi-swipe-visible .hi-swipe-btn {
          opacity: 1;
        }
        .hi-swipe-btn:active { transform: scale(0.92); filter: brightness(0.85); }
        .hi-swipe-btn--edit {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
        }
        .hi-swipe-btn--delete {
          background: hsl(var(--destructive));
          color: #fff;
        }

        /* Only show on touch devices */
        @media (hover: hover) and (pointer: fine) {
          .hi-swipe-actions { display: none; }
        }

        /* ── Main item row ── */
        .hi-item {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          cursor: pointer;
          /* Solid background — never transparent */
          background: hsl(var(--background));
          border-radius: 14px;
          touch-action: pan-y;
          will-change: transform;
        }
        .hi-item--snap {
          transition: transform 0.28s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .hi-item:hover { background: hsl(var(--muted)); }
        /* Selected: keep solid, just add the accent bar */
        .hi-item--selected { background: hsl(var(--muted)); }
        .hi-item--selected::before {
          content: '';
          position: absolute;
          left: 0; top: 16%; bottom: 16%;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: hsl(var(--primary));
        }

        .hi-emoji-wrap {
          width: 44px; height: 44px; flex-shrink: 0;
          border-radius: 12px;
          background: hsl(var(--muted));
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; line-height: 1;
          transition: filter 0.3s;
        }
        /* selected state: slightly different emoji bg so it doesn't blend */
        .hi-item--selected .hi-emoji-wrap {
          background: hsl(var(--border));
        }

        .hi-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
        .hi-name-row { display: flex; align-items: baseline; gap: 8px; }
        .hi-name {
          font-weight: 600; font-size: 14.5px; letter-spacing: -0.02em;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          color: hsl(var(--foreground)); transition: opacity 0.2s; line-height: 1.25;
        }
        .hi-name--done {
          opacity: 0.35;
          text-decoration: line-through;
          text-decoration-color: hsl(var(--muted-foreground) / 0.5);
        }
        .hi-meta { font-size: 11px; color: hsl(var(--muted-foreground)); white-space: nowrap; flex-shrink: 0; }
        .hi-streak-badge { font-weight: 600; color: hsl(var(--foreground)); }

        .hi-7day { display: flex; align-items: flex-end; gap: 4px; }
        .hi-7day-col { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .hi-7day-pip {
          width: 20px; height: 6px; border-radius: 99px;
          background: hsl(var(--border));
          transition: background 0.2s, transform 0.2s;
        }
        .hi-7day-pip--done {
          background: hsl(var(--primary));
          transform: scaleY(1.4); transform-origin: bottom;
        }
        .hi-7day-pip--today { background: hsl(var(--primary) / 0.3); }
        .hi-7day-label {
          font-size: 8.5px; font-weight: 500;
          color: hsl(var(--muted-foreground) / 0.55);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .hi-7day-label--today { color: hsl(var(--primary)); font-weight: 700; }

        .hi-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0; }
        .hi-top-right { display: flex; align-items: center; gap: 6px; }

        .hi-btn-retro {
          display: flex; align-items: center; gap: 4px;
          padding: 5px 9px; border-radius: 20px;
          border: 1px solid hsl(var(--border));
          background: transparent; color: hsl(var(--muted-foreground));
          font-size: 11px; font-family: inherit; cursor: pointer;
          white-space: nowrap; transition: all 0.15s;
        }
        .hi-btn-retro:hover { border-color: hsl(var(--primary) / 0.5); color: hsl(var(--primary)); }
        .hi-btn-retro:disabled { opacity: 0.4; cursor: default; }

        .hi-dots-btn {
          display: flex; align-items: center; justify-content: center;
          width: 30px; height: 30px; border-radius: 50%;
          border: none; background: transparent;
          color: hsl(var(--muted-foreground)); cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .hi-dots-btn:hover, .hi-dots-btn--active { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .hi-dots-wrap { display: none; position: relative; }
        @media (hover: hover) and (pointer: fine) { .hi-dots-wrap { display: block; } }

        .hi-circle-check {
          width: 38px; height: 38px; border-radius: 50%;
          border: 2px solid hsl(var(--border));
          background: transparent; cursor: pointer;
          transition: border-color 0.2s, background 0.25s, box-shadow 0.25s, transform 0.15s;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; padding: 0;
        }
        .hi-circle-check:hover {
          border-color: hsl(var(--primary) / 0.6);
          background: hsl(var(--primary) / 0.06);
        }
        .hi-circle-check:active { transform: scale(0.88); }
        .hi-circle-check:disabled { opacity: 0.4; cursor: default; }
        .hi-circle-check--done {
          border-color: hsl(var(--primary));
          background: hsl(var(--primary));
          box-shadow: 0 0 0 4px hsl(var(--primary) / 0.14);
          animation: hiCheckPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes hiCheckPop {
          0% { transform: scale(0.7); }
          60% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        .hi-circle-check-icon {
          color: hsl(var(--muted-foreground) / 0.4);
          display: flex; align-items: center; transition: color 0.2s;
        }
        .hi-circle-check--done .hi-circle-check-icon {
          color: hsl(var(--primary-foreground));
          animation: hiCheckIconIn 0.22s ease 0.06s both;
        }
        @keyframes hiCheckIconIn {
          from { opacity: 0; transform: scale(0.5) rotate(-10deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        .hi-circle-check:not(.hi-circle-check--done):hover .hi-circle-check-icon {
          color: hsl(var(--primary) / 0.7);
        }

        .hi-menu {
          position: absolute; right: 0; top: calc(100% + 6px); z-index: 50;
          background: hsl(var(--popover)); border: 1px solid hsl(var(--border));
          border-radius: 12px; padding: 4px; min-width: 144px;
          box-shadow: 0 16px 48px hsl(var(--foreground) / 0.12);
          animation: hiMenuIn 0.14s ease;
        }
        @keyframes hiMenuIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .hi-menu-item {
          display: flex; align-items: center; gap: 9px;
          width: 100%; padding: 9px 12px; border-radius: 9px;
          border: none; background: transparent; color: hsl(var(--foreground));
          cursor: pointer; font-size: 13px; font-family: inherit; transition: background 0.12s;
        }
        .hi-menu-item:hover { background: hsl(var(--muted)); }
        .hi-menu-item--danger { color: hsl(var(--destructive)); }
        .hi-menu-item--danger:hover { background: hsl(var(--destructive) / 0.08); }
      `}</style>

      <div className="hi-wrap">
        {/* Small pill buttons revealed on swipe — sit behind the row */}
        <div className={cn("hi-swipe-actions", isSwipeOpen && "hi-swipe-visible")}>
          <button className="hi-swipe-btn hi-swipe-btn--edit" onClick={() => { setEditOpen(true); closeSwipe(); }}>
            <PencilIcon />
            Edit
          </button>
          <button className="hi-swipe-btn hi-swipe-btn--delete" onClick={() => { handleDelete(); closeSwipe(); }}>
            <TrashIcon />
            Delete
          </button>
        </div>

        {/* Main row — always z-index: 1, always fully opaque background */}
        <div
          className={cn("hi-item", isSelected && "hi-item--selected", !isActiveSwipe && "hi-item--snap")}
          style={{ transform: `translateX(${swipeX}px)` }}
          onClick={handleItemClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="hi-emoji-wrap"
            style={{ filter: isDoneToday ? "none" : "grayscale(0.3) opacity(0.85)" }}
          >
            {habit.emoji}
          </div>

          <div className="hi-body">
            <div className="hi-name-row">
              <span className={cn("hi-name", isDoneToday && "hi-name--done")}>{habit.name}</span>
              <span className="hi-meta">
                {streak > 0
                  ? <span className="hi-streak-badge">🔥 {streak}d</span>
                  : `${totalDone} done`}
              </span>
            </div>
            <SevenDayRow completions={completions} habitId={habit.id} />
          </div>

          <div className="hi-right">
            <div className="hi-top-right">
              {canRetroYesterday && (
                <button className="hi-btn-retro" onClick={(e) => handleToggle(yesterday, e)} disabled={toggle.isPending}>
                  <CalendarIcon /> yday
                </button>
              )}
              <div className="hi-dots-wrap">
                <button
                  className={cn("hi-dots-btn", menuOpen && "hi-dots-btn--active")}
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
            <CircleCheck done={isDoneToday} pending={toggle.isPending} onToggle={(e) => handleToggle(today, e)} />
          </div>
        </div>
      </div>

      <EditHabitDialog habit={habit} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}