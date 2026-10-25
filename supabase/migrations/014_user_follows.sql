-- History only: public.user_follows already exists in Supabase.
-- Do not automatically execute this migration against that database.
create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_distinct_users_check
    check (follower_id <> followed_id),
  constraint user_follows_unique_pair
    unique (follower_id, followed_id)
);

create index user_follows_follower_idx
  on public.user_follows (follower_id, created_at desc);

create index user_follows_followed_idx
  on public.user_follows (followed_id, created_at desc);

alter table public.user_follows enable row level security;

revoke all on table public.user_follows
from public, anon, authenticated;

grant select, insert, delete
on table public.user_follows
to service_role;
