-- Connections V1: mutual relationships, written only by the trusted API.
-- Review and apply manually after migrations 001 through 012.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint connections_distinct_users_check
    check (requester_id <> addressee_id),
  constraint connections_status_check
    check (status in ('pending', 'accepted')),
  constraint connections_accepted_at_check
    check (
      (status = 'pending' and accepted_at is null)
      or (status = 'accepted' and accepted_at is not null)
    )
);

-- UUIDs have a native btree ordering in PostgreSQL. These immutable
-- expressions enforce one unordered pair, including concurrent A->B / B->A.
create unique index connections_unordered_pair_key
  on public.connections (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index connections_requester_status_idx
  on public.connections (requester_id, status);
create index connections_addressee_status_idx
  on public.connections (addressee_id, status);

create trigger set_connection_updated_at
  before update on public.connections
  for each row execute function public.set_activity_updated_at();

alter table public.connections enable row level security;
revoke all on table public.connections from public, anon, authenticated;
grant select, insert, update, delete on table public.connections to service_role;
-- No browser policies and no SECURITY DEFINER RPC are needed.
