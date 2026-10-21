import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// GOLF as player 1, `gap` from a standing Ryuko as player 2.
function golfPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['golf', 'ryuko']);
  const [golf, other] = match.fighters;
  other.x = golf.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, golf, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 2 } = {}) {
  const { golf, other, steps } = golfPlayer(gap);
  golf.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 1500; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(golf)) mine.push(now(golf));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: golf.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('GOLF (37 GOLF.PLAYER)', () => {
  it('takes 300 life from his parameter block, desperate at 90', () => {
    expect([lifeOf('golf'), desperationOf('golf')]).toEqual([300, 90]);
    const { golf } = golfPlayer();
    expect(golf).toMatchObject({ who: 'golf', hp: 300, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.golf.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('golf')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.golf.aliases).toEqual({});
    // Thirteen before ZAKU's KOs, twenty-eight before his light hits,
    // twenty-nine to Clothes off500, twenty-eight from Fire Hisa, and
    // twenty-seven past the empty 129.
    expect(
      [59, 60, 73, 74, 75, 88, 104, 128, 140, 145, 149, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([45, 46, 59, 60, 61, 74, 90, 114, 125, 131, 135, 148]);
    // Ryuko's Down Get up; ZAKU's guards.
    expect(animationDuration('getUp', 'golf')).toBe(30);
    expect(animationDuration('blockHeavy', 'golf')).toBe(32);
    // GIANT!! MUSIC ATTACK calls its displays five times a pass (PC 1396).
    expect(animationDuration('musicAttack', 'golf')).toBe(50);
    expect(animationDuration('musicAttack', 'ryuko')).toBe(10);
  });

  it('reads his command table; Hit Up, Chuck and Jump 2 name nothing', () => {
    expect(CHARACTERS.golf.levels).toEqual({
      11: 0, // Dash F
      12: 10, // Dash Back
      152: 21, // P
      153: 22, // K
      154: 21, // PJ
      155: 22, // KJ
      157: 31, // sp p
      160: 31, // SP K
      162: 41, // super p
      223: 0, // cpu dash
      224: 0, // cpu dash jump
    });
    for (const key of [{ hitUp: true }, { throw: true }])
      expect(byKey(key, { gap: 60 })).toEqual({
        mine: ['idle'],
        damage: 0,
        stock: 2,
      });
  });

  it('slashes twice with P, standing or crouching, lashes with K, and strikes PJ or KJ in the air', () => {
    for (const key of [{ punch: true }, { punch: true, crouch: true }])
      expect(byKey(key)).toEqual({ mine: [152, 'idle'], damage: 15, stock: 2 });
    // K's box (kind 3, PC 1753) re-arms at each of its three displays.
    for (const gap of [90, 350])
      expect(byKey({ kick: true }, { gap })).toEqual({
        mine: [153, 'idle'],
        damage: 18,
        stock: 2,
      });
    expect(play(presses({ 0: { jump: true }, 50: { punch: true } }))).toEqual({
      mine: ['takeoff', 'jump', 154, 'land', 'idle'],
      damage: 12,
      stock: 2,
    });
    expect(play(presses({ 0: { jump: true }, 30: { kick: true } }))).toEqual({
      mine: ['takeoff', 'jump', 155, 'land', 'idle'],
      damage: 12,
      stock: 2,
    });
  });

  it('dashes in four slashes with sp p, and lashes low then high with SP K', () => {
    // sp p runs into sp p 2 (158, PC 1838).
    for (const gap of [90, 300])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [157, 'idle'],
        damage: 30,
        stock: 2,
      });
    // Its second lash (response 53) pulls Ryuko past him in Chain pull back,
    // so he turns.
    expect(byKey({ axe: true })).toEqual({
      mine: [160, 'turn', 'idle'],
      damage: 30,
      stock: 2,
    });
  });

  it('cancels on a hit through his windows (op 0x1e, PCs 1711, 1742, 1807, 1871)', () => {
    expect(play(presses({ 0: { punch: true }, 30: { kick: true } }))).toEqual({
      mine: [152, 153, 'idle'],
      damage: 25,
      stock: 2,
    });
    expect(play(presses({ 0: { punch: true }, 25: { drill: true } }))).toEqual({
      mine: [152, 157, 'idle'],
      damage: 37,
      stock: 2,
    });
    expect(
      play(presses({ 0: { kick: true }, 30: { getterBeam: true } })),
    ).toEqual({ mine: [153, 162, 'idle'], damage: 86, stock: 1 });
    expect(
      play(presses({ 0: { drill: true }, 40: { getterBeam: true } })),
    ).toEqual({ mine: [157, 162, 'idle'], damage: 87, stock: 1 });
    expect(
      play(presses({ 0: { punch: true }, 25: { drill: true } }), { gap: 700 })
        .mine,
    ).toEqual([152, 'idle']);
  });

  it('spends a stock on super p, or enters No super', () => {
    // sp p rp three times (PC 1921), then super p fin (PC 1922).
    for (const gap of [90, 300])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [162, 'idle'],
        damage: 80,
        stock: 1,
      });
    expect(byKey({ getterBeam: true }, { stock: 0 })).toEqual({
      mine: [167, 'idle'],
      damage: 0,
      stock: 0,
    });
  });

  it('darkens the court through variable 14, which his Black (43) tests', () => {
    const { golf, steps } = golfPlayer();
    golf.stock = 2;
    steps({}, 2);
    steps({ getterBeam: true });
    // super p sets it at age 0 (PC 1900).
    expect(golf.variables[14]).toBe(100);
    const shown: string[] = [];
    while (golf.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(golf.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.golf.opaque.image).toBe(1011);
  });

  it('runs on while → is held, into a high jump on ↑, and hops back', () => {
    // Dash F's op 0x16 checks (PCs 121–139) loop it while → is held, and its
    // op 0x24s enter High Jump (6) on ↑.
    expect(
      play((t) => (t < 100 ? { right: true, dash: true } : {}), { gap: 600 })
        .mine,
    ).toEqual([
      11,
      '11+10',
      '11+14',
      '11+18',
      '11+24',
      '11+10',
      '11+14',
      '11+18',
      '11+24',
      '11+10',
      '11+14',
      'idle',
    ]);
    expect(
      play(
        (t) =>
          t === 0
            ? { dash: true }
            : t < 20
              ? { right: true }
              : t < 30
                ? { right: true, jump: true }
                : {},
        { gap: 900 },
      ).mine,
    ).toEqual([11, '11+10', 6, 'land', 'idle']);
    expect(byKey({ dash: true, left: true }, { gap: 300 }).mine).toEqual([
      12,
      13,
      'idle',
    ]);
  });

  it('charges two stocks through his Vs. intro, 開始時 BR (28)', () => {
    expect(animationDuration('intro', 'golf')).toBe(271);
    const match = new Match('cpu', true, 0, ['golf', 'zoma']);
    const golf = match.fighters[0];
    let ticks = 0;
    while (golf.action === 'intro') {
      match.step({});
      ticks++;
    }
    expect([ticks, golf.stock]).toEqual([271, 2]);
    // Round 1 (29) shows nothing for 50 ticks, then fades his stance in (PCs
    // 245–261) and calls demo act three times (PC 262).
    expect(
      [0, 49, 50, 68, 80, 98, 106, 270].map(
        (age) => animationFrame('intro', age, 'golf').image,
      ),
    ).toEqual([0, 0, 113, 114, 115, 114, 113, 114]);
  });

  it('wins after a demo act, looping a single call of it (PCs 393–394), and draws looping it', () => {
    expect(animationDuration('win', 'golf')).toBe(165);
    expect(
      [0, 18, 29, 47, 55, 110, 165, 1000].map(
        (age) => animationFrame('win', age, 'golf').image,
      ),
    ).toEqual([113, 114, 115, 114, 113, 113, 113, 113]);
    expect(
      [0, 18, 29, 47, 55, 1000].map(
        (age) => animationFrame('draw', age, 'golf').image,
      ),
    ).toEqual([113, 114, 115, 114, 113, 113]);
    expect(faceImage(-1, 'golf')).toBe(2001);
  });

  it('stands through his idle program until it ends (PC 15)', () => {
    const vm = new StandingVM(CHARACTERS.golf.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([113, 114, 115, 114]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His CPU's own cpu dash, and cpu dash jump, which runs into his high
    // jump (PC 2460).
    for (const [seed, wanted] of [
      [24, [160, 157, 223, 162, 224]],
      [9, [162, 224, 223, '155+11']],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'golf']);
      const golf = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (golf.action === 'script') entered.add(golf.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
