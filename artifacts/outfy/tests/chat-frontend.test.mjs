// Focused production chat-layer regressions. No real network or credentials.
// Run: node --test artifacts/outfy/tests/chat-frontend.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../../api-server/package.json", import.meta.url));
const { build } = require("esbuild");
const built = await build({
  stdin: {
    contents: 'export * from "./src/chat/chat-utils"; export {chatApi} from "./src/chat/chat-api";',
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", write: false,
});
const mod = new Module(`${root}tests/chat-layer-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(built.outputFiles[0].text, `${root}tests/chat-layer-isolated.cjs`);
const {
  chatApi, chatKeys, normalizeChatBody, chatBodyLength, mergeMessagePages,
  appendSentMessage, patchInboxConversation, visibleInboxConversations,
  chatProfileName, formatMessageTime, formatInboxTime, isChatDenied,
} = mod.exports;
const D = "11111111-1111-4111-8111-111111111111";
const message = (id, createdAt = "2026-11-09T12:00:00.000001+00:00") => ({
  id, conversationId: D, body: "Hello", senderId: "viewer", createdAt, sender: null,
});

test("chat transport uses generated endpoints, cookie sessions, bounded pages and body-only sends", async () => {
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  const calls = [], timers = [], cleared = [];
  globalThis.window = {
    setTimeout(cb, ms) { const timer = setTimeout(cb, ms); timers.push({ timer, ms }); return timer; },
    clearTimeout(timer) { cleared.push(timer); clearTimeout(timer); },
  };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.signal.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(JSON.stringify({ conversation: { id: D }, messages: [], conversations: [], nextCursor: null, message: message("saved"), success: true }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    await chatApi.listConversations(null);
    await chatApi.listConversations("older+/=");
    await chatApi.getConversation(D);
    await chatApi.openDirect("friend");
    await chatApi.getActivity("plan");
    await chatApi.listMessages(D, null);
    await chatApi.listMessages(D, "cursor+/=");
    await chatApi.send(D, "Trimmed body");
    await chatApi.markRead(D);
    for (const { options } of calls) {
      assert.equal(options.credentials, "include");
      assert.ok(options.signal instanceof AbortSignal);
    }
    assert.equal(new URL(calls[0].url, "https://test.invalid").searchParams.get("limit"), "30");
    assert.equal(new URL(calls[1].url, "https://test.invalid").searchParams.get("cursor"), "older+/=");
    assert.equal(calls[2].url, `/api/chat/conversations/${D}`);
    assert.deepEqual(JSON.parse(calls[3].options.body), { userId: "friend" });
    assert.equal(calls[4].url, "/api/chat/activities/plan");
    assert.equal(new URL(calls[5].url, "https://test.invalid").searchParams.get("limit"), "50");
    assert.equal(new URL(calls[6].url, "https://test.invalid").searchParams.get("cursor"), "cursor+/=");
    assert.equal(calls[7].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[7].options.body), { body: "Trimmed body" });
    assert.equal(calls[8].url, `/api/chat/conversations/${D}/read`);
    assert.equal(calls[8].options.body, undefined);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(chatApi.getConversation(D, controller.signal), { name: "AbortError" });
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "chat_access_denied" }), { status: 403 });
    await assert.rejects(chatApi.send(D, "Keep my draft"), error => error.status === 403);
    assert.equal(timers.length, cleared.length);
    assert.ok(timers.every(t => t.ms === 15000));
  } finally {
    globalThis.fetch = originalFetch; globalThis.window = originalWindow;
    for (const { timer } of timers) clearTimeout(timer);
  }
});

test("composer validation trims, rejects empty/overlong text, and counts Unicode like PostgreSQL", () => {
  for (const value of ["", " ", "\n\t", "x".repeat(2001), "😀".repeat(2001)]) assert.equal(normalizeChatBody(value), null);
  assert.equal(normalizeChatBody(" \n Hi \t"), "Hi");
  assert.equal(normalizeChatBody("one\n two"), "one\n two");
  assert.equal(normalizeChatBody("😀".repeat(2000)), "😀".repeat(2000));
  assert.equal(chatBodyLength("😀a"), 2);
});

test("empty inbox chats are hidden without altering pages, next cursors, or deep-link data", () => {
  const used = { id: "used", lastMessage: message("m"), unreadCount: 2 };
  const empty = { id: "empty", lastMessage: null, unreadCount: 0 };
  const pages = [
    { conversations: [empty], nextCursor: "older" },
    { conversations: [used, used, empty], nextCursor: null },
  ];
  assert.deepEqual(visibleInboxConversations([pages[0]]), []);
  assert.equal(pages[0].nextCursor, "older");
  assert.deepEqual(visibleInboxConversations(pages), [used]);
  assert.equal(pages[0].conversations[0], empty);
  assert.deepEqual(visibleInboxConversations([{ conversations: [{ ...empty, lastMessage: message("first") }] }]).map(c => c.id), ["empty"]);
});

test("message pages merge chronologically, preserve microseconds and deduplicate sent/paged messages", () => {
  const older = message("z", "2026-11-09T12:00:00.000001+00:00");
  const newer = message("a", "2026-11-09T12:00:00.000002+00:00");
  const sameTime = message("b", newer.createdAt);
  assert.deepEqual(mergeMessagePages([
    { messages: [newer, sameTime] }, { messages: [older, newer] },
  ]).map(m => m.id), ["z", "a", "b"]);
  const cached = { pages: [{ messages: [older], nextCursor: "older-page" }], pageParams: [null] };
  const next = appendSentMessage(cached, newer);
  assert.deepEqual(next.pages[0].messages, [older, newer]);
  assert.equal(next.pages[0].nextCursor, "older-page");
  assert.deepEqual(cached.pages[0].messages, [older]);
  assert.equal(appendSentMessage(next, newer), next);
  assert.deepEqual(appendSentMessage(undefined, newer).pages[0].messages, [newer]);
});

test("read cache patches only the opened conversation; query identities isolate users", () => {
  const data = { pages: [{ conversations: [{ id: "one", unreadCount: 4 }, { id: "two", unreadCount: 2 }], nextCursor: "older" }], pageParams: [null] };
  const result = patchInboxConversation(data, "one", c => ({ ...c, unreadCount: 0 }));
  assert.deepEqual(result.pages[0].conversations.map(c => c.unreadCount), [0, 2]);
  assert.equal(data.pages[0].conversations[0].unreadCount, 4);
  assert.equal(result.pages[0].nextCursor, "older");
  assert.notDeepEqual(chatKeys.messages("viewerA", D), chatKeys.messages("viewerB", D));
  assert.notDeepEqual(chatKeys.conversation("viewerA", D), chatKeys.conversation("viewerA", "other"));
  assert.equal(isChatDenied({ status: 403 }), true);
  assert.equal(isChatDenied({ status: 404 }), true);
  assert.equal(isChatDenied({ status: 500 }), false);
});

test("safe display names fall back to usernames; timestamps use locale-aware formatters", () => {
  assert.equal(chatProfileName({ username: "lucia", displayName: "  " }), "@lucia");
  assert.equal(chatProfileName({ username: "lucia", displayName: " Lucía " }), "Lucía");
  assert.equal(chatProfileName(null), null);
  for (const locale of ["es", "en"]) {
    assert.ok(formatMessageTime("2026-11-09T12:30:00Z", locale));
    assert.ok(formatInboxTime("2026-11-09T12:30:00Z", locale));
  }
});

test("chat translations have matching nonempty ES/EN leaves and no retired mock copy", async () => {
  const en = JSON.parse(await readFile(`${root}src/i18n/locales/en/chats.json`, "utf8"));
  const es = JSON.parse(await readFile(`${root}src/i18n/locales/es/chats.json`, "utf8"));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const dictionary of [en, es]) {
    for (const value of Object.values(dictionary)) assert.ok(typeof value === "string" && value.trim().length);
    for (const retired of ["sampleIncoming", "sampleOutgoing", "recentlyOnline", "addImage"]) assert.equal(dictionary[retired], undefined);
  }
});

test("real composer handlers preserve native Shift+Enter, lock duplicate submissions and retain failed drafts", async () => {
  // Exercise the production handlers without a browser keyboard-driver limit.
  // Only hooks, network and cache side effects are isolated; JSX and component
  // event handlers are the real implementation.
  const composerBuild = await build({
    entryPoints: [`${root}src/chat/chat-composer.tsx`],
    bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic",
    plugins: [{
      name: "isolate-composer-effects",
      setup(b) {
        b.onResolve({ filter: /^react$/ }, args => args.importer.endsWith("/chat-composer.tsx")
          ? { path: "composer-hooks", namespace: "composer-test" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "composer-test" }, () => ({
          contents: ["useState", "useRef", "useEffect"].map(name =>
            `export const ${name} = (...args) => globalThis.__composerHarness.${name}(...args);`).join("\n"),
        }));
        b.onLoad({ filter: /\/chat\/chat-api\.ts$/ }, () => ({
          contents: "export const chatApi = {send:(...args)=>globalThis.__composerHarness.send(...args)};",
        }));
        b.onLoad({ filter: /\/chat\/use-chat\.ts$/ }, () => ({
          contents: "export const useChatCacheWriters=()=>({onSent:(...args)=>globalThis.__composerHarness.saved.push(args)});",
        }));
        b.onResolve({ filter: /^react-i18next$/ }, () => ({ path: "translations", namespace: "composer-i18n" }));
        b.onLoad({ filter: /.*/, namespace: "composer-i18n" }, () => ({
          contents: "export const useTranslation=()=>({t:key=>key});",
        }));
      },
    }],
  });
  const componentModule = new Module(`${root}tests/composer-isolated.cjs`);
  componentModule.paths = Module._nodeModulePaths(root);
  componentModule._compile(composerBuild.outputFiles[0].text, `${root}tests/composer-isolated.cjs`);
  const { ChatComposer } = componentModule.exports;
  const slots = [];
  let index = 0, tree, resolveSend, rejectSend;
  const originalRaf = globalThis.requestAnimationFrame;
  const harness = {
    calls: [], saved: [],
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) { const slot = index++; return slots[slot] ??= { current: initial }; },
    useEffect(effect) { const slot = index++; if (!slots[slot]) { slots[slot] = true; effect(); } },
    send(...args) {
      harness.calls.push(args);
      return new Promise((resolve, reject) => { resolveSend = resolve; rejectSend = reject; });
    },
  };
  globalThis.__composerHarness = harness;
  globalThis.requestAnimationFrame = cb => cb();
  const render = () => { index = 0; tree = ChatComposer({ conversationId: D }); };
  function find(node, testId) {
    if (!node || typeof node !== "object") return null;
    if (node.props?.["data-testid"] === testId) return node;
    for (const child of [node.props?.children].flat(Infinity)) {
      const found = find(child, testId);
      if (found) return found;
    }
    return null;
  }
  const flush = () => new Promise(resolve => setImmediate(resolve));
  try {
    render();
    assert.equal(find(tree, "button-send-message").props.disabled, true);
    find(tree, "input-chat-message").props.onChange({ target: { value: "  Hello\nfriend  " } });
    render();
    let prevented = false;
    find(tree, "input-chat-message").props.onKeyDown({
      key: "Enter", shiftKey: true, nativeEvent: {}, preventDefault() { prevented = true; },
    });
    assert.equal(prevented, false); // native textarea newline is not suppressed
    assert.equal(harness.calls.length, 0);
    const event = { key: "Enter", shiftKey: false, nativeEvent: {}, preventDefault() {} };
    find(tree, "input-chat-message").props.onKeyDown(event);
    tree.props.onSubmit({ preventDefault() {} }); // same-tick Enter + click
    assert.deepEqual(harness.calls, [[D, "Hello\nfriend"]]);
    render();
    assert.equal(find(tree, "button-send-message").props.disabled, true);
    resolveSend({ message: message("saved") }); await flush(); render();
    assert.equal(find(tree, "input-chat-message").props.value, "");
    assert.equal(harness.saved.length, 1);
    find(tree, "input-chat-message").props.onChange({ target: { value: "Keep this draft" } });
    render(); tree.props.onSubmit({ preventDefault() {} });
    rejectSend(new Error("Rejected")); await flush(); render();
    assert.equal(find(tree, "input-chat-message").props.value, "Keep this draft");
    assert.ok(find(tree, "error-send-message"));
    assert.equal(find(tree, "button-send-message").props.disabled, false);
  } finally {
    delete globalThis.__composerHarness;
    globalThis.requestAnimationFrame = originalRaf;
  }
});
