import {
  Edit3,
  Settings as SettingsIcon,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { useAuth } from '@/auth/auth-context';

export function Profile() {
  const { t } = useTranslation('profile');
  const { user } = useAuth();
  const [, navigate] = useLocation();

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
    </div>
  );
}