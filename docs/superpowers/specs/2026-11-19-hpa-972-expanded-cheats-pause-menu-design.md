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

The existing Svelte `<dialog>` remains the modal/focus boundary; reuse the scene's `setModal(true/false)` to hold gameplay and sound. Use one modal overlay at a time (normal Menu or Summon), not nested dialogs.

- **Appearance:** full-window translucent/dimmed view of the paused arena; Controls guide's Exo 2 display font, Barlow Semi Condensed text, navy cut-corner panels, gold chrome heading and hazard stripe; actual character portrait tiles from `public/assets/select/13.png`. Extract shared tokens/typography and reusable chrome styles from `src/instructions/page.css` into one scoped shared CSS module rather than duplicating it. Do not commit game assets extracted from the Linear mockups.
- **Desktop layout:** top “◀ Back to game” and MENU heading; left navigation for Match, Cheats, Controls ↗ and Profile ↗; right scrolling content panel; bottom contextual help/keyboard legend. Use the visual proportions in `menu-a-pause.html` as a guide rather than hard-coding screenshot coordinates.
- **Phone layout:** tabs become a horizontally scrollable row above the content panel; options and cheat groups stack; the panel scrolls without clipping the header, controls, or dismissal affordance.
- **Match tab:** Opponent Vs. CPU / Practice with the existing practice-partner choices; 1P and 2P face/name cards with left/right roster stepping and Enter to character-select grid; Stage with preview thumbnail and stepper; Music, Enemy HP bars, practice-only Max stock and Low health; Character select. Continue to use the existing scene setters/reset behavior (including changes that restart a match).
- **Cheats tab:** master on/off, count of changed fields and Reset all; groups “You · 1P”, “Low HP · 1P”, “Partners & enemies”, “B.R. modes”. Controls are switches or bounded steppers; changed values are visually distinguished in gold. Max EN shows the actual stock-digit art. Show the message that values take effect next match/battle, while summoning operates now.
- **Navigation:** Q / E switch the two local tabs; Up / Down focus rows; Left / Right alter a stepper/switch; Enter activates a button or opens the fighter grid; Esc closes. Pointer and touch target the same underlying actions. Prevent keys from leaking into Phaser. Controls and Profile remain links (retain current configured/unconfigured Profile behavior, identity refresh and new-tab behavior).
- **Focus:** one small view-state model for tab, selected row and summon selection, with an accessible label per control. Closing restores canvas focus and the prior pause state. Opening the modal never advances the simulation.

## Cheat settings and semantics

