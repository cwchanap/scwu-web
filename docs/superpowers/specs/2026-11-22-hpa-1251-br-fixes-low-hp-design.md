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

Use the **exact** ordered rows in HPA-1035 §7 as a typed data table (suggested: src/game/br-lineups.ts) keyed by fighter ID (Who); keep names-to-ROSTER index mapping near its consumption and validate it exhaustively. Each normal row holds three ordered regular pairs for ANOTHER stage 1, three ordered extra pairs for stage 2, four ordered bosses for stage 3, and six ordered LONG pairs. Four boss rows hold LONG only. Order *within* each pair matters: A+B has A entering first. No seededShuffle for these approved normal routes; do not re-run the optimization/search. Boss B.R. ANOTHER keeps HPA-858's existing deterministic builder.

The rows must match these aggregate invariants as well as their exact values:
- ANOTHER stage 1: 34 distinct rows, three pairs from the twelve regular pairs, never the player's own pair. Each pair appears 8–9 times overall and 2–3 times in each position; all 72 pair/leader/position combinations occur, 42 once and 30 twice; no shared pair *set*.
- ANOTHER stage 2: exactly three pairs / six opponents drawn from four extra pairs. The eight fighters belonging to those pairs exclude their own; the other 26 use the approved omission. GIGI+SWW and OGI+ZIRO appear 26 times, MASA+3-TIMES and YINAN+AYA 25 times, each pair 8–9 per slot. Ten pair orders repeat with opposite member leaders throughout; all 24 pair/leader/slot combinations occur four or five times.
- ANOTHER stage 3: four bosses in all 24 possible permutations; ten orders repeat, never for the two members of one pair. Each boss appears 8–9 times per slot; last-boss arena distribution is ZENKA 8, ALPHA 9, SHIN-Z 8, DoraEmon 9.
- LONG: 38 distinct rows of six ordered pairs / 12 opponents from the sixteen-pair pool (twelve regular + four extra). Exclude a standard fighter's own pair, exclude none for bosses. Pair frequency 14–15 total and 2–3 per slot; all 192 pair/leader/slot combinations occur, 156 once and 36 twice; no shared pair set.

Import the approved data once rather than copy-pasting variants into tests. Tests should also assert exact representative rows independently from the Linear source so that an erroneous table is not trivially self-confirmed.

## 2. B.R. ANOTHER stage and demo flow

Reuse src/game/br-another.ts, Story, Battle and Slot. Preserve source story branch decisions, per-fighter header/ally data, opening arena, entry/watch behavior, existing source ending and Continue semantics. Generate stage 1 for all 34 standard fighters (currently only the four FOLDED fighters have a generated stage 1), with their original stage-1 intro; replace the current stage-2 eight-fighter seating with the approved six; and use the approved boss order for stage 3, still choosing arena by the final boss.

**Demo 5: SEEDED PLAYERS** runs directly before stage 2. **Demo 7: NEXT CHALLENGER** runs directly before stage 3. Preserve existing stage-1 intro and finale. Remap the folded splice and normal/twins/RARIO conditional jumps carefully; test both source-style and folded paths and retry/Continue.

## 3. B.R. LONG on existing route and match models

Normal players see ZERO, ANOTHER and LONG in the B.R. route step. Bosses ZENKA, ALPHA, SHIN-Z and DoraEmon retain STORY's native direct behavior but B.R. now opens a **two-sign** step: ANOTHER and LONG (no ZERO). Use the existing ModeSelect board objects, pack flow, pointer hit tests and input handling; make the board layout/choice count-driven instead of two-sign XOR. Preserve Escape/back, tap cooldown, cursor/selection and cancellation during route loading.

Add a generated br-long Story route: **one battle, then end**, no demos and no Chii-sign TAKE/life trick. It is a B.R. route for the no-revive rule. Fight on Sakura Street, one ordered, deterministic six-pair lineup from §7, with staggered entry: first opponent from battle start, each next enters as the watched predecessor falls below its own threshold, and the second partner follows the first. A pair's members are friendly to each other and hostile to outsiders; player and ally are friendly only to each other. Win after all twelve hostile KOs; player KO enters the ordinary Continue path; victory returns to title; retry uses the same row.

**Standard LONG:** DoraEmon is the only ally, present from the first moment, regardless of the player's ordinary paired ally (including Z-MEGA/RARIO); twelve hostile fighters, total 14 logical combatants. **Boss LONG:** no ally; twelve hostiles, total 13. Boss LONG opponents use HPA-858's existing tough flag (2× HP, max EN 500, 2× positive EN accrual); ordinary LONG opponents and the player do not. Respect HPA-972's optional B.R. no-partner cheat without corrupting later waiting slots. The summon cap MAX_FIGHTERS=10 applies to ad-hoc summons, **not** to native authored story seating. Make only a demonstrated seat/renderer fix, not a speculative pooling subsystem.

After HPA-1034 produces its lettering, composite it during scripts/export_assets.py export into a green-tinted original PAC-HELO blank sign, following the existing mode-select art pipeline. Never check in the original frame or derived pack. Until then, a clearly temporary procedural text label is acceptable for interaction tests but cannot satisfy the final sign visual check.

