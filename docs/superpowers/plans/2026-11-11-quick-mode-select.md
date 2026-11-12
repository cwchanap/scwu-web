# HPA-765 — Quick mode select after picking a fighter — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-765/quick-mode-select-after-picking-a-fighter
**Design:** `docs/superpowers/specs/2026-11-11-quick-mode-select-design.md`
**Status:** planning only, implementation and tests not yet run.
**Review update:** 2026-11-12 — addressed PR #17's seven design findings.
**Delivery:** **one draft PR** for HPA-765, including implementation and verification on this same branch. HPA-772 art stays a separate task, not a coding subtask.

## Current code facts and decisions

- `src/game/story.ts`: `scenarioOf(who)` provides the source steps; `Story.next(life, lost)` already interprets per-fighter route jumps and `retry` is the Continue path. Ryuko's four routes lead to steps 4/21/47/62.
- `docs/evidence.md` (Globals) and `src/game/team.test.ts` already verify the route sign KO life takes: Easy 100, Hard 346, BR ZERO 347, BR Another 348, after Single Start removes 1 life. The source tests supply the sign labels, so **do not** implement `modeRoutesOf` or a second interpreter.
- `src/game/select.ts` has `Screen.step`/`word()` and `Continue`'s press-edge/release latch, plus module-level `Title.place` and `storyRemembered`. Add `ModeSelect extends Screen` there instead of a separate model.
- `src/game/scene.ts`'s `stepSelect`, `open`, `drawSelect` and `runStory` already own screen transitions, cancellation, select-sprite drawing and scenario loading. Reuse them.
- `src/game/packs.ts` / `scripts/export_assets.py` already split select images into resident `boot.bin` and fighter-rest packs. The exact subset test in `src/game/packs.test.ts` catches drift.
- `src/App.svelte`'s existing `scene.control` touch pad already works on other select screens; make the generic `status.selecting` controls sufficient rather than creating ModeSelect-only DOM buttons.
- Once the sign battle is unreachable, remove its `Match.choosingMode` getter, Chii brawl-resolution/native-HP exceptions and only the two obsolete simulation tests. Keep all ordinary story brawl behavior and the source research evidence.
- The menu writes **no globals**. Subsequent demos and other source systems set or clear those flags appropriately; do not simulate skipped Chii side effects.

## Phase 1 — Six resident sign images and simple story route entry

**Modify:** `src/game/packs.ts`, `scripts/export_assets.py`, `src/game/story.ts`, `src/game/story.test.ts`.

- [ ] Put **ZAKU 8001/8005/8006** and **PAC-HELO 8001/8005/8006** in `selectAssets` and the Python export's matching select subset. The unused blank 8004 boards stay out of boot until HPA-770/772; UI arrow image 170 is already resident. Reuse exact pack membership and single-copy tests, without adding redundant assertions.
- [ ] Define the closed `Route` union and `TAKES` table (100, 346, 347, 348) in `story.ts`. Add `opensOnModeSelect(who)`, a simple shape check against its opening story battle and Chii actor slots (ZAKU/PAC-HELO); do not use a character allowlist or rewrite exported scenarios.
- [ ] Add `Story.startOnRoute(route)`: position `step = 0` after the skipped Chii battle, then `next(lifeOf(who) - 1 - TAKES[route], 0)`. This delegates all branching (including YINAN/AYA and RARIO differences) to the current runner. Direct `Story.next()` stays available for special stories.
- [ ] Add **one roster-wide route test**: source-eligible fighters have four distinct, valid destinations; assert known fixture families 4/21/47/62, 6/23/49/64 and 4/17/33/44 and that excluded fighters do not open this menu. Test one chosen route's subsequent battle/demo and existing retry flow.
- [ ] Do not change `Match`, `scene` or `App.svelte` yet.

**Checkpoint:** `bunx vitest run src/game/story.test.ts src/game/packs.test.ts` (art-dependent tests require the usual handoff).

## Phase 2 — Playable ModeSelect as an existing Screen

**Modify:** `src/game/select.ts`, `src/game/select.test.ts`, `src/game/scene.ts`, `src/game/scene.test.ts`, `src/App.svelte`.

- [ ] Implement `ModeSelect extends Screen` beside `Continue`, using its current tick, `word()`, previous-key state and release latch. Module-local memory stores the last mode and one route per mode. On its first tick, arm the cursor without accepting the fighter-pick button; no separate selector state engine or duplicated keyboard pipeline.
- [ ] Spawn KGT cursor action 84 (`LAYOUT.cursors[0]`) so the original image 170 animates/bobs. The selector owns the previously completed `CharacterSelect` as `background` and steps it with **no input**, preserving select animation and chosen palette.
- [ ] Add `ModeSelect` to `TrainingScene.select` and the `stepSelect` switch. Eligible story fighter confirmation opens it instead of `Story.next()`; excluded stories retain direct startup. A route confirm builds `Story`, saves palette/`storyHeld`, sets `storyLife = lifeOf(who) - 1 - take`, `storyLost = 0`, resets `runCheated`, and calls `runStory(story.startOnRoute(route))`. No Chii match is started and no globals are manually written.
- [ ] On Escape from route, call `ModeSelect.back()`; from mode, reopen story `CharacterSelect` at the remembered cell. Let `open`/`whenReady`/`openDemo` keep their existing stale-load protection. Scope Enter to ModeSelect confirm, avoiding changes to other scenes; existing Esc-to-title/pause semantics remain.
- [ ] Draw the existing select background's objects with `drawSelect`, apply a simple Phaser dimmer, show **plain original sign sprites** in the two choices, their chosen-mode header on step two, and the KGT arrow. Use the current sprite pool and palette data; avoid new texture/tween/layout systems. This phase **must be playable**, not a UI disconnected from `stepSelect`.
- [ ] Add `GameStatus.choosingMode` (false by default) in `scene.ts` and Svelte's initial literal, while keeping `selecting` true. Show movement arrows and a punch/select action on **any** `status.selecting` screen, not a special branch for ModeSelect.
- [ ] Tests cover fresh/held-button input, two-stage confirm, Escape scoping, remembered selections, retained palette, special-story bypass, run-cheated reset at route confirm, title/Menu cancel and status reporting.

