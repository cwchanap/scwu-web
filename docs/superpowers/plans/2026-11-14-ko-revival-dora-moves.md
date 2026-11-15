# HPA-973 — KO revival and DoraEmon move retuning — implementation plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-973/fix-revive-after-kill-hp-and-retune-doraemons-invincible-moves  
**Design:** `docs/superpowers/specs/2026-11-14-ko-revival-dora-moves-design.md`  
**Status:** Planning-only draft; **no implementation or test execution has happened yet**.  
**Delivery:** **One PR** per HPA-973. Add implementation, tests and verification commits to **this same branch/PR** after design review. No art/SFX work is needed.

## Baseline and constraints

- Merged into `main`: HPA-767 cheat-mode `Match` snapshot (#14), HPA-765 mode selector (#17), HPA-766 three-stage BR Another and ten-seat setup (#18).
- `Match.knockOut()` pays slot HP bonuses; its `koLand` path leaves a healed fighter down; `downed` is deliberately the brawl-elimination marker and **must remain true after recovery**.
- Source KO landing `KO_SCRIPTS` is currently scoped to ZAKU/PAC-HELO. Source HP-test branches exist for six more characters, while **all fighters** need a fallback.
- DoraEmon invincibility is authored through `scripts/export_assets.py` frame-body transformation, checked by `src/game/dora.test.ts`. Input uses `buttonsOf('dora')` and existing guard checks.
- `docs/evidence.md` and `src/instructions/moves.ts` currently describe the supers and Counter Hit's **old** rules; change both.
- Keep YAGNI: no generalized recovery framework, new status flags if existing states suffice, new image/SFX, new frontend component, or new multi-browser test runner.

## Phase 0 — Capture current behavior with focused tests

**Read/test:** `src/game/match.ts`, `src/game/team.test.ts`, `src/game/dora.test.ts`, `src/game/commands.ts`, `src/game/animations.ts`, `scripts/export_assets.py`.

- [ ] Add one table-driven KO-recovery test over **every member of `CHARACTERS`**. Create a small story battle that actually invokes `knockOut`, rewards the knocked-out 1P/striker through `slot.life`, lets the KO land and asserts the fighter has positive HP and can return to a playable get-up, without changing `downed`. Use existing test helpers and real `Match.step`, not a screenshot fixture or new simulation engine.
- [ ] Cover each source-special case (GOLF, ASURA, TTRO, ASTROMAN, Z-MEGA, RARIO) and ZAKU/PAC-HELO, confirming their branch entry and no duplicated scripted BR refill. Add a no-bonus / no-HP negative case.
- [ ] Reproduce post-result suppression: after `picking` or `winner` has committed, no KO wake; ensure a healed player does not force a loss while battle is still active.
- [ ] Identify the existing 225 front guard box, exported Dora action 327/338/250/252/254 frame PCs, and guard counter source command. Record the original conflicting `dora.test.ts` expectations before changing them.

**Checkpoint:** Narrow tests reproduce the KO bug and pin the existing Dora rules. No gameplay changes yet.

## Phase 1 — Shared KO recovery in Match

**Modify:** `src/game/match.ts`, focused `Match` tests.

- [ ] Add a **single** recovery gate on a fighter's KO-landed/settled path, with `f.downed && f.hp > 0`, present fighter and active encounter checks. Run only after ordinary KO flight/landing; do not steal pending actions or disrupt source-scripted BR revival.
- [ ] Route six source stand-up cases to their known action targets (GOLF 131; ASURA 130; TTRO 145; ASTROMAN 143; Z-MEGA 157; RARIO 27), verifying the actual target semantics in source fixtures. For ZAKU/PAC-HELO, preserve their variable-11 BR route and use existing generic get-up only when healed and still stranded. Use `action(f, 'getUp')` for the remainder of the roster.
- [ ] Keep `f.downed` set. A KO already counted for brawl elimination is not invalidated when the fighter rises. Ensure recovery fires once, does not restart on future frames, and uses existing round-reset behavior.
- [ ] Add focused tests for duel, story brawl, timed/settled result, and BR/Continue behavior where affected. Do not change `Story`, route generation or the whole results state machine.

**Checkpoint:** Full roster loop passes; previously passed KO/brawl/Continue tests stay green.

## Phase 2 — DoraEmon-only move rules in the exporter/input path

**Modify:** `scripts/export_assets.py`, only the narrow `src/game/commands.ts` / `src/game/match.ts` region if required by input or elapsed-cast timing; update `src/game/dora.test.ts`.

- [ ] **Fists:** remove its invincibility suppression (327 and cast-follow-up PCs); restore body hurtboxes. Reuse dash-in kick 225's zero-damage frontal clash box without copying its branching handler. Verify enemy attack boxes can be cancelled by collision while a body hit damages DoraEmon.
- [ ] **Pierce:** limit suppression to elapsed cast ticks **0..99** from 338's start, including early fragments, but not later fragments or shared landing. Cover first protected tick, tick 99, tick 100, remaining follow-up and post-landing vulnerability. Do not refresh the timer at a subaction boundary.
- [ ] **Twin Hammer:** protect 250/252 and their inline swing PCs, but not follow-up 254's unique frames; keep pushboxes throughout. Update both gap scenarios and frame-based assertions.
- [ ] **Counter Hit:** map only DoraEmon's guard check to the physical K (existing B+C source bits), retaining reaction 197 and the one-stock cost. Prove K-only works during the guard window, not outside, and cannot trigger without stock; replace the obsolete two-key test expectations.
- [ ] Keep Cannon 296, Gadgets 305 and all unaffected moves' invincibility, cancellation, stock and hit behavior. Do not edit extracted `.PLAYER` files or check generated JSON into Git. Regenerate with `bun run assets` when the verified handoff is available.

**Checkpoint:** Focused DoraEmon tests pass with exact timing, clash-versus-hurt and guard-input behavior.

## Phase 3 — Text and evidence

**Modify:** `src/instructions/moves.ts`, `docs/evidence.md`.

- [ ] Update Fists, Pierce, Twin Hammer and Counter Hit labels/descriptions and remove the old conflicting claims.
- [ ] In `docs/evidence.md`, append HPA-973 authored corrections under the DoraEmon section, citing source action numbers and behavior differences. Note the all-roster KO revive and preserved brawl `downed` semantics.
- [ ] Preserve existing guide layout and styles. There is no new Linear UI mockup for this issue and no art to generate.

**Checkpoint:** Instructions and evidence agree with the tested rules.

## Phase 4 — Verification and draft PR update

- [ ] Run `bun run validate`, `bun run build`, and `bun run e2e` using the available macOS/Chromium environment; record exact results and failures in this PR. If source handoff is missing, record `bun run assets` as **not run**, not passed.
- [ ] Keep existing browser route/guide smoke working and make the minimal text assertion or visual inspection possible with existing Playwright controls. Do not build a full combat tournament browser suite for deterministic `Match` rules.
- [ ] Recheck the PR diff: design, implementation, tests and documentation for **HPA-973 only**. Keep the same PR draft until changes and available automated checks are verified; do not split the ticket across PRs.
- [ ] Record unavailable Windows/iOS runs as **unverified**, not failures to be solved by a new browser farm. Android and Linux are CI-only.

## Product-level E2E acceptance criteria

Unit/integration tests above are the **deterministic gameplay correctness evidence**; the following are lightweight product-level acceptance checks using existing runners/controls, without human sign-off:

- [ ] **macOS / Chromium:** Automated game startup → choose a fighter → run a practice/story match → verify arena/HUD is present and match controls remain responsive after KO/recovery as exercised by the deterministic `Match` test; open DoraEmon's instructions page and assert Fists/Pierce/Twin Hammer/Counter Hit text shows the new rules, with no browser errors.
- [ ] **Windows / Edge:** When an existing Edge runner is available, run the same short entry, control and instructions-page E2E check and assert visible move text/HUD; otherwise explicitly mark **not run (runner unavailable)**. Do not add new test infrastructure solely for this ticket.
- [ ] **iOS / Safari or WebKit:** When an existing device/runner is available, use touch navigation to enter a match and open DoraEmon's instructions, assert text and HUD remain visible at phone portrait and landscape; distinguish WebKit emulation from actual iOS Safari and mark unsupported runs **not run**.
- [ ] **Visual check:** Compare existing guide typography/row alignment and arena HUD against their established UI, including the four revised Dora descriptions. **HPA-973 has no Linear UI mockup**, so there is no new mockup to match.
- [ ] **CI only:** Android/Linux coverage relies on existing CI; no separate Android/Linux acceptance or human acceptance is required.

## Ready-for-review definition

- [ ] All roster fighters with post-KO bonus HP can recover before the fight ends; existing source-specific routes are preserved; KO'd fighters with zero HP and finished results stay down.
- [ ] `downed` remains the brawl elimination marker; no premature wins, losses or repeated wake transitions.
- [ ] Fists is vulnerable with a *frontal attack-box clash*; Pierce is invincible **only for the first 100 ticks**; Twin Hammer's hit follow-up is vulnerable; Counter Hit is **K while guarding**, one stock.
- [ ] Other DoraEmon moves, fighter input controls and original game routes remain unaffected; all four instructions and `docs/evidence.md` updated.
- [ ] Exact validation/build/E2E outcomes recorded accurately; cross-platform unsupported checks not misrepresented. One HPA-973 PR, no unrelated art/SFX or feature work.
