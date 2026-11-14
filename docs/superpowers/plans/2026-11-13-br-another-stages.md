# HPA-766 — BR Another three-stage rework — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-766/rework-br-anothers-last-stages-four-pairs-then-four-bosses
**Design:** `docs/superpowers/specs/2026-11-13-br-another-stages-design.md`
**Status:** planning only. Feature code and test execution have not started in this PR.
**Review:** incorporated PR #18 design review; shared-route, RARIO-tail and ten-seat palette issues are addressed in the plan.
**Delivery:** **one draft PR** for planning, implementation, documentation and verification. All work stays on this branch. No art/SFX task is needed.

## Current-code facts

- HPA-765/767 are merged. `src/game/story.ts` already interprets route selection via `Story.startOnRoute()`, `next()` and `retry()`. A per-Story step array is unnecessary: `scenarioOf()` already returns an authored static DoraEmon scenario.
- The reviewer traced generated scenarios for **all 34 eligible fighters**. BR Another has an exclusive step block but **not an exclusive suffix**: STORY and BR ZERO also reach later steps. Keep shared steps untouched.
- RARIO's `D25 → D91 → DoraEmon → D92 → end` at steps 50–54 is shared with STORY and BR ZERO. BR Another alone must bypass it.
- `Match.seat()`, `storyFighters()`, CPU creation and hostility mask conversion scale with slot count; `hud.ts` shows 1P and the current rival. The **real** ten-seat limit is `takePalette()`'s unbounded modulo-eight loop and the scene's eight-item `storyHeld = [...select.drawn]`. Both need fixing before new 9-slot battles are wired.
- The existing Playwright test `e2e/unconfigured/mode-select.spec.ts` already enters B.R. ANOTHER and checks the opening stage. CI currently runs Chromium on Ubuntu only, and the PR is draft, so CI does not validate this PR. Keep automated combat assertions in Vitest.

## Phase 0 — Pin source route reachability (small and early)

**Read/test:** `CHARACTERS[who].scenario`, `src/game/story.test.ts`, `docs/evidence.md`. Run `bun run assets` to inspect generated fixtures; do not commit them.

- [ ] Add a test identifying each eligible fighter's BR Another-only indices and their shared following steps. Pin families: **28 regular 62–66**, **YINAN/AYA 64–68**, **MASA/3-TIMES/Z-MEGA/RARIO 44–49**.
- [ ] From unmodified source data, record reachable battle/demo/ending steps for STORY Easy, STORY Hard, BR ZERO and BR Another; assert the BR patch changes only BR-only indices and appended steps, preserving the three other route graphs. Include both sides of conditional jumps in the reachability check, not only the happy path.
- [ ] Pin the RARIO source tail at steps 50–54 and its inbound STORY/BR ZERO jumps (32→50 and 43→50). Confirm no unrelated routes lose DoraEmon fights.
- [ ] Pin source template facts needed in tests: Ryuko's BR Another stage 1 at step 63; each fighter's last battle header, slot levels and `0x200` ally; stage keys and end demos. Rely on exporter hash-pinned inputs plus tests, **not** a runtime source-shape guard.

**Checkpoint:** Source reachability tests pass against unmodified runtime behavior. No gameplay code changed yet.

## Phase 1 — Fix ten-seat palette behavior **before** route wiring

**Modify:** `src/game/select.ts`, `src/game/match.ts`, their focused tests (including `src/game/team.test.ts`).

- [ ] Bound `takePalette`'s `(palette + 1) % 8` collision loop to **at most eight attempts**. Once all colors are taken, allow a duplicate rather than hanging. Preserve existing unique assignment for eight or fewer active seats.
- [ ] In the `Match` story-construction path, **extend incoming `held` to ten elements with `-1` in place**, before `storyFighters()` calls `takeSeat()`. Keep default `held` valid, but do not rely on changing its default alone. The scene must keep sharing the same array across stages.
- [ ] Add a synthetic story battle with **nine `Slot` entries** (1P + 9 others) and **an explicitly provided eight-entry `held`** matching the actual scene handoff. Verify that seating finishes, all palettes are numeric and 0–7, duplicates are allowed after exhaustion, and later battles retain their assigned palettes.
- [ ] Verify existing VS/TEAM VS and normal story palette regression tests are unchanged. Update `docs/evidence.md` at the documentation phase with the authored repeat-color exception.

