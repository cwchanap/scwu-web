# SCWU Web MVP

Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant, G Suneo, Yo, SIN, LIZARD, KAY, DIDO, SAKUYA, ALEX, SOU, HISO, ERUS, OS FENG, SEAN, GON, KATE, REMU, REAR, GIGI, SWW, OGI, ZIRO, MASA, 3-TIMES, ZENKA, Z-MEGA, ALPHA, SHIN-Z, ZAKU, PAC-HELO, GOLF, ASURA, TTRO, ASTROMAN, YINAN, AYA, DoraEmon, RARIO or TRAINING on any of its 18 stages, rebuilt for the browser from reverse-engineered data of the Windows game SCWU with TypeScript, Svelte 5, Phaser 4, Vite and Vitest. Each fighter's moves play from their own recovered action scripts and command table, in free practice or against the original CPU.

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

`bun run test` and `bun run check` expect assets to have been exported once (`bun run assets`). `bun run assets` skips the export while neither its script nor the handoff has changed. Run `bun run test` for Vitest; `bun test` selects Bun's own runner. `bun install` installs Husky's pre-commit hook, which runs `bun run validate`.

## Deploy to Cloudflare

The site is a static Worker (`wrangler.jsonc` serves `dist/`). The 28,000 art and audio files are over a Worker's 20,000-file static-assets limit on the Free plan (Paid allows 100,000 and needs Wrangler 4.34.0+), so they sit in a public R2 bucket and the page loads them from `VITE_ASSET_BASE` (`src/game/assetBase.ts`; unset, they come from this site's own `/assets/`). `vite.config.ts` cuts the data bundle into chunks under 15 MiB, since a Worker serves no file over 25 MiB.

Cloudflare's build cannot run `bun run assets`: `scwu-web-handoff/` is not in git. `scripts/upload_r2.sh` therefore also puts `src/game/generated/` in the bucket as `generated.tar.gz`, and `bun run build` (`scripts/build.sh`) downloads it instead of exporting when it runs on Workers Builds, which sets `WORKERS_CI`.

One-time setup:

1. Create an R2 bucket and give it a public URL (a custom domain; the `r2.dev` one is rate-limited).
2. Allow cross-origin reads, which WebGL needs for the art: `wrangler r2 bucket cors set <bucket> --file scripts/r2_cors.json`.
3. Create an R2 API token with Object Read & Write, then upload (needs the AWS CLI):

   ```sh
   bun run assets
   export R2_ACCOUNT_ID=... R2_BUCKET=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
   bun run upload:r2
   ```

4. In the Cloudflare dashboard, create a Worker named `scwu-web` from this repo (Workers Builds fails if the names differ). Leave the build command at its default, `bun run build`, and the deploy command `npx wrangler deploy`; add a build variable `VITE_ASSET_BASE` set to the bucket's public URL.

Run `bun run upload:r2` again whenever `bun run assets` changes its output, before the next deploy. The art and audio sync (`aws s3 sync`) uploads only what changed and deletes what the export dropped; `generated.tar.gz` is rebuilt and copied on every run. The Workers build refuses to build a commit whose `scripts/export_assets.py` does not match the tarball's `.exporter` fingerprint, so a forgotten re-upload fails the build instead of shipping stale data.

Builds of other branches (Worker Previews) do not inherit production settings. In the Worker's **Settings** → **Build**, add the same `VITE_ASSET_BASE` to the Previews build variables and set the Preview command to `npx wrangler preview` (`wrangler` is not a project dependency, so `bun run wrangler preview` fails the way `bun run deploy` does). `wrangler.jsonc` carries the empty `previews` block that command requires.

## CI

GitHub Actions (`.github/workflows/`) runs on pushes to `main` and on ready-for-review pull requests: **Build and Lint** (Prettier, ESLint, `svelte-check`, `vite build`), **Run Unit Tests** (Vitest) and **Playwright Tests** (`e2e/`, against the production build). Dependabot (`.github/dependabot.yml`) opens weekly grouped PRs for Bun and Actions updates.

GitHub's runners have no `scwu-web-handoff/`, so `.github/scripts/fetch-generated.sh` downloads `generated.tar.gz` and `fixtures.tar.gz` from the R2 bucket instead, and refuses data whose `.exporter` fingerprint does not match the commit's `scripts/export_assets.py`. Set the repository variable `VITE_ASSET_BASE` to the bucket's public URL (Settings → Secrets and variables → Actions → Variables). After changing `export_assets.py`, run `bun run assets && bun run upload:r2` before pushing, or CI fails on the fingerprint. Locally, `bun run build && bun run e2e` runs the browser test.

## Play

| Input                        | Action                                              |
| ---------------------------- | --------------------------------------------------- |
| A / D or left / right arrows | Move                                                |
| W or up arrow                | Jump; from neutral, again in the air: double jump   |
| S or down arrow (hold)       | Crouch                                              |
| G / H                        | Punch / kick; after contact, G or H chains          |
| Back (hold)                  | Guard, away from the opponent                       |
| Shift                        | Dash; hold away for backdash                        |
| Left / right                 | Double-tap to dash, on the ground or in the air     |
| J                            | Grab and throw (close range, ground only)           |
| E                            | Enter or leave EX mode (50 power)                   |
| K                            | Hit Up (Jump on hit chases); COUNTER HIT in a block |
| F                            | IORI; tap again for each of two follow-ups          |
| P / Escape                   | Pause / resume                                      |
| R                            | Reset the current mode                              |

Ryuko's specials and supers use these motion commands. Directions read toward the opponent (→ forward, ← back), and the button follows the last direction by at least a tick:

| Motion       | Move                                                |
| ------------ | --------------------------------------------------- |
| → → (← ←)    | Dash (backdash), ground or air; neutral between     |
| ↑ (↗ ↖)      | In the air, from neutral: double jump               |
| ↓→ G         | Axe throw (EX Fire in EX mode)                      |
| ↓← H         | Drill Punch (ground or air)                         |
| ↓← G         | IORI, and each of its follow-ups                    |
| ←↓→ H        | Daisetsuzan Oroshi                                  |
| ↓ ↓ K        | Enter or leave EX mode (release down between)       |
| ↓→↓→ G       | Getter Beam (ground or air)                         |
| ↓→↓→ H       | Mega Getter Beam                                    |
| ↓←↓→ G       | Black Getter Mega Rush (axe throw at 30% health up) |
| →↓←→↓← G / H | Musashi / Getter Change Attack                      |

Zoma's specials and supers use motion commands, and his original motion commands work too:

| Input                      | Zoma's move                                                     |
| -------------------------- | --------------------------------------------------------------- |
| G / H                      | P 1 / K 1; on a hit or block, G or H again for P 2 / K 2        |
| G / H during P 2 or K 2    | P 3 (a multi-hit rush) / K 3 (a gun burst)                      |
| Down + G / H               | Crouching punch / sweep                                         |
| G / H in the air           | Air punch / kick (a different form after a double jump or dash) |
| Shift or → →, holding →    | Run while → is held; ↑ during the run leaps into a high jump    |
| Shift + ← or ← ←           | Back hop; ↑ during it jumps back                                |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                           |
| K                          | Hit Up; on a hit, ↑ chases into the air                         |
| J                          | Chuck: a close grab, slam and toss, then a thrown hatchet       |
| Blocking with a stock: K   | COUNTER HIT early in the block; G + H together later            |
| →↓↘ G                      | DRAGON, a rising multi-hit uppercut (ground or air)             |
| ↓→ G                       | FIRE, one fireball at a time; again while it flies, P 1         |
| F, or ↓← G (H, G + H)      | dragon 2: vanish, then strike from ahead (farther, in place)    |
| ↓→ H                       | BOMB: three bombs fall on marks ahead; five, then a reload      |
| E, or ↓→↓→ H               | G Beam, a short multi-hit beam                                  |
| ↓→↓→ G                     | SPAKE: a charging dash (ground or air), 1 stock                 |
| →↓←→↓← G                   | DST: a close command grab, toss, juggle and blast, 1 stock      |
| ↓←↓← H                     | EN300: a rising sun-ball barrage, 3 stocks                      |
| ↓←↓→ H                     | Shin Spark below 30% health (else BOMB), 3 stocks               |

Kiki's moves take Ryuko's keys too:

| Input                          | Kiki's move                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| G / H                          | P 1 / K 1; on a hit or block, G or H again for P2 / K 2         |
| G / H during P2 or K 2         | P3 (a long lunging punch) / K 3 (a flying fist)                 |
| Down + G / H                   | Crouching punch / a hopping potato                              |
| G / H in the air               | Air punch / kick (a different form after a double jump or dash) |
| Shift or → →; Shift + ← or ← ← | Dash hop forward; back                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                           |
| K                              | Hit Up; on a hit, ↑ chases into the air                         |
| J                              | Chuck: a close grab that ends in a blast                        |
| Blocking with a stock: K       | COUNTER HIT                                                     |
| ↓→ H                           | DRAGON O, a rising multi-hit (ground or air)                    |
| ↓→ G                           | K'; then → H a dashing strike, → G a shot, or ← H BLACK OUT     |
| F, or ↓← H                     | TATUMAKI, a hopping spin (ground or air)                        |
| ↓→↓← G                         | ranbu: a dash into a slam and flurry, 1 stock                   |
| ↓→↓→ G                         | MAGIC FIRE: eleven fireballs, 1 stock                           |
| ↓→↓→ H                         | EN3 majic dance: a lift, then witches and a beam, 3 stocks      |

So do Chung's:

| Input                          | Chung's move                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                     |
| P3                             | A strike that catches the opponent, then blasts them away                                              |
| Down + G / H                   | Crouching punch / a burning kick that knocks down                                                      |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                     |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                  |
| K                              | Hit Up                                                                                                 |
| J                              | Chuck: a close grab that hurls the opponent into the screen's edge                                     |
| Blocking with a stock: K       | COUNTER HIT                                                                                            |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): EX forms of several moves                                       |
| →↓↘ G                          | Dragon (ground or air)                                                                                 |
| ↓→ G                           | Fire ball, a thrown star                                                                               |
| F, or ←↓→ H                    | orochi                                                                                                 |
| ↓← G                           | Burn Knock                                                                                             |
| ↓← H; ↓→ H in the air          | jump wall move, a leap back that clings to the wall (then H kicks off it, G or ↑ leaps away); air fire |
| ↓←↓→ G                         | gesar (nin star in the air), 1 stock                                                                   |
| ↓→↓→ H                         | lee: kicks that carry the opponent up to float, 1 stock                                                |
| ↓←↓← H                         | EN300: a shock, then lifts and tosses, 3 stocks                                                        |

So do Amiro's:

| Input                          | Amiro's move                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                            |
| P3 / K3                        | A lunge that hurls the opponent into the screen's edge / a bouncing ball                      |
| Down + G / H                   | Crouching punch / a sweep                                                                     |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                         |
| K                              | Hit Up                                                                                        |
| J                              | Chuck: a close grab and a spinning toss                                                       |
| Blocking with a stock: K       | COUNTER HIT                                                                                   |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): EX forms of her specials and supers                    |
| →↓↘ G                          | Dragon (ground or air); in EX mode EX Beam, an anti-air beam, or in the air EX Air Dragon     |
| ↓→↓→ H                         | BEAM; in EX mode funnal call, a drone that fires a beam                                       |
| F, or ←↓→ H                    | Coment chuck: a grab that throws the opponent straight up; in EX mode Crush                   |
| ↓← G                           | morning star, a flail; in EX mode NT                                                          |
| →↓←→↓← G                       | scc: a grab, a toss up and a beam, 1 stock (in EX mode WHIP)                                  |
| ↓←↓→ G                         | medeo: a meteor drop, 3 stocks (Evil En3 below 30% health)                                    |
| ↓←↓← H                         | NT: a flying unit that strikes from range, 1 stock (EVIL NT below 30% health, EXR in EX mode) |
| ↓→↓→ G                         | funnal: drones that fire beams, 1 stock (evil funnal below 30% health, EFB in EX mode)        |

