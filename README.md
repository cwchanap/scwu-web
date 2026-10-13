# SCWU Web MVP

Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant or G Suneo on any of its 18 stages, rebuilt for the browser from reverse-engineered data of the Windows game SCWU with TypeScript, Svelte 5, Phaser 4, Vite and Vitest. Each fighter's moves play from their own recovered action scripts and command table, in free practice or against the original CPU.

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

Kiki's moves take Ryuko's keys too:

| Input                          | Kiki's move                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| J / K                          | P 1 / K 1; on a hit or block, J or K again for P2 / K 2         |
| J / K during P2 or K 2         | P3 (a long lunging punch) / K 3 (a flying fist)                 |
| Down + J / K                   | Crouching punch / a hopping potato                              |
| J / K in the air               | Air punch / kick (a different form after a double jump or dash) |
| Shift or → →; Shift + ← or ← ← | Dash hop forward; back                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                           |
| H                              | Hit Up; on a hit, ↑ chases into the air                         |
| O                              | Chuck: a close grab that ends in a blast                        |
| Blocking with a stock: H       | COUNTER HIT                                                     |
| U, or ↓→ K                     | DRAGON O, a rising multi-hit (ground or air)                    |
| I, or ↓→ J                     | K'; then → K a dashing strike, → J a shot, or ← K BLACK OUT     |
| F, or ↓← K                     | TATUMAKI, a hopping spin (ground or air)                        |
| 1, or ↓→↓← J                   | ranbu: a dash into a slam and flurry, 1 stock                   |
| 2, or ↓→↓→ J                   | MAGIC FIRE: eleven fireballs, 1 stock                           |
| 3, or ↓→↓→ K                   | EN3 majic dance: a lift, then witches and a beam, 3 stocks      |
| 1 or 2 as TATUMAKI lands       | ranbu or MAGIC FIRE cancels it, 2 stocks                        |

So do Chung's:

| Input                          | Chung's move                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3 |
| P3                             | A strike that catches the opponent, then blasts them away          |
| Down + J / K                   | Crouching punch / a burning kick that knocks down                  |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                 |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                              |
| H                              | Hit Up                                                             |
| O                              | Chuck: a close grab that hurls the opponent into the screen's edge |
| Blocking with a stock: H       | COUNTER HIT                                                        |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): EX forms of several moves   |
| U, or →↓↘ J                    | Dragon (ground or air)                                             |
| I, or ↓→ J                     | Fire ball, a thrown star                                           |
| F, or ←↓→ K                    | orochi                                                             |
| G, or ↓← J                     | Burn Knock                                                         |
| ↓← K; ↓→ K in the air          | jump wall move; air fire                                           |
| 1, or ↓←↓→ J                   | gesar (nin star in the air), 1 stock                               |
| 2, or ↓→↓→ K                   | lee: kicks that carry the opponent up to float, 1 stock            |
| 3, or ↓←↓← K                   | EN300: a shock, then lifts and tosses, 3 stocks                    |

So do Amiro's:

| Input                          | Amiro's move                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                            |
| P3 / K3                        | A lunge that hurls the opponent into the screen's edge / a bouncing ball                      |
| Down + J / K                   | Crouching punch / a sweep                                                                     |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                         |
| H                              | Hit Up                                                                                        |
| O                              | Chuck: a close grab and a spinning toss                                                       |
| Blocking with a stock: H       | COUNTER HIT                                                                                   |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): EX forms of her specials and supers                    |
| U, or →↓↘ J                    | Dragon (ground or air); in EX mode EX Beam, an anti-air beam, or in the air EX Air Dragon     |
| I, or ↓→↓→ K                   | BEAM; in EX mode funnal call, a drone that fires a beam                                       |
| F, or ←↓→ K                    | Coment chuck: a grab that throws the opponent straight up; in EX mode Crush                   |
| G, or ↓← J                     | morning star, a flail; in EX mode NT                                                          |
| 1, or →↓←→↓← J                 | scc: a grab, a toss up and a beam, 1 stock (in EX mode WHIP)                                  |
| 2, or ↓←↓→ J                   | medeo: a meteor drop, 3 stocks (Evil En3 below 30% health)                                    |
| 3, or ↓←↓← K                   | NT: a flying unit that strikes from range, 1 stock (EVIL NT below 30% health, EXR in EX mode) |
| 4, or ↓→↓→ J                   | funnal: drones that fire beams, 1 stock (evil funnal below 30% health, EFB in EX mode)        |

