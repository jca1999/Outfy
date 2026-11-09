import { sendNotification } from "web-push";
import { getSupabaseAdmin } from "./supabase";
import { getPushConfiguration } from "./push-config";
import { isPushEndpoint, validSubscriptionKeys } from "./push-validation";
import {
  presentNotifications,
  type NotificationRow,
} from "./notification-presenter";
import { logger } from "./logger";

const ELIGIBLE = new Set([
  "connection_request",
  "connection_accepted",
  "activity_invitation",
  "activity_invitation_accepted",
  "activity_invitation_declined",
  "activity_joined",
  "chat_message",
]);
type Device = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  updated_at: string;
};

/** No reliable server-side user locale exists. Push uses English, UI stays ES/EN. */
export async function pushPayload(recipientId: string, row: NotificationRow) {
  const [item] = await presentNotifications(recipientId, [row]);
  const actor = item.actor ? `@${item.actor.username}` : "Someone";
  const plan = item.activity
    ? `"${item.activity.title.slice(0, 120)}"`
    : "a plan";
  const bodies: Record<string, string> = {
    connection_request: `${actor} sent you a friend request.`,
    connection_accepted: `${actor} accepted your friend request.`,
    activity_invitation: `${actor} invited you to ${plan}.`,
    activity_invitation_accepted: `${actor} accepted your invitation to ${plan}.`,
    activity_invitation_declined: `${actor} declined your invitation to ${plan}.`,
    activity_joined: `${actor} joined your plan ${plan}.`,
    chat_message: item.activity ? `${actor} sent a message in ${plan}.` : `${actor} sent you a message.`,
  };
  const url = row.type === "chat_message"
    ? item.metadata.conversationId ? `/chats/${item.metadata.conversationId}` : "/chats"
    : row.type.startsWith("connection_")
    ? item.actor
      ? `/users/${encodeURIComponent(item.actor.username)}`
      : "/connections"
    : item.activity
      ? `/activities/${encodeURIComponent(item.activity.id)}`
      : "/";
  return {
    title: "Outfy",
    body: bodies[row.type],
    url,
    tag: `outfy:${row.id}`,
  };
}

/** Optional, best-effort channel. Caller has already stored the preference-eligible event. */
export async function sendPushToUser(
  recipientId: string,
  row: NotificationRow,
) {
  const result = { sent: 0, failed: 0, removed: 0 };
  if (!ELIGIBLE.has(row.type)) return result;
  const config = getPushConfiguration();
  if (!config) return result;
  try {
    const db = getSupabaseAdmin();
    const devices: Device[] = [];
    let after: string | undefined;
    // Cursor pages avoid silently dropping devices at PostgREST's row cap.
    for (;;) {
      let query = db
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth,updated_at")
        .eq("user_id", recipientId)
        .order("id", { ascending: true })
        .limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query.abortSignal(
        AbortSignal.timeout(2500),
      );
      if (error) throw error;
      const page = (data ?? []) as Device[];
      devices.push(...page);
      if (page.length < 200) break;
      after = page[page.length - 1].id;
    }
    if (!devices.length) return result;
    const payload = JSON.stringify(await pushPayload(recipientId, row));
    // Bounded concurrent requests, but every registered device is attempted.
    for (let offset = 0; offset < devices.length; offset += 10) {
      await Promise.all(
        devices.slice(offset, offset + 10).map(async (device) => {
          try {
            if (
              !isPushEndpoint(device.endpoint) ||
              !validSubscriptionKeys({
                p256dh: device.p256dh,
                auth: device.auth,
              })
            ) {
              throw new Error("Invalid stored subscription");
            }
            await sendNotification(
              {
                endpoint: device.endpoint,
                keys: { p256dh: device.p256dh, auth: device.auth },
              },
              payload,
              {
                vapidDetails: config,
                TTL: 1800,
                urgency: "normal",
                timeout: 4000,
              },
            );
            result.sent++;
          } catch (error) {
            result.failed++;
            const statusCode =
              error && typeof error === "object" && "statusCode" in error
                ? Number(error.statusCode)
                : null;
            // Never log the WebPushError object: it includes endpoint/response body.
            logger.warn(
              { statusCode, subscriptionId: device.id },
              "Web Push delivery failed",
            );
            if (statusCode === 404 || statusCode === 410) {
              try {
                const removed = await db
                  .from("push_subscriptions")
                  .delete()
                  .eq("id", device.id)
                  .eq("user_id", recipientId)
                  .eq("updated_at", device.updated_at)
                  .eq("p256dh", device.p256dh)
                  .eq("auth", device.auth)
                  .select("id")
                  .abortSignal(AbortSignal.timeout(2500))
                  .maybeSingle();
                if (removed.error) throw removed.error;
                if (removed.data) result.removed++;
              } catch {
                logger.warn(
                  { subscriptionId: device.id },
                  "Unable to remove expired push subscription",
                );
              }
            }
          }
        }),
      );
    }
  } catch {
    logger.warn(
      { code: "push_delivery_unavailable" },
      "Unable to prepare Web Push delivery",
    );
    result.failed++;
  }
  return result;
}
