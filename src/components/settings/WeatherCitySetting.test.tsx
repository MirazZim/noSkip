import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CityMatch } from "@/components/dashboard/skywatch/weather";

// Radix's popper measures its anchor; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const LONDON: CityMatch = { name: "London, United Kingdom", city: "London", region: "England, United Kingdom", lat: 51.51, lon: -0.13 };
const ONTARIO: CityMatch = { name: "London, Canada", city: "London", region: "Ontario, Canada", lat: 42.98, lon: -81.23 };

const state = { results: [] as CityMatch[] };
const mutate = vi.fn();

vi.mock("@/hooks/useWeather", () => ({
  useWeatherCity: () => ({ data: null, isLoading: false }),
  useSetWeatherCity: () => ({ mutate, isPending: false }),
  useCitySearch: (q: string) => ({
    data: q.trim().length >= 2 ? state.results : undefined,
    isFetching: false,
    isError: false,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { WeatherCitySetting } = await import("./WeatherCitySetting");

function search(text: string) {
  const input = screen.getByRole("combobox", { name: "Search a city" });
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe("WeatherCitySetting", () => {
  beforeEach(() => {
    state.results = [LONDON, ONTARIO];
    mutate.mockReset();
  });

  it("shows matches outside the settings card, so its rounded clipping can't cut them off", async () => {
    const { container } = render(<div style={{ overflow: "hidden" }}><WeatherCitySetting /></div>);
    search("lon");
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.getByText("England, United Kingdom")).toBeInTheDocument();
    expect(screen.getByText("Ontario, Canada")).toBeInTheDocument();
    expect(container.contains(options[0])).toBe(false);
  });

  it("saves the clicked city", async () => {
    render(<WeatherCitySetting />);
    search("lon");
    fireEvent.click((await screen.findAllByRole("option"))[0]);
    expect(mutate).toHaveBeenCalledWith({ name: "London, United Kingdom", lat: 51.51, lon: -0.13 }, expect.anything());
  });

  it("picks a city with the arrow keys and Enter", async () => {
    render(<WeatherCitySetting />);
    const input = search("lon");
    await screen.findAllByRole("option");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mutate).toHaveBeenCalledWith({ name: "London, Canada", lat: 42.98, lon: -81.23 }, expect.anything());
  });

  it("says so when nothing matches", async () => {
    state.results = [];
    render(<WeatherCitySetting />);
    search("zzz");
    expect(await screen.findByText("No cities found.")).toBeInTheDocument();
  });
});
