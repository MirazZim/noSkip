import { EXPENSE_CATEGORIES, buildCategoryValue, getCategoryColor } from "@/hooks/useExpenses";
import type { CustomCategory } from "@/hooks/useCustomCategories";

export interface CategoryMatch {
  value: string;
  emoji: string;
  label: string;
  /** Parent label shown under a subcategory; empty for custom categories. */
  parent: string;
  color: string;
}

/**
 * Every category the picker offers — each subcategory and each custom category —
 * matched on its own label and its parent's, so "food" finds all of Food & Drinks
 * and "pharm" finds Medicine / Pharmacy. Every word typed must appear somewhere.
 * Labels that start with the query rank first.
 */
export function searchCategories(query: string, customCategories: CustomCategory[]): CategoryMatch[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all: CategoryMatch[] = [
    ...EXPENSE_CATEGORIES.flatMap((p) =>
      p.subcategories.map((s) => ({
        value: buildCategoryValue(p.id, s.id),
        emoji: s.emoji,
        label: s.label,
        parent: p.label,
        color: getCategoryColor(p.id, customCategories) ?? "#64748b",
      })),
    ),
    ...customCategories.map((c) => ({ value: c.name, emoji: "", label: c.name, parent: "", color: c.color })),
  ];
  const rank = (m: CategoryMatch) => {
    const label = m.label.toLowerCase();
    if (label.startsWith(words[0])) return 0;
    if (label.split(/[\s/&-]+/).some((w) => w.startsWith(words[0]))) return 1;
    if (label.includes(words[0])) return 2;
    return 3; // matched only through the parent
  };
  return all
    .filter((m) => {
      const hay = `${m.label} ${m.parent}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .map((m, i) => ({ m, r: rank(m), i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ m }) => m);
}

/** Emoji, name, group and colour for a stored category value (built-in "parent:sub" or a custom name). */
export function describeCategory(value: string, customCategories: CustomCategory[]): Omit<CategoryMatch, "value"> | null {
  if (!value) return null;
  const custom = customCategories.find((c) => c.name === value);
  if (custom) return { emoji: "", label: custom.name, parent: "Custom", color: custom.color };
  const [parentId, subId] = value.split(":");
  const parent = EXPENSE_CATEGORIES.find((p) => p.id === parentId);
  if (!parent) return { emoji: "", label: value, parent: "", color: "#64748b" };
  const sub = parent.subcategories.find((s) => s.id === subId);
  const color = getCategoryColor(parent.id, customCategories) ?? "#64748b";
  return sub
    ? { emoji: sub.emoji, label: sub.label, parent: parent.label, color }
    : { emoji: parent.emoji, label: parent.label, parent: "", color };
}
