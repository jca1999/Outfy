import { Loader2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import { chatApi } from "./chat-api";
import { getChatErrorStatus } from "./chat-utils";

export function PlanChatButton({ activityId }: { activityId: string }) {
  const { t } = useTranslation("chats");
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"denied" | "generic" | null>(null);
  const lockRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function open() {
    if (lockRef.current) return;
    lockRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await chatApi.getActivity(activityId);
      if (!mountedRef.current) return;
      navigate(`/chats/${result.conversation.id}`);
    } catch (e) {
      if (!mountedRef.current) return;
      const status = getChatErrorStatus(e);
      setError(status === 403 || status === 404 ? "denied" : "generic");
      lockRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={() => void open()}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 px-5 py-3 text-sm font-bold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="button-plan-chat"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
        {pending ? t("opening") : t("planChat")}
      </button>
      {error && (
        <p className="text-xs font-semibold text-destructive" role="alert" data-testid="error-open-plan-chat">
          {error === "denied" ? t("planChatDenied") : t("planChatError")}
        </p>
      )}
    </div>
  );
}
