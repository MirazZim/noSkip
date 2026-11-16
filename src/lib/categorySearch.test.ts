import { describe, expect, it } from "vitest";
import { searchCategories } from "./categorySearch";
import type { CustomCategory } from "@/hooks/useCustomCategories";

const custom = [{ id: "c1", name: "Gym", color: "#22c55e" }] as CustomCategory[];
const values = (q: string) => searchCategories(q, custom).map((m) => m.value);

describe("searchCategories", () => {
  it("returns nothing for an empty query", () => {
    expect(searchCategories("   ", custom)).toEqual([]);
  });

  it("finds a subcategory by part of its label, case-insensitively", () => {
    expect(values("PHARM")[0]).toMatch(/:medicine$/);
  });

  it("matches through the parent label, so a parent name lists its subcategories", () => {
    const food = values("food & drinks");
    expect(food).toContain("food-drinks:groceries");
    expect(food).toContain("food-drinks:dining-out");
  });

  it("requires every word to match", () => {
    expect(values("food groceries")).toEqual(["food-drinks:groceries"]);
    expect(values("groceries rent")).toEqual([]);
  });

  it("ranks labels that start with the query above ones that only contain it", () => {
    const r = values("rent");
    expect(r[0]).toMatch(/:rent$/);
  });

  it("includes custom categories by name", () => {
    expect(values("gym")).toContain("Gym");
  });
});
