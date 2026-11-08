import { ECDH } from "node:crypto";

// Subscription endpoints are untrusted network destinations. Limit delivery to
// browser push services, never arbitrary URLs/private hosts (SSRF).
const PROVIDERS = ["fcm.googleapis.com", "fcmregistrations.googleapis.com",
  "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isPushEndpoint(value: string): boolean {
  // Serialized browser endpoints are ASCII. This also keeps the unique index's
  // byte size bounded, not just its Unicode character count.
  if (!value || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value) || value.includes("\\")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      !url.hash && (!url.port || url.port === "443") && (url.pathname !== "/" || !!url.search) &&
      PROVIDERS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

export function decodePushKey(value: string, length: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === length &&
    decoded.toString("base64url") === value.replace(/=+$/, "") ? decoded : null;
}

export function validSubscriptionKeys(keys: { p256dh: string; auth: string }): boolean {
  const publicKey = decodePushKey(keys.p256dh, 65);
  if (!publicKey || publicKey[0] !== 4 || !decodePushKey(keys.auth, 16)) return false;
  try {
    ECDH.convertKey(publicKey, "prime256v1", undefined, undefined, "uncompressed");
    return true;
  } catch { return false; }
}
