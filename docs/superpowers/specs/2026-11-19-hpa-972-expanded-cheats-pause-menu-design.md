# HPA-972 — Expanded cheats, full pause Menu and fighter summoning — design

**Linear:** https://linear.app/cwchanap/issue/HPA-972/expand-cheat-mode-new-pause-menu-more-cheats-and-summoning-fighters  
**Status:** Planning only. Implement this specification in this same draft PR; do not open a second implementation PR.  
**Baseline:** `main` at `d7e98cfe34bc9a193f34dae03d13441c02da3ac0` (2026-11-19).  
**Dependencies:** HPA-767 cheat mode and HPA-971 authored EN digits are done. The art files `art/hud/en-{700,800,900,1000}.png` already exist.  
**Visual reference:** HPA-972 Linear Resources, `menu-a-pause.html` and `summon-and-hp-bars.html`. They are reference HTML mockups containing embedded game assets; do not commit or copy them.

## Goal and behavior

Replace the current narrow Menu with a full, responsive pause overlay styled after the Controls guide. The Match tab manages the current settings; the Cheats tab exposes all requested cheat controls. Add an in-match summoning overlay that spawns a CPU enemy or ally without changing the original victory conditions. Preserve the existing browser-only preferences and the battle-start snapshot model: edited cheat values apply **at the next match/battle begin**, except an explicit summon command that adds a fighter immediately.

This is an expansion of the existing Svelte + Phaser + pure TypeScript Match code, not a new game-state, plugin, rules-engine or settings architecture. No account/backend changes, no storage migrations, no new artwork or SFX, no HPA-1035 B.R. LONG or HPA-770 B.R. CHAOS feature work, and no changes to native gameplay with cheats disabled.

## Pause Menu UI

Extract the existing dialog into **one `src/Menu.svelte`** (Match tab, Cheats tab and alternate Summon content). `src/App.svelte` retains the game session/status wiring and opens that component. Reuse scene `setModal(true/false)` to hold gameplay and sound, without nesting dialogs.

- **Appearance:** full-window translucent/dimmed view of the paused arena; Controls guide's Exo 2 display font, Barlow Semi Condensed text, navy cut-corner panels, gold chrome heading and hazard stripe; actual character portrait tiles from `public/assets/select/13.png`. Extract shared tokens/typography and reusable chrome styles from `src/instructions/page.css` into one scoped shared CSS module rather than duplicating it. Do not commit game assets extracted from the Linear mockups.
- **Desktop layout:** top “◀ Back to game” and MENU heading; left navigation for Match, Cheats, Controls ↗ and Profile ↗; right scrolling content panel; bottom contextual help/keyboard legend. Use the visual proportions in `menu-a-pause.html` as a guide rather than hard-coding screenshot coordinates.
- **Phone layout:** tabs become a horizontally scrollable row above the content panel; options and cheat groups stack; the panel scrolls without clipping the header, controls, or dismissal affordance.
- **Match tab:** Opponent Vs. CPU / Practice with the existing practice-partner choices; 1P and 2P face/name cards with left/right roster stepping and Enter to character-select grid; Stage with preview thumbnail and stepper; Music, Enemy HP bars, practice-only Max stock and Low health; Character select. Continue to use the existing scene setters/reset behavior (including changes that restart a match).
- **Cheats tab:** master on/off, count of non-default cheat fields **excluding the master switch**, and Reset all; groups “You · 1P”, “Low HP · 1P”, “Partners & enemies”, “B.R. modes”. Controls are switches or bounded steppers; changed values are visually distinguished in gold. Max EN shows the actual stock-digit art. Show the message that values take effect next match/battle, while summoning operates now.
- **Navigation:** Q / E switch the two local tabs; Up / Down focus rows; Left / Right alter a stepper/switch; Enter activates a button or opens the fighter grid; Esc closes. Pointer and touch target the same underlying actions. Prevent keys from leaking into Phaser. Controls and Profile remain links (retain current configured/unconfigured Profile behavior, identity refresh and new-tab behavior).
- **Focus:** one small view-state model for tab, selected row and summon selection, with an accessible label per control. Closing restores canvas focus and the prior pause state. Opening the modal never advances the simulation.

## Cheat settings and semantics

