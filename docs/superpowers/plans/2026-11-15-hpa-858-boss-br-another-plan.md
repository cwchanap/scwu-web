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

## Review decisions recorded before implementation

These resolve the blocking and open assumptions in [review #5914086465](https://github.com/cwchanap/scwu-web/pull/22#pullrequestreview-5914086465) and the subsequent [review #5914527167](https://github.com/cwchanap/scwu-web/pull/22#pullrequestreview-5914527167):

1. **Battle template donor:** Ryuko's **source step 63** is the stage-1 roles/header donor; **source step 65** supplies stages 2 and 3. Do **not** call `brAnotherStages(boss)`: bosses lack the 49/65/67 regular-fighter finale steps, and Dora's story is separately authored. The donor's flag bit 0 permits Continue.
2. **Difficulty storage:** optional authored `Slot.tough` for exactly the six regular enemy slots of each boss stage 1 and 2. Applied in `storyFighters` and on each round rebuild.
3. **EN denomination:** every eligible regular enemy already uses 100 EN per stock, including YINAN and AYA. Set `maxStock = 5` without introducing a per-stock override. Scale positive `addPower` amounts x2; negative EN and direct op-0x10 stock changes stay native.
4. **Cheat ordering:** native fighter -> route `tough` -> HPA-767 enemy HP cheat. In `cheatSeat` multiply the fighter's **existing `maxHp`** (freshly created per round), not `lifeOf`. The route alone does not mark the match cheated.
5. **Minimal route state:** Store the selected route and optional generated steps on `Story`; pass only `br: boolean` to `Match.story` when constructing each battle. No rules registry, extra reset plumbing or stage-number detection. B.R. includes `br-zero` and `br-another`, plus later explicit B.R. routes.
6. **Shared boss list:** `BOSSES: readonly Who[]` beside `ROSTER` in `select.ts`. Keep `opensOnModeSelect` limited to the 34 regular fighters, since its callers build source-specific B.R. stories.
7. **Escape:** cancel a completed but loading boss mode pick via `select.done`, even at stage 0. Keep existing stage-1/back and stage-0/character-select navigation.
8. **E2E pragmatism:** Extend `e2e/unconfigured/mode-select.spec.ts` with boss B.R. and boss STORY cases using its existing canvas pixel probes; do not install a new browser farm. Keep macOS, Windows and iOS checks conditional and the HPA-765 mockup as a visual reference, not a screenshot baseline. CI runs Linux Chromium only on non-draft PRs; not Android.
9. **Two separate charge actions:** Dora standard EN charge enters **239** via `{ ex: true }`; actual CPU EN command 42 enters **421** (see `dora.test.ts:777`). Gate **both** at `Match.command` when Dora is fighter 0 or the match is B.R.; test a real `CpuVM` seed-4 run, not only the mocked `ex` input.
10. **Existing regressions:** six scene tests use SHIN-Z as a *direct-start* story and must use another non-boss excluded story such as GOLF/TTRO after bosses gain ModeSelect. One practice Dora charge test and three authored Dora story KO RELOAD tests assert old behavior and must be rewritten. Do not change CPU Dora's non-B.R. KO RELOAD assertions.
11. **Pixel-probe timing:** HEADER is meaningful only while the selector's touch pad has eight buttons. Check its luminance **before** battle entry, account for persisted `modePlace`, and then assert 1P native HP and first stage-1 enemy 2× HP through accessible `aria-valuemax`. Never sample HEADER after the battle renders.

## Phase 1 — Boss entry, route ownership and cancellation

**Change:** `src/game/select.ts`, `src/game/scene.ts`, `src/game/story.ts`; focused `select.test.ts`, `scene.test.ts`, `story.test.ts`.

- [ ] Export the four-boss `BOSSES` list from `select.ts`, not from `br-another.ts` (avoids a circular import). Only `scene.ts` extends the menu gate to `opensOnModeSelect(who) || BOSSES.includes(who)`; keep the predicate's regular-fighter enumeration unchanged.
- [ ] For boss `ModeSelect`, return `'story'` or `'br-another'` when confirming the **first** sign. Change `done` to `Route | 'story' | null`, with no route-sign screen for bosses. Regular fighters still see mode + route signs, with the same remembered choices, keys and taps.
- [ ] STORY creates default `new Story(who)`; boss B.R. creates `new Story(who, bossBrAnotherStory(who), 'br-another')` and calls `next()`. Give `Story` a small optional steps override and `Route | null` value; ordinary `startOnRoute(route)` records the route. Avoid a `routeLife` branch for the new boss route: the generated path has no Chii-sign jumps.
- [ ] Derive `br` from the active `Story.route` and pass it from `TrainingScene.startBattle` to `Match.story`. Ordinary story/VS/practice remain non-B.R.; a new Story naturally owns a new route. Cover B.R. ZERO explicitly.
- [ ] Update Escape handling to cancel the pending route request whenever `ModeSelect.done` is present, **whether stage is 0 or 1**. Unconfirmed stage 1 still backs to stage 0; unconfirmed stage 0 returns to character select. Add an asynchronous boss-load cancellation test.
- [ ] Migrate **six** existing `src/game/scene.test.ts` direct-start SHIN-Z fixtures (`:283`, `:300`, `:314`, `:379`, `:445`, `:1038`) to a still-excluded **non-boss** source story, e.g. GOLF (opening demo 6) or TTRO (opening demo 4). Keep the existing tests' demo-load, delayed-art, Escape and reset assertions, adjusting any demo-specific expectation. Add dedicated SHIN-Z/four-boss ModeSelect regressions rather than accidentally eliminating the original coverage.
- [ ] Regression-test the original stories of ZENKA, ALPHA, SHIN-Z and DoraEmon after STORY is explicitly selected, plus regular fighters' two-step selector and the `opensOnModeSelect` roster count of 34.

**Checkpoint:** Both boss choices start the correct story path, no accidental normal-fighter builder call, and Escape works during a pending stage-0 boss route load.

## Phase 2 — Pure ally-free boss B.R. generation

**Change:** `src/game/br-another.ts`, `src/game/story.ts`, `src/game/br-another.test.ts`, `src/game/team.test.ts`.

- [ ] Extract existing seeded shuffle as a small reusable closure seeded by the chosen `ROSTER` index, then draw stages **in order from one seed stream**. Do not generate a search/optimization system for HPA-1035's later global balancing.
- [ ] Make the `assemble` ally slot optional, and derive all hostility masks from the actual seat count (player + opponents only for the boss route). Pairs stay allied to their mate; all other pairs/bosses are hostile as today.
- [ ] **Explicit donors:** use `sourceStep('ryuko', 63)` for stage 1's roles/header and `sourceStep('ryuko', 65)` for stages 2 and 3. Copy the donor `flags & 1` Continue capability. Override arena and slot/player/entry details; never mutate source steps.
- [ ] Build stage 1: Sakura Street, three of 12 regular pairs (six fighters). Stage 2: Sakura Night, three of the four extra pairs (six fighters), with one seeded omission. Stage 3: **three other bosses**, no selected boss, in shuffled order; stage arena determined by last boss.
- [ ] Produce `[stage1, stage2, stage3, { type: 4 }]` and make normal `Story.next` and `retry` handle it. No demos or ally; Continue should retry the *same* battle, completion returns title.
- [ ] Set optional `tough: true` on **all six stage-1 and all six stage-2 enemy slots**, none on stage 3. Keep `Slot` authored flag optional, so native exported slots are untouched.
- [ ] Table-test all four bosses: 6/6/3 enemy counts and slot indices; no ally; stable seeded and distinct lineups; pair cohesion and symmetric hostility; correct watch/below order and arena; no own-boss appearance; donor headers and Continue flag; no mutation of source data or regular BR Another scenarios.

**Checkpoint:** Three pure generated battles work through existing Match and Story on all bosses, without extra seats or donor index errors.

## Phase 3 — Persistent route stats and cheat composition

**Change:** `src/game/match.ts`; focused `team.test.ts`, `br-another.test.ts` and existing cheat tests.

- [ ] In `storyFighters`, apply `Slot.tough` on each freshly constructed hostile: `f.maxHp = 2 * lifeOf(f.who)`, `f.hp = f.maxHp`, `f.maxStock = 5`, `f.enGainMultiplier = 2` (default 1 in the fighter factory). The same construction path is used after `nextRound`; no start-only buff.
- [ ] Reuse `addPower(f, amount)` to multiply **only positive** amounts by `f.enGainMultiplier`. Negative costs/drains, direct op-0x10 stock additions and base `perStockOf` stay unchanged. Candidate foes have 100 EN per stock; no override.
- [ ] In the hostile branch of `cheatSeat`, apply `enemyHpMultiplier` to fresh `f.maxHp` instead of native `lifeOf`. With cheats off the route gives 2x; with Enemy HP x3 the tough enemy gets 6x. Non-tough enemies keep existing semantics. Player max EN settings apply only to player 0, never to these enemies.
- [ ] Assert modifier survives a drawn/multi-round reset and is **not applied twice**; verify HP/EN on waiting and present enemies, late-entry thresholds based on effective `maxHp`, no stat change to stage-3 bosses or player. Test normal story/VS and regular B.R. are unaffected.
- [ ] Verify the route's hardening does not activate `cheats.enabled` or mark `runCheated` and does not interfere with existing HPA-767 cheat snapshots.

**Checkpoint:** Boss stages 1/2 have x2 HP, five 100-EN stocks and x2 positive EN gain on every round, including with independent optional cheats.

## Phase 4 — DoraEmon's charge and KO RELOAD matrix

**Change:** small action entry/KO check in `src/game/match.ts`, `src/game/dora.test.ts`, `src/game/team.test.ts`.

- [ ] Treat **fighter index 0** as player-controlled in every mode, including TEAM VS's active 1P. At `Match.command`, when `f.who === 'dora' && (i === 0 || this.br)`, block **both action 239** (normal `{ ex: true }` EN charge; follow-up `240+3`) **and action 421** (real `CpuVM` command 42, CPU EN charge). Use the scanned action index before `enterSource`; do not block ordinary attacks or global `addPower`.
- [ ] In the KO-normal check inside `enterPending` (near line 4468), bypass the **Dora-specific stock test targeting KO RELOAD action 72** if `i === 0 && !br`. Preserve other stock tests, ALPHA revival, Dora 72/74 in B.R. and source behavior for non-B.R. CPU Dora.
- [ ] Table-test player Dora in practice/VS/TEAM VS/authored STORY (no charge, ordinary KO), player Dora in B.R. ANOTHER (no charge, KO RELOAD), CPU Dora in regular B.R. ANOTHER stage 3 (no charge, KO RELOAD), and CPU Dora in ordinary non-B.R. (native charge/revive). Pass `br` for **B.R. ZERO** in a focused route-context test, even if Dora is absent from its normal lineup.
- [ ] Update the old **practice 1P charge** assertion in `src/game/dora.test.ts:639–657` to verify no 239/240+3 and no charge EN. Preserve/retest CPU Dora outside B.R. with `{ ex: true }` where needed.
- [ ] Update the **three** authored-story player-Dora KO RELOAD tests in `src/game/dora.test.ts:870–905` to assert an ordinary KO with **no 72/74**, retaining the existing source-accurate non-B.R. CPU Dora tests at `:717–770`.
- [ ] Use **real `CpuVM` with seed 4** from `src/game/dora.test.ts:777` (already demonstrates action 421 in non-B.R.) to prove the action is **blocked in B.R.** and charge-based stocks do not accumulate. The existing stage-3 test injects `{ ex: true }` and only exercises 239, so cover both branches. Assert denied-charge CPU Dora still executes a non-charge attack within a bounded number of ticks. Keep 421 in the non-B.R. CPU regression, preserve non-charge EN rewards and other fighters.
- [ ] Replace the existing `team.test.ts` expectation that Dora *charges* in B.R. stage 3; keep the stage-3 KO RELOAD/brawl-win expectation. Reconcile unrelated HPA-973 tests if that PR merges first.

**Checkpoint:** All Dora mode/seat cases pass and KO RELOAD remains on for every B.R. Dora role.

## Phase 5 — Documentation, automated acceptance and one-PR completion

**Change:** `docs/evidence.md`, `docs/gameplay.md`, optionally move-list text if it conflicts, `e2e/unconfigured/mode-select.spec.ts` and PR body.

- [ ] Document the authored generated boss route, donor steps, enemy stats, cheat composition, and charge/revive conditions while preserving original-vs-authored distinctions. Update DoraEmon's **EN** move-list entry (`src/instructions/moves.ts` around `:5219–5221`) to clarify player/B.R. restrictions. His separate **Charge** flying rush (`:5151–5153`) is an unrelated attack and **must remain unchanged**. Check `docs/gameplay.md` for outdated EN/revive text.
- [ ] Extend the existing **Desktop Chrome canvas pixel-probe** E2E without new infrastructure. Boss B.R.: explicitly navigate to the **B.R. sign** regardless of remembered `modePlace` (or isolate tests in fresh pages), check lit `MODE_LEFT`/`MODE_RIGHT`, then confirm B.R. and watch `HEADER` luminance **only while `pad.count() <= 8`**, asserting `< 160` and never sampling this top-centre region once the arena/HUD renders. On transition to battle (`pad.count() > 8`), assert visible health bars, 1P's native `aria-valuemax`, and first generated stage-1 enemy's `aria-valuemax === 2 * lifeOf(firstEnemy)`. Boss STORY: explicitly select STORY regardless of memory, then verify the existing original story. Include touch/tap input with existing test controls.
- [ ] Run `bun run validate`, `bun run build`, `bun run e2e` in the available environment and log exact outcomes. The E2E GitHub Actions job runs Linux Chromium and skips **draft PRs**; for a draft, use an actual local run instead of claiming CI E2E passed. Record unavailable private asset export/handoff as **not run**.
- [ ] Keep all implementation/test/documentation commits **on this PR**, review the diff for HPA-858 only, and update the PR's checked items/status truthfully. No image/SFX task is needed.

## Automated end-to-end acceptance criteria

These checks follow the project's platform targeting without adding browser-infrastructure tasks. Platform checks that cannot run are explicitly *not verified*, rather than replaced by human sign-off.

- [ ] **macOS (Chromium):** With existing Playwright, automate SINGLE → four boss selections → STORY/B.R. direct choice. Account for remembered selector mode; assert the B.R. route HEADER remains dim **only before battle transition** (`pad.count() <= 8`), then check battle HUD, boss native maximum HP and first opponent's 2× max HP. STORY starts the original boss route. Existing canvas pixel probes check active/dim sign and cursor, and page errors are absent.
- [ ] **Windows (Edge):** When an existing Windows/Edge runner is available, automate boss selection, direct B.R. start, canvas/HUD visibility and sign/cursor appearance with a screenshot. Otherwise record **not run: no Edge runner**; no dedicated new runner is part of this ticket.
- [ ] **iOS (Safari):** When an existing iOS simulator/device runner is available, use touch to pick STORY/B.R., assert direct B.R. entry, readable signs/HUD in portrait and landscape, and no route-substep flash. If only desktop WebKit emulation exists, label it **WebKit emulation, not iOS Safari**; if neither exists, record **not run**.
- [ ] **Visual check against Linear mockup:** Use the **HPA-765 sign-menu mockup** as a design reference (real sign assets, dimmed character-select background, highlighted mode sign, cursor placement), with automated screenshot/pixel probes **while ModeSelect remains visible**. Do not require pixel-perfect equality with a conceptual mockup or sample a battle frame as if it were a sign. No HPA-858 art is needed.
- [ ] **Regression:** Existing ordinary-fighter two-step mode choice, 34 regular B.R. ANOTHER scenarios, unchanged boss STORY, Continue, HPA-767 cheats and Dora KO/brawl outcomes pass deterministic tests and the available browser smoke checks.

Android and Linux are excluded from dedicated platform acceptance; rely only on the current CI coverage where applicable. The current CI uses Linux Chromium **and does not run Android**. No human acceptance criterion.

## Ready-for-review definition

- [ ] All four bosses have STORY/B.R. first-step choices, B.R. skips the route step; original boss stories and the 34 regular B.R. routes are unchanged.
- [ ] Boss route uses Ryuko donor steps 63/65, generates 6/6/3 hostile opponents, no ally and no demos, preserves Continue and finishes at title; generated flags and masks are validated.
- [ ] `tough` applies only to boss stage-1/2 regular enemies and persists across rounds; HP = native x2 x optional cheat, Max EN = five 100-EN stocks, positive EN gain x2; native paths, player and stage-3 bosses unaffected.
- [ ] Dora charge actions **239 and CPU-only 421** prohibited for player Dora everywhere and CPU Dora in B.R.; KO RELOAD off only for player Dora outside B.R.; B.R. ZERO flag, seed-4 real CPU behavior, migrated 10 prior tests, and CPU responsiveness verified.
- [ ] No unrelated feature/art/SFX work; one draft PR updated with accurate verification and any unavailable-platform statuses.
