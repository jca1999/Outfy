-- Outfy Chat V1
-- Supports:
--   1) Direct chats between accepted friends.
--   2) One automatic group chat per activity.
--
-- Chat data is server-owned for now.
-- Browser/Reatime read access will be added later in a controlled way.

-- =========================================================
-- 1. CONVERSATIONS
-- =========================================================

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),

  type text not null,

  -- Used only by activity chats.
  activity_id uuid
    references public.activities(id) on delete cascade,

  -- Used only by direct chats.
  direct_user_a_id uuid
    references auth.users(id) on delete cascade,

  direct_user_b_id uuid
    references auth.users(id) on delete cascade,

  last_message_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chat_conversations_type_check
    check (type in ('direct', 'activity')),

  constraint chat_conversations_shape_check
    check (
      (
        type = 'activity'
        and activity_id is not null
        and direct_user_a_id is null
        and direct_user_b_id is null
      )
      or
      (
        type = 'direct'
        and activity_id is null
        and direct_user_a_id is not null
        and direct_user_b_id is not null
        and direct_user_a_id <> direct_user_b_id
      )
    )
);


-- Only one chat per activity.
create unique index chat_conversations_activity_key
  on public.chat_conversations (activity_id)
  where type = 'activity';


-- A-B and B-A are the same direct conversation.
create unique index chat_conversations_direct_pair_key
  on public.chat_conversations (
    least(direct_user_a_id, direct_user_b_id),
    greatest(direct_user_a_id, direct_user_b_id)
  )
  where type = 'direct';


create index chat_conversations_direct_a_idx
  on public.chat_conversations (direct_user_a_id)
  where type = 'direct';


create index chat_conversations_direct_b_idx
  on public.chat_conversations (direct_user_b_id)
  where type = 'direct';


create index chat_conversations_last_message_idx
  on public.chat_conversations (
    last_message_at desc nulls last
  );


-- =========================================================
-- 2. MESSAGES
-- =========================================================

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null
    references public.chat_conversations(id) on delete cascade,

  sender_id uuid not null
    references auth.users(id) on delete cascade,

  body text not null,

  created_at timestamptz not null default now(),

  constraint chat_messages_body_check
    check (
      char_length(btrim(body)) between 1 and 2000
    )
);


create index chat_messages_conversation_created_idx
  on public.chat_messages (
    conversation_id,
    created_at desc,
    id desc
  );


create index chat_messages_sender_idx
  on public.chat_messages (sender_id);


-- =========================================================
-- 3. READ STATE
-- =========================================================

-- Created lazily when a user opens/reads a conversation.
-- For activity chats, activity_members remains the source of truth
-- for who is actually allowed to access the conversation.

create table public.chat_read_states (
  conversation_id uuid not null
    references public.chat_conversations(id) on delete cascade,

  user_id uuid not null
    references auth.users(id) on delete cascade,

  last_read_at timestamptz not null default now(),

  primary key (conversation_id, user_id)
);


create index chat_read_states_user_idx
  on public.chat_read_states (
    user_id,
    conversation_id
  );


-- =========================================================
-- 4. DIRECT CHATS REQUIRE ACCEPTED FRIENDSHIP
-- =========================================================

