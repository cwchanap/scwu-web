# HPA-973 — KO recovery, DoraEmon moves and late-arrival intro — implementation plan

**Linear:** https://linear.app/cwchanap/issue/HPA-973  
**Design:** `docs/superpowers/specs/2026-11-14-ko-revival-dora-moves-design.md`  
**Draft PR:** https://github.com/cwchanap/scwu-web/pull/19 — **one PR** for specification, implementation, tests and verification; do not create a second PR for this ticket.  
**Revision:** 2026-11-17, reviewed latest `main` commit `7546518bdccd25af948ce0b9e3607a5830061d41`; planning only. No implementation or tests have been run in this PR.

## Updated baseline / scope owner

- The original branch was created just after HPA-766/PR #18. Main has **26 new commits**; **HPA-858/PR #22 is merged** and added boss B.R. ANOTHER routes, tough enemies, `Match.br` route context, DoraEmon's command charge gate and player-controlled KO RELOAD block. Work from those current paths, not the old line numbers or old HPA-858 assumptions.
- **Linear HPA-973 now has three fixes**: KO with bonus HP (outside B.R.), four move rules, and waiting-seat DoraEmon intro parity. Do all three here.
- **Linear HPA-1035, not merged**, owns prohibiting all *native* revives in all B.R. modes, along with B.R. LONG and lineup/loading changes. HPA-973's new bonus-HP get-up must **skip `match.br`** but **must not preempt** HPA-1035's wider switch. Existing CPU Dora B.R. KO RELOAD test remains a baseline until that ticket lands.
- Minimize scope: reuse `Match` / `src/game/commands.ts` / `scripts/export_assets.py` and existing tests. No state machine, new BR flag, additional framework, new assets/SFX, API/backend, or compatibility handling.

## Phase 0 — Record regressions against latest main

**Inspect/test:** `src/game/match.ts`, `src/game/team.test.ts`, `src/game/dora.test.ts`, `src/game/br-another.ts`, `src/game/animations.ts`, `src/game/commands.ts`, `scripts/export_assets.py`.

- [ ] Table-drive **all `CHARACTERS` in a non-B.R. story**, KO a fighter who should receive `slot.life` for a defeated enemy, then run real `Match.step` until landed. Assert the fighter's HP is positive but stranded in the initial repro; pin `downed` and the pending/winner state. Include zero-HP/no-bonus and a picked-result case.
- [ ] Reproduce the **B.R. exclusion**: `Match.story(..., br=true)` receives the same bonus but must not gain HPA-973's new common get-up. Assert current native CPU Dora/ALPHA revival is not accidentally removed; HPA-1035 will change that separately. Confirm HPA-858 player-controlled Dora still cannot enter source KO RELOAD 72/74.
- [ ] Pin GOLF→131, ASURA→130, TTRO→145, ASTROMAN→143, Z-MEGA→157, RARIO→27 stand-up targets; preserve ZAKU/PAC-HELO variable-11/KO BR HP paths. Identify source 225's frontal kind-3 box, the Dora 327/338/250/252/254 protected frame PCs and guard 172/174 input check.
- [ ] Reproduce **DoraEmon's late entrance** via a deterministic seeded `brAnotherStages(...).stage3` with a waiting DoraEmon. In `arrive()` it gets `action='intro'`; when it enters after `fightTick`, contrast the active `move()` branch with pre-fight `run()`'s 337-tick `doraFall` + `enter`. Pin first-seat 337-tick/4-stock intro as a control.

**Checkpoint:** All three defects and their boundaries are reproduced without changing production behavior.

## Phase 1 — Fix HP-bonus KO recovery (outside B.R. only)

**Modify:** `src/game/match.ts`, existing KO/story/team tests.

- [ ] Add one narrow transition for **present settled KO**: `!this.br && f.downed && f.hp > 0` while neither `picking` nor `winner` has committed. Do not interrupt an airborne KO, a pending action or an already-running source recovery. Reuse `action(f, 'getUp')` for fighters without a source branch. Do not introduce a new `reviving` state or make all `KO_SCRIPTS` run as source.
- [ ] For six source-specific fighters enter tested stand-up targets; for ZAKU/PAC-HELO preserve their source script/refill and use ordinary get-up only if otherwise stranded. Do not award additional HP or power in the transition.
- [ ] Preserve `f.downed = true` for brawl elimination, once-only recovery and ordinary next-round reset. Add tests for non-B.R. duel/story brawl, high/low stock, last-hostile elimination, timed result, retry/Continue, positive HP without recovery after result.
- [ ] Assert in `br=true` that bonus HP **does not** trigger the new recovery, while the already merged HPA-858 player-Dora restriction and existing CPU Dora native outside-B.R. behavior hold. Mark HPA-1035's wider no-revive tests as that ticket's responsibility.

**Checkpoint:** Whole-roster non-B.R. test passes; no new B.R. get-up; existing HPA-858/KO regressions remain green.

## Phase 2 — Share DoraEmon's full intro progression with late arrivals

**Modify:** `src/game/match.ts`, focused `dora.test.ts` and `team.test.ts`.

- [ ] The current `arrive(f,i)` already calls `opening(f)`; **do not change the watch/seat path**. Factor pre-fight Dora `intro` stepping into a small helper reusable by the active-fight loop rather than inventing a scene animation or a general intro state machine.
- [ ] Advance `age`, `doraFall(age-1)`, `enter` events and the 337-tick completion/landing in the active branch, starting **at actual arrival**; ensure CPU/keyboard commands do not replace the intro before its last frame. Preserve hit-stop and normal first-seat behavior.
- [ ] Assert first/late parity: exact **337 ticks**, established image samples `[0,149,150,177,257,266,267,276,336]`, rise/hold/fall then `y=0`, and OP super Charge's **360 power → four stocks exactly once**. This intro reward still works in B.R.; HPA-858 blocks the EN-charge *command*, not this intro.
- [ ] Exercise Dora as second/middle/last waiting stage-3 boss and first-seated control; ensure other bosses still arrive when watched thresholds cross, regular fighters' intro scripts remain unchanged, stage/Continue result unchanged. Use seeded `brAnotherStages` fixtures; no full tournament browser run.

