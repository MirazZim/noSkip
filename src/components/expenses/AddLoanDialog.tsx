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
      successMsg: (name) => `Got it! ${name} owes you 👍`,
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
      successMsg: (name) => `Got it! You owe ${name} 👍`,
    },
  ];

export function AddLoanDialog() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<LoanDirection>("lent");
  const [personName, setPersonName] = useState("");
  const [amount, setAmount] = useState("");
  const [loanDate, setLoanDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");

  const { mutateAsync: addLoan, isPending } = useAddLoan();
  const { symbol } = useCurrency();

  const active = DIRECTIONS.find((d) => d.value === direction)!;

  const reset = () => {
    setDirection("lent");
    setPersonName("");
    setAmount("");
    setLoanDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setNote("");
  };

  // Only allow digits and a single decimal point
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Strip anything that isn't a digit or decimal point
    const clean = val.replace(/[^0-9.]/g, "");
    // Prevent more than one decimal point
    const parts = clean.split(".");
    if (parts.length > 2) return;
    // Max 2 decimal places
    if (parts[1] && parts[1].length > 2) return;
    setAmount(clean);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!personName.trim()) { toast.error("Please enter the person's name."); return; }
    if (isNaN(amt) || amt <= 0) { toast.error("Please enter a valid amount."); return; }
    try {
      await addLoan({
        person_name: personName.trim(),
        amount: amt,
        direction,
        loan_date: loanDate,
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

      <DialogContent className="max-w-sm w-[calc(100vw-32px)] rounded-2xl p-0 overflow-hidden gap-0 max-h-[90dvh] overflow-y-auto">

        {/* ── Header ── */}
        <div className={cn(
          "px-4 pt-4 pb-3 border-b border-border/60 transition-colors duration-200",
          direction === "lent" ? "bg-emerald-500/[0.06]" : "bg-rose-500/[0.06]"
        )}>
          <DialogHeader>
            <DialogTitle className="text-sm font-black tracking-tight">Track a Loan</DialogTitle>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Keep a record so you never forget who owes what.
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

          {/* Amount — numbers only, no keyboard type="number" quirks */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">
              How much?{" "}
              <span className="text-muted-foreground font-normal">({symbol})</span>
            </Label>
            <Input
              inputMode="decimal"   // shows numeric keyboard on mobile
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              required
              className="rounded-xl h-9 text-sm font-bold"
            />
          </div>

          {/* Dates — side by side to save space */}
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