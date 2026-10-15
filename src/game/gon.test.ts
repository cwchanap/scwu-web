import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  GON_LANDING,
} from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';

// GON as player 1, `gap` from a standing opponent as player 2.
function gonPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['gon', opponent]);
  const [gon, other] = match.fighters;
  other.x = gon.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, gon, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until he is
// back on his feet: GON's actions, the opponent's, and the damage each took.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    hp = 0,
    ex = false,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { gon, other, steps } = gonPlayer(gap);
  gon.stock = stock;
  if (hp) gon.hp = hp;
  if (ex) gon.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(gon)) mine.push(now(gon));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
  }
  return {
    gon,
    mine,
    yours,
    damage: lifeOf('ryuko') - other.hp,
    taken: (hp || lifeOf('gon')) - gon.hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('GON (21 GON.PLAYER)', () => {
  it('takes 470 life from his parameter block, desperate at 141', () => {
    expect([lifeOf('gon'), desperationOf('gon')]).toEqual([470, 141]);
    const { gon } = gonPlayer();
    expect(gon).toMatchObject({ who: 'gon', hp: 470, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.gon.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('gon')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (134, 135)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 93, 134],
      [77, 91, 135],
    ]);
    expect(CHARACTERS.gon.aliases).toEqual({ 134: 79, 135: 77 });
    // Ten after Ryuko's KOs, thirteen after her first hits, fourteen from
    // the heavy air hit to SHOCK INFINITY, thirteen from Shock, fifteen from
    // Pull Back and fourteen past Chuck Hiso.
    expect(
      [60, 73, 76, 88, 90, 120, 121, 137, 140, 149].map((r) => twins[r]),
    ).toEqual([70, 86, 90, 102, 103, 133, 136, 152, 154, 163]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.gon.levels).toMatchObject({
      192: 21, // P1
      229: 22, // K J
      275: 31, // dragon starat
      292: 31, // counter start
      363: 41, // super shoot start
      376: 41, // KUREN start
      425: 42, // EN300 New Graphic
      446: 42, // Hidden en300
    });
    const { gon, steps } = gonPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(gon).toMatchObject({ action: 'script', branch: 192, age: 0 });
  });

  it('chains J and K through P1 hit or K1 hit into P2 or K2, then P3 (op 0x24)', () => {
    expect(
      play(
        presses({
          0: { punch: true },
          14: { punch: true },
          60: { punch: true },
        }),
      ),
    ).toMatchObject({ mine: [192, 193, 194, 200, 201, 'idle'], damage: 72 });
    expect(
      play(
        presses({
          0: { punch: true },
          14: { kick: true },
          40: { punch: true },
        }),
      ),
    ).toMatchObject({ mine: [192, 193, 215, 200, 201, 'idle'], damage: 62 });
    // K1 strikes at 18, so its hit's check comes later.
    expect(
      play(presses({ 0: { kick: true }, 40: { kick: true } })),
    ).toMatchObject({ mine: [209, 210, 215, 'idle'], damage: 35 });
    // At 141 life or less, K2 enters Evil K2 (op 0x11, PC 3071).
    expect(
      play(presses({ 0: { kick: true }, 40: { kick: true } }), { hp: 140 }),
    ).toMatchObject({ mine: [209, 210, 216, 'idle'], damage: 35 });
  });

  it('plays his specials: DRAGON, DRILL and fire ball, and AIR FIRE', () => {
    for (const [key, gap, mine, damage] of [
      [{ drill: true }, 90, [275, 277, 'idle'], 20],
      [{ iori: true }, 90, [325, 'idle'], 32],
      [{ axe: true }, 90, [256, 'idle'], 38],
    ] as const)
      expect(byKey(key, { gap })).toMatchObject({ mine, damage });
    expect(
      play(presses({ 0: { jump: true }, 30: { axe: true } }), { gap: 150 }),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 341, 345, 'idle'],
      damage: 25,
    });
  });

  it('follows a whiffed DRAGON into Evil Dragon: its op 0x24 (PC 4203) still sees the command that started it', () => {
    expect(byKey({ drill: true }, { gap: 300 })).toMatchObject({
      mine: [275, 270, 273, 274, 'idle'],
      damage: 20,
    });
  });

  it("counters through his reactions' tests of variable 4 at 100, 200 and 300 (PCs 914–916)", () => {
    const counter = (key: Input, at: number, ex = false) =>
      play(presses({ 0: key }), {
        ex,
        gap: 120,
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    // COUNTER holds 100 (PC 4516) for Counter get (293); its 200% body
    // takes Ryuko's 10 as 20 (PC 4518).
    expect(counter({ dst: true }, 30)).toMatchObject({
      mine: [292, 293, 295, '299+25', 'idle'],
      damage: 40,
      taken: 20,
    });
    // PC 4526 has cleared it: an ordinary hit, 120%.
    expect(counter({ dst: true }, 70)).toMatchObject({
      mine: [292, 'hit', 'idle'],
      damage: 0,
      taken: 12,
    });
    // KURENCOUNTER holds 200 (PC 6091) for KUREN GET (384).
    expect(counter({ musashi: true }, 50)).toMatchObject({
      mine: [376, 384, '384+37', 'idle'],
      damage: 140,
    });
    // EX short Counter holds 300 (PC 5399) for >>EX IORI3-2 GET (264).
    expect(counter({ iori: true }, 10, true)).toMatchObject({
      mine: [338, 264, 'idle'],
      damage: 48,
    });
  });

  it('spends a stock on KUREN and Super heart, three on EN300, or enters No super (352)', () => {
    for (const [key, stock, mine, damage, left] of [
      ['musashi', 3, [376, 'idle'], 15, 2],
      ['getterBeam', 3, [425, '425+39', 'idle'], 205, 0],
      ['changeAttack', 3, [363, 'idle'], 90, 2],
      ['changeAttack', 0, [352, 'idle'], 0, 0],
      ['getterBeam', 2, [352, 'idle'], 0, 2],
    ] as const) {
      const move = byKey({ [key]: true }, { stock });
      expect([move.mine, move.damage, move.gon.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    // The hidden en300 is a Chuck at 141 life or more (op 0x11, PC 7543).
    expect(byKey({ blackRush: true })).toMatchObject({
      mine: [241, 242, 'idle'],
      damage: 40,
    });
    const hidden = byKey({ blackRush: true }, { hp: 140 });
    expect([hidden.mine, hidden.damage, hidden.gon.stock]).toEqual([
      [446, 455, 'idle'],
      250,
      0,
    ]);
  });

  it("cancels DRILL into Super heart or KURENCOUNTER through SC SUPER (355), for two stocks, as DRILL's variable 6 at 100 allows (PCs 5089, 5725, 6083)", () => {
    const cancel = (key: Input) =>
      play(presses({ 0: { iori: true }, 15: key }));
    const heart = cancel({ changeAttack: true });
    expect([heart.mine, heart.damage, heart.gon.stock]).toEqual([
      [325, 355, 'idle'],
      98,
      1,
    ]);
    expect(cancel({ musashi: true })).toMatchObject({
      mine: [325, '355+5', 387, '384+37', 'idle'],
      damage: 118,
    });
    // DRILL's window takes level 41, not EN300's 42.
    expect(cancel({ getterBeam: true })).toMatchObject({
      mine: [325, 'idle'],
      damage: 32,
    });
  });

  it('turns to EX for a stock (Type to EX, 247), where his moves take their EX forms', () => {
    const type = byKey({ ex: true });
    expect([type.mine, type.gon.stock, type.gon.variables[0]]).toEqual([
      [247, 'idle'],
      2,
      100,
    ]);
    for (const [key, gap, mine, damage] of [
      [{ kick: true }, 90, [211, 212, 213, 'idle'], 12],
      [{ drill: true }, 90, [280, 277, 'idle'], 36],
      [{ dst: true }, 90, [309, 314, 'idle'], 40],
      // EX Heart flies 256 source pixels before it strikes (PCs 5774–5806).
      [{ changeAttack: true }, 90, [372, 'idle'], 0],
      [{ changeAttack: true }, 300, [372, 'idle'], 50],
    ] as const)
      expect(byKey(key, { gap, ex: true })).toMatchObject({ mine, damage });
  });

  it('leaps into his 200-tick Vs. intro, landing at 180 (PC 451), and turns to EX with down held as he lands (PC 466)', () => {
    expect([animationDuration('intro', 'gon'), GON_LANDING]).toEqual([
      200, 180,
    ]);
    for (const crouch of [false, true]) {
      const match = new Match('cpu', true, 0, ['gon', 'zoma']);
      const gon = match.fighters[0];
      const x = gon.x;
      const heights: number[] = [];
      while (gon.action === 'intro') {
        match.step(crouch ? { crouch: true } : {});
        heights.push(gon.y);
      }
      // 265 source pixels up at the peak, back down on the 180th step.
      expect(Math.min(...heights)).toBeCloseTo(-397.641, 3);
      expect([heights[178] < 0, heights[179], gon.x]).toEqual([true, 0, x]);
      expect(gon.variables[0] ?? 0).toBe(crouch ? 100 : 0);
      // OP super Charge (44, PC 436) charges two stocks within it.
      expect(gon.stock).toBe(2);
    }
  });

  it('wins looping images 620–623 (PC 707), holds his draw, and shows face 2001 or the EX cycle', () => {
    expect(
      [0, 83, 103, 111, 119, 127, 135, 1000, 1008].map(
        (age) => animationFrame('win', age, 'gon').image,
      ),
    ).toEqual([115, 619, 620, 621, 622, 623, 620, 620, 621]);
    expect(animationFrame('draw', 1000, 'gon').image).toBe(653);
    expect(BLACK.gon.opaque.image).toBe(1009);
    expect([-1, 0, 40, 80, 120].map((face) => faceImage(face, 'gon'))).toEqual([
      2001, 2002, 2006, 2000, 2006,
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'gon']);
    const gon = match.fighters[1];
    const entered = new Set<unknown>();
    // CPU D, CPU DJ into High Jump (7), CPU DRill and CPU Dra.
    const wanted = [517, 518, 7, 519, 521];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (gon.action === 'script') entered.add(gon.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
