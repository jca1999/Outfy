// Real router, authorization, safe presenter and SSE transport; only auth/DB
// transport and timers isolated. No remote data or credentials.
import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { build } from "esbuild";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const built = await build({
  stdin: { contents: 'export {default as router} from "./src/routes/chat"; export {streamChatEvents} from "./src/lib/chat-events";', resolveDir: root },
  bundle: true, platform: "node", format: "cjs", write: false, external: ["express"],
  plugins: [{
    name: "fake-auth-db-clock",
    setup(b) {
      b.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id=req.get("x-test-user"); return id ? {user:{id}} : null; }',
      }));
      b.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export const getSupabaseAdmin=()=>globalThis.__realtimeDb;",
      }));
      b.onLoad({ filter: /\/lib\/chat-events\.ts$/ }, async ({ path }) => {
        const { readFile } = await import("node:fs/promises");
        const source = await readFile(path, "utf8");
        return {
          contents: source.replace("setInterval(()", "globalThis.__sseClock.setInterval(()")
            .replace("clearInterval(heartbeat)", "globalThis.__sseClock.clearInterval(heartbeat)"),
          loader: "ts",
        };
      });
    },
  }],
});
const mod = new Module(`${root}tests/realtime-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(built.outputFiles[0].text, `${root}tests/realtime-isolated.cjs`);
const { router, streamChatEvents } = mod.exports;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "11111111-1111-4111-8111-111111111111";
const G = "22222222-2222-4222-8222-222222222222";
const P = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const M = "99999999-9999-4999-8999-999999999999";
const TIME = "2026-11-09T12:00:00.000001Z";
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const state = { channels: [], removed: [], member: true, checks: 0, fail: false, duringProfiles: null, timers: new Set() };
  globalThis.__sseClock = {
    setInterval(callback, ms) {
      const timer = { callback, ms, unref() {} };
      state.timers.add(timer); return timer;
    },
    clearInterval(timer) { state.timers.delete(timer); },
  };
  const db = {
    channel(name) {
      const c = {
        name, callback: null, status: null,
        on(kind, filter, callback) { this.kind = kind; this.filter = filter; this.callback = callback; return this; },
        subscribe(callback) { this.status = callback; callback("SUBSCRIBED"); return this; },
      };
      state.channels.push(c); return c;
    },
    async removeChannel(channel) {
      state.removed.push(channel);
      state.onRemoved?.();
      channel.status?.("CLOSED"); return "ok";
    },
    from(table) {
      const filters = {};
      const query = {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; },
        in() { return this; }, limit() { return this; },
        maybeSingle() {
          if (state.fail) return Promise.resolve({ data: null, error: new Error("secret DB error") });
          if (table === "chat_conversations") {
            state.checks++;
            return Promise.resolve({ data: filters.id === D ? {
              id: D, type: "direct", activity_id: null, direct_user_a_id: A, direct_user_b_id: B,
            } : filters.id === G ? { id: G, type: "activity", activity_id: P } : null, error: null });
          }
          if (table === "activity_members") return Promise.resolve({
            data: state.member && [A, B].includes(filters.user_id) ? { user_id: filters.user_id } : null, error: null,
          });
          throw new Error(`Unexpected single ${table}`);
        },
        then(resolve, reject) {
          if (table === "profiles") {
            state.duringProfiles?.();
            return Promise.resolve({ data: [{
              id: B, username: "safe-user", display_name: "SECRET NAME", display_name_visibility: "nobody",
              is_profile_private: true, home_city: "SECRET CITY", email: "secret@example.invalid", avatar_path: null,
            }], error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  globalThis.__realtimeDb = db;
  return state;
}
function responseFixture() {
  const request = new EventEmitter();
  request.log = { warn() {}, error() {} };
  const response = new EventEmitter();
  Object.assign(response, {
    frames: [], writableEnded: false, destroyed: false,
    set(headers) { this.headers = headers; },
    flushHeaders() { this.flushed = true; },
    write(frame) { this.frames.push(frame); return true; },
    end() { this.writableEnded = true; this.emit("close"); },
  });
  return { request, response };
}
function insert(channel, id = D, extra = {}) {
  channel.callback({
    new: { id: M, conversation_id: id, sender_id: B, body: "Hola", created_at: TIME, secret_metadata: "NEVER", ...extra },
    old: {}, schema: "public", table: "chat_messages", commit_timestamp: "PRIVATE",
  });
}

test("SSE route authenticates, validates and authorizes before opening headers", { timeout: 5000 }, async t => {
  const state = fixture();
  const app = express();
  app.use((req, _res, next) => { req.log = { warn() {}, error() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/chat/conversations/`;
  try {
    for (const [title, conversation, user, status] of [
      ["unauthenticated", D, null, 401],
      ["invalid UUID", "bad-id", A, 400],
      ["unrelated direct user", D, C, 403],
      ["activity nonmember", G, C, 403],
      ["missing conversation", M, A, 404],
    ]) await t.test(title, async () => {
      const result = await fetch(`${url}${conversation}/events`, { headers: user ? { "x-test-user": user } : {} });
      assert.equal(result.status, status);
      assert.match(result.headers.get("content-type"), /application\/json/);
      assert.ok((await result.json()).code);
      assert.equal(state.channels.length, 0);
    });
    for (const id of [D, G]) await t.test(`authorized stream ${id}`, async () => {
      const abort = new AbortController();
      const result = await fetch(`${url}${id}/events`, { headers: { "x-test-user": A }, signal: abort.signal });
      assert.equal(result.status, 200);
      assert.match(result.headers.get("content-type"), /^text\/event-stream/);
      assert.equal(result.headers.get("cache-control"), "no-cache, no-transform");
      assert.equal(result.headers.get("x-accel-buffering"), "no");
      const reader = result.body.getReader();
      assert.match(new TextDecoder().decode((await reader.read()).value), /event: ready/);
      abort.abort();
      await reader.cancel().catch(() => {});
    });
  } finally {
    const cleaned = new Promise(resolve => {
      state.onRemoved = () => { if (state.removed.length === state.channels.length) resolve(); };
      state.onRemoved();
    });
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await cleaned;
  }
  assert.equal(state.channels.length, state.removed.length);
  assert.equal(state.timers.size, 0);
});

