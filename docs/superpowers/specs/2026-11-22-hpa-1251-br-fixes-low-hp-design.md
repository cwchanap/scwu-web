# HPA-1251 — B.R. balance, LONG, no-revive and shared Low HP — design specification

**Linear:** https://linear.app/cwchanap/issue/HPA-1251/implement-remaining-br-fixes-balanced-stages-demos-no-revive-and-br  
**Design record / approved lineup tables:** https://linear.app/cwchanap/issue/HPA-1035/br-fixes-after-hpa-766-even-stage-draws-six-fighter-stage-2-loading (especially §7, owner-approved 2026-11-16).  
**Git baseline:** cwchanap/scwu-web main, 67c527ed0b0fbe9743caa95b28ba20276b509d1f (2026-11-22; HPA-972 merged).  
**Delivery:** One draft PR for HPA-1251. This document and its paired plan are the first commit(s); implementation, tests, evidence and visual verification are added to **the same PR**. No gameplay changes or checks are claimed yet.

## Scope and boundaries

Implement the remaining HPA-1035 design as transferred to HPA-1251: deterministic balanced B.R. ANOTHER (34 ordinary fighters), correct demos and six-enemy stage 2; B.R.-only permanent KO; and a B.R. LONG route (34 ordinary + four boss players) with approved 12-enemy lists. Also extend **Low HP line** and **Damage cut ×** from 1P to every fighter when Cheat Mode is enabled, and display each visible fighter's actual threshold/state and effective damage-cut percentage consistently.

**Art stays separate:** HPA-1034 is the sole B.R. LONG sign-lettering task. Its output is required for the final sign; keep this PR's code, documentation and tests separate from image generation. Final LONG visual acceptance is gated on its delivery, but B.R. ANOTHER, no-revive and Low HP work are independently implementable.

**Not in scope:** HPA-1148 stage-3 extras; B.R. CHAOS gameplay or an advance implementation of CHAOS random draws; new fighter art/SFX; backend, storage or database changes; generalized combat rules engines; compatibility layers; changes to B.R. ZERO's fixed opponents; modifications to non-B.R. revival. Do not commit extracted source assets or generated packs.

## 1. Approved lineup data, no runtime solver

Convert the **exact** approved markdown rows in HPA-1035 §7 mechanically into one typed static table (`src/game/br-lineups.ts`): 34 ordinary records with ordered ANOTHER stage-1 and stage-2 pairs, four ordered stage-3 bosses and ordered LONG pairs, plus four bosses' LONG pairs. Use the names in `src/instructions/fighters.ts` to map `ANMC P`, `OS FENG`, `3-TIMES`, `DoraEmon`, etc., to `Who` and then to ROSTER seats; validate all names and exact roster coverage at load/build time. A one-off converter is fine; do **not** hand-type the whole table twice or create a runtime balance solver. A+B preserves the entering-first member and pair adjacency. Boss B.R. ANOTHER keeps HPA-858's deterministic seeded builder.

The canonical rows must match these aggregate invariants as well as their exact values:
- ANOTHER stage 1: 34 distinct rows, three pairs from the twelve regular pairs, never the player's own pair. Each pair appears 8–9 times overall and 2–3 times in each position; all 72 pair/leader/position combinations occur, 42 once and 30 twice; no shared pair *set*.
- ANOTHER stage 2: exactly three pairs / six opponents drawn from four extra pairs. The eight fighters belonging to those pairs exclude their own; the other 26 use the approved omission. GIGI+SWW and OGI+ZIRO appear 26 times, MASA+3-TIMES and YINAN+AYA 25 times, each pair 8–9 per slot. Ten pair orders repeat with opposite member leaders throughout; all 24 pair/leader/slot combinations occur four or five times.
- ANOTHER stage 3: four bosses in all 24 possible permutations; ten orders repeat, never for the two members of one pair. Each boss appears 8–9 times per slot; last-boss arena distribution is ZENKA 8, ALPHA 9, SHIN-Z 8, DoraEmon 9.
- LONG: 38 distinct rows of six ordered pairs / 12 opponents from the sixteen-pair pool (twelve regular + four extra). Exclude a standard fighter's own pair, exclude none for bosses. Pair frequency 14–15 total and 2–3 per slot; all 192 pair/leader/slot combinations occur, 156 once and 36 twice; no shared pair set.

Tests iterate **all** rows and compare the constructed Story/Battle enemy/boss orders to the canonical data (table-driven exact-lineup behavior), assert all distribution/exclusion constraints and assert a few independent explicit rows, e.g. RYUKO. Do not duplicate 1,000 source names as a second expected fixture.

## 2. B.R. ANOTHER stage and demo flow

Reuse src/game/br-another.ts, Story, Battle and Slot. Preserve source story branch decisions, per-fighter header/ally data, opening arena, entry/watch behavior, existing source ending and Continue semantics. Generate stage 1 for all 34 standard fighters (currently only the four FOLDED fighters have a generated stage 1), with their original stage-1 intro; replace the current stage-2 eight-fighter seating with the approved six; and use the approved boss order for stage 3, still choosing arena by the final boss.

