// Bank / MFS SMS → structured transaction.
//
// Pure module (no Deno APIs, no imports) so the same file runs in the
// `ingest-sms` edge function and in Vitest (smsParser.test.ts).
//
// Deliberately heuristic rather than one exact regex per bank: formats drift,
// and a heuristic that finds "the first money figure that isn't a balance or
// fee" survives most rewording. Anything it can't classify is left for the
// in-app Review inbox — never silently guessed into an expense.

export type SmsDirection = "debit" | "credit" | "unknown";

export type SmsKind =
  | "payment" | "card" | "send_money" | "cash_out" | "recharge" | "bill" | "transfer"
  | "received" | "cash_in" | "add_money" | "refund"
  | "unknown";

export interface ParsedSms {
  /** false → drop it (OTP, promo, nothing money-like). */
  isTransaction: boolean;
  skipReason: "otp" | "promo" | "no_amount" | null;
  provider: string;
  kind: SmsKind;
  direction: SmsDirection;
  amount: number | null;
  currency: string;
  fee: number;
  balance: number | null;
  merchant: string | null;
  /** Normalized merchant used for rule matching ("foodpanda", "01712345678"). */
  merchantKey: string | null;
  /** Counterparty is a phone number (Send Money / Cash In), not a business. */
  isPerson: boolean;
  trxId: string | null;
  /** Transaction time stated in the SMS, if any (interpreted as Asia/Dhaka). */
  txnAt: Date | null;
  /** false when the SMS gives only a date (City Bank) — txnAt is then noon that day. */
  txnHasTime: boolean;
}

// ─── Money ────────────────────────────────────────────────────────────────────

const CURRENCY_TOKENS: [RegExp, string][] = [
  [/^(?:tk\.?|taka|bdt|৳)$/i, "BDT"],
  [/^(?:usd|us\$|\$)$/i, "USD"],
  [/^(?:eur|€)$/i, "EUR"],
  [/^(?:gbp|£)$/i, "GBP"],
  [/^(?:inr|₹)$/i, "INR"],
  [/^sgd$/i, "SGD"],
  [/^aed$/i, "AED"],
  [/^myr$/i, "MYR"],
];

const CUR = String.raw`(?:Tk\.?|Taka|BDT|৳|USD|US\$|\$|EUR|€|GBP|£|INR|₹|SGD|AED|MYR)`;
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
// "Tk 1,200.00", "BDT1200", "Amount: Tk 120"  |  "1,200.00 BDT"
// Never across a line break: "08-Oct-2026\nTk. 34,933" is not "2026 Tk".
const MONEY_BEFORE = new RegExp(String.raw`(?<![A-Za-z])(${CUR})[ \t]*:?[ \t]*${NUM}`, "gi");
const MONEY_AFTER = new RegExp(String.raw`(?<![\d.,])${NUM}[ \t]*(${CUR})(?![A-Za-z])`, "gi");

interface MoneyMatch {
  start: number;
  end: number;
  value: number;
  currency: string;
  role: "primary" | "balance" | "fee";
}

function toCurrency(token: string): string {
  const t = token.trim();
  for (const [re, code] of CURRENCY_TOKENS) if (re.test(t)) return code;
  return "BDT";
}

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(/,/g, ""));
}