Keep `CheatOptions`, defaults, `normalizeCheats` and the small pure `enGainOf(stocks)` helper in `src/game/cheats.ts`; `App.svelte` owns device persistence, `TrainingScene.pendingCheats` holds the next-battle values, and `Match.useCheats` snapshots once in `begin`. Existing localStorage data need not be migrated. Convert the old 1–6-stock `playerEnLimit` setting to a clearly named **hundreds-of-EN value**, e.g. `playerMaxEn`, 100–1000 by 100, default 300; effective stock cap is that value / 100. Keep native per-stock values (including DoraEmon's) unchanged.

| Group | Field / display | Default | Valid range and behavior with master enabled |
| --- | --- | --- | --- |
| You | HP × | 1 | 1–100; scales 1P max/starting HP |
| You | Damage × | 1 | 1–100; scales positive 1P attacks on hostiles only |
| You | Max EN | 300 | 100–1000 in 100 steps; 1–10 stocks |
| You | Unlimited EN | Off | Existing 1P refill rule |
| You | Starting EN | Derived | Exactly once for round 1, when phase 1 begins (`roundTicks === fightTick`); in practice at the first active step. Set 1P stock to `maxStock - 1` and power to 0, regardless of intro grants; later rounds keep native carryover. No change with master off |
| You / enemies | EN gain speed | Derived | Positive EN fill uses `enGainOf(stocks) = max(1, 1 + (stocks - 3) / 2)` based on final effective stock cap: 3 → ×1, 5 → ×2, 10 → ×4.5; avoids treating DoraEmon's native 90-EN stock as 100 |
| Low HP · 1P | Low HP line | 30% | 0–100% of 1P effective max HP |
| Low HP · 1P | Damage cut × | 1 | 0–5; scales **reduction**, not damage: at native 40% reduction, ×0 gives no cut, ×1 gives 40%, ≥×2.5 caps at 100% |
| Low HP · 1P | Low-HP supers at any HP | Off | Bypass **only** verified, tabled low-HP super-gate source timelines for 1P, not other `life` events or HP0 guards |
| Partners & enemies | Partner HP × | 1 | 1–100; applies to all allies: story, B.R. and summoned partners |
| Partners & enemies | Enemy HP × | 1 | 1–100; applies to all hostile CPU fighters, including summoned enemies |
| Partners & enemies | Enemy EN stocks × | 1 | 1–5; effective enemy stock cap is min(10, base stock count × multiplier), including HPA-858 boss-route base |
| B.R. modes | No partner | Off | Omit the normal ally when a B.R. battle is seated; no effect in non-B.R. |
| B.R. modes | HP per kill | Game (null) | Optional integer **0–1000 native HP units** replacing a B.R. kill award to 1P; apply `lifeAmount` scaling when positive; `null` retains original and `0` skips `gainLife` |
| B.R. modes | EN per kill | Game (null) | Optional integer **0–1000 native EN units** replacing a B.R. kill award to 1P; `null` retains original and `0` skips `addPower` |

Use a bounded, nullable integer input for the per-kill amounts (0–1000, blank = Game). Preserve the distinction between 1P and striker: overrides apply only if **1P is the actual bonus recipient**; no overrides when the striker/ally receives the bonus. `lifeAmountOf(0, ...)` currently forces at least one HP, so **skip** the gain explicitly for override 0. Do not change awards outside B.R.

**EN gain assignment:** HPA-858 already gives a tough five-stock enemy `enGainMultiplier = 2`. Reuse `addPower`; the tough-seat setup, `cheatSeat` and `summon` must **assign** `f.enGainMultiplier = enGainOf(f.maxStock)`, never multiply an existing ×2. A tough 500-EN fighter remains ×2, not ×4. With cheat mode **enabled** even at otherwise default values, native five- and six-stock enemies (including bosses) also use ×2 and ×2.5 respectively as the Linear rule says enemies follow their own caps. With cheat mode **off**, preserve all native multipliers (including HPA-858's ×2) unchanged. Costs, drains and direct scripted stock grants retain their existing semantics.

**Low-HP line and gate identity:** parameterize `desperationOf(who)`'s native 30% threshold for **1P only** and derive it from effective `maxHp`; preserve exact native behavior at default 30%. Introduce a small per-fighter **low-HP super gate table** in `characters.ts` keyed by verified `sourceKey` timeline and source PC; document each as authored/fidelity evidence in `docs/evidence.md`. Populate from the generated source events, not guesses; unit-test that every table entry points to a `below` `life` event. Only gates in that table may bypass the check for 1P when the switch is enabled. A moved Low HP line also proportionally moves those tabled gates (relative to the default 30%); keep unrelated op 0x11 checks (including `value === 1` HP0 guards and demo branches) untouched. Include the SIN/SOU StandingVM paths where a verified gate exists.

**Low-HP damage:** the native scale `CHARACTERS[who].scale` is normally 60% damage taken (CHUNG 65%, ALPHA 45%). For 1P, `damageTakenRatio = max(0, 1 - (1 - nativeScale) * damageCutMultiplier)`. Retain native whole-point flooring except that a full 100% reduction must actually prevent damage. All other fighters remain native.

**Enemy HP bars:** a **live, session-local normal option**, default Off; follow the existing `Match.practice` / `TrainingScene.setPractice` path, **not** `CheatOptions` or a new storage module. It applies instantly to the current view and has no impact on combat. Show existing world-space bars for present, shown, living enemies, preserve native story-ally bars, and always show summoned allies' bars. Do not display bars for fallen/unentered seats.

## Authored EN digits and DOM publication

The four HPA-971 PNGs exist only in `art/hud/`. Include them as unique Phaser texture keys in the boot pack **and** publish their pixels as `public/assets/en/7.png` … `en/10.png` for HTML `<img>` use. The browser's DOM images cannot read Phaser's in-memory pack. `scripts/export_assets.py`'s `dom_art()` scans literal `dir/N.png` references to choose which files to publish through R2; define a literal App/Menu table for original digits (`ui/18.png` … `ui/23.png`) plus `en/7.png` … `en/10.png`, and literal stage thumbnail paths (no synthesized template strings that bypass the scan). Use `ASSET_BASE` for versioned URLs. Extend `dom_art()` to scan `src/Menu.svelte` if it is the source of those literals. Centralize authored-art inputs in one `AUTHORED_ART` tuple hashed by both `inputs()` and `exporter()`, then test the exported manifest and production image fetches. Generated assets and screenshots containing original art remain out of git.

## Summon during a match

- Available from the active game with **Ctrl + Backquote** when the Menu's master Cheat mode setting is enabled; `App.svelte` handles the shortcut through `<svelte:window>` using existing `GameStatus` (`ready && !winner && !selecting`) and `cheats.enabled`. No scene→Svelte callback. One open dialog displays the summon grid. In-flight/loading/finished matches and selection/demo screens cannot summon. In-dialog WASD/arrows navigate; Tab switches Enemy/Partner; G/Enter confirms; Esc closes; pointer/touch actions are equivalent. Exclude TRAINING from the fighter list.
- Entering Summon freezes the active fight and sound with `setModal`, preserving the prior pause state. The scene exposes one `summon(who, side): Promise` method: reuse `loadPlayer` + `load.once(Phaser.Loader.Events.COMPLETE)` and then `Match.summon` + `growFighters`; **never** the whole-match `whenReady`. Handle loading errors, cancellation, and stale match/closed modal by doing no spawn; preserve the original match and resume/pause state.
- `Match.summon(who, side)` appends a CPU fighter **after all original fighters**, using a `nativeCount` recorded when a round's native fighters are seated. Set `MAX_FIGHTERS = 10` and reject once the current count reaches ten (the game's palette and bit-mask paths have no automatic safe cap). Summons have full adjusted HP; allied to 1P and hostile to enemies, or hostile to 1P and the partner. Partner enters beside 1P; enemy at the far side. Give the new CPU `CPU_LEVEL`, `CPU_CONTROLS`, its fighter table and shared random source (`vm.shared = this.cpus[1]` where applicable); give stories a palette through `takePalette`, normal versus/practice palette 0; expand only required input, CPU, sprite and held pools.
- **Snapshot exception:** editing ordinary cheats after a battle starts remains pending. Summoning is an explicit current-battle action. If the user enables the master switch mid-battle, summon is permitted and uses the current menu's ally/enemy HP multiplier **only for the new fighter**, without re-scaling existing fighters; an already cheat-enabled battle uses its snapshotted multipliers for summon scaling. Either way, mark the current route/run cheated immediately.
- `driven(f)` must drive summoned CPUs independently of `cpuDriven` when phase 1 is active; practice with non-CPU dummy and Vs. single with human 2P must still animate summoned AI. Summoned fighters remain for that battle/round and are cleared when original fighters are reseated.
- Summons participate in combat targeting (`hostile`, `nearest`, collision/hit tests) but **not** native victory, story scoring, KO rewards or route progress. Keep one `natives` getter = `fighters.slice(0, nativeCount)`; use it in `enemiesOfOne` / `brawlEnemies`, all `storyResult` point and result loops, and the `over` point checks. Return before original story rewards in `knockOut` for summoned indices; the summoned fighter still gets its KO state and action. Native downed state can continue to update for every fighter. The current `storyResult` uses `slots[i]!`, so a summoned fighter must never reach those reads. Keep non-story result calculations on original `one` and `two`. Summoned hostiles never delay an original win; summoned allies never rescue a KO'd 1P.
- Use existing `Match.lifeBars` and `scene.ts` world-bar renderer: summoned ally always shown, summoned enemy conditional on the normal Enemy HP bars option. Their HP bar follows position, proportional max HP and alive/visible state.

## Boundaries and integration

| Owner | Minimal responsibility |
| --- | --- |
| `src/App.svelte`, **`src/Menu.svelte`**, `src/menu.ts` | App owns session/status and the Ctrl+Backquote handler; one Menu component owns modal tabs/focus/rows, summons and pointer/keyboard UI; reuse localStorage cheats and existing auth links |
| Shared arcade stylesheet + `src/instructions/page.css` | Fonts/tokens/chrome shared with guide; responsive modal layout; no duplicated art |
| `src/game/cheats.ts`, `src/game/life.ts`, `src/game/characters.ts` | Pure option normalization and EN gain helper, low-life scaling, verified super-gate table (with evidence) |
| `src/game/match.ts` | Cheats at seat/battle start, EN gain, low HP, BR rewards/no-partner, CPU summon and original-outcome isolation |
| `src/game/scene.ts` | Begin snapshots, existing modal pause, one promise-based `summon` method using the current pack loader, sprite growth and world bars |
| `src/game/hud.ts`, `scripts/export_assets.py` | Map stock 7–10 to authored art in the boot pack **and** versioned public DOM paths; scan literal Menu paths and hash the art |
| Existing Vitest + Playwright suites | Pure deterministic Match coverage and real built-browser flows |

Keep battle/gameplay business logic in `Match`, not in the Svelte UI or Phaser drawing layer. Existing story/route behavior is the ground truth when master is off; do not introduce a generic modifier registry, global event bus, account profile state, complex cache, or new dependency.

## Acceptance contract (implemented within the same PR)

1. `bun run validate` and `bun run e2e` pass; update the existing menu smoke tests when replacing the old DOM/serialized settings.
2. Deterministic Vitest coverage for **every cheat rule** in the table: master-off parity, all relevant numeric boundaries and reset defaults, initial EN and gain (including tough 500 → ×2 rather than ×4), native vs 1P-only low HP and super gates, next-battle snapshot/round reuse, BR-only bonuses and no-partner, enemy HP bars, spawn hostility/limits, and original native result isolation.
3. Automated browser end-to-end journeys show the Menu boots, navigation/links work, values persist across reload but only change the next battle, new digits 700/800/900/1000 render, and a summon opens, seats a CPU fighter, pauses/resumes correctly and marks the run cheated.
4. **Browser MCP visual acceptance:** at **1280 × 720** and **390 × 844**, inspect screenshots of Match tab, Cheats tab and Summon overlay (plus a post-summon battle with enemy bars enabled), comparing fonts, source tiles, cut corners and no clipping against the two Linear HTML mockups. Attach screenshot evidence to the **PR**, never commit original-game screenshots to `docs/evidence.md` or `.playwright-mcp/`; no human sign-off criterion.
5. **Browser MCP end-to-end acceptance:** on one platform, run a focused real-browser journey from an active match through Cheat enable → Summon (enemy and ally) → updated status/HP bars → dialog close and pause restoration; verify navigation, no console errors and the original match continuing. Use deterministic `Match` tests to assert complete native win/loss and stage progression rather than slowly driving complete fights with browser automation; use CI Playwright for repeatable full menu/summon journeys. No second platform unless a platform-specific change is made.
