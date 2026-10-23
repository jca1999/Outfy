import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Mail } from "lucide-react";
import { Link, useLocation } from "wouter";
import { AuthApiError } from "@/auth/auth-api";
import { useAuth } from "@/auth/auth-context";
import { AuthShell } from "@/components/auth-shell";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useTranslation } from "react-i18next";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  const visibleName = name.length <= 2 ? name[0] : name.slice(0, 2);
  return `${visibleName}${"•".repeat(Math.max(1, name.length - visibleName.length))}@${domain}`;
}

function initialEmailFromLocation(location: string) {
  const query = location.split("?")[1] ?? "";
  const email = new URLSearchParams(query).get("email");
  if (email) return email;
  return window.localStorage.getItem("outfy_pending_email") ?? "";
}

export function VerifyEmail() {
  const [location, navigate] = useLocation();
  const { verifyEmail, resendVerificationCode } = useAuth();
  const [email, setEmail] = useState(() => initialEmailFromLocation(location));
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const { t } = useTranslation("auth");

  useEffect(() => {
    const nextEmail = initialEmailFromLocation(location);
    if (nextEmail && nextEmail !== email) setEmail(nextEmail);
  }, [email, location]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("verifyEmail.errors.invalidEmail"));
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError(t("verifyEmail.errors.invalidCode"));
      return;
    }

    setSubmitting(true);
    try {
      await verifyEmail({ email: normalizedEmail, token: code });
      window.localStorage.removeItem("outfy_pending_email");
      navigate("/");
    } catch (cause) {
      setError(
        cause instanceof AuthApiError
          ? cause.message
          : t("verifyEmail.errors.verifyGeneric"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("verifyEmail.errors.invalidEmail"));
      return;
    }

    setResending(true);
    try {
      await resendVerificationCode({ email: normalizedEmail });
      setCooldown(60);
      setNotice(t("verifyEmail.newCodeSent"));
    } catch (cause) {
      setError(
        cause instanceof AuthApiError
          ? cause.message
          : t("verifyEmail.errors.resendGeneric"),
      );
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      eyebrow={t("verifyEmail.eyebrow")}
      title={t("verifyEmail.title")}
      description={t("verifyEmail.description")}
      backHref="/sign-up"
      footer={
        <p>
          {t("verifyEmail.wrongEmail")}{" "}
          <Link
            href="/sign-up"
            className="font-bold text-foreground hover:text-primary"
          >
            {t("verifyEmail.createAgain")}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold">{t("verifyEmail.sentTo")}</p>
            {email ? (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {maskedEmail}
              </p>
            ) : (
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("verifyEmail.emailPlaceholder")}
                className="mt-2 w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground/60"
                aria-label={t("verifyEmail.emailAria")}
                data-testid="input-verify-email"
              />
            )}
          </div>
        </div>

        <div>
          <label className="mb-3 block text-xs font-bold" htmlFor="verify-code">
            {t("verifyEmail.codeLabel")}
          </label>
          <InputOTP
            id="verify-code"
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value.replace(/\D/g, ""))}
            inputMode="numeric"
            pattern="[0-9]*"
            containerClassName="w-full justify-between"
            data-testid="input-verify-code"
          >
            <InputOTPGroup className="w-full justify-between gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="h-12 w-full rounded-xl border border-border bg-background text-base font-bold first:rounded-xl first:border last:rounded-xl"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p
            className="auth-error"
            role="alert"
            data-testid="text-verify-error"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="flex items-center gap-2 text-xs font-semibold text-teal-foreground"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4 text-teal" />
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="auth-primary-button outfy-primary-action"
          data-testid="button-verify-email"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? t("verifyEmail.submitting") : t("verifyEmail.submit")}
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || resending}
          className="mx-auto block text-xs font-bold text-foreground transition hover:text-primary disabled:cursor-not-allowed disabled:text-muted-foreground"
          data-testid="button-resend-code"
        >
          {resending
            ? t('verifyEmail.resending')
            : cooldown > 0
              ? t('verifyEmail.resendIn', {
                  seconds: cooldown,
                })
              : t('verifyEmail.resend')}
        </button>
      </form>
    </AuthShell>
  );
}
