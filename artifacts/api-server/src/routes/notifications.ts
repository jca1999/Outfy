import { Router, type Request, type Response } from "express";
import { currentSession } from "./auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { presentNotifications, type NotificationRow } from "../lib/notification-presenter";
import {
  ListNotificationsResponse, GetNotificationsUnreadCountResponse,
  MarkNotificationReadParams, MarkNotificationReadResponse, MarkAllNotificationsReadResponse,
} from "@workspace/api-zod";

const router = Router();
function fail(response: Response, status: number, code: string) {
  response.status(status).json({ error: "The notification request could not be completed.", code });
}
async function viewer(request: Request, response: Response) {
  response.set("Cache-Control", "private, no-store");
  try {
    const session = await currentSession(request, response);
    if (session) return session.user.id;
  } catch (error) {
    request.log.warn({ err: error }, "Unable to authenticate notifications");
  }
  fail(response, 401, "authentication_required");
  return null;
}
function unavailable(request: Request, response: Response, error: unknown) {
  request.log.error({ err: error }, "Notifications request failed");
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  const missing = code === "42P01" || code === "PGRST205";
  fail(response, missing ? 503 : 500, missing ? "notifications_migration_required" : "notifications_unavailable");
}

router.get("/notifications", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  try {
    const { data, error } = await getSupabaseAdmin().from("notifications")
      .select("id,actor_id,activity_id,type,metadata,read_at,created_at")
      .eq("recipient_id", userId).order("created_at", { ascending: false })
      .order("id", { ascending: false }).limit(50);
    if (error) throw error;
    response.json(ListNotificationsResponse.parse({
      notifications: await presentNotifications(userId, (data ?? []) as NotificationRow[]),
    }));
  } catch (error) { unavailable(request, response, error); }
});

router.get("/notifications/unread-count", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  try {
    const { count, error } = await getSupabaseAdmin().from("notifications")
      .select("id", { count: "exact", head: true }).eq("recipient_id", userId).is("read_at", null);
    if (error) throw error;
    if (count === null) {
      // PostgREST HEAD errors can omit the JSON error body. Diagnose missing
      // schema using a scoped, body-bearing read rather than inventing count 0.
      const probe = await getSupabaseAdmin().from("notifications").select("id")
        .eq("recipient_id", userId).limit(1);
      if (probe.error) throw probe.error;
      throw new Error("Unread count was unavailable");
    }
    response.json(GetNotificationsUnreadCountResponse.parse({ count }));
  } catch (error) { unavailable(request, response, error); }
});

router.post("/notifications/read-all", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  try {
    const readAt = new Date().toISOString();
    const { error } = await getSupabaseAdmin().from("notifications").update({ read_at: readAt })
      .eq("recipient_id", userId).is("read_at", null).lte("created_at", readAt);
    if (error) throw error;
    response.json(MarkAllNotificationsReadResponse.parse({ readAt }));
  } catch (error) { unavailable(request, response, error); }
});

router.post("/notifications/:id/read", async (request, response) => {
  const userId = await viewer(request, response);
  if (!userId) return;
  const parsed = MarkNotificationReadParams.safeParse({ id: String(request.params.id) });
  if (!parsed.success) { fail(response, 400, "invalid_notification"); return; }
  const { id } = parsed.data;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", id)
      .eq("recipient_id", userId).is("read_at", null).select("read_at").maybeSingle();
    if (error) throw error;
    if (data) { response.json(MarkNotificationReadResponse.parse({ readAt: data.read_at })); return; }
    const existing = await db.from("notifications").select("read_at")
      .eq("id", id).eq("recipient_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) { fail(response, 404, "notification_not_found"); return; }
    response.json(MarkNotificationReadResponse.parse({ readAt: existing.data.read_at }));
  } catch (error) { unavailable(request, response, error); }
});

export default router;
