# HPA-1251 — B.R. balance, LONG, no-revive, all-fighter Low HP — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-1251/implement-remaining-br-fixes-balanced-stages-demos-no-revive-and-br  
**Design:** docs/superpowers/specs/2026-11-22-hpa-1251-br-fixes-low-hp-design.md  
**Source of approved lineup rows:** HPA-1035 §7 — https://linear.app/cwchanap/issue/HPA-1035/br-fixes-after-hpa-766-even-stage-draws-six-fighter-stage-2-loading  
**Baseline:** main 67c527ed0b0fbe9743caa95b28ba20276b509d1f, after HPA-972 merged.  
**Delivery rule:** **One draft PR for this ticket.** Implement, test, verify and update this same PR; no second implementation or follow-up “verification PR.” HPA-1034 is an existing, separate art ticket, not a sub-PR.  
**Status:** Planning only. No gameplay implementation, validation, MCP browser run or screenshot comparison has happened yet.

## Preflight and minimal architecture

HPA-1035 was closed as superseded (its #27 planning PR closed unmerged); HPA-1251 is Todo and assigned. HPA-1148 is downstream, HPA-1034 supplies the **separate** B.R. LONG lettering. HPA-972 is merged on main and defines the current cheat snapshot and the 10-fighter **summon** cap; unrelated #26 is art-tooling work. Reuse existing `br-another.ts` (`assemble` and seeded boss builder), `story.ts`, `select.ts`, `scene.ts`, `match.ts`, `cheats.ts`, `menu.ts`, `hud.ts`, the mode-select pack, and existing `e2e/unconfigured/mode-select.spec.ts`.

Architecture constraints: **one static lineup table**, no runtime solver, no extra `br-long.ts`, no generic mode framework, no backend or storage, no production-only E2E debug controls, no speculative seat pool. Use native Story/Match for full gameplay tests and existing browser signs/pixel probes for a short reusable visual smoke test. The PR remains the one implementation PR, including later artwork integration when HPA-1034 delivers its independent asset.

## Task 1 — Approved lineup table and ANOTHER stage construction

**Change:** new `src/game/br-lineups.ts`; `src/game/br-another.ts`, `src/game/br-another.test.ts`, `src/game/story.test.ts`.

- [ ] Mechanically convert the 34 ANOTHER stage-1/2/3 rows and 38 LONG rows in **HPA-1035 §7** into one typed data module, preserving every pair's leader and every ordered opponent. A throwaway converter is fine; map source display names to `Who` via `src/instructions/fighters.ts`, validate unknown names/roster gaps and discard the converter if not needed at runtime. No second hand-written table and no runtime fairness search; HPA-858 boss ANOTHER stays seeded as now.
- [ ] Use existing `assemble` for **all 34 standard ANOTHER stage-1 fights** and stages 2/3, preserving each source fighter's header, opening intro, ally and finale, with fresh `watch`/`below` from the actual predecessor. Stage 2 is **three extra pairs / six opponents**, stage 3 the approved four-boss sequence with arena chosen by the last boss.
- [ ] Change ANOTHER steps to **stage-1 intro → stage 1 → demo 5 SEEDED PLAYERS → stage 2 → demo 7 NEXT CHALLENGER → stage 3 → source finale**. Recalculate folded splice and source/twin/RARIO conditional jump offsets; preserve Continue, endings and boss ANOTHER.
- [ ] Table-driven tests: for **each** approved row, compare the constructed `Battle.slots` / Story progression to the **same canonical typed row** (no duplicate expected table); independently hard-code a few small representative rows, including RYUKO stage 1 G SUNEO+GIANT / LIZARD+KAY / ERUS+HISO; stage 2 OGI+ZIRO / GIGI+SWW / YINAN+AYA; stage 3 SHIN-Z, ALPHA, DoraEmon, ZENKA. Assert all §7 distinctness, frequency/slot, pair-leader/omission invariants, 24 boss orders, retry stability, folded/normal/twin/RARIO demo/ending jumps and arena selection.

**Checkpoint:** ANOTHER table, fights and story-jump unit tests pass, independent of HPA-1034 art.

## Task 2 — LONG battle and generated route

**Change:** `src/game/br-another.ts`, `src/game/story.ts`, `src/game/match.ts` only if tests expose a real limit; existing `br-another.test.ts`, Story and Match tests.

- [ ] Build the one-battle `br-long` route next to existing `assemble` using the six approved ordered pairs (twelve enemies) on Sakura Street, followed by `{type:4}`. No demos or fabricated Chii TAKE. Key the route's row by `Who` for all **34 ordinary and four boss** players; add it to `Route` and `Story.br`.
- [ ] First enemy present at start; later enemies use **native predecessor `Slot.below` through `lifeMark`**, not cheat `Low HP line`. Validate correct pair-leading arrival, friendship within pairs, enemies outside pairs, waiting slots, all 38 approved orders and aggregate §7 pair/leader frequency. Test 0% cheat line does **not** stall native arrivals.
- [ ] Ordinary player: build DoraEmon's **first-tick** ally from an immediate-entry donor slot (such as `roles.slots[0]`) with `0x200` flag, **14 native fighters** in all. Boss: no ally, **13 native fighters**, all twelve hostile slots use the **existing `Slot.tough`** 2× HP / max EN 500 / 2× positive gains. Include HPA-972 optional no-partner cheat, which must remove Dora without corrupting waits. Do not treat the `MAX_FIGHTERS=10` summon cap as the story cap; existing palette duplication beyond eight is intentional.
- [ ] Deterministic Story + Match tests: 12 KOs to win (never six), player KO → Continue, retry same lineup, winner → title, boss toughness, partner identity/presence and all 14/13 logical seats. Only implement a narrow seat/renderer repair if a failing test proves it necessary.

**Checkpoint:** LONG progresses through Story, Match and full result flow under Vitest with no sign art or production test hooks.

## Task 3 — Route selector, sign data and scene wiring

**Change:** `src/game/select.ts`, `src/game/scene.ts`, `src/game/story.ts`, `src/game/select.test.ts` and focused scene tests, `scripts/export_assets.py` (blank sign now and HPA-1034 composition later).

- [ ] Build board arrays from `routeBoards(who, mode)`: normal STORY two, normal B.R. **ZERO / ANOTHER / LONG three**, boss B.R. **ANOTHER / LONG two**; boss STORY retains direct native start. First step still STORY/B.R. two signs. Keep CHAOS out of this ticket.
- [ ] **Remember by Route value, not index.** Resolve saved route to an index in the offered list, falling back to first when unavailable; include a regular LONG → boss B.R. → regular ANOTHER selection regression. No two-board XOR navigation. Compute centre spots/scale from count with a fit cap and spacing for **2/3/4** signs, sharing one geometry function with draw/tap; assert active and dim boards remain on-canvas and non-overlapping, including a future fourth.
- [ ] Fix `scene.ts` Story constructor: it currently passes only `boss-br` and otherwise null. Pass generated `br-long` and `boss-br` straight into Story; **only** native SignRoute values call `startOnRoute`/`routeLife`. Test that the actual select → scene → new Story → Match path retains `br-long` and `Story.br === true` (including HPA-972 no-partner behavior), plus back/Escape/cancel, keyboard and touch.
- [ ] Use PAC-HELO's **already exported blank board 8004**, adding it to the `SIGNS` ownership set in `scripts/export_assets.py` so `mode-select` pack loads it, as the temporary LONG board. No throwaway procedural Phaser text. Once HPA-1034 supplies its lettering, compose a green original-blank sign at export, following existing authored-art composite precedent, and replace the image id. Never check in copied original art, generated packed assets or screenshot baselines. The blank allows functional E2E but does **not** satisfy final sign mockup visual acceptance.

**Checkpoint:** mode select and route-loading tests prove 2/3 choices, remembered-route switching and scene B.R. marker; final sign visual check waits for artwork.

## Task 4 — Strict battle-scoped no-revive

**Change:** `src/game/match.ts`, focused Dora/ALPHA/ZAKU/PAC-HELO/Story/Match tests and the existing B.R. stage-3 Dora expectation in `team.test.ts`.

- [ ] Confirm `Story.br` marks B.R. ZERO, normal ANOTHER, boss ANOTHER and LONG. **HPA-973 already gates** `koRecovery` and `koDownGetUp` on `this.br`: do not rework them. CHAOS requires an explicit Story.br addition under its later ticket (current getter is an allow-list).
- [ ] Extend the existing **`koReloadBlocked`** to block all Dora KO RELOAD entries under `this.br` while preserving player-controlled Dora outside B.R. In `enterPending`, suppress ALPHA's KO Boss revive jump (global 10) on B.R. KOs without altering its ordinary KO branch.
- [ ] Add a small **Match-level guarded gainLife wrapper** so positive scripted/KO-award life gains do nothing for `this.br && f.downed`, keeping the shared normal `gainLife` helper for non-B.R. This covers ALPHA's 450/449 and other scripted/bonus gains; test whether ZAKU/PAC-HELO's variable-11 B.R. ZERO get-up can bypass these two choke points and guard only if necessary. Sticky `downed` scoring alone is not a sufficient KO lock.
- [ ] Table-driven role tests for B.R. ZERO, normal/boss ANOTHER and ordinary/boss LONG: player, ally and enemy stay down after normal/script/bonus KO life gain; winner and next-entering slot unaffected. Pair with non-B.R. controls for CPU Dora, ALPHA, ZAKU/PAC-HELO and ordinary knockdown; retain HPA-858 player-Dora rule and EN restriction. Flip the current `team.test.ts` “keeps his KO RELOAD in a B.R. stage 3” assertion.

**Checkpoint:** no-revive Match tests and native non-B.R. regressions pass without duplicating already-gated recovery sites.

## Task 5 — All-fighter Low HP, combat-to-display consistency

**Change:** `src/game/match.ts`, `src/game/cheats.ts`, `src/menu.ts`, `src/game/hud.ts`, `src/game/scene.ts` and focused Match/HUD/Menu/scene tests.

- [ ] Remove fighter-0-only checks from the existing `idleLifeLine`, `lifeLineMark` and `lossKeptPercent` **when Cheat Mode is on**. All native/summoned fighters use their own effective maxHp and native base cut scaled by Damage cut ×, clamped to 0–100% reduction; preserve the single-truncation threshold, full-cut zero damage, and nonzero loss floor. Keep native behavior unchanged with Cheat Mode off.
- [ ] Split the `match.ts` verified super gate so the **owning fighter's threshold** uses the adjusted line, while the **Low-HP supers at any HP bypass stays 1P-only**. Do not change other script HP conditionals.
- [ ] Expose `Match.lifeLineMark` and `lossKeptPercent` (or one tiny read-only composer) for HUD use, computing `Damage cut: NN%` as 100 − damage-kept percent; **no duplicate Phaser math**. Match tests cover player, ally, hostile CPU, boss, late summon, effective HP multipliers, threshold boundary, native base-cut differences, 0× and 100% cap.
- [ ] Rename the “Low HP · 1P” group and first two help descriptions to **all fighters**, but label the separate supers bypass explicitly 1P-only.
- [ ] Only on **visible** 1P/rival HUD bars and `Match.lifeBars` arena bars, draw the threshold marker and low-HP highlight. Show actual `Damage cut: NN%` while below/at the mark, even at 0%, use a small pooled Phaser **Text** object per visible bar (the arena currently uses bitmap digit sprites, not Phaser Text). Respect late-entry, hidden enemy bars, dead/absent fighters, canvas bounds and natural HUD when cheats off.
- [ ] One focused `scene.test.ts` with `phaserStub` asserts displayed mark/percent equals the Match accessor and no otherwise-hidden bars are created; all fighter role/boundary permutations stay in deterministic Match tests.

**Checkpoint:** actual per-fighter retained damage and any visible Low HP indicator agree, without broad extra UI scaffolding.

## Task 6 — Documentation, bounded E2E and visual verification

**Change:** `docs/evidence.md`, `docs/gameplay.md`, existing `e2e/unconfigured/mode-select.spec.ts` and focused tests only.

- [ ] Record approved fixed-table balancing, ANOTHER demos, LONG masks/watches/toughness, B.R.-scoped no-revive, and shared Low HP/HUD values as **authored** changes, distinct from recovered game evidence.
- [ ] Run targeted Vitest first, then **`bun run validate`**, **`bun run build`** and **`bun run e2e`** with required private handoff/R2 fixtures; record command/results/blockers and never mark unavailable checks passed.
- [ ] Add **reproducible Playwright** keyboard+touch tests to the existing `e2e/unconfigured/mode-select.spec.ts`, reusing its screenshot brightness/pixel probes. Navigate normal three-sign and boss two-sign route steps to the beginning of a LONG match (including a regular → boss route-memory regression), assert right initial fighter/ally UI, selected/dim cursor, correct route, no JS errors and keyboard/touch controls. **Do not** add production battle fast-forward hooks or automate defeating all twelve enemies in a browser; full ANOTHER and LONG combat/results are already covered by Story+Match Vitest.
- [ ] **MCP browser E2E acceptance:** execute/inspect the same short real-app Chromium route journeys via MCP tools (one platform only) while the checked-in Playwright suite remains the CI-repeatable gate. Capture the **regular three-sign** and **boss two-sign** selection screenshots. With HPA-1034 final artwork, obtain fresh Linear HTML mockups from HPA-1251/HPA-1035 and compare composition, board count, proportions, cursor, active/dim state and clipping to those designs; do not require a brittle pixel-perfect reference or commit copyrighted sign screenshot baselines. Use canvas screenshot/pixel-layout checks at 960×720 and narrow viewport, with automatic assertions; **no human sign-off**.
- [ ] **Low HP visual check without a mockup:** capture one representative in-match low-HP screen through MCP and use automated screenshot/layout checks for threshold marker, readable percent, clipping and unchanged hidden-bar behavior; exhaustive roles, combat values and threshold crossings are asserted in Match/scene tests rather than requiring browser damage control. Keep screenshots ephemeral; remove `.playwright-mcp/` and transient outputs.
- [ ] Update **this same draft PR** with actual verification status and screenshot-test evidence. Final LONG visual acceptance is **blocked by HPA-1034 artwork**, independent of ANOTHER, no-revive and Low HP implementation. No native acceptance or separate verification PR.

**Checkpoint:** deterministic tests cover full game semantics, reusable Playwright/MCP smoke tests cover actual route UI and visual layout, and the final sign image passes mockup-based visual checks when independently delivered.

## End-to-end acceptance criteria (automated, one PR)

- [ ] All **34** normal ANOTHER and **38** LONG rows construct exact ordered Battle slots from the one approved HPA-1035 §7 table; all count, leader, omission and uniqueness invariants pass, and retry repeats the same data.
- [ ] ANOTHER stage 2 is six enemies and stage 3 four bosses with last-boss arena; demo 5/7 precede stages 2/3 on source/folded/twin/RARIO flows, ending and Continue tests pass.
- [ ] LONG has all twelve ordered native enemies, first-tick Dora ally for standards (14 seats), no ally and tough hostiles for bosses (13 seats); native-entry watches independent of Cheat Low HP, hostility, KO win, defeat/Continue and no-partner cheat pass.
- [ ] ModeSelect normal B.R. 3 signs/boss B.R. 2 signs (and count-aware 4-layout test), route saved by **value** across fighter changes, scene preserves `Story.br` for LONG, keyboard/touch selection and cancellation pass.
- [ ] Every B.R. KO stays down through blocked action/HP revive; HPA-973 existing gates remain and non-B.R. revive controls pass, including player-controlled Dora.
- [ ] Cheat-mode Low HP thresholds, base-reduction multiplier, effective-max scaling, at/above/below boundary and 0%/100% reductions pass for player, allies, enemies, bosses and late arrivals, with the 1P-only super bypass unchanged. The `scene.test.ts` marker/label uses Match values and respects `Match.lifeBars`.
- [ ] **MCP-driven Chromium E2E** reaches normal and boss LONG match starts via real keyboard/touch routing, with no page errors, alongside the repeatable `e2e/unconfigured/mode-select.spec.ts` tests. Full combat semantics are tested in deterministic Vitest, not through a production test API.
- [ ] **Automated screenshot visual checks** compare ordinary 3-sign and boss 2-sign layout to the fresh Linear HTML mockups (with **final HPA-1034 lettering**) and check a representative Low HP screen without a mockup at game/narrow sizes, including label and clipping; no pixel-perfect asset snapshot or manual acceptance.
- [ ] `docs/evidence.md` and `docs/gameplay.md` updated; `bun run validate`, `bun run build` and `bun run e2e` pass with results documented; no original/generated art, extra screenshots, test hooks or unrelated changes committed.

**Unmet dependency:** HPA-1034 remains an external, already-created art ticket. Code may be developed and reviewed before its delivery, but final LONG sign acceptance cannot be checked off beforehand.
