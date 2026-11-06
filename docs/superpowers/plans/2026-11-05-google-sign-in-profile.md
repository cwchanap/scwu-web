# HPA-768 — Google sign-in and profile page — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-768/google-sign-in-and-profile-page
**Design:** `docs/superpowers/specs/2026-11-05-google-sign-in-profile-design.md`
**Status:** planning only. The current draft PR contains these two documents,
not the finished feature.

## Delivery rule

Implement every phase below on **this same HPA-768 draft PR**. Do not
open a second PR for API, UI, setup or tests. Keep the PR in draft until
the implementation, tests, and required owner deployment setup are
complete. HPA-771 (Achievements), HPA-767 (Cheats) and the separate
achievement icon art ticket are explicitly outside this PR.

## Ground truth from the repository

- `src/App.svelte` owns the single floating Menu and native
  `<dialog>`; its Controls guide link already opens a separate tab.
- `instructions.html`, `src/instructions/main.ts` and
  `Instructions.svelte` establish the independent Svelte page, visual
  tokens, hash behavior, and close-or-return back link.
- `vite.config.ts` has two Vite HTML entries; add a third rather
  than switching framework or changing the game entry.
- `wrangler.jsonc` currently serves `dist/` as static assets with
  no Worker `main` or D1. Cloudflare's default asset-first routing
  serves the HTML page and sends unmatched `/api/*` requests to the
  script; its default HTML handling makes `/profile` canonical.
- `bun run validate` includes asset export, format, lint, types and
  unit tests; e2e uses a built `dist/` and external R2 fixtures.

## Phase 1 — Minimal Worker API and D1

**Create:** `migrations/0001_users.sql`,
`src/worker/index.ts`, `src/worker/auth.ts`,
`src/worker/auth.test.ts` (file layout can be kept smaller if
readability allows).

**Modify:** `wrangler.jsonc`, `package.json`, `bun.lock`.

- [ ] Add the one `users` table from the design. Use the verified
  Google `sub` as primary key; preserve `created_at` on upsert.
- [ ] Add a Worker entry point dispatching exactly:
  `POST /api/auth/google`, `POST /api/auth/signout`,
  `GET /api/me`. Use ordinary `Response.json`; return `404`
  for other API paths. No routing framework.
- [ ] Verify GIS ID tokens against Google's JWKS, with signature,
  `iss`, `aud`, `exp` and `sub` checks. Prefer `jose`
  over hand-written JWT verification. Accept only the configured
  `GOOGLE_CLIENT_ID`.
- [ ] Upsert a user on login, then sign a short-lived
  `scwu_session` cookie using `SESSION_SECRET`.
  `GET /api/me` verifies the session, looks up the user and returns
  either its profile or `null`. Signout expires the cookie.
  Do not store Google tokens or introduce a session table.
- [ ] Add the D1 binding and runtime variable/secrets interface in
  Wrangler configuration. **Provision the real D1 ID first** (or
  leave enabling that binding for the owner-setup checkpoint);
  never commit an invented database ID, and keep secrets out of git.
  Keep static assets, R2 and `previews` as they are.
- [ ] Unit-test a known-good signature with a test JWKS; tampered
  signature, wrong audience/issuer, expired token and absent `sub`.
  Test cookie expiry/tampering, missing cookie, session lookups,
  repeat upsert preserving `created_at`, and signout.
  Use a mock D1/JWKS, not live Google or production secrets.

**Checkpoint:** Worker code has no dependency on Phaser or generated
game assets; `bun run check` and focused Vitest tests pass.

## Phase 2 — Small shared auth client and standalone profile

**Create:** `profile.html`, `src/profile/main.ts`,
`src/profile/Profile.svelte`, `src/auth/api.ts`
(and focused tests when the API client warrants them).

**Modify:** `vite.config.ts`.

- [ ] Register `profile.html` as the third HTML entry. Mount
  `Profile.svelte` independently with Svelte 5, as the guide does.
- [ ] In `src/auth/api.ts`, define `ProfileUser` and same-origin
  `getMe()`, `signInGoogle(credential)` and `signOut()` calls.
  Both pages import this module; neither owns global session state.
  Do not save the credential or user in `localStorage`.
- [ ] Reuse the guide's fonts, background (`ASSET_BASE` select art),
  gold title, navy panels, responsive layout and Back to game logic,
  without importing its fighter/moves modules.
