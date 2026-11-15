# HPA-973 — KO revival and DoraEmon move retuning — design

**Ticket:** https://linear.app/cwchanap/issue/HPA-973/fix-revive-after-kill-hp-and-retune-doraemons-invincible-moves  
**Status:** Design proposal. This PR contains documentation only until implementation is added on the **same branch**.  
**Dependencies:** HPA-765, HPA-766 and HPA-767 are merged; HPA-858 is a separate follow-up.

## Goal and scope

Fix a source-compatible-looking but broken KO/HP interaction across the **whole roster**, then adjust four DoraEmon moves to the latest authored rules. Keep the current `Match` tick engine, source-script interpreter, `scripts/export_assets.py` exporter, input mapping, and instructions UI. No new game state machine, rendering system, UI page, art, sounds, backend, or compatibility layer.

These are **authored behavior changes**, not a claim that the Windows original behaved this way. The two fixes share one ticket and **one draft PR**, as requested in Linear.

## A. KO'd fighters with restored HP stand up

### Existing path and failure

- `Match.knockOut()` marks `f.downed = true`, queues `down`, and may pay a defeated story seat's `slot.life` and `slot.power` to the 1P/striker via `gainLife()` and `addPower()`.
- `land()` enters a KO-down source script for `KO_SCRIPTS` (notably ZAKU and PAC-HELO), but ordinarily enters `koLand`; `moveKO()` continues that landed KO pose indefinitely. Six other characters have source HP-test stand-ups, but the `life` opcode is only evaluated in an executed script and the non-script `koLand` never executes it.
- Hence the bar can show restored HP while its fighter remains stuck on the floor. This affects anyone who receives the KO bonus, not only fighters whose data contains a special recovery.
- Brawl survival deliberately counts `f.downed`, not current HP: a previously defeated hostile remains defeated even if it stands again. **Do not reset `downed` during recovery.**

### Proposed behavior

1. Introduce **one narrow KO-recovery transition** in the existing `Match` combat tick path. A *present*, landed or settled KO fighter with `f.downed` and `f.hp > 0` is eligible to stand up **only while the encounter is undecided**. Do not run recovery during the result/round transition (including an already-picked/pending result), and do not interrupt airborne KO motion, a queued reaction or source-driven revival.
2. For **GOLF, ASURA, TTRO, ASTROMAN, Z-MEGA and RARIO**, reuse the appropriate source stand-up target reached by that fighter's own KO HP test, with `enterSource()` where the source path is appropriate. Linear identifies GOLF→131, ASURA→130, TTRO→145, ASTROMAN→143, Z-MEGA→157 and RARIO→27; confirm the actual entry branches in focused tests.
3. For **ZAKU and PAC-HELO**, preserve their existing variable-11 / KO Down BR / KO BR HP scripted path when it is running. If a kill bonus has already given them positive HP and that path does not recover them, transition to their ordinary get-up after they have landed; do not duplicate their delayed refill or interrupt BR-specific scripted revival.
4. **Everyone else** uses `this.action(f, 'getUp')`, as in `recoverKnockdown()`. Reuse existing animations, event execution and state clearing; do not invent a generic `reviving` state or expand `KO_SCRIPTS` to all fighters.
5. The trigger should be idempotent: once the fighter leaves the KO-landed state it cannot re-enter the get-up on each tick. Leave `f.downed` true for the remainder of that encounter, so existing brawl scoring and Continue rules still work. Normal future rounds already reset fighter state via current round setup.

**Where:** `src/game/match.ts`; focused tests in the existing `src/game/team.test.ts` or a small adjacent KO test if that makes the roster loop clearer. No broad changes to `Fighter` or `Story` APIs.

**Critical result boundary:** `run()` computes the encounter result after all fighter steps, including brawl elimination based on `downed`. A healed 1P should not be counted as dead before a pending round result is decided, but a completed or already-selected result must never be undone by waking the fighter. Test the order explicitly rather than adding timer-specific exceptions.

## B. DoraEmon's four changed moves

All move changes are **DoraEmon-only**; retain Cannon, Gadgets, Hug, FK之意思 and the rest of the roster unchanged. Keep source files hash-checked; author asset transformations in `scripts/export_assets.py`, not by editing extracted source or committing generated JSON.

