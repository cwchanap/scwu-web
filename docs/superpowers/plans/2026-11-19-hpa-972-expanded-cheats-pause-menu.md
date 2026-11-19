# HPA-972 — Implementation plan: expanded cheats, pause Menu and summoning

**Linear:** https://linear.app/cwchanap/issue/HPA-972/expand-cheat-mode-new-pause-menu-more-cheats-and-summoning-fighters  
**Design:** [2026-11-19-hpa-972-expanded-cheats-pause-menu-design.md](../specs/2026-11-19-hpa-972-expanded-cheats-pause-menu-design.md)  
**PR strategy:** **one PR only** for HPA-972. This draft contains the documents first; continue implementation, tests and review commits on this same branch, then mark this PR ready when the automated acceptance below passes. Do not create a second PR for coding.  
**Baseline:** `main` commit `d7e98cfe34bc9a193f34dae03d13441c02da3ac0`. No prerequisite artwork generation: HPA-971's four authored `art/hud/en-*.png` digits are already on `main`.  
**Mockups:** Linear HPA-972 → Resources → `menu-a-pause.html` and `summon-and-hp-bars.html` (HTML references; never commit them).

## Execution sequence within this PR

### 1. Pure settings model and numeric behavior

**Files:** `src/game/cheats.ts`, `src/game/cheats.test.ts`, `src/menu.ts`, `src/menu.test.ts`, `src/game/life.ts` if needed.

- Expand `CheatOptions`, `DEFAULT_CHEATS`, `normalizeCheats` to cover every field in the design table; rename the legacy EN property to an EN-hundreds cap (100–1000 in 100 increments), deriving 1–10 stocks. No backwards-compatibility translation of saved values is needed.
- Bound the new numbers and nullable per-kill fields without adding a settings framework. Keep master disabled as the default; retain edited values while disabled; make Reset all restore exactly the default model. Compute changed-count by comparison with defaults, excluding the master switch if the visual mockup expects the changed count to mean non-default cheat parameters.
- Keep the normal `enemyHpBars` flag distinct from cheats, default Off; persist it with a minimal browser-only options helper.
- Unit-test parse/normalize, boundaries, nullable “Game”, disabled-mode parity, reset and persistence. Update tests that assert the old six-field JSON exactly.

**Checkpoint:** pure tests pass and no browser or Phaser dependency enters `cheats.ts`.

### 2. Core Match rules (no UI in the engine)

**Files:** `src/game/match.ts`, relevant `src/game/*test.ts`, `src/game/scene.test.ts` only for scheduling.

- Preserve `TrainingScene.begin() → Match.useCheats()` and its once-only frozen snapshot. Extend `cheatSeat` for 1P/partner/enemy maximum HP and stocks. Multipliers operate on the effective route base, so the HPA-858 tough enemy still scales correctly and never compounds twice on round reseating.
- Apply the new 1P starting-stock rule **once after the intro's initial grants** (not every tick) and on a fresh battle/round as specified; do not overwrite the native introduction when cheat mode is off.
- Derive positive `addPower` gain multiplier from final effective EN cap; keep native HPA-858 tough 500-EN ×2 and prevent an accidental ×4. Keep spends/drains unchanged. Test 100, 300, 500, 1000, stock caps and tough-seat composition.
- Use effective max HP to calculate low-HP line, 1P damage cut multiplier, 0%/100% thresholds, and explicit low-HP super gates; scope special bypasses to 1P and genuinely desperation-only tests. Cover SIN/SOU idle cases and CHUNG/ALPHA native damage scales. With master off, compare to existing native behavior.
- For a B.R. battle, optionally exclude the normal partner at seating without corrupting story slot/jump indices. Replace only 1P's own HP/EN KO awards when nullable values are set, keeping the native payer, units and all non-B.R. effects.
- Expose an explicit predicate/list for normal enemy HP bars rather than coupling this option to `CheatOptions`; preserve native story-ally bars.

**Checkpoint:** deterministic Match tests cover each rule and no extra scene wiring is required for combat calculations.

### 3. Summoning model and fight outcome isolation

**Files:** `src/game/match.ts`, `src/game/team.test.ts`, `src/game/vs.test.ts`, `src/game/scene.ts`, `src/game/scene.test.ts`.

