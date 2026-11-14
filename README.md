# SCWU Web MVP

Browser fighting-game prototype rebuilt from reverse-engineered data of the Windows game SCWU: 45 fighters (Ryuko … RARIO, TRAINING) on 18 stages, behind the original's title, character select, story mode and continue screens, plus free practice and Vs. CPU. Each fighter's moves play from their own recovered action scripts and command table. Built with TypeScript, Svelte 5, Phaser 4, Vite and Vitest.

## Run

Use Bun 1.3.9+, Node 24.12+ for the tooling CLIs, and Python 3.10+. Keep the supplied `scwu-web-handoff/` directory beside `package.json`.

```sh
bun install
bun run dev      # exports the needed art, then serves on localhost
```

The browser needs no Python, Windows runtime, original executable or backend.

```sh
bun run assets   # export art/JSON/fixtures (needed once before test/check)
bun run test     # Vitest (not `bun test`, which runs Bun's own runner)
bun run check    # svelte-check + tsc
bun run validate # assets, format, ESLint, types, Vitest (the pre-commit hook runs this)
bun run build    # assets, types, production build
bun run preview  # serve the production build
bun run e2e      # Playwright suites; the web server builds dedicated dist-e2e-* bundles (run assets first)
```

`bun run assets` skips the export while its script, the handoff and the DOM-named art paths are unchanged and its output is intact; a half-finished or modified export re-runs. `bun install` installs Husky's pre-commit hook.

## Deploy to Cloudflare

The Worker serves `dist/` and handles the sign-in API with a D1 binding (`wrangler.jsonc`). The art and audio live in a public R2 bucket by the owner's choice, and the page loads them from `VITE_ASSET_BASE` (`src/game/assetBase.ts`; unset, from this site's own `/assets/`). Cloudflare's build has no `scwu-web-handoff/`, so `scripts/upload_r2.sh` also uploads `src/game/generated/` as `generated.tar.gz`, which `bun run build` (`scripts/build.sh`) downloads when `WORKERS_CI` is set.

One-time setup:

1. Create an R2 bucket with a public URL (a custom domain; `r2.dev` is rate-limited).
2. Allow cross-origin reads for WebGL: `wrangler r2 bucket cors set <bucket> --file scripts/r2_cors.json`.
3. Create an R2 API token with Object Read & Write, then upload (needs the AWS CLI):

   ```sh
   bun run assets
   export R2_ACCOUNT_ID=... R2_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
   bun run upload:r2
   ```

4. In the Cloudflare dashboard, create a Worker named `scwu-web` from this repo. Keep the default build command (`bun run build`) and deploy command (`npx wrangler deploy`), and add the build variable `VITE_ASSET_BASE` set to the bucket's public URL.

Whenever the export changes: `bun run assets`, then `bun run upload:r2`, then push. The first deploy needs the upload before CI's e2e passes; if the push came first, re-run the failed build afterwards.

How the bucket is laid out:

