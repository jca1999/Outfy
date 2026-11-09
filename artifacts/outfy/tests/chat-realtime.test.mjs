// Production controller, hook, cache writers + real TanStack QueryClient.
// Fake EventSource/auth/clock only; no credentials, network, or browser DB access.
import assert from "node:assert/strict";
import { test } from "node:test";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../../api-server/package.json", import.meta.url));
const { build } = require("esbuild");
const frontendRequire = createRequire(new URL("../package.json", import.meta.url));
const { QueryClient } = frontendRequire("@tanstack/react-query");
const built = await build({
  stdin: {
    contents: 'export * from "./src/chat/chat-realtime"; export * from "./src/chat/chat-utils"; export {useChatRealtime} from "./src/chat/use-chat-realtime"; export {useChatCacheWriters} from "./src/chat/use-chat";',
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{
    name: "isolate-realtime-hook-boundaries",
    setup(b) {
      b.onResolve({ filter: /^react$/ }, args =>
        /\/chat\/(use-chat|use-chat-realtime)\.ts$/.test(args.importer) ? { path: "hooks", namespace: "hooks" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({
        contents: ["useEffect", "useState", "useRef"].map(name =>
          `export const ${name}=(...args)=>globalThis.__realtimeHarness.${name}(...args);`).join("\n"),
      }));
      b.onResolve({ filter: /^@tanstack\/react-query$/ }, args =>
        /\/chat\/(use-chat|use-chat-realtime)\.ts$/.test(args.importer) ? { path: "query", namespace: "query" } : undefined);
      b.onLoad({ filter: /.*/, namespace: "query" }, () => ({
        contents: "export const useQueryClient=()=>globalThis.__realtimeHarness.client; export const useQuery=()=>{}; export const useInfiniteQuery=()=>{};",
      }));
      b.onLoad({ filter: /\/auth\/auth-context\.tsx$/ }, () => ({
        contents: "export const useAuth=()=>({user:globalThis.__realtimeHarness.user});", loader: "js",
      }));
      b.onLoad({ filter: /\/chat\/chat-api\.ts$/ }, () => ({
        contents: "export const chatApi={markRead:(...args)=>globalThis.__realtimeHarness.markRead(...args)};",
      }));
    },
  }],
});
const mod = new Module(`${root}tests/realtime-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(built.outputFiles[0].text, `${root}tests/realtime-isolated.cjs`);
const { connectChatRealtime, parseChatEvent, appendSentMessage, useChatRealtime, useChatCacheWriters, chatKeys } = mod.exports;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const D = "11111111-1111-4111-8111-111111111111";
const G = "22222222-2222-4222-8222-222222222222";
const M = "99999999-9999-4999-8999-999999999999";
const message = (extra = {}) => ({
  id: M, conversationId: D, senderId: B, body: "Hola", createdAt: "2026-11-09T12:00:00.000001Z", sender: null, ...extra,
});
const tick = () => new Promise(resolve => setImmediate(resolve));
class FakeEventSource extends EventTarget {
  static instances = [];
  closed = 0;
  constructor(url) { super(); this.url = url; FakeEventSource.instances.push(this); }
  close() { this.closed++; }
  emit(name, data = {}) { this.dispatchEvent(new MessageEvent(name, { data: typeof data === "string" ? data : JSON.stringify(data) })); }
}
function fixture() {
  const originalSource = globalThis.EventSource;
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Set();
  FakeEventSource.instances = [];
  globalThis.EventSource = FakeEventSource;
  globalThis.setTimeout = (callback, ms) => { const timer = { callback, ms }; timers.add(timer); return timer; };
  globalThis.clearTimeout = timer => timers.delete(timer);
  const state = { messages: [], reads: 0, locals: 0, revoked: 0, checks: 0, recoveries: 0 };
  const options = {
    conversationId: D, userId: A,
    onMessage: m => state.messages.push(m),
    onReadLocal: () => { state.locals++; },
    markRead: async () => { state.reads++; },
    onRevoked: () => { state.revoked++; },
    checkAccess: () => { state.checks++; },
    rehydrate: async () => { state.recoveries++; },
  };
  return {
    state, options, timers,
    fire() { for (const timer of [...timers]) { timers.delete(timer); timer.callback(); } },
    restore() {
      globalThis.EventSource = originalSource;
      globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear;
      delete globalThis.__realtimeHarness;
    },
  };
}

test("SSE parser rejects invalid/cross-chat payloads and allowlists safe fields", () => {
  for (const invalid of ["invalid-json", "null", JSON.stringify(message({ conversationId: G })),
    JSON.stringify(message({ id: "bad" })), JSON.stringify(message({ body: " " })),
    JSON.stringify(message({ sender: { id: A, username: "wrong" } }))]) {
    assert.equal(parseChatEvent(invalid, D), null);
  }
  const safe = parseChatEvent(JSON.stringify(message({ sender: {
    id: B, username: "lucia", displayName: null, avatarUrl: null, email: "never@example.invalid",
  }, secret: "NEVER" })), D);
  assert.equal(safe.sender.username, "lucia");
  assert.equal(safe.sender.email, undefined);
  assert.equal(safe.secret, undefined);
});

test("incoming messages immediately use shared caches, including own-echo deduplication and older-event ordering", async () => {
  const f = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  globalThis.__realtimeHarness = { user: { id: A }, client };
  client.setQueryData(chatKeys.messages(A, D), { pages: [{ messages: [], nextCursor: "older" }], pageParams: [null] });
  client.setQueryData(chatKeys.conversation(A, D), { conversation: { id: D, lastMessage: null, unreadCount: 2 } });
  client.setQueryData(chatKeys.inbox(A), { pages: [{ conversations: [{ id: D, lastMessage: null, unreadCount: 2 }], nextCursor: null }], pageParams: [null] });
  const writers = useChatCacheWriters();
  const own = message({ senderId: A });
  writers.onSent(D, own); // REST response wins or loses the race: same ID.
  const stop = connectChatRealtime({
    ...f.options, onMessage: m => writers.onSent(D, m), onReadLocal: () => writers.onRead(D),
  });
  try {
    const source = FakeEventSource.instances[0];
    source.emit("chat_message", own);
    assert.equal(client.getQueryData(chatKeys.messages(A, D)).pages[0].messages.length, 1);
    assert.equal(f.timers.size, 0); // own echo doesn't write read
    const incoming = message({ id: G, createdAt: "2026-11-09T12:01:00Z" });
    source.emit("chat_message", incoming);
    source.emit("chat_message", incoming);
    assert.equal(client.getQueryData(chatKeys.messages(A, D)).pages[0].messages.length, 2);
    assert.equal(client.getQueryData(chatKeys.messages(A, D)).pages[0].nextCursor, "older");
    assert.equal(client.getQueryData(chatKeys.conversation(A, D)).conversation.lastMessage.id, G);
    assert.equal(client.getQueryData(chatKeys.inbox(A)).pages[0].conversations[0].lastMessage.id, G);
    assert.equal(client.getQueryData(chatKeys.inbox(A)).pages[0].conversations[0].unreadCount, 0);
    source.emit("chat_message", message({ id: D, createdAt: "2026-11-09T11:59:00Z" }));
    assert.equal(client.getQueryData(chatKeys.conversation(A, D)).conversation.lastMessage.id, G);
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers][0].ms, 250);
    f.fire(); await tick();
    assert.equal(f.state.reads, 1);
  } finally { stop(); client.clear(); f.restore(); }
});

test("read bursts coalesce, including messages arriving while a read write is in flight", async () => {
  const f = fixture();
  let resolveRead;
  const stop = connectChatRealtime({
    ...f.options, markRead: () => { f.state.reads++; return new Promise(resolve => { resolveRead = resolve; }); },
  });
  try {
    const source = FakeEventSource.instances[0];
    for (let i = 0; i < 5; i++) source.emit("chat_message", message());
    assert.equal(f.timers.size, 1);
    f.fire(); assert.equal(f.state.reads, 1);
    source.emit("chat_message", message());
    assert.equal(f.timers.size, 0);
    resolveRead(); await tick();
    assert.equal(f.timers.size, 1);
    f.fire(); assert.equal(f.state.reads, 2);
    resolveRead(); await tick();
  } finally { stop(); f.restore(); }
});

test("ready rehydrates initial/reconnect gaps and replays messages received during the API fetch", async () => {
  const f = fixture();
  let finish;
  const stop = connectChatRealtime({
    ...f.options, rehydrate: () => { f.state.recoveries++; return new Promise(resolve => { finish = resolve; }); },
  });
  try {
    const source = FakeEventSource.instances[0];
    source.emit("ready");
    source.emit("chat_message", message());
    assert.equal(f.state.messages.length, 1); // immediate, no manual refetch
    finish(); await tick();
    assert.equal(f.state.messages.length, 2); // replay after racing REST result
    source.emit("error");
    assert.equal(f.state.checks, 1);
    assert.equal(source.closed, 0); // native automatic reconnect remains enabled
    assert.equal(FakeEventSource.instances.length, 1); // no custom retry loop
    source.emit("ready"); finish(); await tick();
    assert.equal(f.state.recoveries, 2);
  } finally { stop(); f.restore(); }
});

test("access_revoked closes listeners/read timer immediately; transient disconnect does not", () => {
  const f = fixture();
  const stop = connectChatRealtime(f.options);
  try {
    const source = FakeEventSource.instances[0];
    source.emit("chat_message", message());
    assert.equal(f.timers.size, 1);
    source.emit("error");
    assert.equal(source.closed, 0);
    source.emit("access_revoked");
    assert.equal(source.closed, 1);
    assert.equal(f.state.revoked, 1);
    assert.equal(f.timers.size, 0);
    const count = f.state.messages.length;
    source.emit("chat_message", message());
    source.emit("ready");
    assert.equal(f.state.messages.length, count);
    assert.equal(f.state.recoveries, 0);
    stop(); assert.equal(source.closed, 1);
  } finally { stop(); f.restore(); }
});

function hookHarness(client) {
  const slots = [];
  let cursor = 0;
  const harness = {
    client, user: null, reads: 0,
    markRead: async () => { harness.reads++; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; }];
    },
    useEffect(effect, deps) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((dep, n) => dep !== previous.deps[n])) {
        previous?.cleanup?.();
        slots[i] = { deps, cleanup: effect() };
      }
    },
    render(id, ready) { cursor = 0; return useChatRealtime(id, ready); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
  globalThis.__realtimeHarness = harness;
  return harness;
}

test("hook gates on auth/loaded detail, closes on switch/logout/unmount, and revocation invalidates exact detail", async () => {
  const f = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const invalidations = [];
  const invalidate = client.invalidateQueries.bind(client);
  client.invalidateQueries = (...args) => { invalidations.push(args[0].queryKey); return invalidate(...args); };
  const h = hookHarness(client);
  try {
    h.render(D, true); assert.equal(FakeEventSource.instances.length, 0);
    h.user = { id: A };
    h.render(D, false); assert.equal(FakeEventSource.instances.length, 0);
    h.render(D, true);
    const first = FakeEventSource.instances[0];
    assert.equal(first.url, `/api/chat/conversations/${D}/events`);
    h.render(D, true); assert.equal(FakeEventSource.instances.length, 1);
    h.render(G, true); assert.equal(first.closed, 1);
    const second = FakeEventSource.instances[1];
    second.emit("access_revoked");
    assert.equal(second.closed, 1);
    assert.equal(h.render(G, true), true); // immediate denied UI signal
    assert.ok(invalidations.some(key => JSON.stringify(key) === JSON.stringify(chatKeys.conversation(A, G))));
    assert.equal(FakeEventSource.instances.length, 2);
    h.user = null; h.render(G, false);
    await tick();
  } finally { h.unmount(); client.clear(); f.restore(); }
  const f2 = fixture();
  const c2 = new QueryClient();
  const h2 = hookHarness(c2); h2.user = { id: A };
  try {
    h2.render(D, true); h2.user = null; h2.render(D, false);
    assert.equal(FakeEventSource.instances[0].closed, 1);
    h2.user = { id: B }; h2.render(D, true); h2.unmount();
    assert.equal(FakeEventSource.instances[1].closed, 1);
  } finally { h2.unmount(); c2.clear(); f2.restore(); }
});

test("INSERT is retained when a real TanStack Query history/refetch response commits later", async () => {
  const f = fixture();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const h = hookHarness(client); h.user = { id: A };
  const key = chatKeys.messages(A, D);
  client.setQueryData(key, { pages: [{ messages: [], nextCursor: "older" }], pageParams: [null] });
  let resolveFetch;
  try {
    h.render(D, true);
    const request = client.fetchQuery({ queryKey: key, queryFn: () => new Promise(resolve => { resolveFetch = resolve; }) });
    FakeEventSource.instances[0].emit("chat_message", message());
    assert.equal(client.getQueryData(key).pages[0].messages.length, 1);
    resolveFetch({ pages: [{ messages: [], nextCursor: "older" }, { messages: [], nextCursor: null }], pageParams: [null, "older"] });
    await request; await tick();
    assert.equal(client.getQueryData(key).pages[0].messages[0].id, M);
    assert.equal(client.getQueryData(key).pages.length, 2);
    assert.equal(client.getQueryData(key).pages[0].nextCursor, "older");
    assert.equal(appendSentMessage(client.getQueryData(key), message()), client.getQueryData(key));
  } finally { h.unmount(); client.clear(); f.restore(); }
});
