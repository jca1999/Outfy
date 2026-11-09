import type { ChatConversation } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

import { cn } from "@/utils";
import { ChatAvatar } from "./chat-avatar";
import { useConversationTitle } from "./use-conversation-title";
import { formatInboxTime } from "./chat-utils";

export function ConversationRow({
  conversation,
  selected,
  currentUserId,
}: {
  conversation: ChatConversation;
  selected: boolean;
  currentUserId: string;
}) {
  const { t, i18n } = useTranslation("chats");
  const title = useConversationTitle(conversation);
  const isGroup = conversation.type === "activity";
  const last = conversation.lastMessage;
  const preview = last
    ? last.senderId === currentUserId
      ? t("youPrefix", { body: last.body })
      : last.body
    : "";
  const unread = conversation.unreadCount;
  return (
    <Link
      href={`/chats/${conversation.id}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left transition hover:bg-muted",
        selected && "bg-primary/10 hover:bg-primary/10",
      )}
      aria-current={selected ? "page" : undefined}
      data-testid={`link-chat-${conversation.id}`}
    >
      <ChatAvatar label={title} avatarUrl={conversation.otherUser?.avatarUrl} group={isGroup} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-xs", unread > 0 ? "font-bold" : "font-semibold")} data-testid={`text-chat-title-${conversation.id}`}>
            {title}
          </p>
          {last && (
            <span className="shrink-0 font-mono-ui text-[9px] text-muted-foreground">
              {formatInboxTime(last.createdAt, i18n.language)}
            </span>
          )}
        </div>
        {isGroup && (
          <p className="mt-0.5 font-mono-ui text-[9px] uppercase tracking-[.14em] text-primary">
            {t("planChat")}
          </p>
        )}
        <p
          className={cn("mt-1 truncate text-[11px]", unread > 0 ? "text-foreground" : "text-muted-foreground")}
          data-testid={`text-chat-preview-${conversation.id}`}
        >
          {preview}
        </p>
      </div>
      {unread > 0 && (
        <span
          className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono-ui text-[9px] font-bold text-primary-foreground"
          aria-label={t("unread", { count: unread })}
          data-testid={`badge-chat-unread-${conversation.id}`}
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
