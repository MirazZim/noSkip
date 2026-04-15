import { useState, useRef, useEffect } from "react";
import { format, subDays, isAfter, parseISO } from "date-fns";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createPortal } from "react-dom";
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

// ── Streak tiers ───────────────────────────────────────────────────────────────
const TIERS: {
  min: number;
  accent: string;
  label: string;
  messages: string[];
  subtext: (actual: number) => string;
}[] = [
  {
    // Psychology: Self-efficacy (Bandura) — the belief "I can do this"
    // is built from small wins, not motivation. First completion = first proof.
    min: 0,
    accent: "#a78bfa",
    label: "IT BEGINS",
    messages: [
      "Nice work! The hardest part wasn't doing it — it was deciding to. You decided.",
      "Great job! You just gave your future self something to build on.",
      "Well done! Most people stay in planning mode forever. You didn't.",
    ],
    subtext: (s) => `Day ${s}. You now have proof you can do this. That's more than most people have.`,
  },
  {
    // Psychology: Commitment & Consistency (Cialdini) — once we act,
    // we feel internal pressure to stay consistent with that action.
    // "You're already someone who does this" activates identity lock-in.
    min: 3,
    accent: "#fb923c",
    label: "WIRING UP",
    messages: [
      "3 days in! You've already done more than most people who set the same goal.",
      "Keep going! Each rep is a vote — and you've voted 3 times already.",
      "You're doing it! 3 days ago you made a decision. You're still honouring it.",
    ],
    subtext: (s) => `Day ${s}. Quitting now means those 3 days meant nothing. They don't have to be nothing.`,
  },
  {
    // Psychology: Progress Principle (Amabile & Kramer, Harvard) —
    // perceived forward progress is the single strongest daily motivator.
    // Naming the week makes the progress feel real and visible.
    min: 7,
    accent: "#34d399",
    label: "ONE WEEK",
    messages: [
      "One full week! Progress this consistent puts you ahead of 80% of people who start.",
      "7 days done! A week ago this was just an intention. Now it's a track record.",
      "A whole week! You've proven something to yourself that nobody can take back.",
    ],
    subtext: (s) => `Day ${s}. The version of you who quits is getting harder to picture. Good.`,
  },
  {
    // Psychology: Identity shift (James Clear, Atomic Habits) —
    // "every action is a vote for the type of person you wish to become."
    // At 14 days, the identity argument starts to genuinely land.
    min: 14,
    accent: "#60a5fa",
    label: "TWO WEEKS",
    messages: [
      "Two weeks straight! This isn't something you're trying anymore — it's something you do.",
      "14 days! You've crossed the line from intention to identity.",
      "Two weeks in! Your brain has filed this under 'things I do' — not 'things I'm trying.'",
    ],
    subtext: (s) => `Day ${s}. Ask yourself: does this feel more natural than day one? It does. That's the proof.`,
  },
  {
    // Maltz 1960 — minimum 21 days for self-image to shift.
    // Psychology: Self-image congruence — people act to stay consistent
    // with how they see themselves. Once the image shifts, behaviour follows automatically.
    min: 21,
    accent: "#2dd4bf",
    label: "THE MALTZ POINT",
    messages: [
      "21 days! Maxwell Maltz spent a career studying this — 21 days is where self-image starts to break and reform.",
      "Three weeks done! You're not fighting your old self anymore. You're replacing it.",
      "21 days crossed! The image in your head of who you are just quietly updated.",
    ],
    subtext: (s) => `Day ${s}. Your identity is shifting whether you notice it or not. This is the proof.`,
  },
  {
    // Psychology: Sunk cost reframing + Loss Aversion (Kahneman & Tversky) —
    // losses feel 2x more painful than gains feel good.
    // Framing 30 days as something that can be lost activates far stronger motivation
    // than framing it as something to gain.
    min: 30,
    accent: "#f472b6",
    label: "ONE MONTH",
    messages: [
      "A whole month! You have 30 days of real evidence that you're not the person who quits.",
      "30 days straight! That's not a number — that's a part of your story now.",
      "One month strong! The people who said they'd start this month? Most of them haven't yet.",
    ],
    subtext: (s) => `Day ${s}. You've built something real. Protecting it now costs nothing. Losing it costs everything.`,
  },
  {
    // Psychology: Ancient threshold effect — Lent, quarantine (40 days),
    // Ramadan, Moses, Buddha's temptation. Every major tradition independently
    // chose 40 as the number for transformation. Framing the user inside
    // this lineage triggers something ancient and deeply felt.
    min: 40,
    accent: "#fb7185",
    label: "THE 40 DAY WALL",
    messages: [
      "40 days! Every ancient tradition — Lent, Ramadan, quarantine — chose 40 as the number for real transformation. You're inside it.",
      "You crossed 40 days! Neuroscience and every major world religion agree: this is the wall. You walked through it.",
      "40 days done! The craving for the old version of this time? Research says it just dropped sharply. You can feel it if you look.",
    ],
    subtext: (s) => `Day ${s}. 40 days is where the pull of the old habit loses. You're past the wall.`,
  },
  {
    // Lally et al. 2010 UCL study — 96 participants, 12 weeks.
    // Average automaticity reached at 66 days. Range: 18–254.
    // Psychology: Effort reduction is the brain's primary reward for habit formation.
    // Telling the user their effort just scientifically dropped is viscerally satisfying.
    min: 66,
    accent: "#e879f9",
    label: "LALLY'S NUMBER",
    messages: [
      "66 days! A UCL study with 96 real people found this exact number — the average day habits stop requiring willpower.",
      "66 days crossed! This isn't motivation anymore. The science says it's crossed into automatic. Feel the difference?",
      "You hit 66 days! Phillippa Lally's research is the only peer-reviewed habit study that matters — and you just hit her number.",
    ],
    subtext: (s) => `Day ${s}. Willpower got you here. You don't need it as much anymore. That's the whole point.`,
  },
  {
    // Psychology: Clinical validation + Social proof from extreme cases.
    // AA and rehab use 90 days because below it, relapse is structurally likely.
    // Above it, the brain's reward circuitry has genuinely reorganised.
    // Framing the user alongside recovery programs is unexpectedly powerful.
    min: 90,
    accent: "#38bdf8",
    label: "THE 90 DAY SHIFT",
    messages: [
      "90 days! AA, every rehab program, every addiction specialist — they all use this number. And you hit it without needing any of them.",
      "Three months straight! The clinical threshold for structural brain change is 90 days. Your brain is measurably different today.",
      "You hit 90 days! This is the number doctors use. The number therapists use. The number that separates trying from changed.",
    ],
    subtext: (s) => `Day ${s}. Three months of proof. The science says the hardest part is behind you. Believe it.`,
  },
  {
    // Psychology: Round number bias (Milestone effect) — humans attach
    // disproportionate meaning to round numbers. 100 triggers a status response
    // that 99 never will. Plus future self continuity — who you are at 100 days
    // is someone you'd want to protect.
    min: 100,
    accent: "#fbbf24",
    label: "TRIPLE DIGITS",
    messages: [
      "100 days! Ask yourself honestly — did you think you'd make it here when you started? This version of you is different.",
      "Triple digits! 100 days means you've had bad days, busy days, tired days — and you did it anyway. That's the whole game.",
      "100 days straight! You're in the top 1% of people who start this. Not because you're special — because you stayed.",
    ],
    subtext: (s) => `Day ${s}. The gap between you and the person who quit on day 3 is now 97 days wide. Keep widening it.`,
  },
  {
    // Psychology: Procedural memory consolidation — at 6 months,
    // motor cortex to cerebellum transfer completes for procedural habits.
    // The habit is now stored where instincts live, not where decisions live.
    min: 180,
    accent: "#a3e635",
    label: "HALF A YEAR",
    messages: [
      "180 days! At six months the brain finishes moving a habit from the decision centre to the instinct centre. It lives there now.",
      "Half a year done! You set this goal at some point. Most people who set it are still setting it. You're living it.",
      "180 days straight! Six months ago you had an idea. Today you have a different brain. That's not metaphor — that's neuroscience.",
    ],
    subtext: (s) => `Day ${s}. This is stored where instincts live now. Stopping would feel like losing a part of yourself.`,
  },
  {
    // Psychology: Annual cycle completion — every seasonal cue, social trigger,
    // holiday temptation, and stressful period has been navigated at least once.
    // First-year completion is the most psychologically significant milestone
    // because the brain has now built a template for every context.
    min: 365,
    accent: "#fde68a",
    label: "ONE FULL YEAR",
    messages: [
      "365 days! Every hard week, every holiday, every reason to quit — you've seen them all now and none of them won.",
      "A full year! Psychologists say the first complete cycle is everything — because your brain has now built a template for every situation. It has one.",
      "One year straight! This isn't discipline anymore. It isn't motivation. It isn't habit. It's just who you are.",
    ],
    subtext: (s) => `Day ${s}. A year of proof. Every version of you that doubted this was wrong.`,
  },
];

