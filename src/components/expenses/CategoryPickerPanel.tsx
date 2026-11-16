import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { CreateCategoryPanel } from "@/components/expenses/AddExpenseDialog";
import { EXPENSE_CATEGORIES, buildCategoryValue, getCategoryColor, parseCategoryValue } from "@/hooks/useExpenses";
import type { CustomCategory } from "@/hooks/useCustomCategories";
import { describeCategory, searchCategories, type CategoryMatch } from "@/lib/categorySearch";
import { cn } from "@/lib/utils";

// iOS-flavoured category picking for the SMS review cards:
//   CategoryRow          — the card shows the choice as one inset-grouped row
//   CategoryPickerPanel  — tapping it swaps the card face for a nav bar, an iOS
//                          search bar and the list of groups; tapping a group
//                          drills into its categories, like a Settings page.
// Colours come from theme tokens, so it reads right in light and dark.

/** San Francisco on Apple devices, Inter elsewhere. */
export const IOS_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", Inter, system-ui, sans-serif';

const tint = (color: string, alpha: number) => `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
const CUSTOM = "__custom";
/** Search shows this many matches at most, so the results fit on the card too. */
const MAX_RESULTS = 4;
/** Group names that won't fit under a grid icon. */
const SHORT: Record<string, string> = {
  health: "Health",
  "personal-habits": "Habits",
  communication: "Phone & Net",
  entertainment: "Fun",
};

/** Just the emoji, big, with a soft shadow; `glow` adds a halo in the category's colour. */
function IconSquare({ emoji, color, size = 30, glow = false }: { emoji?: string; color: string; size?: number; glow?: boolean }) {
  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.82, lineHeight: 1 }}
    >
      {glow && (
        <span
          className="ios-halo pointer-events-none absolute rounded-full"
          style={{ inset: -size * 0.28, background: `radial-gradient(circle, ${tint(color, 0.55)} 0%, ${tint(color, 0.18)} 45%, transparent 70%)` }}
        />
      )}
      {emoji ? (
        <span className="relative" style={{ filter: "drop-shadow(0 2px 3px hsl(0 0% 0% / 0.3))" }}>{emoji}</span>
      ) : (
        <span className="relative rounded-full" style={{ width: size * 0.38, height: size * 0.38, background: color }} />
      )}
    </span>
  );
}

// ─── On the card ──────────────────────────────────────────────────────────────

/** The chosen category as one tappable pill: emoji, name, its group, and a chevron that says "tap to change". */
export function CategoryPill({
  value, customCategories, onClick,
}: {
  value: string;
  customCategories: CustomCategory[];
  onClick: () => void;
}) {
  const info = describeCategory(value, customCategories);
  const color = info?.color ?? "#8e8e93";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={info ? `Category: ${info.parent ? `${info.parent}, ` : ""}${info.label}. Change` : "Choose a category"}
      className="ios-press mx-auto flex h-11 max-w-full items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.06] pl-2.5 pr-3.5 shadow-[inset_0_0.5px_0_hsl(0_0%_100%/0.1)] hover:bg-foreground/[0.09]"
    >
      <IconSquare emoji={info?.emoji} color={color} size={28} />
      <span className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.01em]">{info?.label ?? "Choose a category"}</span>
      {info?.parent && <span className="hidden shrink-0 text-[13px] text-muted-foreground min-[360px]:inline">· {info.parent}</span>}
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.75} />
    </button>
  );
}

// ─── Full-card picker ─────────────────────────────────────────────────────────

interface Row {
  value: string; emoji?: string; label: string; sub?: string; color: string;
  /** Drill-in row: shows `detail` in grey on the right and a chevron instead of a checkmark. */
  drill?: boolean; detail?: string;
}

/** An inset grouped list: rounded section, hairline separators inset past the icon. */
function GroupedList({
  rows, selected, active, onPick, idPrefix,
}: {
  rows: Row[];
  selected: string;
  active?: number;
  onPick: (value: string) => void;
  idPrefix?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-foreground/[0.06]" role="listbox">
      {rows.map((r, i) => {
        const isSel = !r.drill && r.value === selected;
        return (
          <button
            key={r.value}
            id={idPrefix ? `${idPrefix}-${i}` : undefined}
            type="button"
            role={r.drill ? undefined : "option"}
            aria-selected={r.drill ? undefined : isSel}
            onClick={() => onPick(r.value)}
            className={cn(
              "ios-row relative flex w-full items-center gap-3 px-3 py-[9px] text-left transition-colors",
              i === active ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04] active:bg-foreground/[0.08]",
            )}
          >
            <IconSquare emoji={r.emoji} color={r.color} />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[16px] tracking-[-0.01em]", isSel && "font-semibold")}>{r.label}</span>
              {r.sub && <span className="block truncate text-[12px] text-muted-foreground">{r.sub}</span>}
            </span>
            {r.drill ? (
              <span className="flex min-w-0 max-w-[45%] shrink-0 items-center gap-0.5 text-[15px] text-muted-foreground">
                {r.detail && <span className="truncate">{r.detail}</span>}
                <ChevronRight className="h-4 w-4 shrink-0 opacity-50" strokeWidth={2.5} />
              </span>
            ) : (
              isSel && <Check className="h-[18px] w-[18px] shrink-0 text-primary" strokeWidth={2.75} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CategoryPickerPanel({
  value, onChange, customCategories, onClose,
}: {
  value: string;
  onChange: (c: string) => void;
  customCategories: CustomCategory[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // null = the list of groups; a group id = that group's categories
  const [group, setGroup] = useState<string | null>(null);

  const isCustom = customCategories.some((c) => c.name === value);
  const currentGroup = isCustom ? CUSTOM : parseCategoryValue(value).parentId;
  const current = describeCategory(value, customCategories);

  const matches: CategoryMatch[] = searchCategories(query, customCategories);
  const searching = query.trim().length > 0;
  useEffect(() => setActive(0), [query]);

  const pick = (v: string) => { onChange(v); onClose(); };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) pick(matches[active].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // leave the search, not the dialog
      if (query) setQuery(""); else inputRef.current?.blur();
    }
  };

  const cancelSearch = () => { setQuery(""); inputRef.current?.blur(); setFocused(false); };

  const groupList: Row[] = [
    ...EXPENSE_CATEGORIES.map((c) => ({
      value: c.id, emoji: c.emoji, label: c.label, color: getCategoryColor(c.id, customCategories) ?? "#8e8e93",
      drill: true, detail: c.id === currentGroup ? current?.label : undefined,
    })),
    ...(customCategories.length
      ? [{ value: CUSTOM, emoji: "✨", label: "Custom", color: "#8e8e93", drill: true, detail: isCustom ? value : undefined }]
      : []),
  ];

  const groupRows: Row[] = group === CUSTOM
    ? customCategories.map((c) => ({ value: c.name, label: c.name, color: c.color }))
    : (() => {
        const p = EXPENSE_CATEGORIES.find((c) => c.id === group) ?? EXPENSE_CATEGORIES[0];
        const color = getCategoryColor(p.id, customCategories) ?? "#8e8e93";
        return p.subcategories.map((s) => ({ value: buildCategoryValue(p.id, s.id), emoji: s.emoji, label: s.label, color }));
      })();
  const groupTitle = group === CUSTOM ? "Custom" : EXPENSE_CATEGORIES.find((c) => c.id === group)?.label ?? "Category";
  const glow = group && !searching
    ? (groupRows[0]?.color ?? "#8e8e93")
    : (current?.color ?? "#8e8e93");
  // Back: out of a group to the list of groups, or from there back to the payment
  const back = () => (group && !searching ? setGroup(null) : onClose());

  if (creating) {
    return (
      <div className="ios-panel" data-no-drag>
        <CreateCategoryPanel
          existingNames={[...EXPENSE_CATEGORIES.map((c) => c.id), ...customCategories.map((c) => c.name)]}
          onCancel={() => setCreating(false)}
          onCreated={(cat) => pick(cat.name)}
        />
      </div>
    );
  }

  return (
    // data-no-drag: no accidental card swipes while choosing
    <div className="ios-panel relative flex flex-col gap-2.5" data-no-drag>
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-5 -z-10 transition-[background] duration-500"
        style={{ background: `radial-gradient(90% 55% at 50% 0%, ${tint(glow, group && !searching ? 0.32 : 0.14)}, transparent 70%)` }}
      />
      {/* Nav bar */}
      <div className="relative flex h-9 items-center justify-center">
        <button
          type="button"
          onClick={back}
          className="absolute -left-1.5 flex items-center text-[17px] text-primary active:opacity-50"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2.5} /> {group && !searching ? "Groups" : "Back"}
        </button>
        <p className="max-w-[55%] truncate text-[17px] font-semibold tracking-[-0.02em]">{searching || !group ? "Category" : groupTitle}</p>
      </div>

      {/* Search bar, with Cancel sliding in while in use */}
      <div className="flex items-center gap-2">
        <label className="flex h-9 flex-1 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3 shadow-[inset_0_1px_2px_hsl(0_0%_0%/0.12),0_0.5px_0_hsl(0_0%_100%/0.08)] transition-colors focus-within:bg-foreground/[0.11]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
          <input
            ref={inputRef}
            autoFocus={typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search"
            aria-label="Search categories"
            role="combobox"
            aria-expanded={searching}
            aria-activedescendant={searching && matches[active] ? `cat-res-${active}` : undefined}
            enterKeyHint="done"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-muted-foreground/60 text-background"
            >
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          )}
        </label>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={cancelSearch}
          className={cn(
            "overflow-hidden whitespace-nowrap text-[17px] text-primary transition-all duration-200",
            focused || query ? "max-w-24 opacity-100" : "max-w-0 opacity-0",
          )}
          tabIndex={focused || query ? 0 : -1}
        >
          Cancel
        </button>
      </div>

      {searching ? (
        matches.length ? (
          <>
            <GroupedList
              rows={matches.slice(0, MAX_RESULTS).map((m) => ({ value: m.value, emoji: m.emoji, label: m.label, sub: m.parent || "Custom", color: m.color }))}
              selected={value}
              active={active}
              onPick={pick}
              idPrefix="cat-res"
            />
            {matches.length > MAX_RESULTS && (
              <p className="text-center text-[12px] text-muted-foreground">
                {matches.length - MAX_RESULTS} more. Keep typing to narrow it down.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <Search className="mb-2 h-9 w-9 text-muted-foreground/50" strokeWidth={2} />
            <p className="text-[20px] font-bold tracking-[-0.02em]">No Results</p>
            <p className="text-[15px] text-muted-foreground">for “{query.trim()}”</p>
            <button type="button" onClick={() => setCreating(true)} className="mt-3 text-[15px] font-medium text-primary active:opacity-50">
              Create “{query.trim().slice(0, 24)}” as a category
            </button>
          </div>
        )
      ) : (
        // Grids, not lists: every group (and every category in a group) fits on the card without scrolling
        group ? (
          <div key={group} className="grid grid-cols-3 gap-1.5">
            {groupRows.map((r, i) => {
              const on = r.value === value;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => pick(r.value)}
                  aria-pressed={on}
                  className="ios-pop ios-tile relative flex flex-col items-center gap-1.5 overflow-hidden rounded-[16px] border px-1 pb-2 pt-2.5 text-center"
                  style={{
                    "--i": i,
                    background: on
                      ? `linear-gradient(160deg, ${tint(r.color, 0.42)}, ${tint(r.color, 0.18)})`
                      : `linear-gradient(160deg, ${tint(r.color, 0.13)}, hsl(var(--foreground) / 0.04))`,
                    borderColor: on ? tint(r.color, 0.7) : "hsl(var(--foreground) / 0.07)",
                    boxShadow: on ? `0 8px 22px -8px ${tint(r.color, 0.8)}, inset 0 1px 0 hsl(0 0% 100% / 0.18)` : "inset 0 1px 0 hsl(0 0% 100% / 0.06)",
                  } as React.CSSProperties}
                >
                  <IconSquare emoji={r.emoji} color={r.color} size={34} glow={on} />
                  <span className={cn("line-clamp-2 text-[12px] leading-[1.2]", on ? "font-semibold" : "text-foreground/85")}>{r.label}</span>
                  {on && (
                    <span
                      className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white"
                      style={{ background: r.color, boxShadow: `0 0 0 2px hsl(var(--card)), 0 2px 6px ${tint(r.color, 0.7)}` }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div key="groups" className="grid grid-cols-4 gap-x-1 gap-y-1.5">
            {groupList.map((r, i) => {
              const on = r.value === currentGroup;
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setGroup(r.value)}
                  aria-label={on && r.detail ? `${r.label}, now ${r.detail}` : r.label}
                  className="ios-pop ios-icon flex flex-col items-center gap-[3px] rounded-[12px] py-0.5 text-center"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className={cn(on && "ios-here")}>
                    <IconSquare emoji={r.emoji} color={r.color} size={34} glow={on} />
                  </span>
                  <span className={cn("w-full truncate px-0.5 text-[11px] leading-tight", on ? "font-semibold text-foreground" : "text-foreground/75")}>
                    {SHORT[r.value] ?? r.label}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="ios-pop ios-icon flex flex-col items-center gap-[3px] rounded-[12px] py-0.5 text-center"
              style={{ "--i": groupList.length } as React.CSSProperties}
            >
              <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-dashed border-primary/50 text-primary">
                <Plus className="h-4 w-4" strokeWidth={2.75} />
              </span>
              <span className="text-[11px] leading-tight text-primary">New</span>
            </button>
          </div>
        )
      )}

      <style>{`
        .ios-panel { animation: iosPush 0.32s cubic-bezier(0.32, 0.72, 0, 1) both; }
        @keyframes iosPush { from { opacity: 0; transform: translateX(22px); } to { opacity: 1; transform: none; } }
        .ios-fade { animation: iosFade 0.2s ease both; }
        .ios-push { animation: iosPush 0.3s cubic-bezier(0.32, 0.72, 0, 1) both; }
        /* tiles spring in one after another */
        .ios-pop { animation: iosPop 0.42s cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--i, 0) * 14ms); }
        @keyframes iosPop { from { opacity: 0; transform: scale(0.6) translateY(6px); } to { opacity: 1; transform: none; } }
        /* press: a quick squish, like a home-screen icon */
        .ios-icon:active > span:first-child, .ios-tile:active { transform: scale(0.88); transition: transform 0.12s; }
        .ios-icon > span:first-child, .ios-tile { transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .ios-icon:hover > span:first-child { transform: translateY(-2px); }
        /* the group you're in breathes softly */
        .ios-here .ios-halo { animation: iosHere 2.4s ease-in-out infinite; }
        @keyframes iosHere { 50% { transform: scale(1.15); opacity: 0.75; } }
        @keyframes iosFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .ios-section { padding: 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.02em; color: hsl(var(--muted-foreground)); }
        .ios-row + .ios-row::before {
          content: ""; position: absolute; top: 0; right: 0; left: 54px; height: 0.5px;
          background: hsl(var(--foreground) / 0.12);
        }
        @media (prefers-reduced-motion: reduce) { .ios-panel, .ios-fade, .ios-push, .ios-pop, .ios-here { animation: none; } }
      `}</style>
    </div>
  );
}
