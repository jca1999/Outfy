import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

import {
  AuthApiError,
  resetPassword,
} from '@/auth/auth-api';
import { AuthShell } from '@/components/auth-shell';

function getRecoveryToken() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('type') !== 'recovery') {
    return '';
  }

  return params.get('token_hash') ?? '';
}

export function ResetPassword() {
  const tokenHash = useMemo(() => getRecoveryToken(), []);

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('auth');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!tokenHash) {
      setError(t('resetPassword.errors.invalidLink'));
      return;
    }

    if (password.length < 8) {
      setError(t('resetPassword.errors.passwordTooShort'));
      return;
    }

    if (password !== passwordConfirmation) {
      setError(t('resetPassword.errors.passwordMismatch'));
      return;
    }

    setSubmitting(true);

    try {
      await resetPassword({
        tokenHash,
        password,
      });

      window.history.replaceState(
        {},
        document.title,
        '/reset-password',
      );

      setPassword('');
      setPasswordConfirmation('');
      setSuccess(true);
    } catch (cause) {
      if (cause instanceof AuthApiError) {
        if (cause.message.includes('igual a la contraseña actual')) {
          setError(t('resetPassword.errors.samePassword'));
        } else if (cause.message.includes('requisitos de seguridad')) {
          setError(t('resetPassword.errors.weakPassword'));
        } else if (
          cause.message.includes('no es válido') ||
          cause.message.includes('caducado')
        ) {
          setError(t('resetPassword.errors.invalidLink'));
        } else {
          setError(t('resetPassword.errors.generic'));
        }
      } else {
        setError(t('resetPassword.errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow={t('resetPassword.eyebrow')}
      title={t('resetPassword.title')}
      description={t('resetPassword.description')}
      footer={
        <p>
          <Link
            href="/sign-in"
            className="font-bold text-foreground hover:text-primary"
          >
            {t('forgotPassword.backToSignIn')}
          </Link>
        </p>
      }
    >
      {success ? (
        <div
          className="rounded-2xl border border-primary/30 bg-primary/5 p-5"
          role="status"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" />

            <div>
              <p className="text-lg font-bold">
                {t('resetPassword.successTitle')}
              </p>

              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                {t('resetPassword.successDescription')}
              </p>

              <Link
                href="/sign-in"
                className="mt-5 inline-flex font-bold text-primary hover:underline"
              >
                {t('resetPassword.signIn')}
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 md:space-y-5"
          noValidate
        >
          {!tokenHash && (
            <p className="auth-error" role="alert">
              Este enlace no es válido o está incompleto. Solicita un nuevo
              enlace de recuperación.
            </p>
          )}

          <div>
            <label
              htmlFor="new-password"
              className="mb-2 block text-base font-bold md:mb-3 md:text-[17px]"
            >
              {t('forgotPassword.backToSignIn')}
            </label>

            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder={t('resetPassword.newPasswordPlaceholder')}
                className="auth-input pr-12"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
                aria-label={
                  showPassword
                    ? t('resetPassword.hidePassword')
                    : t('resetPassword.showPassword')
                }
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-password-confirmation"
              className="mb-2 block text-base font-bold md:mb-3 md:text-[17px]"
            >
              {t('resetPassword.repeatPassword')}
            </label>

            <input
              id="new-password-confirmation"
              type={showPassword ? 'text' : 'password'}
              value={passwordConfirmation}
              onChange={(event) =>
                setPasswordConfirmation(event.target.value)
              }
              autoComplete="new-password"
              placeholder={t('resetPassword.repeatPasswordPlaceholder')}
              className="auth-input"
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="auth-primary-button"
            disabled={submitting || !tokenHash}
          >
            {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
            {submitting
              ? t('resetPassword.submitting')
              : t('resetPassword.submit')}
          </button>
        </form>
      )}
    </AuthShell>
  );
}