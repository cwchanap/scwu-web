# HPA-973 — KO recovery, DoraEmon moves and late-arrival intro — implementation plan

**Linear:** https://linear.app/cwchanap/issue/HPA-973  
**Design:** `docs/superpowers/specs/2026-11-14-ko-revival-dora-moves-design.md`  
**Draft PR:** https://github.com/cwchanap/scwu-web/pull/19  
**Review:** Revised to address [design review #5948835717](https://github.com/cwchanap/scwu-web/pull/19#pullrequestreview-5948835717), 2026-11-17.  
**Baseline:** `main` at `7546518bdccd25af948ce0b9e3607a5830061d41`, including merged HPA-858.  
**Delivery:** **ONE PR** for the whole ticket: spec, implementation, tests, docs and evidence on this same branch. Currently **planning only**; no HPA-973 implementation or test run.

## What changes, and what doesn't

1. **Source KO Down life checks** already describe HP recovery for 43/45 fighters; the old `koLand` clip path fails to execute them. Reuse records at their native ages. This is **recovered** behavior. Gate the newly restored life-test recovery on `!match.br` (**authored**).
2. **Late DoraEmon entrance:** `arrive()` already calls `opening(f)`, but only the pre-fight branch advances Dora's 337-tick `intro`. Share one stepping helper between pre-fight and active-combat paths.
3. **DoraEmon moves:** two small exporter changes (Twin Hammer `protected` set and Counter Hit command), plus Fists flagged-box clash behavior and Pierce cast-relative invincibility in `Match`.
4. **Publishing:** any `scripts/export_assets.py` change must be followed by a **coordinated R2 export upload** before pushing it; CI and Workers verify a mutable `generated.tar.gz` fingerprint.

HPA-858/PR #22 is merged: player-controlled DoraEmon cannot KO RELOAD, and the voluntary/CPU charge command is gated. Keep it unchanged. HPA-1035 is separate and **not merged**: it owns disabling *all* native revives in B.R. (ZERO/ANOTHER/CHAOS/LONG) and the other B.R. features. HPA-973 must not silently implement that ticket, change enemy lineups or introduce a new B.R. flag/state machine.

**Implementation sequence:** keep each local fix's failing repro and passing regression together. The pre-commit hook runs `bun run validate`; **never push a separate commit containing deliberately failing Phase-0 tests**. Use local red/green inside the implementation phases and commit only green tests.

## Phase 1 — Recovered KO Down HP branches, not a per-fighter table

**Modify:** `src/game/match.ts`, existing `src/game/team.test.ts` / `src/game/match.test.ts`, `docs/evidence.md`.

- [ ] Locally reproduce a KO'd fighter whose HP increases through a real story enemy's `slot.life` payout; in the same change, add passing regression tests. Include a **trade-KO** where 1P gets the kill HP while downed and remains in an active, undecided battle.
- [ ] Inspect the source `twin(who, KO_DOWN)` records and test their round-over `test` followed by `life` (HP ≥ 1) **at source event age**. Use the actual exported events for all `CHARACTERS`: 43 life-test cases, two variable-11 exceptions. Representative expected ticks: 60 for Ryuko/GOLF/ASURA/TTRO/Z-MEGA; ASTROMAN 130; RARIO 66; TRAINING 0. Test the native branch target, not a hardcoded runtime who→get-up map.
- [ ] In `moveKO()` for `koLand` with **no result branch**, read `eventsAt(twin(f.who, KO_DOWN), f.age, f.who)` and honor the source's round-over test via `passes()`; when the life record passes `lifeMark()` and **`!this.br`**, call `enterSource(f, event.target, event.offset)`. Source get-up twins already map to engine `getUp`. Preserve `KO_SCRIPTS` (ZAKU/PAC-HELO) and their existing variable-11 paths, without generic fallback.
- [ ] For `KO_TIMELINES` (`koLand` with `branch`), update only the KO-specific `resultEvents()` life branch to enter the *actual get-up* via `enterSource()` instead of remaining in `koLand` through `enterResult()`. Keep other result events, win/draw life tests, randoms and roll behavior untouched.
- [ ] Test 0 HP (no get-up), positive HP at exactly the record tick, no post-result recovery, `downed` remaining true for brawl elimination, and `Match.story(..., br=true)` preventing **HPA-973's newly restored life-test branch**. Do **not** assert that today's native CPU Dora/ALPHA/ZAKU/PAC-HELO B.R. revives are already off; HPA-1035 owns that future switch.
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
- [ ] **Fists:** remove 327/328/330/331/332 cast protection and restore hurtboxes. Export a source-225-shaped **zero-damage frontal kind-3 box** in a free Fists slot with one authored high-bit marker **`0x100`** (`kind = 0x103`) identifying the special clash cancel. In `Match.clashBoxes()` **before the generic damaging-box handling**, detect that marked box against an opposing damaging box, **strip both holders' boxes without queuing `onClash`**, and continue normal Fists script on later ticks. Do not copy source 225's branch-to-226 handler. Assert actual head-on attack-box cancellation, a separate direct body hit that damages Dora, and no changes to regular source-225 or other fighters' clashes.
- [ ] **Pierce:** delete 338/339/340/341/342's blanket exporter PC protection. Track an initial Dora Pierce `castStartTick` only when 338/339 is first invoked, **not** when later fragment handlers run. In the normal `struck()` overlap path suppress Dora's hit/grab body collision only while the Pierce cast is active and `roundTicks - castStartTick < 100`; ignore/clear marker on exit. Tests: direct hit and grab blocked at tick 99 but work at tick 100, branches never restart timer, landing 270 and unrelated 269 vulnerable. No generalized immunity subsystem.
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
- [ ] **Visual screenshot acceptance:** with the same MCP/browser run, capture and inspect a screenshot of the **instructions page and normal HUD** against the established UI. HPA-973 has **no Linear UI mockup**. Late DoraEmon's pose/image sequence is already verified in deterministic tests; **no browser stage-3 playthrough, late-intro screenshot, new testing hook, or three-seed matrix**.
- [ ] Other platform-specific checks are optional because no platform-specific behavior changes; Windows Edge/iOS Safari may be recorded as not run. No manual/human acceptance criteria; no new browser farm. Linux CI remains as configured.

**Checkpoint:** Passing tests + current R2 data + one-platform MCP E2E + visual screenshot evidence. Implementation, docs and tests all stay on PR #19.

## Acceptance checklist / merge readiness

- [ ] Whole-roster KO Down regression verifies native HP-test ages (43 source + two existing scripted exceptions); recovery is through source records, not a handmade table; **`downed` remains true**; 0-HP/result/B.R. boundary and 1P trade-KO pass.
- [ ] Dora first/late intro: 337 ticks, original images, four stocks once, correct y/landing, no hit/push during intro, normal CPU behavior resumes.
- [ ] Fists' *damaging-box clash really strips both boxes* and leaves body vulnerable; Pierce is exactly 100 ticks from cast for strikes and grabs; Counter Hit K-only; Twin Hammer follow-up 254 vulnerable. Unchanged moves and HPA-858 gates pass.
- [ ] Existing exporter/asset build fingerprint passes **after authorized R2 upload**; generated source files remain out of Git. The upload's temporary effect on main's builds is explicitly coordinated.
- [ ] `bun run validate`, `bun run build`, `bun run e2e` and **MCP E2E + screenshot visual check** have recorded actual results. No human acceptance, optional cross-platform expansion or second PR.
- [ ] Do **not** mix HPA-1035's all-B.R. native-revive suppression, HPA-770 CHAOS, HPA-972 cheats, unrelated art/SFX or refactors into this one HPA-973 PR.
