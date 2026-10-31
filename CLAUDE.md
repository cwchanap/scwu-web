# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser fighting-game prototype built from reverse-engineered data of the Windows game SCWU: 45 fighters (Ryuko … RARIO, TRAINING) on 18 stages, behind the original's title, character select (VS single, TEAM VS), story mode and continue screens, plus free practice and Vs. CPU. Stack: TypeScript, Svelte 5, Phaser 4, Vite, Vitest; Bun is the package manager/script runner, Python 3.10+ exports assets. `README.md` covers running and controls; `docs/gameplay.md` details how each move and rule plays, and `docs/evidence.md` is the authoritative record of timings and which behavior is recovered vs. authored. Update them when you change gameplay.

## Commands

```sh
bun install                 # also installs the Husky pre-commit hook
bun run assets              # export art/JSON/fixtures from scwu-web-handoff/ (run once before test/check)
bun run dev                 # predev runs assets, then Vite on 127.0.0.1
bun run test                # Vitest. NOT `bun test`, which runs Bun's own runner
bunx vitest run src/game/match.test.ts          # single file
bunx vitest run src/game/match.test.ts -t "Hit Up"  # single test by name
bun run check               # svelte-check + tsc --noEmit
bun run lint                # ESLint
bun run format              # Prettier write (format:check to verify)
bun run validate            # assets + format:check + lint + check + test (the pre-commit hook runs this)
bun run build               # assets + check + vite build (on Workers Builds, WORKERS_CI: fetch generated/ from R2, check its .exporter fingerprint against export_assets.py, then vite build — export and check skipped)
bun run upload:r2           # sync public/assets and generated/ to the R2 bucket, deleting dropped keys (needs R2_* and AWS_* env)
```

## Source data pipeline

