// Actual Express routes, isolated auth/database/RPC doubles; never touches Supabase.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
const compiled = await build({
  stdin: { contents: 'export {default as router} from "./src/routes/activities";', resolveDir: root },
  bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  plugins: [{
    name: "isolated-review-dependencies",
    setup(bundler) {
      bundler.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id = req.get("x-test-user"); return id ? {user:{id}} : null; }', loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export function getSupabaseAdmin() { return globalThis.__reviewTestDb; }", loader: "js",
      }));
      bundler.onLoad({ filter: /\/lib\/notifications\.ts$/ }, () => ({
        contents: "export async function createNotification() {} export async function notifyInvitationResponse() {}", loader: "js",
      }));
    },
  }],
});
const mod = new Module(`${root}tests/reviews-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, `${root}tests/reviews-isolated.cjs`);
const { router } = mod.exports;
const ACTIVITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORGANIZER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PARTICIPANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REVIEW = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function fakeDb() {
  const tables = {
    activities: [{ id: ACTIVITY, creator_id: ORGANIZER, title: "Completed plan", visibility: "public", status: "completed" }],
    activity_members: [
      { activity_id: ACTIVITY, user_id: ORGANIZER, role: "organizer", joined_at: "2020-01-01" },
      { activity_id: ACTIVITY, user_id: PARTICIPANT, role: "participant", joined_at: "2020-01-01" },
    ],
    activity_reviews: [],
    profiles: [ORGANIZER, PARTICIPANT].map(id => ({ id, username: id[0], display_name: "Member", display_name_visibility: "everyone", avatar_path: null })),
  };
  return {
    tables, calls: [], rpcOverride: undefined, rpcError: null, readError: null,
    from(table) {
      const predicates = [];
      let single = false, head = false, housekeeping = false;
      const q = {
        select(_fields, options) { head = options?.head ?? false; return q; },
        // The existing route-wide expiry middleware runs before authentication.
        // Keep it inert in fixtures; this suite tests reviews, not auto-completion.
        update() { housekeeping = true; return q; },
        not() { return q; },
        is() { return q; },
        lte() { return q; },
        eq(key, value) { predicates.push(row => row[key] === value); return q; },
        in(key, values) { predicates.push(row => values.includes(row[key])); return q; },
        order() { return q; },
        maybeSingle() { single = true; return q; },
        then: (resolve, reject) => {
          const rows = (tables[table] ?? []).filter(row => predicates.every(p => p(row)));
          return Promise.resolve({
            data: housekeeping ? [] : head ? null : single ? rows[0] ?? null : rows,
            count: rows.length, error: housekeeping ? null : this.readError,
          }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      this.calls.push({ name, args });
      if (this.rpcError) return { data: null, error: this.rpcError };
      if (this.rpcOverride !== undefined) return { data: this.rpcOverride, error: null };
      assert.equal(name, "upsert_activity_review_as_user");
      const activity = tables.activities.find(row => row.id === args.p_activity_id);
      let result = "saved";
      if (!activity) result = "not_found";
      else if (activity.status === "cancelled") result = "cancelled";
      else if (activity.creator_id === args.p_user_id) result = "organizer_cannot_review";
      else if (activity.status !== "completed") result = "not_finished";
      else if (!tables.activity_members.some(row => row.user_id === args.p_user_id && row.activity_id === args.p_activity_id && row.role === "participant")) result = "not_participant";
      if (result !== "saved") return {
        data: [{ result, review_id: null, rating: null, comment: null, average_rating: null, review_count: null }], error: null,
      };
      let review = tables.activity_reviews.find(row => row.activity_id === args.p_activity_id && row.reviewer_id === args.p_user_id);
      if (!review) {
        review = { id: REVIEW, activity_id: args.p_activity_id, reviewer_id: args.p_user_id, created_at: "2020-01-01T00:00:00Z" };
        tables.activity_reviews.push(review);
      }
      Object.assign(review, { rating: args.p_rating, comment: args.p_comment });
      return { data: [{
        result, review_id: review.id, rating: review.rating, comment: review.comment,
        average_rating: String(review.rating), review_count: String(tables.activity_reviews.length),
      }], error: null };
    },
  };
}

test("review routes complete requests, preserve RPC authorization and expose only own editing data", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { error() {}, warn() {} }; next(); });
  app.use("/api", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/activities/${ACTIVITY}`;
  async function call(user = PARTICIPANT, body = { rating: 5, comment: "  Great plan  " }, method = "PUT") {
    const result = await fetch(base + (method === "PUT" ? "/review" : ""), {
      method, signal: AbortSignal.timeout(1500),
      headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
      ...(method === "PUT" ? { body: JSON.stringify(body) } : {}),
    });
    return { status: result.status, body: await result.json() };
  }
  try {
    await t.test("valid completed participant save returns 200 before timeout, with normalized comment", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      const result = await call();
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { review: { id: REVIEW, rating: 5, comment: "Great plan" }, averageRating: 5, reviewCount: 1 });
      assert.deepEqual(db.calls, [{ name: "upsert_activity_review_as_user", args: {
        p_activity_id: ACTIVITY, p_user_id: PARTICIPANT, p_rating: 5, p_comment: "Great plan",
      } }]);
    });
    await t.test("same participant updates their existing review without duplication", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      const first = await call();
      const updated = await call(PARTICIPANT, { rating: 3, comment: "  " });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.review.id, first.body.review.id);
      assert.equal(updated.body.review.rating, 3);
      assert.equal(updated.body.review.comment, null);
      assert.equal(updated.body.reviewCount, 1);
      assert.equal(db.tables.activity_reviews.length, 1);
      const detail = await call(PARTICIPANT, null, "GET");
      assert.equal(detail.body.activity.canReview, true);
      assert.deepEqual(detail.body.activity.myReview, { rating: 3, comment: null });
      assert.equal(detail.body.activity.reviews[0].rating, 3);
    });
    await t.test("organizer and non-participant receive explicit 403 responses", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      assert.equal((await call(ORGANIZER)).body.code, "organizer_cannot_review");
      assert.equal((await call(OTHER)).body.code, "not_activity_participant");
      assert.equal((await call(ORGANIZER)).status, 403);
      assert.equal((await call(OTHER)).status, 403);
      const detail = await call(ORGANIZER, null, "GET");
      assert.equal(detail.body.activity.canReview, false);
      assert.equal(detail.body.activity.myReview, null);
      assert.equal((await call(OTHER, null, "GET")).status, 404);
    });
    await t.test("authentication and invalid input never invoke RPC", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      assert.equal((await call(null)).status, 401);
      for (const rating of [0, 6, 1.5, "5", null]) assert.equal((await call(PARTICIPANT, { rating })).status, 400);
      assert.equal((await call(PARTICIPANT, { rating: 5, comment: "x".repeat(1001) })).status, 400);
      assert.equal((await call(PARTICIPANT, { rating: 5, comment: {} })).status, 400);
      assert.equal(db.calls.length, 0);
    });
    await t.test("all expected RPC rejections map to the specified status and code", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      for (const [result, status, code] of [
        ["not_found", 404, "activity_not_found"], ["cancelled", 409, "activity_cancelled"],
        ["organizer_cannot_review", 403, "organizer_cannot_review"], ["not_finished", 409, "activity_not_finished"],
        ["not_participant", 403, "not_activity_participant"], ["invalid_rating", 400, "invalid_rating"],
        ["comment_too_long", 400, "comment_too_long"],
      ]) {
        db.rpcOverride = [{ result, review_id: null, rating: null, comment: null, average_rating: null, review_count: null }];
        const response = await call();
        assert.equal(response.status, status, result);
        assert.equal(response.body.code, code, result);
      }
    });
    await t.test("malformed/unexpected RPC payloads and database errors complete with 500", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      for (const data of [null, [], [null], [{}], [{ result: "unknown", review_id: null, rating: null, comment: null, average_rating: null, review_count: null }], [{ result: "saved", review_id: REVIEW, rating: 8, comment: null, average_rating: 5, review_count: 1 }]]) {
        db.rpcOverride = data;
        assert.equal((await call()).status, 500);
      }
      db.rpcError = { code: "XX000" };
      assert.equal((await call()).status, 500);
      db.readError = { code: "XX000" };
      assert.equal((await call()).status, 500);
    });
    await t.test("cancelled and active activities never save; active participant cannot review", async () => {
      const db = fakeDb(); globalThis.__reviewTestDb = db;
      db.tables.activities[0].status = "cancelled";
      assert.equal((await call()).body.code, "activity_cancelled");
      db.tables.activities[0].status = "active";
      assert.equal((await call()).body.code, "activity_not_finished");
      assert.equal((await call(PARTICIPANT, null, "GET")).body.activity.canReview, false);
      assert.equal(db.calls.length, 0);
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("frontend helpers send authenticated review/search contracts and reject failed saves", async () => {
  const output = await build({
    stdin: {
      contents: 'export {saveActivityReview} from "../outfy/src/activities/activity-api"; export {searchConnectionProfiles} from "../outfy/src/connections/connections-api";',
      resolveDir: root,
    },
    bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  });
  const client = new Module(`${root}tests/review-client.cjs`);
  client.paths = Module._nodeModulePaths(root);
  client._compile(output.outputFiles[0].text, `${root}tests/review-client.cjs`);
  const original = globalThis.fetch;
  const calls = [];
  let fail = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(fail ? { error: "Not allowed", code: "organizer_cannot_review" } :
      url.includes("/review") ? { review: { id: REVIEW, rating: 4, comment: "Nice" }, averageRating: 4, reviewCount: 1 } : { profiles: [] }),
    { status: fail ? 403 : 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    assert.equal((await client.exports.saveActivityReview(ACTIVITY, { rating: 4, comment: "Nice" })).review.id, REVIEW);
    assert.equal(calls[0].url, `/api/activities/${ACTIVITY}/review`);
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(calls[0].options.method, "PUT");
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(calls[0].options.body), { rating: 4, comment: "Nice" });
    fail = true;
    await assert.rejects(client.exports.saveActivityReview(ACTIVITY, { rating: 4 }), error => error.status === 403 && error.code === "organizer_cannot_review");
    fail = false;
    await client.exports.searchConnectionProfiles("  Carlos_99  ");
    assert.equal(calls.at(-1).url, "/api/connections/search?query=Carlos_99");
    assert.equal(calls.at(-1).options.credentials, "include");
  } finally { globalThis.fetch = original; }
});

test("review and username-search text has matching nonempty ES/EN leaf keys", async () => {
  function leaves(object, path = "") {
    return Object.entries(object).flatMap(([key, value]) => typeof value === "string"
      ? (assert.ok(value.trim().length), [path + key])
      : leaves(value, `${path}${key}.`)).sort();
  }
  for (const [file, select] of [
    ["activities", value => value.myPlans.review],
    ["common", value => value.connections.search],
  ]) {
    const load = async locale => select(JSON.parse(await readFile(`${root}../outfy/src/i18n/locales/${locale}/${file}.json`, "utf8")));
    assert.deepEqual(leaves(await load("en")), leaves(await load("es")));
  }
});
