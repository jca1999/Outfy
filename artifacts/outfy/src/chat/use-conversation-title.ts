import type { ChatConversation } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

import { chatProfileName } from "./chat-utils";

export function useConversationTitle(conversation: ChatConversation) {
  const { t } = useTranslation("chats");
  if (conversation.type === "activity") {
    return conversation.activity?.title?.trim() || t("unknownPlan");
  }
  return chatProfileName(conversation.otherUser) ?? t("unknownUser");
}
