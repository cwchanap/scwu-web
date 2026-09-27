# Recovered CPU opponent — design

## Goal

Replace the authored Vs. CPU behavior (`Match.ai()`: walk in, punch/kick on
timers, guard on a clock) with a port of the original engine's CPU. The CPU
plays from Ryuko's own table of moves, ranges and odds, so the user can test
the recovered mechanics against the opponent the game shipped with.

Success: Vs. CPU is driven by the 43 recovered entries; unit tests pin
selection, step playback, input mapping and the guard roll; the README records
what is recovered and what is authored.

## Recovered behavior

Engine routine `0x411270`, control type 1 (`+0xdf65`, jump table `0x4117f0`,
case `0x4112f9`). Types 2–4 copy the other player's input, stand still, and
hold up; they are not ported. The routine runs only while `[0x47004c] == 1`
(the fight is live).

**Data.** 100 entries × 111 bytes, 10 bytes after the held-pose table (file
`0x1576f51`); 43 are used, named `登録N`. An entry has:

- `+0x20` flags: bit 0 = self airborne (clear: grounded), bit 1 = opponent
  airborne (clear: grounded)
- `+0x21` probability in percent
- `+0x22`/`+0x24` min/max distance in source pixels
- ten 7-byte steps at `+0x2a`. Each step is `w0` (direction nibble; `0x2000`
  marks a valid step), `w1` (1-based command id, 0 = direction only) and a
  u16 duration in ticks.

**Level.** `L` = player `+0xdf61`, 0–100, taken from the match setup (0 turns
the CPU off).

**Decision** (each tick, only while no entry is active):

1. Decrement the timer `+0xdf7d`. If it is still above 0, stop.
2. Reset the timer to `rand % (101 − L) − L + 50`.
3. Take `d = |x_self − x_opp| >> 16` in source pixels.
4. For each of the 100 entries, draw `rand % 100` (always, even for empty
   entries). The entry passes when the roll is below its probability, `d` is
   within `[min, max]`, and both airborne flags match.
5. The **last** passing entry becomes active, at step −1 with step timer 0.

**Playback** (each tick while an entry is active, including the tick it was
chosen):

1. Decrement the step timer. If it goes negative, advance to the next step.
2. The entry ends after step 10 or at a step without `0x2000`.
3. The new step's timer is `duration + rand % (101 − L)`. The rand is drawn
   even when the entry ends. A step therefore lasts `duration + jitter + 1`
   ticks.
4. On the tick an entry ends, the CPU gives no input.

The engine clears the CPU's whole input history every tick (`memset` at
`0x403300`) and then writes the current step. For a direction step it writes
the direction; for a command step it writes the command's complete input
sequence with the step's direction added to every frame (`0x411644`). So a command is re-entered on **every** tick of its step, and a
direction-only step can never form a double-tap dash.

**Directions.** Nibbles index the tables at `0x41f138`/`0x41f178`. The
mirrored table is used when `x_self > x_opp`, so F means toward the
opponent. Codes: 0/1 neutral, 2 F, 3 DF, 4 D, 5 DB, 6 B, 7 UB, 8 U, 9 UF,
10 B, 11 U, 12 F, 13 D.

**Guard** (`0x40f3a2`). A CPU victim ignores its input when a hit lands:

- in a neutral state, it guards if `rand % 100 < L`;
- in a guard reaction, it keeps guarding;
- while attacking or reacting, it cannot guard.

Unblockable boxes and the air-guard rule still apply afterwards.

**Random numbers.** MSVC `rand` at `0x417a22`, the same LCG that
`standing.ts` ports. The engine shares one global seed across everything.

**CPU IORI** (command 22, button `0x40`, which only the CPU can inject):

- action 410: its own strike (image 432–434, damage 10, responses 3/3/4/28/29/4), then jump 411;
- action 411: a second strike (damage 15). Op `0x20` at PC 5887 then recovers one time in six; otherwise it jumps to 248 (`iori3`).

## Port

- **`scripts/export_assets.py`**:
  - Export `cpu` into `assets.json`: the used entries as `{flags, probability, min, max, steps: [{direction, command, duration}]}`.
  - Locate the table from the held-pose table the exporter already validates, and refuse to export unless the first name is `登録1`.
  - Add 410 to the flattened-script queue.
