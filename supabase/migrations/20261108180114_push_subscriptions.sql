-- Server-managed device subscriptions. This migration is intentionally not applied here.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) between 87 and 88),
  auth text not null check (char_length(auth) between 22 and 24),
  user_agent text null check (char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
-- Reuse the existing safe generic timestamp trigger (pg_catalog search_path).
create trigger set_push_subscription_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_activity_updated_at();
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
-- No browser policies.
