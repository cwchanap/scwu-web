# HPA-765 — Quick mode select after picking a fighter — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-765/quick-mode-select-after-picking-a-fighter
**Design:** `docs/superpowers/specs/2026-11-11-quick-mode-select-design.md`
**Status:** planning only, not implemented or validated.
**Delivery:** **one PR for HPA-765**. Implement the tasks below on this draft branch; do not open implementation PRs for the individual phases.

## Scope and current repository facts

This replaces **only the original Chii sign-selection battle** after an eligible fighter is selected in SINGLE. It does not change VS, TEAM VS, combat physics, scenarios' exported JSON, their later battles, or the Continue screen. All art comes from existing game packs. HPA-772 is a separate art-only ticket for future B.R. CHAOS lettering; do not mix that work into this PR.

Relevant current entry points:
- `src/game/select.ts`: `CharacterSelect` waits about 101 ticks after a fighter confirms, then exposes `done`. The story version sets `story=true` and has one 1P cursor. `StoryDemo` and `Continue` share the same scene screen path.
- `src/game/scene.ts`: `stepSelect` receives a finished character selection, creates `Story`, then calls `runStory(story.next())`. `TrainingScene.select` currently holds Title/CharacterSelect/StoryDemo/Continue; `drawSelect` paints the exported select backdrop. `open` and `whenReady` already guard stale loads. Escape currently sends a CharacterSelect back to the title.
- `src/game/story.ts`: `scenarioOf` supplies generated per-fighter steps; `Story.next` interprets step jumps on native-life thresholds and lost rounds, while `Story.retry` supports Continue. In the Ryuko fixture, step 0 is the Chii sign battle and the four route entries are 4/21/47/62. Some fighters' jump locations differ.
- `src/game/packs.ts`: `selectAssets` defines resident select images; `scripts/export_assets.py`'s `export_packs` mirrors its partition to produce `boot.bin`. Pack tests enforce exact membership and no duplicate image keys.
- `src/App.svelte`: the virtual touch buttons call `scene.control`; their visibility currently depends on the selected fighter's moves. The initial `GameStatus` object is duplicated here.
- The repository's generated scenarios, original artwork and pack binaries are not committed. `bun run assets` needs the established handoff/CI input.

## Phase 1 — Pure route discovery and mode selector

**Create:** `src/game/modeSelect.ts` and `src/game/modeSelect.test.ts`.
**Modify:** `src/game/story.ts`, `src/game/story.test.ts`.

- [ ] Define a small, typed route id union: `story-easy`, `story-hard`, `br-zero`, `br-another`. Keep menu steps/choices/last-picked values as simple data; no generic state-machine library.
- [ ] Add `modeRoutesOf(who)` that derives the four route starting step indices from the fighter's **own** opening Chii battle and the associated life/jump branches. Handle displaced/extra opening jumps (notably YINAN and AYA); do not assume every fighter has Ryuko's steps 1–3 or numeric HP thresholds.
- [ ] Match mode-select eligibility from the original sign-battle shape and four meaningful destinations. Explicitly preserve the current skip behavior for the four bosses (ZENKA, ALPHA, SHIN-Z, DoraEmon) and fighters without an opening sign choice (e.g. GOLF). Do not return a fake four-route selector for other prologue battles.
- [ ] Verify that ROUTE 1 maps to Easy and ROUTE 2 to Hard from the original sign/branch behavior. Use Ryuko's 4/21/47/62 regression and run the same four-way discovery against each eligible scenario. Fail tests if an expected fighter has duplicate, missing or out-of-range targets, rather than silently inventing route indices.
- [ ] Add `Story.startOnRoute(route)` (or an equivalent one-method entry) that positions `step` before the chosen source route and then uses `next()`; leave `next` and `retry` authoritative for all follow-up battles, demos and Continue decisions. Preserve the existing unmodified `Story.next()` for excluded fighters.
- [ ] Implement the minimal two-step selection model: move/wrap, confirm, Escape/back, one remembered mode and last route per mode for this browser session. Start with STORY / ROUTE 1; remember a choice only after confirmation. Prevent a held button from selecting more than once across a step transition.
- [ ] Unit test each menu outcome, remembered choices, skipped fighters, first demo/battle on each selected route, and later retry/continue semantics. Include the special YINAN/AYA branch layout and RARIO/Z-MEGA in the source-derivation matrix.

