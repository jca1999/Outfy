import {
  getActivityChat,
  getChatConversation,
  listChatConversations,
  listChatMessages,
  markChatRead,
  openDirectChat,
  sendChatMessage,
} from "@workspace/api-client-react";

import { CHAT_INBOX_PAGE_SIZE, CHAT_MESSAGE_PAGE_SIZE, CHAT_REQUEST_TIMEOUT_MS } from "./chat-utils";

/** Request options with cookie credentials and a hard timeout combined with an optional caller signal. */
function requestOptions(signal?: AbortSignal): RequestInit & { cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    credentials: "include",
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function withRequest<T>(signal: AbortSignal | undefined, run: (init: RequestInit) => Promise<T>) {
  const { cleanup, ...init } = requestOptions(signal);
  try {
    return await run(init);
  } finally {
    cleanup();
  }
}

type ChatUnreadCount = {
  count: number;
};

async function getUnreadCount(signal?: AbortSignal): Promise<ChatUnreadCount> {
  return withRequest(signal, async (init) => {
    const response = await fetch("/api/chat/unread-count", init);

    let data: unknown = null;

    try {
      data = await response.json();
    } catch {
      // Invalid responses are handled below.
    }

    if (!response.ok) {
      const error = new Error("chat_unread_count_unavailable") as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }

    if (
      !data ||
      typeof data !== "object" ||
      !("count" in data) ||
      typeof (data as { count?: unknown }).count !== "number" ||
      !Number.isSafeInteger((data as { count: number }).count) ||
      (data as { count: number }).count < 0
    ) {
      throw new Error("invalid_chat_unread_count");
    }

    return data as ChatUnreadCount;
  });
}

export const chatApi = {
  getUnreadCount,
  listConversations: (cursor: string | null, signal?: AbortSignal) =>
    withRequest(signal, (init) =>
      listChatConversations(
        { limit: CHAT_INBOX_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
        init,
      ),
    ),
  getConversation: (id: string, signal?: AbortSignal) =>
    withRequest(signal, (init) => getChatConversation(id, init)),
  openDirect: (userId: string) =>
    withRequest(undefined, (init) => openDirectChat({ userId }, init)),
  getActivity: (activityId: string) =>
    withRequest(undefined, (init) => getActivityChat(activityId, init)),
  listMessages: (id: string, cursor: string | null, signal?: AbortSignal) =>
    withRequest(signal, (init) =>
      listChatMessages(id, { limit: CHAT_MESSAGE_PAGE_SIZE, ...(cursor ? { cursor } : {}) }, init),
    ),
  send: (id: string, body: string) =>
    withRequest(undefined, (init) => sendChatMessage(id, { body }, init)),
  markRead: (id: string) => withRequest(undefined, (init) => markChatRead(id, init)),
};
