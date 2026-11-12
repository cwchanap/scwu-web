# HPA-767 — Cheat mode in the Menu — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-767/cheat-mode-in-the-menu
**Design:** `docs/superpowers/specs/2026-11-08-cheat-mode-design.md`
**Status:** implemented on this branch; verification in progress.
**Review update:** 2026-11-08 — incorporated the six recommendations in PR #14's latest design reviews; 2026-11-11 — addressed the gameplay review.

## One PR, one implementation path

Complete all four tasks below **on this existing HPA-767 draft PR**. Do not create a PR per phase. HPA-768 Profile, HPA-770 BR CHAOS, HPA-771 Achievements and HPA-769 icon art remain separate. This ticket requires no new art/SFX task, database, auth changes or general modifiers engine.

The goal is the simplest extension of `Match`/`TrainingScene`: the pure model owns effective combat rules, the scene owns pending values and a cheated-run flag, and `App.svelte` owns only browser storage and Menu controls.

## Current repository facts

- `src/game/match.ts` has `PracticeOptions`, the nine-argument `Match` constructor, `Match.story`, `Match.team`, `fighter()`, `nextRound`, `loseLife` (four callers), `addPower`, `step`, `runEvent` and `hitTest`.
- `src/game/scene.ts` has `TrainingScene`, `setPractice`, `reset`, `startBattle`, `whenReady`, `begin`, `stepSelect`, `report`, `createGame` and `GameStatus`. The existing `whenReady` guard skips superseded loads before `begin`; both reset and story battles flow through `begin`.
- The initial scene opens on `Title`, so its placeholder `Match` is not stepped. `createGame` returns `{game, scene}` synchronously; avoid a new argument or threading options through Match factories.
- `src/App.svelte` owns the floating Menu's `<dialog>` and initializes `createGame` after dynamic import. `src/menu.ts` contains pure UI helpers, while `src/menu.test.ts` covers them.
- `src/game/hud.ts` has `STOCK_OFFSETS` for 0–6 only; `scene.ts` also draws world-life bars and reports `GameStatus.life`. Source fighter stock maxima vary.
- Verified E2E paths: `e2e/configured/menu.spec.ts` and `e2e/unconfigured/smoke.spec.ts`. `e2e/smoke.spec.ts` **does not exist**.
- `bun run validate` runs assets, formatting, lint, type checks and Vitest; `bun run build` and `bun run e2e` are additional. GitHub Actions skips drafts. Do not equate a Cloudflare Preview deploy with successful tests.

## Task 1 — Pure options, fighter maxima and health semantics

**Create:** `src/game/cheats.ts`, `src/game/cheats.test.ts`.
**Modify:** `src/game/match.ts`, `src/game/match.test.ts`.

