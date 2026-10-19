import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, ClipboardPaste, Hand, Loader2, PartyPopper, Smartphone, Trash2, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardStack, type CardStackHandle, type StackItem } from "@/components/ui/card-stack";
import { CategorySelector } from "@/components/expenses/AddExpenseDialog";
import { EXPENSE_CATEGORIES, getCategoryColor, getCategoryDisplayLabel } from "@/hooks/useExpenses";
import { INCOME_SOURCES } from "@/hooks/useIncomes";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useCurrency } from "@/hooks/useCurrency";
import {
  AUTO_CONFIRM_AFTER, findRule, providerLabel,
  usePendingExpenses, useReviewSms, useMerchantRules,
  useConfirmSmsExpense, useConfirmAllSmsExpenses, useDismissSmsExpense, useUndoDismissSmsExpense,
  useLogSmsAsExpense, useLogSmsAsIncome, useIgnoreSms, useUndoIgnoreSms, useIngestSms,
  type IgnoreUndo, type MerchantRule, type PendingExpense, type SmsMessage,
} from "@/hooks/useSmsImport";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// One queue for everything the SMS importer couldn't settle on its own:
//   expense — filed as pending, needs a category confirm (the common case)
//   sms     — credit / unclear / foreign currency, needs a decision
// Shown as a fanned card stack: act on the top card, or swipe it to the back.
type Item =
  | { type: "expense"; id: string; expense: PendingExpense }
  | { type: "sms"; id: string; sms: SmsMessage };

interface Removed {
  id: string;
  title: string;
  detail: string;
  undo: () => Promise<unknown>;
  /** Restarts the countdown when the same card is removed again. */
  at: number;
}

type Direction = [number, number];
const KEEP: Direction = [0.9, -0.5];    // confirmed / saved — flies up and away
const DISCARD: Direction = [-0.9, 0.4]; // not an expense / ignored — tossed aside

const AMBER = "#f59e0b";
const EMERALD = "hsl(152, 69%, 40%)";

// ── Liquid glass ──────────────────────────────────────────────────────────────
// Frosted, translucent surfaces with a bright top edge (specular highlight) and
// a diagonal sheen, over drifting colour blobs so the blur has something to
// refract. Built on theme tokens, so it works in light and dark themes.
const GLASS_EDGE = "inset 0 1px 0 hsl(0 0% 100% / 0.35), inset 0 -1px 0 hsl(0 0% 100% / 0.06)";
const GLASS_BTN =
  "rounded-full border border-foreground/10 bg-foreground/[0.06] text-foreground backdrop-blur-xl hover:bg-foreground/[0.12] shadow-[inset_0_1px_0_hsl(0_0%_100%/0.25)]";
const PRIMARY_BTN =
  "rounded-full shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.7),inset_0_1px_0_hsl(0_0%_100%/0.3)]";
// Removing is the rare action: a quiet text link under the big primary button,
// never a twin button beside it (that's where mis-taps came from). Undo backs it up.
const QUIET_LINK =
  "w-full py-1.5 text-center text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50";
const DANGER_LINK = cn(QUIET_LINK, "font-medium text-destructive hover:text-destructive/80");
const UNDO_MS = 6000;
const CARD_SHADOW = "0 24px 48px -18px rgba(0, 0, 0, 0.45), 0 8px 18px -10px rgba(0, 0, 0, 0.25)";

// Works for hex and hsl() alike (category colours come in both)
const tint = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;

function whenLabel(iso: string | undefined | null): string {
  if (!iso) return "";
  try { return format(parseISO(iso), "EEE d MMM, h:mm a"); } catch { return ""; }
}

