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

### One route-specific generated story, not a second game system

Extend the existing pure line-up helpers in src/game/br-another.ts. Reuse current regular pair arrays, boss/arena mappings, seed/shuffle, encounter headers, sequential watch/low-life entry and hostility mask assembly. Permit the shared battle assembler to omit its ally slot; calculate seat masks from actual seat count rather than assuming an extra ally. Exclude the boss player when drawing stage 3. Keep all three stages generated as Battle values; do **not** create copied source .PLAYER records or an additional game loop.

Add a small bossBrAnotherStory(who) builder returning three Battle steps followed by an end step. Preserve continue on loss using the existing battle flag, and re-enter the same battle via Story.retry. Reuse existing stage/demo loaders and existing title/continue transitions. No new demo or asset is required.

Do not force the boss story into the normal brAnotherStory(who) splice routine: it depends on normal fighters' original mode-select/finale offsets, which bosses do not have. Give Story a narrow optional generated steps override (or an equivalently small route-specific source) so a boss's original scenarioOf(who) remains unchanged when STORY MODE is picked.

### Small mode-select special case

In src/game/select.ts, recognise the four boss Who values centrally. The first mode board selection for a boss is terminal: STORY MODE is a boss-story selection and B.R. MODE is boss BR Another. For everyone else, preserve two-stage route selection, remembered selection, cursor positioning, Escape behavior, and tap handling. src/game/scene.ts opens ModeSelect for these bosses and chooses their original or generated Story path from that result. Do not create a separate Svelte menu or duplicate board artwork.

Use a clear route-context value carried from the scene into each Match.story as needed. Future B.R. variants must be able to mark themselves as B.R. without hard-coding a list of four mode names into DoraEmon's logic. Keep it narrow: one match-scoped route/rules object rather than a generic modifier engine.

### Route stat modifier, distinct from cheats

Apply the boss B.R. ANOTHER regular-enemy modifier to the stage-1 and stage-2 hostile seats at match creation/begin, after native seat construction. Reuse effective maxHp/maxStock and the existing HPA-767 snapshot flow where useful. For the 500 EN requirement, confirm each target's perStockOf value; represent an effective 100 EN per stock for the route if native values differ, so the rendered five stocks and total cap really equal 500. Apply x2 **only** to positive EN accumulation, not super costs, negative drain, stock decrements or the intro's absolute starting stock. Avoid duplicating the multiplier if HPA-972's later EN-gain rule lands: whichever arrives second reuses the same small award hook.

Cheats are an independent layer: do not set cheats.enabled automatically. If optional cheats are on, keep the original run-cheated mark and define a deterministic ordering for stat modifiers; never let the boss-route modifier accidentally affect the boss player or stage-3 boss opponents.

### DoraEmon-specific switches, not data rewrites

Gate the existing EN-charge action at the narrow source-command/charge entry path, not global addPower; attacks, kill rewards and other energy gains still work. The condition is (Dora is player-controlled) OR (current run is BR). Do not disable charge for CPU Dora in an ordinary non-BR story or VS, unless player-controlled.

Gate the KO NORMAL -> KO RELOAD path for DoraEmon only when the controlling player's fighter is Dora and the route is not BR. Keep existing 72/74 scripts and three-stock behavior for his BR player/enemy/partner roles. Preserve B.R. result handling for a revived, previously downed hostile and avoid changing HPA-973's separate all-fighter after-KO HP recovery ticket.

### Documentation and scope boundaries

Document the authored boss route, enemy stat overrides, DoraEmon charge/revive changes in docs/evidence.md; align docs/gameplay.md's description of DoraEmon's own story. Existing move-list text changes only if it presently contradicts these mode restrictions. No new screens, icons, signs, art, sound effects, database, backend, new dependency, framework or broader combat refactor.

Keep HPA-1035's even seeded lineups and six-enemy stage 2 for the 34 *regular* fighters outside this PR; this PR needs the same 3-of-4 stage-2 rule for bosses only. Reuse the small deterministic pair-selection helper when HPA-1035 later lands. HPA-770/1035 BR-specific future modes can pass the same route context, but this PR does not implement them.

## Verification intent

Use deterministic unit tests for all four bosses, each stage roster, pair grouping and hostility, first-entry and low-life waves, seeded repeatability, opponent exclusions, boss arena, stat overrides, EN gain and costs, and DoraEmon's player/CPU × BR/non-BR charge/revive cases. Regression-test original boss STORY MODE, the 34 regular fighters' B.R. runs, normal cheat mode, brawl results and continue.

The existing HPA-765 mode-select mockup is the visual reference; this ticket adds **no new UI mockup**. Final E2E acceptance is automated on macOS Chromium and, when an existing runner is available, Windows Edge and iOS Safari/WebKit. Visual screenshot assertions should compare the first-step signs and navigation against the established HPA-765 appearance. Android and Linux rely on CI only. No manual/human sign-off criteria.

## Risk and interaction notes

- Boss stories have different scenario/finale offsets; keep their original story arrays untouched and use a generated route.
- Current regular brAnotherStages adds an ally unconditionally and seats four extra pairs for most regular fighters; neither assumption may leak into boss stages.
- Match uses bitmasks for hostility; build with actual counts of 6/6/3 enemies and no ally. Nothing in this ticket needs seat reuse or a larger mask.
- DoraEmon's charge scripts can also grant stocks; verify disabling the *charge command* does not suppress unrelated power awards.
- HPA-973 has a separate open draft PR for KO recovery and other Dora moves; do not couple or duplicate its changes. Rebase/reconcile tests if it merges first.
