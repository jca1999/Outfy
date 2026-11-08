import { getSupabaseAdmin } from "./supabase";
import { findConnection, visibleConnectionProfile } from "./connections";

export const CHAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CONVERSATION_FIELDS =
  "id,type,activity_id,direct_user_a_id,direct_user_b_id,last_message_at,created_at,updated_at";
export const MESSAGE_FIELDS = "id,conversation_id,sender_id,body,created_at";
const PROFILE_FIELDS = "id,username,display_name,display_name_visibility,is_profile_private,home_city,avatar_path";

export type ConversationRow = {
  id: string;
  type: "direct" | "activity";
  activity_id: string | null;
  direct_user_a_id: string | null;
  direct_user_b_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};
export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  display_name_visibility: string | null;
  is_profile_private: boolean | null;
  home_city: string | null;
  avatar_path: string | null;
};

export class ChatError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function databaseError(error: { code?: string; message?: string }) {
  // Map only known trigger failures. Never return raw Postgres details.
  if (["chat_requires_accepted_connection", "chat_connection_not_accepted"].includes(error.message ?? "")) {
    throw new ChatError(403, "chat_connection_not_accepted");
  }
  if (["chat_sender_not_participant", "chat_reader_not_participant", "chat_activity_membership_required"]
    .includes(error.message ?? "")) throw new ChatError(403, "chat_access_denied");
  if (error.message === "chat_conversation_not_found") throw new ChatError(404, "chat_not_found");
  throw error;
}

