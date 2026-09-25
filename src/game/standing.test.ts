import { describe, expect, it } from 'vitest';
import data from './generated/assets.json';
import cases from './__fixtures__/idle-oracle.json';
import timeline from './__fixtures__/handoff-timeline.json';
import { heldFrame } from './animations';
import { heldPlacement, placement, StandingVM, timingScale } from './standing';

describe('recovered idle interpreter', () => {
  it.each(cases)(
    'matches the Python trace at seed $seed, speed $speed',
    ({ seed, speed, result }) => {
      const vm = new StandingVM(data.idle, seed, speed);
      for (let i = 0; i < 2000 && !vm.ended; i++) vm.tick();
      expect(vm.ended).toBe(true);
      expect(vm.tickIndex).toBe(result.end_tick);
      expect(vm.pc).toBe(result.pc);
      expect(vm.timer).toBe(result.timer);
      expect(vm.seed).toBe(result.seed_final);
      expect(vm.branches).toEqual(result.branches);
      expect(vm.instructionTrace).toEqual(result.instruction_trace);
      expect(
        vm.events.map((event, i) => ({
          ...event,
          visible_ticks: (vm.events[i + 1]?.tick ?? vm.tickIndex) - event.tick,
        })),
      ).toEqual(result.events);
    },
  );

  it('reproduces the actual handoff acceptance path, including image 295', () => {
    const vm = new StandingVM(data.idle);
    while (!vm.ended && vm.tickIndex < 2000) vm.tick();
    expect(vm.tickIndex).toBe(223);
    expect(vm.events).toHaveLength(18);
    expect(new Set(vm.events.map((e) => e.image)).size).toBe(9);
    expect(vm.events.map((e) => [e.tick, e.pc, e.image])).toEqual(
      timeline.events.map((e) => [e.tick, e.pc, e.image]),
    );
  });

  it('preserves asymmetric odd-width placement, signed truncation, and facing overrides', () => {
    const frame = data.clips.idle.find((f) => f.image === 2)!;
    expect(placement(frame, 93, 203, 1.5, -0.5, false)).toEqual({
      left: -47,
      top: -203,
      flip_x: false,
      flip_y: false,
    });
    expect(placement(frame, 93, 203, 1.5, -0.5, true)).toEqual({
      left: -44,
      top: -203,
      flip_x: true,
      flip_y: false,
    });
    expect(
      placement(
        { ...frame, flip_x: true, ignore_facing: true },
        93,
        203,
        1.5,
        -0.5,
        true,
      ),
    ).toEqual({ left: -47, top: -203, flip_x: true, flip_y: false });
  });

  it('draws op 0x07 held poses from their corner offsets, mirrored by the holder', () => {
    // Musashi's overhead pose 2: image 102 (94 x 205) at offset -45/-53.
    const pose = heldFrame(2, 4);
    expect([pose.image, pose.dx, pose.dy, pose.width, pose.height]).toEqual([
      102, -45, -53, 94, 205,
    ]);
    expect(heldPlacement(pose, 94, 205, 100.5, -0.5, false)).toEqual({
      left: 51,
      top: -53,
      flip_x: true,
      flip_y: false,
    });
    expect(heldPlacement(pose, 94, 205, 100.5, -0.5, true)).toEqual({
      left: 55,
      top: -53,
      flip_x: false,
      flip_y: false,
    });
    expect(heldPlacement(heldFrame(2, 8), 94, 205, 100.5, -0.5, false)).toEqual(
      { left: 55, top: -152, flip_x: false, flip_y: true },
    );
  });

  it.each([
    [255],
    [31, 0, 0, 0, 192, 1],
    [25, 0, 0, 0, 0, 0, 0, 0, 0, 20],
    [35, 1],
    [37, 0, 0, 1, 1],
    [10, 2],
    [10, 1, 0, 0],
  ])('rejects unsupported or non-yielding instructions: %j', (...bytes) => {
    const program = structuredClone(data.idle);
    program.records[program.start] = [
      ...bytes,
      ...Array<number>(16 - bytes.length).fill(0),
    ];
    expect(() => new StandingVM(program).tick()).toThrow();
  });

  it('honors indefinite display and validates speed/data boundaries', () => {
    const program = {
      start: 0,
      end: 1,
      records: [[12, ...Array<number>(15).fill(0)]],
    };
    const vm = new StandingVM(program);
    vm.tick();
    vm.tick();
    expect(vm.timer).toBe(-1);
    expect(vm.tickIndex).toBe(1);
    expect(() => timingScale(21)).toThrow();
    expect(() => new StandingVM({ ...program, end: 2 })).toThrow();
    expect([0, 7, 10, 20].map(timingScale)).toEqual([50, 85, 100, 200]);
  });
});
