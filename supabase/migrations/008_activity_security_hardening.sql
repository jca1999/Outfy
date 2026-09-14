-- Harden activity trigger function permissions and optimize activity RLS policies.

revoke execute on function public.add_activity_organizer() from public;
revoke execute on function public.add_activity_organizer() from anon;
revoke execute on function public.add_activity_organizer() from authenticated;

alter policy "Authenticated users can view available activities"
  on public.activities
  using (
    status = 'active'
    or creator_id = (select auth.uid())
  );

alter policy "Authenticated users can create their own activities"
  on public.activities
  with check (creator_id = (select auth.uid()));

alter policy "Creators can update their own activities"
  on public.activities
  using (creator_id = (select auth.uid()))
  with check (creator_id = (select auth.uid()));

alter policy "Authenticated users can view visible activity members"
  on public.activity_members
  using (
    exists (
      select 1
      from public.activities
      where activities.id = activity_members.activity_id
        and (
          activities.status = 'active'
          or activities.creator_id = (select auth.uid())
        )
    )
  );

alter policy "Authenticated users can join activities as participants"
  on public.activity_members
  with check (
    user_id = (select auth.uid())
    and role = 'participant'
    and exists (
      select 1
      from public.activities
      where activities.id = activity_members.activity_id
        and activities.status = 'active'
    )
  );

alter policy "Participants can leave activities"
  on public.activity_members
  using (
    user_id = (select auth.uid())
    and role = 'participant'
  );