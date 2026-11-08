# HPA-767 — Cheat mode in the Menu — design

**Status:** planning only; implementation not started.
**Linear:** https://linear.app/cwchanap/issue/HPA-767/cheat-mode-in-the-menu
**Delivery:** one draft PR, extended with all code and tests before marking ready.
**Related:** HPA-771 consumes the cheated-run flag; HPA-768 Profile and HPA-770 BR CHAOS are separate work.

## Goal

Add an opt-in Cheats section to the existing arcade Menu. Settings live on this device, change only subsequent battles, and work in practice, Vs. CPU, TEAM VS, story, and future BR CHAOS through the same `Match` entry points. A cheated run is recognizable by the later Achievements feature.

Do not build a gameplay modifiers framework, cloud sync, an account dependency, or new art. Prefer the existing `Match` option pattern (`PracticeOptions`), `TrainingScene` as the scene owner, and the current Svelte dialog.

## User-facing contract

| Menu setting | Default | Allowed value | Effective behavior when Cheat mode is on |
| --- | --- | --- | --- |
| Cheat mode | Off | On / Off | Enables all authored modifiers for the next battle |
| Player HP | ×1 | ×0.5–×5 | Scale 1P's maximum and initial HP |
| Player EN limit | 3 | Integer 1–6 | Override 1P's stock cap, including fighters whose native cap differs |
| Unlimited EN | Off | On / Off | Start at the configured 1P stock cap and do not spend stocks; the cap still controls move eligibility |
| Enemy HP | ×1 | ×0.1–×5 | Scale initial/max HP for every CPU fighter hostile to 1P |
| Player damage | ×1 | ×0.5–×10 | Scale damage 1P deals to hostile targets, including chip and scripted opponent damage |

- Under the Cheat mode switch, display **“Changes apply from the next match or battle.”**
- Keep the five controls in the existing `src/App.svelte` Menu. Label the stock setting **“Player EN limit”** to distinguish it from the existing practice-only **“Max stock”** checkbox.
- Show the settings when cheats are off, but keep them disabled until Cheat mode is on; persist each value, even while off.
- Use simple numeric inputs: multiplier step 0.1, EN limit step 1, with the bounds above. Render labels and chosen values without a separate settings page.
- Keep the existing arcade colors, keyboard containment, native `<dialog>`, and profile row from HPA-768.
- No changes to 2P-controlled fighters or friendly CPUs; `Enemy HP` is based on hostility to seat 0, not “every fighter after index 0.” Passive practice dummies do not count as hostile CPU opponents; a CPU practice partner does.

Settings are saved to one browser `localStorage` key (`scwu.cheats`). Default values apply if storage is absent, inaccessible, malformed, or contains invalid fields. Read/normalize via a small pure helper, clamp finite numeric values, accept booleans only for switches, and write on changes. No migration/versioning mechanism or server API is needed. Loading saved settings must happen before the first displayed playable match, not only after the user opens the Menu.

## Chosen architecture and boundaries

### Small shared options model

Create `src/game/cheats.ts` containing `CheatOptions`, `DEFAULT_CHEATS`, and a pure normalization/parse helper. The UI owns browser storage calls; the model must never touch `window` or `localStorage`. Pass **one copied snapshot** of those options into each newly constructed `Match` (a trailing optional argument on the constructor and factory methods is sufficient). Do not place runtime Svelte state or Phaser objects in `Match`.

`TrainingScene` holds two distinct concepts:

1. `pendingCheats`: latest Menu values; changing these does **not** mutate `this.match`.
2. The effective, read-only `match.cheats`: values captured when the next match/battle is requested, also when a stage/fighter selection forces a reset.

For a newly loaded game, seed the first `TrainingScene` / initial `Match` from settings supplied to `createGame` by the UI. For later resets and story transitions, always capture the pending values when constructing the replacement `Match`, before potentially asynchronous `whenReady` asset loads. Superseded loads must not mark a run cheated.

`PracticeOptions` stays separate: its switches are live, practice-only behaviors. When both practice Max stock and cheat EN limit are enabled, preserve the opponent's existing practice refill and honor the 1P cheat stock cap; never let practice refill exceed the 1P limit.

### Health: one maximum per fighter

Today `lifeOf(who)` is read directly by `fighter()` initialization, `gainLife`, `perMille`, `Match.roundEnd`'s perfect check, `hud.ts`'s `healthCrop`, `scene.ts`'s world life bars, and `GameStatus.life`. Simply multiplying starting `hp` would cause inconsistent bars, over-heal behavior and false perfects.

Add a per-instance `Fighter.maxHp`, initialized to `lifeOf(who)` for normal fighters. While constructing each fighter or round entrant, set it to `Math.max(1, Math.round(lifeOf(who) * multiplier))` and start full. Apply `playerHpMultiplier` only to fighter index 0; apply `enemyHpMultiplier` only to CPU-controlled enemies hostile to 1P. This must also work for story reinforcements and TEAM VS member replacement, not just the first two fighters.

Route the generic max-life consumers to `f.maxHp`: healing caps, percentage / life bars, accessible `GameStatus.life`, and perfect-round detection. The general 30%-of-maximum desperation rule should follow `maxHp`; leave hard-coded source-script `life` opcode comparisons unchanged rather than rewriting recovered fighter data. Existing non-cheat results remain identical.

