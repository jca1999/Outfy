import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  ChatConversationResult,
  ChatInboxPage,
  ChatMessage,
  ChatMessagePage,
} from "@workspace/api-client-react";

import { useAuth } from "@/auth/auth-context";
import { chatApi } from "./chat-api";
import {
  appendSentMessage,
  CHAT_KEY_ROOT,
  chatKeys,
  isChatDenied,
  patchInboxConversation,
} from "./chat-utils";

function retryUnlessDenied(count: number, error: unknown) {
  if (isChatDenied(error)) return false;
  return count < 2;
}

export function useChatInbox() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  return useInfiniteQuery({
    queryKey: chatKeys.inbox(userId),
    enabled: Boolean(userId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => chatApi.listConversations(pageParam, signal),
    getNextPageParam: (last: ChatInboxPage) => last.nextCursor ?? undefined,
    retry: retryUnlessDenied,
  });
}

export function useChatConversation(id: string) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: chatKeys.conversation(userId, id),
    enabled: Boolean(userId && id),
    queryFn: ({ signal }) => chatApi.getConversation(id, signal),
    retry: retryUnlessDenied,
  });
}

export function useChatMessages(id: string, enabled: boolean) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  return useInfiniteQuery({
    queryKey: chatKeys.messages(userId, id),
    enabled: Boolean(userId && id && enabled),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => chatApi.listMessages(id, pageParam, signal),
    getNextPageParam: (last: ChatMessagePage) => last.nextCursor ?? undefined,
    retry: retryUnlessDenied,
  });
}

/** Write a successfully sent message into caches and refresh the inbox. */
export function useChatCacheWriters() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  return {
    onSent(conversationId: string, message: ChatMessage) {
      if (!userId) return;
      queryClient.setQueryData<InfiniteData<ChatMessagePage, string | null>>(
        chatKeys.messages(userId, conversationId),
        (old) => appendSentMessage(old, message),
      );
      const lastMessage = {
        id: message.id,
        body: message.body,
        senderId: message.senderId,
        createdAt: message.createdAt,
      };
      queryClient.setQueryData<ChatConversationResult>(
        chatKeys.conversation(userId, conversationId),
        (old) =>
          old
            ? { conversation: { ...old.conversation, lastMessage, lastMessageAt: message.createdAt } }
            : old,
      );
      void queryClient.invalidateQueries({ queryKey: chatKeys.inbox(userId), exact: true });
    },
    onRead(conversationId: string) {
      if (!userId) return;
      queryClient.setQueryData<InfiniteData<ChatInboxPage, string | null>>(
        chatKeys.inbox(userId),
        (old) => patchInboxConversation(old, conversationId, (c) => ({ ...c, unreadCount: 0 })),
      );
      queryClient.setQueryData<ChatConversationResult>(
        chatKeys.conversation(userId, conversationId),
        (old) => (old ? { conversation: { ...old.conversation, unreadCount: 0 } } : old),
      );
      void queryClient.invalidateQueries({
        queryKey: chatKeys.inbox(userId),
        exact: true,
        refetchType: "none",
      });
    },
  };
}

/**
 * Fire-and-forget mark-read once per mounted conversation, only after the
 * authorized detail and its initial messages are loaded.
 */
export function useMarkChatReadOnce(conversationId: string, ready: boolean) {
  const doneRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const writers = useChatCacheWriters();
  const onReadRef = useRef(writers.onRead);
  onReadRef.current = writers.onRead;
  useEffect(() => {
    if (!ready || doneRef.current === conversationId) return;
    doneRef.current = conversationId;
    chatApi
      .markRead(conversationId)
      .then(() => {
        if (mountedRef.current && conversationRef.current === conversationId) onReadRef.current(conversationId);
      })
      .catch(() => {
        // Non-blocking: unread will be corrected next time.
      });
  }, [conversationId, ready]);
}

/** Removes the previous user's chat cache whenever the authenticated identity changes. */
export function useChatIdentityGuard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const previous = useRef<string | null>(user?.id ?? null);
  useEffect(() => {
    const current = user?.id ?? null;
    const prev = previous.current;
    previous.current = current;
    if (prev && prev !== current) {
      const queryKey = [CHAT_KEY_ROOT, prev];
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }
  }, [user?.id, queryClient]);
}

export function ChatIdentityGuard() {
  useChatIdentityGuard();
  return null;
}
