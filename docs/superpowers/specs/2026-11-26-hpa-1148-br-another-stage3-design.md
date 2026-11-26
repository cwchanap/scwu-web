# HPA-1148 — B.R. ANOTHER stage 3 partners and boss finale extensions

**Status:** design only; implement and verify on this same draft PR.  
**Linear:** [HPA-1148](https://linear.app/cwchanap/issue/HPA-1148/br-another-stage-3-extras-z-mega-and-rario-partners-boss-runs-add)  
**Baseline:** main at `7f43f3d853a241589a4c97506cf14890bb7d10fa` (2026-11-26; HPA-1251/#28 and HPA-1304/#30 merged).  
**Integration prerequisite:** [#31](https://github.com/cwchanap/scwu-web/pull/31) is open at `a098d1705741adde7008e3b7119da7c9e34745d1`. It modifies the same builder/tests/docs, introduces `bossBrAnotherStages`, restores boss ANOTHER demos, and fixes LONG's partner and HP bar. Rebase this docs branch onto main after #31 lands, review its actual merged behavior, then implement. Do not copy its changes into this PR or revert them. If it changes before landing, reconcile the plan with the merged result.

## 1. Goals and scope

Extend only the final battle of the existing regular and boss B.R. ANOTHER routes. Keep the approved HPA-1035 §7 regular boss sequences and arenas; keep boss HPA-858's seeded first two stages and original first three final-stage enemies. Keep the existing route selection, demos (including #31), Continue, endings, stage headers, recovery, native KO bonuses and B.R.-wide no-revive rule. No new art, sound, exporter work, screens, routes, backend, or engine rewrite. B.R. ZERO, LONG, STORY, practice and versus are unchanged.

### Regular fighters

- Four hostile bosses remain in their current approved order; the last of those sets the arena. Each still enters on its predecessor's native desperation threshold.
- Z-MEGA and RARIO are CPU allies present from the start, with normal HP/EN, ally facing and existing per-fighter green life bars; the usual finale partner still enters at the player's native desperation mark unless that fighter is one of the immediate partners.
- Build a stable unique roster by fighter identity: exclude 1P; if the donated usual partner is already Z-MEGA/RARIO, replace its waiting role with the immediate role, never add a second copy. Existing data already pairs Z-MEGA with RARIO and vice versa. All allied slots are mutually friendly (including 1P); every hostile fights every ally and every other hostile. Defeating allies is not a victory requirement.
- All four hostiles must be down for a win (including not-yet-arrived hostiles); 1P KO still loses under the existing brawl rule. No changed scoring/tie/time rules.

| Player | Start allies | Waiting ally | Total native seats (incl. 1P and all four enemies) |
| --- | --- | --- | --- |
| Typical regular (e.g. RYUKO) | Z-MEGA, RARIO | Usual partner (ZOMA for RYUKO) | 8 |
| Z-MEGA | RARIO | None (same usual partner) | 6 |
| RARIO | Z-MEGA | None (same usual partner) | 6 |

**Ticket arithmetic discrepancy:** the prose says seven for Z-MEGA/RARIO, but its explicit one-partner/no-duplicate rule and the existing reciprocal usual-partner data give 1 + 4 + 1 = 6 seats. Follow the explicit roster and dedup rules, not the stated seven; do not invent a third fighter. Likewise, “eight on stage” describes seated roster capacity, not simultaneous presence: reinforcements continue waiting. If any other source usual partner overlaps an immediate one, the same deduplication rule applies. This is an explicit implementation interpretation, not a new owner approval.

### Boss fighters

The existing seeded order (from the baseline's independent test expectations) and fixed suffix:

| Player | Existing first three (unchanged) | Fourth | Fifth | Sixth | Arena ID |
| --- | --- | --- | --- | --- | --- | --- |
| ZENKA | DoraEmon, SHIN-Z, ALPHA | ASTROMAN | TTRO | ZENKA | 14 |
| ALPHA | DoraEmon, ZENKA, SHIN-Z | TTRO | ASTROMAN | ALPHA | 15 |
| SHIN-Z | ALPHA, ZENKA, DoraEmon | TTRO | ASTROMAN | SHIN-Z | 18 |
| DoraEmon | ZENKA, SHIN-Z, ALPHA | ASTROMAN | TTRO | DoraEmon | 14 |

Use the explicit fixed table, not another shuffle call. Arena selection still looks at the third enemy before appending the suffix. Seven seats, no allies, symmetric free-for-all hostility (mirror is hostile even though its Who equals 1P's), native strength including ASTROMAN/TTRO/mirror. The first enemy preserves its existing entry role; all five following enemies wait on the preceding enemy's native mark. The old third/final enemy becomes a middle role and the sixth receives the final slot's scorer/points, so the authored KO-bonus structure remains coherent. All six hostiles count for victory, not just the original three. No duplicate palette among all seven seats once entered, including a visibly different mirror. DoraEmon's late mirror uses existing opening/intro and BR EN gating.

## 2. Minimal design

### Route construction: `src/game/br-another.ts`

Retain the current pure builder and its source-donor architecture. Change `assemble(roles, header, players, paired, stage, ally?: Slot)` to accept an ally list (default empty); update existing stage-1/2 and LONG callers to pass zero/one slot without behavioral changes. Keep enemies at seat indices 1..N, append allies afterwards (usual delayed ally first when retained, then immediate extras in Z-MEGA/RARIO order). Compute masks by seat, not Who:
- `enemyBits = ((1 << (N + 1)) - 1) & ~1`
- all bits = `(1 << (1 + N + allies.length)) - 1`
- each enemy excludes self and, for paired stages only, its pair mate; all other seated fighters are hostile.
- each ally's enemies = enemyBits; no friendly/self bits. 1P already excludes every ally by flag in Match.storyFighters.
Keep roles, header, watch indices, thresholds, enemy positions and scoring donation unchanged for existing one-/zero-ally callers. Never mutate the generated scenarios or return shared donor slot objects.

Construct a small stage-3-only ally helper using the existing `allyOf(finale)` and a real ally-role donor: `sourceStep('rario', 49).slots[6]` for Z-MEGA and `sourceStep('zmega', 49).slots[6]` for RARIO (verified reciprocal partner expectations in br-another.test.ts; assert these identities against generated source data before changing code). If the usual ally matches an immediate partner, retain its donor fields. Use immediate entry bits 1–2 = 0, explicitly retain/set ally bit 0x200 and bar bit 0x1 (the missing-bit bug fixed in #31), neutralize watch/below/delay/random for immediate partners, retain native ally CPU/reward fields, and do not set tough. Do not blindly clone an enemy role's scorer/bonus flags. Keep the delayed usual partner's flags and native watch/threshold; choose distinct authored starting x coordinates for the immediate allies near the 1P, away from the first enemy and within the existing boss arenas, using existing coordinate conventions (slot x is multiplied by 1.5 in Match). Verify visually before settling the values; no new collision/camera system.

For bosses append the three extra Who values after the existing seeded draw and call assemble with no allies and `bossArena(originalBosses.at(-1)!)`. Keep the stage-1/2 tough marking and seed consumption exactly as before. Use existing `bossBrAnotherStages` after #31 merges, leaving the story wrapper's demo 4/5/7 sequence and retry behavior intact.

### Simulation and rendering: reuse, do not redesign

- `Match.seat`, `storyFighters`, `arrive`, `brawlEnemies`/ `storyResult`, `lifeBars`, `reseatWithoutAlly` already support arbitrary native slots, masks, partner flags, bar visibility and queued enemies. With at most eight native seats and existing LONG's higher capacity there is no need for seat reuse, wider masks or a new engine abstraction. Test actual simulation behavior, including allies KO'ing hostiles and enemies killing each other, and that all queued hostiles remain required.
- `reseatWithoutAlly` already nulls every 0x200 slot, preserving seat indices; test that all added and delayed allies disappear with the existing BR No partner cheat, with hostile arrival and victory unchanged. Confirm Partner HP snapshot covers both new allies and existing Low HP effects remain correct; no cheat expansion.
- `takeSeat`/`takePalette` use carried story-held palettes, so test after prior stages and Continue as well as fresh Match. Check uniqueness only for entered natives, then all after final reinforcement (no summons for that assertion). No global palette allocator change absent a demonstrated regression.
- `TrainingScene.whenReady` loads packs for every `match.fighters` entry, including waiting fighters; existing render pool grows with fighter count and `drawLifeBars` uses Match.lifeBars. Verify the newly required packs, mirrors, opening sprites, bar visibility, and no loading errors; make a narrowly scoped fix only if acceptance shows a regression. Existing known #31 edge clipping is not a global HUD redesign.
- HPA-1251's shared BR no-revive protection applies to the four affected new fighter types and their roles; assert through real KO/revival actions rather than add character-specific guards. Preserve non-BR revive.

## 3. Verification and non-goals

Use current source and existing Story/Match test helpers; update assertions that assume only one final-stage ally or three boss enemies instead of deleting coverage. Preserve reference evidence distinguishing authored changes from recovered behavior. See the companion implementation plan for exhaustive roster checks, deterministic Match/Story tests, real MCP browser journeys and screenshots. No UI mockup is attached to this ticket; compare screenshots of existing and changed native arena/HUD presentation at matching scale with checks for added fighter sprites, readable bars, mirror colors, and no regressions in route screens. No human sign-off criterion. No tests have been executed at design time; the generated game assets and runtime are not present in this connector session.
