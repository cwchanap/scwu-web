# HPA-858 — Boss-playable B.R. ANOTHER — design specification

**Linear:** https://linear.app/cwchanap/issue/HPA-858/br-another-for-the-four-bosses-with-tougher-enemies  
**Project:** SCWU web  
**Status:** Design for a planning-only draft PR; implementation has not begun.  
**Delivery:** One PR for this ticket. Implementation, tests, and verification will be committed to this same PR after plan review.

## Problem and existing baseline

The four bosses — ZENKA, ALPHA, SHIN-Z and DoraEmon — currently bypass the quick mode selector and enter their existing stories. HPA-765 introduced the two-step, sign-based quick mode selector; HPA-766 introduced a deterministic B.R. ANOTHER stage builder and multi-seat battles; HPA-767 introduced per-match cheat snapshots. All three are merged. Add a boss-specific B.R. ANOTHER branch without replacing the bosses' original STORY MODE behavior.

This feature is authored behavior, not recovered gameplay. Leave data imported from the original Windows game unchanged.

## User-visible behavior

1. After selecting any of the four bosses in SINGLE/story, show the existing first step of ModeSelect: STORY MODE or B.R. MODE. Keep HPA-765's sign art, cursor, keyboard, pointer and touch interactions.
2. Selecting STORY MODE starts that boss's current story directly. Selecting B.R. MODE starts B.R. ANOTHER directly. A boss never sees a second route selection step, B.R. ZERO, B.R. CHAOS or B.R. LONG.
3. Boss B.R. ANOTHER consists of exactly three battles, without an ally, with no inter-stage demos: stage 1 is Sakura Street with three regular pairs (six enemies); stage 2 is Sakura Night with three of the four extra pairs (six enemies); stage 3 contains the three *other* bosses, not the chosen boss (three enemies), and uses the last boss's arena. Winning stage 3 returns to title; losing a stage takes the existing continue path.
4. Each boss gets its own deterministic opponent order seeded by ROSTER index, with pairs kept together, paired fighters allied with one another, the other teams hostile as in B.R. ANOTHER. Stage 2 omits exactly one of its four pairs. Stage 3 never seats the player's own boss.
5. Only the *regular enemy seats in stages 1–2* have twice their normal max HP, five 100-EN stocks (Max EN 500) and twice the normal EN gained by positive EN awards. The boss player and stage 3 boss enemies stay at native stats. This route difficulty must work with cheat mode off, and must not mark a run cheated.
6. DoraEmon's EN-charge command is disabled when DoraEmon is player-controlled in any mode, **or** whenever DoraEmon is present in a B.R. run (including when controlled by CPU). Other ways of earning or spending EN remain intact.
7. DoraEmon's three-stock KO RELOAD is disabled only when he is player-controlled *outside* B.R. (practice, VS, TEAM VS and his original story). In B.R. it remains enabled as a player, enemy or ally, consistent with ALPHA's revive. Other fighters' KO/revive paths are unchanged.

## Implementation decisions

### One route-specific generated story, with explicit source donors

Generate `bossBrAnotherStory(who)` in `src/game/br-another.ts` as `[stage1, stage2, stage3, { type: 4 }]`, with **no inter-stage demos and no ally**. Play it through the existing `Story` runner, Continue and `Match.story`; do not splice into `brAnotherStory(who)`, which assumes the 34 regular fighters' finale offsets.

**Mandatory donor decision:** the boss's own scenario cannot supply the regular fighter finale headers/slot roles (ZENKA, ALPHA and SHIN-Z have short boss stories; DoraEmon's scenario is authored separately). Use **Ryuko's source step 63 for stage 1** (including its first/last/waiting slot role template and flags) and **Ryuko's source step 65 for stages 2 and 3**. The copied headers' `flags & 1` preserve Continue. Override the arena and opponent/seat details as needed; do not mutate the donor steps or imported `.PLAYER` data.

Reuse `STAGE_ONE_POOL` (12 pairs), `STAGE_TWO_PAIRS` (four pairs), `BOSSES`, `BOSS_ARENAS`, existing watch/below entry logic and hostility assembly. Extract a small seeded shuffle closure keyed by `ROSTER.indexOf(who)`, and use it in sequence for all three stages: choose three regular pairs, choose three extra pairs, then shuffle the **three other bosses**. The stage 2 omitted pair is seeded, and no pair is split or becomes hostile to its mate.

