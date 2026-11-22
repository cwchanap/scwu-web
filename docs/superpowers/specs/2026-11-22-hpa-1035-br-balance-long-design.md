# HPA-1035 — Balanced B.R. ANOTHER and B.R. LONG — design specification

**Linear:** https://linear.app/cwchanap/issue/HPA-1035/br-fixes-after-hpa-766-even-stage-draws-six-fighter-stage-2-loading  
**Baseline:** `cwchanap/scwu-web` `main` at `67c527ed0b0fbe9743caa95b28ba20276b509d1f` (2026-11-22).  
**Status:** Planning only; no gameplay code, tests or screenshots have been run for this change.  
**Delivery:** One draft PR for this ticket. The implementation, tests and evidence will be added to this same PR, not a second PR.  
**Dependencies:** HPA-858 is merged. HPA-1034 supplies the separately authored `art/signs/br-long.png`, which is not in `main` yet. HPA-1148 must follow this ticket.  
**Visual references:** HPA-1035 Linear mockups, “B.R. LONG sign step” and “Boss B.R. MODE step”; compare to the mockups rather than checking in their images.

## Goal and scope

Make the 34 ordinary fighters' B.R. ANOTHER draws match the explicitly approved lineup tables in **Linear HPA-1035 item 7**; shorten stage 2 from four pairs to three; correct stage 2/3 story demos. Add B.R. LONG, a single Sakura Street battle against 12 fighters in six sequential pairs, playable by those 34 fighters and the four bosses. Prevent KO revival for all combatants in every B.R. mode, preserving native revival outside B.R.

No new game engine, database/API, persistence migration, artwork generation, sounds, other mode redesign, or B.R. CHAOS gameplay. Do not change B.R. ZERO's enemy order or B.R. CHAOS's future per-run shuffle. Keep original extracted/generated assets out of Git.

## 1. Fixed, approved lineup data (not runtime randomization)

- Transcribe **all of item 7's approved tables**, without re-solving or recomputing them, into a typed, pure data module (e.g. `src/game/br-lineups.ts`). Key the 34 normal-fighter records by `Who`, holding ordered pairs for stages 1 and 2, an ordered four-boss array for stage 3, and six ordered pairs for LONG. Add the four boss LONG records; bosses keep HPA-858's existing B.R. ANOTHER stage 1–3 lineup logic.
- Preserve both pair ordering **and which partner enters first**. ROSTER indices may be used to keep the data compact; a pair remains two adjacent opponents, never a combined entity. No runtime `seededShuffle` for these approved routes.
- A normal fighter's stage 1 has three of twelve regular pairs, excluding its own pair; stage 2 always has three of the four extra pairs, excluding the own pair when applicable; stage 3 has four bosses in the approved order. Arena for stage 3 remains the arena of the **last** boss.
- LONG has six of sixteen total pairs (12 regular + four extra), excluding the normal player's own pair. Bosses have no own pair to exclude. All 38 rows remain stable across runs and Continue.
- Do not reproduce the giant data tables in this design document; the ticket's **approved item 7** is the authoritative transcription source, while checked-in typed data and exhaustive tests make the implementation independently reproducible.

## 2. Existing B.R. ANOTHER story and demos

Use `brAnotherStages` and `brAnotherStory` in `src/game/br-another.ts`. Build stage 1 for **every** normal fighter (the existing code generates it only for four `FOLDED` fighters); derive each normal fighter's source stage-1 header, ally role, stage and entry behavior rather than forcing Ryuko's stage onto everyone. Preserve folded/twin story branch offsets and the existing source endings. Stage 2 uses only six enemies; stage 3 uses the fixed four-boss order. Both keep the ordinary finale's desperation ally, native result/Continue semantics and the established hostility masks.

Every path plays its existing stage-1 introduction; the **SEEDED PLAYERS** demo plays immediately before stage 2; the **NEXT CHALLENGER** boss demo plays immediately before stage 3. Resolve their actual demo IDs against the exported source/evidence, not by guessing. Check that `Story.next`, condition jumps, retries and special RARIO ending still reach the right battles.

## 3. B.R. LONG battle and route