function findMoney(text: string): MoneyMatch[] {
  const found: Omit<MoneyMatch, "role">[] = [];
  for (const m of text.matchAll(MONEY_BEFORE)) {
    found.push({ start: m.index!, end: m.index! + m[0].length, currency: toCurrency(m[1]), value: toNumber(m[2]) });
  }
  for (const m of text.matchAll(MONEY_AFTER)) {
    found.push({ start: m.index!, end: m.index! + m[0].length, currency: toCurrency(m[2]), value: toNumber(m[1]) });
  }
  found.sort((a, b) => a.start - b.start);

  // Drop overlaps ("Tk 120.00 BDT" would match both patterns)
  const merged: Omit<MoneyMatch, "role">[] = [];
  for (const f of found) {
    const last = merged[merged.length - 1];
    if (last && f.start < last.end) continue;
    if (Number.isFinite(f.value)) merged.push(f);
  }

  // Role comes from the words just before the figure, bounded by the previous
  // figure so "Fee Tk 0.00. Balance Tk 2,340" labels each one correctly — or
  // from a label right after it on the same line ("Tk. 33,204 Balance", City Bank).
  let prevEnd = 0;
  return merged.map((f) => {
    const before = text.slice(Math.max(prevEnd, f.start - 32), f.start).toLowerCase();
    const after = text.slice(f.end, f.end + 24).split("\n")[0].toLowerCase();
    prevEnd = f.end;
    let role: MoneyMatch["role"] = "primary";
    if (/(?:\bbal\b|balance|limit|\bavl\b|available)[^.]*$/.test(before)) role = "balance";
    else if (/(?:\bfee|\bcharges?\b|\bvat\b|\bcommission)[^.]*$/.test(before)) role = "fee";
    else if (/^\s*(?:bal\b|balance|avl\b|available)/.test(after)) role = "balance";
    else if (/^\s*(?:fee|charges?\b|vat\b)/.test(after)) role = "fee";
    return { ...f, role };
  });
}

// ─── Classification ───────────────────────────────────────────────────────────

