import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

import {
  AuthApiError,
  requestPasswordReset,
} from '@/auth/auth-api';
import { AuthShell } from '@/components/auth-shell';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('auth');
  
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('forgotPassword.errors.invalidEmail'));
      return;
    }

    setSubmitting(true);

    try {
      await requestPasswordReset({
        email: normalizedEmail,
      });

      setNotice(t('forgotPassword.success'));
    } catch (cause) {
      setError(
        cause instanceof AuthApiError && cause.status === 429
          ? t('forgotPassword.errors.rateLimit')
          : t('forgotPassword.errors.generic'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow={t('forgotPassword.eyebrow')}
      title={t('forgotPassword.title')}
      description={t('forgotPassword.description')}
      footer={
        <p>
          {t('forgotPassword.rememberPassword')}{' '}
          <Link
            href="/sign-in"
            className="font-bold text-foreground hover:text-primary"
          >
            {t('forgotPassword.backToSignIn')}
          </Link>
        </p>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
        noValidate
      >
        <div>
          <label
            htmlFor="forgot-email"
            className="mb-2 block text-base font-bold md:mb-3 md:text-[17px]"
          >
            {t('forgotPassword.email')}
          </label>

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder={t('forgotPassword.emailPlaceholder')}
              className="auth-input pl-12"
            />
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        {notice && (
          <div
            className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm leading-relaxed text-foreground">
              {notice}
            </p>
          </div>
        )}

        <button
          type="submit"
          className="auth-primary-button"
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
          {submitting
            ? t('forgotPassword.submitting')
            : t('forgotPassword.submit')}
        </button>
      </form>
    </AuthShell>
  );
}