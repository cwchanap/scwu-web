# HPA-765 — Quick mode select after picking a fighter — design

**Status:** planning only; implementation and verification continue in this same draft PR.
**Linear:** https://linear.app/cwchanap/issue/HPA-765/quick-mode-select-after-picking-a-fighter
**Mockup:** the three-frame `mode-select.png` attached to HPA-765 (Ryuko selected). Its B.R. CHAOS board is a placeholder for later HPA-770/772.
**Review:** 2026-11-12 — addressed findings 1–7 and the follow-up review's `storyScreen()`/palette call-site detail.
**Delivery:** one PR for design, implementation and E2E acceptance. No new art or SFX.

## Player experience

In SINGLE, selecting an eligible fighter now opens a quick, two-step mode selector instead of fighting the original Chii sign-battle:

1. **Mode:** STORY MODE or B.R. MODE.
2. **Route:** STORY offers ROUTE 1 (Easy) or ROUTE 2 (Hard); B.R. offers B.R. ZERO or B.R. ANOTHER.

The route starts immediately in the existing `Story` runner (its first demo or battle), never in the old Chii sign-fight. The selector is drawn in Phaser over the original, dimmed character-select backdrop. Use the actual source sign images: active sign lit and slightly enlarged, inactive dimmed, a moving 1P arrow above the selection, and the chosen mode's smaller sign above the route options. Match the Linear mockup; do not reproduce its future CHAOS placeholder in this ticket.

A/D, W/S, arrows and touch directions move; attack or Enter confirms. Tapping a sign selects it directly. Escape from the route step goes back to mode; Escape from mode returns to SINGLE character select at its remembered cursor. Escape on character select still returns to title; during gameplay it still pauses. Remember the last mode and its route for the **current page session only**. Default to STORY / ROUTE 1.

A story without the original opening Chii mode-select battle skips this screen and starts as before. This includes GOLF and CPU-only stories; ZENKA, ALPHA, SHIN-Z and DoraEmon keep their direct starts until HPA-858. VS and TEAM VS do not change.

## Route handling: reuse the existing jump interpreter

The original route choices are already recovered in `docs/evidence.md` (Globals) and exercised by `src/game/team.test.ts`, rather than an unsolved per-fighter graph-discovery problem. In Ryuko's opening battle Single Start first removes 1 life, and KOing the two chosen signs leaves:

| Selection | Further 1P life taken | Ryuko's life after the sign choice | Ryuko's route step |
| --- | ---: | ---: | ---: |
| STORY → ROUTE 1 (Easy) | 100 | 409 | 4 |
| STORY → ROUTE 2 (Hard) | 346 | 163 | 21 |
| B.R. → B.R. ZERO | 347 | 162 | 47 |
| B.R. → B.R. ANOTHER | 348 | 161 | 62 |

ZAKU supplies STORY, ROUTE 1 and B.R. ZERO; PAC-HELO supplies B.R., ROUTE 2 and B.R. ANOTHER. These labels and values are already verified by the source-based Chii battle test; the implementation does not need to rediscover them.

Add one closed `Route` type (`story-easy | story-hard | br-zero | br-another`) and a constant four-entry take table in `src/game/story.ts`. The small `Story.startOnRoute(route)` method positions the runner **after step 0**, then invokes its existing `next(lifeOf(who) - 1 - take[route], 0)`. Those native-life values recreate what the skipped sign-battle left for the actual per-fighter jump conditions. Do **not** build `modeRoutesOf`, an alternate jump interpreter, or a per-fighter target table. The real `Story.next` decides every fighter's route, including YINAN/AYA's extra lost-round gate and MASA/TIMES/Z-MEGA/RARIO's distinct route layout. `Story.retry`, Continue, all subsequent demos and battles stay unchanged.

Define one cheap `opensOnModeSelect(who)` predicate using `scenarioOf(who)[0]`: the opening step is a battle with the Chii ZAKU/PAC-HELO sign actors in its other seats, rather than an unrelated story's first battle. Require a plausible sign-battle shape (at least the two opponents; nonempty slots all use the sign actors) and test the full roster's eligible/ineligible results. This is the only eligibility special case, not a hand-maintained character allowlist.

The scene sets `storyLife = lifeOf(who) - 1 - take[route]` and `storyLost = 0` as the skipped battle would, and resets `runCheated` on **route confirmation** rather than on fighter confirmation. Route choice is a fresh run; no battle begins during the selector, and pending cheat multipliers must never affect this native-life selection calculation. There is no sign-battle `Match` and no need to synthesize an HP change.

### Globals: intentionally no synthetic writes

The menu **writes no session globals**. The skipped Chii battle would set globals 8/9/15, but the first route demos establish the global 10 state needed by their battles; demos D3/D4/D6/D18 clear 9, KGT 13 clears 15 at a new round, and TEAM VS alone consumes the other 8/9 behavior under its own global 3 rules. Do not mirror the skipped battle's stale global values or add a compatibility shim. Record the authored skip and source evidence in `docs/evidence.md`.

### Delete newly unreachable sign-battle code

Once all eligible SINGLE flows skip the Chii battle, the old mode-selection `Match` case is dead runtime code:

- Remove `Match.choosingMode`, its exceptional suppression in `brawlEnemies`, and the Chii-specific native-life exception in `cheatSeat`. Ordinary story brawls still use the existing all-hostiles-defeated rule; do not change their behavior.
- Remove the two `src/game/team.test.ts` cases that simulate the otherwise unreachable Chii sign battle, **after** preserving their recovered take/route observations in `docs/evidence.md` and replacing their user-flow coverage with the new all-fighter route test. Remove outdated Chii-specific comments in `match.ts` and gameplay docs.
- Do not remove generally applicable global, stage, versus or brawl logic simply because those tests mention global 10; scope deletion to sign-choice-only code.

