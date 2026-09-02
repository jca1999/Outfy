import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { AuthApiError } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';
import { AuthShell } from '@/components/auth-shell';
import { useTranslation } from 'react-i18next';

export function SignIn() {
  const { signIn } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { t } = useTranslation('auth');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError(t('signIn.errors.required'));
      return;
    }
    if (/\s/.test(username.trim())) {
      setError(t('signIn.errors.usernameSpaces'));
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ username: username.trim(), password });
      navigate('/');
    } catch (cause) {
      setError(
        cause instanceof AuthApiError
          ? cause.message
          : t('signIn.errors.generic')
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow={t('signIn.eyebrow')}
      title={t('signIn.title')}
      description={t('signIn.description')}
      footer={
        <p>
          {t('signIn.noAccount')}{' '}
          <Link href="/sign-up" className="font-bold text-foreground hover:text-primary">
            {t('signIn.createAccount')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5" noValidate>
        <div>
          <label htmlFor="sign-in-username" className="mb-2 block text-base font-bold md:mb-3 md:text-[17px]">
            {t('signIn.username')}
          </label>
          <input
            id="sign-in-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder={t('signIn.usernamePlaceholder')}
            className="auth-input"
            data-testid="input-sign-in-username"
          />
        </div>
        <div>
          <label htmlFor="sign-in-password" className="mb-2 block text-base font-bold md:mb-3 md:text-[17px]">
            {t('signIn.password')}
          </label>
          <div className="relative">
            <input
              id="sign-in-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder={t('signIn.passwordPlaceholder')}
              className="auth-input pr-12"
              data-testid="input-sign-in-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
              aria-label={
                showPassword
                  ? t('signIn.hidePassword')
                  : t('signIn.showPassword')
              }
              data-testid="button-toggle-sign-in-password"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="-mt-1 flex justify-end md:-mt-2">
          <Link
            href="/forgot-password"
            className="text-sm font-semibold text-muted-foreground transition hover:text-primary md:text-[15px]"
          >
            {t('signIn.forgotPassword')}
          </Link>
        </div>
        
        {error && (
          <p className="auth-error" role="alert" data-testid="text-sign-in-error">
            {error}
          </p>
        )}

        <div className="pt-1 md:pt-2">
          <button
            type="submit"
            className="auth-primary-button"
            disabled={submitting}
            data-testid="button-sign-in"
          >
            {submitting
              ? t('signIn.submitting')
              : t('signIn.submit')}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}