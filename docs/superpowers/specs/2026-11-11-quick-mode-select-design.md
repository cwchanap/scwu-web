# HPA-765 — Quick mode select after picking a fighter — design

**Status:** planning only; implementation and verification will continue in this same draft PR.
**Linear:** https://linear.app/cwchanap/issue/HPA-765/quick-mode-select-after-picking-a-fighter
**Reference mockup:** the three-frame mode-select.png attached to HPA-765 (Ryuko selected).
**Delivery:** one draft PR for spec, implementation and verification.
**Downstream:** HPA-770 (B.R. CHAOS) and HPA-858 (boss BR Another) depend on this flow. HPA-772 owns new CHAOS sign lettering as a separate art-only task.

## User-facing behavior

SINGLE still opens the original character-select screen. After an eligible fighter is confirmed and the existing select-close animation finishes, dim that screen and display a **Phaser-drawn, two-step mode selector** instead of playing the Chii sign-fight:

1. **Mode:** STORY MODE or B.R. MODE, using the original ZAKU/PAC-HELO sign images.
2. **Route:** STORY MODE offers ROUTE 1 (Easy) and ROUTE 2 (Hard); B.R. MODE offers B.R. ZERO and B.R. ANOTHER. The selected mode's sign remains smaller at the top. Confirming a route immediately enters that route's first story step (battle or demo), without the original sign battle.

On each step, a lit sign is slightly larger, other signs dim, and the original 1P arrow (UI image 170) bobs over the current choice. Do not introduce a DOM overlay or redraw the signs as text. Respect the mockup's composition and the select screen's existing art. The two-sign view may use approximately 1.2x source scale; adjust only for legibility in the running canvas, not to invent a new screen style.

Controls:
- A/D, W/S and arrow keys move between signs. An attack key or Enter confirms. A direct tap on either sign selects it. Touch navigation/confirm controls also work.
- Escape on the **route** step returns to the **mode** step; Escape on the **mode** step returns to SINGLE character select, preserving the character-select cursor. Escape elsewhere keeps its established behavior (character select -> title, gameplay -> pause). R keeps the established reset/title behavior.
- Reopening the selector in the same page session highlights the last confirmed mode and route for that mode. Default to STORY MODE / ROUTE 1 when no choice has been made. Keep only in-memory state; no localStorage or profile preference.
- The currently selected sign, not a second tap, is confirmed by a keyboard/virtual attack. A tap directly confirms the tapped sign, even if it was previously unselected.

Skip this menu for characters whose source story does not contain the opening Chii mode-select battle and its four route jumps, including GOLF and other CPU-only stories. ZENKA, ALPHA, SHIN-Z and DoraEmon retain their current direct stories until HPA-858. VS and TEAM VS do not change.

## Route discovery: source data remains authoritative

`src/game/story.ts` currently walks `scenarioOf(who)` with `Story.next(life, lost)` and a mutable `step`. For Ryuko, step 0 is the opening ZAKU/PAC-HELO sign battle, followed by life-threshold jump steps that choose first route steps **4 (Easy), 21 (Hard), 47 (BR ZERO), 62 (BR Another)**. The initial choice is not a distinct game mode; it is a branch of the same story. Other fighters do not necessarily put the jumps at identical step numbers (for example, YINAN and AYA); do not copy a Ryuko-only index table.

Add one pure story helper, such as `modeRoutesOf(who)`, that:
- Recognizes the eligible **opening sign battle** from that fighter's actual story steps (the ZAKU/PAC-HELO encounter), not just the existence of any battle at step 0.
- Resolves the four reachable route-entry indices from the opening branch and its life-threshold conditions, including fighters with a different entry-jump layout. Use the existing story runner's jump semantics or a narrowly scoped source-step walker; no hand-maintained per-fighter route table.
- Labels the no-damage/default branch Easy and the other three branches Hard, BR ZERO, BR Another in increasing sign-damage/decreasing native-life order. Validate the sign-to-branch ordering against the original evidence, especially ROUTE 1 vs ROUTE 2, rather than assuming a particular numeric threshold for all characters.
- Returns no selector for nonmatching scenarios. For an expected eligible fighter, missing/ambiguous/duplicate route targets must **fail focused tests visibly** rather than silently assigning the wrong mode. Do not rewrite or mutate generated scenario JSON.

Extend `Story` with a small start-on-route entry point, e.g. `startOnRoute(route)`, that positions its counter just before the chosen step and calls the existing `next()`. This keeps all later demo, battle, result, retry and continue behavior in `Story`; do not create a parallel BR/story runner or directly instantiate a match from a menu pick. The menu must bypass the sign battle entirely, not fake its outcome by starting it with special HP or cheat settings. Preserve any session-global state required by subsequent source demos, but do not synthesize an entire intro battle.

A successful route choice starts a **new run** for the HPA-767 cheated-run marker, just as today's story-select handoff resets it. Keep the selected fighter's palette and `storyHeld`, and preserve the current game's asset-load cancellation guards. The route is recorded at selection time for later HPA-771 achievements; that future event reporting is not part of this ticket.

## Small, explicit screen model

