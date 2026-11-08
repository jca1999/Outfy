-- Internal notifications only. Apply separately after review; no browser access.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  activity_id uuid references public.activities(id) on delete set null,
  type text not null check (type in (
    'connection_request', 'connection_accepted', 'activity_invitation',
    'activity_invitation_accepted', 'activity_invitation_declined',
    'activity_reminder', 'chat_message'
  )),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  read_at timestamptz,
  dedupe_key text check (char_length(dedupe_key) <= 200),
  created_at timestamptz not null default now()
);

create unique index notifications_dedupe_key_idx
  on public.notifications(dedupe_key) where dedupe_key is not null;
create index notifications_recipient_created_idx
  on public.notifications(recipient_id, created_at desc);
create index notifications_unread_idx
  on public.notifications(recipient_id, created_at desc) where read_at is null;
create index notifications_activity_idx
  on public.notifications(activity_id) where activity_id is not null;

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select, insert, update, delete on table public.notifications to service_role;
