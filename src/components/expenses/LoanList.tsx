import { format, isPast, parseISO } from "date-fns";
import { useState, useRef } from "react";
import { Loan, useMarkLoanPaid, useDeleteLoan } from "@/hooks/useLoans";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Trash2, Clock, AlertCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AddLoanDialog } from "./AddLoanDialog";

interface Props {
  loans: Loan[];
  onEdit?: (loan: Loan) => void;
}

// ─── Swipeable Card ────────────────────────────────────────────────────────────
function LoanCard({ loan, onEdit }: { loan: Loan; onEdit?: (loan: Loan) => void }) {
  const { formatAmount } = useCurrency();
  const { mutate: markPaid, isPending: marking } = useMarkLoanPaid();
  const { mutate: deleteLoan, isPending: deleting } = useDeleteLoan();

  const isLent = loan.direction === "lent";
  const isOverdue = !loan.is_paid && loan.due_date && isPast(parseISO(loan.due_date));

  // ── Swipe state ──
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const SWIPE_THRESHOLD = 60;
  const SWIPE_MAX = 140;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = touchStartX.current - e.touches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.touches[0].clientY);
    if (dy > 10 && Math.abs(dx) < dy) { setIsSwiping(false); return; }
    if (!isSwiping) return;
    const clamped = Math.max(0, Math.min(dx, SWIPE_MAX));
    setSwipeX(clamped);
  };

  const handleTouchEnd = () => {
    setSwipeX(swipeX > SWIPE_THRESHOLD ? SWIPE_MAX : 0);
    setIsSwiping(false);
  };

  const closeSwipe = () => setSwipeX(0);

  const handleTogglePaid = () => {
    closeSwipe();
    markPaid(
      { id: loan.id, is_paid: !loan.is_paid },
      { onSuccess: () => toast.success(loan.is_paid ? "Marked as unpaid" : "All settled! ✓") }
    );
  };

  const handleDelete = () => {
    closeSwipe();
    deleteLoan(loan.id, { onSuccess: () => toast.success("Loan removed") });
  };

  const handleEdit = () => {
    closeSwipe();
    onEdit?.(loan);
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">

      {/* ── Action buttons — only visible on mobile swipe ── */}
      <div
        className="absolute inset-y-0 right-0 flex sm:hidden"
        style={{ width: SWIPE_MAX }}
      >
        <button
          onClick={handleEdit}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-blue-500 text-white active:brightness-90"
        >
          <Pencil className="h-4 w-4" />
          <span className="text-[10px] font-bold">Edit</span>
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-rose-500 text-white active:brightness-90"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-[10px] font-bold">Delete</span>
        </button>
      </div>

      {/* ── Card face — always solid bg so action buttons don't bleed through ── */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(-${swipeX}px)`,
          transition: isSwiping ? "none" : "transform 0.25s cubic-bezier(0.32,1,0.46,1)",
        }}
        className={cn(
          "group relative flex items-start gap-3 rounded-2xl border px-4 py-3.5 bg-card",
          loan.is_paid
            ? "border-border/30"
            : isOverdue
              ? "border-rose-500/30"
              : "border-border/60 hover:border-border"
        )}
      >
        {/* Tap to mark as paid */}
        <button
          onClick={handleTogglePaid}
          disabled={marking}
          className="mt-0.5 shrink-0 transition-transform active:scale-90"
          aria-label={loan.is_paid ? "Mark as not paid" : "Mark as paid"}
        >
          {loan.is_paid
            ? <CheckCircle2 className={cn("h-5 w-5", isLent ? "text-emerald-500" : "text-rose-400")} />
            : <Circle className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
          }
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-bold truncate", loan.is_paid ? "line-through text-muted-foreground/50" : "text-foreground")}>
              {loan.person_name}
            </span>
            <span className={cn(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide",
              isLent
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
            )}>
              {isLent ? "owes you" : "you owe"}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-rose-500">
                <AlertCircle className="h-3 w-3" />
                Overdue
              </span>
            )}
          </div>

          {loan.note && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{loan.note}</p>
          )}

          {loan.due_date && (
            <p className={cn(
              "flex items-center gap-1 text-xs mt-1",
              isOverdue && !loan.is_paid ? "text-rose-500" : "text-muted-foreground"
            )}>
              <Clock className="h-3 w-3" />
              Due by {format(parseISO(loan.due_date), "MMM d, yyyy")}
            </p>
          )}
        </div>

        {/* Amount + desktop hover actions */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={cn(
            "text-sm font-black tabular-nums",
            loan.is_paid ? "text-muted-foreground/50 line-through"
              : isLent ? "text-emerald-500"
                : "text-rose-500"
          )}>
            {formatAmount(loan.amount)}
          </span>

          <div className="hidden sm:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onEdit && (
              <button
                onClick={handleEdit}
                className="text-muted-foreground/50 hover:text-blue-500 transition-colors"
                aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-muted-foreground/50 hover:text-destructive transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main List ─────────────────────────────────────────────────────────────────
export function LoanList({ loans, onEdit }: Props) {
  const { formatAmount } = useCurrency();

  const lent = loans.filter((l) => l.direction === "lent" && !l.is_paid);
  const borrowed = loans.filter((l) => l.direction === "borrowed" && !l.is_paid);
  const settled = loans.filter((l) => l.is_paid);

  const totalOwedToYou = lent.reduce((s, l) => s + l.amount, 0);
  const totalYouOwe = borrowed.reduce((s, l) => s + l.amount, 0);

  if (loans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/60 bg-card/30 py-16 text-center">
        <div className="text-4xl">🤝</div>
        <div className="space-y-1">
          <p className="text-sm font-bold tracking-tight">No loans yet</p>
          <p className="text-xs text-muted-foreground">Keep track of money you gave or received</p>
        </div>
        <AddLoanDialog />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Summary ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            People owe you
          </p>
          <p className="text-xl font-black text-emerald-500 tabular-nums mt-0.5">
            {formatAmount(totalOwedToYou)}
          </p>
          <p className="text-xs text-muted-foreground">
            {lent.length} {lent.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
            You owe others
          </p>
          <p className="text-xl font-black text-rose-500 tabular-nums mt-0.5">
            {formatAmount(totalYouOwe)}
          </p>
          <p className="text-xs text-muted-foreground">
            {borrowed.length} {borrowed.length === 1 ? "person" : "people"}
          </p>
        </div>
      </div>

      {/* ── Mobile swipe hint + disclaimer ── */}
      <div className="flex sm:hidden items-start gap-2.5 rounded-xl border border-border/40 bg-muted/40 px-3.5 py-3">
        <span className="text-lg leading-none mt-0.5">👈</span>
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-foreground">Swipe left on any loan to edit or delete</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            ⚠️ Deleting a loan is permanent — it cannot be recovered. Please double-check before deleting.
          </p>
        </div>
      </div>

      {/* ── People who owe you ── */}
      {lent.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
            💸 People who owe you ({lent.length})
          </p>
          {lent.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onEdit={onEdit} />
          ))}
        </div>
      )}

      {/* ── People you owe ── */}
      {borrowed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
            🤝 People you owe ({borrowed.length})
          </p>
          {borrowed.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onEdit={onEdit} />
          ))}
        </div>
      )}

      {/* ── Settled ── */}
      {settled.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-1">
            ✅ All settled ({settled.length})
          </p>
          {settled.map((loan) => (
            <LoanCard key={loan.id} loan={loan} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}