import { Router, type Request, type Response } from "express";
import { currentSession } from "./auth";
import { getSupabaseAdmin } from "../lib/supabase";
import {
  CONNECTION_FIELDS,
  findConnection,
  isConnectionsMigrationMissing,
  relationshipFor,
  visibleConnectionProfile,
  type ConnectionRow,
} from "../lib/connections";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_FIELDS =
  "id,username,display_name,display_name_visibility,is_profile_private,home_city,home_country_code,avatar_path";

function fail(response: Response, status: number, code: string) {
  response.status(status).json({ error: "The connections request could not be completed.", code });
}

async function viewer(request: Request, response: Response) {
  try {
    const session = await currentSession(request, response);
    if (session) return session.user.id;
  } catch (error) {
    request.log.warn({ err: error }, "Unable to authenticate connections request");
  }
  fail(response, 401, "authentication_required");
  return null;
}

function unavailable(request: Request, response: Response, error: unknown) {
  request.log.error({ err: error }, "Connections request failed");
  const missing =
    error !== null && typeof error === "object" &&
    isConnectionsMigrationMissing(error);
  fail(response, missing ? 503 : 500, missing ? "connections_migration_required" : "connections_unavailable");
}

async function userConnections(userId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("connections")
    .select(CONNECTION_FIELDS)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConnectionRow[];
}

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  display_name_visibility: string | null;
  is_profile_private: boolean | null;
  home_city: string | null;
  home_country_code: string | null;
  avatar_path: string | null;
};

async function summaries(profiles: ProfileRow[], acceptedIds = new Set<string>()) {
  // Same private bucket, canonical path and one-hour signature as profile avatars.
  // Batch signing avoids one storage request per card.
  const withAvatar = profiles.filter((profile) => profile.avatar_path);
  const urls = new Map<string, string>();
  if (withAvatar.length) {
    const { data, error } = await getSupabaseAdmin().storage
      .from("avatars")
      .createSignedUrls(withAvatar.map((p) => `${p.id}/avatar.webp`), 3600);
    if (!error) {
      data?.forEach((item, index) => {
        if (item.signedUrl) urls.set(withAvatar[index].id, item.signedUrl);
      });
    }
  }
  return profiles.map((profile) => ({
    ...visibleConnectionProfile(profile, acceptedIds.has(profile.id)),
    avatarUrl: urls.get(profile.id) ?? null,
  }));
}

router.get("/connections", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  try {
    const rows = await userConnections(userId);
    const ids = rows.map((row) =>
      row.requester_id === userId ? row.addressee_id : row.requester_id,
    );
    if (!ids.length) {
      response.json({ incoming: [], outgoing: [], accepted: [] });
      return;
    }
    const { data, error } = await getSupabaseAdmin()
      .from("profiles").select(PROFILE_FIELDS).in("id", ids);
    if (error) throw error;
    const acceptedIds = new Set(rows.filter((r) => r.status === "accepted")
      .map((r) => r.requester_id === userId ? r.addressee_id : r.requester_id));
    const profiles = await summaries((data ?? []) as ProfileRow[], acceptedIds);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const entries = rows.flatMap((row) => {
      const profile = byId.get(row.requester_id === userId ? row.addressee_id : row.requester_id);
      return profile ? [{ relationship: relationshipFor(row, userId), profile }] : [];
    });
    response.json({
      incoming: entries.filter((e) => e.relationship.status === "pending" && e.relationship.direction === "incoming"),
      outgoing: entries.filter((e) => e.relationship.status === "pending" && e.relationship.direction === "outgoing"),
      accepted: entries.filter((e) => e.relationship.status === "accepted"),
    });
  } catch (error) { unavailable(request, response, error); }
});