Allow `assemble` to omit the ally slot. Derive the hostility mask from the actual player + opponent seat count so no phantom ally bit is retained. All opponent pairs are hostile to outsiders and allied within the pair. No new combat engine, wider seat pool, scene-specific lineup logic or new art.

Give `Story` a small optional step-list override, keeping its default `scenarioOf(who)` for existing boss STORY MODE. `next` and `retry` read the supplied list. A boss B.R. run starts with `next()` at step 0; a Continue retries exactly the failed battle. Regular mode-select routes still call `startOnRoute`.

### Small boss selector and stored B.R. context

Define a single `BOSSES: readonly Who[]` next to `ROSTER` in `src/game/select.ts` (values: `zenka`, `alpha`, `shinz`, `dora`). Import it from `br-another.ts`; do not reverse the import, which would introduce a module cycle. **Do not change `opensOnModeSelect`**: it is used to enumerate the 34 ordinary fighters and feed their source-dependent B.R. builder.

The scene opens `ModeSelect` when `opensOnModeSelect(who) || BOSSES.includes(who)`. For bosses only, `ModeSelect.confirm()` terminates at **stage 0**, returning `'story'` for STORY MODE or `'br-another'` for B.R. MODE. Widen `done` accordingly; leave normal fighters' stage-1 route choice, sign boards, cursor and remembered selections unchanged. `tap()` already uses the same confirm path.

When a boss chooses STORY, construct default `Story(who)`; when B.R. is chosen, create `Story(who, bossBrAnotherStory(who), 'br-another')` and start `next()`. Store the selected `Route | null` on **Story**: `startOnRoute` records the route for ordinary fighters, and the boss builder sets it on construction. `TrainingScene.startBattle` passes a **single `br: boolean`** to `Match.story`. B.R. means `br-zero`, `br-another` and future explicit B.R. routes. Normal story, free practice and VS use `false`. The owner of context is the current `Story`, so new runs naturally reset it; there is no rules object or cleanup subsystem.

Fix Escape on the selector during asynchronous load: if `select.done` is set, cancel the pending route request and call `ModeSelect.back()` **even for a boss still at stage 0**. Otherwise, Escape on an unconfirmed normal route step backs to the mode step, and Escape on an unconfirmed mode step backs to character selection. Test cancellation of the boss's in-flight battle load.

### Data-driven tougher regular enemies, distinct from cheats

Mark only the **six enemy slots of generated boss B.R. stages 1 and 2** with an optional authored `Slot.tough: true`; stage 3 and the boss player's seat have no marker. Apply the modifier inside `Match.storyFighters` **each time a fighter is built**, including every `nextRound` rebuild, rather than only at battle start. Set `maxHp = 2 * lifeOf(who)`, `hp = maxHp`, `maxStock = 5` and a small per-Fighter positive EN-gain factor of 2 (default 1). Each candidate opponent among roster entries 0–29, 40 and 41 has `perStockOf = 100` already; no custom stock denomination is needed. Five existing 100-EN stocks equal Max EN 500.

Use the existing `addPower(f, amount)` path for the multiplier: scale **positive EN amounts only** by `f.enGainMultiplier`, leaving negative spends/drains unchanged. Source op 0x10's *direct stock changes* are not EN accumulation and stay unscaled. Existing scaled `lifeMark`/watch thresholds naturally use the tougher fighter's effective `maxHp`, so wave entry remains relative to 30% of the bigger health bar; pin this with a test.

Cheat composition is explicit: **route modifier establishes base `maxHp`, then HPA-767's `enemyHpMultiplier` multiplies that base**. Update the hostile case of `cheatSeat` to use fresh `f.maxHp` instead of `lifeOf(f.who)`; it is called only on freshly created seats at installation or round reset, so the multiplier is applied once. Player EN limit cheats affect seat 0 only; they never reset tough enemies' five-stock cap. A boss B.R. run with cheats **off** is still harder and is **not** marked cheated; with cheats on the existing cheated-run flag applies. Normal enemies and stage-3 bosses remain native before optional cheats.

No generalized modifiers, extra EN representation, or new charge/award framework. HPA-972 can reuse `addPower` when its separate feature lands.

### DoraEmon's charge and revive: one B.R. flag

