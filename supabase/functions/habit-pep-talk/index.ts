import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }   from "../_shared/cors.ts";
import { llm, LLM_MODEL } from "../_shared/llm.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

// ─── Pep talk contract ──────────────────────────────────────────────────────────
// Input:  { habitName: string, situation: Situation, facts: Facts }
// Output: { lines: string[] }   (3–4 lines; empty on any failure)
//
// The situation and every number are computed client-side from the user's own
// completions — the AI only writes the words, and may only cite those numbers.
// An empty result makes the client fall back to its built-in lines.

const SITUATIONS = [
  "at_risk", "comeback", "personal_best", "gone_quiet", "momentum_up", "momentum_down", "steady", "new",
] as const;
type Situation = typeof SITUATIONS[number];

const SITUATION_BRIEF: Record<Situation, string> = {
  at_risk:       "They have a live streak but haven't checked in today yet. Urge them to do it today, even a tiny version.",
  comeback:      "They broke their streak for 3+ days and are now back on a new streak. Celebrate the return, no guilt about the miss.",
  personal_best: "Their current streak is their longest ever. Every day now is a new record.",
  gone_quiet:    "They haven't done this habit in a week or more (see days_since_last_check_in). Don't talk about weekdays or rates. Reach out like Ted checking on a player who's stopped showing up to practice: no guilt, genuinely glad to see them, make restarting today feel tiny and easy.",
  momentum_up:   "Their last-30-day completion rate is clearly up versus the 30 days before.",
  momentum_down: "Their last-30-day rate dropped. Be kind, no blame, and point at their weakest weekday as the one small fix.",
  steady:        "Nothing dramatic. Reinforce who they're becoming, using their best weekday and show-up rate.",
  new:           "They've barely started (little or no history). Welcome them and make day one feel easy.",
};

const SYSTEM_PROMPT = `You ARE Ted Lasso, coach of AFC Richmond, giving a pep talk to someone working on a habit. Talk exactly like him:
How Ted talks:
- He almost never opens with a stat. He opens with something off-the-wall: a weird analogy, a story about his mama, a BBQ joint back in Kansas City, a movie (Rocky, Star Wars, Top Gun, Lord of the Rings), a pun, or confusion about British stuff (tea tastes like hot brown water, "football" vs soccer, the offside rule).
- Then it swerves into something sincere and surprisingly wise, delivered gently.
- Similes stacked a little too far: "happier than a puppy in a pile of laundry", "busier than a one-legged man at a butt-kickin' contest", "I feel like a kid on Christmas mornin' who just found out Santa's real AND he likes me".
- Kansas drawl on the page: "y'all", "ain't", "fixin' to", "shoot", "golly", "dang", dropped g's ("showin' up", "gettin'").
- Self-deprecating ("I'm about as graceful as a baby giraffe on roller skates"), playful pep ("Smells like potential!"), mentions Coach Beard, Rebecca, Nate, Roy Kent, the Diamond Dogs, biscuits with the boss, the BELIEVE sign.
- Signature philosophy: be a goldfish (forget the miss), be curious not judgmental, "I believe in hope, I believe in Believe", "taking on a challenge is a lot like riding a horse", winning isn't the point, the person is.
- He calls folks "partner", "buddy", "friend", "hoss", "champ".

Examples of the voice (don't reuse them, write new ones like them):
- "You know what my mama used to say? Take a mental picture of the moment you almost quit. Then go do it anyway, 'cause that's a picture worth framin'. **5 days** in, partner. Smile for the camera."
- "Coach Beard says momentum's like a shopping cart with one wonky wheel. Hard to start, harder to stop. You're rollin' at **82%** now. Don't you dare let go of the handle."
- "Missed a few days? Shoot. Be a goldfish, buddy. Ten-second memory, happiest critter on Earth. The scoreboard only cares about today, and today's still wide open."

Write 4 short pep talks for ONE habit, each a different angle on the situation you're given. Make each one feel like a different Ted moment: one goofy analogy, one story or reference, one sincere heart-to-heart, one fired-up halftime pep.

Rules:
- Each pep talk: 3–4 short sentences, max 50 words total. One idea, one tiny action.
- At most ONE number per pep talk, and at least one of the four should have no number at all. Feelings first, stats second.
- Wrap the one or two most important facts in **double asterisks**, each 1–4 words (e.g. **12 days**). Never bold a whole sentence. No other markdown, no emoji.
- The LAST sentence of each is the punchline. Make it land.
- Only use numbers from the facts you're given, exactly as given. Never invent numbers, dates or history.
- To mention how much time is left today, write the literal token {time_left} (the app fills in and highlights the live countdown). Never put {time_left} inside asterisks. Don't write a time yourself.
- Talk about the habit by name naturally, but don't put its name in every line.
- Never shame, never guilt. A miss is information, not a verdict.

Respond ONLY with valid JSON, no markdown, no preamble:
{"lines": ["...", "...", "...", "..."]}`;