router.get("/connections/suggestions", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  try {
    const rows = await userConnections(userId);
    const excluded = [userId, ...rows.map((r) => r.requester_id === userId ? r.addressee_id : r.requester_id)];
    const { data: own, error: ownError } = await getSupabaseAdmin()
      .from("profiles").select("home_city,home_country_code").eq("id", userId).maybeSingle();
    if (ownError) throw ownError;
    function candidates() {
      return getSupabaseAdmin().from("profiles").select(PROFILE_FIELDS)
        .eq("is_profile_private", false)
        .not("id", "in", `(${excluded.join(",")})`)
        .order("id").limit(20);
    }
    let profiles: ProfileRow[] = [];
    if (own?.home_city) {
      let query = candidates().eq("home_city", own.home_city);
      if (own.home_country_code) query = query.eq("home_country_code", own.home_country_code);
      const { data, error } = await query;
      if (error) throw error;
      profiles = (data ?? []) as ProfileRow[];
    }
    if (profiles.length < 20) {
      const query = candidates();
      if (profiles.length) query.not("id", "in", `(${profiles.map((p) => p.id).join(",")})`);
      const { data, error } = await query;
      if (error) throw error;
      profiles = [...profiles, ...((data ?? []) as ProfileRow[])].slice(0, 20);
    }
    response.json({ profiles: await summaries(profiles) });
  } catch (error) { unavailable(request, response, error); }
});

router.get("/connections/with/:userId", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  const targetId = String(request.params.userId);
  if (!UUID.test(targetId)) { fail(response, 400, "invalid_target"); return; }
  try {
    const row = await findConnection(userId, targetId);
    response.json({ relationship: row ? relationshipFor(row, userId) : null });
  } catch (error) { unavailable(request, response, error); }
});

router.post("/connections/requests", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  const input: unknown = request.body?.targetUserId;
  if (typeof input !== "string" || !UUID.test(input)) {
    fail(response, 400, "invalid_target"); return;
  }
  const targetId = input.toLowerCase();
  if (targetId === userId) { fail(response, 400, "self_request"); return; }
  try {
    const { data: target, error: targetError } = await getSupabaseAdmin()
      .from("profiles").select("id").eq("id", targetId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) { fail(response, 404, "user_not_found"); return; }
    const existing = await findConnection(userId, targetId);
    if (existing?.status === "accepted") { fail(response, 409, "already_connected"); return; }
    if (existing) { response.json({ relationship: relationshipFor(existing, userId) }); return; }
    const { data, error } = await getSupabaseAdmin().from("connections")
      .insert({ requester_id: userId, addressee_id: targetId })
      .select(CONNECTION_FIELDS).single();
    if (error?.code === "23505") {
      const raced = await findConnection(userId, targetId);
      if (raced?.status === "accepted") { fail(response, 409, "already_connected"); return; }
      if (raced) { response.json({ relationship: relationshipFor(raced, userId) }); return; }
      fail(response, 409, "relationship_changed"); return;
    }
    if (error) throw error;
    response.status(201).json({ relationship: relationshipFor(data as ConnectionRow, userId) });
  } catch (error) { unavailable(request, response, error); }
});

router.post("/connections/:id/accept", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  const id = String(request.params.id);
  if (!UUID.test(id)) { fail(response, 400, "invalid_relationship"); return; }
  try {
    // Authorization is part of the atomic write predicate, not just a prior read.
    const { data, error } = await getSupabaseAdmin().from("connections")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", id).eq("addressee_id", userId).eq("status", "pending")
      .select(CONNECTION_FIELDS).maybeSingle();
    if (error) throw error;
    if (!data) { fail(response, 409, "relationship_changed"); return; }
    response.json({ relationship: relationshipFor(data as ConnectionRow, userId) });
  } catch (error) { unavailable(request, response, error); }
});

router.delete("/connections/:id", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  const id = String(request.params.id);
  const action = request.query.action;
  if (!UUID.test(id)) { fail(response, 400, "invalid_relationship"); return; }
  if (action !== "cancel" && action !== "reject" && action !== "remove") {
    fail(response, 400, "invalid_action"); return;
  }
  try {
    let query = getSupabaseAdmin().from("connections").delete().eq("id", id);
    if (action === "remove") {
      query = query.eq("status", "accepted").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    } else {
      query = query.eq("status", "pending")
        .eq(action === "cancel" ? "requester_id" : "addressee_id", userId);
    }
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (!data) { fail(response, 409, "relationship_changed"); return; }
    response.json({ removed: true });
  } catch (error) { unavailable(request, response, error); }
});

export default router;
