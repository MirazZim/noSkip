import { lazy, Suspense, useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import {
  format,
  startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, subDays, addMonths, subMonths,
  differenceInDays, differenceInMinutes, parseISO, startOfYear, endOfYear, endOfDay,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Trophy, Crown, Sparkles, Check, Clock,
  TrendingUp, TrendingDown, Minus, Target, Zap, Megaphone, RotateCw,
} from "lucide-react";
import { Habit, HabitCompletion, calculateStreak } from "@/hooks/useHabits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StreakGrid } from "@/components/habits/StreakGrid";
import { StreakFlame } from "@/components/habits/detail/StreakFlame";
import { WeekDial, HourStrip } from "@/components/habits/detail/WeekRhythm";
import { heatColor } from "@/components/habits/detail/colors";

// three.js is heavy, so the 3D coach only loads when a detail panel is shown.
const Coach3D = lazy(() => import("@/components/habits/Coach3D"));

interface Props {
  habit: Habit;
  completions: HabitCompletion[];
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAYS_LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

// Mirrors the tier thresholds in HabitListItem so the ring aims at the next celebration.
const MILESTONES: { days: number; label: string }[] = [
  { days: 3, label: "Wiring up" },
  { days: 7, label: "One week" },
  { days: 14, label: "Two weeks" },
  { days: 21, label: "The Maltz point" },
  { days: 30, label: "One month" },
  { days: 40, label: "The 40 day wall" },
  { days: 66, label: "Lally's number" },
  { days: 90, label: "The 90 day shift" },
  { days: 100, label: "Triple digits" },
  { days: 180, label: "Half a year" },
  { days: 365, label: "One full year" },
];


function chronotype(h: number) {
  if (h >= 5 && h <= 10) return { emoji: "🌅", name: "Early bird", tip: "Mornings are your launchpad. Guard that first hour." };
  if (h >= 11 && h <= 16) return { emoji: "☀️", name: "Daytime doer", tip: "You get it done mid-day. Block that slot on your calendar." };
  if (h >= 17 && h <= 20) return { emoji: "🌇", name: "Evening closer", tip: "You close the day strong. Make it a ritual before dinner." };
  return { emoji: "🌙", name: "Night owl", tip: "You win late. Keep it from slipping past midnight." };
}

const hourLabel = (h: number) => format(new Date(2000, 0, 1, h), "h a");

/** Shown until (or instead of) the 3D model: a glossy monogram with a little voice meter. */
function CoachBadge({ talkKey }: { talkKey: string }) {
  return (
    <div className="hdp-coach-badge">
      <span className="hdp-coach-mono">TL</span>
      <span key={talkKey} className="hdp-coach-voice" aria-hidden><i /><i /><i /></span>
    </div>
  );
}

/**
 * Renders a coach line as speech: words fade in one by one, **marked** facts get a
 * highlighter swipe, and the final sentence lands as a bold punchline.
 */
function PepTalk({ line }: { line: string }) {
  // Split off the last sentence, ignoring "..." and full stops inside **marks**.
  let cut = -1;
  let inMark = false;
  for (let i = 0; i < line.length; i++) {
    if (line.startsWith("**", i)) { inMark = !inMark; i++; continue; }
    const end = line[i - 1] === "*" ? i - 3 : i - 1;
    if (!inMark && /\s/.test(line[i]) && /[.!?]/.test(line[end] ?? "") && line[end - 1] !== ".") cut = i;
  }
  const body = cut > 0 ? line.slice(0, cut) : line;
  const punch = cut > 0 ? line.slice(cut + 1) : null;
  let d = 0;
  const delay = () => ({ "--d": Math.min(d++, 45) } as CSSProperties);

  const rich = (text: string) =>
    text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((chunk, i) =>
      chunk.startsWith("**") ? (
        <mark key={i} className="hdp-hl" style={delay()}>{chunk.slice(2, -2)}</mark>
      ) : (
        chunk.split(/(\s+)/).map((tok, j) =>
          /^\s+$/.test(tok) || !tok ? tok : <span key={`${i}-${j}`} className="hdp-w" style={delay()}>{tok}</span>
        )
      )
    );

  return (
    <>
      {rich(body)}
      {punch && <span className="hdp-punch">{rich(punch)}</span>}
    </>
  );
}

/** Wraps text into lines of roughly `max` characters. */
function wrapWords(text: string, max: number) {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= max) lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}

/** The quote gets chalked onto the board: outline traced first, then filled in. */
function ChalkWriting({ text }: { text: string }) {
  const lines = wrapWords(text, 22);
  const LH = 27;
  return (
    <svg className="hdp-chalk" viewBox={`0 0 280 ${lines.length * LH + 6}`} role="img" aria-label={text}>
      {lines.map((line, i) => (
        <text key={i} x="2" y={(i + 1) * LH - 4} style={{ ["--i" as string]: i }}>{line}</text>
      ))}
    </svg>
  );
}

/** Re-renders every minute so the "time left today" countdown stays live. */
function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function HabitDetailPanel({ habit, completions }: Props) {
  const [viewMonth, setViewMonth] = useState(new Date());
  const [calMode, setCalMode] = useState<"month" | "year">("month");
  const uid = useId().replace(/:/g, "");
  const now = useMinuteTick();
  const [pepTalkIdx, setPepTalkIdx] = useState(0);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [leaving, setLeaving] = useState<{ title: string; idx: number } | null>(null);
  const dayOfYearIdx = differenceInDays(now, startOfYear(now));

  const insights = useMemo(() => {
    const habitCompletions = completions.filter((c) => c.habit_id === habit.id);
    const completedSet = new Set(habitCompletions.map((c) => c.date));
    const today = format(new Date(), "yyyy-MM-dd");

    const dayCompletions = Array(7).fill(0);
    const dayOccurrences = Array(7).fill(0);

    const startDate = parseISO(habit.start_date);
    const allDays = startDate <= new Date()
      ? eachDayOfInterval({ start: startDate, end: new Date() })
      : [];
    allDays.forEach((day) => {
      const dow = (getDay(day) + 6) % 7;
      dayOccurrences[dow]++;
      if (completedSet.has(format(day, "yyyy-MM-dd"))) {
        dayCompletions[dow]++;
      }
    });

    const weeklyRates = dayOccurrences.map((occ, i) =>
      occ > 0 ? Math.round((dayCompletions[i] / occ) * 100) : null
    );
    const definedRates = weeklyRates.filter((r) => r !== null) as number[];
    const bestDayIdx = definedRates.length
      ? weeklyRates.indexOf(Math.max(...definedRates))
      : -1;
    const worstDayIdx = definedRates.length
      ? weeklyRates.indexOf(Math.min(...definedRates))
      : -1;

    const last30Start = format(subDays(new Date(), 29), "yyyy-MM-dd");
    const prev30Start = format(subDays(new Date(), 59), "yyyy-MM-dd");
    const prev30End = format(subDays(new Date(), 30), "yyyy-MM-dd");

    const last30Count = habitCompletions.filter(
      (c) => c.date >= last30Start && c.date <= today
    ).length;
    const prev30Count = habitCompletions.filter(
      (c) => c.date >= prev30Start && c.date <= prev30End
    ).length;

    const last30Rate = Math.round((last30Count / 30) * 100);
    const prev30Rate = Math.round((prev30Count / 30) * 100);
    const momentumDelta = last30Rate - prev30Rate;
    const momentumTrend =
      momentumDelta > 3 ? "up" : momentumDelta < -3 ? "down" : "flat";

    // Rolling 7-day completion rate for each of the last 60 days → sparkline.
    const sparkline: number[] = [];
    for (let i = 59; i >= 0; i--) {
      let done = 0;
      for (let j = 0; j < 7; j++) {
        if (completedSet.has(format(subDays(new Date(), i + j), "yyyy-MM-dd"))) done++;
      }
      sparkline.push(done / 7);
    }

    const sortedDates = [...completedSet].sort();

    // Consecutive runs of completed days, oldest first.
    const runs: { start: string; end: string; length: number }[] = [];
    sortedDates.forEach((d, i) => {
      const prev = runs[runs.length - 1];
      if (i > 0 && prev && differenceInDays(parseISO(d), parseISO(prev.end)) === 1) {
        prev.end = d;
        prev.length++;
      } else {
        runs.push({ start: d, end: d, length: 1 });
      }
    });

    let longestGap = 0;
    for (let i = 1; i < runs.length; i++) {
      longestGap = Math.max(
        longestGap,
        differenceInDays(parseISO(runs[i].start), parseISO(runs[i - 1].end)) - 1,
      );
    }

    const lastCompletionDate = sortedDates[sortedDates.length - 1] || null;
    const daysSinceLast = lastCompletionDate
      ? differenceInDays(new Date(), parseISO(lastCompletionDate))
      : differenceInDays(new Date(), startDate);

    const bestStreak = runs.reduce((m, r) => Math.max(m, r.length), 0);
    const currentStreak = calculateStreak(completions, habit.id, habit.start_date);

    // A comeback = the live streak follows a break of 3+ days.
    const isComeback =
      currentStreak > 0 && runs.length >= 2 &&
      differenceInDays(parseISO(runs[runs.length - 1].start), parseISO(runs[runs.length - 2].end)) - 1 >= 3;

    const totalDone = completedSet.size;
    const showUpRate = allDays.length ? Math.round((totalDone / allDays.length) * 100) : 0;

    const yearStart = startOfYear(new Date());
    const daysInYear = differenceInDays(endOfYear(new Date()), yearStart) + 1;
    const dayOfYear = differenceInDays(new Date(), yearStart) + 1;
    const yearCompletions = habitCompletions.filter(
      (c) => c.date >= format(yearStart, "yyyy-MM-dd")
    ).length;
    const dailyRate = dayOfYear > 0 ? yearCompletions / dayOfYear : 0;
    const projectedAnnual = Math.round(dailyRate * daysInYear);
    const daysRemaining = daysInYear - dayOfYear;
    const maxPossible = yearCompletions + daysRemaining;

    // Next round-number goal above the projection, and the weekly lift needed to reach it.
    const stretchTarget = Math.min(maxPossible, Math.ceil((projectedAnnual + 1) / 25) * 25);
    const extraPerWeek = daysRemaining > 0
      ? ((stretchTarget - yearCompletions) / daysRemaining - dailyRate) * 7
      : 0;

    // When in the day they actually check off (backfilled entries don't count).
    const hourCounts = Array(24).fill(0) as number[];
    habitCompletions.forEach((c) => {
      if (!c.is_retroactive && c.created_at) hourCounts[new Date(c.created_at).getHours()]++;
    });
    const liveCheckins = hourCounts.reduce((a, b) => a + b, 0);
    const peakHour = liveCheckins ? hourCounts.indexOf(Math.max(...hourCounts)) : -1;

    return {
      hourCounts, liveCheckins, peakHour,
      weeklyRates, bestDayIdx, worstDayIdx,
      last30Rate, prev30Rate, momentumDelta, momentumTrend, sparkline,
      runs, longestGap, daysSinceLast, bestStreak, currentStreak, isComeback,
      totalDone, showUpRate,
      daysInYear, yearCompletions, projectedAnnual, daysRemaining, maxPossible,
      stretchTarget, extraPerWeek,
    };
  }, [habit.id, habit.start_date, completions]);

  const { calendarWeeks, completedDates } = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const completed = new Set(
      completions.filter((c) => c.habit_id === habit.id).map((c) => c.date)
    );

    const weeks: (Date | null)[][] = [];
    let currentWeek: (Date | null)[] = [];
    const firstDow = (getDay(monthStart) + 6) % 7;
    for (let i = 0; i < firstDow; i++) currentWeek.push(null);

    days.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
    });
    if (currentWeek.length) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return { calendarWeeks: weeks, completedDates: completed };
  }, [viewMonth, habit.id, completions]);

  const today = format(new Date(), "yyyy-MM-dd");

  const {
    hourCounts, liveCheckins, peakHour,
    weeklyRates, bestDayIdx, worstDayIdx,
    last30Rate, prev30Rate, momentumDelta, momentumTrend, sparkline,
    runs, longestGap, daysSinceLast, bestStreak, currentStreak, isComeback,
    totalDone, showUpRate,
    daysInYear, yearCompletions, projectedAnnual, daysRemaining, maxPossible,
    stretchTarget, extraPerWeek,
  } = insights;


  const getStreakPosition = (dateStr: string) => {
    for (const run of runs) {
      if (dateStr >= run.start && dateStr <= run.end) {
        const isStart = dateStr === run.start;
        const isEnd = dateStr === run.end;
        return { inStreak: true, isStart, isEnd, isSingle: isStart && isEnd };
      }
    }
    return { inStreak: false, isStart: false, isEnd: false, isSingle: false };
  };

  const monthDays = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  const pastDays = monthDays.filter((d) => format(d, "yyyy-MM-dd") <= today);
  const monthCompletions = pastDays.filter((d) => completedDates.has(format(d, "yyyy-MM-dd"))).length;
  const monthRate = pastDays.length > 0 ? Math.round((monthCompletions / pastDays.length) * 100) : 0;

  // ── Hero ──────────────────────────────────────────────────────────────────
  const doneToday = completedDates.has(today);
  const minsLeft = Math.max(0, differenceInMinutes(endOfDay(now), now));
  const timeLeft = `${Math.floor(minsLeft / 60)}h ${String(minsLeft % 60).padStart(2, "0")}m`;
  const atRisk = !doneToday && currentStreak > 0;

  const nextMilestone = MILESTONES.find((m) => m.days > currentStreak) ?? null;
  const prevMilestoneDays = [...MILESTONES].reverse().find((m) => m.days <= currentStreak)?.days ?? 0;
  const ringProgress = nextMilestone
    ? (currentStreak - prevMilestoneDays) / (nextMilestone.days - prevMilestoneDays)
    : 1;

  const toGo = nextMilestone ? nextMilestone.days - currentStreak : 0;
  const streakCaption =
    currentStreak === 0 ? "Check in today to start a new streak."
    : atRisk ? "Check in today to keep it alive."
    : nextMilestone ? `${toGo} more day${toGo === 1 ? "" : "s"} to reach ${nextMilestone.label} 🏁`
    : "Every milestone unlocked 👑";

  // ── Coach pep talk: picks the situation, then rotates through original lines.
  // Voice: warm, corny, folksy, endlessly hopeful. Short sentences, one idea, one tiny action.
  const s = (n: number) => (n === 1 ? "" : "s");
  const coach = (() => {
    if (atRisk) {
      return {
        icon: Clock, tone: "warn" as const,
        title: "Halftime talk",
        series: { quote: "I believe in hope. I believe in Believe.", by: "Ted Lasso", plain: "Hope isn't silly. It's the thing that gets you to do it tonight, even when you're tired." },
        lines: [
          `Well hey there, partner. **${currentStreak} day${s(currentStreak)}** in a row. That ain't nothin', that's a whole heap of somethin'. Still got **${timeLeft}** on the clock. Let's go get today.`,
          "Now it don't have to be pretty tonight. Do the itty-bitty version. **Two minutes** counts. A scrappy win is still a win, and I'll take it every darn time.",
          `I ain't worried about you one bit. You didn't show up **${currentStreak} day${s(currentStreak)}** straight just to quit now. Go on, I'll wait right here.`,
          "Tired? Shoot, me too, buddy. But I'll tell ya what: **tomorrow-you** is gonna be tickled pink you did this. Do it for that fella. He's a good one.",
        ],
      };
    }
    if (isComeback) {
      return {
        icon: Zap, tone: "good" as const,
        title: "Welcome back, y'all",
        series: { quote: "Be a goldfish.", by: "Ted Lasso", plain: "Forget the miss fast. Don't drag yesterday into today. Just start fresh." },
        lines: [
          "So you missed a few days. Big whoop. Fallin' down ain't the story. **Gettin' back up** is the story. And look at you, you're up.",
          "**Forget the miss. Keep the lesson.** That's the whole dang trick, and you're already doin' it.",
          `**${currentStreak} day${s(currentStreak)}** back in the saddle. I'm grinnin' so big my mustache is gettin' a workout.`,
          "Most folks quit after a bad week. **You came back.** That tells me everything I need to know about you, friend.",
        ],
      };
    }
    if (currentStreak >= bestStreak && currentStreak > 2) {
      return {
        icon: Crown, tone: "gold" as const,
        title: "New personal best",
        series: { quote: "Football is life!", by: "Dani Rojas", plain: "Love what you're building. When you go all in, a record is what happens." },
        lines: [
          `**${currentStreak} days!** Well, butter my biscuit. You ain't never been here before. Every day from now on is a **brand-new record**.`,
          "I'm not cryin', you're cryin'. Okay, we're both cryin'. Proud of ya. Keep on keepin' on.",
          "The great ones don't chase the record. They just keep showin' up. And one day, **the record is just... them.** That's you, partner.",
          `Fun fact: you're **the best you've ever been** at ${habit.name}. Not a fun fact, a true fact. Even better, if ya ask me.`,
        ],
      };
    }
    if (momentumTrend === "up") {
      return {
        icon: TrendingUp, tone: "good" as const,
        title: "You're on a roll",
        series: { quote: "Football is life!", by: "Dani Rojas", plain: 'Throw your whole heart into it. Joy is what keeps momentum going.' },
        lines: [
          `You went from **${prev30Rate}% to ${last30Rate}%** this month. That ain't luck, that's you. Keep doin' exactly what you're doin'.`,
          `**${last30Rate}%** over thirty days. If I baked cookies that good, I'd open up a shop on Main Street. Proud of ya.`,
          "Feel that? That's **momentum**, buddy. Quiet as a church mouse at first, then it's everywhere. Don't you stop now.",
        ],
      };
    }
    if (momentumTrend === "down" && worstDayIdx >= 0) {
      return {
        icon: Target, tone: "warn" as const,
        title: "Small fix, big win",
        series: { quote: "Be a goldfish.", by: "Ted Lasso", plain: "A bad month doesn't define you. Let it go and win the next day." },
        lines: [
          `We slipped from **${prev30Rate}% to ${last30Rate}%** this month. That's alright. Every team hits a rough patch. Your tricky day's **${WEEKDAYS_LONG[worstDayIdx].slice(0, -1)}**. Let's just go win that one.`,
          `Here's the plan, y'all. Don't fix the whole week. Just fix **${WEEKDAYS_LONG[worstDayIdx]}**. Set a reminder the night before. Easy as pie.`,
          "A slump ain't the end of the movie. It's the part right before **the trainin' montage**. Somebody cue the music.",
          "I don't care a lick about the score this month. I care that **you're still here**. And you are. So let's go.",
        ],
      };
    }
    if (bestDayIdx >= 0) {
      return {
        icon: Sparkles, tone: "good" as const,
        title: "I believe in you",
        series: { quote: "Believe.", by: "Ted Lasso", plain: "Trust that showing up adds up, even on days you can't see it yet." },
        lines: [
          `On **${WEEKDAYS_LONG[bestDayIdx]}** you hit **${weeklyRates[bestDayIdx]}%**. Whatever you're fixin' to do on ${WEEKDAYS_LONG[bestDayIdx]}, do it every day. That's the whole playbook.`,
          `You show up **${showUpRate}%** of days. That ain't just a number, friend. That's who you are.`,
          "You don't gotta be perfect. You just gotta **keep showin' up**. And hey, you keep showin' up.",
          "**I believe in you.** And I'm gonna keep sayin' it 'til you believe it too.",
        ],
      };
    }
    return {
      icon: Sparkles, tone: "good" as const,
      title: "Welcome to the team",
        series: { quote: "Believe.", by: "Ted Lasso", plain: "You don't need proof yet. Believe you can, then go get Day 1." },
      lines: [
        "Howdy! Every great season starts with **one practice**. Today's yours. Let's have us some fun.",
        "I don't care how you start. I just care that **you start**. Go get one done, then come tell me all about it.",
        "**Day one's** the toughest. After that it gets a little easier every day. Cross my heart.",
      ],
    };
  })();
  const lineIdx = (dayOfYearIdx + pepTalkIdx) % coach.lines.length;
  const coachLine = coach.lines[lineIdx];
  const talkKey = `${coach.title}-${lineIdx}-${pepTalkIdx}`;
  const CoachIcon = coach.icon;
  // a new quote always starts face-up
  useEffect(() => { setBoardFlipped(false); }, [coach.series.quote]);

  // ── Sparkline ─────────────────────────────────────────────────────────────
  const SW = 300;
  const SH = 52;
  const sparkPts = sparkline.map((v, i) => [
    (i / (sparkline.length - 1)) * SW,
    SH - 4 - v * (SH - 12),
  ]);
  const sparkLine = sparkPts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const sparkArea = `${sparkLine} L${SW} ${SH} L0 ${SH} Z`;
  const sparkLast = sparkPts[sparkPts.length - 1];

  // ── Streak skyline ────────────────────────────────────────────────────────
  const skyline = runs.slice(-20);
  const skylineMax = Math.max(1, ...skyline.map((r) => r.length));
  const liveRunEnd = currentStreak > 0 ? runs[runs.length - 1]?.end : null;

  // ── Projection ────────────────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const doneFrac = Math.min(1, yearCompletions / daysInYear);
  const projFrac = Math.min(1, projectedAnnual / daysInYear);
  const showStretch = stretchTarget > projectedAnnual && extraPerWeek > 0 && extraPerWeek <= 7;

  return (
    <div className="hdp-root">
      <style>{`
        .hdp-root {
          container-type: inline-size;
          font-family: inherit;
          font-variant-numeric: tabular-nums;
        }
        .hdp-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }

        /* Your chain: Month / Year toggle */
        .hdp-chain[data-mode="month"] .hdp-chain-year { display: none; }
        .hdp-chain[data-mode="year"] .hdp-chain-month { display: none; }

        /* Wide panels: hero | chain, then coach | weekly rhythm, rest pair up */
        @container (min-width: 660px) {
          .hdp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .hdp-hero  { grid-column: 1; grid-row: 1; display: flex; flex-direction: column; justify-content: center; }
          .hdp-chain { grid-column: 2; grid-row: 1; }
          .hdp-coach { grid-column: 1; grid-row: 2; }
          .hdp-rhythm { grid-column: 2; grid-row: 2; }
          .hdp-proj { grid-column: 1 / -1; }
          .hdp-coach-quote { font-size: 14px; }
        }

        .hdp-card {
          position: relative;
          border-radius: 14px;
          background:
            linear-gradient(180deg, hsl(var(--foreground) / 0.025), transparent 40%),
            hsl(var(--card));
          border: 1px solid hsl(var(--border) / 0.6);
          box-shadow: 0 1px 2px hsl(0 0% 0% / 0.04), 0 8px 24px -12px hsl(0 0% 0% / 0.12);
          overflow: hidden;
        }
        .hdp-head {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 10px; padding: 12px 14px 0;
        }
        .hdp-title {
          font-size: 13px; font-weight: 650; letter-spacing: -0.015em;
          color: hsl(var(--foreground)); line-height: 1.25;
        }
        .hdp-sub { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; line-height: 1.35; }
        .hdp-body { padding: 10px 14px 14px; }
        .hdp-muted { font-size: 12px; color: hsl(var(--muted-foreground)); }

        /* ── Hero ── */
        .hdp-hero {
          border: 1px solid hsl(var(--primary) / 0.22);
          background:
            radial-gradient(130% 110% at 0% 0%, hsl(var(--primary) / 0.20), transparent 55%),
            radial-gradient(80% 90% at 100% 100%, hsl(var(--primary) / 0.08), transparent 60%),
            hsl(var(--card));
        }
        .hdp-hero--risk {
          border-color: hsl(38 92% 50% / 0.35);
          background:
            radial-gradient(130% 110% at 0% 0%, hsl(38 92% 50% / 0.16), transparent 55%),
            radial-gradient(80% 90% at 100% 100%, hsl(var(--primary) / 0.06), transparent 60%),
            hsl(var(--card));
        }
        .hdp-hero-top { display: flex; align-items: center; gap: 14px; padding: 14px 16px 10px; }

        .hdp-hero-text { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 5px; }
        .hdp-status {
          align-self: flex-start;
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 4px 10px 4px 8px; border-radius: 99px;
        }
        .hdp-status--done { background: hsl(142 71% 45% / 0.14); color: hsl(142 71% 38%); }
        .dark .hdp-status--done { color: hsl(142 71% 58%); }
        .hdp-status--risk { background: hsl(38 92% 50% / 0.16); color: hsl(32 95% 42%); }
        .dark .hdp-status--risk { color: hsl(38 92% 60%); }
        .hdp-status--idle { background: hsl(var(--foreground) / 0.06); color: hsl(var(--muted-foreground)); }
        @keyframes hdp-ping { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2.4); opacity: 0; } }
        .hdp-ping { position: relative; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .hdp-ping::after {
          content: ''; position: absolute; inset: 0; border-radius: 50%;
          background: currentColor; animation: hdp-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        .hdp-streak-big { font-size: 15px; font-weight: 650; color: hsl(var(--muted-foreground)); line-height: 1; }
        .hdp-streak-big strong {
          font-size: 34px; font-weight: 850; letter-spacing: -0.05em; color: hsl(var(--foreground));
          margin-right: 1px; font-variant-numeric: tabular-nums;
        }
        .hdp-streak-caption { font-size: 12.5px; color: hsl(var(--muted-foreground)); line-height: 1.35; }


        .hdp-stats {
          display: grid; grid-template-columns: repeat(3, 1fr);
          padding: 10px 8px 12px;
        }
        .hdp-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
        .hdp-stat + .hdp-stat { border-left: 1px solid hsl(var(--border) / 0.6); }
        .hdp-stat-val {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 16px; font-weight: 750; letter-spacing: -0.04em; line-height: 1;
          color: hsl(var(--foreground));
        }
        .hdp-stat-lbl { font-size: 11.5px; color: hsl(var(--muted-foreground)); }

        /* ── Milestone trail ── */
        .hdp-trail-track { position: relative; height: 6px; margin-top: 2px; border-radius: 99px; background: hsl(var(--foreground) / 0.08); }
        .hdp-trail-fill {
          height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, #ff9a3c, #ffd166);
          transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── Coach ── */
        .hdp-coach {
          display: flex; gap: 12px; padding: 12px 14px; align-items: flex-start;
          --coach: var(--primary);
        }
        .hdp-coach--warn { --coach: 35 92% 50%; }
        .hdp-coach--gold { --coach: 42 95% 50%; }
        .hdp-coach::before {
          content: ''; position: absolute; inset: 0; pointer-events: none;
          background: radial-gradient(90% 120% at 0% 0%, hsl(var(--coach) / 0.12), transparent 60%);
        }
        .hdp-coach-side { display: flex; flex-direction: column; align-items: center; gap: 6px; flex-shrink: 0; position: relative; }
        /* locker-room backdrop: lockers with vents, a floor line */
        .hdp-coach::after {
          content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: 0.5;
          background:
            linear-gradient(180deg, transparent 78%, hsl(var(--foreground) / 0.05) 78%),
            repeating-linear-gradient(90deg, transparent 0 46px, hsl(var(--foreground) / 0.06) 46px 48px),
            repeating-linear-gradient(180deg, transparent 0 5px, hsl(var(--foreground) / 0.035) 5px 6px) 0 12px / 100% 24px no-repeat;
        }
        .hdp-coach > * { position: relative; z-index: 1; }

        /* comic speech bubble */
        .hdp-coach .hdp-bubble--comic {
          background: hsl(0 0% 99%); color: hsl(230 22% 12%);
          border: 2px solid hsl(230 22% 12%);
          border-radius: 18px 18px 18px 6px;
          box-shadow: 4px 4px 0 hsl(var(--coach) / 0.85);
          padding-top: 18px;
        }
        .hdp-coach .hdp-bubble--comic::before {
          left: -11px; top: 26px; width: 16px; height: 16px;
          background: hsl(0 0% 99%); border-left: 2px solid hsl(230 22% 12%); border-bottom: 2px solid hsl(230 22% 12%);
        }
        .hdp-coach .hdp-bubble--comic .hdp-coach-kicker {
          position: absolute; top: -12px; left: 12px; padding: 3px 9px; border-radius: 6px;
          background: hsl(var(--coach)); color: hsl(230 22% 10%);
          border: 2px solid hsl(230 22% 12%); transform: rotate(-2deg);
          font-size: 10px; box-shadow: 2px 2px 0 hsl(230 22% 12%);
        }
        .hdp-coach .hdp-bubble--comic .hdp-coach-quote { color: hsl(230 18% 22%); }
        .hdp-coach .hdp-bubble--comic .hdp-hl, .hdp-bubble--comic .hdp-punch { color: hsl(230 25% 8%); }
        .hdp-coach .hdp-bubble--comic .hdp-pep-dot { background: hsl(230 20% 12% / 0.18); }
        .hdp-coach .hdp-bubble--comic .hdp-pep-dot--on { background: hsl(var(--coach)); }
        .hdp-coach .hdp-bubble--comic .hdp-pep-btn { color: hsl(230 22% 12%); background: hsl(var(--coach) / 0.35); border: 1.5px solid hsl(230 22% 12%); }

        /* chalk written live */
        @keyframes hdp-chalk-trace { to { stroke-dashoffset: 0; } }
        @keyframes hdp-chalk-fill { to { fill-opacity: 1; } }
        .hdp-chalk { position: relative; display: block; width: 100%; height: auto; overflow: visible; transform: rotate(-1.2deg); }
        .hdp-chalk text {
          font-family: "Caveat", "Bradley Hand", cursive; font-size: 26px; font-weight: 700;
          fill: hsl(60 20% 94%); fill-opacity: 0;
          stroke: hsl(60 20% 94% / 0.9); stroke-width: 0.7; stroke-dasharray: 520; stroke-dashoffset: 520;
          animation:
            hdp-chalk-trace 1.3s ease-in-out forwards calc(var(--i) * 0.9s),
            hdp-chalk-fill 0.5s ease-out forwards calc(var(--i) * 0.9s + 0.9s);
        }

        .hdp-coach-3d {
          position: relative; width: 72px; height: 72px; margin-top: 28px; border-radius: 50%;
          background:
            radial-gradient(circle at 50% 30%, hsl(var(--coach) / 0.45), hsl(var(--coach) / 0.12) 72%),
            hsl(var(--card));
          box-shadow: 0 0 0 2px hsl(var(--card)), 0 0 0 3.5px hsl(var(--coach) / 0.55), 0 10px 22px -8px hsl(var(--coach) / 0.7);
        }
        /* stage is taller than the circle: bottom clipped to the circle, top open */
        .hdp-coach-3d-stage {
          position: absolute; left: -4px; bottom: 0; width: 80px; height: 104px;
          display: flex; align-items: flex-end; justify-content: center;
          clip-path: inset(0 4px 0 4px round 0 0 36px 36px);
        }
        .hdp-coach-badge {
          position: relative; width: 72px; height: 72px; border-radius: 50%;
          display: grid; place-items: center;
          background:
            radial-gradient(circle at 35% 25%, hsl(0 0% 100% / 0.35), transparent 45%),
            linear-gradient(145deg, hsl(var(--coach)), hsl(var(--coach) / 0.55));
          box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.35), inset 0 -6px 14px hsl(0 0% 0% / 0.25);
        }
        .hdp-coach-mono {
          font-size: 24px; font-weight: 850; letter-spacing: -0.06em; color: hsl(0 0% 100%);
          text-shadow: 0 2px 6px hsl(0 0% 0% / 0.35);
        }
        .hdp-coach-voice { position: absolute; bottom: 10px; display: flex; gap: 2px; align-items: flex-end; height: 8px; }
        @keyframes hdp-voice { 0%, 100% { height: 2px; } 50% { height: 8px; } }
        .hdp-coach-voice i {
          display: block; width: 3px; height: 2px; border-radius: 2px; background: hsl(0 0% 100% / 0.85);
          animation: hdp-voice 0.45s ease-in-out 6;
        }
        .hdp-coach-voice i:nth-child(2) { animation-delay: 0.12s; }
        .hdp-coach-voice i:nth-child(3) { animation-delay: 0.24s; }
        .hdp-coach-name { font-size: 11.5px; font-weight: 700; color: hsl(var(--foreground)); letter-spacing: -0.01em; white-space: nowrap; }
        .hdp-bubble {
          position: relative; flex: 1; min-width: 0;
          padding: 9px 12px 10px; border-radius: 4px 14px 14px 14px;
          background: hsl(var(--foreground) / 0.045);
          border: 1px solid hsl(var(--coach) / 0.18);
        }
        .hdp-bubble::before {
          content: ''; position: absolute; left: -7px; top: 14px;
          width: 12px; height: 12px; transform: rotate(45deg);
          background: inherit; border-left: inherit; border-bottom: inherit;
          border-top: 0; border-right: 0;
        }
        .hdp-coach-kicker {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase;
          color: hsl(var(--coach));
        }
        .hdp-coach-kicker-icon { flex-shrink: 0; }
        @keyframes hdp-quote-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .hdp-coach-quote {
          position: relative; margin-top: 4px;
          font-size: 14px; line-height: 1.55; font-weight: 500; letter-spacing: -0.01em;
          color: hsl(var(--foreground) / 0.88);
        }
        /* words land one after another, like he's talking */
        @keyframes hdp-word { from { opacity: 0; transform: translateY(3px); filter: blur(5px); } to { opacity: 1; transform: none; filter: blur(0); } }
        @keyframes hdp-leave { to { opacity: 0; transform: translateY(-6px) scale(0.985); filter: blur(6px); } }
        .hdp-w, .hdp-hl {
          display: inline-block;
          animation: hdp-word 0.7s cubic-bezier(0.25, 1, 0.5, 1) both;
          animation-delay: calc(var(--cut, 0ms) + var(--d) * 42ms);
        }
        .hdp-hl {
          font-weight: 750; color: hsl(var(--foreground));
          padding: 0 3px; margin: 0 -1px; border-radius: 3px;
          background: linear-gradient(100deg, hsl(var(--coach) / 0.38), hsl(var(--coach) / 0.22)) no-repeat 0 85% / 0% 42%;
          animation:
            hdp-word 0.7s cubic-bezier(0.25, 1, 0.5, 1) both calc(var(--cut, 0ms) + var(--d) * 42ms),
            hdp-swipe 0.6s cubic-bezier(0.65, 0, 0.35, 1) forwards calc(var(--cut, 0ms) + var(--d) * 42ms + 260ms);
        }
        @keyframes hdp-swipe { to { background-size: 100% 42%; } }
        .hdp-punch {
          display: block; margin-top: 6px;
          font-size: 16px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.3;
          color: hsl(var(--foreground));
        }
        .hdp-punch::after {
          content: ''; display: block; width: 44px; height: 3px; margin-top: 7px; border-radius: 2px;
          background: linear-gradient(90deg, hsl(var(--coach)), hsl(var(--coach) / 0.2));
        }
        .hdp-punch .hdp-hl { font-weight: 800; }
        .hdp-coach-quote--ghost .hdp-w, .hdp-coach-quote--ghost .hdp-hl,
        .hdp-coach-quote--leave .hdp-w, .hdp-coach-quote--leave .hdp-hl { animation: none; background-size: 100% 42%; }
        /* the old line drifts up and out of focus; the new one waits for the cut */
        .hdp-coach-quote--leave { animation: hdp-leave 0.38s cubic-bezier(0.4, 0, 0.2, 1) forwards; pointer-events: none; }
        .hdp-coach-quote--after-cut { --cut: 300ms; }
        .hdp-pep-dots { display: flex; gap: 4px; margin-top: 8px; }
        .hdp-pep-dot {
          width: 5px; height: 5px; border-radius: 99px;
          background: hsl(var(--foreground) / 0.15);
          transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s;
        }
        .hdp-pep-dot--on { width: 16px; background: hsl(var(--coach)); }
        /* ── Locker-room chalkboard ── */
        .hdp-board {
          position: relative; margin: 10px 0 0; padding: 10px 14px 10px;
          border-radius: 10px; overflow: hidden;
          color: hsl(60 20% 94%);
          background:
            radial-gradient(120% 90% at 20% 10%, hsl(150 14% 24%), transparent 70%),
            radial-gradient(90% 80% at 90% 100%, hsl(160 18% 12%), transparent 70%),
            hsl(155 16% 16%);
          /* wooden frame */
          box-shadow:
            inset 0 0 0 1px hsl(0 0% 100% / 0.06),
            inset 0 0 28px hsl(0 0% 0% / 0.45),
            0 0 0 5px hsl(28 42% 34%),
            0 0 0 6px hsl(26 40% 22%),
            0 6px 16px -6px hsl(0 0% 0% / 0.5);
          margin-left: 6px; margin-right: 6px; margin-bottom: 6px;
        }
        .hdp-board-play {
          position: absolute; inset: 0; width: 100%; height: 100%;
          color: hsl(60 20% 94% / 0.09); pointer-events: none;
        }
        .hdp-board-smudge {
          position: absolute; right: -20px; top: -10px; width: 140px; height: 60px;
          background: radial-gradient(closest-side, hsl(60 20% 94% / 0.07), transparent);
          transform: rotate(-12deg); pointer-events: none;
        }
        @keyframes hdp-chalk-write {
          from { clip-path: inset(0 100% 0 0); }
          to   { clip-path: inset(0 0 0 0); }
        }
        .hdp-board-by {
          position: relative; margin-top: 4px;
          font-family: "Caveat", "Bradley Hand", cursive;
          font-size: 15px; font-weight: 500;
          color: hsl(48 90% 72%);
          transform: rotate(-1deg); transform-origin: left center;
          animation: hdp-quote-in 0.4s 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        /* chalk stick resting on the ledge */
        .hdp-board-chalk {
          position: absolute; right: 14px; bottom: 6px; width: 22px; height: 5px; border-radius: 2px;
          background: linear-gradient(180deg, hsl(0 0% 100%), hsl(40 10% 82%));
          box-shadow: 0 1px 2px hsl(0 0% 0% / 0.4);
          transform: rotate(-4deg);
        }
        .hdp-quote-stack { display: grid; }
        .hdp-quote-stack > .hdp-coach-quote { grid-area: 1 / 1; }
        .hdp-coach-quote--ghost { visibility: hidden; animation: none; }
        .hdp-pep-btn {
          margin-top: 8px;
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 650;
          padding: 5px 10px; border-radius: 99px;
          color: hsl(var(--coach)); background: hsl(var(--coach) / 0.12);
          transition: background 0.2s, transform 0.15s;
        }
        .hdp-pep-btn:hover { background: hsl(var(--coach) / 0.2); }
        .hdp-pep-btn:active { transform: scale(0.96); }

        /* ── Segmented toggle ── */
        .hdp-seg {
          display: inline-flex; padding: 3px; border-radius: 10px;
          background: hsl(var(--foreground) / 0.06); flex-shrink: 0;
        }
        .hdp-seg button {
          font-size: 11.5px; font-weight: 600;
          padding: 4px 12px; border-radius: 7px;
          color: hsl(var(--muted-foreground));
          transition: background 0.2s, color 0.2s, box-shadow 0.2s;
        }
        .hdp-seg button[data-active="true"] {
          background: hsl(var(--card)); color: hsl(var(--foreground));
          box-shadow: 0 1px 2px hsl(0 0% 0% / 0.12), 0 0 0 0.5px hsl(var(--border));
        }

        /* ── Month calendar ── */
        .hdp-cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .hdp-cal-title { font-weight: 650; font-size: 13px; letter-spacing: -0.01em; }
        .hdp-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 2px; }
        .hdp-cal-wd { text-align: center; font-size: 11.5px; font-weight: 600; color: hsl(var(--muted-foreground)); padding: 2px 0; }
        .hdp-cal-week { display: grid; grid-template-columns: repeat(7, 1fr); }
        .hdp-cal-day { position: relative; height: 28px; display: flex; align-items: center; justify-content: center; }
        .hdp-cal-connector { position: absolute; top: 2px; bottom: 2px; background: hsl(var(--primary) / 0.14); }
        .hdp-cal-dot {
          position: relative; z-index: 1; display: flex; width: 24px; height: 24px;
          align-items: center; justify-content: center; border-radius: 50%;
          font-size: 12.5px; font-weight: 500; transition: background 0.15s, transform 0.15s;
        }
        .hdp-cal-dot--done {
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-weight: 650;
          box-shadow: 0 2px 8px -2px hsl(var(--primary) / 0.6);
        }
        .hdp-cal-dot--today { box-shadow: inset 0 0 0 1.5px hsl(var(--primary)); color: hsl(var(--primary)); font-weight: 700; }
        .hdp-cal-dot--future { color: hsl(var(--muted-foreground) / 0.4); }
        .hdp-cal-dot--missed { color: hsl(var(--foreground) / 0.7); }
        .hdp-month-rate { display: flex; align-items: baseline; justify-content: space-between; margin: 10px 0 6px; }
        .hdp-month-rate-val { font-size: 15px; font-weight: 750; letter-spacing: -0.03em; color: hsl(var(--foreground)); }
        .hdp-track { height: 6px; border-radius: 99px; background: hsl(var(--foreground) / 0.07); overflow: hidden; }
        .hdp-fill {
          height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, hsl(var(--primary) / 0.7), hsl(var(--primary)));
          transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }

        /* ── Weekly clock ── */
        .hdp-clock-row { display: flex; align-items: center; gap: 16px; }
        .hdp-clock { flex-shrink: 0; }
        .hdp-clock-facts { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        @keyframes hdp-grow { from { transform: scale(0.3); } to { transform: none; } }

        .hdp-sky { margin-top: 14px; padding-top: 12px; border-top: 1px solid hsl(var(--border) / 0.6); }
        .hdp-sky-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .hdp-sky-type { font-size: 13.5px; font-weight: 750; letter-spacing: -0.02em; color: hsl(var(--foreground)); }
        .hdp-sky-peak { color: hsl(var(--foreground)); font-weight: 700; }
        @keyframes hdp-rise { from { transform: scaleY(0); } to { transform: none; } }
        .hdp-daychip {
          display: inline-flex; align-items: center; gap: 5px; align-self: flex-start;
          padding: 6px 11px 6px 9px; border-radius: 99px;
          font-size: 13px; font-weight: 600; color: hsl(var(--foreground) / 0.85);
          background: color-mix(in srgb, var(--chip) 14%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--chip) 35%, transparent);
          cursor: default;
        }
        .hdp-daychip strong { color: var(--chip); font-weight: 800; }

        /* ── Chalkboard flip card ── */
        .hdp-board-wrap {
          display: block; width: 100%; margin-top: 10px; padding: 0; border: 0; background: none;
          text-align: left; cursor: pointer; perspective: 900px; color: inherit; font: inherit;
        }
        .hdp-board-flip {
          display: grid; transform-style: preserve-3d;
          transition: transform 0.7s cubic-bezier(0.3, 1.25, 0.5, 1);
        }
        .hdp-board-flip.is-flipped { transform: rotateY(180deg); }
        .hdp-board-flip > .hdp-board { grid-area: 1 / 1; backface-visibility: hidden; -webkit-backface-visibility: hidden; margin-top: 0; }
        .hdp-board--back { transform: rotateY(180deg); display: flex; flex-direction: column; justify-content: center; }
        .hdp-board-wrap:hover .hdp-board-hint { opacity: 0.9; transform: rotate(90deg); }
        .hdp-board-hint {
          position: absolute; top: 9px; right: 10px; color: hsl(48 90% 72%);
          opacity: 0.45; transition: opacity 0.2s, transform 0.4s;
        }
        .hdp-board-kicker {
          position: relative; font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
          color: hsl(48 90% 72%);
        }
        .hdp-board-meaning {
          position: relative; margin-top: 4px;
          font-family: "Caveat", "Bradley Hand", cursive; font-size: 19px; font-weight: 600; line-height: 1.2;
          color: hsl(60 20% 94%);
        }
        .hdp-fact { display: flex; gap: 8px; align-items: flex-start; }
        .hdp-fact-dot { width: 8px; height: 8px; border-radius: 3px; margin-top: 4px; flex-shrink: 0; }
        .hdp-fact-text { font-size: 13px; line-height: 1.5; color: hsl(var(--muted-foreground)); }
        .hdp-fact-text strong { color: hsl(var(--foreground)); font-weight: 650; }

        /* ── Momentum ── */
        .hdp-badge {
          display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
          padding: 4px 9px; border-radius: 99px;
          font-size: 12px; font-weight: 700;
        }
        .hdp-badge--up { background: hsl(142 71% 45% / 0.14); color: hsl(142 71% 36%); }
        .dark .hdp-badge--up { color: hsl(142 71% 58%); }
        .hdp-badge--down { background: hsl(var(--destructive) / 0.12); color: hsl(var(--destructive)); }
        .hdp-badge--flat { background: hsl(var(--foreground) / 0.06); color: hsl(var(--muted-foreground)); }
        .hdp-spark { width: 100%; height: 52px; display: block; overflow: visible; }
        .hdp-spark-line { fill: none; stroke: hsl(var(--primary)); stroke-width: 2.25; stroke-linejoin: round; stroke-linecap: round; }
        .hdp-spark-grid { stroke: hsl(var(--foreground) / 0.07); stroke-dasharray: 2 4; }
        .hdp-spark-dot { fill: hsl(var(--primary)); stroke: hsl(var(--card)); stroke-width: 2.5; }
        .hdp-spark-axis { display: flex; justify-content: space-between; margin-top: 6px; }
        .hdp-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
        .hdp-compare-cell { padding: 7px 10px; border-radius: 10px; background: hsl(var(--foreground) / 0.035); }
        .hdp-compare-val { font-size: 15px; font-weight: 750; letter-spacing: -0.04em; color: hsl(var(--foreground)); line-height: 1; }
        .hdp-compare-val--dim { color: hsl(var(--muted-foreground)); }
        .hdp-compare-lbl { font-size: 11.5px; color: hsl(var(--muted-foreground)); margin-top: 4px; }

        /* ── Skyline ── */
        .hdp-skyline {
          display: flex; align-items: flex-end; gap: 4px;
          height: 60px; padding-top: 18px;
          border-bottom: 1px solid hsl(var(--border) / 0.7);
        }
        .hdp-tower {
          flex: 1; min-width: 4px; max-width: 20px;
          border-radius: 5px 5px 1px 1px;
          background: hsl(var(--primary) / 0.22);
          position: relative;
          transition: height 0.6s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s;
        }
        .hdp-tower:hover { background: hsl(var(--primary) / 0.4); }
        .hdp-tower--record { background: linear-gradient(to top, hsl(36 92% 50%), hsl(46 96% 62%)); box-shadow: 0 0 14px -2px hsl(42 95% 55% / 0.55); }
        .hdp-tower--record:hover { background: linear-gradient(to top, hsl(36 92% 50%), hsl(46 96% 62%)); }
        .hdp-tower--live { background: linear-gradient(to top, hsl(var(--primary) / 0.75), hsl(var(--primary))); }
        @keyframes hdp-live { 0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); } 50% { opacity: 0.4; transform: translateX(-50%) scale(0.7); } }
        .hdp-tower--live::after {
          content: ''; position: absolute; left: 50%; top: -9px; transform: translateX(-50%);
          width: 5px; height: 5px; border-radius: 50%;
          background: hsl(var(--primary)); animation: hdp-live 1.4s ease-in-out infinite;
        }
        .hdp-tower-crown { position: absolute; left: 50%; top: -18px; transform: translateX(-50%); color: hsl(42 95% 52%); }
        .hdp-sky-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
        .hdp-sky-val { font-size: 15px; font-weight: 750; letter-spacing: -0.035em; color: hsl(var(--foreground)); line-height: 1; }
        .hdp-sky-lbl { font-size: 11.5px; color: hsl(var(--muted-foreground)); margin-top: 4px; }

        /* ── Projection ── */
        .hdp-proj-kicker { font-size: 13px; color: hsl(var(--muted-foreground)); }
        .hdp-proj-big { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 10px; }
        .hdp-proj-num {
          font-size: 34px; font-weight: 800; letter-spacing: -0.06em; line-height: 0.95;
          background: linear-gradient(135deg, hsl(var(--foreground)), hsl(var(--primary)));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .hdp-proj-unit { font-size: 13px; font-weight: 600; color: hsl(var(--muted-foreground)); }
        .hdp-proj-bar { position: relative; height: 10px; border-radius: 99px; background: hsl(var(--foreground) / 0.07); overflow: hidden; }
        .hdp-proj-ghost {
          position: absolute; inset: 0 auto 0 0; border-radius: 99px;
          background: repeating-linear-gradient(-45deg, hsl(var(--primary) / 0.32) 0 4px, hsl(var(--primary) / 0.12) 4px 8px);
        }
        .hdp-proj-done {
          position: absolute; inset: 0 auto 0 0; border-radius: 99px;
          background: linear-gradient(90deg, hsl(var(--primary) / 0.8), hsl(var(--primary)));
        }
        .hdp-proj-legend { display: flex; justify-content: space-between; margin-top: 8px; }
        .hdp-proj-legend strong { color: hsl(var(--foreground)); font-weight: 650; }
        .hdp-cta {
          display: flex; align-items: center; gap: 10px;
          margin-top: 10px; padding: 9px 12px; border-radius: 10px;
          background: linear-gradient(135deg, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.05));
          border: 1px solid hsl(var(--primary) / 0.2);
        }
        .hdp-cta-icon { color: hsl(var(--primary)); flex-shrink: 0; }
        .hdp-cta-text { font-size: 13px; line-height: 1.45; color: hsl(var(--foreground) / 0.85); }
        .hdp-cta-text strong { color: hsl(var(--primary)); font-weight: 750; }

        @media (prefers-reduced-motion: reduce) {
          .hdp-ping::after, .hdp-tower--live::after,
          .hdp-coach-voice i, .hdp-coach-quote, .hdp-w, .hdp-hl,
          .hdp-board-by { animation: none; }
          .hdp-coach-quote--leave { visibility: hidden; }
          .hdp-chalk text { animation: none; fill-opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>

      <div className="hdp-grid">
      {/* ── 1. Hero ──────────────────────────────────────────────────────────── */}
      <div className={cn("hdp-card hdp-hero", atRisk && "hdp-hero--risk")}>
        <div className="hdp-hero-top">
          <StreakFlame streak={currentStreak} atRisk={atRisk} id={uid} />

          <div className="hdp-hero-text">
            {doneToday ? (
              <span className="hdp-status hdp-status--done"><Check size={12} strokeWidth={3} /> Done today</span>
            ) : atRisk ? (
              <span className="hdp-status hdp-status--risk"><span className="hdp-ping" /> {timeLeft} left today</span>
            ) : (
              <span className="hdp-status hdp-status--idle"><Clock size={12} strokeWidth={2.5} /> {timeLeft} left today</span>
            )}
            <span className="hdp-streak-big">
              <strong>{currentStreak}</strong>-day streak
            </span>
            <span className="hdp-streak-caption">{streakCaption}</span>
            {nextMilestone && currentStreak > 0 && (
              <div className="hdp-trail-track" aria-hidden>
                <div className="hdp-trail-fill" style={{ width: `${Math.max(4, ringProgress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>

        <div className="hdp-stats">
          <div className="hdp-stat">
            <span className="hdp-stat-val"><Trophy size={14} strokeWidth={2.4} style={{ color: "hsl(42 95% 52%)" }} />{bestStreak}</span>
            <span className="hdp-stat-lbl">Best streak</span>
          </div>
          <div className="hdp-stat">
            <span className="hdp-stat-val">{showUpRate}%</span>
            <span className="hdp-stat-lbl">Show-up</span>
          </div>
          <div className="hdp-stat">
            <span className="hdp-stat-val">{totalDone}</span>
            <span className="hdp-stat-lbl">Total days</span>
          </div>
        </div>
      </div>

      {/* ── 2. Coach pep talk ────────────────────────────────────────────────── */}
      <div className={cn("hdp-card hdp-coach", `hdp-coach--${coach.tone}`)}>
        <div className="hdp-coach-side">
          {/* circle frame; a model's head can pop out over its top edge */}
          <div className="hdp-coach-3d">
            <div className="hdp-coach-3d-stage">
              <Suspense fallback={<CoachBadge talkKey={talkKey} />}>
                <Coach3D
                  mood={coach.tone}
                  talkKey={talkKey}
                  talkMs={Math.min(5000, coachLine.split(/\s+/).length * 32 + 900)}
                  fallback={<CoachBadge talkKey={talkKey} />}
                  width={80}
                  height={104}
                />
              </Suspense>
            </div>
          </div>
          <span className="hdp-coach-name">Ted Lasso</span>
        </div>
        <div className="hdp-bubble hdp-bubble--comic">
          <div className="hdp-coach-kicker">
            <CoachIcon size={14} strokeWidth={2.6} className="hdp-coach-kicker-icon" />
            {coach.title}
          </div>
          {/* Every line sits in the same grid cell so the bubble is sized to the
              longest one and doesn't jump when cycling pep talks. */}
          <div className="hdp-quote-stack">
            {coach.lines.map((line, i) => {
              const active = i === lineIdx;
              const isLeaving = !active && leaving?.title === coach.title && leaving.idx === i;
              return (
                <p
                  key={active ? `on-${pepTalkIdx}` : isLeaving ? `out-${pepTalkIdx}` : `off-${i}`}
                  className={cn(
                    "hdp-coach-quote",
                    active && leaving && "hdp-coach-quote--after-cut",
                    isLeaving && "hdp-coach-quote--leave",
                    !active && !isLeaving && "hdp-coach-quote--ghost",
                  )}
                  aria-hidden={!active}
                >
                  <PepTalk line={line} />
                </p>
              );
            })}
          </div>
          <div className="hdp-pep-dots" aria-label={`Pep talk ${lineIdx + 1} of ${coach.lines.length}`}>
            {coach.lines.map((_, i) => (
              <span key={i} className={cn("hdp-pep-dot", i === lineIdx && "hdp-pep-dot--on")} />
            ))}
          </div>
          <button
            key={coach.series.quote}
            type="button"
            className="hdp-board-wrap"
            aria-pressed={boardFlipped}
            aria-label={boardFlipped ? "Show the quote" : "Flip for the plain-words meaning"}
            onClick={() => setBoardFlipped((f) => !f)}
          >
            <div className={cn("hdp-board-flip", boardFlipped && "is-flipped")}>
              <figure className="hdp-board">
                {/* faint X's-and-O's play drawn behind the quote */}
                <svg className="hdp-board-play" viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
                  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="34" cy="28" r="7" /><circle cx="62" cy="92" r="7" /><circle cx="250" cy="96" r="7" />
                    <path d="M226 20 l12 12 M238 20 l-12 12" /><path d="M268 44 l12 12 M280 44 l-12 12" />
                    <path d="M42 34 C 90 70, 150 20, 214 30" strokeDasharray="5 6" />
                    <path d="M207 24 l9 6 -9 6" />
                    <path d="M70 88 C 130 110, 190 110, 238 98" strokeDasharray="5 6" />
                  </g>
                </svg>
                <span className="hdp-board-smudge" aria-hidden />
                <RotateCw size={12} strokeWidth={2.4} className="hdp-board-hint" aria-hidden />
                <ChalkWriting key={coach.series.quote} text={`“${coach.series.quote}”`} />
                <figcaption className="hdp-board-by">— {coach.series.by}</figcaption>
                <span className="hdp-board-chalk" aria-hidden />
              </figure>
              <figure className="hdp-board hdp-board--back" aria-hidden={!boardFlipped}>
                <span className="hdp-board-smudge" aria-hidden />
                <span className="hdp-board-kicker">In plain words</span>
                <p className="hdp-board-meaning">{coach.series.plain}</p>
                <span className="hdp-board-chalk" aria-hidden />
              </figure>
            </div>
          </button>
          <button type="button" className="hdp-pep-btn" onClick={() => { setLeaving({ title: coach.title, idx: lineIdx }); setPepTalkIdx((i) => i + 1); }}>
            <Megaphone size={12} strokeWidth={2.6} /> Another pep talk
          </button>
        </div>
      </div>

      {/* ── 3. Calendar: month / year ───────────────────────────────────────── */}
      <div className="hdp-card hdp-chain" data-mode={calMode}>
        <div className="hdp-head">
          <div>
            <div className="hdp-title">Your chain</div>
          </div>
          <div className="hdp-seg" role="tablist">
            <button type="button" role="tab" data-active={calMode === "month"} onClick={() => setCalMode("month")}>Month</button>
            <button type="button" role="tab" data-active={calMode === "year"} onClick={() => setCalMode("year")}>Year</button>
          </div>
        </div>
        <div className="hdp-body hdp-chain-body">
            <div className="hdp-chain-month">
              <div className="hdp-cal-nav">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
                  onClick={() => setViewMonth((m) => subMonths(m, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="hdp-cal-title">{format(viewMonth, "MMMM yyyy")}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full"
                  disabled={startOfMonth(viewMonth) >= startOfMonth(new Date())}
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="hdp-cal-weekdays">
                {WEEKDAYS_SHORT.map((d, i) => (
                  <div key={i} className="hdp-cal-wd">{d}</div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {calendarWeeks.map((week, wi) => (
                  <div key={wi} className="hdp-cal-week">
                    {week.map((day, di) => {
                      if (!day) return <div key={di} className="hdp-cal-day" />;
                      const dateStr = format(day, "yyyy-MM-dd");
                      const isCompleted = completedDates.has(dateStr);
                      const isToday = dateStr === today;
                      const isFuture = dateStr > today;
                      const { inStreak, isStart, isEnd, isSingle } = getStreakPosition(dateStr);

                      return (
                        <div key={di} className="hdp-cal-day">
                          {inStreak && !isSingle && (
                            <div className={cn(
                              "hdp-cal-connector",
                              isStart && "rounded-l-full left-1/2 right-0",
                              isEnd && "rounded-r-full left-0 right-1/2",
                              !isStart && !isEnd && "left-0 right-0",
                            )} />
                          )}
                          <span className={cn(
                            "hdp-cal-dot",
                            isCompleted && "hdp-cal-dot--done",
                            isToday && !isCompleted && "hdp-cal-dot--today",
                            isFuture && "hdp-cal-dot--future",
                            !isCompleted && !isToday && !isFuture && "hdp-cal-dot--missed",
                          )}>
                            {day.getDate()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="hdp-month-rate">
                <span className="hdp-muted">{monthCompletions} of {pastDays.length} days in {format(viewMonth, "MMMM")}</span>
                <span className="hdp-month-rate-val">{monthRate}%</span>
              </div>
              <div className="hdp-track">
                <div className="hdp-fill" style={{ width: `${monthRate}%` }} />
              </div>
            </div>
            <div className="hdp-chain-year">
              <StreakGrid habitId={habit.id} completions={completions} />
            </div>
        </div>
      </div>

      {/* ── 4. Weekly rhythm ─────────────────────────────────────────────────── */}
      <div className="hdp-card hdp-rhythm">
        <div className="hdp-head">
          <div>
            <div className="hdp-title">Weekly rhythm</div>
          </div>
        </div>
        <div className="hdp-body">
          <div className="hdp-clock-row">
            <WeekDial rates={weeklyRates} bestIdx={bestDayIdx} />

            <div className="hdp-clock-facts">
              {bestDayIdx >= 0 ? (
                <>
                  <span className="hdp-daychip" title={`${WEEKDAYS_LONG[bestDayIdx]} are your power day`}
                    style={{ ["--chip" as string]: heatColor(weeklyRates[bestDayIdx] ?? 0) }}>
                    <span aria-hidden>💪</span> <strong>{WEEKDAYS[bestDayIdx]}</strong> {weeklyRates[bestDayIdx]}%
                  </span>
                  {worstDayIdx >= 0 && worstDayIdx !== bestDayIdx && (
                    <span className="hdp-daychip" title={`${WEEKDAYS_LONG[worstDayIdx]} slip most — win them and the streak takes care of itself`}
                      style={{ ["--chip" as string]: heatColor(weeklyRates[worstDayIdx] ?? 0) }}>
                      <span aria-hidden>🎯</span> <strong>{WEEKDAYS[worstDayIdx]}</strong> {weeklyRates[worstDayIdx]}%
                    </span>
                  )}
                </>
              ) : (
                <span className="hdp-muted">A few more check-ins…</span>
              )}
            </div>
          </div>

          {/* When in the day: 24-hour "sky" strip */}
          <div className="hdp-sky">
            {liveCheckins >= 3 ? (
              <>
                <div className="hdp-sky-head">
                  <span className="hdp-sky-type" title={chronotype(peakHour).tip}>
                    <span aria-hidden>{chronotype(peakHour).emoji}</span> {chronotype(peakHour).name}
                  </span>
                  <span className="hdp-muted">most check-ins around <strong className="hdp-sky-peak">{hourLabel(peakHour)}</strong></span>
                </div>
                <HourStrip counts={hourCounts} peak={peakHour} />
              </>
            ) : (
              <p className="hdp-muted">Check in a few more times and I'll show you your best time of day.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── 5. Momentum ─────────────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-head">
          <div>
            <div className="hdp-title">Momentum</div>
          </div>
          <span className={cn("hdp-badge", `hdp-badge--${momentumTrend}`)}>
            {momentumTrend === "up" && <><TrendingUp size={13} strokeWidth={2.6} /> {prev30Rate}% → {last30Rate}%</>}
            {momentumTrend === "down" && <><TrendingDown size={13} strokeWidth={2.6} /> {prev30Rate}% → {last30Rate}%</>}
            {momentumTrend === "flat" && <><Minus size={13} strokeWidth={2.6} /> Steady</>}
          </span>
        </div>
        <div className="hdp-body">
          <svg className="hdp-spark" viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} className="hdp-spark-grid" x1="0" x2={SW} y1={SH * f} y2={SH * f} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={sparkArea} fill={`url(#spark-${uid})`} />
            <path className="hdp-spark-line" d={sparkLine} vectorEffect="non-scaling-stroke" />
            {sparkLast && (
              <circle className="hdp-spark-dot" cx={sparkLast[0]} cy={sparkLast[1]} r="4.5" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
          <div className="hdp-spark-axis">
            <span className="hdp-muted">{format(subDays(new Date(), 59), "MMM d")}</span>
            <span className="hdp-muted">Today</span>
          </div>
          <div className="hdp-compare">
            <div className="hdp-compare-cell">
              <div className="hdp-compare-val">{last30Rate}%</div>
              <div className="hdp-compare-lbl">Last 30 days</div>
            </div>
            <div className="hdp-compare-cell">
              <div className="hdp-compare-val hdp-compare-val--dim">{prev30Rate}%</div>
              <div className="hdp-compare-lbl">Previous 30 days</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. Streak skyline ───────────────────────────────────────────────── */}
      <div className="hdp-card">
        <div className="hdp-head">
          <div>
            <div className="hdp-title">Streak skyline</div>
          </div>
        </div>
        <div className="hdp-body">
          {skyline.length > 0 && (
            <div className="hdp-skyline">
              {skyline.map((r) => {
                const isRecord = r.length === bestStreak && bestStreak > 1;
                const isLive = r.end === liveRunEnd;
                return (
                  <div
                    key={r.start}
                    className={cn("hdp-tower", isRecord && "hdp-tower--record", isLive && !isRecord && "hdp-tower--live")}
                    style={{ height: `${Math.max(6, (r.length / skylineMax) * 100)}%` }}
                    title={`${r.length} day${r.length === 1 ? "" : "s"} · ${format(parseISO(r.start), "MMM d")} – ${format(parseISO(r.end), "MMM d")}`}
                  >
                    {isRecord && <Crown size={12} strokeWidth={2.4} className="hdp-tower-crown" fill="currentColor" fillOpacity={0.25} />}
                  </div>
                );
              })}
            </div>
          )}
          <div className="hdp-sky-facts">
            <div>
              <div className="hdp-sky-val">{bestStreak > 0 ? `${bestStreak}d` : "—"}</div>
              <div className="hdp-sky-lbl">Record</div>
            </div>
            <div>
              <div className="hdp-sky-val">{longestGap > 0 ? `${longestGap}d` : "None"}</div>
              <div className="hdp-sky-lbl">Longest gap</div>
            </div>
            <div>
              <div className="hdp-sky-val">
                {daysSinceLast === 0 ? "Today" : daysSinceLast === 1 ? "Yesterday" : `${daysSinceLast}d ago`}
              </div>
              <div className="hdp-sky-lbl">Last done</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 7. Projection ───────────────────────────────────────────────────── */}
      <div className="hdp-card hdp-proj">
        <div className="hdp-head">
          <div>
            <div className="hdp-title">Your {year}</div>
          </div>
        </div>
        <div className="hdp-body">
          <div className="hdp-proj-kicker">On pace for</div>
          <div className="hdp-proj-big">
            <span className="hdp-proj-num">{projectedAnnual}</span>
            <span className="hdp-proj-unit">days this year</span>
          </div>

          <div className="hdp-proj-bar">
            <div className="hdp-proj-ghost" style={{ width: `${projFrac * 100}%` }} />
            <div className="hdp-proj-done" style={{ width: `${doneFrac * 100}%` }} />
          </div>
          <div className="hdp-proj-legend">
            <span className="hdp-muted"><strong>{yearCompletions}</strong> done</span>
            <span className="hdp-muted">{daysRemaining} days left to write</span>
          </div>

          {daysRemaining > 0 && (
            <div className="hdp-cta">
              <Target size={18} strokeWidth={2.4} className="hdp-cta-icon" />
              <span className="hdp-cta-text">
                {showStretch ? (
                  <>Add just <strong>{extraPerWeek < 1 ? "1 day" : `${extraPerWeek.toFixed(1)} days`}</strong> a week and you'll hit <strong>{stretchTarget}</strong> instead.</>
                ) : (
                  <>Never miss again and you'll finish at <strong>{maxPossible}</strong>.</>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
