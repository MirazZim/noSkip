import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Expense } from "./useExpenses";

// ─── SMS Auto-Import ──────────────────────────────────────────────────────────
// Bank/MFS SMS are forwarded by the phone to the `ingest-sms` edge function,
// which files debits as pending expenses. This hook family powers the confirm
// dialog, the review inbox and the merchant-rule settings. See
// docs/sms-auto-import.md.
//
// sms_messages / merchant_rules / the new expense columns aren't in the
// generated types until `supabase gen types` runs after the migration, so these
// queries go through an untyped client with the local interfaces below.
const db = supabase as unknown as SupabaseClient;

export const OPEN_REVIEW_EVENT = "noskip:open-review";
export const AUTO_CONFIRM_AFTER = 3; // mirrors c_threshold in confirm_sms_expense()

export function openReviewQueue() {
  window.dispatchEvent(new CustomEvent(OPEN_REVIEW_EVENT));
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmsMessage {
  id: string;
  user_id: string;
  raw_text: string;
  sender: string | null;
  provider: string;
  kind: string;
  direction: "debit" | "credit" | "unknown";
  amount: number | null;
  currency: string;
  fee: number;
  merchant: string | null;
  merchant_key: string | null;
  is_person: boolean;
  trx_id: string | null;
  balance: number | null;
  txn_at: string;
  status: "expense" | "review" | "income" | "ignored";
  expense_id: string | null;
  income_id: string | null;
  created_at: string;
}

export type SmsSummary = Pick<
  SmsMessage,
  "id" | "merchant" | "merchant_key" | "provider" | "kind" | "is_person" | "raw_text" | "txn_at"
>;

export interface PendingExpense extends Expense {
  sms: SmsSummary | null;
}

export interface MerchantRule {
  id: string;
  user_id: string;
  pattern: string;
  label: string | null;
  category: string;
  action: "categorize" | "ignore";
  confirm_count: number;
  auto_confirm: boolean;
  always_ask: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngestResult {
  status: "confirmed" | "pending" | "review" | "ignored" | "duplicate" | "skipped";
  message: string;
}

export const PROVIDER_LABELS: Record<string, string> = {
  bkash: "bKash", nagad: "Nagad", pathao_pay: "Pathao Pay", rocket: "Rocket", upay: "Upay", card: "Card",
  city_bank: "City Bank",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** Longest rule pattern contained in the merchant key — same as the edge function. */
export function findRule(rules: MerchantRule[], merchantKey: string | null | undefined): MerchantRule | null {
  if (!merchantKey) return null;
  let best: MerchantRule | null = null;
  for (const r of rules) {
    if (merchantKey.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  return best;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

// Keyed under "expenses" so every existing expense mutation refreshes it too
export function usePendingExpenses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["expenses", user?.id, "pending"],
    queryFn: async () => {
      const { data, error } = await db
        .from("expenses")
        .select(
          "*, sms:sms_messages!expenses_sms_message_id_fkey(id, merchant, merchant_key, provider, kind, is_person, raw_text, txn_at)",
        )
        .eq("review_status", "pending")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingExpense[];
    },
    enabled: !!user,
  });
}

export function useReviewSms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sms-messages", user?.id, "review"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sms_messages")
        .select("*")
        .eq("status", "review")
        .order("txn_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SmsMessage[];
    },
    enabled: !!user,
  });
}

export function useLastSms() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sms-messages", user?.id, "last"],
    queryFn: async () => {
      const { data, error } = await db
        .from("sms_messages")
        .select("created_at, merchant, amount, currency, status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Pick<SmsMessage, "created_at" | "merchant" | "amount" | "currency" | "status"> | null;
    },
    enabled: !!user,
  });
}

export function useMerchantRules() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["merchant-rules", user?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("merchant_rules")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MerchantRule[];
    },
    enabled: !!user,
  });
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

/**
 * Keeps SMS-driven queries live while the app is open. ingest-sms writes
 * sms_messages → expenses → sms_messages (expense_id) in quick succession, so
 * refetches are debounced until the burst settles. Mount once (ReviewQueueLauncher).
 */
