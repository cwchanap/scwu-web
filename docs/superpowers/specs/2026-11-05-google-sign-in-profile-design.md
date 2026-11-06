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
- Do not change Phaser, match rules, controls or game state. A narrow
  exporter source-scan adjustment is permitted only to keep shared-page
  artwork published; do not change the asset formats.
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
   Google's published JWKS and `jose`, not custom verification. Pin
   `RS256`; require audience, expiry, a nonempty `sub` and either valid
   issuer (`accounts.google.com` or `https://accounts.google.com`).
   Use the verified `name`, else `given_name`, else `"Player"` as the
   display name; never use email as an account key or persist the token.
4. **Stateless session rather than a sessions table.** After a valid Google
   token, the Worker upserts the user in D1 and sets its own signed,
   expiring cookie. The session carries the Google `sub`, not a Google
   token. Use `jose` HS256 with a Worker-only secret of at least 32
   UTF-8 bytes; the Worker verifies the cookie on every `/api/me`
   call and reads user details from D1. Sign-out deletes the cookie.
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
  "Not signed in" while logged out or if the request fails (network
  error, non-2xx or invalid/non-JSON body); don't poll or introduce
  cross-tab synchronization.
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
createdAt: string }`; `createdAt` is an **ISO 8601 UTC** string
(e.g. `2026-11-06T05:53:34Z`) to avoid browser-local SQLite date parsing.
Keep the Google subject on the server; HPA-771 identifies the caller by
the verified session, never by a client-provided account ID.

Cookie: `scwu_session` with `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Secure` on HTTPS, and a short fixed expiry (proposed: seven days).
Use a `jose` HS256 JWT with `sub` and expiry; signing and verification
require a Worker-only `SESSION_SECRET` of at least 32 UTF-8 bytes.
Signing out clears this browser's cookie; server-side revocation of
previously copied cookies is out of scope.

## D1 model

One initial migration, e.g. `migrations/0001_users.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
  google_sub TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
