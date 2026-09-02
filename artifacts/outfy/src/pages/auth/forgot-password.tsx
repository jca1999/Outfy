import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Introduce un correo electrónico válido.');
      return;
    }

    setSubmitting(true);

    try {
      const result = await requestPasswordReset({
        email: normalizedEmail,
      });

      setNotice(result.message);
    } catch (cause) {
      setError(
        cause instanceof AuthApiError
          ? cause.message
          : 'No se ha podido enviar el correo. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow="Recupera tu acceso"
      title="¿Has olvidado tu contraseña?"
      description="Introduce el correo con el que creaste tu cuenta y te enviaremos un enlace para elegir una contraseña nueva."
      footer={
        <p>
          ¿La recuerdas?{' '}
          <Link
            href="/sign-in"
            className="font-bold text-foreground hover:text-primary"
          >
            Volver a iniciar sesión
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
            Correo electrónico
          </label>

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="tu@email.com"
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
          {submitting ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </AuthShell>
  );
}