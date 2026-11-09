# HPA-767 — Cheat mode in the Menu — design

**Status:** design in review; implementation not started.
**Linear:** https://linear.app/cwchanap/issue/HPA-767/cheat-mode-in-the-menu
**Delivery:** one draft PR for design, implementation and verification.
**Review update:** 2026-11-08 — addressed the two design reviews on PR #14.
**Related:** HPA-771 Achievements consumes the cheated-run flag. HPA-768 Profile, HPA-770 BR CHAOS and HPA-769 achievement art are separate tasks.

## Goal and user contract

Provide an opt-in Cheats section in the existing arcade Menu, with settings stored only in the browser. Rules apply **from the next match or battle**, not to an active battle; a CHEAT tag identifies battles that actually started with cheats on. Extend the existing Phaser-free `Match` model instead of adding a generic modifiers system.

| Setting         | Default | Range       | Effective behavior when Cheat mode is enabled                                               |
| --------------- | ------- | ----------- | ------------------------------------------------------------------------------------------- |
| Cheat mode      | Off     | On / Off    | Master switch; enabling it marks a started battle as cheated, even with neutral multipliers |
| Player HP       | ×1      | ×0.5–×5     | Multiply 1P's maximum and starting life                                                     |
| Player EN limit | 3       | Integer 1–6 | Override 1P's native stock cap                                                              |
| Unlimited EN    | Off     | On / Off    | Refill 1P's stock to the configured cap on every active simulation tick                     |
| Enemy HP        | ×1      | ×0.1–×5     | Multiply maximum and starting life of every fighter hostile to 1P                           |
| Player damage   | ×1      | ×0.5–×10    | Multiply positive outgoing attack damage from 1P to hostile targets                         |

- The five settings appear beneath the **Cheat mode** switch in `src/App.svelte`, with labels and current values, a clear separator from practice options, and **“Changes apply from the next match or battle.”** Keep controls disabled while the master switch is off, but retain their values.
- **Player EN limit** must not be confused with the existing live, practice-only **Max stock** checkbox.
- Reuse the Menu's native `<dialog>`, arcade styling, keyboard containment and Profile row. Use simple bounded number controls (multiplier increments of 0.1, EN increments of 1).
- Persist the whole options object under a single key (`scwu.cheats`) in `localStorage`. Absent storage, malformed JSON, invalid or non-finite numbers, and storage-denied browsers fall back to safe defaults. Use a pure parse/normalize helper; no migrations, sync or account API.
- Works in practice, Vs. CPU, TEAM VS and story; future BR CHAOS battles must use the same entry point. In this game 1P is the only human-controlled fighter, so **enemy HP includes passive practice dummies**: the target rule is `Match.hostile(0, i)`, not `practice.partner === 'cpu'`. Story allies are not hostile and remain unscaled.

## Minimal architecture

### Pure options and battle-start snapshot

Create `src/game/cheats.ts` for `CheatOptions`, `DEFAULT_CHEATS` and `readCheats(raw)`. Do not introduce a runtime Phaser or browser dependency in this module.

`TrainingScene` owns **pending** settings (updated by `setCheats(next)`); `Match` owns a copied, effective `match.cheats` snapshot. The only activation path is **`TrainingScene.begin(match)`**, immediately before gameplay starts, beside today's practice-option assignment:

1. `App.svelte` reads saved settings in `onMount` and, as soon as `createGame(host,onStatus)` synchronously returns its scene, calls `session.scene.setCheats(saved)`. It also writes settings on later changes. **No third `createGame` argument** and no extra constructor/factory parameters.
2. The scene may build a candidate `Match` in `reset` or `startBattle` while textures load. Only the accepted candidate reaches `begin`; there it calls `match.useCheats(this.pendingCheats)` once and captures a copy. A Menu change during a load applies to that battle **if the battle has not begun yet**; changes after `begin` only affect the next battle.
3. `Match.useCheats` configures fighter max HP/stock for all existing seats, including story reinforcements that have not entered. `nextRound` re-applies those **same effective settings**, never newer pending settings, when TEAM VS or ordinary rounds replace fighters. The placeholder `Match` on the initial title screen is not playable and needs no special setup.
4. Superseded `whenReady` loads already abort before `begin`, so they cannot activate a snapshot or mark a run cheated. Keep existing load-handling behavior; no new stale-load framework.