**Checkpoint:** `bunx vitest run src/game/modeSelect.test.ts src/game/story.test.ts`.

## Phase 2 — Resident art and Phaser rendering

**Modify:** `src/game/packs.ts`, `scripts/export_assets.py`, `src/game/packs.test.ts`, `src/game/scene.ts`.

- [ ] Extend the two mirrored boot subsets with **ZAKU and PAC-HELO image indices 8001, 8004, 8005, 8006**. Do not move any of these images into an additional pack or manually copy their binary sources into the repository. UI image 170 is already part of the select UI. Ensure `unloadPlayers` retains all selector images via `selectAssets`.
- [ ] Add targeted pack tests that `boot.bin` contains all eight keys exactly once and no fighter-rest pack duplicates them; keep the existing full partition tests green.
- [ ] Keep the exported select background/character portrait visible and dim it **in Phaser** while the selector is active. Use source-size-aligned sign sprites with a small highlighted scale/tint, dim inactive signs, a bobbing 1P arrow above the lit sign, and the selected mode's smaller sign at the top of route step. Treat the ticket's three-frame mockup as the visual target; ignore the future CHAOS placeholder.
- [ ] Use one set of data-driven sign rectangles both for layout and pointer hit-testing, converting between Phaser's game coordinates and rendered scale. Keep overlay sprites in a small dedicated pool and hide/reuse them on cancel, mode change or story start; do not interfere with `drawSelect`'s existing sprite pool.
- [ ] Keep the menu visually distinct from the Svelte floating settings Menu. Do not create new SVG, image, audio or text-rendered substitutes for the original signs.

**Checkpoint:** pack tests; manually inspect the selector against the HPA-765 mockup in a locally built browser.

## Phase 3 — Integrate scene navigation, keyboard and touch

**Modify:** `src/game/scene.ts`, `src/game/scene.test.ts`, `src/App.svelte` and any focused E2E test.

- [ ] When `CharacterSelect.story` finishes, invoke route discovery. If eligible, hold its already-drawn select backdrop and activate the two-step model, **without** starting `Story.next()` and without loading or spawning the original Chii battle. Otherwise use the existing direct story path unchanged.
- [ ] Feed fresh control presses to the model before the finished `CharacterSelect` can consume them. A/D, W/S, arrow keys and touch arrows navigate; G/H/J/K or another supported attack and Enter confirm. Dispatch Escape to the model before the existing character-select/title/pause handling, and keep all prior Escape semantics elsewhere.
- [ ] On final confirmation, store the current fighter's palette/`storyHeld`, reset `runCheated` for the **newly chosen** route (HPA-767 behavior), create one `Story` instance, call its start-on-route entry and hand the result to existing `runStory`. Route starts may load a demo first; honor existing `wanted` / `demoRequest` cancellation and prevent repeated activation during load.
- [ ] Add `choosingMode` to `GameStatus`, `initialStatus` and Svelte's initial literal. Keep `selecting` true; do not change `Match.mode`. While choosing, expose the touch arrows and at least one select/attack button regardless of the chosen fighter's attack list. Reuse existing `scene.control` for the touch pad, plus direct Phaser sign taps.
- [ ] Ensure Escape from route returns to mode; Escape from mode returns to the same fighter select context; pressing Escape/Enter elsewhere does not change title, VS, TEAM VS, demo or gameplay behavior. R should remain a reset/title shortcut.
- [ ] Test transition from SINGLE select to model to each `Story` route; special-story bypass; click/tap/virtual input; held-button release across transitions; event cancellation while the next story demo/battle loads; `status.choosingMode` and sticky `runCheated` semantics after a route begins.
- [ ] Keep the new model and UI lean; no router, modal framework, persistence, new Worker endpoint, generic scene controller or backward-compatible branching layer.