function learningHint(
  rule: MerchantRule | null, merchant: string | null, category: string, isPerson: boolean,
): string {
  const name = merchant ?? "this merchant";
  if (isPerson && (!rule || rule.always_ask)) {
    return "Payments to people always ask. NoSkip remembers the category you pick.";
  }
  if (rule?.always_ask) return `${name} is set to always ask.`;
  if (!rule || rule.action === "ignore") {
    return `New merchant. Confirm ${AUTO_CONFIRM_AFTER}× and NoSkip files ${name} automatically.`;
  }
  if (rule.category !== category) {
    return `NoSkip will learn ${getCategoryDisplayLabel(category)} for ${name} instead.`;
  }
  const left = Math.max(1, AUTO_CONFIRM_AFTER - rule.confirm_count);
  return left === 1
    ? `Confirm once more and ${name} goes on autopilot.`
    : `${left} more confirms and ${name} is filed automatically.`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewQueueDialog({ open, onOpenChange }: Props) {
  const { data: pending = [] } = usePendingExpenses();
  const { data: reviewSms = [] } = useReviewSms();
  const { data: rules = [] } = useMerchantRules();
  const stackRef = useRef<CardStackHandle>(null);

  // Rows disappear from the queries after a refetch; hide them immediately
  const [done, setDone] = useState<Set<string>>(new Set());

  const items: Item[] = useMemo(
    () => [
      ...pending.map((e) => ({ type: "expense" as const, id: e.id, expense: e })),
      ...reviewSms.map((s) => ({ type: "sms" as const, id: s.id, sms: s })),
    ].filter((i) => !done.has(i.id)),
    [pending, reviewSms, done],
  );

  useEffect(() => { if (!open) setDone(new Set()); }, [open]);

  const markDone = (id: string) => setDone((prev) => new Set(prev).add(id));
  const unmarkDone = (id: string) => setDone((prev) => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });

  // Removal is instant; the Undo bar inside the dialog restores the row and
  // brings the card back. Inside, not a toast: toasts sit under the modal
  // overlay, so the first tap on one only closed the dialog.
  const { formatAmount } = useCurrency();
  const undoDismiss = useUndoDismissSmsExpense();
  const undoIgnore = useUndoIgnoreSms();
  const [removed, setRemoved] = useState<Removed | null>(null);
  const offerUndo = (id: string, title: string, detail: string, undo: () => Promise<unknown>) =>
    setRemoved({ id, title, detail, undo, at: Date.now() });

  // Only the latest removal can be undone; it expires after UNDO_MS
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => setRemoved((r) => (r === removed ? null : r)), UNDO_MS);
    return () => clearTimeout(t);
  }, [removed]);
  useEffect(() => { if (!open) setRemoved(null); }, [open]);

  const handleUndo = async () => {
    if (!removed) return;
    try {
      await removed.undo();
      unmarkDone(removed.id);
      setRemoved(null);
    } catch {
      toast.error("Couldn't undo");
    }
  };

  // Throw the top card off the stack, then drop it from the queue
  const finish = async (id: string, direction: Direction) => {
    await stackRef.current?.flingTop(direction);
    markDone(id);
  };

  // Per-expense category choice, seeded with the importer's suggestion
  const [choices, setChoices] = useState<Record<string, string>>({});
  const categoryOf = (e: PendingExpense) => choices[e.id] ?? e.category;

  const confirmAll = useConfirmAllSmsExpenses();
  const pendingLeft = items.filter((i): i is Extract<Item, { type: "expense" }> => i.type === "expense");

  const handleConfirmAll = async () => {
    try {
      await confirmAll.mutateAsync(
        pendingLeft.map((i) => ({ expenseId: i.expense.id, category: categoryOf(i.expense) })),
      );
      toast.success(`Confirmed ${pendingLeft.length} payment${pendingLeft.length > 1 ? "s" : ""}`);
      pendingLeft.forEach((i) => markDone(i.id));
    } catch {
      toast.error("Couldn't confirm all — try one by one");
    }
  };

  const { data: customCategories = [] } = useCustomCategories();
  const accentOf = (item: Item | undefined): string => {
    if (!item) return AMBER;
    if (item.type === "expense") return getCategoryColor(categoryOf(item.expense), customCategories);
    return item.sms.direction === "credit" ? EMERALD : AMBER;
  };
  const [topKey, setTopKey] = useState<string | undefined>();
  const accent = accentOf(items.find((i) => i.id === topKey) ?? items[0]);

  const stackItems: StackItem[] = items.map((item) => ({
    key: item.id,
    node: item.type === "expense" ? (
      <ExpenseCard
        expense={item.expense}
        category={categoryOf(item.expense)}
        onCategoryChange={(c) => setChoices((prev) => ({ ...prev, [item.id]: c }))}
        rule={findRule(rules, item.expense.sms?.merchant_key)}
        onDone={(direction) => finish(item.id, direction)}
        onDismissed={(message, undo) =>
          offerUndo(
            item.id, message,
            `${formatAmount(item.expense.amount)} · ${item.expense.sms?.merchant ?? item.expense.note ?? "Payment"}`,
            () => undoDismiss.mutateAsync({ expense: item.expense, undo }),
          )}
      />
    ) : (
      <SmsReviewCard
        sms={item.sms}
        onDone={(direction) => finish(item.id, direction)}
        onIgnored={(message, undo) =>
          offerUndo(
            item.id, message,
            [
              item.sms.amount !== null
                ? `${item.sms.currency} ${item.sms.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                : null,
              item.sms.merchant ?? providerLabel(item.sms.provider),
            ].filter(Boolean).join(" · "),
            () => undoIgnore.mutateAsync({ sms: item.sms, undo }),
          )}
      />
    ),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md overflow-visible rounded-[28px] border-foreground/10 bg-background/70 backdrop-blur-2xl backdrop-saturate-150"
        style={{ boxShadow: `0 30px 80px -20px rgba(0,0,0,0.5), ${GLASS_EDGE}` }}
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Smartphone className="h-4 w-4" style={{ color: AMBER }} />
            {items.length ? "Confirm payments" : "All caught up"}
            {items.length > 0 && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-xs font-black tabular-nums"
                style={{ background: `${AMBER}1f`, color: AMBER }}
              >
                {items.length}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {items.length
              ? "From your SMS. Confirm the top card, or swipe it away to come back to it later."
              : "Every imported payment is confirmed."}
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 ? (
          // Room above/left for the fanned cards peeking out behind the top one
          <div className="glass-scene relative isolate pl-3 pr-1 pt-4">
            <GlassAmbient accent={accent} />
            <div className="h-[27rem]">
              <CardStack
                ref={stackRef}
                items={stackItems}
                layout="fan"
                visible={3}
                spread={0.35}
                depth={0.45}
                radius={26}
                tilt={18}
                threshold={90}
                shadow={CARD_SHADOW}
                onTopChange={setTopKey}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <PartyPopper className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground max-w-[16rem]">
              New card and wallet payments show up here as soon as your phone forwards the SMS.
            </p>
          </div>
        )}

        {removed && <UndoBar key={removed.at}removed={removed} onUndo={handleUndo} />}

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {items.length > 1 && <><Hand className="h-3.5 w-3.5" /> Swipe a card to skip it</>}
            </span>
            {pendingLeft.length > 1 && (
              <Button
                variant="ghost" size="sm" className={GLASS_BTN}
                onClick={handleConfirmAll} disabled={confirmAll.isPending}
              >
                {confirmAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Confirm all ${pendingLeft.length}`}
              </Button>
            )}
          </div>
        )}

        <PasteSms />
      </DialogContent>
    </Dialog>
  );
}

