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

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [notice, setNotice] =
    useState('');

  useEffect(() => {
    setDisplayName(
      user?.displayName ??
        user?.username ??
        '',
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

    if (!normalizedName) {
      setError(
        t('messages.nameRequired'),
      );
      return;
    }

    if (normalizedName.length > 60) {
      setError(
        t('messages.nameTooLong'),
      );
      return;
    }

    setSaving(true);

    try {
      await updateProfile({
        displayName: normalizedName,
      });

      setEditing(false);
      setNotice(t('messages.saved'));
    } catch {
      setError(t('messages.saveError'));
    } finally {
      setSaving(false);
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