## 4. No revival in any B.R. battle

The route's existing Story.br → Match.story boolean is the authority; include br-zero, br-another, boss-br and br-long (and CHAOS automatically once implemented). A fighter whose KO has occurred is permanently eliminated from **that battle**, regardless of player/ally/enemy role, even if a script or KO reward later restores a positive HP value. Guard all relevant KO regain/transition paths: DoraEmon's KO RELOAD (normal or alternate entry), ALPHA's revive, common get-up, ZAKU/PAC-HELO source KO paths, and the B.R. ZERO scripted get-up. Do not prevent ordinary hit recovery or entry.

Keep native non-B.R. revival behavior, HPA-858's player-controlled Dora limitation and Dora EN restriction intact. The existing sticky downed flag used for brawl scoring is **not** sufficient by itself: the KO actor must remain unable to stand, move, fight or win by revival after the KO.

## 5. Cheat Mode Low HP: a single combat source of truth

Current main has 1P-only Low HP logic in Match.lifeLineMark, idleLifeLine and lossKeptPercent. Change the scope to **every Match fighter** when cheats.enabled, including native player, partner, enemies, bosses and late entrants/summons. Use each fighter's **effective maxHp** after HP/toughness multipliers and retain the existing single-truncation threshold semantics; when cheats are off, native thresholds and reductions remain unchanged. Low HP is based on HP crossing the mark, independently of the Damage cut × value.

For each fighter, the native incoming damage reduction is 100 − CHARACTERS[who].scale. With cheats on, the reduction is min(100, max(0, nativeCut × damageCutMultiplier)), and damage retained is 100 − reduction, preserving existing whole-point floor behavior except for a full 100% cut. With cheats off retain the exact native scale. Both combat loss and the display must read this *same* calculation; expose a small read-only per-fighter Low HP state accessor from Match, not a second parallel formula in Phaser. If 0×, the Low HP state still exists and displays **Damage cut: 0%** while actual damage is uncut.

Low-HP-dependent stance/verified super thresholds should follow the configured line for the fighter whose code performs the check. The separate **Low-HP supers at any HP** cheat must keep its existing **1P-only bypass**; do not grant bypass to CPUs or modify unrelated script life gates. Update the Cheats menu group and help text from “Low HP · 1P” to all-fighters wording for the first two controls while keeping explicit 1P wording for the separate supers switch.

## 6. HUD / visibility contract

Use the combat-provided threshold and reduction for (a) the main HUD life strips in src/game/hud.ts and (b) existing optional/arena life bars in src/game/scene.ts. Draw a readable threshold tick/marker and a low-HP highlight for every **already-visible** bar, with its state switching at exactly the same boundary as combat. Display **Damage cut: NN%** on the visible low-HP indication while active, using the capped effective reduction (not its multiplier, HP fraction or damage-taken fraction). The display must reflect different fighters' native scales, 0%, 100% cap and changing/re-entering fighters without stale labels. A percentage with a fractional result must use a display rounding rule matching the value tested against combat.

Never reveal otherwise hidden opponent bars, spectator/absent fighters, or deleted/KO bars. With cheats disabled preserve the existing HUD, bar visibility and source highlighting. Reuse existing Phaser graphics/text rather than adding a new UI state subsystem; keep text in-bounds at 960×720 and a narrow viewport.

## Automated acceptance design

**Deterministic tests:** exact approved 34+4 routes, all aggregate balance invariants, reproducible retry, demos/jumps, masks/entry/win/Continue/toughness, native 14/13-seat support, all B.R. revive paths vs non-B.R. controls, Low HP for player/ally/enemy/boss/late entrant and effective maxHp; confirm actual damage matches displayed percent including disabled cut and 100% cap.

**E2E via MCP-driven browser:** run the real web app on one Chromium target, use keyboard and touch selection to reach standard and boss ANOTHER/LONG, progress the fights with deterministic test helpers, inspect demos, entry, outcome, visible bars and Low HP boundary/cut labels with cheat on/off, and assert no runtime errors. A single platform is sufficient; no native acceptance.

**Visual:** capture route-select screenshots and compare to HPA-1251/HPA-1035 attached HTML mockups (ordinary three signs and boss two signs), including final HPA-1034 lettering once available. For Low HP combat/HUD with no ticket mockup, capture before/at/after-threshold screenshots for player, ally, enemy and a late entrant and assert placement, clipping, state/color/marker and label from screenshot pixels/layout checks. These are automated checks, not human approval gates.

**Verification/records:** update docs/evidence.md and docs/gameplay.md with authored-vs-recovered provenance, run bun run validate, bun run build and bun run e2e in an environment with the required private handoff or R2 fixtures; record actual results. Do not claim unrun tests or check in screenshot artifacts.

## Design trade-off

Favor a static typed table and thin route/Match extensions over runtime fairness solvers, generic rule engines or scene rewrites. One PR, isolated artwork dependency, deterministic tests and screenshot-based browser evidence keep this maintainable without overengineering.
