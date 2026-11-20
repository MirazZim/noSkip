import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  citySearchUrl, forecastUrl, parseCities, parseForecast,
  type CityMatch, type Forecast,
} from "@/components/dashboard/skywatch/weather";

// The sky watch shows live weather for a city the user picks in Settings.
// Only that city's coordinates are sent to Open-Meteo — never the device's
// location, and the browser is never asked for it.

export interface WeatherCity { name: string; lat: number; lon: number }

const REFRESH = 30 * 60_000;

/** The user's weather city, or null when none is set. */
export function useWeatherCity() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["weather-city", user?.id],
    queryFn: async (): Promise<WeatherCity | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("weather_city, weather_lat, weather_lon")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      if (!data.weather_city || data.weather_lat == null || data.weather_lon == null) return null;
      return { name: data.weather_city, lat: data.weather_lat, lon: data.weather_lon };
    },
    enabled: !!user,
  });
}

/** Set (or with null, clear) the weather city. */
export function useSetWeatherCity() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (city: WeatherCity | null) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          weather_city: city?.name ?? null,
          weather_lat: city?.lat ?? null,
          weather_lon: city?.lon ?? null,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["weather-city", user?.id] }),
  });
}

/** Cities matching what the user typed (needs at least 2 characters). */
export function useCitySearch(query: string) {
  const q = query.trim();
  return useQuery({
    // The "2" retires results cached in the older shape (before city/region existed).
    queryKey: ["city-search", 2, q.toLowerCase()],
    queryFn: async ({ signal }): Promise<CityMatch[]> => {
      const res = await fetch(citySearchUrl(q), { signal });
      if (!res.ok) throw new Error(`City search failed (${res.status})`);
      return parseCities(await res.json());
    },
    enabled: q.length >= 2,
    staleTime: Infinity,
    placeholderData: keepPreviousData,   // keep the last results up while the next search loads
  });
}

/** Live weather and hourly forecast for the user's city; null data when no city is set. */
export function useForecast() {
  const { data: city } = useWeatherCity();
  return useQuery({
    queryKey: ["forecast", city?.lat.toFixed(2), city?.lon.toFixed(2)],
    queryFn: async ({ signal }): Promise<Forecast> => {
      const res = await fetch(forecastUrl(city!.lat, city!.lon), { signal });
      if (!res.ok) throw new Error(`Weather fetch failed (${res.status})`);
      return parseForecast(await res.json());
    },
    enabled: !!city,
    staleTime: REFRESH,
    refetchInterval: REFRESH,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
