# HPA-768 — Google sign-in and profile page — design

**Status:** proposed; implementation has not started.
**Ticket:** https://linear.app/cwchanap/issue/HPA-768/google-sign-in-and-profile-page
**Follow-up:** HPA-771 (Achievements) builds on this account/session API.
**Delivery:** one draft PR for HPA-768, expanded to include the implementation before it is marked ready.

## Intent and constraints

Give players a lightweight Google account and a separate profile page without
interrupting a running match. The game only displays the current signed-in
identity. Sign-in and sign-out live entirely on the profile page.

- Keep Svelte 5 + Vite's multi-page pattern, the existing Cloudflare Worker
  and D1. No SvelteKit, SPA router, third-party auth service or new deployment.
- Match the Controls guide's select-screen backdrop, fonts, gold headings,
  dark navy panels and "◂ Back to game" behavior.
- Do not load Google Identity Services (GIS) in the game bundle.
- If the public Google client ID is absent at build time, hide the Menu's
  Profile row entirely. Existing local development and CI stay usable.
- Do not change Phaser, match rules, asset export, controls or game state.
- HPA-771 owns Achievements (including the `#achievements` route, progress
  summary, storage, and menu count); HPA-767 owns Cheats. Neither is built here.

## Chosen approach

1. **Standalone page rather than a modal or router.** Add `profile.html`,
   `src/profile/main.ts` and `src/profile/Profile.svelte`. Register the
   HTML entry alongside `index.html` and `instructions.html` in
   `vite.config.ts`. As with the Controls guide, the Menu links to
   `profile.html` in a new tab (`target="_blank" rel="noopener"`). This
   also works in Vite dev; the production Worker serves the built HTML
   at canonical `/profile` through its default HTML handling. A native
   hash (`#achievements`) can be added by HPA-771 without a router.
2. **One Worker rather than an auth service.** Add a small Worker entry
   `src/worker/index.ts` and API helpers alongside it. Keep `dist/` as
   static assets; requests without a matching asset reach the Worker. Only
   `/api/*` is dispatched; leave existing asset handling unchanged.
   Do not add an SPA fallback or a new domain.
3. **Google ID token exchange rather than a general OAuth framework.**
   Load GIS on the profile page only. Its browser callback sends the
   `credential` ID token to the same-origin Worker. Verify it using
   Google's published JWKS (a small maintained JWT library such as
   `jose`, not custom signature verification). Require a valid Google
   signature, issuer, audience, expiry and nonempty `sub`. Never use
   email as an account key and never persist the Google ID token.
4. **Stateless session rather than a sessions table.** After a valid Google
   token, the Worker upserts the user in D1 and sets its own signed,
   expiring cookie. The session carries the Google `sub`, not a Google
   token. The Worker verifies the cookie on every `/api/me` call and
   reads current user details from D1. Sign-out deletes the cookie.
   No custom identity sync or refresh-token flow.

These choices reuse the site's current patterns and leave just one account
identity for later achievement storage.

## UI behavior

### Game Menu — `src/App.svelte`

- With `VITE_GOOGLE_CLIENT_ID` configured, put **Profile** at the top
  of the existing `<dialog>`: avatar + name when signed in, or
  "Not signed in" when signed out, plus **Profile ↗**.
- Clicking the link opens a new tab, preserving the Phaser scene in
  the current tab. It does not sign the player in or out.
- Read `GET /api/me` with the shared client module when the Menu opens.
  Reopening after visiting the other tab updates its identity. Render
  "Not signed in" while logged out or if the request fails; don't
  poll or introduce cross-tab synchronization.
- Without the build-time client ID, render no row and make no auth API
  requests from the game.

### Profile — `/profile`

- Mirror `src/instructions/Instructions.svelte`'s presentation and
  back link. Attempt `window.close()` for a script-opened tab and
  fall back to the game root when the browser disallows closing.
- Left identity card: avatar (or placeholder), display name, and
  **Sign in with Google** / **Sign out**. Under it, a nav with
  **Profile** selected. HPA-771 adds the Achievements entry later;
  don't ship an empty or fake achievements screen now.