And ANMC P's:

| Input                          | ANMC P's move                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                       |
| P3 / K3                        | A rushing punch that hurls the opponent into the screen's edge / a kick that blasts them away                                            |
| Down + G / H                   | Crouching punch / a kick that knocks down                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                       |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                    |
| K                              | Hit Up                                                                                                                                   |
| J                              | Chuck: a close grab that spins the opponent away                                                                                         |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                              |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): he guards in another costume, and his K2, K3, crouching kick, chuck and twis att take other forms |
| ↓← G                           | fly move: a rocket leap that strikes as it rises                                                                                         |
| ↓→ G                           | fire ball, lobbed in a high arc (in the air, thrown down at an angle)                                                                    |
| F, or ↓← H                     | twis att: a spinning rush, which a super can cancel for 2 stocks                                                                         |
| ↓→ H                           | ball fire, a straight shot (in the air, after a hop back)                                                                                |
| →↓←→↓← G                       | SUPER CHUCK: a grab and a beating that knocks the opponent into the screen's edge, 1 stock                                               |
| ↓→↓→ G                         | super ball: a leap and balls that fire beams again and again, 1 stock                                                                    |
| ↓→↓→ H                         | en300: a cut-in, then a barrage of shots, 3 stocks                                                                                       |

And Giant's:

| Input                          | Giant's move                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                           |
| P3 / K3                        | A punch that knocks the opponent away / a grab that twists them away but knocks him down too                                                                                 |
| Down + G / H                   | An uppercut / a sweep                                                                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                           |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                        |
| K                              | Hit Up                                                                                                                                                                       |
| J                              | Chuck: a grab, then a song that dazes the opponent until the music explodes, throwing them and him                                                                           |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                  |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): his P3, K3, Hit Up, specials and supers take other forms                                                                              |
| →←↓→ G                         | Rock punch: a rocket punch that flies out from range (in EX mode B FIRE, a beam)                                                                                             |
| ↓→ H                           | base ball: a pitch of random kind (in the air, drop punch, a dive; in EX mode NEW HARIKEN)                                                                                   |
| F, or ↓→ G                     | H PUNCH: a hammer punch that hurls the opponent into the screen's edge, which a super can cancel for 2 stocks (in EX mode EX Crush)                                          |
| →↓← H                          | counter: struck during its 0.72-second stance, he takes double damage, then strikes back, rushing in to beat the opponent inside a cloud of dust (in EX mode a moving chuck) |
| ↓→↓→ G                         | fire: a fire beam, also in the air, 1 stock (Evil fire below 30% health; in EX mode SC MAHA P, a punch flurry, or in the air SUPER DROP PUNCH)                               |
| ↓→↓→ H                         | HARIKEN: a whirlwind that hops the opponent in and out, 1 stock (in EX mode super base ball, ten pitches)                                                                    |
| ↓←↓← G                         | en300: calls his friends, then a screen-wide barrage, 3 stocks                                                                                                               |

And G Suneo's:

| Input                          | G Suneo's move                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                              |
| P3 / K3                        | A rushing punch that hurls the opponent into the screen's edge / a leaping kick that strikes again and again                    |
| Down + G / H                   | A rising punch / a sliding sweep                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                              |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                           |
| K                              | Hit Up                                                                                                                          |
| J                              | Chuck: a grab, a hop back and a leaping throw that spins the opponent away                                                      |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                     |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): her K2, crouching and air attacks, Hit Up, chuck and specials take other forms           |
| →↓↘ H                          | DRILL KNIEE: a rising knee, also in the air (in EX mode, in the air, a diving knee)                                             |
| ↓→ G                           | FIRE BALL: a shot that speeds up, which a super can cancel for 2 stocks                                                         |
| F, or ↓← G                     | G DRIVER: a drill lance thrust that hurls the opponent into the screen's edge (in EX mode a strike that shocks them)            |
| ↓← H                           | BIKE: a leap on a golden lion, also in the air (in EX mode a kick and a wheel that strikes again and again)                     |
| H H ← G H                      | hh, below 30% health: a screen-wide shock, then a long beating, 3 stocks; a KO by it makes the opponent vanish in a faint flash |
| →↓←→↓← G                       | GP: a grab, then a beating out of sight before a launch, 1 stock; a KO by it makes the opponent vanish in a faint flash         |
| ↓→↓→ H                         | en300: a shock, then a hammer, 3 stocks; a KO by it makes the opponent vanish in a faint flash                                  |
| ↓→↓→ G                         | BP: a flying fist that strikes three times, 1 stock (BP EVIL, a ring, below 30% health)                                         |

And Yo's, most in a costume:

| Input                          | Yo's move                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                           |
| P3 / K3                        | A pistol shot / a kick in a long coat                                                                        |
| Down + G / H                   | A licker's tongue lash / a plant's lash that knocks the opponent down                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                           |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                        |
| K                              | Hit Up: a monster rising from the floor                                                                      |
| J                              | Chuck: zombie hands burst from the floor to hold the opponent, then a kick                                   |
| Blocking with a stock: K       | COUNTER HIT                                                                                                  |
| →↓↘ G                          | Dragon: a man springs out of a trunk with the opponent                                                       |
| ↓← H                           | TOFU: a gatling burst                                                                                        |
| F, or ←↓→ H                    | ZOMBI WALK: a zombie's shuffle that grabs and bites the opponent, healing her 20                             |
| ↓← G                           | Run in: a monster's charge and claw                                                                          |
| ↓→ G in the air                | Fire ball: a rocket                                                                                          |
| ↓→↓← G                         | GIGA PRESS: a charge that carries the opponent into the screen's edge, then slams and launches them, 1 stock |
| ↓←↓← H                         | HIDDEN, below 30% health: a hidden brute's rush and beating, 1 stock (TOFU otherwise)                        |
| ↓←↓← G                         | snake: a giant snake rising from the floor, 1 stock                                                          |
| ↓→↓→ H                         | en300: a cannon blast across the screen, 3 stocks                                                            |

And SIN's, in another guise for most moves:

| Input                          | SIN's move                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                  |
| P2 / P3                        | A horned demon's dashing slash / a golden serpent's lunge that launches the opponent                                                |
| K2 / K3                        | A sweep, then a rising kick / a wolf's leap                                                                                         |
| Down + G / H                   | A chainsaw thrust / a low blade that knocks the opponent down                                                                       |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                  |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                               |
| K                              | Hit Up                                                                                                                              |
| J                              | Chuck: a masked man's grab and throw                                                                                                |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                         |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): his stance and grabs take other forms                                                        |
| ↓→ G                           | S PUNCH: a dashing flurry of blasts, which BAKU or SUP RUN C can cancel for 2 stocks                                                |
| ←↓→ G                          | low chuck: a hooked pole that catches the opponent's feet and flips them                                                            |
| F, or →↓← H                    | RUN CHUCK: a dashing grab, also in the air, that leaps and drops the opponent on their head (harder in EX mode or below 30% health) |
| ←↓→ H                          | Clack chuck: a grab, a leap and a slam (in EX mode a higher leap; below 30% health EVIL CLACK HIT, three slams before it, for 70)   |
| ↓← G                           | WOLF att: a wolf's leap                                                                                                             |
| ↓←↓→ G                         | BAKU: a masked brute's charge, 1 stock                                                                                              |
| ↓→↓→ H                         | SUP RUN C: RUN CHUCK into a clawed figure's slashes, also in the air, 1 stock                                                       |
| →↓←→↓← G                       | EN300: a grab and machete cuts, 3 stocks (in EX mode three lion-head pillars)                                                       |
| →↓←→↓← H                       | NOZAN, below 30% health: a grab and a long beating out of sight, 3 stocks (RUN CHUCK otherwise)                                     |

And LIZARD's, in a different mecha or armor for most moves:

| Input                          | LIZARD's move                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                                         |
| P2 / P3                        | A purple mecha's blade slash / an orange-armored shield bash                                                                                                                               |
| K2 / K3                        | A red mecha's spinning kick / a winged white mecha's blade                                                                                                                                 |
| Down + G / H                   | A purple mecha's prone rifle shot / a black mecha's low swipe that knocks the opponent down                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                      |
| K                              | Hit Up: a black mecha's rising lance                                                                                                                                                       |
| J                              | Chuck: a blue-armored grab that spins the opponent away                                                                                                                                    |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                                |
| →↓↘ G                          | Cross: a red mecha raises a pillar of red light that ends in a cross                                                                                                                       |
| ↓→ G                           | FIRE: a blue-armored blast of red lightning                                                                                                                                                |
| F, or ↓← H                     | jump att: a purple mecha's leaping grab and throw, also in the air                                                                                                                         |
| ↓←↓→ G                         | HIDDEN, below 30% health: a rush into a fanged maw's bite, 1 stock (FIRE otherwise)                                                                                                        |
| ↓→↓← G                         | chuck sup: a purple mecha's leap that catches an airborne opponent, swallows them in a giant striped sphere and drops them, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| ↓→↓→ H                         | dragon sp: a leap in a black slab's disguise; a hit calls a flight of white winged beasts down on the opponent, 1 stock                                                                    |
| ↓←↓← G                         | en300: a pale spirit's orb that bursts into a dome of light, 3 stocks                                                                                                                      |

And KAY's, dressed as a different angel or mecha for most moves:

