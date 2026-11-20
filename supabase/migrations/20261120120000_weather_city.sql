-- ============================================================
-- Weather city for the dashboard's sky watch
--
-- The user picks a city in Settings; the watch shows that city's live weather
-- (clouds, rain, storms, fog, snow). Only the city's coordinates are stored and
-- sent to the weather service — never the device's location. All three columns
-- are optional: with no city set the watch shows its default fair-weather sky.
-- Covered by the existing "own profile" RLS policies on public.profiles.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN weather_city TEXT,
  ADD COLUMN weather_lat  DOUBLE PRECISION,
  ADD COLUMN weather_lon  DOUBLE PRECISION,
  ADD CONSTRAINT profiles_weather_lat_check CHECK (weather_lat IS NULL OR weather_lat BETWEEN -90 AND 90),
  ADD CONSTRAINT profiles_weather_lon_check CHECK (weather_lon IS NULL OR weather_lon BETWEEN -180 AND 180),
  ADD CONSTRAINT profiles_weather_city_len CHECK (weather_city IS NULL OR char_length(weather_city) <= 120);
