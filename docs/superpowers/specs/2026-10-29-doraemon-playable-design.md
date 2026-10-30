# DoraEmon on the select screen, with his own story — design

## Intent

DoraEmon (`46 B6.PLAYER`, roster cell 45, `who` `'dora'`) already plays: his
moves, CPU, KO paths and help text are ported, and the dropdowns below the
arena offer him. But the character select screen, which the game opens on,
never does. The original paints GATE LOCK over his cell, and his select flag
byte (`0x4452cc` + 45) is 0, so neither VS (bit 1, `0x4079a0`) nor story
(bit 0, `0x407c5c`) lets a cursor rest there. Nothing in the engine writes
that array, so the original has no unlock. His story is empty (0 steps).

The user wants him chosen like any other fighter: his face in his cell,
selectable in VS and story, and a story of his own modelled on the boss
characters' (SHIN-Z, ALPHA, ZENKA). Everything here is **authored**: the
original never offers him. Label it so in code comments and
`docs/evidence.md`.

## Goals

1. His grid cell shows his face instead of GATE LOCK.
2. The VS, TEAM VS and story select screens let a cursor rest on him and pick
   him.
3. Story mode runs a fixed 27-step story for him, based on the boss route.
4. Tests pin the above. The docs and the help text describe it.

## Non-goals

- No random shuffle: his lineup is one fixed order.
- No new demos or art beyond the cell face. No change to his moves, keys,
  Vs. intro or command-only moves.
- The other fighters' stories are unchanged. SHIN-Z, ALPHA and ZENKA still
  meet him at their step 24.

## Anti-goals

- Unlocking anything else: the blank cells (42–44), and SHIN-Z in VS, stay
  locked.
- Editing files under `scwu-web-handoff/`, hand-editing generated JSON, or
  committing exported assets.

## 1. His cell face

Approved mockup: the left variant in
`/private/tmp/claude-501/-Users-chanwaichan-workspace-scwu-web/792e2c34-73f0-40ca-93a2-26f0da891ed6/scratchpad/cellmock2.png`.

- The source is his own image 266 (98×133, his muscled form, yellow eyes).
  Scale it 1.5× with nearest-neighbour, then place it so his eyes (about
  (70, 40) in 266's pixels) sit at the cell's horizontal centre and 42% of the
  way down.
- The cell is grid pixels x 128–153, y 345–417 of the 206×417 grid. Mask it
  to that cell's opaque pixels, keep the cell's near-black border
  (r + g + b < 120), and fill the rest behind him with (30, 60, 140).
- Do this in `scripts/export_assets.py`, where it writes the CHAR SELECT
  demo's grid images `public/assets/select/13.png` and `30.png`, and TEAM
  VS's grid, `public/assets/demo11/13.png`. That last one has the same
  pixels as `select/30.png`. The two CHAR SELECT images differ only at
  SHIN-Z's cell (25–49, 275–348), so cell 45 is the same in all three. It's
  generated output, so the source stays untouched.
- On the side panel, a cursor resting on him stands his existing select face
  (action 84, image 140). That needs no change.

## 2. Unlocking his cell

`selectable(index, bit)` in `src/game/select.ts` admits index 45 for both
bits, as an authored exception beside the flag test. VS single, TEAM VS
(which tests bit 1, as VS does) and story (bit 0) all follow from it. The
locked lists in `select.test.ts` become:

- VS: `[33, 42, 43, 44, 48, 49]`
- Story: `[42, 43, 44, 47, 48, 49]`

## 3. His story

**Template:** SHIN-Z's scenario (`shinz.json` `scenario`, 28 steps). His
steps 19 and 21 are already ZENKA and ALPHA, as the user asked.

**Rule:** every step copies SHIN-Z's record as-is (battle fields and every
slot field: flags, x, delays, watch/below, points, life, power, scorer). Only
a slot's `player` changes, except where the table below says otherwise.
Player numbers are roster indices (`ROSTER` in `select.ts`).

