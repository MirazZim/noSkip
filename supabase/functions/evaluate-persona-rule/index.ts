import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }   from "../_shared/cors.ts";
import { openrouter, OPENROUTER_MODEL } from "../_shared/openrouter.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

// ─── Coach reaction contract ────────────────────────────────────────────────────
// Input:  { ruleText: string }
// Output: { flag_level: "healthy" | "caution" | "none", coach_note: string }
//
// "none" is only ever returned on an LLM/parse failure — the rule still saves
// client-side. The coach advises, it never gates rule creation.

type FlagLevel = "healthy" | "caution" | "none";

const SYSTEM_PROMPT = `You evaluate a single self-improvement "persona rule" a user wants to track daily as a streak. Your job is to give ONE short, direct reaction (max 20 words) and classify the rule.

A streak mechanic amplifies whatever rule it's pointed at. So reward rules that build healthy identity, and gently flag rules that — practiced absolutely, every day, with a streak punishing deviation — could cause harm.

Classify as "caution" if the rule involves:
- Food/calorie restriction or any eating rule ("never eat carbs", "skip meals")
- Social isolation or cutting off contact ("never talk to anyone about my feelings", "never reach out first")
- Emotional suppression framed as absolute ("never feel sad", "never show weakness ever")
- Self-punishment or self-criticism ("never allow myself to rest", "never forgive my mistakes")
- Total concealment that erodes trust ("trust no one", "never let anyone close")

Classify as "healthy" otherwise — especially rules framed around action, regulation, or skill ("stay in control when provoked", "say the true thing kindly", "finish what I start").

Tone: calm, direct, a sharp coach — not a therapist, not a cheerleader. For healthy rules, affirm briefly. For caution rules, name the risk in one line and offer a reframe, but DO NOT block — the user can keep their rule.

Respond ONLY with valid JSON, no markdown, no preamble:
{"flag_level": "healthy" | "caution", "coach_note": "<your one line>"}`;

// Strip ```json … ``` fences some models wrap JSON in, then parse.
function parseReaction(raw: string): { flag_level: FlagLevel; coach_note: string } {
  const fallback = { flag_level: "none" as FlagLevel, coach_note: "" };
  try {
    const cleaned = raw
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const flag = parsed.flag_level;
    const note = parsed.coach_note;
    if ((flag !== "healthy" && flag !== "caution") || typeof note !== "string") {
      return fallback;
    }
    // Hard cap so a misbehaving model can't store an essay
    return { flag_level: flag, coach_note: note.trim().slice(0, 280) };
  } catch {
    return fallback;
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
    const ruleText = (body as { ruleText?: unknown })?.ruleText;
    if (typeof ruleText !== "string" || ruleText.trim().length === 0) {
      return Response.json(
        { error: "ruleText is required" },
        { status: 400, headers: corsHeaders(origin) }
      );
    }

    // 3. One LLM round-trip. On ANY failure we return a 'none' reaction with 200
    //    so the client always saves the rule — the coach never blocks creation.
    try {
      const completion = await openrouter.chat.completions.create({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: ruleText.trim().slice(0, 500) },
        ],
        response_format: { type: "json_object" },
      });

      const rawContent = completion.choices[0]?.message?.content ?? "{}";
      const reaction   = parseReaction(rawContent);
      return Response.json(reaction, { headers: corsHeaders(origin) });
    } catch (llmErr) {
      console.error("evaluate-persona-rule LLM error:", llmErr);
      return Response.json(
        { flag_level: "none", coach_note: "" },
        { headers: corsHeaders(origin) }
      );
    }

  } catch (err) {
    console.error("evaluate-persona-rule unhandled error:", err);
    // Even on an unexpected error, hand back a safe reaction (never a 5xx that
    // would tempt the client to block the save).
    return Response.json(
      { flag_level: "none", coach_note: "" },
      { headers: corsHeaders(origin) }
    );
  }
});
