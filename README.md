# SCWU Web MVP

A local Ryuko mirror match on Sport Court, built with TypeScript, Svelte 5, Phaser 3, Vite, and Vitest. Includes free practice, a simple CPU opponent, forward/backward movement, jump/landing, standing/crouching/aerial punch/kick/guard, hit/block reactions, KO/victory/draw animations, health, a 60-second CPU round, pause, reset, and touch controls.

## Run

Use Bun 1.3.9+, Node 24.12+ for the tooling CLIs, and Python 3.10+. Keep the supplied `scwu-web-handoff/` directory beside `package.json`.

```sh
bun install
bun run dev
```

Open the localhost address Vite prints. `predev` converts only the required art with the handoff's standard-library Python decoder. Missing or changed Ryuko source data produces an explicit error. No Python, Windows runtime, original executable, or backend is needed by the browser.

```sh
bun run validate # export assets, formatting, ESLint, types, Vitest
bun run build    # export assets, types, production build
bun run preview  # serve the production build locally
bun run format  # apply Prettier
```

`bun run test` and `bun run check` expect assets to have been exported once (`bun run assets`). Husky's pre-commit hook runs `bun run validate`; `bun install` installs the hook when this directory is a Git checkout. Use `bun install --frozen-lockfile` for reproducible installs from `bun.lock`. Run `bun run test` to use Vitest; `bun test` selects Bun’s built-in test runner. No commit or remote is created automatically.

## Play

| Input                        | Action                             |
| ---------------------------- | ---------------------------------- |
| A / D or left / right arrows | Move                               |
| W or up arrow                | Jump                               |
| S or down arrow (hold)       | Crouch                             |
| J / K                        | Punch / kick (tap for each attack) |
| L (hold)                     | Guard                              |
| P / Escape                   | Pause / resume                     |
| R                            | Reset the current mode             |

Free practice has a stationary partner and no timer. Vs. CPU adds simple deterministic approach/guard/attack behavior. Changing modes resets the round. Leaving the window pauses the match and clears held input; resume explicitly. Touch buttons support simultaneous movement and actions. Landscape is recommended on phones.

Hold crouch while attacking or guarding for low poses; attack or guard during a jump for aerial poses. Attacks finish before another can start, and landing interrupts aerial actions. KO plays the recovered lettering sequence for 166 ticks (1.66 seconds), followed by one second with the winner visible. Rematch controls appear below the court, keeping the ending poses unobscured.

## Evidence and deliberate limits

- **Recovered behavior:** `src/game/standing.ts` ports the verified standing interpreter, including variable/collision-record assignments, branching, unsigned LCG arithmetic, timing accumulator, explicit unsupported-opcode errors, and odd-width facing placement. It executes instructions at fixed 10 ms ticks, independently of Phaser rendering. Idle action-end restarts action 1 with the continuing random seed as a new prototype choice.
- **Acceptance:** Vitest compares every event, branch, instruction, final PC, timer, and seed against 21 independently generated Python traces. The supplied seed-0 handoff timeline is also compared directly: 18 displays, nine images including 295, 223 ticks. These are comparisons against the supplied research; the original Windows game has not been run here.
- **New rules:** `match.ts` defines prototype movement, gravity, body separation, hit ranges, damage, guard, hitstun, AI, and round flow. Non-idle animation clips use deliberately selected display poses and offsets from the containers; they do not claim to execute those actions' original bytecode, physics, collisions, or transitions. CPU uses the same Ryuko art. Camera/crop and impact rings are new presentation choices.
- **Core animations:** `animations.ts` loops locomotion/crouch, plays finite action and reaction sequences, and holds final airborne/ending poses. Recovered costume changes are preserved. Timing is authored where source commands wait for gameplay. The source loss display is blank, so time-out loss uses the recovered seated draw pose. Guard blocks all attack heights in these MVP rules.
- **GUI/HUD:** the arena uses the source 640×480 aspect ratio at 1.5× scale. `hud.ts` renders the silver frame, life gradients, timer digits, portrait strips, win marks, and energy frame from `SCWU.KGT` and Ryuko's container. Screen anchors come from KGT actions 60, 71–77, 103, and 106–112. Life bars crop the original gradients. Special stock remains EMPTY until special moves exist. KO uses action 26's display order, offsets, and durations; its effect/control opcodes are not executed. The browser toolbar, name placement, infinity/time-out labels, and post-KO hold are authored. There is no blurred result modal. Original-game recording parity, screen effects, and round-transition dispatch remain unverified.
- **Scope:** one fighter, one stage, local single-player. Special moves remain deferred. No full gameplay VM, original-game parity, sound mapping, gamepad, multiplayer, or public deployment. Audio is intentionally absent because original sound triggers remain unresolved.

## Files and assets

- `src/App.svelte`: accessible Svelte interface, mode selection, status, and touch controls.
- `src/game/scene.ts`: Phaser loading/rendering and keyboard lifecycle.
- `src/game/match.ts`: deterministic prototype rules and fixed clock.
- `src/game/animations.ts`: core animation timelines and frame sampling.
- `src/game/hud.ts`: source HUD rendering, health cropping, and KO playback.
- `src/game/standing.ts`: recovered idle interpreter and placement.
- `scripts/export_assets.py`: selected asset conversion and independent oracle fixtures.

The original handoff stays unchanged outside `public/`. Vite explicitly denies serving it, including through `/@fs/`. Only selected PNGs enter `public/assets/`; generated assets and fixtures are ignored by Git and regenerated locally. `dist/` contains those selected original assets and is for private development. This MVP does not publish them or establish redistribution rights.

Phaser uses its [scene lifecycle](https://docs.phaser.io/phaser/concepts/scenes); Git hooks follow [Husky's current setup](https://typicode.github.io/husky/get-started.html).
