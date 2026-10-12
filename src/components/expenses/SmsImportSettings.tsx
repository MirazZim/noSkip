import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Check, ChevronDown, Copy, Pencil, Smartphone, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CategorySelector } from "@/components/expenses/AddExpenseDialog";
import { PasteSms } from "@/components/expenses/ReviewQueueDialog";
import { EXPENSE_CATEGORIES, getCategoryDisplayLabel } from "@/hooks/useExpenses";
import { useCustomCategories } from "@/hooks/useCustomCategories";
import {
  AUTO_CONFIRM_AFTER, openReviewQueue,
  useLastSms, useMerchantRules, useUpdateMerchantRule, useDeleteMerchantRule,
  type MerchantRule,
} from "@/hooks/useSmsImport";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-sms`;

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast.success(`${label} copied`); }
    catch { toast.error("Couldn't copy"); }
  };
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs">{value}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copy} aria-label={`Copy ${label}`}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SmsImportSettings() {
  const { data: last } = useLastSms();
  const [showSetup, setShowSetup] = useState(false);
  const lastAt = last ? parseISO(last.created_at) : null;
  const healthy = lastAt && Date.now() - lastAt.getTime() < 7 * 86_400_000;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> SMS Auto-Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <span
              className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", healthy ? "bg-emerald-500" : "bg-muted-foreground/40")}
            />
            <div className="min-w-0 flex-1 text-sm">
              {lastAt ? (
                <>
                  <p className="font-medium">Last SMS {formatDistanceToNow(lastAt, { addSuffix: true })}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {last?.merchant ?? "Unknown"}{last?.amount ? ` · ${last.currency} ${last.amount}` : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Waiting for the first SMS</p>
                  <p className="text-xs text-muted-foreground">Set up the iPhone Shortcut below, then make any card or bKash payment.</p>
                </>
              )}
            </div>
            <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={openReviewQueue}>
              Review queue
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60">
            <button
              onClick={() => setShowSetup((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            >
              iPhone setup (one time)
              <ChevronDown className={cn("h-4 w-4 transition-transform", showSetup && "rotate-180")} />
            </button>
            {showSetup && (
              <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                <ol className="list-decimal space-y-2 pl-4 text-muted-foreground">
                  <li>
                    Shortcuts → <b className="text-foreground">Automation</b> → <b className="text-foreground">+</b> →{" "}
                    <b className="text-foreground">Message</b>. Set <i>Message Contains</i> to <code>TrxID</code>.
                    Repeat with <code>TxnID</code>, <code>BDT</code> and <code>Tk</code>. iOS matches one exact phrase per
                    automation, so each keyword needs its own.
                  </li>
                  <li>Choose <b className="text-foreground">Run Immediately</b> (turn off "Notify When Run").</li>
                  <li>
                    Add <b className="text-foreground">Get Contents of URL</b> with method <b className="text-foreground">POST</b>,
                    the URL and header below, and a <b className="text-foreground">JSON</b> body: key <code>text</code> ={" "}
                    <i>Shortcut Input → Content</i>, key <code>sender</code> = <i>Shortcut Input → Sender</i>.
                  </li>
                  <li>
                    Optional: add <b className="text-foreground">Get Dictionary Value</b> <code>message</code> →{" "}
                    <b className="text-foreground">Show Notification</b> to see "Tk 120 · Foodpanda → Food Delivery".
                  </li>
                  <li>
                    Tap <b className="text-foreground">▶ Run</b> once by hand and allow network access. Otherwise iOS stops
                    the automation with "interrupted".
                  </li>
                </ol>
                <CopyField label="URL" value={ENDPOINT} />
                <CopyField label="Header name" value="x-noskip-key" />
                <p className="text-xs text-muted-foreground">
                  The header value is your <code>SMS_INGEST_SECRET</code> Supabase secret. Several automations firing for one
                  SMS is fine: duplicates are dropped by TrxID. OTP and promo SMS are never stored.
                </p>
              </div>
            )}
          </div>

          <PasteSms defaultOpen />
        </CardContent>
      </Card>

      <MerchantRulesCard />
    </>
  );
}

// ─── Learned merchant rules ───────────────────────────────────────────────────

function MerchantRulesCard() {
  const { data: rules = [], isLoading } = useMerchantRules();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Merchant rules</CardTitle>
        <p className="text-xs text-muted-foreground">
          Learned from your confirmations. A merchant is auto-filed after {AUTO_CONFIRM_AFTER} confirms of the same category.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? null : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Confirm a few SMS payments and they'll appear here.</p>
        ) : (
          <div className="divide-y divide-border/50 rounded-2xl border border-border/60">
            {rules.map((r) => <RuleRow key={r.id} rule={r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuleRow({ rule }: { rule: MerchantRule }) {
  const update = useUpdateMerchantRule();
  const remove = useDeleteMerchantRule();
  const { data: customCategories = [] } = useCustomCategories();
  const [editing, setEditing] = useState(false);
  const [pattern, setPattern] = useState(rule.pattern);
  const allNames = [...EXPENSE_CATEGORIES.map((c) => c.id), ...customCategories.map((c) => c.name)];

  const save = async (patch: Partial<MerchantRule>, ok?: string) => {
    try { await update.mutateAsync({ id: rule.id, ...patch }); if (ok) toast.success(ok); }
    catch { toast.error("Couldn't update rule"); }
  };

  const status =
    rule.action === "ignore" ? { text: "Ignored", cls: "bg-muted text-muted-foreground" }
    : rule.always_ask ? { text: "Always asks", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400" }
    : rule.auto_confirm ? { text: "Auto", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
    : { text: `${rule.confirm_count}/${AUTO_CONFIRM_AFTER}`, cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" };

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                value={pattern} onChange={(e) => setPattern(e.target.value)}
                className="h-8 font-mono text-xs" autoFocus
              />
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                onClick={async () => {
                  if (!pattern.trim()) return;
                  await save({ pattern }, "Pattern updated");
                  setEditing(false);
                }}
                aria-label="Save pattern"
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon" variant="ghost" className="h-8 w-8"
                onClick={() => { setPattern(rule.pattern); setEditing(false); }}
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-semibold">{rule.label ?? rule.pattern}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">matches "{rule.pattern}"</p>
            </>
          )}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", status.cls)}>{status.text}</span>
        {!editing && (
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setEditing(true)} aria-label="Edit pattern">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button
          size="icon" variant="ghost" className="h-7 w-7 shrink-0 hover:bg-rose-500/10"
          onClick={async () => {
            try { await remove.mutateAsync(rule.id); toast.success("Rule deleted"); }
            catch { toast.error("Couldn't delete rule"); }
          }}
          aria-label="Delete rule"
        >
          <Trash2 className="h-3.5 w-3.5 text-rose-500" />
        </Button>
      </div>

      {rule.action === "categorize" ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <CategorySelector
              value={rule.category}
              onChange={(c) => c && c !== rule.category &&
                save({ category: c, confirm_count: AUTO_CONFIRM_AFTER, auto_confirm: !rule.always_ask },
                  `Now filed as ${getCategoryDisplayLabel(c)}`)}
              customCategories={customCategories}
              allNames={allNames}
              onCategoryCreated={() => {}}
            />
          </div>
          <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
            Always ask
            <Switch
              checked={rule.always_ask}
              onCheckedChange={(v) =>
                save({ always_ask: v, auto_confirm: !v && rule.confirm_count >= AUTO_CONFIRM_AFTER })}
            />
          </label>
        </div>
      ) : (
        <button
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => save({ action: "categorize", confirm_count: 0, auto_confirm: false }, "Will ask again")}
        >
          Stop ignoring. Ask me next time.
        </button>
      )}
    </div>
  );
}
