import {
  Edit3,
  Loader2,
  LogOut,
  UserRound,
} from 'lucide-react';
import {
  useEffect,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';

import { useAuth } from '@/auth/auth-context';
import { LanguageSwitcher } from '@/components/language-switcher';
import {
  type DisplayNameVisibility,
  type HomeLocation,
  type NotificationPreferences,
} from '@/auth/auth-api';
import { LocationPicker } from '@/components/location-picker';

export function Profile() {
  const { t } = useTranslation('profile');

  const {
    user,
    signOut,
    updateProfile,
  } = useAuth();

  const [, navigate] = useLocation();

  const [editing, setEditing] =
    useState(false);

  const [displayName, setDisplayName] =
    useState('');

  const [homeCity, setHomeCity] =
    useState('');

  const [homeLocation, setHomeLocation] =
    useState<HomeLocation | null>(null);

  const [locationValid, setLocationValid] =
    useState(true);

  const [locationTouched, setLocationTouched] =
    useState(false);
  
  const [
    displayNameVisibility,
    setDisplayNameVisibility,
  ] = useState<DisplayNameVisibility>('shared_activity');

  const [saving, setSaving] =
    useState(false);

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
    setDisplayName(
      user?.displayName ?? '',
    );

    setHomeCity(
      user?.homeCity ?? '',
    );

    setHomeLocation(
      user?.homeLocation ?? null,
    );

    setLocationValid(true);
    setLocationTouched(false);

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

  async function handleSave() {
    const normalizedName =
      displayName.trim();

    setError('');
    setNotice('');

    if (normalizedName.length > 60) {
      setError(
        t('messages.nameTooLong'),
      );
      return;
    }

    if (!locationValid) {
      setError(t('messages.locationIncomplete'));
      return;
    }

    setSaving(true);

    try {
      const profileUpdate: {
        displayName: string;
        homeLocation?: HomeLocation | null;
      } = {
        displayName: normalizedName,
      };

      if (locationTouched) {
        profileUpdate.homeLocation = homeLocation;
      }

      await updateProfile(profileUpdate);

      setEditing(false);
      setNotice(t('messages.saved'));
    } catch {
      setError(t('messages.saveError'));
    } finally {
      setSaving(false);
    }
  }

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
          <LanguageSwitcher />

          <button
            type="button"
            onClick={() => {
              if (editing) {
                void handleSave();
              } else {
                setError('');
                setNotice('');
                setEditing(true);
              }
            }}
            disabled={saving}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold transition hover:bg-muted disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Edit3 className="h-3.5 w-3.5" />
            )}

            {saving
              ? t('header.saving')
              : editing
                ? t('header.save')
                : t('header.edit')}
          </button>

          <button
            type="button"
            onClick={() => {
              void signOut().then(() =>
                navigate('/sign-in'),
              );
            }}
            className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2.5 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />

            <span className="hidden sm:inline">
              {t('header.signOut')}
            </span>
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
            {editing ? (
              <div>
                <label
                  htmlFor="display-name"
                  className="mb-2 block text-sm font-bold"
                >
                  {t('identity.displayName')}
                </label>

                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  maxLength={60}
                  onChange={(event) =>
                    setDisplayName(
                      event.target.value,
                    )
                  }
                  className="auth-input"
                  placeholder={t(
                    'identity.displayNamePlaceholder',
                  )}
                  autoComplete="name"
                />

                <p className="mt-2 text-xs text-muted-foreground">
                  {t(
                    'identity.displayNameHelp',
                  )}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('identity.displayNameFallback', {
                    username: user?.username,
                  })}
                </p>
              </div>
            ) : (
              <h2 className="text-2xl font-bold tracking-[-.04em]">
                {visibleName}
              </h2>
            )}

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

              {editing ? (
                 <LocationPicker
                   value={homeLocation}
                   onChange={(nextLocation) => {
                     setHomeLocation(nextLocation);
                     setLocationTouched(true);
                   }}
                   onValidityChange={setLocationValid}
                   disabled={saving}
                 />
              ) : (
                <p className="mt-1 text-sm text-foreground">
                   {(user?.homeLocation
                     ? `${user.homeLocation.city}, ${user.homeLocation.country}`
                     : user?.homeCity?.trim()) ||
                    t('identity.location.notSet')}
                </p>
              )}
            </div>
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
            <div className="mt-6 border-t border-border pt-6">
              <div>
                <p className="text-sm font-bold">
                  {t('notifications.title')}
                </p>

                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t('notifications.help')}
                </p>
              </div>

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
            </div>
          </div>
        </div>

        {error && (
          <p
            className="auth-error mt-5"
            role="alert"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            className="mt-5 text-sm font-semibold text-primary"
            role="status"
          >
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}