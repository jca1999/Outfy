import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { SendChatMessageResponse } from "@workspace/api-zod";
import { getSupabaseAdmin } from "./supabase";
import { authorizeConversation, CHAT_UUID, ChatError, presentMessages, type MessageRow } from "./chat";

const HEARTBEAT_MS = 20_000;
const MAX_PENDING = 100;

/** Caller must authenticate, validate the UUID and authorize BEFORE entering. */
export function streamChatEvents(request: Request, response: Response, id: string, userId: string) {
  const db = getSupabaseAdmin();
  let closed = false;
  let pending = 0;
  let queue = Promise.resolve();
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const channel = db.channel(`chat:${id}:${randomUUID()}`).on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${id}` },
    (payload) => {
      if (closed) return;
      // Bound work and response buffering for slow clients. Reconnect rehydrates.
      if (++pending > MAX_PENDING) { finish(); return; }
      queue = queue.then(async () => {
        if (closed) return;
        const conversation = await authorizeConversation(id, userId);
        if (closed) return;
        const row = payload.new;
        if (row.conversation_id !== id || !CHAT_UUID.test(row.id) || !CHAT_UUID.test(row.sender_id) ||
          typeof row.body !== "string" || !row.body.trim() || [...row.body].length > 2000 ||
          typeof row.created_at !== "string" || !Number.isFinite(Date.parse(row.created_at))) {
          throw new Error("Invalid realtime message");
        }
        // Explicit allowlist, then the SAME privacy-aware presentation as GET.
        const safeRow: MessageRow = {
          id: row.id, conversation_id: id, sender_id: row.sender_id,
          body: row.body, created_at: row.created_at,
        };
        const message = (await presentMessages([safeRow], userId, conversation))[0];
        SendChatMessageResponse.parse({ message });
        // Profile presentation is asynchronous: do not deliver after a member
        // left while those profile/privacy queries were in flight.
        await authorizeConversation(id, userId);
        if (!closed) write(`event: chat_message\ndata: ${JSON.stringify(message)}\n\n`);
      }).catch((error: unknown) => {
        if (closed) return;
        if (error instanceof ChatError && [403, 404].includes(error.status)) {
          write('event: access_revoked\ndata: {}\n\n');
        } else {
          request.log.warn("Chat event stream interrupted");
        }
        finish();
      }).finally(() => { pending--; });
    },
  );

  function cleanup() {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    response.off("close", cleanup);
    response.off("error", finish);
    request.off("aborted", finish);
    // removeChannel also unsubscribes. No backend retry loop and no leaked
    // rejection if the network is already gone.
    void db.removeChannel(channel).catch(() => {
      request.log.warn("Unable to remove closed chat channel");
    });
  }
  function finish() {
    cleanup();
    if (!response.writableEnded) response.end();
  }
  function write(frame: string) {
    if (closed || response.destroyed || response.writableEnded) { finish(); return; }
    if (!response.write(frame)) finish();
  }

  response.on("close", cleanup);
  response.on("error", finish);
  request.on("aborted", finish);
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  // Native EventSource owns retry timing; each retry reauthenticates.
  write("retry: 3000\n\n");
  if (closed) return;
  heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
  heartbeat.unref();
  try {
    channel.subscribe((status) => {
      if (closed) return;
      if (status === "SUBSCRIBED") write('event: ready\ndata: {}\n\n');
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) finish();
    });
  } catch {
    finish();
  }
}
