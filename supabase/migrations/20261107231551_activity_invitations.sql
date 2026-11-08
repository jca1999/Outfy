-- Activity invitations V1.
-- Invite-only plans are visible only to the organizer,
-- existing participants and users explicitly invited by the organizer.

alter table public.activities
drop constraint if exists activities_visibility_check;

alter table public.activities
add constraint activities_visibility_check
check (
  visibility in (
    'public',
    'friends',
    'invite_only'
  )
);


create table public.activity_invitations (
  id uuid primary key default gen_random_uuid(),

  activity_id uuid not null
    references public.activities(id)
    on delete cascade,

  invitee_id uuid not null
    references auth.users(id)
    on delete cascade,

  status text not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint activity_invitations_status_check
    check (
      status in (
        'pending',
        'accepted',
        'declined'
      )
    ),

  constraint activity_invitations_response_check
    check (
      (
        status = 'pending'
        and responded_at is null
      )
      or
      (
        status in ('accepted', 'declined')
        and responded_at is not null
      )
    ),

  constraint activity_invitations_activity_invitee_key
    unique (activity_id, invitee_id)
);


create index activity_invitations_activity_status_idx
  on public.activity_invitations (
    activity_id,
    status
  );

create index activity_invitations_invitee_status_idx
  on public.activity_invitations (
    invitee_id,
    status
  );


create trigger set_activity_invitation_updated_at
  before update on public.activity_invitations
  for each row
  execute function public.set_activity_updated_at();


alter table public.activity_invitations
enable row level security;

revoke all
  on table public.activity_invitations
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.activity_invitations
  to service_role;