# HPA-766 — BR Another: four pairs, then four bosses — design

**Status:** planning only; implementation, tests and verification belong to this same draft PR.
**Linear:** https://linear.app/cwchanap/issue/HPA-766/rework-br-anothers-last-stages-four-pairs-then-four-bosses
**Prerequisites:** HPA-765 and HPA-767 are merged to `main` (PRs #17 and #14). HPA-768 has its own work.
**Delivery:** one PR for design, implementation and end-to-end verification; no art/SFX work.
**Mockup:** none in HPA-766; this changes battle composition, not UI.

## Player-facing result

B.R. ANOTHER for a regular fighter becomes three stages, with their established partner as the ally in each:

| Stage | Arena | Opponents | Ally |
| --- | --- | --- | --- |
| 1 | Sakura Street (`sakura`) | Three regular pairs | The current fighter's partner, entering on low 1P life |
| 2 | Sakura Night (`sakuranight`) | Up to four pairs: SWW + GIGI, MASA + 3-TIMES, YINAN + AYA, OGI + ZIRO | Same partner, same entry rule |
| 3 | Depends on last boss | ZENKA, ALPHA, SHIN-Z and DoraEmon, in a fighter-seeded order | Same partner, same entry rule |

Stage 1 is unchanged for other fighters. MASA, 3-TIMES, Z-MEGA and RARIO instead replace their **two small two-pair fights** with one normal Sakura Street stage 1, drawing three pairs from the 12 regular pairs (the 15 fixed pairs other than SWW/GIGI, MASA/3-TIMES and OGI/ZIRO). RARIO's separate post-finale DoraEmon battle is removed: DoraEmon now appears in stage 3. Preserve any meaningful ordinary ending demo; inspect RARIO demos 91 and 92 before removing their obsolete tail.

In stage 2, the player's pair (for SWW, GIGI, MASA, 3-TIMES, YINAN, AYA, OGI and ZIRO) is **not an enemy pair**; there are three opponent pairs and that same partner is the ally. Z-MEGA and RARIO are allied with each other and face all four pairs. Members of each opponent pair are friendly with each other, hostile to 1P and all *other* pairs. Partner/1P remain friendly.

In stage 3, all four bosses are individually hostile to 1P **and one another**. The first is present at battle start; each subsequent one enters when the preceding boss falls below the inherited source life threshold, allowing a short overlap. The last boss in the seeded order selects the arena:

| Last boss | Arena key |
| --- | --- |
| ZENKA | `boss` (Boss Base) |
| ALPHA | `office2` (ZM Office T2) |
| SHIN-Z | `brboss` (BR Boss Base) |
| DoraEmon | `streetnight` (Street Night) |

All four must be defeated to win; 1P's KO loses and uses the existing Continue flow. **Do not change** DoraEmon's EN charge or KO RELOAD in this ticket; HPA-858 changes those rules later.

## Architecture: small authored route-tail replacement

The exported `CHARACTERS[who].scenario` / generated JSON stays byte-for-byte source-derived. In `src/game/story.ts`, reuse the existing `Story.startOnRoute('br-another')` and `next()` interpreter to resolve the fighter's *actual* route entry from the native Chii take. Do not hard-code one BR entry index for every fighter or create a second jump interpreter. Keep an optional **per-Story active step array** for this BR Another run; other modes, direct-start stories, and `scenarioOf(who)` use the unchanged source array. `next()` and `retry()` read the active steps, so Continue still replays exactly the battle it lost.

Build an authored replacement **suffix beginning at the resolved BR Another route entry**. Source steps before that point (and therefore STORY Easy/Hard and BR ZERO branches) are unchanged; their jump indices never shift. Preserve the initial BR demo, regular fighters' existing stage 1, the relevant transition demos and existing ending, but replace the finale with stage 2 then stage 3; for the four folded fighters, replace the two small first fights with the new stage 1. RARIO's former separate DoraEmon tail does not remain reachable. Verify generated source layouts for each route family before finalizing the precise demo sequence: generated JSON is produced by `bun run assets` and is not tracked in Git. Reject an unknown route shape with a helpful test failure rather than silently patching the wrong sequence.

A new pure module, `src/game/br-another.ts`, owns fixed pair/boss lists, seed/shuffle, and the `Battle` / `Slot` construction and BR suffix assembly. `story.ts` is only the small integration point; `Match` continues to interpret normal `Battle` data. There is no new scenario interpreter, runtime scheduler, route service, save format, backend or general-purpose battle framework.

## Lineup and battle data contracts

- Use `ROSTER` indices for the fixed pairs and boss IDs. The stage-2 special pairs are three of the 15 original fixed pairs plus YINAN/AYA; all other 12 fixed pairs form the stage-1 draw pool. Only the eight named stage-2 fighters omit their own special pair.
- Use one deterministic, cheap fighter-derived seed (e.g. the stable roster index) and a seeded Fisher–Yates shuffle. Keep both members of a pair adjacent. The pair order and boss order stay constant for a given fighter and vary across fighters; collisions among the 24 boss permutations are expected. Do not reshuffle on retry or every new run.
- Reuse the source BR Another battle header values and slot patterns for rounds, Continue flag, time/lettering/KO rules, CPU levels, coordinates, wait-entry flags, watched-seat threshold and ally timing. New slots get authored masks; do not invent another combat rule or per-fighter CPU configuration.
- The 1P is seat 0; the other nine seats at most are ally plus eight enemies. Source seat hostility is a 32-bit per-seat bit mask, which covers ten seats. Set symmetric friend/foe relationships for both members of a pair, player, partner and other pairs. Stage 3 has ally plus four bosses, all bosses mutually hostile.
- The source slot's entry rule `(flags >> 1) & 3 === 2` watches `watch` until life is below `below`; preserve this behavior for ally arrival and boss succession. Use `0x200` for the ally flag. Existing cheat-aware `lifeMark` handles scaled thresholds.
- Expand only genuine eight-seat assumptions in `src/game/match.ts` (notably the default `held` palette array) to ten; `seat()`, `storyFighters()`, palette ownership, CPU creation, `rival` selection and HUD must remain correct at the maximum. Do not alter ordinary VS/TEAM VS or unused seat-reuse behavior; seat reuse is HPA-770.
- Keep the current story brawl survival result, `downed` handling of revived hostiles, Continue and story HUD. The HUD shows 1P plus the current rival, not ten simultaneous bars; check its layout and palette assignment with ten entrants.

## Boundaries and verification intent

The change is **B.R. ANOTHER only**. STORY routes, BR ZERO, mode-select UI, cheat settings, achievements, profile, new end demos, art/SFX and boss-as-player BR Another remain untouched. HPA-770 and HPA-858 consume the authored lineup/ten-seat groundwork afterward; do not implement their mechanics now.

Unit and integration coverage must prove all eligible fighters' BR Another routes, stage 1 for the four folded fighters, stage-2 own-pair exclusions, pair friendship/other-pair hostility, four boss succession and last-boss arena, fixed per-fighter seeding, RARIO tail removal, survival/Continue/retry, palette handling at ten seats, and unchanged STORY/BR ZERO fixtures. Confirm DoraEmon's current revive remains valid.

End-to-end coverage is browser-level gameplay from SINGLE through B.R. ANOTHER into Sakura Street, Sakura Night and the boss stage. No HPA-766 UI mockup exists: use visual snapshots of existing arena/HUD/ally/rival during the ten-seat stage to catch rendering regressions; do not invent a new screen. Target macOS Chromium, Windows Edge and iOS Safari/WebKit with automated keyboard or touch flows; record emulated-versus-device coverage accurately. Android and Linux rely on CI only. No human sign-off is an acceptance criterion.