- Add a minimal `Match.summon(who, side, ...) ` command (one method, not an entity system) that creates a CPU Fighter with native character data, correctly aligned hostility masks, ally/enemy positioning and full scaled HP. Mirror only the seat, CPU and input bookkeeping that the current `seat` / `storyFighters` / `nextRound` code already needs; reject when fighter/index mask capacity is exhausted.
- Explicitly tag or track added seats as **summoned**. Exclude them from original-side result/score computations, route advancement, KO payout, and native stage completion; retain them as valid attack targets. A native 1P KO still loses regardless of summoned allies, and all native enemies defeated still wins regardless of a living summoned enemy. Clear summon seats on a new Vs. round/battle.
- Extend `lifeBars` to include visible, alive summoned partners unconditionally, enemies conditionally and regular story partners as before. Keep a normal option in the scene for enemy bars without affecting combat.
- Add a narrow callback from the scene's **Ctrl+Backquote** event to the Svelte UI (no global event bus). Reuse `setModal` to freeze the fight. Load required fighter packs through the existing `PackFile` mechanism while frozen; only call `Match.summon` after successful load and then grow the scene sprite pool. Do not call the existing whole-match `whenReady` path if it would replace the current battle. Cancel/error must leave the fight intact.
- Allow summoning after the pending master switch turns on mid-battle while keeping all ordinary changes pending; scale only that newly summoned Fighter using the documented exception. Set the existing `runCheated` marker immediately and report it. Do not change any existing live fighter stats.

**Checkpoint:** tests cover ally/enemy masks, CPU activity, seat limits, no spawn outside active match, loader/cancel, round cleanup, life bars, cheated marker and both native victory/defeat invariants.

### 4. Extended EN art in the existing asset pipeline and HUD

**Files:** `scripts/export_assets.py`, `src/game/hud.ts`, `src/game/hud.test.ts`, `docs/evidence.md` only if needed for asset attribution.

- Add the four *existing* authored `art/hud/en-700.png`, `en-800.png`, `en-900.png`, `en-1000.png` to the generated boot pack under unique stable texture keys; do not modify or copy source game art into git.
- Update export input hashes/fingerprints so changing one digit causes the pack to rebuild; ensure no collision with original UI asset indices.
- Extend `STOCK_OFFSETS` / HUD texture selection for stocks 7–10 while preserving 0–6 and all gauge behavior. Expose the same digit assets for the cheat Max EN stepper; never render a missing texture at 700–1000.
- Validate generated pack entries and rendered HUD at boundary values. Generated R2/public packs stay untracked.

**Checkpoint:** image and HUD tests pass and a real browser shows 700, 800, 900 and 1000.

### 5. Replace Menu UI and add Summon UI

**Files:** `src/App.svelte`, `src/menu.ts`, new small presentation components **only if they materially simplify App**, a small shared arcade stylesheet, `src/instructions/page.css`, `src/instructions/Instructions.svelte` only for shared CSS import.

- Extract the already-used guide fonts/colour variables/panel/chrome rules once; retain the game's art reference paths. Build the responsive Menu layout per the Linear mockup with shared styles and a single focus-row/selected-tab model, not duplicated static HTML.
- Match tab delegates to existing scene setters. Add normal Enemy HP bars option; preserve existing profile identity/status handling, configured/unconfigured visibility, Controls links and canvas focus.
- Cheats tab renders grouped metadata-driven rows (not repetitive one-off code) with master switch, changed count, Reset all, numeric bounds and EN digit; editing persists to device and queues next battle only. Keep explicit help text explaining this timing.
- Summon overlay is an alternative content state of the **same dialog** with face-grid selection, Enemy/Partner toggle, loading/error state and keyboard/pointer/touch actions. Confirm requests the pack then calls the scene/Match command; dismiss restores the old pause state, including a pause already active before opening.
- Handle Q/E and arrow keys locally while dialog open; prevent battle shortcuts (G, E, P, R, Esc) from reaching the game. Layout adapts to narrow phones with top-row tabs, scrollable content and visible close affordance.

**Checkpoint:** desktop and phone screenshot comparisons against the attached mockups, plus keyboard/touch browser journeys, pass.

### 6. Automated regression and end-to-end acceptance

