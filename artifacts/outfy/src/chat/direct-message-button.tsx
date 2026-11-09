import { Loader2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";

import { chatApi } from "./chat-api";

export function DirectMessageButton({ userId }: { userId: string }) {
  const { t } = useTranslation("chats");
  const [, navigate] = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
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
    setError(false);
    try {
      const result = await chatApi.openDirect(userId);
      if (!mountedRef.current) return;
      navigate(`/chats/${result.conversation.id}`);
    } catch {
      if (!mountedRef.current) return;
      setError(true);
      lockRef.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void open()}
        disabled={pending}
        className="outfy-primary-action inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="button-message-friend"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
        {pending ? t("opening") : t("message")}
      </button>
      {error && (
        <p className="basis-full text-center text-xs font-semibold text-destructive" role="alert" data-testid="error-open-direct-chat">
          {t("openDirectError")}
        </p>
      )}
    </>
  );
}
