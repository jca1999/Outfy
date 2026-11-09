// Actual fanout/createNotification/presenter; isolated DB/auth/push/logger.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const built = await build({
  stdin: { contents: 'export {notifyChatMessage} from "./src/lib/chat-notifications"; export {presentNotifications} from "./src/lib/notification-presenter"; export {default as router} from "./src/routes/chat";', resolveDir: root },
  bundle: true, platform: "node", format: "cjs", write: false, external: ["express"],
  plugins: [{ name: "chat-notification-boundaries", setup(b) {
    b.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({ contents: "export const getSupabaseAdmin=()=>globalThis.__chatNotificationDb;" }));
    b.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({ contents: "export const logger={warn(){},error(){}};" }));
    b.onLoad({ filter: /\/lib\/push-delivery\.ts$/ }, () => ({ contents: "export const sendPushToUser=async (...args)=>globalThis.__chatPushCalls.push(args);" }));
    b.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({ contents: 'export async function currentSession(req){const id=req.get("x-test-user"); return id?{user:{id}}:null;}' }));
    b.onResolve({ filter: /chat-notifications$/ }, args => args.importer.endsWith("/routes/chat.ts")
      ? { path: "dispatch", namespace: "dispatch" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "dispatch" }, () => ({ contents: "export const notifyChatMessage=(...args)=>globalThis.__launchChatNotification(...args);" }));
  } }],
});
const mod = new Module(`${root}tests/chat-notifications-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(built.outputFiles[0].text, `${root}tests/chat-notifications-isolated.cjs`);
const { notifyChatMessage, presentNotifications, router } = mod.exports;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "11111111-1111-4111-8111-111111111111";
const G = "22222222-2222-4222-8222-222222222222";
const P = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const M = "99999999-9999-4999-8999-999999999999";
const TIME = "2026-11-09T12:00:00Z";
const direct = { id: D, type: "direct", activity_id: null, direct_user_a_id: A, direct_user_b_id: B, created_at: TIME, updated_at: TIME, last_message_at: null };
const group = { ...direct, id: G, type: "activity", activity_id: P, direct_user_a_id: null, direct_user_b_id: null };
const message = (conversation = direct) => ({ id: M, conversation_id: conversation.id, sender_id: A, body: "PRIVATE BODY", created_at: TIME });
function fixture() {
  const db = {
    tables: {
      profiles: [A, B, C].map(id => ({ id, username: id === A ? "alice" : "friend", notify_messages: true, display_name: null, display_name_visibility: "everyone", avatar_path: null })),
      chat_conversations: [direct, group], chat_messages: [], notifications: [],
      activity_members: [A, B].map(user_id => ({ activity_id: P, user_id })),
      activities: [{ id: P, creator_id: A, title: "Plan", visibility: "public" }],
      connections: [{ requester_id: A, addressee_id: B, status: "accepted" }], activity_invitations: [],
    },
    calls: [], fail: null, active: 0, maxActive: 0, onMembershipPage: null,
    from(table) {
      const predicates = [];
      let limit = Infinity, order, single = false, values;
      const call = { table, limit: null, signal: null, op: "read" };
      db.calls.push(call);
      const q = {
        select() { return q; }, eq(k, v) { predicates.push(row => row[k] === v); return q; },
        neq(k, v) { predicates.push(row => row[k] !== v); return q; },
        in(k, v) { predicates.push(row => v.includes(row[k])); return q; },
        gt(k, v) { predicates.push(row => row[k] > v); return q; },
        or() { return q; }, limit(n) { call.limit = limit = n; return q; },
        order(k) { order = k; return q; },
        abortSignal(signal) { call.signal = signal; return q; },
        maybeSingle() { single = true; return q; }, single() { single = true; return q; },
        insert(v) { call.op = "insert"; values = v; return q; },
        async then(resolve, reject) {
          db.active++; db.maxActive = Math.max(db.maxActive, db.active);
          try {
            await new Promise(done => setImmediate(done));
            if (db.fail === table) return resolve({ data: null, error: { code: "XX000" } });
            if (values) {
              if (table === "notifications" && db.tables.notifications.some(row => row.dedupe_key === values.dedupe_key)) {
                return resolve({ data: null, error: { code: "23505" } });
              }
              const row = { id: M, created_at: TIME, ...values };
              db.tables[table].push(row);
              return resolve({ data: single ? row : [row], error: null });
            }
            let rows = db.tables[table].filter(row => predicates.every(fn => fn(row)));
            if (order) rows = rows.sort((a, b) => a[order].localeCompare(b[order]));
            rows = rows.slice(0, limit);
            if (table === "activity_members" && !single) db.onMembershipPage?.();
            return resolve({ data: single ? rows[0] ?? null : rows, error: null });
          } catch (error) { return reject(error); } finally { db.active--; }
        },
      };
      return q;
    },
  };
  globalThis.__chatNotificationDb = db;
  globalThis.__chatPushCalls = [];
  return db;
}
test("direct notification targets only the other original user with server-owned metadata and deterministic dedupe", async () => {
  const db = fixture();
  await notifyChatMessage(direct, message(), A);
  assert.equal(db.tables.notifications.length, 1);
  const n = db.tables.notifications[0];
  assert.equal(n.recipient_id, B);
  assert.equal(n.actor_id, A);
  assert.equal(n.activity_id, null);
  assert.equal(n.type, "chat_message");
  assert.deepEqual(n.metadata, { conversationId: D, messageId: M });
  assert.equal(n.dedupe_key, `chat_message:${M}:${B}`);
  await notifyChatMessage(direct, message(), A);
  assert.equal(db.tables.notifications.length, 1);
  assert.equal(globalThis.__chatPushCalls.length, 1);
  await notifyChatMessage(direct, { ...message(), conversation_id: G }, A);
  assert.equal(db.tables.notifications.length, 1);
});
test("group fanout paginates current members, excludes sender/nonmembers and bounds concurrency", async () => {
  const db = fixture();
  const ids = Array.from({ length: 105 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  db.tables.activity_members.push(...ids.map(user_id => ({ activity_id: P, user_id })));
  db.tables.profiles.push(...ids.map(id => ({ id, notify_messages: true })));
  await notifyChatMessage(group, message(group), A);
  assert.equal(db.tables.notifications.length, 106);
  assert.ok(db.tables.notifications.every(n => n.recipient_id !== A && n.recipient_id !== C && n.activity_id === P));
  assert.equal(db.maxActive <= 5, true);
  const pages = db.calls.filter(c => c.table === "activity_members" && c.limit !== null);
  assert.equal(pages.length, 2);
  assert.ok(pages.every(c => c.limit === 100 && c.signal instanceof AbortSignal));
});
test("member leaving between page resolution and delivery is skipped; notify_messages=false suppresses notification/push", async () => {
  const db = fixture();
  db.onMembershipPage = () => { db.tables.activity_members = db.tables.activity_members.filter(m => m.user_id !== B); };
  await notifyChatMessage(group, message(group), A);
  assert.equal(db.tables.notifications.length, 0);
  db.tables.profiles.find(p => p.id === B).notify_messages = false;
  await notifyChatMessage(direct, message(), A);
  assert.equal(db.tables.notifications.length, 0);
  assert.equal(globalThis.__chatPushCalls.length, 0);
});
test("notification failures stay best effort; presenter only exposes validated UUID metadata", async () => {
  const db = fixture();
  db.fail = "notifications";
  await assert.doesNotReject(() => notifyChatMessage(direct, message(), A));
  assert.equal(db.tables.notifications.length, 0);
  db.fail = null;
  const base = { id: M, type: "chat_message", actor_id: A, activity_id: P, created_at: TIME, read_at: null };
  const [safe, invalid] = await presentNotifications(B, [
    { ...base, metadata: { conversationId: D, messageId: M, secret: "PRIVATE", body: "PRIVATE" } },
    { ...base, metadata: { conversationId: "-".repeat(36), messageId: "/chats/nope" } },
  ]);
  assert.deepEqual(safe.metadata, { conversationId: D, messageId: M });
  assert.deepEqual(invalid.metadata, {});
});
test("successful send dispatches after persistence without waiting for notification completion", { timeout: 5000 }, async () => {
  const db = fixture();
  const launched = [];
  globalThis.__launchChatNotification = (...args) => {
    assert.equal(db.tables.chat_messages.length, 1);
    launched.push(args); return new Promise(() => {});
  };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {}, error() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/chat/conversations/${D}/messages`, {
      method: "POST", headers: { "content-type": "application/json", "x-test-user": A },
      body: JSON.stringify({ body: "Hello", recipientId: C, senderId: C }), signal: AbortSignal.timeout(2000),
    });
    assert.equal(result.status, 201);
    assert.equal((await result.json()).message.senderId, A);
    assert.equal(launched.length, 1);
    assert.equal(launched[0][0].id, D);
    assert.equal(launched[0][1].body, "Hello");
    assert.equal(launched[0][2], A);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
