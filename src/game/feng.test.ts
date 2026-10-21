import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  FENG_INTRO_EX_TICK,
} from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import { StandingVM } from './standing';
import type { Fighter, Input } from './match';

// OS FENG as player 1, `gap` from a standing opponent as player 2.
function fengPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['feng', opponent]);
  const [feng, other] = match.fighters;
  other.x = feng.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, feng, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until he is
// back on his feet: OS FENG's actions, the opponent's, and the damage dealt.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    ex = false,
    hp = 0,
    seed = 3,
    opponent = 'ryuko' as Who,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { feng, other, steps } = fengPlayer(gap, opponent, seed);
  feng.stock = stock;
  if (hp) feng.hp = hp;
  if (ex) feng.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(feng)) mine.push(now(feng));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
  }
  return { feng, other, mine, yours, damage: lifeOf(opponent) - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('OS FENG (19 OS FENG.PLAYER)', () => {
  it('takes 470 life from his parameter block, desperate at 141', () => {
    expect([lifeOf('feng'), desperationOf('feng')]).toEqual([470, 141]);
    const { feng } = fengPlayer();
    expect(feng).toMatchObject({ who: 'feng', hp: 470, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.feng.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('feng')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.feng.aliases).toEqual({});
    // Nine after Ryuko's KOs, seventeen after her hits up to SHOCK
    // INFINITY, sixteen from Shock, seventeen from Clothes off 500 (Fire
    // HISA, 104) and sixteen past Chuck Hiso.
    expect([60, 73, 88, 90, 104, 137, 140, 149].map((r) => twins[r])).toEqual([
      69, 90, 105, 106, 121, 154, 156, 165,
    ]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.feng.levels).toMatchObject({
      194: 21, // P1
      220: 22, // K J
      244: 31, // IORI Start
      291: 31, // KIKI start
      311: 41, // SUPER SHOOT START
      332: 41, // ICE P start
      358: 42, // en300 START
    });
    const { feng, steps } = fengPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(feng).toMatchObject({ action: 'script', branch: 194, age: 0 });
  });

  it('chains J and K into each other through P1 hit and P2 (op 0x24, 20 and 30 ticks)', () => {
    const chain = (first: Input, next: Input) =>
      play(presses({ 0: first, 20: next, 40: next }));
    expect(chain({ punch: true }, { punch: true })).toMatchObject({
      mine: [194, 195, 196, 197, 'idle'],
      damage: 62,
    });
    expect(chain({ punch: true }, { kick: true })).toMatchObject({
      mine: [194, 195, 205, 206, 207, 'idle'],
      damage: 68,
    });
  });

  it('plays his specials: dragon, Fire, iori, bp and SUCK', () => {
    for (const [key, gap, mine, damage] of [
      [{ drill: true }, 90, [275, 'idle'], 35],
      // KIKI start's arrow (294) flies the length of the court.
      [{ axe: true }, 250, [291, 'idle'], 15],
      [{ iori: true }, 90, [244, 'idle'], 15],
      [{ dst: true }, 90, [283, 'idle'], 35],
      // SUCK START's line reels the opponent in from afar.
      [{ blackRush: true }, 400, [260, 262, 'idle'], 45],
    ] as const)
      expect(byKey(key, { gap })).toMatchObject({ mine, damage });
  });

  it('takes iori to IORI P2 and P3 with ↓← J again within 30 ticks (op 0x24, PCs 3329, 3384)', () => {
    const iori = play(
      presses({ 0: { iori: true }, 35: { iori: true }, 70: { iori: true } }),
    );
    expect([iori.mine, iori.damage]).toEqual([
      [244, 246, 248, 249, 'idle'],
      45,
    ]);
    // At 141 life or less, P3 enters Evil IORI P3 (op 0x11, PC 3419).
    const evil = play(
      presses({ 0: { iori: true }, 35: { iori: true }, 70: { iori: true } }),
      {
        hp: 100,
      },
    );
    expect([evil.mine, evil.damage]).toEqual([[244, 246, 252, 'idle'], 60]);
  });

  it('plays his desperation forms of P sit and bp (op 0x11 at 141, PCs 2749, 4050)', () => {
    expect(byKey({ punch: true, crouch: true }, { hp: 100 })).toMatchObject({
      mine: [214, 'idle'],
      damage: 30,
    });
    expect(byKey({ dst: true }, { hp: 100 })).toMatchObject({
      mine: [284, 285, 'idle'],
      damage: 45,
    });
  });

  it('spends a stock on ICE punch and sshoot, three on EN300, or enters No super (306)', () => {
    for (const [key, stock, mine, damage, left] of [
      ['musashi', 3, [332, 343, '343+29', 'idle'], 80, 2],
      ['changeAttack', 3, [311, 'idle'], 110, 2],
      ['getterBeam', 3, [358, '362+26', 'idle'], 224, 0],
      ['getterBeam', 2, [306, 'idle'], 0, 2],
      ['musashi', 0, [306, 'idle'], 0, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { stock });
      expect([move.mine, move.damage, move.feng.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    // At 150 life or less, SUPER SHOOT START enters EXIL SS (op 0x11, PC
    // 4490).
    expect(byKey({ changeAttack: true }, { hp: 140 })).toMatchObject({
      mine: [316, 'idle'],
      damage: 120,
    });
  });

  it("cancels iori into a super through SC SUPER (309), for two stocks in all, as iori's variable 6 at 100 allows (PC 4485)", () => {
    const cancel = (stock: number) =>
      play(presses({ 0: { iori: true }, 20: { changeAttack: true } }), {
        stock,
      });
    expect(cancel(3)).toMatchObject({ mine: [244, 309, 'idle'], damage: 125 });
    expect(cancel(3).feng.stock).toBe(1);
    expect(cancel(2).feng.stock).toBe(0);
  });

  it('turns to EX for half a stock each way, where his moves take other forms', () => {
    const turned = byKey({ ex: true });
    expect([turned.mine, turned.feng.stock, turned.feng.power]).toEqual([
      [240, 'idle'],
      2,
      50,
    ]);
    expect(turned.feng.variables[0]).toBe(100);
    const back = byKey({ ex: true }, { ex: true });
    expect([back.mine, back.feng.variables[0]]).toEqual([[241, 'idle'], 0]);
    for (const [key, first] of [
      ['drill', 278], // EX Dragon start
      ['musashi', 349], // EX ICE PUNCH
      ['changeAttack', 326], // EX FIRE BEAM STARTY
      ['throw', 228], // Chuck, whose catch enters New Chuck Hit (231)
    ] as const)
      expect(byKey({ [key]: true }, { ex: true }).mine[0]).toBe(first);
    expect(byKey({ throw: true }, { ex: true }).mine[1]).toBe(231);
  });

  it('tints his catch blue through her fader in New Chuck Hit (op 0x0e flag 2, PC 3089)', () => {
    // Flag 2 starts the fader of whomever +0xdef9 holds from 0, not his.
    const { feng, other, steps } = fengPlayer();
    feng.variables[0] = 100;
    steps({}, 2);
    steps({ throw: true });
    while (!(feng.branch === 231 && feng.age === 91)) steps({});
    expect(feng.fader).toBeNull();
    expect(other).toMatchObject({
      action: 'superHeld',
      fader: {
        type: 1,
        start: { r: 0, g: 0, b: 0, fade: 0 },
        target: { r: 0, g: 0, b: 18, fade: 0 },
        left: 39,
        ticks: 40,
      },
    });
  });

  it('falls straight from AIR FIRE after a jump, but forward after a High Jump (variable 13 at 10, PC 4331)', () => {
    const jump = play(presses({ 0: { jump: true }, 15: { axe: true } }), {
      gap: 400,
    });
    expect(jump.mine).toEqual([
      'takeoff',
      'jump',
      298,
      '298+20',
      'land',
      'idle',
    ]);
    // Dash F's op 0x24 takes up within 5 ticks into High Jump (5, PC 203).
    const high = play(
      (t) =>
        t === 0
          ? { dash: true }
          : t === 30
            ? { axe: true }
            : t >= 6 && t < 9
              ? { jump: true }
              : {},
      { gap: 400 },
    );
    expect([high.mine, high.damage]).toEqual([
      [14, 5, 298, 303, 'land', 'idle'],
      15,
    ]);
  });

  it('stands in action 1, one of two stances by its roll (PC 13), or his EX stance (1 + 26) in EX mode (PC 2)', () => {
    const last = (ex: number, seed: number) => {
      const vm = new StandingVM(CHARACTERS.feng.idle, seed, 10, { 0x40: ex });
      for (let ticks = 0; !vm.ended && ticks < 400; ticks++) vm.tick();
      return vm.ended && vm.frame?.image;
    };
    const seeds = [0, 1, 2, 3, 4, 5, 6, 7];
    expect(new Set(seeds.map((seed) => last(0, seed)))).toEqual(
      new Set([115, 310]),
    );
    expect(new Set(seeds.map((seed) => last(100, seed)))).toEqual(
      new Set([494]),
    );
  });

  it('stands through his 198-tick Vs. intro from 開始時 BR + 4 (PC 363), turning EX with down at 128 (PC 393)', () => {
    expect([animationDuration('intro', 'feng'), FENG_INTRO_EX_TICK]).toEqual([
      198, 128,
    ]);
    for (const down of [false, true]) {
      const match = new Match('cpu', true, 0, ['feng', 'zoma']);
      const feng = match.fighters[0];
      const x = feng.x;
      for (let t = 0; feng.action === 'intro'; t++)
        match.step(down && t > 120 && t < 130 ? { crouch: true } : {});
      expect([feng.x, feng.variables[0] ?? 0]).toEqual([x, down ? 100 : 0]);
      // OP super Charge (47, PC 364) calls its RP a hundred times for 2
      // power each, two ticks apart: two stocks two ticks later.
      match.step({});
      match.step({});
      expect(feng.stock).toBe(2);
    }
  });

  it('wins holding image 431 (PC 734), fades out of his draw, and shows face 2001, cycling through 2006 in EX mode', () => {
    expect(
      [0, 80, 1000].map((age) => animationFrame('win', age, 'feng').image),
    ).toEqual([116, 429, 431]);
    expect(animationFrame('draw', 1000, 'feng').image).toBe(8191);
    expect(BLACK.feng.opaque.image).toBe(1009);
    expect([-1, 0, 40, 80, 120].map((face) => faceImage(face, 'feng'))).toEqual(
      [2001, 2002, 2006, 2000, 2006],
    );
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'feng']);
    const feng = match.fighters[1];
    const entered = new Set<unknown>();
    // CPU dash F, CPU DJ, CPU IORI and CPU KIKI shoot.
    const wanted = [423, 424, 425, 428];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (feng.action === 'script') entered.add(feng.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
