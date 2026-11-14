# HPA-766 — BR Another: four pairs, then four bosses — design

**Status:** planning only; implement, test, and verify in this same draft PR.
**Linear:** https://linear.app/cwchanap/issue/HPA-766/rework-br-anothers-last-stages-four-pairs-then-four-bosses
**Review:** PR #18 design feedback incorporated (reachability, RARIO, palette, simpler architecture).
**Prerequisites:** HPA-765 and HPA-767 are merged to `main`.
**Delivery:** one PR for planning and implementation. No new art/SFX or UI mockup.

## Player experience

B.R. ANOTHER becomes three stages for each eligible regular fighter. Their existing partner is the ally in every stage, entering when the player runs low on life.

| Stage | Arena | Opponents |
| --- | --- | --- |
| 1 | Sakura Street (`sakura`) | Three regular pairs |
| 2 | Sakura Night (`sakuranight`) | SWW + GIGI, MASA + 3-TIMES, YINAN + AYA, OGI + ZIRO, minus the player's own pair if among these eight fighters |
| 3 | Determined by last boss | ZENKA, ALPHA, SHIN-Z and DoraEmon |

Stage 1 stays source-authored for regular fighters. MASA, 3-TIMES, Z-MEGA and RARIO replace their two small two-pair fights with a single ordinary three-pair stage 1. Draw those three pairs from the 12 fixed regular pairs other than SWW/GIGI, MASA/3-TIMES and OGI/ZIRO; YINAN/AYA is the fourth stage-2-only pair.

Each opposing pair is friendly internally, hostile to the player and all other pairs. Eight named stage-2 fighters do not face their own pair; their partner remains the ally. Z-MEGA and RARIO ally with each other and fight all four opposing pairs (player + ally + eight enemies = **ten seats**). All four bosses in stage 3 are hostile to each other and to the player; the first enters immediately, then the next comes in as the previous falls below the original life threshold. All four must be defeated; player KO uses existing Continue.

| Last boss | Stage 3 arena |
| --- | --- |
| ZENKA | Boss Base (`boss`) |
| ALPHA | ZM Office T2 (`office2`) |
| SHIN-Z | BR Boss Base (`brboss`) |
| DoraEmon | Street Night (`streetnight`) |

DoraEmon keeps his existing EN charge and KO RELOAD in this ticket; HPA-858 changes those skills separately.

## Architecture: static overrides of BR-only source steps

**Do not replace a suffix starting at BR Another's entry.** Other routes reach steps *after* the BR Another-exclusive block, including shared endings and STORY boss routes. A suffix replacement would silently delete STORY/BR ZERO content.

Keep generated JSON intact. Follow the existing `DORA_STORY` pattern: construct **one static authored scenario per eligible fighter**, at module load, by copying the source array and overwriting only BR Another-exclusive indices. `scenarioOf(who)` returns the authored array where present and retains the existing DoraEmon special case; unmodified source arrays remain available as `CHARACTERS[who].scenario` for evidence tests. `Story`, `next()`, `startOnRoute()`, `retry()` and scene routing remain unchanged, with **no new per-Story active-steps state**. Since lineups are seeded from the fighter, there is no reason to choose an override per run.

The review checked all 34 mode-select fighters against generated scenarios and identified these source-exclusive regions. Pin these families and the unchanged reachability of every other route in tests:

| Fighter family | BR-only indices | Required patch |
| --- | --- | --- |
| 28 regular fighters | 62–66 | Preserve D4, existing stage 1 and D7; replace old finale with stage 2, change old final jump to reach appended `[stage 3, jump to original ending]` |
| YINAN, AYA | 64–68 | Same pattern, with original shared ending at 62–63 |
| MASA, 3-TIMES, Z-MEGA | 44–49 | D4 → new stage 1 → D7 → stage 2 → stage 3 → no-op demo 0; fall through into their unchanged shared ending |
| RARIO | 44–49 | Same three stages; last step jumps over the shared tail to appended `[D25, end]` |

The source `Story.next()` always-jump is `{ type: 3, condition: 0, value: 0, offset: targetIndex - currentIndex }`. Overflow steps append **after the original array length**, within the runner's <100-step bound (longest original scenario: 81 steps). For the folded non-RARIO fighters, `{ type: 2, demo: 0 }` skips itself and falls through to the original shared end. Prefer these existing step types over new runner semantics. Copy source arrays shallowly, replacing only authored steps; never mutate exported JSON.

**RARIO:** Source steps 50–54 (`D25 → D91 → DoraEmon battle → D92 → end`) are shared by STORY and BR ZERO, reached from 32→50 and 43→50. Keep all five **untouched and reachable in those routes**. Only BR Another jumps to its own appended `D25 → end`. The old DoraEmon encounter is removed **from BR Another**, not from the character's other story paths. Other fighters' STORY DoraEmon content also stays intact.

## Pure lineup builder and source templates

