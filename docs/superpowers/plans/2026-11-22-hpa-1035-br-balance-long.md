# HPA-1035 — Balanced B.R. ANOTHER and B.R. LONG — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-1035/br-fixes-after-hpa-766-even-stage-draws-six-fighter-stage-2-loading  
**Design:** `docs/superpowers/specs/2026-11-22-hpa-1035-br-balance-long-design.md`  
**Starting baseline:** `main` `67c527ed0b0fbe9743caa95b28ba20276b509d1f` (2026-11-22).  
**Status:** Planning-only draft PR. No gameplay implementation or verification is claimed.  
**Delivery:** **One PR for HPA-1035**: add all implementation, unit/E2E tests, gameplay docs and recorded evidence to *this* PR. **Art stays in existing HPA-1034**; do not generate or commit the new sign image here.

## Preflight / minimal architecture

- HPA-765, HPA-766 and HPA-858 are already in `main`. HPA-1035 is still In Progress and **blocked by HPA-1034**. HPA-1148 follows, not part of this change. Existing open PRs in this repo are unrelated; no HPA-1035 PR was found.
- Start from current `src/game/br-another.ts` (`seededShuffle`, `assemble`, `brAnotherStages`, `bossBrAnotherStory`); `story.ts` (`SignRoute`, `Story.next`, `startOnRoute`); `select.ts` (`ModeSelect`, `ROUTE_BOARDS`); `scene.ts` (route dispatch, loading/Continue); `match.ts` (seat, KO, brawl win, tough and no-partner cheat); and `scripts/export_assets.py` (mode-select pack).
- The **approved 34+4 row table in Linear item 7** is the source of truth. Transcribe it once, test its invariants, and do **not** regenerate it with a random shuffle or introduce a combinatorial optimizer. Keep original assets and ignored generated files out of Git.
- Use the existing `br` flag for per-battle behavior; no global configuration, state manager, separate backend, or generic match rules engine. Implement only the needed seat-capacity fix if the 14-seat tests actually fail.
- When starting implementation, re-read `main` and merge/rebase as needed to account for any newly landed changes; keep the same PR.

## Phase 1 — Approved balance table and B.R. ANOTHER lineups

**Files:** `src/game/br-lineups.ts` (new static data), `src/game/br-another.ts`, `src/game/br-another.test.ts`, `src/game/story.test.ts`.

- [ ] Define a small typed `LINEUPS` map for the **34** normal fighters: three ordered stage-1 pairs, three ordered stage-2 pairs, four ordered stage-3 bosses, six ordered LONG pairs. Add four boss records with **LONG only**. Preserve every first/second pair order exactly as Linear item 7.
- [ ] Make `brAnotherStages(who)` consume the approved rows. Generate stage 1 for all 34; use each fighter's own source stage-1 donor header/ally/entry and keep the four folded fighters' special splice behavior. Use the existing finale donor for stages 2/3, preserving ally role, Continue flag, arena and native KO award behavior. Stage 2 has exactly 6 hostile fighters + the native ally; stage 3 has 4 bosses + that ally.
- [ ] Remove runtime shuffle from those **normal** approved stages; preserve HPA-858's separate four-boss B.R. ANOTHER route builder and seeded stage 1/2/3 behavior. Retain the previous source semantics for B.R. ZERO and non-B.R. STORY.
- [ ] Update `brAnotherStory` so the same intro still precedes stage 1, **SEEDED PLAYERS** immediately precedes stage 2, and **NEXT CHALLENGER** immediately precedes stage 3. Verify demo indices from source data and cover normal/folded/twins/RARIO branches, source end jump and Continue.
- [ ] Unit test all 34 lineups against the approved table and all invariants: stage 1 each pair 8/9 overall and 2/3 per position; stage 2 each extra pair 25/26 overall and 8/9 per position; stage 3 all 24 boss permutations with 10 repeats and 8/9 occurrences of each boss at every position. Verify pair-leader position counts, no own pair, stable identical order on retry, distinct stage-1 pair sets, stage-2 duplicate order inversion (opposite leaders), and unchanged original scenario objects.
- [ ] Specifically assert the approved RYUKO row: stage 1 G SUNEO→GIANT / LIZARD→KAY / ERUS→HISO; stage 2 OGI→ZIRO / GIGI→SWW / YINAN→AYA; stage 3 SHIN-Z, ALPHA, DoraEmon, ZENKA (arena by ZENKA). Avoid freezing unrelated implementation details in snapshots.

**Checkpoint:** Pure tables and B.R. ANOTHER story tests pass; no B.R. LONG feature or UI dependency is needed yet.

## Phase 2 — Generated B.R. LONG and Match semantics

