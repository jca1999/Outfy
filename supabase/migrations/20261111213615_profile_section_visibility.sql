-- Add visibility controls for social profile sections.

alter table public.profiles
  add column if not exists bio_visibility text
    not null default 'everyone';

alter table public.profiles
  add column if not exists interests_visibility text
    not null default 'everyone';

alter table public.profiles
  drop constraint if exists profiles_bio_visibility_check;

alter table public.profiles
  add constraint profiles_bio_visibility_check
  check (
    bio_visibility in (
      'everyone',
      'friends'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_interests_visibility_check;

alter table public.profiles
  add constraint profiles_interests_visibility_check
  check (
    interests_visibility in (
      'everyone',
      'friends'
    )
  );