**Demo 5: SEEDED PLAYERS** runs directly before stage 2. **Demo 7: NEXT CHALLENGER** runs directly before stage 3. Preserve existing stage-1 intro and finale. Remap the folded splice and normal/twins/RARIO conditional jumps carefully; test both source-style and folded paths and retry/Continue.

## 3. B.R. LONG on existing route and match models

Normal players see ZERO, ANOTHER and LONG under B.R. Bosses ZENKA, ALPHA, SHIN-Z and DoraEmon keep native STORY, but B.R. opens **ANOTHER / LONG** (no ZERO). Extend existing ModeSelect: compute its boards from `(who, mode)`, save the **route value**, then resolve that value to an index in the currently offered boards (fallback first) so switching regular ⇄ boss never produces an out-of-range selection or the wrong route. Position/scale signs from **board count** with a fit cap and nonoverlap assertions for two, three and the future four-sign layout; do not implement CHAOS now. Preserve key/pointer navigation, hit areas, cursor, back/Escape, tap cooldown and loading cancellation.

Build one `br-long` generated route from `assemble` in `br-another.ts`, next to the existing builder: twelve enemies from six approved ordered pairs on Sakura Street, then `{type:4}`, no demos and no fabricated Chii-sign TAKE. All enemies' hostility masks and watches come from `assemble`. The first arrives at start; each later entrant watches its immediate predecessor's **native `Slot.below` threshold through `lifeMark`** (the established `desperationOf` pacing), **not** the Cheat Mode Low HP line. Thus a 0% cheat line never stalls entry. Pair members are friendly to each other, outsiders are hostile. Require all 12 hostile KOs for victory (title after win); 1P KO takes normal Continue; retry uses the same approved row.

A standard player gets DoraEmon as the **sole first-tick ally**, using an existing immediate-entry donor slot such as `roles.slots[0]` with the 0x200 ally flag; test the first-tick/palette/hostility behavior. This makes **14** native logical combatants. Boss players have **no ally**, **13** native combatants, and all twelve opponents use existing `Slot.tough` (2× HP, 500 max EN, 2× positive gain); standard enemies stay native. HPA-972 B.R. no-partner cheat still omits Dora without corrupting watches. MAX_FIGHTERS=10 is the *summon* cap, not a native story cap. The 32-bit hostility masks can hold these seats; existing palettes may repeat past eight by design. Do not build seat pooling unless a failing Match/renderer test proves an actual defect.

`Story.route` and `Story.br` must carry `br-long`. **Crucial scene integration:** `scene.ts` currently preserves only `boss-br` when it constructs Story. Pass `br-long` (and `boss-br`) to `new Story(who, route)`; call `startOnRoute` **only for native SignRoute selections**. Test the actual ModeSelect → scene → Story → Match path, including `Story.br === true`, or the new route silently drops the no-revive and no-partner flags.

For an interim LONG sign, reuse PAC-HELO's existing **blank 8004** board (move it into `SIGNS` in `scripts/export_assets.py` so the mode-select pack owns it); no throwaway Phaser text renderer. HPA-1034 separately supplies final lettering; then composite that art onto a green recolor of the original blank PAC-HELO board, following the existing export-composite precedent, and swap the exported sign image ID. Do not check in extracted or generated art. The blank is sufficient for routing tests but **not** final visual acceptance.

## 4. No revival in any B.R. battle

Use the route's existing `Story.br → Match.story` boolean, extended with `br-long`. Explicitly include ZERO, ANOTHER and boss-br; CHAOS remains a separate ticket and must be **added to the allow-list** when it lands (not inherited automatically today). Preserve the HPA-858 non-B.R. player-Dora rule and EN restriction.

Reuse existing HPA-973 gates: `koRecovery` and `koDownGetUp` already return early for `this.br`. Do not reimplement them. Address the remaining revival paths at two choke points:
1. **KO action entry:** broaden `koReloadBlocked` for B.R. on all Dora KO RELOAD entries while retaining its normal player-controlled Dora behavior. In `enterPending`, suppress ALPHA's KO Boss revive branch (global-10 / PC 1029) for B.R. but preserve its normal KO. Verify the ZAKU/PAC-HELO B.R. ZERO variable-11 path does not bypass these guards.
2. **Post-KO life restoration:** use one Match-level wrapper around the existing `gainLife` helper at its callers; skip the gain when `this.br && f.downed`, covering KO awards and scripted self/other-life including ALPHA's 450/449. Avoid distributing independent guards among every callsite.

A fighter eliminated in B.R. cannot stand, move or resume combat because of a scripted jump or positive life; the existing sticky `downed` flag alone only affects scoring. Keep ordinary hit recovery, waiting enemy entry and all non-B.R. revivals unchanged. Include the existing `team.test.ts` B.R. stage-3 Dora expectation in regression updates, since it currently expects KO RELOAD.

