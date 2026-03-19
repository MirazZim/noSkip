import { useState, useRef } from "react";
import { TrendingUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Income, INCOME_SOURCE_COLORS, type IncomeSource } from "@/hooks/useIncomes";
import { useCurrency } from "@/hooks/useCurrency";
import { Button } from "@/components/ui/button";
import { AddIncomeDialog } from "./AddIncomeDialog";

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_WIDTH = 136;
const SWIPE_THRESH = 40;
const EASE = "cubic-bezier(0.25,1,0.5,1)";
const DURATION = "0.28s";

// ─── Income Icon ──────────────────────────────────────────────────────────────

function IncomeIcon({ source, color }: { source: string; color: string }) {
    return (
        <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${color}20` }}
        >
            <TrendingUp className="h-4 w-4" style={{ color }} strokeWidth={2} />
        </div>
    );
}

// ─── Swipe Row ────────────────────────────────────────────────────────────────

interface SwipeRowProps {
    inc: Income;
    color: string;
    formatAmount: (n: number) => string;
    onEdit: () => void;
    openId: string | null;
    setOpenId: (id: string | null) => void;
}

function SwipeRow({ inc, color, formatAmount, onEdit, openId, setOpenId }: SwipeRowProps) {
    const isOpen = openId === inc.id;
    const startX = useRef(0);
    const startY = useRef(0);
    const baseX = useRef(0);
    const curX = useRef(0);
    const dragging = useRef(false);
    const axisLocked = useRef<"h" | "v" | null>(null);
    const rowRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    function commit(x: number, animated: boolean) {
        const row = rowRef.current;
        const content = contentRef.current;
        if (!row || !content) return;
        const t = animated ? `${DURATION} ${EASE}` : "none";
        row.style.transition = t;
        row.style.transform = `translateX(${x}px)`;
        content.style.transition = t;
        content.style.opacity = String(1 - (Math.abs(x) / ACTION_WIDTH) * 0.78);
    }

    function snapTo(open: boolean) {
        commit(open ? -ACTION_WIDTH : 0, true);
        setOpenId(open ? inc.id : null);
    }

    function onTouchStart(e: React.TouchEvent) {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        baseX.current = isOpen ? -ACTION_WIDTH : 0;
        curX.current = baseX.current;
        dragging.current = true;
        axisLocked.current = null;
        commit(baseX.current, false);
    }

    function onTouchMove(e: React.TouchEvent) {
        if (!dragging.current) return;
        const dx = e.touches[0].clientX - startX.current;
        const dy = e.touches[0].clientY - startY.current;
        if (axisLocked.current === null)
            axisLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        if (axisLocked.current !== "h") return;
        e.preventDefault();
        if (openId && openId !== inc.id) setOpenId(null);
        curX.current = Math.max(-ACTION_WIDTH, Math.min(0, baseX.current + dx));
        commit(curX.current, false);
    }

    function onTouchEnd() {
        dragging.current = false;
        if (axisLocked.current !== "h") return;
        const delta = curX.current - baseX.current;
        snapTo(isOpen ? delta < -(SWIPE_THRESH / 2) : curX.current < -SWIPE_THRESH);
    }

    return (
        <div className="relative overflow-hidden">
            {/* Action tray — single Edit button opens the unified dialog (edit+delete inside) */}
            <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_WIDTH / 2 }}>
                <button
                    onPointerDown={(e) => { e.stopPropagation(); snapTo(false); onEdit(); }}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-violet-500 text-white select-none active:brightness-90 transition-[filter]"
                >
                    <Pencil className="h-4 w-4" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Edit</span>
                </button>
            </div>

            {/* Sliding row */}
            <div
                ref={rowRef}
                className="group relative bg-card will-change-transform"
                style={{ touchAction: "pan-y" }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onClick={() => { if (isOpen) snapTo(false); }}
            >
                {/* Accent bar */}
                <div
                    className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full"
                    style={{ backgroundColor: color }}
                />

                <div ref={contentRef} className="flex items-center gap-3 px-4 py-3.5">
                    <IncomeIcon source={inc.source} color={color} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold truncate leading-snug">{inc.source}</p>
                            <span
                                className="shrink-0 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: `${color}18`, color }}
                            >
                                Income
                            </span>
                        </div>
                        {inc.note && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{inc.note}</p>
                        )}
                    </div>
                    <span className="text-sm font-black tabular-nums shrink-0" style={{ color }}>
                        +{formatAmount(inc.amount)}
                    </span>
                </div>

                {/* Desktop hover — single Edit action, delete is inside the dialog */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center
          opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0
          transition-all duration-150 pointer-events-none group-hover:pointer-events-auto">
                    <div className="flex gap-0.5 rounded-xl border border-border/70 bg-card/95 shadow-sm px-0.5 py-0.5 backdrop-blur-sm">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg"
                            onClick={onEdit}
                        >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── IncomeList ───────────────────────────────────────────────────────────────

interface IncomeListProps {
    incomes: Income[];
    title?: string;
}

export function IncomeList({ incomes, title }: IncomeListProps) {
    const { formatAmount } = useCurrency();
    const [editingIncome, setEditingIncome] = useState<Income | null>(null);
    const [openRowId, setOpenRowId] = useState<string | null>(null);

    function resolveColor(source: string): string {
        return INCOME_SOURCE_COLORS[source as IncomeSource] ?? "hsl(142, 72%, 45%)";
    }

    const dayTotal = incomes.reduce((sum, i) => sum + i.amount, 0);

    if (!incomes.length) return null;

    return (
        <>
            {title && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    {title}
                </p>
            )}

            {/* Day income total */}
            <div className="flex items-center justify-end mb-4">
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-emerald-500/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    <div className="relative inline-flex items-center gap-3 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 shadow-sm backdrop-blur-sm">
                        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white">
                            <span className="text-[10px] font-black">↑</span>
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Income
                        </span>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{formatAmount(dayTotal)}
                        </span>
                    </div>
                </div>
            </div>

            <p className="sm:hidden text-[10px] text-muted-foreground/35 text-right mb-1.5 select-none pr-1">
                ← swipe to edit
            </p>

            <div className="rounded-2xl border border-border/60 overflow-hidden divide-y divide-border/40 shadow-sm">
                {incomes.map((inc, idx) => (
                    <div
                        key={inc.id}
                        style={{ animation: "rowIn 0.3s ease both", animationDelay: `${idx * 35}ms` }}
                    >
                        <SwipeRow
                            inc={inc}
                            color={resolveColor(inc.source)}
                            formatAmount={formatAmount}
                            onEdit={() => setEditingIncome(inc)}
                            openId={openRowId}
                            setOpenId={setOpenRowId}
                        />
                    </div>
                ))}
            </div>

            <style>{`
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

            {/* Unified dialog handles edit + delete */}
            <AddIncomeDialog
                income={editingIncome}
                open={!!editingIncome}
                onOpenChange={(open) => !open && setEditingIncome(null)}
            />
        </>
    );
}