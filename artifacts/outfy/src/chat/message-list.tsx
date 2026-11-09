import type { ChatMessage } from "@workspace/api-client-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/utils";
import { ChatAvatar } from "./chat-avatar";
import { chatProfileName, dayKey, formatDayLabel, formatMessageTime } from "./chat-utils";

export function MessageList({
  messages,
  currentUserId,
  isGroup,
}: {
  messages: ChatMessage[];
  currentUserId: string;
  isGroup: boolean;
}) {
  const { t, i18n } = useTranslation("chats");
  return (
    <ol className="flex flex-col gap-1.5" data-testid="list-messages">
      {messages.map((m, index) => {
        const prev = messages[index - 1];
        const own = m.senderId === currentUserId;
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
        const firstOfRun = newDay || prev.senderId !== m.senderId;
        const senderName = chatProfileName(m.sender) ?? t("unknownUser");
        const showSender = isGroup && !own && firstOfRun;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <li className="my-3 flex justify-center" aria-hidden>
                <span className="rounded-full bg-muted px-3 py-1 text-[10px] text-muted-foreground first-letter:uppercase">
                  {formatDayLabel(m.createdAt, i18n.language)}
                </span>
              </li>
            )}
            <li
              className={cn("flex items-end gap-2", own ? "justify-end" : "justify-start", firstOfRun && !newDay && "mt-2")}
              data-testid={`message-${m.id}`}
              data-own={own ? "true" : "false"}
            >
              {isGroup && !own && (
                <div className="w-8 shrink-0">
                  {showSender && (
                    <ChatAvatar label={senderName} avatarUrl={m.sender?.avatarUrl} className="h-8 w-8 rounded-lg" />
                  )}
                </div>
              )}
              {own && (
                <span className="shrink-0 font-mono-ui text-[9px] text-muted-foreground">
                  {formatMessageTime(m.createdAt, i18n.language)}
                </span>
              )}
              <div
                className={cn(
                  "min-w-0 max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  own
                    ? "rounded-br-sm bg-primary text-primary-foreground"
                    : "rounded-bl-sm border border-border/60 bg-muted text-foreground",
                )}
              >
                {showSender && (
                  <p className="mb-0.5 truncate text-[11px] font-bold text-primary" data-testid={`text-message-sender-${m.id}`}>
                    {senderName}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" data-testid={`text-message-body-${m.id}`}>
                  {m.body}
                </p>
              </div>
              {!own && (
                <span className="shrink-0 font-mono-ui text-[9px] text-muted-foreground">
                  {formatMessageTime(m.createdAt, i18n.language)}
                </span>
              )}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
