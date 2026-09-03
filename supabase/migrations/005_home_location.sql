-- Structured usual-location fields for Outfy profiles.
-- Coordinates are for the selected city, never the user's exact device position.

alter table public.profiles
  add column if not exists home_country_code text,
  add column if not exists home_country text,
  add column if not exists home_region_code text,
  add column if not exists home_region text,
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision;