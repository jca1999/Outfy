import { createECDH } from "node:crypto";
import { decodePushKey } from "./push-validation";
import { logger } from "./logger";

export type PushConfiguration = { publicKey: string; privateKey: string; subject: string };
let warned = false;

/** Server-only. No values from this module may be logged or returned except publicKey. */
export function getPushConfiguration(): PushConfiguration | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  try {
    const pub = decodePushKey(publicKey, 65);
    const priv = decodePushKey(privateKey, 32);
    if (!pub || pub[0] !== 4 || !priv) throw new Error("Missing or invalid keys");
    const contact = new URL(subject);
    if (!["https:", "mailto:"].includes(contact.protocol) ||
      (contact.protocol === "mailto:" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.pathname)) ||
      (contact.protocol === "https:" && (!contact.hostname || contact.username || contact.password))) {
      throw new Error("Missing or invalid subject");
    }
    const curve = createECDH("prime256v1");
    curve.setPrivateKey(priv);
    if (!curve.getPublicKey().equals(pub)) throw new Error("Mismatched keys");
    warned = false;
    return { publicKey, privateKey, subject };
  } catch {
    if (!warned) {
      logger.warn({ code: "push_not_configured" },
        "Web Push unavailable: configure a matching VAPID key pair and a valid VAPID_SUBJECT");
      warned = true;
    }
    return null;
  }
}
