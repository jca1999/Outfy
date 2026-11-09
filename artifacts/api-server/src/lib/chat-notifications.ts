import { createNotification } from "./notifications";
import { getSupabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { CHAT_UUID, otherUserId, type ConversationRow, type MessageRow } from "./chat";

/** Detached best-effort fanout. Never make a saved message depend on delivery. */
export async function notifyChatMessage(conversation: ConversationRow, message: MessageRow, senderId: string) {
  try {
    if (message.conversation_id !== conversation.id || message.sender_id !== senderId ||
      ![conversation.id, message.id, senderId].every(id => CHAT_UUID.test(id))) return;
    const db = getSupabaseAdmin();
    async function notify(recipientId: string) {
      if (recipientId === senderId || !CHAT_UUID.test(recipientId)) return;
      // A member can leave while an earlier recipient batch is being delivered.
      if (conversation.type === "activity") {
        const { data, error } = await db.from("activity_members").select("user_id")
          .eq("activity_id", conversation.activity_id!).eq("user_id", recipientId)
          .abortSignal(AbortSignal.timeout(2000)).maybeSingle();
        if (error) throw error;
        if (!data) return;
      }
      await createNotification({
        recipientId, actorId: senderId,
        activityId: conversation.type === "activity" ? conversation.activity_id : null,
        type: "chat_message",
        metadata: { conversationId: conversation.id, messageId: message.id },
        dedupeKey: `chat_message:${message.id}:${recipientId}`,
      });
    }
    if (conversation.type === "direct") {
      await notify(otherUserId(conversation, senderId));
      return;
    }
    if (!conversation.activity_id || !CHAT_UUID.test(conversation.activity_id)) return;
    let after: string | undefined;
    for (;;) {
      let query = db.from("activity_members").select("user_id").eq("activity_id", conversation.activity_id)
        .neq("user_id", senderId).order("user_id", { ascending: true }).limit(100);
      if (after) query = query.gt("user_id", after);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(2000));
      if (error) throw error;
      const page = (data ?? []) as { user_id: string }[];
      for (let offset = 0; offset < page.length; offset += 5) {
        // One failed recipient must not stop delivery to the other members.
        await Promise.allSettled(page.slice(offset, offset + 5).map(row => notify(row.user_id)));
      }
      if (page.length < 100) break;
      const next = page.at(-1)!.user_id;
      if (!CHAT_UUID.test(next) || (after && next <= after)) break;
      after = next;
    }
  } catch {
    // Never log message bodies, raw notification metadata or provider errors.
    logger.warn({ notificationType: "chat_message" }, "Unable to prepare chat notifications");
  }
}
