// Isolated route tests: no Supabase credentials, network calls to Supabase,
// migrations or real database writes. Run: node --test tests/connections.test.mjs
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
  stdin: {
    contents: 'export { default as router } from "./src/routes/connections"; export { visibleConnectionProfile } from "./src/lib/connections";',
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
  packages: "external",
  plugins: [{
    name: "isolate-auth-and-database",
    setup(bundler) {
      bundler.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id = req.get("x-test-user"); return id ? {user:{id}} : null; }',
        loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export function getSupabaseAdmin() { return globalThis.__connectionsTestDb; }",
        loader: "js",
      }));
    },
  }],
});
const compiledModule = new Module(`${root}tests/isolated.cjs`);
compiledModule.paths = Module._nodeModulePaths(root);
compiledModule._compile(compiled.outputFiles[0].text, `${root}tests/isolated.cjs`);
const { router, visibleConnectionProfile } = compiledModule.exports;
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
let nextId = 0;

function profile(id, extra = {}) {
  return {
    id, username: id[0], display_name: "Hidden name",
    display_name_visibility: "friends", is_profile_private: false,
    home_city: "Zaragoza", home_country_code: "ES", avatar_path: null, ...extra,
  };
}

function fakeDb() {
  const tables = {
    profiles: [profile(A), profile(B), profile(C, { is_profile_private: true })],
    connections: [],
  };
  let race = false;
  const db = {
    tables,
    missingConnections: false,
    raceNextInsert() { race = true; },
    storage: { from() { return { async createSignedUrls() { return { data: [] }; } }; } },
    from(table) {
      let operation = "read", values, single = false, limit = Infinity;
      const predicates = [];
      const q = {
        select() { return q; },
        insert(data) { operation = "insert"; values = data; return q; },
        update(data) { operation = "update"; values = data; return q; },
        delete() { operation = "delete"; return q; },
        eq(key, value) { predicates.push((row) => row[key] === value); return q; },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return q; },
        not(key, _operator, list) {
          const excluded = list.slice(1, -1).split(",");
          predicates.push((row) => !excluded.includes(row[key])); return q;
        },
        or(expression) {
          if (expression.startsWith("and(")) {
            const ids = [...expression.matchAll(/(?:requester_id|addressee_id)\.eq\.([0-9a-f-]+)/g)].map((m) => m[1]);
            predicates.push((row) =>
              (row.requester_id === ids[0] && row.addressee_id === ids[1]) ||
              (row.requester_id === ids[2] && row.addressee_id === ids[3]));
          } else {
            const id = expression.split(".eq.")[1].split(",")[0];
            predicates.push((row) => row.requester_id === id || row.addressee_id === id);
          }
          return q;
        },
        order() { return q; },
        limit(n) { limit = n; return q; },
        single() { single = true; return q; },
        maybeSingle() { single = true; return q; },
        then(resolve, reject) {
          try {
            if (table === "connections" && db.missingConnections) {
              return Promise.resolve({ data: null, error: { code: "PGRST205" } }).then(resolve, reject);
            }
            if (operation === "insert") {
              if (race) {
                race = false;
                tables.connections.push({
                  id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
                  requester_id: values.addressee_id,
                  addressee_id: values.requester_id, status: "pending",
                });
                return Promise.resolve({ data: null, error: { code: "23505" } }).then(resolve, reject);
              }
              const row = {
                id: `00000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
                status: "pending", ...values,
              };
              tables[table].push(row);
              return Promise.resolve({ data: row, error: null }).then(resolve, reject);
            }
            const rows = tables[table].filter((row) => predicates.every((p) => p(row))).slice(0, limit);
            if (operation === "update") rows.forEach((row) => Object.assign(row, values));
            if (operation === "delete") tables[table] = tables[table].filter((row) => !rows.includes(row));
            return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve, reject);
          } catch (error) { return Promise.reject(error).then(resolve, reject); }
        },
      };
      return q;
    },
  };
  return db;
}

test("connections lifecycle, authorization, privacy and race handling", async () => {
  const db = fakeDb();
  globalThis.__connectionsTestDb = db;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/connections`;
  async function call(user, path = "", method = "GET", body) {
    const result = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  }
  try {
    assert.equal((await call(null)).status, 401);
    assert.equal((await call(A, "/requests", "POST", { targetUserId: A })).body.code, "self_request");
    assert.equal((await call(A, "/requests", "POST", { targetUserId: A.toUpperCase() })).body.code, "self_request");
    assert.equal((await call(A, "/requests", "POST", { targetUserId: "invalid" })).status, 400);
    assert.equal((await call(A, "/requests", "POST", { targetUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" })).status, 404);
    const sent = await call(A, "/requests", "POST", { targetUserId: B, requesterId: C });
    assert.equal(sent.status, 201);
    assert.equal(db.tables.connections[0].requester_id, A);
    const id = sent.body.relationship.id;
    assert.equal((await call(A, "/requests", "POST", { targetUserId: B })).body.relationship.id, id);
    assert.equal((await call(B, "/requests", "POST", { targetUserId: A })).body.relationship.direction, "incoming");
    assert.equal(db.tables.connections.length, 1);
    assert.equal((await call(A, `/${id}/accept`, "POST")).status, 409);
    assert.equal((await call(C, `/${id}?action=cancel`, "DELETE")).status, 409);
    assert.equal((await call(B, `/${id}?action=cancel`, "DELETE")).status, 409);
    assert.equal((await call(A, `/${id}?action=reject`, "DELETE")).status, 409);
    assert.equal((await call(A)).body.outgoing.length, 1);
    assert.equal((await call(B)).body.incoming.length, 1);
    assert.equal((await call(A)).body.outgoing[0].profile.displayName, null);
    assert.deepEqual((await call(A, "/suggestions")).body.profiles, []);
    assert.equal((await call(B, `/${id}/accept`, "POST")).body.relationship.status, "accepted");
    assert.ok(db.tables.connections[0].accepted_at);
    assert.equal((await call(A)).body.accepted[0].profile.displayName, "Hidden name");
    assert.equal((await call(B)).body.accepted.length, 1);
    assert.equal((await call(A, `/with/${B}`)).body.relationship.status, "accepted");
    assert.equal((await call(A, "/requests", "POST", { targetUserId: B })).body.code, "already_connected");
    assert.equal((await call(C, `/${id}?action=remove`, "DELETE")).status, 409);
    assert.equal((await call(A, `/${id}?action=cancel`, "DELETE")).status, 409);
    assert.equal((await call(B, `/${id}?action=remove`, "DELETE")).status, 200);
    assert.equal((await call(A)).body.accepted.length, 0);
    assert.equal((await call(B, `/with/${A}`)).body.relationship, null);
    const second = await call(A, "/requests", "POST", { targetUserId: B });
    assert.equal((await call(A, `/${second.body.relationship.id}?action=cancel`, "DELETE")).status, 200);
    const third = await call(A, "/requests", "POST", { targetUserId: B });
    assert.equal((await call(B, `/${third.body.relationship.id}?action=reject`, "DELETE")).status, 200);
    db.raceNextInsert();
    assert.equal((await call(A, "/requests", "POST", { targetUserId: B })).body.relationship.direction, "incoming");
    assert.equal(db.tables.connections.length, 1);
    const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const F = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    db.tables.profiles.push(
      profile(E, { home_city: "Madrid", display_name_visibility: "nobody" }),
      profile(F),
    );
    const suggestions = (await call(A, "/suggestions")).body.profiles;
    assert.deepEqual(suggestions.map((p) => p.id), [F, E]);
    assert.equal(suggestions[1].displayName, null);
    assert.ok(!suggestions.some((p) => p.id === C));
    for (const visibility of ["everyone", "friends", "nobody", "shared_activity"]) {
      const p = profile(C, { is_profile_private: true, display_name_visibility: visibility });
      assert.equal(visibleConnectionProfile(p, false).city, null);
      assert.equal(visibleConnectionProfile(p, true).city, "Zaragoza");
      assert.equal(visibleConnectionProfile(p, true).displayName,
        visibility === "everyone" || visibility === "friends" ? "Hidden name" : null);
    }
    const summary = (await call(A)).body.incoming[0].profile;
    assert.deepEqual(Object.keys(summary).sort(), ["avatarUrl", "city", "displayName", "id", "username"]);
    assert.equal(summary.avatarUrl, null);
    db.missingConnections = true;
    const unavailable = await call(A);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.code, "connections_migration_required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete globalThis.__connectionsTestDb;
  }
});
