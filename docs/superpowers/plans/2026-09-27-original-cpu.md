# Recovered CPU Opponent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authored Vs. CPU behavior with a port of the original engine's CPU, driven by Ryuko's recovered CPU table.

**Architecture:** The export script adds Ryuko's CPU table and the CPU-only IORI script (410→411) to `assets.json`. A new `CpuVM` in `src/game/cpu.ts` turns the table into port `Input`, one tick at a time, and performs the engine's guard roll. `Match` asks it for the opponent's input in Vs. CPU and routes every guard decision through one helper that applies the roll.

**Tech Stack:** TypeScript, Vitest, Python 3 export script, Bun scripts.

**Spec:** `docs/superpowers/specs/2026-09-27-original-cpu-design.md`

## Global Constraints

- Level `L = 50` (authored); `rand` is the MSVC LCG already in `standing.ts` (`0x417a22`).
- Keep the 10 ms tick. Cite recovered behavior (addresses, PCs); mark shortcuts `ponytail:`.
- Run tests with `bun run test` or `bunx vitest run <file>`, never `bun test`. Run `bun run assets` before tests whenever the export script changes.
- `scwu-web-handoff/` is read-only; never commit original assets or generated output.
- Commit only on `main`, and only after the user confirms. Leave the untracked `CLAUDE.md` out. The message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Update the README when gameplay changes (Task 5).
- Delete `.playwright-mcp/` after any browser session (otherwise `validate` fails).

## Review Focus

1. An airborne CPU with its double jump spent, holding jump-toward, must not air-dash. The port's direction shortcut would, and the original does nothing. Tested in Task 4.
2. The guard roll must draw only when a hit lands. The melee path currently decides `guarding` before its range check, which would draw on every active tick. Tested in Task 4.
3. When a caller supplies opponent input (every existing test via `ticks()`), the opponent is player-driven: no roll, and it keeps the shortcuts. Tested in Task 4.
4. Two adjacent steps of the same command (`P:10 P:1`) must both press, even though presses alternate. Tested in Task 3.
5. The practice partner never gets the CPU's guard roll. Tested in Task 4.

---

### Task 1: Export the CPU table and the CPU IORI script

**Files:**

- Modify: `scripts/export_assets.py` (queue at ~line 224; response table at ~line 218; `write_json` at ~line 251)
- Create: `src/game/cpu.ts`
- Test: `src/game/cpu.test.ts`

**Interfaces:**

- Produces: `assets.json` keys `cpu` (array of entries) and `scripts["410"]`; `CpuStep`, `CpuEntry` and `RYUKO_CPU: readonly CpuEntry[]` from `src/game/cpu.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/game/cpu.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RYUKO_CPU } from './cpu';

describe('recovered CPU table', () => {
  it("exports Ryuko's 43 used entries", () => {
    expect(RYUKO_CPU).toHaveLength(43);
    // 登録1: walk forward for 20 ticks, 10%, 0–1400 source pixels.
    expect(RYUKO_CPU[0]).toEqual({
      flags: 0,
      probability: 10,
      min: 0,
      max: 1400,
      steps: [{ direction: 2, command: 0, duration: 20 }],
    });
    // Slot 40: DST (command 7) at 0–30 pixels, 90%.
    expect(RYUKO_CPU[40]).toEqual({
      flags: 0,
      probability: 90,
      min: 0,
      max: 30,
      steps: [{ direction: 0, command: 7, duration: 1 }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/game/cpu.test.ts`
Expected: FAIL, `Failed to resolve import "./cpu"`.

- [ ] **Step 3: Export the table and script 410**

In `scripts/export_assets.py`, directly after the line `responses = [u16(data, response_offset + 4 * i) for i in range(83)]`, add:

```python
    # The CPU table 10 bytes after the held-pose table: 100 entries of 111 bytes
    # (name, +0x20 flags, +0x21 probability, +0x22/+0x24 distance, ten 7-byte
    # steps at +0x2a), played by the CPU routine at 0x411270. Keep entries up to
    # the last used one; the engine still rolls for every slot.
    cpu_offset = held_offset + 15 * 6 + 10
    if data[cpu_offset:cpu_offset + 6] != "登録1\0".encode("cp932"):
        sys.exit("Unexpected CPU table layout; refusing to export.")
    cpu = []
    for i in range(100):
        entry = cpu_offset + 111 * i
        steps = []
        for k in range(10):
            direction, command, duration = struct.unpack_from("<HHH", data, entry + 0x2a + 7 * k)
            if not direction & 0x2000:
                break
            steps.append(dict(direction=direction & 15, command=command, duration=duration))
        cpu.append(dict(flags=data[entry + 0x20], probability=data[entry + 0x21],
                        min=u16(data, entry + 0x22), max=u16(data, entry + 0x24), steps=steps))
    while cpu and not cpu[-1]["probability"]:
        cpu.pop()
```

