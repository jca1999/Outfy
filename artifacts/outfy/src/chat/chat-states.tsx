import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ChatInlineError({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry?: () => void;
  testId: string;
}) {
  const { t } = useTranslation("chats");
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive"
      role="alert"
      data-testid={testId}
    >
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 px-3 py-1.5 transition hover:bg-destructive/10"
          data-testid={`${testId}-retry`}
        >
          <RotateCw className="h-3 w-3" />
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function ChatPlaceholder({
  icon,
  title,
  body,
  children,
  testId,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6 py-14 text-center"
      data-testid={testId}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-primary/12 text-primary">
        {icon}
      </div>
      <p className="mt-5 text-base font-bold tracking-[-.02em]">{title}</p>
      {body && <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="space-y-1 p-2" data-testid="status-inbox-loading">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-end gap-3 p-4 sm:p-6" data-testid="status-messages-loading">
      <div className="h-10 w-1/2 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
      <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl rounded-br-sm bg-primary/20" />
      <div className="h-14 w-3/5 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
    </div>
  );
}
