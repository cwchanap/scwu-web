import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// ZAKU as player 1, `gap` from a standing Ryuko as player 2.
function zakuPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['zaku', 'ryuko']);
  const [zaku, other] = match.fighters;
  other.x = zaku.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, zaku, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 1 } = {}) {
  const { zaku, other, steps } = zakuPlayer(gap);
  zaku.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(zaku)) mine.push(now(zaku));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: zaku.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('ZAKU (35 ZAKU.PLAYER)', () => {
  it('takes 200 life from his parameter block, desperate at 60', () => {
    expect([lifeOf('zaku'), desperationOf('zaku')]).toEqual([200, 60]);
    const { zaku } = zakuPlayer();
    expect(zaku).toMatchObject({ who: 'zaku', hp: 200, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.zaku.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('zaku')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.zaku.aliases).toEqual({});
    // One before Ryuko's KOs, fourteen for the light hits, fifteen to the
    // shock, fourteen from Shock, thirteen past Chuck Hiso, and his guards
    // one after another from 162.
    expect(
      [59, 60, 62, 73, 75, 88, 90, 128, 140, 145, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([58, 59, 61, 87, 90, 103, 104, 142, 153, 158, 162, 163, 175]);
    // Down Get up's last display is 5 ticks (PC 1805).
    expect(animationDuration('getUp', 'zaku')).toBe(25);
  });

  it('reads his command table; Hit Up, Chuck and Jump 2 name nothing', () => {
    expect(CHARACTERS.zaku.levels).toEqual({
      21: 0, // DASH F
      22: 10, // DASH B
      186: 21, // P
      187: 21, // K
      189: 21, // P J
      190: 21, // K J
      192: 31, // DASH P
      197: 41, // super P start
      201: 41, // Super boom start
      263: 0, // cpu dash
      264: 0, // cpu dash jump
    });
    for (const key of [{ hitUp: true }, { throw: true }])
      expect(byKey(key, { gap: 60 })).toEqual({
        mine: ['idle'],
        damage: 0,
        stock: 1,
      });
    // A second jump only presses the air punch on.
    expect(
      play(
        presses({ 0: { jump: true }, 25: { jump: true }, 40: { punch: true } }),
      ),
    ).toMatchObject({ mine: ['takeoff', 'jump', 189, 'land', 'idle'] });
  });

  it('punches with P, standing or crouching, and lobs a bomb with K', () => {
    for (const key of [{ punch: true }, { punch: true, crouch: true }])
      expect(byKey(key)).toEqual({ mine: [186, 'idle'], damage: 10, stock: 1 });
    // K bomb (188, PC 2065) bounces lower each time and bursts where it
    // lands (PCs 2092–2097).
    for (const [gap, damage] of [
      [90, 0],
      [150, 10],
      [250, 10],
      [350, 0],
    ] as const)
      expect(byKey({ kick: true }, { gap })).toEqual({
        mine: [187, 'idle'],
        damage,
        stock: 1,
      });
    expect(
      play(presses({ 0: { jump: true }, 20: { kick: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 190, 'land', 'idle'],
      damage: 3,
    });
  });

  it('dashes in with DASH P, and cancels on a hit through his windows (op 0x1e, PCs 2038, 2145)', () => {
    for (const gap of [90, 300])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [192, 'idle'],
        damage: 20,
        stock: 1,
      });
    for (const at of [10, 30])
      expect(
        play(presses({ 0: { punch: true }, [at]: { drill: true } })),
      ).toEqual({ mine: [186, 192, 'idle'], damage: 30, stock: 1 });
    expect(
      play(presses({ 0: { punch: true }, 30: { getterBeam: true } })),
    ).toEqual({ mine: [186, 197, 'idle'], damage: 70, stock: 0 });
    expect(
      play(presses({ 0: { drill: true }, 30: { getterBeam: true } })),
    ).toEqual({ mine: [192, 197, 'idle'], damage: 80, stock: 0 });
  });

  it('spends a stock on Super P or Super K, or enters No super', () => {
    // Super P rp four times (PC 2199), then SUPER P fin (PC 2200).
    for (const gap of [90, 300])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [197, 'idle'],
        damage: 60,
        stock: 0,
      });
    // Five bombs (PCs 2264–2268), 13 each.
    for (const gap of [90, 200])
      expect(byKey({ musashi: true }, { gap })).toEqual({
        mine: [201, 'idle'],
        damage: 65,
        stock: 0,
      });
    expect(byKey({ getterBeam: true }, { stock: 0 })).toEqual({
      mine: [194, 'idle'],
      damage: 0,
      stock: 0,
    });
  });

  it('darkens the court through variable 13, which his Black (55) tests', () => {
    const { zaku, steps } = zakuPlayer();
    zaku.stock = 1;
    steps({}, 2);
    steps({ getterBeam: true });
    // super P start sets it at age 0 (PC 2184).
    expect(zaku.variables[13]).toBe(100);
    const shown: string[] = [];
    while (zaku.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(zaku.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.zaku.opaque.image).toBe(1011);
  });

  it('fills his one stock through his Vs. intro, 開始時 BR (38)', () => {
    expect(animationDuration('intro', 'zaku')).toBe(255);
    const match = new Match('cpu', true, 0, ['zaku', 'zoma']);
    const zaku = match.fighters[0];
    let ticks = 0;
    while (zaku.action === 'intro') {
      match.step({});
      ticks++;
    }
    // OP super Charge (44) takes 300 power, then adds 2 a hundred times
    // (PCs 371–372), past his one stock (+0x7cb2).
    expect([ticks, zaku.stock]).toEqual([255, 1]);
    // Round 1 (39) shows nothing for 50 ticks, then fades his stance in
    // (PCs 323–333) and calls DEMO STAND four times (PC 336).
    expect(
      [0, 49, 50, 65, 83, 91, 254].map(
        (age) => animationFrame('intro', age, 'zaku').image,
      ),
    ).toEqual([0, 0, 113, 114, 115, 113, 115]);
  });

  it('wins after four DEMO STANDs, looping his stance (PC 481), and draws looping it', () => {
    expect(animationDuration('win', 'zaku')).toBe(246);
    expect(
      [0, 40, 41, 163, 164, 205, 246, 300].map(
        (age) => animationFrame('win', age, 'zaku').image,
      ),
    ).toEqual([113, 115, 113, 115, 113, 113, 113, 113]);
    expect(
      [0, 15, 33, 41, 1025].map(
        (age) => animationFrame('draw', age, 'zaku').image,
      ),
    ).toEqual([113, 114, 115, 113, 113]);
    expect(faceImage(-1, 'zaku')).toBe(2001);
  });

  it('stands through his idle program, past its global 10 test (PC 3), until it ends (PC 16)', () => {
    const vm = new StandingVM(CHARACTERS.zaku.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([113, 114, 115]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His CPU's own cpu dash, and cpu dash jump into his high jump (PC 3062).
    for (const [seed, wanted] of [
      [5, [263, 264, 16, 201]],
      [1, [197, 264, 16]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'zaku']);
      const zaku = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 3000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (zaku.action === 'script') entered.add(zaku.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
