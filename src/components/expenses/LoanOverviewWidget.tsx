import { useMemo } from "react";
import { format, isPast, parseISO } from "date-fns";
import { Loan } from "@/hooks/useLoans";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownLeft, AlertCircle, HandCoins, TrendingUp } from "lucide-react";

interface Props {
    loans: Loan[];
    onGoToLoans: () => void;
}

export function LoanOverviewWidget({ loans, onGoToLoans }: Props) {
    const { formatAmount } = useCurrency();

    const stats = useMemo(() => {
        const active = loans.filter((l) => !l.is_paid);
        const lent = active.filter((l) => l.direction === "lent");
        const borrowed = active.filter((l) => l.direction === "borrowed");

        const totalOwed = lent.reduce((s, l) => s + l.amount, 0);
        const totalOwe = borrowed.reduce((s, l) => s + l.amount, 0);
        const net = totalOwed - totalOwe;

        const overdue = active.filter(
            (l) => l.due_date && isPast(parseISO(l.due_date))
        );

        // Most urgent: overdue first, then earliest due date
        const urgent = [...active]
            .filter((l) => l.due_date)
            .sort((a, b) => {
                const aDate = parseISO(a.due_date!);
                const bDate = parseISO(b.due_date!);
                return aDate.getTime() - bDate.getTime();
            })
            .slice(0, 2);

        return { lent, borrowed, totalOwed, totalOwe, net, overdue, urgent, active };
    }, [loans]);

    if (loans.length === 0) return null;

    const netPositive = stats.net >= 0;

    return (
        <div
            className="rounded-2xl border border-border/60 bg-card overflow-hidden cursor-pointer group"
            onClick={onGoToLoans}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
                        <HandCoins className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-xs font-black tracking-tight">Loans</p>
                        <p className="text-[10px] text-muted-foreground">
                            {stats.active.length} active · {stats.overdue.length > 0 && (
                                <span className="text-rose-500 font-bold">{stats.overdue.length} overdue</span>
                            )}
                            {stats.overdue.length === 0 && "all on track"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    {/* Net position pill */}
                    <span className={cn(
                        "text-[10px] font-black px-2 py-1 rounded-full tabular-nums",
                        stats.net === 0
                            ? "bg-muted text-muted-foreground"
                            : netPositive
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : "bg-rose-500/15 text-rose-500"
                    )}>
                        Net {netPositive ? "+" : ""}{formatAmount(stats.net)}
                    </span>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
            </div>

            {/* ── Two stat columns ── */}
            <div className="grid grid-cols-2 divide-x divide-border/40">
                {/* Owed to you */}
                <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                        <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                            Owed to you
                        </p>
                        <p className="text-base font-black text-emerald-500 tabular-nums leading-tight">
                            {formatAmount(stats.totalOwed)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {stats.lent.length} {stats.lent.length === 1 ? "person" : "people"}
                        </p>
                    </div>
                </div>

                {/* You owe */}
                <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
                        <ArrowUpRight className="h-4 w-4 text-rose-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                            You owe
                        </p>
                        <p className="text-base font-black text-rose-500 tabular-nums leading-tight">
                            {formatAmount(stats.totalOwe)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {stats.borrowed.length} {stats.borrowed.length === 1 ? "person" : "people"}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Urgent items (overdue or nearest due date) ── */}
            {stats.urgent.length > 0 && (
                <div className="border-t border-border/40 px-4 py-2.5 space-y-1.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Coming up
                    </p>
                    {stats.urgent.map((loan) => {
                        const overdue = isPast(parseISO(loan.due_date!));
                        const isLent = loan.direction === "lent";
                        return (
                            <div key={loan.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {overdue && (
                                        <AlertCircle className="h-3 w-3 text-rose-500 shrink-0" />
                                    )}
                                    <span className="text-xs font-bold truncate">{loan.person_name}</span>
                                    <span className={cn(
                                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0",
                                        isLent
                                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                            : "bg-rose-500/15 text-rose-500"
                                    )}>
                                        {isLent ? "owes you" : "you owe"}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={cn(
                                        "text-xs font-black tabular-nums",
                                        isLent ? "text-emerald-500" : "text-rose-500"
                                    )}>
                                        {formatAmount(loan.amount)}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] font-bold",
                                        overdue ? "text-rose-500" : "text-muted-foreground"
                                    )}>
                                        {overdue ? "Overdue" : `Due ${format(parseISO(loan.due_date!), "MMM d")}`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Footer CTA ── */}
            <div className="border-t border-border/40 px-4 py-2 flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                    {loans.filter((l) => l.is_paid).length} settled all time
                </p>
                <p className="text-[10px] font-bold text-primary group-hover:underline transition-all">
                    View all loans →
                </p>
            </div>
        </div>
    );
}