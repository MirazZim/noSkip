import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useUpdateLoan, Loan, LoanDirection } from "@/hooks/useLoans";
import { useCurrency } from "@/hooks/useCurrency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DIRECTIONS: {
  value: LoanDirection;
  emoji: string;
  title: string;
  subtitle: string;
  activeClass: string;
  buttonClass: string;
  personLabel: string;
  personPlaceholder: string;
  successMsg: (name: string) => string;
}[] = [
    {
      value: "lent",
      emoji: "💸",
      title: "I gave money",
      subtitle: "They owe you",
      activeClass: "border-emerald-500 bg-emerald-500/10",
      buttonClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
      personLabel: "Who did you give money to?",
      personPlaceholder: "e.g. Arif, Mom, Rafi...",
      successMsg: (name) => `Updated! ${name} owes you 👍`,
    },
    {
      value: "borrowed",
      emoji: "🤝",
      title: "Someone gave me",
      subtitle: "You owe them",
      activeClass: "border-rose-500 bg-rose-500/10",
      buttonClass: "bg-rose-500 hover:bg-rose-600 text-white",
      personLabel: "Who gave you the money?",
      personPlaceholder: "e.g. Karim, Office, Bank...",
      successMsg: (name) => `Updated! You owe ${name} 👍`,
    },
  ];

interface Props {
  loan: Loan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditLoanDialog({ loan, open, onOpenChange }: Props) {
  const [direction, setDirection] = useState<LoanDirection>("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [loanDate, setLoanDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const { mutateAsync: updateLoan, isPending } = useUpdateLoan();
  const { symbol } = useCurrency();

  const active = DIRECTIONS.find((d) => d.value === direction)!;

  // Populate form when loan changes
  useEffect(() => {
    if (loan) {
      setDirection(loan.direction);
      setPersonName(loan.person_name);
      setAmount(loan.amount.toString());
      setLoanDate(loan.loan_date);
      setDueDate(loan.due_date || "");
      setNote(loan.note || "");
    }
  }, [loan]);

  // Only allow digits and a single decimal point
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const clean = val.replace(/[^0-9.]/g, "");
    const parts = clean.split(".");
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loan) return;

    const amt = parseFloat(amount);
    if (!personName.trim()) { toast.error("Please enter the person's name."); return; }
    if (isNaN(amt) || amt <= 0) { toast.error("Please enter a valid amount."); return; }

    try {
      await updateLoan({
        id: loan.id,
        updates: {
          person_name: personName.trim(),
          amount: amt,
          direction,
          loan_date: loanDate,
          due_date: dueDate || null,
          note: note.trim() || null,
        },
        oldLoan: loan,
      });
      toast.success(active.successMsg(personName.trim()));
      onOpenChange(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  };

  if (!loan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100vw-32px)] rounded-2xl p-0 overflow-hidden gap-0 max-h-[90dvh] overflow-y-auto">

        {/* ── Header ── */}
        <div className={cn(
          "px-4 pt-4 pb-3 border-b border-border/60 transition-colors duration-200",
          direction === "lent" ? "bg-emerald-500/[0.06]" : "bg-rose-500/[0.06]"
        )}>
          <DialogHeader>
            <DialogTitle className="text-sm font-black tracking-tight">Edit Loan</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Update the loan details below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3.5">

          {/* Direction — compact two cards */}
          <div className="grid grid-cols-2 gap-2">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDirection(d.value)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-all duration-150",
                  direction === d.value ? d.activeClass : "border-border/50 bg-card hover:border-border"
                )}
              >
                <span className="text-lg shrink-0">{d.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight truncate">{d.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{d.subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Person name */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">{active.personLabel}</Label>
            <Input
              placeholder={active.personPlaceholder}
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              required
              autoComplete="off"
              className="rounded-xl h-9 text-sm"
            />
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">
              How much?{" "}
              <span className="text-muted-foreground font-normal">({symbol})</span>
            </Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              required
              className="rounded-xl h-9 text-sm font-bold"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs font-bold">When?</Label>
              <Input
                type="date"
                value={loanDate}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setLoanDate(e.target.value)}
                className="rounded-xl h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-bold">
                Due date{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                type="date"
                value={dueDate}
                min={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-xl h-9 text-xs"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">
              What for?{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Lunch, Birthday gift, Rent..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl h-9 text-sm"
            />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={isPending}
            className={cn("w-full rounded-xl font-bold text-sm h-10 mt-1", active.buttonClass)}
          >
            {isPending ? "Updating..." : "Update Loan"}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
}