**Files:** `src/game/br-another.ts` (or a focused `br-long.ts` only if it meaningfully reduces complexity), `src/game/story.ts`, `src/game/match.ts`, `src/game/br-another.test.ts`, `src/game/team.test.ts`.

- [ ] Use the approved **38** LONG rows to construct one Sakura Street battle with 12 queued enemies in six pairs. Normal fighters exclude their own pair and use **DoraEmon only**, marked `0x200` and entering on the first tick; boss fighters exclude none and use no ally.
- [ ] Reuse `assemble`'s role/header and hostility logic with optional ally and variable enemy count; derive symmetric hostility from true logical slots, preserving friendship within each pair and enmity across pairs. Each next hostile slot watches its predecessor and enters under that fighter's own low-HP mark; all 12 hostile KOs are required for victory.
- [ ] For the four boss LONG routes, reuse HPA-858's `Slot.tough` construction: all twelve enemies have 2× HP, Max EN 500, 2× positive gain, for every round. Normal LONG, boss players, and B.R. ANOTHER stage 3 remain native. No second difficulty system.
- [ ] Add `br-long` to `Route` with generated `[battle,{type:4}]` steps. Start via `Story.next()` (not `routeLife`/`TAKES`); `Story.br` must include it; `retry()` replays the same battle. Loss shows standard Continue, win returns to title.
- [ ] Test the 38 records' exact twelve-enemy orders; 16-pair pool, own-pair exclusion only for 34 normals, all 38 lineups unique, pair appearances 14/15 and 2/3 in each of six positions, all 192 pair+leader+position combinations used (36 twice), stable retry and no mutation.
- [ ] Match-test **14 normal** / **13 boss** logical fighters, ally present at start (normal) or entirely absent (boss), correct watch/below, hostility, palettes, HP/EN, KO winner/loser and Continue. Review `MAX_FIGHTERS = 10` carefully: it currently guards cheat **summons** and must not cap these authored story battles. If Match/renderer truly cannot handle the full logical lineup, add minimal defeated-seat reuse while preserving watch/hostility and progress; otherwise **do not** introduce reuse.
- [ ] Include a case with the HPA-972 “B.R. no partner” cheat enabled: its existing start-of-battle re-seat should omit DoraEmon without corrupting pending opponents or result counts. Keep cheat-off native behavior intact.

**Checkpoint:** LONG runs end-to-end through `Story` + `Match` without UI, across normal and boss players.

## Phase 3 — ModeSelect, scene routing and artwork integration

**Files:** `src/game/select.ts`, `src/game/scene.ts`, `src/game/story.ts`, `src/game/select.test.ts`, `src/game/scene.test.ts`, `scripts/export_assets.py`, `src/game/packs.ts` (only if needed), `e2e/unconfigured/mode-select.spec.ts`.

- [ ] Keep two first-step mode signs. Convert second-step board layout and navigation from exactly **two** to a small array-dependent count: now 3 for normal B.R. (ZERO, ANOTHER, LONG), 2 for normal STORY, **2 for boss B.R.** (ANOTHER, LONG). Keep touch hit targets, cursor, dim/active state, Escape and mode memory. Do not implement CHAOS; an eventual fourth entry should be a data addition.
- [ ] Change a boss's B.R. first-step confirm to open its B.R. route step instead of launching `boss-br` immediately. STORY keeps its direct/native start. Confirm boss B.R. ANOTHER still routes to the existing `boss-br` generated steps; B.R. LONG routes to `br-long`. A normal fighter's LONG also goes to `br-long` without a Chii take. Ensure Async load and Escape cancellation work on both steps.
- [ ] Use the supplied `art/signs/br-long.png` **after HPA-1034 delivers it**. Extend the existing asset exporter to composite lettering with the green-tinted original PAC-HELO blank board and include the derived result in the `mode-select` pack. Register the new sign for `ModeSelect` with the same load/unload conventions. Do not check in originals or generated packed files. Until art exists, a temporary procedural label may serve tests, but **visual acceptance remains blocked**.
- [ ] Assert button/directional selection on the 2/3-board screens, both boss routes, stage highlights, retained selection, tap-to-select, menu escape, cancellation during load, no broken ordinary STORY, no accidental B.R. ZERO/CHAOS boss sign, and no old two-option XOR assumptions.

**Checkpoint:** Real keyboard and pointer paths enter and leave both normal/boss LONG, with correct sign board count and no route-loading regressions.

## Phase 4 — No revivals across B.R. modes

**Files:** `src/game/match.ts`, `src/game/dora.test.ts`, `src/game/alpha.test.ts`, `src/game/team.test.ts`, `src/game/story.test.ts` and focused existing tests as appropriate.