```

Upsert by verified Google `sub`, updating name/avatar on repeat
sign-in and preserving UTC `created_at` for "Playing since".
No email, password, achievements, sessions or separate internal user
ID tables are needed in this ticket.

## Configuration, preview isolation and local development

**Public client ID is committed config, not a dashboard runtime variable.**
Once the owner creates the real OAuth web client, commit its non-secret
ID to `wrangler.jsonc` in both `vars.GOOGLE_CLIENT_ID` (production)
and `previews.vars.GOOGLE_CLIENT_ID`; keep them equal. Wrangler deploys
override dashboard-set plaintext runtime vars unless `keep_vars` is
enabled, which this project does not use. The same public ID must be
provided separately as `VITE_GOOGLE_CLIENT_ID` to the production
and Preview **builds** so Vite can gate the Menu and initialize GIS.
Do not commit a placeholder or invented client ID.

- Add `main: "src/worker/index.ts"` alongside the existing static
  `assets.directory = "./dist"`; the normal asset-first routing
  serves `/profile` and invokes the Worker on unmatched `/api/*`.
  Do not use an SPA fallback or add a routing service.
- Bind production `DB` under top-level `d1_databases` to the real
  `scwu-web` D1 database, and Preview `DB` under
  `previews.d1_databases` to a **separate, shared**
  `scwu-web-preview` database. This avoids preview writes to
  production rows. Real database IDs are committed after provisioning.
  A tiny `wrangler.preview-migrations.jsonc` with a top-level
  binding to that same preview DB allows Wrangler's migration command
  to target it safely.
- `SESSION_SECRET` is never committed. Set it as a Worker secret
  separately for production and Preview (or use Cloudflare's
  Previews Base secret for future previews). Both environments require
  the same *name*, not the same secret value.
- **Fail explicitly when unconfigured.** Every `/api/*` request
  first checks `DB`, `GOOGLE_CLIENT_ID`, and a
  `SESSION_SECRET` at least 32 UTF-8 bytes long. If absent or
  invalid, respond with HTTP 500 and JSON
  `{ "error": "missing SESSION_SECRET" }` (or the corresponding
  binding/variable name), not an unsigned/empty-key session. The
  Menu's `getMe()` degrades to signed-out. After proper setup,
  an unauthenticated `GET /api/me` returns
  `{ "user": null }`.
- **Phase-zero setup:** before relying on the first integrated
  Preview, the owner registers the exact production origin, the
  branch's stable Preview alias, and the local
  `http://127.0.0.1:5173` origin with Google; creates both D1
  databases; applies the migration to both; sets the Worker secrets
  and Vite build variables. Google origin changes can take time to
  propagate. The per-deployment Preview URLs change each push and
  must **not** be used for GIS sign-in.
- Local development uses `vite.config.ts`'s
  `server.proxy['/api'] = 'http://127.0.0.1:8787'` and two
  processes: `VITE_GOOGLE_CLIENT_ID=<public-id> bun run dev` and
  `bunx wrangler dev --port 8787` (create an empty `dist/`
  first if required by the static asset config). Apply
  `bunx wrangler d1 migrations apply DB --local`.
  Put the local `SESSION_SECRET` in gitignored `.dev.vars`.
  Wrangler's runtime vars do not populate the separate Vite
  process; omit the public Vite variable when unconfigured.
  Avoid `@cloudflare/vite-plugin` and its different output path.
- Keep the original R2 asset publication and Workers Builds path.
  `README.md` records owner setup, migration commands, local
  development and Preview secrets/variables.

## Shared page styling and asset publication

The guide's colors, fonts, backdrop, `.back` and `.panel`
styles currently live inside `Instructions.svelte`; importing that
component would pull in unrelated fighter/move data. Move only the
generic page styles to `src/instructions/page.css` imported by both
entry points, and the shared backdrop asset-property setup and
close-or-return handler to `src/instructions/page.ts`. Keep the
guide's fighter-specific styles where they are.

`scripts/export_assets.py:dom_art()` currently scans
`App.svelte`, `src/instructions/*.svelte` and
`src/instructions/moves.ts`. When moving the `select/15.png`
string to `page.ts` and adding the profile page, extend the scan
to `page.ts` and `src/profile/*.svelte` (and any profile TS files
that name source-art paths). Verify the versioned `published_files()`
still includes `select/15.png` and any new DOM art, preventing
production-only 404s. Updating `export_assets.py` changes the
build fingerprint: publish its new generated tarball/assets **before**
pushing the exporter change, but only with the owner's permission to
write to the R2 bucket. Never perform a production R2 upload as an
unannounced test.

## Validation and boundaries

- Worker unit tests run the **actual D1 SQL** against Node's
  `node:sqlite` through a tiny `prepare().bind().first()/run()`
  adapter; migrations and repeat upserts preserve `created_at`.
  Pin a Node version with `node:sqlite` in test environments.
- Test Google JWTs via dependency injection: `handle(request, env,
  keys)` accepts a JWKS verifier or local `jose` key set; never
  stub global `fetch` because Vitest uses `isolate: false`.
  Exercise valid tokens (including both issuers), expired/tampered
  tokens, wrong issuer/audience, missing `sub`, display-name
  fallback, signed/expired/tampered cookies, and failed config.
- Test the shared API client in Node with **injected fetch**:
  `getMe()` returns `null` on network errors, non-2xx
  responses and unexpected HTML/non-JSON bodies. No Svelte
  component-test dependency is needed; `src/menu.ts` pure
  helpers and browser smoke tests cover the Menu branch.
- E2E without credentials checks both that the Menu hides Profile
  and that `/profile.html` renders "Sign-in unavailable" without
  page errors. With owner-configured Preview, manually smoke-test
  Google sign-in, persisted cookie, game identity refresh,
  sign-out, `/profile`, `/api/me` and Preview D1 isolation.
- `bun run validate`, `bun run build`, and
  `bun run e2e` must pass after implementation. The three
  GitHub Actions jobs **skip draft PRs**; checks must run
  locally until the PR is marked ready. The docs-only draft
  cannot claim verification.
- Non-goals: providers besides Google, edit/delete account,
  profile stats, achievements, global auth stores, token refresh,
  elaborate CSRF/session revocation, and gameplay changes.

## References

- Cloudflare static assets and HTML handling:
  https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/
- Cloudflare Worker script routing:
  https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- Cloudflare Preview variables/secrets:
  https://developers.cloudflare.com/workers/previews/configuration/
- Cloudflare Preview D1 binding and migration isolation:
  https://developers.cloudflare.com/workers/previews/resources/
- Google's server-side ID-token validation:
  https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