- `scwu-web-handoff/` (gitignored, must sit beside `package.json`) holds the original extracted containers, the Python parsers (`research/tools/scwu_images.py`, `scwu_animation.py`), research notes, and the engine disassembly (`reference/engine-disassembly.txt`). Treat it as read-only. Vite is configured to deny serving it.
- The disassembly prints data as code, so read jump tables and constants from `research/extracted/SCWU.EXE` by mapping addresses through its PE sections. The script opcode dispatch is `0x4125fc`: a byte table at `0x413c74` (indexed by op − 1) selects a handler from `0x413c08`.
- `scripts/export_assets.py` imports those parsers. It checks the SHA-256 hash of every container it reads (each `.PLAYER` via `player()`/`FIGHTERS`, each stage in `STAGES`, `SCWU.KGT`, the demos) and refuses to run on a mismatch. It skips the export while `generated/.inputs` (a digest of the script plus the handoff's file names, sizes and mtimes) is unchanged. It writes:
  - `public/assets/` with the selected PNGs (fighter images, stages, UI) and the WAVs that op `0x03` cues play (`sounds/`)
  - `src/game/generated/assets.json` (Ryuko): name → source-action clips, whose frames carry op `0x19` body boxes and op `0x23` colour; flattened source timelines (`scripts`, keyed `"action"` or `"action+offset"`) with decoded events; the held-pose, response, response-effect and CPU tables; and the idle bytecode. Every other fighter gets `<key>.json` from its `FIGHTERS` entry (`export_fighter`), holding the same plus the twins pairing its victim actions with Ryuko's. Also `stages.json`, `ui.json`, `select.json`, the title/select demos (`t1.json`, `t2.json`, `demos/`)
  - `src/game/__fixtures__/`, the Python oracle traces used only by tests
- All three outputs are gitignored and regenerated. To add a pose or animation, add a `name: sourceActionIndex` entry to Ryuko's `actions` dict in `main()` (or the fighter's `FIGHTERS` entry), then reference it through `animations.ts`. To play a source action's own events, add it to that export's flatten queue (spawned objects, including every object a clip spawns, slot-2/3 handlers, op `0x0b` calls and the targets of op `0x16`/`0x1f`/`0x20` branches follow automatically; flattened displays carry their op `0x04`/`0x0e`/`0x1f`/`0x25` events like clip displays) and decode any new opcode in `decode_event`; `flatten` inlines op `0x09` calls and follows op `0x0a` jumps.
- Do not commit original assets. The one place they are published is the public R2 bucket the Cloudflare deploy reads (the owner's choice; README, "Deploy to Cloudflare"). Cloudflare's git build has no handoff, so `scripts/upload_r2.sh` also uploads `generated/` as a tarball for `scripts/build.sh` to fetch. Art and audio URLs come from `ASSET_BASE` (`src/game/assetBase.ts`, set by `VITE_ASSET_BASE`), never a hardcoded `/assets/`.

## Architecture (`src/game/`)

Simulation and rendering are separate, and the simulation is deterministic:

- `match.ts`: all gameplay rules in the `Match` class. `match.step(playerInput, opponentInput?)` advances exactly one 10 ms tick (`TICK_MS`). It covers movement, physics, attacks/multi-hits, hit-stop, reactions, throws, projectiles, spawned objects (`effects`), the hit test, camera, and round flow. A fighter's moves run as the generic `'script'` action, playing the source action's flattened timeline held in its `branch`; those and source objects run their exported events through `runEvent`. Modes are `'practice'`, `'cpu'` and `'story'`; the constructor also takes both characters, the stage, whether VS single started it, a story `Battle`, and held palettes. `FixedClock` converts frame deltas into fixed ticks and caps stalls at 250 ms. Tests drive `Match` directly with no Phaser, so gameplay logic must stay out of `scene.ts`.
- `animations.ts`: the `animations` table maps each `Action` to frame clips from `generated/assets.json`. `animationFrame(action, age)` samples by tick age, and `animationDuration` returns a clip's length. `Action`/`AnimatedAction` types derive from this table. `script()`/`eventsAt()` read each character's flattened timelines, for fighter actions and source objects alike (`ObjectKey`); `hurtboxes`/`pushboxes` read the frames' body boxes.
- `cpu.ts`: `CpuVM`, a port of the engine's CPU routine (`0x411270`) driven by each fighter's CPU table. `dummy.ts`: authored practice partners. Both only produce `Input`, so they play through the same rules as the player.
- `commands.ts`: the recovered command recognizer, and the command entry each shortcut key enters. `characters.ts`: every fighter's and stage's exported data (`CHARACTERS`, `STAGES`, `Who`), with per-fighter lookups such as `twinOf` and `responsesOf`.
- `select.ts`: ports of the title (`0x4080a0`), character select (`0x406fc0`, for VS single, VS multi/TEAM VS and story), story demos and continue screen, run from their raw records. `story.ts`: the story-mode runner (`0x4069b0`) that yields each `Battle`.
- `standing.ts`: a faithful port of the recovered idle-action bytecode interpreter (`StandingVM`), with a 32-bit LCG via `Math.imul`, a timing accumulator, and explicit errors for unsupported opcodes. `placement()` implements the source ground-anchor/odd-width facing formula. Tests compare it event-for-event against the Python oracle fixtures and the handoff seed-0 timeline.
- `hud.ts`: renders the source HUD (life bars, timer, portraits, KO lettering from KGT action 26). It exports `KO_TICKS`/`ROUND_END_TICKS`, which `match.ts` uses.
- `scene.ts`: the Phaser `TrainingScene`. It runs the screen flow (title → select or story → match → continue), loads assets, maps keyboard/touch into `Control` inputs each tick, calls `match.step`, ticks the idle VMs while a fighter is `idle`, and renders sprites, effects, camera, and HUD. It draws op `0x23` colour (tinted textures are made once per image and offset, and the mode picks the blend) and the op `0x25` afterimages the match samples. `createGame()` builds the Phaser game. Status goes to Svelte through the `onStatus` callback (`GameStatus`).
- `src/App.svelte`: full-screen shell with floating controls (Settings gear, Pause/Resume, Reset), a settings modal, and touch buttons; the controls guide lives on `instructions.html`, and the fighter/opponent pickers render from `src/instructions/fighters.ts`. It lazy-imports `scene.ts` so Phaser lands in its own chunk.
- Tests: `match.test.ts` covers shared rules and Ryuko, `<fighter>.test.ts` each other fighter, and `vs`/`team`/`select`/`story` tests the screens and modes. `testing.ts` holds shared helpers (`enter`, `strike`, `spawn`, Ryuko's action indices in `RYUKO`).

Coordinates: 960×720 viewport over a 1920-wide stage (`STAGE_WIDTH`), `GROUND = 636`, art scaled 1.5× from the source 640×480. Source fixed-point velocities and accelerations convert through `SOURCE_VELOCITY_SCALE`/`SOURCE_ACCELERATION_SCALE` in `match.ts`.

## Fidelity conventions

- Separate **recovered** source behavior (cite action indices, PCs, opcodes, and engine addresses in comments or `docs/evidence.md`) from **authored training rules**. Keep that distinction when adding features, and record new choices in `docs/evidence.md`.
- The 10 ms tick is recovered evidence. Do not switch to a 60 Hz or frame-based clock.
- Comments prefixed `ponytail:` mark deliberate shortcuts or known gaps against the source.
- When adding a fighter or fixing animation timing, hit-stop, chains, grabs or round endings, use the project skill `.claude/skills/scwu-character-animation`.
- Tests assert exact tick counts and positions (for example `toBeCloseTo(120.084, 3)`). A timing change should update the tests and `docs/evidence.md`'s tables together.
- Vitest hides `console.log` from passing tests; to inspect values from a throwaway probe test, throw them in an `Error`, then delete the probe.
- Browser checks with Playwright write to `.playwright-mcp/`; delete it afterwards.
