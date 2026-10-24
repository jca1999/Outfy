# Connections V1: manual rollout and verification

## Migration (not automatically applied)

Review `supabase/migrations/013_connections.sql`. Supabase CLI is not installed
in this workspace, so the existing numbered migration convention was used.
It creates `public.connections`, cascading identity references to `auth.users`,
pending/accepted constraints, a unique unordered UUID-pair index, participant-side
status indexes, the existing timestamp trigger, RLS and service-role-only access.
No privileged RPC or paid service is added.

1. Verify migrations 001–012 are already applied to the intended Supabase project.
2. Review the entire 013 file before execution. Do not reset the database or
   re-run historical migrations.
3. Apply **only** `013_connections.sql` manually using your normal reviewed
   Supabase migration process. Choose a development/staging project first.
4. Check that `connections` exists, RLS is enabled, browser roles have no table
   privileges, and `connections_unordered_pair_key` exists.
5. Run the scenario below in development before any production rollout.
6. Apply the reviewed file to production only when separately approved.
   Publishing/redeployment is also a separate user action.

Before applying 013, Connections requests fail explicitly with HTTP 503 and code
`connections_migration_required`. Existing public profiles retain their previous,
restricted privacy representation when the new table is absent. Other database
errors fail closed rather than revealing friends-only information.

## Routes

- `GET /api/connections`: incoming, outgoing and accepted lists.
- `GET /api/connections/suggestions`: up to 20 discoverable profiles, same saved
  city/country first, excluding self and all existing relationships.
- `GET /api/connections/with/:userId`: current session's relationship with target.
- `POST /api/connections/requests`: body `{ "targetUserId": "<target uuid>" }`.
- `POST /api/connections/:id/accept`: recipient-only pending transition.
- `DELETE /api/connections/:id?action=cancel|reject|remove`: respectively requester
  pending, recipient pending, or either accepted participant.

The target ID identifies the other user only. Acting identity always comes from
the Outfy session. No browser-supplied acting identity is trusted. SQL uniqueness
handles opposite-direction races, and update/delete role checks are atomic
database predicates.

## Two-account acceptance scenario (requires applied migration)

1. A opens B at `/users/:username` (including via activity participant navigation).
2. A sends a request; request sent appears. Reload and confirm it persists.
3. B opens Connections and sees A under incoming requests.
4. A cannot accept its own outgoing request; B cannot cancel it as requester.
5. B accepts. Both users see the relationship under My connections.
6. Set B's display-name visibility to `friends` and private-profile mode on.
   A sees B's permitted display name/city; unrelated C retains the limited view.
7. Confirm `nobody` remains hidden even for A. `shared_activity` must retain its
   existing behavior (this feature does not expand that permission).
8. Remove from either account using the confirmation dialog.
   On return/focus the other account also refreshes.
9. Both may send a new request. Exercise cancel and reject independently.
10. Try duplicate and simultaneous opposite-direction sends; only one row may
    exist and the reverse pending state must be incoming, not a second request.
11. Confirm a private account never appears in suggestions.
12. Check no-avatar/broken-avatar initials, error/retry states, disabled mutations,
    keyboard and remove dialog, ES/EN, dark/light, desktop and mobile.
13. Smoke-check unchanged login, profile/header avatar, language/theme,
    activities/Explore/join/leave/edit/cancel/participants/history/reviews.

## Automated checks

```sh
node --test artifacts/api-server/tests/connections.test.mjs
pnpm --filter @workspace/outfy run typecheck
PORT=22608 BASE_PATH=/ pnpm --filter @workspace/outfy run build
pnpm --filter @workspace/api-server run typecheck
NODE_ENV=production pnpm --filter @workspace/api-server run build
git diff --check
```

The route tests bundle the actual router with an isolated fake database and
session boundary. They validate behavior and authorization without any Supabase
connection or real account writes. They do not replace PostgreSQL migration or
live two-account verification.