**Checkpoint:** Late DoraEmon enters with exactly the original visual sequence/power and then resumes ordinary CPU combat.

## Phase 3 — DoraEmon-only move changes

**Modify:** `scripts/export_assets.py` and only narrow `src/game/commands.ts` / `src/game/match.ts` changes if needed. Update focused `dora.test.ts`.

- [ ] **Fists:** stop suppressing cast 327/332 hurtboxes. Add forward, zero-damage kind-3 clash box like dash kick 225 without its branch-to-226 handler. Test frontal box-vs-box cancellation **and** vulnerable body contact; no extra damaging hit.
- [ ] **Pierce:** protect cast-relative ticks **0–99** from 338; restore hurtboxes at 100 and in later 340/341/342 fragments and landing 270. Do not restart timer when branch changes. If exporter PC reuse makes this impossible, use a single Dora-only elapsed-cast check in the current combat/hurtbox path rather than a new subsystem. Test 99/100 and post-cast.
- [ ] **Twin Hammer:** protect 250/252 plus inlined 251/253, not hit follow-up 254-only frames; keep pushboxes. Update former all-frames-invincible assertions and both distance cases.
- [ ] **Counter Hit:** change Dora-only guard command to **K alone** (physical Hit Up/B+C), same window and one-stock cost; test success, out-of-window, no-stock, other fighters' unchanged controls.
- [ ] Preserve Cannon 296, Gadgets 305, Hug, FK之意思, all unmodified stock rules and new HPA-858 charge/KO RELOAD tests. Exporter needs verified extracted handoff; **never commit generated source JSON**. Run `bun run assets` if source is available and record inability otherwise.

**Checkpoint:** Four altered moves have direct deterministic assertions, untouched move/input/charge cases remain green.

## Phase 4 — Instructions and evidence

**Modify:** `src/instructions/moves.ts`, `docs/evidence.md`.

- [ ] Fists describes frontal clash with vulnerable body; Pierce says invincible for first second; Twin Hammer notes vulnerable hit follow-up; Counter Hit input reads **K while blocking**. Leave HPA-858's separate EN availability text correct.
- [ ] Record the authored KO get-up rule and `downed` brawl semantics, `!br` boundary/HPA-1035 ownership, Dora source action IDs, and late intro 337-tick four-stock parity in `docs/evidence.md`. No new UI or assets.
- [ ] Reuse existing instructions layout; HPA-973 has no new Linear mockup.

**Checkpoint:** Guide text, source evidence and tests agree.

## Phase 5 — Automated end-to-end acceptance and verification

- [ ] `bun run validate` including format/lint/type/Vitest, `bun run build`, `bun run e2e`; record actual outcomes on PR #19. CI on drafts may skip certain jobs, so a successful preview **does not count as tests passing**.
- [ ] **MCP-driven product E2E on macOS Chromium (single-platform suffices)**: start app, navigate to a story/B.R. match, verify visible HUD and functioning controls, open DoraEmon's instructions and assert all four revised text rows and absence of browser exceptions. Reuse the Playwright `e2e/unconfigured/mode-select.spec.ts` smoke; do not add a multi-platform test farm.
- [ ] **Visual screenshot check:** automated browser/MCP screenshot of actual guide layout and a reproducible **waiting-seat DoraEmon entrance** + arena/HUD where current test hooks allow. Compare against the established first-seat sprite sequence/arena UI (no HPA-973 mockup). Use deterministic `Match` tests for precise 337-tick and stock assertions; do not drive an entire 4-boss CPU tournament in the browser merely to count ticks.
- [ ] Windows Edge/iOS Safari are optional additional coverage and can be explicitly marked **not run**; no human acceptance. Existing Linux CI remains; Android has no separate acceptance target.
- [ ] Review the PR diff for **HPA-973 only**; leave HPA-1035 B.R. source-revive switch, new B.R. LONG/sign, evenly seeded lineups/loading screens, HPA-770/972 and art/SFX outside. Keep **this one PR** draft until implementation and available automated acceptance are recorded.

## Ready-for-review acceptance checklist

- [ ] **Every roster fighter outside B.R.** with KO + earned HP can resume; source-specific get-ups and fallback match, zero-HP/picked-result don't wake, `downed` remains true and brawl win/Continue are correct.
- [ ] `br=true` **never runs HPA-973's new** bonus-HP get-up; HPA-858's already merged player-Dora KO RELOAD/EN restrictions remain, no HPA-1035 behavior accidentally duplicated.
- [ ] Fists frontal clash but body vulnerable; Pierce protected **only first 100 ticks from cast**; Twin Hammer follow-up vulnerable; Counter Hit **K only while blocking for one stock**; unchanged other moves and source files.
- [ ] Waiting-stage-3 DoraEmon plays **337-tick** first-seat-equivalent intro, exactly four 90-EN stocks, full rise/fall/landing, with normal input/AI afterwards; first-seat unchanged.
- [ ] `bun run validate`, `bun run build`, `bun run e2e` outcomes recorded honestly; **MCP E2E and screenshot visual check** accepted on one platform without human sign-off. All implementation remains in draft **PR #19**.
