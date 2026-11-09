import { ArrowLeft, ChevronRight, Loader2, Lock, MessageCircle } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import type { ChatConversation } from "@workspace/api-client-react";

import { useAuth } from "@/auth/auth-context";
import { ChatAvatar } from "./chat-avatar";
import { ChatComposer } from "./chat-composer";
import { ChatInlineError, ChatPlaceholder, MessagesSkeleton } from "./chat-states";
import { isChatDenied, mergeMessagePages } from "./chat-utils";
import { MessageList } from "./message-list";
import { useChatConversation, useChatMessages, useMarkChatReadOnce } from "./use-chat";
import { useConversationTitle } from "./use-conversation-title";

function BackLink() {
  const { t } = useTranslation("chats");
  return (
    <Link
      href="/chats"
      className="rounded-full p-2 hover:bg-muted lg:hidden"
      aria-label={t("back")}
      data-testid="button-back-chats"
    >
      <ArrowLeft className="h-4 w-4" />
    </Link>
  );
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation("chats");
  const query = useChatConversation(conversationId);

  if (query.isPending) {
    return (
      <div className="flex flex-1 flex-col" data-testid="status-conversation-loading">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <BackLink />
          <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="h-3 w-40 animate-pulse rounded-full bg-muted" />
        </div>
        <MessagesSkeleton />
      </div>
    );
  }

  if (query.isError && (!query.data || isChatDenied(query.error))) {
    const denied = isChatDenied(query.error);
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border p-4 lg:hidden">
          <BackLink />
        </div>
        {denied ? (
          <ChatPlaceholder
            icon={<Lock className="h-6 w-6" />}
            title={t("deniedTitle")}
            body={t("deniedBody")}
            testId="status-conversation-denied"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <ChatInlineError message={t("conversationError")} onRetry={() => void query.refetch()} testId="error-conversation" />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {query.isError && (
        <div className="p-3">
          <ChatInlineError message={t("conversationError")} onRetry={() => void query.refetch()} testId="error-conversation-refresh" />
        </div>
      )}
      <AuthorizedConversation conversation={query.data!.conversation} />
    </>
  );
}

function AuthorizedConversation({ conversation }: { conversation: ChatConversation }) {
  const { t } = useTranslation("chats");
  const { user } = useAuth();
  const title = useConversationTitle(conversation);
  const isGroup = conversation.type === "activity";
  const messagesQuery = useChatMessages(conversation.id, true);
  const messages = useMemo(
    () => mergeMessagePages(messagesQuery.data?.pages ?? []),
    [messagesQuery.data],
  );
  const denied = messagesQuery.isError && isChatDenied(messagesQuery.error);

  useMarkChatReadOnce(
    conversation.id,
    messagesQuery.isSuccess && !messagesQuery.isFetching,
  );

  // Scroll management: stick to bottom on new messages, preserve position when prepending.
  const scrollRef = useRef<HTMLDivElement>(null);
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const lastIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependRef.current) {
      const { height, top } = prependRef.current;
      el.scrollTop = el.scrollHeight - height + top;
      if (!messagesQuery.isFetchingNextPage) prependRef.current = null;
      return;
    }
    const lastId = messages[messages.length - 1]?.id ?? null;
    if (lastId !== lastIdRef.current) {
      lastIdRef.current = lastId;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, messagesQuery.isFetchingNextPage]);

  function loadOlder() {
    const el = scrollRef.current;
    if (el) prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
    void messagesQuery.fetchNextPage();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid={`view-conversation-${conversation.id}`}>
      <header className="flex items-center gap-3 border-b border-border p-4">
        <BackLink />
        <ChatAvatar label={title} avatarUrl={conversation.otherUser?.avatarUrl} group={isGroup} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" data-testid="text-conversation-title">{title}</p>
          {isGroup ? (
            <p className="truncate font-mono-ui text-[9px] uppercase tracking-[.14em] text-primary">{t("planChat")}</p>
          ) : (
            conversation.otherUser?.displayName && (
              <p className="truncate text-[11px] text-muted-foreground">@{conversation.otherUser.username}</p>
            )
          )}
        </div>
        {isGroup && conversation.activity && (
          <Link
            href={`/activities/${conversation.activity.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/35 px-3 py-1.5 text-[11px] font-bold text-primary transition hover:bg-primary/10"
            data-testid="link-conversation-activity"
          >
            <span className="hidden sm:inline">{t("viewPlan")}</span>
            <span className="sm:hidden">{t("viewPlanShort")}</span>
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      {denied ? (
        <ChatPlaceholder icon={<Lock className="h-6 w-6" />} title={t("deniedTitle")} body={t("deniedBody")} testId="status-conversation-denied" />
      ) : (
        <>
          <div
            ref={scrollRef}
            className="max-h-[62dvh] min-h-[280px] flex-1 overflow-y-auto overflow-x-hidden bg-background/50 px-3 py-4 sm:px-6 lg:max-h-none"
            data-testid="scroll-messages"
          >
            {messagesQuery.isPending ? (
              <MessagesSkeleton />
            ) : messagesQuery.isError && !messagesQuery.data ? (
              <div className="flex h-full items-center justify-center">
                <ChatInlineError message={t("messagesError")} onRetry={() => void messagesQuery.refetch()} testId="error-messages" />
              </div>
            ) : messages.length === 0 ? (
              <ChatPlaceholder
                icon={<MessageCircle className="h-6 w-6" />}
                title={t("emptyChatTitle")}
                body={isGroup ? t("emptyChatGroupBody") : t("emptyChatDirectBody")}
                testId="status-chat-empty"
              />
            ) : (
              <>
                {messagesQuery.hasNextPage && (
                  <div className="mb-3 flex justify-center">
                    <button
                      type="button"
                      onClick={loadOlder}
                      disabled={messagesQuery.isFetchingNextPage}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-60"
                      data-testid="button-load-older-messages"
                    >
                      {messagesQuery.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t("loadOlder")}
                    </button>
                  </div>
                )}
                {messagesQuery.isError && (
                  <div className="mb-3">
                    <ChatInlineError
                      message={t("messagesError")}
                      onRetry={messagesQuery.isFetchNextPageError ? loadOlder : () => void messagesQuery.refetch()}
                      testId="error-older-messages"
                    />
                  </div>
                )}
                <MessageList messages={messages} currentUserId={user?.id ?? ""} isGroup={isGroup} />
              </>
            )}
          </div>
          {messagesQuery.data && <ChatComposer key={conversation.id} conversationId={conversation.id} />}
        </>
      )}
    </div>
  );
}
