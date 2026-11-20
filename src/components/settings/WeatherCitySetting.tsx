import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CloudSun, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { SettingsRow } from "@/components/settings/SettingsSection";
import { cn } from "@/lib/utils";
import { useCitySearch, useSetWeatherCity, useWeatherCity } from "@/hooks/useWeather";
import type { CityMatch } from "@/components/dashboard/skywatch/weather";

/** Pick the city whose live weather the dashboard watch shows. No device location is used. */
export function WeatherCitySetting() {
  const { data: city, isLoading } = useWeatherCity();
  const setCity = useSetWeatherCity();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const search = useCitySearch(query);

  // Search once typing pauses.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(text), 300);
    return () => window.clearTimeout(id);
  }, [text]);

  const results = search.data ?? [];
  const current = Math.min(active, Math.max(0, results.length - 1));
  // The results float in a popover so the settings card's rounded clipping can't cut them off.
  const showList = open && query.trim().length >= 2 && text.trim().length >= 2;

  const stopEditing = () => { setEditing(false); setText(""); setOpen(false); };
  const choose = (m: CityMatch) => {
    setCity.mutate(
      { name: m.name, lat: m.lat, lon: m.lon },
      {
        onSuccess: () => { toast.success(`Weather set to ${m.name}`); stopEditing(); },
        onError: () => toast.error("Couldn't save the city"),
      },
    );
  };
  const clear = () => {
    setCity.mutate(null, {
      onSuccess: () => toast.success("Weather turned off"),
      onError: () => toast.error("Couldn't clear the city"),
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (e.key === "Enter" && showList && results[current]) {
      e.preventDefault();
      choose(results[current]);
    } else if (e.key === "Escape" && !showList && city) {
      // First Escape closes the list (the popover handles that); the next one cancels the change.
      stopEditing();
    }
  };

  const showSearch = editing || (!isLoading && !city);

  return (
    <SettingsRow
      icon={<CloudSun className="h-4 w-4" />}
      title="Weather city"
      description="The dashboard watch shows this city's live weather — clouds, rain, storms, fog. Your device location is never used."
    >
      {showSearch ? (
        <Popover open={showList} onOpenChange={setOpen}>
          <PopoverAnchor asChild>
            <div ref={anchorRef} className="relative w-full sm:w-[260px]">
              <Input
                autoFocus={editing}
                value={text}
                onChange={(e) => { setText(e.target.value); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => { if (!text.trim() && city) stopEditing(); }}
                onKeyDown={onKeyDown}
                placeholder="Search a city, e.g. Dhaka"
                role="combobox"
                aria-label="Search a city"
                aria-autocomplete="list"
                aria-expanded={showList}
                aria-controls={listId}
                aria-activedescendant={showList && results[current] ? `${listId}-${current}` : undefined}
                className="rounded-xl pr-8"
              />
              {search.isFetching && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </PopoverAnchor>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-2xl border-border/60 p-1.5"
            // Keep focus (and typing) in the input; clicks on the input itself aren't "outside".
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            onInteractOutside={(e) => { if (anchorRef.current?.contains(e.target as Node)) e.preventDefault(); }}
          >
            <ul id={listId} role="listbox" aria-label="Matching cities">
              {search.isError && <li className="px-3 py-2 text-xs text-muted-foreground">Search failed — try again.</li>}
              {!search.isError && results.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">{search.isFetching ? "Searching…" : "No cities found."}</li>
              )}
              {results.map((m, i) => (
                <li
                  key={`${m.lat},${m.lon}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { if (!setCity.isPending) choose(m); }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                    i === current && "bg-foreground/[0.07]",
                    setCity.isPending && "pointer-events-none opacity-50",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.city || m.name}</div>
                    {m.region && <div className="truncate text-xs text-muted-foreground">{m.region}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : city ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-xl bg-foreground/[0.06] px-3 py-1.5 text-sm font-medium transition-colors hover:bg-foreground/[0.1]"
            title="Change city"
          >
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {city.name}
          </button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={clear} disabled={setCity.isPending}
            aria-label="Turn weather off" title="Turn weather off">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </SettingsRow>
  );
}
