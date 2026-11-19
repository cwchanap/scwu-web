# HPA-972 — Implementation plan: expanded cheats, pause Menu and summoning

**Linear:** https://linear.app/cwchanap/issue/HPA-972/expand-cheat-mode-new-pause-menu-more-cheats-and-summoning-fighters  
**Design:** [2026-11-19-hpa-972-expanded-cheats-pause-menu-design.md](../specs/2026-11-19-hpa-972-expanded-cheats-pause-menu-design.md)  
**PR strategy:** **one PR only** for HPA-972. This draft contains the documents first; continue implementation, tests and review commits on this same branch, then mark this PR ready when the automated acceptance below passes. Do not create a second PR for coding.  
**Baseline:** `main` commit `d7e98cfe34bc9a193f34dae03d13441c02da3ac0`. No prerequisite artwork generation: HPA-971's four authored `art/hud/en-*.png` digits are already on `main`.  
**Mockups:** Linear HPA-972 → Resources → `menu-a-pause.html` and `summon-and-hp-bars.html` (HTML references; never commit them).

## Execution sequence within this PR

### 1. Pure settings model and numeric behavior

**Files:** `src/game/cheats.ts`, `src/game/cheats.test.ts`, `src/menu.ts`, `src/menu.test.ts`, `src/game/life.ts` if needed.

- Extend `CheatOptions`, `DEFAULT_CHEATS` and `normalizeCheats` via their existing `bounded` / `flagOf` helpers. Rename the old 1–6-stock field to `playerMaxEn` in hundreds, 100–1000 (step 100, default 300); stock cap = value / 100. No localStorage migration or generalized settings model.
- Bound all new values, including nullable B.R. per-kill HP/EN **0–1000** (blank = source Game). Reset all restores defaults. Changed count counts non-default **parameters only**, excluding the master enabled switch, as the mockup shows.
- Add pure `enGainOf(stocks) = max(1, 1 + (stocks - 3) / 2)` for positive gain speed. This is a stock-count rule, not an assumption about native EN per stock (DoraEmon uses 90).
- `enemyHpBars` is a **live session option**, default Off, modeled like existing `PracticeOptions` and applied using `TrainingScene.setPractice`; **do not** create a localStorage helper or add it to `CheatOptions`. The issue does not ask for persistence. Keep it selectable in story, Vs. and practice rather than inheriting practice-only disabled-state rules.
- Unit-test normalization/bounds, per-kill null and zero, reset, changed count, `enGainOf`, default/off parity and cheats persistence. Update snapshots of the old six-field JSON.

**Checkpoint:** pure tests pass, no browser/Phaser dependency in `cheats.ts`, no new storage module.

### 2. Core Match rules (no UI in the engine)

**Files:** `src/game/match.ts`, `src/game/characters.ts`, `src/game/standing.ts` if needed, `src/game/*test.ts`, `docs/evidence.md` for new authored/source-gate decisions.