`player-controlled` means **fighter index 0**, including TEAM VS's current active player. When DoraEmon is fighter 0 **or** `match.br` is true, block his EN-charge action **239 at its shared entry**, not `addPower`; the follow-up `240+3` is reachable only through 239's charge window. Do not stop unrelated EN earned from hits, kills or scripts. A CPU-controlled DoraEmon outside B.R. keeps his original charge behavior. Test that a B.R. CPU DoraEmon still selects and executes attacks after a rejected charge command, rather than idling indefinitely.

In the `enterPending` KO-normal stock-check path (around `src/game/match.ts:4468`), bypass only DoraEmon's **KO RELOAD target 72** when he is **fighter 0 and `!br`**. This produces an ordinary KO in practice, VS, TEAM VS and Dora's authored story. In any B.R. run (including ordinary B.R. ANOTHER, B.R. ZERO if Dora is present, and the boss route), DoraEmon retains stock-based KO RELOAD as player, enemy or ally. Preserve action 72/74, ALPHA's revival, HPA-973's separate post-KO recovery feature, and the `downed` marker's existing brawl-result semantics.

### Documentation and scope boundaries

Document the authored boss route, enemy stat overrides, DoraEmon charge/revive changes in docs/evidence.md; align docs/gameplay.md's description of DoraEmon's own story. Existing move-list text changes only if it presently contradicts these mode restrictions. No new screens, icons, signs, art, sound effects, database, backend, new dependency, framework or broader combat refactor.

Keep HPA-1035's even seeded lineups and six-enemy stage 2 for the 34 *regular* fighters outside this PR; this PR needs the same 3-of-4 stage-2 rule for bosses only. Reuse the small deterministic pair-selection helper when HPA-1035 later lands. HPA-770/1035 BR-specific future modes can pass the same route context, but this PR does not implement them.

## Verification intent

Deterministic Vitest/Match/Story tests cover: donor headers/flags, all four bosses' 6/6/3 opponents and no-ally masks, stable seeded order, own-boss exclusion, stage arenas, retry/Continue/title, two-stage normal-fighter regressions, round-reset persistence of `tough`, five 100-EN stocks, positive EN x2 versus negative spend/direct stock adjustment, scaled wave thresholds, and the exact route-buff × cheat-HP composition. Add a DoraEmon matrix for player/CPU and B.R./non-B.R., including **B.R. ZERO flag propagation** and the existing ordinary-fighter stage-3 boss case; test the CPU's next attacks after denying charge.

For browser E2E, extend `e2e/unconfigured/mode-select.spec.ts`, reusing its canvas pixel probes: one boss B.R. case verifies the lit MODE signs, that the route HEADER band **never lights**, and then visible battle health bars; one boss STORY case verifies entry to an existing original boss story. Include the boss-stage-0 Escape-during-load scenario in scene tests. The **HPA-765 Linear mode-select mockup** remains the visual reference for the sign style, dimming, cursor and spacing, but not a pixel-identical screenshot baseline; check behavior using existing sign-region luminance and capture screenshots for automated visual regression where practical.

Platform acceptance is automated, with **no human sign-off**: macOS Chromium using existing tools; Windows Edge and iOS Safari (or explicitly identified WebKit emulation) when existing runners are available. Record each platform as passed, failed or not run, without installing a new browser farm just for this ticket. The current Playwright project only configures Desktop Chrome, and its Linux-hosted CI E2E skips draft PRs; run `bun run e2e` outside draft CI or wait until ready-for-review. Android and Linux are **not** separate acceptance targets; existing CI covers only its configured Linux Chromium, not Android.

## Risk and interaction notes

- Using boss scenarios as donors is a blocker: their layouts/indices differ, and the ordinary `brAnotherStory` splice must never consume them. Use Ryuko 63 and 65 as donor data.
- `nextRound()` re-creates seats, so generated-slot modifiers must be reapplied there; cheat scaling must multiply the route-adjusted `maxHp` exactly once.
- Keep the 34 ordinary-fighter B.R. runs governed by `opensOnModeSelect`, unchanged. HPA-1035's even lineups and HPA-770's CHAOS are separate. HPA-973 has a separate draft for KO HP recovery and DoraEmon's other moves.
- All hostility masks are based on real seat count; no seat reuse or 32-bit overflow machinery is needed for these 6/6/3-opponent stages.
- No new art, UI, SFX, backend or generated assets. Source-vs-authored changes are recorded in `docs/evidence.md`.

