-- Reconcile profile fields already present in the live Outfy schema.
-- This migration is safe to run in fresh and existing environments.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists display_name_visibility text not null
    default 'shared_activity',
  add column if not exists is_profile_private boolean not null default false,
  add column if not exists home_city text,
  add column if not exists notify_activities boolean not null default true,
  add column if not exists notify_connections boolean not null default true,
  add column if not exists notify_messages boolean not null default true,
  add column if not exists notify_reminders boolean not null default true;