- Preserve `TrainingScene.begin() → Match.useCheats()` and its frozen-once battle snapshot; extend `cheatSeat` for 1P, partner and hostile HP, plus capped stock counts. Scale from the route's **base** (including HPA-858 tough seats), not from previously modified stats.
- On **round 1's** first phase-1 tick (`roundTicks === fightTick`), assign 1P's stock to `maxStock - 1` and power 0, overriding different intro grants only while master enabled. In practice (which has no intro) assign on its first step. Later Vs./TEAM VS rounds retain native carryover instead of regranting. Test practice, Vs. CPU, Vs. single, story and later rounds with enabled and disabled settings.
- On a cheat-enabled battle, have `cheatSeat` and other relevant seat paths **assign** `f.enGainMultiplier = enGainOf(f.maxStock)` (no multiplier stacking). HPA-858 tough 5-stock enemy stays ×2 rather than ×4; native 5- and 6-stock enemies get ×2/×2.5 while cheats are enabled, even at default settings. With master disabled, retain original native gain multipliers (including HPA-858's tough ×2). Keep EN drains, costs and direct scripted stock additions native. Test caps 1, 3, 5, 6, 10.
- Parameterize the 1P low-life line from `desperationOf`'s native **30%**, scaled by `maxHp`. Make a small **verified low-HP super gate table** in `characters.ts`, keyed by exact source timeline (`sourceKey`) and PC, and record original vs authored decisions in `docs/evidence.md`. Populate from real decoded op-0x11 `life` events; unit-test every table entry is a `below` test. Only these gates move with the selected line and bypass for 1P (including applicable SIN/SOU StandingVM cases); other life tests and HP0 sentinel stay native.
- Scale native 1P-only low-life damage reduction by `damageCutMultiplier` with 0–5 bounds; verify 0% reduction, native 30% line, 100% cut suppressing damage, CHUNG/ALPHA's scales, and other fighters staying native.
- For B.R. `Match.br` only, omit the regular ally via the existing **null slot** path in `seat` (do not renumber native slots); replace only *1P's own* per-KO HP/EN award. `null` uses native slot amounts, positive HP values use `lifeAmount` proportional scaling, **0 skips `gainLife`** (since `lifeAmountOf(0)` otherwise returns 1) and 0 EN skips `addPower`. Non-B.R. matches, ally recipients and unrelated KOs keep source awards.
- Add a live `enemyBars` option to the Match/scene's normal options path; `lifeBars` should include source story allies, all living summoned allies and optionally enemies, without gating it on cheats.

**Checkpoint:** deterministic tests cover every new rule, native/off parity, exact super gate identities, default-high-stock enemies, B.R. no-partner and zero-reward correctness.

### 3. Summoning model and native-fight isolation (Match **only**)

**Files:** `src/game/match.ts`, `src/game/team.test.ts`, `src/game/vs.test.ts`, focused story/CPU tests.

- Record `nativeCount` **after native fighter seating** and refresh it every native round; add one `natives` getter = `fighters.slice(0, nativeCount)`. Implement a single `Match.summon(who, side, effectiveSummonCheats)` that appends a CPU-only Fighter beyond native participants, with full scaled HP, correct side hostility masks and side-specific position. Use **`MAX_FIGHTERS = 10`**, reject when full and verify 9→10 succeeds / 10→11 rejects. Extend existing CPU/input/held arrays only as required, with normal battle and next-round cleanup.
- Build a `CpuVM` at `CPU_LEVEL` using the fighter's CPU table and controls and `vm.shared = this.cpus[1]` when available. Use `takePalette` for an added story seat's palette; use palette 0 for practice/normal Vs. Summons need CPU input regardless of the normal opponent input: have `driven()` return true for a summoned index (`i >= nativeCount`) while phase 1 is active, even if `cpuDriven` is false for practice dummies or human 2P.
- **Story integrity — modify these exact call sites:** `enemiesOfOne` / `brawlEnemies` must consider only `natives` when deciding whether native hostiles are defeated; `storyResult()`'s time-up, points/ally and `results` loops must use natives so `slots[i]!` never evaluates for a summon; `over` / point-threshold checks near the round controller must use natives; `knockOut(f)` must mark summon down but **return before** original story slot scoring or awards if its index is `>= nativeCount`. It is fine for the downed flag to update for all fighters for combat behavior.
- **Do not** remove summons from normal target/physics/hit paths: `hostile`, `nearest`, collision and injury include them. Only scoring/outcome paths are native-only. Non-story result tests keep `one`/`two` as the original participants.
- Cover the modes in deterministic tests: story brawl with a summoned enemy already alive after all native enemies fall; story time-up/result/KO/score with a summoned ally (no null-slot crash); Vs. CPU; Vs. single with **human 2P**; and practice with each available practice partner (not only CPU). A summoned CPU must actually produce combat input. Round and story-battle transitions clear summons; normal win/loss and KO scoring are unchanged.

**Checkpoint:** targeted tests exercise **every named native-only call site**, all modes and both sides. This step has no Phaser loader, Svelte/UI or new callback.

### 4. Extended EN art, **DOM publication** and HUD

**Files:** `scripts/export_assets.py`, `src/game/hud.ts`, `src/game/hud.test.ts`, `src/Menu.svelte` (static art-path table).

- Define one `AUTHORED_ART` tuple covering the existing HPA-971 `art/hud/en-{700,800,900,1000}.png` files (plus already-hashed authored art) and hash it in both `inputs()` and `exporter()`; verify changing a PNG invalidates the pack fingerprint.
- Export these four images into the **Phaser boot pack** under unique keys for stock counts 7–10, **and separately** to `public/assets/en/{7,8,9,10}.png` for the DOM Cheat tab. The current boot pack cannot supply HTML `<img>` tags. Do not commit generated published art.
- Extend `STOCK_OFFSETS` / stock-key lookup and `hud.test.ts` for every count 0–10. Preserve native 0–6.
- The exporter only uploads DOM art returned by `dom_art()`'s literal-path regex. Add `src/Menu.svelte` to scanned sources. Use an explicit literal Menu table of digit paths (`ui/18.png` through `ui/23.png`, and `en/7.png` through `en/10.png`) and explicit stage-thumbnail paths. Build served URLs using `ASSET_BASE` so Cloudflare's versioned R2 manifest has the files; do **not** generate paths like `ui/${17+n}.png` that evade the scanner.
- Assert the generated publication manifest contains each digit and needed thumbnail, the boot pack has the authored textures, and the production-like browser can request them without 404s.

**Checkpoint:** unit tests cover stock 0–10, export/manifest tests prove DOM files are published, and a browser shows digits 700/800/900/1000 both in HUD and HTML Menu.

### 5. Replace Menu UI and integrate scene summon loading

**Files:** `src/Menu.svelte` (**one** new dialog component), `src/App.svelte`, `src/menu.ts`, `src/game/scene.ts`, `src/game/scene.test.ts`, one shared arcade stylesheet plus `src/instructions/page.css`.

- Move the existing large dialog from `App.svelte` to **one `Menu.svelte`** with Match and Cheats tabs and a Summon view; leave App's session/status/scene control logic in App. Extract shared guide fonts/colour/panel/chrome once, reuse select face tiles and nameplate data, and build grouped cheat steppers from metadata. One focus-row/tab model covers keyboard and pointer/touch.
- Match tab delegates to current scene setters; live Enemy HP bars uses the existing practice/scene options path. Keep existing profile status refresh, configured/unconfigured auth links, Controls link and canvas focus. Cheats uses localStorage only for cheats, with pending-to-next-battle changes, Reset all, the changed-field count (excluding master), and explicitly displays EN digits/next-battle help.
- App's **`<svelte:window>` Ctrl+Backquote** keydown handler uses existing `GameStatus` and current `cheats.enabled` to open Summon only for an active, ready, unfinished/non-selecting match. No new scene→App callback or global event bus. The same dialog displays a portrait grid, Enemy/Partner switch, loading/error state, WASD/arrows/Tab/G/Enter/Esc, and pointer/touch.
- Scene adds **one `summon(who, side): Promise`** method: with `setModal` already holding the fight, reuse `loadPlayer` and `load.once(Phaser.Loader.Events.COMPLETE)`, then pass **battle snapshot cheats if already enabled, otherwise current pending cheats** to `Match.summon(who, side, effectiveSummonCheats)`, call `growFighters` and update its palette cache. **Do not call `whenReady`**, which would replace the match. Handle pack failure/cancel/stale session cleanly: no partial seat or ghost sprite, and restoring pause works. If the master switch was enabled mid-match, summon only the new Fighter with the current setting (no rescaling old fighters); report `runCheated` immediately.
- Keyboard events while the dialog is open must not reach Phaser; preserve `setModal`'s `pausedBefore` semantics, including preexisting pause. At 390px phone width use horizontal tab navigation, scrollable panels and reachable close controls.

**Checkpoint:** scene stub tests for loader error/cancel/scene disposal, pause restoration, immediate cheated mark and sprite/palette changes, plus browser checks against the two Linear UI mockups.

### 6. Automated regression, browser MCP E2E and visual acceptance

**Files:** `e2e/configured/menu.spec.ts`, `e2e/unconfigured/smoke.spec.ts` (optional focused summon spec), related Vitest files.

- Update tests that assume a 400px dialog, old labels or old six-field localStorage JSON; preserve meaningful boot, identity, pause and reload checks.
- CI Playwright covers repeatable **end-to-end** navigation: Match/Cheats, keyboard and touch, bounds/reset, next-battle snapshot, reload persistence for cheats, no persistence requirement for Enemy HP bars, configured/unconfigured Profile, summon both sides with real pack loading, close/resume and no page errors.
- **Browser MCP E2E:** run a focused **real** user journey on one browser platform from boot into an active match, enable Cheats, open Summon, spawn enemy/partner, observe updated status/HP bars and cheated marker, close the dialog, and verify the paused fight resumes and is still playable. Match unit tests (not slow scripted complete fights) establish native winner/KO/stage progression invariants; avoid duplicating that across browser MCP and Playwright.
- **Browser MCP visual checks:** at **1280×720** and **390×844**, compare screenshots of Match tab, Cheats tab, Summon grid and post-summon HP bars against the exact Linear HTML mockups. Check original art/face tiles, typography, panel shapes, clipping, scrolling, changed-value visuals and touch affordances. Attach visual evidence to the **PR conversation** (not `docs/evidence.md` or tracked assets) and remove `.playwright-mcp/` after browser checks as `AGENTS.md` requires.
- One browser platform is sufficient without a platform-specific code change. Do not introduce a review/sign-off gate; acceptance is test, browser and visual evidence.

## Definition of done — machine-verifiable acceptance

- [ ] `bun run validate` passes (assets, formatting, lint, typecheck, all Vitest).
- [ ] `bun run e2e` passes both configured and unconfigured Playwright projects; existing boot/menu/profile tests remain meaningful after the redesign.
- [ ] Every cheat in the design table has deterministic Match tests for native/default behavior, enabled behavior and boundaries; verify source-gate table identities (only verified low-HP `below` gates), first round/practice starting EN, later-round carryover, 500-EN tough ×2 (never ×4), native high-stock enemy gain with cheats on, 1P-only gates and B.R. null/zero per-kill outcomes without leakage.
- [ ] At 700, 800, 900 and 1000, the boot pack contains the authored image, the HUD renders it and the DOM Cheats Max EN fetches a **versioned, published** image; stage thumbnail URLs are literal, in the R2 manifest and fetch successfully.
- [ ] Summoned CPUs are active in story, Vs. CPU, human-2P Vs. single and every practice partner; 10-fighter cap is enforced. Tests cover native-only `enemiesOfOne`, `storyResult` loops, `over` and `knockOut` early return; summoned ally/enemy hostility, palettes, HP bars, cleanup and loader failure/cancel. Native outcome and KO payouts are unaffected by summons.
- [ ] **Browser MCP E2E:** from a clean load, enter a playable match, enable Cheats, summon an enemy and a partner with Ctrl+Backquote, verify both appear with the right HP-bar option, cheated flag and no page errors, then close and resume. Playwright separately verifies next-battle timing, persistence, keyboard/touch and auth links; deterministic Match tests verify full fight results.
- [ ] **Browser MCP visual screenshots:** compare at **1280×720** and **390×844** against Linear `menu-a-pause.html` and `summon-and-hp-bars.html`: Match/Cheats hierarchy, fonts/face tiles, cut corners, changed values, responsive tabs, scrolling, accessible controls, enemy/ally bars and no clipping. Attach screenshots to **PR**, never commit original art screenshots, clean `.playwright-mcp/`; no human approval step.
- [ ] No new art/SFX is generated; no backend/auth feature, migration, new runtime dependency, second PR, or generalized modifier system appears in the diff.
- [ ] Implementation, updated docs/tests and acceptance evidence are committed to **this same HPA-972 PR**. Keep the PR in draft until all checks are verified, then mark ready for review.

## Verified watchpoints on `main` (before implementation)

- **Native story slots:** `knockOut` falls back to `battle.koScorer` when a fighter has no slot. `storyResult` unconditionally dereferences `this.slots[i]!` in the time-up/ally loops and maps result flags across every Fighter; `enemiesOfOne`, `over` and point-threshold checks currently span the full roster. Use `nativeCount`/`natives` at **each site**; do not merely append to `fighters` and leave these paths unchanged.
- **CPU input:** `driven()` is gated on `cpuDriven`, which is false when a human 2P input is passed and when practice partner is not CPU. Summons need their own drive condition, `CPU_LEVEL`, a shared PRNG and palette registration.
- **DOM art publication:** `dom_art()` scans literal PNG paths only from listed Svelte/guide/profile sources; `public/assets` files absent from the generated manifest are not uploaded to R2. A Phaser boot texture does not render an HTML image. Extend scanned sources for `Menu.svelte`, explicit literal paths and authored PNG hashes.
- **Source-gate fidelity:** op 0x11 `life` also handles HP0 and unrelated script branches; bypass only PC/source-timeline-verified super gates, with `docs/evidence.md` references, not value heuristics.
- **EN semantics:** five-stock HPA-858 tough enemies already have ×2 gain. `enGainOf` should **assign** on cheat-enabled seats so ×2 never becomes ×4; off still keeps HPA-858 behavior.
- **Pause and build:** `setModal` remembers pre-dialog pause and must not be replaced by `togglePause`. Reuse the existing Playwright webServer/asset build; record browser screenshots in PR conversation, not git.
- **Adjacent scope:** preserve HPA-768 Profile and future HPA-1035/HPA-770 B.R. routes by keeping the game rules in `Match` rather than creating route-specific UI branches.
