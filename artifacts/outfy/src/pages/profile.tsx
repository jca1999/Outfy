import {
  ArrowRight,
  CalendarDays,
  Edit3,
  MapPin,
  RefreshCw,
  Settings as SettingsIcon,
  UserRound,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import {
  getMyCreatedActivities,
  type MyCreatedActivity,
} from '@/activities/activity-api';
import { useAuth } from '@/auth/auth-context';

export function Profile() {
  const { t, i18n } = useTranslation(['profile', 'activities']);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [activities, setActivities] = useState<MyCreatedActivity[]>([]);
  const [activitiesState, setActivitiesState] = useState<
    'loading' | 'ready' | 'error'
  >('loading');

  function loadActivities() {
    setActivitiesState('loading');
    getMyCreatedActivities()
      .then((result) => {
        setActivities(result.activities);
        setActivitiesState('ready');
      })
      .catch(() => {
        setActivitiesState('error');
      });
  }

  useEffect(() => {
    let active = true;
    setActivitiesState('loading');

    getMyCreatedActivities()
      .then((result) => {
        if (!active) return;
        setActivities(result.activities);
        setActivitiesState('ready');
      })
      .catch(() => {
        if (!active) return;
        setActivitiesState('error');
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleName =
    user?.displayName?.trim() ||
    user?.username ||
    '';

  const initials = visibleName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
            {t('header.eyebrow')}
          </p>

          <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
            {t('header.title')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/profile/edit')}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted"
          >
            <Edit3 className="h-3.5 w-3.5" />
            {t('header.edit')}
          </button>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label={t('header.settingsAriaLabel')}
            title={t('header.settingsAriaLabel')}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] bg-primary text-2xl font-bold text-primary-foreground">
            {initials || (
              <UserRound className="h-8 w-8" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-[-.04em]">
              {visibleName}
            </h2>

            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">
                {t('identity.username')}
              </p>

              <p className="mt-1 text-sm text-foreground">
                @{user?.username}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-bold text-muted-foreground">
                {t('identity.location.label')}
              </p>

              <p className="mt-1 text-sm text-foreground">
                {(user?.homeLocation
                  ? `${user.homeLocation.city}, ${user.homeLocation.country}`
                  : user?.homeCity?.trim()) ||
                  t('identity.location.notSet')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="my-plans-title" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
              {t('activities:myPlans.created')}
            </p>
            <h2
              id="my-plans-title"
              className="mt-1 text-2xl font-bold tracking-[-.04em]"
            >
              {t('activities:myPlans.title')}
            </h2>
          </div>
        </div>

        {activitiesState === 'loading' && (
          <div
            className="grid gap-3 sm:grid-cols-2"
            aria-label={t('activities:myPlans.loading')}
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-[22px] border border-border bg-card"
              />
            ))}
          </div>
        )}

        {activitiesState === 'error' && (
          <div className="rounded-[22px] border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              {t('activities:myPlans.loadError')}
            </p>
            <button
              type="button"
              onClick={loadActivities}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t('activities:myPlans.retry')}
            </button>
          </div>
        )}

        {activitiesState === 'ready' && activities.length === 0 && (
          <div className="rounded-[22px] border border-dashed border-border bg-card p-7 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-primary" />
            <h3 className="mt-4 text-base font-bold">
              {t('activities:myPlans.emptyTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('activities:myPlans.emptyDescription')}
            </p>
            <button
              type="button"
              onClick={() => navigate('/activities/new')}
              className="mt-5 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground"
            >
              {t('activities:myPlans.createPlan')}
            </button>
          </div>
        )}

        {activitiesState === 'ready' && activities.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {activities.map((activity) => {
              const locale = i18n.language === 'en' ? 'en-GB' : 'es-ES';
              let dateLabel: string;
              try {
                dateLabel = new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: activity.timezoneName,
                }).format(new Date(activity.startsAt));
              } catch {
                dateLabel = new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(activity.startsAt));
              }

              const location =
                activity.locationType === 'online'
                  ? t('activities:locationTypes.online')
                  : activity.city || t('activities:locationTypes.physical');
              const participants =
                activity.participationMode === 'limited'
                  ? t('activities:create.detail.participantsLimited', {
                      count: activity.memberCount,
                      max: activity.maxParticipants,
                    })
                  : `${t('activities:create.detail.participantsUnlimited', {
                      count: activity.memberCount,
                    })} · ${t('activities:create.detail.unlimited')}`;

              return (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => navigate(`/activities/${activity.id}`)}
                  className="group flex min-h-44 w-full flex-col rounded-[22px] border border-border bg-card p-5 text-left soft-shadow transition hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {t(`activities:myPlans.status.${activity.status}`)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-lg font-bold leading-tight tracking-[-.03em]">
                    {activity.title}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    {t(`activities:categories.${activity.category}`)}
                  </p>

                  <div className="mt-auto grid gap-1.5 pt-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      {dateLabel}
                    </span>
                    <span className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {location}
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      {participants}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}