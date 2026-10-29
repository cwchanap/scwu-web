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

| Input                          | Chung's move                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                     |
| P3                             | A strike that catches the opponent, then blasts them away                                              |
| Down + J / K                   | Crouching punch / a burning kick that knocks down                                                      |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                     |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                  |
| H                              | Hit Up                                                                                                 |
| O                              | Chuck: a close grab that hurls the opponent into the screen's edge                                     |
| Blocking with a stock: H       | COUNTER HIT                                                                                            |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): EX forms of several moves                                       |
| U, or →↓↘ J                    | Dragon (ground or air)                                                                                 |
| I, or ↓→ J                     | Fire ball, a thrown star                                                                               |
| F, or ←↓→ K                    | orochi                                                                                                 |
| G, or ↓← J                     | Burn Knock                                                                                             |
| ↓← K; ↓→ K in the air          | jump wall move, a leap back that clings to the wall (then K kicks off it, J or ↑ leaps away); air fire |
| 1, or ↓←↓→ J                   | gesar (nin star in the air), 1 stock                                                                   |
| 2, or ↓→↓→ K                   | lee: kicks that carry the opponent up to float, 1 stock                                                |
| 3, or ↓←↓← K                   | EN300: a shock, then lifts and tosses, 3 stocks                                                        |

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

| Input                          | G Suneo's move                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                              |
| P3 / K3                        | A rushing punch that hurls the opponent into the screen's edge / a leaping kick that strikes again and again                    |
| Down + J / K                   | A rising punch / a sliding sweep                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                              |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                           |
| H                              | Hit Up                                                                                                                          |
| O                              | Chuck: a grab, a hop back and a leaping throw that spins the opponent away                                                      |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                     |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): her K2, crouching and air attacks, Hit Up, chuck and specials take other forms           |
| U, or →↓↘ K                    | DRILL KNIEE: a rising knee, also in the air (in EX mode, in the air, a diving knee)                                             |
| I, or ↓→ J                     | FIRE BALL: a shot that speeds up, which a super can cancel for 2 stocks                                                         |
| F, or ↓← J                     | G DRIVER: a drill lance thrust that hurls the opponent into the screen's edge (in EX mode a strike that shocks them)            |
| G, or ↓← K                     | BIKE: a leap on a golden lion, also in the air (in EX mode a kick and a wheel that strikes again and again)                     |
| 1, or K K ← J K                | hh, below 30% health: a screen-wide shock, then a long beating, 3 stocks; a KO by it makes the opponent vanish in a faint flash |
| 2, or →↓←→↓← J                 | GP: a grab, then a beating out of sight before a launch, 1 stock; a KO by it makes the opponent vanish in a faint flash         |
| 3, or ↓→↓→ K                   | en300: a shock, then a hammer, 3 stocks; a KO by it makes the opponent vanish in a faint flash                                  |
| 4, or ↓→↓→ J                   | BP: a flying fist that strikes three times, 1 stock (BP EVIL, a ring, below 30% health)                                         |

And Yo's, most in a costume:

| Input                          | Yo's move                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                           |
| P3 / K3                        | A pistol shot / a kick in a long coat                                                                        |
| Down + J / K                   | A licker's tongue lash / a plant's lash that knocks the opponent down                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                           |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                        |
| H                              | Hit Up: a monster rising from the floor                                                                      |
| O                              | Chuck: zombie hands burst from the floor to hold the opponent, then a kick                                   |
| Blocking with a stock: H       | COUNTER HIT                                                                                                  |
| U, or →↓↘ J                    | Dragon: a man springs out of a trunk with the opponent                                                       |
| I, or ↓← K                     | TOFU: a gatling burst                                                                                        |
| F, or ←↓→ K                    | ZOMBI WALK: a zombie's shuffle that grabs and bites the opponent, healing her 20                             |
| G, or ↓← J                     | Run in: a monster's charge and claw                                                                          |
| ↓→ J in the air                | Fire ball: a rocket                                                                                          |
| 1, or ↓→↓← J                   | GIGA PRESS: a charge that carries the opponent into the screen's edge, then slams and launches them, 1 stock |
| 2, or ↓←↓← K                   | HIDDEN, below 30% health: a hidden brute's rush and beating, 1 stock (TOFU otherwise)                        |
| 3, or ↓←↓← J                   | snake: a giant snake rising from the floor, 1 stock                                                          |
| 4, or ↓→↓→ K                   | en300: a cannon blast across the screen, 3 stocks                                                            |

And SIN's, in another guise for most moves:

| Input                          | SIN's move                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                  |
| P2 / P3                        | A horned demon's dashing slash / a golden serpent's lunge that launches the opponent                                                |
| K2 / K3                        | A sweep, then a rising kick / a wolf's leap                                                                                         |
| Down + J / K                   | A chainsaw thrust / a low blade that knocks the opponent down                                                                       |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                  |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                               |
| H                              | Hit Up                                                                                                                              |
| O                              | Chuck: a masked man's grab and throw                                                                                                |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                         |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): his stance and grabs take other forms                                                        |
| U, or ↓→ J                     | S PUNCH: a dashing flurry of blasts, which BAKU or SUP RUN C can cancel for 2 stocks                                                |
| I, or ←↓→ J                    | low chuck: a hooked pole that catches the opponent's feet and flips them                                                            |
| F, or →↓← K                    | RUN CHUCK: a dashing grab, also in the air, that leaps and drops the opponent on their head (harder in EX mode or below 30% health) |
| G, or ←↓→ K                    | Clack chuck: a grab, a leap and a slam (in EX mode a higher leap; below 30% health EVIL CLACK HIT, three slams before it, for 70)   |
| ↓← J                           | WOLF att: a wolf's leap                                                                                                             |
| 1, or ↓←↓→ J                   | BAKU: a masked brute's charge, 1 stock                                                                                              |
| 2, or ↓→↓→ K                   | SUP RUN C: RUN CHUCK into a clawed figure's slashes, also in the air, 1 stock                                                       |
| 3, or →↓←→↓← J                 | EN300: a grab and machete cuts, 3 stocks (in EX mode three lion-head pillars)                                                       |
| 4, or →↓←→↓← K                 | NOZAN, below 30% health: a grab and a long beating out of sight, 3 stocks (RUN CHUCK otherwise)                                     |

And LIZARD's, in a different mecha or armor for most moves:

| Input                          | LIZARD's move                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                                         |
| P2 / P3                        | A purple mecha's blade slash / an orange-armored shield bash                                                                                                                               |
| K2 / K3                        | A red mecha's spinning kick / a winged white mecha's blade                                                                                                                                 |
| Down + J / K                   | A purple mecha's prone rifle shot / a black mecha's low swipe that knocks the opponent down                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                      |
| H                              | Hit Up: a black mecha's rising lance                                                                                                                                                       |
| O                              | Chuck: a blue-armored grab that spins the opponent away                                                                                                                                    |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                                |
| U, or →↓↘ J                    | Cross: a red mecha raises a pillar of red light that ends in a cross                                                                                                                       |
| I, or ↓→ J                     | FIRE: a blue-armored blast of red lightning                                                                                                                                                |
| F, or ↓← K                     | jump att: a purple mecha's leaping grab and throw, also in the air                                                                                                                         |
| 1, or ↓←↓→ J                   | HIDDEN, below 30% health: a rush into a fanged maw's bite, 1 stock (FIRE otherwise)                                                                                                        |
| 2, or ↓→↓← J                   | chuck sup: a purple mecha's leap that catches an airborne opponent, swallows them in a giant striped sphere and drops them, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| 3, or ↓→↓→ K                   | dragon sp: a leap in a black slab's disguise; a hit calls a flight of white winged beasts down on the opponent, 1 stock                                                                    |
| 4, or ↓←↓← J                   | en300: a pale spirit's orb that bursts into a dome of light, 3 stocks                                                                                                                      |

And KAY's, dressed as a different angel or mecha for most moves:

