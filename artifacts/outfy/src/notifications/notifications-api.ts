import type { NotificationItem } from "@workspace/api-client-react";

export const NOTIFICATION_TYPES = [
  "connection_request",
  "connection_accepted",
  "activity_invitation",
  "activity_invitation_accepted",
  "activity_invitation_declined",
  "activity_reminder",
  "chat_message",
] as const satisfies readonly NotificationItem["type"][];

export type Notification = NotificationItem;
export type NotificationType = NotificationItem["type"];
export type NotificationActor = NonNullable<NotificationItem["actor"]>;
export type NotificationActivity = NonNullable<NotificationItem["activity"]>;

export class NotificationApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
    this.name = "NotificationApiError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function notification(value: unknown): boolean {
  if (!record(value)) return false;
  return typeof value.id === "string" && typeof value.type === "string" &&
    (value.readAt === null || typeof value.readAt === "string") &&
    typeof value.createdAt === "string" && record(value.metadata) &&
    (value.actor === null || (record(value.actor) &&
      typeof value.actor.id === "string" && typeof value.actor.username === "string" &&
      (value.actor.displayName === null || typeof value.actor.displayName === "string") &&
      (value.actor.avatarUrl === null || typeof value.actor.avatarUrl === "string"))) &&
    (value.activity === null || (record(value.activity) &&
      typeof value.activity.id === "string" && typeof value.activity.title === "string"));
}
const readResult = (value: unknown) => record(value) &&
  typeof value.readAt === "string" && Number.isFinite(Date.parse(value.readAt));

async function request<T>(
  path: string, validate: (value: unknown) => boolean, options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/notifications${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new NotificationApiError(
      data?.error ?? "Notifications request failed.",
      response.status,
      data?.code ?? "notifications_unavailable",
    );
  }
  if (!validate(data)) {
    throw new NotificationApiError("Invalid notification response.", response.status, "invalid_notification_response");
  }
  return data as T;
}

export function getNotifications(signal?: AbortSignal) {
  return request<{ notifications: Notification[] }>("",
    value => record(value) && Array.isArray(value.notifications) && value.notifications.every(notification),
    { signal });
}

export function getUnreadCount(signal?: AbortSignal) {
  return request<{ count: number }>("/unread-count",
    value => record(value) && typeof value.count === "number" && Number.isInteger(value.count) && value.count >= 0,
    { signal });
}

export function markNotificationRead(id: string) {
  return request<{ readAt: string }>(`/${encodeURIComponent(id)}/read`, readResult, {
    method: "POST",
  });
}

export function markAllNotificationsRead() {
  return request<{ readAt: string }>("/read-all", readResult, { method: "POST" });
}