### EN stocks

The native `stocksOf(who)` cap currently appears in `addPower`, `runEvent`'s `stock` opcode, and the practice Max stock refill. Introduce one effective-stock-cap helper for the 1P, using `playerEnLimit` when cheats are enabled and the fighter's existing `stocksOf` otherwise. Keep other fighters' caps native.

All stock accumulation, spending and refill paths must respect that helper. For `unlimitedEn`, start/restart the 1P at its chosen cap and prevent stock deductions; normal move requirements are still checked against that cap. No negative stocks or values above six, including when carrying stocks to the next round or swapping a TEAM VS member. The existing `STOCK_OFFSETS` only has digits for 0–6; do not add a seventh value, image or art task.

### Outgoing damage

Keep source-derived hitbox, chip, combo and reaction behavior. At the point of *applying* damage to a hostile victim, multiply positive attack damage originating from 1P by `playerDamageMultiplier`, rounding to a whole HP (minimum 1 when original damage is positive, 0 stays 0). Cover:

- fighter attacks and owned effect/projectile hitboxes through `Match.hitTest`;
- scripted `power` events that deal life loss to another fighter;
- victim-scripted attacks attributed to an actual 1P striker (for example the `gonMiss` branch).

Do not scale 1P's own costs/self-damage, healing, opponents' damage, or source script literals. Leave the defender's usual reduction / desperation rule in place after the authored attack multiplier. Verify a blocked hit and a projectile in tests so only scaling the normal melee path cannot pass.

### Current battle, run cheating, and HUD

The **CHEAT** indicator reflects the effective `match.cheats.enabled`, not pending values. Render it as a small text label in the existing Phaser HUD (`createHud`), visible during the battle only, without generating an image or changing recovered art.

Add `GameStatus.cheated: boolean` as a forward-compatible contract for HPA-771. A *run* means one practice or Vs. CPU match, one TEAM VS match (possibly multiple rounds/fighters), or one complete story / BR route comprising multiple battles. Track `runCheated` in `TrainingScene` and OR it with `match.cheats.enabled` only when `begin(match)` actually starts a battle. It remains true across the rest of that route, including intervening demos, continue screens and later clean battles. Starting a new match or route resets it before recording the first battle. Returning to title and abandoning the route clears it; status reporting while showing a result must retain the mark for a future achievement consumer.

Separate `GameStatus.cheatActive` (optional, if needed for UI/debug) from `cheated`: switching the Menu off mid-battle cannot erase the current HUD tag or a run's recorded history. An enabled switch counts as cheated even if every multiplier is ×1. HPA-771 will suppress unlocks based on `GameStatus.cheated`; achievement persistence and unlock logic are **not** part of this ticket.

## Implementation touchpoints (verified on main)

- `src/App.svelte`, `src/menu.ts`, `src/menu.test.ts` — Menu state, controls, storage.
- `src/game/scene.ts`, `src/game/scene.test.ts` — `createGame`, `TrainingScene`, factory/reset/begin transitions, `GameStatus` and `onStatus`.
- `src/game/match.ts`, `src/game/match.test.ts` — `PracticeOptions` pattern, fighter health, `addPower` / `stock` event, scripted and hitbox damage, round/team/story construction.
- `src/game/hud.ts`, `src/game/hud.test.ts` — stock image limit, health crop, new CHEAT label.
- `docs/gameplay.md` and `docs/evidence.md` — document the new behavior as **authored** (not a recovered SCWU rule).

## Acceptance and verification

1. With storage empty or Cheats off, baseline HP, EN, damage, perfect checks and match flow remain unchanged for every character (including those with native 1/2/5/6 stocks).
2. Ryuko with Player HP ×2 starts with 1,020/1,020; heals stop at 1,020; health bar, accessibility meter and perfect check use 1,020.
3. Enemy HP ×0.1 affects hostile CPU enemies, including a later story reinforcement, but not a story ally. Player damage ×2 affects body hitboxes, projectiles, chip and scripted damage, but does not double self-harm.
4. EN limits 1 and 6 render valid stock digits; unlimited EN cannot spend or overflow; practice Max stock does not override the cheat cap.
5. Changing settings mid-battle changes neither its numeric rules nor its HUD indicator; the next battle uses the changed snapshot.
6. A story/BR route that started any battle with cheats on remains marked cheated even after cheats are switched off for later battles. A fresh match or route gets a fresh flag. Stale asset loads do not poison it.
7. Reload restores Menu values on the same device but does not restore an old run, and no identity or network API is accessed.
8. Add deterministic Vitest coverage for options, matching math and scene transitions; Playwright smoke checks toggles, persistence and the pending-settings hint. Complete `bun run validate`, `bun run build` and `bun run e2e` before moving this PR out of draft. The GitHub Actions workflows skip drafts, so local results must be recorded honestly.

## Deliberately out of scope

- HPA-771 achievements, icon art (HPA-769), HPA-768 profile/account UI and server storage.
- Cheat presets, codes, per-CPU editing, 2P cheats, live stat edits, alternative combat systems, or a reusable effect pipeline.
- Implementing BR CHAOS (HPA-770); its future battles must use the same scene-to-Match snapshot and run marker.
- New PNGs, sound effects, database changes, compatibility migrations, or unnecessary defensive infrastructure.
