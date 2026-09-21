# SCWU Web MVP

A local Ryuko mirror match on Sport Court, built with TypeScript, Svelte 5, Phaser 3, Vite, and Vitest. Includes free practice, a simple CPU opponent, forward/backward movement, dashes, double jumps, standing/crouching/aerial attacks and guard, three-step standing attack chains, Drill Punch, Axe throw, close-range throws, knockdowns and get-ups, hit/block reactions, KO/victory/draw animations, health, a 60-second CPU round, pause, reset, and touch controls.

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

| Input                          | Action                                    |
| ------------------------------ | ----------------------------------------- |
| A / D or left / right arrows   | Move                                      |
| W or up arrow                  | Jump; tap again for double jump           |
| S or down arrow (hold)         | Crouch                                    |
| J / K                          | Punch / kick (tap for each attack)        |
| L (hold)                       | Guard                                     |
| Shift or double-tap left/right | Dash; tap/hold away for backdash          |
| U                              | Drill Punch (ground or air)               |
| I                              | Axe throw (ground only)                   |
| O                              | Grab and throw (close range, ground only) |
| P / Escape                     | Pause / resume                            |
| R                              | Reset the current mode                    |

Free practice has a stationary partner and no timer. Vs. CPU adds simple deterministic approach/guard/attack behavior. Changing modes resets the round. Leaving the window pauses the match and clears held input; resume explicitly. Touch buttons support simultaneous movement and actions. Landscape is recommended on phones.

Hold crouch while attacking or guarding for low poses; attack or guard during a jump for aerial poses. Attacks finish before another can start. Landing interrupts aerial attacks, while hit/block reactions retain their remaining recovery in a ground pose. Airborne fighters land before their round-result pose. KO plays the recovered lettering sequence for 166 ticks (1.66 seconds), followed by one second with the winner visible. Rematch controls appear below the court, keeping the ending poses unobscured.

Tap punch or kick again during a standing attack to queue its next attack, up to three steps. Early taps during startup are remembered. When no follow-up is queued, the first two attacks hold their final recovery pose for an extra 150 ms to accept a late tap. Already queued attacks start at the original animation boundary; the extra recovery does not extend active hit windows. The second standing punch and jumping kick each have three strikes; the third standing kick has eight. Each strike has its own active window and hit/block effect, with inactive gaps between strikes. Their total damage stays at 10, 13, and 17 respectively, and only the final strike knocks back. Holding an attack never repeats it; getting hit clears the queued follow-up. Jump direction is chosen when jump is pressed: neutral jumps rise about 318 arena pixels, while forward/backward jumps rise about 296 and travel about 348 pixels when unobstructed. Jump travel continues after releasing direction and through aerial attacks or guard. Double jumps pause for 30 ms before launching in the newly selected direction. These velocities and acceleration use recovered actions 4–6 and 10–12, converted from the original fixed-point units to the arena scale. Each flight allows one double jump and one air dash, refreshed on landing. Two fresh taps of the same direction within 200 ms trigger a dash on keyboard or touch; opposite input, simultaneous left/right, pause, and focus loss clear the sequence. The 200 ms input window is a training-mode choice. Dash direction follows the held movement direction, or goes toward the opponent by default. Ground dashes launch a hop after their preparation pose, move faster than walking, and hold the airborne pose until landing; a forward dash covers about 250 pixels with room to move. Ground Drill Punch lunges from 110–590 ms at about 13.5 arena pixels per tick, slides at about 1.5 pixels per tick until 690 ms, then stops for its remaining recovery. Body collisions and arena walls limit its travel. It advances through six timed strikes for 3 damage each (18 total), with hit reactions and sparks on every contact and knockback on the final strike. Guard blocks all six strikes. The aerial drill holds its 220 ms startup, then dives forward at about 12 arena pixels per tick and downward at about 15; follow-up stages increase the downward speed to about 22.5. It spins until landing. Hit or block advances its contact stages; a missed spin stays armed. Damage drops from 16 to 5, 3, then 1 per subsequent contact, so its hit count depends on contact and airtime. The attacker holds position for eight contact ticks, then moves through the two transition ticks before the next strike. Landing ends the attack and plays its recovery. Its shorter 180-pixel contact range matches the diagonal blade. Axe throw launches one spinning axe per fighter; it can be blocked or jumped over. These two basic specials are meter-free. The CPU still uses its simple punch/kick/guard behavior.