export function useSmsRealtime() {
  const { user } = useAuth();
  const invalidate = useInvalidateSms();

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(invalidate, 400);
    };
    const announce = () =>
      toast("New payment from SMS", {
        description: "Waiting for you to confirm",
        action: { label: "Review", onClick: openReviewQueue },
      });

    const filter = `user_id=eq.${user.id}`;
    const channel = supabase
      .channel(`sms-import:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sms_messages", filter }, (payload) => {
        refresh();
        if (payload.eventType === "INSERT" && (payload.new as SmsMessage).status === "review") announce();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter }, (payload) => {
        refresh();
        const row = payload.new as { origin?: string; review_status?: string };
        if (payload.eventType === "INSERT" && row.origin === "sms" && row.review_status === "pending") announce();
      })
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // invalidate is a fresh closure each render; the channel only depends on the user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
}

// ─── Confirm / dismiss pending expenses ───────────────────────────────────────

function useInvalidateSms() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["incomes"] });
    qc.invalidateQueries({ queryKey: ["sms-messages"] });
    qc.invalidateQueries({ queryKey: ["merchant-rules"] });
  };
}

/** Confirms the expense and teaches the merchant rule (see confirm_sms_expense). */
export function useConfirmSmsExpense() {
  const invalidate = useInvalidateSms();
  return useMutation({
    mutationFn: async ({ expenseId, category }: { expenseId: string; category: string }) => {
      const { data, error } = await db.rpc("confirm_sms_expense", {
        p_expense_id: expenseId,
        p_category: category,
      });
      if (error) throw error;
      return data as MerchantRule | null;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmAllSmsExpenses() {
  const invalidate = useInvalidateSms();
  return useMutation({
    mutationFn: async (items: { expenseId: string; category: string }[]) => {
      // Sequential so repeated merchants count up their rule one at a time
      for (const item of items) {
        const { error } = await db.rpc("confirm_sms_expense", {
          p_expense_id: item.expenseId,
          p_category: item.category,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

async function upsertIgnoreRule(userId: string, pattern: string, label: string | null) {
  const { error } = await db.from("merchant_rules").upsert(
    {
      user_id: userId, pattern, label, action: "ignore",
      confirm_count: 0, auto_confirm: false, updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,pattern" },
  );
  if (error) throw error;
}

/** "Not an expense": removes the expense, keeps the SMS as ignored. */
export function useDismissSmsExpense() {
  const invalidate = useInvalidateSms();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ expense, alwaysIgnore }: { expense: PendingExpense; alwaysIgnore?: boolean }) => {
      const { error } = await db.from("expenses").delete().eq("id", expense.id);
      if (error) throw error;
      if (expense.sms) {
        const { error: smsErr } = await db.from("sms_messages").update({ status: "ignored" }).eq("id", expense.sms.id);
        if (smsErr) throw smsErr;
        if (alwaysIgnore && expense.sms.merchant_key) {
          await upsertIgnoreRule(user!.id, expense.sms.merchant_key, expense.sms.merchant);
        }
      }
    },
    onSuccess: invalidate,
  });
}

// ─── Review inbox (credits, unclear, foreign currency) ───────────────────────

export function useLogSmsAsExpense() {
  const invalidate = useInvalidateSms();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ sms, amount, category, date }: { sms: SmsMessage; amount: number; category: string; date: string }) => {
      const { data, error } = await db
        .from("expenses")
        .insert({
          user_id: user!.id, amount, category, date,
          note: [sms.merchant, providerLabel(sms.provider)].filter(Boolean).join(" · ") || null,
          origin: "sms", review_status: "pending", sms_message_id: sms.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: smsErr } = await db
        .from("sms_messages")
        .update({ status: "expense", expense_id: data.id })
        .eq("id", sms.id);
      if (smsErr) throw smsErr;
      // Confirm through the RPC so the merchant rule learns from this too
      const { error: rpcErr } = await db.rpc("confirm_sms_expense", { p_expense_id: data.id, p_category: category });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: invalidate,
  });
}

export function useLogSmsAsIncome() {
  const invalidate = useInvalidateSms();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ sms, amount, source, date }: { sms: SmsMessage; amount: number; source: string; date: string }) => {
      const { data, error } = await db
        .from("incomes")
        .insert({
          user_id: user!.id, amount, source, date,
          note: [sms.merchant, providerLabel(sms.provider)].filter(Boolean).join(" · ") || null,
          origin: "sms", sms_message_id: sms.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: smsErr } = await db
        .from("sms_messages")
        .update({ status: "income", income_id: data.id })
        .eq("id", sms.id);
      if (smsErr) throw smsErr;
    },
    onSuccess: invalidate,
  });
}

export function useIgnoreSms() {
  const invalidate = useInvalidateSms();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ sms, alwaysIgnore }: { sms: SmsMessage; alwaysIgnore?: boolean }) => {
      const { error } = await db.from("sms_messages").update({ status: "ignored" }).eq("id", sms.id);
      if (error) throw error;
      if (alwaysIgnore && sms.merchant_key) await upsertIgnoreRule(user!.id, sms.merchant_key, sms.merchant);
    },
    onSuccess: invalidate,
  });
}

// ─── Manual paste (same pipeline as the phone, authenticated by JWT) ─────────

export function useIngestSms() {
  const invalidate = useInvalidateSms();
  return useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke("ingest-sms", { body: { text } });
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.message || body?.error) msg = body.message ?? body.error;
        } catch { /* keep generic */ }
        throw new Error(msg);
      }
      return data as IngestResult;
    },
    onSuccess: invalidate,
  });
}

// ─── Merchant rules ───────────────────────────────────────────────────────────

export function useUpdateMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<MerchantRule> & { id: string }) => {
      const next: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
      if (typeof patch.pattern === "string") next.pattern = patch.pattern.trim().toLowerCase();
      // Switching "always ask" on revokes auto-confirm immediately
      if (patch.always_ask === true) next.auto_confirm = false;
      const { error } = await db.from("merchant_rules").update(next).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merchant-rules"] }),
  });
}

export function useDeleteMerchantRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("merchant_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merchant-rules"] }),
  });
}
