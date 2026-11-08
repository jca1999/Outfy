import { getSupabaseAdmin } from "./supabase";
import { type ConnectionRow, CONNECTION_FIELDS } from "./connections";
import type { NotificationType } from "./notifications";

export type NotificationRow = {
  id: string;
  actor_id: string | null;
  activity_id: string | null;
  type: NotificationType;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
type Profile = {
  id: string; username: string; display_name: string | null;
  display_name_visibility: string | null; avatar_path: string | null;
};
type Activity = { id: string; creator_id: string; title: string; visibility: string };

/** No snapshots of names/titles: every read rechecks current access, in batches. */
export async function presentNotifications(viewerId: string, rows: NotificationRow[]) {
  if (!rows.length) return [];
  const db = getSupabaseAdmin();
  const actorIds = [...new Set(rows.flatMap(r => r.actor_id ? [r.actor_id] : []))];
  const activityIds = [...new Set(rows.flatMap(r => r.activity_id ? [r.activity_id] : []))];
  const profilesResult = actorIds.length
    ? await db.from("profiles").select("id,username,display_name,display_name_visibility,avatar_path").in("id", actorIds)
    : { data: [], error: null };
  const activitiesResult = activityIds.length
    ? await db.from("activities").select("id,creator_id,title,visibility").in("id", activityIds)
    : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  const profiles = (profilesResult.data ?? []) as Profile[];
  const activities = (activitiesResult.data ?? []) as Activity[];
  const relatedIds = [...new Set([...actorIds, ...activities.map(a => a.creator_id)])];
  const accepted = new Set<string>();
  if (relatedIds.length) {
    const results = await Promise.all([
      db.from("connections").select(CONNECTION_FIELDS).eq("status", "accepted")
        .eq("requester_id", viewerId).in("addressee_id", relatedIds),
      db.from("connections").select(CONNECTION_FIELDS).eq("status", "accepted")
        .eq("addressee_id", viewerId).in("requester_id", relatedIds),
    ]);
    for (const result of results) {
      if (result.error) throw result.error;
      for (const row of (result.data ?? []) as ConnectionRow[]) {
        accepted.add(row.requester_id === viewerId ? row.addressee_id : row.requester_id);
      }
    }
  }
  const memberships = new Set<string>();
  const invitations = new Set<string>();
  if (activityIds.length) {
    const [members, invited] = await Promise.all([
      db.from("activity_members").select("activity_id").eq("user_id", viewerId).in("activity_id", activityIds),
      db.from("activity_invitations").select("activity_id").eq("invitee_id", viewerId)
        .eq("status", "pending").in("activity_id", activityIds),
    ]);
    if (members.error) throw members.error;
    if (invited.error) throw invited.error;
    for (const row of members.data ?? []) memberships.add(row.activity_id);
    for (const row of invited.data ?? []) invitations.add(row.activity_id);
  }
  const avatarUrls = new Map<string, string>();
  const avatars = profiles.filter(p => p.avatar_path);
  if (avatars.length) {
    // Avatars follow the existing public-profile avatar pattern, canonical paths only.
    try {
      const signed = await db.storage.from("avatars")
        .createSignedUrls(avatars.map(p => `${p.id}/avatar.webp`), 3600);
      if (!signed.error) signed.data?.forEach((item, index) => {
        if (item.signedUrl) avatarUrls.set(avatars[index].id, item.signedUrl);
      });
    } catch { /* Avatar failure must not disclose or block private text. */ }
  }
  const profileById = new Map(profiles.map(p => [p.id, p]));
  const activityById = new Map(activities.map(a => [a.id, a]));
  return rows.map(row => {
    const profile = row.actor_id ? profileById.get(row.actor_id) : undefined;
    const activity = row.activity_id ? activityById.get(row.activity_id) : undefined;
    const activityAllowed = activity && (
      activity.creator_id === viewerId || activity.visibility === "public" ||
      ((activity.visibility === "friends" || activity.visibility === "invite_only") && memberships.has(activity.id)) ||
      (activity.visibility === "friends" && accepted.has(activity.creator_id)) ||
      (activity.visibility === "invite_only" && invitations.has(activity.id))
    );
    const nameAllowed = profile && (profile.id === viewerId ||
      profile.display_name_visibility === "everyone" ||
      (profile.display_name_visibility === "friends" && accepted.has(profile.id)));
    // Only server-owned opaque event identifiers may be returned as metadata.
    const metadata: Record<string, string> = {};
    for (const key of ["connectionId", "invitationId"]) {
      const value = row.metadata?.[key];
      if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) metadata[key] = value;
    }
    return {
      id: row.id, type: row.type, readAt: row.read_at, createdAt: row.created_at, metadata,
      actor: profile ? {
        id: profile.id, username: profile.username,
        displayName: nameAllowed ? profile.display_name?.trim() || null : null,
        avatarUrl: avatarUrls.get(profile.id) ?? null,
      } : null,
      activity: activityAllowed ? { id: activity.id, title: activity.title } : null,
    };
  });
}