| Input                          | KAY's move                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                     |
| P2 / P3                        | A pink-haired figure's ribbon lashes / a gold-collared figure's paper blades (in EX mode a lance thrown from a red cross)              |
| K2 / K3                        | A striped sphere that swallows him / a gold-masked figure's strike (in EX mode a stretching punch)                                     |
| Down + G / H                   | A blue crystal's jab (in EX mode a black figure's blade) / a black figure's low sweep                                                  |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                     |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                  |
| K                              | Hit Up: a fishing rod's cast                                                                                                           |
| J                              | Chuck: a nurse's syringe                                                                                                               |
| Blocking with a stock: K       | COUNTER HIT; his air guards free him after 6 ticks                                                                                     |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                              |
| →↓↘ G                          | air chuck: a spider's leap that catches only an airborne opponent and crashes down with them, knocking him down too, also in the air   |
| ↓→ G                           | Fire: a spinning red lance thrown from a cross (in EX mode a stance: J for a dashing grab, K for a claw's beam)                        |
| F, or →↓← H                    | Counter: a twin-colored stance; struck in it, he splits in two and slashes, which KAORU or SUPER P can cancel for 2 stocks             |
| ←↓→ H                          | Comment chuck: a clawed black figure's grab (harder below 30% health; in EX mode a pink figure's whips)                                |
| ↓← G / H                       | 12P / 12K: black arms bursting from the ground at a middle / long distance (in EX mode a pillar of light there, a decoy at the other)  |
| ↓←↓← G                         | en300: a purple mecha's grab and berserk mauling, 3 stocks (in EX mode a claw wave)                                                    |
| ↓→↓→ H                         | KAORU: a silver-haired boy's low grab into a long scene with a giant purple hand, 1 stock (in EX mode a ribbon-armed figure's slashes) |
| ↓→↓→ G                         | SUPER P: a wound-up stretching punch, 1 stock (in EX mode a blue crystal's beam)                                                       |

And DIDO's, dressed as a different armored figure or mecha for most moves:

| Input                          | DIDO's move                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: an axe's swing / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                 |
| P2 / P3                        | A red-armored figure's flying kick / a blue mecha's lance lunge                                                                             |
| K2 / K3                        | A blue hover scooter's ram / an orange-armored figure's trident                                                                             |
| Down + G / H                   | A sheep costume's crawl / a blue tail's low sweep                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward (↑ during it for a long jump); back                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                       |
| → + H                          | DASH K: a tiger-striped figure's dashing strike                                                                                             |
| K                              | Hit Up: a maid's swing                                                                                                                      |
| J                              | Chuck: a green arm cannon's grab                                                                                                            |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                 |
| ↓→ H                           | slid: a low dive on a white jet sled                                                                                                        |
| ↓→ G                           | fire: a gold-winged figure's blue flames; in the air a purple winged figure's (harder below 30% health)                                     |
| F, or ↓← H                     | RAiden: a grey mecha's claw strike; press H again to keep striking                                                                          |
| ↓← G                           | doge: a pink heart-armored figure's dash, low enough to pass under most strikes, which strikes once beside the opponent, 30                 |
| ↓←↓→ H                         | Hidden En300, below 30% health: a white-robed girl's magic circle; a catch plays a long scene of wings and water, 3 stocks (slid otherwise) |
| ↓→↓→ H                         | Temjin fly: a white-suited girl surfing a giant blade, 1 stock, also in the air                                                             |
| ↓←↓← H                         | dragon super: a hooded figure's staff calls a blue lightning dragon that coils around her, 1 stock                                          |
| ↓→↓→ G                         | Raiden: a red mecha's black wings fire a barrage diagonally up the screen, 1 stock                                                          |
| ↓←↓→ G                         | EN300: a purple winged mecha's dash; a catch sends giant hands sweeping across the stage behind her, 3 stocks                               |

And SAKUYA's, dressed as a different swordswoman, armored figure or mecha for most moves:

| Input                          | SAKUYA's move                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: her sword's slash / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                            |
| P2 / P3                        | A pink-kimono swordswoman's slash / a silver-armored figure's red blades (in EX mode a blue-striped swordswoman's thrust / a red-armored figure's strike)                                 |
| K2 / K3                        | A red-dressed girl's crossbow / a red-armored figure's chain claw, which catches the opponent far out and pulls them back up (in EX mode a black-robed archer's bow / a bazooka)          |
| Down + G / H                   | A red-clad girl's jab / a purple maid's scythe sweep (in EX mode a swordswoman's low slash / a masked swordsman's cut)                                                                    |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                        |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                     |
| K                              | Hit Up: a yellow-dressed girl's giant teddy bear                                                                                                                                          |
| J                              | Chuck: a scythe's grab                                                                                                                                                                    |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                               |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): most of her moves take other forms                                                                                                                 |
| →↓↘ G                          | Dragon punch: a red-dressed girl rises on white wings (in EX mode a cat-eared fighter's flipping kicks)                                                                                   |
| ↓→ G                           | FIRE: a pink-kimono swordswoman's fireball, also in the air (in EX mode a slow one)                                                                                                       |
| F, or ↓← G                     | iori: an orange-coated figure's dashing slash; ↓← G twice more for two follow-ups (in EX mode a green-armored figure's clawed shield)                                                     |
| →↓← H                          | counter: a cat-eared fighter's stance; struck in it, she grabs and throws for 40 (in EX mode a pinstripe-suited figure's gatling gun, from range)                                         |
| →↓↘ H                          | DRAGON KICK: a silver-armored figure's dashing red blades (in EX mode a flurry of them)                                                                                                   |
| ↓→ H                           | LOW FIRE: a pink-dressed girl's low staff sweep (in EX mode a slow fireball)                                                                                                              |
| ←↓→ H                          | C C: a hatted figure's blade rush; then ↓→ H or ↓→ G for a mounted rider's charge                                                                                                         |
| ↓←↓→ G                         | en300: a white-coated swordswoman's dash; a catch turns into a horned mecha girl's blade combo, 3 stocks                                                                                  |
| ↓→↓→ H                         | super HIT UP: a green-uniformed girl's swing that calls an airship, 1 stock; in the air a mecha's diving dash (in EX mode a cat-eared fighter's flurry; in the air a red-winged figure's) |
| ↓→↓→ G                         | SPARK: a horned mecha girl's blade dash, 1 stock (in EX mode a maid calls a gate cannon whose ray rises diagonally from range)                                                            |

And ALEX's, a boy in a cap dressed as a different armored hero or mecha for most moves:

| Input                          | ALEX's move                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                  |
| P2 / P3                        | A red-armored figure's sword sweep / a grey-armored figure's lance gun (in EX mode a wider sweep / a green-armored figure's dagger) |
| K2 / K3                        | A yellow-armored figure's twin daggers / a blue-armored figure's bow (in EX mode its lance)                                         |
| Down + G / H                   | A red lance's jab / sweep                                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                  |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                               |
| K                              | Hit Up: an uppercut                                                                                                                 |
| J                              | Chuck: a drill lance's grab                                                                                                         |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                         |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                           |
| →↓↘ G                          | dragon: a gold-armored figure's rising drill lance                                                                                  |
| ↓→ G in the air                | air fire: a pink-armored archer's arrow (on the ground the same input is P1)                                                        |
| F, or ↓→ H                     | REFLACT: an arm shield that turns an incoming projectile back as a ball of light (in EX mode a red-horned mecha's sword thrust)     |
| →↓← H                          | counter: a green-armored figure's stance; struck in it, he slashes back (in EX mode a blue-armored figure's, with a bow)            |
| →←↓→ G                         | HAOU: a combined blaster's shot (in EX mode a burst of them)                                                                        |
| ↓←↓← H                         | en300: summons a white mecha dragon, 3 stocks (in EX mode another form, stronger from range)                                        |
| ↓→↓→ H                         | GYSA: a red-horned mecha's three sword strikes, 1 stock (in EX mode a drill-lanced mecha's grab up close)                           |
| ↓→↓→ G                         | super fire: a red dinosaur tank's cannon, 1 stock (in EX mode a red-horned mecha's sword dash)                                      |

And SOU's, a boy in a white headband dressed as a black-armored mecha or a helmeted pilot for most moves, who calls beast mechas in EX mode:

| Input                          | SOU's move                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a short sword's slash; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                              |
| P2 / P3                        | A soldier's punch / the mecha's arm punch (in EX mode a gunman's pistol shot)                                                                                                                                  |
| K2 / K3                        | The mecha's scythe sweep / a gunman's pistol shot (in EX mode a yellow-helmed figure's punch)                                                                                                                  |
| Down + G / H                   | A red-helmed figure's punch / a yellow-helmed figure's (in EX mode a long-haired girl's low kick)                                                                                                              |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                          |
| K                              | Hit Up: the pilot's uppercut                                                                                                                                                                                   |
| J                              | Chuck: the mecha's grab                                                                                                                                                                                        |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                                                    |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                                                                                                      |
| →↓↘ H                          | AKUMA jump: a leap; G or H turns it into a diving punch or a flying kick (in EX mode the mecha's rising uppercut)                                                                                              |
| ↓→ H                           | Fire Kick: the mecha's low rifle shot; in the air a flying kick (in EX mode he calls a black panther mecha)                                                                                                    |
| F, or ↓← G                     | IORI: the mecha's sword slash; ↓← G chains two more (in EX mode a heavy gun's shot)                                                                                                                            |
| ↓→ G                           | BK: the mecha's dashing punch, also in the air (in EX mode he calls a yellow lion mecha; in the air he hangs from an eagle jet, steered with the directions for up to five seconds and dropped with G, H or J) |
| ↓← H                           | MID SLASS: the mecha's sword slash (in EX mode a leaping ground slam)                                                                                                                                          |
| ↓→ K                           | HIDDEN A: a quick step (in EX mode he calls a white mammoth mecha)                                                                                                                                             |
| ↓→↓← H                         | Command 1: the mecha's punch rush, 1 stock (in EX mode its sword combo)                                                                                                                                        |
| ↓→↓→ H                         | SPARK: a dive as a black jet, also in the air, 1 stock (in EX mode the mecha's shoulder cannons fire a beam)                                                                                                   |
| ↓→↓→ G                         | DANKU SHOT: the mecha's shoulder cannons, 1 stock (in EX mode a sword combo; below 30% health a stronger shot)                                                                                                 |
| ↓←↓← G                         | Beast att: the lion, panther and mammoth charge in turn, 3 stocks (in EX mode a winged mecha's green beam)                                                                                                     |
| J G ← H K                      | KOKAKEN: the pilot's sword dash, 3 stocks, only below 30% health                                                                                                                                               |

And HISO's, a boy in a red sleeveless top dressed as a different character for most moves, with no EX mode:

| Input                          | HISO's move                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                   |
| P2 / P3                        | A suited man's pointing jab / a girl in glasses swinging a vacuum cleaner's toothed hose                                                             |
| K2 / K3                        | A clown-faced boy's thrown rock / a muscled brawler's punch                                                                                          |
| Down + G / H                   | A samurai's sword slash / the brawler's punch                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                   |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                |
| K                              | Hit Up: an uppercut                                                                                                                                  |
| J                              | Chuck: the clown-faced boy's grab and sliding kick                                                                                                   |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                          |
| →↓↘ G                          | Dragon p: a samurai's rising sword slashes, also in the air                                                                                          |
| ↓→ G                           | FIRE: the clown-faced boy's thrown card                                                                                                              |
| F, or ↓← G                     | bannaku: a headbanded knife fighter's dashing slash; a super cancels it for two stocks                                                               |
| →↓← H                          | counter: a stance with a phone; struck in it, a machine-gun man fires back                                                                           |
| ↓→ H                           | striker: a gunwoman behind him fires a shot that holds whoever it meets still (HISO stop)                                                            |
| ↓←↓← H                         | FISH: a suited man's red book looses a fish spirit that seizes the opponent up close, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| ↓→↓→ H                         | en300: a shirtless, tattooed man calls a dark giant, 3 stocks                                                                                        |
| ↓←↓← G                         | fly arm: the clown-faced boy's flying fists up close, 1 stock                                                                                        |
| ↓→↓→ G                         | S Shoot: a blue-coated boy's palm blast, 1 stock                                                                                                     |

And ERUS's, a blond figure in a black coat and white bandeau dressed as a different character for most moves, who calls helpers in EX mode:

| Input                          | ERUS's move                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a chain swing / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                  |
| P2 / P3                        | A blue-robed figure's chain whip / a suited man's knife thrust                                                                                                              |
| K2 / K3                        | A spiky-haired boy's sliding kick / the suited man's briefcase swing                                                                                                        |
| Down + G / H                   | A green-clad boy's slab strike / a cap-wearing figure's sword slash                                                                                                         |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                       |
| K                              | Hit Up: a girl in a red dress's rising punch                                                                                                                                |
| J                              | Chuck: the blue-robed figure's chains                                                                                                                                       |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                 |
| E, or ↓ ↓ K                    | Enter or leave EX mode (a stock): most of her moves take other forms                                                                                                        |
| →↓↘ G                          | INATUMA: the spiky-haired boy's electric strike (in EX mode his claw rush)                                                                                                  |
| ↓→ G                           | VO5: the green-clad boy's punch; in the air he hurls a boulder (in EX mode she calls two headbanded boys who drop in and charge; in the air the blue-robed figure's chains) |
| F, or ↓→ H                     | Coin: the suited man flicks a coin, seven in all, then every other press fails (in EX mode she calls a white-haired scythe fighter from a portal)                           |
| →↓← H                          | COUNTER: the girl's stance; struck in it, she hits back (in EX mode a book that also answers specials)                                                                      |
| ↓← G / H / G+H                 | TELP P / K / PK: the spiky-haired boy's blur step (in EX mode his lunging strikes)                                                                                          |
| ↓→↓← G                         | lizard fly: the spiky-haired boy's flying grab, which catches only an opponent in the air, 1 stock (in EX mode a blur-step rush)                                            |
| ↓←↓← H                         | SCC: the spiky-haired boy's rush up close, 1 stock; in the air the blue-robed figure's (in EX mode the suited man's coin barrage, or in the air the green-clad boy's)       |
| ↓→↓→ G                         | Super slash: the cap-wearing figure's scythe slash, 1 stock (in EX mode the spiky-haired boy's rising strikes)                                                              |
| ↓→↓→ H                         | EN300: a headbanded boy's punch rush, 3 stocks (in EX mode the girl swells into a brawler)                                                                                  |
| ↓→↓← H                         | コマンド 3: she draws a card that heals her or drops planks on the opponent, 3 stocks, only below 30% health                                                                |

And OS FENG's, a blue-haired boy in glasses and a red vest dressed as a different character for most moves:

| Input                          | OS FENG's move                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                   |
| P2 / P3                        | A white-shirted fighter's crescent slash / a white-coated man in glasses' pistol shot                                                                                |
| K2 / K3                        | A green-capped figure's high kick / a red-bandannaed fighter's kicks                                                                                                 |
| Down + G / H                   | A headbanded figure's crouching double stab / a white-clad figure's slide with a black hound                                                                         |
| In the air: G / H              | A boxer's punch / the green-capped figure's kick                                                                                                                     |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                   |
| ↑ while dashing forward        | High Jump                                                                                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                |
| K                              | Hit Up: a blond girl in a white kimono's rising punch                                                                                                                |
| J                              | Chuck: a shirtless man in sunglasses points, and the opponent turns into a strawberry shortcake (in EX mode a cheesecake)                                            |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                          |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): dragon, ICE punch, sshoot and the chuck take other forms                                                                      |
| →↓↘ H                          | dragon: a black-pompadoured man's punch (in EX mode a spotted, clawed beast's leap)                                                                                  |
| ↓→ G                           | Fire: a winged girl in pink shoots an arrow from her wand; in the air an orange-headbanded boy throws a yellow spirit                                                |
| F, or ↓← G                     | iori: a black-clad fighter's spear thrust; ↓← G again for a hooked blade, then a sword (below 30% health, driven into the ground); a super cancels it for two stocks |
| ↓← H                           | bp: the sunglassed man's clawed lunge (below 30% health, the spotted beast joins in)                                                                                 |
| ←↓→ H                          | SUCK: a white-robed archer's line reels the opponent in; also in the air                                                                                             |
| ↓←↓→ H                         | ICE punch: a black-robed fighter's dashing punch that looses an ice wolf, 1 stock (in EX mode a hooded, black-cloaked fighter's freezing strikes)                    |
| ↓→↓→ G                         | sshoot: a blond-pigtailed girl's cannon fires a fireball, 1 stock (in EX mode the black-pompadoured man's fire beam; at 150 life or less, a stronger volley)         |
| ↓→↓→ H                         | EN300: an orange-haired swordsman in red armour, 3 stocks                                                                                                            |

