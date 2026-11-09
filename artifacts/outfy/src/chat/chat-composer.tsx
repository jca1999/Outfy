import { Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/utils";
import { chatApi } from "./chat-api";
import { CHAT_MESSAGE_MAX, chatBodyLength, normalizeChatBody } from "./chat-utils";
import { useChatCacheWriters } from "./use-chat";

/** Mounted once per conversation (keyed by id), so the draft never leaks between chats. */
export function ChatComposer({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation("chats");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const lockRef = useRef(false);
  const mountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const writers = useChatCacheWriters();
  const onSentRef = useRef(writers.onSent);
  onSentRef.current = writers.onSent;

  const length = chatBodyLength(draft.trim());
  const tooLong = length > CHAT_MESSAGE_MAX;
  const canSend = !pending && normalizeChatBody(draft) !== null;

  async function submit() {
    if (lockRef.current) return;
    const submitted = draft;
    const body = normalizeChatBody(submitted);
    if (!body) return;
    lockRef.current = true;
    setPending(true);
    setError(false);
    try {
      const result = await chatApi.send(conversationId, body);
      if (!mountedRef.current) return;
      onSentRef.current(conversationId, result.message);
      // Clear only the successfully sent text; keep anything typed meanwhile.
      setDraft((current) => (current === submitted ? "" : current));
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      lockRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="z-10 shrink-0 border-t border-border bg-card p-3"
      data-testid="form-chat-composer"
    >
      {error && (
        <p className="mb-2 px-1 text-[11px] font-semibold text-destructive" role="alert" data-testid="error-send-message">
          {t("sendError")}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(false);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={t("messagePlaceholder")}
          aria-label={t("messagePlaceholder")}
          className="max-h-36 min-h-[42px] min-w-0 flex-1 resize-none rounded-xl border border-transparent bg-background px-3 py-2.5 text-sm leading-relaxed outline-none [field-sizing:content] focus:border-primary/40 focus:ring-2 focus:ring-primary/20"
          data-testid="input-chat-message"
        />
        <button
          type="submit"
          className="outfy-primary-action flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSend}
          aria-label={t("sendMessage")}
          data-testid="button-send-message"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
      {length > CHAT_MESSAGE_MAX - 200 && (
        <p
          className={cn("mt-1.5 px-1 text-right font-mono-ui text-[9px]", tooLong ? "text-destructive" : "text-muted-foreground")}
          data-testid="text-message-length"
        >
          {t("charCount", { count: length, max: CHAT_MESSAGE_MAX })}
        </p>
      )}
    </form>
  );
}
