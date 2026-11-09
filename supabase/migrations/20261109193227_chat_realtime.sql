-- Enable Realtime events for new chat messages.
-- Writes and reads still go through the Outfy API.
-- The browser does not get direct table access.

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr
      on pr.prpubid = p.oid
    join pg_class c
      on c.oid = pr.prrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'chat_messages'
  ) then
    execute
      'alter publication supabase_realtime add table public.chat_messages';
  end if;
end;
$$;