`PracticeOptions` remains live and practice-only, independent from the frozen cheat snapshot. Disable cheats to get exact native behavior.

### HP, life thresholds and HUD consistency

Add `Fighter.maxHp` with default `lifeOf(who)`. At `useCheats`, set each fighter's maximum to `Math.max(1, Math.round(lifeOf(who) * multiplier))` and start at that maximum. Use the 1P multiplier for seat 0; use the Enemy HP multiplier for every `this.hostile(0, i)` with `i > 0`; do not modify non-hostile allies. Reapply to newly created round/member fighters, and do not reset HP when a waiting reinforcement merely becomes visible.

Replace generic `lifeOf(f.who)` reads with `f.maxHp` for `gainLife`'s cap, `perMille`, `Match.roundEnd`'s perfect-round check, `hud.ts`'s `healthCrop` caller, `scene.ts`'s world life bars, and `GameStatus.life` (the accessible UI also consumes it). Keep character source data immutable.

**One proportional life-threshold rule is required.** Source-script thresholds are expressed in the character's unmodified/native life units; when health is scaled, their percentages must follow. Use one small helper for the comparisons:

`lifeMark(f, mark) = mark <= 0 || mark === 1 ? mark : Math.max(1, Math.trunc(mark * f.maxHp / lifeOf(f.who)))`

- Scale `loseLife`'s native `desperationOf(who)` damage-reduction threshold with `lifeMark`.
- Compare the `runEvent` `life` opcode and `resultEvents` `life` checks against `lifeMark(f, event.value)` rather than unscaled source literals.
- In `arrive`, compare `slot.below` against `lifeMark(watchedFighter, slot.below)`; an empty watched seat keeps its existing zero-life semantics.
- Practice **Low health** clamps 1P to `lifeMark(f, desperationOf(f.who)) - 1`, not to an unscaled 30% threshold.

