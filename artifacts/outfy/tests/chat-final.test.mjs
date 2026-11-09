import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../../api-server/package.json", import.meta.url));
const { build } = require("esbuild");
const output = await build({
  entryPoints: [`${root}src/notifications/notification-destination.ts`],
  bundle: true, platform: "node", format: "cjs", write: false,
});
const mod = new Module(`${root}tests/chat-final-isolated.cjs`);
mod._compile(output.outputFiles[0].text, mod.id);
const { notificationDestination } = mod.exports;
const D = "11111111-1111-4111-8111-111111111111";
test("bell chat destination always prefers exact conversation over activity, with safe chats fallback", () => {
  for (const activity of [null, { id: "plan" }]) {
    assert.equal(notificationDestination({ type: "chat_message", metadata: { conversationId: D }, activity }), `/chats/${D}`);
    for (const conversationId of [undefined, "bad", "//evil.test", "-".repeat(36), `${D}?next=evil`, {}, 123]) {
      assert.equal(notificationDestination({ type: "chat_message", metadata: { conversationId }, activity }), "/chats");
    }
  }
  assert.equal(notificationDestination({ type: "activity_joined", metadata: { conversationId: D }, activity: { id: "plan" } }), "/activities/plan");
  assert.equal(notificationDestination({ type: "connection_request", actor: { username: "alice" } }), "/users/alice");
  assert.equal(notificationDestination({ type: "activity_invitation", activity: null }), null);
});
test("mobile open-chat layout uses a bounded flex viewport and flow composer; desktop sizing and long wrapping retained", async () => {
  const source = async path => readFile(`${root}src/${path}`, "utf8");
  const [shell, chats, view, composer, list] = await Promise.all([
    source("components/outfy-shell.tsx"), source("pages/chats.tsx"), source("chat/conversation-view.tsx"),
    source("chat/chat-composer.tsx"), source("chat/message-list.tsx"),
  ]);
  assert.doesNotMatch(composer, /bottom-\[calc\(76px|sticky/);
  assert.match(composer, /shrink-0/);
  assert.match(shell, /max-md:h-\[var\(--outfy-chat-viewport,100dvh\)\]/);
  assert.match(shell, /visualViewport/);
  assert.match(shell, /viewport\.removeEventListener\("resize", resize\)/);
  assert.match(shell, /max-md:relative max-md:inset-auto max-md:shrink-0/);
  assert.match(shell, /safe-area-inset-bottom/);
  assert.match(shell, /max-md:py-2/);
  assert.match(chats, /max-md:min-h-0 max-md:flex-1/);
  assert.match(chats, /lg:h-\[min\(720px,calc\(100dvh-220px\)\)\]/);
  assert.match(chats, /lg:grid-cols-\[320px_1fr\]/);
  assert.match(view, /min-h-0 flex-1 overflow-y-auto overflow-x-hidden/);
  assert.match(list, /whitespace-pre-wrap break-words \[overflow-wrap:anywhere\]/);
});
