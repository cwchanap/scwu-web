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
bun run e2e      # Playwright smoke test against dist/ (build first)
```

`bun run assets` skips the export while its script, the handoff and the DOM-named art paths are unchanged and its output is intact; a half-finished or modified export re-runs. `bun install` installs Husky's pre-commit hook.

## Deploy to Cloudflare

The site is a static Worker (`wrangler.jsonc` serves `dist/`). The art and audio live in a public R2 bucket by the owner's choice, and the page loads them from `VITE_ASSET_BASE` (`src/game/assetBase.ts`; unset, from this site's own `/assets/`). Cloudflare's build has no `scwu-web-handoff/`, so `scripts/upload_r2.sh` also uploads `src/game/generated/` as `generated.tar.gz`, which `bun run build` (`scripts/build.sh`) downloads when `WORKERS_CI` is set.

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

Builds of other branches (Worker Previews) do not inherit production settings: in the Worker's **Settings** → **Build**, add the same `VITE_ASSET_BASE` to the Previews build variables and set the Preview command to `npx wrangler preview` (`wrangler.jsonc` carries the empty `previews` block it needs).

## CI

GitHub Actions (`.github/workflows/`) runs on pushes to `main` and on ready-for-review pull requests: **Build and Lint**, **Run Unit Tests** and **Playwright Tests** (`e2e/`, against the production build). Dependabot opens weekly grouped PRs for Bun and Actions.

Runners have no handoff, so `.github/scripts/fetch-generated.sh` downloads `generated.tar.gz` and `fixtures.tar.gz` from the R2 bucket and refuses data whose `.exporter` fingerprint does not match `scripts/export_assets.py`. Set the repository variable `VITE_ASSET_BASE` to the bucket's public URL (Settings → Secrets and variables → Actions → Variables). After changing `export_assets.py`, run `bun run assets && bun run upload:r2` before pushing. Locally, `bun run build && bun run e2e` runs the browser test.

## Play

| Input                        | Action                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| A / D or left / right arrows | Move                                                          |
| W or up arrow                | Jump; from neutral, again in the air: double jump             |
| S or down arrow (hold)       | Crouch                                                        |
| G / H                        | Punch / kick; after contact, G or H chains                    |
| Back (hold)                  | Guard, away from the opponent                                 |
| Shift                        | Dash; hold away for backdash                                  |
| Left / right                 | Double-tap to dash, on the ground or in the air               |
| J                            | Grab and throw (close range, ground only)                     |
| E                            | Enter or leave EX mode (50 power)                             |
| K                            | Hit Up (Jump on hit chases); COUNTER HIT in a block           |
| F                            | IORI; tap again for each of two follow-ups                    |
| P / Escape                   | Pause / resume; Escape on the select screen goes to the title |
| R                            | Reset the current mode                                        |

Specials and supers are motion commands (↓→ G, →↓↘ G, ↓→↓→ H, …), read toward the opponent. The **Controls guide** link in the in-game **Menu** opens [instructions.html](instructions.html): one page per fighter with every move in table form.

The title opens SINGLE (story), VS and TEAM VS; the **Menu** button at the arena's top right chooses the fighter, opponent, stage, music and mode (free practice with a practice partner, Vs. CPU, or story). Leaving the window pauses the match. Touch buttons cover every control; landscape is recommended on phones.

[docs/gameplay.md](docs/gameplay.md) describes how each mode, move, chain, cancel, reaction and round rule plays.

## Evidence

Behavior recovered from the source (each fighter's moves, objects, reactions, commands, boxes, damage, the camera, HUD, KO and CPU) is kept apart from rules authored for training (single-key bindings, the Shift dash, practice partners and settings). Vitest pins each rule's ticks and positions and compares the idle interpreter with independent Python traces; the original Windows game has not been run here. Scope: all 45 fighters and 18 stages, local single-player; no gamepad, multiplayer or full gameplay VM. [docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule.

## Files and assets

[CLAUDE.md](CLAUDE.md) maps the source tree: `src/game/` (rules, rendering, select screens, CPU), `src/instructions/` (the controls guide), `scripts/export_assets.py` (asset export) and `docs/`.

The original handoff stays unchanged and Vite refuses to serve it. Only selected PNGs and WAVs enter `public/assets/`; generated assets and fixtures are gitignored and regenerated locally. The deployed game serves them from the public R2 bucket, which is the owner's choice and does not establish redistribution rights.
