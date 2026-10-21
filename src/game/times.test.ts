import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';

// 3-TIMES as player 1, `gap` from a standing Ryuko as player 2.
function timesPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['times', 'ryuko']);
  const [times, other] = match.fighters;
  other.x = times.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, times, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: 3-TIMES's actions, the damage Ryuko
// took and his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { times, other, steps } = timesPlayer(gap);
  times.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(times)) mine.push(now(times));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: times.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('3-TIMES (30 3-TIMES.PLAYER)', () => {
  it('takes 400 life from his parameter block, desperate at 120', () => {
    expect([lifeOf('times'), desperationOf('times')]).toEqual([400, 120]);
    const { times } = timesPlayer();
    expect(times).toMatchObject({ who: 'times', hp: 400, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.times.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('times')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.times.aliases).toEqual({});
    // Thirty-six after Ryuko's KOs, thirty-eight from KO DOWN, forty-four up
    // to the shock, forty-three from Shock, forty-two past Chuck Hiso, and
    // his guards one after another from 191.
    expect(
      [59, 60, 62, 73, 88, 90, 128, 137, 140, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([95, 96, 100, 117, 132, 133, 171, 180, 182, 191, 192, 204]);
  });

  it("reads his command table: Chuck enters HP, and Hit Up's entry names nothing", () => {
    expect(CHARACTERS.times.levels).toMatchObject({
      208: 21, // LP
      210: 22, // HP
      211: 21, // K
      214: 21, // P J
      215: 22, // K J
      221: 31, // DASH P
      226: 31, // FIRE START
      233: 31, // SHORYU START
      238: 41, // Super boom start
      252: 41, // RAMBU START
      268: 42, // SUNGOKU START
    });
    expect(byKey({ throw: true })).toEqual({
      mine: [210, 'idle'],
      damage: 20,
      stock: 3,
    });
    expect(byKey({ hitUp: true })).toEqual({
      mine: ['idle'],
      damage: 0,
      stock: 3,
    });
  });

  it('jabs three times, lobs a bomb and cancels through op 0x1e windows', () => {
    // LP's three jabs strike 7, 5 and 2 (PCs 2348, 2357, 2367).
    expect(byKey({ punch: true })).toMatchObject({
      mine: [208, 'idle'],
      damage: 14,
    });
    // K's bomb (212) bounces along the floor to a far opponent.
    for (const gap of [90, 400])
      expect(byKey({ kick: true }, { gap })).toMatchObject({
        mine: [211, 'idle'],
        damage: 15,
      });
    // LP's window takes level 22 and up (PC 2337), HP's 30 (PC 2387).
    expect(
      play(presses({ 0: { punch: true }, 5: { throw: true } })),
    ).toMatchObject({ mine: [208, 210, 'idle'], damage: 27 });
    expect(
      play(presses({ 0: { punch: true }, 5: { axe: true } })),
    ).toMatchObject({
      mine: [208, 226, 'idle'],
      damage: 32,
    });
    expect(
      play(presses({ 0: { throw: true }, 20: { axe: true } })),
    ).toMatchObject({ mine: [210, 226, 'idle'], damage: 45 });
  });

  it('plays SHORYU, FIRE and DASH P, whose two shadows strike too', () => {
    for (const [key, gap, mine] of [
      ['drill', 90, [233, 'idle']],
      ['axe', 90, [226, 'idle']],
      ['axe', 400, [226, 'idle']],
      ['iori', 90, [221, 'idle']],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toMatchObject({
        mine,
        damage: 25,
      });
  });

  it('spends a stock on Rambu and SB, three on MESATSU, or enters No super', () => {
    for (const [key, gap, mine, damage, stock] of [
      ['getterBeam', 90, [252, 253, 254, 264, 'idle'], 124, 2],
      // SB's bombs arc over a near opponent.
      ['musashi', 90, [238, 'idle'], 0, 2],
      ['musashi', 400, [238, 'idle'], 90, 2],
      ['changeAttack', 90, [268, 269, 'idle'], 200, 0],
      ['changeAttack', 400, [268, 269, 'idle'], 200, 0],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toEqual({ mine, damage, stock });
    expect(byKey({ getterBeam: true }, { stock: 0 })).toMatchObject({
      mine: [235, 'idle'],
      damage: 0,
    });
    // MESATSU needs three (PC 3729).
    expect(byKey({ changeAttack: true }, { stock: 2 })).toEqual({
      mine: [235, 'idle'],
      damage: 0,
      stock: 2,
    });
  });

  it('cancels DASH P into Rambu or MESATSU through its window (PC 2651)', () => {
    expect(
      play(presses({ 0: { iori: true }, 30: { getterBeam: true } })),
    ).toEqual({
      mine: [221, 252, 253, 254, 264, 'idle'],
      damage: 149,
      stock: 2,
    });
    expect(
      play(presses({ 0: { iori: true }, 30: { changeAttack: true } })),
    ).toEqual({ mine: [221, 268, 269, 'idle'], damage: 220, stock: 0 });
  });

  it('runs on from DASH F while forward is held (op 0x16, PCs 117–129)', () => {
    const { mine } = play((t) => (t < 60 ? { dash: true, right: true } : {}));
    expect(mine.slice(0, 5)).toEqual([11, '11+10', '11+14', '11+18', '11+10']);
    expect(mine.at(-1)).toBe('idle');
    // ↑ within its op 0x24 checks (PCs 116, 120, ...) leaps into high jump (6).
    expect(
      play((t) => (t < 30 ? { dash: true, right: true, jump: t === 20 } : {}))
        .mine,
    ).toEqual(expect.arrayContaining([11, 6, 'land', 'idle']));
  });

  it('darkens the court through variable 13, which his Black (75) tests', () => {
    const { times, steps } = timesPlayer();
    times.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // Super boom start sets it at age 0 (PC 2926).
    expect(times.variables[13]).toBe(100);
    const shown: string[] = [];
    while (times.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(times.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(shown.filter((s) => s === 'half')).toHaveLength(5);
    expect(BLACK.times.opaque.image).toBe(1009);
  });

  it('charges two stocks through his Vs. intro, OP normal + 2 (PC 374)', () => {
    expect(animationDuration('intro', 'times')).toBe(208);
    const match = new Match('cpu', true, 0, ['times', 'zoma']);
    const times = match.fighters[0];
    let ticks = 0;
    while (times.action === 'intro') {
      match.step({});
      ticks++;
    }
    expect([ticks, times.stock]).toEqual([208, 2]);
    // A 26-tick fade in, then DEMO STAND seven times (PC 525).
    expect(
      [0, 10, 23, 26, 36, 49, 207].map(
        (age) => animationFrame('intro', age, 'times').image,
      ),
    ).toEqual([113, 114, 115, 113, 114, 115, 115]);
  });

  it('wins after DEMO STAND twice, looping his stance (PC 792), and draws holding 122', () => {
    expect(
      [0, 52, 62, 75, 78, 88, 101, 104, 2000].map(
        (age) => animationFrame('win', age, 'times').image,
      ),
    ).toEqual([113, 113, 114, 115, 113, 114, 115, 113, 115]);
    expect(
      [0, 26, 52, 2000].map(
        (age) => animationFrame('draw', age, 'times').image,
      ),
    ).toEqual([113, 113, 122, 122]);
    expect(faceImage(-1, 'times')).toBe(2001);
  });

  it('picks his win voice by its chain of rolls (PCs 770–788), then takes his stance (94 + 22)', () => {
    const voices = [0, 1, 2, 3, 4, 5].map((seed) => {
      const match = new Match('practice', false, seed, ['times', 'ryuko']);
      const [times, ryuko] = match.fighters;
      ryuko.hp = 0;
      ryuko.action = 'koLand';
      match.winner = 'player';
      const cued: [number, number][] = [];
      for (let t = 0; t < 120; t++) {
        match.step();
        for (const { owner, index } of match.sounds)
          if (owner === 0) cued.push([t, index]);
      }
      return [cued, times.branch];
    });
    // Each roll falls through to its sound or branches on to the next; the
    // last branches to 30 (PC 788). Rolled, his stance plays from its own
    // records.
    expect(voices).toEqual([
      [[[52, 25]], '94+22'],
      [[[52, 27]], '94+22'],
      [[[52, 28]], '94+22'],
      [[[52, 24]], '94+22'],
      [[[52, 23]], null],
      [[[52, 23]], null],
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const entered = new Set<unknown>();
    // His CPU's own cpu dash and cpu dash jump, and ---cpu---'s MESATSU.
    const wanted = [327, 328, 268];
    for (const seed of [2, 10]) {
      const match = new Match('cpu', false, seed, ['ryuko', 'times']);
      const times = match.fighters[1];
      for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (times.action === 'script') entered.add(times.branch);
      }
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
