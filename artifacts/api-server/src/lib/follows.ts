import { CONNECTION_FIELDS, visibleConnectionProfile, type ConnectionRow } from "./connections";
import { getSupabaseAdmin } from "./supabase";

const BATCH_SIZE = 500;
const PROFILE_FIELDS =
  "id,username,display_name,display_name_visibility,is_profile_private,home_city,avatar_path";

type FollowRow = {
  id: string;
  follower_id: string;
  followed_id: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  display_name_visibility: string | null;
  is_profile_private: boolean | null;
  home_city: string | null;
  avatar_path: string | null;
};

export async function followCount(filters: Record<string, string>) {
  let query = getSupabaseAdmin().from("user_follows")
    .select("id", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw error;
  if (count === null) throw new Error("Follow count was unavailable.");
  return count;
}

async function acceptedConnections(viewerId: string, ids: string[]) {
  // Permission is relative to the VIEWER, not the owner of the requested list.
  const results = await Promise.all([
    getSupabaseAdmin().from("connections").select(CONNECTION_FIELDS)
      .eq("status", "accepted").eq("requester_id", viewerId).in("addressee_id", ids),
    getSupabaseAdmin().from("connections").select(CONNECTION_FIELDS)
      .eq("status", "accepted").eq("addressee_id", viewerId).in("requester_id", ids),
  ]);
  const accepted = new Set<string>();
  for (const { data, error } of results) {
    // Missing Connections must fail closed, not masquerade as a follows migration.
    if (error) throw new Error("Unable to resolve profile permissions.", { cause: error });
    for (const row of (data ?? []) as ConnectionRow[]) {
      accepted.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id);
    }
  }
  return accepted;
}

async function safeProfiles(viewerId: string, ids: string[]) {
  const { data, error } = await getSupabaseAdmin().from("profiles")
    .select(PROFILE_FIELDS).in("id", ids);
  if (error) throw new Error("Unable to load follow profiles.", { cause: error });
  const profiles = (data ?? []) as ProfileRow[];
  const accepted = await acceptedConnections(viewerId, ids);
  const urls = new Map<string, string>();
  const paths = profiles.filter((p) => p.avatar_path).map((p) => `${p.id}/avatar.webp`);
  if (paths.length) {
    const result = await getSupabaseAdmin().storage.from("avatars").createSignedUrls(paths, 3600);
    if (!result.error) {
      for (const item of result.data ?? []) {
        if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
      }
    }
  }
  return profiles.map((profile) => ({
    ...visibleConnectionProfile(
      profile.id === viewerId ? { ...profile, display_name_visibility: "everyone" } : profile,
      profile.id === viewerId || accepted.has(profile.id),
    ),
    avatarUrl: urls.get(`${profile.id}/avatar.webp`) ?? null,
  }));
}

export async function followProfiles(
  viewerId: string,
  targetId: string,
  direction: "followers" | "following",
) {
  const filter = direction === "followers" ? "followed_id" : "follower_id";
  const other = direction === "followers" ? "follower_id" : "followed_id";
  const ids: string[] = [];
  // Read in stable batches rather than silently truncating at PostgREST's row cap.
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const { data, error } = await getSupabaseAdmin().from("user_follows")
      .select("id,follower_id,followed_id,created_at").eq(filter, targetId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as FollowRow[];
    ids.push(...rows.map((row) => row[other]));
    if (rows.length < BATCH_SIZE) break;
  }
  const profiles = [];
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    profiles.push(...await safeProfiles(viewerId, ids.slice(offset, offset + BATCH_SIZE)));
  }
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return ids.flatMap((id) => {
    const profile = byId.get(id);
    return profile ? [profile] : [];
  });
}
