// Real weather for the sky watch: turns an Open-Meteo forecast into what the
// dial draws — cloud cover, rain, snow, fog, lightning and wind. Pure (no React,
// no fetching) so it can be unit-tested.

/** One weather reading, current or hourly (Open-Meteo units). */
export interface WeatherSample {
  code: number;       // WMO weather code
  cloud: number;      // cloud cover, %
  precip: number;     // precipitation, mm/h
  wind: number;       // wind speed at 10 m, km/h
  windDir: number;    // direction the wind blows FROM, degrees (0 = north)
}

/** Current conditions plus the hourly forecast around today. */
export interface Forecast {
  current: WeatherSample;
  currentAt: number;                            // unix ms of the current reading
  hourly: { at: number; sample: WeatherSample }[];
}

/** What the dial draws. */
export interface SkyWeather {
  cloud: number;      // 0..1 cloud cover
  rain: number;       // 0..1 rain intensity
  snow: number;       // 0..1 snow intensity
  fog: number;        // 0..1
  storm: boolean;     // lightning
  hail: number;       // 0..1 (thunderstorms with hail)
  wind: number;       // 0..1 (0 calm … 1 gale, ~50 km/h)
  windX: number;      // where the wind blows TO on the dial (all-sky view: north up, east left), unit vector
  windY: number;
  label: string;      // e.g. "Heavy rain", for screen readers and tooltips
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const RAD = Math.PI / 180;

// WMO code → [label, rain, snow, fog, storm]
const CODES: Record<number, [string, number, number, number, boolean]> = {
  0: ["Clear", 0, 0, 0, false],
  1: ["Mainly clear", 0, 0, 0, false],
  2: ["Partly cloudy", 0, 0, 0, false],
  3: ["Overcast", 0, 0, 0, false],
  45: ["Fog", 0, 0, 0.8, false],
  48: ["Freezing fog", 0, 0, 0.85, false],
  51: ["Light drizzle", 0.15, 0, 0.15, false],
  53: ["Drizzle", 0.25, 0, 0.15, false],
  55: ["Heavy drizzle", 0.35, 0, 0.2, false],
  56: ["Freezing drizzle", 0.2, 0, 0.15, false],
  57: ["Freezing drizzle", 0.35, 0, 0.2, false],
  61: ["Light rain", 0.35, 0, 0, false],
  63: ["Rain", 0.6, 0, 0, false],
  65: ["Heavy rain", 0.9, 0, 0.1, false],
  66: ["Freezing rain", 0.4, 0, 0, false],
  67: ["Freezing rain", 0.8, 0, 0, false],
  71: ["Light snow", 0, 0.3, 0, false],
  73: ["Snow", 0, 0.6, 0, false],
  75: ["Heavy snow", 0, 0.9, 0.1, false],
  77: ["Snow grains", 0, 0.3, 0, false],
  80: ["Rain showers", 0.4, 0, 0, false],
  81: ["Rain showers", 0.65, 0, 0, false],
  82: ["Violent rain showers", 0.95, 0, 0.1, false],
  85: ["Snow showers", 0, 0.5, 0, false],
  86: ["Heavy snow showers", 0, 0.85, 0, false],
  95: ["Thunderstorm", 0.8, 0, 0, true],
  96: ["Thunderstorm with hail", 0.85, 0, 0, true],
  99: ["Thunderstorm with hail", 0.95, 0, 0, true],
};

/** Turn one reading into what the dial should draw. */
export function skyWeather(s: WeatherSample): SkyWeather {
  const [label, codeRain, snow, fog, storm] = CODES[s.code] ?? ["Cloudy", 0, 0, 0, false];
  // The amount actually falling can only make it heavier than the code says.
  const rain = snow > 0 ? 0 : Math.max(codeRain, codeRain > 0 ? clamp01(s.precip / 8) : 0);
  const wet = rain > 0 || snow > 0;
  // Rain and storms come from cloud, whatever the cover figure says.
  const cloud = Math.max(clamp01(s.cloud / 100), wet ? 0.85 : 0, storm ? 0.95 : 0, fog > 0 ? 0.6 : 0);
  // Meteorological direction is where it comes FROM; the dial wants where it goes.
  // All-sky view, looking up: north at the top, east on the left.
  const to = s.windDir + 180;
  return {
    cloud,
    rain,
    snow,
    fog,
    storm,
    hail: s.code === 99 ? 0.9 : s.code === 96 ? 0.5 : 0,
    wind: clamp01(s.wind / 50),
    windX: -Math.sin(to * RAD),
    windY: -Math.cos(to * RAD),
    label,
  };
}

function blend(a: WeatherSample, b: WeatherSample, t: number): WeatherSample {
  // Wind direction blends the short way round.
  const d = ((b.windDir - a.windDir + 540) % 360) - 180;
  return {
    code: t < 0.5 ? a.code : b.code,
    cloud: lerp(a.cloud, b.cloud, t),
    precip: lerp(a.precip, b.precip, t),
    wind: lerp(a.wind, b.wind, t),
    windDir: (a.windDir + d * t + 360) % 360,
  };
}

/** The hourly forecast at a moment, blended between the hours either side. */
function hourlyAt(f: Forecast, at: number): WeatherSample | null {
  const h = f.hourly;
  if (!h.length) return null;
  if (at <= h[0].at) return h[0].sample;
  if (at >= h[h.length - 1].at) return h[h.length - 1].sample;
  let i = 0;
  while (h[i + 1].at < at) i++;
  return blend(h[i].sample, h[i + 1].sample, (at - h[i].at) / (h[i + 1].at - h[i].at));
}

/**
 * Weather for the moment the watch is showing. Near the present it's the live
 * reading; travel away through the day and it eases into that hour's forecast.
 */
export function weatherAt(f: Forecast, at: number, now: number): SkyWeather {
  const away = clamp01(Math.abs(at - now) / 3_600_000);   // fully the forecast an hour away
  const forecast = away > 0 ? hourlyAt(f, at) : null;
  return skyWeather(forecast ? blend(f.current, forecast, away) : f.current);
}

// ── The forecast in a sentence ────────────────────────────────────────────────
// Like a weather app's summary line: what the sky is doing now and what changes
// over the rest of the day — "Rainy conditions will continue for the rest of
// the day.", "Rain expected around 4 PM.", "Thunderstorms expected to end
// around 6 PM."

export type Condition = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";
type Wet = Extract<Condition, "drizzle" | "rain" | "snow" | "storm">;
type Dry = Exclude<Condition, Wet>;

/** WMO weather code → the condition the summary talks about. */
export function conditionOf(code: number): Condition {
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

const isWet = (c: Condition): c is Wet => c === "drizzle" || c === "rain" || c === "snow" || c === "storm";
const WET_NOUN: Record<Wet, string> = { drizzle: "Drizzle", rain: "Rain", snow: "Snow", storm: "Thunderstorms" };
const WET_ONGOING: Record<Wet, string> = { drizzle: "Drizzle", rain: "Rainy conditions", snow: "Snowy conditions", storm: "Thunderstorms" };
const dryPhrase = (c: Dry, at: Date) => {
  const h = at.getHours();
  const word: Record<Dry, string> = { clear: h >= 6 && h < 18 ? "Sunny" : "Clear", partly: "Partly cloudy", cloudy: "Cloudy", fog: "Foggy" };
  return `${word[c]} conditions`;
};
/** "3 PM" — spelled out by hand so it reads the same on every browser. */
const hourLabel = (ms: number) => {
  const h = new Date(ms).getHours();
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

/** One sentence about the weather for the rest of the day (or the night, in the evening). */
export function forecastSummary(f: Forecast, now: number): string | null {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const end = Math.max(midnight, now + 6 * 3_600_000);   // late in the evening, look into the night
  const ahead = f.hourly
    .filter((h) => h.at > now && h.at <= end)
    .map((h) => ({ at: h.at, c: conditionOf(h.sample.code) }));
  if (!ahead.length) return null;
  const hour = d.getHours();
  const rest = hour >= 18 || hour < 5 ? "through the night" : "for the rest of the day";
  const nowC = conditionOf(f.current.code);

  if (isWet(nowC)) {
    const dry = ahead.find((h) => !isWet(h.c));
    if (dry) return `${WET_NOUN[nowC]} expected to end around ${hourLabel(dry.at)}.`;
    const storm = nowC !== "storm" ? ahead.find((h) => h.c === "storm") : undefined;
    return storm
      ? `${WET_ONGOING[nowC]} will continue ${rest}, with thunderstorms around ${hourLabel(storm.at)}.`
      : `${WET_ONGOING[nowC]} will continue ${rest}.`;
  }
  const wet = ahead.find((h): h is { at: number; c: Wet } => isWet(h.c));
  if (wet) return `${WET_NOUN[wet.c]} expected around ${hourLabel(wet.at)}.`;
  // Dry all along: mention a change of sky only if it lasts (two hours or more).
  const change = ahead.find((h, i) => h.c !== nowC && (ahead[i + 1]?.c ?? h.c) === h.c);
  if (change) return `${dryPhrase(change.c as Dry, new Date(change.at))} expected around ${hourLabel(change.at)}.`;
  return `${dryPhrase(nowC, d)} will continue ${rest}.`;
}

// ── Open-Meteo ────────────────────────────────────────────────────────────────

const FIELDS = "weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m";

/** Forecast request for a city's coordinates: current conditions, plus hourly from yesterday to tomorrow. */
export function forecastUrl(lat: number, lon: number) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(2),
    longitude: lon.toFixed(2),
    current: FIELDS,
    hourly: FIELDS,
    past_days: "1",
    forecast_days: "2",
    timeformat: "unixtime",
    timezone: "auto",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

interface OpenMeteoBlock {
  time: number | number[];
  weather_code: number | number[];
  cloud_cover: number | number[];
  precipitation: number | number[];
  wind_speed_10m: number | number[];
  wind_direction_10m: number | number[];
}

/** Parse an Open-Meteo forecast response. */
export function parseForecast(json: { current: OpenMeteoBlock; hourly: OpenMeteoBlock }): Forecast {
  const c = json.current;
  const h = json.hourly;
  const times = h.time as number[];
  const pick = (v: number | number[], i?: number) => Number((i === undefined ? v : (v as number[])[i]) ?? 0);
  const sample = (b: OpenMeteoBlock, i?: number): WeatherSample => ({
    code: pick(b.weather_code, i),
    cloud: pick(b.cloud_cover, i),
    precip: pick(b.precipitation, i),
    wind: pick(b.wind_speed_10m, i),
    windDir: pick(b.wind_direction_10m, i),
  });
  return {
    current: sample(c),
    currentAt: Number(c.time) * 1000,
    hourly: times.map((t, i) => ({ at: t * 1000, sample: sample(h, i) })),
  };
}

export interface CityMatch {
  name: string;     // what gets saved and shown once chosen, e.g. "London, United Kingdom"
  city: string;     // first line in the results, e.g. "London"
  region: string;   // second line, e.g. "England, United Kingdom"
  lat: number;
  lon: number;
}

/** City search (Open-Meteo geocoding): only the typed text is sent. */
export function citySearchUrl(query: string) {
  const q = new URLSearchParams({ name: query, count: "6", language: "en", format: "json" });
  return `https://geocoding-api.open-meteo.com/v1/search?${q}`;
}

export function parseCities(json: { results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[] }): CityMatch[] {
  return (json.results ?? []).map((r) => ({
    name: [r.name, r.country].filter(Boolean).join(", "),
    city: r.name,
    region: [r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
  }));
}
