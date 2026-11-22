# HPA-1251 — B.R. balance, LONG, no-revive, all-fighter Low HP — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-1251/implement-remaining-br-fixes-balanced-stages-demos-no-revive-and-br  
**Design:** docs/superpowers/specs/2026-11-22-hpa-1251-br-fixes-low-hp-design.md  
**Source of approved lineup rows:** HPA-1035 §7 — https://linear.app/cwchanap/issue/HPA-1035/br-fixes-after-hpa-766-even-stage-draws-six-fighter-stage-2-loading  
**Baseline:** main 67c527ed0b0fbe9743caa95b28ba20276b509d1f, after HPA-972 merged.  
**Delivery rule:** **One draft PR for this ticket.** Implement, test, verify and update this same PR; no second implementation or follow-up “verification PR.” HPA-1034 is an existing, separate art ticket, not a sub-PR.  
**Status:** Planning only. No gameplay implementation, validation, MCP browser run or screenshot comparison has happened yet.

## Preflight and minimal architecture

HPA-1035 was closed as superseded (its #27 planning PR closed unmerged); HPA-1251 is Todo and assigned. HPA-1148 is explicitly downstream. HPA-1034 supplies B.R. LONG lettering and blocks *final LONG art acceptance*, not ANOTHER/no-revive/Low HP engineering. HPA-972 is merged on main; its cheat snapshot and 10-fighter *summon* guard are the current baseline. Unrelated PR #26 is art-tooling work; no conflict expected in these gameplay files.

Reuse existing:
- src/game/br-another.ts: assemble, brAnotherStages, brAnotherStory, bossBrAnotherStory.
- src/game/story.ts: Battle, Slot, Route, Story.next/retry, Story.br.
- src/game/select.ts and src/game/scene.ts: ModeSelect, route dispatch, Continue, Phaser life bars.
- src/game/match.ts: deterministic 10 ms simulation, KO/entry, toughness, low-life and brawl settlement.
- src/game/cheats.ts, src/menu.ts, src/Menu.svelte, src/game/hud.ts: cheat model, settings text and life-bar presentation.
- scripts/export_assets.py and existing mode-select pack; e2e/ Playwright suites and Vitest.

No engine refactor, new backend, new persistence, fairness algorithm or art generation. Prefer narrow pure data and helpers; add seat reuse only if concrete 14/13-seat tests prove it necessary.

## Task 1 — Approved lineup table and ANOTHER stage construction

**Change:** new src/game/br-lineups.ts; src/game/br-another.ts; src/game/br-another.test.ts; src/game/story.test.ts.

- [ ] Transcribe all **34** approved stage 1/2/3 rows and all **38** LONG rows from HPA-1035 §7 verbatim into a typed table, keeping pair order and which member leads. Four bosses receive LONG only. Reject an unknown or missing fighter. Don't re-seed, shuffle or independently optimize this table.
- [ ] Cover 34 standard players in brAnotherStages, including 30 source-style and four folded branches. Preserve own-player source header/intro, arena, allies, hostility, watch and source finale. Stage 1 uses three regular pairs, stage 2 **three extra pairs / six enemies**, and stage 3 four bosses with last-boss arena. Do not change bossBrAnotherStory's separate existing route.
- [ ] Rebuild the ANOTHER story step sequence: keep stage-1 intro and original finale; insert **demo 5 SEEDED PLAYERS immediately before stage 2**, **demo 7 NEXT CHALLENGER immediately before stage 3**. Recalculate folded splice and source/twins/RARIO jumps so stage 3, source endings and Continue still connect.
- [ ] Test every row against separately transcribed expected data and all §7 aggregate distribution/leader/exclusion/uniqueness invariants, including shared stage-2 pair order reversal and all 24 boss permutations; use a representative explicit RYUKO assertion (stage 1 G SUNEO+GIANT / LIZARD+KAY / ERUS+HISO; stage 2 OGI+ZIRO / GIGI+SWW / YINAN+AYA; stage 3 SHIN-Z, ALPHA, DoraEmon, ZENKA). Assert stability across retry, stage counts, arena and demo/jump flow for a normal fighter, the four folded fighters, twins and RARIO.

**Checkpoint:** ANOTHER and pure table tests pass before starting LONG; no artwork needed.

## Task 2 — LONG battle and generated route

**Change:** src/game/br-another.ts or one small src/game/br-long.ts, src/game/story.ts, src/game/match.ts if justified, src/game/br-another.test.ts and focused Match/story tests.

- [ ] Build one Sakura Street Battle of twelve enemies from the six ordered pairs of each approved normal/boss LONG row, followed by { type: 4 }. Introduce br-long as a generated Route and B.R. marker. Do not use a fake Chii TAKE/life value.
- [ ] Keep first enemy present at tick one; each succeeding enemy watches its predecessor's low-life mark. Preserve entry order (within-pair leader first), symmetric enemy masks, friendly mates, and status visibility for waits. Test each of the 38 exact orders and all 16-pair frequency/leader invariants.
- [ ] Ordinary player: DoraEmon only as a present-from-start ally (not the usual partner), total **14** logical fighters. Boss player: no ally, total **13**. Preserve HPA-972 B.R. no-partner cheat and its normal-off behavior.
- [ ] Boss LONG: put existing Slot.tough on all twelve hostile slots, giving 2× HP / 500 max EN / 2× positive gain; non-boss LONG stays at native stats. Confirm 14/13 logical seats work in Match, render/palette/HUD and result bookkeeping. HPA-972 MAX_FIGHTERS=10 must limit *summons*, not authored native fighters; implement a narrow seat fix only if a failing test shows a real cap.
- [ ] Round settlement: twelve hostile KOs required for a normal win, player KO follows ordinary Continue, retry restores the same lineup and roles, victory returns to title. Do not grant win after six or eight KOs. No demos.

**Checkpoint:** LONG runs from Story.next through Match and result/Continue in deterministic tests without selector artwork.

## Task 3 — Route selector, sign data and screen flow

**Change:** src/game/select.ts, src/game/scene.ts, src/game/story.ts, select/scene tests, scripts/export_assets.py after artwork arrives; existing pack registration only as required.

- [ ] Represent each route step with an array of its available boards: normal STORY two, normal B.R. **ZERO / ANOTHER / LONG three**, boss B.R. **ANOTHER / LONG two**; first-step STORY/B.R. remains two. Boss STORY still opens native scenario without route step. Do not add boss ZERO or implement CHAOS.
- [ ] Replace two-choice XOR positioning/navigation with count-based choice and layout. Preserve selected/dim imagery, cursor, pointer hit boxes and keyboard confirm/direction, back/Escape, remembered choice, tap cooldown and route-load cancellation. Ensure ordinary ANOTHER and boss ANOTHER do not regress.
- [ ] Connect br-long selection to a new generated Story route in scene.ts without invoking routeLife; keep ordinary sign routes' native jumps intact.
- [ ] Only after **HPA-1034** delivers lettering: composite it with green-tinted native PAC-HELO blank sign at export, place it in the existing mode-select pack and render it. No original/derived asset commits. A temporary procedural sign is allowed for interaction tests, but leave final visual acceptance unchecked until the actual sign exists.

**Checkpoint:** Keyboard and touch can enter each supported regular/boss route; final mockup visual acceptance waits for art.

## Task 4 — Strict battle-scoped no-revive

**Change:** src/game/match.ts; Dora/ALPHA/ZAKU/PAC-HELO, story, team and related focused tests.

- [ ] Add br-long to Story.br and carry the existing boolean into Match for all native B.R. battles. Suppress *true KO recovery* paths for fighter 0 and everyone else, including DoraEmon's two KO RELOAD entry paths, ALPHA's 450/449 recovery, common get-up, post-KO HP awards and any special B.R. ZERO revive. A sticky downed score alone is not enough: prevent a KO'd fighter from re-entering active combat after positive HP gain.
- [ ] Test B.R. ZERO, normal ANOTHER, boss ANOTHER, normal LONG and boss LONG across player, partner and enemy roles, including timed/scripted KO recovery and kill-HP rewards. Confirm KO stays terminal for the battle, win counters don't double count, and waiting enemies can still arrive normally.
- [ ] Pair each B.R. case with an unchanged non-B.R. control (CPU Dora, ALPHA, ZAKU/PAC-HELO, ordinary damage/knockdown), plus HPA-858's player Dora restriction and EN charge. CHAOS will inherit Story.br when its separate ticket lands; don't build it here.

**Checkpoint:** all B.R. no-revive tests and non-B.R. regression tests pass.

## Task 5 — All-fighter Low HP, combat-to-display consistency

**Change:** src/game/match.ts, src/game/cheats.ts, src/menu.ts, src/game/hud.ts, src/game/scene.ts; Match/HUD/Menu tests and relevant e2e/ suites.

- [ ] Remove fighter-0 restriction *only* for Low HP line, idle stance mark, and scaled native damage cut when cheats.enabled. Compute threshold from each fighter's effective maxHp, truncating once, and retained damage from its own native reduction times Damage cut ×, clamped at 0–100% cut. Preserve existing noncheat values, full-cut zero damage and native floor for all other nonzero losses.
- [ ] Apply configured line to verified script low-HP super/stance gates for their owning fighters without broadening unrelated source HP conditions. Preserve the separate 1P-only **Low-HP supers at any HP** bypass unchanged.
- [ ] Introduce one narrow read-only Match low-HP state accessor (effective maxHp, mark, active, effective cut percentage). Make actual loss computation and renderer both use that same formula; avoid reimplementing percentage arithmetic in Phaser. Test player, partner, hostile CPU, boss, summoned late entrant and changed effective max HP (including tough boss opponents).
- [ ] Update the “Low HP · 1P” Cheats group and first two help descriptions to **all fighters**. Keep the low-HP supers option explicitly labeled as 1P-only.
- [ ] On **already-visible** main HUD bars and arena/optional bars, draw the configured threshold marker and low-HP highlight. At/below the combat threshold show “Damage cut: NN%” using capped **reduction**, not damage retained. Test crossing above/below, 0× (still low HP with 0% cut), different per-fighter base cuts, 100% cap, late arrival and bar hiding; never reveal a normally hidden bar or add labels for absent fighters.
- [ ] For Cheat Mode disabled, keep original HUD and source low-HP state, no new label/marker. Use pooled/updated Phaser graphics/text and existing visibility controls; no new UI subsystem or graphics assets.

**Checkpoint:** simulation damage and every visible Low HP display agree for each fighter and state boundary.

## Task 6 — Documentation and end-to-end verification in this PR

**Change:** docs/evidence.md, docs/gameplay.md, existing e2e/ specs and test fixtures only as necessary.

- [ ] Document approved lineup data as **authored** rather than recovered, all route and demo differences, B.R.-scoped no-revive, per-fighter Low HP and HUD label calculation. Keep source timing/engine evidence and authored changes explicitly distinct.
- [ ] Run targeted Vitest first, then **bun run validate**, **bun run build**, **bun run e2e**. These commands need the project's private handoff or remote generated fixtures; record actual command results and blockers in PR. Never mark unavailable checks passed.
- [ ] Use **MCP-driven Playwright/browser** E2E against the running game in one Chromium target. Use deterministic match control/test hooks (no manual clicking gate) to traverse normal B.R. ANOTHER stages 1→2→3 with demo 5 and 7; standard LONG win/Continue; boss ANOTHER/LONG (all four bosses where relevant); routes through both keyboard and touch. Assert enemy/ally identity, 14/13 seats, staged arrival, toughness, defeat scoring, no revive, no JS errors and correct title/Continue transitions.
- [ ] Browser E2E for Cheats: enable the Low HP line and Damage cut ×, take a player, a partner, a hostile enemy and a late entrant across the exact low-HP boundary at both high and low settings. Assert health-bar marker/highlight and percent against the tested Match reduction, incl. effective maxHP scaling, 0%, 60% example and 100% cap. Repeat master-off baseline; assert hidden bars stay hidden.
- [ ] **Automated visual acceptance:** capture screenshots of (1) regular three-board B.R. LONG choice and (2) boss two-board B.R. choice and compare to the attached HPA-1251/HPA-1035 **HTML mockups** for composition, scale, original backdrop, colors/cursor and no clipping at 960×720 and narrow viewport. Final B.R. LONG screenshot must use HPA-1034 art; defer that assertion until asset integration, not to a new PR.
- [ ] For Low HP (no supplied mockup), capture screenshots before, at and after the threshold for 1P, partner, enemy/boss and late entrant, visually checking via screenshot pixel/layout assertions that text is legible, correctly placed and clipped nowhere, marker/highlight matches state, and unchanged/hidden HUD is respected with cheats off.
- [ ] Use one browser platform only; **no native-platform testing or human acceptance criterion**. Remove .playwright-mcp/ and transient screenshots from the branch. Record the MCP run/results and pass/fail evidence in this PR; leave PR **draft** until implementation and all required checks are complete.

## End-to-end acceptance criteria (automated, not approval-based)

- [ ] All **34** normal ANOTHER records and **38** LONG records equal the HPA-1035 §7 approved rows, with all specified count, positional, pair-leader and omission invariants. All route orderings are stable across retry.
- [ ] Normal ANOTHER stage 2 has exactly six enemies; stage 3 has four bosses with correct last-boss arena; demo 5 precedes stage 2, demo 7 precedes stage 3 on normal/folded/twin/RARIO routes; original endings and Continue work.
- [ ] Normal LONG has exactly twelve hostile enemies and first-tick DoraEmon ally; boss LONG has twelve tough hostiles and no ally. Pair hostility, sequential arrivals, 14/13 seats and palettes, total KO required for win, loss/Continue/title and no-partner cheat all pass.
- [ ] Any fighter KO'd in B.R. ZERO/ANOTHER/LONG stays KO'd, including alternate revive and HP-reward paths. Non-B.R. and native Dora restrictions are unchanged.
- [ ] In Cheat Mode, Low HP line/damage cut apply to all player/partner/enemy/boss/late fighter roles. Display threshold and percent match combat damage at every boundary, with modified max HP, 0% cut and 100% cap; master off leaves native effects and HUD unchanged. The separate 1P-only low-HP super bypass still behaves as before.
- [ ] MCP browser E2E covers the complete regular/boss route journeys with keyboard and touch, match outcomes, demos, Low HP gameplay/HUD, hidden bar visibility and no JS/runtime errors.
- [ ] MCP screenshot comparisons pass against the **Linear HTML route-selector mockups** using final HPA-1034 sign art; Low HP screenshots without mockups pass automated visual checks at 960×720 and narrow viewport.
- [ ] docs/evidence.md and docs/gameplay.md updated; bun run validate, bun run build and bun run e2e actually pass in a workspace with the required inputs, with results recorded; no generated art, copied originals, temporary screenshots or unrelated features committed.

**Unmet dependency:** HPA-1034 remains an external, already-created art ticket. Code may be developed and reviewed before its delivery, but final LONG sign acceptance cannot be checked off beforehand.
