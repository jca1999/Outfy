import { Router, type Request, type Response } from "express";
import { currentSession } from "./auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { followCount, followProfiles } from "../lib/follows";

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(response: Response, status: number, code: string) {
  response.status(status).json({ error: "The follows request could not be completed.", code });
}

async function viewer(request: Request, response: Response) {
  try {
    const session = await currentSession(request, response);
    if (session) return session.user.id;
  } catch (error) {
    request.log.warn({ err: error }, "Unable to authenticate follows request");
  }
  fail(response, 401, "authentication_required");
  return null;
}

function target(request: Request, response: Response) {
  const id = String(request.params.userId);
  if (!UUID.test(id)) {
    fail(response, 400, "invalid_target");
    return null;
  }
  return id.toLowerCase();
}

async function targetExists(id: string, response: Response) {
  const { data, error } = await getSupabaseAdmin().from("profiles")
    .select("id").eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to look up follow target.", { cause: error });
  if (data) return true;
  fail(response, 404, "user_not_found");
  return false;
}

function unavailable(request: Request, response: Response, error: unknown) {
  request.log.error({ err: error }, "Follows request failed");
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const missing = code === "42P01" || code === "PGRST205";
  fail(response, missing ? 503 : 500, missing ? "follows_migration_required" : "follows_unavailable");
}

router.get("/follows/with/:userId", async (request, response) => {
  const viewerId = await viewer(request, response);
  if (!viewerId) return;
  const targetId = target(request, response);
  if (!targetId) return;
  try {
    if (!await targetExists(targetId, response)) return;
    const [outgoing, incoming, followersCount, followingCount] = await Promise.all([
      followCount({ follower_id: viewerId, followed_id: targetId }),
      followCount({ follower_id: targetId, followed_id: viewerId }),
      followCount({ followed_id: targetId }),
      followCount({ follower_id: targetId }),
    ]);
    response.json({ isFollowing: outgoing > 0, followsYou: incoming > 0, followersCount, followingCount });
  } catch (error) { unavailable(request, response, error); }
});

router.post("/follows/:userId", async (request, response) => {
  const viewerId = await viewer(request, response);
  if (!viewerId) return;
  const targetId = target(request, response);
  if (!targetId) return;
  if (targetId === viewerId) {
    fail(response, 400, "self_follow");
    return;
  }
  try {
    if (!await targetExists(targetId, response)) return;
    const { error } = await getSupabaseAdmin().from("user_follows")
      .insert({ follower_id: viewerId, followed_id: targetId });
    if (error?.code === "23503") {
      fail(response, 404, "user_not_found");
      return;
    }
    if (error && error.code !== "23505") throw error;
    response.json({ following: true });
  } catch (error) { unavailable(request, response, error); }
});

router.delete("/follows/:userId", async (request, response) => {
  const viewerId = await viewer(request, response);
  if (!viewerId) return;
  const targetId = target(request, response);
  if (!targetId) return;
  try {
    const { error } = await getSupabaseAdmin().from("user_follows").delete()
      .eq("follower_id", viewerId).eq("followed_id", targetId);
    if (error) throw error;
    response.json({ following: false });
  } catch (error) { unavailable(request, response, error); }
});

for (const direction of ["followers", "following"] as const) {
  router.get(`/follows/:userId/${direction}`, async (request, response) => {
    const viewerId = await viewer(request, response);
    if (!viewerId) return;
    const targetId = target(request, response);
    if (!targetId) return;
    try {
      if (!await targetExists(targetId, response)) return;
      response.json({ profiles: await followProfiles(viewerId, targetId, direction) });
    } catch (error) { unavailable(request, response, error); }
  });
}

export default router;
