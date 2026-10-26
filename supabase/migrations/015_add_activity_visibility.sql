alter table public.activities
add column if not exists visibility text not null default 'public';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_visibility_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
    add constraint activities_visibility_check
    check (visibility in ('public', 'friends'));
  end if;
end
$$;