**Checkpoint:** `bunx vitest run src/game/scene.test.ts src/game/select.test.ts src/game/modeSelect.test.ts` plus `bun run check`.

## Phase 4 — End-to-end test, authored docs and PR verification

**Create or modify:** `e2e/unconfigured/mode-select.spec.ts` (or the nearby existing Playwright suite).
**Modify:** `docs/gameplay.md`, `docs/evidence.md`.

- [ ] Add a browser E2E smoke that enters SINGLE, selects Ryuko, sees two sign choices instead of a Chii battle, navigates via keys/Enter, goes back one step with Escape, chooses STORY / ROUTE 2, and observes a story demo/battle. Test a BR route too. Do not depend on Google auth or HPA-768.
- [ ] Run source-route integration tests for different fighters, including one whose original jumps differ, and for excluded CPU-only and boss characters. Check the Continue/retry flow without constructing an alternate story route implementation.
- [ ] Update `docs/gameplay.md`: SINGLE choice path, sign controls and routes, Escape/back, tap/touch, session remembering and skip cases; remove the statement that the first playable story battle is the Chii sign fight.
- [ ] Update `docs/evidence.md` to distinguish **authored** Phaser selector and route jump from original recovered Chii battle, and record the eight reused original sign images and 1P arrow.
- [ ] Before marking the **same PR** ready, run these commands and record actual results, not presumed results:

```sh
bun run validate
bun run build
bun run e2e
```

- [ ] GitHub Actions skips draft PRs in this repository; a draft with a deploy preview is **not** proof that checks passed. Retain draft status until implementation and complete verification are finished.

## End-to-end acceptance criteria

These are product-level checks on the web game, separate from the unit and CI checks above.

- [ ] **macOS — Chrome and Safari:** from title -> SINGLE -> Ryuko, the two-sign mode screen appears over the dimmed original select screen; navigation via A/D, W/S and arrows, activation via attack or Enter, and Escape backs through route -> mode -> character select. Four choices reach the correct Story Easy/Hard/BR ZERO/BR Another branches, without the original Chii sign brawl.
- [ ] **Windows — Chrome and Edge:** repeat the complete keyboard flow, including same-session remembered mode/route, nonselected sign dimming, unaffected VS/TEAM VS, and story Continue/Retry after losing a route battle.
- [ ] **iOS — Safari (portrait and landscape):** both signs remain visible and tap targets usable without horizontal overflow; tapping either sign chooses it; on-screen arrows and a confirm attack can also complete the two steps. Verify returning to the game via the Menu's existing Character select action and replaying the selection.
- [ ] **Visual mockup check — macOS, Windows and iOS:** compare rendered game frames with the Linear ticket's **mode-select.png**: original select backdrop and fighter artwork, darkened overlay, **real** ZAKU/PAC-HELO signs, active sign larger/lit vs inactive dim, moving 1P arrow, and smaller chosen-mode sign above the two route choices. Do **not** ship a B.R. CHAOS option or its placeholder art in this PR.
- [ ] **Regression on the same platforms:** a boss/CPU-only story without an opening Chii menu still starts directly; existing keyboard Esc-to-title outside the selector, Pause/Menu handling, VS and TEAM VS are unchanged; menu starts the selected route's original demos and lets the existing Continue screen retry its battles.

No Android or Linux **manual** acceptance is requested. Use the existing Linux CI, Vitest and Playwright runs for automated regression only.

## Review-ready definition

- [ ] Design matches the latest HPA-765 description and actual in-game mockup.
- [ ] Routes are derived from source jumps with no per-character mapping; no generated data files changed.
- [ ] Existing match/story runner and asset/load lifecycle remain the owners of gameplay.
- [ ] UI is Phaser-drawn, sign art comes from the boot pack and in-game touch controls remain sufficient.
- [ ] Implementation, tests and docs are in **this one HPA-765 PR**; HPA-766, HPA-770, HPA-772, HPA-858 and HPA-771 remain separate.
- [ ] Actual validate/build/e2e results are recorded before changing the PR from draft to ready.
