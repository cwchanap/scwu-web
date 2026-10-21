import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';

// SHIN-Z as player 1, `gap` from a standing Ryuko as player 2.
function shinzPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['shinz', 'ryuko']);
  const [shinz, other] = match.fighters;
  other.x = shinz.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, shinz, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { shinz, other, steps } = shinzPlayer(gap);
  shinz.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(shinz)) mine.push(now(shinz));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: shinz.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('SHIN-Z (34 SHIN-Z.PLAYER)', () => {
  it('takes 800 life from his parameter block, desperate at 240', () => {
    expect([lifeOf('shinz'), desperationOf('shinz')]).toEqual([800, 240]);
    const { shinz } = shinzPlayer();
    expect(shinz).toMatchObject({ who: 'shinz', hp: 800, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.shinz.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('shinz')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.shinz.aliases).toEqual({});
    // Nine after Ryuko's KOs, fourteen for the light hits, fifteen to the
    // shock, fourteen from Shock, thirteen past Chuck Hiso, fourteen from
    // the get-up, and his guards one after another from 164.
    expect(
      [59, 60, 62, 73, 75, 88, 90, 128, 140, 145, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([68, 69, 71, 87, 90, 103, 104, 142, 153, 159, 164, 165, 177]);
    // Down Get up takes 30 ticks either way its roll goes (PC 2013).
    expect(animationDuration('getUp', 'shinz')).toBe(30);
  });

  it("reads his command table; Hit Up's entry names nothing", () => {
    expect(CHARACTERS.shinz.levels).toMatchObject({
      181: 21, // P
      182: 22, // K
      184: 21, // PJ
      188: 22, // K J
      192: 21, // Chuck
      196: 31, // SHIN Z FIRE
      201: 31, // Shin SAMA K start
      204: 40, // SHIN SAMA K AIR
      209: 31, // SHIN RE START
      219: 31, // Shin GIGA
      224: 31, // GAISA START
      227: 41, // KAISA SUPER start
      236: 41, // akuma special start
      249: 41, // SUPER GIGA PRESS
    });
    expect(byKey({ hitUp: true })).toEqual({
      mine: ['idle'],
      damage: 0,
      stock: 3,
    });
  });

  it('strikes twice with P, once with K, standing or crouching, and throws', () => {
    // P's box (kind 3, PC 2223) re-arms at each of its two displays.
    expect(byKey({ punch: true })).toMatchObject({
      mine: [181, 'idle'],
      damage: 30,
    });
    expect(byKey({ punch: true, crouch: true })).toMatchObject({
      mine: [181, 'idle'],
      damage: 30,
    });
    expect(byKey({ kick: true })).toMatchObject({
      mine: [182, 'idle'],
      damage: 25,
    });
    // Chuck hit's op 0x15 (PC 2434).
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [192, 193, 'idle'],
      damage: 45,
    });
  });

  it('cancels P into K and the buttons into specials through their windows (op 0x1e, PCs 2215, 2234)', () => {
    // K pressed in P's first stop (13 to 27, Ryuko's reaction stepping
    // first), or after its second.
    expect(
      play(presses({ 0: { punch: true }, 24: { kick: true } })),
    ).toMatchObject({ mine: [181, 182, 'idle'], damage: 40 });
    expect(
      play(presses({ 0: { punch: true }, 50: { kick: true } })),
    ).toMatchObject({ mine: [181, 182, 'idle'], damage: 55 });
    expect(
      play(presses({ 0: { punch: true }, 10: { drill: true } })),
    ).toMatchObject({ mine: [181, 201, 203, 'idle'], damage: 55 });
    expect(
      play(presses({ 0: { kick: true }, 10: { axe: true } })),
    ).toMatchObject({ mine: [182, 196, 'idle'], damage: 65 });
    // SAMA's window (PC 2559) takes KAISA SUPER (level 41).
    expect(
      play(presses({ 0: { drill: true }, 10: { getterBeam: true } })),
    ).toEqual({ mine: [201, 227, 'idle'], damage: 120, stock: 2 });
  });

  it('kicks in the air, and punches as P J 2 after a double jump (variable 1, PC 2266)', () => {
    expect(
      play(presses({ 0: { jump: true }, 20: { kick: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 188, 'land', 'idle'],
      damage: 25,
    });
    expect(
      play(
        presses({ 0: { jump: true }, 25: { jump: true }, 40: { punch: true } }),
      ).mine,
    ).toEqual(['takeoff', 'jump', 11, 187, 'land', 'idle']);
  });

  it('carries the opponent to the wall in her own Chuck ShinZ', () => {
    // Shin GIGA's hit applies response 75 (op 0x14, PCs 2952, 2956), Ryuko's
    // Chuck ShinZ (142), which flies her back at raw 1250 (PC 1941).
    const { other, steps } = shinzPlayer();
    steps({}, 2);
    const hers: unknown[] = [];
    for (let t = 0; t < 500; t++) {
      steps(t ? {} : { iori: true });
      if (hers.at(-1) !== now(other)) hers.push(now(other));
    }
    expect(hers.slice(0, 4)).toEqual([
      'idle',
      'rushAirHit',
      142,
      'flySideWall',
    ]);
  });

  it('plays SAMA, Fire BALL, GIGA, REFLACT and GAISA', () => {
    for (const [key, gap, mine, damage] of [
      ['drill', 90, [201, 203, 'idle'], 40],
      ['axe', 90, [196, 'idle'], 40],
      ['axe', 500, [196, 'idle'], 40],
      // Shin GIGA dashes at raw 1250 into its hit and wall (PC 3016).
      ['iori', 90, [219, 220, 221, 'idle'], 46],
      ['iori', 500, [219, 220, 221, 'idle'], 46],
      ['dst', 90, [209, 210, 'idle'], 45],
      ['dst', 400, [209, 'idle'], 0],
      // GAISA START fires *Gaisa LV2 (228, PC 3054) at no cost.
      ['ex', 90, [224, 'idle'], 60],
      ['ex', 300, [224, 'idle'], 60],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toEqual({
        mine,
        damage,
        stock: 3,
      });
    // In the air, SAMA again within 50 ticks (op 0x24, PC 2652) adds Shin
    // SAMA K air add (206).
    expect(
      play(
        presses({
          0: { jump: true },
          10: { drill: true },
          40: { drill: true },
        }),
        { gap: 300 },
      ),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 204, 206, 203, 'idle'],
      damage: 110,
    });
  });

  it("turns a projectile back with REFLACT: 技名5's box meets it 1908 pixels down (PC 2883)", () => {
    const match = new Match('practice', false, 3, ['zoma', 'shinz']);
    const [zoma, shinz] = match.fighters;
    shinz.x = zoma.x + 600;
    match.step({}, {});
    match.step({}, {});
    const mine: unknown[] = [];
    for (let t = 0; t < 600; t++) {
      match.step(t ? {} : { axe: true }, t === 20 ? { dst: true } : {});
      if (mine.at(-1) !== now(shinz)) mine.push(now(shinz));
    }
    // 技名6 (216) sets variable 4 (PC 2889), whose test (PCs 2750–2765)
    // enters Shin ref success (212): ***SHIN REFLACT's 55 (214, PC 2810).
    expect([mine, shinz.hp, zoma.hp]).toEqual([
      ['idle', 209, 212, 'idle'],
      800,
      490 - 55,
    ]);
  });

  it('spends a stock on KAISA SUPER and SGIGA, three on AKUMA SP, or enters No super', () => {
    for (const gap of [90, 300])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [227, 'idle'],
        damage: 100,
        stock: 2,
      });
    expect(byKey({ musashi: true })).toEqual({
      mine: [249, 253, 256, 'turn', 'idle'],
      damage: 121,
      stock: 2,
    });
    // akuma special start needs more than two (PC 3234).
    for (const gap of [90, 400])
      expect(byKey({ changeAttack: true }, { gap })).toEqual({
        mine: [236, 237, '243+33', '243+39', '243+45', 'idle'],
        damage: 250,
        stock: 0,
      });
    const { shinz, steps } = shinzPlayer();
    shinz.stock = 2;
    steps({}, 2);
    steps({ changeAttack: true });
    // No super calls its 6-tick rp five times (PC 3466), then gains 10 (PC
    // 3467).
    steps({}, 29);
    expect([shinz.branch, shinz.age, shinz.power, shinz.stock]).toEqual([
      246, 29, 0, 2,
    ]);
    steps({});
    expect(shinz.power).toBe(10);
  });

  it('darkens the court through variable 14, which his Black (50) tests', () => {
    const { shinz, steps } = shinzPlayer();
    shinz.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // SUPER GIGA PRESS sets it at age 0 (PC 3477).
    expect(shinz.variables[14]).toBe(100);
    const shown: string[] = [];
    while (shinz.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(shinz.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.shinz.opaque.image).toBe(1011);
  });

  it('charges five stocks through his Vs. intro, 開始時 BR + 3 (PC 338)', () => {
    expect(animationDuration('intro', 'shinz')).toBe(258);
    const match = new Match('cpu', true, 0, ['shinz', 'zoma']);
    const shinz = match.fighters[0];
    let ticks = 0;
    while (shinz.action === 'intro') {
      match.step({});
      ticks++;
    }
    // OP super Charge (46) clears his power and adds 500 (PCs 521–522):
    // five of his six stocks (+0x7cb2).
    expect([ticks, shinz.stock]).toEqual([258, 5]);
    // Round 1 (34) + 2 (PC 342).
    expect(
      [0, 159, 160, 170, 178, 257].map(
        (age) => animationFrame('intro', age, 'shinz').image,
      ),
    ).toEqual([183, 183, 177, 176, 175, 175]);
  });

  it('wins after DEMO stand, looping image 319 (PC 701), and draws holding 236', () => {
    // The loop ends 勝ち's clip before its darkened display (PC 703).
    expect(
      new Set(
        Array.from(
          { length: 400 },
          (_, age) => animationFrame('win', age * 5, 'shinz').image,
        ),
      ),
    ).toEqual(new Set([319]));
    expect(
      [0, 149, 150, 2000].map(
        (age) => animationFrame('draw', age, 'shinz').image,
      ),
    ).toEqual([319, 319, 236, 236]);
    expect(faceImage(-1, 'shinz')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His CPU's own CPU DASH J and AKUMA SP, and CPU J CUT into Shin SAMA K
    // air add (PC 4243).
    for (const [seed, wanted] of [
      [4, [318, 236]],
      [6, [319, 206]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'shinz']);
      const shinz = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 3000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (shinz.action === 'script') entered.add(shinz.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
