import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!tokenHash) {
      setError(
        'Este enlace de recuperación no es válido. Solicita uno nuevo.',
      );
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== passwordConfirmation) {
      setError('Las contraseñas no coinciden.');
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
      setError(
        cause instanceof AuthApiError
          ? cause.message
          : 'No se ha podido cambiar la contraseña. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow="Casi está"
      title="Crea una contraseña nueva"
      description="Elige una contraseña nueva para volver a acceder a tu cuenta de Outfy."
      footer={
        <p>
          <Link
            href="/sign-in"
            className="font-bold text-foreground hover:text-primary"
          >
            Volver a iniciar sesión
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
                Contraseña actualizada
              </p>

              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>

              <Link
                href="/sign-in"
                className="mt-5 inline-flex font-bold text-primary hover:underline"
              >
                Iniciar sesión
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
              Nueva contraseña
            </label>

            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Nueva contraseña"
                className="auth-input pr-12"
              />

              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
                aria-label={
                  showPassword
                    ? 'Ocultar contraseña'
                    : 'Mostrar contraseña'
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
              Repite la contraseña
            </label>

            <input
              id="new-password-confirmation"
              type={showPassword ? 'text' : 'password'}
              value={passwordConfirmation}
              onChange={(event) =>
                setPasswordConfirmation(event.target.value)
              }
              autoComplete="new-password"
              placeholder="Repite la contraseña"
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
              ? 'Guardando…'
              : 'Guardar nueva contraseña'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}