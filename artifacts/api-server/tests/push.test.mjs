// Actual API/helper/worker/client code with in-memory DB and Web Push doubles.
// No real accounts, credentials, migrations or external delivery.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// Public NIST P-256 generator point, not a VAPID key pair or real subscription.
const publicPoint = Buffer.from("04" +
  "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296" +
  "4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", "hex").toString("base64url");
const keys = { p256dh: publicPoint, auth: Buffer.alloc(16, 7).toString("base64url") };
const endpoint = name => `https://fcm.googleapis.com/fcm/send/test-only-${name}`;
globalThis.__pushConfig = null;
globalThis.__pushWarnings = [];
globalThis.__pushSend = async () => {};

async function bundle(contents, options = {}) {
  const output = await build({
    stdin: { contents, resolveDir: root }, bundle: true, platform: "node",
    format: "cjs", write: false, external: ["express"], ...options,
    plugins: [{ name: "push-doubles", setup(bundler) {
      bundler.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req){const id=req.get("x-test-user");return id?{user:{id}}:null}', loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export const getSupabaseAdmin=()=>globalThis.__pushDb;", loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger={warn:(...args)=>globalThis.__pushWarnings.push(args)};", loader: "js",
      }));
      if (!options.realConfig) bundler.onLoad({ filter: /\/lib\/push-config\.ts$/ }, () => ({
        contents: "export const getPushConfiguration=()=>globalThis.__pushConfig;", loader: "js",
      }));
      bundler.onLoad({ filter: /\/web-push\/src\/index\.js$/ }, () => ({
        contents: "export const sendNotification=(...args)=>globalThis.__pushSend(...args);", loader: "js",
      }));
    } }],
  });
  const mod = new Module(`${root}tests/push-isolated.cjs`);
  mod.paths = Module._nodeModulePaths(root);
  mod._compile(output.outputFiles[0].text, `${root}tests/push-isolated.cjs`);
  return mod.exports;
}
const { router, sendPushToUser, createNotification, isPushEndpoint } = await bundle(`
  export {default as router} from "./src/routes/push";
  export {sendPushToUser} from "./src/lib/push-delivery";
  export {createNotification} from "./src/lib/notifications";
  export {isPushEndpoint} from "./src/lib/push-validation";`);

