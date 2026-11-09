import type { Notification } from "./notifications-api";

export function notificationDestination(n: Notification): string | null {
  if (n.type === "chat_message") {
    const id = n.metadata.conversationId;
    return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      ? `/chats/${id}` : "/chats";
  }
  if (n.type === "connection_request" || n.type === "connection_accepted") {
    return n.actor?.username ? `/users/${encodeURIComponent(n.actor.username)}` : null;
  }
  if (n.type.startsWith("activity_")) {
    return n.activity?.id ? `/activities/${encodeURIComponent(n.activity.id)}` : null;
  }
  return null;
}
