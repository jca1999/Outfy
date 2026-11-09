import { Router, type Request, type Response } from "express";
import {
  OpenDirectChatBody, SendChatMessageBody, ListChatConversationsResponse,
  ListChatMessagesResponse, OpenDirectChatResponse, SendChatMessageResponse,
  MarkChatReadResponse, GetActivityChatResponse, GetChatConversationResponse,
} from "@workspace/api-zod";
import { currentSession } from "./auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { streamChatEvents } from "../lib/chat-events";
import { notifyChatMessage } from "../lib/chat-notifications";
import {
  CHAT_UUID, CONVERSATION_FIELDS, MESSAGE_FIELDS, ChatError, authorizeConversation,
  requireActivityMember, requireFriend, findDirect, databaseError, presentConversations,
  presentMessages, decodeCursor, encodeCursor, pageLimit, olderMessages, olderInbox,
  compareConversations, type ConversationRow, type MessageRow,
} from "../lib/chat";

const router = Router();

function fail(response: Response, status: number, code: string) {
  response.status(status).json({ error: "The chat request could not be completed.", code });
}
function uuid(raw: unknown, code: string) {
  if (typeof raw !== "string" || !CHAT_UUID.test(raw)) throw new ChatError(400, code);
  return raw.toLowerCase();
}
function endpoint(handler: (request: Request, response: Response, userId: string) => Promise<void>) {
  return async (request: Request, response: Response): Promise<void> => {
    response.set("Cache-Control", "private, no-store");
    let userId: string | undefined;
    try { userId = (await currentSession(request, response))?.user.id; }
    catch { request.log.warn("Unable to authenticate chat request"); }
    if (!userId) { fail(response, 401, "authentication_required"); return; }
    try { await handler(request, response, userId.toLowerCase()); }
    catch (error) {
      if (response.headersSent) { response.end(); return; }
      if (error instanceof ChatError) { fail(response, error.status, error.code); return; }
      // Do not log chat message bodies, profiles, or raw DB error details.
      request.log.error("Chat request failed");
      fail(response, 500, "chat_unavailable");
    }
  };
}

router.get("/chat/conversations", endpoint(async (request, response, userId) => {
  const limit = pageLimit(request.query.limit, 20, 50);
  const cursor = decodeCursor(request.query.cursor, "inbox", userId);
  const db = getSupabaseAdmin();
  // Two bounded, disjoint branches avoid an unlimited activity-membership ID
  // list. The inner joins filter membership BEFORE ordering and limiting.
  function query(activity: boolean) {
    let q = db.from("chat_conversations").select(activity
      ? `${CONVERSATION_FIELDS},activities!inner(activity_members!inner(user_id))`
      : CONVERSATION_FIELDS).eq("type", activity ? "activity" : "direct");
    q = activity
      ? q.eq("activities.activity_members.user_id", userId)
      : q.or(`direct_user_a_id.eq.${userId},direct_user_b_id.eq.${userId}`);
    if (cursor) {
      if (cursor.lastMessageAt === null) q = q.is("last_message_at", null);
      q = q.or(olderInbox(cursor));
    }
    return q.order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
      .returns<ConversationRow[]>();
  }
  const branches = await Promise.all([query(false), query(true)]);
  for (const branch of branches) if (branch.error) throw branch.error;
  const rows = branches.flatMap(branch => (branch.data ?? []) as ConversationRow[])
    .sort(compareConversations);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const payload = {
    conversations: await presentConversations(page, userId),
    nextCursor: rows.length > limit && last ? encodeCursor({
      kind: "inbox", scope: userId, id: last.id, createdAt: last.created_at, lastMessageAt: last.last_message_at,
    }) : null,
  };
  ListChatConversationsResponse.parse(payload);
  response.json(payload);
}));

router.get("/chat/conversations/:id", endpoint(async (request, response, userId) => {
  const id = uuid(request.params.id, "invalid_conversation");
  const conversation = await authorizeConversation(id, userId);
  const payload = { conversation: (await presentConversations([conversation], userId))[0] };
  GetChatConversationResponse.parse(payload);
  response.json(payload);
}));

router.get("/chat/conversations/:id/events", endpoint(async (request, response, userId) => {
  const id = uuid(request.params.id, "invalid_conversation");
  await authorizeConversation(id, userId);
  if (response.destroyed || request.aborted) return;
  streamChatEvents(request, response, id, userId);
}));