function fakeDb() {
  let sequence = 0;
  const db = {
    tables: {
      push_subscriptions: [], notifications: [],
      profiles: [
        { id: A, username: "alice", notify_connections: true, notify_activities: true },
        { id: B, username: "bob", display_name_visibility: "everyone", display_name: "Bob" },
      ],
      connections: [], activities: [], activity_members: [], activity_invitations: [],
    },
    fail: {},
    from(table) {
      let op = "read", values, single = false, limit = Infinity, orderKey;
      const predicates = [];
      const q = {
        select() { return q; }, abortSignal() { return q; },
        eq(k,v) { predicates.push(row => row[k] === v); return q; },
        gt(k,v) { predicates.push(row => row[k] > v); return q; },
        order(k) { orderKey=k; return q; },
        in(k,v) { predicates.push(row => v.includes(row[k])); return q; },
        limit(n) { limit=n; return q; },
        maybeSingle() { single = true; return q; },
        insert(v) { op = "insert"; values = v; return q; },
        update(v) { op = "update"; values = v; return q; },
        delete() { op = "delete"; return q; },
        then(resolve, reject) {
          const result = (() => {
            if (db.fail[table]) return { data: null, error: { code: db.fail[table], message: "sensitive raw error" } };
            if (op === "insert") {
              if (db.tables[table].some(row =>
                (table === "push_subscriptions" && row.endpoint === values.endpoint) ||
                (table === "notifications" && values.dedupe_key && row.dedupe_key === values.dedupe_key))) {
                return { data: null, error: { code: "23505" } };
              }
              const row = { id: `test-row-${++sequence}`, created_at: new Date().toISOString(), ...values };
              db.tables[table].push(row);
              return { data: single ? { ...row } : [{ ...row }], error: null };
            }
            let rows = db.tables[table].filter(row => predicates.every(fn => fn(row)));
            if (orderKey) rows.sort((a,b) => String(a[orderKey]).localeCompare(String(b[orderKey])));
            rows = rows.slice(0, limit);
            if (op === "update") rows.forEach(row => Object.assign(row, values));
            if (op === "delete") db.tables[table] = db.tables[table].filter(row => !rows.includes(row));
            rows = rows.map(row => ({ ...row }));
            return { data: single ? rows[0] ?? null : rows, error: null };
          })();
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return db;
}
function reset() {
  globalThis.__pushDb = fakeDb();
  // Sentinels only; the delivery stub never signs or sends a request.
  globalThis.__pushConfig = { publicKey: "test-public", privateKey: "not-a-real-key", subject: "mailto:test@example.invalid" };
  globalThis.__pushWarnings = [];
  globalThis.__pushSend = async () => {};
  return globalThis.__pushDb;
}
async function withApi(callback) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const call = async (path, { user = A, method = "GET", body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/push/${path}`, {
      method, headers: { ...(user ? { "x-test-user": user } : {}), "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  try { await callback(call); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
const row = type => ({ id: "event-1", type, actor_id: B, activity_id: null, metadata: {},
  read_at: null, created_at: new Date().toISOString() });
const device = (name, user = A) => ({ id: name, user_id: user, endpoint: endpoint(name),
  ...keys, updated_at: "2026-01-01T00:00:00.000Z" });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("push endpoints authenticate, validate/bound input and expose no private configuration", async () => {
  const db = reset();
  await withApi(async call => {
    for (const [path, method] of [["status","GET"],["public-key","GET"],["subscriptions","POST"],["subscriptions","DELETE"]]) {
      assert.equal((await call(path, { user: null, method })).status, 401);
    }
    assert.deepEqual((await call("public-key")).data, { publicKey: "test-public" });
    assert.deepEqual((await call("status")).data, { configured: true, subscribed: false });
    for (const body of [
      {}, { endpoint: endpoint("a"), keys: {} },
      { endpoint: endpoint("a"), keys, user_id: B },
      { endpoint: "http://localhost/internal", keys },
      { endpoint: "https://127.0.0.1/secret", keys },
      { endpoint: "https://evil.test/private", keys },
      { endpoint: `${endpoint("a")}${"x".repeat(2048)}`, keys },
      { endpoint: endpoint("a"), keys: { ...keys, auth: "!" } },
      { endpoint: endpoint("a"), keys: { ...keys, p256dh: Buffer.alloc(65, 4).toString("base64url") } },
    ]) assert.equal((await call("subscriptions", { method: "POST", body })).status, 400);
    assert.equal(db.tables.push_subscriptions.length, 0);
    db.fail.push_subscriptions = "PGRST205";
    assert.equal((await call("status")).data.code, "push_migration_required");
  });
  for (const bad of ["https://fcm.googleapis.com.evil.test/path", "https://user:pass@fcm.googleapis.com/path",
    "https://fcm.googleapis.com:8443/path", "https://fcm.googleapis.com/path#fragment", "//fcm.googleapis.com/path"]) {
    assert.equal(isPushEndpoint(bad), false);
  }
  assert.equal(isPushEndpoint("https://wns2-test.notify.windows.com/?token=test-only"), true);
  assert.equal(isPushEndpoint("https://web.push.apple.com/test-only"), true);
  assert.equal(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test-only"), true);
  assert.equal(isPushEndpoint(`${endpoint("unicode")}/é`), false);
});

test("subscriptions are unique/multi-device/owned; cross-account reassignment requires matching browser keys", async () => {
  const db = reset();
  await withApi(async call => {
    const body = { endpoint: endpoint("a"), keys };
    for (let i = 0; i < 2; i++) assert.equal((await call("subscriptions", { method: "POST", body })).status, 200);
    assert.equal(db.tables.push_subscriptions.length, 1);
    assert.equal(db.tables.push_subscriptions[0].user_id, A);
    await call("subscriptions", { method: "POST", body: { endpoint: endpoint("b"), keys } });
    assert.equal(db.tables.push_subscriptions.length, 2);
    const status = () => `status?${new URLSearchParams({ endpoint: body.endpoint })}`;
    assert.equal((await call(status())).data.subscribed, true);
    assert.equal((await call(status(), { user: B })).data.subscribed, false);
    await call("subscriptions", { user: B, method: "DELETE", body: { endpoint: body.endpoint } });
    assert.equal(db.tables.push_subscriptions.length, 2);
    const wrongKeys = { ...keys, auth: Buffer.alloc(16, 8).toString("base64url") };
    assert.equal((await call("subscriptions", { user: B, method: "POST", body: { ...body, keys: wrongKeys } })).status, 409);
    assert.equal(db.tables.push_subscriptions[0].user_id, A);
    assert.equal((await call("subscriptions", { user: B, method: "POST", body })).status, 200);
    assert.equal(db.tables.push_subscriptions[0].user_id, B);
    await call("subscriptions", { method: "DELETE", body: { endpoint: body.endpoint } });
    assert.equal(db.tables.push_subscriptions.length, 2);
    await call("subscriptions", { user: B, method: "DELETE", body: { endpoint: body.endpoint } });
    assert.equal(db.tables.push_subscriptions.length, 1);
  });
});

test("missing VAPID disables public-key/registration/delivery without disabling owned deletion", async () => {
  const db = reset();
  db.tables.push_subscriptions.push(device("a"));
  globalThis.__pushConfig = null;
  globalThis.__pushSend = () => { throw new Error("Must never send"); };
  await withApi(async call => {
    assert.deepEqual((await call("status")).data, { configured: false, subscribed: false });
    assert.equal((await call("public-key")).data.code, "push_not_configured");
    assert.equal((await call("subscriptions", { method: "POST", body: { endpoint: endpoint("a"), keys } })).status, 503);
    assert.equal((await call("subscriptions", { method: "DELETE", body: { endpoint: endpoint("a") } })).status, 200);
  });
  assert.deepEqual(await sendPushToUser(A, row("connection_request")), { sent: 0, failed: 0, removed: 0 });
});

test("delivery fans out only to recipient devices; 404/410 removed, temporary errors retained, logs sanitized", async () => {
  const db = reset();
  db.tables.push_subscriptions.push(...["ok","gone","missing","temporary","forbidden"].map(name => device(name)), device("foreign", B));
  const delivered = [];
  globalThis.__pushSend = async (subscription, payload, options) => {
    delivered.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
    const status = subscription.endpoint.endsWith("gone") ? 410 : subscription.endpoint.endsWith("missing") ? 404
      : subscription.endpoint.endsWith("temporary") ? 503 : subscription.endpoint.endsWith("forbidden") ? 403 : null;
    if (status) throw { statusCode: status, body: "secret provider response", endpoint: subscription.endpoint };
  };
  assert.deepEqual(await sendPushToUser(A, row("connection_request")), { sent: 1, failed: 4, removed: 2 });
  assert.equal(delivered.length, 5);
  assert.match(delivered[0].payload.body, /@bob sent you a friend request/);
  assert.equal(delivered[0].payload.url, "/users/bob");
  assert.equal(delivered[0].options.timeout, 4000);
  assert.deepEqual(db.tables.push_subscriptions.map(d => d.id).sort(), ["forbidden", "foreign", "ok", "temporary"]);
  const logs = JSON.stringify(globalThis.__pushWarnings);
  assert.doesNotMatch(logs, /secret provider|fcm.googleapis|not-a-real-key/);
});

test("expired cleanup does not remove a concurrently refreshed or reassigned subscription", async () => {
  const db = reset();
  db.tables.push_subscriptions.push(device("refresh"), device("reassign"));
  globalThis.__pushSend = async subscription => {
    const current = db.tables.push_subscriptions.find(d => d.endpoint === subscription.endpoint);
    if (current.id === "refresh") current.updated_at = "2026-02-01T00:00:00.000Z";
    else current.user_id = B;
    throw { statusCode: 410 };
  };
  const result = await sendPushToUser(A, row("connection_request"));
  assert.equal(result.removed, 0);
  assert.equal(db.tables.push_subscriptions.length, 2);
});

test("delivery cursor pagination attempts every recipient device beyond a single page", async () => {
  const db = reset();
  for (let index=0; index<205; index++) db.tables.push_subscriptions.push(device(`device-${String(index).padStart(4,"0")}`));
  db.tables.push_subscriptions.push(device("foreign", B));
  const endpoints = new Set();
  globalThis.__pushSend = async subscription => { endpoints.add(subscription.endpoint); };
  const result = await sendPushToUser(A, row("connection_request"));
  assert.equal(result.sent, 205);
  assert.equal(endpoints.size, 205);
  assert.equal(endpoints.has(endpoint("foreign")), false);
});

test("new internal events alone trigger push; preferences/dedupe/reserved events and failures stay safe", async () => {
  const db = reset();
  db.tables.push_subscriptions.push(device("a"));
  const sends = [];
  globalThis.__pushSend = async (_subscription, payload) => { sends.push(JSON.parse(payload)); throw { statusCode: 503 }; };
  const input = { recipientId: A, actorId: B, type: "connection_request", dedupeKey: "same-event" };
  await createNotification(input); await flush();
  assert.equal(db.tables.notifications.length, 1);
  assert.equal(sends.length, 1);
  await createNotification(input); await flush();
  assert.equal(sends.length, 1);
  db.tables.profiles[0].notify_connections = false;
  await createNotification({ ...input, dedupeKey: "opted-out" }); await flush();
  assert.equal(db.tables.notifications.length, 1);
  db.fail.push_subscriptions = "PGRST205";
  db.tables.profiles[0].notify_connections = true;
  await assert.doesNotReject(() => createNotification({ ...input, dedupeKey: "storage-failed" }));
  assert.equal(db.tables.notifications.length, 2);
  delete db.fail.push_subscriptions;
  for (const type of ["activity_reminder", "chat_message"]) await sendPushToUser(A, row(type));
  assert.equal(sends.length, 1);
  for (const type of ["connection_accepted", "activity_invitation", "activity_invitation_accepted", "activity_invitation_declined"]) {
    await sendPushToUser(A, row(type));
  }
  assert.equal(sends.length, 5);
  assert.equal(sends[4].url, "/"); // No accessible activity: no hidden id in payload.
});

test("actual VAPID configuration fails closed when absent; warning contains no key values", async () => {
  // Compile-time substitutions avoid reading any real runtime credentials.
  const output = await build({
    stdin: { contents: 'export {getPushConfiguration} from "./src/lib/push-config";', resolveDir: root },
    bundle: true, platform: "node", format: "cjs", write: false,
    define: { "process.env.VAPID_PUBLIC_KEY": "undefined", "process.env.VAPID_PRIVATE_KEY": "undefined",
      "process.env.VAPID_SUBJECT": "undefined" },
    plugins: [{ name: "logger-only", setup(bundler) {
      bundler.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger={warn:(...args)=>globalThis.__pushWarnings.push(args)};", loader: "js",
      }));
    } }],
  });
  const mod = new Module(`${root}tests/push-config-isolated.cjs`);
  mod._compile(output.outputFiles[0].text, `${root}tests/push-config-isolated.cjs`);
  globalThis.__pushWarnings = [];
  assert.equal(mod.exports.getPushConfiguration(), null);
  assert.equal(mod.exports.getPushConfiguration(), null);
  assert.equal(globalThis.__pushWarnings.length, 1);
  assert.match(JSON.stringify(globalThis.__pushWarnings), /push_not_configured/);
});

test("service worker safely parses payloads, respects app base and prevents external/unsafe navigation", async () => {
  const source = await readFile(`${root}../outfy/public/outfy-push-sw.js`, "utf8");
  for (const base of ["/", "/outfy/"]) {
    const events = {};
    const shown = [], opened = [], focused = [], navigated = [];
    const scope = `https://outfy.test${base}`;
    let windows = [];
    const self = {
      registration: { scope, showNotification: async (title, options) => shown.push({ title, options }) },
      clients: { claim: async () => {}, matchAll: async () => windows, openWindow: async url => opened.push(url) },
      skipWaiting: async () => {}, addEventListener: (name, handler) => { events[name] = handler; },
    };
    vm.runInNewContext(source, { self, URL });
    async function push(payload) {
      let pending;
      events.push({ data: { json: () => { if (payload === "malformed") throw new Error(); return payload; } },
        waitUntil: promise => { pending = promise; } });
      await pending;
      return shown.at(-1).options.data.url;
    }
    assert.equal(await push({ body: "An invitation", url: "/activities/plan-id" }), `${scope}activities/plan-id`);
    assert.equal(shown.at(-1).options.icon, `${scope}icon-192.png`);
    assert.equal(shown.at(-1).options.silent, true);
    assert.equal(await push({ url: `${base}users/bob` }), `${scope}users/bob`);
    for (const url of ["https://evil.test/path", "//evil.test/path", "/\\evil.test", "/api/auth/signout",
      "/users/%2f%2fevil.test", "/users/%5cevil", "/users/bob?next=https://evil.test", "/users/%2e%2e/settings"]) {
      assert.equal(await push({ url }), scope, url);
    }
    assert.equal(await push("malformed"), scope);
    assert.equal(shown.at(-1).title, "Outfy");
    assert.equal(await push(null), scope);
    let closed = false, pending;
    windows = [{ url: scope, navigate: async url => { navigated.push(url); return { focus: async () => focused.push(true) }; } }];
    const deliveredUrl = await push({ url: "/users/bob" });
    events.notificationclick({ notification: { data: { url: deliveredUrl }, close: () => { closed = true; } },
      waitUntil: promise => { pending = promise; } });
    await pending;
    assert.equal(closed, true);
    assert.equal(navigated[0], `${scope}users/bob`);
    assert.equal(focused.length, 1);
    assert.equal(opened.length, 0);
    windows = [];
    events.notificationclick({ notification: { data: { url: "https://evil.test" }, close() {} },
      waitUntil: promise => { pending = promise; } });
    await pending;
    assert.equal(opened[0], scope);
  }
});

test("frontend support/base/key conversion/server acknowledgement and sign-out cleanup are guarded", async () => {
  const client = await bundle('export * from "../outfy/src/push/push-api";', {
    define: { "import.meta.env.BASE_URL": '"/outfy/"' },
  });
  const original = { window: globalThis.window, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), fetch: globalThis.fetch };
  const calls = [];
  let unsubscribeCalls = 0, permissionCalls = 0;
  const subscription = { endpoint: endpoint("browser"), options: { applicationServerKey: Buffer.from(publicPoint, "base64url") },
    toJSON: () => ({ endpoint: endpoint("browser"), keys }), unsubscribe: async () => { unsubscribeCalls++; return true; } };
  const registration = { active: {}, pushManager: { getSubscription: async () => subscription } };
  const worker = { register: async (...args) => { calls.push(args); return registration; }, getRegistration: async () => registration };
  try {
    globalThis.window = { location: { origin: "https://outfy.test" }, isSecureContext: true,
      PushManager: class {}, Notification: { requestPermission: () => { permissionCalls++; } } };
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: worker } });
    assert.equal(client.supportsPush(), true);
    assert.equal(await client.registerPushWorker(), registration);
    assert.equal(calls[0][0], "https://outfy.test/outfy/outfy-push-sw.js");
    assert.equal(calls[0][1].scope, "/outfy/");
    assert.equal(permissionCalls, 0);
    assert.equal(client.applicationServerKey(publicPoint).length, 65);
    assert.throws(() => client.applicationServerKey("bad"));
    globalThis.fetch = async (url, options) => {
      calls.push([String(url), options]);
      return new Response(JSON.stringify({ subscribed: options.method === "POST" }), { status: 200 });
    };
    await client.savePushSubscription(subscription);
    assert.equal(calls.at(-1)[0], "/api/push/subscriptions");
    assert.equal(calls.at(-1)[1].credentials, "include");
    assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { endpoint: endpoint("browser"), keys });
    await client.clearPushForSignOut();
    assert.equal(unsubscribeCalls, 1);
    assert.equal(calls.at(-1)[1].method, "DELETE");
    globalThis.fetch = async () => new Response(JSON.stringify({ subscribed: false }));
    await assert.rejects(() => client.savePushSubscription(subscription), /invalid_push_response/);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "push_not_configured" }), { status: 503 });
    await assert.rejects(() => client.getPushPublicKey(), /push_not_configured/);
    await assert.doesNotReject(() => client.clearPushForSignOut());
    delete globalThis.window.PushManager;
    assert.equal(client.supportsPush(), false);
    assert.equal(await client.registerPushWorker(), null);
  } finally {
    globalThis.fetch = original.fetch;
    globalThis.window = original.window;
    if (original.navigator) Object.defineProperty(globalThis, "navigator", original.navigator);
    else delete globalThis.navigator;
  }
});

test("migration is server-only; push translations match ES/EN; worker has no cache or sound behavior", async () => {
  const migration = await readFile(`${root}../../supabase/migrations/20261108180114_push_subscriptions.sql`, "utf8");
  assert.match(migration, /endpoint text not null unique/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all.*from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete.*to service_role/i);
  assert.match(migration, /execute function public\.set_activity_updated_at\(\)/i);
  assert.doesNotMatch(migration, /create policy/i);
  const en = JSON.parse(await readFile(`${root}../outfy/src/i18n/locales/en/common.json`, "utf8")).push;
  const es = JSON.parse(await readFile(`${root}../outfy/src/i18n/locales/es/common.json`, "utf8")).push;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const value of [...Object.values(en), ...Object.values(es)]) assert.equal(typeof value, "string");
  const worker = await readFile(`${root}../outfy/public/outfy-push-sw.js`, "utf8");
  assert.doesNotMatch(worker, /addEventListener\(["']fetch|caches\.|sound\s*:/);
  const frontend = await readFile(`${root}../outfy/src/push/push-api.ts`, "utf8");
  assert.doesNotMatch(frontend, /VAPID_PRIVATE_KEY|SUPABASE_SECRET_KEY|requestPermission\(/);
});
