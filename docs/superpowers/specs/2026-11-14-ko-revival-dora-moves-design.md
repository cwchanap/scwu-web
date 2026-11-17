# HPA-973 — KO recovery, DoraEmon moves and late-arrival intro — design

**Linear:** https://linear.app/cwchanap/issue/HPA-973  
**Draft PR:** https://github.com/cwchanap/scwu-web/pull/19  
**Status:** Revised design (2026-11-17). Planning only; implementation/tests not started in this PR.  
**Reviewed `main` baseline:** `7546518bdccd25af948ce0b9e3607a5830061d41`, 26 commits after this PR's original base. HPA-858/PR #22 is **merged**. HPA-1035 is **not merged**.

## Scope and boundaries

The updated Linear ticket contains **three fixes in one PR**: (1) revive a KO'd fighter with HP gained from a kill **outside B.R.**; (2) retune four DoraEmon moves; (3) restore DoraEmon's complete 337-tick intro when he enters as a waiting boss during an ongoing battle. Retain `Match`'s existing combat loop, the exporter, the source script runner and the instructions page. The first two are authored changes, not Windows-original parity claims.

**HPA-858 already changed `main`.** The merged engine exposes `Match.br` via `TrainingScene.startBattle() → Match.story(..., br)`. Its `SEAT_GATES` prevent DoraEmon's voluntary/CPU EN charge for player-controlled DoraEmon and any DoraEmon in B.R.; its `koReloadBlocked()` suppresses source KO RELOAD 72/74 for **player-controlled** DoraEmon in all modes. CPU DoraEmon outside B.R. retains native behavior. Preserve all of these restrictions and the regression tests added in `dora.test.ts` and `team.test.ts`.

**HPA-1035 owns the broader B.R. ban.** At this baseline, CPU DoraEmon can still KO RELOAD in B.R. (the existing `team.test.ts` asserts it), as can other source revivers. Item 4 of HPA-1035 will disable *every* B.R. revive (ZERO, ANOTHER, CHAOS, LONG) for all roles. **HPA-973 only ensures its new bonus-HP get-up cannot run in B.R.; do not preempt HPA-1035 or change its seeded stages/loading screens/B.R. LONG.** After HPA-1035 merges, rerun the joint B.R. matrix, but don't create a second PR for HPA-973.

## 1. KO'd fighters who earn HP from a kill

### Root cause

`Match.knockOut()` sets `f.downed` and queues `down`. In a story it pays a defeated seat's `slot.life` / `slot.power` to 1P or the striker through `gainLife()` / `addPower()`. `land()` normally converts a KO flight into `koLand`, which `moveKO()` holds indefinitely. The source `life` opcode only runs in active scripts/objects; most `koLand` fighters never execute their source HP-test stand-up even after their bar is refilled. `KO_SCRIPTS` covers ZAKU/PAC-HELO's variable-11 scripts, not the other six source HP revivers.

### Proposed narrow transition

- During an *undecided, non-B.R.* encounter, a **present, settled KO** with `f.downed && f.hp > 0` can recover. Use a single scoped check in the existing `Match` tick/KO path, gated by `!this.br`, not a new state machine or global flag. Do not interrupt pending actions, KO flight, scripted revives, a committed `picking` result or `winner`.
- For source HP-revive fighters use their existing stand-up path: GOLF → 131, ASURA → 130, TTRO → 145, ASTROMAN → 143, Z-MEGA → 157, RARIO → 27. Verify the exact branch/offset and expected source pose with tests before wiring; `enterSource()` where appropriate.
- For ZAKU/PAC-HELO preserve existing scripted variable-11 → KO Down BR → KO BR HP behavior. A kill HP bonus must not trigger a second scripted refill; use their ordinary get-up if a settled fighter is otherwise stranded. The other roster fighters fall back to `this.action(f, 'getUp')` (as in `recoverKnockdown()`).
- Leave `f.downed` **true** so a revived hostile still counts as previously defeated for brawl survival and scoring; the recovery happens once and does not restart each tick. A player-controlled DoraEmon without bonus HP still takes HPA-858's ordinary KO rather than KO RELOAD. The HP-bonus recovery (when non-B.R.) and stock-based source KO RELOAD are different rules.
- Use the existing `run()` ordering to avoid reviving after result selection or incorrectly committing a healed 1P defeat. Tests must pin the transition tick, no-HP case, already-ended case, brawl win/Continue and `br=true` gate.

## 2. DoraEmon's authored move changes

DoraEmon only. Keep original `*.PLAYER` source hash checks, and make any source-data transformations in `scripts/export_assets.py` rather than committing generated JSON. Current export suppresses hurtbox bits (`kind &= ~6`) by protected source frame PC while retaining pushboxes.