export async function requireActivityMember(activityId: string, userId: string) {
  const { data, error } = await getSupabaseAdmin().from("activity_members")
    .select("user_id").eq("activity_id", activityId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ChatError(403, "chat_access_denied");
}

export async function requireFriend(userId: string, targetId: string) {
  if ((await findConnection(userId, targetId))?.status !== "accepted") {
    throw new ChatError(403, "chat_connection_not_accepted");
  }
}

export async function authorizeConversation(id: string, userId: string, sending = false) {
  const { data, error } = await getSupabaseAdmin().from("chat_conversations")
    .select(CONVERSATION_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ChatError(404, "chat_not_found");
  const row = data as ConversationRow;
  if (row.type === "direct") {
    if (row.direct_user_a_id !== userId && row.direct_user_b_id !== userId) {
      throw new ChatError(403, "chat_access_denied");
    }
    if (sending) await requireFriend(userId, otherUserId(row, userId));
  } else if (row.type === "activity" && row.activity_id) {
    await requireActivityMember(row.activity_id, userId);
  } else {
    throw new ChatError(403, "chat_access_denied");
  }
  return row;
}

export function otherUserId(row: ConversationRow, userId: string) {
  return (row.direct_user_a_id === userId ? row.direct_user_b_id : row.direct_user_a_id)!;
}

export async function findDirect(userId: string, targetId: string) {
  const { data, error } = await getSupabaseAdmin().from("chat_conversations")
    .select(CONVERSATION_FIELDS).eq("type", "direct")
    .or(`and(direct_user_a_id.eq.${userId},direct_user_b_id.eq.${targetId}),and(direct_user_a_id.eq.${targetId},direct_user_b_id.eq.${userId})`)
    .maybeSingle();
  if (error) throw error;
  return data as ConversationRow | null;
}

// Profiles, friendship visibility and avatar signatures are batched per page.
// Shared-activity names require BOTH users to still be members of this activity.
export async function chatProfiles(ids: string[], viewerId: string, activityId?: string) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, ReturnType<typeof safeProfile>>();
  const db = getSupabaseAdmin();
  const [profiles, outgoing, incoming, members] = await Promise.all([
    db.from("profiles").select(PROFILE_FIELDS).in("id", unique).limit(unique.length),
    db.from("connections").select("addressee_id").eq("requester_id", viewerId)
      .eq("status", "accepted").in("addressee_id", unique).limit(unique.length),
    db.from("connections").select("requester_id").eq("addressee_id", viewerId)
      .eq("status", "accepted").in("requester_id", unique).limit(unique.length),
    activityId
      ? db.from("activity_members").select("user_id").eq("activity_id", activityId)
        .in("user_id", unique).limit(unique.length)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [profiles, outgoing, incoming, members]) if (result.error) throw result.error;
  const accepted = new Set([
    ...(outgoing.data ?? []).map(r => r.addressee_id as string),
    ...(incoming.data ?? []).map(r => r.requester_id as string),
  ]);
  const shared = new Set((members.data ?? []).map(r => r.user_id as string));
  const rows = (profiles.data ?? []) as ProfileRow[];
  const withAvatar = rows.filter(p => p.avatar_path === `${p.id}/avatar.webp`);
  const urls = new Map<string, string>();
  if (withAvatar.length) {
    const { data, error } = await db.storage.from("avatars")
      .createSignedUrls(withAvatar.map(p => `${p.id}/avatar.webp`), 3600);
    if (!error) data?.forEach((item, i) => {
      if (item.signedUrl) urls.set(withAvatar[i].id, item.signedUrl);
    });
  }
  return new Map(rows.map(p => [p.id, safeProfile(p, viewerId, accepted.has(p.id), shared.has(p.id), urls.get(p.id))]));
}

function safeProfile(p: ProfileRow, viewerId: string, accepted: boolean, shared: boolean, avatar?: string) {
  const base = visibleConnectionProfile(p, accepted);
  const extraName = p.id === viewerId ||
    ((p.display_name_visibility ?? "shared_activity") === "shared_activity" && shared);
  return {
    id: p.id, username: p.username,
    displayName: extraName ? p.display_name?.trim() || null : base.displayName,
    avatarUrl: avatar ?? null,
  };
}

export function lastMessage(row: MessageRow) {
  return { id: row.id, body: row.body, senderId: row.sender_id, createdAt: row.created_at };
}

export async function presentMessages(rows: MessageRow[], userId: string, conversation: ConversationRow) {
  const profiles = await chatProfiles(rows.map(r => r.sender_id), userId, conversation.activity_id ?? undefined);
  return rows.map(row => ({
    ...lastMessage(row), conversationId: row.conversation_id, sender: profiles.get(row.sender_id) ?? null,
  }));
}

export async function presentConversations(rows: ConversationRow[], userId: string) {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const ids = rows.map(r => r.id);
  const activityIds = rows.flatMap(r => r.activity_id ? [r.activity_id] : []);
  const [profiles, activities, reads, latest] = await Promise.all([
    chatProfiles(rows.filter(r => r.type === "direct").map(r => otherUserId(r, userId)), userId),
    activityIds.length
      ? db.from("activities").select("id,title,status,category").in("id", activityIds).limit(activityIds.length)
      : Promise.resolve({ data: [], error: null }),
    db.from("chat_read_states").select("conversation_id,last_read_at").eq("user_id", userId)
      .in("conversation_id", ids).limit(ids.length),
    // PostgREST's embedded limit applies per parent, not to the whole message set.
    db.from("chat_conversations").select(`id,chat_messages(${MESSAGE_FIELDS})`).in("id", ids)
      .order("created_at", { ascending: false, referencedTable: "chat_messages" })
      .order("id", { ascending: false, referencedTable: "chat_messages" })
      .limit(1, { referencedTable: "chat_messages" }).limit(ids.length),
  ]);
  for (const result of [activities, reads, latest]) if (result.error) throw result.error;
  const activityMap = new Map((activities.data ?? []).map(r => [r.id, r]));
  const readMap = new Map((reads.data ?? []).map(r => [r.conversation_id, r.last_read_at as string]));
  const latestMap = new Map((latest.data ?? []).map(r => [r.id, (r.chat_messages as MessageRow[])[0]]));
  const results = [];
  // Exact per-user unread boundaries differ per conversation. Without adding
  // a SQL function, use bounded HEAD counts, at most five concurrently.
  for (let start = 0; start < rows.length; start += 5) {
    results.push(...await Promise.all(rows.slice(start, start + 5).map(async row => {
      let query = db.from("chat_messages").select("id", { count: "exact", head: true })
        .eq("conversation_id", row.id).neq("sender_id", userId);
      const readAt = readMap.get(row.id);
      if (readAt) query = query.gt("created_at", readAt);
      const { count, error } = await query;
      if (error) throw error;
      if (count === null) throw new Error("Missing unread count");
      const message = latestMap.get(row.id);
      const activity = activityMap.get(row.activity_id);
      if (row.type === "activity" && !activity) throw new Error("Missing chat activity");
      return {
        id: row.id, type: row.type, createdAt: row.created_at, updatedAt: row.updated_at,
        lastMessageAt: row.last_message_at, unreadCount: count,
        lastMessage: message ? lastMessage(message) : null,
        otherUser: row.type === "direct" ? profiles.get(otherUserId(row, userId)) ?? null : null,
        activity: activity ? { id: activity.id, title: activity.title, status: activity.status, category: activity.category } : null,
      };
    })));
  }
  return results;
}

// Keep database timestamp strings intact: PostgreSQL has microsecond precision,
// whereas converting a cursor timestamp through JS Date would lose tie-breaks.
type Cursor = { kind: "inbox" | "messages"; scope: string; id: string; createdAt: string; lastMessageAt?: string | null };
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;
function timestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}
export function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeCursor(raw: unknown, kind: Cursor["kind"], scope: string) {
  if (raw === undefined) return null;
  try {
    if (typeof raw !== "string" || raw.length > 512 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const cursor: Cursor = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (cursor.kind !== kind || cursor.scope !== scope || !CHAT_UUID.test(cursor.id) || !timestamp(cursor.createdAt)) throw new Error();
    if (kind === "inbox" && cursor.lastMessageAt !== null && !timestamp(cursor.lastMessageAt)) throw new Error();
    return cursor;
  } catch { throw new ChatError(400, "invalid_cursor"); }
}
export function pageLimit(raw: unknown, fallback: number, maximum: number) {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maximum) {
    throw new ChatError(400, "invalid_limit");
  }
  return Number(raw);
}
export function olderMessages(cursor: Cursor) {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}
export function olderInbox(cursor: Cursor) {
  const tail = olderMessages(cursor);
  return cursor.lastMessageAt === null
    ? tail
    : `last_message_at.lt.${cursor.lastMessageAt},last_message_at.is.null,and(last_message_at.eq.${cursor.lastMessageAt},created_at.lt.${cursor.createdAt}),and(last_message_at.eq.${cursor.lastMessageAt},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}
function micros(value: string) {
  const fraction = (value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0");
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.slice(3));
}
export function compareConversations(a: ConversationRow, b: ConversationRow) {
  if (a.last_message_at === null && b.last_message_at !== null) return 1;
  if (a.last_message_at !== null && b.last_message_at === null) return -1;
  for (const [left, right] of [[a.last_message_at, b.last_message_at], [a.created_at, b.created_at]]) {
    if (left && right) {
      const difference = micros(right) - micros(left);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
    }
  }
  return b.id.localeCompare(a.id);
}
