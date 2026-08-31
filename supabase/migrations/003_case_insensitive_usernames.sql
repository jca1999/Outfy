-- Outfy case-insensitive username uniqueness.
-- Keeps the display username while enforcing uniqueness on its canonical form.

alter table public.profiles
  add column if not exists username_normalized text;

update public.profiles
set username_normalized = lower(btrim(username))
where username_normalized is null;

alter table public.profiles
  alter column username_normalized set not null;

alter table public.profiles
  drop constraint if exists profiles_username_key;

alter table public.profiles
  drop constraint if exists profiles_username_normalized_key;

create unique index if not exists profiles_username_normalized_unique_idx
  on public.profiles (username_normalized);

create or replace function public.normalize_profile_username()
returns trigger
language plpgsql
as $$
begin
  new.username := btrim(new.username);
  new.username_normalized := lower(new.username);
  return new;
end;
$$;

drop trigger if exists profiles_username_normalized on public.profiles;

create trigger profiles_username_normalized
  before insert or update of username on public.profiles
  for each row execute procedure public.normalize_profile_username();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  display_username text := btrim(coalesce(new.raw_user_meta_data ->> 'username', ''));
begin
  if display_username = '' or display_username ~ '\s' then
    raise exception 'A valid Outfy username is required';
  end if;

  insert into public.profiles (id, username, username_normalized, email)
  values (
    new.id,
    display_username,
    lower(display_username),
    new.email
  );
  return new;
end;
$$;