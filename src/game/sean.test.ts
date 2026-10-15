import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  SEAN_LANDING,
} from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { RYUKO, strike } from './testing';

// SEAN as player 1, `gap` from a standing opponent as player 2.
function seanPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['sean', opponent]);
  const [sean, other] = match.fighters;
  other.x = sean.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, sean, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until he is
// back on his feet: SEAN's actions, the opponent's, and the damage dealt.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    hp = 0,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { sean, other, steps } = seanPlayer(gap);
  sean.stock = stock;
  if (hp) sean.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(sean)) mine.push(now(sean));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
  }
  return { sean, other, mine, yours, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('SEAN (20 SEAN.PLAYER)', () => {
  it('takes 500 life from his parameter block, desperate at 150', () => {
    expect([lifeOf('sean'), desperationOf('sean')]).toEqual([500, 150]);
    const { sean } = seanPlayer();
    expect(sean).toMatchObject({ who: 'sean', hp: 500, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.sean.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('sean')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.sean.aliases).toEqual({});
    // One after Ryuko's KOs, five after her hits up to BEAM Stand, six from
    // BEAM air to SHOCK INFINITY, five from Shock, seven from Clothes off 500
    // (Fire HISA, 104), six past Chuck Hiso and seven from the guards.
    expect(
      [60, 73, 83, 84, 88, 90, 104, 140, 145, 149].map((r) => twins[r]),
    ).toEqual([61, 78, 88, 90, 94, 95, 111, 146, 151, 156]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.sean.levels).toMatchObject({
      185: 21, // P1
      204: 22, // KJ
      217: 31, // Dragon start
      229: 31, // CC start
      245: 41, // Super shoot start
      256: 41, // SCC start
      288: 42, // en300 START
    });
    const { sean, steps } = seanPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(sean).toMatchObject({ action: 'script', branch: 185, age: 0 });
  });

  it('chains J and K through P1 hit or k1 HIT and P2 or K2 (op 0x24, 20 ticks each)', () => {
    expect(
      play(
        presses({
          0: { punch: true },
          14: { punch: true },
          84: { punch: true },
        }),
      ),
    ).toMatchObject({ mine: [185, 186, 188, 190, 'idle'], damage: 47 });
    // K1 strikes at 24, so its hit's check (PC 2734) comes later.
    expect(
      play(
        presses({ 0: { kick: true }, 40: { kick: true }, 80: { kick: true } }),
      ),
    ).toMatchObject({ mine: [191, 192, 196, 198, 'idle'], damage: 60 });
  });

  it('plays his specials: Dragon, the two whips and CC', () => {
    for (const [key, gap, mine, damage] of [
      [{ drill: true }, 90, [217, 'idle'], 30],
      [{ axe: true }, 90, [224, 'idle'], 30],
      // Whip K calls its whips 270 source pixels out (PC 3254).
      [{ iori: true }, 90, [225, 'idle'], 0],
      [{ iori: true }, 600, [225, 'idle'], 30],
      // cc hit's test of variable 15 at 0 (PC 3348) skips its second 55.
      [{ dst: true }, 60, [229, 230, '230+27', 'idle'], 55],
    ] as const)
      expect(byKey(key, { gap })).toMatchObject({ mine, damage });
  });

  it("catches only an airborne opponent with CC start AIR's box (kind 0x58, PC 3385)", () => {
    const air = (theirs: (t: number) => Input) =>
      play(presses({ 0: { jump: true }, 40: { dst: true } }), {
        gap: 150,
        theirs,
      });
    // It drifts past a standing opponent and turns on landing.
    expect(air(() => ({}))).toMatchObject({
      mine: ['takeoff', 'jump', 232, 233, 'turn', 'idle'],
      damage: 0,
    });
    expect(air((t) => (t === 20 ? { jump: true } : {}))).toMatchObject({
      mine: ['takeoff', 'jump', 232, 234, 236, 'idle'],
      damage: 45,
    });
  });

  it('spends a stock on SCC and S shoot, three on en300, or enters No super (238)', () => {
    for (const [key, stock, gap, mine, damage, left] of [
      ['musashi', 3, 90, [256, 259, 263, 'idle'], 90, 2],
      // Its probe box steps 60 source pixels every 2 ticks, each step's hit
      // handler naming a farther SCC hit (PCs 3720–3755).
      ['musashi', 3, 400, [256, 270, 271, 'idle'], 90, 2],
      ['changeAttack', 3, 400, [245, 'idle'], 84, 2],
      ['getterBeam', 3, 90, [288, 'idle'], 223, 0],
      ['getterBeam', 2, 90, [238, 'idle'], 0, 2],
      ['musashi', 0, 90, [238, 'idle'], 0, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { stock, gap });
      expect([move.mine, move.damage, move.sean.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    // At 150 life or less, Super shoot start enters EVIL SHOOT START (op
    // 0x11, PC 3579).
    expect(byKey({ changeAttack: true }, { hp: 140 })).toMatchObject({
      mine: [249, 'idle'],
      damage: 100,
    });
  });

  it("cancels Dragon into SCC or S shoot through SC SUPER (241), for two stocks in all, as Dragon's variable 6 at 100 allows (PCs 3575, 3699)", () => {
    const cancel = (key: Input, stock = 3) =>
      play(presses({ 0: { drill: true }, 15: key }), { stock });
    expect(cancel({ changeAttack: true })).toMatchObject({
      mine: [217, 241, 'idle'],
      damage: 114,
    });
    expect(cancel({ musashi: true })).toMatchObject({
      mine: [217, '241+5', 260, 'idle'],
      damage: 120,
    });
    expect(cancel({ musashi: true }).sean.stock).toBe(1);
    expect(cancel({ musashi: true }, 2).sean.stock).toBe(0);
    // Dragon's window (PC 3126) takes levels 40 and 41, not en300's 42.
    expect(cancel({ getterBeam: true })).toMatchObject({
      mine: [217, 'idle'],
      damage: 30,
    });
  });

  it('rolls his jump hit (82, PC 883), which Ryuko’s lacks', () => {
    const branches = new Set<unknown>();
    for (let seed = 0; seed < 20; seed++) {
      const match = new Match('practice', false, seed, ['ryuko', 'sean']);
      const [ryuko, sean] = match.fighters;
      sean.x = ryuko.x + 120;
      ryuko.y = -60;
      strike(match, ryuko, RYUKO.airPunch);
      match.step();
      match.step();
      expect(sean.action).toBe('jumpHit');
      branches.add(sean.branch);
    }
    expect(branches).toEqual(new Set([null, '82+25']));
  });

  it('rises out of sight and falls into his 200-tick Vs. intro, landing at 164 (PC 390)', () => {
    expect([animationDuration('intro', 'sean'), SEAN_LANDING]).toEqual([
      200, 164,
    ]);
    const match = new Match('cpu', true, 0, ['sean', 'zoma']);
    const sean = match.fighters[0];
    const x = sean.x;
    const heights: number[] = [];
    while (sean.action === 'intro') {
      match.step({});
      heights.push(sean.y);
    }
    // 800 source pixels up after four ticks, back down on the 164th.
    expect(Math.min(...heights)).toBeCloseTo(-1199.341, 3);
    expect([heights[162] < 0, heights[163], sean.x]).toEqual([true, 0, x]);
    // OP super Charge (41, PC 373), spawned four ticks in, calls its RP a
    // hundred times for 2 power each, two ticks apart: two stocks three
    // ticks after the intro.
    match.step({});
    match.step({});
    expect(sean.stock).toBe(1);
    match.step({});
    expect(sean.stock).toBe(2);
  });

  it('wins looping images 243 and 244 (PC 623), vanishes out of his draw, and shows face 2001', () => {
    expect(
      [0, 125, 133, 141, 149, 1000, 1008].map(
        (age) => animationFrame('win', age, 'sean').image,
      ),
    ).toEqual([115, 122, 243, 244, 243, 243, 244]);
    expect(animationFrame('draw', 1000, 'sean').image).toBe(8191);
    expect(BLACK.sean.opaque.image).toBe(1009);
    expect(faceImage(-1, 'sean')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'sean']);
    const sean = match.fighters[1];
    const entered = new Set<unknown>();
    // CPU D, and CPU DJ into High Jump (5).
    const wanted = [350, 351, 5];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (sean.action === 'script') entered.add(sean.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
