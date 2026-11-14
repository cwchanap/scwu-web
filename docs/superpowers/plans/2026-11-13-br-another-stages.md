# HPA-766 — BR Another three-stage rework — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-766/rework-br-anothers-last-stages-four-pairs-then-four-bosses
**Design:** `docs/superpowers/specs/2026-11-13-br-another-stages-design.md`
**Status:** planning only; no feature code or acceptance tests have been run by this planning PR.
**Delivery:** **one draft PR** for design, implementation and verification. Continue on this branch; do not open a second PR for HPA-766. No new art or SFX.

## Confirmed current-code starting point

- PR #17 (HPA-765) and PR #14 (HPA-767) are merged to `main`.
- `src/game/story.ts`: `scenarioOf()` returns source-derived steps, `Story.startOnRoute()` uses the existing Chii take/jumps, and `next()`/`retry()` advance/replay them. There is currently no BR Another override.
- `src/game/scene.ts`: selecting a route creates a `Story` and calls `runStory(story.startOnRoute(route))`; subsequent demos, battles, Continue and end flow already use `next()`/`retry()`. The code hands battle data to `Match.story()` with the held palettes and globals.
- `src/game/match.ts`: `seat()` and `storyFighters()` are dynamic in `battle.slots`, but constructor `held = Array<number>(8).fill(-1)` is eight-seat-specific; `enemies` are per-seat bit masks. `arrive()` watches a seat's life threshold, already cheat-scaled. `storyResult()` recognizes multi-hostile brawls and KO'd/reviving enemies.
- `src/game/hud.ts`: the 2P side displays `match.rival` rather than one health bar per opponent; no new HUD component is required.
- `src/game/story.test.ts` checks route-entry families (Ryuko 4/21/47/62, YINAN/AYA 6/23/49/64, folded fighters 4/17/33/44); `src/game/team.test.ts` tests story-seat palettes, waiting entry, brawls and HUD.
- Generated `src/game/generated/*.json` are **not tracked** in Git. Run `bun run assets` to inspect the actual scenario data; never commit those generated outputs.

## Phase 0 — Inspect and pin the BR Another source suffixes

**Read / test:** `src/game/story.ts`, generated scenarios after `bun run assets`, `src/game/story.test.ts`, `docs/evidence.md`.

- [ ] From each eligible fighter, resolve BR Another via `Story.startOnRoute('br-another')` rather than assuming the same step index. Traverse that route's source steps and log fixture sequences of demos, stage keys, battles and end.
- [ ] Confirm normal fighters have the existing three-pair stage 1 and six-opponent finale; confirm MASA/3-TIMES/Z-MEGA/RARIO have the two smaller fights to fold. Inspect RARIO demos 91/92 and its extra DoraEmon fight, retaining only the intended non-obsolete ending.
- [ ] Identify the original last-battle slots' level, entry `flags`, `watch`, `below`, x, ally position, battle header/Continue flag and ending demo. Establish source-shape assertions in tests so a wrong route/finale is not silently patched.
- [ ] Verify the BR Another suffix is the final branch and fits in `Story.next()`'s 0–99 step range after adding a third stage; preserve all earlier indices and jumps.

**Checkpoint:** A fixture-driven route test gives an understandable failure for any unexpected source layout, with no change to runtime behavior.

## Phase 1 — Pure, fighter-seeded lineup builder

**Add:** `src/game/br-another.ts`, `src/game/br-another.test.ts`.

- [ ] Define the 15 source regular pairs from `ROSTER` indices 0–29; special stage-2 pairs: SWW/GIGI (24/25), MASA/3-TIMES (28/29), YINAN/AYA (40/41), OGI/ZIRO (26/27); stage-3 bosses: ZENKA (30), ALPHA (32), SHIN-Z (33), DoraEmon (45). This leaves 12 regular pairs for folded fighters' stage 1.
- [ ] Use one tiny seeded Fisher–Yates helper (fighter seed from a stable `ROSTER` index; reuse existing `rand(seed)` if convenient). Shuffle **pairs** as units and bosses independently; preserve member order. Keep the returned order fixed across retry and run restart for the same fighter.
- [ ] Return three `Battle` definitions as needed: unchanged source stage 1 for normal fighters; a new three-pair Sakura Street stage 1 for folded fighters; stage 2 on Sakura Night with three or four special opponent pairs; and stage 3 with four sequentially waiting bosses, on the arena selected by the last shuffled boss.
- [ ] Build `Slot` flags, watch/threshold, level, x and battle headers by adapting the source BR Another templates. Ally joins on 1P low life. Enemy masks mean: pair-mates friendly; other pairs, 1P and ally hostile; bosses hostile to every other boss and player; only the player's partner is friendly. No new combat state or per-fighter data table.
- [ ] Keep source `scenario` arrays unchanged. Tests: all eight own-pair exclusion cases; Z-MEGA/RARIO four-pair cases and mutual ally; 3-of-12 folded stage-1 draw; no duplicate fighters or pair splitting; 10 total seats at maximum; all four possible boss-last arenas; fighter-stable order, different orders across fighters, source arrays not mutated.

**Checkpoint:** `bunx vitest run src/game/br-another.test.ts` passes after asset export.

## Phase 2 — Replace only the BR Another route tail

**Modify:** `src/game/story.ts`, `src/game/story.test.ts`. **Use:** the new pure builder.