| Input                          | KAY's move                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                     |
| P2 / P3                        | A pink-haired figure's ribbon lashes / a gold-collared figure's paper blades (in EX mode a lance thrown from a red cross)              |
| K2 / K3                        | A striped sphere that swallows him / a gold-masked figure's strike (in EX mode a stretching punch)                                     |
| Down + J / K                   | A blue crystal's jab (in EX mode a black figure's blade) / a black figure's low sweep                                                  |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                     |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                  |
| H                              | Hit Up: a fishing rod's cast                                                                                                           |
| O                              | Chuck: a nurse's syringe                                                                                                               |
| Blocking with a stock: H       | COUNTER HIT; his air guards free him after 6 ticks                                                                                     |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                              |
| U, or →↓↘ J                    | air chuck: a spider's leap that catches only an airborne opponent and crashes down with them, knocking him down too, also in the air   |
| I, or ↓→ J                     | Fire: a spinning red lance thrown from a cross (in EX mode a stance: O for a dashing grab, H for a claw's beam)                        |
| F, or →↓← K                    | Counter: a twin-colored stance; struck in it, he splits in two and slashes, which KAORU or SUPER P can cancel for 2 stocks             |
| G, or ←↓→ K                    | Comment chuck: a clawed black figure's grab (harder below 30% health; in EX mode a pink figure's whips)                                |
| ↓← J / K                       | 12P / 12K: black arms bursting from the ground at a middle / long distance (in EX mode a pillar of light there, a decoy at the other)  |
| 1, or ↓←↓← J                   | en300: a purple mecha's grab and berserk mauling, 3 stocks (in EX mode a claw wave)                                                    |
| 2, or ↓→↓→ K                   | KAORU: a silver-haired boy's low grab into a long scene with a giant purple hand, 1 stock (in EX mode a ribbon-armed figure's slashes) |
| 3, or ↓→↓→ J                   | SUPER P: a wound-up stretching punch, 1 stock (in EX mode a blue crystal's beam)                                                       |

And DIDO's, dressed as a different armored figure or mecha for most moves:

| Input                          | DIDO's move                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: an axe's swing / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                 |
| P2 / P3                        | A red-armored figure's flying kick / a blue mecha's lance lunge                                                                             |
| K2 / K3                        | A blue hover scooter's ram / an orange-armored figure's trident                                                                             |
| Down + J / K                   | A sheep costume's crawl / a blue tail's low sweep                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward (↑ during it for a long jump); back                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                       |
| → + K                          | DASH K: a tiger-striped figure's dashing strike                                                                                             |
| H                              | Hit Up: a maid's swing                                                                                                                      |
| O                              | Chuck: a green arm cannon's grab                                                                                                            |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                 |
| U, or ↓→ K                     | slid: a low dive on a white jet sled                                                                                                        |
| I, or ↓→ J                     | fire: a gold-winged figure's blue flames; in the air a purple winged figure's (harder below 30% health)                                     |
| F, or ↓← K                     | RAiden: a grey mecha's claw strike; press K again to keep striking                                                                          |
| G, or ↓← J                     | doge: a pink heart-armored figure's dash, low enough to pass under most strikes, which strikes once beside the opponent, 30                 |
| 1, or ↓←↓→ K                   | Hidden En300, below 30% health: a white-robed girl's magic circle; a catch plays a long scene of wings and water, 3 stocks (slid otherwise) |
| 2, or ↓→↓→ K                   | Temjin fly: a white-suited girl surfing a giant blade, 1 stock, also in the air                                                             |
| 3, or ↓←↓← K                   | dragon super: a hooded figure's staff calls a blue lightning dragon that coils around her, 1 stock                                          |
| 4, or ↓→↓→ J                   | Raiden: a red mecha's black wings fire a barrage diagonally up the screen, 1 stock                                                          |
| 5, or ↓←↓→ J                   | EN300: a purple winged mecha's dash; a catch sends giant hands sweeping across the stage behind her, 3 stocks                               |

And SAKUYA's, dressed as a different swordswoman, armored figure or mecha for most moves:

| Input                          | SAKUYA's move                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: her sword's slash / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                            |
| P2 / P3                        | A pink-kimono swordswoman's slash / a silver-armored figure's red blades (in EX mode a blue-striped swordswoman's thrust / a red-armored figure's strike)                                 |
| K2 / K3                        | A red-dressed girl's crossbow / a red-armored figure's chain claw, which catches the opponent far out and pulls them back up (in EX mode a black-robed archer's bow / a bazooka)          |
| Down + J / K                   | A red-clad girl's jab / a purple maid's scythe sweep (in EX mode a swordswoman's low slash / a masked swordsman's cut)                                                                    |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                        |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                     |
| H                              | Hit Up: a yellow-dressed girl's giant teddy bear                                                                                                                                          |
| O                              | Chuck: a scythe's grab                                                                                                                                                                    |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                               |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): most of her moves take other forms                                                                                                                 |
| U, or →↓↘ J                    | Dragon punch: a red-dressed girl rises on white wings (in EX mode a cat-eared fighter's flipping kicks)                                                                                   |
| I, or ↓→ J                     | FIRE: a pink-kimono swordswoman's fireball, also in the air (in EX mode a slow one)                                                                                                       |
| F, or ↓← J                     | iori: an orange-coated figure's dashing slash; ↓← J twice more for two follow-ups (in EX mode a green-armored figure's clawed shield)                                                     |
| G, or →↓← K                    | counter: a cat-eared fighter's stance; struck in it, she grabs and throws for 40 (in EX mode a pinstripe-suited figure's gatling gun, from range)                                         |
| 4, or →↓↘ K                    | DRAGON KICK: a silver-armored figure's dashing red blades (in EX mode a flurry of them)                                                                                                   |
| 5, or ↓→ K                     | LOW FIRE: a pink-dressed girl's low staff sweep (in EX mode a slow fireball)                                                                                                              |
| ←↓→ K                          | C C: a hatted figure's blade rush; then ↓→ K or ↓→ J for a mounted rider's charge                                                                                                         |
| 1, or ↓←↓→ J                   | en300: a white-coated swordswoman's dash; a catch turns into a horned mecha girl's blade combo, 3 stocks                                                                                  |
| 2, or ↓→↓→ K                   | super HIT UP: a green-uniformed girl's swing that calls an airship, 1 stock; in the air a mecha's diving dash (in EX mode a cat-eared fighter's flurry; in the air a red-winged figure's) |
| 3, or ↓→↓→ J                   | SPARK: a horned mecha girl's blade dash, 1 stock (in EX mode a maid calls a gate cannon whose ray rises diagonally from range)                                                            |

And ALEX's, a boy in a cap dressed as a different armored hero or mecha for most moves:

| Input                          | ALEX's move                                                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                  |
| P2 / P3                        | A red-armored figure's sword sweep / a grey-armored figure's lance gun (in EX mode a wider sweep / a green-armored figure's dagger) |
| K2 / K3                        | A yellow-armored figure's twin daggers / a blue-armored figure's bow (in EX mode its lance)                                         |
| Down + J / K                   | A red lance's jab / sweep                                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                  |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                               |
| H                              | Hit Up: an uppercut                                                                                                                 |
| O                              | Chuck: a drill lance's grab                                                                                                         |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                         |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                           |
| U, or →↓↘ J                    | dragon: a gold-armored figure's rising drill lance                                                                                  |
| I, or ↓→ J in the air          | air fire: a pink-armored archer's arrow (on the ground the same input is P1)                                                        |
| F, or ↓→ K                     | REFLACT: an arm shield that turns an incoming projectile back as a ball of light (in EX mode a red-horned mecha's sword thrust)     |
| G, or →↓← K                    | counter: a green-armored figure's stance; struck in it, he slashes back (in EX mode a blue-armored figure's, with a bow)            |
| 4, or →←↓→ J                   | HAOU: a combined blaster's shot (in EX mode a burst of them)                                                                        |
| 1, or ↓←↓← K                   | en300: summons a white mecha dragon, 3 stocks (in EX mode another form, stronger from range)                                        |
| 2, or ↓→↓→ K                   | GYSA: a red-horned mecha's three sword strikes, 1 stock (in EX mode a drill-lanced mecha's grab up close)                           |
| 3, or ↓→↓→ J                   | super fire: a red dinosaur tank's cannon, 1 stock (in EX mode a red-horned mecha's sword dash)                                      |

And SOU's, a boy in a white headband dressed as a black-armored mecha or a helmeted pilot for most moves, who calls beast mechas in EX mode:

