import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { llm, LLM_MODEL } from "../_shared/llm.ts";
import { cleanEmailText, parseSms, type ParsedSms } from "../_shared/smsParser.ts";
import {
  EXPENSE_CATEGORY_LABELS, FALLBACK_CATEGORY, defaultCategoryFor, isKnownCategory,
} from "../_shared/merchantCategories.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────
// Deployed with --no-verify-jwt: the phone has no Supabase session, so it
// authenticates with SMS_INGEST_SECRET instead. The in-app "Paste SMS" path
// still sends a user JWT, which is verified here.

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_SECRET    = Deno.env.get("SMS_INGEST_SECRET") ?? "";
const INGEST_USER_ID   = Deno.env.get("SMS_INGEST_USER_ID") ?? "";

const MAX_SMS_CHARS   = 1000;
const MAX_EMAIL_CHARS = 8000;  // raw subject + body; cleaned down to the alert itself
const AI_TIMEOUT_MS   = 4000;
const TWIN_WINDOW_MS  = 30 * 60_000;
const MAX_BACKDATE_MS = 60 * 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;

// ─── Contract ─────────────────────────────────────────────────────────────────
// Input : { text: string, sender?: string, source?: "sms" | "email" }   (also accepts a text/plain body)
//         source "email" = a bank alert email (subject + plain body) from the Gmail Apps Script
// Output: { status, message, ... } — `message` is one human line the iPhone
//         Shortcut can show as a notification.
//
// status: confirmed  expense filed by a trusted merchant rule
//         pending    expense filed, waiting for a tap in the confirm dialog
//         review     needs a decision in the app (credit, unclear, foreign currency)
//         ignored    a merchant rule says to ignore this counterparty
//         duplicate  already received (another automation fired for the same SMS), or the
//                    same payment already came in by the other channel (SMS ↔ email)
//         skipped    not a transaction (OTP, promo) — nothing stored

type IngestStatus = "confirmed" | "pending" | "review" | "ignored" | "duplicate" | "skipped";

interface MerchantRule {
  id: string;
  pattern: string;
  label: string | null;
  category: string;
  action: "categorize" | "ignore";
  confirm_count: number;
  auto_confirm: boolean;
  always_ask: boolean;
}

const MAX_AI_EXAMPLES = 15;

const PROVIDER_LABELS: Record<string, string> = {
  bkash: "bKash", nagad: "Nagad", pathao_pay: "Pathao Pay", rocket: "Rocket", upay: "Upay", card: "Card",
  city_bank: "City Bank",
};

