import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import type { MerchantRule, PendingExpense, SmsMessage } from "@/hooks/useSmsImport";

// ─── Mocks: data hooks return fixtures, mutations are spies ───────────────────

const state = {
  pending: [] as PendingExpense[],
  reviewSms: [] as SmsMessage[],
  rules: [] as MerchantRule[],
};
const confirm = vi.fn().mockResolvedValue(null);
const confirmAll = vi.fn().mockResolvedValue(undefined);
const dismiss = vi.fn().mockResolvedValue(undefined);
const logExpense = vi.fn().mockResolvedValue(undefined);
const logIncome = vi.fn().mockResolvedValue(undefined);
const ignore = vi.fn().mockResolvedValue(undefined);
const undoDismiss = vi.fn().mockResolvedValue(undefined);
const undoIgnore = vi.fn().mockResolvedValue(undefined);
const mutation = (fn: ReturnType<typeof vi.fn>) => () => ({ mutateAsync: fn, isPending: false });

vi.mock("@/hooks/useSmsImport", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useSmsImport")>();
  return {
    ...real,
    usePendingExpenses: () => ({ data: state.pending }),
    useReviewSms: () => ({ data: state.reviewSms }),
    useMerchantRules: () => ({ data: state.rules }),
    useConfirmSmsExpense: mutation(confirm),
    useConfirmAllSmsExpenses: mutation(confirmAll),
    useDismissSmsExpense: mutation(dismiss),
    useLogSmsAsExpense: mutation(logExpense),
    useLogSmsAsIncome: mutation(logIncome),
    useIgnoreSms: mutation(ignore),
    useUndoDismissSmsExpense: mutation(undoDismiss),
    useUndoIgnoreSms: mutation(undoIgnore),
    useIngestSms: mutation(vi.fn()),
  };
});
vi.mock("@/hooks/useCurrency", () => ({
  useCurrency: () => ({ currency: "BDT", symbol: "৳", formatAmount: (n: number) => `৳${n.toLocaleString("en-IN")}` }),
}));
vi.mock("@/hooks/useCustomCategories", () => ({
  useCustomCategories: () => ({ data: [] }),
  useCreateCustomCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCustomCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(), error: vi.fn(), info: vi.fn(),
  }),
}));

const { ReviewQueueDialog } = await import("./ReviewQueueDialog");
const { toast } = await import("sonner");