**Checkpoint:** Focused `takePalette`, `Match.story` and `team.test.ts` tests pass, with no new BR route registered yet.

## Phase 2 — Pure seeded lineup builder

**Add:** `src/game/br-another.ts`, `src/game/br-another.test.ts`.

- [ ] Use fixed ROSTER pairs 0–29 (15 pairs). Special stage-2 pairs: **24/25, 28/29, 40/41, 26/27**. Stage-1 folded fighters draw three pairs from the other 12 fixed regular pairs. Stage-3 bosses: **30, 32, 33, 45**.
- [ ] Seed once from stable fighter roster index and use the engine `rand` helper (`src/game/standing.ts`) in Fisher–Yates. Shuffle whole pairs (members stay adjacent) and bosses, with the same result for the same fighter on retry. Unit-test determinism and that different fighters can produce different orders.
- [ ] Build stage 1 **only for MASA, 3-TIMES, Z-MEGA, RARIO**. Use **Ryuko's BR Another stage 1 (source step 63)** for enemy entry-slot pattern, `level`, `below` and three-pair structure; use the specific fighter's original BR finale ally and appropriate source battle header for fighter-specific parameters. Normal fighters retain their source stage 1.
- [ ] Build stage 2 on `sakuranight`, removing the pair containing `who` (if any) rather than maintaining an eight-fighter exclusion map. Z-MEGA and RARIO face all four. Preserve the source finale's ally `0x200` slot, watching 1P at its fighter-specific threshold.
- [ ] Build stage 3 with all four bosses, hostile to 1P and **each other**. The first starts in the arena; each subsequent boss watches the previous seat and enters below the source life mark. Arena derives from the last shuffled boss: `boss`, `office2`, `brboss`, or `streetnight`.
- [ ] **Rebuild all `Slot.enemies` bitmasks from the actual new seats**. Do not copy masks from old source battles (e.g. `0xef9`, `0xee7`, `0xedf`), which contain high bits that become live at ten seats and can turn pair-mates against each other. Check both directions for every friendliness/hostility relation.
- [ ] Reuse source battle header/slot data for level, rounds, score, Continue, delay, x, `flags` and thresholds. Keep `Match` and the story runner unaware of shuffle details. Do not implement seat reuse (HPA-770) or DoraEmon's skill change (HPA-858).

**Checkpoint:** `bunx vitest run src/game/br-another.test.ts` covers stage-1 pool, eight exclusions, two 10-seat cases, symmetric pair masks, boss permutations/arenas and no exported-data mutation.

## Phase 3 — Static, BR-only scenario patches; do **not** add Story state

**Modify:** `src/game/story.ts`, `src/game/story.test.ts`; use the Phase 2 builder.

- [ ] Build static, fighter-seeded authored scenario copies **once at module load** and return them through `scenarioOf(who)`. Preserve the existing `DORA_STORY` pattern. Do not change the fields or behavior of `Story` itself.
- [ ] For **28 regular fighters** overwrite only steps 62–66: retain D4, original stage 1 and D7; replace old last battle with stage 2; redirect old final jump into appended `stage 3 → jump back to original shared ending (60)`.
- [ ] For **YINAN/AYA** do the same at 64–68, with the original shared ending at 62. The appended jump uses `{ type: 3, condition: 0, value: 0, offset: target - current }`.
- [ ] For **MASA/3-TIMES/Z-MEGA**, rewrite 44–49 as `D4, new stage 1, D7, stage 2, stage 3, { type: 2, demo: 0 }`, falling through into the untouched existing shared ending.
- [ ] For **RARIO**, rewrite 44–49 similarly but use its last step to jump to appended `D25 → end`. **Never overwrite source steps 50–54** or remove their STORY/BR ZERO reachability.
- [ ] Append necessary overflow *after* the source scenario's last step, within `Story.next()`'s 0–99 bound, using the existing condition-0 jump. Keep source arrays untouched and no changes to STORY/BR ZERO data. Validate exact source steps/ending routes per Phase 0.
- [ ] Check normal `Story.next()` transitions, `Story.retry()` replaying the same lineups and that `startOnRoute('br-another')` still uses original native route jumps. All other routes must have their pre-patch behavior.