Keep `CheatOptions`, defaults and `normalizeCheats` pure in `src/game/cheats.ts`; `App.svelte` owns device persistence, `TrainingScene.pendingCheats` holds the next-battle values, and `Match.useCheats` snapshots once in `begin`. Existing localStorage data need not be migrated. Convert the old 1–6-stock `playerEnLimit` setting to a clearly named **hundreds-of-EN value**, e.g. `playerMaxEn`, 100–1000 by 100, default 300; effective stock cap is that value / 100. Keep native per-stock values (including DoraEmon's) unchanged.

| Group | Field / display | Default | Valid range and behavior with master enabled |
| --- | --- | --- | --- |
| You | HP × | 1 | 1–100; scales 1P max/starting HP |
| You | Damage × | 1 | 1–100; scales positive 1P attacks on hostiles only |
| You | Max EN | 300 | 100–1000 in 100 steps; 1–10 stocks |
| You | Unlimited EN | Off | Existing 1P refill rule |
| You | Starting EN | Derived | After the intro's stock grants, 1P starts at Max EN minus 100 (one below max stock); no effect with master off |
| You / enemies | EN gain speed | Derived | Positive EN fill uses ×max(1, 1 + (effective Max EN − 300)/100 × 0.5); 300 → ×1, 500 → ×2, 1000 → ×4.5 |
| Low HP · 1P | Low HP line | 30% | 0–100% of 1P effective max HP |
| Low HP · 1P | Damage cut × | 1 | 0–5; scales **reduction**, not damage: at native 40% reduction, ×0 gives no cut, ×1 gives 40%, ≥×2.5 caps at 100% |
| Low HP · 1P | Low-HP supers at any HP | Off | Bypass the identified low-HP super prerequisites for 1P only, not unrelated life-script checks |
| Partners & enemies | Partner HP × | 1 | 1–100; applies to all allies: story, B.R. and summoned partners |
| Partners & enemies | Enemy HP × | 1 | 1–100; applies to all hostile CPU fighters, including summoned enemies |
| Partners & enemies | Enemy EN stocks × | 1 | 1–5; effective enemy stock cap is min(10, base stock count × multiplier), including HPA-858 boss-route base |
| B.R. modes | No partner | Off | Omit the normal ally when a B.R. battle is seated; no effect in non-B.R. |
| B.R. modes | HP per kill | Game (null) | Optional nonnegative integer replacing the HP amount *awarded to 1P* per B.R. kill; null retains source amount, zero gives zero |
| B.R. modes | EN per kill | Game (null) | Optional nonnegative integer replacing the EN amount *awarded to 1P* per B.R. kill; null retains source amount, zero gives zero |

Use a bounded, nullable integer input for the per-kill amounts (choose/document one reasonable UI maximum rather than introducing a general validation framework). Preserve the existing distinction between the 1P and the striker: no overrides when a different fighter receives the kill bonus. Respect existing HP scaling when an HP award is applied. Do not change knockouts or awards outside B.R.

**EN composition:** HPA-858 currently sets a tough 500-EN fighter's `enGainMultiplier` to ×2. Reuse `addPower` and calculate the effective positive-gain multiplier from the **final stock cap**, rather than multiplying a new ×2 on top of the existing ×2; a tough 500-EN fighter must still gain at ×2, not ×4. Costs, drains and direct stock events retain their existing semantics. Turning the master switch off must leave original (including HPA-858 route-specific) behavior exactly unchanged.

**Low-HP logic:** derive 1P threshold from its effective `maxHp`, reusing `lifeMarkOf` conventions; the native low-life damage scale is `CHARACTERS[who].scale` (normally 60% damage taken, CHUNG 65%, ALPHA 45%). The effective damage-taking scale is `max(0, 1 - (1 - nativeScale) × damageCutMultiplier)` for 1P only. Preserve minimum whole-point damage conventions where native behavior requires them, except a full 100% reduction should actually prevent damage. Cover low-HP-only super checks in the event/op 0x11 path and SIN/SOU idle logic, without making all 1P scripted life tests unconditional.

**Other option:** “Enemy HP bars” is a normal option, default Off, stored separately from `CheatOptions`. It displays the existing small world-space life bars for currently present, shown, living enemies; preserve the current story-ally bars. A summoned partner always gets a bar even with this option off. Do not show bars for fallen or not-yet-entered seats.

## Summon during a match

- Available from the active game with **Ctrl + Backquote** when the Menu's master Cheat mode setting is enabled; one open dialog displays the summon grid. In-flight/finished matches and selection/demo screens cannot summon. In-dialog WASD/arrows navigate; Tab switches Enemy/Partner; G/Enter confirms; Esc closes; pointer/touch actions are equivalent. Exclude TRAINING from the fighter list.
- Entering Summon pauses the current scene and sound with `setModal`, preserving its preexisting pause state. Request the fighter's existing on-demand pack if missing; do not alter Match until the pack has loaded. Handle cancel/failed load by remaining in the dialog or closing safely without a partial fighter. Do not restart the match or reset its battle snapshot.
- `Match.summon(who, side, ...) ` seats an entirely CPU-controlled fighter, with full adjusted HP and existing per-fighter CPU data; allied to 1P and hostile to enemies, or hostile to 1P and the partner. A partner enters beside 1P; an enemy at the far side. Respect existing fighter/hostility-mask capacity and reject when full rather than silently overrunning an array. Update the existing Fighter/CPU/input/sprite pools only as required.
- **Snapshot exception:** editing ordinary cheats after a battle starts remains pending. Summoning is an explicit current-battle action. If the user enables the master switch mid-battle, summon is permitted and uses the current menu's ally/enemy HP multiplier **only for the new fighter**, without re-scaling existing fighters; an already cheat-enabled battle uses its snapshotted multipliers for summon scaling. Either way, mark the current route/run cheated immediately.
- Summoned fighters remain until that battle or Vs. round ends and are cleared on the next seat/round creation. They can attack and be attacked, but **must never change the original win/loss criteria, KO reward bookkeeping, stage progression, or result point totals**. Capture/identify native participant seats for those rules; summoned hostiles cannot delay an otherwise won original battle and summoned allies cannot keep a defeated 1P alive.
- Use existing `Match.lifeBars` and `scene.ts` world-bar renderer: summoned ally always shown, summoned enemy conditional on the normal Enemy HP bars option. Their HP bar follows position, proportional max HP and alive/visible state.

## Boundaries and integration

| Owner | Minimal responsibility |
| --- | --- |
| `src/App.svelte`, optional small Svelte component(s), `src/menu.ts` | Modal tabs/focus, rows, regular menu options, localStorage, summon grid, keyboard/pointer actions, existing auth links |
| Shared arcade stylesheet + `src/instructions/page.css` | Fonts/tokens/chrome shared with guide; responsive modal layout; no duplicated art |
| `src/game/cheats.ts`, `src/game/life.ts` | Pure option schema/normalization and focused numeric helpers |
| `src/game/match.ts` | Cheats at seat/battle start, EN gain, low HP, BR rewards/no-partner, CPU summon and original-outcome isolation |
| `src/game/scene.ts` | Begin snapshots, shortcut/callback to Svelte, pausing, async pack loading, sprite growth and world bars |
| `src/game/hud.ts`, `scripts/export_assets.py` | Map stock counts 7–10 to existing authored digit art; include files in boot-pack and export fingerprints |
| Existing Vitest + Playwright suites | Pure deterministic Match coverage and real built-browser flows |

Keep battle/gameplay business logic in `Match`, not in the Svelte UI or Phaser drawing layer. Existing story/route behavior is the ground truth when master is off; do not introduce a generic modifier registry, global event bus, account profile state, complex cache, or new dependency.

## Acceptance contract (implemented within the same PR)

1. `bun run validate` and `bun run e2e` pass; update the existing menu smoke tests when replacing the old DOM/serialized settings.
2. Deterministic Vitest coverage for **every cheat rule** in the table: master-off parity, all relevant numeric boundaries and reset defaults, initial EN and gain (including tough 500 → ×2 rather than ×4), native vs 1P-only low HP and super gates, next-battle snapshot/round reuse, BR-only bonuses and no-partner, enemy HP bars, spawn hostility/limits, and original native result isolation.
3. Automated browser end-to-end journeys show the Menu boots, navigation/links work, values persist across reload but only change the next battle, new digits 700/800/900/1000 render, and a summon opens, seats a CPU fighter, pauses/resumes correctly and marks the run cheated.
4. **Browser MCP visual acceptance:** at **1280 × 720** and **390 × 844**, inspect screenshots of Match tab, Cheats tab and Summon overlay (plus a battle after summoning with enemy bars enabled); compare layout, art, fonts, cut corners, legibility and no clipping against the two named Linear HTML mockups. Save screenshot evidence to the PR or `docs/evidence.md`; no human sign-off criterion.
5. Browser MCP E2E covers a full native fight and a full cheat-enabled fight on one browser platform; summon a partner/enemy and verify native winner/stage progression does not change; check keyboard and touch paths, pause restoration, and no console errors. Single-platform acceptance is enough because this is not a platform-specific game engine change.