- [ ] Define `CheatOptions` with `enabled`, `playerHpMultiplier`, `playerEnLimit`, `unlimitedEn`, `enemyHpMultiplier`, `playerDamageMultiplier`. Default `false, 1, 3, false, 1, 1`; multipliers bounded to HP 0.5–5, enemy HP 0.1–5, damage 0.5–10, EN integer 1–6.
- [ ] Implement pure `readCheats(raw: string | null)` and normalization for missing/invalid JSON, non-finite/out-of-range numbers, invalid booleans. No browser/global access in the model, versioning or migrations.
- [ ] Add `Fighter.maxHp` (native `lifeOf` default) and `Fighter.maxStock` (native `stocksOf` default); ensure tests/factories creating fighters still have native defaults without explicit cheat options.
- [ ] Implement `Match.useCheats(options)`. Make a defensive copy of normalized options once **before the first `step`**, set `match.cheats`, and configure all already-created fighters: seat 0 by Player HP and EN; every `this.hostile(0, i)` fighter (including the passive practice partner) by Enemy HP; leave allies native. Use `Math.max(1, Math.round(native * multiplier))` and initialize health to max. Waiting story seats are present in `this.fighters` already; do not reset their HP again when they appear.
- [ ] Keep `nextRound` using `this.cheats` to configure freshly created fighters and 1P's stock cap; preserve the original rules for round/team carryover, using capped values for 1P when cheats are active. Do not accept fresh Menu values until the _next battle_.
- [ ] Replace health max readers with `f.maxHp`: `gainLife`, `perMille`, `Match.roundEnd` perfect detection, HUD crop (integrated in Task 3), world bars and status (Task 3).
- [ ] Add a single `lifeMark(f, mark)` helper for thresholds expressed in **native HP units**: scale positive marks proportionally to the fighter's max, leave marks ≤0 and a literal 1-HP sentinel unchanged. Apply it in `loseLife`'s damage-reduction threshold, both `runEvent`/`resultEvents` opcode `life` comparisons, `arrive`/`slot.below` (watched fighter's max; absent seat keeps zero), and practice Low health (`lifeMark(f, desperationOf(f.who)) - 1`). With Cheats off this is the identity.
- [ ] In `arrive`, guard a missing watched seat **before** calling `lifeMark`: `const watched = this.bySeat(slot.watch); const watchedHp = watched?.hp ?? 0; const below = watched ? lifeMark(watched, slot.below) : slot.below; if (watchedHp >= below) return;`. This preserves the original `(0 >= slot.below)` behavior when there is no fighter. Cover missing watched seats with zero and positive marks in a focused test.
- [ ] Test native state when off, Ryuko ×2 = 1,020 HP, heal cap, life percentage/perfect check, practice Low health under ×2, Enemy HP ×0.1 + the desperation threshold, passive dummy vs story ally, watched-story-slot reinforcement timing, source `life` branching and exact one-HP protection, and TEAM VS next-member configuration.

**Checkpoint:** `bunx vitest run src/game/cheats.test.ts src/game/match.test.ts`.

## Task 2 — EN refill and 1P attack damage

**Modify:** `src/game/match.ts`, `src/game/match.test.ts`.

- [ ] Replace remaining `stocksOf(f.who)` cap reads for dynamic fighters with `f.maxStock` in free `addPower(f, amount)`, scripted `stock` opcode and the existing practice Max stock refill. No `Match` parameter should be threaded into `addPower`; 1P's `maxStock` comes from Task 1.
- [ ] Implement Unlimited EN by reusing the `step()` refill behavior: for effective `cheats.enabled && cheats.unlimitedEn`, top up seat 0 to `fighters[0].maxStock` and set `power=0` each **active combat tick**. The original source pay/deduct paths still run; a spend within the current tick is permitted, then the next tick refills. Do not prime every constructor or individually intercept opcodes.
- [ ] Preserve existing native EN rules and practices when off. Ensure all 1P stocks presented to the HUD remain in 0–6, including team/round transitions. Native opponent caps stay unchanged.
- [ ] Add one helper for positive 1P-originated outgoing damage to hostile victims, rounding whole HP (minimum 1 for a positive original amount). Apply it **before** `loseLife` in exactly the three non-self routes: `hitTest` (hitbox, projectile and chip), `runEvent` `power`'s `other`, and `gonMiss` with a 1P striker. Preserve the defender's subsequent reduction and source reactions.
- [ ] The multiplier must **leave a zero or negative strength unchanged**; for positive 1P-hostile damage only, use the equivalent of `strength > 0 ? Math.max(1, Math.round(strength * multiplier)) : strength`. Test a `0`-strength push/contact and a normal positive hit, so the multiplier never creates damage from nothing.
- [ ] Test EN cap 1/6 (including a native-1/native-6 fighter), normal source deductions, each-tick refill before combat input, practice Max stock, after-round/team carryover; test hitbox/projectile/blocked chip and scripted outgoing damage vs own damage, opponent attacks and healing.

**Checkpoint:** `bunx vitest run src/game/match.test.ts`.

## Task 3 — Scene activation, run mark, Menu and HUD (one integration phase)

**Modify:** `src/game/scene.ts`, `src/game/scene.test.ts`, `src/game/hud.ts`, `src/game/hud.test.ts`, `src/App.svelte`, `src/menu.ts`, `src/menu.test.ts`.

- [ ] Add `TrainingScene.pendingCheats` and public `setCheats(next)` to update **pending values only**. No `createGame` signature change. In `App.svelte` `onMount`, read `localStorage` and call `session.scene.setCheats(saved)` immediately after `createGame(...)` returns; the initial title is not a played match. When Menu settings change, normalize, update Svelte state, save one `scwu.cheats` JSON object, and call `setCheats`. Wrap **both** `localStorage.getItem('scwu.cheats')` and `localStorage.setItem('scwu.cheats', ...)` in `try/catch`: a failed read uses `DEFAULT_CHEATS`, while a failed write leaves the new in-memory setting usable without crashing.
- [ ] In `TrainingScene.begin(match)`, next to `this.match.practice = { ...this.practice }`, call `match.useCheats(this.pendingCheats)` **before** the first tick. This is the only snapshot/activation point. A switch changed during a pending load applies to the upcoming battle; a switch changed after `begin` cannot change it. Existing `whenReady` guard already filters stale candidates; no new factory arguments, load coordinator or stale-load test suite.
- [ ] Introduce `runCheated`: reset on `begin` for a **new non-story match**, or on a **new story route selection** inside `stepSelect`'s `if (select.story)` branch. Then, in `begin`, OR with the effective `match.cheats.enabled`. Do **not** reset on `openTitle` or a Continue/demo screen. Keep the completed story's mark through the title so HPA-771 can consume it.
- [ ] Add `GameStatus.cheated` to interface, `initialStatus`, `report`, and `App.svelte`'s initial literal; set `GameStatus.life` using effective `Fighter.maxHp` for the accessible meter.
- [ ] Update `scene.ts`'s world-life-bar divisions and `hud.ts`'s `healthCrop` caller to the effective maximum. Render a small text **CHEAT** label inside the Phaser HUD only for a battle whose effective `match.cheats.enabled` is true. Do not add `GameStatus.cheatActive` or any art assets.
- [ ] Add the Cheats block to the existing arcade Menu, beneath practice options: master toggle, five value controls, saved values, a separator and “Changes apply from the next match or battle.” Disable value inputs while off, never rename the existing practice-only Max stock switch, preserve Profile and dialog keyboard behavior. Do not move the Menu or add a separate UI flow.
- [ ] Scene/DOM tests: before/after `begin` effective snapshot, new non-story run reset, story multi-battle OR flag, title retention, correct status/health, CHEAT HUD tag, 0–6 stock images, reload restoration, **failed storage reads and writes**. Reuse existing `phaserStub` / scene `boot()` patterns and pure Menu helpers.

**Checkpoint:** `bunx vitest run src/game/scene.test.ts src/game/hud.test.ts src/menu.test.ts`, then `bun run check`.

## Task 4 — E2E, authored docs and final verification

**Modify:** `e2e/configured/menu.spec.ts`, `e2e/unconfigured/smoke.spec.ts`, `docs/gameplay.md`, `docs/evidence.md`.

- [ ] Playwright: open Menu, find the Cheats switch/settings/hint, toggle and persist a multiplier, reload, confirm unchanged Profile row and dialog keyboard containment. Keep the unconfigured smoke independent of auth and network, as currently.
- [ ] Focused manual gameplay in practice, Vs. CPU, TEAM VS and a multi-battle story: dummy/enemy/ally HP, desperation-form timing under ×0.1 and ×5, story reinforcements, healing/perfect, one-HP source guard, 1/6-stock HUD, unlimited refill, both kinds of damage, CHEAT text and sticky cheated-run reporting. BR CHAOS is implemented in HPA-770, not here; its future battles should reuse `begin`.
- [ ] Update `docs/gameplay.md` for user-facing behavior. In `docs/evidence.md` clearly distinguish **authored** HP scaling, threshold reinterpretation (with explicit 1-HP sentinel), EN limit/refill, outgoing damage, CHEAT text and run flag from source-recovered combat behavior.
- [ ] Run the complete verification, documenting the actual commands and results:

```sh
bun run validate
bun run build
bun run e2e
```

- [ ] Do not claim these checks have run just because docs or Cloudflare Preview built successfully. `bun run assets` requires the project handoff or its expected CI/export setup, and GitHub Actions skips drafts. After implementation and successful checks on **this same PR**, mark it ready for review and let CI execute.

## Reviewer checklist / definition of done

- [ ] One effective per-battle copy of the options, activated in `begin` only; live Menu values never mutate current combat.
- [ ] All max-HP consumers and life threshold checks agree, including native-off identity and one-HP source sentinel.
- [ ] Hostility alone controls Enemy HP (including practice dummy); story allies stay native.
- [ ] `Fighter.maxStock` is the cap in all existing stock-writing paths, and per-tick Unlimited EN restores rather than bypasses source scripts.
- [ ] Damage multiplier only affects positive 1P-hostile attack damage at the three relevant `loseLife` call sites.
- [ ] HPA-771 can read `GameStatus.cheated` even at the title following a finished story, without guessing from the current Menu state.
- [ ] No scope creep (auth, achievements, backend, extra PRs, artwork, reusable modifiers framework), no unverified test claim, and final tests pass before ready-for-review.
