# SCWU Web MVP

Ryuko or Zoma on Sport Court, rebuilt for the browser from reverse-engineered data of the Windows game SCWU with TypeScript, Svelte 5, Phaser 3, Vite and Vitest. Each fighter's moves play from their own recovered action scripts and command table, in free practice or against the original CPU.

## Run

Use Bun 1.3.9+, Node 24.12+ for the tooling CLIs, and Python 3.10+. Keep the supplied `scwu-web-handoff/` directory beside `package.json`.

```sh
bun install
bun run dev
```

Open the localhost address Vite prints. `predev` converts only the required art with the handoff's standard-library Python decoder, and missing or changed source data produces an explicit error. The browser needs no Python, Windows runtime, original executable or backend.

```sh
bun run validate # export assets, formatting, ESLint, types, Vitest
bun run build    # export assets, types, production build
bun run preview  # serve the production build locally
bun run format   # apply Prettier
```

`bun run test` and `bun run check` expect assets to have been exported once (`bun run assets`). Run `bun run test` for Vitest; `bun test` selects Bun's own runner. `bun install` installs Husky's pre-commit hook, which runs `bun run validate`.

## Play

| Input                        | Action                                              |
| ---------------------------- | --------------------------------------------------- |
| A / D or left / right arrows | Move                                                |
| W or up arrow                | Jump; from neutral, again in the air: double jump   |
| S or down arrow (hold)       | Crouch                                              |
| J / K                        | Punch / kick; after contact, J or K chains          |
| L (hold)                     | Guard                                               |
| Shift                        | Dash; hold away for backdash                        |
| Left / right                 | Double-tap to dash, on the ground or in the air     |
| U                            | Drill Punch (ground or air)                         |
| I                            | Axe throw (ground only)                             |
| O                            | Grab and throw (close range, ground only)           |
| G                            | Daisetsuzan Oroshi; EVIL DST below 30% health       |
| E                            | Enter or leave EX mode (50 power)                   |
| H                            | Hit Up (Jump on hit chases); COUNTER HIT in a block |
| F                            | IORI; tap again for each of two follow-ups          |
| 1                            | Getter Beam (ground or air, 1 stock)                |
| 2 / 3                        | Musashi / Getter Change Attack (close, 1 stock)     |
| 4                            | Axe throw; below 30% health, Black Getter rush      |
| 5                            | Mega Getter Beam (3 stocks)                         |
| P / Escape                   | Pause / resume                                      |
| R                            | Reset the current mode                              |

Ryuko's original motion commands work alongside those keys. Directions read toward the opponent (→ forward, ← back), and the button follows the last direction by at least a tick:

| Motion       | Move                                                |
| ------------ | --------------------------------------------------- |
| → → (← ←)    | Dash (backdash), ground or air; neutral between     |
| ↑ (↗ ↖)      | In the air, from neutral: double jump               |
| ↓→ J         | Axe throw (EX Fire in EX mode)                      |
| ↓← K         | Drill Punch (ground or air)                         |
| ↓← J         | IORI, and each of its follow-ups                    |
| ←↓→ K        | Daisetsuzan Oroshi                                  |
| ↓ ↓ H        | Enter or leave EX mode (release down between)       |
| ↓→↓→ J       | Getter Beam (ground or air)                         |
| ↓→↓→ K       | Mega Getter Beam                                    |
| ↓←↓→ J       | Black Getter Mega Rush (axe throw at 30% health up) |
| →↓←→↓← J / K | Musashi / Getter Change Attack                      |

Zoma's specials and supers take Ryuko's keys, and his original motion commands work too:

