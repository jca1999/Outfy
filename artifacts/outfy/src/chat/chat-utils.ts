import type { InfiniteData } from "@tanstack/react-query";
import type {
  ChatConversation,
  ChatInboxPage,
  ChatMessage,
  ChatMessagePage,
  ChatProfile,
} from "@workspace/api-client-react";

export const CHAT_MESSAGE_MAX = 2000;
export const CHAT_MESSAGE_PAGE_SIZE = 50;
export const CHAT_INBOX_PAGE_SIZE = 30;
export const CHAT_REQUEST_TIMEOUT_MS = 15_000;

/** Query keys are always scoped by the authenticated user id. */
export const chatKeys = {
  all: (userId: string) => ["outfy-chat", userId] as const,
  inbox: (userId: string) => ["outfy-chat", userId, "inbox"] as const,
  conversation: (userId: string, id: string) =>
    ["outfy-chat", userId, "conversation", id] as const,
  messages: (userId: string, id: string) =>
    ["outfy-chat", userId, "messages", id] as const,
  unread: (userId: string) =>
    ["outfy-chat", userId, "unread-count"] as const,
};

export const CHAT_KEY_ROOT = "outfy-chat";

/** Unicode code point length, consistent with server validation. */
export function chatBodyLength(body: string) {
  return Array.from(body).length;
}

export function normalizeChatBody(raw: string): string | null {
  const body = raw.trim();
  if (!body) return null;
  if (chatBodyLength(body) > CHAT_MESSAGE_MAX) return null;
  return body;
}

export function getChatErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

export function isChatDenied(error: unknown) {
  const status = getChatErrorStatus(error);
  return status === 403 || status === 404 || status === 400;
}

export function compareMessages(a: Pick<ChatMessage, "id" | "createdAt">, b: Pick<ChatMessage, "id" | "createdAt">) {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (ta !== tb) return ta - tb;
  // PostgreSQL timestamps can differ within one JS millisecond.
  const fraction = (value: string) => Number((value.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6));
  const microseconds = fraction(a.createdAt) - fraction(b.createdAt);
  if (microseconds) return microseconds;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Pages are [latest, older, older...], each oldest->newest. Returns chronological unique list. */
export function mergeMessagePages(pages: ChatMessagePage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const page of pages) for (const m of page.messages) byId.set(m.id, m);
  return Array.from(byId.values()).sort(compareMessages);
}

/** Append a sent message into the latest page without duplicates. */
export function appendSentMessage(
  data: InfiniteData<ChatMessagePage, string | null> | undefined,
  message: ChatMessage,
): InfiniteData<ChatMessagePage, string | null> | undefined {
  if (!data || data.pages.length === 0) {
    return {
      pages: [{ messages: [message], nextCursor: null }],
      pageParams: [null],
    };
  }
  const exists = data.pages.some((p) => p.messages.some((m) => m.id === message.id));
  if (exists) return data;
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [{ ...first, messages: [...first.messages, message] }, ...rest],
  };
}

export function patchInboxConversation(
  data: InfiniteData<ChatInboxPage, string | null> | undefined,
  id: string,
  patch: (c: ChatConversation) => ChatConversation,
) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      conversations: p.conversations.map((c) => (c.id === id ? patch(c) : c)),
    })),
  };
}

/** Inbox UI hides conversations without any message; pagination is untouched. */
export function visibleInboxConversations(pages: ChatInboxPage[]): ChatConversation[] {
  const seen = new Set<string>();
  const out: ChatConversation[] = [];
  for (const p of pages)
    for (const c of p.conversations) {
      if (seen.has(c.id) || c.lastMessage === null) continue;
      seen.add(c.id);
      out.push(c);
    }
  return out;
}

export function chatProfileName(p: ChatProfile | null | undefined): string | null {
  if (!p) return null;
  return p.displayName?.trim() || `@${p.username}`;
}

export function chatInitials(label: string) {
  return (
    label
      .replace(/^@/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => Array.from(w)[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

export function chatLocale(language: string) {
  return language.startsWith("en") ? "en-GB" : "es-ES";
}

export function formatInboxTime(iso: string, language: string, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const locale = chatLocale(language);
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function formatMessageTime(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(chatLocale(language), { timeStyle: "short" }).format(date);
}

export function formatDayLabel(iso: string, language: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(chatLocale(language), { dateStyle: "full" }).format(date);
}

export function dayKey(iso: string) {
  return new Date(iso).toDateString();
}
