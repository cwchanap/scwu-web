import { describe, expect, it } from 'vitest';
import { CPU_CONTROLS, CPU_TABLES, CpuVM, RYUKO_CPU } from './cpu';
import type { CpuEntry, CpuStep } from './cpu';
import { Match } from './match';
import { rand } from './standing';

describe('recovered CPU table', () => {
  it("exports Zoma's 44 used entries", () => {
    expect(CPU_TABLES.zoma).toHaveLength(44);
    // Entry 40: 'cpu dash j' (command 24) from 400 to 640 source pixels.
    expect(CPU_TABLES.zoma[39]).toEqual({
      flags: 0,
      probability: 40,
      min: 400,
      max: 640,
      steps: [{ direction: 0, command: 24, duration: 1 }],
    });
  });

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

  it("adds a step's direction to its command, as 0x411644 does", () => {
    // Slot 22: crouch (D) with P, a crouching punch.
    expect(RYUKO_CPU[22].steps[0]).toEqual({
      direction: 4,
      command: 19,
      duration: 1,
    });
    expect(run(new CpuVM([RYUKO_CPU[22]], 100), 1)[0]).toEqual({
      crouch: true,
      punch: true,
    });
  });

  it('maps commands to single controls', () => {
    const command = (id: number) =>
      run(new CpuVM([entry([step(0, id)])], 100), 1)[0];
    expect(command(8)).toEqual({ drill: true });
    expect(command(11)).toEqual({ jump: true, right: true });
    expect(command(14)).toEqual({ dash: true, left: true });
    expect(command(22)).toEqual({ cpuIori: true });
    expect(command(15)).toEqual({ ex: true });
    // Ryuko's table never uses 16, which has no key: it goes to the match.
    expect(command(16)).toEqual({ command: 16 });
  });

  it("writes Zoma's commands, with the step's direction held", () => {
    const vm = new CpuVM([entry([step(4, 19)])], 100, 0, CPU_CONTROLS.zoma);
    expect(run(vm, 2)).toEqual([
      { crouch: true, command: 19 },
      { crouch: true, command: 19 },
    ]);
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

  it('clears its timers and entry on reset, so it draws again at once', () => {
    const vm = new CpuVM([entry([step(2, 0, 90)])]);
    run(vm, 30);
    vm.reset(CPU_TABLES.zoma, CPU_CONTROLS.zoma);
    const fresh = new CpuVM(CPU_TABLES.zoma, 50, vm.seed, CPU_CONTROLS.zoma);
    expect(run(vm, 300)).toEqual(run(fresh, 300));
    expect(vm.seed).toBe(fresh.seed);
  });

  it('draws on the first fighting tick of every round (0x411f82)', () => {
    // The rolls a tick takes: a draw takes the timer's and every slot's.
    const rolls = (match: Match) => {
      let seed = match.cpu.seed;
      match.step();
      let count = 0;
      for (; seed !== match.cpu.seed && count < 1000; count++)
        [seed] = rand(seed);
      return count;
    };
    const match = new Match('cpu', true, 0, ['ryuko', 'zoma'], 'court');
    const counts: number[] = [];
    for (const round of [1, 2]) {
      while (match.round < round || match.roundTicks < match.fightTick)
        match.step();
      counts.push(rolls(match));
      // Mid-entry when the round ends: Zoma's CPU runs on through the KO.
      for (let t = 0; t < 345; t++) match.step();
      match.fighters[0].hp = 0;
    }
    expect(counts.every((count) => count > 100)).toBe(true);
  });

  it("plays Ryuko's table at the authored level", () => {
    const vm = new CpuVM(RYUKO_CPU);
    expect(vm.level).toBe(50);
    expect(run(vm, 200).some((input) => Object.keys(input).length)).toBe(true);
  });
});
