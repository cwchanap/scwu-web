# HPA-768 — Google sign-in and profile page — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-768/google-sign-in-and-profile-page
**Design:** `docs/superpowers/specs/2026-11-05-google-sign-in-profile-design.md`
**Status:** design/plan only. The PR is not an implemented feature.

## One-PR delivery and scope

Use the **existing HPA-768 draft PR** for every phase below: Worker,
D1, page, Menu, docs and tests. Do not open separate PRs.
HPA-771 (Achievements), HPA-767 (Cheats), achievement icons and
gameplay changes remain separate. No router, additional auth provider,
new Worker service, sessions table or front-end auth framework.

## Repository facts that shape the plan

- `src/App.svelte` owns the floating Menu, native `<dialog>` and
  new-tab Controls guide link.
- `instructions.html`, `src/instructions/main.ts` and
  `Instructions.svelte` establish Vite's separate Svelte page and
  select-screen look. Their styles are currently component-local.
- `vite.config.ts` has exactly two Vite HTML entries;
  `wrangler.jsonc` currently serves `dist/` with no `main` or D1.
- `scripts/export_assets.py:dom_art()` finds the versioned R2 art
  published for DOM usage by scanning only specific Svelte/TS sources;
  moving `select/15.png` to a shared helper without updating that
  scan will cause a **production-only 404**.
- `scripts/build.sh` checks the exact exporter fingerprint against
  the R2-hosted `generated.tar.gz`. Pushing an exporter change before
  uploading its corresponding data breaks Workers Builds.
- `vite.config.ts` uses Vitest's Node environment with
  `isolate: false`; do not mutate global fetch or install a Svelte
  component-test harness.
- All three GitHub Actions workflows skip **draft PRs**. Until ready
  for review, local `validate` / build / e2e results are the
  verification evidence; Cloudflare's automatic Preview build is
  not a substitute for those jobs.

## Phase 0 — Owner configuration and local-development decisions

**Owner setup gate:** create the cloud resources and choose the
exact origins **before relying on the first integrated Preview**.
Coding can start without credentials, but never declare a preview
integration test successful before these inputs are provisioned.

- [ ] Create a Google OAuth **Web** client and register exact
  JavaScript origins: the actual production origin, stable Preview
  branch alias
  `https://jack65786656-hpa-768-google-sign-in-and-profile-page-scwu-web.cwchanap.workers.dev`,
  and `http://127.0.0.1:5173` for local Vite (use its actual port).
  No wildcard origins. Do not register per-deployment URL aliases
  such as `https://a415e97d-scwu-web.cwchanap.workers.dev`;
  they change every push. Google changes may take minutes/hours
  to propagate.
- [ ] Create two D1 databases, `scwu-web` (production) and
  `scwu-web-preview` (shared across Previews); record their
  **real** IDs. Previews must not write production user data.
- [ ] Set `SESSION_SECRET` as a Worker secret separately for
  production and Preview (or a Previews Base secret for future
  branches), using at least 32 UTF-8 bytes. Never commit it.
- [ ] Supply `VITE_GOOGLE_CLIENT_ID` as a **build** variable
  for production and Preview builds. Once the real, public client
  ID is known, commit the same ID under both
  `vars.GOOGLE_CLIENT_ID` and
  `previews.vars.GOOGLE_CLIENT_ID` in `wrangler.jsonc`.
  Do **not** set the runtime client ID only in the dashboard:
  `wrangler deploy` overwrites dashboard runtime vars.
  Do not fabricate an ID while planning.
- [ ] When the migration exists (Phase 1), apply it to
  production and Preview, using a tiny separate
  `wrangler.preview-migrations.jsonc` to target the Preview
  database by its real ID. Confirm both migration targets
  against the bindings before running a remote command.

**Local dev decision (no future architecture choice):** Vite on
`127.0.0.1:5173` proxies `/api` to Wrangler on
`127.0.0.1:8787`. Implement `server.proxy` in
`vite.config.ts` and use two terminals:

```sh
mkdir -p dist
bunx wrangler d1 migrations apply DB --local
bunx wrangler dev --port 8787
# in another terminal
bun run dev
```

Put local `SESSION_SECRET` in `.dev.vars`; add it to
`.gitignore`. The public Google client ID comes from committed
Wrangler vars / Vite `VITE_GOOGLE_CLIENT_ID`; do not paste it
into a secrets store. `bun run dev` continues to work with
no credentials (Profile Menu row hidden).
Avoid `@cloudflare/vite-plugin`: the repository's `dist/`,
`build.sh` and e2e layout are already established.

## Phase 1 — Worker API, migration and minimal HTML entry

**Create:**
`migrations/0001_users.sql`,
`src/worker/index.ts`,
`src/worker/auth.ts`,
`src/worker/auth.test.ts`,
`profile.html`,
`src/profile/main.ts` (a minimal "Sign-in unavailable"
page can be replaced in Phase 2),
and (after real Preview ID is known)
`wrangler.preview-migrations.jsonc`.