| Input                      | Zoma's move                                                     |
| -------------------------- | --------------------------------------------------------------- |
| J / K                      | P 1 / K 1; on a hit or block, J or K again for P 2 / K 2        |
| J / K during P 2 or K 2    | P 3 (a multi-hit rush) / K 3 (a gun burst)                      |
| Down + J / K               | Crouching punch / sweep                                         |
| J / K in the air           | Air punch / kick (a different form after a double jump or dash) |
| Shift or → →, holding →    | Run while → is held; ↑ during the run leaps into a high jump    |
| Shift + ← or ← ←           | Back hop; ↑ during it jumps back                                |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                           |
| H                          | Hit Up; on a hit, ↑ chases into the air                         |
| O                          | Chuck: a close grab, slam and toss, then a thrown hatchet       |
| Blocking with a stock: H   | COUNTER HIT early in the block; J + K together later            |
| U, or →↓↘ J                | DRAGON, a rising multi-hit uppercut (ground or air)             |
| I, or ↓→ J                 | FIRE, one fireball at a time; again while it flies, P 1         |
| F, or ↓← J (K, J + K)      | dragon 2: vanish, then strike from ahead (farther, in place)    |
| G, or ↓→ K                 | BOMB: three bombs fall on marks ahead; five, then a reload      |
| E, or ↓→↓→ K               | G Beam, a short multi-hit beam                                  |
| 1, or ↓→↓→ J               | SPAKE: a charging dash (ground or air), 1 stock                 |
| 2, or →↓←→↓← J             | DST: a close command grab, toss, juggle and blast, 1 stock      |
| 3, or ↓←↓← K               | EN300: a rising sun-ball barrage, 3 stocks                      |
| 4, or ↓←↓→ K               | Shin Spark below 30% health (else BOMB), 3 stocks               |
| 1 or 2 after DRAGON hits   | SPAKE or DST cancels it, 2 stocks                               |

Below the arena, choose your fighter and the opponent (Ryuko or Zoma) and the mode:

- **Free practice** has no timer. Choose the partner's behavior (stand, guard, jump and guard, punch, jump in with an air kick, or the original CPU), **Max stock** to keep both fighters at three stocks, and **Low health** to hold your fighter at 30% health for the desperation moves.
- **Vs. CPU** plays the original CPU in 60-second rounds, opened and closed by the source's intros, calls and KO lettering. The first to win three rounds takes the match.

Tick **Music** for Sport Court's track. Leaving the window pauses the match. The touch buttons cover every control; landscape is recommended on phones.

[docs/gameplay.md](docs/gameplay.md) describes how each move, chain, cancel, reaction and round rule plays.

## Evidence

The port keeps behavior recovered from the source apart from rules authored for training:

- **Recovered:** each fighter's moves, objects and reactions run from their exported action scripts. Commands, attack and body boxes, the response table, contact pauses, damage, power, the camera, the HUD, KO and the CPU port the engine's own routines.
- **Authored:** the single-key bindings, the Shift dash, jumping on a fresh press, the practice partners and settings, and the few other training choices that [docs/evidence.md](docs/evidence.md) names.
- **Acceptance:** Vitest compares the idle interpreter with independently generated Python traces and the handoff's seed-0 timeline, and pins each rule's ticks and positions. The original Windows game has not been run here.
- **Scope:** two fighters, one stage, local single-player. Alternate/air throws remain deferred. No full gameplay VM, original-game parity, gamepad, multiplayer, or public deployment.

[docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule, and tabulates the contact pauses.

## Files and assets

- `src/App.svelte`: accessible Svelte interface, mode selection, status, and touch controls.
- `src/game/scene.ts`: Phaser loading/rendering and keyboard lifecycle.
- `src/game/match.ts`: deterministic prototype rules and fixed clock.
- `src/game/commands.ts`: the recovered command recognizer, and the command each shortcut key enters.
- `src/game/cpu.ts` / `dummy.ts`: the original CPU and the authored practice partners.
- `src/game/animations.ts`: neutral, guard, victim and result clips, the flattened source timelines, frame sampling and body boxes, per character.
- `src/game/characters.ts`: each fighter's exported data (Ryuko's and Zoma's) and the twins that pair their victim actions.
- `src/game/hud.ts`: source HUD rendering, health cropping, and KO playback.
- `src/game/standing.ts`: recovered idle interpreter and placement.
- `scripts/export_assets.py`: selected asset conversion and independent oracle fixtures.
- `docs/gameplay.md` / `evidence.md`: how the rules play, and the source evidence behind them.

The original handoff stays unchanged outside `public/`. Vite explicitly denies serving it, including through `/@fs/`. Only selected PNGs enter `public/assets/`; generated assets and fixtures are ignored by Git and regenerated locally. `dist/` contains those selected original assets and is for private development. This MVP does not publish them or establish redistribution rights.

Phaser uses its [scene lifecycle](https://docs.phaser.io/phaser/concepts/scenes); Git hooks follow [Husky's current setup](https://typicode.github.io/husky/get-started.html).
