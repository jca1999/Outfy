alter table public.notifications
  drop constraint notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'connection_request',
      'connection_accepted',
      'activity_invitation',
      'activity_invitation_accepted',
      'activity_invitation_declined',
      'activity_joined',
      'activity_reminder',
      'chat_message'
    )
  );