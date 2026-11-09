/* Test-only extension: inject AFTER chat-browser-fixture.js, before app startup.
 * Models browser event delivery without any real authentication or DB writes.
 * Native SSE framing/auth/privacy/cleanup are covered by the backend tests.
 */
(() => {
  const fixture = window.__chatFixture;
  if (!fixture) throw new Error("Inject the chat API fixture first");
  const sources = [];
  class FixtureEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.closed = false;
      sources.push(this);
      setTimeout(() => { if (!this.closed) this.emit("ready", {}); }, 0);
    }
    close() { this.closed = true; }
    emit(name, value) {
      if (!this.closed) this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(value) }));
    }
  }
  window.EventSource = FixtureEventSource;
  function publish(message) {
    const rows = fixture.state.messages[message.conversationId] ??= [];
    if (!rows.some(row => row.id === message.id)) rows.push(message);
    const conversation = fixture.state.conversations.find(c => c.id === message.conversationId);
    if (conversation) {
      conversation.lastMessage = {
        id: message.id, senderId: message.senderId, body: message.body, createdAt: message.createdAt,
      };
      conversation.lastMessageAt = message.createdAt;
    }
    fixture.save();
    for (const source of sources) if (source.url.endsWith(`/${message.conversationId}/events`)) source.emit("chat_message", message);
  }
  window.__chatRealtimeFixture = {
    sources, publish,
    incoming(conversationId, body = "Hola realtime") {
      const message = {
        id: crypto.randomUUID(), conversationId, senderId: fixture.ids.B, body,
        createdAt: new Date().toISOString(),
        sender: { id: fixture.ids.B, username: "lucia", displayName: "Lucía", avatarUrl: null },
      };
      publish(message); return message;
    },
    revoke(conversationId) {
      fixture.state.denied.push(conversationId); fixture.save();
      for (const source of sources) if (source.url.endsWith(`/${conversationId}/events`)) source.emit("access_revoked", {});
    },
  };
  const fetch = window.fetch;
  window.fetch = async (input, options = {}) => {
    const result = await fetch(input, options);
    const path = new URL(typeof input === "string" ? input : input.url, location.origin).pathname;
    if (options.method === "POST" && /\/chat\/conversations\/[^/]+\/messages$/.test(path) && result.ok) {
      const { message } = await result.clone().json();
      publish(message); // Echo races the REST response deliberately.
    }
    return result;
  };
})();