- [ ] Keep `scenarioOf(who)` a faithful source accessor. Give `Story` an optional route-specific step array, used by existing `next()` and `retry()`. When `startOnRoute('br-another')` resolves its first step through the **existing** jump interpreter, derive the replacement suffix beginning at that step; do not shift earlier branches. Leave other selections/direct-start stories on source steps.
- [ ] Normal fighters: preserve the BR route's opening demo and existing stage 1; substitute four-pair stage 2 and four-boss stage 3 for the old last battle; preserve the regular ending. Folded fighters: collapse two small battles to one standard stage 1, then stage 2 and stage 3, without a stray intervening obsolete demo. RARIO gets no post-finale DoraEmon fight/demos after the intended final ending.
- [ ] Assert the original BR route tail shape before composing the authored one. Validate that all 34 mode-select-eligible fighters still enter a real battle/demo on BR Another; stage 1→2→3→ending, regular endings, Continue/retry and route-start indices remain coherent. Non-BR paths have their exact old steps/results.

**Checkpoint:** `bunx vitest run src/game/story.test.ts src/game/br-another.test.ts`.

## Phase 3 — Ten seats, hostility, entry and result regression

**Modify:** `src/game/match.ts`, `src/game/team.test.ts`; focused HUD/scene tests only where needed.

- [ ] Increase the default story palette-seat capacity from 8 to 10. Recheck `seat()`, `storyFighters()`, the CPU array, watched-seat indices, `held` allocations, `takePalette`, `rival` selection and mask conversions with player + ally + eight opponents. Avoid generic seat pools or reuse mechanics; HPA-770 owns seat reuse.
- [ ] Add integration tests in `Match.story()` verifying: stage-2 maximum 10 entrants, all pair friendships/hostilities, absent own pair, partner's low-life entrance, staggered boss entry, four bosses hostile to one another and survival win only once every hostile has fallen.
- [ ] Test 1P KO → existing Continue, `Story.retry()` → same seeded lineup, stage-to-stage palette persistence, normal CHEAT threshold scaling and DoraEmon's **current** KO RELOAD/EN charge behavior. Leave HPA-858's future suppression out.
- [ ] Ensure no regression for ordinary STORY, BR ZERO, VS, TEAM VS or non-BR story battles. Confirm existing two-bar story HUD still shows the correct active rival with ten seats; do not add ten health bars.

**Checkpoint:** `bunx vitest run src/game/team.test.ts src/game/story.test.ts src/game/br-another.test.ts`.

## Phase 4 — Documentation, browser E2E, validation

**Modify:** `docs/gameplay.md`, `docs/evidence.md`; extend the existing Playwright game-flow spec in `e2e/` instead of introducing a second harness.

- [ ] Record the four-pair/four-boss BR Another layout and source→authored divergence in gameplay/evidence docs. Explain that stage 1 for folded fighters and RARIO tail are intentionally authored, that seeded ordering is stable, and that DoraEmon retains his current skills until HPA-858.
- [ ] Add an automated SINGLE → eligible fighter → B.R. MODE → B.R. ANOTHER smoke flow. Exercise the three stage transitions and Continue (use the existing Cheats mode to shorten battles where practical). Assert the arena for stage 2 and stage 3, persistent ally, and valid terminal result/ending. Keep deterministic unit tests responsible for the full 34-fighter matrix rather than driving every one through a browser.
- [ ] Capture deterministic screenshots of Sakura Night with the maximum entrants and the boss stage with an active rival. There is **no Linear UI mockup** for HPA-766, so check against the current arcade HUD/rendering baseline, not an invented new layout.
- [ ] Run `bun run validate`, `bun run build` and `bun run e2e`, and record actual results in this draft PR. Do not mark those checkboxes passed before they have run. CI may not run on drafts; do not mistake preview deployment for test evidence.

## End-to-end acceptance criteria

- [ ] **macOS (Chromium):** automated keyboard flow selects a normal fighter and B.R. ANOTHER, reaches Sakura Street → Sakura Night → boss-dependent arena → result/title, with a Continue/retry case. Saved screenshots show normal HUD/partner/rival positioning and no ten-seat visual overlap.
- [ ] **Windows (Edge):** automated browser smoke reaches B.R. ANOTHER, advances into Sakura Night and boss stage, asserts the stage/character states, and verifies the existing HUD layout via screenshot. Keep the Windows matrix shorter than macOS.
- [ ] **iOS (Safari/WebKit):** automated touch/mobile flow uses the existing sign and controls to enter B.R. ANOTHER, reaches Sakura Night, and checks portrait/landscape HUD/canvas screenshots with no obscured or inaccessible controls. If using Playwright's iPhone WebKit profile rather than real device Safari, report this as emulated coverage, not physical-device validation.
- [ ] **Gameplay invariants:** folded fighters have one three-pair Sakura Street stage 1; stage 2 excludes each of eight named fighters' own pair and has all four pairs for Z-MEGA/RARIO; each stage has its ally; seeded order and stage-3 arena are reproducible; all four bosses can be defeated, 1P KO triggers Continue, and RARIO has no orphan DoraEmon tail. STORY Easy/Hard, BR ZERO, VS and TEAM VS behave as before.
- [ ] **Visual check:** no new UI mockup exists. Automated/saved visual snapshots confirm the source-like HUD, enemy face/name/stock display, stage art and palette rendering at the 10-seat maximum.
- [ ] **CI-only:** rely on CI for Android and Linux; no separate platform acceptance there. No human acceptance or manual sign-off requirement.

## Ready-for-review definition and scope guard

- [ ] All code, docs and tests above are in **this one HPA-766 PR**, with executed verification attached to its description.
- [ ] Source-generated JSON and original story branch steps are unmodified; any authored data lives in the small pure module and is documented.
- [ ] No new art/SFX, BR CHAOS sign, boss-as-player route, score/achievement/auth feature, new renderer, backend, generic state machine, save migration or backward-compatibility support.
- [ ] PR remains **draft** until the feature code and checks are complete; this initial docs commit is not an implementation claim.