## 5. Cheat Mode Low HP: reuse the existing combat formulas

Current main gates `Match.idleLifeLine`, `lifeLineMark` and `lossKeptPercent` on fighter 0. When `cheats.enabled`, remove the 1P-only restriction in those three methods for **every fighter** (player, ally, enemy, boss, summoned entrant); keep native behavior with cheats disabled. Continue using each fighter's *effective maxHp* and the existing single-truncation threshold formula. At/below this line counts as Low HP **even if** Damage cut × is zero.

A fighter's native incoming reduction is `100 - CHARACTERS[who].scale`; with cheats enabled, effective cut is `clamp(nativeCut * damageCutMultiplier, 0, 100)` and damage kept is `100 - effectiveCut`. Preserve existing whole-point loss floor unless kept damage is zero. Expose existing mark and kept-percent calculations (or a tiny read-only accessor composed from them) to the renderers; **do not duplicate** the reduction formula in Phaser. Label low HP `Damage cut: NN%` using the actual clamped combat reduction; 0% and 100% must agree with combat.

Split the script-super check: the owning fighter's verified Low HP threshold follows the configured line, but the **Low-HP supers at any HP** *bypass* stays 1P-only. Do not alter unrelated script life gates. Rename menu group `Low HP · 1P` and the first two help descriptions to all-fighter language; keep the separate supers control expressly 1P-only.

## 6. HUD / visibility contract

Use `Match.lifeBars` as the sole authority for arena/optional bar visibility, with the existing 1P/rival HUD strips for those already shown. Draw a threshold marker, low-HP highlight and the actual `Damage cut: NN%` only on **already-visible** bars; test the combat boundary, modified effective max HP, late entrants, 0% and the 100% cap. Never reveal a normally hidden opponent bar, waiting/spectator fighter or KO'd fighter. With cheats disabled, keep the existing native HUD and bar behavior.

Reuse graphics sprites and a **small pooled Phaser `Text` per visible low-HP bar** for the new percentage; `scene.ts` currently draws digits as sprites, not existing Text objects. Keep the marker and text in canvas bounds at 960×720 and a narrow viewport; no new state subsystem or art assets.

## Automated acceptance design — bounded, reproducible

**Vitest (all game semantics):** table-driven exact construction for 34 ANOTHER / 38 LONG canonical rows; all aggregate fairness invariants, stable retry, demos/branch jumps, 12-entry watches, hostility, 14/13 native seats and palette behavior, boss `tough`, win/Continue/title, all B.R. no-revive cases alongside non-B.R. controls, and player/ally/enemy/boss/late-entrant Low HP mark/actual damage at 0/100% cut and effective maxHp. Add one focused `scene.test.ts` with `phaserStub` to assert the marker and percentage come from the same Match accessor and obey `lifeBars` visibility. **No browser debug/test-only gameplay API** for fast-forwarding full twelve-enemy fights.

**Reproducible browser E2E plus MCP acceptance:** extend `e2e/unconfigured/mode-select.spec.ts` and run it under `bun run e2e` in one Chromium platform; through keyboard **and** touch, reach a normal three-sign B.R. selection and boss two-sign selection, start LONG, assert no page errors and observe expected HUD/route start. Run/inspect this same browser flow through **MCP browser tools** as end-to-end acceptance; keep the Playwright assertions version-controlled. Entire multi-stage ANOTHER and all twelve LONG KOs are exercised deterministically in Vitest, **not** manually timed or driven via new production test hooks.

**Automated visual acceptance:** when the separately authored HPA-1034 sign is ready, fetch the HPA-1251/HPA-1035 attached HTML mockups afresh (their signed URLs expire), then capture real selector screenshots via MCP/browser at 960×720 and narrow viewport. Check proportions, board count/placement, cursor, dim/active state, sign color and clipping against the mockup **layout**, not a byte-for-byte pixel baseline or a committed image of copyrighted sign art. Existing screenshot-pixel probes can assert visible/selected boards and on-canvas clear bounds. Where no mockup exists (new Low HP presentation), capture a representative in-match low-HP screenshot and check label/marker placement, visibility and clipping with automated browser screenshot/layout assertions; role-specific boundary/damage cases remain in deterministic Match/scene tests. No human acceptance gate.

**Verification/records:** update `docs/evidence.md` and `docs/gameplay.md` with authored-vs-recovered provenance; run `bun run validate`, `bun run build` and `bun run e2e` in an environment with private handoff or R2 fixtures, plus the focused MCP browser acceptance. Record actual results; don't claim unrun tests or commit generated packs/screenshot artifacts. Single browser platform suffices; no native acceptance.

## Design trade-off

Favor a static typed table and thin route/Match extensions over runtime fairness solvers, generic rule engines or scene rewrites. One PR, isolated artwork dependency, deterministic tests and screenshot-based browser evidence keep this maintainable without overengineering.