**Modify:**
`wrangler.jsonc`, `vite.config.ts`,
`package.json`, `bun.lock`, `.gitignore`.

- [ ] Add the real migration:
  `users(google_sub TEXT PRIMARY KEY, display_name TEXT NOT NULL,
  avatar_url TEXT, created_at TEXT NOT NULL
  DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`.
  The timestamp must be ISO 8601 UTC, not SQLite's space-separated
  `CURRENT_TIMESTAMP`.
- [ ] Add `main: "src/worker/index.ts"`, keep static
  `assets.directory = "./dist"`, and add production
  `d1_databases` plus `previews.d1_databases` with the
  real and **different** D1 IDs. Configure public
  `vars.GOOGLE_CLIENT_ID` and `previews.vars.GOOGLE_CLIENT_ID`
  once the real value exists. No fake credentials or IDs.
- [ ] Add exactly three API endpoints: `POST /api/auth/google`,
  `POST /api/auth/signout` and `GET /api/me`, with
  `Cache-Control: no-store` JSON. Unsupported API routes
  return JSON 404. Preserve asset-first routing: no SPA fallback.
- [ ] **Configuration guard at entry to every `/api/*`:**
  require `DB`, nonempty `GOOGLE_CLIENT_ID`, and a
  `SESSION_SECRET` at least 32 **UTF-8 bytes** long.
  For an absent item return 500
  `{ "error": "missing <BINDING_NAME>" }` (or equivalent
  clear invalid-secret error); never sign with `undefined`
  or an empty string. An unconfigured worker should fail
  loudly, while the game remains usable.
- [ ] Use `jose` to verify Google's JWKS (only `RS256`).
  Require correct `aud`, unexpired `exp`, nonempty
  `sub`, and issuer in
  `['accounts.google.com', 'https://accounts.google.com']`.
  Upsert by `sub`; display name falls back from
  `name` to `given_name` to `"Player"`. Never store
  the ID token or email as the user ID.
- [ ] Use `jose` HS256 to issue and validate the
  `scwu_session` cookie with `sub` and seven-day expiry.
  `HttpOnly; SameSite=Lax; Path=/; Secure` on HTTPS.
  `GET /api/me` returns `{user: null}` for absent,
  expired or invalid cookies and reads D1 for authenticated
  users. Sign-out expires the cookie. No session table.
- [ ] Expose `handle(request, env, keys)` or an equivalent
  injectable key verifier; define a tiny local `Env` interface
  for the D1 methods needed and two runtime strings.
  Do not add a second TypeScript project or global mocks.
- [ ] For SQL tests, create a minimal adapter over
  `node:sqlite` `DatabaseSync` that implements the small D1
  `prepare().bind().first()/run()` surface. Run the
  **real migration and upsert SQL**. Use a Node runtime with
  `node:sqlite` available in local tests and CI.
- [ ] For JWT tests, inject a local `jose`
  `createLocalJWKSet` backed by `generateKeyPair('RS256')`.
  Test both valid issuers, wrong issuer/audience, expired and
  tampered tokens, missing `sub`, display name fallback,
  cookie tampering/expiry, D1 upsert preserving
  `created_at`, missing config returning 500, sign-out,
  and unauthenticated `GET /api/me`.
- [ ] Add the third Vite HTML input and minimal mounted Svelte
  profile shell now so `/profile` exists on the first
  Preview API deployment. Add the Vite dev proxy here.

**Early Preview checkpoint, once Phase 0 is configured:**

```sh
curl -i https://<stable-preview-alias>/api/me
# HTTP 200, JSON {"user":null}
curl -i https://<stable-preview-alias>/profile
# HTTP 200, HTML (not a Worker API error)
```

Without Phase 0, `/api/me` must return the explicit
configuration **500**, not a successful auth response. Check
preview bindings and migration before relying on sign-in.
The Preview deployment build succeeding by itself does not
prove D1 or Google origin configuration.

## Phase 2 — Shared page styles, auth client, profile UI

**Create:** `src/auth/api.ts`,
`src/auth/api.test.ts`,
`src/profile/Profile.svelte`,
`src/instructions/page.css`, `src/instructions/page.ts`.

**Modify:** `src/instructions/main.ts`,
`src/instructions/Instructions.svelte`,
`src/profile/main.ts`,
`scripts/export_assets.py` (narrow `dom_art()` scan only).

- [ ] Move only generic guide fonts, colors, body
  background, Back link, and panel styles to a shared
  `page.css` imported by both standalone entry points.
  Keep fighter/roster-specific rules in
  `Instructions.svelte`. Move the backdrop art CSS-property
  setup and the close-or-game-root back handler to `page.ts`.
  This is a move, not a visual redesign.
