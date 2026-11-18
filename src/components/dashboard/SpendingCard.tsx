import { useMemo } from "react";
import { format, getDaysInMonth, subDays, subMonths } from "date-fns";
import { ChevronRight, Wallet } from "lucide-react";
import { getCategoryColor, getParentLabel, getSubCategoryEmoji, getSubCategoryLabel, type Expense } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { SectionHeader, Widget } from "@/components/dashboard/Widget";
import { MAC } from "@/lib/macColors";
import { cn } from "@/lib/utils";

// ─── SPENDING: today at a glance ──────────────────────────────────────────────
// Today's total, how it compares with yesterday, and a slim bar towards today's
// allowance — your Overall budget spread over the days left in the month, or
// (without a budget) what you spend on a usual day. Then the latest expenses.

const categoryName = (c: string) => getSubCategoryLabel(c) ?? getParentLabel(c);
const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const chip = "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums";

interface Allowance { amount: number; kind: "budget" | "usual" }

export function SpendingCard({
  expenses, prevExpenses, overallBudget, onOpen, delay = 0,
}: {
  expenses: Expense[];             // this month
  prevExpenses?: Expense[];        // last month (for "yesterday" on the 1st, and a usual-day fallback)
  overallBudget: number | null;    // this month's Overall budget, if set
  onOpen: () => void;
  delay?: number;
}) {
  const { formatAmount } = useCurrency();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterStr = format(subDays(new Date(), 1), "yyyy-MM-dd");

  const allowance: Allowance | null = useMemo(() => {
    const d = new Date();
    const dom = d.getDate();
    const spentBefore = expenses.reduce((s, e) => (e.date < todayStr ? s + e.amount : s), 0);
    if (overallBudget && overallBudget > 0) {
      return { amount: Math.max(0, (overallBudget - spentBefore) / (getDaysInMonth(d) - dom + 1)), kind: "budget" };
    }
    if (dom > 1 && spentBefore > 0) return { amount: spentBefore / (dom - 1), kind: "usual" };
    const prevTotal = (prevExpenses ?? []).reduce((s, e) => s + e.amount, 0);
    if (prevTotal > 0) return { amount: prevTotal / getDaysInMonth(subMonths(d, 1)), kind: "usual" };
    return null;
  }, [expenses, prevExpenses, overallBudget, todayStr]);

  // Today's expenses, latest first.
  const today = useMemo(
    () => expenses.filter((e) => e.date === todayStr).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [expenses, todayStr]
  );
  const total = today.reduce((s, e) => s + e.amount, 0);
  const yesterTotal = [...(prevExpenses ?? []), ...expenses].reduce((s, e) => (e.date === yesterStr ? s + e.amount : s), 0);
  const delta = yesterTotal ? Math.round(((total - yesterTotal) / yesterTotal) * 100) : null;
  const left = allowance ? allowance.amount - total : 0;
  const over = !!allowance && left < 0;
  const fill = allowance && allowance.amount > 0 ? Math.min(1, total / allowance.amount) : over ? 1 : 0;

  return (
    <Widget className="col-span-2" delay={delay}>
      <SectionHeader
        icon={<Wallet />}
        title="Spending"
        subtitle={format(new Date(), "EEEE")}
        right={
          <button type="button" onClick={onOpen} aria-label="Open expenses"
            className="rounded-full p-1 text-muted-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
          </button>
        }
      />

      <p className="text-[11px] font-medium text-muted-foreground">
        Spent today · {today.length} {today.length === 1 ? "expense" : "expenses"}
      </p>
      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums">{formatAmount(total)}</p>
        {delta !== null && (
          <span className={chip} style={delta === 0
            ? { background: "hsl(var(--foreground) / 0.07)" }
            : { background: `${delta > 0 ? MAC.red : MAC.green}22`, color: delta > 0 ? MAC.red : MAC.green }}>
            {delta === 0 ? "same as yesterday" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs yesterday`}
          </span>
        )}
      </div>

      {/* Slim bar towards today's allowance */}
      {allowance && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${fill * 100}%`, background: over ? MAC.red : "hsl(var(--primary))" }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
            {allowance.kind === "budget"
              ? allowance.amount === 0
                ? "Monthly budget used up"
                : over
                  ? <><span style={{ color: MAC.red }}>{formatAmount(Math.round(-left))} over</span> today's budget of {formatAmount(Math.round(allowance.amount))}</>
                  : <><span className="font-semibold text-foreground">{formatAmount(Math.round(left))} left</span> of today's {formatAmount(Math.round(allowance.amount))} budget</>
              : over
                ? <>{formatAmount(Math.round(-left))} more than your usual day ({formatAmount(Math.round(allowance.amount))})</>
                : <>{formatAmount(Math.round(left))} under your usual day ({formatAmount(Math.round(allowance.amount))})</>}
          </p>
        </div>
      )}

      {today.length > 0 ? (
        <div className="mt-2 flex-1 divide-y divide-border/50">
          {today.slice(0, 3).map((e) => {
            const color = getCategoryColor(e.category);
            const emoji = getSubCategoryEmoji(e.category);
            const pending = e.origin === "sms" && e.review_status === "pending";
            return (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                {/* category colours are hsl(), so tint with color-mix rather than a hex alpha suffix */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px]"
                  style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                  {emoji ?? <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] leading-tight">{categoryName(e.category)}</p>
                  <p className="truncate text-[11px] leading-tight text-muted-foreground">
                    {clock(new Date(e.created_at))}{e.note ? ` · ${e.note}` : ""}
                  </p>
                </div>
                {pending && (
                  <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: `${MAC.orange}22`, color: MAC.orange }}
                    title="Imported from SMS — confirm its category">
                    Review
                  </span>
                )}
                <span className="shrink-0 text-[14px] font-medium tabular-nums">{formatAmount(e.amount)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="flex-1 py-6 text-center text-[13px] text-muted-foreground">No spending yet today 🌱</p>
      )}

      <button type="button" onClick={onOpen}
        className={cn("mt-1 flex items-center gap-0.5 self-start text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground")}>
        {today.length > 3 ? `+${today.length - 3} more · ` : ""}All expenses <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </Widget>
  );
}