- The Profile content shows three rows: **Name**, **Signed in with**
  (Google), and **Playing since** (D1 account creation date).
  Signed-out state explains that Google sign-in is needed.
- GIS is loaded only when configured on this page. After a successful
  credential exchange, refresh the shared `me` response and swap the
  card from signed-out to signed-in. After sign-out, swap back.
- If visited directly without configuration, show a non-crashing
  "Sign-in unavailable" state; don't attempt to render GIS.

The profile page should import only the small asset-base helper needed
for its backdrop, not fighter data, move tables or Phaser.

## HTTP contract

All routes are same-origin and return JSON with `Cache-Control: no-store`.

| Request | Input | Output |
| --- | --- | --- |
| `POST /api/auth/google` | `{ "credential": "<GIS ID token>" }` | `200 { "user": ProfileUser }` and a signed session cookie; `401` for an invalid token |
| `POST /api/auth/signout` | No body required | `200 { "user": null }` and an expired cookie |
| `GET /api/me` | Signed cookie (optional) | `200 { "user": ProfileUser | null }`; missing, invalid or expired sessions return `null` |

`ProfileUser` is `{ name: string, avatarUrl: string | null,
createdAt: string }`. Keep the account's opaque Google subject on the
server; the achievements API will identify the caller by the verified
session, not by a client-supplied user ID.

Cookie: `scwu_session` with `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` on HTTPS, and a short fixed expiry (proposed: seven days).
Use an HMAC-signed JWT or equivalent signed payload with `sub` and
expiry; signing and verification use a Worker-only `SESSION_SECRET`.
Signing out clears this browser's cookie; server-side revocation of
previously copied cookies is out of scope.

## D1 model

One initial migration, e.g. `migrations/0001_users.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  google_sub TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Upsert by verified Google `sub`, updating name/avatar on repeat
sign-in and preserving `created_at` for "Playing since".
No email, password, achievements, sessions or separate internal user
ID tables are needed in this ticket.

## Configuration and release

- `wrangler.jsonc`: point `main` at the Worker entry and add a D1
  binding (`DB`) once the owner has created the database; retain
  `assets.directory = "./dist"` and existing preview configuration.
  The Worker handles `/api/*`; static files still take the asset path.
  Do not hardcode a fake D1 database ID.
- Public Google web client ID is configured in **both** Vite build
  (`VITE_GOOGLE_CLIENT_ID`, for UI/GIS) and Worker runtime
  (`GOOGLE_CLIENT_ID`, for JWT audience). They must match.
  `SESSION_SECRET` is a Worker secret, never a Vite variable.
- The owner creates the OAuth web client with localhost, production and
  relevant preview JavaScript origins, D1, and the secret before enabling
  auth on a deployed environment. Add exact setup/migration commands to
  `README.md` as part of implementation, including local D1 testing.
- Keep the original assets/R2 and Workers Builds path unchanged. With no
  Google client ID, the public profile entry remains harmless and the
  game does not expose the Profile row.

## Validation and boundaries

- Unit tests: valid/invalid issuer, audience, expiry and signature;
  malformed credentials; signed/expired/tampered cookies; signed-out
  response; D1 upsert preserving "Playing since"; shared client results.
  Mock JWKS/D1; no real Google token or production account needed in CI.
- E2E: without credentials, the Menu lacks Profile and the game works;
  with configured staging credentials, the profile opens in a new tab,
  sign-in survives reload, Menu shows the refreshed avatar/name, and
  sign-out restores signed-out state.
- Completion gates: `bun run validate`, `bun run build`, and
  `bun run e2e` pass after the implementation, plus a real preview
  smoke test after owner setup. The docs-only draft cannot claim them.
- Explicit non-goals: providers besides Google, edit/delete account,
  profile stats, achievements, global auth stores, token refresh,
  elaborate CSRF/session-revocation hardening, and any game change.

## References

- Cloudflare static assets and HTML handling:
  https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- Cloudflare Worker script routing:
  https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- Google's server-side ID-token validation:
  https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