- [ ] Expand `dom_art()`'s scan to include the shared
  `page.ts`, profile Svelte sources and any TS sources
  naming profile DOM art. Test that `published_files()`
  still contains `select/15.png` and every new source-art
  path. Local `public/assets/` is not proof: production
  serves the **versioned R2 publish list**.
- [ ] **Exporter upload gate:** modifying
  `scripts/export_assets.py` changes the
  `generated.tar.gz` fingerprint in
  `scripts/build.sh`. Before pushing that
  commit, re-export and arrange `bun run upload:r2` so
  matching data reaches the bucket first. Do **not** write
  to the production R2 bucket without explicit owner
  authorization. If upload cannot be authorized, do not
  push the incompatible exporter change.
- [ ] Define `ProfileUser` with ISO 8601 UTC
  `createdAt`; implement the shared same-origin
  `getMe()`, `signInGoogle(credential)` and
  `signOut()`. Inject `fetch` for Node tests instead
  of modifying the global. `getMe()` returns
  `null` for network errors, non-2xx or invalid/non-JSON
  bodies (including Vite's HTML fallback). Do not
  cache the credential or user in `localStorage`.
- [ ] Build the identity card (name, avatar, sign-in/out),
  Profile nav, and three Profile rows (name, Google,
  playing since); follow the guide's back behavior and
  responsive layout. Leave Achievements to HPA-771;
  no placeholder screen or count.
- [ ] Load GIS **only in the profile entry** when
  `VITE_GOOGLE_CLIENT_ID` exists. Exchange its ID token
  with the Worker; refresh `me` after sign-in and
  sign-out. When unconfigured, render
  "Sign-in unavailable" without requesting GIS.
- [ ] E2E (no credentials): open `/profile.html`,
  assert "Sign-in unavailable" and no page errors.
  Ensure the guide is still styled and production
  backdrop URLs remain published.

## Phase 3 — Game Menu identity (no sign-in here)

**Modify:** `src/App.svelte`,
`src/menu.ts` and focused pure tests if useful,
`e2e/smoke.spec.ts`.

- [ ] Insert the Profile row at the top of the existing
  Menu **only when** `VITE_GOOGLE_CLIENT_ID` is
  configured. With no build variable, make no
  `/api/me` request from the game.
- [ ] On each Menu open, request `getMe()` and
  display avatar/name when signed in, otherwise
  "Not signed in". This catches sign-in/out from the
  other tab when Menu is reopened. No polling or
  cross-tab store.
- [ ] Link "Profile ↗" to `profile.html` with
  `target="_blank" rel="noopener"`, matching the
  existing Controls guide. The running game stays
  untouched, with its normal modal pause behavior.
- [ ] Test pure helper/client decisions in Node,
  **not** Svelte components (no DOM harness installed).
  E2E checks that Profile is absent in the
  unconfigured Menu and that existing Controls/Menu
  gameplay works. Manual Preview smoke test covers
  configured signed-in and signed-out UI.

## Phase 4 — Docs, verification, ready-for-review gate

**Modify:** `README.md` with the final concrete
Google/D1/Preview/local setup and validation steps.

- [ ] Explain OAuth origins (stable alias, not per-deployment
  URL); `vars` vs `VITE_*` build variables;
  production and Preview D1 IDs; separate
  `SESSION_SECRET` settings and `.dev.vars`.
- [ ] Explain local `bun run dev` plus
  `bunx wrangler dev --port 8787` setup, local D1
  migration, and the separate Preview migration config
  pointing at the **same** database as the
  `previews.d1_databases` binding. Include safe remote
  migration commands and the R2 exporter upload gate.
- [ ] Run `bun run validate`, `bun run build`,
  then `bun run e2e`. Record actual results on this
  draft PR. Do not mistake Cloudflare Preview deploy
  for the GitHub Actions jobs: all three **skip drafts**.
- [ ] With the owner's configured Preview, test real
  Google login, profile reload, name/avatar in the
  reopened game Menu, sign-out, and no gameplay restart.
  Check `/profile`, API JSON, expiry behavior and
  Preview D1 isolation from production.
- [ ] After successful implementation checks and owner
  setup, update the PR's checklist, mark **this same PR**
  ready for review, and use its GitHub Actions runs as
  the final CI gate.

## Review focus / explicit non-goals

- [ ] The latest HPA-768 ticket and the two docs agree.
- [ ] Fail loudly when runtime config missing; do not
  issue weak cookies. Session is signed/expiring, with
  no server-side revocation or additional token system.
- [ ] Both Google issuers accepted, name fallback works,
  date is UTC ISO 8601, Google `sub` is the key.
- [ ] All D1 writes use the proper production/Preview
  binding, with a real migration.
- [ ] Shared page CSS does not pull in fighter data;
  the exporter still publishes the backdrop.
- [ ] No changes to the 10 ms game simulation,
  gameplay tests, achievements, cheats, art design,
  or unrelated refactoring.
