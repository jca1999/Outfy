import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ChatMessagePage } from "@workspace/api-client-react";
import { useAuth } from "@/auth/auth-context";
import { appendSentMessage, chatKeys } from "./chat-utils";
import { chatApi } from "./chat-api";
import { connectChatRealtime } from "./chat-realtime";
import { useChatCacheWriters } from "./use-chat";

/** Mounted only inside the authorized, currently selected conversation. */
export function useChatRealtime(conversationId: string, ready: boolean) {
  const { user } = useAuth();
  const userId = user?.id;
  const client = useQueryClient();
  const writers = useChatCacheWriters();
  const writersRef = useRef(writers);
  writersRef.current = writers;
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    if (!userId || !ready || revoked || typeof EventSource === "undefined") return;
    const detailKey = chatKeys.conversation(userId, conversationId);
    const messageKey = chatKeys.messages(userId, conversationId);
    // Infinite-query refetches commit all pages together. Preserve INSERTs that
    // arrived during a focus refetch or history fetch, not only during ready.
    const pending = new Map<string, ChatMessage>();
    const unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type !== "updated" || event.action.type !== "success" || event.action.manual ||
        event.query.queryKey.toString() !== messageKey.toString() || !pending.size) return;
      const received = [...pending.values()];
      pending.clear();
      client.setQueryData<InfiniteData<ChatMessagePage, string | null>>(messageKey,
        old => received.reduce((data, message) => appendSentMessage(data, message), old));
    });
    const stop = connectChatRealtime({
      userId, conversationId,
      onMessage: message => {
        if (client.getQueryState(messageKey)?.fetchStatus === "fetching") {
          pending.set(message.id, message);
          // Bounded protection, not an alternative message history store.
          if (pending.size > 100) pending.delete(pending.keys().next().value!);
        }
        writersRef.current.onSent(conversationId, message);
      },
      onReadLocal: () => writersRef.current.onRead(conversationId),
      markRead: () => chatApi.markRead(conversationId),
      onRevoked: () => {
        setRevoked(true); // Hide/disable composer immediately, even if refetch fails.
        void client.cancelQueries({ queryKey: messageKey, exact: true }).then(() => {
          client.removeQueries({ queryKey: messageKey, exact: true });
        });
        void client.invalidateQueries({ queryKey: detailKey, exact: true });
        void client.invalidateQueries({ queryKey: chatKeys.inbox(userId), exact: true });
      },
      checkAccess: () => { void client.invalidateQueries({ queryKey: detailKey, exact: true }); },
      rehydrate: async () => {
        await Promise.all([
          client.invalidateQueries({ queryKey: detailKey, exact: true }),
          client.invalidateQueries({ queryKey: messageKey, exact: true }),
          client.invalidateQueries({ queryKey: chatKeys.inbox(userId), exact: true }),
        ]);
      },
    });
    return () => { stop(); unsubscribe(); pending.clear(); };
  }, [userId, conversationId, ready, revoked, client]);
  return revoked;
}
