import { describe, it, expect } from "vitest";
import { forecastSummary, forecastUrl, parseCities, parseForecast, skyWeather, weatherAt, type Forecast, type WeatherSample } from "./weather";

const sample = (over: Partial<WeatherSample> = {}): WeatherSample => ({ code: 0, cloud: 0, precip: 0, wind: 0, windDir: 0, ...over });

describe("skyWeather", () => {
  it("clear sky has no clouds or rain", () => {
    const w = skyWeather(sample());
    expect(w).toMatchObject({ cloud: 0, rain: 0, snow: 0, fog: 0, storm: false, label: "Clear" });
  });

  it("rain always comes with heavy cloud, and real rainfall makes it heavier", () => {
    const light = skyWeather(sample({ code: 61, cloud: 20, precip: 0.2 }));
    expect(light.cloud).toBeGreaterThanOrEqual(0.85);
    expect(light.rain).toBeCloseTo(0.35);
    expect(skyWeather(sample({ code: 61, precip: 6 })).rain).toBeCloseTo(0.75);
  });

  it("thunderstorms bring lightning, and hail when the code says so", () => {
    expect(skyWeather(sample({ code: 95 }))).toMatchObject({ storm: true, hail: 0 });
    expect(skyWeather(sample({ code: 99 }))).toMatchObject({ storm: true, hail: 0.9 });
    expect(skyWeather(sample({ code: 63 })).storm).toBe(false);
  });

  it("snow does not also rain", () => {
    const w = skyWeather(sample({ code: 73, precip: 3 }));
    expect(w.snow).toBeCloseTo(0.6);
    expect(w.rain).toBe(0);
  });

  it("points the wind the way it blows: a north wind blows down the dial", () => {
    const w = skyWeather(sample({ windDir: 0, wind: 25 }));
    expect(w.windY).toBeCloseTo(1);
    expect(w.windX).toBeCloseTo(0);
    expect(w.wind).toBeCloseTo(0.5);
  });
});

describe("weatherAt", () => {
  const hour = 3_600_000;
  const now = 10 * hour;
  const f: Forecast = {
    current: sample({ code: 63, cloud: 100, precip: 2 }),
    currentAt: now,
    hourly: [
      { at: 9 * hour, sample: sample({ code: 63, cloud: 100, precip: 2 }) },
      { at: 14 * hour, sample: sample({ code: 0, cloud: 0 }) },
      { at: 15 * hour, sample: sample({ code: 0, cloud: 0 }) },
    ],
  };

  it("uses the live reading at the present moment", () => {
    expect(weatherAt(f, now, now).label).toBe("Rain");
  });

  it("uses the forecast hours away", () => {
    const later = weatherAt(f, 14.5 * hour, now);
    expect(later.label).toBe("Clear");
    expect(later.rain).toBe(0);
  });
});

describe("forecastSummary", () => {
  // Local times, so the hours read the same in any timezone the tests run in.
  const at = (h: number) => new Date(2026, 10, 20, h).getTime();
  /** A forecast whose current code is `now` and whose hour h has code `codeAt(h)`. */
  const day = (now: number, codeAt: (h: number) => number): Forecast => ({
    current: sample({ code: now }),
    currentAt: at(12),
    hourly: Array.from({ length: 36 }, (_, h) => ({ at: at(h), sample: sample({ code: codeAt(h) }) })),
  });

  it("says the rain will carry on", () => {
    expect(forecastSummary(day(63, () => 63), at(12))).toBe("Rainy conditions will continue for the rest of the day.");
  });

  it("says when the rain will stop", () => {
    expect(forecastSummary(day(63, (h) => (h < 15 ? 63 : 3)), at(12))).toBe("Rain expected to end around 3 PM.");
  });

  it("says when rain or storms are coming", () => {
    expect(forecastSummary(day(0, (h) => (h < 16 ? 0 : 61)), at(12))).toBe("Rain expected around 4 PM.");
    expect(forecastSummary(day(2, (h) => (h === 17 ? 95 : 2)), at(12))).toBe("Thunderstorms expected around 5 PM.");
  });

  it("warns of storms on the way while it rains", () => {
    expect(forecastSummary(day(61, (h) => (h >= 17 ? 95 : 61)), at(12)))
      .toBe("Rainy conditions will continue for the rest of the day, with thunderstorms around 5 PM.");
  });

  it("describes a dry day, and ignores a passing cloud", () => {
    expect(forecastSummary(day(3, () => 3), at(9))).toBe("Cloudy conditions will continue for the rest of the day.");
    expect(forecastSummary(day(0, (h) => (h === 14 ? 2 : 0)), at(9))).toBe("Sunny conditions will continue for the rest of the day.");
    expect(forecastSummary(day(0, (h) => (h >= 15 ? 3 : 0)), at(9))).toBe("Cloudy conditions expected around 3 PM.");
  });

  it("talks about the night in the evening", () => {
    expect(forecastSummary(day(63, () => 63), at(20))).toBe("Rainy conditions will continue through the night.");
  });
});

describe("Open-Meteo", () => {
  it("asks for current and hourly weather at the city's rounded coordinates", () => {
    const url = new URL(forecastUrl(23.8103, 90.4125));
    expect(url.searchParams.get("latitude")).toBe("23.81");
    expect(url.searchParams.get("longitude")).toBe("90.41");
    expect(url.searchParams.get("current")).toContain("weather_code");
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
  });

  it("parses a forecast response", () => {
    const block = (v: number) => ({ weather_code: v, cloud_cover: 50, precipitation: 0, wind_speed_10m: 10, wind_direction_10m: 90 });
    const f = parseForecast({
      current: { time: 1000, ...block(2) },
      hourly: { time: [1000, 4600], weather_code: [2, 3], cloud_cover: [50, 90], precipitation: [0, 0], wind_speed_10m: [10, 12], wind_direction_10m: [90, 100] },
    });
    expect(f.current.code).toBe(2);
    expect(f.currentAt).toBe(1_000_000);
    expect(f.hourly).toHaveLength(2);
    expect(f.hourly[1]).toEqual({ at: 4_600_000, sample: { code: 3, cloud: 90, precip: 0, wind: 12, windDir: 100 } });
  });

  it("parses city search results", () => {
    const cities = parseCities({ results: [{ name: "Dhaka", latitude: 23.71, longitude: 90.41, admin1: "Dhaka Division", country: "Bangladesh" }] });
    expect(cities).toEqual([{ name: "Dhaka, Bangladesh", city: "Dhaka", region: "Dhaka Division, Bangladesh", lat: 23.71, lon: 90.41 }]);
    expect(parseCities({})).toEqual([]);
  });
});