function getTier(streak: number) {
  return [...TIERS].reverse().find((t) => streak >= t.min) ?? TIERS[0];
}

// ── Dopamine Card ─────────────────────────────────────────────────────────────
function DopamineCard({
  habitName,
  habitEmoji,
  streak,
  onDismiss,
}: {
  habitName: string;
  habitEmoji: string;
  streak: number;
  onDismiss: () => void;
}) {
  const tier    = getTier(streak);
  const message = tier.messages[Math.floor(Math.random() * tier.messages.length)];

  const bangIdx = message.indexOf("! ");
  const congrat = bangIdx !== -1 ? message.slice(0, bangIdx + 1) : message;
  const insight = bangIdx !== -1 ? message.slice(bangIdx + 2) : "";

  const [out, setOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setOut(true); setTimeout(onDismiss, 200); }, 15000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => { setOut(true); setTimeout(onDismiss, 200); };

  return createPortal(
    <>
      <style>{`
        @keyframes _in  {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.97); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1);    }
        }
        @keyframes _out {
          from { opacity: 1; transform: translate(-50%, -50%) scale(1);    }
          to   { opacity: 0; transform: translate(-50%, -50%) scale(0.97); }
        }
        @keyframes _bg_in  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes _bg_out { from { opacity: 1; } to { opacity: 0; } }
        .dc-wrap { animation: ${out ? "_out 0.2s ease both" : "_in 0.22s ease both"}; }
        .dc-bg   { animation: ${out ? "_bg_out 0.2s ease both" : "_bg_in 0.2s ease both"}; }
      `}</style>

      {/* Backdrop */}
      <div
        className="dc-bg fixed inset-0 z-[9998]"
        style={{
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px) saturate(120%)",
          WebkitBackdropFilter: "blur(8px) saturate(120%)",
        }}
        onClick={dismiss}
      />

      {/* Card */}
      <div
        className="dc-wrap fixed z-[9999] left-1/2 top-1/2 w-[min(320px,86vw)] cursor-pointer"
        onClick={dismiss}
      >
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: "rgba(16, 16, 24, 0.88)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 32px 72px rgba(0,0,0,0.55), 0 0 60px ${tier.accent}18`,
          }}
        >
          {/* Accent bar */}
          <div className="h-[2.5px] w-full" style={{ background: tier.accent }} />

          <div className="px-6 pt-6 pb-6 flex flex-col gap-4">

            {/* ── Row 1: tier label + streak badge side by side ── */}
            <div className="flex items-center justify-between">
              <span
                className="text-[9.5px] font-black tracking-[0.2em] uppercase"
                style={{ color: `${tier.accent}80` }}
              >
                {tier.label}
              </span>

              {streak > 0 && (
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-black"
                  style={{
                    background: `${tier.accent}16`,
                    border: `1px solid ${tier.accent}30`,
                    color: tier.accent,
                  }}
                >
                  🔥 {streak}d
                </div>
              )}
            </div>

            {/* ── Row 2: explicit congrats line ── */}
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none">🎉</span>
              <span
                className="text-[13px] font-bold tracking-[-0.01em]"
                style={{ color: tier.accent }}
              >
                Congratulations!
              </span>
            </div>

            {/* ── Row 3: big message ── */}
            <div className="flex flex-col gap-2">
              <p
                className="text-white font-extrabold leading-[1.2] tracking-[-0.03em]"
                style={{ fontSize: "21px" }}
              >
                {congrat}
              </p>

              {insight && (
                <p className="text-white/55 text-[13px] font-medium leading-relaxed tracking-[-0.01em]">
                  {insight}
                </p>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

            {/* ── Row 4: habit name + subtext — no truncation possible here ── */}
            <div className="flex flex-col gap-1.5">
              {/* Full name — wraps freely, no pill, no clip */}
              <div className="flex items-center gap-1.5">
                <span className="text-sm leading-none shrink-0">{habitEmoji}</span>
                <span className="text-white/35 text-[12px] font-semibold leading-snug">
                  {habitName}
                </span>
              </div>

              <p
                className="text-[11.5px] font-semibold leading-relaxed tracking-[-0.01em]"
                style={{ color: `${tier.accent}85` }}
              >
                {tier.subtext(streak)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
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

// ── Desktop context menu ───────────────────────────────────────────────────────
function ContextMenu({ onEdit, onDelete, onClose }: {
  onEdit: () => void; onDelete: () => void; onClose: () => void;
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
function CheckButton({ done, pending, onToggle }: {
  done: boolean; pending: boolean; onToggle: () => void;
}) {
  const [pressing, setPressing] = useState(false);
  const touchMoved = useRef(false);

  const handleTouchStart  = (e: React.TouchEvent) => { e.stopPropagation(); touchMoved.current = false; setPressing(true); };
  const handleTouchMove   = () => { touchMoved.current = true; };
  const handleTouchEnd    = (e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault(); setPressing(false);
    if (!touchMoved.current && !pending) onToggle();
    touchMoved.current = false;
  };
  const handleTouchCancel = () => { setPressing(false); touchMoved.current = false; };

  return (
    <>
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
          "transition-[border-color,background-color,box-shadow] duration-200",
          "[-webkit-tap-highlight-color:transparent] touch-manipulation",
          "hover:border-primary/50 hover:bg-primary/[0.06]",
          "active:scale-[0.86]",
          pressing && !done && "scale-[0.86]",
          done && "border-primary bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.12)] habit-check-pop",
          "disabled:opacity-35 disabled:cursor-default"
        )}
        onClick={(e) => { e.stopPropagation(); if (!pending) onToggle(); }}
        disabled={pending}
        aria-label={done ? "Mark undone" : "Mark done"}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <span className={cn(
          "flex items-center pointer-events-none transition-colors duration-200",
          done ? "text-primary-foreground habit-icon-in" : "text-muted-foreground/35"
        )}>
          <CheckIcon size={14} />
        </span>
      </button>
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function HabitListItem({ habit, completions, isSelected, onSelect }: Props) {
  const toggle      = useToggleHabitCompletion();
  const deleteHabit = useDeleteHabit();
  const [editOpen, setEditOpen]           = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [swipeX, setSwipeX]               = useState(0);
  const [isSwipeOpen, setIsSwipeOpen]     = useState(false);
  const [isActiveSwipe, setIsActiveSwipe] = useState(false);
  const [showDopamine, setShowDopamine]   = useState(false);

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
  const [optimisticDone, setOptimisticDone] = useState(isDoneToday);

  useEffect(() => {
    if (!toggle.isPending) setOptimisticDone(isDoneToday);
  }, [isDoneToday, toggle.isPending]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleToday = async () => {
    const wasCompleted = optimisticDone;
    setOptimisticDone((prev) => !prev);
    if (!wasCompleted) setShowDopamine(true);
    try {
      await toggle.mutateAsync({ habitId: habit.id, date: today });
    } catch {
      setOptimisticDone(isDoneToday);
      toast.error("Failed to update");
    }
  };

  const handleToggleYesterday = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try { await toggle.mutateAsync({ habitId: habit.id, date: yesterday }); }
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
    const base    = isSwipeOpen ? -SWIPE_OPEN_WIDTH : 0;
    const clamped = Math.min(0, Math.max(-SWIPE_OPEN_WIDTH - 10, base + dx));
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
      {showDopamine && (
        <DopamineCard
          habitName={habit.name}
          habitEmoji={habit.emoji}
          streak={streak + 1}
          onDismiss={() => setShowDopamine(false)}
        />
      )}

      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(
          "relative rounded-[18px] overflow-hidden transition-shadow duration-200",
          "hover:shadow-[0_2px_20px_hsl(var(--foreground)/0.06)]",
          isDragging && "z-[999] shadow-[0_24px_56px_hsl(var(--foreground)/0.15),0_6px_16px_hsl(var(--foreground)/0.08)]"
        )}
      >
        {/* Swipe actions */}
        <div className={cn(
          "absolute right-[10px] top-1/2 -translate-y-1/2 z-0 flex items-center gap-[7px]",
          "[@media(hover:hover)_and_(pointer:fine)]:hidden",
          isSwipeOpen ? "pointer-events-auto" : "pointer-events-none"
        )}>
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

        {/* Main card */}
        <div
          className={cn(
            "relative z-[1] flex items-center gap-[13px] px-4 py-[15px] pl-3 cursor-pointer",
            "bg-card rounded-[18px] border border-border/60 touch-pan-y",
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
          {isSelected && (
            <div className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-r-[3px] bg-primary" />
          )}

          {/* Drag handle */}
          <div
            className={cn(
              "flex items-center justify-center w-[22px] h-9 shrink-0 rounded-md",
              "text-muted-foreground/35 cursor-grab select-none touch-none",
              "[-webkit-tap-highlight-color:transparent] [-webkit-user-select:none]",
              "transition-colors duration-150 hover:text-muted-foreground/70 active:cursor-grabbing",
              isDragging && "cursor-grabbing text-primary"
            )}
            {...attributes} {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripIcon />
          </div>

          {/* Emoji */}
          <div
            className={cn(
              "w-[46px] h-[46px] shrink-0 rounded-[14px]",
              "bg-muted/70 border border-border/50",
              "flex items-center justify-center text-[22px] leading-none",
              "transition-[filter,transform,background-color,border-color] duration-200 hover:scale-105",
              isSelected && "bg-primary/[0.08] border-primary/15"
            )}
            style={{ filter: optimisticDone ? "none" : "grayscale(0.25) opacity(0.8)" }}
          >
            {habit.emoji}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0 flex flex-col gap-[9px]">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={cn(
                "font-semibold text-[14px] tracking-[-0.025em] text-foreground leading-[1.3]",
                "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]",
                "sm:whitespace-nowrap sm:[display:block] sm:overflow-hidden sm:text-ellipsis",
                "transition-[opacity,color] duration-200",
                optimisticDone && "opacity-30 line-through decoration-muted-foreground/40 decoration-[1.5px]"
              )}>
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
            <SevenDayRow completions={completions} habitId={habit.id} />
          </div>

          {/* Right controls */}
          <div className="flex flex-col items-end gap-[9px] shrink-0">
            <div className="flex items-center gap-[5px]">
              {canRetroYesterday && (
                <button
                  className={cn(
                    "flex items-center gap-1 px-[9px] py-[5px] rounded-full",
                    "border border-border bg-background text-muted-foreground",
                    "text-[10.5px] font-semibold font-[inherit] whitespace-nowrap tracking-[0.01em]",
                    "transition-all duration-150 cursor-pointer",
                    "hover:border-primary/40 hover:text-primary hover:bg-primary/[0.05]",
                    "active:scale-95 disabled:opacity-35 disabled:cursor-default",
                    "[-webkit-tap-highlight-color:transparent] touch-manipulation"
                  )}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  onClick={handleToggleYesterday}
                  disabled={toggle.isPending}
                >
                  <CalendarIcon /> yday
                </button>
              )}
              <div className="hidden [@media(hover:hover)_and_(pointer:fine)]:block relative">
                <button
                  className={cn(
                    "flex items-center justify-center w-[30px] h-[30px] rounded-full border-none",
                    "bg-transparent text-muted-foreground/60 cursor-pointer",
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
            <CheckButton
              done={optimisticDone}
              pending={toggle.isPending}
              onToggle={handleToggleToday}
            />
          </div>
        </div>
      </div>

      <EditHabitDialog habit={habit} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}