**Checkpoint:** `bunx vitest run src/game/select.test.ts src/game/scene.test.ts src/game/story.test.ts`, then a short local **playable** desktop check entering one STORY route.

## Phase 3 — Visual polish, direct taps and dead-code cleanup

**Modify:** `src/game/scene.ts`, `src/game/select.ts`, `src/game/match.ts`, `src/game/team.test.ts` and focused tests.

- [ ] Polish only the Phaser view: place the two sign rectangles per mockup, tint inactive signs, slightly scale the active sign, position the actual KGT arrow over it, and show the small selected-mode sign at the top of the route step. There is **no custom arrow bob tween**; its KGT action animates it.
- [ ] Use one rectangle table for sign rendering and pointer hit testing in game coordinates; tapping a sign goes through the same choice handler as keyboard confirmation, not a parallel story launch. Check scene canvas scaling and portrait/landscape touch targets.
- [ ] Remove `Match.choosingMode`; remove the sign-battle exception from `brawlEnemies` and `cheatSeat`; delete the obsolete Chii-specific comment at the story round end. Retain the generic brawl win rule, unrelated global-10 stage scripts and all normal cheat behavior.
- [ ] Remove only `team.test.ts`'s two tests that actually simulate the now-unreachable Chii choice and native HP exception, after the four take values and original source observations are retained in `docs/evidence.md`. The Phase 1 route tests replace the playable-path coverage. If another test exercises shared combat, preserve it.
- [ ] Regression tests: a story opponent/all-hostile brawl ends correctly, normal 1P cheat HP scaling works without a Chii exception, legacy Chii path is absent from the reachable UI, taps and keys take the same route, and menu/back navigation cannot leave a stale select model.

**Checkpoint:** `bunx vitest run src/game/team.test.ts src/game/match.test.ts src/game/scene.test.ts src/game/select.test.ts`. Manually compare the now playable screen with the HPA-765 mockup.

## Phase 4 — Docs, one browser smoke and complete validation

**Modify:** `docs/gameplay.md`, `docs/evidence.md`, the existing Playwright suite (e.g. `e2e/unconfigured/mode-select.spec.ts`).

- [ ] Update gameplay docs for SINGLE -> two-step route choice, controls and Escape/back, session memory and direct-story skip cases. Remove claims that players still fight the Chii sign selection or that it needs native HP under cheats.
- [ ] Record **authored** mode-select replacement in evidence docs, including the verified 100/346/347/348 take table, sign-owner mapping, six reused source images, original KGT arrow, original test/PC citations and **no synthetic global writes**. Recovered source sign battle remains documented as evidence but not a playable route.
- [ ] Add **one focused Playwright E2E** for SINGLE -> Ryuko -> STORY / ROUTE 2 using keyboard/Enter, Escape back, route entry and a B.R. choice. Keep it independent of Google auth and HPA-768.
- [ ] Run actual validation, record command outputs in this PR, and fix any failures **in this same PR**:

```sh
bun run validate
bun run build
bun run e2e
```

- [ ] CI skips draft PRs here. Do not interpret a Cloudflare preview build as successful unit/E2E tests. Mark ready for review only when implementation, documentation and verification are complete.

## End-to-end acceptance criteria

Keep manual checks focused rather than repeating an identical full matrix on every browser. All intended target platforms still have a product-level acceptance check:

- [ ] **macOS (Chrome/Chromium):** complete SINGLE -> fighter -> mode -> route keyboard navigation, attack/Enter select, two-step Escape back, session remembered selection and at least one STORY and one B.R. route. Compare signs/arrow/dimmer and chosen-mode header with the Linear `mode-select.png` mockup.
- [ ] **Windows (Edge):** short keyboard E2E smoke confirming the same two-step flow reaches a route, Escape and Menu->Character select work, VS/TEAM VS are unaffected, and a brief visual comparison against the Linear mockup.
- [ ] **iOS (Safari, portrait and landscape):** directly tap each sign, navigate via on-screen arrows and punch confirm, check both route screens fit the canvas and the signs/1P arrow visually match the mockup. Use the normal UI to return and choose another route.
- [ ] **Gameplay regression across relevant runs:** excluded CPU-only and boss stories start without the selector; a chosen route begins its original demo/battle rather than Chii, and Continue/retry, cheat-run reset and later brawl completion work.
- [ ] **CI-only platforms:** no manual Android or Linux acceptance; rely on automated CI/Playwright regressions there.

## Review-ready definition

- [ ] No `modeRoutesOf`/duplicate jump logic, no extra model or scene framework.
- [ ] `Story` controls route selection; `ModeSelect` is a `Screen` inside the existing scene union.
- [ ] Only six needed sign images in `boot.bin`; no new assets, SFX, binary outputs or extra art PR in the coding work.
- [ ] No leftover, unreachable Chii-specific `Match` rules; evidence retains the original source behavior.
- [ ] All new flows fit the actual Linear mockup and work with keyboard and touch.
- [ ] **One HPA-765 PR** contains code, documentation and test results. HPA-766, HPA-770, HPA-772, HPA-858 and HPA-771 remain separate.
