-- Add persistent activity interests to Outfy profiles.
-- Interests reuse the canonical activity category identifiers.

alter table public.profiles
  add column if not exists interests text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_interests_count_check;

alter table public.profiles
  add constraint profiles_interests_count_check
  check (cardinality(interests) <= 5);

alter table public.profiles
  drop constraint if exists profiles_interests_values_check;

alter table public.profiles
  add constraint profiles_interests_values_check
  check (
    interests <@ array[
      'sports',
      'music',
      'movies',
      'outdoors',
      'social',
      'food',
      'gaming',
      'board_games',
      'culture',
      'travel',
      'learning',
      'other'
    ]::text[]
  );