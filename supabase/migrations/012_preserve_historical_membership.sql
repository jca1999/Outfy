-- Preserve participant membership once an activity has started.
-- Historical memberships are required for History and activity reviews.

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
  -- Same lock order used by join operations.
  select activities.*
  into v_activity
  from public.activities
  where activities.id = p_activity_id
  for update;

  if not found then
    return query
    select
      'not_member'::text,
      null::bigint,
      null::integer;
    return;
  end if;

  select activity_members.role
  into v_member_role
  from public.activity_members
  where activity_members.activity_id = p_activity_id
    and activity_members.user_id = p_user_id;

  select count(*)
  into v_member_count
  from public.activity_members
  where activity_members.activity_id = p_activity_id;

  if v_member_role is null then
    return query
    select
      'not_member'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  if v_member_role = 'organizer' then
    return query
    select
      'organizer_cannot_leave'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  -- Once the activity starts, preserve participant membership as historical
  -- evidence. This is required for History and review eligibility.
  if v_activity.starts_at <= now() then
    return query
    select
      'activity_started'::text,
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