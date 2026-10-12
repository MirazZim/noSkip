import { describe, it, expect } from "vitest";
import { EXPENSE_CATEGORIES } from "@/hooks/useExpenses";
import {
  EXPENSE_CATEGORY_LABELS, DEFAULT_MERCHANTS, defaultCategoryFor, isKnownCategory,
} from "./merchantCategories";

describe("merchantCategories", () => {
  it("mirrors EXPENSE_CATEGORIES exactly", () => {
    const fromApp = EXPENSE_CATEGORIES.flatMap((p) =>
      p.subcategories.map((s) => [`${p.id}:${s.id}`, s.label] as const),
    );
    expect(Object.entries(EXPENSE_CATEGORY_LABELS)).toEqual(fromApp);
  });

  it("only maps merchants to real categories", () => {
    for (const [, category] of DEFAULT_MERCHANTS) expect(isKnownCategory(category)).toBe(true);
  });

  it("matches whole words and glued prefixes, not arbitrary substrings", () => {
    expect(defaultCategoryFor("foodpanda", "payment")).toBe("food-drinks:meal-delivery");
    expect(defaultCategoryFor("pathao food", "payment")).toBe("food-drinks:meal-delivery");
    expect(defaultCategoryFor("pathao", "payment")).toBe("transport:ride-share");
    expect(defaultCategoryFor("startech", "card")).toBe("shopping:gadgets");
    expect(defaultCategoryFor("robintex", "card")).toBeNull();
  });

  it("falls back to the transaction kind", () => {
    expect(defaultCategoryFor("01712345678", "recharge")).toBe("communication:mobile-data");
    expect(defaultCategoryFor(null, "cash_out")).toBe("finance:cash-withdrawal");
    expect(defaultCategoryFor(null, "send_money")).toBeNull();
  });
});