Prefer a tiny Phaser-free selection model (e.g. `src/game/modeSelect.ts`), containing:
- Current step (`mode` or `route`), available entries, highlighted index and session defaults.
- Pure move/confirm/back transitions, plus a final typed selection (`story-easy`, `story-hard`, `br-zero`, `br-another`).
- A single source of truth for sign texture keys and layout slots used by scene rendering.

`TrainingScene` owns the active selection model and renders it over the existing character-select backdrop. Keeping the current `CharacterSelect` screen visible but no longer advancing its completed input is acceptable and avoids reimplementing the exported select backdrop. In `stepSelect`, route input to the model **before** advancing `CharacterSelect` once it has been chosen. Do not let a held select attack trigger both the fighter pick and the first sign pick. On cancel, reopen the correct earlier step. On confirmation, build `Story` and enter its chosen route using the existing `runStory` / `whenReady` path.

Add `GameStatus.choosingMode: boolean` (false by default), keeping `selecting: true` while the selector is active so the existing Menu and touch controls remain usable. Add this field to `initialStatus` and the Svelte initial-status literal. Do not change `mode: Mode` or introduce a new combat mode; the two-step selector is an intermediate screen, not a `Match` variant.

Handle Escape and Enter **only while this selector is active** in the scene's keydown handler, before the existing Escape-to-title/pause branches. Keep the existing arrow/A/D/W/S and attack `Control` mapping. Process model navigation on press edges so held keys or scene transitions cannot skip two choices. Pointer hit-testing uses Phaser's scaled game coordinates and the same rectangles used to draw the signs. Keep the Menu dialog's keyboard containment intact.

`src/App.svelte` currently conditionally hides touch buttons based on fighter moves. While `choosingMode` is true, always expose navigation and at least one confirm control, even for unusual fighter move layouts. Reuse the existing virtual `scene.control` API, not another touch UI layer.

## Art and boot-pack contract

The original art already exists in the exported character files:
- ZAKU: image 8001 STORY MODE, 8004 blank pink, 8005 ROUTE 1, 8006 B.R. ZERO.
- PAC-HELO: image 8001 B.R. MODE, 8004 blank cyan, 8005 ROUTE 2, 8006 B.R. ANOTHER.
- UI image 170: the select-screen 1P arrow.

Add these eight sign image indices to `selectAssets` in `src/game/packs.ts` and the mirrored subset in `scripts/export_assets.py`'s `export_packs` so they are in **boot.bin** rather than requiring a new fighter-pack fetch just for the selector. Preserve the existing partition invariant: each image key is in exactly one pack, and unloading a fighter never discards required select/sign textures. Existing `src/game/packs.test.ts` covers exact membership; add targeted assertions for the eight sign keys and their absence from fighter remainders. `src/game/scene.ts` already knows their texture sizes through `CHARACTERS` and `selectSizes`.

The B.R. CHAOS entry is **not shown in HPA-765**. HPA-770 later adds it as a third B.R. choice, after HPA-772 supplies original-style lettering. No new images, SVG substitutes, SFX, stage, original source assets or generated binaries are committed in this ticket.

## Expected verification and boundaries

Automated:
- Pure route tests across every eligible `scenarioOf`: four distinct valid destinations with the correct signs; Ryuko's 4/21/47/62 is a regression fixture; YINAN/AYA and the special/CPU-only/boss bypass cases are explicitly covered. Running a route should return the first real demo/battle and preserve later retry/continue behavior.
- Selection-model tests for move, two confirms, separate remembered routes for STORY and BR, stepwise Escape, touch selection and prevention of double-confirm on held input.
- Scene tests for select -> model -> story, Escape/Enter scope, pointer and virtual controls, correct `GameStatus`, run-cheated reset at route choice, and cancellation of a pending battle/demo load.
- Boot-pack tests for all sign keys, no duplicate entries and no late fighter-pack dependency.

End-to-end acceptance after implementation:
- **macOS (Chrome/Safari) and Windows (Chrome/Edge):** pick a regular fighter in SINGLE; use keyboard direction, Enter/attack and Escape to visit both steps, launch all four routes, and return from the route step to the original character select. Confirm VS and TEAM VS remain unchanged.
- **iOS Safari:** verify both portrait and landscape scaling, direct sign taps, existing touch directions/attack and two-step Escape/back via keyboard where available.
- **Visual review on all applicable platforms:** compare against the ticket's mode-select.png mockup: original select background, dimming, two authentic signs, highlighted vs dim artwork, bobbing 1P arrow and small chosen-mode sign at the top of route step. Do not include the CHAOS placeholder as shipped UI.
- Validate that excluded characters start their own scenarios directly; a selected route never spawns a Chii sign battle; normal stage demos, Continue and cheat-run semantics still work.

This is a web feature, so no Android or Linux **manual** acceptance is required; Linux CI/browser automation provides their regression signal. Implement and test it in the **same one PR** as this spec.

**Out of scope:** HPA-770 BR CHAOS, HPA-858 boss BR routes, HPA-766 battle lineup/ten-seat work, HPA-772 art, VS/TEAM VS redesign, new/generated art or audio, persistence beyond this tab, account/profile/backend work, new routing/navigation frameworks and backward-compatibility adapters.
