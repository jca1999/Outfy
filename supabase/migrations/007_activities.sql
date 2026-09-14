-- Database foundation for Outfy activities.
-- Category and subcategory store stable application taxonomy IDs, not labels.

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  subcategory text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone_name text not null,
  location_type text not null,
  country_code text,
  region_code text,
  region_name text,
  city text,
  latitude double precision,
  longitude double precision,
  meeting_point text,
  online_platform text,
  participation_mode text not null default 'limited',
  -- Total member capacity, including the organizer.
  max_participants integer,
  cost_type text not null default 'free',
  estimated_cost numeric(10, 2),
  currency text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activities_title_check
    check (
      char_length(btrim(title)) between 1 and 120
    ),
  constraint activities_description_check
    check (
      description is null
      or char_length(description) <= 5000
    ),
  constraint activities_category_check
    check (char_length(btrim(category)) > 0),
  constraint activities_subcategory_check
    check (char_length(btrim(subcategory)) > 0),
  constraint activities_time_check
    check (ends_at is null or ends_at > starts_at),
  constraint activities_timezone_check
    check (char_length(btrim(timezone_name)) > 0),
  constraint activities_location_type_check
    check (location_type in ('physical', 'online')),
  constraint activities_physical_city_check
    check (
      location_type <> 'physical'
      or (city is not null and char_length(btrim(city)) > 0)
    ),
  constraint activities_country_code_check
    check (
      country_code is null
      or country_code ~ '^[A-Z]{2}$'
    ),
  constraint activities_coordinate_pair_check
    check (
      (latitude is null and longitude is null)
      or (latitude is not null and longitude is not null)
    ),
  constraint activities_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint activities_longitude_check
    check (longitude is null or longitude between -180 and 180),
  constraint activities_participation_mode_check
    check (participation_mode in ('limited', 'unlimited')),
  constraint activities_participant_capacity_check
    check (
      (
        participation_mode = 'limited'
        and max_participants is not null
        and max_participants >= 2
      )
      or (
        participation_mode = 'unlimited'
        and max_participants is null
      )
    ),
  constraint activities_cost_type_check
    check (cost_type in ('free', 'paid', 'each_own')),
  constraint activities_estimated_cost_check
    check (estimated_cost is null or estimated_cost > 0),
  constraint activities_currency_check
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint activities_cost_details_check
    check (
      (
        cost_type = 'free'
        and estimated_cost is null
        and currency is null
      )
      or (
        cost_type = 'paid'
        and estimated_cost is not null
        and currency is not null
      )
      or cost_type = 'each_own'
    ),
  constraint activities_status_check
    check (status in ('active', 'completed', 'cancelled'))
);

create table public.activity_members (
  activity_id uuid not null
    references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'participant',
  joined_at timestamptz not null default now(),

  primary key (activity_id, user_id),
  constraint activity_members_role_check
    check (role in ('organizer', 'participant'))
);

create index activities_creator_id_idx
  on public.activities (creator_id);

create index activities_status_starts_at_idx
  on public.activities (status, starts_at);

create index activities_city_status_starts_at_idx
  on public.activities (city, status, starts_at);

create index activities_category_status_starts_at_idx
  on public.activities (category, status, starts_at);

create index activity_members_user_id_idx
  on public.activity_members (user_id);

create or replace function public.set_activity_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_activity_updated_at
  before update on public.activities
  for each row execute function public.set_activity_updated_at();

-- Organizer membership is created atomically with the activity row.
create or replace function public.add_activity_organizer()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.activity_members (activity_id, user_id, role)
  values (new.id, new.creator_id, 'organizer');
  return new;
end;
$$;

revoke execute on function public.add_activity_organizer() from public;

create trigger add_activity_organizer
  after insert on public.activities
  for each row execute function public.add_activity_organizer();

alter table public.activities enable row level security;
alter table public.activity_members enable row level security;

grant select, insert, update on public.activities to authenticated;
grant select, insert, delete on public.activity_members to authenticated;

create policy "Authenticated users can view available activities"
  on public.activities
  for select
  to authenticated
  using (
    status = 'active'
    or creator_id = auth.uid()
  );

create policy "Authenticated users can create their own activities"
  on public.activities
  for insert
  to authenticated
  with check (creator_id = auth.uid());

create policy "Creators can update their own activities"
  on public.activities
  for update
  to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

-- This policy reads activities only, avoiding activity_members RLS recursion.
create policy "Authenticated users can view visible activity members"
  on public.activity_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.activities
      where activities.id = activity_members.activity_id
        and (
          activities.status = 'active'
          or activities.creator_id = auth.uid()
        )
    )
  );

create policy "Authenticated users can join activities as participants"
  on public.activity_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'participant'
    and exists (
      select 1
      from public.activities
      where activities.id = activity_members.activity_id
        and activities.status = 'active'
    )
  );

create policy "Participants can leave activities"
  on public.activity_members
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and role = 'participant'
  );

-- Capacity-safe joining requires a later atomic RPC or server operation.
