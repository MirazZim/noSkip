import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, ChevronRight, ClipboardPaste, Loader2, PartyPopper, Smartphone, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategorySelector } from "@/components/expenses/AddExpenseDialog";
import { EXPENSE_CATEGORIES, getCategoryDisplayLabel } from "@/hooks/useExpenses";
import { INCOME_SOURCES } from "@/hooks/useIncomes";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import { useCurrency } from "@/hooks/useCurrency";
import {
  AUTO_CONFIRM_AFTER, findRule, providerLabel,
  usePendingExpenses, useReviewSms, useMerchantRules,
  useConfirmSmsExpense, useConfirmAllSmsExpenses, useDismissSmsExpense,
  useLogSmsAsExpense, useLogSmsAsIncome, useIgnoreSms, useIngestSms,
  type MerchantRule, type PendingExpense, type SmsMessage,
} from "@/hooks/useSmsImport";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// One queue for everything the SMS importer couldn't settle on its own:
//   expense — filed as pending, needs a category confirm (the common case)
//   sms     — credit / unclear / foreign currency, needs a decision
type Item =
  | { type: "expense"; id: string; expense: PendingExpense }
  | { type: "sms"; id: string; sms: SmsMessage };

const AMBER = "#f59e0b";

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

  // Rows disappear from the queries after a refetch; hide them immediately
  const [done, setDone] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  const items: Item[] = useMemo(
    () => [
      ...pending.map((e) => ({ type: "expense" as const, id: e.id, expense: e })),
      ...reviewSms.map((s) => ({ type: "sms" as const, id: s.id, sms: s })),
    ].filter((i) => !done.has(i.id)),
    [pending, reviewSms, done],
  );

  useEffect(() => { if (!open) { setDone(new Set()); setIndex(0); } }, [open]);

  const current = items.length ? items[Math.min(index, items.length - 1)] : null;
  const markDone = (id: string) => setDone((prev) => new Set(prev).add(id));
  const skip = () => setIndex((i) => (items.length ? (i + 1) % items.length : 0));

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Smartphone className="h-4 w-4" style={{ color: AMBER }} />
            {items.length ? "Confirm payments" : "All caught up"}
          </DialogTitle>
          <DialogDescription>
            {items.length
              ? `${items.length} from your SMS ${items.length === 1 ? "needs" : "need"} a quick look.`
              : "Every imported payment is confirmed."}
          </DialogDescription>
        </DialogHeader>

        {current?.type === "expense" && (
          <ExpenseCard
            key={current.id}
            expense={current.expense}
            category={categoryOf(current.expense)}
            onCategoryChange={(c) => setChoices((prev) => ({ ...prev, [current.id]: c }))}
            rule={findRule(rules, current.expense.sms?.merchant_key)}
            onDone={() => markDone(current.id)}
          />
        )}
        {current?.type === "sms" && (
          <SmsReviewCard key={current.id} sms={current.sms} onDone={() => markDone(current.id)} />
        )}

        {!current && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <PartyPopper className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm text-muted-foreground max-w-[16rem]">
              New card and wallet payments show up here as soon as your phone forwards the SMS.
            </p>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.min(index, items.length - 1) + 1} of {items.length}
            </span>
            <div className="flex items-center gap-1.5">
              {pendingLeft.length > 1 && (
                <Button
                  variant="outline" size="sm" className="rounded-xl"
                  onClick={handleConfirmAll} disabled={confirmAll.isPending}
                >
                  {confirmAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Confirm all ${pendingLeft.length}`}
                </Button>
              )}
              {items.length > 1 && (
                <Button variant="ghost" size="sm" className="rounded-xl" onClick={skip}>
                  Skip <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        )}

        <PasteSms />
      </DialogContent>
    </Dialog>
  );
}

// ─── Pending expense ──────────────────────────────────────────────────────────

function ExpenseCard({
  expense, category, onCategoryChange, rule, onDone,
}: {
  expense: PendingExpense;
  category: string;
  onCategoryChange: (c: string) => void;
  rule: MerchantRule | null;
  onDone: () => void;
}) {
  const { formatAmount } = useCurrency();
  const { data: customCategories = [] } = useCustomCategories();
  const confirm = useConfirmSmsExpense();
  const dismiss = useDismissSmsExpense();
  const merchant = expense.sms?.merchant ?? expense.note ?? "Payment";
  const isPerson = expense.sms?.is_person ?? false;
  const busy = confirm.isPending || dismiss.isPending;

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
      onDone();
    } catch {
      toast.error("Couldn't confirm");
    }
  };

  const handleDismiss = async (alwaysIgnore: boolean) => {
    try {
      await dismiss.mutateAsync({ expense, alwaysIgnore });
      toast.success(alwaysIgnore ? `${merchant} will be ignored from now on` : "Removed — not an expense");
      onDone();
    } catch {
      toast.error("Couldn't remove it");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className="rounded-full px-2 py-0.5 font-bold uppercase tracking-wider"
            style={{ background: `${AMBER}18`, color: AMBER }}
          >
            {expense.sms ? providerLabel(expense.sms.provider) : "SMS"}
          </span>
          <span>{whenLabel(expense.sms?.txn_at ?? expense.created_at)}</span>
        </div>
        <p className="text-3xl font-black tabular-nums tracking-tight">{formatAmount(expense.amount)}</p>
        <p className="text-sm font-semibold truncate">{merchant}</p>
        {expense.note && expense.note !== merchant && (
          <p className="text-xs text-muted-foreground truncate">{expense.note}</p>
        )}
      </div>

      <div className="space-y-1.5">
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

      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => handleDismiss(false)} disabled={busy}>
          <X className="h-4 w-4" /> Not an expense
        </Button>
        <Button className="rounded-xl" onClick={handleConfirm} disabled={busy || !category}>
          {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Confirm
        </Button>
      </div>
      {expense.sms?.merchant_key && (
        <button
          className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => handleDismiss(true)}
          disabled={busy}
        >
          Never track payments to {merchant}
        </button>
      )}
    </div>
  );
}

// ─── SMS that needs a decision ────────────────────────────────────────────────

function SmsReviewCard({ sms, onDone }: { sms: SmsMessage; onDone: () => void }) {
  const { data: customCategories = [] } = useCustomCategories();
  const logExpense = useLogSmsAsExpense();
  const logIncome = useLogSmsAsIncome();
  const ignore = useIgnoreSms();
  const busy = logExpense.isPending || logIncome.isPending || ignore.isPending;

  const isForeign = sms.currency !== "BDT";
  const [mode, setMode] = useState<"expense" | "income">(sms.direction === "credit" ? "income" : "expense");
  const [amount, setAmount] = useState(!isForeign && sms.amount ? String(sms.amount + (sms.direction === "debit" ? sms.fee : 0)) : "");
  const [category, setCategory] = useState("other:uncategorized");
  const [source, setSource] = useState<string>("Other");

  const allNames = [...EXPENSE_CATEGORIES.map((c) => c.id), ...customCategories.map((c) => c.name)];
  const date = (() => { try { return format(parseISO(sms.txn_at), "yyyy-MM-dd"); } catch { return format(new Date(), "yyyy-MM-dd"); } })();
  const who = sms.merchant ?? providerLabel(sms.provider);
  const headline =
    sms.direction === "credit" ? "Money in" : isForeign ? "Foreign-currency charge" : "Couldn't read this one";

  const handleSave = async () => {
    const value = Number.parseFloat(amount.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) { toast.error("Enter the amount"); return; }
    try {
      if (mode === "expense") await logExpense.mutateAsync({ sms, amount: value, category, date });
      else await logIncome.mutateAsync({ sms, amount: value, source, date });
      toast.success(mode === "expense" ? "Logged as expense" : "Logged as income");
      onDone();
    } catch {
      toast.error("Couldn't save");
    }
  };

  const handleIgnore = async (alwaysIgnore: boolean) => {
    try {
      await ignore.mutateAsync({ sms, alwaysIgnore });
      toast.success(alwaysIgnore ? `${who} will be ignored from now on` : "Ignored");
      onDone();
    } catch {
      toast.error("Couldn't ignore it");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn("rounded-full px-2 py-0.5 font-bold uppercase tracking-wider",
              sms.direction === "credit" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "")}
            style={sms.direction === "credit" ? undefined : { background: `${AMBER}18`, color: AMBER }}
          >
            {headline}
          </span>
          <span>{whenLabel(sms.txn_at)}</span>
        </div>
        {sms.amount !== null && (
          <p className="text-2xl font-black tabular-nums tracking-tight">
            {sms.currency} {sms.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        )}
        <p className="text-sm font-semibold truncate">
          {sms.direction === "credit" ? "from " : ""}{who} · {providerLabel(sms.provider)}
        </p>
        <details className="pt-1">
          <summary className="cursor-pointer text-[11px] text-muted-foreground select-none">Show SMS</summary>
          <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed">
            {sms.raw_text}
          </p>
        </details>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border/40">
        {(["expense", "income"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider transition-all",
              mode === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount (BDT)</p>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        {isForeign && (
          <p className="text-xs text-muted-foreground">
            Charged in {sms.currency}. Enter the BDT amount from your card statement or the bank app.
          </p>
        )}
      </div>

      {mode === "expense" ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Category</p>
          <CategorySelector
            value={category} onChange={setCategory}
            customCategories={customCategories} allNames={allNames} onCategoryCreated={() => {}}
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source</p>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INCOME_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => handleIgnore(false)} disabled={busy}>
          <X className="h-4 w-4" /> Ignore
        </Button>
        <Button className="rounded-xl" onClick={handleSave} disabled={busy}>
          {(logExpense.isPending || logIncome.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Save {mode}
        </Button>
      </div>
      {sms.merchant_key && (
        <button
          className="w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => handleIgnore(true)}
          disabled={busy}
        >
          Always ignore {sms.direction === "credit" ? "money from" : "payments to"} {who} (e.g. own transfers)
        </button>
      )}
    </div>
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
