# HPA-767 — Cheat mode in the Menu — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-767/cheat-mode-in-the-menu
**Design:** `docs/superpowers/specs/2026-11-08-cheat-mode-design.md`
**Status:** planning only. None of the code tasks below is implemented by this docs-only PR yet.

## Delivery rule

**One ticket, one PR:** continue implementation on this HPA-767 branch/PR and do not create phase PRs. Start with small testable changes; extend the same PR, then mark it ready only after validation. This is independent of HPA-768 Profile, HPA-769 icon art, HPA-770 BR CHAOS and HPA-771 Achievements. No new art or SFX task is needed because the HUD tag is text.

## Repository facts

- `src/App.svelte` owns the Svelte 5 (`$state`) Menu `<dialog>` and currently sets practice options live. `src/menu.ts` contains pure helpers; `src/menu.test.ts` uses Vitest.
- `src/game/match.ts` defines `PracticeOptions`, `Fighter`, `Match`, `addPower`, hitbox and scripted damage. `Match.story` and `Match.team` build specialized matches; `nextRound` recreates fighters. Keep this logic in the Phaser-free model.
- `src/game/scene.ts` owns `TrainingScene`, `createGame(parent,onStatus)`, `reset`, `startBattle`, `whenReady`, `begin`, `openTitle`, and `GameStatus`. `whenReady` can discard obsolete match requests.
- `src/game/hud.ts`'s `STOCK_OFFSETS` has entries 0–6. `healthCrop` uses native `lifeOf` today; `scene.ts` draws additional world life bars. `GameStatus.life` is used by accessible health meters in `App.svelte`.
- `src/game/characters.ts` says native fighter stock maxima vary (1, 2, 3, 5, 6). The new numeric EN override must not assume every fighter has three.
- `docs/evidence.md` distinguishes recovered rules from authored extensions. The exact verification command is `bun run validate` (assets, formatting, lint, types, Vitest); `bun run build` and `bun run e2e` are separate. CI skips draft PRs.

## Work sequence (same PR)

### Task 1 — Pure cheat options and Menu state

**Create:** `src/game/cheats.ts`, `src/game/cheats.test.ts`.
**Modify:** `src/menu.ts`, `src/menu.test.ts`, `src/App.svelte`.

- [ ] Define one typed `CheatOptions` shape with `enabled`, `playerHpMultiplier`, `playerEnLimit`, `unlimitedEn`, `enemyHpMultiplier` and `playerDamageMultiplier`. Defaults are `false, 1, 3, false, 1, 1`; bound numbers to the ranges in the spec.
- [ ] Implement a pure `readCheats(raw: string | null)` (or equivalent) that returns a full normalized object; malformed/unavailable JSON falls back to defaults. Keep `localStorage` access in `App.svelte`, guarded only as needed for disabled browser storage.
- [ ] On mount, read persisted values **before** invoking `createGame`; pass this config as its optional third argument. Update browser storage and scene pending config through a single Menu change handler. Do not import the Phaser-heavy match module as a runtime dependency of the Menu.
- [ ] Add the Cheats block after existing options in the same dialog: master switch, five labeled controls, proper bound values, optional inactive-state disabling, and the explicit “Changes apply from the next match or battle” hint. Keep Profile and existing Max stock / Low health features unchanged.
- [ ] Tests: normalization/clamping of all fields, bad stored JSON, neutral defaults, and Menu logic. No Svelte component-test harness or router.

**Checkpoint:** `bunx vitest run src/game/cheats.test.ts src/menu.test.ts`, then `bun run check`. Confirm the initial game reads persisted settings before it starts.

### Task 2 — Match snapshots and effective HP

**Modify:** `src/game/match.ts`, `src/game/match.test.ts`.

- [ ] Add an optional trailing `CheatOptions` argument to `Match`, `Match.story` and `Match.team` so existing tests/call sites remain simple. Copy the supplied options once at construction; do **not** make it an observable/live reference.
- [ ] Add `Fighter.maxHp`, native by default. Configure 1P and hostile CPU fighters before their entry scripts run, including `storyFighters`, `entrants` and TEAM VS `nextRound` replacement. Use `Math.max(1, Math.round(nativeHp * multiplier))` and initialize full HP.
- [ ] Replace **generic** max-life reads with `f.maxHp`: `gainLife`, `perMille`, the perfect-round comparison in `Match.roundEnd`, and general 30% desperation logic. Keep explicit source script constants unchanged.
- [ ] Test 1P multiplier using Ryuko 510 ×2 = 1,020, healing cap, health percentage, perfect round; test enemy multipliers on a hostile CPU and a non-hostile ally, a waiting reinforcement entering late, and the next TEAM VS member. Test disabled cheats against native values.

**Checkpoint:** `bunx vitest run src/game/match.test.ts`.

### Task 3 — EN and damage rules inside Match

**Modify:** `src/game/match.ts`, `src/game/match.test.ts`.

