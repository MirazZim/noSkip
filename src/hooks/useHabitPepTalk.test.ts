import { describe, it, expect } from "vitest";
import { cleanPepLine } from "./useHabitPepTalk";

const T = "12h 19m";

describe("cleanPepLine", () => {
  it("bolds a bare {time_left} token", () => {
    expect(cleanPepLine("Still got {time_left} on the clock.", T)).toBe(`Still got **${T}** on the clock.`);
  });

  it("doesn't double-mark a token the model already bolded", () => {
    expect(cleanPepLine("You got **{time_left} left today**. Go!", T)).toBe(`You got **${T} left today**. Go!`);
  });

  it("un-marks a span that's a whole sentence", () => {
    expect(cleanPepLine("**With {time_left} remaining today, even a tiny bit counts**.", T))
      .toBe(`With ${T} remaining today, even a tiny bit counts.`);
  });

  it("drops marks entirely when they're unbalanced", () => {
    expect(cleanPepLine("**5 days** and **counting.", T)).toBe("5 days and counting.");
  });

  it("leaves a normal line alone", () => {
    expect(cleanPepLine("**178 days** total, partner.", T)).toBe("**178 days** total, partner.");
  });
});