And ANMC P's:

| Input                          | ANMC P's move                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                       |
| P3 / K3                        | A rushing punch that hurls the opponent into the screen's edge / a kick that blasts them away                                            |
| Down + J / K                   | Crouching punch / a kick that knocks down                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                       |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                    |
| H                              | Hit Up                                                                                                                                   |
| O                              | Chuck: a close grab that spins the opponent away                                                                                         |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                              |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): he guards in another costume, and his K2, K3, crouching kick, chuck and twis att take other forms |
| U, or ↓← J                     | fly move: a rocket leap that strikes as it rises                                                                                         |
| I, or ↓→ J                     | fire ball, lobbed in a high arc (in the air, thrown down at an angle)                                                                    |
| F, or ↓← K                     | twis att: a spinning rush, which a super can cancel for 2 stocks                                                                         |
| G, or ↓→ K                     | ball fire, a straight shot (in the air, after a hop back)                                                                                |
| 1, or →↓←→↓← J                 | SUPER CHUCK: a grab and a beating that knocks the opponent into the screen's edge, 1 stock                                               |
| 2, or ↓→↓→ J                   | super ball: a leap and balls that fire beams again and again, 1 stock                                                                    |
| 3, or ↓→↓→ K                   | en300: a cut-in, then a barrage of shots, 3 stocks                                                                                       |

And Giant's:

| Input                          | Giant's move                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                           |
| P3 / K3                        | A punch that knocks the opponent away / a grab that twists them away but knocks him down too                                                                                 |
| Down + J / K                   | An uppercut / a sweep                                                                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                           |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                        |
| H                              | Hit Up                                                                                                                                                                       |
| O                              | Chuck: a grab, then a song that dazes the opponent until the music explodes, throwing them and him                                                                           |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                  |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): his P3, K3, Hit Up, specials and supers take other forms                                                                              |
| U, or →←↓→ J                   | Rock punch: a rocket punch that flies out from range (in EX mode B FIRE, a beam)                                                                                             |
| I, or ↓→ K                     | base ball: a pitch of random kind (in the air, drop punch, a dive; in EX mode NEW HARIKEN)                                                                                   |
| F, or ↓→ J                     | H PUNCH: a hammer punch that hurls the opponent into the screen's edge, which a super can cancel for 2 stocks (in EX mode EX Crush)                                          |
| G, or →↓← K                    | counter: struck during its 0.72-second stance, he takes double damage, then strikes back, rushing in to beat the opponent inside a cloud of dust (in EX mode a moving chuck) |
| 1, or ↓→↓→ J                   | fire: a fire beam, also in the air, 1 stock (Evil fire below 30% health; in EX mode SC MAHA P, a punch flurry, or in the air SUPER DROP PUNCH)                               |
| 2, or ↓→↓→ K                   | HARIKEN: a whirlwind that hops the opponent in and out, 1 stock (in EX mode super base ball, ten pitches)                                                                    |
| 3, or ↓←↓← J                   | en300: calls his friends, then a screen-wide barrage, 3 stocks                                                                                                               |

And G Suneo's:

| Input                          | G Suneo's move                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                    |
| P3 / K3                        | A rushing punch that hurls the opponent into the screen's edge / a leaping kick that strikes again and again          |
| Down + J / K                   | A rising punch / a sliding sweep                                                                                      |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                    |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                 |
| H                              | Hit Up                                                                                                                |
| O                              | Chuck: a grab, a hop back and a leaping throw that spins the opponent away                                            |
| Blocking with a stock: H       | COUNTER HIT                                                                                                           |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): her K2, crouching and air attacks, Hit Up, chuck and specials take other forms |
| U, or →↓↘ K                    | DRILL KNIEE: a rising knee, also in the air (in EX mode, in the air, a diving knee)                                   |
| I, or ↓→ J                     | FIRE BALL: a shot that speeds up, which a super can cancel for 2 stocks                                               |
| F, or ↓← J                     | G DRIVER: a drill lance thrust that hurls the opponent into the screen's edge (in EX mode a strike that shocks them)  |
| G, or ↓← K                     | BIKE: a leap on a golden lion, also in the air (in EX mode a kick and a wheel that strikes again and again)           |
| 1, or K K ← J K                | hh, below 30% health: a screen-wide shock, then a long beating, 3 stocks                                              |
| 2, or →↓←→↓← J                 | GP: a grab, then a beating out of sight before a launch, 1 stock                                                      |
| 3, or ↓→↓→ K                   | en300: a shock, then a hammer, 3 stocks                                                                               |
| 4, or ↓→↓→ J                   | BP: a flying fist that strikes three times, 1 stock (BP EVIL, a ring, below 30% health)                               |

