-- Outfy private-registration invitation codes.
-- Store only SHA-256 hashes, never the plaintext invitation code.

create table if not exists public.invitation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  is_active boolean not null default true,
  max_uses integer not null default 1
    check (max_uses > 0),
  uses_count integer not null default 0
    check (uses_count >= 0 and uses_count <= max_uses),
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.invitation_codes enable row level security;

-- Invitation records are server-only. No normal Supabase user can list or read them.
revoke all on table public.invitation_codes from anon, authenticated;

create or replace function public.consume_invitation_code(input_code_hash text)
returns table (accepted boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitation_codes%rowtype;
begin
  -- The conditional update is atomic, so concurrent registrations cannot
  -- exceed max_uses for the same code.
  update public.invitation_codes
  set uses_count = uses_count + 1
  where code_hash = input_code_hash
    and is_active = true
    and (expires_at is null or expires_at > timezone('utc', now()))
    and uses_count < max_uses
  returning * into invitation;

  if found then
    return query select true, 'accepted'::text;
    return;
  end if;

  select *
  into invitation
  from public.invitation_codes
  where code_hash = input_code_hash;

  if not found then
    return query select false, 'invalid'::text;
  elsif invitation.is_active = false then
    return query select false, 'inactive'::text;
  elsif invitation.expires_at is not null
    and invitation.expires_at <= timezone('utc', now()) then
    return query select false, 'expired'::text;
  elsif invitation.uses_count >= invitation.max_uses then
    return query select false, 'exhausted'::text;
  end if;

  return query select false, 'invalid'::text;
end;
$$;

revoke all on function public.consume_invitation_code(text) from public, anon, authenticated;
grant execute on function public.consume_invitation_code(text) to service_role;