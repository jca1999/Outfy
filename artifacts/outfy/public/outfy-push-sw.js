/* Push only. Deliberately no fetch handler, offline cache or sound. */
const appBase = () => new URL(self.registration.scope);

function safeDestination(value) {
  const base = appBase();
  if (typeof value !== "string" || !(value.startsWith("/") || value.startsWith(`${base.origin}/`)) ||
    value.startsWith("//") || /[\\?#\u0000-\u0020]/.test(value) ||
    /%(?:2e|2f|5c|25)/i.test(value) ||
    value.split("/").some(part => part === "." || part === "..")) return base.href;
  try {
    const url = new URL(value, base.origin);
    if (url.origin !== base.origin || url.username || url.password || url.search || url.hash) return base.href;
    let path = url.pathname;
    if (base.pathname !== "/" && path.startsWith(base.pathname)) {
      path = `/${path.slice(base.pathname.length)}`;
    }
    const decoded = decodeURIComponent(path);
    const chatPath = /^\/chats(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/i.test(decoded);
    if (/[\\\u0000-\u0020]/.test(decoded) ||
      (!chatPath && !/^\/(?:(?:activities|users)\/[^/?#]+\/?|connections\/?)?$/.test(decoded)) ||
      decoded.split("/").some(part => part === "." || part === "..")) return base.href;
    const destination = new URL(path.slice(1), base);
    return destination.origin === base.origin && destination.pathname.startsWith(base.pathname)
      ? destination.href : base.href;
  } catch { return base.href; }
}

self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  let payload = {};
  try {
    const parsed = event.data?.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
  } catch { /* Malformed/empty payloads still get a language-neutral fallback. */ }
  const text = (value, fallback, length) =>
    typeof value === "string" && value.trim() ? value.slice(0, length) : fallback;
  event.waitUntil(self.registration.showNotification(text(payload.title, "Outfy", 80), {
    body: text(payload.body, "Outfy", 512),
    icon: new URL("icon-192.png", appBase()).href,
    badge: new URL("icon-192.png", appBase()).href,
    tag: text(payload.tag, "outfy", 120),
    silent: true,
    data: { url: safeDestination(payload.url) },
  }).catch(() => {}));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const destination = safeDestination(event.notification.data?.url);
  event.waitUntil((async () => {
    const base = appBase();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      try {
        const url = new URL(client.url);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) continue;
        const navigated = await client.navigate(destination);
        if (navigated) { await navigated.focus(); return; }
      } catch { /* A closing/unavailable tab must not swallow the click. */ }
    }
    await self.clients.openWindow(destination);
  })().catch(() => {}));
});