| Input                          | SOU's move                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a short sword's slash; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                              |
| P2 / P3                        | A soldier's punch / the mecha's arm punch (in EX mode a gunman's pistol shot)                                                                                                                                  |
| K2 / K3                        | The mecha's scythe sweep / a gunman's pistol shot (in EX mode a yellow-helmed figure's punch)                                                                                                                  |
| Down + J / K                   | A red-helmed figure's punch / a yellow-helmed figure's (in EX mode a long-haired girl's low kick)                                                                                                              |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                          |
| H                              | Hit Up: the pilot's uppercut                                                                                                                                                                                   |
| O                              | Chuck: the mecha's grab                                                                                                                                                                                        |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                                                    |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): most of his moves take other forms                                                                                                                                      |
| U, or →↓↘ K                    | AKUMA jump: a leap; J or K turns it into a diving punch or a flying kick (in EX mode the mecha's rising uppercut)                                                                                              |
| I, or ↓→ K                     | Fire Kick: the mecha's low rifle shot; in the air a flying kick (in EX mode he calls a black panther mecha)                                                                                                    |
| F, or ↓← J                     | IORI: the mecha's sword slash; ↓← J chains two more (in EX mode a heavy gun's shot)                                                                                                                            |
| G, or ↓→ J                     | BK: the mecha's dashing punch, also in the air (in EX mode he calls a yellow lion mecha; in the air he hangs from an eagle jet, steered with the directions for up to five seconds and dropped with J, K or O) |
| ↓← K                           | MID SLASS: the mecha's sword slash (in EX mode a leaping ground slam)                                                                                                                                          |
| ↓→ H                           | HIDDEN A: a quick step (in EX mode he calls a white mammoth mecha)                                                                                                                                             |
| 2, or ↓→↓← K                   | Command 1: the mecha's punch rush, 1 stock (in EX mode its sword combo)                                                                                                                                        |
| 4, or ↓→↓→ K                   | SPARK: a dive as a black jet, also in the air, 1 stock (in EX mode the mecha's shoulder cannons fire a beam)                                                                                                   |
| 5, or ↓→↓→ J                   | DANKU SHOT: the mecha's shoulder cannons, 1 stock (in EX mode a sword combo; below 30% health a stronger shot)                                                                                                 |
| 3, or ↓←↓← J                   | Beast att: the lion, panther and mammoth charge in turn, 3 stocks (in EX mode a winged mecha's green beam)                                                                                                     |
| 1, or O J ← K H                | KOKAKEN: the pilot's sword dash, 3 stocks, only below 30% health                                                                                                                                               |

And HISO's, a boy in a red sleeveless top dressed as a different character for most moves, with no EX mode:

| Input                          | HISO's move                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                   |
| P2 / P3                        | A suited man's pointing jab / a girl in glasses swinging a vacuum cleaner's toothed hose                                                             |
| K2 / K3                        | A clown-faced boy's thrown rock / a muscled brawler's punch                                                                                          |
| Down + J / K                   | A samurai's sword slash / the brawler's punch                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                   |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                |
| H                              | Hit Up: an uppercut                                                                                                                                  |
| O                              | Chuck: the clown-faced boy's grab and sliding kick                                                                                                   |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                          |
| U, or →↓↘ J                    | Dragon p: a samurai's rising sword slashes, also in the air                                                                                          |
| I, or ↓→ J                     | FIRE: the clown-faced boy's thrown card                                                                                                              |
| F, or ↓← J                     | bannaku: a headbanded knife fighter's dashing slash; a super cancels it for two stocks                                                               |
| G, or →↓← K                    | counter: a stance with a phone; struck in it, a machine-gun man fires back                                                                           |
| 5, or ↓→ K                     | striker: a gunwoman behind him fires a shot that holds whoever it meets still (HISO stop)                                                            |
| 1, or ↓←↓← K                   | FISH: a suited man's red book looses a fish spirit that seizes the opponent up close, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| 2, or ↓→↓→ K                   | en300: a shirtless, tattooed man calls a dark giant, 3 stocks                                                                                        |
| 3, or ↓←↓← J                   | fly arm: the clown-faced boy's flying fists up close, 1 stock                                                                                        |
| 4, or ↓→↓→ J                   | S Shoot: a blue-coated boy's palm blast, 1 stock                                                                                                     |

And ERUS's, a blond figure in a black coat and white bandeau dressed as a different character for most moves, who calls helpers in EX mode:

| Input                          | ERUS's move                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a chain swing / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                  |
| P2 / P3                        | A blue-robed figure's chain whip / a suited man's knife thrust                                                                                                              |
| K2 / K3                        | A spiky-haired boy's sliding kick / the suited man's briefcase swing                                                                                                        |
| Down + J / K                   | A green-clad boy's slab strike / a cap-wearing figure's sword slash                                                                                                         |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                       |
| H                              | Hit Up: a girl in a red dress's rising punch                                                                                                                                |
| O                              | Chuck: the blue-robed figure's chains                                                                                                                                       |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                 |
| E, or ↓ ↓ H                    | Enter or leave EX mode (a stock): most of her moves take other forms                                                                                                        |
| U, or →↓↘ J                    | INATUMA: the spiky-haired boy's electric strike (in EX mode his claw rush)                                                                                                  |
| I, or ↓→ J                     | VO5: the green-clad boy's punch; in the air he hurls a boulder (in EX mode she calls two headbanded boys who drop in and charge; in the air the blue-robed figure's chains) |
| F, or ↓→ K                     | Coin: the suited man flicks a coin, seven in all, then every other press fails (in EX mode she calls a white-haired scythe fighter from a portal)                           |
| G, or →↓← K                    | COUNTER: the girl's stance; struck in it, she hits back (in EX mode a book that also answers specials)                                                                      |
| ↓← J / K / J+K                 | TELP P / K / PK: the spiky-haired boy's blur step (in EX mode his lunging strikes)                                                                                          |
| 2, or ↓→↓← J                   | lizard fly: the spiky-haired boy's flying grab, which catches only an opponent in the air, 1 stock (in EX mode a blur-step rush)                                            |
| 3, or ↓←↓← K                   | SCC: the spiky-haired boy's rush up close, 1 stock; in the air the blue-robed figure's (in EX mode the suited man's coin barrage, or in the air the green-clad boy's)       |
| 5, or ↓→↓→ J                   | Super slash: the cap-wearing figure's scythe slash, 1 stock (in EX mode the spiky-haired boy's rising strikes)                                                              |
| 4, or ↓→↓→ K                   | EN300: a headbanded boy's punch rush, 3 stocks (in EX mode the girl swells into a brawler)                                                                                  |
| 1, or ↓→↓← K                   | コマンド 3: she draws a card that heals her or drops planks on the opponent, 3 stocks, only below 30% health                                                                |

And OS FENG's, a blue-haired boy in glasses and a red vest dressed as a different character for most moves:

| Input                          | OS FENG's move                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                   |
| P2 / P3                        | A white-shirted fighter's crescent slash / a white-coated man in glasses' pistol shot                                                                                |
| K2 / K3                        | A green-capped figure's high kick / a red-bandannaed fighter's kicks                                                                                                 |
| Down + J / K                   | A headbanded figure's crouching double stab / a white-clad figure's slide with a black hound                                                                         |
| In the air: J / K              | A boxer's punch / the green-capped figure's kick                                                                                                                     |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                   |
| ↑ while dashing forward        | High Jump                                                                                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                |
| H                              | Hit Up: a blond girl in a white kimono's rising punch                                                                                                                |
| O                              | Chuck: a shirtless man in sunglasses points, and the opponent turns into a strawberry shortcake (in EX mode a cheesecake)                                            |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                          |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): dragon, ICE punch, sshoot and the chuck take other forms                                                                      |
| U, or →↓↘ K                    | dragon: a black-pompadoured man's punch (in EX mode a spotted, clawed beast's leap)                                                                                  |
| I, or ↓→ J                     | Fire: a winged girl in pink shoots an arrow from her wand; in the air an orange-headbanded boy throws a yellow spirit                                                |
| F, or ↓← J                     | iori: a black-clad fighter's spear thrust; ↓← J again for a hooked blade, then a sword (below 30% health, driven into the ground); a super cancels it for two stocks |
| G, or ↓← K                     | bp: the sunglassed man's clawed lunge (below 30% health, the spotted beast joins in)                                                                                 |
| 4, or ←↓→ K                    | SUCK: a white-robed archer's line reels the opponent in; also in the air                                                                                             |
| 2, or ↓←↓→ K                   | ICE punch: a black-robed fighter's dashing punch that looses an ice wolf, 1 stock (in EX mode a hooded, black-cloaked fighter's freezing strikes)                    |
| 3, or ↓→↓→ J                   | sshoot: a blond-pigtailed girl's cannon fires a fireball, 1 stock (in EX mode the black-pompadoured man's fire beam; at 150 life or less, a stronger volley)         |
| 1, or ↓→↓→ K                   | EN300: an orange-haired swordsman in red armour, 3 stocks                                                                                                            |

And SEAN's, a bald old monk in green robes and prayer beads who calls up a different character for most moves:

| Input                          | SEAN's move                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                   |
| P2 / P3                        | A blue-haired girl's triple strike / a red-haired fighter's dive                                                                     |
| K2 / K3                        | A white-armoured figure's exploding seal / a dark-clad swordsman's vortex dash                                                       |
| Down + J / K                   | A cloaked figure's sweep / a horned figure's low kick                                                                                |
| In the air: J / K              | A spiky-haired swordsman's dive / a kick from a figure in a white hood                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                   |
| ↑ while dashing forward        | High Jump                                                                                                                            |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                |
| H                              | Hit Up: a lunging swing of his sleeve                                                                                                |
| O                              | Chuck: a chubby pigtailed figure's long tongue                                                                                       |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                          |
| U, or →↓↘ J                    | Dragon: a small red-robed man's crescent; a super cancels it for two stocks                                                          |
| I, or ↓→ J                     | whip attack: an eye-patched man's five whips                                                                                         |
| F, or ↓→ K                     | Whip attack K: the same whips, farther off                                                                                           |
| G, or ↓← K                     | CC: an elf-eared hooded figure's red card makes the opponent vanish; in the air it catches only an airborne one                      |
| 2, or ↓←↓← J                   | SCC: an old man in yellow robes whose grab reaches across the screen, 1 stock; a KO by it makes the opponent vanish in a faint flash |
| 3, or ↓→↓→ J                   | S Shoot: the dark-clad swordsman's crescent wave, 1 stock (at 150 life or less, a stronger one)                                      |
| 1, or ↓→↓→ K                   | en300: a rider on a yellow beast calls down lightning, 3 stocks                                                                      |

And GON's, a brown-haired boy with goggles on his head, an orange shirt and a blue vest who puts on a different creature's costume for most moves:

| Input                          | GON's move                                                                                                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                                    |
| P2 / P3                        | A yellow armoured beast's claw charge / a green robot's low grab that blasts the opponent away                                                                                                        |
| K2 / K3                        | A yellow fox's spinning tail (at 141 life or less, a white-robed figure's sweep) / a blue dinosaur's dashing punch                                                                                    |
| Down + J / K                   | A blue wolf's spinning uppercut / a blue-hooded dragon's low kick                                                                                                                                     |
| In the air: J / K              | The blue dinosaur's diving claw / a green insect's kick                                                                                                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                    |
| ↑ while dashing forward        | High Jump                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                 |
| H                              | Hit Up: a dark winged demon's claws rise from the floor                                                                                                                                               |
| O                              | Chuck: a blue metal dinosaur's jaws                                                                                                                                                                   |
| Blocking with a stock: H       | COUNTER HIT                                                                                                                                                                                           |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): his P2, P3, K1, crouching and air punches, Hit Up, specials and supers take other forms                                                                        |
| U, or →↓↘ J                    | DRAGON: a lion-maned figure's rising sword; →↓↘ J again during it, or a quick miss, rises again with Evil Dragon                                                                                      |
| I, or ↓→ J                     | fire ball: an orange armoured dragon's dark crescent; in the air a winged gunner's lightning ball (in EX mode a caped lancer's dash, with ↓→ J twice more for two more, or ↓← J for a counter stance) |
| F, or ↓← J                     | DRILL: the yellow beast's spinning drill dive, also in the air; Super heart or KURENCOUNTER cancels it for two stocks (in EX mode a short counter stance)                                             |
| G, or →↓← K                    | COUNTER: a 0.4-second stance with a little bear: struck in it, he takes double damage, then kicks the opponent and strikes in three costumes (in EX mode a moving grab)                               |
| ↓→ K                           | dash move: the yellow beast's charging claw                                                                                                                                                           |
| 2, or ↓←↓← J                   | KURENCOUNTER: the caped lancer's stance, which counters a hit for 110 and otherwise strikes (in EX mode a dashing barrage), 1 stock                                                                   |
| 3, or ↓→↓→ J                   | Super heart: a yellow teddy bear's breaking heart, 1 stock (in EX mode three hearts that fly out before they strike)                                                                                  |
| 1, or ↓→↓→ K                   | EN300: a golden armoured beast's exploding sun, 3 stocks (in EX mode the winged gunner's barrage)                                                                                                     |
| 4, or H ↓ ↓ J O                | Hidden en300: only at 140 life or less (a Chuck above it), an orange-haired girl joins hands with him to call a white-caped knight, 3 stocks                                                          |

