import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import {
  applicationServerKey, getPushPublicKey, getPushStatus, registerPushWorker,
  removePushSubscription, savePushSubscription, supportsPush, matchesApplicationServerKey,
} from "./push-api";

type PushState = {
  supported: boolean; permission: NotificationPermission; configured: boolean;
  subscribed: boolean; hasSubscription: boolean; loading: boolean;
  error: "loadError" | "enableError" | "disableError" | null;
};
const initial: PushState = {
  supported: false, permission: "default", configured: false, subscribed: false,
  hasSubscription: false, loading: true, error: null,
};
export function useDevicePush() {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<PushState>(initial);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const version = ++generation.current;
    const supported = supportsPush();
    const permission = supported ? Notification.permission : "default";
    if (!userId || !supported) {
      setState({ ...initial, supported, permission, loading: false });
      return;
    }
    setState(previous => ({ ...previous, supported, permission, loading: true, error: null }));
    try {
      const registration = await registerPushWorker();
      const subscription = await registration?.pushManager.getSubscription();
      const status = await getPushStatus(subscription?.endpoint);
      const matchesKey = subscription && status.configured
        ? matchesApplicationServerKey(subscription, applicationServerKey((await getPushPublicKey()).publicKey)) : false;
      if (version !== generation.current) return;
      setState({
        supported, permission: Notification.permission, configured: status.configured,
        hasSubscription: !!subscription, loading: false, error: null,
        subscribed: Notification.permission === "granted" && !!subscription && !!matchesKey && status.configured && status.subscribed,
      });
    } catch {
      if (version !== generation.current) return;
      setState(previous => ({ ...previous, permission: Notification.permission,
        loading: false, configured: false, subscribed: false, error: "loadError" }));
    }
  }, [userId]);

  useEffect(() => {
    inFlight.current = false;
    setBusy(false);
    setState(initial);
    void refresh();
    const focus = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);

  async function enable() {
    if (inFlight.current || !userId || !state.supported || !state.configured || state.loading) return;
    inFlight.current = true;
    const version = ++generation.current;
    setBusy(true);
    setState(previous => ({ ...previous, error: null }));
    let subscription: PushSubscription | null = null;
    try {
      // Must stay before any network await: Safari requires a direct user gesture.
      const permission = Notification.permission === "default"
        ? await Notification.requestPermission() : Notification.permission;
      if (permission !== "granted") {
        if (version === generation.current) setState(previous => ({ ...previous, permission, subscribed: false }));
        return;
      }
      if (version !== generation.current) return;
      const registration = await registerPushWorker();
      if (!registration) throw new Error("push_unsupported");
      const { publicKey } = await getPushPublicKey();
      const key = applicationServerKey(publicKey);
      if (version !== generation.current) return;
      subscription = await registration.pushManager.getSubscription();
      if (subscription && !matchesApplicationServerKey(subscription, key)) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key,
      });
      if (version !== generation.current) { await subscription.unsubscribe(); return; }
      await savePushSubscription(subscription);
      if (version === generation.current) setState(previous => ({
        ...previous, permission: "granted", subscribed: true, hasSubscription: true, error: null,
      }));
    } catch {
      // A real browser subscription without an acknowledged backend write is NOT enabled.
      const stopped = subscription ? await subscription.unsubscribe().catch(() => false) : false;
      if (version === generation.current) setState(previous => ({
        ...previous, permission: Notification.permission, subscribed: false,
        hasSubscription: subscription ? !stopped : previous.hasSubscription, error: "enableError",
      }));
    } finally {
      if (version === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }
  async function disable() {
    if (inFlight.current || !userId || !state.supported) return;
    inFlight.current = true;
    const version = ++generation.current;
    setBusy(true);
    setState(previous => ({ ...previous, error: null }));
    try {
      const registration = await registerPushWorker();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        if (version === generation.current) setState(previous => ({ ...previous, subscribed: false }));
        await subscription.unsubscribe();
        if (await registration?.pushManager.getSubscription()) throw new Error("push_unsubscribe_failed");
      }
      if (version === generation.current) setState(previous => ({
        ...previous, subscribed: false, hasSubscription: false, error: null,
      }));
    } catch {
      if (version === generation.current) setState(previous => ({ ...previous, error: "disableError" }));
    } finally {
      if (version === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }
  return { ...state, busy, refresh, enable, disable };
}