const KIND_LABELS: Record<string, string> = {
  send_money: "Send Money", cash_out: "Cash Out", recharge: "Recharge", bill: "Bill payment",
  transfer: "Transfer", received: "Received", cash_in: "Cash In", add_money: "Add Money", refund: "Refund",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function tk(n: number): string {
  return `Tk ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function dhakaDateString(d: Date): string {
  return new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

// The SMS's own timestamp, when it's plausible; otherwise "now". Pasted
// old SMS keep their date, a mis-parsed date can't land in the future.
// A date-only SMS for today was just forwarded, so arrival time is the real time.
function resolveTxnAt(parsed: ParsedSms): Date {
  const now = Date.now();
  if (parsed.txnAt && !parsed.txnHasTime && dhakaDateString(parsed.txnAt) === dhakaDateString(new Date(now))) {
    return new Date(now);
  }
  const t = parsed.txnAt?.getTime();
  if (t && t <= now + 10 * 60_000 && t >= now - MAX_BACKDATE_MS) return parsed.txnAt!;
  return new Date(now);
}

function matchRule(rules: MerchantRule[], merchantKey: string | null): MerchantRule | null {
  if (!merchantKey) return null;
  let best: MerchantRule | null = null;
  for (const r of rules) {
    if (merchantKey.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

// The user's own confirmed merchants, most-confirmed first, as examples of how
// *they* file things. People are left out (no names to Google, and they say
// nothing about shops).
function aiExamples(rules: MerchantRule[]): Array<{ merchant: string; category: string }> {
  return rules
    .filter((r) => r.action === "categorize" && !r.always_ask && r.confirm_count > 0)
    .sort((a, b) => b.confirm_count - a.confirm_count)
    .slice(0, MAX_AI_EXAMPLES)
    .map((r) => ({ merchant: (r.label ?? r.pattern).slice(0, 40), category: r.category.slice(0, 40) }));
}

function dhakaTimeOfDay(d: Date): string {
  const h = new Date(d.getTime() + DHAKA_OFFSET_MS).getUTCHours();
  return h < 5 ? "late night" : h < 11 ? "morning" : h < 15 ? "midday" : h < 18 ? "afternoon" : h < 22 ? "evening" : "late night";
}

async function aiGuessCategory(
  merchant: string,
  ctx: { amount: number; kind: string; txnAt: Date; rules: MerchantRule[] },
): Promise<string | null> {
  const examples = aiExamples(ctx.rules);
  // Custom categories the user has confirmed are valid answers too
  const allowed = new Set(examples.map((e) => e.category));
  try {
    const completion = await llm.chat.completions.create(
      {
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You categorize a Bangladeshi card / mobile-wallet payment. " +
              "Pick the single most likely category id from this list:\n" +
              Object.entries(EXPENSE_CATEGORY_LABELS).map(([id, label]) => `${id} — ${label}`).join("\n") +
              "\nYou also get how this user filed other merchants. Their choices beat general knowledge: " +
              "if a similar merchant is in their examples, follow it, and you may answer with one of their " +
              "own categories. Use the amount and time of day as a tiebreaker (a small midday payment is " +
              'more likely a meal than a large one). If nothing gives a real clue, answer "other:uncategorized". ' +
              'Respond ONLY with JSON: {"category": "<id>"}',
          },
          {
            role: "user",
            content: JSON.stringify({
              merchant: merchant.slice(0, 80),
              amount_bdt: ctx.amount,
              payment_type: KIND_LABELS[ctx.kind] ?? ctx.kind,
              time_of_day: dhakaTimeOfDay(ctx.txnAt),
              this_users_past_choices: examples,
            }),
          },
        ],
        response_format: { type: "json_object" },
      },
      { timeout: AI_TIMEOUT_MS, maxRetries: 0 },
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const category = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, ""))?.category;
    return typeof category === "string" && (isKnownCategory(category) || allowed.has(category)) ? category : null;
  } catch (err) {
    console.error("ingest-sms AI guess failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function resolveUserId(req: Request): Promise<string | null> {
  const key = req.headers.get("x-noskip-key");
  if (key !== null) {
    if (INGEST_SECRET.length < 16 || !INGEST_USER_ID) return null;
    return timingSafeEqual(key.trim(), INGEST_SECRET) ? INGEST_USER_ID : null;
  }

  const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  return user?.id ?? null;
}

type Source = "sms" | "email";

async function readBody(req: Request): Promise<{ text: string; sender: string | null; source: Source }> {
  const raw = await req.text();
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const text = [body.text, body.message, body.body, body.content].find((v) => typeof v === "string");
    const sender = typeof body.sender === "string" ? body.sender.slice(0, 200) : null;
    return { text: (text as string | undefined) ?? "", sender, source: body.source === "email" ? "email" : "sms" };
  } catch {
    return { text: raw, sender: null, source: "sms" };
  }
}

// ─── SMS ↔ email twins ────────────────────────────────────────────────────────
// A card payment can arrive as an SMS *and* an email. They share the amount and
// the day (City Bank SMS carry no time), and the card when both name it. The
// closest unpaired message from the other channel is the twin.

interface Twin {
  id: string;
  merchant: string | null;
  card_last4: string | null;
  txn_at: string;
  expense_id: string | null;
}

type Admin = ReturnType<typeof createClient>;

async function findTwin(
  admin: Admin,
  userId: string,
  p: { source: Source; amount: number; direction: string; txnAt: Date; cardLast4: string | null },
): Promise<Twin | null> {
  const t = p.txnAt.getTime();
  const dayStart = Date.parse(`${dhakaDateString(p.txnAt)}T00:00:00Z`) - DHAKA_OFFSET_MS;
  const from = new Date(Math.min(dayStart, t - TWIN_WINDOW_MS)).toISOString();
  const to = new Date(Math.max(dayStart + 86_400_000 - 1, t + TWIN_WINDOW_MS)).toISOString();

  const { data, error } = await admin
    .from("sms_messages")
    .select("id, merchant, card_last4, txn_at, expense_id")
    .eq("user_id", userId)
    .eq("amount", p.amount)
    .eq("direction", p.direction)
    .neq("source", p.source)
    .neq("status", "duplicate")
    .gte("txn_at", from)
    .lte("txn_at", to)
    .limit(20);
  if (error) throw error;
  const candidates = ((data ?? []) as Twin[])
    .filter((c) => !c.card_last4 || !p.cardLast4 || c.card_last4 === p.cardLast4);
  if (!candidates.length) return null;

  // One twin each: skip messages another one already matched
  const { data: taken, error: takenErr } = await admin
    .from("sms_messages")
    .select("duplicate_of")
    .in("duplicate_of", candidates.map((c) => c.id));
  if (takenErr) throw takenErr;
  const used = new Set((taken ?? []).map((r: { duplicate_of: string }) => r.duplicate_of));
  return candidates
    .filter((c) => !used.has(c.id))
    .sort((a, b) => Math.abs(Date.parse(a.txn_at) - t) - Math.abs(Date.parse(b.txn_at) - t))[0] ?? null;
}

// ─── Category + note ──────────────────────────────────────────────────────────

async function chooseCategory(
  parsed: ParsedSms,
  rule: MerchantRule | null,
  ctx: { amount: number; txnAt: Date; rules: MerchantRule[] },
): Promise<{ category: string; confirmed: boolean; source: "rule" | "default" | "ai" | "fallback" }> {
  if (rule) {
    // May be a custom category (stored by name) — the user confirmed it, trust it
    return { category: rule.category, confirmed: rule.auto_confirm && !rule.always_ask, source: "rule" };
  }
  const fromDefaults = defaultCategoryFor(parsed.merchantKey, parsed.kind);
  const fromAi = !fromDefaults && parsed.merchant && !parsed.isPerson
    ? await aiGuessCategory(parsed.merchant, { amount: ctx.amount, kind: parsed.kind, txnAt: ctx.txnAt, rules: ctx.rules })
    : null;
  return {
    category: fromDefaults ?? fromAi ?? FALLBACK_CATEGORY,
    confirmed: false,
    source: fromDefaults ? "default" : fromAi ? "ai" : "fallback",
  };
}

function buildNote(parsed: ParsedSms, who: string): string {
  const providerLabel = PROVIDER_LABELS[parsed.provider] ?? parsed.provider;
  // Some bank SMS name no merchant ("CITYTOUCH TXN … Withdrawal") — don't repeat the bank
  return [
    who,
    who !== providerLabel ? providerLabel : null,
    parsed.fee > 0 ? `incl. fee ${tk(parsed.fee)}` : null,
  ].filter(Boolean).join(" · ").slice(0, 200);
}

/**
 * The twin came first but didn't know the merchant (City Bank card SMS never do).
 * Give its row the merchant, and its still-pending expense a proper note — and a
 * category, if it had only been filed under the fallback.
 */
async function enrichTwin(
  admin: Admin,
  twin: Twin,
  parsed: ParsedSms,
  rule: MerchantRule | null,
  ctx: { amount: number; txnAt: Date; rules: MerchantRule[] },
): Promise<boolean> {
  if (twin.merchant || !parsed.merchant) return false;
  const { error: smsErr } = await admin
    .from("sms_messages")
    .update({ merchant: parsed.merchant, merchant_key: parsed.merchantKey, card_last4: twin.card_last4 ?? parsed.cardLast4 })
    .eq("id", twin.id);
  if (smsErr) throw smsErr;
  if (!twin.expense_id) return true;

  const { data: exp, error: expErr } = await admin
    .from("expenses")
    .select("id, category, review_status")
    .eq("id", twin.expense_id)
    .maybeSingle();
  if (expErr) throw expErr;
  // Never touch what the user already confirmed
  if (!exp || exp.review_status !== "pending") return true;

  const update: Record<string, unknown> = { note: buildNote(parsed, parsed.merchant) };
  if (exp.category === FALLBACK_CATEGORY) {
    const chosen = await chooseCategory(parsed, rule, ctx);
    update.category = chosen.category;
    if (chosen.confirmed) update.review_status = "confirmed";
  }
  const { error: updErr } = await admin.from("expenses").update(update).eq("id", exp.id);
  if (updErr) throw updErr;
  return true;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);
  const reply = (status: number, body: Record<string, unknown>) =>
    Response.json(body, { status, headers });

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const userId = await resolveUserId(req);
    if (!userId) return reply(401, { error: "Unauthorized", message: "NoSkip: wrong key" });

    const { text, sender, source } = await readBody(req);
    if (source === "email" && text.length > MAX_EMAIL_CHARS) return reply(413, { error: "Email too long" });
    // An email is cut down to the alert itself (no footer, links or blank runs) so it reads like an SMS
    const trimmed = (source === "email" ? cleanEmailText(text) : text).trim();
    if (!trimmed) return reply(400, { error: "text is required", message: "NoSkip: empty SMS" });
    if (trimmed.length > MAX_SMS_CHARS) return reply(413, { error: source === "email" ? "Email too long" : "SMS too long" });

    // 1. Parse. OTPs and promos are dropped here and never stored.
    const parsed = parseSms(trimmed, sender);
    if (!parsed.isTransaction) {
      return reply(200, {
        status: "skipped" satisfies IngestStatus,
        reason: parsed.skipReason,
        message: "NoSkip: not a transaction, skipped",
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 2. Rules decide ignore / category / auto-confirm
    const { data: rulesData, error: rulesErr } = await admin
      .from("merchant_rules")
      .select("id, pattern, label, category, action, confirm_count, auto_confirm, always_ask")
      .eq("user_id", userId);
    if (rulesErr) throw rulesErr;
    const rules = (rulesData ?? []) as MerchantRule[];
    const rule = matchRule(rules, parsed.merchantKey);

    const amount = parsed.amount!;
    const who = parsed.merchant ?? KIND_LABELS[parsed.kind] ?? PROVIDER_LABELS[parsed.provider] ?? "payment";
    const txnAt = resolveTxnAt(parsed);

    let smsStatus: "expense" | "review" | "ignored";
    if (rule?.action === "ignore") smsStatus = "ignored";
    else if (parsed.direction === "debit" && parsed.currency === "BDT") smsStatus = "expense";
    else smsStatus = "review";

    // 3. Same payment already in from the other channel (SMS ↔ email)? Then this
    //    one is only kept as a record, and may fill in the merchant the first lacked.
    const twin = await findTwin(admin, userId, {
      source, amount, direction: parsed.direction, txnAt, cardLast4: parsed.cardLast4,
    });

    // 4. Store the message. The unique indexes on (user_id, trx_id) and
    //    (user_id, dedup_hash) turn repeat automations into a 23505.
    const dedupHash = await sha256Hex(trimmed.toLowerCase().replace(/\s+/g, " "));
    const { data: sms, error: smsErr } = await admin
      .from("sms_messages")
      .insert({
        user_id: userId,
        raw_text: trimmed,
        sender,
        source,
        card_last4: parsed.cardLast4,
        duplicate_of: twin?.id ?? null,
        provider: parsed.provider,
        kind: parsed.kind,
        direction: parsed.direction,
        amount,
        currency: parsed.currency,
        fee: parsed.fee,
        merchant: parsed.merchant,
        merchant_key: parsed.merchantKey,
        is_person: parsed.isPerson,
        trx_id: parsed.trxId,
        balance: parsed.balance,
        txn_at: txnAt.toISOString(),
        dedup_hash: dedupHash,
        status: twin ? "duplicate" : smsStatus,
      })
      .select("id")
      .single();

    if (smsErr) {
      if (smsErr.code === "23505") {
        return reply(200, { status: "duplicate" satisfies IngestStatus, message: "NoSkip: already recorded" });
      }
      throw smsErr;
    }

    if (twin) {
      const enriched = await enrichTwin(admin, twin, parsed, rule, { amount, txnAt, rules });
      const other = source === "email" ? "SMS" : "email";
      return reply(200, {
        status: "duplicate" satisfies IngestStatus,
        sms_id: sms.id,
        duplicate_of: twin.id,
        message: enriched
          ? `NoSkip: ${tk(amount)} matched the ${other} you already have, added ${parsed.merchant}`
          : `NoSkip: ${tk(amount)} already came in by ${other}`,
      });
    }

    if (smsStatus === "ignored") {
      return reply(200, { status: "ignored" satisfies IngestStatus, message: `NoSkip: ignored ${who} (your rule)` });
    }

    if (smsStatus === "review") {
      const what = parsed.direction === "credit"
        ? `${parsed.currency === "BDT" ? tk(amount) : `${parsed.currency} ${amount}`} received from ${who}`
        : `${parsed.currency} ${amount} at ${who}`;
      return reply(200, {
        status: "review" satisfies IngestStatus,
        sms_id: sms.id,
        message: `NoSkip: ${what}. Review it in the app.`,
      });
    }

    // 5. Category: my rule → built-in merchant list → AI guess → Other
    const { category, confirmed, source: categorySource } = await chooseCategory(parsed, rule, { amount, txnAt, rules });

    // Fee included — that's what actually left the account
    const total = Math.round((amount + parsed.fee) * 100) / 100;
    const note = buildNote(parsed, who);

    const { data: expense, error: expErr } = await admin
      .from("expenses")
      .insert({
        user_id: userId,
        amount: total,
        category,
        date: dhakaDateString(txnAt),
        note,
        origin: "sms",
        review_status: confirmed ? "confirmed" : "pending",
        sms_message_id: sms.id,
      })
      .select("id")
      .single();

    if (expErr) {
      // Keep the SMS reviewable rather than losing it
      await admin.from("sms_messages").update({ status: "review" }).eq("id", sms.id);
      throw expErr;
    }
    await admin.from("sms_messages").update({ expense_id: expense.id }).eq("id", sms.id);

    const label = EXPENSE_CATEGORY_LABELS[category] ?? category;
    return reply(200, {
      status: (confirmed ? "confirmed" : "pending") satisfies IngestStatus,
      expense_id: expense.id,
      category,
      category_source: categorySource,
      message: confirmed
        ? `NoSkip: ${tk(total)} · ${who} → ${label}`
        : `NoSkip: ${tk(total)} · ${who} → ${label}? Tap to confirm in the app.`,
    });
  } catch (err) {
    // Never log the SMS body — it carries balances and account digits
    console.error("ingest-sms error:", err instanceof Error ? err.message : JSON.stringify(err));
    return reply(500, { error: "Internal error", message: "NoSkip: couldn't save this SMS" });
  }
});