- `upload:r2` puts the files listed in `src/game/generated/assets-version.json` under `<version>/` (the export's content hash) with `Cache-Control: public, max-age=31536000, immutable`. `assetBase.ts` appends the version to `VITE_ASSET_BASE`, so a new export is a new prefix and older builds keep working. The upload deletes nothing, and refuses to run on an unfinished or modified export (rerun `bun run assets`).
- `generated.tar.gz` and `fixtures.tar.gz` sit at the bucket root with `Cache-Control: no-cache`; `generated.tar.gz` goes up last.
- The Workers build refuses a commit whose `scripts/export_assets.py` does not match the tarball's `.exporter` fingerprint, so a forgotten re-upload fails the build. Workers Builds runs no tests, so a changed DOM-named art path also needs `upload:r2` before the push.
- Cloudflare's default cache skips `.wav`: add a Cache Rule on the bucket's custom domain matching `http.host` to the bucket's host and `http.request.uri.path.extension` to `wav`, with Cache eligibility set to Eligible for cache.
- Pack audio is WebAudio only; the loader skips sounds when there is no `AudioContext`.

Prune a version once no deployed build or CI run points at it (keep the previous one or two), using the setup-step-3 variables:

```sh
AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  aws s3 rm --recursive "s3://$R2_BUCKET/<version>/" --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Legacy root-level art from before packs (`ryuko/`, `text.png`, …) goes the same way. Never run `--recursive` on the bucket root, which also holds the tarballs and every version.

Builds of other branches (Worker Previews) do not inherit production settings: in the Worker's **Settings** → **Build**, add the same `VITE_ASSET_BASE` to the Previews build variables and set the Preview command to `npx wrangler preview` (`wrangler.jsonc` carries the Preview configuration it needs).

## Sign-in and profile

`profile.html` mounts `src/profile/` (the Menu's Profile ↗ link opens it in a new tab); the Worker entry `src/worker/` (`main` in `wrangler.jsonc`) answers only `/api/*` and every other unmatched path gets a plain 404 — `POST /api/auth/google` verifies a Google Identity Services credential against Google's published JWKS with `jose` (RS256 only, the configured client ID as audience, either `accounts.google.com` issuer form, `sub` and `exp` required), upserts the `users` row keyed by the Google `sub`, and sets `scwu_session`, an HS256 `jose` JWT cookie with `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` on HTTPS and a seven-day expiry; `POST /api/auth/signout` clears it; `GET /api/me` reads it. `migrations/0001_users.sql` is the only migration.

`wrangler.jsonc` contains the public Google client ID and D1 binding, but sign-in also needs the build variables, Worker secrets and database migration below. Missing configuration makes `/api/*` fail loudly — `500 {"error":"missing DB"}`, `"missing GOOGLE_CLIENT_ID"`, `"missing SESSION_SECRET"` or `"invalid SESSION_SECRET"` (under 32 UTF-8 bytes). Without `VITE_GOOGLE_CLIENT_ID`, the profile page renders "Sign-in unavailable" and makes no requests, and the Menu hides the Profile row and never calls `/api`. The game itself needs none of this.

Owner setup:

1. **Google OAuth Web client.** In Google Cloud Console, create an OAuth **Web** client and register exact JavaScript origins — no wildcards:
   - the production origin, `https://scwu.hapadona.com` (the `scwu-web` Worker's public site is `https://scwu.hapadona.com/`),
   - each branch's stable Preview alias (Previews are public unless access controls are configured),
   - `http://127.0.0.1:5173` for local `bun run dev` (use the port Vite actually prints).

   Never register a per-deployment Preview URL such as `https://a415e97d-scwu-web.cwchanap.workers.dev` — it changes on every push, so GIS sign-in would break on the next deploy. Google's origin changes can take minutes or hours to propagate.

2. **Separate D1 databases.** Production binds `DB` to `scwu-web`. Preview currently has no `DB` binding, so its API returns `missing DB` until an isolated `scwu-web-preview` database is created, migrated, and bound under `previews.d1_databases`. Never bind Preview to production data.

3. **One public client ID, two delivery paths.** `vars.GOOGLE_CLIENT_ID` (production) and `previews.vars.GOOGLE_CLIENT_ID` (Preview) are committed plaintext runtime vars — the audience the Worker verifies each Google token against; keep the two equal. `wrangler deploy` overwrites dashboard-set plaintext vars (this project does not use `keep_vars`), so setting them only in the dashboard loses them on the next deploy. `VITE_GOOGLE_CLIENT_ID` is a separate **build** variable — set it to the same public ID in the Worker's production and Previews build variables, and pass it to `bun run dev` locally — which Vite inlines into the bundle so the Menu's Profile row and the profile page's GIS button appear only when configured. It is a public identifier, not a secret: never store it with `wrangler secret put`.

4. **`SESSION_SECRET` per environment.** A Worker secret of at least 32 UTF-8 bytes (`openssl rand -base64 48` is fine), set separately for production (`bunx wrangler secret put SESSION_SECRET`, or the dashboard's Worker secrets) and for Previews (the Worker's Preview secrets, or a Previews Base secret for new branches). Base-secret changes do not update existing Previews; set the secret on an existing Preview separately. Each environment needs an independently generated value — a Preview deployment can read its own secret, so reusing production's would let it forge production sessions; only the name is shared. Never commit it. Locally it goes in the gitignored `.dev.vars` file (`SESSION_SECRET=...`); Vite's `server.fs.deny` already refuses to serve `.dev.vars*` and `.env*`.

5. **Apply `migrations/0001_users.sql`.** Use `bunx wrangler d1 migrations apply DB --local` for local development and `bunx wrangler d1 migrations apply DB --remote` once for the production database. Create a separate migration configuration targeting the Preview database by its real ID and apply the same migration to it separately. The remote command changes production data: confirm the target and check any existing `users` table's schema before applying it. The migration creates the table if absent; it does not modify an existing table to match.

Local development is two processes, since `vite.config.ts` proxies `/api` to `127.0.0.1:8787`: start `bunx wrangler dev --port 8787` in one terminal (it needs `dist/` to exist — run `bun run build` once or `mkdir -p dist` — and reads `.dev.vars` and the committed `vars`), and in another `VITE_GOOGLE_CLIENT_ID=<public-id> bun run dev`. Omit the variable for the unconfigured mode, which needs no second process at all. The proxy preserves the browser's `Host`, so the Worker's same-origin check on the mutation routes still passes, and `wrangler dev` binds `DB` to its local SQLite once the `--local` migration has run. Wrangler's vars do not reach the separate Vite process — supply the public build-time ID there explicitly.

The fingerprint check described in Deploy to Cloudflare applies after changes to `scripts/export_assets.py`: `bun run upload:r2` must run — with the owner's authorization — before pushing the new exporter. A Cloudflare Preview deploy is not one of the Actions jobs. Verify real Google sign-in, the Menu identity row and `/api/me` against a Preview after setup is complete.

## CI

GitHub Actions (`.github/workflows/`) runs on pushes to `main` and on ready-for-review pull requests: **Build and Lint**, **Run Unit Tests** and **Playwright Tests** (`e2e/`, against the dedicated configured and unconfigured `dist-e2e-*` bundles the web server builds — not the `dist/` build). All three jobs are skipped while a pull request is a draft, so local runs are the only verification until it is marked ready. Dependabot opens weekly grouped PRs for Bun and Actions.

Runners have no handoff, so `.github/scripts/fetch-generated.sh` downloads `generated.tar.gz` and `fixtures.tar.gz` from the R2 bucket and refuses data whose `.exporter` fingerprint does not match `scripts/export_assets.py`. Set the repository variable `VITE_ASSET_BASE` to the bucket's public URL (Settings → Secrets and variables → Actions → Variables). After changing `export_assets.py`, run `bun run assets && bun run upload:r2` before pushing. Locally, `bun run build && bun run e2e` runs the browser test.

## Play

| Input                        | Action                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| A / D or left / right arrows | Move                                                                                       |
| W or up arrow                | Jump; from neutral, again in the air: double jump                                          |
| S or down arrow (hold)       | Crouch                                                                                     |
| G / H                        | Punch / kick; after contact, G or H chains                                                 |
| Back (hold)                  | Guard, away from the opponent                                                              |
| Shift                        | Dash; hold away for backdash                                                               |
| Left / right                 | Double-tap to dash, on the ground or in the air                                            |
| J                            | Grab and throw (close range, ground only)                                                  |
| E                            | Enter or leave EX mode (50 power)                                                          |
| K                            | Hit Up (Jump on hit chases); COUNTER HIT in a block                                        |
| F                            | IORI; tap again for each of two follow-ups                                                 |
| Enter                        | Confirm on the mode select (or click / tap a sign board)                                   |
| P / Escape                   | Pause / resume; Escape steps back on mode select, or goes to the title on character select |
| R                            | Reset the current mode, or return to the title from mode select / demos                    |

Specials and supers are motion commands (↓→ G, →↓↘ G, ↓→↓→ H, …), read toward the opponent. The **Controls guide** link in the in-game **Menu** opens [instructions.html](instructions.html): one page per fighter with every move in table form.

The title opens SINGLE (story), VS and TEAM VS; the **Menu** button at the arena's top right chooses the fighter, opponent, stage, music and mode (free practice with a practice partner, Vs. CPU, or story), and the cheat settings (HP, EN and damage) that apply from the next match or battle. Leaving the window pauses the match. Touch buttons cover every control; landscape is recommended on phones.

[docs/gameplay.md](docs/gameplay.md) describes how each mode, move, chain, cancel, reaction and round rule plays.

## Evidence

Behavior recovered from the source (each fighter's moves, objects, reactions, commands, boxes, damage, the camera, HUD, KO and CPU) is kept apart from rules authored for training (single-key bindings, the Shift dash, practice partners and settings). Vitest pins each rule's ticks and positions and compares the idle interpreter with independent Python traces; the original Windows game has not been run here. Scope: all 45 fighters and 18 stages, local single-player; no gamepad, multiplayer or full gameplay VM. [docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule.

## Files and assets

[CLAUDE.md](CLAUDE.md) maps the source tree: `src/game/` (rules, rendering, select screens, CPU), `src/instructions/` (the controls guide), `scripts/export_assets.py` (asset export) and `docs/`.

The original handoff stays unchanged and Vite refuses to serve it. Only selected PNGs and WAVs enter `public/assets/`; generated assets and fixtures are gitignored and regenerated locally. The deployed game serves them from the public R2 bucket, which is the owner's choice and does not establish redistribution rights.