const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
const str = (v: unknown, max: number) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

// Keep only the facts we expect, clamped, so the prompt can't be stuffed.
function cleanFacts(raw: unknown) {
  const f = (raw ?? {}) as Record<string, unknown>;
  const facts: Record<string, string | number | boolean> = {};
  const put = (k: string, v: string | number | boolean | null) => { if (v !== null) facts[k] = v; };
  put("current_streak_days", num(f.currentStreak, 0, 100000));
  put("best_streak_days",    num(f.bestStreak, 0, 100000));
  put("done_today",          typeof f.doneToday === "boolean" ? f.doneToday : null);
  put("last_30_day_rate_pct", num(f.last30Rate, 0, 100));
  put("prev_30_day_rate_pct", num(f.prev30Rate, 0, 100));
  put("show_up_rate_pct",    num(f.showUpRate, 0, 100));
  put("total_days_done",     num(f.totalDone, 0, 100000));
  put("days_since_last_check_in", num(f.daysSinceLast, 0, 100000));
  put("best_weekday",        str(f.bestDay, 12));
  put("best_weekday_rate_pct", num(f.bestDayRate, 0, 100));
  put("weakest_weekday",     str(f.worstDay, 12));
  return facts;
}

// Strip ```json … ``` fences some models wrap JSON in, then parse.
function parseLines(raw: string): string[] {
  try {
    const cleaned = raw
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { lines?: unknown };
    if (!Array.isArray(parsed.lines)) return [];
    return parsed.lines
      .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      // Hard cap so a misbehaving model can't write an essay
      .map((l) => l.trim().slice(0, 360))
      .slice(0, 4);
  } catch {
    return [];
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // 1. Authenticate — same pattern as generate-insights.
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return Response.json(
        { error: "Missing Authorization header" },
        { status: 401, headers: corsHeaders(origin) }
      );
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth:   { persistSession: false },
    });

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders(origin) }
      );
    }

    // 2. Read + validate input
    let body: unknown = null;
    try { body = await req.json(); } catch { /* not JSON */ }
    const b = (body ?? {}) as { habitName?: unknown; situation?: unknown; facts?: unknown };
    const habitName = str(b.habitName, 120);
    const situation = SITUATIONS.includes(b.situation as Situation) ? b.situation as Situation : null;
    if (!habitName || !situation) {
      return Response.json(
        { error: "habitName and a valid situation are required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    const userPrompt = JSON.stringify({
      habit: habitName,
      situation: SITUATION_BRIEF[situation],
      facts: cleanFacts(b.facts),
    });

    // 3. One LLM round-trip. On failure return empty lines with 200 — the
    //    client falls back to its built-in pep talks.
    try {
      const completion = await llm.chat.completions.create({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 1.1,
      });

      const rawContent = completion.choices[0]?.message?.content ?? "{}";
      return Response.json({ lines: parseLines(rawContent) }, { headers: corsHeaders(origin) });
    } catch (llmErr) {
      console.error("habit-pep-talk LLM error:", llmErr);
      return Response.json({ lines: [] }, { headers: corsHeaders(origin) });
    }

  } catch (err) {
    console.error("habit-pep-talk unhandled error:", err);
    return Response.json({ lines: [] }, { headers: corsHeaders(origin) });
  }
});
