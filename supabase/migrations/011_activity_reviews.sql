-- Secure database foundation for participant reviews of finished activities.

create table public.activity_reviews (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null
    references public.activities(id) on delete cascade,
  reviewer_id uuid not null
    references auth.users(id) on delete cascade,
  rating smallint not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activity_reviews_rating_check
    check (rating between 1 and 5),
  constraint activity_reviews_comment_check
    check (comment is null or char_length(comment) <= 1000),
  constraint activity_reviews_activity_reviewer_key
    unique (activity_id, reviewer_id)
);

-- The unique constraint supports activity aggregate and per-review lookups.
-- This additional index supports a reviewer's future history queries.
create index activity_reviews_reviewer_id_idx
  on public.activity_reviews (reviewer_id);

create trigger set_activity_review_updated_at
  before update on public.activity_reviews
  for each row execute function public.set_activity_updated_at();

alter table public.activity_reviews enable row level security;

-- Reviews are server-mediated. No browser role receives direct table access.
revoke all
  on table public.activity_reviews
  from public, anon, authenticated;

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

  -- Keep eligibility stable and serialize aggregate updates for this activity.
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

  if coalesce(v_activity.ends_at, v_activity.starts_at) > now() then
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
  on function public.upsert_activity_review_as_user(uuid, uuid, integer, text)
  from public;
revoke execute
  on function public.upsert_activity_review_as_user(uuid, uuid, integer, text)
  from anon;
revoke execute
  on function public.upsert_activity_review_as_user(uuid, uuid, integer, text)
  from authenticated;
grant execute
  on function public.upsert_activity_review_as_user(uuid, uuid, integer, text)
  to service_role;