Positive percentages are proportional; zero/negative sentinel thresholds are untouched. Preserve a literal **1 HP** sentinel as **exactly 1 HP** (e.g., OBJ TO SHIN HP0's absolute one-HP behavior), rather than silently turning “hold at 1” into “hold at 5” when max HP is ×5. This narrow exception keeps source-script survival logic intact. With Cheats off, `maxHp === lifeOf(who)` and these comparisons remain equivalent to native rules. Record the authored proportional reinterpretation explicitly in `docs/evidence.md` and test extreme multipliers (including Enemy HP ×0.1).

### EN, damage and per-tick behavior

Add `Fighter.maxStock`, initialized to `stocksOf(who)`; set **only 1P's** to `playerEnLimit` when Cheats are enabled. Replace native cap reads for dynamic fighters in `addPower(f, amount)`, scripted `stock` operations and the practice Max stock refill with `f.maxStock`. This avoids passing `Match` through the existing free `addPower` helper. The current `STOCK_OFFSETS` supports 0–6; no new texture or stock image is needed.

Implement **Unlimited EN** using the existing per-tick refill shape: when Cheats and Unlimited EN are enabled, at the active `step()` refill point, set `fighters[0].stock = fighters[0].maxStock` and `fighters[0].power = 0`. Do not intercept every source-script stock deduction or prime stock in constructors. An expenditure within a tick may still occur; the next active tick restores stock, preserving normal move eligibility and source logic. Cover round/team transitions and check that no rendered stock index exceeds six.

For damage, keep source hitboxes, chip, reactions and the defender's reduction. Use one small helper to scale only positive **1P-originated damage to hostile opponents** (round whole, minimum 1 when the unmodified hit is positive), before `loseLife`. The three needed routes are `hitTest` (melee, projectile, blocked chip), `runEvent` `power` on another fighter, and the striker-attributed `gonMiss` path. Do not scale self-damage, self-HP costs, healing, or another fighter's attacks.

### Cheated run and status contract

Add `GameStatus.cheated: boolean` for the future HPA-771 Achievements consumer. A run is one practice/Vs. CPU match, a TEAM VS match with all rounds, or an entire story/BR route with multiple battles.

- `TrainingScene.runCheated` ORs the effective `match.cheats.enabled` **only when `begin(match)` starts that battle**; it stays true across later clean battles, demos, Continue screens, and the final return to the title screen.
- Reset on a **new non-story match** in `begin`, or when a **new story route** is selected (the `select.story` branch of `stepSelect`). Do **not** clear on `openTitle`: the completed route's result must remain readable by a later Achievements consumer. A fresh run resets before its first battle.
- Render a small **CHEAT** text label in `createHud` only during a battle with **effective `match.cheats.enabled`**. It is independent of the pending Menu switch; turning that switch off in mid-battle cannot hide this match's tag or remove the run's mark.
- Do not add `GameStatus.cheatActive` — nothing needs it. An enabled switch marks the battle cheated even if all numeric values are neutral. HPA-771's unlock/persistence logic is out of scope.

## Touchpoints and verification

- `src/game/cheats.ts` and tests — pure options and defaults.
- `src/game/match.ts` and `match.test.ts` — `useCheats`, `Fighter.maxHp` / `maxStock`, `lifeMark`, three attack-damage routes, per-tick refill.
- `src/game/scene.ts` and `scene.test.ts` — scene-owned pending options, `begin`, route marker, `GameStatus.life`/`cheated`, world bars.
- `src/App.svelte`, `src/menu.ts`, `src/menu.test.ts` — Menu controls, browser persistence, original Profile/practice behavior.
- `src/game/hud.ts` and `hud.test.ts` — health crop, stock range and CHEAT tag.
- `e2e/configured/menu.spec.ts` and `e2e/unconfigured/smoke.spec.ts` — Menu/persistence smoke.
- `docs/gameplay.md` and `docs/evidence.md` — clearly label every new cheat rule and threshold scaling **authored**, not recovered.

Acceptance cases:

1. Cheats off or storage absent: preserve native combat values for all fighters, including native stock caps 1/2/3/5/6, native result thresholds and story timing.
2. 1P Ryuko at Player HP ×2 starts at 1,020/1,020; healing caps, life displays, perfect check and the 30% threshold follow the scaled maximum. Practice Low health clamps to just below its scaled threshold.
3. Enemy HP ×0.1 scales a passive practice dummy and a hostile story CPU/reinforcement, but not a story ally; no instant “below 30%” behavior merely from scaling the enemy's maximum. A literal one-HP script guard still tests 1.
4. EN cap 1 and cap 6 display valid 0–6 images, practice Max stock respects the cap, and Unlimited EN refills each active tick without exceeding it.
5. Player damage ×2 applies to melee/projectiles/chip and scripted opponent damage, but not to 1P self-damage or healing.
6. Changing pending cheats before `begin` (including during load) affects that starting match; after `begin`, the battle stays unchanged. A superseded candidate never starts a battle.
7. A cheated story route remains marked on the title/result screen even if subsequent battles are clean; a new route or new standalone match resets. The CHEAT tag reflects only the current battle's effective snapshot.
8. Stored settings survive reload on the device, while old run state does not. No backend, account or art work is added.
9. Before this PR is marked ready, run and report `bun run validate`, `bun run build`, `bun run e2e` plus focused playtests in practice, Vs. CPU, TEAM VS and story. Draft PR CI is skipped; a Cloudflare preview build alone is not test evidence.

## Out of scope

HPA-768 Profile, HPA-771 achievement unlocks, HPA-769 icons, HPA-770 mode/gameplay implementation, 2P cheats, per-CPU controls, presets, cheat codes, a modifiers framework, cross-device sync, extra server/database work, compatibility migrations, and generated images or sounds.
