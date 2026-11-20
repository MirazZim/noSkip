import { describe, it, expect } from "vitest";
import { atmosphere, greetingAt, starVisibility, sunPosition } from "./sky";

describe("greetingAt", () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
  it("switches to afternoon at noon and evening at five", () => {
    expect(greetingAt(at(11, 59))).toBe("Good morning");
    expect(greetingAt(at(12, 0))).toBe("Good afternoon");
    expect(greetingAt(at(16, 59))).toBe("Good afternoon");
    expect(greetingAt(at(17, 0))).toBe("Good evening");
    expect(greetingAt(at(3, 0))).toBe("Still up");
  });
});

describe("sunPosition", () => {
  it("rises due east at 6:00 and sets due west at 18:00", () => {
    const rise = sunPosition(6 * 60), set = sunPosition(18 * 60);
    expect(rise.alt).toBeCloseTo(0, 5);
    expect(rise.az).toBeCloseTo(90, 5);
    expect(set.alt).toBeCloseTo(0, 5);
    expect(set.az).toBeCloseTo(270, 5);
  });

  it("is high in the south at noon and below the horizon at midnight", () => {
    const noon = sunPosition(12 * 60);
    expect(noon.az).toBeCloseTo(180, 5);
    expect(noon.alt).toBeGreaterThan(60);
    expect(sunPosition(0).alt).toBeLessThan(-60);
  });
});

describe("atmosphere", () => {
  it("puts the rising sun on the left rim (east) and the setting sun on the right (west)", () => {
    const dawn = atmosphere(6 * 60).sun, dusk = atmosphere(18 * 60).sun;
    expect(dawn.x).toBeCloseTo(-1, 5);
    expect(dusk.x).toBeCloseTo(1, 5);
  });

  it("glows at sunset but not at noon or midnight", () => {
    expect(atmosphere(18 * 60 + 10).twilight).toBeGreaterThan(0.8);
    expect(atmosphere(12 * 60).twilight).toBe(0);
    expect(atmosphere(0).twilight).toBe(0);
  });
});

describe("starVisibility", () => {
  it("brings out bright stars before faint ones", () => {
    expect(starVisibility(1, 0.6)).toBeGreaterThan(0.9);
    expect(starVisibility(0, 0.6)).toBe(0);
    expect(starVisibility(0, 1)).toBeGreaterThan(0);
  });
});