Extend the comment above `scripts, queue = …` with `, and CPU IORI (410, which jumps through 411 into iori3)`, then append `410` to the queue:

```python
    scripts, queue = {}, [88, 97, 174, 222, 250, 251, 253, 256, 260, 263, 264, 265, 278,
                          279, 280, 286, 292, 318, 319, 410]
```

In the `write_json(GENERATED / "assets.json", …)` call, add `cpu=cpu,` after `responses=responses,`.

Create `src/game/cpu.ts`:

```ts
// The engine's CPU (routine 0x411270) plays the character's CPU table.
import data from './generated/assets.json';

export interface CpuStep {
  direction: number;
  command: number;
  duration: number;
}
export interface CpuEntry {
  flags: number;
  probability: number;
  min: number;
  max: number;
  steps: CpuStep[];
}
// Ryuko's table: 100 slots of 111 bytes after the held-pose table, 43 used.
export const RYUKO_CPU: readonly CpuEntry[] = data.cpu;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run assets && bunx vitest run src/game/cpu.test.ts`
Expected: PASS (1 test). Then `bun run check` passes, which confirms `data.cpu` type-checks as `CpuEntry[]`.

---

### Task 2: CPU IORI (actions 410 → 411 → iori3)

**Files:**

- Modify: `src/game/match.ts` (`Control` union ~line 31; `command()` ~line 1503; `moveScripted()` ~line 1380)
- Modify: `src/game/animations.ts` (`animations` after `counterHit` ~line 376; `SCRIPTED` ~line 406)
- Test: `src/game/match.test.ts` (append a describe block at the end)

**Interfaces:**

- Consumes: `scripts["410"]` from Task 1.
- Produces: `Control` member `'cpuIori'` and scripted action `'cpuIori'`, used by Task 3's command map.

- [ ] **Step 1: Write the failing test**

Append to `src/game/match.test.ts`:

```ts
describe('CPU IORI', () => {
  it('plays 410 and 411, then continues into iori3', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + 1000; // out of reach: timing only
    match.step({}, { cpuIori: true });
    expect(cpu).toMatchObject({ action: 'cpuIori', age: 0 });
    // 410's displays (5 + 8 + 8 + 8 + 3) and 411's (3 + 5 + 5 + 10 + 8 + 3).
    expect(animationDuration('cpuIori')).toBe(66);
    ticks(match, 65);
    expect(cpu.action).toBe('cpuIori');
    expect(cpu.x).toBeLessThan(ryuko.x + 1000);
    match.step({}, {});
    expect(cpu).toMatchObject({ action: 'iori3', age: 0 });
  });

  it('hits with response 3 for source damage 10', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + 150;
    match.step({}, { cpuIori: true });
    for (let tick = 0; tick < 40 && ryuko.action !== 'hitHeavy'; tick++)
      match.step({}, {});
    expect(ryuko.action).toBe('hitHeavy'); // response 3 → action 75
    expect(ryuko.hp).toBe(98); // 10 source life × 100 / 510
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/game/match.test.ts -t "CPU IORI"`
Expected: FAIL, because `cpu.action` stays `'idle'` (no `cpuIori` control yet).

- [ ] **Step 3: Implement**

`src/game/animations.ts`: after the `counterHit: scriptClip(174),` entry in `animations`, add:

```ts
  // Command 22 (CPU IORI): action 410 jumps to 411, which jumps to iori3 (248).
  cpuIori: scriptClip(410),
```

and in `SCRIPTED`, after `counterHit: 174,`, add `cpuIori: 410,`.

`src/game/match.ts`: in the `Control` union, add `| 'cpuIori'` after `| 'dst'`.

In `command()`, directly after `if (fresh('iori') && ok(31)) return start('iori');`:

```ts
// Command 22 enters CPU IORI (410, level 31) on button 0x40, which only
// the CPU injects.
if (fresh('cpuIori') && ok(31)) {
  this.action(f, 'cpuIori', true);
  this.fireEvents(f);
  return true;
}
```

In `moveScripted()`, replace `if (next === 97) this.action(f, 'fly');` with:

```ts
if (next === 97) this.action(f, 'fly');
// CPU IORI: 411 jumps into iori3 at PC 5888. ponytail: op 0x20 at PC 5887
// recovers one time in six instead; add the roll with that recovery clip.
else if (next === 248) this.action(f, 'iori3');
```