And KATE's, a blue-haired girl in a pink top and a blue skirt who, like GON, puts on a different costume for most moves:

| Input                          | KATE's move                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                                         |
| P2 / P3                        | A blue-robed priest's staff thrust / a purple-eared swordswoman's crescent cut                                                                                                                             |
| K2 / K3                        | A green-masked swordsman's slash / a white-winged knight's low lance thrust that pins the opponent, then drives through them                                                                               |
| Down + J / K                   | A pink-helmeted girl's pet spitting a blob / a green-robed lancer's low thrust                                                                                                                             |
| In the air: J / K              | A broadsword's downward cut / a red-clad fighter's kick                                                                                                                                                    |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                      |
| H                              | Hit Up: a white-robed figure's trident; on a hit, ↑ chases into the air                                                                                                                                    |
| O                              | Chuck: a white-suited figure's red crosshairs                                                                                                                                                              |
| Blocking with a stock: H       | COUNTER ATT                                                                                                                                                                                                |
| U, or →↓↘ J                    | neko punch: a cat girl's rising paw                                                                                                                                                                        |
| I, or ↓→ J                     | Air fire: in the air, a turquoise mage leaves a blue star hovering for 6 seconds; on the ground, af add, her strike that drops it onto whoever is below; BEAM or SLASH SUPER cancels af add for two stocks |
| ↓→ K                           | AIR FIRE K: as Air fire, but on the ground af add K sends the star down at a slant                                                                                                                         |
| F, or ↓← J                     | DASH ATTACK: a ninja's dagger dash through the opponent, who is struck five more times behind her; in the air a diving kick                                                                                |
| G, or →↓← K                    | Counter: a 0.3-second stance with a winged girl's axe: struck in it, she takes 30% of the damage and swings it                                                                                             |
| 2, or ↓←↓← J                   | SLASH SUPER: an archer's arrow; if it strikes, she lunges in with a halberd (at 129 life or less, a red orb, then a halberd lunge there and back), 1 stock                                                 |
| 3, or ↓→↓→ J                   | BEAM: a red-clad fighter's long beam, 1 stock                                                                                                                                                              |
| 1, or ↓→↓→ K                   | en300: a goggled sorcerer's yellow spirits, 3 stocks                                                                                                                                                       |

And REMU's, a long-haired blond fighter in a teal jacket who, like GON and KATE, puts on a different costume for most moves:

| Input                          | REMU's move                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                   |
| P2 / P3                        | A blue-helmeted hero's lunging punch in red and white armour / his leaping grab, which beats the opponent                                            |
| K2 / K3                        | The hero's two kicks / his flying kick                                                                                                               |
| Down + J / K                   | A blue-armoured swordsman's low cut / the hero's sliding kick                                                                                        |
| In the air: J / K              | The swordsman's cut / the hero's kick                                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                   |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                |
| H                              | Hit Up: the hero's uppercut; on a hit, ↑ chases into the air                                                                                         |
| O                              | Chuck: a white and red horned robot's punches                                                                                                        |
| Blocking with a stock: H       | Counter Hit                                                                                                                                          |
| U, or →↓↘ J                    | tatsumaki: the swordsman's swing that calls a grey whirlwind; Thander p, Phsy driver or MINAMI cancels it for two stocks                             |
| I, or ↓→ J                     | slash: the swordsman's dashing cut; in the air a diving one, which slash again on landing after a hit follows with a quicker cut                     |
| F, or ↓← J                     | JET: the hero calls a jet-backed robot, which charges with a blade                                                                                   |
| G, or ↓← K                     | Drill: the hero calls a drill that bursts from the ground                                                                                            |
| 3, or ↓←↓← J                   | BAKURETU: the swordsman's thrust that fires a yellow beam                                                                                            |
| 5, or ↓→↓→ J                   | Thander p: the robot's lightning-charged dashing punch, 1 stock                                                                                      |
| 4, or ↓→↓→ K                   | Phsy driver: the robot's leaping kick into a piledriver, 1 stock                                                                                     |
| 2, or ↓←↓← K                   | MINAMI: only at 155 life or less (Drill above it), a 1-second stance as the hero: struck in it, he takes 30% of the damage and strikes back, 1 stock |
| 1, or ↓←↓→ K                   | GOLD HAND: the robot climbs and dives with a golden hand, landing well ahead of him, into a long beating, 3 stocks                                   |

And REAR's, a masked blond fighter in a grey gi who, like GON, KATE and REMU, puts on a different costume for most moves:

| Input                          | REAR's move                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                             |
| P2 / P3                        | A horned red robot's drill-armed thrust / its spinning strikes                                                                                                 |
| K2 / K3                        | A purple and blue robot's low kicks / its kick that sends a green whirlwind along the floor                                                                    |
| Down + J / K                   | The red robot's thrust / the purple robot's beast-headed punch                                                                                                 |
| In the air: J / K              | A green-chested robot's punch / the purple robot's kick                                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                          |
| H                              | Hit Up: a blue horse's horn; on a hit, ↑ chases into the air                                                                                                   |
| O                              | Chuck: a purple serpent's grab                                                                                                                                 |
| Blocking with a stock: H       | COUNTER ATT                                                                                                                                                    |
| U, or →↓↘ K                    | SAMA: the purple robot's rising shield punch, also in the air                                                                                                  |
| I, or ↓→ J                     | Fire ball: the red robot's fireball; GYSA or VIPER FINAL cancels it for two stocks                                                                             |
| F, or ↓← K                     | DOWN ATTACK: a long leap that strikes as he lands, over a near opponent's head                                                                                 |
| G, or ↓← J                     | VIPER WHIP: the red robot's whip                                                                                                                               |
| 1, or ↓←↓→ J                   | GYSA: the red robot's hammer raises a pink crystal ahead of him (below 30% life, Evil GYSA's three), 1 stock                                                   |
| 2, or ↓→↓→ J                   | VIPER FINAL: a long whip that catches the opponent for a purple blast, 1 stock                                                                                 |
| 3, or ↓→↓→ K                   | en300: a giant sword's slashes, which miss an opponent standing close, 3 stocks                                                                                |
| 4, or H K → J O                | evil en3: only below 30% life with three stocks, a green clock shot for 1; when it strikes, he spends the other two, takes a winged form and fires seven beams |

And GIGI's, a big-headed grunt in a black mask with an FK crest and a skeleton-striped suit:

