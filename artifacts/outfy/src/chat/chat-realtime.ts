import type { ChatMessage } from "@workspace/api-client-react";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

/** Ignore malformed, cross-conversation and unexpected payloads. Never trust SSE JSON. */
export function parseChatEvent(data: string, conversationId: string): ChatMessage | null {
  try {
    const value = JSON.parse(data);
    if (!value || value.conversationId !== conversationId || !isId(value.id) || !isId(value.senderId) ||
      typeof value.body !== "string" || !value.body.trim() || [...value.body].length > 2000 ||
      typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;
    const profile = value.sender;
    if (profile !== null && (!profile || profile.id !== value.senderId || typeof profile.username !== "string" ||
      !(profile.displayName === null || typeof profile.displayName === "string") ||
      !(profile.avatarUrl === null || typeof profile.avatarUrl === "string"))) return null;
    return {
      id: value.id, conversationId, senderId: value.senderId, body: value.body, createdAt: value.createdAt,
      sender: profile === null ? null : {
        id: profile.id, username: profile.username, displayName: profile.displayName, avatarUrl: profile.avatarUrl,
      },
    };
  } catch { return null; }
}

/** One native EventSource. No custom reconnect loop, polling or Supabase browser client. */
export function connectChatRealtime(options: {
  conversationId: string;
  userId: string;
  onMessage: (message: ChatMessage) => void;
  onReadLocal: () => void;
  markRead: () => Promise<unknown>;
  onRevoked: () => void;
  checkAccess: () => void;
  rehydrate: () => Promise<unknown>;
}) {
  const { conversationId, userId } = options;
  const source = new EventSource(`/api/chat/conversations/${encodeURIComponent(conversationId)}/events`);
  let stopped = false;
  let readTimer: ReturnType<typeof setTimeout> | undefined;
  let reading = false;
  let needsRead = false;
  let syncing = false;
  let syncAgain = false;
  const duringSync = new Map<string, ChatMessage>();

  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(readTimer);
    duringSync.clear();
    source.removeEventListener("chat_message", receive);
    source.removeEventListener("access_revoked", revoked);
    source.removeEventListener("ready", ready);
    source.removeEventListener("error", error);
    source.close();
  }
  function revoked() {
    if (stopped) return;
    stop();
    options.onRevoked();
  }
  async function saveRead() {
    readTimer = undefined;
    if (stopped || reading || !needsRead) return;
    reading = true;
    needsRead = false;
    try {
      await options.markRead();
      if (!stopped) options.onReadLocal();
    } catch (failure) {
      const status = (failure as { status?: number } | null)?.status;
      if (!stopped && (status === 403 || status === 404 || status === 401)) revoked();
      // Temporary failures do not block chat or cause a retry loop.
    } finally {
      reading = false;
      if (!stopped && needsRead) scheduleRead();
    }
  }
  function scheduleRead() {
    needsRead = true;
    if (!readTimer && !reading) readTimer = setTimeout(() => void saveRead(), 250);
  }
  function receive(event: Event) {
    if (stopped) return;
    const message = parseChatEvent((event as MessageEvent).data, conversationId);
    if (!message) return;
    if (syncing) duringSync.set(message.id, message);
    options.onMessage(message);
    options.onReadLocal();
    if (message.senderId !== userId) scheduleRead();
  }
  async function ready() {
    if (stopped) return;
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    try {
      // Supabase is now subscribed. Recover the connect/reconnect gap through
      // the trusted API; not on a timer and not by exposing DB SELECT.
      await options.rehydrate();
    } catch {
      // Existing query error/retry UI owns API failures.
    } finally {
      if (!stopped) {
        // A refetch started before an INSERT must not overwrite that INSERT.
        for (const message of duringSync.values()) options.onMessage(message);
        options.onReadLocal();
        scheduleRead();
      }
      duringSync.clear();
      syncing = false;
      if (!stopped && syncAgain) { syncAgain = false; void ready(); }
    }
  }
  function error() {
    if (!stopped) options.checkAccess();
    // Native EventSource reconnects. Revalidate access even if a reconnect is
    // rejected before SSE headers (so no access_revoked frame can be sent).
  }
  source.addEventListener("chat_message", receive);
  source.addEventListener("access_revoked", revoked);
  source.addEventListener("ready", ready);
  source.addEventListener("error", error);
  return stop;
}
