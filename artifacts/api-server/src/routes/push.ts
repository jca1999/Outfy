import { Router, type Request, type Response } from "express";
import {
  GetPushStatusQueryParams, GetPushStatusResponse, GetPushPublicKeyResponse,
  RegisterPushSubscriptionBody, RegisterPushSubscriptionResponse,
  RemovePushSubscriptionBody, RemovePushSubscriptionResponse,
} from "@workspace/api-zod";
import { currentSession } from "./auth";
import { getSupabaseAdmin } from "../lib/supabase";
import { getPushConfiguration } from "../lib/push-config";
import { isPushEndpoint, validSubscriptionKeys } from "../lib/push-validation";

const router = Router();
const signal = () => AbortSignal.timeout(2500);
function fail(res: Response, status: number, code: string) {
  res.status(status).json({ error: "The push request could not be completed.", code });
}
async function viewer(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  try {
    const session = await currentSession(req, res);
    if (session) return session.user.id;
  } catch { req.log.warn({ code: "push_auth_failed" }, "Unable to authenticate push request"); }
  fail(res, 401, "authentication_required");
  return null;
}
function unavailable(req: Request, res: Response, error: unknown) {
  // Do not log SDK errors/rows: they can contain endpoints, subscription keys or payloads.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  req.log.warn({ code }, "Push subscription storage unavailable");
  fail(res, 503, ["42P01", "PGRST205"].includes(code)
    ? "push_migration_required" : "push_unavailable");
}

router.get("/push/status", async (req, res) => {
  const userId = await viewer(req, res);
  if (!userId) return;
  const parsed = GetPushStatusQueryParams.safeParse(req.query);
  if (!parsed.success || (parsed.data.endpoint && !isPushEndpoint(parsed.data.endpoint))) {
    fail(res, 400, "invalid_push_subscription"); return;
  }
  const configured = getPushConfiguration() !== null;
  try {
    let subscribed = false;
    if (configured) {
      let query = getSupabaseAdmin().from("push_subscriptions")
        .select("id").eq("user_id", userId).limit(1);
      if (parsed.data.endpoint) query = query.eq("endpoint", parsed.data.endpoint);
      const { data, error } = await query.abortSignal(signal()).maybeSingle();
      if (error) throw error;
      subscribed = !!parsed.data.endpoint && !!data;
    }
    res.json(GetPushStatusResponse.parse({ configured, subscribed }));
  } catch (error) { unavailable(req, res, error); }
});

router.get("/push/public-key", async (req, res) => {
  if (!await viewer(req, res)) return;
  const config = getPushConfiguration();
  if (!config) { fail(res, 503, "push_not_configured"); return; }
  res.json(GetPushPublicKeyResponse.parse({ publicKey: config.publicKey }));
});

router.post("/push/subscriptions", async (req, res) => {
  const userId = await viewer(req, res);
  if (!userId) return;
  const parsed = RegisterPushSubscriptionBody.strict().safeParse(req.body);
  if (!parsed.success || !isPushEndpoint(parsed.data.endpoint) || !validSubscriptionKeys(parsed.data.keys)) {
    fail(res, 400, "invalid_push_subscription"); return;
  }
  if (!getPushConfiguration()) { fail(res, 503, "push_not_configured"); return; }
  try {
    const db = getSupabaseAdmin();
    const { endpoint, keys } = parsed.data;
    const values = {
      endpoint, user_id: userId, p256dh: keys.p256dh.replace(/=+$/, ""),
      auth: keys.auth.replace(/=+$/, ""),
      user_agent: req.get("user-agent")?.slice(0, 512) ?? null,
      updated_at: new Date().toISOString(),
    };
    // Unique endpoint + optimistic, key-guarded update. Knowledge of an endpoint
    // alone cannot steal another account's device. Matching browser keys allow
    // an explicit enable action after switching accounts on that device.
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await db.from("push_subscriptions")
        .select("id,user_id,p256dh,auth,updated_at").eq("endpoint", endpoint)
        .abortSignal(signal()).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const row = existing.data;
        if (row.user_id !== userId && (row.p256dh !== values.p256dh || row.auth !== values.auth)) {
          fail(res, 409, "push_subscription_conflict"); return;
        }
        const updated = await db.from("push_subscriptions").update(values)
          .eq("id", row.id).eq("user_id", row.user_id).eq("updated_at", row.updated_at)
          .eq("p256dh", row.p256dh).eq("auth", row.auth)
          .select("id").abortSignal(signal()).maybeSingle();
        if (updated.error) throw updated.error;
        if (!updated.data) { fail(res, 409, "push_subscription_conflict"); return; }
      } else {
        const inserted = await db.from("push_subscriptions").insert(values).abortSignal(signal());
        if (inserted.error?.code === "23505") continue;
        if (inserted.error) throw inserted.error;
      }
      res.json(RegisterPushSubscriptionResponse.parse({ subscribed: true }));
      return;
    }
    fail(res, 409, "push_subscription_conflict");
  } catch (error) { unavailable(req, res, error); }
});

router.delete("/push/subscriptions", async (req, res) => {
  const userId = await viewer(req, res);
  if (!userId) return;
  const parsed = RemovePushSubscriptionBody.strict().safeParse(req.body);
  if (!parsed.success || !isPushEndpoint(parsed.data.endpoint)) {
    fail(res, 400, "invalid_push_subscription"); return;
  }
  try {
    const { error } = await getSupabaseAdmin().from("push_subscriptions").delete()
      .eq("user_id", userId).eq("endpoint", parsed.data.endpoint).abortSignal(signal());
    if (error) throw error;
    res.json(RemovePushSubscriptionResponse.parse({ subscribed: false }));
  } catch (error) { unavailable(req, res, error); }
});
export default router;
