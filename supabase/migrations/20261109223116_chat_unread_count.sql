-- Global unread chat message count for Outfy.
--
-- Counts real unread messages, not unread notifications.
-- Accessible conversations:
--   - direct chats where the user is one of the two participants
--   - activity chats where the user is currently/historically present
--     in activity_members according to Outfy membership rules
--
-- Backend-only RPC.

create or replace function public.get_chat_unread_count(
  input_user_id uuid
)
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with accessible_conversations as (
    select
      c.id,
      r.last_read_at
    from public.chat_conversations c

    left join public.chat_read_states r
      on r.conversation_id = c.id
     and r.user_id = input_user_id

    where
      (
        c.type = 'direct'
        and (
          c.direct_user_a_id = input_user_id
          or c.direct_user_b_id = input_user_id
        )
      )
      or
      (
        c.type = 'activity'
        and exists (
          select 1
          from public.activity_members am
          where am.activity_id = c.activity_id
            and am.user_id = input_user_id
        )
      )
  )

  select count(*)::bigint
  from public.chat_messages m

  join accessible_conversations c
    on c.id = m.conversation_id

  where m.sender_id <> input_user_id
    and (
      c.last_read_at is null
      or m.created_at > c.last_read_at
    );
$$;


-- This function is backend-only.
-- Never expose the ability to ask for another user's unread count.

revoke execute
  on function public.get_chat_unread_count(uuid)
  from public, anon, authenticated;

grant execute
  on function public.get_chat_unread_count(uuid)
  to service_role;