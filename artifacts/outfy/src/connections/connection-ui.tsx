import { Loader2, RotateCw, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils";

export function profileName(p: { displayName: string | null; username: string }) {
  return p.displayName?.trim() || `@${p.username}`;
}

export function profileInitials(p: { displayName: string | null; username: string }) {
  return (p.displayName?.trim() || p.username)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ConnectionAvatar({
  profile,
  className,
}: {
  profile: { displayName: string | null; username: string; avatarUrl: string | null };
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [profile.avatarUrl]);
  const initials = profileInitials(profile);
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-bold text-primary-foreground",
        className,
      )}
    >
      {profile.avatarUrl && !failed ? (
        <img
          src={profile.avatarUrl}
          alt={t("connections.avatarAlt", { username: profile.username })}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials || <UserRound className="h-1/2 w-1/2" />
      )}
    </div>
  );
}

export function InlineError({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry?: () => void;
  testId?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive"
      data-testid={testId}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1.5 transition hover:bg-destructive/10"
          data-testid={testId ? `${testId}-retry` : undefined}
        >
          <RotateCw className="h-3.5 w-3.5" />
          {t("connections.retry")}
        </button>
      )}
    </div>
  );
}

export function ActionButton({
  onClick,
  disabled,
  busy,
  variant = "primary",
  children,
  testId,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "ghost" | "danger";
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      data-testid={testId}
      className={cn(
        "tap-scale inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-55",
        variant === "primary" && "outfy-primary-action bg-primary text-primary-foreground",
        variant === "ghost" && "border border-border text-foreground hover:bg-muted",
        variant === "danger" && "border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive",
      )}
    >
      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function RemoveConnectionDialog({
  name,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("connections.removeTitle")}</DialogTitle>
          <DialogDescription>
            {t("connections.removeDescription", { name })}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ActionButton
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            testId="button-keep-connection"
          >
            {t("connections.keep")}
          </ActionButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="button-confirm-remove-connection"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-destructive px-3 py-2.5 text-xs font-bold text-destructive-foreground transition disabled:opacity-55"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("connections.removeConfirm")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