/** Finds the Undo bar inside the dialog, checks what it says, and taps Undo. */
async function clickUndo(title: string, detail: string) {
  const bar = within(await screen.findByRole("status"));
  expect(bar.getByText(title)).toBeInTheDocument();
  expect(bar.getByText(detail)).toBeInTheDocument();
  await act(async () => { fireEvent.click(bar.getByRole("button", { name: /Undo/ })); });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function pendingExpense(id: string, merchant: string, key: string, category: string, amount = 120): PendingExpense {
  return {
    id, amount, category, date: "2026-10-12", note: `${merchant} · bKash`, user_id: "u", created_at: "2026-10-12T08:14:00Z",
    origin: "sms", review_status: "pending", sms_message_id: `sms-${id}`,
    sms: {
      id: `sms-${id}`, merchant, merchant_key: key, provider: "bkash", kind: "payment",
      is_person: false, raw_text: "…", txn_at: "2026-10-12T08:14:00Z",
    },
  };
}

function rule(pattern: string, category: string, count: number): MerchantRule {
  return {
    id: `r-${pattern}`, user_id: "u", pattern, label: null, category, action: "categorize",
    confirm_count: count, auto_confirm: false, always_ask: false, created_at: "", updated_at: "",
  };
}

const credit: SmsMessage = {
  id: "sms-credit", user_id: "u", raw_text: "You have received Tk 2,500.00 from 01912345678…", sender: null,
  provider: "bkash", kind: "received", direction: "credit", amount: 2500, currency: "BDT", fee: 0,
  merchant: "01912345678", merchant_key: "01912345678", is_person: true, trx_id: "T1", balance: 3322,
  txn_at: "2026-10-13T04:05:00Z", status: "review", expense_id: null, income_id: null, created_at: "",
};

const renderDialog = () => render(<ReviewQueueDialog open onOpenChange={() => {}} />);

beforeEach(() => {
  state.pending = [];
  state.reviewSms = [];
  state.rules = [];
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ReviewQueueDialog", () => {
  it("shows the payment and explains learning for a new merchant", () => {
    state.pending = [pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery")];
    renderDialog();
    expect(screen.getByText("Confirm payments")).toBeInTheDocument();
    expect(screen.getByText("৳120")).toBeInTheDocument();
    expect(screen.getByText("FOODPANDA LIMITED")).toBeInTheDocument();
    expect(screen.getByText(/New merchant\. Confirm 3× and NoSkip files FOODPANDA LIMITED automatically/)).toBeInTheDocument();
  });

  it("says 'once more' when the merchant is one confirm from autopilot", () => {
    state.pending = [pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery")];
    state.rules = [rule("foodpanda", "food-drinks:meal-delivery", 2)];
    renderDialog();
    expect(screen.getByText(/Confirm once more and FOODPANDA LIMITED goes on autopilot/)).toBeInTheDocument();
  });

  it("Confirm sends the suggested category and moves to the next payment", async () => {
    state.pending = [
      pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery"),
      pendingExpense("e2", "PATHAO LTD", "pathao", "transport:ride-share", 230),
    ];
    renderDialog();
    // Both cards are in the stack, but only the top one is interactive
    expect(screen.getByText("FOODPANDA LIMITED")).toBeInTheDocument();
    expect(screen.getByText("PATHAO LTD")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Confirm$/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ expenseId: "e1", category: "food-drinks:meal-delivery" }));
    // The confirmed card is flung off; Pathao is now the top card
    await waitFor(() => expect(screen.queryByText("FOODPANDA LIMITED")).not.toBeInTheDocument());
    expect(screen.getByText("PATHAO LTD")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Confirm$/ })).toHaveLength(1);
  });

  it("cards under the top one are inert", () => {
    state.pending = [
      pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery"),
      pendingExpense("e2", "PATHAO LTD", "pathao", "transport:ride-share", 230),
    ];
    renderDialog();
    const behind = screen.getByText("PATHAO LTD").closest("[aria-hidden]");
    expect(behind).toHaveAttribute("inert");
    expect(screen.getByText("FOODPANDA LIMITED").closest("[inert]")).toBeNull();
    expect(screen.getByText(/Swipe a card to skip it/)).toBeInTheDocument();
  });

  it("Confirm all confirms every pending payment with its category", async () => {
    state.pending = [
      pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery"),
      pendingExpense("e2", "PATHAO LTD", "pathao", "transport:ride-share", 230),
    ];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Confirm all 2" }));
    await waitFor(() => expect(confirmAll).toHaveBeenCalledWith([
      { expenseId: "e1", category: "food-drinks:meal-delivery" },
      { expenseId: "e2", category: "transport:ride-share" },
    ]));
    await waitFor(() => expect(screen.getByText("All caught up")).toBeInTheDocument());
  });

  it("Not an expense / Never track dismiss the payment", async () => {
    state.pending = [pendingExpense("e1", "BKASH AGENT", "agent", "other:uncategorized")];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Never track payments to BKASH AGENT/ }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith(expect.objectContaining({ alwaysIgnore: true })));
  });

  it("Confirm is the only full-size button; removing is a quiet link below it", () => {
    state.pending = [pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery")];
    renderDialog();
    const confirmBtn = screen.getByRole("button", { name: /^Confirm$/ });
    const notExpense = screen.getByRole("button", { name: "Not an expense" });
    expect(confirmBtn).toHaveClass("w-full");
    // Not side by side any more: the link comes after Confirm in its own row
    expect(confirmBtn.parentElement).not.toBe(notExpense.parentElement);
    expect(confirmBtn.compareDocumentPosition(notExpense) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Not an expense can be undone, and the card comes back", async () => {
    const snapshot = { rule: undefined };
    dismiss.mockResolvedValueOnce(snapshot);
    const e1 = pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery");
    state.pending = [e1];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Not an expense" }));
    await waitFor(() => expect(dismiss).toHaveBeenCalledWith({ expense: e1, alwaysIgnore: false }));
    await waitFor(() => expect(screen.getByText("All caught up")).toBeInTheDocument());

    await clickUndo("Removed — not an expense", "৳120 · FOODPANDA LIMITED");
    expect(undoDismiss).toHaveBeenCalledWith({ expense: e1, undo: snapshot });
    await waitFor(() => expect(screen.getByText("FOODPANDA LIMITED")).toBeInTheDocument());
    // The bar goes away once used, and no toast was needed
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("the Undo bar expires after a few seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      state.pending = [pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery")];
      renderDialog();
      fireEvent.click(screen.getByRole("button", { name: "Not an expense" }));
      expect(await screen.findByRole("status")).toBeInTheDocument();
      await act(async () => { vi.advanceTimersByTime(6000); });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Never track passes the old rule to Undo so it can be put back", async () => {
    const before = rule("agent", "finance:cash-withdrawal", 2);
    const snapshot = { rule: { pattern: "agent", before } };
    dismiss.mockResolvedValueOnce(snapshot);
    state.pending = [pendingExpense("e1", "BKASH AGENT", "agent", "other:uncategorized")];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Never track payments to BKASH AGENT/ }));
    await waitFor(() => expect(dismiss).toHaveBeenCalled());
    await clickUndo("BKASH AGENT will be ignored from now on", "৳120 · BKASH AGENT");
    expect(undoDismiss).toHaveBeenCalledWith(expect.objectContaining({ undo: snapshot }));
  });

  it("Ignore on an SMS card can be undone", async () => {
    state.reviewSms = [credit];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Ignore" }));
    await waitFor(() => expect(ignore).toHaveBeenCalledWith({ sms: credit, alwaysIgnore: false }));
    await clickUndo("Ignored", "BDT 2,500 · 01912345678");
    expect(undoIgnore).toHaveBeenCalledWith({ sms: credit, undo: {} });
    await waitFor(() => expect(screen.getByText("Money in")).toBeInTheDocument());
  });

  it("a failed undo says so instead of pretending", async () => {
    undoDismiss.mockRejectedValueOnce(new Error("offline"));
    state.pending = [pendingExpense("e1", "FOODPANDA LIMITED", "foodpanda", "food-drinks:meal-delivery")];
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Not an expense" }));
    await waitFor(() => expect(screen.getByText("All caught up")).toBeInTheDocument());
    await clickUndo("Removed — not an expense", "৳120 · FOODPANDA LIMITED");
    expect(toast.error).toHaveBeenCalledWith("Couldn't undo");
    expect(screen.getByRole("status")).toBeInTheDocument(); // still there to retry
    expect(screen.queryByText("FOODPANDA LIMITED")).not.toBeInTheDocument();
  });

  it("money received defaults to Income and saves the SMS amount", async () => {
    state.reviewSms = [credit];
    renderDialog();
    expect(screen.getByText("Money in")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2500")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save income/ }));
    await waitFor(() => expect(logIncome).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2500, source: "Other", date: "2026-10-13" }),
    ));
  });

  it("foreign-currency charges ask for the BDT amount", async () => {
    state.reviewSms = [{ ...credit, id: "usd", direction: "debit", currency: "USD", amount: 15.49, merchant: "NETFLIX.COM", merchant_key: "netflix", is_person: false }];
    renderDialog();
    expect(screen.getByText("Foreign-currency charge")).toBeInTheDocument();
    expect(screen.getByText(/Charged in USD/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    await waitFor(() => expect(logExpense).not.toHaveBeenCalled()); // amount still empty
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "1,850" } });
    fireEvent.click(screen.getByRole("button", { name: /Save expense/ }));
    await waitFor(() => expect(logExpense).toHaveBeenCalledWith(expect.objectContaining({ amount: 1850 })));
  });

  it("shows the caught-up state when nothing is waiting", () => {
    renderDialog();
    expect(screen.getByText("All caught up")).toBeInTheDocument();
    expect(screen.getByText(/Missed an SMS\? Paste it/)).toBeInTheDocument();
  });
});
