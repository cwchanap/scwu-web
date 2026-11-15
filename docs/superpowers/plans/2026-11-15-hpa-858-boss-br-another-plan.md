# HPA-858 — Boss B.R. ANOTHER — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-858/br-another-for-the-four-bosses-with-tougher-enemies  
**Design:** docs/superpowers/specs/2026-11-15-hpa-858-boss-br-another-design.md  
**Status:** Planning-only draft PR; implementation and tests have not been executed yet.  
**Delivery:** **One PR for HPA-858**: add implementation, focused tests and verification results to this same draft PR. No other PR is needed for this ticket. No art or SFX generation.

## Baseline and constraints

- HPA-765 (#17), HPA-766 (#18) and HPA-767 (#14) are merged. HPA-973 has separate open draft #19; HPA-1035's regular-fighter fairness and HPA-770's CHAOS remain separate.
- Current modules: src/game/select.ts (ModeSelect, ROSTER); src/game/scene.ts (screen flow, startBattle, begin); src/game/story.ts (scenarioOf, Story, route choice); src/game/br-another.ts (stage lineups/ally masks); src/game/match.ts (seat, storyFighters, effective HP/EN and charge/KO commands).
- Use current Match, Story, pure lineup construction and the existing HPA-765 boards; avoid a new engine, routed Svelte UI, generic gameplay-rule registry or new assets.
- Source/generated .PLAYER/.json and packed R2 assets are not hand-edited or committed. No backward-compatibility layer required.
- The HPA-858 original ticket wins over older notes: DoraEmon **retains KO RELOAD in BR** and loses it only when player-controlled outside BR.

## Phase 1 — Lock down route and boss selection with tests

**Read/change:** src/game/select.ts, src/game/story.ts, src/game/select.test.ts (or the nearest current screen/flow test), src/game/br-another.test.ts.

- [ ] Add table tests for the four boss roster entries (zenka, alpha, shinz, dora) and assert normal selectable fighters retain the original two-step mode and route menu.
- [ ] Add boss-mode UI tests for keyboard and touch/tap: first board offers STORY MODE and B.R. MODE, then directly produces boss-story vs BR Another without displaying a route board; Escape/cancel works and previous choice remains reasonable.
- [ ] Record current boss scenarioOf(who) and assert each boss selecting STORY MODE starts its exact existing story, including DoraEmon's authored story.
- [ ] Add a narrow Story input to play an explicit generated Step list for boss BR while default Story(who) still uses scenarioOf(who). Prove continue replay (retry) and win -> title.

**Checkpoint:** Boss mode choices can be represented without changing normal fighter routes or original boss stories.

## Phase 2 — Generate three ally-free boss BR battles

**Change:** src/game/br-another.ts, src/game/story.ts, src/game/br-another.test.ts, src/game/team.test.ts.

- [ ] Reuse one seeded pair shuffle using ROSTER.indexOf(who); use existing regular and extra pairs, boss IDs, arena mappings and low-life thresholds.
- [ ] Change the shared battle assembler minimally so ally is optional and hostility masks use the real number of seats. Keep paired allies neutral to one another and hostile to all outside their pair.
- [ ] Build boss stage 1 from three of 12 regular pairs at Sakura Street; stage 2 from three of four extra pairs at Sakura Night; stage 3 from the three bosses *other than the player*, using the last boss's arena.
- [ ] Set deterministic lead member and order with the existing seed logic. No boss's own fighter is an enemy. Do not introduce HPA-1035's full-roster balancing search.
- [ ] Use existing battle flags so a loss shows Continue, and a cleared route finishes at title. Emit exactly battle/battle/battle/end; no inter-stage demo or ally.
- [ ] Add deterministic tests for **all four bosses**: 6/6/3 opponents, no ally, pair makeup and cohesion, seeded stability, exclusions, stage keys/last-boss arena, correct entry/watch rules, symmetric hostility, win and Continue. Ensure no seat overflows.
- [ ] Keep the current 34 regular B.R. ANOTHER scenarios unchanged until HPA-1035; rerun their existing lineup and team tests.

**Checkpoint:** Pure-generated boss BR route runs through the existing Story and Match without a separate battle implementation.

## Phase 3 — Connect route context and stat tuning

**Change:** src/game/scene.ts, src/game/match.ts, possibly src/game/characters.ts only if necessary, and focused Match/scene tests.

- [ ] Extend CharacterSelect -> ModeSelect flow to include the four bosses. When the first board returns STORY, launch default Story(who). When it returns BR, launch generated boss steps directly with untouched native starting HP (no Chii routeLife subtraction).
- [ ] Carry a **small explicit BR-route/boss-route context** from scene to each new Match.story; clear it on title/new ordinary game. Avoid trying to infer BR from stage number or opponent roster.
- [ ] Apply x2 effective HP and five stocks of 100 EN to *regular enemy seats in boss BR stages 1 and 2 only*, before battle begins. Verify the original perStock for YINAN/AYA and any other outlier; preserve 500-EN semantics, stage-3 native bosses and player native stats.
- [ ] Apply x2 to **positive EN gains** on those same seats only. Centralize the award hook in the smallest viable place so HPA-972 can later reuse it. Prove drains/spends, negative adjustments, stock cost and other modes do not double.
- [ ] Retain the HPA-767 cheat snapshot's independent behavior and the game's cheated-run marker; boss-route tuning itself does not turn on cheats. Test with cheats enabled and disabled, plus native stage-3 stats.
- [ ] Keep a future-friendly distinction between route being BR and being the new tougher boss-specific BR. No generic buff engine or public API necessary.

**Checkpoint:** Only intended stage-1 and stage-2 enemies get 2x HP/500 EN/2x EN gain, independent of cheat activation.

## Phase 4 — DoraEmon's EN-charge and KO RELOAD rules

**Change:** narrow paths in src/game/match.ts (and src/game/scene.ts if route context enters there), src/game/dora.test.ts, src/game/team.test.ts.

- [ ] Identify the existing Dora EN charge entry (E command and source action 239/240+3) and gate only charge when player controls Dora, **or** the match is BR. Preserve EN from hits, kills and other scripts.
- [ ] In Dora's KO NORMAL to KO RELOAD (source action 72 then 74), suppress the three-stock revive only for player Dora *outside BR*; leave it on for player Dora in BR and for CPU Dora in BR as enemy/partner, matching ALPHA. Do not change other fighters or HPA-973's after-KO HP fix.
- [ ] Add a concise matrix of deterministic tests:
  - player Dora in practice, VS, TEAM VS and authored STORY: EN charge off, KO RELOAD off;
  - player Dora in B.R. ANOTHER: charge off, KO RELOAD on;
  - CPU Dora in B.R. ANOTHER (stage-3 boss): charge off, KO RELOAD on;
  - CPU Dora in ordinary non-BR: source behavior retained;
  - EN earned by non-charge sources, and ALPHA's revive, unaffected.
- [ ] Update src/game/team.test.ts's now-obsolete assertion that Dora's **charge** works as a stage-3 BR boss; keep its KO RELOAD assertion and all relevant brawl downed/result tests.
- [ ] Test reset/continue so Dora restrictions don't leak between matches.

**Checkpoint:** All route/control combinations match the latest HPA-858 owner decision, with no global EN suppression.

## Phase 5 — Documentation, checks and same-PR review

**Change:** docs/evidence.md, docs/gameplay.md and move list only if its current wording conflicts.

- [ ] Document the boss-specific generated route and tuned values as authored, including no ally, seeded selection and arena rule.
- [ ] Document Dora's charge and revive restrictions and update any existing "Dora story" prose that says otherwise; preserve source-vs-authored distinction.
- [ ] Update the draft PR body to summarize implementation, test evidence, visual checks and any unavailable platform runners; keep it draft until accepted for review.
- [ ] Run bun run validate, bun run build and bun run e2e on the available environment; include exact outcomes. If scripts/export_assets.py cannot run without private handoff, report it as **not run** rather than passing.
- [ ] Recheck the diff against HPA-858 and avoid incorporating HPA-1035, HPA-972 or HPA-973 implementation.

## Automated end-to-end acceptance criteria

The gameplay matrix above is verified by deterministic Vitest/Match tests. Product-level checks use the project's existing Playwright/browser facilities; **no human acceptance** and no new browser farm are required.

- [ ] **macOS / Chromium:** An automated browser test starts SINGLE, picks each of ZENKA, ALPHA, SHIN-Z and DoraEmon, sees the first STORY/B.R. board, selects B.R. and starts the new boss route without a second route board. Select STORY for a representative boss and verify it starts the original story. Assert the HUD and arena respond and no page errors occur.
- [ ] **Windows / Edge:** When an existing runner is available, automate boss selection, direct B.R. entry, a match start and visible HUD/canvas. Capture a screenshot and assert navigation/board appearance. If unavailable, record **not run (runner unavailable)**; do not introduce new infrastructure.
- [ ] **iOS / Safari or WebKit:** When an existing simulator/device runner exists, use touch to choose a boss, tap B.R. directly, enter the arena, and verify the board fits portrait and landscape and no route-step confusion. Clearly distinguish actual iOS Safari from desktop WebKit emulation. Record unavailable runs honestly.
- [ ] **Visual/mockup:** Compare automated snapshots of the first-step sign boards, dimmed selection background, active sign and cursor with the established **HPA-765 Linear mode-select mockup**. Verify original assets remain intact. HPA-858 introduces no new mockup, sign, layout or art; no additional screen redesign is allowed.
- [ ] **Regression:** Existing normal-fighter two-stage choice, boss STORY path, 34 normal B.R. ANOTHER routes, menu/cheats, Continue and KO result transitions still function under current CI/e2e tests.
- [ ] **CI only:** Android/Linux covered by the existing CI workflow, not separate end-to-end acceptance.

## Ready-for-review definition

- [ ] All four bosses have first-step STORY/B.R. choice, no extra route step; original boss stories unchanged.
- [ ] Boss BR has precisely three no-ally stages, 6/6/3 opponents, native continue/title behavior and deterministic fair-enough seeded pair choice; last boss chooses arena.
- [ ] Only regular enemies of boss stages 1/2 get x2 HP, 500 EN and x2 positive EN gain; boss player and stage-3 bosses remain native and normal runs are unaffected.
- [ ] Dora player cannot charge EN in any mode and cannot KO RELOAD outside BR; Dora in any BR seat keeps KO RELOAD but cannot charge; no other move/KO path regresses.
- [ ] Documentation, deterministic tests and available automated product/visual checks are in **this one PR**; exact test statuses are recorded without claiming unavailable checks passed.