- Add a small generated route with `[battle, { type: 4 }]` and a route ID such as `'br-long'` on the existing `Story`. It is a B.R. route; **do not** use a fabricated Chii-sign `TAKES` value or `routeLife` to start it. Its win returns to title; KO loss enters the usual Continue flow and replay retains the same lineup.
- All 12 opponents are the six approved pairs; the first enters on battle start, each subsequent enemy watches the previous slot and enters on its low-life threshold. Pair mates are non-hostile to each other, hostile to everyone else outside the pair; preserve the symmetric per-seat bitmasks. Win only on all 12 hostile KOs, lose on the player's KO.
- **Normal player:** DoraEmon is the *only* ally, with `0x200` ally identity and first-moment entry (not waiting for 1P low HP); no usual partner, no extra Z-MEGA/RARIO ally. He attacks the twelve enemies and they attack him. **Boss player:** no ally, twelve enemies. Keep all non-boss opponents at native strength.
- **Boss player difficulty:** all twelve enemy `Slot` records receive the same `tough` flag as HPA-858 stage 1/2: 2x native HP, 500 max EN, 2x positive EN gain. It is not applied to normal-player LONG, the player, or HPA-858's boss stage 3. Reuse `Match.story` and the per-round fresh fighter construction.
- There are 14 logical fighters (1P + 12 enemies + DoraEmon) for a normal player and 13 for a boss. Examine the actual Match/scene seat limits, palette selection, brawl result counters and HUD. The HPA-972 `MAX_FIGHTERS = 10` summon guard must not accidentally cap authored story lineups. Implement narrowly scoped seat reuse only **if** tested renderer or Match constraints require it; maintain hostility/watches and KO bookkeeping when reusing a physical seat. The masks fit within 32 bits.

## 4. Mode selection and sign asset

- Extend the existing `ModeSelect` / `ROUTE_BOARDS` in `src/game/select.ts`: ordinary fighters see B.R. ZERO, B.R. ANOTHER and B.R. LONG (plus CHAOS when HPA-770 eventually lands); bosses' B.R. choice opens a second step with **exactly two** boards, B.R. ANOTHER and B.R. LONG. STORY still selects their native scenario. Preserve keyboard, tap, highlight, Escape/back and loading cancellation behavior. Make selection and board placement depend on the current board count rather than XOR/two fixed positions; do not build a new UI framework.
- The final B.R. LONG sign comes **only** from HPA-1034. After that separate artwork ticket supplies `art/signs/br-long.png`, extend `scripts/export_assets.py` and the existing packed mode-select asset pathway to composite it onto a recolored green copy of PAC-HELO's **original blank** board. No original frame or extracted pixel bytes are committed. An in-code temporary label is permitted for integration tests only, not final visual acceptance.
- Match the ticket's sign-row and boss-route mockups: original select backdrop, three route signs for normal fighters, two for bosses, readable selected/dim state and cursor, all inside 960×720, including touch hit areas.

## 5. Route-scoped no-revive behavior

`TrainingScene.startBattle` already passes `this.story.br` to `Match.story`. Extend `Story.br` to include LONG. In Match's existing KO and source-action decision points, suppress any path that restores a KO'd combatant in B.R.: DoraEmon's KO RELOAD, ALPHA's revive, common get-up, and B.R. ZERO's special KO transitions where they revive. Avoid globally disabling non-revival reactions, win scoring or ordinary hit recovery. Preserve non-B.R. behavior unchanged, including legitimate non-B.R. CPU Dora recovery; route-specific Dora charge restrictions from HPA-858 still apply.

## 6. Integration and acceptance contract

- **Unit/Match:** exact item-7 per-fighter snapshots, stability across Continue, no duplicate/self pair, native/hostile ally masks, the approved distribution invariants (34 or 38 rows), two/three-stage battle counts and correct demos/jumps. Test normal and boss LONG: 12 hostile KOs to win, 1P KO to lose, stepwise entrants, 14/13 logical seats, palette uniqueness per fighter, correct Dora first-moment ally/no boss ally, toughness only for bosses, and no revival in B.R. ZERO/ANOTHER/LONG (CHAOS once delivered).
- **Browser E2E via MCP-driven Playwright:** in one Chromium target, automate normal and boss mode/route choice via keyboard and touch, verify a real battle and result flow, and capture **screenshots** of normal B.R. LONG route boards and boss two-board choice. Compare screenshots to the HPA-1035 Linear mockups using the existing canvas pixel probes plus visual-layout checks; assert no clipped/missing signs and no JS errors. No native-platform check unless a platform-specific issue appears; no manual acceptance gate.
- **Documentation:** update `docs/evidence.md` (explicitly label lineup balance, LONG and revive changes *authored*) and `docs/gameplay.md`; run `bun run validate`, `bun run build` and `bun run e2e`, recording actual results rather than assuming success. The private `scwu-web-handoff/` export and full browser tests might not be available in every environment; unavailable checks stay unchecked.

## Non-goals and tradeoffs

Favor a checked-in static table over a fairness solver; reuse existing Match, Story and ModeSelect over new abstraction layers. No offline support, complex compatibility migration, extra routes, nonessential security changes, new art or SFX in this ticket. A subsequent HPA-1148 will consume these stage-order and starter-ally foundations rather than being implemented here.
