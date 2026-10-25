// Pure UI state/cache tests using the already-installed esbuild and React Query.
// No DOM, accounts, API requests, SQL or Supabase access.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const frontend = fileURLToPath(new URL("../../outfy/", import.meta.url));
const requireFrontend = createRequire(`${frontend}package.json`);
const { QueryClient, QueryObserver } = requireFrontend("@tanstack/react-query");
const built = await build({
  entryPoints: [`${frontend}src/follows/follows-state.ts`],
  bundle: true, platform: "node", format: "esm", write: false,
});
const state = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const relationship = {
  isFollowing: false, followsYou: true, followersCount: 0, followingCount: 7,
};
const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

test("confirmed follow changes update only target follower count and never double-count", () => {
  assert.equal(state.confirmedFollowChange(undefined, true), undefined);
  const followed = state.confirmedFollowChange(relationship, true);
  assert.deepEqual(followed, { ...relationship, isFollowing: true, followersCount: 1 });
  assert.equal(relationship.followersCount, 0, "do not mutate cached input");
  assert.equal(state.confirmedFollowChange(followed, true), followed);
  const unfollowed = state.confirmedFollowChange(followed, false);
  assert.deepEqual(unfollowed, relationship);
  assert.equal(state.confirmedFollowChange(unfollowed, false), unfollowed);
  assert.equal(state.confirmedFollowChange({ ...relationship, isFollowing: true }, false).followersCount, 0);
});

test("cache keys separate authenticated viewers, target profiles and list directions", () => {
  const keys = [
    state.followRelationshipKey("A", "B"),
    state.followRelationshipKey("B", "A"),
    state.followRelationshipKey("A", "A"),
    state.followListKey("A", "B", "followers"),
    state.followListKey("A", "B", "following"),
    state.followListKey("B", "B", "followers"),
  ];
  assert.equal(new Set(keys.map(JSON.stringify)).size, keys.length);
  assert.ok(keys.slice(0, 1).every((key) => key[1] === "A"));
});

test("shared relationship consumers deduplicate reads and refresh only their viewer scope", async () => {
  const cache = client();
  let reads = 0;
  let current = relationship;
  const key = state.followRelationshipKey("A", "B");
  const options = { queryKey: key, queryFn: async () => { reads++; return current; }, staleTime: 30_000 };
  const one = new QueryObserver(cache, options);
  const two = new QueryObserver(cache, options);
  const unsubscribeOne = one.subscribe(() => {});
  const unsubscribeTwo = two.subscribe(() => {});
  try {
    await one.refetch();
    assert.equal(reads, 1);
    cache.setQueryData(state.followRelationshipKey("C", "B"), relationship);
    current = { ...relationship, isFollowing: true, followersCount: 1 };
    await state.refreshFollows(cache, "A");
    assert.equal(reads, 2);
    assert.deepEqual(one.getCurrentResult().data, current);
    assert.deepEqual(two.getCurrentResult().data, current);
    assert.deepEqual(cache.getQueryData(state.followRelationshipKey("C", "B")), relationship);
  } finally {
    unsubscribeOne(); unsubscribeTwo(); cache.clear();
  }
});

test("refresh clears privacy-sensitive open lists and never fetches closed lists", async () => {
  const cache = client();
  const openKey = state.followListKey("A", "B", "followers");
  const closedKey = state.followListKey("A", "B", "following");
  let next, reads = 0;
  const observer = new QueryObserver(cache, {
    queryKey: openKey,
    queryFn: async () => {
      reads++;
      if (reads === 1) return { profiles: [{ id: "C", displayName: "Friends-only name", city: "Private city" }] };
      return new Promise((resolve) => { next = resolve; });
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await observer.refetch();
    cache.setQueryData(closedKey, { profiles: [{ id: "D" }] });
    const refresh = state.refreshFollows(cache, "A");
    await pause();
    assert.equal(observer.getCurrentResult().data, undefined, "old private data must not remain visible");
    assert.equal(cache.getQueryData(closedKey), undefined);
    assert.equal(reads, 2, "only the open list refetches");
    next({ profiles: [{ id: "C", displayName: null, city: null }] });
    await refresh;
    assert.equal(observer.getCurrentResult().data.profiles[0].displayName, null);
    assert.equal(observer.getCurrentResult().data.profiles[0].city, null);
  } finally { unsubscribe(); cache.clear(); }
});

test("mutation refresh discards a pre-mutation read instead of restoring stale counters", async () => {
  const cache = client();
  const key = state.followRelationshipKey("A", "B");
  let releaseOld, reads = 0;
  const current = { ...relationship, isFollowing: true, followersCount: 1 };
  const observer = new QueryObserver(cache, {
    queryKey: key,
    queryFn: async () => {
      reads++;
      return reads === 1 ? new Promise((resolve) => { releaseOld = resolve; }) : current;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await state.refreshFollows(cache, "A");
    assert.equal(reads, 2);
    releaseOld(relationship);
    await pause();
    assert.deepEqual(cache.getQueryData(key), current);
  } finally { unsubscribe(); cache.clear(); }
});

test("Connections changes refresh list permissions without touching follow relationship queries", async () => {
  const cache = client();
  const key = state.followRelationshipKey("A", "B");
  let reads = 0;
  const observer = new QueryObserver(cache, { queryKey: key, queryFn: async () => { reads++; return relationship; } });
  const unsubscribe = observer.subscribe(() => {});
  try {
    await observer.refetch();
    await state.refreshFollows(cache, "A", true);
    assert.equal(reads, 1);
    assert.deepEqual(cache.getQueryData(key), relationship);
  } finally { unsubscribe(); cache.clear(); }
});

test("ES/EN social labels pluralize and localize close and own/public empty states", async () => {
  const i18next = requireFrontend("i18next").createInstance();
  const es = JSON.parse(await readFile(`${frontend}src/i18n/locales/es/profile.json`, "utf8"));
  const en = JSON.parse(await readFile(`${frontend}src/i18n/locales/en/profile.json`, "utf8"));
  assert.deepEqual(Object.keys(es.follows).sort(), Object.keys(en.follows).sort());
  await i18next.init({
    lng: "es", fallbackLng: false, defaultNS: "profile",
    resources: { es: { profile: es }, en: { profile: en } },
  });
  for (const [lng, follower, followers, connection, connections, close] of [
    ["es", "seguidor", "seguidores", "conexión", "conexiones", "Cerrar"],
    ["en", "follower", "followers", "connection", "connections", "Close"],
  ]) {
    await i18next.changeLanguage(lng);
    assert.equal(i18next.t("follows.followersLabel", { count: 1 }), follower);
    assert.equal(i18next.t("follows.followersLabel", { count: 2 }), followers);
    assert.equal(i18next.t("follows.connectionsLabel", { count: 1 }), connection);
    assert.equal(i18next.t("follows.connectionsLabel", { count: 0 }), connections);
    assert.equal(i18next.t("follows.close"), close);
    assert.notEqual(i18next.t("follows.emptyOwnFollowers"), i18next.t("follows.emptyFollowers"));
    assert.notEqual(i18next.t("follows.emptyOwnFollowing"), i18next.t("follows.emptyFollowing"));
  }
});
