import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRoute } from "wouter";

import { ChatInbox } from "@/chat/chat-inbox";
import { ChatPlaceholder } from "@/chat/chat-states";
import { ConversationView } from "@/chat/conversation-view";
import { cn } from "@/utils";

export function Chats() {
  const { t } = useTranslation("chats");
  const [, params] = useRoute("/chats/:conversationId");
  const selectedId = params?.conversationId ?? null;

  return (
    <div className="space-y-7">
      <div className={cn(selectedId && "hidden lg:block")}>
        <p className="font-mono-ui text-[10px] uppercase tracking-[.18em] text-primary">{t("eyebrow")}</p>
        <h1 className="mt-2 text-4xl font-bold tracking-[-.06em]">{t("title")}</h1>
      </div>

      <div className="grid overflow-hidden rounded-[24px] border border-border bg-card soft-shadow lg:h-[min(720px,calc(100dvh-220px))] lg:min-h-[530px] lg:grid-cols-[320px_1fr]">
        <div className={cn("flex min-h-[420px] min-w-0 flex-col border-border lg:min-h-0 lg:border-r", selectedId && "hidden lg:flex")}>
          <ChatInbox selectedId={selectedId} />
        </div>
        <div className={cn("min-w-0 flex-col lg:min-h-0", selectedId ? "flex" : "hidden lg:flex")}>
          {selectedId ? (
            <ConversationView key={selectedId} conversationId={selectedId} />
          ) : (
            <ChatPlaceholder
              icon={<MessageCircle className="h-6 w-6" />}
              title={t("selectTitle")}
              body={t("selectBody")}
              testId="status-no-conversation-selected"
            />
          )}
        </div>
      </div>
    </div>
  );
}
