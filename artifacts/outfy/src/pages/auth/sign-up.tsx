import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { AuthApiError } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-context';
import { AuthShell } from '@/components/auth-shell';

interface FormErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  invitationCode?: string;
  form?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignUp() {
  const { signUp } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const nextErrors: FormErrors = {};
    const cleanUsername = username.trim();
    const cleanEmail = email.trim();
    const cleanInvitationCode = invitationCode.trim();

    if (!cleanUsername) nextErrors.username = 'El nombre de usuario es obligatorio.';
    else if (/\s/.test(cleanUsername)) {
      nextErrors.username = 'No puede contener espacios.';
    }
    if (!emailPattern.test(cleanEmail)) {
      nextErrors.email = 'Introduce un correo electrónico válido.';
    }
    if (password.length < 8) {
      nextErrors.password = 'Usa al menos 8 caracteres.';
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Las contraseñas no coinciden.';
    }
    if (!cleanInvitationCode) {
      nextErrors.invitationCode = 'El código de invitación es obligatorio.';
    }

    setErrors(nextErrors);
    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanInvitationCode = invitationCode.trim();
      await signUp({
        username: username.trim(),
        email: cleanEmail,
        password,
        invitationCode: cleanInvitationCode,
      });
      window.localStorage.setItem('outfy_pending_email', cleanEmail);
      navigate(`/verify-email?email=${encodeURIComponent(cleanEmail)}`);
    } catch (cause) {
      setErrors({
        form:
          cause instanceof AuthApiError
            ? cause.message
            : 'No se ha podido crear la cuenta. Inténtalo de nuevo.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Empieza por aquí"
      title="Crea tu cuenta."
      description="Un nombre, un correo y ganas de encontrar tu próximo plan."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link href="/sign-in" className="font-bold text-foreground hover:text-primary">
            Iniciar sesión
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="sign-up-username" className="mb-2 block text-xs font-bold">
            Nombre de usuario
          </label>
          <input
            id="sign-up-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            placeholder="tu_nombre"
            className="auth-input"
            aria-invalid={Boolean(errors.username)}
            data-testid="input-sign-up-username"
          />
          {errors.username && <p className="auth-field-error">{errors.username}</p>}
        </div>
        <div>
          <label htmlFor="sign-up-email" className="mb-2 block text-xs font-bold">
            Correo electrónico
          </label>
          <input
            id="sign-up-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="hola@ejemplo.com"
            className="auth-input"
            aria-invalid={Boolean(errors.email)}
            data-testid="input-sign-up-email"
          />
          {errors.email && <p className="auth-field-error">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="sign-up-invitation-code" className="mb-2 block text-xs font-bold">
            Código de invitación
          </label>
          <input
            id="sign-up-invitation-code"
            value={invitationCode}
            onChange={(event) => setInvitationCode(event.target.value)}
            autoComplete="one-time-code"
            placeholder="OUTFY-XXXX"
            className="auth-input font-mono-ui uppercase tracking-[.08em]"
            aria-invalid={Boolean(errors.invitationCode)}
            data-testid="input-sign-up-invitation-code"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Outfy está en desarrollo privado.
          </p>
          {errors.invitationCode && (
            <p className="auth-field-error">{errors.invitationCode}</p>
          )}
        </div>
        <div>
          <label htmlFor="sign-up-password" className="mb-2 block text-xs font-bold">
            Contraseña
          </label>
          <div className="relative">
            <input
              id="sign-up-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              className="auth-input pr-12"
              aria-invalid={Boolean(errors.password)}
              data-testid="input-sign-up-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="auth-field-error">{errors.password}</p>}
        </div>
        <div>
          <label htmlFor="sign-up-confirm-password" className="mb-2 block text-xs font-bold">
            Confirmar contraseña
          </label>
          <div className="relative">
            <input
              id="sign-up-confirm-password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="Repite tu contraseña"
              className="auth-input pr-12"
              aria-invalid={Boolean(errors.confirmPassword)}
              data-testid="input-sign-up-confirm-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground transition hover:text-foreground"
              aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="auth-field-error">{errors.confirmPassword}</p>
          )}
        </div>

        {errors.form && (
          <p className="auth-error" role="alert" data-testid="text-sign-up-error">
            {errors.form}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="auth-primary-button outfy-primary-action"
          data-testid="button-sign-up"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthShell>
  );
}