const OTP_RE =
  /\b(?:otp|one[- ]?time (?:password|pin|code)|verification code|security code|do not share|don'?t share|never share|pin is|password is|passcode)\b/i;

const PROMO_RE =
  /(?:\boffer\b|\benjoy\b|\bget up ?to\b|\bupto\b|\bup to\b|\bwin\b|\bdiscount\b|%\s*off|\d+\s*%|\bhurry\b|\bvalid (?:till|until)\b|\bdial \*|\bt&c\b|\bcampaign\b|\bchance\b|\bcoupon\b|\bpromo\b)/i;

const KEYWORDS: { re: RegExp; kind: SmsKind; direction: SmsDirection }[] = [
  { re: /\bcash ?out\b|\batm\b|\bcash withdrawal\b/i, kind: "cash_out", direction: "debit" },
  { re: /\bcash ?in\b/i, kind: "cash_in", direction: "credit" },
  { re: /\bsend money\b|\bmoney sent\b|\byou have sent\b|\bsent (?:tk|bdt)/i, kind: "send_money", direction: "debit" },
  { re: /\b(?:mobile )?recharge\b|\btop-?up\b/i, kind: "recharge", direction: "debit" },
  { re: /\bbill ?pay(?:ment)?\b|\bpay ?bill\b|\bpaid bill\b/i, kind: "bill", direction: "debit" },
  { re: /\badd(?:ed)? money\b|\bmoney added\b/i, kind: "add_money", direction: "credit" },
  { re: /\brefund(?:ed)?\b|\breversal\b|\breversed\b|\bcash ?back\b/i, kind: "refund", direction: "credit" },
  { re: /\breceived\b|\bcredited\b|\bdeposited\b|\bdeposit\b/i, kind: "received", direction: "credit" },
  { re: /\btransferred to\b|\bfund transfer\b|\btransfer to\b/i, kind: "transfer", direction: "debit" },
  { re: /\bpayment\b|\bpaid\b|\bpurchase[ds]?\b|\bspent\b|\bused (?:for|at)\b|\bpos\b|\be-?com\b/i, kind: "payment", direction: "debit" },
  { re: /\bdebited\b|\bwithdrawn\b|\bwithdrawal\b|\bdeducted\b|\b(?:txn|transaction) of\b/i, kind: "payment", direction: "debit" },
];

function classify(text: string): { kind: SmsKind; direction: SmsDirection } {
  // Earliest keyword wins: "Payment ... received by merchant" is a payment.
  let best: { idx: number; kind: SmsKind; direction: SmsDirection } | null = null;
  for (const k of KEYWORDS) {
    const m = k.re.exec(text);
    if (m && (best === null || m.index < best.idx)) {
      best = { idx: m.index, kind: k.kind, direction: k.direction };
    }
  }
  return best ? { kind: best.kind, direction: best.direction } : { kind: "unknown", direction: "unknown" };
}

function detectProvider(text: string, sender: string | null): string {
  const hay = `${sender ?? ""} ${text}`;
  if (/bkash/i.test(hay)) return "bkash";
  if (/nagad/i.test(hay)) return "nagad";
  if (/pathao ?pay/i.test(hay)) return "pathao_pay";
  if (/\brocket\b|16216/i.test(hay)) return "rocket";
  if (/\bupay\b/i.test(hay)) return "upay";
  // bKash SMS rarely say "bKash" — but only bKash writes "TrxID"
  if (/\bTrxID\b/.test(text)) return "bkash";
  // Banks before the generic card check — their account masks look like card masks
  if (/citytouch|city ?bank|\bcbl\b|cbl\.fyi/i.test(hay)) return "city_bank";
  // City Bank's layout, for when the cbl.fyi link is missing: a header line
  // ("E-COMM/POS TXN"), or "Tk. 34,933 Deposit" lines above an "A/C:" line
  if (/^[A-Z][A-Z-]*(?:\/[A-Z-]+)* TXN$/m.test(text)) return "city_bank";
  if (/^Tk\. [\d,.]+ [A-Z][a-z]+$/m.test(text) && /^A\/C: /m.test(text)) return "city_bank";
  if (/\bcard\b|\bending\s*(?:with\s*)?[\dX*]{4}|\*{2,}\d{3,4}|\b(?:visa|master ?card|amex)\b/i.test(hay)) return "card";
  if (sender && sender.trim()) return sender.trim().toLowerCase().slice(0, 32);
  return "bank";
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const TRX_RE =
  /\b(?:TrxID|TxnID|TxID|Trx\.?\s?ID|Txn\.?\s?ID|Transaction\s?ID|Trans(?:action)?\s?(?:No|Ref)\.?|Ref(?:erence)?\s?No\.?)\s*[:#.-]?\s*([A-Za-z0-9]{6,})/i;

// Where a merchant / counterparty name stops
const STOP = String.raw`(?=\s+(?:is\s+)?successful|\s+successfully|\s+on\s+\d|\s+on\s+[A-Z][a-z]{2}\b|\s+(?:Fee|Ref|TrxID|TxnID|Trx|Txn|Balance|Bal|Avl|Available|Amount|Date|Time)\b|[.;,]\s|\.$|\s{2,}|\n|$)`;
const MERCHANT_LABEL_RE = /\b(?:Merchant(?:\s*Name)?|Receiver|Sender|Payee)\s*:\s*([^\n]+?)(?=\s{2,}|\n|\s*(?:TxnID|TrxID|Txn|Trx|Balance|Bal|Amount|Fee|Date|Time)\b|$)/i;
const TO_RE = new RegExp(String.raw`\bto\s+(?!your\b)([^\n]+?)${STOP}`, "i");
const AT_RE = new RegExp(String.raw`\bat\s+(?!\d{1,2}[:/.-])([^\n]+?)${STOP}`, "i");
const FROM_RE = new RegExp(String.raw`\bfrom\s+(?!your\b)([^\n]+?)${STOP}`, "i");

const PHONE_RE = /^\+?(?:88)?0?1[\dXx*]{9}$/;
const PHONE_TAIL_RE = /[\s-]*\+?(?:88)?0?1[\dXx*]{9}\s*$/;

function cleanMerchant(raw: string): { merchant: string; isPerson: boolean } | null {
  let m = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .replace(/^['"‘“]+|['"’”]+$/g, "")
    .trim();
  if (!m) return null;
  const compact = m.replace(/[\s-]/g, "");
  if (PHONE_RE.test(compact)) return { merchant: compact, isPerson: true };
  m = m.replace(PHONE_TAIL_RE, "").trim();
  if (!m || /^(?:your|you|a\/c|account)\b/i.test(m)) return null;
  return { merchant: m.slice(0, 60), isPerson: false };
}

const KEY_STOPWORDS = new Set([
  "ltd", "limited", "pvt", "plc", "inc", "llc", "co", "bd", "bangladesh", "dhaka",
  "com", "www", "the", "pos", "ecom", "online", "store", "shop", "branch",
]);

export function merchantKeyOf(merchant: string, isPerson: boolean): string {
  if (isPerson) return merchant.replace(/\D/g, "").slice(-11) || merchant.toLowerCase();
  return merchant
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !KEY_STOPWORDS.has(w))
    .join(" ")
    .trim();
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Dhaka is UTC+6 with no DST. */
function dhakaDate(y: number, mo: number, d: number, h: number, mi: number): Date | null {
  if (y < 100) y += 2000;
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return new Date(Date.UTC(y, mo, d, h - 6, mi));
}

/** A date with no time ("16-Oct-2026") is placed at noon and flagged. */
function parseDate(text: string): { at: Date | null; hasTime: boolean } {
  const at = (y: number, mo: number, d: number, h?: string, mi?: string) => ({
    at: dhakaDate(y, mo, d, h ? +h : 12, mi ? +mi : 0),
    hasTime: h !== undefined,
  });
  // 12/10/2026 14:14  ·  12-10-2026  ·  12.10.26 (day first, as BD banks write it)
  let m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[\s,]+(\d{1,2}):(\d{2}))?/.exec(text);
  if (m) return at(+m[3], +m[2] - 1, +m[1], m[4], m[5]);
  // 12-Oct-26 14:14  ·  12 Oct 2026
  m = /\b(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})(?:[\s,]+(\d{1,2}):(\d{2}))?/.exec(text);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return at(+m[3], MONTHS[m[2].toLowerCase()], +m[1], m[4], m[5]);
  }
  // 2026-10-12 14:14
  m = /\b(\d{4})-(\d{2})-(\d{2})(?:[T\s]+(\d{1,2}):(\d{2}))?/.exec(text);
  if (m) return at(+m[1], +m[2] - 1, +m[3], m[4], m[5]);
  return { at: null, hasTime: false };
}

function extractCounterparty(text: string, direction: SmsDirection) {
  const labelled = MERCHANT_LABEL_RE.exec(text);
  if (labelled) return cleanMerchant(labelled[1]);
  const order = direction === "credit" ? [FROM_RE] : [TO_RE, AT_RE];
  for (const re of order) {
    const m = re.exec(text);
    if (m) {
      const c = cleanMerchant(m[1]);
      if (c) return c;
    }
  }
  return null;
}

// ─── Public ───────────────────────────────────────────────────────────────────

export function parseSms(rawText: string, sender: string | null = null): ParsedSms {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  const base: ParsedSms = {
    isTransaction: false, skipReason: null, provider: detectProvider(text, sender),
    kind: "unknown", direction: "unknown", amount: null, currency: "BDT", fee: 0,
    balance: null, merchant: null, merchantKey: null, isPerson: false, trxId: null, txnAt: null,
    txnHasTime: false,
  };

  if (OTP_RE.test(text)) return { ...base, skipReason: "otp" };

  const money = findMoney(text);
  const primary = money.find((m) => m.role === "primary");
  const trxId = TRX_RE.exec(text)?.[1] ?? null;
  const { kind: rawKind, direction } = classify(text);

  if (!primary || primary.value <= 0) return { ...base, skipReason: "no_amount", trxId };
  if (!trxId && (direction === "unknown" || PROMO_RE.test(text))) {
    return { ...base, skipReason: "promo", amount: primary.value };
  }

  const kind: SmsKind = rawKind === "payment" && base.provider === "card" ? "card" : rawKind;
  const counterparty = extractCounterparty(text, direction);
  const isPerson =
    counterparty?.isPerson ?? (kind === "send_money" || kind === "cash_in" || kind === "cash_out");
  const date = parseDate(text);

  return {
    ...base,
    isTransaction: true,
    kind,
    direction,
    amount: primary.value,
    currency: primary.currency,
    fee: money.find((m) => m.role === "fee")?.value ?? 0,
    balance: money.find((m) => m.role === "balance")?.value ?? null,
    merchant: counterparty?.merchant ?? null,
    merchantKey: counterparty ? merchantKeyOf(counterparty.merchant, counterparty.isPerson) || null : null,
    isPerson,
    trxId,
    txnAt: date.at,
    txnHasTime: date.at !== null && date.hasTime,
  };
}