Add a small `src/game/br-another.ts` that builds the three authored `Battle` objects as necessary and the BR-only step patches. `Match` never imports or recognizes this module. Use `ROSTER` indices for fixed pairs and the bosses:

- 15 adjacent regular pairs from indices 0–29; special stage-2 fixed pairs are 24/25, 28/29, 40/41 and 26/27; the other 12 regular pairs are stage-1 candidates for folded fighters.
- Stage-3 bosses are 30 (ZENKA), 32 (ALPHA), 33 (SHIN-Z), 45 (DoraEmon).
- Determine whether to exclude a special pair **by whether it contains `who`**, not by a separate eight-fighter allowlist. Other fighters retain all four.
- Seed by stable fighter `ROSTER` index and shuffle pair-units and bosses with Fisher–Yates using the existing engine `rand` from `standing.ts` (one deterministic state). Keep pair members together and their member order fixed. Different fighters may share boss permutations (24 possibilities).
- For a folded fighter's new stage 1, **use Ryuko's source BR Another stage-1 battle (step 63) as the reference for opponent-slot entry flags, CPU level, life threshold, and three-pair arrangement**, replacing the pair identities with the seeded selection. Use the current fighter's source final BR battle for its own partner/ally slot and fighter-specific header where appropriate; document intentional deviations explicitly in the tests.
- For new stages 2 and 3, start from the current fighter's **source last BR Another battle header and ally slot** (the ally uses flag `0x200`, commonly `0x305`, watches seat 0, with fighter-specific `below`). Preserve relevant round/Continue, level, x, delay, entry-threshold and scoring semantics. The first boss starts present, with subsequent bosses watching the preceding boss's seat.
- **Build all hostility masks from scratch** from the actual new seat graph. Do not copy original `Slot.enemies`: old masks such as `0xef9`, `0xee7` and `0xedf` contain high bits which become active at ten seats and can make pair-mates hostile. Recompute ally, same-pair friendship, other-pair hostility, and all boss-versus-boss relationships.
- Preserve the source `(flags >> 1) & 3 === 2` wait-entry, `watch`/`below`, HPA-767's scaled `lifeMark`, existing brawl survival and Continue/retry. No runtime source-shape guard is needed: compare route-family reachability and source-fixture shapes in tests; exported source PLAYER files are hash-pinned by the exporter.

## Critical ten-seat palette compatibility

`seat()`, `storyFighters()`, CPU arrays and per-seat mask conversion already scale with `battle.slots`, and the HUD intentionally shows only 1P plus `match.rival`. Do **not** add a new renderer, generic seat pool or HUD layout.

There are, however, **two real failures**:

1. `takePalette(held, seat, palette)` in `src/game/select.ts` cycles modulo eight until a color is unused. With nine or ten seats, eight colors can all be occupied and the loop never terminates. **Bound it to eight attempts; if exhausted, accept a duplicate palette** (authored exception, document in `docs/evidence.md`). Preserve uniqueness when fewer than eight palettes are taken.
2. The scene passes `storyHeld = [...select.drawn]`, where `CharacterSelect.drawn` has eight entries. Changing only `Match`'s eight-element default does not fix live gameplay: `held[8]` and `held[9]` are undefined, and `palettes` can become `NaN`. **Pad the incoming `held` array to ten with `-1`, in place, before story seating** so the scene continues to share the same held array across battles. Keep the default safe too.

Test the full ten-seat battle using an explicitly passed **eight-element held array**, not just the constructor default. Verify no infinite loop, no NaN palette, palette values 0–7, and palette continuity across stages.

## Verification, constraints and acceptance

Pin all four route families' BR-only blocks and compare STORY Easy/Hard and BR ZERO reachability against unmodified `CHARACTERS[who].scenario` for all eligible fighters. Unit-test determinism, each own-pair exclusion, all four boss-last arenas, RARIO's untouched shared path, the folded stage-1 Ryuko template, masks, ally entrance, boss succession, survival and retry. Keep source scripts and generated data unchanged.

HPA-766 has **no UI mockup or new UI**. Do not add an expensive browser suite that plays through 7–9 CPU opponents or snapshots maximum occupancy: the battle rules are testable deterministically through `Story` and `Match.story`. Keep the existing Playwright B.R. ANOTHER route-entry smoke passing and a lightweight visual check of the existing arena/HUD. Product-level end-to-end acceptance covers a short route-entry flow on **macOS Chromium, Windows Edge and iOS Safari/WebKit** using existing controls; no new full cross-browser battle matrix or human sign-off. CI handles Android/Linux only.

Out of scope: STORY and BR ZERO changes, RARIO's non-BR ending, HPA-770 CHAOS and seat reuse, HPA-858 boss routes/DoraEmon nerfs, HPA-771 achievements, art/SFX, auth/profile, new ending art, generic story state management, backward-compatibility shims and new testing infrastructure.