| Move | Authored behavior | Smallest suitable change |
| --- | --- | --- |
| **Fists** — ↓←↓← G (source 327, hit follow-up 332) | **Not invincible.** Forward-facing fists cancel opposing strike boxes that clash with them, like the dash-in kick (source 225); direct hits to his body still land. | Remove Fists' PCs from the exporter hurtbox-suppression set; introduce a forward zero-damage clash/guard box modeled on 225 while its flurry is active, preserving hurtboxes, pushboxes and normal continuation. Do not reuse 225's branching follow-up handler. |
| **Pierce** — ↓→↓← H (338, subsequent fragments 340/341/342) | Invincible for **the first 100 engine ticks (1.0 s) counted from the original cast of 338**, then vulnerable even if a later subaction is still running. | Scope exporter protection by cast-relative frames/PCs, including fragments of the same early cast; do not restart the 100-tick window for each subaction. Keep shared landing 270 and other reused tails vulnerable. |
| **Counter Hit** — K while blocking (guard reactions 172/174 → 197) | One press of **K** in the existing guard counter window, spending one stock; no simultaneous G+H / G+K requirement. | Author the DoraEmon-only guard command check against the already mapped K/Hit Up input (DoraEmon B+C bits in `buttonsOf`), retaining the shared command recognizer and stock cost. Verify K alone works and the old two-key-only requirement is gone. |
| **Twin Hammer** — ↓← G (250/252, inlined swings 251/253, follow-up 254) | Invincible throughout the dashing punch + uppercut cast, **not** the separate hit follow-up 254. | Keep suppression on 250/252 and their inlined swing PCs; exclude 254-only frames/PCs while preserving shared frames' intended semantics and all pushboxes. |

### Exporter design details and tests

The current `export_assets.py` DoraEmon patch constructs a `protected` action set (which currently includes 250, 252, **254**, 296/305/**327**/**338** and relevant follow-ups), collects their frame PCs, and strips body kind bits 1/2 of `0b110` (`body['kind'] &= ~6`) while retaining pushboxes. This is the existing correct place to adjust **which frame PCs** get invincibility; avoid a general-purpose new runtime invincibility subsystem.

For Pierce, calculate/verify elapsed time from the originating 338 cast; do not rely on each nested script's local `frame.t` as if it were a global timer. If flattened PC reuse makes exporter-only time discrimination unsafe, use **one localized DoraEmon cast-age rule** in the existing hurtbox/combat path instead of suppressing later frames globally; no broad refactor. Regression tests must prove the exact 99→100 tick boundary and that no later fragment extends it.

For Fists, use the existing source-225 zero-damage `kind: 3` box and the existing `clashBoxes()` behavior, not damage immunity or an uninterruptible animation. Test box-versus-box cancellation **and** a direct body hit; the distinction is the feature. Ensure the new box is actually placed for the flurry and does not accidentally add hits, change damage or steal 225's action branch.

The current input mapping in `src/game/commands.ts` already maps DoraEmon's physical K/Hit Up to source B+C. Prefer a scoped Dora guard-record change over changing the controls for other fighters. Test K-only entry, one-stock spend, no-stock refusal, and unchanged guard windows and other fighters' counters.

Regenerated data remains a build artifact. Export requires the separately supplied verified source handoff (`bun run assets`); document if unavailable rather than checking in generated JSON or asserting unrun tests passed.

## C. Documentation and UI

Update the four DoraEmon entries in `src/instructions/moves.ts` and the *Authored Doraemon and control update (2026-11-01)* evidence section in `docs/evidence.md` (append an HPA-973 change note to make the history clear). The input display must say **K while blocking**; Twin Hammer must not promise follow-up invincibility; Fists should explain front-of-fists clash versus vulnerable body; Pierce should say *first second*.

The ticket has **no new UI mockup**; these are text changes to the existing instructions page. Reuse its current layout/styling; no UI redesign or new images.

## D. Verification and constraints

- Deterministic `Match` tests cover **every roster fighter** through an actual KO → story kill HP bonus → landed revival path, including source-specific routes and fallback, with no post-result wake, repeat wake or brawl-score regression.
- Focused `dora.test.ts` tests replace obsolete invincibility/counter assertions and test each of the four changes; preserve the other two one-stock supers and untouched moves.
- Reuse `bun run validate`, `bun run build`, and existing `bun run e2e`; no new infrastructure or broad suite. `bun run assets` requires the verified handoff.
- Product-level E2E/visual acceptance on **macOS Chromium, Windows Edge and iOS Safari/WebKit** where available; compare the rendered DoraEmon move text and existing HUD to the established UI (there is **no Linear mockup**). Do not claim unsupported Windows/iOS checks ran; keep Android/Linux CI-only. No human acceptance or sign-off criteria.
- Out of scope: HPA-858 DoraEmon BR restrictions, HPA-972 menu/cheat revamp, HPA-770 BR CHAOS, any art/SFX, generated-source edits, new backend or runtime systems, and backward compatibility.

## Decisions to verify during design review

The Linear issue calls out four readings. This design implements them as explicit assumptions: Fists blocks only a **frontal box clash**; Twin Hammer's follow-up is **254**; Counter Hit is **K alone during the existing window**; and fighters without a source revive use the **ordinary knockdown get-up**. Any revision stays in **this PR**, not a second planning PR.
