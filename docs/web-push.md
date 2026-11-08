# Outfy Web Push

Web Push is an optional additional channel for stored internal notifications.
The notification center, read state, category preferences and business events
remain the source of truth. There is no Firebase SDK/project, paid notification
platform, offline cache, email, scheduler, sound or new reminder/chat generator.

## Manual setup — not performed by this implementation

1. Review `supabase/migrations/20261108180114_push_subscriptions.sql` and apply it
   through your normal controlled migration process. No migration has been
   applied by this change, and no `supabase db push` has been run.
   It reuses the existing `public.set_activity_updated_at()` trigger function.
2. Generate a matching P-256 VAPID key pair in a trusted environment outside the
   repository. Never commit the private key or paste it into chat/source code.
3. Configure the server environment securely:
   - `VAPID_PUBLIC_KEY`: base64url-encoded uncompressed 65-byte public key.
   - `VAPID_PRIVATE_KEY`: base64url-encoded 32-byte private key, server-only secret.
   - `VAPID_SUBJECT`: a valid operator contact `mailto:` address or HTTPS URL.
     Required here: no invented/default contact is used.
   Do not give these variables a `VITE_` prefix. The browser retrieves only the
   public key through the authenticated `/api/push/public-key` endpoint.
4. Load the app over HTTPS in a supported browser/context. Open Settings and
   explicitly enable push on each desired device. No permission prompt or
   subscription is initiated automatically.
5. Validate real delivery with test accounts on the intended production origin:
   each of the five supported events, app closed/backgrounded, notification
   clicks with/without a tab open, multiple devices, category opt-out, disabling
   a device, and switching accounts/signing out on a shared browser.

The existing Supabase server environment stays unchanged. Missing/invalid VAPID
configuration disables push gracefully; internal notifications continue working.
Missing subscription storage returns `503 push_migration_required`.

## Device state and privacy

- Settings confirms both a real browser subscription and server ownership before
  displaying enabled. Server status does not infer browser permission.
- Reopening/focusing Settings rechecks permission, ownership and (where exposed
  by the browser) the VAPID application-server key. Rotating VAPID keys requires
  re-enabling affected devices.
- Endpoint uniqueness supports several devices per account. Re-enabling an
  endpoint updates it. Reassigning an endpoint after switching accounts requires
  possession of its matching browser subscription keys, not just its endpoint.
  DELETE is always scoped to the authenticated owner.
- Explicit sign-out makes a bounded, best-effort attempt to unsubscribe the
  browser and remove its server record before signing out. Cleanup failure must
  never block sign-out. Browser/device controls should also be reviewed on shared
  devices; failed storage cleanup may leave an expired row until next delivery.
- Subscription keys/endpoints, provider error bodies and payloads are not logged.
  Endpoint queries are covered by the existing query-stripping request logger.
- Push uses the existing privacy-aware notification presenter to resolve current
  actor usernames and accessible activity titles. No metadata/name/title snapshots
  are sent. An inaccessible/deleted activity yields generic text and the app home;
  a deleted actor yields generic text.
- There is no reliable recipient-language field on the server. Push bodies use
  **English consistently**, rather than guessing from a sending browser/request.
  Settings uses existing ES/EN translations; malformed payload fallbacks are the
  language-neutral brand name. No profile schema changes were made for locale.
- Lock screens can display the privacy-eligible username/title. The operator
  should review this content policy before enabling production delivery.

## Delivery and failure behavior

Only successful new internal inserts dispatch push: `connection_request`,
`connection_accepted`, `activity_invitation`, `activity_invitation_accepted`,
`activity_invitation_declined`. Existing preference checks are reused. A dedupe
conflict never sends again. Reminder/chat types are not dispatched.

Delivery is detached and best effort: no durable queue, retry daemon or
exactly-once guarantee is introduced. A process restart can interrupt pending
delivery, but the internal notification remains stored. Every recipient device
is attempted, with bounded concurrency, socket timeout, and a 30-minute TTL.

Provider 404/410 responses delete only the unchanged, still-owned subscription
snapshot. A concurrent refresh/reassignment is protected. Other failures
(including 403/429/5xx) are retained and logged without sensitive fields.

To prevent subscription-URL SSRF, delivery/registration allow only HTTPS native
browser push hosts: `fcm.googleapis.com`, `fcmregistrations.googleapis.com`,
`*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`
(and the corresponding base hosts). Chrome's FCM endpoint here is the browser's
standard Web Push transport, not a Firebase integration. New browser providers
require a deliberate allowlist review.

## Service worker and browser limitations

`public/outfy-push-sw.js` only handles push display and safe notification clicks.
Registration and icons use Vite's app base. Click URLs are restricted to
same-origin app home, friendships, user profiles and activity pages; external,
unsafe or unknown destinations fall back to the app home. There is no fetch
handler or offline caching. Clicking a push navigates only; it does not change
internal notification read state.

iPhone/iPad support depends on OS/browser version and browsing context; an
installed Home Screen app may be required. The UI explains unavailability but
does not force installation, spoof platforms or repeatedly request permission.
Test actual iOS/Android/desktop devices and OS notification settings manually;
mocked tests cannot demonstrate native background delivery.

## Automated checks

`node --test artifacts/api-server/tests/{push,notifications,connections,follows}.test.mjs`

Tests use in-memory database/browser/worker doubles and mocked Web Push delivery.
They do not contact an external push service, apply SQL or use real credentials.
