import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { llm, LLM_MODEL } from "../_shared/llm.ts";
import { parseSms, type ParsedSms } from "../_shared/smsParser.ts";
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
const AI_TIMEOUT_MS   = 4000;
const MAX_BACKDATE_MS = 60 * 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000;

// ─── Contract ─────────────────────────────────────────────────────────────────
// Input : { text: string, sender?: string }   (also accepts a text/plain body)
// Output: { status, message, ... } — `message` is one human line the iPhone
//         Shortcut can show as a notification.
//
// status: confirmed  expense filed by a trusted merchant rule
//         pending    expense filed, waiting for a tap in the confirm dialog
//         review     needs a decision in the app (credit, unclear, foreign currency)
//         ignored    a merchant rule says to ignore this counterparty
//         duplicate  already received (another automation fired for the same SMS)
//         skipped    not a transaction (OTP, promo) — nothing stored

type IngestStatus = "confirmed" | "pending" | "review" | "ignored" | "duplicate" | "skipped";

interface MerchantRule {
  id: string;
  pattern: string;
  category: string;
  action: "categorize" | "ignore";
  auto_confirm: boolean;
  always_ask: boolean;
}

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
function resolveTxnAt(parsed: ParsedSms): Date {
  const now = Date.now();
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

async function aiGuessCategory(merchant: string): Promise<string | null> {
  try {
    const completion = await llm.chat.completions.create(
      {
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You categorize a Bangladeshi card / mobile-wallet payment from the merchant name alone. " +
              "Pick the single most likely category id from this list:\n" +
              Object.entries(EXPENSE_CATEGORY_LABELS).map(([id, label]) => `${id} — ${label}`).join("\n") +
              '\nIf the name gives no real clue, answer "other:uncategorized". ' +
              'Respond ONLY with JSON: {"category": "<id>"}',
          },
          { role: "user", content: merchant.slice(0, 80) },
        ],
        response_format: { type: "json_object" },
      },
      { timeout: AI_TIMEOUT_MS, maxRetries: 0 },
    );
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const category = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/gi, ""))?.category;
    return typeof category === "string" && isKnownCategory(category) ? category : null;
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

async function readBody(req: Request): Promise<{ text: string; sender: string | null }> {
  const raw = await req.text();
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const text = [body.text, body.message, body.body, body.content].find((v) => typeof v === "string");
    const sender = typeof body.sender === "string" ? body.sender : null;
    return { text: (text as string | undefined) ?? "", sender };
  } catch {
    return { text: raw, sender: null };
  }
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

    const { text, sender } = await readBody(req);
    const trimmed = text.trim();
    if (!trimmed) return reply(400, { error: "text is required", message: "NoSkip: empty SMS" });
    if (trimmed.length > MAX_SMS_CHARS) return reply(413, { error: "SMS too long" });

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
      .select("id, pattern, category, action, auto_confirm, always_ask")
      .eq("user_id", userId);
    if (rulesErr) throw rulesErr;
    const rule = matchRule((rulesData ?? []) as MerchantRule[], parsed.merchantKey);

    const amount = parsed.amount!;
    const who = parsed.merchant ?? KIND_LABELS[parsed.kind] ?? PROVIDER_LABELS[parsed.provider] ?? "payment";
    const txnAt = resolveTxnAt(parsed);

    let smsStatus: "expense" | "review" | "ignored";
    if (rule?.action === "ignore") smsStatus = "ignored";
    else if (parsed.direction === "debit" && parsed.currency === "BDT") smsStatus = "expense";
    else smsStatus = "review";

    // 3. Store the SMS. The unique indexes on (user_id, trx_id) and
    //    (user_id, dedup_hash) turn repeat automations into a 23505.
    const dedupHash = await sha256Hex(trimmed.toLowerCase().replace(/\s+/g, " "));
    const { data: sms, error: smsErr } = await admin
      .from("sms_messages")
      .insert({
        user_id: userId,
        raw_text: trimmed,
        sender,
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
        status: smsStatus,
      })
      .select("id")
      .single();

    if (smsErr) {
      if (smsErr.code === "23505") {
        return reply(200, { status: "duplicate" satisfies IngestStatus, message: "NoSkip: already recorded" });
      }
      throw smsErr;
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

    // 4. Category: my rule → built-in merchant list → AI guess → Other
    let category: string;
    let confirmed = false;
    let categorySource: "rule" | "default" | "ai" | "fallback";
    if (rule) {
      // May be a custom category (stored by name) — the user confirmed it, trust it
      category = rule.category;
      confirmed = rule.auto_confirm && !rule.always_ask;
      categorySource = "rule";
    } else {
      const fromDefaults = defaultCategoryFor(parsed.merchantKey, parsed.kind);
      const fromAi = !fromDefaults && parsed.merchant && !parsed.isPerson
        ? await aiGuessCategory(parsed.merchant)
        : null;
      category = fromDefaults ?? fromAi ?? FALLBACK_CATEGORY;
      categorySource = fromDefaults ? "default" : fromAi ? "ai" : "fallback";
    }

    // Fee included — that's what actually left the account
    const total = Math.round((amount + parsed.fee) * 100) / 100;
    const providerLabel = PROVIDER_LABELS[parsed.provider] ?? parsed.provider;
    // Some bank SMS name no merchant ("CITYTOUCH TXN … Withdrawal") — don't repeat the bank
    const note = [
      who,
      who !== providerLabel ? providerLabel : null,
      parsed.fee > 0 ? `incl. fee ${tk(parsed.fee)}` : null,
    ].filter(Boolean).join(" · ").slice(0, 200);

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