test("one filtered INSERT listener per connection; safe presentation and authorization per event", async () => {
  const state = fixture();
  const { request, response } = responseFixture();
  streamChatEvents(request, response, D, A);
  const channel = state.channels[0];
  assert.equal(channel.kind, "postgres_changes");
  assert.deepEqual(channel.filter, { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${D}` });
  assert.equal(state.channels.length, 1);
  assert.equal(state.timers.size, 1);
  insert(channel); await tick(); await tick();
  const frame = response.frames.find(f => f.startsWith("event: chat_message"));
  assert.ok(frame);
  const safe = JSON.parse(frame.split("data: ")[1]);
  assert.deepEqual(Object.keys(safe).sort(), ["body", "conversationId", "createdAt", "id", "sender", "senderId"]);
  assert.deepEqual(safe.sender, { id: B, username: "safe-user", displayName: null, avatarUrl: null });
  assert.equal(safe.body, "Hola");
  assert.doesNotMatch(frame, /SECRET|NEVER|PRIVATE|secret_metadata|commit_timestamp|email|home_city/);
  assert.equal(state.checks, 2);
  const timer = [...state.timers][0];
  assert.equal(timer.ms, 20000); timer.callback();
  assert.equal(response.frames.at(-1), ": ping\n\n");
  response.emit("close");
  assert.equal(state.removed.length, 1);
  assert.equal(state.timers.size, 0);
  assert.equal(response.listenerCount("close"), 0);
  assert.equal(response.listenerCount("error"), 0);
  assert.equal(request.listenerCount("aborted"), 0);
  insert(channel); await tick();
  assert.equal(state.checks, 2);
});

test("removed activity member receives access_revoked, not the inserted message", async () => {
  const state = fixture();
  const { request, response } = responseFixture();
  streamChatEvents(request, response, G, A);
  state.member = false;
  insert(state.channels[0], G); await tick(); await tick();
  assert.match(response.frames.join(""), /event: access_revoked/);
  assert.doesNotMatch(response.frames.join(""), /chat_message|Hola/);
  assert.equal(response.writableEnded, true);
  assert.equal(state.removed.length, 1);
  assert.equal(state.timers.size, 0);
});

test("membership is checked again after asynchronous profile presentation", async () => {
  const state = fixture();
  const { request, response } = responseFixture();
  streamChatEvents(request, response, G, A);
  state.duringProfiles = () => { state.member = false; };
  insert(state.channels[0], G); await tick(); await tick();
  assert.equal(state.checks, 2);
  assert.match(response.frames.join(""), /access_revoked/);
  assert.doesNotMatch(response.frames.join(""), /event: chat_message/);
});

test("channel failures/timeout/closure, abort and DB failure clean up exactly once", async () => {
  for (const reason of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED", "abort", "db"]) {
    const state = fixture();
    const { request, response } = responseFixture();
    streamChatEvents(request, response, D, A);
    if (reason === "abort") request.emit("aborted");
    else if (reason === "db") { state.fail = true; insert(state.channels[0]); await tick(); await tick(); }
    else state.channels[0].status(reason);
    response.emit("close");
    assert.equal(response.writableEnded, true, reason);
    assert.equal(state.removed.length, 1, reason);
    assert.equal(state.timers.size, 0, reason);
  }
});

test("channel names are unique; slow clients and event bursts have bounded cleanup", async () => {
  const state = fixture();
  const first = responseFixture(), second = responseFixture();
  streamChatEvents(first.request, first.response, D, A);
  streamChatEvents(second.request, second.response, D, A);
  assert.notEqual(state.channels[0].name, state.channels[1].name);
  first.response.write = () => false;
  [...state.timers][0].callback();
  assert.equal(first.response.writableEnded, true);
  for (let i = 0; i < 101; i++) insert(state.channels[1]);
  await tick();
  assert.equal(second.response.writableEnded, true);
  assert.equal(state.removed.length, 2);
  assert.equal(state.timers.size, 0);
});