router.post("/chat/direct", endpoint(async (request, response, userId) => {
  const input = OpenDirectChatBody.safeParse(request.body);
  if (!input.success) throw new ChatError(400, "invalid_target");
  const targetId = uuid(input.data.userId, "invalid_target");
  if (targetId === userId) throw new ChatError(400, "self_chat");
  const db = getSupabaseAdmin();
  const target = await db.from("profiles").select("id").eq("id", targetId).maybeSingle();
  if (target.error) throw target.error;
  if (!target.data) throw new ChatError(404, "user_not_found");
  await requireFriend(userId, targetId);
  let conversation = await findDirect(userId, targetId);
  let created = false;
  if (!conversation) {
    const [a, b] = [userId, targetId].sort();
    const { data, error } = await db.from("chat_conversations")
      .insert({ type: "direct", direct_user_a_id: a, direct_user_b_id: b })
      .select(CONVERSATION_FIELDS).single();
    if (error?.code === "23505") {
      // Another request may have inserted either orientation of this pair.
      conversation = await findDirect(userId, targetId);
      if (!conversation) throw new ChatError(409, "chat_changed");
      await requireFriend(userId, targetId);
    } else if (error) {
      databaseError(error);
    } else {
      conversation = data as ConversationRow;
      created = true;
    }
  }
  if (!conversation) throw new Error("Missing direct conversation");
  const payload = { conversation: (await presentConversations([conversation], userId))[0] };
  OpenDirectChatResponse.parse(payload);
  response.status(created ? 201 : 200).json(payload);
}));

router.get("/chat/conversations/:id/messages", endpoint(async (request, response, userId) => {
  const id = uuid(request.params.id, "invalid_conversation");
  const limit = pageLimit(request.query.limit, 50, 100);
  const cursor = decodeCursor(request.query.cursor, "messages", id);
  const conversation = await authorizeConversation(id, userId);
  let query = getSupabaseAdmin().from("chat_messages").select(MESSAGE_FIELDS).eq("conversation_id", id);
  if (cursor) query = query.or(olderMessages(cursor));
  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).limit(limit + 1);
  if (error) throw error;
  const rows = (data ?? []) as MessageRow[];
  const page = rows.slice(0, limit);
  const oldest = page.at(-1);
  const payload = {
    messages: await presentMessages([...page].reverse(), userId, conversation),
    nextCursor: rows.length > limit && oldest ? encodeCursor({
      kind: "messages", scope: id, id: oldest.id, createdAt: oldest.created_at,
    }) : null,
  };
  ListChatMessagesResponse.parse(payload);
  response.json(payload);
}));

router.post("/chat/conversations/:id/messages", endpoint(async (request, response, userId) => {
  const id = uuid(request.params.id, "invalid_conversation");
  const input = SendChatMessageBody.safeParse(request.body);
  if (!input.success) throw new ChatError(400, "invalid_message_body");
  const body = input.data.body.trim();
  // Match PostgreSQL char_length, including non-BMP Unicode characters.
  if (!body || [...body].length > 2000) throw new ChatError(400, "invalid_message_body");
  const conversation = await authorizeConversation(id, userId, true);
  const { data, error } = await getSupabaseAdmin().from("chat_messages")
    .insert({ conversation_id: id, sender_id: userId, body }).select(MESSAGE_FIELDS).single();
  if (error) databaseError(error);
  const payload = { message: (await presentMessages([data as MessageRow], userId, conversation))[0] };
  SendChatMessageResponse.parse(payload);
  void notifyChatMessage(conversation, data as MessageRow, userId);
  response.status(201).json(payload);
}));

router.post("/chat/conversations/:id/read", endpoint(async (request, response, userId) => {
  const id = uuid(request.params.id, "invalid_conversation");
  await authorizeConversation(id, userId);
  const readAt = new Date().toISOString();
  const { error } = await getSupabaseAdmin().from("chat_read_states")
    .upsert({ conversation_id: id, user_id: userId, last_read_at: readAt }, { onConflict: "conversation_id,user_id" });
  if (error) databaseError(error);
  const payload = { success: true, readAt };
  MarkChatReadResponse.parse(payload);
  response.json(payload);
}));

router.get("/chat/activities/:activityId", endpoint(async (request, response, userId) => {
  const activityId = uuid(request.params.activityId, "invalid_activity");
  await requireActivityMember(activityId, userId);
  const { data, error } = await getSupabaseAdmin().from("chat_conversations")
    .select(CONVERSATION_FIELDS).eq("type", "activity").eq("activity_id", activityId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ChatError(404, "chat_not_found");
  const payload = { conversation: (await presentConversations([data as ConversationRow], userId))[0] };
  GetActivityChatResponse.parse(payload);
  response.json(payload);
}));

export default router;
