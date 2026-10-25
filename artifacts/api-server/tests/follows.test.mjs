// Isolated tests of the real router/client. No Supabase calls, SQL or real writes.
// Run: node --test artifacts/api-server/tests/follows.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import Module from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const compiled = await build({
  stdin: { contents: 'export { default as router } from "./src/routes/follows";', resolveDir: root },
  bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  plugins: [{
    name: "isolate-auth-and-supabase",
    setup(bundler) {
      bundler.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id = req.get("x-test-user"); if (id === "broken-session") throw new Error("session failed"); return id ? {user:{id}} : null; }',
        loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export function getSupabaseAdmin() { return globalThis.__followsTestDb; }",
        loader: "js",
      }));
    },
  }],
});
const compiledModule = new Module(`${root}tests/isolated-follows.cjs`);
compiledModule.paths = Module._nodeModulePaths(root);
compiledModule._compile(compiled.outputFiles[0].text, `${root}tests/isolated-follows.cjs`);
const { router } = compiledModule.exports;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function profile(id, extra = {}) {
  return {
    id, username: id[0], email: "never-return@example.invalid",
    display_name: "Friends only", display_name_visibility: "friends",
    is_profile_private: true, home_city: "Private city", avatar_path: null, ...extra,
  };
}

function fakeDb() {
  let sequence = 0;
  const tables = {
    profiles: [profile(A, { display_name_visibility: "everyone", is_profile_private: false }), profile(B), profile(C)],
    user_follows: [],
    connections: [],
  };
  const db = {
    tables, errors: {}, signed: [], signingError: false,
    storage: {
      from(bucket) {
        assert.equal(bucket, "avatars");
        return {
          async createSignedUrls(paths, expires) {
            assert.equal(expires, 3600);
            db.signed.push(...paths);
            return db.signingError
              ? { data: null, error: { message: "signing failed" } }
              : { data: [...paths].reverse().map((path) => ({ path, signedUrl: `https://signed.invalid/${path}` })), error: null };
          },
        };
      },
    },
    from(table) {
      assert.ok(Object.hasOwn(tables, table));
      let operation = "read", fields = "*", options = {}, values, single = false;
      let start = 0, end = 999;
      const predicates = [], orders = [];
      const q = {
        select(input = "*", opts = {}) { fields = input; options = opts; return q; },
        eq(field, value) { predicates.push((row) => row[field] === value); return q; },
        in(field, values) { predicates.push((row) => values.includes(row[field])); return q; },
        order(field, options) { orders.push([field, options]); return q; },
        range(first, last) { start = first; end = last; return q; },
        maybeSingle() { single = true; return q; },
        insert(data) { operation = "insert"; values = data; return q; },
        delete() { operation = "delete"; return q; },
        then(resolve, reject) {
          try {
            if (db.errors[table]) {
              return Promise.resolve({ data: null, count: null, error: db.errors[table] }).then(resolve, reject);
            }
            let rows = tables[table].filter((row) => predicates.every((predicate) => predicate(row)));
            if (operation === "insert") {
              assert.equal(table, "user_follows", "Connections must never be modified");
              assert.deepEqual(Object.keys(values).sort(), ["followed_id", "follower_id"]);
              if (tables.user_follows.some((row) => row.follower_id === values.follower_id && row.followed_id === values.followed_id)) {
                return Promise.resolve({ data: null, error: { code: "23505" } }).then(resolve, reject);
              }
              const n = ++sequence;
              tables.user_follows.push({
                id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
                created_at: new Date(n * 1000).toISOString(), ...values,
              });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (operation === "delete") {
              assert.equal(table, "user_follows", "Connections must never be modified");
              tables[table] = tables[table].filter((row) => !rows.includes(row));
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            const count = options.count === "exact" ? rows.length : null;
            rows.sort((a, b) => {
              for (const [field, { ascending = true }] of orders) {
                if (a[field] === b[field]) continue;
                return (a[field] < b[field] ? -1 : 1) * (ascending ? 1 : -1);
              }
              return 0;
            });
            rows = rows.slice(start, end + 1);
            const selected = rows.map((row) => fields === "*" ? { ...row } :
              Object.fromEntries(fields.split(",").map((key) => [key, row[key]])));
            return Promise.resolve({
              data: options.head ? null : single ? selected[0] ?? null : selected,
              count, error: null,
            }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return q;
    },
  };
  return db;
}

test("Followers API: authorization, independent follows, counts, lists and privacy", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {}, error() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/follows`;
  async function call(viewer, path, method = "GET", body) {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(viewer ? { "x-test-user": viewer } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }
  function reset() {
    const db = fakeDb();
    globalThis.__followsTestDb = db;
    return db;
  }
  try {
    await t.test("all endpoints authenticate and validate targets; target must exist", async () => {
      const db = reset();
      for (const [path, method] of [[`/with/${B}`, "GET"], [`/${B}`, "POST"], [`/${B}`, "DELETE"], [`/${B}/followers`, "GET"], [`/${B}/following`, "GET"]]) {
        assert.equal((await call(null, path, method)).body.code, "authentication_required");
        assert.equal((await call("broken-session", path, method)).status, 401);
        const invalid = await call(A, path.replace(B, "bad-id"), method);
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.code, "invalid_target");
      }
      assert.equal((await call(A, `/${A.toUpperCase()}`, "POST")).body.code, "self_follow");
      for (const path of [`/with/${D}`, `/${D}/followers`, `/${D}/following`]) {
        assert.equal((await call(A, path)).body.code, "user_not_found");
      }
      assert.equal((await call(A, `/${D}`, "POST")).status, 404);
      assert.equal(db.tables.user_follows.length, 0);
    });

    await t.test("idempotent follow/unfollow, spoofing denied, both directions independent", async () => {
      const db = reset();
      assert.deepEqual((await call(A, `/${B.toUpperCase()}`, "POST", { follower_id: C, followed_id: A })).body, { following: true });
      assert.equal(db.tables.user_follows[0].follower_id, A);
      assert.equal(db.tables.user_follows[0].followed_id, B);
      assert.equal((await call(A, `/${B}`, "POST")).status, 200);
      assert.equal(db.tables.user_follows.length, 1);
      assert.deepEqual((await call(A, `/with/${B}`)).body, {
        isFollowing: true, followsYou: false, followersCount: 1, followingCount: 0,
      });
      await call(B, `/${A}`, "POST");
      await call(C, `/${B}`, "POST");
      assert.deepEqual((await call(A, `/with/${B}`)).body, {
        isFollowing: true, followsYou: true, followersCount: 2, followingCount: 1,
      });
      assert.deepEqual((await call(A, `/with/${A}`)).body, {
        isFollowing: false, followsYou: false, followersCount: 1, followingCount: 1,
      });
      assert.deepEqual((await call(A, `/${B}/followers`)).body.profiles.map((p) => p.id), [C, A]);
      assert.deepEqual((await call(A, `/${B}/following`)).body.profiles.map((p) => p.id), [A]);
      assert.deepEqual((await call(A, `/${B}`, "DELETE", { follower_id: C })).body, { following: false });
      assert.equal((await call(A, `/${B}`, "DELETE")).status, 200);
      assert.equal((await call(A, `/${D}`, "DELETE")).status, 200);
      assert.deepEqual((await call(A, `/with/${B}`)).body, {
        isFollowing: false, followsYou: true, followersCount: 1, followingCount: 1,
      });
      assert.ok(db.tables.user_follows.some((row) => row.follower_id === C && row.followed_id === B));
      assert.ok(db.tables.user_follows.some((row) => row.follower_id === B && row.followed_id === A));
      assert.deepEqual(db.tables.connections, []);
      await call(A, `/${B}`, "POST");
      assert.equal(db.tables.user_follows.length, 3);
    });

    await t.test("following never unlocks private data; only viewer's accepted connection does", async () => {
      const db = reset();
      await call(A, `/${B}`, "POST");
      await call(B, `/${C}`, "POST");
      const hidden = (await call(A, `/${A}/following`)).body.profiles[0];
      assert.equal(hidden.displayName, null);
      assert.equal(hidden.city, null);
      assert.deepEqual(Object.keys(hidden).sort(), ["avatarUrl", "city", "displayName", "id", "username"]);
      const connection = { id: D, requester_id: B, addressee_id: A, status: "pending" };
      db.tables.connections.push(connection);
      assert.equal((await call(A, `/${A}/following`)).body.profiles[0].displayName, null);
      connection.status = "accepted";
      const allowed = (await call(A, `/${A}/following`)).body.profiles[0];
      assert.equal(allowed.displayName, "Friends only");
      assert.equal(allowed.city, "Private city");
      // Acceptance works in either direction and is unrelated to the list owner.
      connection.requester_id = A;
      connection.addressee_id = B;
      assert.equal((await call(A, `/${C}/followers`)).body.profiles[0].displayName, "Friends only");
      assert.equal((await call(C, `/${A}/following`)).body.profiles[0].displayName, null);
      for (const visibility of ["nobody", "shared_activity"]) {
        db.tables.profiles[1].display_name_visibility = visibility;
        assert.equal((await call(A, `/${A}/following`)).body.profiles[0].displayName, null);
      }
      db.tables.connections.length = 0;
      db.tables.profiles[1].display_name_visibility = "everyone";
      const publicName = (await call(A, `/${A}/following`)).body.profiles[0];
      assert.equal(publicName.displayName, "Friends only");
      assert.equal(publicName.city, null);
      db.tables.profiles[1].is_profile_private = false;
      assert.equal((await call(A, `/${A}/following`)).body.profiles[0].city, "Private city");
    });

    await t.test("private avatars use canonical signed paths and gracefully handle signing errors", async () => {
      const db = reset();
      db.tables.profiles[1].avatar_path = "untrusted/stored/path";
      db.tables.profiles[2].avatar_path = "another/untrusted/path";
      await call(A, `/${B}`, "POST");
      await call(A, `/${C}`, "POST");
      const result = (await call(A, `/${A}/following`)).body.profiles;
      for (const p of result) {
        assert.equal(p.avatarUrl, `https://signed.invalid/${p.id}/avatar.webp`);
        assert.equal(p.city, null);
      }
      assert.deepEqual(db.signed.sort(), [`${B}/avatar.webp`, `${C}/avatar.webp`]);
      db.signingError = true;
      assert.ok((await call(A, `/${A}/following`)).body.profiles.every((p) => p.avatarUrl === null));
    });

    await t.test("exact counts and complete stable lists beyond PostgREST's default row cap", async () => {
      const db = reset();
      for (let n = 0; n < 1005; n++) {
        const id = `10000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
        db.tables.profiles.push(profile(id, { username: `follower${n}` }));
        db.tables.user_follows.push({ id, follower_id: id, followed_id: B, created_at: "2026-01-01T00:00:00Z" });
      }
      const result = await call(A, `/${B}/followers`);
      assert.equal(result.status, 200);
      assert.equal(result.body.profiles.length, 1005);
      assert.equal(new Set(result.body.profiles.map((p) => p.id)).size, 1005);
      assert.equal((await call(A, `/with/${B}`)).body.followersCount, 1005);
      assert.ok(result.body.profiles.every((p) => p.city === null && p.displayName === null));
    });

    await t.test("missing follows returns 503; other failures are generic and privacy fails closed", async () => {
      const db = reset();
      for (const code of ["42P01", "PGRST205"]) {
        db.errors.user_follows = { code, message: "internal database details" };
        for (const [path, method] of [[`/with/${B}`, "GET"], [`/${B}`, "POST"], [`/${B}`, "DELETE"], [`/${B}/followers`, "GET"], [`/${B}/following`, "GET"]]) {
          const result = await call(A, path, method);
          assert.equal(result.status, 503);
          assert.equal(result.body.code, "follows_migration_required");
          assert.ok(!JSON.stringify(result.body).includes("internal"));
        }
      }
      db.errors.user_follows = { code: "42501", message: "internal" };
      assert.equal((await call(A, `/with/${B}`)).body.code, "follows_unavailable");
      delete db.errors.user_follows;
      await call(A, `/${B}`, "POST");
      db.errors.connections = { code: "42P01" };
      const result = await call(A, `/${A}/following`);
      assert.equal(result.status, 500);
      assert.equal(result.body.code, "follows_unavailable");
      assert.equal(result.body.profiles, undefined);
      delete db.errors.connections;
      db.errors.profiles = { code: "42501" };
      assert.equal((await call(A, `/${B}`, "POST")).status, 500);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.__followsTestDb;
  }
});

test("Follows client: correct requests; only successful mutations emit the event", async () => {
  const compiled = await build({
    entryPoints: [`${root}../outfy/src/follows/follows-api.ts`],
    bundle: true, platform: "browser", format: "esm", write: false,
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
  const calls = [];
  let fail = false, events = 0;
  globalThis.window = new EventTarget();
  window.addEventListener(api.FOLLOWS_CHANGED_EVENT, () => events++);
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: !fail, status: fail ? 503 : 200,
      json: async () => fail ? { error: "Unavailable", code: "follows_migration_required" }
        : options.method === "POST" ? { following: true }
        : options.method === "DELETE" ? { following: false }
        : { profiles: [], isFollowing: false, followsYou: false, followersCount: 0, followingCount: 0 },
    };
  };
  try {
    await api.getFollowRelationship(B);
    await api.getFollowers(B);
    await api.getFollowing(B);
    assert.equal(events, 0);
    assert.deepEqual(calls.map((c) => c.url), [`/api/follows/with/${B}`, `/api/follows/${B}/followers`, `/api/follows/${B}/following`]);
    assert.deepEqual(await api.followUser(B), { following: true });
    assert.deepEqual(await api.unfollowUser(B), { following: false });
    assert.equal(events, 2);
    assert.deepEqual(calls.slice(-2).map((c) => c.options.method), ["POST", "DELETE"]);
    for (const { options } of calls) {
      assert.equal(options.credentials, "include");
      assert.equal(options.body, undefined);
    }
    fail = true;
    for (const operation of [api.followUser, api.unfollowUser]) {
      await assert.rejects(() => operation(B), (error) =>
        error instanceof api.FollowsApiError && error.status === 503 && error.code === "follows_migration_required");
    }
    assert.equal(events, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