create or replace function public.validate_direct_chat_friendship()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.type <> 'direct' then
    return new;
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and (
        (
          c.requester_id = new.direct_user_a_id
          and c.addressee_id = new.direct_user_b_id
        )
        or
        (
          c.requester_id = new.direct_user_b_id
          and c.addressee_id = new.direct_user_a_id
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'chat_requires_accepted_connection';
  end if;

  return new;
end;
$$;


create trigger validate_direct_chat_friendship
  before insert on public.chat_conversations
  for each row
  execute function public.validate_direct_chat_friendship();


-- =========================================================
-- 5. CONVERSATION IDENTITY CANNOT CHANGE
-- =========================================================

create or replace function public.protect_chat_conversation_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.type is distinct from old.type
     or new.activity_id is distinct from old.activity_id
     or new.direct_user_a_id is distinct from old.direct_user_a_id
     or new.direct_user_b_id is distinct from old.direct_user_b_id then

    raise exception using
      errcode = '23514',
      message = 'chat_conversation_identity_cannot_change';
  end if;

  return new;
end;
$$;


create trigger protect_chat_conversation_identity
  before update on public.chat_conversations
  for each row
  execute function public.protect_chat_conversation_identity();


-- =========================================================
-- 6. VALIDATE WHO CAN SEND A MESSAGE
-- =========================================================

create or replace function public.validate_chat_message_sender()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_type text;
  v_activity_id uuid;
  v_user_a uuid;
  v_user_b uuid;
begin
  select
    c.type,
    c.activity_id,
    c.direct_user_a_id,
    c.direct_user_b_id
  into
    v_type,
    v_activity_id,
    v_user_a,
    v_user_b
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'chat_conversation_not_found';
  end if;


  -- -----------------------------------------
  -- Direct chat
  -- -----------------------------------------

  if v_type = 'direct' then

    if new.sender_id <> v_user_a
       and new.sender_id <> v_user_b then

      raise exception using
        errcode = '23514',
        message = 'chat_sender_not_participant';
    end if;


    -- History remains if friendship is removed,
    -- but new messages are no longer allowed.

    if not exists (
      select 1
      from public.connections c
      where c.status = 'accepted'
        and (
          (
            c.requester_id = v_user_a
            and c.addressee_id = v_user_b
          )
          or
          (
            c.requester_id = v_user_b
            and c.addressee_id = v_user_a
          )
        )
    ) then

      raise exception using
        errcode = '23514',
        message = 'chat_connection_not_accepted';
    end if;


    return new;
  end if;


  -- -----------------------------------------
  -- Activity chat
  -- -----------------------------------------

  if v_type = 'activity' then

    if not exists (
      select 1
      from public.activity_members am
      where am.activity_id = v_activity_id
        and am.user_id = new.sender_id
    ) then

      raise exception using
        errcode = '23514',
        message = 'chat_activity_membership_required';
    end if;

    return new;
  end if;


  raise exception using
    errcode = '23514',
    message = 'invalid_chat_type';
end;
$$;


create trigger validate_chat_message_sender
  before insert on public.chat_messages
  for each row
  execute function public.validate_chat_message_sender();


-- =========================================================
-- 7. UPDATE CONVERSATION AFTER NEW MESSAGE
-- =========================================================

create or replace function public.touch_chat_conversation_after_message()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  update public.chat_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id
    and (
      last_message_at is null
      or last_message_at < new.created_at
    );

  return new;
end;
$$;


create trigger touch_chat_conversation_after_message
  after insert on public.chat_messages
  for each row
  execute function public.touch_chat_conversation_after_message();


create trigger set_chat_conversation_updated_at
  before update on public.chat_conversations
  for each row
  execute function public.set_activity_updated_at();


-- =========================================================
-- 8. VALIDATE READ STATE
-- =========================================================

create or replace function public.validate_chat_read_state_user()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_type text;
  v_activity_id uuid;
  v_user_a uuid;
  v_user_b uuid;
begin
  select
    c.type,
    c.activity_id,
    c.direct_user_a_id,
    c.direct_user_b_id
  into
    v_type,
    v_activity_id,
    v_user_a,
    v_user_b
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'chat_conversation_not_found';
  end if;


  if v_type = 'direct' then
    if new.user_id <> v_user_a
       and new.user_id <> v_user_b then

      raise exception using
        errcode = '23514',
        message = 'chat_reader_not_participant';
    end if;

    return new;
  end if;


  if v_type = 'activity' then
    if not exists (
      select 1
      from public.activity_members am
      where am.activity_id = v_activity_id
        and am.user_id = new.user_id
    ) then

      raise exception using
        errcode = '23514',
        message = 'chat_activity_membership_required';
    end if;

    return new;
  end if;


  raise exception using
    errcode = '23514',
    message = 'invalid_chat_type';
end;
$$;


create trigger validate_chat_read_state_user
  before insert or update on public.chat_read_states
  for each row
  execute function public.validate_chat_read_state_user();


-- =========================================================
-- 9. AUTOMATIC CHAT FOR EVERY ACTIVITY
-- =========================================================

create or replace function public.create_activity_chat()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.chat_conversations (
    type,
    activity_id,
    created_at,
    updated_at
  )
  values (
    'activity',
    new.id,
    new.created_at,
    new.created_at
  );

  return new;
end;
$$;


revoke execute
  on function public.create_activity_chat()
  from public, anon, authenticated;


create trigger create_activity_chat
  after insert on public.activities
  for each row
  execute function public.create_activity_chat();


-- Existing Outfy activities also receive their chat.
insert into public.chat_conversations (
  type,
  activity_id,
  created_at,
  updated_at
)
select
  'activity',
  a.id,
  a.created_at,
  a.updated_at
from public.activities a
on conflict do nothing;


-- =========================================================
-- 10. SECURITY
-- =========================================================

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_read_states enable row level security;


-- For now chat is only accessible through our trusted API.
-- Realtime read access will be introduced later with specific RLS.

revoke all
  on table public.chat_conversations
  from public, anon, authenticated;

revoke all
  on table public.chat_messages
  from public, anon, authenticated;

revoke all
  on table public.chat_read_states
  from public, anon, authenticated;


grant select, insert, update
  on table public.chat_conversations
  to service_role;

grant select, insert
  on table public.chat_messages
  to service_role;

grant select, insert, update
  on table public.chat_read_states
  to service_role;


revoke execute
  on function public.validate_direct_chat_friendship()
  from public, anon, authenticated;

revoke execute
  on function public.protect_chat_conversation_identity()
  from public, anon, authenticated;

revoke execute
  on function public.validate_chat_message_sender()
  from public, anon, authenticated;

revoke execute
  on function public.touch_chat_conversation_after_message()
  from public, anon, authenticated;

revoke execute
  on function public.validate_chat_read_state_user()
  from public, anon, authenticated;


grant execute
  on function public.validate_direct_chat_friendship()
  to service_role;

grant execute
  on function public.protect_chat_conversation_identity()
  to service_role;

grant execute
  on function public.validate_chat_message_sender()
  to service_role;

grant execute
  on function public.touch_chat_conversation_after_message()
  to service_role;

grant execute
  on function public.validate_chat_read_state_user()
  to service_role;