Below the arena, choose your fighter and the opponent (Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant or G Suneo), the stage (Sport Court, Train Morning, Sakura Night, Train Night, Dojin BKG, Japan Street, Park Morning, Park Night, Sakura Street, Greek, Space, Boss Base, ZM Office, ZM Office T2, BR Boss Base, GI Stage, Space Night or Street Night) and the mode:

- **Free practice** has no timer. Choose the partner's behavior (stand, guard, jump and guard, punch, jump in with an air kick, or the original CPU), **Max stock** to keep both fighters at three stocks, and **Low health** to hold your fighter just under 30% health for the desperation moves.
- **Vs. CPU** plays the original CPU in 60-second rounds, opened and closed by the source's intros, calls and KO lettering. The first to win three rounds takes the match.

Tick **Music** for the stage's track. Leaving the window pauses the match. The touch buttons cover every control; landscape is recommended on phones.

[docs/gameplay.md](docs/gameplay.md) describes how each move, chain, cancel, reaction and round rule plays.

## Evidence

The port keeps behavior recovered from the source apart from rules authored for training:

- **Recovered:** each fighter's moves, objects and reactions run from their exported action scripts. Commands, attack and body boxes, the response table, contact pauses, damage, power, the camera, the HUD, KO and the CPU port the engine's own routines.
- **Authored:** the single-key bindings, the Shift dash, jumping on a fresh press, the practice partners and settings, and the few other training choices that [docs/evidence.md](docs/evidence.md) names.
- **Acceptance:** Vitest compares the idle interpreter with independently generated Python traces and the handoff's seed-0 timeline, and pins each rule's ticks and positions. The original Windows game has not been run here.
- **Scope:** eight fighters, all 18 stages, local single-player. No full gameplay VM, original-game parity, gamepad, multiplayer, or public deployment.

[docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule, and tabulates the contact pauses.

## Files and assets

- `src/App.svelte`: accessible Svelte interface, mode selection, status, and touch controls.
- `src/game/scene.ts`: Phaser loading/rendering and keyboard lifecycle.
- `src/game/match.ts`: deterministic prototype rules and fixed clock.
- `src/game/commands.ts`: the recovered command recognizer, and the command each shortcut key enters.
- `src/game/cpu.ts` / `dummy.ts`: the original CPU and the authored practice partners.
- `src/game/animations.ts`: neutral, guard, victim and result clips, the flattened source timelines, frame sampling and body boxes, per character.
- `src/game/characters.ts`: each fighter's exported data (Ryuko's, Zoma's, Kiki's, Chung's, Amiro's, ANMC P's, Giant's and G Suneo's) and the twins that pair their victim actions, and each stage's.
- `src/game/hud.ts`: source HUD rendering, health cropping, and KO playback.
- `src/game/standing.ts`: recovered idle interpreter and placement.
- `scripts/export_assets.py`: selected asset conversion and independent oracle fixtures.
- `docs/gameplay.md` / `evidence.md`: how the rules play, and the source evidence behind them.

The original handoff stays unchanged outside `public/`. Vite explicitly denies serving it, including through `/@fs/`. Only selected PNGs enter `public/assets/`; generated assets and fixtures are ignored by Git and regenerated locally. `dist/` contains those selected original assets and is for private development. This MVP does not publish them or establish redistribution rights.

Phaser uses its [scene lifecycle](https://docs.phaser.io/phaser/concepts/scenes); Git hooks follow [Husky's current setup](https://typicode.github.io/husky/get-started.html).