- [ ] Introduce a narrow `stockCap(f)` / owner-aware helper (or equivalently a max-stock field on `Fighter`) that uses the configured limit only for 1P while cheats are enabled. Touch `addPower`, scripted `stock` op and practice Max stock; avoid scattered duplicate caps. Respect native caps for everyone else and keep 0–6 for the HUD.
- [ ] When Unlimited EN is enabled, prime 1P with the selected cap at match/round start and skip stock deductions on 1P scripted costs; retain ordinary move requirements and positive stock credit behavior. Handle carried stocks between rounds and TEAM VS switches without overflow.
- [ ] Introduce one short helper for positive outgoing 1P attack damage, applied to the **target** before `loseLife`, covering hitbox/projectile contacts (`hitTest`), scripted `power` damage to `other`, and victim-scripted damage where the credited striker is 1P. Preserve zero-damage attacks, self-damage, healing and opponent attacks.
- [ ] Tests: stock caps 1/6 and native 1/2/5/6 when off; accumulation at cap, scripted cost, Unlimited EN, practice Max stock precedence, a projectile and blocked chip, direct script attack, 1P self-harm unchanged, opponent damage unchanged. Include round-to-round carryover.

**Checkpoint:** `bunx vitest run src/game/match.test.ts`.

### Task 4 — Scene lifecycle, run cheating, and HUD

**Modify:** `src/game/scene.ts`, `src/game/scene.test.ts`, `src/game/hud.ts`, `src/game/hud.test.ts`, `src/App.svelte`.

- [ ] Extend `createGame` / `TrainingScene` to receive initial pending cheat options before the first match starts; expose `setCheats(next)` that changes pending values only. Preserve the existing modal pause and pending stage-load semantics.
- [ ] Capture pending options whenever a new match is requested in `reset` or `startBattle`. Make all routes, including the future BR path, funnel through that same snapshot convention. Never retroactively alter `this.match`. A newer request superseding `whenReady` must not apply the old snapshot.
- [ ] Add `runCheated` in `TrainingScene`. Reset on a new match/route or title exit, OR in effective `match.cheats.enabled` **only in `begin(match)`** (not `whenReady`). Keep the flag across story demos/continue screens and further battles. Publish `GameStatus.cheated` in `initialStatus`, `report()` and the App's initial status literal, with accurate `life: [a.maxHp,b.maxHp]`.
- [ ] Render a small persistent `CHEAT` text object above the recovered match HUD, visible only when the current effective match has cheats enabled; hide on title/select. Make no PNG/SFX changes. Update `healthCrop` use in `hud.ts` and the scene's world-life-bar ratio to `maxHp`.
- [ ] Verify lifecycle tests with the existing `phaserStub` and `boot()` helper: pending vs current options, initial persisted enabled settings, reset, delayed/superseded loads, story two-battle OR behavior, clean new run and results reporting. Check a 6-stock HUD display does not exceed the stock texture array.

**Checkpoint:** `bunx vitest run src/game/scene.test.ts src/game/hud.test.ts`.

### Task 5 — End-to-end regression and authored documentation

**Modify:** `e2e/smoke.spec.ts` (or the existing Menu smoke test), `docs/gameplay.md`, `docs/evidence.md`.

- [ ] Playwright: open Menu, see Cheats, toggle on, change and persist a multiplier, reload, and see the “next battle” explanation. Confirm the dialog still contains P/R/Esc input and the Profile row works as before; no new art fixtures.
- [ ] Manual focused playtest in practice, Vs. CPU, TEAM VS and a multi-battle story route: current-vs-pending values, perfect round, ally vs enemy scaling, 1P meter over native cap, CHEAT tag, and story-run cheated persistence. BR CHAOS is not implemented in this ticket; its later scene path must reuse the same contract.
- [ ] Update `docs/gameplay.md` (behavioral guide) and `docs/evidence.md` explicitly labeling every cheat mechanic and HUD element **authored**.
- [ ] Verify the complete PR with:

```sh
bun run validate
bun run build
bun run e2e
```

- [ ] Record actual results and any environmental blockers in the PR. `bun run assets` depends on the project handoff/export setup or CI download; do not claim these commands succeeded merely because docs were committed. GitHub Actions skip draft PRs; before marking ready, arrange real CI checks as well.

## Reviewer checklist

- [ ] One immutable effective options snapshot per started battle; only the scene owns pending values and run state.
- [ ] A pending OFF switch cannot remove the CHEAT label or erase `GameStatus.cheated` during an already-cheated run.
- [ ] Every visible and gameplay HP denominator uses `Fighter.maxHp` as appropriate; native rules remain unchanged when cheats are disabled.
- [ ] Enemy HP does not scale allies or a player-controlled 2P; only 1P outgoing hostile damage gets the damage multiplier.
- [ ] All stock changes respect the 1P EN limit, even script deductions/refills, with 0–6 display indices only.
- [ ] HPA-771 can later read `GameStatus.cheated` without modifying `Match` or inferring it from current Menu settings.
- [ ] No account API, second PR, generic modifiers engine, database/schema change, new art, or backward-compatibility scaffolding.

## Definition of done

All options and gameplay paths implemented, automated tests and manual scenarios checked, both authored docs updated, CI green, and this **same PR** marked ready for review. The current planning commit by itself does **not** satisfy the ticket's `bun run validate` requirement.
