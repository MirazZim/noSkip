import { useState } from "react";
import { format } from "date-fns";
import { useAddLoan, LoanDirection } from "@/hooks/useLoans";
import { useCurrency } from "@/hooks/useCurrency";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";

// Direction options in plain human language
const DIRECTIONS: {
  value: LoanDirection;
  emoji: string;
  title: string;
  subtitle: string;
  color: string;
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
      subtitle: "You lent money to someone",
      color: "emerald",
      activeClass: "border-emerald-500 bg-emerald-500/10",
      buttonClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
      personLabel: "Who did you give money to?",
      personPlaceholder: "e.g. Arif, Mom, Rafi...",
      successMsg: (name) => `Got it! ${name} owes you 👍`,
    },
    {
      value: "borrowed",
      emoji: "🤝",
      title: "Someone gave me",
      subtitle: "You received money from someone",
      color: "rose",
      activeClass: "border-rose-500 bg-rose-500/10",
      buttonClass: "bg-rose-500 hover:bg-rose-600 text-white",
      personLabel: "Who gave you the money?",
      personPlaceholder: "e.g. Karim, Office, Bank...",
      successMsg: (name) => `Got it! You owe ${name} 👍`,
    },
  ];

export function AddLoanDialog() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<LoanDirection>("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const { mutateAsync: addLoan, isPending } = useAddLoan();
  const { symbol } = useCurrency();

  const active = DIRECTIONS.find((d) => d.value === direction)!;

  const reset = () => {
    setDirection("lent");
    setPersonName("");
    setAmount("");
    setDueDate("");
    setNote("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!personName.trim()) {
      toast.error("Please enter the person's name.");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    try {
      await addLoan({
        person_name: personName.trim(),
        amount: amt,
        direction,
        due_date: dueDate || null,
        note: note.trim() || null,
      });
      toast.success(active.successMsg(personName.trim()));
      reset();
      setOpen(false);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-2 rounded-xl border-border/60 font-bold text-xs">
          <HandCoins className="h-3.5 w-3.5" />
          Add Loan
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden gap-0">

        {/* ── Top header bar ── */}
        <div className={cn(
          "px-5 pt-5 pb-4 border-b border-border/60 transition-colors duration-200",
          direction === "lent" ? "bg-emerald-500/[0.06]" : "bg-rose-500/[0.06]"
        )}>
          <DialogHeader>
            <DialogTitle className="text-base font-black tracking-tight">Track a Loan</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-0.5">
            Keep a record so you never forget who owes what.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5">

          {/* ── Step 1: Pick direction ── */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              What happened?
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDirection(d.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-2xl border-2 px-3.5 py-3 text-left transition-all duration-150",
                    direction === d.value
                      ? d.activeClass
                      : "border-border/50 bg-card hover:border-border"
                  )}
                >
                  <span className="text-xl">{d.emoji}</span>
                  <span className="text-sm font-bold leading-tight">{d.title}</span>
                  <span className="text-[11px] text-muted-foreground leading-tight">{d.subtitle}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: Person name ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              {active.personLabel}
            </Label>
            <Input
              placeholder={active.personPlaceholder}
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              required
              autoComplete="off"
              className="rounded-xl"
            />
          </div>

          {/* ── Step 3: Amount ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              How much? <span className="text-muted-foreground font-normal">({symbol})</span>
            </Label>
            <Input
              type="number"
              placeholder="0.00"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="rounded-xl text-lg font-bold"
            />
          </div>

          {/* ── Step 4: Due date (optional) ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              When should it be paid back?{" "}
              <span className="text-muted-foreground font-normal">— optional</span>
            </Label>
            <Input
              type="date"
              value={dueDate}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-xl"
            />
            {!dueDate && (
              <p className="text-[11px] text-muted-foreground">
                No deadline? Leave it empty.
              </p>
            )}
          </div>

          {/* ── Step 5: Note (optional) ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">
              What was it for?{" "}
              <span className="text-muted-foreground font-normal">— optional</span>
            </Label>
            <Input
              placeholder="e.g. Lunch, Birthday gift, Rent..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ── Submit ── */}
          <Button
            type="submit"
            disabled={isPending}
            className={cn("w-full rounded-xl font-bold text-sm h-11", active.buttonClass)}
          >
            {isPending
              ? "Saving..."
              : direction === "lent"
                ? `Save — ${personName.trim() || "they"} owe me`
                : `Save — I owe ${personName.trim() || "them"}`}
          </Button>

        </form>
      </DialogContent>
    </Dialog>
  );
}