| Step | SHIN-Z's                                                             | DoraEmon's                                                                                                                                                                                |
| ---- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | demo 3 `--NEXT--`                                                    | same                                                                                                                                                                                      |
| 1    | duel, KAY (battle `flags` 0)                                         | duel, **GIANT** (6), with battle `flags` set to 1 as in ALPHA's and ZENKA's step 1, so a loss opens Continue instead of moving on                                                         |
| 2    | demo 3                                                               | same                                                                                                                                                                                      |
| 3    | duel, REAR                                                           | duel, **ALEX** (14)                                                                                                                                                                       |
| 4    | demo 4                                                               | same                                                                                                                                                                                      |
| 5    | brawl, stage 6: KIKI, DIDO, REMU, RYUKO, LIZARD, GON + ZAKU          | **SAKUYA, CHUNG, SIN, YO, GON, KATE + GOLF**                                                                                                                                              |
| 6    | demo 4                                                               | same                                                                                                                                                                                      |
| 7    | brawl, stage 7: AMIRO, SOU, GIANT, ERUS, YO, SEAN + ZAKU             | **OGI, KAY, SOU, LIZARD, ANMC P, GIGI + ASURA**                                                                                                                                           |
| 8    | demo 4                                                               | same                                                                                                                                                                                      |
| 9    | brawl, stage 4: SIN, OS FENG, G SUNEO, HISO, ANMC P, ALEX + ZAKU     | **SEAN, RYUKO, REAR, ERUS, AMIRO, HISO + GOLF**                                                                                                                                           |
| 10   | demo 5                                                               | same                                                                                                                                                                                      |
| 11   | brawl, stage 11: ZOMA, OGI, SAKUYA, KATE, CHUNG, ZIRO + PAC-HELO     | **G SUNEO, REMU, OS FENG, ZOMA, DIDO, KIKI + ASURA**                                                                                                                                      |
| 12   | demo 6                                                               | same                                                                                                                                                                                      |
| 13   | grunt brawl: ZAKU, PAC-HELO, ZAKU, PAC-HELO, GOLF, ASURA, RARIO      | same                                                                                                                                                                                      |
| 14   | demo 5                                                               | same                                                                                                                                                                                      |
| 15   | brawl, stage 10: GIGI, SWW, MASA, 3-TIMES, TTRO, ASTROMAN + PAC-HELO | **MASA, ZIRO, 3-TIMES, SWW, ASTROMAN, TTRO + Z-MEGA** (31)                                                                                                                                |
| 16   | demo 24 `--Challenge BR--`                                           | same                                                                                                                                                                                      |
| 17   | YINAN + AYA                                                          | same                                                                                                                                                                                      |
| 18   | demo 8 `--ZA NEXT--`                                                 | same                                                                                                                                                                                      |
| 19   | ZENKA                                                                | same                                                                                                                                                                                      |
| 20   | demo 8                                                               | same                                                                                                                                                                                      |
| 21   | ALPHA                                                                | same                                                                                                                                                                                      |
| 22   | demo 25 `--ENDING--`                                                 | same                                                                                                                                                                                      |
| 23   | demo 91 `DoraOP`                                                     | **demo 8**                                                                                                                                                                                |
| 24   | DoraEmon, stage 3                                                    | **SHIN-Z:** ALPHA's step-21 battle record (`alpha.json` `scenario[21]`, SHIN-Z's slot, 2 rounds, 100 s, `koScorer` 2, so SHIN-Z scores the 1P's KO and a KO loses), with `stage` set to 3 |
| 25   | demo 92 `DoraED`                                                     | **demo 89** `Zmega End`                                                                                                                                                                   |
| 26   | demo 89                                                              | **end** (type 4)                                                                                                                                                                          |
| 27   | end                                                                  | (none)                                                                                                                                                                                    |

Notes:

- **Grunts are allies.** The seventh slot in each brawl carries flag bit 9,
  so GOLF, ASURA and Z-MEGA fight on DoraEmon's side with ally life bars, as
  ZAKU and PAC-HELO do for the bosses.
- **Who goes where.** The 26 regulars outside step 15 were shuffled once
  (seeded) across the duels and steps 5–11. Each appears once. Step 15 keeps
  the late group, with TTRO and ASTROMAN in its fifth and sixth places, the
  late, high-points arrivals they hold in every boss story.