And SEAN's, a bald old monk in green robes and prayer beads who calls up a different character for most moves:

| Input                          | SEAN's move                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                   |
| P2 / P3                        | A blue-haired girl's triple strike / a red-haired fighter's dive                                                                     |
| K2 / K3                        | A white-armoured figure's exploding seal / a dark-clad swordsman's vortex dash                                                       |
| Down + G / H                   | A cloaked figure's sweep / a horned figure's low kick                                                                                |
| In the air: G / H              | A spiky-haired swordsman's dive / a kick from a figure in a white hood                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                   |
| ↑ while dashing forward        | High Jump                                                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                |
| K                              | Hit Up: a lunging swing of his sleeve                                                                                                |
| J                              | Chuck: a chubby pigtailed figure's long tongue                                                                                       |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                          |
| →↓↘ G                          | Dragon: a small red-robed man's crescent; a super cancels it for two stocks                                                          |
| ↓→ G                           | whip attack: an eye-patched man's five whips                                                                                         |
| F, or ↓→ H                     | Whip attack K: the same whips, farther off                                                                                           |
| ↓← H                           | CC: an elf-eared hooded figure's red card makes the opponent vanish; in the air it catches only an airborne one                      |
| ↓←↓← G                         | SCC: an old man in yellow robes whose grab reaches across the screen, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| ↓→↓→ G                         | S Shoot: the dark-clad swordsman's crescent wave, 1 stock (at 150 life or less, a stronger one)                                      |
| ↓→↓→ H                         | en300: a rider on a yellow beast calls down lightning, 3 stocks                                                                      |

And GON's, a brown-haired boy with goggles on his head, an orange shirt and a blue vest who puts on a different creature's costume for most moves:

| Input                          | GON's move                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                                    |
| P2 / P3                        | A yellow armoured beast's claw charge / a green robot's low grab that blasts the opponent away                                                                                                        |
| K2 / K3                        | A yellow fox's spinning tail (at 141 life or less, a white-robed figure's sweep) / a blue dinosaur's dashing punch                                                                                    |
| Down + G / H                   | A blue wolf's spinning uppercut / a blue-hooded dragon's low kick                                                                                                                                     |
| In the air: G / H              | The blue dinosaur's diving claw / a green insect's kick                                                                                                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                    |
| ↑ while dashing forward        | High Jump                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                 |
| K                              | Hit Up: a dark winged demon's claws rise from the floor                                                                                                                                               |
| J                              | Chuck: a blue metal dinosaur's jaws                                                                                                                                                                   |
| Blocking with a stock: K       | COUNTER HIT                                                                                                                                                                                           |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): his P2, P3, K1, crouching and air punches, Hit Up, specials and supers take other forms                                                                        |
| →↓↘ G                          | DRAGON: a lion-maned figure's rising sword; →↓↘ G again during it, or a quick miss, rises again with Evil Dragon                                                                                      |
| ↓→ G                           | fire ball: an orange armoured dragon's dark crescent; in the air a winged gunner's lightning ball (in EX mode a caped lancer's dash, with ↓→ G twice more for two more, or ↓← G for a counter stance) |
| F, or ↓← G                     | DRILL: the yellow beast's spinning drill dive, also in the air; Super heart or KURENCOUNTER cancels it for two stocks (in EX mode a short counter stance)                                             |
| →↓← H                          | COUNTER: a 0.4-second stance with a little bear: struck in it, he takes double damage, then kicks the opponent and strikes in three costumes (in EX mode a moving grab)                               |
| ↓→ H                           | dash move: the yellow beast's charging claw                                                                                                                                                           |
| ↓←↓← G                         | KURENCOUNTER: the caped lancer's stance, which counters a hit for 110 and otherwise strikes (in EX mode a dashing barrage), 1 stock                                                                   |
| ↓→↓→ G                         | Super heart: a yellow teddy bear's breaking heart, 1 stock (in EX mode three hearts that fly out before they strike)                                                                                  |
| ↓→↓→ H                         | EN300: a golden armoured beast's exploding sun, 3 stocks (in EX mode the winged gunner's barrage)                                                                                                     |
| K ↓ ↓ G J                      | Hidden en300: only at 140 life or less (a Chuck above it), an orange-haired girl joins hands with him to call a white-caped knight, 3 stocks                                                          |

And KATE's, a blue-haired girl in a pink top and a blue skirt who, like GON, puts on a different costume for most moves:

| Input                          | KATE's move                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                                         |
| P2 / P3                        | A blue-robed priest's staff thrust / a purple-eared swordswoman's crescent cut                                                                                                                             |
| K2 / K3                        | A green-masked swordsman's slash / a white-winged knight's low lance thrust that pins the opponent, then drives through them                                                                               |
| Down + G / H                   | A pink-helmeted girl's pet spitting a blob / a green-robed lancer's low thrust                                                                                                                             |
| In the air: G / H              | A broadsword's downward cut / a red-clad fighter's kick                                                                                                                                                    |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                      |
| K                              | Hit Up: a white-robed figure's trident; on a hit, ↑ chases into the air                                                                                                                                    |
| J                              | Chuck: a white-suited figure's red crosshairs                                                                                                                                                              |
| Blocking with a stock: K       | COUNTER ATT                                                                                                                                                                                                |
| →↓↘ G                          | neko punch: a cat girl's rising paw                                                                                                                                                                        |
| ↓→ G                           | Air fire: in the air, a turquoise mage leaves a blue star hovering for 6 seconds; on the ground, af add, her strike that drops it onto whoever is below; BEAM or SLASH SUPER cancels af add for two stocks |
| ↓→ H                           | AIR FIRE K: as Air fire, but on the ground af add H sends the star down at a slant                                                                                                                         |
| F, or ↓← G                     | DASH ATTACK: a ninja's dagger dash through the opponent, who is struck five more times behind her; in the air a diving kick                                                                                |
| →↓← H                          | Counter: a 0.3-second stance with a winged girl's axe: struck in it, she takes 30% of the damage and swings it                                                                                             |
| ↓←↓← G                         | SLASH SUPER: an archer's arrow; if it strikes, she lunges in with a halberd (at 129 life or less, a red orb, then a halberd lunge there and back), 1 stock                                                 |
| ↓→↓→ G                         | BEAM: a red-clad fighter's long beam, 1 stock                                                                                                                                                              |
| ↓→↓→ H                         | en300: a goggled sorcerer's yellow spirits, 3 stocks                                                                                                                                                       |

And REMU's, a long-haired blond fighter in a teal jacket who, like GON and KATE, puts on a different costume for most moves:

