import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { enter } from './testing';

// MASA as player 1, `gap` from a standing opponent as player 2.
function masaPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['masa', opponent]);
  const [masa, other] = match.fighters;
  other.x = masa.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, masa, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: MASA's actions and the damage the
// opponent took.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { masa, other, steps } = masaPlayer(gap);
  masa.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(masa)) mine.push(now(masa));
  }
  return { masa, mine, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
// `key` at 0 and at each of `at`.
const again = (key: Input, ...at: number[]) =>
  presses(Object.fromEntries([0, ...at].map((t) => [t, key])));
const J = { punch: true };
const K = { kick: true };

describe('MASA (29 MASA.PLAYER)', () => {
  it('takes 450 life from his parameter block, desperate at 135', () => {
    expect([lifeOf('masa'), desperationOf('masa')]).toEqual([450, 135]);
    const { masa } = masaPlayer();
    expect(masa).toMatchObject({ who: 'masa', hp: 450, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.masa.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('masa')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.masa.aliases).toEqual({});
    // Thirty-seven after Ryuko's KOs, thirty-nine from KO DOWN, forty-seven
    // up to the shock, forty-six from Shock and forty-five past Chuck Hiso.
    expect(
      [59, 60, 62, 73, 88, 90, 128, 137, 140, 172].map((r) => twins[r]),
    ).toEqual([96, 97, 101, 120, 135, 136, 174, 183, 185, 217]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.masa.levels).toMatchObject({
      224: 21, // P1
      231: 21, // K Sit
      232: 21, // P Sit
      253: 31, // 3HIT1
      264: 31, // 3Fire Start
      273: 31, // Bando shot 1
      278: 31, // Shoryu1
      289: 41, // SCC FAR
      290: 41, // SCC Start
      304: 41, // RAMBU START
      340: 31, // SUNGOKU START
    });
    // K on the ground enters P1 too (entry 16).
    const { masa, steps } = masaPlayer();
    steps({}, 2);
    steps(K);
    expect(masa).toMatchObject({ action: 'script', branch: 224, age: 0 });
  });

  it('chains J or K through P1 hit into P2, then P3 or K3 (op 0x24)', () => {
    // P1 hit takes neutral J or K within 20 ticks at its age 8 (PCs
    // 2651–2652), P2 at its age 25 (PCs 2685–2686).
    expect(byKey(J)).toMatchObject({ mine: [224, 225, 'idle'], damage: 10 });
    expect(play(presses({ 0: J, 12: J }))).toMatchObject({
      mine: [224, 225, 226, 'idle'],
      damage: 25,
    });
    expect(play(presses({ 0: J, 12: J, 50: J }))).toMatchObject({
      mine: [224, 225, 226, 227, 'idle'],
      damage: 59,
    });
    expect(play(presses({ 0: K, 12: K, 50: K }))).toMatchObject({
      mine: [224, 225, 226, 229, '229+22', 'idle'],
      damage: 60,
    });
    // P Sit throws P bomb (233), which bounces along the floor.
    expect(
      play((t) => (t < 60 ? { crouch: true, punch: t === 5 } : {}), {
        gap: 300,
      }),
    ).toMatchObject({ mine: ['crouchEnter', 232, 'idle'], damage: 20 });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [244, 245, '246+31', 'idle'],
      damage: 40,
    });
  });

  it('follows SHORYU, 3HIT, 3Fire and BANDO BOX with their own commands', () => {
    for (const [key, gap, mine, damage] of [
      [{ drill: true }, 90, [278, 279, 'idle'], 19],
      [{ axe: true }, 90, [264, 'idle'], 15],
      [{ iori: true }, 90, [253, 'idle'], 16],
      [{ dst: true }, 500, [273, 'idle'], 21],
    ] as const)
      expect(byKey(key, { gap })).toMatchObject({ mine, damage });
    // Shoryu1 takes ↓ → J again at its ages 30, 35 and 40 (PCs 3905–3914);
    // its hits' stops hold its age back.
    expect(play(again({ drill: true }, 60))).toMatchObject({
      mine: [278, 280, 279, 'idle'],
      damage: 28,
    });
    // 3HIT1 and 3Hit2 take ↓ ← J (PCs 3253–3262, 3302–3311).
    expect(play(again({ iori: true }, 25, 50))).toMatchObject({
      mine: [253, 255, 257, 'idle'],
      damage: 50,
    });
    // 3Fire Start and 3fire Add2 take → with K (PCs 3504–3508, 3517–3523).
    expect(
      play((t) =>
        t === 0
          ? { axe: true }
          : t >= 30 && t < 42
            ? { right: true, kick: t === 35 }
            : {},
      ),
    ).toMatchObject({ mine: [264, 265, 266, 'idle'], damage: 45 });
    // Bando shot 1 and 2 take ↓ ← K (PCs 3823–3827, 3842–3844).
    expect(play(again({ dst: true }, 20, 50), { gap: 500 })).toMatchObject({
      mine: [273, 274, 275, 'idle'],
      damage: 42,
    });
  });

  it('spends a stock on RAMBU SUP and SCC, three on MESATSU, or enters No super', () => {
    for (const [key, gap, mine, damage, stock] of [
      ['getterBeam', 90, [304, 306, '307+5', '315+23', 'idle'], 127, 2],
      ['musashi', 90, [290, 292, 296, 298, 'idle'], 75, 2],
      ['musashi', 300, [289, 'idle'], 0, 2],
      ['changeAttack', 90, [340, 341, 'idle'], 200, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.masa.stock]).toEqual([
        mine,
        damage,
        stock,
      ]);
    }
    expect(byKey({ getterBeam: true }, { stock: 0 })).toMatchObject({
      mine: [284, 'idle'],
      damage: 0,
    });
    expect(byKey({ changeAttack: true }, { stock: 2 })).toMatchObject({
      mine: [284, 'idle'],
      damage: 0,
    });
  });

  it('cancels 3HIT, which sets variable 6 (PC 3233), into SCC or RAMBU SUP for two stocks', () => {
    for (const [key, mine, damage] of [
      ['musashi', [253, 287, 292, 296, 298, 'idle'], 83],
      ['getterBeam', [253, '287+5', 306, '307+5', '315+23', 'idle'], 135],
    ] as const) {
      const move = play(presses({ 0: { iori: true }, 20: { [key]: true } }));
      expect([move.mine, move.damage, move.masa.stock]).toEqual([
        mine,
        damage,
        1,
      ]);
    }
    // SC Super needs two stocks (PC 4096); MESATSU's level 31 is past the
    // window.
    expect(
      play(presses({ 0: { iori: true }, 20: { getterBeam: true } }), {
        stock: 1,
      }),
    ).toMatchObject({ mine: [253, 284, 'idle'] });
    expect(
      play(presses({ 0: { iori: true }, 20: { changeAttack: true } })),
    ).toMatchObject({ mine: [253, 'idle'], damage: 16 });
  });

  it('darkens the court through variable 13, which his Black (75) tests', () => {
    const { masa, steps } = masaPlayer();
    masa.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // SCC Start sets it at age 0 (PC 4138).
    expect(masa.variables[13]).toBe(100);
    const shown: string[] = [];
    while (masa.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(masa.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(shown.filter((s) => s === 'half')).toHaveLength(5);
    expect(BLACK.masa.opaque.image).toBe(1009);
  });

  it('charges two stocks through his Vs. intro, OP normal + 3 (PC 458)', () => {
    expect(animationDuration('intro', 'masa')).toBe(200);
    const match = new Match('cpu', true, 0, ['masa', 'zoma']);
    const masa = match.fighters[0];
    let ticks = 0;
    while (masa.action === 'intro') {
      match.step({});
      ticks++;
    }
    expect([ticks, masa.stock]).toEqual([200, 2]);
    expect(
      [0, 10, 20, 30, 33, 145, 150].map(
        (age) => animationFrame('intro', age, 'masa').image,
      ),
    ).toEqual([118, 448, 449, 450, 451, 447, 113]);
  });

  it('wins after DEMO STAND twice, looping images 450–451 (PC 891), and draws holding 122', () => {
    expect(
      [0, 52, 60, 70, 78, 81, 84, 2000, 2003].map(
        (age) => animationFrame('win', age, 'masa').image,
      ),
    ).toEqual([113, 447, 448, 449, 450, 451, 450, 450, 451]);
    expect(
      [0, 26, 52, 2000].map((age) => animationFrame('draw', age, 'masa').image),
    ).toEqual([113, 113, 122, 122]);
    expect(faceImage(-1, 'masa')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 4, ['ryuko', 'masa']);
    const masa = match.fighters[1];
    const entered = new Set<unknown>();
    // His CPU's own CPU 3Fire, CPU 3HIT and CPU SR, and SC Super's RAMBU
    // (287 + 5) out of CPU 3HIT 2 or 3, which set variable 6 (PCs 5823, 5868).
    const wanted = [401, 402, 406, '287+5'];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (masa.action === 'script') entered.add(masa.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });

  it("takes no reaction from REAR's Chuck OGI BALL (response 62), which Ryuko's has no rules for", () => {
    const match = new Match('practice', false, 5, ['rear', 'masa']);
    const [rear, masa] = match.fighters;
    masa.x = rear.x + 60;
    rear.stock = 3;
    match.step();
    enter(match, rear, 250);
    expect(() => {
      for (let t = 0; t < 3000; t++) match.step();
    }).not.toThrow();
    expect(masa.hp).toBeLessThan(450);
  });
});