| Move | Desired rule | Implementation constraint |
| --- | --- | --- |
| **Fists** (↓←↓← G; 327, follow-up 332) | **No full invincibility.** Fists clash with and cancel head-on opposing strike boxes like dash-in kick 225; his body can still be hit. | Restore Fists' hurtboxes and use a **front-facing zero-damage kind-3 clash box** based on 225. Preserve Fists continuation rather than 225's branch-to-226 handler. Test box-on-box cancellation and separate body hit. |
| **Pierce** (↓→↓← H; 338 → 340/341/342) | Invincible for **first 100 ticks (1.0 s) from action 338's cast**, then vulnerable until exit. | Protect only cast-relative ticks 0–99, including early fragments; don't restart at nested action or protect shared landing 270. If exporter PC sharing can't represent elapsed time, use one localized Dora cast-age rule in the existing collision/hurtbox path. Test 99→100 precisely. |
| **Counter Hit** (guard 172/174 → 197) | **K alone while blocking**, existing guard window and one-stock cost. | Dora-only guard command check using already mapped K / Hit Up (source B+C bits) in the current recognizer. Don't change other characters' controls. Test K alone, wrong timing and insufficient stock. |
| **Twin Hammer** (↓← G; 250/252, inlined 251/253, follow-up 254) | Invincible through both cast swings, **not** the separate hit follow-up 254. | Exclude 254-only frame PCs from exporter protection; retain 250/252 cast protection and pushboxes. Test cast and follow-up separately. |

Cannon, Gadgets, Hug, FK之意思, the other one-stock supers, and the rest of the input system remain unchanged. Update the obsolete `dora.test.ts` assumptions and the four move-list rows in `src/instructions/moves.ts`; preserve newly merged HPA-858 tests and EN description.

## 3. DoraEmon's late-arrival intro (new ticket item, 2026-11-17)

**Current route:** `Match.arrive(f, i)` activates a waiting slot when its watched fighter drops below the entry threshold; it calls `takeSeat(i)` and `opening(f)`. For DoraEmon, `opening(f)` sets `action = 'intro'`.

**Probable cause confirmed by code:** The **pre-fight-only** branch of `Match.run()` advances that intro with `f.age++`, `doraFall()`, `enter()` and completion at `animationDuration('intro', 'dora') === 337`. When a waiting boss enters **after** `fightTick`, the active branch calls `move()` instead, which does not perform the same authored `intro` progression. The late entrance therefore cannot be assumed equivalent to the first-seat one.

**Smallest fix:** Reuse the **same intro-step logic in both phases** (a small helper rather than a second renderer/scene animation). Start the 337-tick sequence when the watched seat *actually arrives*, keep DoraEmon from reading normal attack/CPU input until it completes, and then resume ordinary `Match` behavior. Preserve the authored 50-tick opening, rise/hold/fall sequence, landing at y=0, and original OP super Charge (source 46) that sets four 90-EN stocks (360 power). This **intro grant is not the charge command** blocked by HPA-858 in B.R. Do not duplicate the charge, skip the final pose, or alter other reinforcement entries.

**Parity tests:** Compare seeded `brAnotherStages(...).stage3` cases with DoraEmon arriving second/middle/last against the already-tested **first-seat** DoraEmon intro (`src/game/dora.test.ts`: 337 ticks, four stocks, age-indexed sprite images, landed y=0). Assert triggered *at entry*, not battle start; active-phase animations finish and CPU may act afterwards. Keep existing boss lineup/arena/Continue and HPA-858 charge gates unchanged. No new SFX or art.

## Documentation, acceptance and exclusions

- Update `docs/evidence.md` with HPA-973's non-B.R. KO recovery and `downed` retention, the four move changes, and late-intro timing/charge/landing. Update only the four relevant `src/instructions/moves.ts` rows; no new screen or layout.
- Deterministic Vitest covers **the whole roster outside B.R.**, the B.R. **new-get-up prohibition**, source KO routes, all four moves, and first/late boss intro parity. Keep HPA-858 player Dora + CPU Dora tests. Never claim HPA-1035's no-source-revival rule is already implemented.
- Run available `bun run validate`, `bun run build`, `bun run e2e`; `bun run assets` needs the verified extracted handoff and should be recorded as not run if unavailable, not assumed passed.
- **Product E2E acceptance:** one existing macOS Chromium platform with browser **MCP** is sufficient (no platform-specific change). Verify arena/HUD, revised guide text and late-entry intro; collect an actual browser screenshot/visual check against established guide/arena UI. The ticket has **no new Linear UI mockup**. Windows Edge and iOS Safari can be optional/unverified; no human sign-off, new browser farm or full-tournament browser suite.
- Out of scope: HPA-1035 B.R. no-revive switch, B.R. LONG, stage draw/loading changes; HPA-770 CHAOS; HPA-972 menu/cheats; reimplementation of merged HPA-858; art/SFX, generated source files, new backend, new state machine, or compatibility shims.

## Issue interpretation

Adopt the six issue readings: Fists' guard box is frontal, Twin Hammer follow-up is 254, K is the only Counter Hit key during the existing window, generic revival uses `getUp`, late intro means full *first-seat parity*, and it starts **on arrival**. Any further revisions stay on this PR.
