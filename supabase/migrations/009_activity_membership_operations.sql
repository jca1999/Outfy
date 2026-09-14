-- Trusted-server operations for capacity-safe activity membership changes.

-- Membership writes must go through trusted server operations so capacity
-- checks cannot be bypassed through direct authenticated table access.
revoke insert, delete
  on table public.activity_members
  from public, anon, authenticated;

create or replace function public.join_activity_as_user(
  p_activity_id uuid,
  p_user_id uuid
)
returns table (
  result text,
  member_count bigint,
  max_participants integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.activities%rowtype;
  v_member_count bigint;
  v_is_member boolean;
begin
  -- Serialize membership changes for this activity before checking capacity.
  select activities.*
  into v_activity
  from public.activities
  where activities.id = p_activity_id
  for update;

  if not found then
    return query
    select 'not_found'::text, null::bigint, null::integer;
    return;
  end if;

  if v_activity.status <> 'active' then
    return query
    select
      'not_active'::text,
      null::bigint,
      v_activity.max_participants;
    return;
  end if;

  select exists (
    select 1
    from public.activity_members
    where activity_members.activity_id = p_activity_id
      and activity_members.user_id = p_user_id
  )
  into v_is_member;

  select count(*)
  into v_member_count
  from public.activity_members
  where activity_members.activity_id = p_activity_id;

  if v_is_member then
    return query
    select
      'already_member'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  if v_activity.participation_mode = 'limited'
    and v_member_count >= v_activity.max_participants then
    return query
    select
      'full'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  insert into public.activity_members (
    activity_id,
    user_id,
    role
  )
  values (
    p_activity_id,
    p_user_id,
    'participant'
  );

  select count(*)
  into v_member_count
  from public.activity_members
  where activity_members.activity_id = p_activity_id;

  return query
  select
    'joined'::text,
    v_member_count,
    v_activity.max_participants;
end;
$$;

revoke execute
  on function public.join_activity_as_user(uuid, uuid)
  from public;
revoke execute
  on function public.join_activity_as_user(uuid, uuid)
  from anon;
revoke execute
  on function public.join_activity_as_user(uuid, uuid)
  from authenticated;
grant execute
  on function public.join_activity_as_user(uuid, uuid)
  to service_role;

create or replace function public.leave_activity_as_user(
  p_activity_id uuid,
  p_user_id uuid
)
returns table (
  result text,
  member_count bigint,
  max_participants integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.activities%rowtype;
  v_member_role text;
  v_member_count bigint;
begin
  -- Use the same lock order as joining so counts remain consistent.
  select activities.*
  into v_activity
  from public.activities
  where activities.id = p_activity_id
  for update;

  if not found then
    return query
    select 'not_member'::text, null::bigint, null::integer;
    return;
  end if;

  select activity_members.role
  into v_member_role
  from public.activity_members
  where activity_members.activity_id = p_activity_id
    and activity_members.user_id = p_user_id;

  if not found then
    select count(*)
    into v_member_count
    from public.activity_members
    where activity_members.activity_id = p_activity_id;

    return query
    select
      'not_member'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  select count(*)
  into v_member_count
  from public.activity_members
  where activity_members.activity_id = p_activity_id;

  if v_member_role = 'organizer' then
    return query
    select
      'organizer_cannot_leave'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  delete from public.activity_members
  where activity_members.activity_id = p_activity_id
    and activity_members.user_id = p_user_id
    and activity_members.role = 'participant';

  select count(*)
  into v_member_count
  from public.activity_members
  where activity_members.activity_id = p_activity_id;

  return query
  select
    'left'::text,
    v_member_count,
    v_activity.max_participants;
end;
$$;

revoke execute
  on function public.leave_activity_as_user(uuid, uuid)
  from public;
revoke execute
  on function public.leave_activity_as_user(uuid, uuid)
  from anon;
revoke execute
  on function public.leave_activity_as_user(uuid, uuid)
  from authenticated;
grant execute
  on function public.leave_activity_as_user(uuid, uuid)
  to service_role;