**Checkpoint:** `bunx vitest run src/game/story.test.ts src/game/br-another.test.ts`; all unchanged route reachability tests pass.

## Phase 4 — Integration regressions and documentation

**Modify:** `src/game/team.test.ts` and focused existing tests; `docs/gameplay.md`, `docs/evidence.md`.

- [ ] Instantiate stage 2 directly via `Match.story()`, including Z-MEGA/RARIO's player + ally + eight enemies with an eight-entry incoming palette array. Test friend/foe masks, entry and rival selection. Player's partner joins when HP falls; all bosses enter in seeded order on prior-boss low life; the result requires all hostiles downed.
- [ ] Test player KO → existing Continue → `Story.retry()` repeats exactly the same battle; stage-to-stage palette persistence; HPA-767 cheat-aware life thresholds; unchanged DoraEmon EN charge/KO RELOAD pending HPA-858.
- [ ] Assert folded stage 1 is a single three-pair battle; RARIO BR Another skips his DoraEmon tail while STORY and BR ZERO still reach it. Confirm unchanged VS, TEAM VS, STORY and BR ZERO fixtures.
- [ ] Document authored source divergence and the bounded palette duplicate fallback in `docs/evidence.md`. Update gameplay instructions and BR Another three-stage progression in `docs/gameplay.md`.
- [ ] Run `bun run validate`, `bun run build` and existing `bun run e2e`, recording executed results. Preview deployment on a draft PR is **not** evidence these commands passed.

**Checkpoint:** The new 3-stage rule and preserved non-BR routes are deterministically covered without playing 7–9 CPU enemies in a browser.

## Lean product-level end-to-end acceptance

**No new cross-browser full-battle matrix and no max-occupancy screenshot suite.** The existing Playwright B.R. ANOTHER route entry already reaches the opening brawl. Use the existing UI flow for a short platform smoke only; rely on `Story`/`Match` integration tests for stage 2, stage 3 and final outcomes. This preserves platform-level acceptance without new test infrastructure or flaky multi-minute combat automation.

- [ ] **macOS (Chromium):** existing automated SINGLE → fighter → B.R. MODE → B.R. ANOTHER smoke reaches first Sakura Street battle; confirm the existing HUD and arena render, mode navigation works, and no page errors occur.
- [ ] **Windows (Edge):** same brief automated game-entry smoke and rendering check; no additional route/match test harness or full three-stage browser playthrough.
- [ ] **iOS (Safari/WebKit):** touch-control smoke selects B.R. ANOTHER and reaches the first battle; check playable canvas/HUD in portrait and landscape with a simple visual inspection of the rendered UI (automated where available; do not claim physical Safari testing from WebKit emulation).
- [ ] **Gameplay behavior:** automated unit/integration tests establish all three stages, four boss-last arena variants, own-pair exclusions, partner wait, deterministic order, Continue/retry, ten-seat palette safety, untouched STORY/BR ZERO reachability and RARIO's bypass. These are the deterministic end-to-end gameplay-path assertions; do not drive a whole CPU tournament through browsers.
- [ ] **Visual check:** HPA-766 has **no Linear UI mockup** and makes no new screen. Verify that existing select/arena HUD still renders (health/EN bar, opponent identity, ally/rival palette) during the short smoke; do not add artificial max-seat snapshots.
- [ ] **CI-only:** Android and Linux receive CI coverage only; no separate platform acceptance or human sign-off.

## Ready-for-review definition

- [ ] This single HPA-766 PR contains the design, code, tests and evidence; no second PR for the ticket.
- [ ] Only BR-exclusive scenario indices and appended overflow are authored; shared endings, other routes, generated JSON and `Story` runner semantics remain unchanged.
- [ ] The ten-seat palette fix precedes any new nine-slot battle data, accepts duplicate colors only when all eight are occupied, and pads incoming held palettes in place.
- [ ] Keep all HPA-770, HPA-858, HPA-771 and HPA-772 work separate; no new assets/SFX, renderer, backend, state machine, migration or backward-compatibility support.
- [ ] Report actual validation commands and platform coverage, not assumed passes; retain PR as **draft** until implementation is verified.
