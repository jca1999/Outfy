import { useRef, useState } from "react";
import { Bell, CalendarCheck, CalendarX, CalendarPlus, CheckCheck, Clock, MessageCircle, RotateCw, UserCheck, UserPlus, BellOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils";
import type { Notification, NotificationType } from "./notifications-api";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useNotificationFocusRefresh,
  useUnreadNotificationCount,
} from "./use-notifications";

const FRIEND_TYPES: NotificationType[] = ["connection_request", "connection_accepted"];
const KNOWN = new Set<string>([
  "connection_request", "connection_accepted", "activity_invitation",
  "activity_invitation_accepted", "activity_invitation_declined",
  "activity_reminder", "chat_message","activity_joined",
]);
const ICONS: Record<string, LucideIcon> = {
  connection_request: UserPlus,
  connection_accepted: UserCheck,
  activity_invitation: CalendarPlus,
  activity_invitation_accepted: CalendarCheck,
  activity_invitation_declined: CalendarX,
  activity_reminder: Clock,
  chat_message: MessageCircle,
  activity_joined: UserPlus,
};

function destination(n: Notification): string | null {
  if (FRIEND_TYPES.includes(n.type)) {
    return n.actor?.username ? `/users/${encodeURIComponent(n.actor.username)}` : null;
  }
  if (n.type.startsWith("activity_") || n.type === "chat_message") {
    return n.activity?.id ? `/activities/${encodeURIComponent(n.activity.id)}` : null;
  }
  return null;
}

function relativeTime(iso: string, lang: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = (then - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"],
  ];
  const abs = Math.abs(diff);
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < steps[3][0]) return rtf.format(Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(iso));
}

export function NotificationBell() {
  const { t, i18n } = useTranslation("common");
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [allFailed, setAllFailed] = useState(false);
  const count = useUnreadNotificationCount();
  const list = useNotificationList(open);
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  useNotificationFocusRefresh();
  // Synchronous guard: blocks double clicks and mark-one/mark-all overlap
  // before React re-renders the disabled state.
  const busyRef = useRef(false);
  const busy = markOne.isPending || markAll.isPending;

  const n = count.data?.count ?? 0;
  const badge = n > 99 ? "99+" : String(n);
  const items = list.data?.notifications ?? [];
  const hasUnread = items.some((i) => !i.readAt) || n > 0;

  const label = count.isError
    ? t("notifications.bellUnknown")
    : n > 0
      ? t("notifications.bellUnread", { count: n })
      : t("notifications.bell");

  function text(item: Notification) {
    const type = KNOWN.has(item.type) ? item.type : "unknown";
    const name = item.actor ? `@${item.actor.username}` : null;
    const title = item.activity?.title ?? null;
    const key = `notifications.types.${type}.${name ? "actor" : "noActor"}${title ? "Activity" : ""}`;
    return t(key, { name, title });
  }

  function onSelect(item: Notification) {
    setFailedId(null);
    const go = () => {
      const dest = destination(item);
      if (dest) {
        setOpen(false);
        navigate(dest);
      }
    };
    if (busyRef.current) return;
    if (item.readAt) {
      go();
      return;
    }
    busyRef.current = true;
    markOne.mutate(item.id, {
      onSuccess: go,
      onError: () => setFailedId(item.id),
      onSettled: () => {
        busyRef.current = false;
      },
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-full p-2.5 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={label}
          data-testid="button-notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {count.isError ? (
            <span
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-1 font-mono-ui text-[9px] text-muted-foreground"
              data-testid="badge-notifications-unknown"
              aria-hidden="true"
            >
              ?
            </span>
          ) : n > 0 ? (
            <span
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-background"
              data-testid="badge-notifications"
              aria-hidden="true"
            >
              {badge}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t("notifications.title")}
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="flex max-h-[min(560px,calc(100dvh-96px))] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border-border bg-card p-0 shadow-xl"
        data-testid="panel-notifications"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
          <div>
            <p className="font-mono-ui text-[9px] uppercase tracking-[.18em] text-muted-foreground">
              {t("notifications.eyebrow")}
            </p>
            <h2 className="text-base font-bold tracking-[-.02em]">{t("notifications.title")}</h2>
          </div>
          <button
            type="button"
            disabled={busy || !hasUnread || count.isError && !items.length}
            onClick={() => {
              if (busyRef.current) return;
              busyRef.current = true;
              setAllFailed(false);
              markAll.mutate(undefined, {
                onError: () => setAllFailed(true),
                onSettled: () => {
                  busyRef.current = false;
                },
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-40"
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {markAll.isPending ? t("notifications.markingAll") : t("notifications.markAll")}
          </button>
        </div>
        {allFailed && (
          <p role="alert" className="border-b border-border/70 bg-destructive/10 px-4 py-2 text-xs text-destructive" data-testid="text-mark-all-error">
            {t("notifications.markAllError")}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {list.isPending ? (
            <ul className="space-y-1 p-2" aria-busy="true" aria-label={t("notifications.loading")}>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex gap-3 rounded-xl p-3">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                  <span className="flex-1 space-y-2 pt-1">
                    <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
                    <span className="block h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                  </span>
                </li>
              ))}
            </ul>
          ) : list.isError ? (
            <div className="flex flex-col items-center px-6 py-10 text-center" role="alert">
              <p className="text-sm font-bold">{t("notifications.errorTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("notifications.errorBody")}</p>
              <button
                type="button"
                onClick={() => void list.refetch()}
                disabled={list.isFetching}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-50"
                data-testid="button-notifications-retry"
              >
                <RotateCw className={cn("h-3.5 w-3.5", list.isFetching && "animate-spin")} />
                {t("notifications.retry")}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center" data-testid="status-notifications-empty">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <BellOff className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">{t("notifications.emptyTitle")}</p>
              <p className="mt-1 max-w-[240px] text-xs text-muted-foreground">{t("notifications.emptyBody")}</p>
            </div>
          ) : (
            <ul className="p-1.5" data-testid="list-notifications">
              {items.map((item) => {
                const Icon = ICONS[item.type] ?? Bell;
                const unread = !item.readAt;
                const pending = markOne.isPending && markOne.variables === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      disabled={busy}
                      aria-busy={pending}
                      className={cn(
                        "relative flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60",
                        unread && "bg-primary/[.06]",
                      )}
                      data-testid={`button-notification-${item.id}`}
                    >
                      <span className="relative shrink-0">
                        <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-teal text-[10px] font-bold text-teal-foreground">
                          {item.actor ? item.actor.username.slice(0, 2).toUpperCase() : <Icon className="h-4 w-4" />}
                          {item.actor?.avatarUrl && (
                            <img src={item.actor.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                          )}
                        </span>
                        {item.actor && (
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border">
                            <Icon className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block break-words text-[13px] leading-snug", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {text(item)}
                        </span>
                        <span className="mt-1 block font-mono-ui text-[10px] text-muted-foreground/80">
                          <time dateTime={item.createdAt}>{relativeTime(item.createdAt, i18n.language)}</time>
                          {unread && <span className="sr-only"> {t("notifications.unread")}</span>}
                        </span>
                        {failedId === item.id && (
                          <span role="alert" className="mt-1 block text-[11px] font-medium text-destructive" data-testid={`text-notification-error-${item.id}`}>
                            {t("notifications.markError")}
                          </span>
                        )}
                      </span>
                      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