This avoids two competing notions of `choosingMode`: `GameStatus.choosingMode` will refer only to the new interactive screen.

## Smallest screen integration

Implement `ModeSelect extends Screen` in the existing `src/game/select.ts`, beside `Continue`. Reuse `Screen.step`, `word()`, the press-edge/release latch from `Continue`, and module-local remembered picks as used by `Title.place` and `storyRemembered`. Do not create a second independent selector model or separate input router. It holds the completed `CharacterSelect` as `background` and steps that with no input so its backdrop remains animated; the scene draws the background objects and their chosen palettes underneath the dimmer. When the selector closes, `TrainingScene.open(...)` clears screen/loading state as it already does.

Reuse the original 1P arrow by spawning KGT action 84 (`LAYOUT.cursors[0]`) inside `ModeSelect`. Its exported sprite program already animates/bobs the arrow, so no new tween is needed. Only sign sprites and the dimmer require authored rendering, using one sign rectangle table for layout and scaled pointer hit tests. Draw the small selected-mode sign at the top of step two. Keep the current `drawSelect` sprite pipeline and palette lookup, extended only to compose `ModeSelect.background.objects` then `ModeSelect.objects`.

**Two existing scene call sites must recognize the wrapper:** in `drawSelectObject()`, resolve the source character select as `this.select instanceof ModeSelect ? this.select.background : this.select` when reading `drawn[o.owner]`, retaining the chosen fighter's palette beneath the dimmer. In `storyScreen()`, return true for `this.select instanceof ModeSelect` as well as existing story screens, so `report()` keeps `GameStatus.mode` consistent with an active story-selection flow rather than treating it as a finished/abandoned story. Keep `GameStatus.choosingMode` separate from `Match.mode`; neither call site needs a new subsystem.

`TrainingScene.select` adds `ModeSelect` to its current union. On completed story character select:
- If `opensOnModeSelect(who)`, open `ModeSelect` with that finished select screen and its selected fighter. Do not run the story yet.
- Otherwise, keep the present direct story start.
- When `ModeSelect` returns a final `Route`, preserve the select's existing palette/`storyHeld`, reset the cheated-run mark, create a `Story` and call `startOnRoute(route)` through `runStory`. Escape at the first step reopens `CharacterSelect(undefined, true)`, which already restores its remembered cell. Escape at the route step calls the screen's `back()`.
- Handle Enter and Escape only while `ModeSelect` is active, before the general pause/title branches. An initial no-input tick and the release latch prevent the character-pick key from also choosing a sign. Reset/Menu Character select uses the existing `open` navigation and cannot leave a detached model active.

Add `GameStatus.choosingMode` (default false) and keep `selecting: true` while choosing so the touch pad and Menu behave as on other selection screens; this is not a new `Match.mode`. For touch, make the existing Svelte `has()` show a minimum directional + punch/confirm pad for **any** `status.selecting` screen, rather than a special case only for ModeSelect. The touch press still calls `scene.control`. A sign tap uses the same screen choice transition, never an alternate route-start path.

## Resident assets: only six boards needed

Load the **six used signs** in the existing boot pack: ZAKU indices **8001, 8005, 8006** and PAC-HELO indices **8001, 8005, 8006**. The source image 8004 is a blank sign for later B.R. CHAOS art and is not shown by HPA-765; leave it in the fighter packs until HPA-770/772 need it. UI image 170 is already resident.

Mirror the three added indices per fighter in `src/game/packs.ts`'s `selectAssets` and `scripts/export_assets.py`'s `export_packs`. The existing `src/game/packs.test.ts` exact boot membership + one-key-in-one-pack checks catch TypeScript/Python drift; do not add redundant duplicate-membership assertions. Do not commit generated binary art or introduce additional packs, SVG substitutes, new sound effects, or a new renderer.

## Verification and boundaries

Automated tests:
- One scenario-wide test ensures each eligible story reaches four distinct, valid branch starts through `Story.startOnRoute`, with Ryuko steps 4/21/47/62, YINAN/AYA 6/23/49/64, and MASA/TIMES/Z-MEGA/RARIO 4/17/33/44 as fixtures. Assert excluded stories bypass the selector. Test a route's normal retry and Continue behavior.
- `select.test.ts` exercises the `ModeSelect` two-step behavior, session memory, press/release latch, Escape back and sign tap. `scene.test.ts` covers transitions, globals unchanged by menu, keyboard scope, loading cancellation, cheated-run reset, preserved background palette, `GameStatus.choosingMode` and correct `GameStatus.mode` during the selector.
- Keep the existing exact boot-pack tests plus normal source combat regressions; delete only old sign-battle-only test cases after recording their evidence.
- One Playwright E2E reaches a route from SINGLE with keyboard; a focused touch check exercises sign taps and accessible confirm controls.

Acceptance (manual scope kept short, but all target platforms represented):
- **macOS desktop Chromium:** full keyboard path (both steps and Escape), a route from each mode, and visual comparison against `mode-select.png`.
- **Windows desktop Edge:** short end-to-end keyboard and navigation/regression pass, plus visual sanity check; avoid duplicating the full macOS matrix.
- **iOS Safari:** sign taps, existing touch directions/confirm, portrait and landscape layout, plus visual comparison.
- Verify excluded stories still start directly; VS/TEAM VS, menu/back, normal story demos and Continue remain intact. Android/Linux require only CI coverage, not manual acceptance.

**Out of scope:** HPA-770 BR CHAOS, HPA-772 CHAOS sign art, HPA-858 boss routes, HPA-766 BR Another battle lineup, new images or audio, persistent preferences, auth/profile/achievements implementation, a scene state framework, a separate router, and compatibility support for the removed unplayable Chii battle.
