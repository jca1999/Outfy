-- Align activity membership and reviews with the new lifecycle:
-- upcoming -> in progress -> completed.

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

  -- Preserve idempotency for users who are already members.
  if v_is_member then
    return query
    select
      'already_member'::text,
      v_member_count,
      v_activity.max_participants;
    return;
  end if;

  -- New members cannot join once the activity has started.
  if v_activity.starts_at <= now() then
    return query
    select
      'activity_started'::text,
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
  from public, anon, authenticated;

grant execute
  on function public.join_activity_as_user(uuid, uuid)
  to service_role;


create or replace function public.upsert_activity_review_as_user(
  p_activity_id uuid,
  p_user_id uuid,
  p_rating integer,
  p_comment text
)
returns table (
  result text,
  review_id uuid,
  rating smallint,
  comment text,
  average_rating numeric,
  review_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_activity public.activities%rowtype;
  v_comment text;
  v_review_id uuid;
  v_rating smallint;
  v_average_rating numeric;
  v_review_count bigint;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    return query
    select
      'invalid_rating'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  v_comment := nullif(btrim(p_comment), '');

  if char_length(v_comment) > 1000 then
    return query
    select
      'comment_too_long'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  select activities.*
  into v_activity
  from public.activities
  where activities.id = p_activity_id
  for update;

  if not found then
    return query
    select
      'not_found'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  if v_activity.status = 'cancelled' then
    return query
    select
      'cancelled'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  if v_activity.creator_id = p_user_id then
    return query
    select
      'organizer_cannot_review'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  -- Reviews are unlocked only when the activity is really completed.
  if v_activity.status <> 'completed' then
    return query
    select
      'not_finished'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  if not exists (
    select 1
    from public.activity_members
    where activity_members.activity_id = p_activity_id
      and activity_members.user_id = p_user_id
      and activity_members.role = 'participant'
  ) then
    return query
    select
      'not_participant'::text,
      null::uuid,
      null::smallint,
      null::text,
      null::numeric,
      null::bigint;
    return;
  end if;

  insert into public.activity_reviews (
    activity_id,
    reviewer_id,
    rating,
    comment
  )
  values (
    p_activity_id,
    p_user_id,
    p_rating::smallint,
    v_comment
  )
  on conflict (activity_id, reviewer_id)
  do update
  set
    rating = excluded.rating,
    comment = excluded.comment
  returning
    activity_reviews.id,
    activity_reviews.rating
  into
    v_review_id,
    v_rating;

  select
    avg(activity_reviews.rating),
    count(*)
  into
    v_average_rating,
    v_review_count
  from public.activity_reviews
  where activity_reviews.activity_id = p_activity_id;

  return query
  select
    'saved'::text,
    v_review_id,
    v_rating,
    v_comment,
    v_average_rating,
    v_review_count;
end;
$$;

revoke execute
  on function public.upsert_activity_review_as_user(
    uuid,
    uuid,
    integer,
    text
  )
  from public, anon, authenticated;

grant execute
  on function public.upsert_activity_review_as_user(
    uuid,
    uuid,
    integer,
    text
  )
  to service_role;