Press O within 115 arena pixels of a grounded opponent to grab them, including through guard. The grab checks after 70 ms; a miss plays its recovery, and a strike on the same tick wins over the grab. Two simultaneous grab attempts both miss. A successful grab grips the opponent for 120 ms, plays three 200 ms spinning attack cycles with the opponent held, then tosses them for 18 damage. The held pose, orbit and front/back draw order follow the same attack timeline; input cannot skip the catching attack. They fall onto the court, stay down for 600 ms, and play a 300 ms get-up before control returns. Held, thrown, down, and get-up states cannot be hit or grabbed again. Body separation stays active during knockdown and get-up. Fighter anchors stay 185 arena pixels from either edge so the extended air dash and wide throw/recovery poses remain visible without shifting position when the pose changes. A hit on the thrower before release frees the opponent without throw damage. Lethal throws finish on the floor without getting up; reset and timeout also release held fighters. These are authored training rules, not reconstructed original throw mechanics.

## Evidence and deliberate limits

- **Recovered behavior:** `src/game/standing.ts` ports the verified standing interpreter, including variable/collision-record assignments, branching, unsigned LCG arithmetic, timing accumulator, explicit unsupported-opcode errors, and odd-width facing placement. It executes instructions at fixed 10 ms ticks, independently of Phaser rendering. Idle action-end restarts action 1 with the continuing random seed as a new prototype choice.
- **Acceptance:** Vitest compares every event, branch, instruction, final PC, timer, and seed against 21 independently generated Python traces. The supplied seed-0 handoff timeline is also compared directly: 18 displays, nine images including 295, 223 ticks. These are comparisons against the supplied research; the original Windows game has not been run here.
- **New rules:** `match.ts` defines prototype movement, gravity, body separation, hit ranges, damage, guard, hitstun, AI, and round flow. Non-idle animation clips use deliberately selected display poses and offsets from the containers; they do not claim to execute those actions' original bytecode, physics, collisions, or transitions. CPU uses the same Ryuko art. Camera/crop is a new presentation choice.
- **Animations:** `animations.ts` loops locomotion/crouch, plays finite action and reaction sequences, and holds final airborne/ending poses. Recovered costume changes are preserved. Timing is authored where source commands wait for gameplay. The movement expansion selects actions 10, 13–17; follow-ups use 180–181 and 188–190; Drill Punch uses 207–212; Axe throw uses the source's “FIRE START” and “Fly Ball” actions 226–227 and impact 230. The third kick repeats action 190 eight times, matching the recovered loop count. Aerial drill follows the contact-dependent stages of actions 209–211 rather than playing a fixed number of spin cycles. Drill movement uses recovered opcode-1 velocities at source speed 10, converted to the web art scale. Damage, body separation, and the local contact pause remain training rules; full engine hit-stop and the gameplay VM are not reconstructed. Axe flight uses an authored center anchor and collision rules. The source loss display is blank, so time-out loss uses the recovered seated draw pose. Guard blocks all attack heights in these MVP rules.
- **Hit effects:** source action 345 supplies the gold hit burst; heavy hits also play the first streak branch from 348, and blocks use guard flash 370. Recovered display durations, offsets, and facing are preserved. Effects render above the fighters and expire after their last frame, including during KO; simultaneous hits keep separate effects. Selection, contact anchors, and additive blending are authored for this training mode. Full source color/effect dispatch and spawned star particles remain unimplemented.
- **Throws and recovery:** actions 196–197 supply the robot-form grab and lift/toss poses; 199 supplies the four turning poses for the catching attack, 128 and 130 supply the held and spinning reactions, 132 the airborne tumble, 146 the floor impact/down pose, and 145 the get-up sequence. Release coincides with the raised-arm pose. The long source throw and falling displays use authored timings; placement of the held fighter, launch velocity, protection, and release rules belong to the training mode. Three spin cycles and the held orbit are authored for the training mode. Original object dispatch and alternate throw variants remain deferred.
- **GUI/HUD:** the arena uses the source 640×480 aspect ratio at 1.5× scale. `hud.ts` renders the silver frame, life gradients, timer digits, portrait strips, win marks, and energy frame from `SCWU.KGT` and Ryuko's container. Screen anchors come from KGT actions 60, 71–77, 103, and 106–112. Life bars crop the original gradients. Super stock remains EMPTY; the two basic specials do not consume it. KO uses action 26's display order, offsets, and durations; its effect/control opcodes are not executed. The browser toolbar, name placement, infinity/time-out labels, and post-KO hold are authored. There is no blurred result modal. Original-game recording parity, screen effects, and round-transition dispatch remain unverified.
- **Scope:** one fighter, one stage, local single-player. Alternate/air throws, additional special variants, supers, intros, and source effect dispatch remain deferred. No full gameplay VM, original-game parity, sound mapping, gamepad, multiplayer, or public deployment. Audio is intentionally absent because original sound triggers remain unresolved.

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
