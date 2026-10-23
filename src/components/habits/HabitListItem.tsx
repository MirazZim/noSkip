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

/** A stable hue per habit, so every card has its own color identity. */
function habitHue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

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
                className="text-[length:calc(9.5px*var(--tz,1))] font-black tracking-[0.2em] uppercase"
                style={{ color: `${tier.accent}80` }}
              >
                {tier.label}
              </span>

              {streak > 0 && (
                <div
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[length:calc(12px*var(--tz,1))] font-black"
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
                className="text-[length:calc(13px*var(--tz,1))] font-bold tracking-[-0.01em]"
                style={{ color: tier.accent }}
              >
                Congratulations!
              </span>
            </div>

            {/* ── Row 3: big message ── */}
            <div className="flex flex-col gap-2">
              <p
                className="text-white font-extrabold leading-[1.2] tracking-[-0.03em]"
                style={{ fontSize: "calc(21px * var(--tz, 1))" }}
              >
                {congrat}
              </p>

              {insight && (
                <p className="text-white/55 text-[length:calc(13px*var(--tz,1))] font-medium leading-relaxed tracking-[-0.01em]">
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
                <span className="text-white/35 text-[length:calc(12px*var(--tz,1))] font-semibold leading-snug">
                  {habitName}
                </span>
              </div>

              <p
                className="text-[length:calc(11.5px*var(--tz,1))] font-semibold leading-relaxed tracking-[-0.01em]"
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
const YesterdayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <polyline points="3 3 3 8 8 8" />
    <polyline points="12 7 12 12 15 14" />
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

// ── 7-day chain: consecutive done days are linked; backfilled days are striped ──
type ChainDay = { name: string; isToday: boolean; isYesterday: boolean; done: boolean; retro: boolean };

function ChainRow({ days }: { days: ChainDay[] }) {
  return (
    <div className="flex items-start" aria-label="Last 7 days">
      {days.map(({ done, retro, isToday, name }, i) => {
        const linked = i > 0 && done && days[i - 1].done;
        return (
          <div key={i} className="flex items-start">
            {i > 0 && (
              <span className={cn("mt-[6.5px] h-[3px] w-[4px] transition-colors duration-300", linked ? "bg-primary" : "bg-transparent")} />
            )}
            <div className="flex flex-col items-center gap-[3px]">
              <span
                title={`${isToday ? "Today" : name}: ${done ? (retro ? "logged later" : "done") : "missed"}`}
                className={cn(
                  "block rounded-[4px] transition-all duration-300",
                  isToday ? "w-[16px] h-[16px]" : "w-[14px] h-[14px] mt-[1px]",
                  done && !retro && "bg-primary shadow-[0_0_8px_-1px_hsl(var(--primary)/0.55)]",
                  done && retro && "bg-[repeating-linear-gradient(135deg,hsl(var(--primary))_0_2px,hsl(var(--primary)/0.45)_2px_4px)]",
                  !done && isToday && "bg-transparent ring-[1.5px] ring-inset ring-primary/60",
                  !done && !isToday && "bg-muted-foreground/[0.14]",
                )}
              />
              <span className={cn(
                "text-[length:calc(10.5px*var(--tz,1))] leading-none font-semibold uppercase select-none",
                isToday ? "text-primary font-extrabold" : "text-muted-foreground"
              )}>
                {name[0]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Desktop context menu ───────────────────────────────────────────────────────
function ContextMenu({ onEdit, onDelete, onClose, style, yesterday }: {
  onEdit: () => void; onDelete: () => void; onClose: () => void;
  style?: React.CSSProperties;
  yesterday?: { done: boolean; onToggle: () => void };
}) {
  return createPortal(
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div className="fixed inset-0 z-[199]" onClick={onClose} />
      <div
        className="fixed z-[200] min-w-[152px] p-[5px] bg-popover border border-border/80 rounded-[14px] shadow-[0_4px_6px_hsl(var(--foreground)/0.04),0_20px_50px_hsl(var(--foreground)/0.10)] animate-in fade-in-0 zoom-in-95 duration-150"
        style={style}
      >
        <button
          className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] border-none bg-transparent text-foreground cursor-pointer text-[length:calc(13px*var(--tz,1))] font-medium font-[inherit] hover:bg-muted/80 transition-colors duration-100"
          onClick={() => { onEdit(); onClose(); }}
        >
          <PencilIcon /> Edit habit
        </button>
        {yesterday && (
          <button
            className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] border-none bg-transparent text-foreground cursor-pointer text-[length:calc(13px*var(--tz,1))] font-medium font-[inherit] hover:bg-muted/80 transition-colors duration-100"
            onClick={() => { yesterday.onToggle(); onClose(); }}
          >
            <YesterdayIcon /> {yesterday.done ? "Unmark yesterday" : "Mark yesterday done"}
          </button>
        )}
        <div className="h-px bg-border/60 my-[3px]" />
        <button
          className="flex items-center gap-[9px] w-full px-[11px] py-[9px] rounded-[10px] border-none bg-transparent text-destructive cursor-pointer text-[length:calc(13px*var(--tz,1))] font-medium font-[inherit] hover:bg-destructive/[0.08] transition-colors duration-100"
          onClick={() => { onDelete(); onClose(); }}
        >
          <TrashIcon /> Delete
        </button>
      </div>
    </>,
    document.body
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const SWIPE_START_THRESHOLD = 10;
const SWIPE_OPEN_AT = 50;
const SWIPE_OPEN_WIDTH = 124;

// ── CheckButton ────────────────────────────────────────────────────────────────
const LONG_PRESS_MS = 480;

function CheckButton({ done, pending, onToggle, onLongPress }: {
  done: boolean; pending: boolean; onToggle: () => void;
  /** Long-press (touch or mouse) or right-click — opens the habit's quick menu. */
  onLongPress?: (rect: DOMRect) => void;
}) {
  const [pressing, setPressing] = useState(false);
  const touchMoved = useRef(false);
  const btnRef     = useRef<HTMLButtonElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const longFired  = useRef(false);

  const startPress = () => {
    longFired.current = false;
    if (!onLongPress) return;
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longFired.current = true;
      setPressing(false);
      navigator.vibrate?.(12);
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) onLongPress(rect);
    }, LONG_PRESS_MS);
  };
  const cancelPress = () => clearTimeout(pressTimer.current);
  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const handleTouchStart  = (e: React.TouchEvent) => { e.stopPropagation(); touchMoved.current = false; setPressing(true); startPress(); };
  const handleTouchMove   = () => { touchMoved.current = true; cancelPress(); };
  const handleTouchEnd    = (e: React.TouchEvent) => {
    e.stopPropagation(); e.preventDefault(); setPressing(false); cancelPress();
    if (!touchMoved.current && !longFired.current && !pending) onToggle();
    touchMoved.current = false;
  };
  const handleTouchCancel = () => { setPressing(false); touchMoved.current = false; cancelPress(); };

  return (
    <>
      <style>{`
        .habit-check-pop { animation: checkPop 0.35s cubic-bezier(0.34,1.56,0.64,1); }
        .hli-tile {
          background:
            linear-gradient(160deg, hsl(0 0% 100% / 0.22), transparent 45%),
            linear-gradient(145deg, hsl(var(--hh) 80% 62% / 0.30), hsl(var(--hh) 70% 42% / 0.14));
          border: 1px solid hsl(var(--hh) 70% 60% / 0.30);
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.18), 0 6px 14px -8px hsl(var(--hh) 80% 45% / 0.7);
          filter: saturate(0.75);
        }
        .hli-tile--done { filter: none; border-color: hsl(var(--hh) 75% 60% / 0.55);
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.22), 0 8px 18px -8px hsl(var(--hh) 85% 50% / 0.9); }
        @keyframes hliEmber { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .hli-ember {
          background: radial-gradient(120% 90% at 100% 50%, rgb(245 158 11 / 0.16), transparent 65%);
          animation: hliEmber 3.2s ease-in-out infinite;
        }
        .hli-burst i {
          position: absolute; left: 50%; top: 50%; width: 5px; height: 5px; margin: -2.5px;
          border-radius: 99px; background: var(--c);
          animation: hliFly 0.7s cubic-bezier(0.2, 0.8, 0.3, 1) forwards;
        }
        @keyframes hliFly {
          0%   { transform: rotate(var(--a)) translateY(-14px) scale(1); opacity: 1; }
          100% { transform: rotate(var(--a)) translateY(-34px) scale(0.2); opacity: 0; }
        }
        .hli-ripple {
          position: absolute; inset: 5px; border-radius: 99px; border: 2px solid hsl(var(--primary));
          animation: hliRipple 0.6s ease-out forwards;
        }
        @keyframes hliRipple { to { transform: scale(1.7); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .hli-ember, .hli-burst { animation: none; display: none; } }
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
          "w-[34px] h-[34px] rounded-full border-2 border-border bg-transparent cursor-pointer",
          "flex items-center justify-center shrink-0 p-0 select-none isolate",
          "transition-[border-color,background-color,box-shadow] duration-200",
          "[-webkit-tap-highlight-color:transparent] touch-manipulation",
          "hover:border-primary/50 hover:bg-primary/[0.06]",
          "active:scale-[0.86]",
          pressing && !done && "scale-[0.86]",
          done && "border-primary bg-primary shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.8)] habit-check-pop",
          "disabled:opacity-35 disabled:cursor-default"
        )}
        ref={btnRef}
        title={onLongPress ? "Tap to check off · hold for more" : undefined}
        onClick={(e) => { e.stopPropagation(); if (longFired.current) { longFired.current = false; return; } if (!pending) onToggle(); }}
        onMouseDown={(e) => { if (e.button === 0) startPress(); }}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        onContextMenu={(e) => {
          if (!onLongPress) return;
          e.preventDefault(); e.stopPropagation(); cancelPress();
          onLongPress(e.currentTarget.getBoundingClientRect());
        }}
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
  const [menuPos, setMenuPos]             = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [swipeX, setSwipeX]               = useState(0);
  const [isSwipeOpen, setIsSwipeOpen]     = useState(false);
  const [isActiveSwipe, setIsActiveSwipe] = useState(false);
  const [showDopamine, setShowDopamine]   = useState(false);

  const menuBtnRef  = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const swipeIntent = useRef<"none" | "swipe" | "scroll">("none");

  const today     = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const isDoneToday       = completions.some((c) => c.habit_id === habit.id && c.date === today);
  const isDoneYesterday   = completions.some((c) => c.habit_id === habit.id && c.date === yesterday);
  const yesterdayInRange  = !isAfter(parseISO(habit.start_date), parseISO(yesterday));
  const streak            = calculateStreak(completions, habit.id, habit.start_date);
  const totalDone         = completions.filter((c) => c.habit_id === habit.id).length;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: habit.id });

  // ── Optimistic done state (today + yesterday) ─────────────────────────────
  const [optimisticDone, setOptimisticDone] = useState(isDoneToday);
  const [ydayOverride, setYdayOverride]     = useState<boolean | null>(null);

  useEffect(() => {
    if (!toggle.isPending) setOptimisticDone(isDoneToday);
  }, [isDoneToday, toggle.isPending]);
  useEffect(() => {
    if (!toggle.isPending) setYdayOverride(null);
  }, [isDoneYesterday, toggle.isPending]);

  const ydayDone = ydayOverride ?? isDoneYesterday;
  const chainDays: ChainDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = subDays(new Date(), 6 - i);
    const key  = format(date, "yyyy-MM-dd");
    const row  = completions.find((c) => c.habit_id === habit.id && c.date === key);
    const isToday = i === 6;
    const isYesterday = i === 5;
    return {
      name: format(date, "EEEE"),
      isToday, isYesterday,
      done: isToday ? optimisticDone : isYesterday ? ydayDone : !!row,
      retro: isYesterday && ydayOverride === true ? true : !!row?.is_retroactive,
    };
  });

  const weekDone = chainDays.filter((d) => d.done).length;
  const hue      = habitHue(habit.id);
  const tier     = streak >= 3 ? getTier(streak) : null;
  const [burst, setBurst] = useState(0);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleToday = async () => {
    const wasCompleted = optimisticDone;
    setOptimisticDone((prev) => !prev);
    if (!wasCompleted) { setShowDopamine(true); setBurst((b) => b + 1); }
    try {
      await toggle.mutateAsync({ habitId: habit.id, date: today });
    } catch {
      setOptimisticDone(isDoneToday);
      toast.error("Failed to update");
    }
  };

  const setYesterday = async (done: boolean) => {
    setYdayOverride(done);
    try {
      await toggle.mutateAsync({ habitId: habit.id, date: yesterday });
      return true;
    } catch {
      setYdayOverride(null);
      toast.error("Failed to update");
      return false;
    }
  };

  const handleLogYesterday = async () => {
    if (!(await setYesterday(true))) return;
    toast.success(`Yesterday logged for ${habit.emoji} ${habit.name}`, {
      description: "Clicked by mistake? You can undo it.",
      duration: 6000,
      action: { label: "Undo", onClick: () => { void setYesterday(false); } },
    });
  };

  const handleUndoYesterday = async () => {
    if (!(await setYesterday(false))) return;
    toast(`Yesterday removed for ${habit.emoji} ${habit.name}`, {
      duration: 6000,
      action: { label: "Redo", onClick: () => { void setYesterday(true); } },
    });
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
              "text-[length:calc(9px*var(--tz,1))] font-bold uppercase tracking-[0.06em] font-[inherit]",
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
              "text-[length:calc(9px*var(--tz,1))] font-bold uppercase tracking-[0.06em] font-[inherit]",
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
            "group relative z-[1] flex items-center gap-3 px-3 py-3 cursor-pointer",
            "bg-card rounded-[18px] border border-border/60 touch-pan-y",
            !isActiveSwipe && "transition-[transform,background-color,border-color,box-shadow] duration-280 ease-swift",
            "hover:border-border hover:bg-muted/40",
            optimisticDone && "border-primary/25",
            isSelected && "border-primary/45 shadow-[0_0_0_3px_hsl(var(--primary)/0.10),0_10px_30px_-14px_hsl(var(--primary)/0.5)]",
            isDragging && "opacity-[0.97]"
          )}
          style={{ transform: `translateX(${swipeX}px)`, ["--hh" as string]: hue }}
          onClick={handleItemClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Week progress washes across the card from the left */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[18px] bg-[linear-gradient(90deg,hsl(var(--hh)_80%_58%/0.14),hsl(var(--hh)_80%_58%/0.04)_85%,transparent)] transition-[width] duration-700 ease-out"
            style={{ width: `${(weekDone / 7) * 100}%` }}
          />
          {streak >= 7 && (
            <span aria-hidden className="hli-ember pointer-events-none absolute inset-y-0 right-0 w-2/3 rounded-r-[18px]" />
          )}

          {/* Emoji tile — doubles as the drag handle */}
          <div
            className={cn(
              "relative w-[44px] h-[44px] shrink-0 rounded-[14px]",
              "flex items-center justify-center text-[length:calc(22px*var(--tz,1))] leading-none",
              "hli-tile cursor-grab select-none touch-none",
              "[-webkit-tap-highlight-color:transparent] [-webkit-user-select:none]",
              "transition-[transform,background-color,border-color,filter] duration-200 group-hover:scale-[1.04]",
              "active:cursor-grabbing",
              optimisticDone && "hli-tile--done",
              isDragging && "cursor-grabbing scale-105"
            )}
            {...attributes} {...listeners}
            aria-label={`Reorder ${habit.name}`}
          >
            <span className="relative drop-shadow-[0_2px_3px_rgb(0_0_0/0.25)]">{habit.emoji}</span>
            <span className={cn(
              "absolute -left-[9px] top-1/2 -translate-y-1/2 text-muted-foreground",
              "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
              "[@media(hover:none)]:hidden"
            )}>
              <GripIcon />
            </span>
            {optimisticDone && (
              <span className="absolute -bottom-[5px] -right-[5px] grid place-items-center w-[17px] h-[17px] rounded-full bg-primary text-primary-foreground ring-2 ring-card habit-icon-in">
                <CheckIcon size={9} />
              </span>
            )}
          </div>

          {/* Body */}
          <div className="relative flex-1 min-w-0 flex flex-col gap-[9px]">
            <div className="flex items-start gap-1 min-w-0">
              <span className={cn(
                "flex-1 min-w-0 font-semibold text-[length:calc(16px*var(--tz,1))] tracking-[-0.015em] leading-[1.3]",
                "overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]",
                "transition-colors duration-200",
                optimisticDone ? "text-foreground/75" : "text-foreground"
              )}>
                {habit.name}
              </span>
              <div
                className={cn(
                  "hidden [@media(hover:hover)_and_(pointer:fine)]:block relative -mt-[3px] -mr-[2px] shrink-0",
                  "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                  menuOpen && "opacity-100"
                )}
                ref={menuBtnRef}
              >
                <button
                  className={cn(
                    "flex items-center justify-center w-[24px] h-[24px] rounded-full border-none",
                    "bg-transparent text-muted-foreground cursor-pointer",
                    "transition-[background-color,color] duration-150",
                    "hover:bg-muted hover:text-foreground",
                    menuOpen && "bg-muted text-foreground"
                  )}
                  aria-label="Habit options"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!menuOpen) {
                      const rect = menuBtnRef.current?.getBoundingClientRect();
                      if (rect) setMenuPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                    }
                    setMenuOpen((o) => !o);
                  }}
                >
                  <DotsIcon />
                </button>

              </div>
            </div>
            <div className="-mt-[3px] flex items-center gap-[7px] min-w-0 text-[length:calc(12.5px*var(--tz,1))] leading-none text-foreground/65">
              {tier && (
                <span className="shrink-0 font-bold uppercase tracking-[0.05em] text-[length:calc(11px*var(--tz,1))]" style={{ color: tier.accent }}>
                  {tier.label.toLowerCase()}
                </span>
              )}
              {tier && <span className="opacity-40">•</span>}
              <span className="truncate tabular-nums">
                <strong className="font-bold text-foreground">{weekDone}</strong>/7 this week
              </span>
            </div>
            <div className="flex items-start gap-2 min-w-0">
              <ChainRow days={chainDays} />
              {streak === 0 && totalDone > 0 && (
                <span className="text-[length:calc(12.5px*var(--tz,1))] font-semibold text-foreground/65 whitespace-nowrap truncate tabular-nums">
                  {totalDone} total
                </span>
              )}
            </div>
          </div>

          {/* Missed yesterday: tiny one-tap backfill (toast offers Undo) */}
          {!ydayDone && yesterdayInRange && (
            <button
              type="button"
              title="Missed yesterday? Tap to log it"
              aria-label="Log yesterday"
              className={cn(
                "relative shrink-0 -mr-1 grid place-items-center w-[24px] h-[24px] rounded-full",
                "text-muted-foreground/70 bg-muted/60 ring-1 ring-inset ring-border/70",
                "transition-[color,background-color,transform] duration-150",
                "hover:text-primary hover:bg-primary/10 hover:ring-primary/30 active:scale-90",
                "disabled:opacity-40 [-webkit-tap-highlight-color:transparent] touch-manipulation"
              )}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); void handleLogYesterday(); }}
              disabled={toggle.isPending}
            >
              <YesterdayIcon size={12} />
            </button>
          )}

                    {/* Check-off: ring fills with this week's progress, flame badge shows the streak */}
          <div className="relative shrink-0 w-[46px] h-[46px] grid place-items-center">
            <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 46 46" aria-hidden>
              <circle cx="23" cy="23" r="21" fill="none" strokeWidth="2.5" className="stroke-muted-foreground/[0.12]" />
              <circle
                cx="23" cy="23" r="21" fill="none" strokeWidth="2.5" strokeLinecap="round"
                className="stroke-primary transition-[stroke-dashoffset] duration-500 ease-out"
                strokeDasharray={2 * Math.PI * 21}
                strokeDashoffset={2 * Math.PI * 21 * (1 - weekDone / 7)}
              />
            </svg>
            {burst > 0 && (
              <span key={burst} aria-hidden className="hli-burst pointer-events-none absolute inset-0">
                <span className="hli-ripple" />
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} style={{ ["--a" as string]: `${i * 36}deg`, ["--c" as string]: i % 3 === 0 ? "hsl(var(--primary))" : i % 3 === 1 ? `hsl(${hue} 85% 60%)` : "rgb(245 158 11)" }} />
                ))}
              </span>
            )}
            <CheckButton
              done={optimisticDone}
              pending={toggle.isPending}
              onToggle={handleToggleToday}
              onLongPress={(rect) => {
                setMenuPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
                setMenuOpen(true);
              }}
            />
            {streak > 0 && (
              <span
                title={`${streak}-day streak`}
                className={cn(
                  "absolute -top-[7px] -right-[9px] inline-flex items-center gap-[1px] pl-[4px] pr-[6px] h-[18px] rounded-full",
                  "text-[length:calc(10.5px*var(--tz,1))] font-extrabold tracking-[-0.02em] tabular-nums whitespace-nowrap",
                  "bg-card ring-1 ring-amber-500/40 text-amber-600 dark:text-amber-400",
                  streak >= 7 && "shadow-[0_0_10px_-2px_rgb(245_158_11/0.7)]"
                )}
              >
                <span className="text-[length:calc(10px*var(--tz,1))]">🔥</span>{streak}
              </span>
            )}
          </div>
        </div>
      </div>

      {menuOpen && (
        <ContextMenu
          onEdit={() => setEditOpen(true)}
          onDelete={handleDelete}
          onClose={() => setMenuOpen(false)}
          style={{ top: menuPos.top, right: menuPos.right }}
          yesterday={yesterdayInRange ? {
            done: ydayDone,
            onToggle: () => { void (ydayDone ? handleUndoYesterday() : handleLogYesterday()); },
          } : undefined}
        />
      )}

      <EditHabitDialog habit={habit} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}