**Files:** `e2e/configured/menu.spec.ts`, `e2e/unconfigured/smoke.spec.ts` (and one small new summon spec if that is cleaner), relevant `src/game/*.test.ts`.

- Update existing tests that assume the old 400px dialog, old labels or six-field localStorage shape. Retain their gameplay, identity, pause and hydration coverage.
- Extend Playwright to navigate Match/Cheats, edit bounds, Reset all, verify reloaded preferences, verify changing a cheat during battle affects the **next** match only, verify missing Profile for unconfigured builds and identity behavior for configured builds, open Summon, choose enemy/partner, load and spawn, close and resume, and assert no browser errors.
- Drive the running built app through **browser MCP** for real E2E and visual inspection. Run a desktop scenario at **1280×720** and a mobile-sized scenario at **390×844**. Open the two Linear HTML attachments in the browser for visual reference, capture and compare Menu Match, Menu Cheats, Summon grid and post-summon battle with HP bars. Record comparison evidence/screenshots in the PR (or a lightweight `docs/evidence.md` entry if PR screenshot attachments are unavailable).
- With browser MCP, complete one normal fight and a cheat-enabled fight with summoned enemy and ally; verify pause/restoration, no crashes, original-side win conditions and route progression. Use one browser platform; no separate multi-platform repetition unless a platform-specific change is introduced.

## Definition of done — machine-verifiable acceptance

- [ ] `bun run validate` passes (assets, formatting, lint, typecheck, all Vitest).
- [ ] `bun run e2e` passes both configured and unconfigured Playwright projects; existing boot/menu/profile tests remain meaningful after the redesign.
- [ ] Every cheat in the design table has a deterministic pure Match test for its native/default behavior, enabled behavior and relevant numeric boundary. Specifically assert 500-EN tough enemies gain at **×2**, not ×4; 1P super override does not affect others; BR-only rewards/no-partner do not leak into native fights.
- [ ] At 700, 800, 900 and 1000, the boot pack contains the correct authored image, HUD displays it and Cheats Max EN renders it without missing textures.
- [ ] Summoned CPU allies/enemies have expected hostility, effective HP, life bars and battle lifetime; full/failed/canceled summons do not corrupt the Match. Native win/loss and KO rewards remain identical with and without summon additions.
- [ ] **Browser MCP E2E:** from a clean browser load, open the Menu, navigate with Q/E/arrows and touch, edit a setting, close, finish/start a fight, verify it takes effect on the next battle, reload and verify persistence. Start an active fight, summon Enemy and Partner with Ctrl+Backquote and the grid controls, verify cheated marker, correct pause restoration and original-side result.
- [ ] **Browser MCP visual screenshots:** compare at **1280×720** and **390×844** against Linear `menu-a-pause.html` and `summon-and-hp-bars.html`: Match/Cheats tab hierarchy, fonts/palette/face tiles, cut corners, changed-value highlighting, responsive tabs, scroll behavior, accessible controls, and in-arena enemy/partner HP bars. No clipped or overlapping controls. Evidence captured and attached/linked; no human approval step.
- [ ] No new art/SFX is generated; no backend/auth feature, migration, new runtime dependency, second PR, or generalized modifier system appears in the diff.
- [ ] Implementation, updated docs/tests and acceptance evidence are committed to **this same HPA-972 PR**. Keep the PR in draft until all checks are verified, then mark ready for review.

## Known watchpoints from the current code

- `src/game/match.ts` uses fighter indices and bitmasks for hostility while story scripts use `seats`/`slots`; summon must not accidentally change a native slot index or victory count.
- The existing HPA-858 tough-seat enemy has five stocks and `enGainMultiplier = 2`; combining the new cap-derived formula must not double-count it.
- Scene `setModal` intentionally remembers the pause that existed before the dialog; do not call `togglePause` on modal close.
- `src/game/hud.ts` directly indexes `STOCK_OFFSETS[f.stock]` and `ui-${17 + f.stock}` (currently only 0–6); new art must be packed before the UI can select it.
- Most fight E2E tests rely on asynchronous asset loading; reuse the existing Playwright server configuration and screenshots rather than introducing another test service.
- Preserve the behavior of HPA-768 Profile and HPA-1035/HPA-770 future B.R. routes by keeping game rules in Match and avoiding hard-coded menu branches based on named routes.
