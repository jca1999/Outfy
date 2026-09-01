-- Validate invitation codes without consuming a use.
-- This is intentionally server-only, just like the consuming RPC.

create or replace function public.validate_invitation_code(input_code_hash text)
returns table (accepted boolean, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.invitation_codes%rowtype;
begin
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

  return query select true, 'accepted'::text;
end;
$$;

revoke all on function public.validate_invitation_code(text)
from public, anon, authenticated;
grant execute on function public.validate_invitation_code(text) to service_role;