| Input                          | REMU's move                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                   |
| P2 / P3                        | A blue-helmeted hero's lunging punch in red and white armour / his leaping grab, which beats the opponent                                            |
| K2 / K3                        | The hero's two kicks / his flying kick                                                                                                               |
| Down + G / H                   | A blue-armoured swordsman's low cut / the hero's sliding kick                                                                                        |
| In the air: G / H              | The swordsman's cut / the hero's kick                                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                   |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                |
| K                              | Hit Up: the hero's uppercut; on a hit, ↑ chases into the air                                                                                         |
| J                              | Chuck: a white and red horned robot's punches                                                                                                        |
| Blocking with a stock: K       | Counter Hit                                                                                                                                          |
| →↓↘ G                          | tatsumaki: the swordsman's swing that calls a grey whirlwind; Thander p, Phsy driver or MINAMI cancels it for two stocks                             |
| ↓→ G                           | slash: the swordsman's dashing cut; in the air a diving one, which slash again on landing after a hit follows with a quicker cut                     |
| F, or ↓← G                     | JET: the hero calls a jet-backed robot, which charges with a blade                                                                                   |
| ↓← H                           | Drill: the hero calls a drill that bursts from the ground                                                                                            |
| ↓←↓← G                         | BAKURETU: the swordsman's thrust that fires a yellow beam                                                                                            |
| ↓→↓→ G                         | Thander p: the robot's lightning-charged dashing punch, 1 stock                                                                                      |
| ↓→↓→ H                         | Phsy driver: the robot's leaping kick into a piledriver, 1 stock                                                                                     |
| ↓←↓← H                         | MINAMI: only at 155 life or less (Drill above it), a 1-second stance as the hero: struck in it, he takes 30% of the damage and strikes back, 1 stock |
| ↓←↓→ H                         | GOLD HAND: the robot climbs and dives with a golden hand, landing well ahead of him, into a long beating, 3 stocks                                   |

And REAR's, a masked blond fighter in a grey gi who, like GON, KATE and REMU, puts on a different costume for most moves:

| Input                          | REAR's move                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                             |
| P2 / P3                        | A horned red robot's drill-armed thrust / its spinning strikes                                                                                                 |
| K2 / K3                        | A purple and blue robot's low kicks / its kick that sends a green whirlwind along the floor                                                                    |
| Down + G / H                   | The red robot's thrust / the purple robot's beast-headed punch                                                                                                 |
| In the air: G / H              | A green-chested robot's punch / the purple robot's kick                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                          |
| K                              | Hit Up: a blue horse's horn; on a hit, ↑ chases into the air                                                                                                   |
| J                              | Chuck: a purple serpent's grab                                                                                                                                 |
| Blocking with a stock: K       | COUNTER ATT                                                                                                                                                    |
| →↓↘ H                          | SAMA: the purple robot's rising shield punch, also in the air                                                                                                  |
| ↓→ G                           | Fire ball: the red robot's fireball; GYSA or VIPER FINAL cancels it for two stocks                                                                             |
| F, or ↓← H                     | DOWN ATTACK: a long leap that strikes as he lands, over a near opponent's head                                                                                 |
| ↓← G                           | VIPER WHIP: the red robot's whip                                                                                                                               |
| ↓←↓→ G                         | GYSA: the red robot's hammer raises a pink crystal ahead of him (below 30% life, Evil GYSA's three), 1 stock                                                   |
| ↓→↓→ G                         | VIPER FINAL: a long whip that catches the opponent for a purple blast, 1 stock                                                                                 |
| ↓→↓→ H                         | en300: a giant sword's slashes, which miss an opponent standing close, 3 stocks                                                                                |
| K H → G J                      | evil en3: only below 30% life with three stocks, a green clock shot for 1; when it strikes, he spends the other two, takes a winged form and fires seven beams |

And GIGI's, a big-headed grunt in a black mask with an FK crest and a skeleton-striped suit:

