# HPA-1148 — B.R. ANOTHER stage 3 partners and boss finale extensions

**Status:** design only; implement and verify on this same draft PR.
**Linear:** [HPA-1148](https://linear.app/cwchanap/issue/HPA-1148/br-another-stage-3-extras-z-mega-and-rario-partners-boss-runs-add).
**Baseline:** main at `c59771913b680e7008980fa2c51e7ff2350221ed` (2026-11-26; HPA-1251/#28, HPA-1304/#30 and [#31](https://github.com/cwchanap/scwu-web/pull/31) merged).
**Review:** [2026-11-26 design review (F1–F7)](https://github.com/cwchanap/scwu-web/pull/32#pullrequestreview-6078425665). [follow-up review (findings 1–4)](https://github.com/cwchanap/scwu-web/pull/32#pullrequestreview-6078839572). #31's loading demos, LONG partner/bar fix, and existing helpers are the baseline, not pending work.

## 1. Goals and scope

Extend only the final battle of regular and boss B.R. ANOTHER. Preserve HPA-1035 §7's approved regular boss order/arenas, HPA-858's seeded boss stages 1–2 and first three finale enemies, route selection, demos, Continue, endings, native battle headers and B.R. no-revive. No new screens, art, sound, asset export, backend, modes, or simulation/rendering architecture. B.R. ZERO, LONG, STORY, practice and versus retain their behavior.

### Regular fighters

- Four hostile bosses retain their approved order; the last sets the arena. Each reinforcement still watches its predecessor's native desperation threshold.
- Z-MEGA and RARIO are CPU allies from the start, with normal HP/EN, ally facing and existing green life bars. The usual partner still enters at 1P's native desperation mark, except when already one of the immediate partners.
- Exclude 1P from the immediate list and deduplicate the usual ally by Who. Keep the four enemy slots at indices 1–4. All allies including 1P are friendly to one another; each enemy fights every ally and every other enemy.
- All four hostiles (including waiting ones) must fall to win; 1P KO still loses. Ally survival is not a win condition. No new time, scoring or draw rules.

| Player | Immediate allies | Delayed ally | Total native seats (incl. 1P) |
| --- | --- | --- | --- |
| Other 32 regulars | Z-MEGA, RARIO | Usual partner | 8 |
| Z-MEGA | RARIO | None | 6 |
| RARIO | Z-MEGA | None | 6 |

**Ticket arithmetic:** the explicit reciprocal-only/no-duplicate rule gives 1 + 4 + 1 = 6, not the stated seven. The review reports inspecting all 34 generated finales: the reciprocal usual partners are the only overlaps, consistent with the existing reciprocal test assertions. Verify with the real generated data during the roster test. Counts refer to seats, not simultaneous entrants.

### Boss fighters

| Player | Existing first three (unchanged) | Fourth | Fifth | Sixth | Arena ID |
| --- | --- | --- | --- | --- | --- |
| ZENKA | DoraEmon, SHIN-Z, ALPHA | ASTROMAN | TTRO | ZENKA | 14 |
| ALPHA | DoraEmon, ZENKA, SHIN-Z | TTRO | ASTROMAN | ALPHA | 15 |
| SHIN-Z | ALPHA, ZENKA, DoraEmon | TTRO | ASTROMAN | SHIN-Z | 18 |
| DoraEmon | ZENKA, SHIN-Z, ALPHA | ASTROMAN | TTRO | DoraEmon | 14 |

Use the fixed suffix from Linear, no additional RNG call. The original third enemy still chooses the arena. Seven seats, no allies, all hostile (including the mirror, whose Who equals 1P). All six enemies are native strength. The first enemy keeps its entry role; each following enemy watches its predecessor's native mark. The former third/final role becomes a middle role; the final mirror gets the last-slot scorer/points as assigned by assemble. Win only after six KOs, lose on 1P KO. Existing palette assignment gives the mirror a distinct color among seven entered natives.

### Requirement readings

The ticket contains a “Readings to confirm with the owner” section. The plan follows its written scope: additional immediate partners (not replacements except deduplication), reciprocal-only for Z-MEGA/RARIO, fixed ASTROMAN/TTRO order, hostile mirror, original arena, native strength, no revive, ANOTHER only. The design review agrees with these readings and six-seat correction; no separate explicit owner confirmation of every reading was found. Record any correction/confirmation in this spec before changing those expectations; do not invent an approval or treat human sign-off as a test/acceptance criterion. The fixed spawn coordinates below are proposed implementation details, not owner-provided values.

## 2. Minimal design

All production changes belong in `src/game/br-another.ts`.

### Shared battle assembly

Change `assemble(roles, header, players, paired, stage, ally?: Slot)` to `assemble(..., allies: readonly Slot[] = [])`. Pass singleton/empty lists from current stage-1/2 and LONG callers. Enemy indices remain 1..N; append allies afterwards. Calculate the all-seat mask as `(1 << (1 + n + allies.length)) - 1`; each enemy excludes self and, for paired stages only, its mate. Each ally gets `((1 << (n + 1)) - 1) & ~1` (only enemy seats). Preserve existing donors, watch, below, x, bonuses, headers, and no source mutation.

### One immediate-ally recipe shared with LONG (#31)

Extract the already shipped recipe, parameterized by the existing donor and partner:

```ts
const onStageAlly = (base: Slot, partner: Who, x: number): Slot => ({
  ...base,
  player: ROSTER.indexOf(partner),
  x,
  flags: (base.flags | 0x201) & ~0x6,
});
```

The entry bits 1–2 become 0, the ally bit 0x200 and life-bar bit 0x1 are set. No cross-fighter donor lookup or neutralizing watch/below/delay/random: the entry-0 path does not use them, and we preserve all other donor fields, including any scorer/award differences between LONG and ANOTHER. LONG calls `onStageAlly(roles.slots[0]!, brLongPartner(who), 450)`, preserving its existing result; stage 3 calls it with `finale.slots[6]!`. The review reports the 34 source finale ally slots have the same role fields aside from player/below/x; use the fighter's own source ally rather than duplicate a foreign template. Stage 3 builds the immediate list from Z-MEGA and RARIO excluding who (the special cases are the same reciprocal pairing as `brLongPartner`). Retain the usual `allyOf(finale)` only if its Who is not already immediate; append delayed ally first when retained, then the immediate ones in Z-MEGA/RARIO order. No new behavior for LONG.

Use fixed starting slot coordinates: Z-MEGA x=450, RARIO x=350 (source scale; Match multiplies by 1.5), also when only one is present. Leave the delayed ally at its donor x. Verify the ordinary opening screenshot for sprite/HP-bar readability; adjust the two constants only if a concrete overlap is found and update tests accordingly. No arena-bounds calculation.

### Boss suffix

Define `export type Boss = (typeof BOSSES)[number]` in `br-another.ts` and `BOSS_STAGE3_SUFFIX: Record<Boss, readonly [Who, Who]>` using the Linear order above. Tighten both `bossBrAnotherStages(who: Boss)` and `bossBrAnotherStory(who: Boss)`; the Story map already iterates BOSSES and the callers use boss literals or the boss tuple. Update the two loosely typed `battlesOf` helpers in `br-another.test.ts` and `team.test.ts` to take Boss. Index the table directly with `who`; no runtime guard, cast or fallback for a non-boss. Keep `bossBrAnotherStages`'s seeded draws and arena selection on the original three. Append the suffix and own roster seat, letting assemble apply existing first/middle/final role and arrival rules. Keep tough only on stages 1–2. Leave the #31 story wrapper (demo 4/5/7 and Continue retry) untouched.

### Reuse existing engine paths

`Match.storyFighters` derives 1P hostility from every ally flag, `arrive` handles queued seats, `brawlEnemies`/`storyResult` already count all native hostiles, and `reseatWithoutAlly` nulls all 0x200 slots without renumbering. Existing generic cheat snapshot applies partner HP and B.R. no-revive. `TrainingScene.whenReady` loads unique fighter packs for all seated fighters, including waiting ones; the mirror reuses its pack. `lifeBars` and `drawLifeBars` already show each flagged living, visible ally; existing palette and late-Dora intro/EN gates remain. No new Match, scene, HUD, pack, palette or cheat code planned. A failure of the actual ticket checks warrants the smallest targeted fix, not speculative changes.

Regular stage 3 has eight natives at most; `MAX_FIGHTERS = 10` therefore permits two additional cheat summons at full native roster. With only eight palettes, unique colors cannot be guaranteed when summons take the total beyond eight (already supported bounded fallback). No cap/allocator change. Native palette checks exclude summons.

## 3. Verification

Extend the existing all-roster tests in `br-another.test.ts` and stage-3 simulation suite in `team.test.ts`. Add one multi-ally No partner case to the existing `cheat-rules.test.ts` suite and one parameterized no-revive case in `match.test.ts`'s "strict B.R. no-revive roles and routes" suite. The four new fighter types use ordinary KO_DOWN recovery gates, not self-healing KO branches (reviewed recovery ages: Z-MEGA/TTRO 60, RARIO 66, ASTROMAN 130; verify generated data at implementation). The no-revive test must actually deliver post-KO life gains and prove a non-B.R. control gets up through its native gate, while B.R. suppresses the gain/recovery. Observe the recovery gate age after landing rather than relying on the existing 120-total-tick loop. The existing `downed` bit records whether a fighter has ever fallen for brawl completion; it need not clear on a successful non-B.R. recovery. Verify action/branch transition, not `downed === false`, for the control. Update affected existing assertions, including DoraEmon/ALPHA; isolate the late Dora intro test from the new present allies by moving all other present fighters out of the way.

Run full validation and existing Playwright suite; do not add a lengthy CI stage-3 playthrough. Two MCP-driven browser journeys (RYUKO opening including delayed partner and ZENKA mirror) provide screenshot evidence of native HUD/bar and sprite presentation. For RYUKO turn the master Cheats switch off in stage 2 before the stage-3 battle snapshot, so the screenshots show native bars rather than cheat labels/markers; ZENKA may keep cheats on to reach the mirror. Deterministic tests prove exact roster, timing, win/loss and retry. No ticket UI mockup; screenshot visual check is required, not a new UI design or human sign-off. See companion plan. No tests executed at design time.