(The existing `else if (next === 215) {` continues the chain.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/game/match.test.ts -t "CPU IORI"`
Expected: PASS (2 tests). If `hp` differs from 98, print `ryuko.hp` and check `sourceDamage` in `match.ts` before changing the expectation. The first contact is 410's box (damage 10).

---

### Task 3: The CPU VM

**Files:**

- Modify: `src/game/standing.ts` (op 32 at ~line 184; add the exported `rand`)
- Modify: `src/game/cpu.ts` (replace the whole file)
- Test: `src/game/cpu.test.ts`

**Interfaces:**

- Consumes: `RYUKO_CPU` (Task 1); `Control`, `Fighter` and `Input` types from `./match`; `'cpuIori'` (Task 2).
- Produces:
  - `rand(seed: number): [number, number]` from `standing.ts`;
  - `CPU_LEVEL = 50`;
  - `class CpuVM { constructor(entries?: readonly CpuEntry[], level?: number, seed?: number); level: number; seed: number; input(self: Pick<Fighter,'x'|'y'>, opponent: Pick<Fighter,'x'|'y'>): Input; guards(): boolean }`.

- [ ] **Step 1: Write the failing tests**

Replace the import line of `src/game/cpu.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { CpuVM, RYUKO_CPU } from './cpu';
import type { CpuEntry, CpuStep } from './cpu';
```

Append:

```ts
// At level 100 each jitter is rand % 1 = 0 and every probability of 100
// passes, so selection and timing are exact without re-deriving the LCG.
const at = (x: number, y = 0) => ({ x, y });
const step = (direction: number, command = 0, duration = 3): CpuStep => ({
  direction,
  command,
  duration,
});
const entry = (steps: CpuStep[], rest: Partial<CpuEntry> = {}): CpuEntry => ({
  flags: 0,
  probability: 100,
  min: 0,
  max: 2000,
  steps,
  ...rest,
});
// Self at 300 and the opponent at 600: 200 source pixels apart.
function run(vm: CpuVM, count: number, self = at(300), opponent = at(600)) {
  return Array.from({ length: count }, () => vm.input(self, opponent));
}

describe('CPU decision and playback', () => {
  it('holds a step for its duration plus one, then gives no input as the entry ends', () => {
    const vm = new CpuVM([entry([step(2)])], 100);
    // Level 100 resets the decision timer to -50, so it picks again at once.
    expect(run(vm, 6).map((input) => !!input.right)).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
    ]);
  });

  it('plays steps in order until one is missing', () => {
    const vm = new CpuVM([entry([step(2, 0, 0), step(6, 0, 0)])], 100);
    expect(run(vm, 3)).toEqual([{ right: true }, { left: true }, {}]);
  });

  it('filters by probability, distance and who is airborne; the last pass wins', () => {
    const picks = (entries: CpuEntry[], self = at(300), opponent = at(600)) =>
      run(new CpuVM(entries, 100), 1, self, opponent)[0];
    expect(picks([entry([step(2)], { probability: 0 })])).toEqual({});
    expect(picks([entry([step(2)], { min: 201 })])).toEqual({});
    expect(picks([entry([step(2)], { max: 199 })])).toEqual({});
    expect(picks([entry([step(2)], { min: 200, max: 200 })])).toEqual({
      right: true,
    });
    expect(picks([entry([step(2)], { flags: 1 })])).toEqual({});
    expect(picks([entry([step(2)], { flags: 1 })], at(300, -10))).toEqual({
      right: true,
    });
    expect(picks([entry([step(2)], { flags: 2 })])).toEqual({});
    expect(
      picks([entry([step(2)], { flags: 2 })], at(300), at(600, -10)),
    ).toEqual({ right: true });
    expect(picks([entry([step(2)]), entry([step(6)])])).toEqual({
      left: true,
    });
  });

  it('turns directions toward and away from the opponent', () => {
    const facingLeft = (direction: number) =>
      run(new CpuVM([entry([step(direction)])], 100), 1, at(600), at(300))[0];
    expect(facingLeft(2)).toEqual({ left: true });
    expect(facingLeft(6)).toEqual({ right: true });
    expect(facingLeft(9)).toEqual({ jump: true, left: true });
    expect(facingLeft(5)).toEqual({ crouch: true, right: true });
    expect(facingLeft(1)).toEqual({});
  });

  it('presses a command on alternate ticks, including across repeated steps', () => {
    const punches = (steps: CpuStep[]) =>
      run(new CpuVM([entry(steps)], 100), steps.length * 2 + 1).map(
        (input) => input.punch,
      );
    // Duration 4: five ticks, pressed on the first, third and fifth.
    expect(
      run(new CpuVM([entry([step(0, 19, 4)])], 100), 6).map((i) => i.punch),
    ).toEqual([true, false, true, false, true, undefined]);
    // P:1 P:1 — the second step still gets its own press.
    expect(punches([step(0, 19, 1), step(0, 19, 1)])).toEqual([
      true,
      false,
      true,
      false,
      undefined,
    ]);
  });

  it('maps commands to single controls', () => {
    const command = (id: number) =>
      run(new CpuVM([entry([step(0, id)])], 100), 1)[0];
    expect(command(8)).toEqual({ drill: true });
    expect(command(11)).toEqual({ jump: true, right: true });
    expect(command(14)).toEqual({ dash: true, left: true });
    expect(command(22)).toEqual({ cpuIori: true });
    expect(command(15)).toEqual({});
  });

  it('stays off at level 0 without drawing', () => {
    const vm = new CpuVM([entry([step(2)])], 0);
    expect(run(vm, 5)).toEqual([{}, {}, {}, {}, {}]);
    expect(vm.seed).toBe(0);
  });

  it('guards on rand % 100 < level', () => {
    const always = new CpuVM([], 100);
    const never = new CpuVM([], 0);
    expect([always.guards(), always.guards()]).toEqual([true, true]);
    expect(never.guards()).toBe(false);
    expect(never.seed).not.toBe(0);
  });

  it("plays Ryuko's table at the authored level", () => {
    const vm = new CpuVM(RYUKO_CPU);
    expect(vm.level).toBe(50);
    expect(run(vm, 200).some((input) => Object.keys(input).length)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/game/cpu.test.ts`
Expected: FAIL, `CpuVM is not a constructor` (or a similar missing-export error).

- [ ] **Step 3: Export the LCG from `standing.ts`**

Above `export class StandingVM`, add:

```ts
// MSVC rand (engine 0x417a22): the next 32-bit seed and its 15-bit result.
export function rand(seed: number): [number, number] {
  const next = (Math.imul(seed, 214013) + 2531011) >>> 0;
  return [next, (next >>> 16) & 32767];
}
```

In the op 32 branch, replace the two lines

```ts
this.seed = (Math.imul(this.seed, 214013) + 2531011) >>> 0;
const random = (this.seed >>> 16) & 32767;
```

with

```ts
const [seed, random] = rand(this.seed);
this.seed = seed;
```

- [ ] **Step 4: Implement `CpuVM`**

Replace `src/game/cpu.ts` with:

```ts
// Port of the engine's CPU (routine 0x411270, control type 1 at 0x4112f9),
// driven by the character's CPU table. It only produces input, so the CPU plays
// through the same rules as the player.
import data from './generated/assets.json';
import type { Control, Fighter, Input } from './match';
import { rand } from './standing';

export interface CpuStep {
  direction: number;
  command: number;
  duration: number;
}
export interface CpuEntry {
  flags: number;
  probability: number;
  min: number;
  max: number;
  steps: CpuStep[];
}
// Ryuko's table: 100 slots of 111 bytes after the held-pose table, 43 used.
export const RYUKO_CPU: readonly CpuEntry[] = data.cpu;
// Authored: the Vs. level comes from the story setup (+0xdf61), not recovered.
export const CPU_LEVEL = 50;
// The scan draws a roll for every slot, used or not.
const SLOTS = 100;
// Tables 0x41f138/0x41f178 by direction nibble. The mirrored one applies when
// the CPU is right of its opponent, so F is always toward them.
const DIRECTIONS = [
  '',
  '',
  'F',
  'DF',
  'D',
  'DB',
  'B',
  'UB',
  'U',
  'UF',
  'B',
  'U',
  'F',
  'D',
  '',
  '',
];
// Ryuko's command table (1-based) as the port's single-button controls, with
// the direction a jump or dash command carries.
const COMMANDS: Record<number, [Control, string?]> = {
  1: ['changeAttack'],
  2: ['megaBeam'],
  3: ['musashi'],
  4: ['getterBeam'],
  5: ['blackRush'],
  6: ['axe'],
  7: ['dst'],
  8: ['drill'],
  9: ['iori'],
  10: ['jump'],
  11: ['jump', 'F'],
  12: ['jump', 'B'],
  13: ['dash'],
  14: ['dash', 'B'],
  17: ['hitUp'],
  18: ['throw'],
  19: ['punch'],
  20: ['kick'],
  22: ['cpuIori'],
};
type Body = Pick<Fighter, 'x' | 'y'>;
const airborne = (f: Body) => f.y < 0;

export class CpuVM {
  // Player +0xdf7d (decision timer), +0xdf75 (active entry), +0xdf81 (step)
  // and +0xdf79 (step timer).
  private timer = 0;
  private entry: CpuEntry | null = null;
  private step = -1;
  private stepTimer = 0;
  private last: Input = {};

  constructor(
    private entries: readonly CpuEntry[] = RYUKO_CPU,
    public level = CPU_LEVEL,
    public seed = 0,
  ) {}

  // Authored: the engine shares one rand seed with everything; the CPU keeps
  // its own.
  private random() {
    const [seed, value] = rand(this.seed);
    this.seed = seed;
    return value;
  }

  input(self: Body, opponent: Body): Input {
    if (!this.entry) {
      if (!this.level || --this.timer > 0) return this.emit({});
      this.timer = (this.random() % (101 - this.level)) - this.level + 50;
      // Source pixels: the arena draws the source at 1.5x.
      const distance = Math.floor(Math.abs(self.x - opponent.x) / 1.5);
      for (let slot = 0; slot < SLOTS; slot++) {
        const roll = this.random() % 100;
        const entry = this.entries[slot];
        if (
          entry &&
          roll < entry.probability &&
          distance >= entry.min &&
          distance <= entry.max &&
          Boolean(entry.flags & 1) === airborne(self) &&
          Boolean(entry.flags & 2) === airborne(opponent)
        ) {
          this.entry = entry;
          this.step = -1;
          this.stepTimer = 0;
        }
      }
    }
    if (this.entry && --this.stepTimer < 0) {
      this.step++;
      const duration = this.entry.steps[this.step]?.duration ?? 0;
      if (this.step >= this.entry.steps.length) this.entry = null;
      // Drawn even as the entry ends.
      this.stepTimer = duration + (this.random() % (101 - this.level));
    }
    if (!this.entry) return this.emit({});
    return this.emit(
      this.stepInput(this.entry.steps[this.step], self, opponent),
    );
  }

  // 0x40f3a2: a CPU victim ignores its input and guards on rand % 100 < level.
  guards() {
    return this.random() % 100 < this.level;
  }

  // A direction step holds its direction. The engine clears the CPU's input
  // history every tick (0x403300) and rewrites the command, so a command step
  // re-enters it each tick; a port button needs a release to count again, so
  // it presses on alternate ticks (authored).
  private stepInput(step: CpuStep, self: Body, opponent: Body): Input {
    const toward = self.x > opponent.x ? 'left' : 'right';
    const away = toward === 'left' ? 'right' : 'left';
    const input: Input = {};
    const hold = (direction = '') => {
      if (direction.includes('F')) input[toward] = true;
      if (direction.includes('B')) input[away] = true;
      if (direction.includes('U')) input.jump = true;
      if (direction.includes('D')) input.crouch = true;
    };
    hold(DIRECTIONS[step.direction]);
    const command = COMMANDS[step.command];
    if (command) {
      const [control, direction] = command;
      hold(direction);
      input[control] = !this.last[control];
    }
    return input;
  }

  private emit(input: Input) {
    this.last = input;
    return input;
  }
}
```

Prettier will re-wrap `DIRECTIONS` in Task 5's format step; that is fine.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run src/game/cpu.test.ts src/game/standing.test.ts`
Expected: all pass. The standing tests prove the `rand` extraction kept the oracle sequence.

---

### Task 4: Wire the CPU into the match

**Files:**

- Modify: `src/game/match.ts`
- Modify: `src/game/scene.ts:203`
- Test: `src/game/match.test.ts`

**Interfaces:**

- Consumes: `CpuVM`, `CPU_LEVEL`, `RYUKO_CPU` (Task 3).
- Produces: `Match.cpu: CpuVM` (public, replaceable in tests), and the constructor `new Match(mode?, intro?, seed = 0)`.

- [ ] **Step 1: Write the failing tests**

In `src/game/match.test.ts`, add `import { CpuVM } from './cpu';` below the `./dummy` import. Replace the existing test

```ts
  it('runs a CPU opponent and resolves the 60-second time limit', () => {
    const cpu = new Match('cpu');
    for (let i = 0; i < 500; i++) cpu.step();
    expect(cpu.fighters[0].hp).toBeLessThan(100);
    const match = new Match('cpu');
```

with

```ts
  it('resolves the 60-second time limit', () => {
    const match = new Match('cpu');
```

(the rest of that test is unchanged). Append:

```ts
describe('recovered CPU', () => {
  // An empty table leaves only the guard roll acting.
  function vsCpu(vm: CpuVM, gap = 120) {
    const match = new Match('cpu');
    match.cpu = vm;
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + gap;
    return { match, ryuko, cpu };
  }
  // Ryuko's punch becomes active on the next tick; the CPU supplies its input.
  function punch(match: Match, ryuko: Fighter) {
    ryuko.action = 'punch';
    ryuko.age = ATTACKS.punch.startup - 1;
    match.step();
  }

  it('guards a neutral CPU on rand % 100 < level, ignoring its input', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    punch(match, ryuko);
    expect(cpu.action).toBe('block');
  });

  it('does not roll while the CPU attacks or reacts', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    Object.assign(cpu, { action: 'noSuper', age: 0 });
    punch(match, ryuko);
    expect(cpu.action).toBe('hit');
  });

  it('keeps guarding through a guard reaction', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 0));
    Object.assign(cpu, { action: 'block', age: 0 });
    punch(match, ryuko);
    expect(cpu.action).toBe('block');
  });

  it('rolls only when a hit lands', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 0), 400);
    punch(match, ryuko);
    for (let tick = 0; tick < 10; tick++) match.step();
    expect(match.cpu.seed).toBe(0);
    cpu.x = ryuko.x + 120;
    punch(match, ryuko);
    expect(cpu.action).toBe('hit');
    expect(match.cpu.seed).not.toBe(0);
  });

  it('leaves a supplied opponent input and the practice partner to their own guard', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    ryuko.action = 'punch';
    ryuko.age = ATTACKS.punch.startup - 1;
    match.step({}, {});
    expect(cpu.action).toBe('hit');
    const practice = new Match();
    practice.cpu = new CpuVM([], 100);
    const [player, partner] = practice.fighters;
    partner.x = player.x + 120;
    punch(practice, player);
    expect(partner.action).toBe('hit');
  });

  it('dashes only through its DASH commands', () => {
    const jumpToward: CpuEntry = {
      flags: 1,
      probability: 100,
      min: 0,
      max: 2000,
      steps: [{ direction: 9, command: 0, duration: 5 }],
    };
    const spent = {
      action: 'jump',
      y: -200,
      vy: 0,
      doubleJumped: true,
    } as const;
    const { match, cpu } = vsCpu(new CpuVM([jumpToward], 100), 400);
    Object.assign(cpu, spent);
    match.step();
    expect(cpu).toMatchObject({ action: 'jump', airDashed: false });
    // The same press from a player-driven opponent takes the air-dash shortcut.
    const player = vsCpu(new CpuVM([], 100), 400);
    Object.assign(player.cpu, spent);
    player.match.step({}, { left: true, jump: true });
    expect(player.cpu.action).toBe('airDash');
  });

  it('plays from the recovered table against an idle player', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    const actions = new Set<string>();
    for (let tick = 0; tick < 3000 && !match.winner; tick++) {
      match.step({});
      actions.add(cpu.action);
    }
    expect(actions.size).toBeGreaterThan(3);
    expect(ryuko.hp).toBeLessThan(100);
  });

  it('seeds the CPU from the match', () => {
    expect(new Match('cpu', false, 7).cpu.seed).toBe(7);
  });
});
```

Also change the import `import { CpuVM } from './cpu';` to

```ts
import { CpuVM } from './cpu';
import type { CpuEntry } from './cpu';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/game/match.test.ts -t "recovered CPU"`
Expected: FAIL. `match.cpu` doesn't exist yet, so assigning it has no effect, and the guard tests see `'hit'` instead of `'block'`.

- [ ] **Step 3: Implement in `match.ts`**

1. Imports: add `import { CPU_LEVEL, CpuVM, RYUKO_CPU } from './cpu';` after the `./animations` type import. (`cpu.ts` imports only types from `match.ts`, so there is no runtime cycle.)

2. Below `const guards = new Set<Action>([...]);`, add:

```ts
// Where move() lets a fighter start guarding: the authored stand-in for the
// engine's object flags +0x15e & 0xc, under which a CPU victim rolls a guard.
const neutral = new Set<Action>([
  'idle',
  'walk',
  'backwalk',
  'turn',
  'crouchTurn',
  'crouch',
  'crouchEnter',
  'jump',
  'doubleJump',
]);
```

3. In `class Match`, after the `practice` field, add:

```ts
  cpu: CpuVM;
  // This tick's Vs. CPU opponent input comes from the CPU (none was supplied).
  private cpuDriven = false;
```

and change the constructor to:

```ts
  constructor(
    public mode: Mode = 'practice',
    intro = false,
    seed = 0,
  ) {
    this.cpu = new CpuVM(RYUKO_CPU, CPU_LEVEL, seed);
    if (!intro) return;
```

(the rest of the constructor body is unchanged).

4. Replace `ai()` with the following, and add the guard helper after it:

```ts
  private ai(): Input {
    const [player, opponent] = this.fighters;
    if (this.mode === 'practice')
      return dummyInput(this.practice.partner, opponent, player, this.ticks);
    return this.cpu.input(opponent, player);
  }

  // 0x40f3a2: a CPU victim ignores its input. In a neutral state it guards on
  // rand % 100 < level; in a guard reaction it keeps guarding.
  private guarding(target: Fighter, source: { facing: number }) {
    if (guards.has(target.action) && target.facing !== source.facing)
      return true;
    return (
      this.cpuDriven &&
      target === this.fighters[1] &&
      neutral.has(target.action) &&
      this.cpu.guards()
    );
  }
```

5. In `step()`, replace

```ts
const inputs: [Input, Input] = [player, opponent ?? this.ai()];
```

with

```ts
this.cpuDriven = this.mode === 'cpu' && !opponent;
const inputs: [Input, Input] = [player, opponent ?? this.ai()];
```

6. In `boxContact()`, replace

```ts
const guarding = guards.has(target.action) && target.facing !== source.facing;
```

with `const guarding = this.guarding(target, source);`.

7. In the melee `contacts` block, the range test must come before the guard decision. Replace the code from `if (protectedReactions.has(target.action)) return [];` through the end of that callback (the `return !f.connected && … ? [ { … } ] : [];`) with:

```ts
const distance = (target.x - f.x) * f.facing;
if (
  protectedReactions.has(target.action) ||
  f.connected ||
  f.age < attack.startup ||
  f.age >= attack.startup + attack.active ||
  (cycle && activeAge % cycle.interval >= cycle.active) ||
  distance < 0 ||
  distance > attack.range ||
  Math.abs(f.y - target.y) >= 110
)
  return [];
// Decided on contact only: a CPU victim draws its guard roll here.
const guarding = this.guarding(target, f);
const stance =
  target.y < 0 || target.vy < 0
    ? 2
    : target.action.startsWith('crouch')
      ? 1
      : 0;
const { ids, last } = ATTACK_RESPONSES[f.action];
const response =
  RESPONSE_REACTIONS[
    RESPONSES[(finisher && last ? last : ids)[(guarding ? 3 : 0) + stance]]
  ];
const reaction = response.action;
const blocked = blocks.has(reaction);
const heavy =
  heavyImpacts.has(f.action) || (f.action === 'punch2' && finisher && !blocked);
// Aerial drill pauses are applied by the attacker's contact branch instead.
const hitStop = airDrill ? 0 : response.stop;
return [
  {
    f,
    target,
    damage,
    finisher,
    heavy,
    hitStop,
    attackerStop: airDrill ? 0 : (response.attackerStop ?? response.stop),
    airDrill,
    reaction: reaction as AnimatedAction | null,
    facing: f.facing,
    x: target.x - f.facing * 42,
    y:
      GROUND +
      target.y -
      (f.action.startsWith('crouch') || target.action.startsWith('crouch')
        ? 75
        : 145),
    projectile: null as Projectile | null,
    blocked,
    source: null as Fighter | Effect | null,
    fbh: false,
  },
];
```

8. In the axe contact, replace

```ts
// Action 227 selects FB on ground (no stop), strong hit in air.
const hitStop =
  guards.has(target.action) && target.facing !== projectile.facing
    ? 10
    : target.y < 0 || target.vy < 0
      ? 15
      : 0;
```

with

```ts
const blocked = this.guarding(target, projectile);
// Action 227 selects FB on ground (no stop), strong hit in air.
const hitStop = blocked ? 10 : target.y < 0 || target.vy < 0 ? 15 : 0;
```

and in the pushed contact below it, replace

```ts
          blocked:
            guards.has(target.action) && target.facing !== projectile.facing,
```

with `blocked,`.

9. In `move()`, replace

```ts
const directionalDash = airborne
  ? direction !== 0 && !previous[direction === 1 ? 'right' : 'left']
  : doubleTap;
```

with

```ts
// The dash shortcuts are keyboard/touch input choices; the CPU dashes only
// through its DASH commands.
const shortcuts = !(this.cpuDriven && f === this.fighters[1]);
const directionalDash =
  shortcuts &&
  (airborne
    ? direction !== 0 && !previous[direction === 1 ? 'right' : 'left']
    : doubleTap);
```

In `scene.ts` `reset()`, replace `this.match = new Match(mode, mode === 'cpu');` with:

```ts
// Authored: each match seeds its CPU afresh.
this.match = new Match(
  mode,
  mode === 'cpu',
  Math.floor(Math.random() * 2 ** 32),
);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run src/game/match.test.ts -t "recovered CPU"`
Expected: PASS (8 tests).

Then run the whole suite: `bun run test`.
Expected: all pass. Every existing test drives the opponent through `ticks()` (which supplies `{}`) or steps during the intro or winner phase, so none should change. If one fails because the recovered CPU now acts in it, and the test is not about the CPU, pass `{}` as its opponent input. Don't change a test's expected values.

---

### Task 5: README, help text, validation, browser run, commit

**Files:**

- Modify: `README.md`, `src/App.svelte:408`

- [ ] **Step 1: Update the README**

- Line 3: replace `Includes free practice, a simple CPU opponent,` with `Includes free practice, the original CPU opponent recovered from Ryuko's CPU table,`.
- Play (line 49): replace `Vs. CPU adds simple deterministic approach/guard/attack behavior.` with
  `Vs. CPU plays the original game's CPU. Every half second or less, it picks a move from Ryuko's recovered CPU table by distance, odds and who is airborne: walks, jumps, dashes, punch and kick strings, Hit Up, the specials, the supers (NO SUPER without stock) and its own two-strike IORI. It blocks about half of the hits that reach it while it is free to guard.`
- End of line 53: delete ` The CPU still uses its simple punch/kick/guard behavior.`
- Line 75: in `hit ranges, damage, guard, hitstun, AI, and round flow`, delete `AI, `.
- End of line 86: replace `The CPU does not use supers.` with `The CPU enters supers through the same commands.`
- Line 91 (Practice partner): replace `the original CPU logic is not yet recovered.` with `they are not the original CPU (see CPU below).`
- After the Practice partner bullet, add:

  `- **CPU:** routine \`0x411270\` (control type 1, case \`0x4112f9\`) plays Ryuko's CPU table: 100 slots of 111 bytes after the held-pose table, 43 used. Each entry holds flags (bit 0 self airborne, bit 1 opponent airborne), a probability, a distance window in source pixels, and up to ten steps of direction, command and duration. While no entry plays, a timer counts down. At zero it resets to \`rand % (101 − L) − L + 50\`, every slot draws \`rand % 100\`, and the last entry that passes its probability, distance and airborne checks plays. Each step lasts its duration plus \`rand % (101 − L)\` ticks, plus one. The engine clears the CPU's input history every tick (\`0x403300\`) and writes the step's direction, or its command's whole input, so a command repeats through its step. When a hit reaches the CPU in a neutral state, \`0x40f3a2\` guards on \`rand % 100 < L\`, ignoring its input; in a guard reaction it keeps guarding. Command 22 enters CPU IORI: action 410 (damage 10) jumps to 411 (damage 15), which jumps to IORI 3 (248). \`rand\` is MSVC's (\`0x417a22\`). Authored: level 50 (the story's value is not recovered), a separate seed per match, commands as the port's single buttons pressed on alternate ticks, no keyboard dash shortcuts for the CPU, the neutral states (those where the player's own guard would start), and always continuing CPU IORI into IORI 3 (the source recovers one time in six at PC 5887).`

- [ ] **Step 2: Update the in-app help**

In `src/App.svelte`, replace `Vs. CPU adds an opponent that approaches, blocks,` / `and attacks.` with `Vs. CPU is the original game's CPU, playing Ryuko's own moves,` / `specials and supers.` (keep the surrounding sentence flow and line wrapping; `bun run format` re-wraps).

- [ ] **Step 3: Validate**

Run: `bun run format && bun run validate`
Expected: format, lint, check and every test pass.

- [ ] **Step 4: Play against the CPU in the browser**

Start `bun run dev` in the background. Using the Playwright MCP:

1. Open `http://127.0.0.1:5173` and click **Vs. CPU**.
2. After the intro (about 2 s), read `[aria-label="Match health"]` every 200 ms for 15 s with no input.
3. Confirm the CPU walks, jumps and attacks, and that Ryuko's health drops.
4. Play a few punches and kicks into it and confirm some are blocked.
5. Take one screenshot to the scratchpad.

Press **P** to pause between calls. Afterwards, close the browser, stop the dev server and run `rm -rf .playwright-mcp`.

- [ ] **Step 5: Commit (after the user confirms)**

```bash
git add README.md scripts/export_assets.py src/App.svelte src/game/animations.ts \
  src/game/cpu.ts src/game/cpu.test.ts src/game/match.ts src/game/match.test.ts \
  src/game/scene.ts src/game/standing.ts docs/superpowers
git commit -m "Recover the original CPU opponent from Ryuko's CPU table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