- **`src/game/cpu.ts`** (new): a `CpuVM` in the style of `StandingVM`.
  - `input(self, opponent): Input` runs the decision and playback rules above.
  - `guards(): boolean` performs the roll.
  - Both use the LCG, exported from `standing.ts` instead of copied.
- **Mapping to port input.** Directions map to `left`/`right` (toward or away by `x`), `jump` and `crouch`. Commands map to single controls:

  | id             | Source name    | Port input              |
  | -------------- | -------------- | ----------------------- |
  | 1              | CGA            | `changeAttack`          |
  | 2              | B G            | `megaBeam`              |
  | 3              | MUSASHI        | `musashi`               |
  | 4              | G BEAM LV1     | `getterBeam`            |
  | 5              | hidden sup     | `blackRush`             |
  | 6              | fire           | `axe`                   |
  | 7              | DST            | `dst`                   |
  | 8              | Drill Punch    | `drill`                 |
  | 9              | IORI           | `iori`                  |
  | 10–12          | Jump 2 / F / B | `jump` (+ toward/away)  |
  | 13/14          | DASH F / B     | `dash` (+ away for B)   |
  | 17             | Hit Up         | `hitUp`                 |
  | 18             | Chuck          | `throw`                 |
  | 19/20          | P / K          | `punch` / `kick`        |
  | 22             | CPU IORI       | `cpuIori` (new, no key) |
  | 15, 16, 21, 23 | unnamed/empty  | neutral                 |

- **`match.ts`**:
  - Vs. CPU `ai()` returns `this.cpu.input(cpu, player)`, and the authored logic is deleted.
  - Every guard decision (melee, script boxes, and the two axe checks) calls one `guarding(target, source)` helper. For the CPU victim it returns `guards.has(action) || (neutral && cpu.guards())`; the player keeps the guard button.
  - `cpuIori` plays the flattened 410→411 script and continues into `iori3` (`next === 248`).
  - `Match` takes an optional seed. The scene passes a random one per match; tests use the default 0.
- **README**: update Play and Scope, and add a "CPU" evidence bullet.

## Authored choices

- **Level 50**, since the story's value was not recovered. That gives a decision every 0–50 ticks, up to 50 extra ticks per step, and a 50% guard rate.
- **Its own seed**: the CPU draws from its own LCG, seeded per match, rather than the engine's shared global one.
- **Alternating presses**: a command step presses its control on alternate ticks, because a port button needs a release before it counts as fresh again.
- **Single controls**: commands become one-button controls, since the port has no motion inputs.
- **Neutral states** are the ones where the port's own guard input takes effect. They stand in for the engine's object flags `+0x15e & 0xc`.
- **No recovery roll** (ponytail): CPU IORI always continues into `iori3`. The 1-in-6 recovery branch is skipped.
- **No dash shortcuts for the CPU**: the port's double-tap and air-direction dash shortcuts are keyboard/touch input choices. The CPU dashes only through its DASH commands. Without this, a jump-toward step in the air, after the double jump is spent, would air-dash where the original does nothing.
- **Who counts as the CPU**: the Vs. CPU opponent on ticks where the CPU supplies its input. When a caller passes opponent input (tests), that fighter is player-driven, with no guard roll and with the shortcuts.

## Testing

`cpu.test.ts` uses small hand-built tables. At `L = 100` the jitter is
`rand % 1 = 0` and a probability of 100 always passes, so selection and
timing are exact without re-deriving the LCG.

The tests cover:

- the filters: probability 0, distance bounds, both airborne flags, and "last passing wins";
- step length `duration + 1`, the entry ending at a step without `0x2000`, and neutral input on the ending tick;
- mirrored directions;
- alternating command presses;
- the guard roll: always at `L = 100` in a neutral state, never while attacking, kept during a guard reaction, drawn only when a hit lands;
- no air dash from a jump-toward step once the double jump is spent.

`match.test.ts` covers:

- the exported table: 43 entries, spot-checking entry 40 (DST, 90%, 0–30 px);
- a Vs. CPU smoke run in which the CPU leaves idle and nothing throws;
- CPU IORI flowing into `iori3`.

Finish with a browser run against the CPU through the Playwright MCP.

## Not included

A "CPU" choice in the practice partner menu. It is one line if wanted later.
