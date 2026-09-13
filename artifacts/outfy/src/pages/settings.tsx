import {
  ArrowLeft,
  Loader2,
  LogOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import {
  type DisplayNameVisibility,
  type NotificationPreferences,
} from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';
import { LanguageSwitcher } from '@/components/language-switcher';

export function Settings() {
  const { t } = useTranslation('profile');
  const {
    user,
    signOut,
    updateProfile,
  } = useAuth();
  const [, navigate] = useLocation();

  const [
    displayNameVisibility,
    setDisplayNameVisibility,
  ] = useState<DisplayNameVisibility>('shared_activity');

  const [
    savingVisibility,
    setSavingVisibility,
  ] = useState(false);

  const [
    isProfilePrivate,
    setIsProfilePrivate,
  ] = useState(false);

  const [
    savingProfilePrivacy,
    setSavingProfilePrivacy,
  ] = useState(false);

  const [
    notificationPreferences,
    setNotificationPreferences,
  ] = useState<NotificationPreferences>({
    activities: true,
    connections: true,
    messages: true,
    reminders: true,
  });

  const [
    savingNotification,
    setSavingNotification,
  ] = useState<
    keyof NotificationPreferences | null
  >(null);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  useEffect(() => {
    setDisplayNameVisibility(
      user?.displayNameVisibility ??
        'shared_activity',
    );

    setIsProfilePrivate(
      user?.isProfilePrivate ?? false,
    );

    setNotificationPreferences(
      user?.notificationPreferences ?? {
        activities: true,
        connections: true,
        messages: true,
        reminders: true,
      },
    );
  }, [user]);

  async function handleVisibilityChange(
    nextVisibility: DisplayNameVisibility,
  ) {
    if (
      nextVisibility === displayNameVisibility ||
      savingVisibility
    ) {
      return;
    }

    const previousVisibility =
      displayNameVisibility;

    setDisplayNameVisibility(nextVisibility);
    setSavingVisibility(true);
    setError('');
    setNotice('');

    try {
      await updateProfile({
        displayNameVisibility: nextVisibility,
      });

      setNotice(
        t('messages.visibilitySaved'),
      );
    } catch {
      setDisplayNameVisibility(
        previousVisibility,
      );

      setError(
        t('messages.visibilitySaveError'),
      );
    } finally {
      setSavingVisibility(false);
    }
  }

  async function handleProfilePrivacyChange() {
    if (savingProfilePrivacy) {
      return;
    }

    const previousValue =
      isProfilePrivate;

    const nextValue =
      !isProfilePrivate;

    setIsProfilePrivate(nextValue);
    setSavingProfilePrivacy(true);
    setError('');
    setNotice('');

    try {
      await updateProfile({
        isProfilePrivate: nextValue,
      });

      setNotice(
        t('messages.profilePrivacySaved'),
      );
    } catch {
      setIsProfilePrivate(
        previousValue,
      );

      setError(
        t('messages.profilePrivacySaveError'),
      );
    } finally {
      setSavingProfilePrivacy(false);
    }
  }

  async function handleNotificationChange(
    preference: keyof NotificationPreferences,
  ) {
    if (savingNotification) {
      return;
    }

    const previousPreferences =
      notificationPreferences;

    const nextValue =
      !notificationPreferences[preference];

    const nextPreferences = {
      ...notificationPreferences,
      [preference]: nextValue,
    };

    setNotificationPreferences(
      nextPreferences,
    );

    setSavingNotification(preference);
    setError('');
    setNotice('');

    try {
      const change: Partial<NotificationPreferences> = {
        [preference]: nextValue,
      };

      await updateProfile({
        notificationPreferences: change,
      });

      setNotice(
        t('messages.notificationsSaved'),
      );
    } catch {
      setNotificationPreferences(
        previousPreferences,
      );

      setError(
        t(
          'messages.notificationsSaveError',
        ),
      );
    } finally {
      setSavingNotification(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('navigation.backToProfile')}
        </button>

        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">
          {t('settings.eyebrow')}
        </p>

        <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">
          {t('settings.title')}
        </h1>
      </div>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <h2 className="text-xl font-bold tracking-[-.03em]">
          {t('settings.privacy')}
        </h2>

        <fieldset className="mt-6">
          <div className="flex items-center gap-2">
            <legend className="text-sm font-bold">
              {t('identity.visibility.label')}
            </legend>

            {savingVisibility && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
          </div>

          <div className="mt-3 space-y-2">
            {(
              [
                {
                  value: 'everyone',
                  label: t(
                    'identity.visibility.everyone',
                  ),
                },
                {
                  value: 'shared_activity',
                  label: t(
                    'identity.visibility.sharedActivity',
                  ),
                },
                {
                  value: 'friends',
                  label: t(
                    'identity.visibility.friends',
                  ),
                },
                {
                  value: 'nobody',
                  label: t(
                    'identity.visibility.nobody',
                  ),
                },
              ] as {
                value: DisplayNameVisibility;
                label: string;
              }[]
            ).map((option) => {
              const selected =
                displayNameVisibility === option.value;

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="display-name-visibility"
                    value={option.value}
                    checked={selected}
                    disabled={savingVisibility}
                    onChange={() => {
                      void handleVisibilityChange(
                        option.value,
                      );
                    }}
                    className="h-4 w-4 accent-primary"
                  />

                  <span
                    className={`text-sm ${
                      selected
                        ? 'font-bold text-foreground'
                        : 'font-medium text-muted-foreground'
                    }`}
                  >
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t('identity.visibility.help')}
          </p>
        </fieldset>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {t(
                  'identity.profilePrivacy.label',
                )}
              </p>

              <p className="mt-1 text-sm font-semibold text-foreground">
                {t(
                  'identity.profilePrivacy.privateProfile',
                )}
              </p>

              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                {t(
                  'identity.profilePrivacy.help',
                )}
              </p>

              <p className="mt-2 text-xs font-semibold text-primary">
                {isProfilePrivate
                  ? t(
                      'identity.profilePrivacy.privateStatus',
                    )
                  : t(
                      'identity.profilePrivacy.publicStatus',
                    )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {savingProfilePrivacy && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}

              <button
                type="button"
                role="switch"
                aria-checked={isProfilePrivate}
                disabled={savingProfilePrivacy}
                onClick={() => {
                  void handleProfilePrivacyChange();
                }}
                className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition ${
                  isProfilePrivate
                    ? 'bg-primary'
                    : 'bg-muted'
                } disabled:opacity-60`}
              >
                <span
                  className={`block h-5 w-5 rounded-full transition-transform ${
                    isProfilePrivate
                      ? 'translate-x-5 bg-primary-foreground'
                      : 'translate-x-0 bg-foreground'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-border bg-card p-6 soft-shadow sm:p-8">
        <h2 className="text-xl font-bold tracking-[-.03em]">
          {t('settings.notifications')}
        </h2>

        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t('notifications.help')}
        </p>

        <div className="mt-4 divide-y divide-border">
          {(
            [
              {
                key: 'activities',
                label: t(
                  'notifications.activities.label',
                ),
                help: t(
                  'notifications.activities.help',
                ),
              },
              {
                key: 'connections',
                label: t(
                  'notifications.connections.label',
                ),
                help: t(
                  'notifications.connections.help',
                ),
              },
              {
                key: 'messages',
                label: t(
                  'notifications.messages.label',
                ),
                help: t(
                  'notifications.messages.help',
                ),
              },
              {
                key: 'reminders',
                label: t(
                  'notifications.reminders.label',
                ),
                help: t(
                  'notifications.reminders.help',
                ),
              },
            ] as {
              key: keyof NotificationPreferences;
              label: string;
              help: string;
            }[]
          ).map((option) => {
            const enabled =
              notificationPreferences[
                option.key
              ];

            const savingThis =
              savingNotification ===
              option.key;

            return (
              <div
                key={option.key}
                className="flex items-center justify-between gap-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {option.label}
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {option.help}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {savingThis && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}

                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    disabled={
                      savingNotification !== null
                    }
                    onClick={() => {
                      void handleNotificationChange(
                        option.key,
                      );
                    }}
                    className={`relative h-7 w-12 rounded-full p-1 transition ${
                      enabled
                        ? 'bg-primary'
                        : 'bg-muted'
                    } disabled:opacity-60`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full transition-transform ${
                        enabled
                          ? 'translate-x-5 bg-primary-foreground'
                          : 'translate-x-0 bg-foreground'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[26px] border border-border bg-card p-4 soft-shadow sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-[-.03em]">
              {t('settings.language')}
            </h2>

            <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              {t('settings.languageHelp')}
            </p>
          </div>

          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-border bg-card p-4 soft-shadow sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold tracking-[-.03em]">
            {t('settings.account')}
          </h2>

          <button
            type="button"
            onClick={() => {
              void signOut().then(() =>
                navigate('/sign-in'),
              );
            }}
            className="flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t('header.signOut')}
          </button>
        </div>
      </section>

      {(error || notice) && (
        <div>
          {error && (
            <p
              className="auth-error"
              role="alert"
            >
              {error}
            </p>
          )}

          {notice && (
            <p
              className="mt-3 text-sm font-semibold text-primary"
              role="status"
            >
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}