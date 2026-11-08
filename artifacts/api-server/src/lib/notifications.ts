import { getSupabaseAdmin } from "./supabase";
import { logger } from "./logger";
import type { NotificationItem } from "@workspace/api-zod";
import { sendPushToUser } from "./push-delivery";

export const NOTIFICATION_TYPES = [
  "connection_request", "connection_accepted", "activity_invitation",
  "activity_invitation_accepted", "activity_invitation_declined",
  "activity_joined",
  "activity_reminder", "chat_message",
] as const;
export type NotificationType = NotificationItem["type"];
type NotificationInput = {
  recipientId: string;
  actorId?: string | null;
  activityId?: string | null;
  type: NotificationType;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

/** Best effort only: caller's successful business action must never fail here. */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    if (input.recipientId === input.actorId) return;
    if (!NOTIFICATION_TYPES.includes(input.type) || (input.dedupeKey?.length ?? 0) > 200) {
      throw new Error("Invalid notification input");
    }
    const metadata = input.metadata ?? {};
    if (typeof metadata !== "object" || Array.isArray(metadata) || metadata === null) {
      throw new Error("Notification metadata must be an object");
    }
    // Reject circular/non-JSON input before calling the database.
    JSON.stringify(metadata);
    const preference = input.type.startsWith("connection_") ? "notify_connections"
      : input.type === "chat_message" ? "notify_messages"
      : input.type === "activity_reminder" ? "notify_reminders" : "notify_activities";
    const db = getSupabaseAdmin();
    const { data: profile, error: preferenceError } = await db.from("profiles")
      .select("notify_connections,notify_activities,notify_messages,notify_reminders")
      .eq("id", input.recipientId).abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (preferenceError) throw preferenceError;
    // Missing/unknown preferences fail closed, not as implicit opt-in.
    if (!profile || profile[preference] !== true) return;
    const { data, error } = await db.from("notifications").insert({
      recipient_id: input.recipientId,
      actor_id: input.actorId ?? null,
      activity_id: input.activityId ?? null,
      type: input.type,
      metadata,
      dedupe_key: input.dedupeKey ?? null,
    }).select("id,created_at").abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (error && error.code !== "23505") throw error;
    if (!error && data) {
      // Only a new stored event triggers push; dedupe conflicts never do.
      // Do not wait for external push providers on a primary business request.
      void sendPushToUser(input.recipientId, {
        id: data.id, created_at: data.created_at, read_at: null,
        type: input.type, actor_id: input.actorId ?? null,
        activity_id: input.activityId ?? null, metadata,
      }).catch(() => logger.warn({ notificationType: input.type }, "Web Push delivery unavailable"));
    }
  } catch (error) {
    logger.warn({ err: error, notificationType: input.type }, "Unable to create internal notification");
  }
}

/** Recipient/organizer is resolved from current server-owned activity data. */
export async function notifyInvitationResponse(
  activityId: string, actorId: string, invitationId: string,
  type: "activity_invitation_accepted" | "activity_invitation_declined",
  cycle: string,
): Promise<void> {
  try {
    const { data, error } = await getSupabaseAdmin().from("activities")
      .select("creator_id").eq("id", activityId)
      .abortSignal(AbortSignal.timeout(2000)).maybeSingle();
    if (error) throw error;
    if (!data) return;
    await createNotification({
      recipientId: data.creator_id, actorId, activityId, type,
      metadata: { invitationId },
      dedupeKey: `${type}:${invitationId}:${cycle}`,
    });
  } catch (error) {
    logger.warn({ err: error, notificationType: type }, "Unable to resolve notification organizer");
  }
}
