import { Loader2, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/auth/auth-context";
import { ChatInlineError, ChatPlaceholder, InboxSkeleton } from "./chat-states";
import { visibleInboxConversations } from "./chat-utils";
import { ConversationRow } from "./conversation-row";
import { useChatInbox } from "./use-chat";

export function ChatInbox({ selectedId }: { selectedId: string | null }) {
  const { t } = useTranslation("chats");
  const { user } = useAuth();
  const inbox = useChatInbox();
  const conversations = useMemo(
    () => visibleInboxConversations(inbox.data?.pages ?? []),
    [inbox.data],
  );

  const loadMore = inbox.hasNextPage && (
    <div className="text-center">
      <button
        type="button"
        onClick={() => void inbox.fetchNextPage()}
        disabled={inbox.isFetchingNextPage}
        className="mx-auto mt-2 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[11px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-60"
        data-testid="button-inbox-load-more"
      >
        {inbox.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
        {t("loadMoreConversations")}
      </button>
      {inbox.isFetchNextPageError && (
        <div className="mt-2">
          <ChatInlineError message={t("inboxError")} onRetry={() => void inbox.fetchNextPage()} testId="error-inbox-more" />
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="text-sm font-bold">{t("yourConversations")}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-testid="list-conversations">
        {inbox.isPending ? (
          <InboxSkeleton />
        ) : inbox.isError && !inbox.data ? (
          <div className="p-4">
            <ChatInlineError message={t("inboxError")} onRetry={() => void inbox.refetch()} testId="error-inbox" />
          </div>
        ) : conversations.length === 0 ? (
          <ChatPlaceholder
            icon={<MessageCircle className="h-6 w-6" />}
            title={t("emptyInboxTitle")}
            body={t("emptyInboxBody")}
            testId="status-inbox-empty"
          >
            {loadMore}
          </ChatPlaceholder>
        ) : (
          <div className="flex flex-col p-2">
            {conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                selected={c.id === selectedId}
                currentUserId={user?.id ?? ""}
              />
            ))}
            {loadMore}
          </div>
        )}
      </div>
    </div>
  );
}
