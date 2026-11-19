# HPA-973 — KO recovery, DoraEmon moves and late-arrival intro — implementation plan

**Linear:** https://linear.app/cwchanap/issue/HPA-973  
**Design:** `docs/superpowers/specs/2026-11-14-ko-revival-dora-moves-design.md`  
**Draft PR:** https://github.com/cwchanap/scwu-web/pull/19  
**Review:** Addresses [first design review](https://github.com/cwchanap/scwu-web/pull/19#pullrequestreview-5948835717) and [follow-up review](https://github.com/cwchanap/scwu-web/pull/19#pullrequestreview-5949126055), 2026-11-17.  
**Baseline:** `main` at `7546518bdccd25af948ce0b9e3607a5830061d41`, including merged HPA-858.  
**Delivery:** **ONE PR** for the whole ticket: spec, implementation, tests, docs and evidence on this same branch. Currently **planning only**; no HPA-973 implementation or test run.

## What changes, and what doesn't

1. **Source KO Down life checks** already describe HP recovery for 43/45 fighters; the old `koLand` clip path fails to execute them. Reuse records at their native ages. This is **recovered** behavior. Gate the newly restored life-test recovery on `!match.br` (**authored**).
2. **Late DoraEmon entrance:** `arrive()` already calls `opening(f)`, but only the pre-fight branch advances Dora's 337-tick `intro`. Share one stepping helper between pre-fight and active-combat paths.
3. **DoraEmon moves:** two small exporter changes (Twin Hammer `protected` set and Counter Hit command), plus Fists flagged-box clash behavior and Pierce cast-relative invincibility in `Match`.
4. **Publishing:** any `scripts/export_assets.py` change must be followed by a **coordinated R2 export upload** before pushing it; CI and Workers verify a mutable `generated.tar.gz` fingerprint.

HPA-858/PR #22 is merged: player-controlled DoraEmon cannot KO RELOAD, and the voluntary/CPU charge command is gated. Keep it unchanged. HPA-1035 is separate and **not merged**: it owns disabling _all_ native revives in B.R. (ZERO/ANOTHER/CHAOS/LONG) and the other B.R. features. HPA-973 must not silently implement that ticket, change enemy lineups or introduce a new B.R. flag/state machine.

**Implementation sequence:** keep each local fix's failing repro and passing regression together. The pre-commit hook runs `bun run validate`; **never push a separate commit containing deliberately failing Phase-0 tests**. Use local red/green inside the implementation phases and commit only green tests.

## Phase 1 — Recovered KO Down HP branches, not a per-fighter table

**Modify:** `src/game/match.ts`, existing `src/game/team.test.ts` / `src/game/match.test.ts`, `docs/evidence.md`.

- [ ] Locally reproduce a KO'd fighter gaining HP through an actual story enemy's `slot.life` payout; in that same change, commit passing regression tests. **Trade-KO timing matters:** `run()` latches `picking` on the first tick it observes 1P at 0 HP; never expect a bonus one tick later to undo the pending loss. Arrange both lethal contacts/kill payout in the **same tick's `hitTest()`** (or pay via an ally while 1P has positive HP) and assert no premature loss plus preserved `downed`.
- [ ] Inspect `twin(who, KO_DOWN)` source records and test the native `life` event (HP ≥ 1) **at its actual source age**. For all `CHARACTERS`: 43 source life-test cases and ZAKU/PAC-HELO's variable-11 exceptions. Representative: Ryuko/GOLF/ASURA/TTRO/Z-MEGA **t=60**, ASTROMAN **t=130**, RARIO **t=66**, **Dora t=61** (also has t=62), **TRAINING t=0** (no global-15 test). TRAINING's target 113 maps to **`knockdown`**, not `getUp`. Assert each exported target/action, do not maintain a runtime table.
- [ ] Implement one small source KO Down evaluation helper. In `moveKO()` for clip `koLand`, call `eventsAt(twin(f.who, KO_DOWN), f.age, f.who)`, check any source round-over `test` through `passes()`, and enter `life` target via `lifeMark()`/`enterSource()`. Gate with **`!this.br && !this.picking && !this.winner && this.globals[15] !== 100`**. Preserve `KO_SCRIPTS` and their variable-11 scripts without extra fallback. `enterSource` maps each fighter's _actual_ target (`getUp` or, for TRAINING, `knockdown`).
- [ ] **Handle `TRAINING t=0` in `land()` immediately after `action(f,'koLand')`:** the landing returns before `moveKO()`, and next `move()` increments the age to 1. Reuse the same helper once at age 0 and, if a life branch enters `knockdown`, return from `land()` without continuing `slideDown()`. Explicit `winner/picking/global[15]` guards prevent post-result wake despite TRAINING having no source round-over test. Normal `moveKO` handles later ages.
- [ ] For `KO_TIMELINES` (`koLand` with `branch`), update only the KO-specific `resultEvents()` life branch to enter the _actual get-up_ via `enterSource()` instead of remaining in `koLand` through `enterResult()`, under the same authored `!this.br && !this.picking && !this.winner && this.globals[15] !== 100` gate so the restored recovery applies only outside B.R. Keep other result events, win/draw life tests, randoms and roll behavior untouched.
- [ ] Test 0 HP (no recovery), **TRAINING at t=0**, **Dora at t=61**, positive HP at native record tick, no wake after `picking/winner/global[15]`, `downed` retained for brawl elimination, and `Match.story(..., br=true)` preventing **HPA-973's newly restored life-test branch**. Current CPU Dora/ALPHA/ZAKU/PAC-HELO native B.R. revive behavior is HPA-1035's responsibility, not this PR.
- [ ] Record recovered KO Down event timing and the separate authored `!br` gate in `docs/evidence.md` per `AGENTS.md`; do not label the recovered rule an authored generic get-up.

**Checkpoint:** One all-roster table-driven test, actual 1P trade-KO, and focused result/brawl cases pass. No new Fighter recovery flag, fallback, manual dispatch table or routing change.

## Phase 2 — Share DoraEmon's full intro step

**Modify:** `src/game/match.ts`, focused `src/game/dora.test.ts` / `src/game/team.test.ts`.

- [ ] Locally reproduce one **waiting-seat** DoraEmon in `brAnotherStages(...).stage3`. `arrive()` already invokes `opening()`; preserve that path and its watch threshold, seed and seat logic.
- [ ] Extract `stepIntro(f)` from the pre-fight `run()` branch (`age++`, `doraFall()`, `enter()`, 337-tick completion to idle). Call it for the waiting DoraEmon from `move()` **after hit-stop/held handling but before CPU `think()`, `land()` and `cancel()`**. Ensure age advances only once per tick, and preserve existing pause, first-seat and non-Dora source intro semantics.
- [ ] Keep the intro **untouchable**: the source intro/introLand frames contain no body boxes, so an enemy attack during the 337 ticks does not hit/push him. Do not add separate invulnerability flags or pose/hurtbox changes.
- [ ] Assert arrival starts the 337 ticks **on actual entry**; compare to the existing first-seat test's sampled sprite-image IDs, rise/hold/fall, y=0 landing, **360 intro power → four 90-EN stocks once**, and Black/OP super Charge events. Verify that HPA-858's blocked voluntary EN **command** does not block his intro charge in B.R.
- [ ] Use **one** waiting-seat case and the **existing** first-seat test (`src/game/dora.test.ts`); second/middle/last waiting seats share the same path. Verify ordinary CPU input resumes only after the intro and other waiting fighters/Continue remain unchanged.

**Checkpoint:** Intro parity established deterministically, without a scene hook, renderer changes or three separate seeded boss arrangements.

## Phase 3 — Four DoraEmon move rules and a single coordinated export

**Modify:** `scripts/export_assets.py`, `src/game/match.ts`, `src/game/dora.test.ts` (not `commands.ts`).

- [ ] **Twin Hammer:** remove `254` from the exporter's `protected` set. 254's PCs do not overlap 250/252's cast PCs. Test both cast swings still protected, hit follow-up vulnerable, and pushboxes intact.
- [ ] **Counter Hit:** change only Dora guard reactions `172`/`174` command steps `0x2120 → 0x2060` during export. Existing physical K/Hit Up maps to B+C; preserve guard ages/windows, stock cost and `Match.counter()`. Test K alone, wrong keys (H, old G+H), missing stock and other fighters' counters.
- [ ] **Fists:** remove 327/328/330/331/332 blanket protection; restore hurtboxes. For **each damaging punch-box event**, emit a **matching one-tick zero-damage guard box** in a verified free slot (candidate slot 1), `kind=0x103`. Copy that source punch's **x/y/w/h** exactly: flurry x=103, w=77; copy y/h from the same source event. Do **not** reuse source 225's torso-sized x=4/y=-133/w=23/h=80. Cover the active punch boxes in 327/328 (**t=22,28,34…178**, dash/uppercut roughly 199–237) and 332's follow-up (uppercut active ~94–112); close the guard at each hitbox's end/next tick and re-emit on the next punch. This is **not continuous move immunity**.
- [ ] In `Match.clashBoxes()`, **symmetrically** check `(box.kind & 0x100) || (met.kind & 0x100)` against a damaging opposing box **before** generic clash/handler code. Call `strip(a,b)` (clears both _all_ boxes), queue no handler, and **stop the current outer-holder iteration** so a captured old `const box` cannot collide again. The current punch/guard ends, but Fists' script continues and the next emitted punch/guard re-arms protection. Test opposing holder orders, first-and-later clashes, a punch gap, vulnerable body hit that bypasses the guard, and unchanged 225 behavior.
- [ ] **Pierce:** remove 338/339/340/341/342 from exporter PC protection. Store a single optional **`pierceCastTick`** on Dora's `Fighter` when initial source 338/339 starts; do **not** restart on 338→339 at t=0 or any 340/341/342 handler. Check **`Match.contact()` before `struck()`** (which is module-level and has no `this.roundTicks`): skip target Dora's strike **and grab** contacts only when `target.action==='script'`, base branch is in **{338,339,340,341,342}**, and `this.roundTicks - target.pierceCastTick < 100`. Ignore/clear the field when entering another action or super-canceling out; never protect landing 270 or unrelated 269. Tests: 99 protected/100 vulnerable, follow-ups don't reset, **hit-stop ticks count toward the 100**, cancellation into another super immediately loses protection, grabs and direct hits both work after expiry. No generalized immunity subsystem.
- [ ] Keep Cannon/Gadgets/Hug/FK之意思 and HPA-858 charge/KO RELOAD tests unchanged. Do all Dora exporter edits **in one commit** with focused green tests. Generated JSON/poses remain **gitignored**.

### R2 fingerprint gate — mandatory before pushing exporter code

`README.md`, `.github/scripts/fetch-generated.sh`, `scripts/build.sh` and `scripts/upload_r2.sh` bind generated data to the current exporter's `.exporter` fingerprint. CI/Workers lack the original local handoff.

- [ ] With the verified local source handoff, run **`bun run assets`**, focused Vitest, `bun run validate` and `bun run build` **before publishing** the exporter change.
- [ ] **With the owner's explicit authorization and existing R2 credentials**, run **`bun run upload:r2` immediately before pushing** the verified exporter-changing commit. It uploads the versioned assets/fixtures and writes the **mutable root `generated.tar.gz` last**.
- [ ] Coordinate push, checks and merge promptly: the newly uploaded root tarball can temporarily make old `main`'s fingerprint fail until this PR merges. **No upload, no claim of CI readiness, and no exporter-code push without authorization**. If the environment/authorization is unavailable, record the blocker; don't fabricate asset/CI success or create a new deployment system.

**Checkpoint:** Four altered moves have passing focused tests, and the matching R2 export is published **before** pushing the exporter edit. No unrelated new art/SFX task.

## Phase 4 — Guide, evidence and minimal product acceptance

**Modify:** `src/instructions/moves.ts`, `docs/evidence.md`, existing browser test only if a narrow assertion is useful.

- [ ] Update only the four guide rows: Fists clashes up front but body vulnerable; Pierce first second only; Twin Hammer cast protected/follow-up vulnerable; Counter Hit **K while blocking**. Preserve HPA-858's existing EN availability text.
- [ ] Document recovered KO Down source records (with times/PCs where verified) versus authored `!br` boundary, Fists `0x100` box-strip rule, Pierce cast tick, Counter Hit record and Twin Hammer `254` exclusion, and full waiting-seat intro parity.
- [ ] Run **`bun run validate`**, **`bun run build`**, **`bun run e2e`** and record exact pass/fail results in **this same PR**, not assumed passes from Cloudflare preview. CI on draft PRs may skip jobs. Record the authorized R2 upload status separately; no local-only claim of deploy readiness.
- [ ] **One-platform browser MCP E2E (macOS Chromium sufficient):** boot game, enter an existing match, verify HUD + controls and no browser errors, open `/instructions.html` using the existing `e2e/unconfigured/smoke.spec.ts` navigation and assert the four updated move descriptions.
- [ ] **Visual screenshot acceptance:** with the same MCP/browser run, capture and inspect a screenshot of the **instructions page and normal HUD** against established UI. HPA-973 has **no Linear UI mockup**. Late Dora's image sequence is verified deterministically; **no browser stage-3 playthrough, late-intro screenshot, new test hook, or three-seed matrix**. **Delete `.playwright-mcp/` afterwards** per `AGENTS.md`.
- [ ] Other platform-specific checks are optional because no platform-specific behavior changes; Windows Edge/iOS Safari may be recorded as not run. No manual/human acceptance criteria; no new browser farm. Linux CI remains as configured.

**Checkpoint:** Passing tests + current R2 data + one-platform MCP E2E + visual screenshot evidence. Implementation, docs and tests all stay on PR #19.

## Acceptance checklist / merge readiness

- [ ] Whole-roster KO Down regression covers native event ages (**TRAINING t=0 → knockdown 113; Dora t=61**; 43 source life tests + two scripted exceptions); source-driven recovery only, **`downed` remains true**, 0-HP/result/B.R. boundary and **same-tick** 1P trade-KO pass.
- [ ] Dora first/late intro: 337 ticks, original images, four stocks once, correct y/landing, no hit/push during intro, normal CPU behavior resumes.
- [ ] Fists' repeated active punch guards **rearm after strip**, work from either holder order and leave body vulnerable; Pierce's 100 **`roundTicks`** expire during hit-stop, a super-cancel ends immunity, and both strikes/grabs recover; Counter Hit K-only; Twin Hammer follow-up 254 vulnerable. Unchanged moves and HPA-858 gates pass.
- [ ] Existing exporter/asset build fingerprint passes **after authorized R2 upload**; generated source files remain out of Git. The upload's temporary effect on main's builds is explicitly coordinated.
- [ ] `bun run validate`, `bun run build`, `bun run e2e` and **MCP E2E + screenshot visual check** have recorded actual results. No human acceptance, optional cross-platform expansion or second PR.
- [ ] Do **not** mix HPA-1035's all-B.R. native-revive suppression, HPA-770 CHAOS, HPA-972 cheats, unrelated art/SFX or refactors into this one HPA-973 PR.
