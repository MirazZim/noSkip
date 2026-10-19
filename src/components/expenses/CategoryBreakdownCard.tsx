import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Sector } from "recharts";
import { ChevronRight } from "lucide-react";
import { Expense, getCategoryColor, getSubCategoryLabel, getSubCategoryEmoji, getParentLabel } from "@/hooks/useExpenses";
import { useCurrency } from "@/hooks/useCurrency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* ─── Focused slice: pops out with a thin halo ───────────────────────── */
function ActiveSlice(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={outerRadius + 7}
        startAngle={startAngle} endAngle={endAngle} fill={fill} cornerRadius={6} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 11} outerRadius={outerRadius + 13}
        startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.45} cornerRadius={2} />
    </g>
  );
}

const categoryName = (name: string) => getSubCategoryLabel(name) ?? getParentLabel(name);

/* ─── Category Breakdown Dialog ──────────────────────────────────────── */
function CategoryBreakdownDialog({
  open,
  onOpenChange,
  categoryData,
  total,
  formatAmount,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryData: { name: string; value: number }[];
  total: number;
  formatAmount: (n: number) => string;
}) {
  // Tapping a slice or a row focuses that category; tapping again clears it.
  const [active, setActive] = useState<number | null>(null);
  const toggle = (i: number) => setActive((a) => (a === i ? null : i));

  const focused = active !== null ? categoryData[active] : null;
  const focusedColor = focused ? getCategoryColor(focused.name) : undefined;
  const top3Share = total ? Math.round((categoryData.slice(0, 3).reduce((s, c) => s + c.value, 0) / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setActive(null); }}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0 overflow-hidden rounded-3xl border-border/40 shadow-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-1 shrink-0">
          <DialogTitle className="text-lg font-black tracking-tight leading-none">
            Category Breakdown
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {categoryData.length} categories · tap a slice to focus
          </p>
        </DialogHeader>

        {/* Scrolls without a visible scrollbar; edges fade out */}
        <div
          className="overflow-y-auto px-5 pb-5 flex flex-col gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            maskImage: "linear-gradient(180deg, transparent, black 12px, black calc(100% - 20px), transparent)",
            WebkitMaskImage: "linear-gradient(180deg, transparent, black 12px, black calc(100% - 20px), transparent)",
          }}
        >
          {/* Interactive donut */}
          <div className="relative mx-auto mt-2 h-[220px] w-[220px] shrink-0">
            {/* Soft glow in the focused (or top) category's colour */}
            <div
              className="absolute inset-8 rounded-full blur-2xl transition-colors duration-500"
              style={{ background: focusedColor ?? (categoryData[0] ? getCategoryColor(categoryData[0].name) : "transparent"), opacity: 0.18 }}
              aria-hidden="true"
            />
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={66}
                  outerRadius={90}
                  dataKey="value"
                  stroke="none"
                  paddingAngle={2.5}
                  cornerRadius={6}
                  activeIndex={active ?? undefined}
                  activeShape={ActiveSlice}
                  onClick={(_, i) => toggle(i)}
                  isAnimationActive
                >
                  {categoryData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={getCategoryColor(entry.name)}
                      fillOpacity={active === null || active === i ? 1 : 0.22}
                      className="cursor-pointer outline-none transition-[fill-opacity] duration-300"
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centre: total, or the focused category */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {focused ? (
                <div key={focused.name} className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
                  <span className="text-2xl leading-none">
                    {getSubCategoryEmoji(focused.name) ?? <span className="inline-block h-3 w-3 rounded-full" style={{ background: focusedColor }} />}
                  </span>
                  <span className="mt-1.5 max-w-[110px] truncate text-[11px] font-semibold text-muted-foreground">
                    {categoryName(focused.name)}
                  </span>
                  <span className="text-lg font-black tabular-nums leading-tight">{formatAmount(focused.value)}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: focusedColor }}>
                    {total ? ((focused.value / total) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              ) : (
                <div className="animate-in fade-in duration-300 flex flex-col items-center">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Total</span>
                  <span className="text-xl font-black tabular-nums leading-tight">{formatAmount(total)}</span>
                  <span className="text-[11px] text-muted-foreground">{categoryData.length} categories</span>
                </div>
              )}
            </div>
          </div>

          {/* Insight */}
          {categoryData.length > 3 && (
            <p className="mx-auto rounded-full bg-foreground/[0.05] px-3 py-1 text-center text-[11px] text-muted-foreground">
              Your top 3 categories make up <span className="font-bold text-foreground">{top3Share}%</span> of spending
            </p>
          )}

          {/* Ranked list */}
          <div className="flex flex-col gap-1">
            {categoryData.map((cat, i) => {
              const color = getCategoryColor(cat.name);
              const pct = total ? (cat.value / total) * 100 : 0;
              const emoji = getSubCategoryEmoji(cat.name);
              return (
                <button
                  key={cat.name}
                  onClick={() => toggle(i)}
                  className={cn(
                    "w-full rounded-2xl p-2.5 text-left transition-all duration-300",
                    active === i ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.03]",
                    active !== null && active !== i && "opacity-45"
                  )}
                  style={{ animation: "fadeSlideIn 0.25s ease both", animationDelay: `${i * 35}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-4 shrink-0 text-center text-[10px] font-bold text-muted-foreground tabular-nums">{i + 1}</span>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
                      style={{ background: `${color}22` }}
                    >
                      {emoji ?? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-foreground">{categoryName(cat.name)}</span>
                        <span className="shrink-0 font-bold tabular-nums" style={{ color }}>{formatAmount(cat.value)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: color,
                              animation: `growWidth 0.6s ease both`,
                              animationDelay: `${i * 35 + 80}ms`,
                            }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(-6px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes growWidth {
            from { width: 0%; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

/* ─── By Category card (Expenses → Overview, also on the Dashboard) ──── */
export function CategoryBreakdownCard({ expenses, className }: { expenses: Expense[]; className?: string }) {
  const { formatAmount } = useCurrency();
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const categoryData = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach((e) => { totals[e.category] = (totals[e.category] || 0) + e.amount; });
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const topCategory = categoryData[0];
  const topPct = total && topCategory ? Math.round((topCategory.value / total) * 100) : 0;

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden cursor-pointer hover:border-border transition-colors group",
          className
        )}
        onClick={() => categoryData.length > 0 && setBreakdownOpen(true)}
      >
        {/* panel header */}
        <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Breakdown</p>
            <p className="text-base font-black tracking-tight leading-tight">By Category</p>
          </div>
          <div className="flex items-center gap-2">
            {topCategory && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Top spend</p>
                <p className="text-sm font-bold" style={{ color: getCategoryColor(topCategory.name) }}>
                  {getSubCategoryEmoji(topCategory.name) ? `${getSubCategoryEmoji(topCategory.name)} ` : ""}
                  {getSubCategoryLabel(topCategory.name) ?? getParentLabel(topCategory.name)} · {topPct}%
                </p>
              </div>
            )}
            {categoryData.length > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            )}
          </div>
        </div>

        {categoryData.length > 0 ? (
          <div className="flex gap-2 p-4">
            {/* Donut */}
            <div className="w-[120px] h-[120px] shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={56}
                    dataKey="value"
                    strokeWidth={3}
                    stroke="hsl(var(--card))"
                    paddingAngle={2}
                  >
                    {categoryData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={getCategoryColor(entry.name)}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[10px] text-muted-foreground leading-none">total</span>
                <span className="text-xs font-black tabular-nums leading-tight">{formatAmount(total)}</span>
              </div>
            </div>

            {/* Category rows — preview top 5 */}
            <div className="flex-1 flex flex-col justify-center gap-2 min-w-0">
              {categoryData.slice(0, 5).map((cat, i) => {
                const color = getCategoryColor(cat.name);
                const pct = total ? (cat.value / total) * 100 : 0;
                return (
                  <div
                    key={cat.name}
                    className="group/row flex flex-col gap-0.5"
                    style={{ animation: "fadeSlideIn 0.3s ease both", animationDelay: `${i * 60}ms` }}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-foreground truncate flex items-center gap-1">
                        {getSubCategoryEmoji(cat.name) && <span className="leading-none">{getSubCategoryEmoji(cat.name)}</span>}
                        {getSubCategoryLabel(cat.name) ?? getParentLabel(cat.name)}
                      </span>
                      <span className="tabular-nums font-bold shrink-0 ml-2" style={{ color }}>
                        {formatAmount(cat.value)}
                      </span>
                    </div>
                    <div className="h-[5px] w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                          animation: `growWidth 0.6s ease both`,
                          animationDelay: `${i * 60 + 100}ms`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* "X more" hint */}
              {categoryData.length > 5 && (
                <p className="text-[10px] text-muted-foreground/60 font-semibold mt-0.5">
                  +{categoryData.length - 5} more · tap to see all
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[160px]">
            <p className="text-xs text-muted-foreground">No data yet</p>
          </div>
        )}

        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(-6px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes growWidth {
            from { width: 0%; }
          }
        `}</style>
      </div>

      {/* ── Full breakdown dialog ─────────────────────────────────────── */}
      <CategoryBreakdownDialog
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        categoryData={categoryData}
        total={total}
        formatAmount={formatAmount}
      />
    </>
  );
}
