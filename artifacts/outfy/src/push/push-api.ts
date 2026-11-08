import type { PushStatus, PushPublicKey, PushSubscriptionResult } from "@workspace/api-client-react";

export function supportsPush() {
  return typeof window !== "undefined" && window.isSecureContext &&
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export const pushBase = () => new URL(import.meta.env.BASE_URL, window.location.origin);

/** No permission prompt here. Registration alone is safe on page load. */
export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsPush()) return null;
  const base = pushBase();
  const registration = await navigator.serviceWorker.register(
    new URL("outfy-push-sw.js", base).href, { scope: base.pathname, updateViaCache: "none" },
  );
  if (registration.active) return registration;
  await new Promise<void>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error("push_worker_unavailable")); return; }
    const finish = (error?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("statechange", changed);
      error ? reject(error) : resolve();
    };
    const changed = () => {
      if (worker.state === "activated") finish();
      else if (worker.state === "redundant") finish(new Error("push_worker_unavailable"));
    };
    const timer = setTimeout(() => finish(new Error("push_worker_timeout")), 10000);
    worker.addEventListener("statechange", changed);
    changed();
  });
  return registration;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
  // The separate API artifact owns /api, independently of the web app's base.
  const response = await fetch(`/api/push/${path}`, {
    method, credentials: "include", signal: AbortSignal.timeout(8000),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(record(data) && typeof data.code === "string" ? data.code : "push_unavailable");
  return data;
}
export async function getPushStatus(endpoint?: string): Promise<PushStatus> {
  const query = endpoint ? `?${new URLSearchParams({ endpoint })}` : "";
  const data = await request(`status${query}`);
  if (!record(data) || typeof data.configured !== "boolean" || typeof data.subscribed !== "boolean") {
    throw new Error("invalid_push_response");
  }
  return data as unknown as PushStatus;
}
export async function getPushPublicKey(): Promise<PushPublicKey> {
  const data = await request("public-key");
  if (!record(data) || typeof data.publicKey !== "string" || !data.publicKey) {
    throw new Error("invalid_push_response");
  }
  return data as unknown as PushPublicKey;
}
export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error("invalid_push_key");
  const normalized = value.replace(/=+$/, "");
  const bytes = Uint8Array.from(atob(normalized.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - normalized.length % 4) % 4)), char => char.charCodeAt(0));
  if (bytes.length !== 65 || bytes[0] !== 4) throw new Error("invalid_push_key");
  return bytes;
}
export function matchesApplicationServerKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const previous = subscription.options.applicationServerKey;
  // Some older implementations do not expose the key; the server's ownership
  // acknowledgement still applies. Modern browsers let us detect key rotation.
  if (!previous) return true;
  const bytes = new Uint8Array(previous);
  return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}
export async function savePushSubscription(subscription: PushSubscription): Promise<PushSubscriptionResult> {
  const json = subscription.toJSON();
  const data = await request("subscriptions", "POST", { endpoint: json.endpoint, keys: json.keys });
  if (!record(data) || data.subscribed !== true) throw new Error("invalid_push_response");
  return { subscribed: true };
}
export async function removePushSubscription(endpoint: string): Promise<PushSubscriptionResult> {
  const data = await request("subscriptions", "DELETE", { endpoint });
  if (!record(data) || data.subscribed !== false) throw new Error("invalid_push_response");
  return { subscribed: false };
}

/** Best effort before explicit sign-out. Never changes whether sign-out succeeds. */
export async function clearPushForSignOut() {
  if (!supportsPush()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const registration = await navigator.serviceWorker.getRegistration(pushBase().href);
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        // Stop this browser even if authenticated server cleanup later fails.
        try { await subscription.unsubscribe(); }
        finally { await removePushSubscription(subscription.endpoint); }
      })(),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 2500); }),
    ]);
  } catch { /* No push error is allowed to prevent account sign-out. */ }
  finally { clearTimeout(timer); }
}