| Input                          | GIGI's move                                                                                                                                                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                                                         |
| P2 / P3                        | A lunging punch / a dash past the opponent that grabs them from behind and flips them over                                                                                                                                 |
| K2 / K3                        | A high kick / a hopping kick                                                                                                                                                                                               |
| Down + J / K                   | A leaping punch / a low drop kick                                                                                                                                                                                          |
| In the air: J / K              | A punch / a kick                                                                                                                                                                                                           |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                                         |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                                      |
| H                              | Hit Up: a rolling headbutt; on a hit, ↑ chases into the air                                                                                                                                                                |
| O                              | Chuck: a grab that leaps up with the opponent and slams them down                                                                                                                                                          |
| Blocking with a stock: H       | Counter Hit (after a heavy standing block, J and K together)                                                                                                                                                               |
| E, or ↓ ↓ H                    | Enter or leave his Change form (half a stock): other forms of his specials and two supers                                                                                                                                  |
| U, or →↓↘ J                    | Dragon: a rising spin, also in the air (in his Change form Jump att, a leap that grabs the opponent's head and flips them)                                                                                                 |
| I, or ↓→ J                     | K': a rifle butt; → J follows with a shot, → K with an upward swing (in his Change form Chuck ECC, a tumbling blue toy robot that bursts)                                                                                  |
| F, or ↓← J                     | DIVE: he sinks into the floor for up to 3 seconds, where ← and → move him and J or K comes up striking (in his Change form GIGI P, a rushing punch that ↓← J chains into two more, or ↓← K into a slide)                   |
| G, or ↓ ↓ J                    | Bike Doge D P: a charge on an orange motorbike, also in the air; Ranbu or S chuck cancels it for two stocks (in his Change form Doge D, sinking into the floor to come up 150 source pixels on, or where he stands with K) |
| 4, or ↓ ↓ K                    | Bike Doge D K: a motorbike leap, also in the air (in his Change form Doge D, coming up 300 source pixels on)                                                                                                               |
| 5, or ↓ ↓ J K                  | Bike Doge D PK: Bike Doge D P (in his Change form Doge D, coming up where he stands)                                                                                                                                       |
| 1, or ↓→↓→ J                   | Ranbu: a punch flurry whose last blow ↑ turns into a rising strike and ↓ into a low one, 1 stock (in his Change form Bean, a ray gun's beam across the screen, which misses an opponent standing close)                    |
| 2, or ↓→↓← K                   | S chuck: a grab and a beating, 1 stock (in his Change form Counter, a 1-second stance: struck in it, he kicks back)                                                                                                        |
| 3, or ↓→↓→ K                   | EN3: a stampede of GIGIs led by a blonde masked woman, 3 stocks                                                                                                                                                            |

In his Change form GIGI P cancels into Bean, or into SC COUNTER, a stance that catches the opponent itself, for two stocks.

And SWW's, a red-haired boy in a red shirt who changes into a different suit of armour for each move, and into gold armour at 30% life or less:

| Input                          | SWW's move                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| J / K                          | P1 / K1: a jab / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                                                                                                                                             |
| P2 / P3                        | A lunging punch / a dash through the opponent that leaves a flurry of blows behind them (in EX mode a leaping knee)                                                                                                                                                            |
| K2 / K3                        | A high kick / a long chain lash                                                                                                                                                                                                                                                |
| Down + J / K                   | A flaming punch / a sliding sweep                                                                                                                                                                                                                                              |
| In the air: J / K              | A punch / a kick                                                                                                                                                                                                                                                               |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                                                                                                                                                             |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                                                                                                                                                          |
| H                              | Hit Up: a rising punch; on a hit, ↑ chases into the air                                                                                                                                                                                                                        |
| O                              | Chuck: a grab and a throw                                                                                                                                                                                                                                                      |
| Blocking with a stock: H       | Counter Hit                                                                                                                                                                                                                                                                    |
| E, or ↓ ↓ H                    | Enter or leave EX mode (half a stock): other forms of his specials and three supers                                                                                                                                                                                            |
| U, or →↓↘ J                    | Dragon P: a rising uppercut in green armour (in EX mode a flying knee; at 30% life or less in gold armour)                                                                                                                                                                     |
| I, or ↓← J                     | ICE Punch: a punch with an ice spark in white armour (in EX mode a dash through the opponent; at 30% life or less in gold armour)                                                                                                                                              |
| F, or ↓← K                     | Chain att: a chain lash across the screen in pink armour; again within 0.8 seconds of a hit, another (in EX mode EX Chain, a 0.7-second spinning chain: struck in it, he lashes back)                                                                                          |
| G, or ↓→ J                     | Ryuseiken: a punch flurry in silver armour, which ↓→ J follows with a dashing one; in the air, a flaming bird; Ryuseiken cancels into SUPER RSK, GOD DRAGON or COUNTER CHAIN for two stocks (in EX mode fists of light flying across the screen, which ↓→ J follows with more) |
| 1, or ↓→↓→ J                   | SUPER RSK: a flurry under a winged horse, 1 stock (in EX mode Gysa, an ice blast that flies past an opponent standing close)                                                                                                                                                   |
| 2, or ↓→↓→ K                   | GOD DRAGON: charging uppercuts, 1 stock (in EX mode a rising dragon; at 30% life or less in gold armour)                                                                                                                                                                       |
| 3, or ↓←↓← J                   | COUNTER CHAIN: a 0.7-second stance: struck in it, he lashes back, 1 stock (in EX mode a dashing chain lash)                                                                                                                                                                    |
| 4, or ↓←↓→ J                   | EN300: a winged charge across the whole screen, 3 stocks (at 30% life or less in silver wings)                                                                                                                                                                                 |
| 5, or ↓←↓← K                   | Healing: only at 30% life or less, a robed woman's silhouette restores 160 life, 3 stocks (above it, Chain att)                                                                                                                                                                |
| J J → K J                      | ROLL CRASH: only at 30% life or less, a grab that leaps and crashes down, knocking out both fighters, 2 stocks                                                                                                                                                                 |

And OGI's, a white-haired, green-armed strongman who suits up in a different robot armour, or a caped red coat, for most moves:

| Input                          | OGI's move                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | P1 / K1: three punches / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                      |
| P2 / P3                        | A thrown hook / a dash with a chain whip in blue armour                                                                                         |
| K2 / K3                        | A dashing slash in blue armour / a grab and a beating in red armour (at 30% life or less a longer one)                                          |
| Down + J / K                   | A long shield thrust along the floor / a burst of blasts                                                                                        |
| In the air: J / K              | A punch / a kick                                                                                                                                |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                              |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                           |
| H                              | Hit Up: a rapier lunge in a red coat; on a hit, ↑ chases into the air                                                                           |
| O                              | Chuck: a grab and a throw                                                                                                                       |
| Blocking with a stock: H       | Counter Hit                                                                                                                                     |
| U, or →↓↘ J                    | Dragon: a rising claw in red armour                                                                                                             |
| I, or ↓← J                     | Crush attack: a shield-bash dash in grey armour (in the air, a dive)                                                                            |
| F, or ↓← K                     | Rose attack: a rose tossed in a high arc that lands far off, taking 35 power on a hit                                                           |
| G, or ↓→ J                     | fire p: a straight cannon shot in blue armour; s shoot, SCC or S Crush cancels it for two stocks                                                |
| 5, or ↓→ K                     | FIRE K: a cannon shell that bounces along                                                                                                       |
| 1, or ↓→↓→ J                   | s shoot: a giant cannon blast, 1 stock (also in the air)                                                                                        |
| 2, or ↓→↓→ K                   | SCC: close, a grab and a beam-saber stab, which ↓→ K follows with an uppercut and → ↓ ← K with a throw; farther, a leap into a beating, 1 stock |
| 3, or ↓←↓← J                   | S Crush: a shield-bash dash and four more, 1 stock                                                                                              |
| 4, or ↓←↓→ J                   | EN300: a blast thrown in a high arc that bursts on the floor, 3 stocks; it flies over a close opponent but drops short near a wall              |

And ZIRO's, a teal-haired young man who calls up a different robot suit, winged, caped, horned or heavily armed, for most moves:

| Input                             | ZIRO's move                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                             | P1 / K1: a punch / a kick; on a hit or block, J or K again for P2 / K2, then P3 / K3                                                                |
| P2 / P3                           | A caped robot's scythe swing / a dragon-armed robot's trident flurry                                                                                |
| K2 / K3                           | A gunner robot's spinning volley / a horned robot's whip                                                                                            |
| Down + J / K                      | A gatling volley / a low whip                                                                                                                       |
| In the air: J / K                 | A punch / a kick                                                                                                                                    |
| Shift or → →; Shift + ← or ← ←    | Dash forward; back                                                                                                                                  |
| ↑ in the air, or → → / ← ←        | Double jump; air dash                                                                                                                               |
| H                                 | Hit Up: a girl's rising kick; on a hit, ↑ chases into the air                                                                                       |
| O                                 | Chuck: a grab and a throw                                                                                                                           |
| Blocking with a stock: H          | Counter Hit                                                                                                                                         |
| E, or ↓ ↓ H                       | --TYPE--: EX mode on or off, half a stock; it swaps his specials and supers                                                                         |
| U, or →↓↘ K                       | Fire Ball: a shell that speeds up as it flies, two at 30% life or less (EX: a winged robot's rising slash)                                          |
| I, or ←↓↙ J / K                   | nataku: a dragon arm thrust up and out / straight out (EX: a cloaked robot's charge); MISS ALL or RAMBU cancels it for two stocks                   |
| F, or ↓← K / J                    | telepot: vanishing under a dark cloak to come out at the opponent / into the air                                                                    |
| G, or ↓→ J                        | IORI3HIT: a winged robot's dashing slash, which ↓→ J follows twice more; in the air, a shot down at the floor (EX: a fire ball; in the air, a spin) |
| 5, or ←↓→ K                       | CC: a grab into blows and a leaping slam (EX: a trident flurry)                                                                                     |
| 1, or ↓→↓→ K                      | MISS ALL: a gunner robot's barrage of bullets and missiles, 1 stock (EX: a winged robot's beam)                                                     |
| 2, or ↓→↓← J                      | RAMBU: a dash into a rush of blows from each robot, 1 stock (EX: a grab into one)                                                                   |
| 3, or ↓←↓→ J                      | EN300: a winged robot rising to rain beams down, 3 stocks (also in the air; EX: a diving slash)                                                     |
| 4, or a full turn of the stick, J | TWIN SHOT: below 30% life, twin beams swept round the whole screen, 3 stocks; otherwise the CC                                                      |

And MASA's, a blond pilot in red armour who swings a purple axe and swells into a bigger robot for his heaviest blows:

| Input                          | MASA's move                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| J / K                          | P1: an axe swing; J or K again at once for P2, two more, then J for P3 or K for K3, a leaping chop |
| Down + J / K                   | A grenade that bounces along the floor / a low axe sweep                                           |
| In the air: J / K              | An axe swing / a gun shot                                                                          |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                 |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                              |
| H                              | Hit Up: a rising axe slash; on a hit, ↑ chases into the air                                        |
| O                              | Chuck: a grab into a bigger robot's blows                                                          |
| Blocking with a stock: H       | Counter Attack                                                                                     |
| U, or →↓↘ J                    | SHORYU: a rising uppercut, which →↓↘ J follows twice more (also in the air)                        |
| I, or ↓→ K                     | 3Fire: a kick that fires a missile; → with K fires a second and a third                            |
| F, or ↓← J                     | 3HIT: an axe rush, which ↓← J follows twice more; SCC or RAMBU SUP cancels it for two stocks       |
| G, or ↓← K                     | BANDO BOX: a bazooka's canister that arcs out and bursts, which ↓← K fires twice more              |
| 1, or ↓→↓← J                   | RAMBU SUP: a dash into a rush of blows from the other fighters' shadows, 1 stock                   |
| 2, or ←↓→←↓→ K                 | SCC: a grab into the bigger robot's blows and a throw into the wall, 1 stock                       |
| 3, or J J → K J                | MESATSU: a dash that grabs into a flurry of flashing blows, 3 stocks                               |

And 3-TIMES's, a blond pilot in red armour like MASA's, who swings a purple axe and dashes with two shadows of himself:

| Input                    | 3-TIMES's move                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| J, standing or crouching | LP: a dashing axe swing that strikes three times                                            |
| K, standing or crouching | A grenade lobbed to hop along the floor                                                     |
| O, standing or crouching | HP: a heavy dashing axe swing that shakes the screen                                        |
| In the air: J or O / K   | An axe swing / two gun shots angled down                                                    |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                                |
| Shift + ← or ← ←         | A hop back                                                                                  |
| H                        | Nothing: he has no Hit Up, Chuck, double jump, air dash or Counter Attack                   |
| U, or →↓↘ J              | SHORYU: a crescent slash that rises forward                                                 |
| I, or ↓→ K               | FIRE: a pink crescent that flies across the screen                                          |
| F, or ↓→ J               | DASH P: a dashing axe swing, two shadows of himself dashing and swinging with him           |
| 1, or ↓→↓← J             | Rambu: his armour bursts off for a dash into a rush of the other fighters' shadows, 1 stock |
| 2, or ↓→↓→ K             | SB: fifteen grenades lobbed in a spread, 1 stock                                            |
| 3, or J J → K J          | MESATSU: a cut-in, then a dash that grabs into a flurry, 3 stocks                           |

And ZENKA's, a silver-haired woman in a long red coat who fights with a knife and calls in robots: a blue drill robot, a red robot and her own purple armour:

| Input                          | ZENKA's move                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K                          | A dashing knife slash / a stepping one; on a hit, J for the blue robot's sword thrust or K for the red robot's drill flurry                 |
| Then J / K                     | The blue robot's overhead swing / the red robot's sword swing                                                                               |
| Down + J / K                   | The blue robot's low sword thrust / the red robot's drill that rolls along the floor                                                        |
| In the air: J / K              | The blue robot's sword swing / the red robot's slash                                                                                        |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                                          |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                                       |
| H                              | Hit Up: the red robot's rising slash; on a hit, ↑ chases into the air                                                                       |
| O                              | Chuck: the blue robot's sword skewers the opponent; ↓↘→ K follows with the red robot's leaping spin                                         |
| Blocking with a stock: H       | Counter Hit                                                                                                                                 |
| U, or →↓↘ J                    | Dragon P: the red robot's rising sword slash (also in the air)                                                                              |
| I, or ↓→ J                     | FIRE BALL: her purple armour's slash across the screen; Ranbu or DAISHARIN cancels it for two stocks                                        |
| F, or ↓← J                     | New move: her purple armour charges, then thrusts a giant sword                                                                             |
| 1, or ↓→↓→ K                   | Ranbu: a grab into blows from both robots and her own last slash, 1 stock                                                                   |
| 2, or ↓→↓→ J                   | DAISHARIN: a giant sword hurled to spin out and back, 1 stock                                                                               |
| 3, or ↓←↓← J                   | En300: warnings, then a leap that drops with a giant sword, 3 stocks; its grab strips the opponent's clothes for 260 life, then flings them |

And Z-MEGA's, a white-haired, moustached brawler in a black vest who turns into Shin Z, trading life for power:

| Input                      | Z-MEGA's move                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J, standing or crouching   | A lunging palm strike that hits twice                                                                                                                                                                                                                   |
| K, standing or crouching   | A stepping spin kick                                                                                                                                                                                                                                    |
| In the air: J / K          | A punch / a kick                                                                                                                                                                                                                                        |
| Shift or → →               | A run that goes on while → is held; ↑ leaps into a high jump                                                                                                                                                                                            |
| Shift + ← or ← ←           | A hop back                                                                                                                                                                                                                                              |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                                                                                                                                                                                                                   |
| H                          | Nothing: he has no Hit Up or Counter Attack                                                                                                                                                                                                             |
| O                          | Chuck: a grab into a beating, then a blow that knocks the opponent away                                                                                                                                                                                 |
| E, or ↓ ↓ H                | TYPE CHANGE: into Shin Z, who loses a point of life every 0.1 seconds as his power rises 15, pausing through a super's freeze and, while his chuck holds the opponent, at 1 life; again to turn back, which holds his power at zero until he next turns |
| U, or →↓↘ K                | SAMA: a rising somersault kick (also in the air; Shin Z: lower, and →↓↘ K kicks again in the air)                                                                                                                                                       |
| I, or ↓→ J                 | Fire BALL: a fireball that arcs, bounces twice and rolls along the floor (Shin Z: a fast straight shot)                                                                                                                                                 |
| F, or →↓← J                | GIGA: a dash behind a glowing palm that carries the opponent into the screen's edge and slams them (Shin Z: faster and harder)                                                                                                                          |
| G, or ↓→ K                 | REFLACT: a round shield's shove (Shin Z: harder); meeting a shot, it throws a ball back, which fizzles on the shot itself                                                                                                                               |
| 1, or →←↓→ J               | GAISA: a charge through three levels; J fires its wave at the level reached, or he collapses, 1 stock (Shin Z: a level higher)                                                                                                                          |
| 2, or ↓→↓← J               | SGIGA: a bigger GIGA, 1 stock (Shin Z: faster and harder)                                                                                                                                                                                               |
| 3, or J J → K J            | AKUMA SP: a cut-in, then a dash that grabs into a storm of flashes, 250, 3 stocks (Shin Z: short of them, the flashes alone, still 250)                                                                                                                 |

On a hit, a super cancels SAMA, Fire BALL, REFLACT or GAISA.

And ALPHA's, a red-haired boy in a chained white suit who takes on four armours for his moves: a white tiger's, a green knight's, a red one with a snake and a winged blue one:

| Input                          | ALPHA's move                                                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| J / K                          | A chained punch / a kick; on a hit, J for the tiger's punches or K for the red armour's kick                            |
| Then J / K                     | The blue armour's wing slash / the knight's shield                                                                      |
| Down + J / K                   | The tiger's swipe / the knight's shield                                                                                 |
| ↘ + J                          | ANTI AIR HEAD: the knight's rising blow                                                                                 |
| In the air: J / K / ↘ + K      | The blue armour's slash / the red armour's kick / Drop Kick, its diving kick                                            |
| Shift or → →; Shift + ← or ← ← | Dash forward; back                                                                                                      |
| ↑ in the air, or → → / ← ←     | Double jump; air dash                                                                                                   |
| H                              | Hit Up: the red armour's snake; on a hit, ↑ chases into the air                                                         |
| O                              | Chuck: the blue armour's grab into a beam                                                                               |
| Blocking with a stock: H       | Counter hit                                                                                                             |
| U, or ←↓→ K                    | CC: the knight's lunge that grabs into a throw                                                                          |
| I, or →←↓→ J                   | Munt: a rock pillar thrust up from the floor well ahead                                                                 |
| F, or ↓← J                     | NC: the tiger's chain strikes; ↓← J follows twice more, and on a hit SNAKE FIRE, Rambu or SCC cancels it for two stocks |
| 1, or ↓→↓→ K                   | SNAKE FIRE: a giant snake's strike, 1 stock                                                                             |
| 2, or ↓→↓→ J                   | RYUON HASANKEN: the blue armour's flight behind a fire dragon, 3 stocks                                                 |
| 3, or ↓→↓← J                   | Rambu: the tiger's leap into a long flurry, 1 stock                                                                     |
| 4, or ↓ ↓ ↓ J                  | NEW EN3: pillars of fire, 3 stocks                                                                                      |
| 5, or →↓←→↓← K                 | SCC: the knight's grab into a launch and a slam, 1 stock                                                                |

Knocked out with a stock, ALPHA is flung away at 1 life and lies down, then draws his life back while his power drains: to full in practice, to about 150 in a VS match. His next KO that round is final.

And SHIN-Z's, Z-MEGA as Shin Z for good: a white-haired, moustached brawler in a black vest and purple trousers:

| Input                      | SHIN-Z's move                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| J, standing or crouching   | A lunging palm strike that hits twice; on a hit, K, a special or a super follows                   |
| K, standing or crouching   | A stepping spin kick; on a hit, a special or a super follows                                       |
| In the air: J / K          | A punch / a kick                                                                                   |
| Shift or → →               | A run that goes on while → is held; ↑ leaps into a high jump                                       |
| Shift + ← or ← ←           | A hop back                                                                                         |
| ↑ in the air, or → → / ← ← | Double jump; air dash                                                                              |
| H                          | Nothing: he has no Hit Up or Counter Attack                                                        |
| O                          | Chuck: a grab into a beating, then a blow that knocks the opponent away                            |
| U, or →↓↘ K                | SAMA: a rising somersault kick, also in the air, where →↓↘ K kicks again                           |
| I, or ↓→ J                 | Fire BALL: a fast straight fireball                                                                |
| F, or →↓← J                | GIGA: a dash behind a glowing palm that carries the opponent into the screen's edge and slams them |
| G, or ↓→ K                 | REFLACT: a round shield's shove; meeting a shot, it hurls the shield back                          |
| E, or →←↓→ J               | GAISA: a blue wave                                                                                 |
| 1, or →←↓→ K               | KAISA SUPER: a giant ghostly head of his that charges across the screen, 1 stock                   |
| 2, or ↓→↓← J               | SGIGA: a bigger GIGA, 1 stock                                                                      |
| 3, or J J → K J            | AKUMA SP: a cut-in, then a dash that grabs into a storm of flashes, 250, 3 stocks                  |

And ZAKU's, a squat green armoured trooper with only 200 life:

| Input                    | ZAKU's move                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| J, standing or crouching | A purple axe's swing; on a hit, DASH P or a super follows                          |
| K, standing or crouching | A grenade lobbed ahead, which bounces lower each time and bursts where it lands    |
| In the air: J / K        | An axe swing / a shot from his gun                                                 |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                       |
| Shift + ← or ← ←         | A hop back                                                                         |
| H / O                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash |
| U, or ↓→ J               | DASH P: a dashing axe swing; on a hit, a super follows                             |
| 1, or ↓→↓→ J             | Super P: four dashing axe swings and a stronger fifth, 1 stock                     |
| 2, or ↓→↓→ K             | Super K: five grenades, 1 stock                                                    |

And PAC-HELO's, a round yellow Pac-Man robot with a rotor on top and hose arms, with only 200 life:

| Input                    | PAC-HELO's move                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| J, standing or crouching | A hose-arm punch with a spiked fist; on a hit, a special or the super follows                    |
| K, standing or crouching | A kick; on a hit, a special or the super follows                                                 |
| In the air: J or K       | A spiked stomp                                                                                   |
| Shift or → →             | A roll that goes on while → is held; ↑ leaps into a high jump                                    |
| Shift + ← or ← ←         | A hop back                                                                                       |
| H / O                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash               |
| U, or hold ← 0.6 s, → J  | Roll: a rolling charge, also in the air, that bounces him off on a hit or guard                  |
| I, or J five times       | Electric: a crackling orb; J again within 0.2 seconds keeps it sparking                          |
| 1, or ↓→↓→ J             | Super roll: a roll steered by the direction held as it starts (on the ground, not down), 1 stock |

And GOLF's, a squat blue armoured trooper with a glowing sword and a whip, with only 300 life:

| Input                    | GOLF's move                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| J, standing or crouching | Two sword slashes; on a hit, K, a special or the super follows                                |
| K, standing or crouching | A long lash of his whip; on a hit, a special or the super follows                             |
| In the air: J / K        | A sword slash, after which K follows on a hit / a burst from his finger guns                  |
| Shift or → →             | A run that goes on while → is held; ↑ leaps into a high jump                                  |
| Shift + ← or ← ←         | A hop back                                                                                    |
| H / O                    | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash            |
| U, or ↓→ J               | Sp P: four dashing slashes; on a hit, the super follows                                       |
| I, or ↓→ K               | Sp K: a low lash and a high one that pulls the opponent past him; on a hit, the super follows |
| 1, or ↓→↓→ J             | Super P: six lashes and a long thrust, 1 stock                                                |

And ASURA's, a hooded brawler in a purple and grey robe, with only 300 life:

| Input             | ASURA's move                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| J                 | Three jabs; on a hit, K, a special or the super follows                                                                             |
| K                 | Three kicks; on a hit, a special or the super follows                                                                               |
| Down + J / K      | A hopping uppercut / a hopping kick that lunges forward; on a hit, the air special or super follows                                 |
| In the air: J / K | A flying punch / a flying kick; on a hit, K (after the punch), the special or the super follows                                     |
| Shift or → →      | A run that goes on while → is held; ↑ leaps into a high jump                                                                        |
| Shift + ← or ← ←  | A hop back                                                                                                                          |
| H / O             | Nothing: he has no Hit Up, Counter Attack or chuck, and no double jump or air dash                                                  |
| U, or ↓← K        | Tatumaki: a spinning kick that rises and drifts forward, striking in front and behind, also in the air; on a hit, the super follows |
| 1, or ↓→↓→ K      | Shinku TATU: a rising whirlwind of kicks that carries the opponent round him, then a kick, also in the air, 1 stock                 |

And TTRO's, a huge grey Totoro with 820 life, whose steps shake the screen:

| Input                    | TTRO's move                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------- |
| J                        | A long swipe of his arm; on a hit, a special (CC only from afar) or SUPER FIRE follows |
| K, standing or crouching | A sweeping claw; on a hit, a special (CC only from afar) or SUPER FIRE follows         |
| Down + J                 | A belly bounce that hops forward                                                       |
| In the air: J / K        | A swipe at chest height / a diving bite; on a hit, a double jump or air dash follows   |
| Shift or → →             | A hop forward                                                                          |
| Shift + ← or ← ←         | A hop back                                                                             |
| In the air: ↑ or → →     | A double jump or an air dash, under his umbrella                                       |
| H                        | Nothing: he has no Hit Up or Counter Attack                                            |
| O                        | Chuck: a grab into a throw, 40                                                         |
| U, or ↓← J               | DASH P: a dashing swipe; on a hit, DASH K follows                                      |
| I, or ↓→ J               | Fire: a blazing ball that the girl in his mouth fires, striking well ahead of him      |
| F, or ↓← K               | DASH K: a dashing claw                                                                 |
| G, or ←↓→ K              | CC: close in, a grab into a leap and a slam, 80                                        |
| 1, or →↓←→↓← J           | SCC: close in, a grab into two leaps and slams and a higher one, 200, 1 stock          |
| 2, or ↓→↓→ J             | SUPER FIRE: five blazing balls, 1 stock                                                |
| 3, or ↓→↓→ K             | EN300: a phone call that sends a yellow car charging across the court, 3 stocks        |

And ASTROMAN's, a hulking, muscle-bound boy robot with 780 life, whose steps shake the screen:

| Input                | ASTROMAN's move                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| J                    | A jab; on a hit, a special (C Chuck aside), SUPER P or ASS GUN SUPER follows                                                       |
| K                    | Two stepping kicks; on a hit, the same follow                                                                                      |
| Down + J / K         | A rushing punch / a leaping kick                                                                                                   |
| In the air: J / K    | A punch / a kick, in other forms after a double jump, an air dash or a dash; on a hit, a double jump, air dash or Jump att follows |
| Shift or → →         | A rocket dash that hovers on while → is held                                                                                       |
| Shift + ← or ← ←     | A rocket dash back                                                                                                                 |
| In the air: ↑ or → → | A double jump or an air dash                                                                                                       |
| H                    | Nothing: he has no Hit Up or Counter Attack                                                                                        |
| O                    | Chuck: a grab into a rocket leap and a slam, 45                                                                                    |
| U, or ↓← K           | Jump att: a rocket leap that lands in a blast, also in the air                                                                     |
| I, or ↓→ J           | Punch: a rocket fist                                                                                                               |
| F, or ↓→ K           | ASS GUN: five bullets from a gun in his backside                                                                                   |
| G, or →↓← J          | C Chuck: close in, a grab into kisses that heal him 60, then 40                                                                    |
| 1, or →↓←→↓← J       | S CC: close in, a grab into knees, blasts and kisses that heal him 50, then 300, 3 stocks                                          |
| 2, or ↓→↓→ J         | SUPER P: a huge black rocket fist, 120, 1 stock; each blow it guards powers it up, 130 to 170                                      |
| 3, or ↓→↓→ K         | ASS GUN SUPER: a beam from his backside that strikes twenty times from a little ahead of him, 1 stock                              |

And YINAN's, a white-haired wolf girl with 450 life who borrows armour, mecha and costumes for her moves. TO EX switches her between a Normal and an EX type, and each special and super has a form for each:

| Input                   | YINAN's move                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| J                       | A punch, 10; on a hit, J or K chains into a second strike and again into a third, or a special or super follows                                                                      |
| K                       | A kick, 15; on a hit, the same chains                                                                                                                                                |
| Down + J / K            | A low punch, 25 / a low kick, 20                                                                                                                                                     |
| In the air: J / K       | A punch / a kick, in other forms after a double jump or an air dash, and in EX                                                                                                       |
| Shift or → →            | A run that keeps on while → is held; ↑ jumps out of it, and → with K swings into Savage                                                                                              |
| Shift + ← or ← ←        | A dash back                                                                                                                                                                          |
| In the air: ↑ or → →    | A double jump or an air dash                                                                                                                                                         |
| H                       | Hit Up: a launcher, 15; ↑ after its hit jumps after them                                                                                                                             |
| O                       | Chuck: a grab, 30                                                                                                                                                                    |
| E, or ↓↓ H              | TO EX: switches between her Normal and EX types for 50 power; without it, No super                                                                                                   |
| U, or ↓→ J              | Driver: a strike, 10, that ← or → with J or K follows into Boxer, Venom, ARX-7 or Codarl (in EX, a rushing punch)                                                                    |
| I, or ↓← J              | Assault: a long rush, 40 (in EX, Fist S: rapid fists that J extends, up to six volleys)                                                                                              |
| F, or ↓← K              | DogeAttack: a dodge back that J, K, O or H (Dragon, a rising strike, 45) follows; in the air a dive (in EX, BTK S: a counter stance in a Bonta-kun suit, and in the air a P90 burst) |
| G, or ↓↓ J; ↓↓ K        | ECS P / ECS K: an unseen dash through (in EX, Flash P / K: a flashbang that bounces off the stage's ends)                                                                            |
| 1, or ↓→↓→ J            | SS: a sniper's aim that J fires up to four times and K lowers, 1 stock (in EX, Trap: a claymore)                                                                                     |
| 2, or ↓→↓← K            | EN Driver: a shield that strikes up close, 80, and answers a fireball with beams, 1 stock (in EX, FB: a batter's swing)                                                              |
| 4, or →↓←→↓← J          | EN Chuck: a Venom doll that grabs, 50, then chases them for 50, 1 stock (in EX, Call Lin: Lin charges in, 100)                                                                       |
| ↓→↓→ K                  | EN3: the Arbalest against a Venom, 211, 3 stocks (in EX, MUSIKI, 189)                                                                                                                |
| 3, or ←→←→ J            | Eat, under 150 life: a leap that catches a jumping opponent, 80, and heals her 50, 1 stock; otherwise Driver                                                                         |
| 5, or →←↓→ K            | R300, under 150 life: a shell whose burst calls in her friends, 230, 3 stocks; otherwise Driver                                                                                      |
| After Driver's hit: 1–4 | The super's SC form, 2 stocks                                                                                                                                                        |

And AYA's, a white-haired, bunny-eared girl with 500 life who dresses as other fighters for her moves:

| Input                  | AYA's move                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| J                      | A punch, 20; on a hit, J or K chains into a second strike and again into a third, or a special or super follows |
| K                      | A kick, 10; on a hit, the same chains                                                                           |
| Down + J / K           | A low punch, 20 / a low kick, 20                                                                                |
| In the air: J / K      | A punch / a kick, in other forms after a double jump or an air dash                                             |
| Shift or → →           | A dash forward                                                                                                  |
| Shift + ← or ← ←       | A hop back                                                                                                      |
| In the air: ↑ or → →   | A double jump or an air dash                                                                                    |
| H                      | Hit Up: a launcher, 15; ↑ after its hit jumps after them                                                        |
| O                      | Chuck: a grab into a lightning shock, 30                                                                        |
| U, or ↓→ J             | FB: a black mage's fireball, 30; in the air Air Crush, a dive                                                   |
| I, or ↓→ K             | DH: a caped rush, 30; in the air Air Kick, a diving kick, 20                                                    |
| F, or →↓↘ J            | SHO: a sword stroke that raises purple pillars, 35                                                              |
| G, or ↓← J; E, or ↓← K | TE P / TE K: a long unseen dash that stops beside the opponent, into a leaping slash, 30                        |
| 1, or ↓→↓→ J           | Slash: a crescent hurled from a shield, 84, 1 stock                                                             |
| 2, or ↓→↓→ K           | Rocket: a diving kick that pins the opponent and pummels them from every side, 107, 1 stock, also in the air    |
| 3, or ↓←↓→ J           | EN3: a sword sweep into a holy blast, 211, 3 stocks                                                             |
| After SHO's hit: 1–2   | The super's SC form, 2 stocks                                                                                   |

And DoraEmon's, a muscle-bound blue robot cat with 600 life, built on SEAN's file, whose name plate he still wears. Each of his attacks takes two of the original six buttons, which his keys press together; his stocks hold 90 power each, up to five. His commands allow only a tenth of a second, so his keys carry his moves:

| Input                     | DoraEmon's move                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| J / K / H / G             | LP, 5 / LK, 8 / HP, 12 / HK, 12; on a hit, LP cancels into the others, a special or a super |
| Down + J / K / H / G      | Low LP, 7 / LK, 10 / HP, 15 / HK, 12                                                        |
| In the air: J / K / H / G | An air strike, in another form after an air dash; he has no double jump                     |
| → + J / → + K             | SP1 / SP2: a dashing punch, 25 / kick, 30                                                   |
| ↘ + H                     | Hit Up: a launcher, 15; ↑ after its hit jumps after them                                    |
| O                         | Chuck: a grab and beating, 30                                                               |
| Shift / Shift + ←         | A dash forward / a hop back; in the air, an air dash                                        |
| E (hold)                  | EN: charges 4 power a tick; at five stocks, a taunt that gives the opponent 20              |
| U, or ↓→ H                | Air Cannon: a blast from his arm cannon, 40, starting too far ahead to hit up close         |
| I, or →↓↘ H               | Sky Rise: a rising flying punch, 60, also in the air                                        |
| F, or ↓→ G                | Charge: a flying rush, 50                                                                   |
| ↓← J or H                 | Twin Hammer: a dashing punch into an uppercut                                               |
| ↓↓ J or H / K or G        | The Anywhere Door: a teleport forward / back                                                |
| 1, or ↓→↓→ H              | Cannon (魔神空大砲): a shockwave across the screen, 130, 1 stock                            |
| 2, or ↓←↓→ H              | Gadgets (秘神具騒嵐): green shells and gadgets that pummel the opponent, up to 457, 1 stock |
| 3, or ↓←↓← H              | Fists (鬼神双乱槌): a punch flurry into a dash and uppercut, 258, 1 stock                   |
| 4, or ↓→↓← G              | Pierce (覇神極突貫): a flying multi-hit rush, 215, 1 stock                                  |
| 5, or J J → K H           | Hug (激神超抱擁): carries the opponent through the Anywhere Door, 270, 3 stocks             |
| →←↓→ G                    | FK之意思: a leap into a flashing barrage, 3 stocks                                          |

Knocked out with three stocks, DoraEmon reloads: flung away at 1 life, he lies down, spends the three stocks to darken the court and stands back up at full life.

And RARIO's, a muscle-bound, barefoot plumber in a red cap and blue overalls who fights in Ryu's stance, with 450 life:

| Input             | RARIO's move                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J / K             | P, 18 / K, 15; on a hit, P cancels into K, a special or a super                                                                                                         |
| In the air: J / K | P J / K J, 15 each; he has no double jump                                                                                                                               |
| Shift / Shift + ← | A dash forward / a hop back                                                                                                                                             |
| U, or ↓→ J        | Hado: a dark fireball, 30, that bounces along the floor; another while it flies is a punch                                                                              |
| I, or →↓↘ J       | Shoryu: a rising uppercut, 35, that knocks a ? block loose for a coin (2 life, 10 power) or a mushroom that slides into the opponent: +31, −29, or +50 life and a stock |
| F, or ↓← K        | Tatumaki: a hopping spin kick, two hits of 18                                                                                                                           |
| 1, or ↓→↓→ J      | Shinku: a leap that hurls a red shell along the floor, 84, 1 stock                                                                                                      |
| 2, or ↓→↓→ K      | Shin Shoryu: a grab into a chain of stomps on the opponent's head and a flagpole finish, 200, 2 stocks                                                                  |

And TRAINING's, RARIO's practice copy, with his look and 500 life. Standing still refills his life and the opponent's power, and empties his; he has no supers, air attacks or double jump:

| Input             | TRAINING's move                                               |
| ----------------- | ------------------------------------------------------------- |
| J                 | Drain: takes 100 of the opponent's life, wherever they stand  |
| K                 | Refill: refills the opponent's life                           |
| O                 | Self KO: knocks himself out                                   |
| H                 | Hit Up: an uppercut, 10, after a three-second countdown       |
| U, or → H         | Hado: RARIO's bouncing fireball, 10, after the same countdown |
| Shift / Shift + ← | A dash forward / a hop back                                   |

The game opens on the original's title: its volume warning and two logos for seven seconds, then the title screen, where any key brings up the SINGLE / VS / TEAM VS menu. Move its cursor with W and S and press an attack key on SINGLE for story mode, on VS for the character select screen or on TEAM VS for its team form; R starts the title over. Story mode opens the select screen with only the 1P arrow: choose a fighter (SHIN-Z can play his too) and play through their story, its battles, among several CPUs at once with reinforcements, and its demos, which an attack key skips where the original allows. Lose a battle that offers it and the continue screen asks YES or NO: YES fights the battle again, NO returns to the title. During a story battle **Reset** starts it over. The select screen is the original's VS single one: move the 1P arrow over the grid with A, D, W and S (held, a direction repeats after half a second, then every 50 ms) and choose with any attack key, then move the 2P arrow the same way to choose the opponent. The key picks the fighter's colours, as in the original: K, H, J and O each give one of their eight palettes, and the second side moves on to the next if it picks the first's. Hovering a fighter stands their portrait and name at your side; a GATE LOCK cell (SHIN-Z, DoraEmon and the empty slots) can't be chosen. Once both are chosen the panels close and the match starts. A won Vs. CPU match returns to the screen, and **Character select** above the arena opens it again. TEAM VS's screen picks three fighters a side, each in its own colours, and fights them in turn against the CPU's: the side that loses a round sends in its next member, and the first to win three rounds takes the match.

Below the arena, you can also choose your fighter and the opponent directly (Ryuko, Zoma, Kiki, Chung, Amiro, ANMC P, Giant, G Suneo, Yo, SIN, LIZARD, KAY, DIDO, SAKUYA, ALEX, SOU, HISO, ERUS, OS FENG, SEAN, GON, KATE, REMU, REAR, GIGI, SWW, OGI, ZIRO, MASA, 3-TIMES, ZENKA, Z-MEGA, ALPHA, SHIN-Z, ZAKU, PAC-HELO, GOLF, ASURA, TTRO, ASTROMAN, YINAN, AYA, DoraEmon, RARIO or TRAINING), the stage (Sport Court, Train Morning, Sakura Night, Train Night, Dojin BKG, Japan Street, Park Morning, Park Night, Sakura Street, Greek, Space, Boss Base, ZM Office, ZM Office T2, BR Boss Base, GI Stage, Space Night or Street Night) and the mode:

- **Free practice** has no timer. Choose the partner's behavior (stand, guard, jump and guard, punch, jump in with an air kick, or the original CPU), **Max stock** to keep both fighters' stocks full, and **Low health** to hold your fighter just under 30% health for the desperation moves.
- **Vs. CPU** plays the original CPU in 60-second rounds, opened and closed by the source's intros, calls and KO lettering. The first to win three rounds takes the match. A Vs. CPU match the character select screen starts plays the original's VS single paths: each fighter's VS intro, no power or stock from it, and the VS forms (ZA) of the finishers that have them. Choosing a fighter below the arena returns to the intros above.

Tick **Music** for the stage's track. Leaving the window pauses the match. The touch buttons cover every control the fighter has, as does the key list under the arena; landscape is recommended on phones.

[docs/gameplay.md](docs/gameplay.md) describes how each move, chain, cancel, reaction and round rule plays.

## Evidence

The port keeps behavior recovered from the source apart from rules authored for training:

- **Recovered:** each fighter's moves, objects and reactions run from their exported action scripts. Commands, attack and body boxes, the response table, contact pauses, damage, power, the camera, the HUD, KO and the CPU port the engine's own routines.
- **Authored:** the single-key bindings, the Shift dash, jumping on a fresh press, the practice partners and settings, and the few other training choices that [docs/evidence.md](docs/evidence.md) names.
- **Acceptance:** Vitest compares the idle interpreter with independently generated Python traces and the handoff's seed-0 timeline, and pins each rule's ticks and positions. The original Windows game has not been run here.
- **Scope:** forty-five fighters, all 18 stages, local single-player. No full gameplay VM, original-game parity, gamepad, multiplayer, or public deployment.

[docs/evidence.md](docs/evidence.md) cites the action indices, PCs, opcodes and engine addresses behind each rule, and tabulates the contact pauses.

## Files and assets

- `src/App.svelte`: accessible Svelte interface, mode selection, status, and touch controls.
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

The original handoff stays unchanged outside `public/`. Vite explicitly denies serving it, including through `/@fs/`. Only selected PNGs enter `public/assets/`; generated assets and fixtures are ignored by Git and regenerated locally. `dist/` contains those selected original assets and is for private development. This MVP does not publish them or establish redistribution rights.

Phaser uses its [scene lifecycle](https://docs.phaser.io/phaser/concepts/scenes); Git hooks follow [Husky's current setup](https://typicode.github.io/husky/get-started.html).