// ─── Undo bar ─────────────────────────────────────────────────────────────────
// Lives inside the dialog, under the stack. Same glass as the cards; says what
// was removed, gives Undo a real button, and drains a bar to show the time left.

function UndoBar({ removed, onUndo }: { removed: Removed; onUndo: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const { title, detail } = removed;
  return (
    <div
      role="status"
      className="relative flex items-center gap-3 overflow-hidden rounded-[22px] border border-foreground/10 bg-foreground/[0.05] py-2.5 pl-2.5 pr-2 backdrop-blur-xl"
      style={{ boxShadow: GLASS_EDGE, animation: "undoIn 0.25s ease both" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <Trash2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {detail && <p className="truncate text-xs text-muted-foreground tabular-nums">{detail}</p>}
      </div>
      <button
        onClick={async () => {
          setBusy(true);
          try { await onUndo(); } finally { setBusy(false); }
        }}
        disabled={busy}
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-bold text-background transition-transform active:scale-95 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        Undo
      </button>
      <div
        aria-hidden
        className="undo-toast-bar absolute bottom-0 left-0 h-[3px] w-full origin-left bg-destructive/70"
        style={{ animation: `undoDrain ${UNDO_MS}ms linear forwards` }}
      />
      <style>{`
        @keyframes undoDrain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
        @keyframes undoIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .undo-toast-bar { animation: none !important; } }
      `}</style>
    </div>
  );
}

// ─── Ambient colour behind the glass ──────────────────────────────────────────
// Three soft blobs that drift slowly and take the top card's colour, so the
// frosted cards have something vivid to blur — that's what reads as "glass".

function GlassAmbient({ accent }: { accent: string }) {
  const blob = "glass-blob absolute rounded-full blur-3xl transition-[background] duration-700";
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-4 -z-10 overflow-hidden rounded-[32px]">
      <div className={blob} style={{ width: "70%", height: "55%", left: "-10%", top: "5%", background: tint(accent, 0.55), animation: "glassDriftA 14s ease-in-out infinite" }} />
      <div className={blob} style={{ width: "60%", height: "50%", right: "-12%", top: "35%", background: tint("hsl(265, 85%, 65%)", 0.4), animation: "glassDriftB 18s ease-in-out infinite" }} />
      <div className={blob} style={{ width: "55%", height: "45%", left: "15%", bottom: "-8%", background: tint("hsl(195, 90%, 55%)", 0.35), animation: "glassDriftA 22s ease-in-out infinite reverse" }} />
      <style>{`
        @keyframes glassDriftA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(24px,-18px) scale(1.12); } }
        @keyframes glassDriftB { 0%,100% { transform: translate(0,0) scale(1.05); } 50% { transform: translate(-22px,16px) scale(0.92); } }
        @media (prefers-reduced-motion: reduce) { .glass-blob { animation: none !important; } }
        .glass-blob { will-change: transform; }
        /* Hold the light still while a card is dragged — one less thing to repaint */
        .glass-scene:has([data-dragging]) .glass-blob { animation-play-state: paused; }

        /* Backdrop blur is the expensive part, and it re-renders every frame a
           card moves. Only the top card is real glass; the ones behind are
           frosted panels (they sit under the glass anyway), and the blur gets
           lighter while dragging. */
        .glass-face {
          background: linear-gradient(150deg, hsl(var(--card) / 0.94), hsl(var(--card) / 0.84));
          /* Still scrolls (wheel, touch, keyboard) — just no visible bar, like iOS */
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .glass-face::-webkit-scrollbar { display: none; }
        [data-top] .glass-face {
          /* Solid enough to stay readable even before the blur kicks in */
          background: linear-gradient(150deg, hsl(var(--card) / 0.88), hsl(var(--card) / 0.72));
          backdrop-filter: blur(24px) saturate(170%);
          -webkit-backdrop-filter: blur(24px) saturate(170%);
        }
        [data-dragging] [data-top] .glass-face {
          backdrop-filter: blur(12px) saturate(160%);
          -webkit-backdrop-filter: blur(12px) saturate(160%);
        }
      `}</style>
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────
// Liquid-glass face: translucent + heavy blur/saturation, a bright top edge,
// a diagonal sheen and a faint wash of the card's accent colour.

function CardFace({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div
      className="glass-face relative h-full overflow-y-auto p-5"
      style={{
        borderRadius: 26,
        border: "1px solid hsl(var(--foreground) / 0.12)",
        boxShadow: GLASS_EDGE,
      }}
    >
      {/* Sheen + accent wash — decorative, behind the content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: 26,
          background: `linear-gradient(125deg, hsl(0 0% 100% / 0.22) 0%, hsl(0 0% 100% / 0.04) 32%, transparent 55%), radial-gradient(120% 70% at 100% 0%, ${tint(accent, 0.22)}, transparent 60%)`,
        }}
      />
      <div className="relative z-10 flex min-h-full flex-col gap-4">{children}</div>
    </div>
  );
}

function CardHeader({ chip, chipColor, when }: { chip: string; chipColor: string; when: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span
        className="rounded-full border px-2.5 py-0.5 font-bold uppercase tracking-wider backdrop-blur-md"
        style={{ background: tint(chipColor, 0.16), borderColor: tint(chipColor, 0.3), color: chipColor }}
      >
        {chip}
      </span>
      <span className="truncate">{when}</span>
    </div>
  );
}

// ─── Pending expense ──────────────────────────────────────────────────────────

function ExpenseCard({
  expense, category, onCategoryChange, rule, onDone, onDismissed,
}: {
  expense: PendingExpense;
  category: string;
  onCategoryChange: (c: string) => void;
  rule: MerchantRule | null;
  onDone: (direction: Direction) => Promise<void>;
  onDismissed: (message: string, undo: IgnoreUndo) => void;
}) {
  const { formatAmount } = useCurrency();
  const { data: customCategories = [] } = useCustomCategories();
  const confirm = useConfirmSmsExpense();
  const dismiss = useDismissSmsExpense();
  const merchant = expense.sms?.merchant ?? expense.note ?? "Payment";
  const isPerson = expense.sms?.is_person ?? false;
  const busy = confirm.isPending || dismiss.isPending;
  const accent = getCategoryColor(category, customCategories);

  const allNames = [...EXPENSE_CATEGORIES.map((c) => c.id), ...customCategories.map((c) => c.name)];

  const handleConfirm = async () => {
    try {
      const learned = await confirm.mutateAsync({ expenseId: expense.id, category });
      const wasAuto = rule?.auto_confirm && rule.category === category;
      if (learned?.auto_confirm && !wasAuto) {
        toast.success(`${expense.sms?.merchant ?? "This merchant"} is on autopilot now`, {
          description: `Future payments go straight to ${getCategoryDisplayLabel(category)}.`,
        });
      } else {
        toast.success("Confirmed");
      }
      await onDone(KEEP);
    } catch {
      toast.error("Couldn't confirm");
    }
  };

  const handleDismiss = async (alwaysIgnore: boolean) => {
    try {
      const undo = await dismiss.mutateAsync({ expense, alwaysIgnore });
      onDismissed(alwaysIgnore ? `${merchant} will be ignored from now on` : "Removed — not an expense", undo ?? {});
      await onDone(DISCARD);
    } catch {
      toast.error("Couldn't remove it");
    }
  };

  return (
    <CardFace accent={accent}>
      <CardHeader
        chip={expense.sms ? providerLabel(expense.sms.provider) : "SMS"}
        chipColor={AMBER}
        when={whenLabel(expense.sms?.txn_at ?? expense.created_at)}
      />

      <div className="space-y-1">
        <p className="text-4xl font-black tabular-nums tracking-tight">{formatAmount(expense.amount)}</p>
        <p className="text-base font-semibold truncate">{merchant}</p>
        {expense.note && expense.note !== merchant && (
          <p className="text-xs text-muted-foreground truncate">{expense.note}</p>
        )}
      </div>

      <div className="mt-auto space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category</p>
        <CategorySelector
          value={category}
          onChange={onCategoryChange}
          customCategories={customCategories}
          allNames={allNames}
          onCategoryCreated={() => {}}
        />
        <p className="text-xs text-muted-foreground">{learningHint(rule, expense.sms?.merchant ?? null, category, isPerson)}</p>
      </div>

      <div>
        <Button className={cn(PRIMARY_BTN, "h-12 w-full text-base")} onClick={handleConfirm} disabled={busy || !category}>
          {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirm
        </Button>
        <div className="mt-2">
          <button className={DANGER_LINK} onClick={() => handleDismiss(false)} disabled={busy}>
            Not an expense
          </button>
          {expense.sms?.merchant_key && (
            <button className={cn(QUIET_LINK, "text-[11px]")} onClick={() => handleDismiss(true)} disabled={busy}>
              Never track payments to {merchant}
            </button>
          )}
        </div>
      </div>
    </CardFace>
  );
}

// ─── SMS that needs a decision ────────────────────────────────────────────────

function SmsReviewCard({
  sms, onDone, onIgnored,
}: {
  sms: SmsMessage;
  onDone: (direction: Direction) => Promise<void>;
  onIgnored: (message: string, undo: IgnoreUndo) => void;
}) {
  const { data: customCategories = [] } = useCustomCategories();
  const logExpense = useLogSmsAsExpense();
  const logIncome = useLogSmsAsIncome();
  const ignore = useIgnoreSms();
  const busy = logExpense.isPending || logIncome.isPending || ignore.isPending;

  const isForeign = sms.currency !== "BDT";
  const isCredit = sms.direction === "credit";
  const [mode, setMode] = useState<"expense" | "income">(isCredit ? "income" : "expense");
  const [amount, setAmount] = useState(!isForeign && sms.amount ? String(sms.amount + (sms.direction === "debit" ? sms.fee : 0)) : "");
  const [category, setCategory] = useState("other:uncategorized");
  const [source, setSource] = useState<string>("Other");

  const allNames = [...EXPENSE_CATEGORIES.map((c) => c.id), ...customCategories.map((c) => c.name)];
  const date = (() => { try { return format(parseISO(sms.txn_at), "yyyy-MM-dd"); } catch { return format(new Date(), "yyyy-MM-dd"); } })();
  const who = sms.merchant ?? providerLabel(sms.provider);
  const headline = isCredit ? "Money in" : isForeign ? "Foreign-currency charge" : "Couldn't read this one";
  const accent = isCredit ? EMERALD : AMBER;

  const handleSave = async () => {
    const value = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) { toast.error("Enter the amount"); return; }
    try {
      if (mode === "expense") await logExpense.mutateAsync({ sms, amount: value, category, date });
      else await logIncome.mutateAsync({ sms, amount: value, source, date });
      toast.success(mode === "expense" ? "Logged as expense" : "Logged as income");
      await onDone(KEEP);
    } catch {
      toast.error("Couldn't save");
    }
  };

  const handleIgnore = async (alwaysIgnore: boolean) => {
    try {
      const undo = await ignore.mutateAsync({ sms, alwaysIgnore });
      onIgnored(alwaysIgnore ? `${who} will be ignored from now on` : "Ignored", undo ?? {});
      await onDone(DISCARD);
    } catch {
      toast.error("Couldn't ignore it");
    }
  };

  return (
    <CardFace accent={accent}>
      <CardHeader chip={headline} chipColor={accent} when={whenLabel(sms.txn_at)} />

      <div className="space-y-1">
        {sms.amount !== null && (
          <p className="text-3xl font-black tabular-nums tracking-tight">
            {sms.currency} {sms.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        )}
        <p className="text-sm font-semibold truncate">
          {isCredit ? "from " : ""}{who} · {providerLabel(sms.provider)}
        </p>
        <details>
          <summary className="cursor-pointer text-[11px] text-muted-foreground select-none">Show SMS</summary>
          <p className="mt-1.5 whitespace-pre-wrap rounded-2xl border border-foreground/10 bg-foreground/[0.05] p-2.5 font-mono text-[11px] leading-relaxed">
            {sms.raw_text}
          </p>
        </details>
      </div>

      <div className="mt-auto space-y-3">
        <div className="flex gap-1 rounded-full border border-foreground/10 bg-foreground/[0.05] p-1 backdrop-blur-xl">
          {(["expense", "income"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-full py-1.5 text-xs font-bold uppercase tracking-wider transition-all",
                mode === m ? "bg-card/90 text-foreground shadow-[0_2px_8px_-2px_rgba(0,0,0,0.25),inset_0_1px_0_hsl(0_0%_100%/0.3)]" : "text-muted-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Stacked, not side by side — the category picker needs the card's full width */}
        <div className="space-y-2">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
              BDT
            </span>
            <Input
              inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="0" aria-label="Amount (BDT)"
              className="h-11 rounded-xl pl-12 text-base font-semibold tabular-nums"
            />
          </div>
          {mode === "expense" ? (
            <CategorySelector
              value={category} onChange={setCategory}
              customCategories={customCategories} allNames={allNames} onCategoryCreated={() => {}}
            />
          ) : (
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger aria-label="Income source" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCOME_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        {isForeign && (
          <p className="text-xs text-muted-foreground">
            Charged in {sms.currency}. Enter the BDT amount from your card statement.
          </p>
        )}
      </div>

      <div>
        <Button className={cn(PRIMARY_BTN, "h-12 w-full text-base")} onClick={handleSave} disabled={busy}>
          {(logExpense.isPending || logIncome.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save {mode}
        </Button>
        <div className="mt-2">
          <button className={DANGER_LINK} onClick={() => handleIgnore(false)} disabled={busy}>
            Ignore
          </button>
          {sms.merchant_key && (
            <button className={cn(QUIET_LINK, "text-[11px]")} onClick={() => handleIgnore(true)} disabled={busy}>
              Always ignore {isCredit ? "money from" : "payments to"} {who}
            </button>
          )}
        </div>
      </div>
    </CardFace>
  );
}

// ─── Paste a missed SMS ───────────────────────────────────────────────────────

export function PasteSms({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const ingest = useIngestSms();

  const handleImport = async () => {
    if (!text.trim()) return;
    try {
      const result = await ingest.mutateAsync(text);
      const msg = result.message.replace(/^NoSkip:\s*/, "");
      if (result.status === "skipped" || result.status === "duplicate") toast.info(msg);
      else toast.success(msg);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import that SMS");
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-border/40 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ClipboardPaste className="h-3.5 w-3.5" /> Missed an SMS? Paste it
      </button>
    );
  }

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a bKash, Nagad or card SMS…"
        rows={3}
        className="resize-none text-xs font-mono"
      />
      <Button size="sm" className="w-full rounded-xl" onClick={handleImport} disabled={ingest.isPending || !text.trim()}>
        {ingest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
        Import SMS
      </Button>
    </div>
  );
}