| Input                          | GIGI's move                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                                                         |
| P2 / P3                        | A lunging punch / a dash past the opponent that grabs them from behind and flips them over                                                                                                                                 |
| K2 / K3                        | A high kick / a hopping kick                                                                                                                                                                                               |
| Down + G / H                   | A leaping punch / a low drop kick                                                                                                                                                                                          |
| In the air: G / H              | A punch / a kick                                                                                                                                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                                      |
| K                              | Hit Up: a rolling headbutt; on a hit, ↑ chases into the air                                                                                                                                                                |
| J                              | Chuck: a grab that leaps up with the opponent and slams them down                                                                                                                                                          |
| Blocking with a stock: K       | Counter Hit (after a heavy standing block, G and H together)                                                                                                                                                               |
| E, or ↓ ↓ K                    | Enter or leave his Change form (half a stock): other forms of his specials and two supers                                                                                                                                  |
| →↓↘ G                          | Dragon: a rising spin, also in the air (in his Change form Jump att, a leap that grabs the opponent's head and flips them)                                                                                                 |
| ↓→ G                           | K': a rifle butt; → G follows with a shot, → H with an upward swing (in his Change form Chuck ECC, a tumbling blue toy robot that bursts)                                                                                  |
| F, or ↓← G                     | DIVE: he sinks into the floor for up to 3 seconds, where ← and → move him and G or H comes up striking (in his Change form GIGI P, a rushing punch that ↓← G chains into two more, or ↓← H into a slide)                   |
| ↓ ↓ G                          | Bike Doge D P: a charge on an orange motorbike, also in the air; Ranbu or S chuck cancels it for two stocks (in his Change form Doge D, sinking into the floor to come up 150 source pixels on, or where he stands with H) |
| ↓ ↓ H                          | Bike Doge D K: a motorbike leap, also in the air (in his Change form Doge D, coming up 300 source pixels on)                                                                                                               |
| ↓ ↓ G H                        | Bike Doge D PK: Bike Doge D P (in his Change form Doge D, coming up where he stands)                                                                                                                                       |
| ↓→↓→ G                         | Ranbu: a punch flurry whose last blow ↑ turns into a rising strike and ↓ into a low one, 1 stock (in his Change form Bean, a ray gun's beam across the screen, which misses an opponent standing close)                    |
| ↓→↓← H                         | S chuck: a grab and a beating, 1 stock (in his Change form Counter, a 1-second stance: struck in it, he kicks back)                                                                                                        |
| ↓→↓→ H                         | EN3: a stampede of GIGIs led by a blonde masked woman, 3 stocks                                                                                                                                                            |

In his Change form GIGI P cancels into Bean, or into SC COUNTER, a stance that catches the opponent itself, for two stocks.

And SWW's, a red-haired boy in a red shirt who changes into a different suit of armour for each move, and into gold armour at 30% life or less:

| Input                          | SWW's move                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G / H                          | P1 / K1: a jab / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                                                                                                                                             |
| P2 / P3                        | A lunging punch / a dash through the opponent that leaves a flurry of blows behind them (in EX mode a leaping knee)                                                                                                                                                            |
| K2 / K3                        | A high kick / a long chain lash                                                                                                                                                                                                                                                |
| Down + G / H                   | A flaming punch / a sliding sweep                                                                                                                                                                                                                                              |
| In the air: G / H              | A punch / a kick                                                                                                                                                                                                                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                                                                                          |
| K                              | Hit Up: a rising punch; on a hit, ↑ chases into the air                                                                                                                                                                                                                        |
| J                              | Chuck: a grab and a throw                                                                                                                                                                                                                                                      |
| Blocking with a stock: K       | Counter Hit                                                                                                                                                                                                                                                                    |
| E, or ↓ ↓ K                    | Enter or leave EX mode (half a stock): other forms of his specials and three supers                                                                                                                                                                                            |
| →↓↘ G                          | Dragon P: a rising uppercut in green armour (in EX mode a flying knee; at 30% life or less in gold armour)                                                                                                                                                                     |
| ↓← G                           | ICE Punch: a punch with an ice spark in white armour (in EX mode a dash through the opponent; at 30% life or less in gold armour)                                                                                                                                              |
| F, or ↓← H                     | Chain att: a chain lash across the screen in pink armour; again within 0.8 seconds of a hit, another (in EX mode EX Chain, a 0.7-second spinning chain: struck in it, he lashes back)                                                                                          |
| ↓→ G                           | Ryuseiken: a punch flurry in silver armour, which ↓→ G follows with a dashing one; in the air, a flaming bird; Ryuseiken cancels into SUPER RSK, GOD DRAGON or COUNTER CHAIN for two stocks (in EX mode fists of light flying across the screen, which ↓→ G follows with more) |
| ↓→↓→ G                         | SUPER RSK: a flurry under a winged horse, 1 stock (in EX mode Gysa, an ice blast that flies past an opponent standing close)                                                                                                                                                   |
| ↓→↓→ H                         | GOD DRAGON: charging uppercuts, 1 stock (in EX mode a rising dragon; at 30% life or less in gold armour)                                                                                                                                                                       |
| ↓←↓← G                         | COUNTER CHAIN: a 0.7-second stance: struck in it, he lashes back, 1 stock (in EX mode a dashing chain lash)                                                                                                                                                                    |
| ↓←↓→ G                         | EN300: a winged charge across the whole screen, 3 stocks (at 30% life or less in silver wings)                                                                                                                                                                                 |
| ↓←↓← H                         | Healing: only at 30% life or less, a robed woman's silhouette restores 160 life, 3 stocks (above it, Chain att)                                                                                                                                                                |
| G G → H G                      | ROLL CRASH: only at 30% life or less, a grab that leaps and crashes down, knocking out both fighters, 2 stocks                                                                                                                                                                 |

And OGI's, a white-haired, green-armed strongman who suits up in a different robot armour, or a caped red coat, for most moves:

| Input                          | OGI's move                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: three punches / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                      |
| P2 / P3                        | A thrown hook / a dash with a chain whip in blue armour                                                                                         |
| K2 / K3                        | A dashing slash in blue armour / a grab and a beating in red armour (at 30% life or less a longer one)                                          |
| Down + G / H                   | A long shield thrust along the floor / a burst of blasts                                                                                        |
| In the air: G / H              | A punch / a kick                                                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                              |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                           |
| K                              | Hit Up: a rapier lunge in a red coat; on a hit, ↑ chases into the air                                                                           |
| J                              | Chuck: a grab and a throw                                                                                                                       |
| Blocking with a stock: K       | Counter Hit                                                                                                                                     |
| →↓↘ G                          | Dragon: a rising claw in red armour                                                                                                             |
| ↓← G                           | Crush attack: a shield-bash dash in grey armour (in the air, a dive)                                                                            |
| F, or ↓← H                     | Rose attack: a rose tossed in a high arc that lands far off, taking 35 power on a hit                                                           |
| ↓→ G                           | fire p: a straight cannon shot in blue armour; s shoot, SCC or S Crush cancels it for two stocks                                                |
| ↓→ H                           | FIRE K: a cannon shell that bounces along                                                                                                       |
| ↓→↓→ G                         | s shoot: a giant cannon blast, 1 stock (also in the air)                                                                                        |
| ↓→↓→ H                         | SCC: close, a grab and a beam-saber stab, which ↓→ H follows with an uppercut and → ↓ ← H with a throw; farther, a leap into a beating, 1 stock |
| ↓←↓← G                         | S Crush: a shield-bash dash and four more, 1 stock                                                                                              |
| ↓←↓→ G                         | EN300: a blast thrown in a high arc that bursts on the floor, 3 stocks; it flies over a close opponent but drops short near a wall              |

And ZIRO's, a teal-haired young man who calls up a different robot suit, winged, caped, horned or heavily armed, for most moves:

| Input                          | ZIRO's move                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | P1 / K1: a punch / a kick; on a hit or block, G or H again for P2 / K2, then P3 / K3                                                                |
| P2 / P3                        | A caped robot's scythe swing / a dragon-armed robot's trident flurry                                                                                |
| K2 / K3                        | A gunner robot's spinning volley / a horned robot's whip                                                                                            |
| Down + G / H                   | A gatling volley / a low whip                                                                                                                       |
| In the air: G / H              | A punch / a kick                                                                                                                                    |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                  |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                               |
| K                              | Hit Up: a girl's rising kick; on a hit, ↑ chases into the air                                                                                       |
| J                              | Chuck: a grab and a throw                                                                                                                           |
| Blocking with a stock: K       | Counter Hit                                                                                                                                         |
| E, or ↓ ↓ K                    | --TYPE--: EX mode on or off, half a stock; it swaps his specials and supers                                                                         |
| →↓↘ H                          | Fire Ball: a shell that speeds up as it flies, two at 30% life or less (EX: a winged robot's rising slash)                                          |
| ←↓↙ G / H                      | nataku: a dragon arm thrust up and out / straight out (EX: a cloaked robot's charge); MISS ALL or RAMBU cancels it for two stocks                   |
| F, or ↓← H / G                 | telepot: vanishing under a dark cloak to come out at the opponent / into the air                                                                    |
| ↓→ G                           | IORI3HIT: a winged robot's dashing slash, which ↓→ G follows twice more; in the air, a shot down at the floor (EX: a fire ball; in the air, a spin) |
| ←↓→ H                          | CC: a grab into blows and a leaping slam (EX: a trident flurry)                                                                                     |
| ↓→↓→ H                         | MISS ALL: a gunner robot's barrage of bullets and missiles, 1 stock (EX: a winged robot's beam)                                                     |
| ↓→↓← G                         | RAMBU: a dash into a rush of blows from each robot, 1 stock (EX: a grab into one)                                                                   |
| ↓←↓→ G                         | EN300: a winged robot rising to rain beams down, 3 stocks (also in the air; EX: a diving slash)                                                     |
| a full turn of the stick, G    | TWIN SHOT: below 30% life, twin beams swept round the whole screen, 3 stocks; otherwise the CC                                                      |

And MASA's, a blond pilot in red armour who swings a purple axe and swells into a bigger robot for his heaviest blows:

| Input                          | MASA's move                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| G / H                          | P1: an axe swing; G or H again at once for P2, two more, then G for P3 or H for K3, a leaping chop |
| Down + G / H                   | A grenade that bounces along the floor / a low axe sweep                                           |
| In the air: G / H              | An axe swing / a gun shot                                                                          |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                 |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                              |
| K                              | Hit Up: a rising axe slash; on a hit, ↑ chases into the air                                        |
| J                              | Chuck: a grab into a bigger robot's blows                                                          |
| Blocking with a stock: K       | Counter Attack                                                                                     |
| →↓↘ G                          | SHORYU: a rising uppercut, which →↓↘ G follows twice more (also in the air)                        |
| ↓→ H                           | 3Fire: a kick that fires a missile; → with H fires a second and a third                            |
| F, or ↓← G                     | 3HIT: an axe rush, which ↓← G follows twice more; SCC or RAMBU SUP cancels it for two stocks       |
| ↓← H                           | BANDO BOX: a bazooka's canister that arcs out and bursts, which ↓← H fires twice more              |
| ↓→↓← G                         | RAMBU SUP: a dash into a rush of blows from the other fighters' shadows, 1 stock                   |
| ←↓→←↓→ H                       | SCC: a grab into the bigger robot's blows and a throw into the wall, 1 stock                       |
| G G → H G                      | MESATSU: a dash that grabs into a flurry of flashing blows, 3 stocks                               |

And 3-TIMES's, a blond pilot in red armour like MASA's, who swings a purple axe and dashes with two shadows of himself:

| Input                    | 3-TIMES's move                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| G, standing or crouching | LP: a dashing axe swing that strikes three times                                            |
| H, standing or crouching | A grenade lobbed to hop along the floor                                                     |
| J, standing or crouching | HP: a heavy dashing axe swing that shakes the screen                                        |
| In the air: G or J / H   | An axe swing / two gun shots angled down                                                    |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                                |
| Shift + ← or ← ←         | A hop back                                                                                  |
| K                        | Nothing: he has no Hit Up, Chuck, double jump, air dash or Counter Attack                   |
| →↓↘ G                    | SHORYU: a crescent slash that rises forward                                                 |
| ↓→ H                     | FIRE: a pink crescent that flies across the screen                                          |
| F, or ↓→ G               | DASH P: a dashing axe swing, two shadows of himself dashing and swinging with him           |
| ↓→↓← G                   | Rambu: his armour bursts off for a dash into a rush of the other fighters' shadows, 1 stock |
| ↓→↓→ H                   | SB: fifteen grenades lobbed in a spread, 1 stock                                            |
| G G → H G                | MESATSU: a cut-in, then a dash that grabs into a flurry, 3 stocks                           |

And ZENKA's, a silver-haired woman in a long red coat who fights with a knife and calls in robots: a blue drill robot, a red robot and her own purple armour:

| Input                          | ZENKA's move                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H                          | A dashing knife slash / a stepping one; on a hit, G for the blue robot's sword thrust or H for the red robot's drill flurry                 |
| Then G / H                     | The blue robot's overhead swing / the red robot's sword swing                                                                               |
| Down + G / H                   | The blue robot's low sword thrust / the red robot's drill that rolls along the floor                                                        |
| In the air: G / H              | The blue robot's sword swing / the red robot's slash                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                       |
| K                              | Hit Up: the red robot's rising slash; on a hit, ↑ chases into the air                                                                       |
| J                              | Chuck: the blue robot's sword skewers the opponent; ↓↘→ H follows with the red robot's leaping spin                                         |
| Blocking with a stock: K       | Counter Hit                                                                                                                                 |
| →↓↘ G                          | Dragon P: the red robot's rising sword slash (also in the air)                                                                              |
| ↓→ G                           | FIRE BALL: her purple armour's slash across the screen; Ranbu or DAISHARIN cancels it for two stocks                                        |
| F, or ↓← G                     | New move: her purple armour charges, then thrusts a giant sword                                                                             |
| ↓→↓→ H                         | Ranbu: a grab into blows from both robots and her own last slash, 1 stock                                                                   |
| ↓→↓→ G                         | DAISHARIN: a giant sword hurled to spin out and back, 1 stock                                                                               |
| ↓←↓← G                         | En300: warnings, then a leap that drops with a giant sword, 3 stocks; its grab strips the opponent's clothes for 260 life, then flings them |

And Z-MEGA's, a white-haired, moustached brawler in a black vest who turns into Shin Z, trading life for power:

| Input                      | Z-MEGA's move                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G, standing or crouching   | A lunging palm strike that hits twice                                                                                                                                                                                                                   |
| H, standing or crouching   | A stepping spin kick                                                                                                                                                                                                                                    |
| In the air: G / H          | A punch / a kick                                                                                                                                                                                                                                        |
| Shift or → →               | A run that goes on while → is held; ↑ leaps into a high jump                                                                                                                                                                                            |
| Shift + ← or ← ←           | A hop back                                                                                                                                                                                                                                              |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                                                                                                                                                                                                                   |
| K                          | Nothing: he has no Hit Up or Counter Attack                                                                                                                                                                                                             |
| J                          | Chuck: a grab into a beating, then a blow that knocks the opponent away                                                                                                                                                                                 |
| E, or ↓ ↓ K                | TYPE CHANGE: into Shin Z, who loses a point of life every 0.1 seconds as his power rises 15, pausing through a super's freeze and, while his chuck holds the opponent, at 1 life; again to turn back, which holds his power at zero until he next turns |
| →↓↘ H                      | SAMA: a rising somersault kick (also in the air; Shin Z: lower, and →↓↘ H kicks again in the air)                                                                                                                                                       |
| ↓→ G                       | Fire BALL: a fireball that arcs, bounces twice and rolls along the floor (Shin Z: a fast straight shot)                                                                                                                                                 |
| F, or →↓← G                | GIGA: a dash behind a glowing palm that carries the opponent into the screen's edge and slams them (Shin Z: faster and harder)                                                                                                                          |
| ↓→ H                       | REFLACT: a round shield's shove (Shin Z: harder); meeting a shot, it throws a ball back, which fizzles on the shot itself                                                                                                                               |
| →←↓→ G                     | GAISA: a charge through three levels; G fires its wave at the level reached, or he collapses, 1 stock (Shin Z: a level higher)                                                                                                                          |
| ↓→↓← G                     | SGIGA: a bigger GIGA, 1 stock (Shin Z: faster and harder)                                                                                                                                                                                               |
| G G → H G                  | AKUMA SP: a cut-in, then a dash that grabs into a storm of flashes, 250, 3 stocks (Shin Z: short of them, the flashes alone, still 250)                                                                                                                 |

On a hit, a super cancels SAMA, Fire BALL, REFLACT or GAISA.

And ALPHA's, a red-haired boy in a chained white suit who takes on four armours for his moves: a white tiger's, a green knight's, a red one with a snake and a winged blue one:

| Input                          | ALPHA's move                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| G / H                          | A chained punch / a kick; on a hit, G for the tiger's punches or H for the red armour's kick                            |
| Then G / H                     | The blue armour's wing slash / the knight's shield                                                                      |
| Down + G / H                   | The tiger's swipe / the knight's shield                                                                                 |
| ↘ + G                          | ANTI AIR HEAD: the knight's rising blow                                                                                 |
| In the air: G / H / ↘ + H      | The blue armour's slash / the red armour's kick / Drop Kick, its diving kick                                            |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                      |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                   |
| K                              | Hit Up: the red armour's snake; on a hit, ↑ chases into the air                                                         |
| J                              | Chuck: the blue armour's grab into a beam                                                                               |
| Blocking with a stock: K       | Counter hit                                                                                                             |
| ←↓→ H                          | CC: the knight's lunge that grabs into a throw                                                                          |
| →←↓→ G                         | Munt: a rock pillar thrust up from the floor well ahead                                                                 |
| F, or ↓← G                     | NC: the tiger's chain strikes; ↓← G follows twice more, and on a hit SNAKE FIRE, Rambu or SCC cancels it for two stocks |
| ↓→↓→ H                         | SNAKE FIRE: a giant snake's strike, 1 stock                                                                             |
| ↓→↓→ G                         | RYUON HASANKEN: the blue armour's flight behind a fire dragon, 3 stocks                                                 |
| ↓→↓← G                         | Rambu: the tiger's leap into a long flurry, 1 stock                                                                     |
| ↓ ↓ ↓ G                        | NEW EN3: pillars of fire, 3 stocks                                                                                      |
| →↓←→↓← H                       | SCC: the knight's grab into a launch and a slam, 1 stock                                                                |

Knocked out with a stock, ALPHA is flung away at 1 life and lies down, then draws his life back while his power drains: to full in practice, to about 150 in a VS match. His next KO that round is final.

And SHIN-Z's, Z-MEGA as Shin Z for good: a white-haired, moustached brawler in a black vest and purple trousers:

| Input                      | SHIN-Z's move                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| G, standing or crouching   | A lunging palm strike that hits twice; on a hit, H, a special or a super follows                   |
| H, standing or crouching   | A stepping spin kick; on a hit, a special or a super follows                                       |
| In the air: G / H          | A punch / a kick                                                                                   |
| Shift or → →               | A run that goes on while → is held; ↑ leaps into a high jump                                       |
| Shift + ← or ← ←           | A hop back                                                                                         |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                                                              |
| K                          | Nothing: he has no Hit Up or Counter Attack                                                        |
| J                          | Chuck: a grab into a beating, then a blow that knocks the opponent away                            |
| →↓↘ H                      | SAMA: a rising somersault kick, also in the air, where →↓↘ H kicks again                           |
| ↓→ G                       | Fire BALL: a fast straight fireball                                                                |
| F, or →↓← G                | GIGA: a dash behind a glowing palm that carries the opponent into the screen's edge and slams them |
| ↓→ H                       | REFLACT: a round shield's shove; meeting a shot, it hurls the shield back                          |
| E, or →←↓→ G               | GAISA: a blue wave                                                                                 |
| →←↓→ H                     | KAISA SUPER: a giant ghostly head of his that charges across the screen, 1 stock                   |
| ↓→↓← G                     | SGIGA: a bigger GIGA, 1 stock                                                                      |
| G G → H G                  | AKUMA SP: a cut-in, then a dash that grabs into a storm of flashes, 250, 3 stocks                  |

And ZAKU's, a squat green armoured trooper with only 200 life:

| Input                    | ZAKU's move                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| G, standing or crouching | A purple axe's swing; on a hit, DASH P or a super follows                          |
| H, standing or crouching | A grenade lobbed ahead, which bounces lower each time and bursts where it lands    |
| In the air: G / H        | An axe swing / a shot from his gun                                                 |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                       |
| Shift + ← or ← ←         | A hop back                                                                         |
| K / J                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash |
| ↓→ G                     | DASH P: a dashing axe swing; on a hit, a super follows                             |
| ↓→↓→ G                   | Super P: four dashing axe swings and a stronger fifth, 1 stock                     |
| ↓→↓→ H                   | Super K: five grenades, 1 stock                                                    |

And PAC-HELO's, a round yellow Pac-Man robot with a rotor on top and hose arms, with only 200 life:

| Input                    | PAC-HELO's move                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| G, standing or crouching | A hose-arm punch with a spiked fist; on a hit, a special or the super follows                    |
| H, standing or crouching | A kick; on a hit, a special or the super follows                                                 |
| In the air: G or H       | A spiked stomp                                                                                   |
| Shift or → →             | A roll that goes on while → is held; ↑ leaps into a high jump                                    |
| Shift + ← or ← ←         | A hop back                                                                                       |
| K / J                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash               |
| hold ← 0.6 s, → G        | Roll: a rolling charge, also in the air, that bounces him off on a hit or guard                  |
| G five times             | Electric: a crackling orb; G again within 0.2 seconds keeps it sparking                          |
| ↓→↓→ G                   | Super roll: a roll steered by the direction held as it starts (on the ground, not down), 1 stock |

And GOLF's, a squat blue armoured trooper with a glowing sword and a whip, with only 300 life:

| Input                    | GOLF's move                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| G, standing or crouching | Two sword slashes; on a hit, H, a special or the super follows                                |
| H, standing or crouching | A long lash of his whip; on a hit, a special or the super follows                             |
| In the air: G / H        | A sword slash, after which H follows on a hit / a burst from his finger guns                  |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                                  |
| Shift + ← or ← ←         | A hop back                                                                                    |
| K / J                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash            |
| ↓→ G                     | Sp P: four dashing slashes; on a hit, the super follows                                       |
| ↓→ H                     | Sp K: a low lash and a high one that pulls the opponent past him; on a hit, the super follows |
| ↓→↓→ G                   | Super P: six lashes and a long thrust, 1 stock                                                |

And ASURA's, a hooded brawler in a purple and grey robe, with only 300 life:

| Input             | ASURA's move                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| G                 | Three jabs; on a hit, H, a special or the super follows                                                                             |
| H                 | Three kicks; on a hit, a special or the super follows                                                                               |
| Down + G / H      | A hopping uppercut / a hopping kick that lunges forward; on a hit, the air special or super follows                                 |
| In the air: G / H | A flying punch / a flying kick; on a hit, H (after the punch), the special or the super follows                                     |
| Shift or → →      | A run that goes on while → is held; ↑ leaps into a high jump                                                                        |
| Shift + ← or ← ←  | A hop back                                                                                                                          |
| K / J             | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash                                                  |
| ↓← H              | Tatumaki: a spinning kick that rises and drifts forward, striking in front and behind, also in the air; on a hit, the super follows |
| ↓→↓→ H            | Shinku TATU: a rising whirlwind of kicks that carries the opponent round him, then a kick, also in the air, 1 stock                 |

And TTRO's, a huge grey Totoro with 820 life, whose steps shake the screen:

| Input                    | TTRO's move                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| G                        | A long swipe of his arm; on a hit, a special (CC only from afar) or SUPER FIRE follows |
| H, standing or crouching | A sweeping claw; on a hit, a special (CC only from afar) or SUPER FIRE follows         |
| Down + G                 | A belly bounce that hops forward                                                       |
| In the air: G / H        | A swipe at chest height / a diving bite; on a hit, a double jump or air dash follows   |
| Shift or → →             | A hop forward                                                                          |
| Shift + ← or ← ←         | A hop back                                                                             |
| In the air: ↑ or → →     | A double jump or an air dash, under his umbrella                                       |
| K                        | Nothing: he has no Hit Up or Counter Attack                                            |
| J                        | Chuck: a grab into a throw, 40                                                         |
| ↓← G                     | DASH P: a dashing swipe; on a hit, DASH K follows                                      |
| ↓→ G                     | Fire: a blazing ball that the girl in his mouth fires, striking well ahead of him      |
| F, or ↓← H               | DASH K: a dashing claw                                                                 |
| ←↓→ H                    | CC: close in, a grab into a leap and a slam, 80                                        |
| →↓←→↓← G                 | SCC: close in, a grab into two leaps and slams and a higher one, 200, 1 stock          |
| ↓→↓→ G                   | SUPER FIRE: five blazing balls, 1 stock                                                |
| ↓→↓→ H                   | EN300: a phone call that sends a yellow car charging across the court, 3 stocks        |

And ASTROMAN's, a hulking, muscle-bound boy robot with 780 life, whose steps shake the screen:

| Input                | ASTROMAN's move                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| G                    | A jab; on a hit, a special (C Chuck aside), SUPER P or ASS GUN SUPER follows                                                       |
| H                    | Two stepping kicks; on a hit, the same follow                                                                                      |
| Down + G / H         | A rushing punch / a leaping kick                                                                                                   |
| In the air: G / H    | A punch / a kick, in other forms after a double jump, an air dash or a dash; on a hit, a double jump, air dash or Jump att follows |
| Shift or → →         | A rocket dash that hovers on while → is held                                                                                       |
| Shift + ← or ← ←     | A rocket dash back                                                                                                                 |
| In the air: ↑ or → → | A double jump or an air dash                                                                                                       |
| K                    | Nothing: he has no Hit Up or Counter Attack                                                                                        |
| J                    | Chuck: a grab into a rocket leap and a slam, 45                                                                                    |
| ↓← H                 | Jump att: a rocket leap that lands in a blast, also in the air                                                                     |
| ↓→ G                 | Punch: a rocket fist                                                                                                               |
| F, or ↓→ H           | ASS GUN: five bullets from a gun in his backside                                                                                   |
| →↓← G                | C Chuck: close in, a grab into kisses that heal him 60, then 40                                                                    |
| →↓←→↓← G             | S CC: close in, a grab into knees, blasts and kisses that heal him 50, then 300, 3 stocks                                          |
| ↓→↓→ G               | SUPER P: a huge black rocket fist, 120, 1 stock; each blow it guards powers it up, 130 to 170                                      |
| ↓→↓→ H               | ASS GUN SUPER: a beam from his backside that strikes twenty times from a little ahead of him, 1 stock                              |

And YINAN's, a white-haired wolf girl with 450 life who borrows armour, mecha and costumes for her moves. TO EX switches her between a Normal and an EX type, and each special and super has a form for each:

| Input                            | YINAN's move                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G                                | A punch, 10; on a hit, G or H chains into a second strike and again into a third, or a special or super follows                                                                      |
| H                                | A kick, 15; on a hit, the same chains                                                                                                                                                |
| Down + G / H                     | A low punch, 25 / a low kick, 20                                                                                                                                                     |
| In the air: G / H                | A punch / a kick, in other forms after a double jump or an air dash, and in EX                                                                                                       |
| Shift or → →                     | A run that keeps on while → is held; ↑ jumps out of it, and → with H swings into Savage                                                                                              |
| Shift + ← or ← ←                 | A dash back                                                                                                                                                                          |
| In the air: ↑ or → →             | A double jump or an air dash                                                                                                                                                         |
| K                                | Hit Up: a launcher, 15; ↑ after its hit jumps after them                                                                                                                             |
| J                                | Chuck: a grab, 30                                                                                                                                                                    |
| E, or ↓↓ K                       | TO EX: switches between her Normal and EX types for 50 power; without it, No super                                                                                                   |
| ↓→ G                             | Driver: a strike, 10, that ← or → with G or H follows into Boxer, Venom, ARX-7 or Codarl (in EX, a rushing punch)                                                                    |
| ↓← G                             | Assault: a long rush, 40 (in EX, Fist S: rapid fists that G extends, up to six volleys)                                                                                              |
| F, or ↓← H                       | DogeAttack: a dodge back that G, H, J or K (Dragon, a rising strike, 45) follows; in the air a dive (in EX, BTK S: a counter stance in a Bonta-kun suit, and in the air a P90 burst) |
| ↓↓ G; ↓↓ H                       | ECS P / ECS K: an unseen dash through (in EX, Flash P / K: a flashbang that bounces off the stage's ends)                                                                            |
| ↓→↓→ G                           | SS: a sniper's aim that G fires up to four times and H lowers, 1 stock (in EX, Trap: a claymore)                                                                                     |
| ↓→↓← H                           | EN Driver: a shield that strikes up close, 80, and answers a fireball with beams, 1 stock (in EX, FB: a batter's swing)                                                              |
| →↓←→↓← G                         | EN Chuck: a Venom doll that grabs, 50, then chases them for 50, 1 stock (in EX, Call Lin: Lin charges in, 100)                                                                       |
| ↓→↓→ H                           | EN3: the Arbalest against a Venom, 211, 3 stocks (in EX, MUSIKI, 189)                                                                                                                |
| ←→←→ G                           | Eat, under 150 life: a leap that catches a jumping opponent, 80, and heals her 50, 1 stock; otherwise Driver                                                                         |
| →←↓→ H                           | R300, under 150 life: a shell whose burst calls in her friends, 230, 3 stocks; otherwise Driver                                                                                      |
| After Driver's hit: super motion | The super's SC form, 2 stocks                                                                                                                                                        |

And AYA's, a white-haired, bunny-eared girl with 500 life who dresses as other fighters for her moves:

| Input                         | AYA's move                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| G                             | A punch, 20; on a hit, G or H chains into a second strike and again into a third, or a special or super follows |
| H                             | A kick, 10; on a hit, the same chains                                                                           |
| Down + G / H                  | A low punch, 20 / a low kick, 20                                                                                |
| In the air: G / H             | A punch / a kick, in other forms after a double jump or an air dash                                             |
| Shift or → →                  | A dash forward                                                                                                  |
| Shift + ← or ← ←              | A hop back                                                                                                      |
| In the air: ↑ or → →          | A double jump or an air dash                                                                                    |
| K                             | Hit Up: a launcher, 15; ↑ after its hit jumps after them                                                        |
| J                             | Chuck: a grab into a lightning shock, 30                                                                        |
| ↓→ G                          | FB: a black mage's fireball, 30; in the air Air Crush, a dive                                                   |
| ↓→ H                          | DH: a caped rush, 30; in the air Air Kick, a diving kick, 20                                                    |
| F, or →↓↘ G                   | SHO: a sword stroke that raises purple pillars, 35                                                              |
| ↓← G; E, or ↓← H              | TE P / TE K: a long unseen dash that stops beside the opponent, into a leaping slash, 30                        |
| ↓→↓→ G                        | Slash: a crescent hurled from a shield, 84, 1 stock                                                             |
| ↓→↓→ H                        | Rocket: a diving kick that pins the opponent and pummels them from every side, 107, 1 stock, also in the air    |
| ↓←↓→ G                        | EN3: a sword sweep into a holy blast, 211, 3 stocks                                                             |
| After SHO's hit: super motion | The super's SC form, 2 stocks                                                                                   |

And DoraEmon's, a muscular blue robot cat with 600 life. G punches, H kicks, J throws and K launches. His stocks hold 90 power each, up to five; his motion windows match the other fighters'.

| Input                         | DoraEmon's move                               |
| ----------------------------- | --------------------------------------------- |
| G / H                         | Punch / kick, low with ↓ and in the air       |
| → G / → H                     | Dashing punch / kick                          |
| K, then ↑ on hit              | Hit Up, then chase                            |
| J close                       | Chuck: a grab and beating                     |
| Shift or →→ / Shift + ← or ←← | Forward / back dash, also in the air          |
| ↑ in the air                  | Double jump                                   |
| Hold E                        | Charge power; taunt once full                 |
| ↓→ G                          | Air Cannon                                    |
| →↓↘ G                         | Sky Rise, also in the air                     |
| F or ↓→ H                     | Charge                                        |
| ↓← G                          | Twin Hammer: invincible during casting        |
| ↓↓ G / ↓↓ H                   | Anywhere Door forward / back                  |
| ↓→↓→ G                        | Cannon, 1 stock                               |
| ↓←↓→ G                        | Gadgets, 1 stock                              |
| ↓←↓← G                        | Fists, 1 stock                                |
| ↓→↓← H                        | Pierce, 1 stock                               |
| G G → H G                     | Hug, 3 stocks                                 |
| →←↓→ H                        | FK之意思, 3 stocks spent at the casting flash |

The four one-stock supers are invincible during casting. FK's wind-up can be interrupted without spending stock. Knocked out with three stocks, he reloads to full 600 life.

And RARIO's, a muscle-bound, barefoot plumber in a red cap and blue overalls who fights in Ryu's stance, with 450 life:

| Input             | RARIO's move                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G / H             | P, 18 / K, 15; on a hit, P cancels into K, a special or a super                                                                                                         |
| In the air: G / H | P J / K J, 15 each; he has no double jump                                                                                                                               |
| Shift / Shift + ← | A dash forward / a hop back                                                                                                                                             |
| ↓→ G              | Hado: a dark fireball, 30, that bounces along the floor; another while it flies is a punch                                                                              |
| →↓↘ G             | Shoryu: a rising uppercut, 35, that knocks a ? block loose for a coin (2 life, 10 power) or a mushroom that slides into the opponent: +31, −29, or +50 life and a stock |
| F, or ↓← H        | Tatumaki: a hopping spin kick, two hits of 18                                                                                                                           |
| ↓→↓→ G            | Shinku: a leap that hurls a red shell along the floor, 84, 1 stock                                                                                                      |
| ↓→↓→ H            | Shin Shoryu: a grab into a chain of stomps on the opponent's head and a flagpole finish, 200, 2 stocks                                                                  |

And TRAINING's, RARIO's practice copy, with his look and 500 life. Standing still refills his life and the opponent's power, and empties his; he has no supers, air attacks or double jump:

| Input             | TRAINING's move                                               |
| ----------------- | ------------------------------------------------------------- |
| G                 | Drain: takes 100 of the opponent's life, wherever they stand  |
| H                 | Refill: refills the opponent's life                           |
| J                 | Self KO: knocks himself out                                   |
| K                 | Hit Up: an uppercut, 10, after a three-second countdown       |
| → K               | Hado: RARIO's bouncing fireball, 10, after the same countdown |
| Shift / Shift + ← | A dash forward / a hop back                                   |

Controls for every fighter: **G punch, H kick, J catch/throw, K Hit Up**. U, I and 1–5 move shortcuts are removed; use motion commands for specials and supers.

The game opens on the original's title: its volume warning and two logos for seven seconds, then the title screen, where any key brings up the SINGLE / VS / TEAM VS menu. Move its cursor with W and S and press an attack key on SINGLE for story mode, on VS for the character select screen or on TEAM VS for its team form; R starts the title over. Story mode opens the select screen with only the 1P arrow: choose a fighter (SHIN-Z can play his too) and play through their story: battles among several CPUs at once, with reinforcements, and demos, which an attack key skips where the original allows. Lose a battle that offers it and the continue screen asks YES or NO: YES fights the battle again, NO returns to the title. During a story battle **Reset** starts it over. The select screen is the original's VS single one: move the 1P arrow over the grid with A, D, W and S (held, a direction repeats after half a second, then every 50 ms) and choose with any attack key, then move the 2P arrow the same way to choose the opponent. The key picks the fighter's colours, as in the original: H, K, G and J each give one of their eight palettes, and the second side moves on to the next if it picks the first's. Hovering a fighter stands their portrait and name at your side; a GATE LOCK cell (SHIN-Z and the empty slots) can't be chosen, while DoraEmon's, locked in the original, shows his face and can be. Once both are chosen the panels close and the match starts. A won Vs. CPU match returns to the screen, and **Character select** in Settings opens it again. TEAM VS's screen picks three fighters a side, each in its own colours, and fights them in turn against the CPU's: the side that loses a round sends in its next member, and the first to win three rounds takes the match.

In story brawls, defeat every enemy, including reinforcements, to win. Allies do not need to be defeated, and reaching 100 KO points no longer ends a brawl early. Player defeat and time-up can still end it; duels and the opening difficulty selection retain their scripted objectives.

In Settings, you can also choose your fighter and the opponent directly (Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant, G Suneo, Yo, SIN, LIZARD, KAY, DIDO, SAKUYA, ALEX, SOU, HISO, ERUS, OS FENG, SEAN, GON, KATE, REMU, REAR, GIGI, SWW, OGI, ZIRO, MASA, 3-TIMES, ZENKA, Z-MEGA, ALPHA, SHIN-Z, ZAKU, PAC-HELO, GOLF, ASURA, TTRO, ASTROMAN, YINAN, AYA, DoraEmon, RARIO or TRAINING), the stage (Sport Court, Train Morning, Sakura Night, Train Night, Dojin BKG, Japan Street, Park Morning, Park Night, Sakura Street, Greek, Space, Boss Base, ZM Office, ZM Office T2, BR Boss Base, GI Stage, Space Night or Street Night) and the mode:

- **Free practice** has no timer. Choose the partner's behavior (stand, guard, jump and guard, punch, jump in with an air kick, or the original CPU), **Max stock** to keep both fighters' stocks full, and **Low health** to hold your fighter just under 30% health for the desperation moves.
- **Vs. CPU** plays the original CPU in 60-second rounds, opened and closed by the source's intros, calls and KO lettering. The first to win three rounds takes the match. A Vs. CPU match started from the character select screen plays the original's VS single paths: each fighter's VS intro, no power or stock from it, and the VS forms (ZA) of the finishers that have them. Choosing a fighter in Settings returns to the intros above.

Tick **Music** in Settings for the stage's track. Leaving the window pauses the match. The touch buttons cover every control the fighter has, as does the keyboard guide at the top of the screen; landscape is recommended on phones. The **Controls guide** link in Settings opens [instructions.html](instructions.html) — one page per fighter, with the select screen's face grid for navigation and every move in table form.

[docs/gameplay.md](docs/gameplay.md) describes how each move, chain, cancel, reaction and round rule plays.

## Evidence

The port keeps behavior recovered from the source apart from rules authored for training:

- **Recovered:** each fighter's moves, objects and reactions run from their exported action scripts. Commands, attack and body boxes, the response table, contact pauses, damage, power, the camera, the HUD, KO and the CPU port the engine's own routines.
- **Authored:** the single-key bindings, the Shift dash, jumping on a fresh press, the practice partners and settings, and the few other training choices that [docs/evidence.md](docs/evidence.md) names.
- **Acceptance:** Vitest compares the idle interpreter with independently generated Python traces and the handoff's seed-0 timeline, and pins each rule's ticks and positions. The original Windows game has not been run here.
- **Scope:** forty-five fighters, all 18 stages, local single-player. No full gameplay VM, original-game parity, gamepad, multiplayer, or public deployment.

[docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule, and tabulates the contact pauses.

## Files and assets

- `src/App.svelte`: accessible full-screen game shell, settings modal, status, and touch controls.
- `instructions.html` / `src/instructions/`: the standalone controls guide — one page per fighter in the select screen's design: the roster (`fighters.ts`), the move tables (`moves.ts`), the page (`Instructions.svelte`) and its entry (`main.ts`).
- `src/game/scene.ts`: Phaser loading/rendering and keyboard lifecycle.
- `src/game/match.ts`: deterministic prototype rules and fixed clock.
- `src/game/commands.ts`: the recovered command recognizer, and the command each shortcut key enters.
- `src/game/cpu.ts` / `dummy.ts`: the original CPU and the authored practice partners.
- `src/game/animations.ts`: neutral, guard, victim and result clips, the flattened source timelines, frame sampling and body boxes, per character.
- `src/game/characters.ts`: each fighter's exported data (Ryuko's, Zoma's, Kiki's, Chung's, Amiro's, ANMC P's, Giant's, G Suneo's, Yo's, SIN's, LIZARD's, KAY's, DIDO's, SAKUYA's, ALEX's, SOU's, HISO's, ERUS's, OS FENG's, SEAN's, GON's, KATE's, REMU's, REAR's, GIGI's, SWW's, OGI's, ZIRO's, MASA's, 3-TIMES's, ZENKA's, Z-MEGA's, ALPHA's, SHIN-Z's, ZAKU's, PAC-HELO's, GOLF's, ASURA's, TTRO's, ASTROMAN's, YINAN's, AYA's, DoraEmon's, RARIO's and TRAINING's) and the twins that pair their victim actions, and each stage's.
- `src/game/hud.ts`: source HUD rendering, health cropping, and KO playback.
- `src/game/standing.ts`: recovered idle interpreter and placement.
- `src/game/select.ts`: the original's title and character select screen, run from their demos', the KGT's and each fighter's raw records.
- `scripts/export_assets.py`: selected asset conversion and independent oracle fixtures.
- `docs/gameplay.md` / `evidence.md`: how the rules play, and the source evidence behind them.

The original handoff stays unchanged outside `public/`. Vite explicitly denies serving it, including through `/@fs/`. Only selected PNGs enter `public/assets/`; generated assets and fixtures are ignored by Git and regenerated locally. A local `dist/` contains those selected original assets. The deployed game serves them from a public R2 bucket (see Deploy to Cloudflare), which is the owner's choice and does not establish redistribution rights.

Phaser uses its [scene lifecycle](https://docs.phaser.io/phaser/concepts/scenes); Git hooks follow [Husky's current setup](https://typicode.github.io/husky/get-started.html).
