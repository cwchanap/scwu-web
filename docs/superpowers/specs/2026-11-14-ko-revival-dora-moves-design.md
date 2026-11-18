# HPA-973 — KO recovery, DoraEmon moves and late-arrival intro — design

**Linear:** https://linear.app/cwchanap/issue/HPA-973  
**Draft PR:** https://github.com/cwchanap/scwu-web/pull/19  
**Status:** Planning only; revised after the [17 Nov design review](https://github.com/cwchanap/scwu-web/pull/19#pullrequestreview-5948835717). Implementation/tests have not started in this PR.  
**Reviewed baseline:** `main` at `7546518bdccd25af948ce0b9e3607a5830061d41` (includes merged HPA-858 / PR #22). HPA-1035 is not merged.

## Scope and fidelity

Three fixes in **one PR**: (1) recover from a KO when a kill pays HP, **outside B.R.**; (2) retune DoraEmon's Fists, Pierce, Counter Hit and Twin Hammer; (3) play DoraEmon's full first-entry intro when he joins an ongoing battle as a waiting fighter.

**Corrected classification:** The KO Down HP-test stand-up is **recovered source behavior**, not a newly authored generic revival. The intentional difference from source is the new **`!Match.br` gate** on this recovery, reflecting the revised HPA-973 ticket. Keep recovered and authored behavior distinct in `docs/evidence.md` as required by `AGENTS.md`.

**Ticket ownership:** HPA-1035 separately disables **all** native revives in B.R. (including CPU DoraEmon's KO RELOAD, ALPHA's revival and ZAKU/PAC-HELO's scripts) and implements B.R. LONG, stage rebalancing and loading screens. Until HPA-1035 merges, **do not change** those source-native B.R. paths in HPA-973. HPA-858 already forbids DoraEmon's **player-controlled** KO RELOAD in every mode and forbids voluntary/CPU EN charge for player Dora or any Dora in B.R. Preserve those existing `SEAT_GATES` / `koReloadBlocked()` rules.

No generic recovery state machine, six-character target table, get-up fallback for otherwise unconfirmed cases, new UI, new assets/SFX, backend, or backward-compatibility support.

## 1. Re-enable the source KO Down's HP test (non-B.R. only)

### Root cause, verified against current engine paths

`Match.knockOut()` marks `f.downed = true`; a story enemy's KO can pay its configured `slot.life` and `slot.power` to an already KO'd 1P or striker. A normal KO falls and enters `koLand`. Today `land()` runs `twin(who, KO_DOWN)` as a script only for `KO_SCRIPTS` (ZAKU/PAC-HELO) and as a `KO_TIMELINES` result branch for a fighter like ZIRO; other fighters' KO Down is displayed as a clip, so its **records are never executed**.

The exported KO Down contains a test for round-over (global 15 = 100) followed by a `life` opcode (HP at least 1) that branches to the fighter's **own get-up**. As the review traced, **43 of 45** fighters have the source life-test recovery, including Ryuko 62 → 145 at tick 60, GOLF 48 → 131, ASURA 48 → 130, TTRO 62 → 145, Z-MEGA 70 → 157 (all tick 60); ASTROMAN 61 → 143 at tick 130; RARIO 54 → 27 at tick 66; TRAINING 38 → 113 at tick 0; DoraEmon 76 → 167. These are examples for tests/evidence, **not a hardcoded runtime dispatch table**. ZAKU and PAC-HELO instead use their variable-11 KO Down BR and KO BR HP script; retain that existing path without speculative fallback.

### Narrow implementation

- In `Match.moveKO()`'s `koLand` **clip** path, evaluate `eventsAt(twin(f.who, KO_DOWN), f.age, f.who)` to reproduce the actual round-over `test` and `life` records (including per-fighter timing and loops). Use existing `passes()`, `lifeMark()`, and `enterSource(f, target, offset)`. `enterSource` already maps the source Down Get up twin into the regular `getUp` engine action. No invented settled threshold or get-up table.
- For the existing `KO_TIMELINES` branch, `resultEvents()` currently enters a life target through `enterResult()`, retaining the `koLand` result action; make the KO-specific life branch enter the normal source get-up instead. **Do not** change unrelated win/draw `resultEvents` behavior or its non-KO life tests.
- Apply the authored **`!this.br`** restriction only to this post-KO life recovery. The source's round-over test and current result state must still suppress recovery after the encounter is decided. A fighter with zero HP does not branch. Exiting `koLand` naturally makes the transition once; add no bookkeeping flag.
- Preserve `f.downed` as true for brawl elimination and score. Preserve HPA-858's player-Dora KO RELOAD restriction, and existing source/scripted revives pending HPA-1035. Test a real 1P trade-KO that receives the payout, not only synthetic HP assignment.
- Validate the exported source shape with a table-driven test across all `CHARACTERS`, including ZAKU/PAC-HELO exceptions, native event tick targets and the B.R. `!br` boundary. Never commit generated JSON or modify extracted `.PLAYER` files.

## 2. DoraEmon's four moves

Keep the current hash-checked source exporter. `scripts/export_assets.py` already mutates Dora-specific exported frames/events and strips hurtbox bits (`body['kind'] &= ~6`) for protected frame PCs; make all related data edits in **one exporter change**.

| Move | Required behavior | Concrete approach |
| --- | --- | --- |
| **Twin Hammer** (250/252, inlined 251/253, hit follow-up 254) | Invincible during both cast swings, **vulnerable during hit follow-up 254**. | Remove **254** from exporter's `protected` set. Its frames are independent from 250/252, so leave everything else intact. |
| **Counter Hit** (guard 172/174 → 197) | Press **K alone while blocking** for one stock in the original guard window. | In Dora's exported guard reaction `command` records (ticks 0/8/18), replace source step **`0x2120` (B+E)** with **`0x2060` (B+C)**, the mapped physical K/Hit Up input. No edits to `commands.ts`, `counter()`, other fighters, stock or timing. |
| **Fists** (327 with variants/follow-up 332) | Fists **cancel opposing damaging strike boxes** when they meet head-on; Dora's body remains vulnerable. No full invincibility and no forced handler branch. | Remove the Fists action family from `protected` to restore normal body hurtboxes. Export a source-225-shaped forward zero-damage guard/clash box into an available Fists box slot, with one **authored kind bit `0x100`** to identify *only this special guard box* (the original kind-3 bits are preserved). Add one targeted `clashBoxes()` rule: when this flagged box meets an opposing damaging box, **strip both holders' boxes and queue no handler**, then allow Fists' subsequent scripted attacks to continue. A plain kind-3 box alone does **not** cancel a damaging attack in current `clashBoxes` without 225's handler, and copying that handler would branch away from Fists. Test body hits that bypass the guard box. |
| **Pierce** (338/339 and 340/341/342 branches) | Invincible during **ticks 0–99 measured from the original cast**, vulnerable at tick 100 and thereafter; reused landing 270 and unrelated action 269 must stay vulnerable. | **Runtime rule is required:** remove 338–342's blanket PC-based suppression in the exporter. Record a **Dora-only Pierce cast-start tick** when the initial 338 or 339 enters; retain it through its follow-ups without restarting it for each 340/341/342 branch. In the `struck()` body-overlap path, skip Dora's vulnerable body boxes only while he remains in the Pierce cast family and `roundTicks - castStart < 100`; clear/ignore the timestamp after exit. Test direct hits **and grabs**, since prior export suppression removed both `kind & 6` bits. |

**Why Pierce cannot be exporter-only:** action 338's frame at t=95 (PC 5793) spans the tick-100 boundary; frames in 340/341 also share PCs with 339 at different ages; 342 shares PCs with unrelated 269. A PC-level protection set cannot guarantee exactly 99 protected and 100 vulnerable. Use the existing `Match` tick clock (10 ms per tick); do not introduce a generalized immunity framework. Keep the cast marker tightly scoped to Dora and the Pierce action chain.

For Fists, `ScriptBox.kind` is currently numeric and the source's flags occupy the low byte; the **authored high bit `0x100`** can mark this exporter-added box without altering lower source collision flags. Do not repurpose every kind-3 box, affect other attacks, or change Fists' damage data. Keep the special-case logic local to `clashBoxes()` and regress normal source 225 behavior.

Preserve Cannon, Gadgets, Hug, FK之意思, EN charge/KO RELOAD restrictions introduced by HPA-858, and all other fighter commands.

## 3. DoraEmon's late-arrival intro

`Match.arrive()` activates a waiting boss when its watched HP crosses the slot mark, calls `takeSeat()` and `opening(f)`. DoraEmon's `opening()` sets `f.action = 'intro'`. The pre-fight-only portion of `run()` advances Dora's existing 337-tick intro by updating age, `doraFall`, `enter`, and transition to idle. Active battle ticks instead reach `move()` and currently lack that progression.

Extract a **small `stepIntro(f)` helper** and reuse it in both code paths. Call it from `move()` **after the early hit-stop/held checks, but before `think()`, `land()` or `cancel()`** (restructure that immediate decision point carefully so the age increments once). That avoids early landing and prevents CPU commands while he is emerging. Keep existing pre-fight `cpuDriven = false`, pause behavior and first-seat timing unchanged. Do not alter `scene.ts`, waiting-seat logic, seed ordering, or other fighters' source intros.

**First-seat parity is the acceptance rule:** start counting **at actual waiting-seat arrival**, play all **337 ticks** including the sampled image frames, rise/hold/fall ending at y=0, and apply OP super Charge's **360 power / four 90-EN stocks once** (plus its Black effect) even in B.R. HPA-858 disables the voluntary/CPU charge **command**, not the intro grant. Source intro frames have **no body boxes**; Dora cannot be hit or pushed during the intro. Assert that a strike during late arrival does not connect, rather than adding immunity or hurtboxes.

One deterministic waiting-seat fixture plus the existing first-seat test verifies this shared path; do not seek three different boss orders solely to exercise one helper.

## Asset publishing and merge coordination (required)

The export changes are not just local TypeScript changes. CI and Workers builds use the R2-hosted `generated.tar.gz` / `fixtures.tar.gz`, checking the exporter's `.exporter` fingerprint. See `README.md` Deploy to Cloudflare and `scripts/upload_r2.sh`.

The implementation phase must **locally finish and verify all exporter edits together**, regenerate with `bun run assets`, then, **with the owner's explicit authorization and configured R2 credentials**, run `bun run upload:r2` **immediately before pushing** the exporter-changing commit. Since `generated.tar.gz` is a *mutable root object shared with main*, the upload creates a temporary compatibility window: old `main` builds can fail fingerprint validation until the new exporter commits merge. Coordinate the push/review/merge promptly; if authorization or credentials are unavailable, **do not claim CI/build readiness or push an exporter mismatch**. Do not invent credentials or upload while making this planning-only PR.

Immutable versioned assets live under new prefixes; uploaded generated tarballs and the exporter fingerprint are the deployment contract. No extra storage architecture or second PR.

## Acceptance and exclusions

- Deterministic `Match` tests: source KO Down life test at its own age (whole roster including two exceptions); no wake at HP 0, after result or through HPA-973 in B.R.; preserved brawl `downed`, actual trade-KO payout, existing Dora source revives unaffected.
- Focused Dora tests: Twin Hammer follow-up vulnerability, Counter Hit K-only/wrong keys/stock, Fists box cancellation **and** body-hit vulnerability, Pierce direct hit/grab at ticks 99 and 100, first vs one late intro 337-tick/power/landing/untouchability parity. Existing HPA-858 tests remain green.
- `bun run validate`, `bun run build`, `bun run e2e` and successful **authorized R2 export publishing** before asset-changing code is pushed.
- **One-platform MCP-driven browser E2E** on existing macOS Chromium: game boots, enter a normal match, HUD/control sanity, Dora instructions text assertions and a **screenshot visual check of the guide and HUD** against established UI. No HPA-973 mockup exists. No stage-3 late-intro browser capture, new test hook, full tournament browser playthrough, or browser farm. Exact intro timing/image frames are tested deterministically. Windows/iOS optional; no human acceptance sign-off.
- Out of scope: HPA-1035 all-B.R. revive ban and other B.R. changes, HPA-770 CHAOS, HPA-972 cheats/menu, new image art/SFX, generated JSON in Git, new combat/scene architecture, and backward compatibility.