- **Where the data lives.** It's authored data, so keep it in TypeScript
  (`story.ts`'s `scenarioOf` returns it for `'dora'`), derived from
  SHIN-Z's and ZENKA's exported records plus a substitution table. Don't put
  it in the export script, whose JSON is recovered data.

## 4. Behaviour his own scripts bring (recovered, keep, verify)

The story's demos change the globals his scripts test. Traced on SHIN-Z's
route:

- The story select leaves global 3 at 10.
- Demo 4 clears it, so steps 5–17 run at 0.
- Demo 8 sets it to 10 again for steps 19, 21 and 24.

The KO outcomes differ by battle. Each is the engine's own result; add no
rule for any of them.

- **Duels (steps 1 and 3) and boss fights (19, 21, 24):**
  - `knockOut` (`0x40e863`) gives the battle's `koPoints` (100) to its
    `koScorer` on the KO's tick, and 100 points ends a story battle.
  - So a KO loses at once.
  - With three or more stocks he enters KO RELOAD (72), but the loss comes
    first, so he never revives. The user accepted that: ALPHA's KO Boss also
    revives only as the CPU.
- **Brawls (steps 5–17):** nobody scores a 1P's KO.
  - With three or more stocks, KO RELOAD (72) → KR Down (74) spends three
    stocks, he regains 600 life, and he fights on.
  - With fewer stocks, the brawl ends as a draw, which still opens Continue.
    SHIN-Z as the 1P draws there too.
  - _Correction found during execution:_ this revive contradicts the earlier
    "he can't revive"; it's the engine's behaviour.

Tests reach each battle with the globals the real story leaves. They pick
him on the story select screen, then play every earlier demo through
`StoryDemo` on the shared globals (battles between are skipped).

- **Intro:** his 開始時 takes its global-3 = 10 path, the one he plays as the
  CPU at the boss stories' step 24.

The builder adds tests that show, with him as the 1P in his story:

1. **Step 1 (GIANT):** a KO loses, and the battle's `flags` bit 0 opens
   Continue, whose retry reruns it.
2. **Step 1 with three or more stocks:** he enters KO RELOAD (72) and still
   loses, with stock and life unrecovered.
3. **Step 5 with three or more stocks:** he revives (stock 1, 600 life).
4. **Step 5 with fewer stocks:** the brawl ends as a draw.
5. **Step 24 (SHIN-Z):** a KO loses.
6. **Every battle above:** his intro plays into the fight.
7. **Demos:** `StoryDemo` never takes the 1P, so the demos need no
   DoraEmon-specific test.

## 5. Tests and docs

- **Tests:**
  - `select.test.ts`: the locked lists above, plus a pick of cell 45 in VS
    and in story.
  - A story test: `scenarioOf('dora')` matches the table, and the step-1
    battle is GIANT on stage 8.
  - The section 4 checks.
- **`docs/evidence.md`:** an authored entry covering the cell face, the
  unlock, the story table and its derivation. Cross-reference it from the
  DoraEmon entry and the Character select / Story screens entries, which now
  call him locked.
- **`docs/gameplay.md`, `README.md` and the help in `src/App.svelte`:** the
  select-screen sentence ("SHIN-Z, DoraEmon and the empty slots") and the
  story paragraph.

## Left to the builder

- Exactly where the composite runs in the exporter, and how it reads image
  266 there (his container is already read and hash-checked by
  `export_fighter`).
- How the substitution table is written in `story.ts`.
- Test placement and naming.

## Calls made in the conversation (not the user's words)

- Step 15's ally is Z-MEGA, not GOLF or ASURA: the user named only the four
  brawls.
- Step 23 plays demo 8 in place of DoraOP. Demo 92 (DoraED) is dropped. The
  ending is demo 89, SHIN-Z's route's own.
- Step 24 uses ALPHA's SHIN-Z boss record (100 s timer, a KO loses). It
  doesn't use ZENKA's, whose `koScorer` 1 gives the 1P's own KO to the 1P,
  so it can be lost only at time-up. Nor does it use SHIN-Z's untimed
  DoraEmon record, whose 1-point-a-KO scoring exists for his KO loop.
- TEAM VS's grid gets his face too, since its cell can now be picked.
- Step 1's battle `flags` is 1, not SHIN-Z's 0, so losing the first fight
  offers Continue (found by the Codex review).
- The regular lineup comes from a seeded shuffle, with step 15 kept to the
  late group.
