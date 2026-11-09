// Real Express router + real Supabase/PostgREST query builder, with an in-memory
// HTTP transport. No credentials, remote reads/writes, migrations or notifications.
// Run from this package: node --test tests/chat.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const built = await build({
  entryPoints: [`${root}src/routes/chat.ts`], bundle: true, platform: "node",
  format: "cjs", write: false, external: ["express"],
  plugins: [{
    name: "isolate-auth-and-transport",
    setup(b) {
      b.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger={warn(){},error(){}};", loader: "js",
      }));
      b.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id = req.get("x-test-user"); return id ? {user:{id}} : null; }', loader: "js",
      }));
      b.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export function getSupabaseAdmin() { return globalThis.__chatDb; }", loader: "js",
      }));
    },
  }],
});
const mod = new Module(`${root}tests/isolated-chat.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(built.outputFiles[0].text, `${root}tests/isolated-chat.cjs`);
const router = mod.exports.default;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ACTIVITY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DIRECT = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const TIME = "2026-11-01T12:00:00.000000+00:00";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const profile = (userId, visibility = "friends") => ({
  id: userId, username: userId[0], display_name: "Private name",
  display_name_visibility: visibility, is_profile_private: true,
  home_city: "Secret city", avatar_path: `${userId}/avatar.webp`, email: "never@example.invalid",
});
const conversation = (extra = {}) => ({
  id: DIRECT, type: "direct", direct_user_a_id: A, direct_user_b_id: B,
  activity_id: null, last_message_at: null, created_at: TIME, updated_at: TIME, ...extra,
});
const message = (n, extra = {}) => ({
  id: id(n), conversation_id: DIRECT, sender_id: B, body: `Message ${n}`, created_at: TIME, ...extra,
});
function split(expression) {
  let depth = 0, start = 0;
  const parts = [];
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "(") depth++;
    if (expression[i] === ")") depth--;
    if (expression[i] === "," && depth === 0) { parts.push(expression.slice(start, i)); start = i + 1; }
  }
  parts.push(expression.slice(start));
  return parts;
}
function compare(a, b) {
  // Fixture timestamps are UTC with uniform precision except server read times.
  // Use canonical padded microseconds so same-millisecond ordering is exercised.
  const canonical = value => typeof value === "string" && /^\d{4}-/.test(value)
    ? value.replace(/\+00:00$/, "Z").replace(/(\.\d+)?Z$/, m => `.${(m.match(/\d+/)?.[0] ?? "").padEnd(6, "0")}Z`)
    : value;
  a = canonical(a); b = canonical(b);
  return a === b ? 0 : a > b ? 1 : -1;
}
function scalar(value, expression) {
  const dot = expression.indexOf(".");
  const operator = expression.slice(0, dot), target = expression.slice(dot + 1);
  if (operator === "eq") return value === target;
  if (operator === "neq") return value !== target;
  if (operator === "is") return target === "null" ? value == null : value === target;
  if (operator === "gt") return value != null && compare(value, target) > 0;
  if (operator === "lt") return value != null && compare(value, target) < 0;
  if (operator === "in") return split(target.slice(1, -1)).includes(value);
  throw new Error(`Unsupported fixture filter ${expression}`);
}
function logical(row, expression) {
  if (expression.startsWith("and(")) return split(expression.slice(4, -1)).every(p => logical(row, p));
  if (expression.startsWith("or(")) return split(expression.slice(3, -1)).some(p => logical(row, p));
  const dot = expression.indexOf(".");
  return scalar(row[expression.slice(0, dot)], expression.slice(dot + 1));
}
function sorted(rows, expression) {
  const orders = expression?.split(",") ?? [];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [key, direction, nulls] = order.split(".");
      if (a[key] == null && b[key] == null) continue;
      if (a[key] == null) return nulls === "nullslast" ? 1 : -1;
      if (b[key] == null) return nulls === "nullslast" ? -1 : 1;
      const difference = compare(a[key], b[key]);
      if (difference) return direction === "desc" ? -difference : difference;
    }
    return 0;
  });
}
function fakeTransport() {
  const state = {
    tables: {
      chat_conversations: [conversation(), conversation({
        id: GROUP, type: "activity", activity_id: ACTIVITY, direct_user_a_id: null, direct_user_b_id: null,
      })],
      chat_messages: [], chat_read_states: [],
      connections: [{ id: id(900), requester_id: A, addressee_id: B, status: "accepted" }],
      profiles: [profile(A), profile(B), profile(C, "shared_activity"), profile(D, "everyone")],
      activities: [{ id: ACTIVITY, title: "Private plan", status: "active", category: "sports", address: "Secret address" }],
      activity_members: [A, C].map(user_id => ({ activity_id: ACTIVITY, user_id })),
    },
    calls: [], race: false, triggerError: null, failure: null, next: 1000,
  };
  state.fetch = async (input, init = {}) => {
    const url = new URL(input), method = init.method ?? "GET";
    state.calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
    const json = (data, status = 200, headers = {}) => new Response(method === "HEAD" ? null : JSON.stringify(data), {
      status, headers: { "content-type": "application/json", ...headers },
    });
    if (url.pathname.includes("/storage/")) {
      const paths = JSON.parse(init.body).paths;
      return json(paths.map(path => ({ path, signedURL: `/object/sign/avatars/${path}?token=fake` })));
    }
    assert.equal(url.hostname, "chat-tests.invalid");
    const table = url.pathname.split("/").at(-1);
    const params = url.searchParams;
    if (state.failure) return json({ code: "XX000", message: "Sensitive database failure" }, 500);
    if (method === "POST") {
      if (state.triggerError) return json({ code: "23514", message: state.triggerError }, 400);
      const values = JSON.parse(init.body);
      if (table === "chat_conversations" && state.race) {
        state.race = false;
        state.tables[table].push(conversation({
          ...values, id: id(++state.next),
          direct_user_a_id: values.direct_user_b_id, direct_user_b_id: values.direct_user_a_id,
        }));
        return json({ code: "23505", message: "Unique unordered pair" }, 409);
      }
      let row;
      if (table === "chat_read_states") {
        row = state.tables[table].find(r => r.conversation_id === values.conversation_id && r.user_id === values.user_id);
        if (row) Object.assign(row, values);
        else { row = values; state.tables[table].push(row); }
      } else {
        row = table === "chat_conversations"
          ? conversation({ ...values, id: id(++state.next) })
          : { ...values, id: id(++state.next), created_at: TIME };
        state.tables[table].push(row);
        if (table === "chat_messages") {
          Object.assign(state.tables.chat_conversations.find(c => c.id === row.conversation_id), { last_message_at: row.created_at });
        }
      }
      return json(row, 201);
    }
    let rows = [...state.tables[table]];
    for (const [key, expression] of params) {
      if (key === "or") { rows = rows.filter(row => split(expression.slice(1, -1)).some(p => logical(row, p))); continue; }
      if (key === "activities.activity_members.user_id") {
        rows = rows.filter(row => state.tables.activity_members.some(m => m.activity_id === row.activity_id && scalar(m.user_id, expression)));
        continue;
      }
      if (["select", "order", "limit", "offset"].includes(key) || key.startsWith("chat_messages.")) continue;
      rows = rows.filter(row => scalar(row[key], expression));
    }
    const count = rows.length;
    rows = sorted(rows, params.get("order")).slice(0, Number(params.get("limit") ?? 10000));
    if (params.get("select")?.includes("chat_messages(")) {
      rows = rows.map(row => ({
        ...row,
        chat_messages: sorted(state.tables.chat_messages.filter(m => m.conversation_id === row.id), params.get("chat_messages.order"))
          .slice(0, Number(params.get("chat_messages.limit"))),
      }));
    }
    const single = new Headers(init.headers).get("accept")?.includes("vnd.pgrst.object");
    return json(single ? rows[0] ?? null : rows, 200, { "content-range": `0-${Math.max(0, rows.length - 1)}/${count}` });
  };
  return state;
}

test("Chat V1 authorization, writes, privacy and bounded pagination", async t => {
  let state;
  function reset() {
    state = fakeTransport();
    globalThis.__chatDb = createClient("https://chat-tests.invalid", "test-service-role", {
      global: { fetch: state.fetch }, auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const request = async (path, user = A, body, method = body === undefined ? "GET" : "POST") => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat${path}`, {
      method, headers: { ...(user ? { "x-test-user": user } : {}), "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(2500),
    });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  try {
    await t.test("all seven method/path combinations require authentication before database access", async () => {
      reset();
      for (const [path, body] of [
        ["/conversations"], [`/conversations/${DIRECT}`], ["/direct", { userId: B }], [`/conversations/${DIRECT}/messages`],
        [`/conversations/${DIRECT}/messages`, { body: "Hi" }], [`/conversations/${DIRECT}/read`, {}],
        [`/activities/${ACTIVITY}`],
      ]) assert.equal((await request(path, null, body)).status, 401);
      assert.equal(state.calls.length, 0);
    });
    await t.test("exact deep-link lookup returns empty direct chats to original participants, including ex-friends", async () => {
      reset();
      state.tables.connections = [];
      for (const user of [A, B]) {
        const result = await request(`/conversations/${DIRECT}`, user);
        assert.equal(result.status, 200);
        assert.equal(result.cache, "private, no-store");
        assert.equal(result.body.conversation.id, DIRECT);
        assert.equal(result.body.conversation.lastMessage, null);
        assert.equal(result.body.conversation.otherUser.id, user === A ? B : A);
        assert.equal(result.body.conversation.otherUser.displayName, null);
        assert.deepEqual(Object.keys(result.body), ["conversation"]);
      }
      const inbox = await request("/conversations");
      const detail = await request(`/conversations/${DIRECT}`);
      assert.deepEqual(detail.body.conversation, inbox.body.conversations.find(c => c.id === DIRECT));
      const calls = state.calls.length;
      const denied = await request(`/conversations/${DIRECT}`, C);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, "chat_access_denied");
      assert.equal(state.calls.slice(calls).some(call =>
        call.url.pathname.endsWith("/profiles") || call.url.pathname.endsWith("/chat_messages")), false);
      assert.equal(state.tables.chat_read_states.length, 0);
    });
    await t.test("exact activity deep links require current membership, never public activity visibility", async () => {
      reset();
      for (const user of [A, C]) {
        const result = await request(`/conversations/${GROUP}`, user);
        assert.equal(result.status, 200);
        assert.equal(result.body.conversation.activity.id, ACTIVITY);
        assert.equal(result.body.conversation.lastMessage, null);
      }
      state.tables.activities[0].visibility = "public";
      for (const user of [B, D]) {
        const result = await request(`/conversations/${GROUP}`, user);
        assert.equal(result.status, 403);
        assert.equal(result.body.conversation, undefined);
      }
      state.tables.activity_members = state.tables.activity_members.filter(m => m.user_id !== C);
      assert.equal((await request(`/conversations/${GROUP}`, C)).status, 403);
      assert.equal((await request("/conversations/bad")).body.code, "invalid_conversation");
      assert.equal((await request(`/conversations/${id(555)}`)).body.code, "chat_not_found");
      state.failure = true;
      assert.equal((await request(`/conversations/${DIRECT}`)).body.code, "chat_unavailable");
    });
    await t.test("strangers, pending friends, self and missing/invalid targets cannot create empty chats", async () => {
      reset();
      const initial = state.tables.chat_conversations.length;
      assert.equal((await request("/direct", A, { userId: C })).body.code, "chat_connection_not_accepted");
      state.tables.connections[0].status = "pending";
      assert.equal((await request("/direct", A, { userId: B })).status, 403);
      assert.equal((await request("/direct", A, { userId: A.toUpperCase() })).body.code, "self_chat");
      assert.equal((await request("/direct", A, { userId: id(999) })).status, 404);
      for (const body of [{}, { userId: "bad" }, { userId: [] }]) {
        assert.equal((await request("/direct", A, body)).status, 400);
      }
      assert.equal(state.tables.chat_conversations.length, initial);
    });
    await t.test("accepted friends create one unordered direct chat; repeated and reversed calls reuse it", async () => {
      reset();
      state.tables.chat_conversations = [];
      const first = await request("/direct", A, { userId: B });
      assert.equal(first.status, 201);
      assert.equal(first.body.conversation.otherUser.id, B);
      assert.equal(first.body.conversation.otherUser.displayName, "Private name");
      assert.match(first.body.conversation.otherUser.avatarUrl, /avatars\/bbbb/);
      assert.deepEqual(Object.keys(first.body.conversation.otherUser).sort(), ["avatarUrl", "displayName", "id", "username"]);
      for (const [viewer, target] of [[A, B], [B, A]]) {
        const again = await request("/direct", viewer, { userId: target });
        assert.equal(again.status, 200);
        assert.equal(again.body.conversation.id, first.body.conversation.id);
      }
      assert.equal(state.tables.chat_conversations.length, 1);
    });
    await t.test("unique-index create race returns the winning unordered conversation", async () => {
      reset(); state.tables.chat_conversations = []; state.race = true;
      const result = await request("/direct", A, { userId: B });
      assert.equal(result.status, 200);
      assert.equal(result.body.conversation.id, state.tables.chat_conversations[0].id);
      assert.equal(state.tables.chat_conversations.length, 1);
    });
    await t.test("both original participants can read history after friendship removal; outsider cannot", async () => {
      reset(); state.tables.chat_messages = [message(1)]; state.tables.connections = [];
      for (const viewer of [A, B]) {
        const result = await request(`/conversations/${DIRECT}/messages`, viewer);
        assert.equal(result.status, 200);
        assert.equal(result.body.messages[0].id, id(1));
        if (viewer === A) assert.equal(result.body.messages[0].sender.displayName, null);
      }
      const calls = state.calls.length;
      assert.equal((await request(`/conversations/${DIRECT}/messages`, C)).status, 403);
      assert.equal(state.calls.slice(calls).some(c => c.url.pathname.endsWith("/chat_messages")), false);
      assert.equal((await request("/direct", A, { userId: B })).status, 403);
    });
    await t.test("organizer/member access activity chat; non-member and former member cannot read or send", async () => {
      reset();
      state.tables.chat_messages = [message(2, { conversation_id: GROUP, sender_id: C })];
      for (const viewer of [A, C]) {
        const result = await request(`/activities/${ACTIVITY}`, viewer);
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.conversation.activity, {
          id: ACTIVITY, title: "Private plan", status: "active", category: "sports",
        });
        assert.equal((await request(`/conversations/${GROUP}/messages`, viewer)).status, 200);
      }
      const groupMessages = await request(`/conversations/${GROUP}/messages`, A);
      assert.equal(groupMessages.body.messages[0].sender.displayName, "Private name");
      for (const viewer of [B, D]) {
        assert.equal((await request(`/activities/${ACTIVITY}`, viewer)).status, 403);
        assert.equal((await request(`/conversations/${GROUP}/messages`, viewer)).status, 403);
        assert.equal((await request(`/conversations/${GROUP}/messages`, viewer, { body: "No" })).status, 403);
      }
      state.tables.activity_members = state.tables.activity_members.filter(m => m.user_id !== C);
      assert.equal((await request(`/activities/${ACTIVITY}`, C)).status, 403);
      assert.equal((await request(`/conversations/${GROUP}/messages`, C)).status, 403);
      const departed = await request(`/conversations/${GROUP}/messages`, A);
      assert.equal(departed.body.messages[0].sender.displayName, null);
    });
    await t.test("message sender and conversation are server-owned; body is trimmed; activity send works", async () => {
      reset();
      const result = await request(`/conversations/${DIRECT}/messages`, A, {
        body: "  Hello  ", sender_id: C, senderId: C, conversation_id: GROUP, created_at: "1900-01-01",
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.message.body, "Hello");
      assert.equal(result.body.message.senderId, A);
      assert.equal(result.body.message.conversationId, DIRECT);
      assert.equal(state.tables.chat_messages[0].sender_id, A);
      assert.equal((await request(`/conversations/${GROUP}/messages`, C, { body: "Group" })).status, 201);
      assert.equal(state.calls.some(c => /notifications|rpc/.test(c.url.pathname)), false);
    });
    await t.test("empty, non-string and too-long messages rejected; Unicode boundary matches database characters", async () => {
      reset();
      for (const body of ["", " \n\t ", "x".repeat(2001), "😀".repeat(2001), null, 12, []]) {
        assert.equal((await request(`/conversations/${DIRECT}/messages`, A, { body })).body.code, "invalid_message_body");
      }
      assert.equal((await request(`/conversations/${DIRECT}/messages`, A, {})).status, 400);
      assert.equal(state.tables.chat_messages.length, 0);
      assert.equal((await request(`/conversations/${DIRECT}/messages`, A, { body: "😀".repeat(2000) })).status, 201);
    });
    await t.test("removed or pending friendship blocks new messages without deleting old history", async () => {
      reset(); state.tables.chat_messages = [message(1)];
      for (const connections of [[], [{ requester_id: B, addressee_id: A, status: "pending" }]]) {
        state.tables.connections = connections;
        const sent = await request(`/conversations/${DIRECT}/messages`, A, { body: "No" });
        assert.equal(sent.status, 403);
        assert.equal(sent.body.code, "chat_connection_not_accepted");
        assert.equal(state.tables.chat_messages.length, 1);
      }
      assert.equal((await request(`/conversations/${DIRECT}/messages`, C, { body: "No" })).status, 403);
    });
    await t.test("read state is server-owned, upserted only for an authorized participant, including ex-friends", async () => {
      reset(); state.tables.connections = [];
      const before = Date.now();
      const result = await request(`/conversations/${DIRECT}/read`, A, { user_id: C, last_read_at: "2099-01-01" });
      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
      assert.ok(Date.parse(result.body.readAt) >= before && Date.parse(result.body.readAt) <= Date.now());
      assert.equal(state.tables.chat_read_states[0].user_id, A);
      assert.equal((await request(`/conversations/${DIRECT}/read`, A, {})).status, 200);
      assert.equal(state.tables.chat_read_states.length, 1);
      assert.equal((await request(`/conversations/${DIRECT}/read`, C, {})).status, 403);
      assert.equal((await request(`/conversations/${GROUP}/read`, B, {})).status, 403);
      assert.equal((await request(`/conversations/${GROUP}/read`, C, {})).status, 200);
      assert.equal(state.tables.chat_read_states.length, 2);
    });
    await t.test("messages use bounded keyset pages, stable equal timestamps and oldest-to-newest rendering", async () => {
      reset();
      state.tables.chat_messages = Array.from({ length: 125 }, (_, i) => message(i + 1));
      const first = await request(`/conversations/${DIRECT}/messages`);
      assert.equal(first.status, 200);
      assert.equal(first.body.messages.length, 50);
      assert.equal(first.body.messages[0].id, id(76));
      assert.equal(first.body.messages.at(-1).id, id(125));
      state.tables.chat_messages.push(message(126)); // does not shift older pages
      const second = await request(`/conversations/${DIRECT}/messages?cursor=${first.body.nextCursor}`);
      assert.equal(second.body.messages[0].id, id(26));
      const third = await request(`/conversations/${DIRECT}/messages?cursor=${second.body.nextCursor}`);
      assert.equal(third.body.messages.length, 25);
      assert.equal(third.body.nextCursor, null);
      const all = [...first.body.messages, ...second.body.messages, ...third.body.messages].map(m => m.id);
      assert.equal(new Set(all).size, 125);
      assert.equal((await request(`/conversations/${DIRECT}/messages?limit=100`)).body.messages.length, 100);
      for (const query of ["limit=0", "limit=101", "limit=-1", "limit=1.5", "limit=2&limit=3", "cursor=bad", "cursor="]) {
        assert.equal((await request(`/conversations/${DIRECT}/messages?${query}`)).status, 400);
      }
      assert.equal((await request(`/conversations/${GROUP}/messages?cursor=${first.body.nextCursor}`)).status, 400);
      for (const call of state.calls.filter(c => c.url.pathname.endsWith("/chat_messages") && c.method === "GET")) {
        assert.ok(Number(call.url.searchParams.get("limit")) <= 101);
      }
    });
    await t.test("message cursor preserves PostgreSQL microseconds", async () => {
      reset();
      state.tables.chat_messages = [
        message(1, { created_at: "2026-11-01T12:00:00.000001+00:00" }),
        message(2, { created_at: "2026-11-01T12:00:00.000002+00:00" }),
      ];
      const first = await request(`/conversations/${DIRECT}/messages?limit=1`);
      assert.equal(first.body.messages[0].id, id(2));
      const second = await request(`/conversations/${DIRECT}/messages?limit=1&cursor=${first.body.nextCursor}`);
      assert.equal(second.body.messages[0].id, id(1));
      assert.equal(second.body.nextCursor, null);
    });
    await t.test("inbox filters membership, sorts nulls last and returns safe profiles, last message and exact unread count", async () => {
      reset();
      state.tables.chat_conversations.push(conversation({ id: id(300), direct_user_a_id: C, direct_user_b_id: D }));
      state.tables.chat_conversations[0].last_message_at = TIME;
      state.tables.chat_messages = [
        message(1, { created_at: "2026-11-01T11:00:00.000000+00:00" }),
        message(2), message(3, { sender_id: A }),
      ];
      state.tables.chat_read_states = [{ user_id: A, conversation_id: DIRECT, last_read_at: "2026-11-01T11:30:00.000000+00:00" }];
      const result = await request("/conversations");
      assert.equal(result.status, 200);
      assert.equal(result.cache, "private, no-store");
      assert.deepEqual(result.body.conversations.map(c => c.id), [DIRECT, GROUP]);
      assert.equal(result.body.conversations[0].lastMessage.id, id(3));
      assert.equal(result.body.conversations[0].unreadCount, 1);
      assert.equal(result.body.conversations[1].lastMessage, null);
      assert.equal(result.body.conversations[1].unreadCount, 0);
      assert.equal(JSON.stringify(result.body).includes("Secret"), false);
      await request(`/conversations/${DIRECT}/read`, A, {});
      assert.equal((await request("/conversations")).body.conversations[0].unreadCount, 0);
      state.tables.activity_members = [];
      assert.deepEqual((await request("/conversations")).body.conversations.map(c => c.id), [DIRECT]);
      state.tables.connections = [];
      const formerFriend = (await request("/conversations")).body.conversations[0];
      assert.equal(formerFriend.otherUser.displayName, null);
      assert.equal(formerFriend.id, DIRECT);
    });
    await t.test("inbox keyset pages cross direct/activity branches and null timestamps without duplicates", async () => {
      reset();
      state.tables.chat_conversations = [
        conversation({ id: id(1), last_message_at: TIME }),
        conversation({ id: id(2), last_message_at: TIME }),
        conversation({ id: id(3), last_message_at: "2026-11-01T12:00:00.000001+00:00" }),
        conversation({ id: id(4) }), conversation({ id: id(5) }),
        conversation({ id: GROUP, type: "activity", direct_user_a_id: null, direct_user_b_id: null, activity_id: ACTIVITY }),
      ];
      const expected = [id(3), id(2), id(1), GROUP, id(5), id(4)];
      const seen = [];
      let cursor = null;
      do {
        const result = await request(`/conversations?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
        assert.equal(result.status, 200);
        seen.push(...result.body.conversations.map(c => c.id));
        cursor = result.body.nextCursor;
        assert.ok(seen.length <= expected.length);
      } while (cursor);
      assert.deepEqual(seen, expected);
      for (const query of ["limit=51", "limit=0", "cursor=garbage", "limit=2&limit=3"]) {
        assert.equal((await request(`/conversations?${query}`)).status, 400);
      }
      const first = await request("/conversations?limit=1");
      assert.equal((await request(`/conversations?cursor=${first.body.nextCursor}`, B)).status, 400);
      const branches = state.calls.filter(c => c.url.pathname.endsWith("/chat_conversations") && c.url.searchParams.has("order"));
      assert.ok(branches.every(c => Number(c.url.searchParams.get("limit")) <= 51));
      assert.ok(branches.some(c => c.url.searchParams.has("activities.activity_members.user_id")));
    });
    await t.test("trigger failures during write races are mapped without exposing database details", async () => {
      reset();
      for (const [trigger, code] of [
        ["chat_connection_not_accepted", "chat_connection_not_accepted"],
        ["chat_activity_membership_required", "chat_access_denied"],
        ["chat_sender_not_participant", "chat_access_denied"],
        ["chat_conversation_not_found", "chat_not_found"],
      ]) {
        state.triggerError = trigger;
        const result = await request(`/conversations/${DIRECT}/messages`, A, { body: "Race" });
        assert.equal(result.body.code, code);
        assert.equal(result.status, trigger === "chat_conversation_not_found" ? 404 : 403);
      }
      state.triggerError = "chat_reader_not_participant";
      assert.equal((await request(`/conversations/${DIRECT}/read`, A, {})).status, 403);
      state.triggerError = null; state.failure = true;
      const failed = await request("/conversations");
      assert.equal(failed.status, 500);
      assert.equal(failed.body.code, "chat_unavailable");
      assert.equal(JSON.stringify(failed.body).includes("Sensitive"), false);
    });
    await t.test("UUID validation and missing conversations have stable errors", async () => {
      reset();
      for (const [path, body] of [
        ["/conversations/bad/messages"], ["/conversations/bad/messages", { body: "x" }],
        ["/conversations/bad/read", {}], ["/activities/bad"],
      ]) assert.equal((await request(path, A, body)).status, 400);
      assert.equal((await request(`/conversations/${id(555)}/messages`)).status, 404);
      state.tables.chat_conversations = [];
      assert.equal((await request(`/activities/${ACTIVITY}`)).status, 404);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    delete globalThis.__chatDb;
  }
});
