import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { AuthApiError } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';
import { AuthShell } from '@/components/auth-shell';

export function SignIn() {
  const { signIn } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('Introduce tu nombre de usuario y contraseña.');
      return;
    }
    if (/\s/.test(username.trim())) {
      setError('El nombre de usuario no puede contener espacios.');
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
          : 'No se ha podido iniciar sesión. Inténtalo de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      singleColumn
      brandLogoSrc="/outfy-logo-signin.png"
      eyebrow="Tu próximo plan te espera"
      title="¿Qué plan toca hoy?"
      description="Entra y descubre planes, escapadas y experiencias cerca de ti."
      footer={
        <p>
          ¿Todavía no tienes cuenta?{' '}
          <Link href="/sign-up" className="font-bold text-foreground hover:text-primary">
            Crear cuenta
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="sign-in-username" className="mb-3 block text-base font-bold md:text-[17px]">
            Nombre de usuario
          </label>
          <input
            id="sign-in-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="Nombre de usuario"
            className="auth-input"
            data-testid="input-sign-in-username"
          />
        </div>
        <div>
          <label htmlFor="sign-in-password" className="mb-3 block text-base font-bold md:text-[17px]">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="sign-in-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Contraseña"
              className="auth-input pr-12"
              data-testid="input-sign-in-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              data-testid="button-toggle-sign-in-password"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert" data-testid="text-sign-in-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="auth-primary-button outfy-primary-action"
          data-testid="button-sign-in"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthShell>
  );
}