- [ ] Build the left identity card, Profile nav and three Profile
  rows exactly as HPA-768 requests (name, signed in with Google,
  playing since). Show signed-out, loading and simple error states.
  No Achievements stub or count.
- [ ] Only when `VITE_GOOGLE_CLIENT_ID` is set, load GIS on the
  profile page and register the credential callback. POST that
  credential to the Worker, then refresh the user; signout calls
  the session endpoint and clears the view. If not configured,
  display "Sign-in unavailable" instead of a broken widget.
- [ ] Confirm both `profile.html` on Vite dev and `/profile` on
  Cloudflare render. Leave `#achievements` for HPA-771.

**Checkpoint:** Profile build is independent of Phaser; signed-out
UI renders in a no-credentials environment.

## Phase 3 — Identity-only game Menu row

**Modify:** `src/App.svelte`, the relevant menu tests, and
`e2e/smoke.spec.ts` for the default unconfigured path.

- [ ] Gate the Profile row behind the build-time
  `VITE_GOOGLE_CLIENT_ID`. Insert it **above** Opponent.
- [ ] When enabled, display signed-in avatar/name or
  "Not signed in", and a **Profile ↗** link opening
  `profile.html` with `target="_blank" rel="noopener"`.
  Match existing menu styles and stay within the 400 px dialog.
- [ ] Fetch `/api/me` through the shared client when the Menu opens;
  reopening after login/logout in the second tab refreshes the
  identity. Failure should degrade to the signed-out presentation.
  Do not load GIS or initiate sign-in from the game.
- [ ] Test the hidden row when unconfigured and the enabled
  signed-in/signed-out views using mocked API calls. Add a small
  E2E assertion for the default hidden state, preserving the
  existing game and Controls guide smoke checks.

**Checkpoint:** Opening/closing Menu still freezes and resumes
the scene exactly as before. No match or input behavior changes.

## Phase 4 — Owner setup, docs and verification

**Modify:** `README.md` (the existing Cloudflare deploy section).
No generated asset files or secrets should be committed.

- [ ] Document creating the Google OAuth **Web** client and adding
  the exact production, preview and localhost JavaScript origins.
  Record how to set matching `VITE_GOOGLE_CLIENT_ID` (build)
  and `GOOGLE_CLIENT_ID` (Worker), and how to set
  `SESSION_SECRET` as a Worker secret.
- [ ] Document creating a D1 database, setting its actual
  `database_id` and `DB` binding in Wrangler, running the
  users migration locally and on the target environment, and
  testing the configured Worker with `wrangler dev`.
  Preview environments need their own binding/configuration.
  Do not guess an ID or write to production without owner setup.
- [ ] Run `bun run validate`, `bun run build`, then
  `bun run e2e` (with the repo's normal exported assets/CI
  fixtures). Fix any failures in this same PR.
- [ ] Manually smoke-test in a configured preview: open game and
  Menu, click Profile ↗, sign in through Google, reload profile,
  return to the still-running game and reopen Menu to see identity,
  sign out in profile, reopen Menu to see "Not signed in".
- [ ] Confirm `/profile` serves the built page, the API doesn't
  accidentally serve HTML, unauthorized `/api/me` returns
  `user: null`, and production art/R2 URLs are untouched.
- [ ] Only after implementation and successful checks, update
  this draft PR's body with real verification evidence and mark
  it ready for review.

## Review checklist

- [ ] Every scope bullet and decision in the **latest**
  HPA-768 description is implemented without changing its boundaries.
- [ ] Google verification and session checks live in the Worker,
  not in browser code; secret is never published in the bundle.
- [ ] D1 is the only user store; first sign-in date persists.
- [ ] Menu can reflect account changes without page reload and
  without pausing/restarting the game outside its normal dialog.
- [ ] Disabled/unconfigured deployments still pass current CI.
- [ ] One implementation PR total, with tests and README update.
- [ ] No achievements, cheats, additional provider, profile editing,
  new art, audio, or unrelated refactoring.

## Deferred and known tradeoffs

- A signed stateless cookie has no server-side per-device revocation;
  sign-out clears the local cookie and natural expiry bounds its life.
  That matches the ticket's deliberately small auth scope.
- Local Vite does not proxy `/api` by default; use an actual local
  Wrangler Worker (or an explicit dev proxy only if required while
  implementing) for real auth tests. No credentials are necessary
  for the unconfigured CI path.
- Production/preview sign-in cannot be smoke-tested until the owner
  creates OAuth credentials, a D1 binding and the session secret.
  Do not claim that testing happened before those exist.