- [ ] Carry `Story.br` through `scene.startBattle` into the existing `Match.story(..., br)`; include `br-zero`, `br-another`, `boss-br` and `br-long`, without a stage-number heuristic.
- [ ] Suppress actual **KO revival** transitions only when `br`: DoraEmon's stock KO RELOAD, ALPHA's revive, common KO get-up, ZAKU/PAC-HELO B.R. ZERO KO transitions if they restore HP/standing, and any other verified post-KO recovery branch. Preserve normal landing, hit reaction and round-intro transitions. A KO'd ally/enemy/1P must stay down even after scripted HP gain from a kill.
- [ ] Test B.R. ZERO, normal/boss ANOTHER and normal/boss LONG; different fighters and all three roles (player, ally, enemy), including Dora on stage 3 and as first-tick ally. Keep **non-B.R.** CPU Dora, ALPHA and common-get-up tests proving native revive remains available; preserve HPA-858's EN-charge restriction without extending it outside B.R.

**Checkpoint:** Every B.R. KO remains terminal for that fighter until the battle ends, without breaking round scoring or Continue.

## Phase 5 — Docs and automated end-to-end acceptance

**Files:** `docs/evidence.md`, `docs/gameplay.md`, `e2e/unconfigured/mode-select.spec.ts` and additional focused E2E only where needed.

- [ ] Record the static tables as approved **authored** design (link item 7), B.R. LONG opponents/ally/toughness, demos, selector behavior, route-scoped revival ban and any physically reused seat. Keep recovered-vs-authored evidence explicit. Update instructions/help only where they describe affected routes.
- [ ] Run targeted unit suites, then `bun run validate`, `bun run build` and `bun run e2e` on a workspace with the private handoff/R2 fixtures; record command, result and environment. These have **not** been run in this planning PR. If inputs are inaccessible, mark as not run instead of treating a static plan as verification.
- [ ] Use **MCP-driven Playwright** on **one Chromium browser platform** (no native acceptance). Navigate SINGLE → regular fighter → B.R. MODE → B.R. LONG using keyboard and touchscreen; verify the route step, active/dim cursor/panels, DoraEmon allied on battle start, 12 enemies' progression and win/loss flow using visible HUD plus test-accessible deterministic helpers.
- [ ] From a fresh page navigate SINGLE → ZENKA, ALPHA, SHIN-Z and DoraEmon → B.R. MODE → B.R. ANOTHER / LONG; verify **only two** boss route boards, each route starts, normal STORY still uses original path, tough enemy max HP/EN, Continue re-entry, and no page errors. Inspect the arena at 14 logical fighters for missing sprites, overflowing HUD or palette collisions.
- [ ] **Visual acceptance:** capture screenshots of normal 3-board LONG selection and boss 2-board route selection. Compare the rendered screenshots against HPA-1035's **Linear mockups** (“B.R. LONG sign step” and “Boss B.R. MODE step”), including original backdrop, sign lettering/color/scale, cursor, active/dim treatment, and no clipping at 960×720 and narrow viewport. Use screenshot pixel/visual assertions (reuse canvas probes); no human sign-off criterion. Do not complete this criterion before HPA-1034's final art is present.
- [ ] Verify stable demo order and no JS errors with Playwright screenshot/response assertions for normal and folded fighter branches. Clean up `.playwright-mcp/` and screenshots after recording results — do not commit test artifacts.
- [ ] Update this **same draft PR** with completed checks and actual evidence. No second HPA-1035 PR and no code/art mixed into HPA-1034.

## End-to-end acceptance checklist

- [ ] 34 standard routes reproduce their entire approved item-7 stage 1/2/3 orders, stable on retry; distribution/count tests exactly match all stated invariants.
- [ ] All 38 LONG lineups match item 7, and the 14/13-fighter Match tests prove pair hostility, correct ally timing, victory/KO/Continue, native-vs-tough stats and no revival.
- [ ] Normal B.R. route selector shows three signs, boss selector shows exactly B.R. ANOTHER and B.R. LONG, and keyboard+touch routes and Escape work.
- [ ] Correct demos run immediately ahead of stage 2 and stage 3 on every normal B.R. ANOTHER route, including special story jumps.
- [ ] **MCP Playwright E2E** verifies normal and boss LONG, boss ANOTHER, healthy HUD/results and absence of runtime errors in Chromium.
- [ ] **Visual screenshot checks** compare two route-selector views to the Linear mockups, at game size and narrow layout, with final HPA-1034 sign asset integrated.
- [ ] `bun run validate`, `bun run build` and `bun run e2e` pass in an environment with required data; `docs/evidence.md` and `docs/gameplay.md` are updated; temporary assets/screenshots remain uncommitted.

**Current verification:** Not run — documentation-only draft.
