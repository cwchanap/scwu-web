import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { fighterPose, Match } from './match';
import type { Fighter, Input } from './match';
import { base, brIntro } from './testing';

// Z-MEGA as player 1, `gap` from a standing Ryuko as player 2.
function zmegaPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['zmega', 'ryuko']);
  const [zmega, other] = match.fighters;
  other.x = zmega.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, zmega, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks, as Z-MEGA or Shin Z: his actions, the
// damage Ryuko took and his stock.
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, shin = false } = {},
) {
  const { zmega, other, steps } = zmegaPlayer(gap);
  zmega.stock = stock;
  if (shin) zmega.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(zmega)) mine.push(now(zmega));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: zmega.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('Z-MEGA (32 Z-MEGA.PLAYER)', () => {
  it('takes 350 life from his parameter block, desperate at 105', () => {
    expect([lifeOf('zmega'), desperationOf('zmega')]).toEqual([350, 105]);
    const { zmega } = zmegaPlayer();
    expect(zmega).toMatchObject({ who: 'zmega', hp: 350, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.zmega.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('zmega')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.zmega.aliases).toEqual({});
    // Eight after Ryuko's KOs, twelve up to the heavy air hit, thirteen to
    // the shock, twelve from Shock, eleven past Chuck Hiso, twelve from the
    // get-up, and his guards one after another from 162.
    expect(
      [59, 60, 62, 73, 77, 88, 90, 128, 140, 145, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([67, 68, 70, 85, 90, 101, 102, 140, 151, 157, 162, 163, 175]);
  });

  it("reads his command table; Hit Up's entry names nothing", () => {
    expect(CHARACTERS.zmega.levels).toMatchObject({
      179: 21, // P
      180: 22, // K
      182: 21, // PJ
      186: 22, // K J
      190: 21, // Chuck
      194: 31, // TO SHIN
      207: 31, // Fire start
      213: 31, // SAMA START
      216: 39, // SAMA AIR
      228: 31, // Reflact start
      245: 31, // GIGA Start
      255: 41, // GAISA START
      282: 41, // akuma special start
      296: 41, // SUPER GIGA PRESS
    });
    expect(byKey({ hitUp: true })).toEqual({
      mine: ['idle'],
      damage: 0,
      stock: 3,
    });
  });

  it('strikes twice with P, once with K, and throws', () => {
    // P's box (kind 3, PC 2147) re-arms at each of its two displays.
    expect(byKey({ punch: true })).toMatchObject({
      mine: [179, 'idle'],
      damage: 30,
    });
    expect(byKey({ kick: true })).toMatchObject({
      mine: [180, 'idle'],
      damage: 25,
    });
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [190, 191, 'idle'],
      damage: 45,
    });
  });

  it('plays SAMA, Fire BALL, GIGA and REFLACT', () => {
    for (const [key, gap, mine, damage] of [
      ['drill', 90, [213, 215, 'idle'], 50],
      // *Fire ball 01 strikes 25 into ***ball hit (201, slot 2), which
      // clears its landing handler (0x40e510), so it doesn't bounce on.
      ['axe', 90, [207, 'idle'], 25],
      ['axe', 500, [207, 'idle'], 25],
      // GIGA Start dashes at raw 850 into GIGA HIT and its wall (PC 3641).
      ['iori', 90, [245, 246, 247, 'idle'], 41],
      ['iori', 500, [245, 246, 247, 'idle'], 41],
      ['dst', 90, [228, 227, 'idle'], 35],
      ['dst', 400, [228, 'idle'], 0],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toMatchObject({ mine, damage });
  });

  it('carries the opponent to the wall in her own Chuck Zmega', () => {
    // GIGA HIT applies response 74 (op 0x14, PCs 3651, 3653), Ryuko's Chuck
    // Zmega (141), which flies her back at raw 850 (PC 1921) beside him
    // until the wall enters fly side wall hit (95, slot 4, PC 1920).
    const { other, steps } = zmegaPlayer();
    steps({}, 2);
    const hers: unknown[] = [];
    for (let t = 0; t < 400; t++) {
      steps(t ? {} : { iori: true });
      if (hers.at(-1) !== now(other)) hers.push(now(other));
    }
    expect(hers).toEqual([
      'idle',
      'rushAirHit',
      141,
      'flySideWall',
      'launchAway',
      'knockdown',
      'getUp',
      'idle',
    ]);
  });

  it('catches a projectile with REFLACT, whose return fizzles on it', () => {
    const match = new Match('practice', false, 3, ['zoma', 'zmega']);
    const [zoma, zmega] = match.fighters;
    zmega.x = zoma.x + 450;
    match.step({}, {});
    match.step({}, {});
    const mine: unknown[] = [];
    const clips: unknown[] = [];
    for (let t = 0; t < 400; t++) {
      match.step(t ? {} : { axe: true }, t ? {} : { dst: true });
      if (mine.at(-1) !== now(zmega)) mine.push(now(zmega));
      for (const e of match.effects)
        if (e.owner === 1 && !clips.includes(e.clip)) clips.push(e.clip);
    }
    // *Refl obj (230) meets FIRE BALL CALL 2000 pixels down, entering
    // Reflact Success (232), but *Reflact fire ball's slot-1 box sits 1964
    // down (PC 3370), so it strikes the caught ball, which an object's strike
    // leaves flying (0x40f36a), and fizzles into **re hit (235).
    expect([mine, clips, zoma.hp, zmega.hp]).toEqual([
      [228, 232, 'idle'],
      [230, 233, 235],
      490,
      350,
    ]);
  });

  it('spends a stock on SGIGA, three on AKUMA SP, or enters No super', () => {
    expect(byKey({ musashi: true })).toEqual({
      mine: [296, 301, 307, 'turn', 'idle'],
      damage: 101,
      stock: 2,
    });
    // akuma special start needs more than two (PC 4428).
    for (const gap of [90, 400])
      expect(byKey({ changeAttack: true }, { gap })).toEqual({
        mine: [282, 283, '289+33', '289+39', '289+45', 'idle'],
        damage: 250,
        stock: 0,
      });
    expect(byKey({ changeAttack: true }, { stock: 2 })).toEqual({
      mine: [293, 'idle'],
      damage: 0,
      stock: 2,
    });
  });

  it('fires GAISA at the level P meets (op 0x24), or collapses into his get-up', () => {
    const gaisa = (at: number) =>
      play(presses({ 0: { getterBeam: true }, [at]: { punch: true } }), {
        gap: 300,
      });
    // GAISA LV1 (256), LEVEL 2 (259) and LV3 (263) each check P through
    // their displays (op 0x24, PCs 3850–3856, 3917–3935, 4026–4048).
    expect(gaisa(40)).toEqual({
      mine: [255, 258, 'idle'],
      damage: 10,
      stock: 2,
    });
    expect(gaisa(100)).toEqual({
      mine: [255, 262, 'idle'],
      damage: 84,
      stock: 2,
    });
    expect(gaisa(160)).toEqual({
      mine: [255, 266, 'idle'],
      damage: 100,
      stock: 2,
    });
    // GAISA FINAL ends in his Down Get up (157) + 5 (PC 4137): 30 ticks
    // either way its roll goes.
    expect(gaisa(250)).toEqual({
      mine: [255, 'getUp', 'idle'],
      damage: 0,
      stock: 2,
    });
    expect(animationDuration('getUp', 'zmega')).toBe(30);
  });

  it('turns into Shin Z, whose drain takes a life every 10 ticks for 15 power', () => {
    const { match, zmega, steps } = zmegaPlayer(300);
    steps({}, 2);
    // TO SHIN (194) sets variable 0 (PC 2380) and spawns OBJ TO SHIN (195)
    // in slot 5 (PC 2382), which calls its drain pass on and on (PCs 2390–
    // 2393).
    steps({ ex: true });
    expect([zmega.branch, zmega.variables[0]]).toEqual([194, 100]);
    steps({}, 100);
    expect([zmega.action, zmega.hp, zmega.stock, zmega.power]).toEqual([
      'idle',
      340,
      1,
      50,
    ]);
    let ticks = 100;
    while (zmega.hp) {
      steps({});
      ticks++;
    }
    // Empty, he's KO'd, and his lose action deletes the drain (PC 637).
    expect([ticks, zmega.action]).toEqual([3491, 'down']);
    expect(match.effects.some((e) => e.owner === 0 && e.slot === 5)).toBe(
      false,
    );
  });

  it("holds Shin Z's drain through the freeze, and at 1 life while his chuck holds", () => {
    const { match, zmega, other, steps } = zmegaPlayer(300);
    steps({}, 2);
    steps({ ex: true });
    steps({}, 100);
    const drain = () =>
      match.effects.find((e) => e.owner === 0 && e.slot === 5)?.clip;
    // Each pass's op 0x1f on global 6 (PC 2398) holds its display while
    // the freeze runs.
    match.freeze = 60;
    steps({}, 50);
    expect([zmega.hp, zmega.power]).toEqual([340, 50]);
    // Chuck hit (191) sets variable 3 to 30 (PC 2320), so the pass's check
    // (PC 2394) enters OBJ TO SHIN HP0 (196), whose op 0x11 skips the
    // drain at 1 life (PC 2422), until the throw clears it (PC 2359).
    other.x = zmega.x + 60;
    zmega.hp = 3;
    steps({ throw: true });
    steps({}, 20);
    expect([zmega.branch, zmega.hp, base(drain()!)]).toEqual([191, 1, 196]);
    let held = 20;
    while (zmega.variables[3]) {
      steps({});
      held++;
    }
    expect([zmega.branch, zmega.hp, held]).toEqual([191, 1, 171]);
    // HP0's check of variable 3 for 0 (PC 2421) returns into the drain.
    steps({});
    expect([zmega.action, zmega.hp, drain()]).toEqual(['down', 0, undefined]);
  });

  it("plays Shin Z's own moves while variable 0 is 100", () => {
    for (const [key, gap, mine, damage] of [
      ['drill', 90, [219, 221, 'idle'], 40],
      ['axe', 500, [209, 'idle'], 40],
      ['iori', 500, [250, 251, 252, 'idle'], 46],
      ['dst', 90, [237, 227, 'idle'], 45],
      ['musashi', 90, [297, 302, 309, 'turn', 'idle'], 121],
      [
        'changeAttack',
        90,
        [281, 283, '289+33', '289+39', '289+45', 'idle'],
        250,
      ],
    ] as const)
      expect(byKey({ [key]: true }, { gap, shin: true })).toMatchObject({
        mine,
        damage,
      });
    // GAIZA SZ (269) skips a level (PCs 4164, 4183).
    expect(
      play(presses({ 0: { getterBeam: true }, 60: { punch: true } }), {
        gap: 300,
        shin: true,
      }),
    ).toEqual({ mine: [269, 262, 'idle'], damage: 84, stock: 2 });
  });

  it("takes 250 with Shin Z's AKUMA short of stock, which jumps into AKUMA 2 (PC 4382)", () => {
    // AKUMA FIN's op 0x15 (PC 4613) needs no contact.
    expect(
      byKey({ changeAttack: true }, { gap: 600, stock: 0, shin: true }),
    ).toEqual({
      mine: [286, '289+33', '289+39', '289+45', 'idle'],
      damage: 250,
      stock: 0,
    });
  });

  it('turns back with TO NORMAL, whose object empties his power every tick', () => {
    const { zmega, steps } = zmegaPlayer(300);
    steps({}, 2);
    steps({ ex: true });
    steps({}, 300);
    // 450 power from the drain: four of his five stocks (+0x7cb2).
    expect([zmega.variables[0], zmega.stock]).toEqual([100, 4]);
    // TO SHIN enters TO NORMAL (198) while variable 0 is 100 (PC 2376),
    // which clears it (PC 2457) and spawns OBJ TO NORMAL (199) over the
    // drain: it takes 1000 power each tick (PC 2467).
    steps({ ex: true });
    steps({});
    expect([zmega.branch, zmega.variables[0], zmega.stock]).toEqual([
      198, 0, 0,
    ]);
    const hp = zmega.hp;
    steps({}, 1000);
    expect([zmega.hp, zmega.stock, zmega.power]).toEqual([hp, 0, 0]);
  });

  it('darkens the court through variable 14, which his Black (52) tests', () => {
    const { zmega, steps } = zmegaPlayer();
    zmega.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // SUPER GIGA PRESS sets it at age 0 (PC 4668).
    expect(zmega.variables[14]).toBe(100);
    const shown: string[] = [];
    while (zmega.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(zmega.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(shown.filter((s) => s === 'half')).toHaveLength(5);
    expect(BLACK.zmega.opaque.image).toBe(1011);
  });

  it('charges four stocks through his Vs. intro, 開始時 BR + 3 (PC 404)', () => {
    expect(animationDuration('35+3', 'zmega')).toBe(258);
    // OP super Charge (48) clears his power and adds 400 (PCs 479–480):
    // four of his five stocks (+0x7cb2).
    const { path, ticks, f } = brIntro('zmega');
    expect([path, ticks, f.stock]).toEqual([[33, '35+3'], 260, 4]);
    // Round 1 (36) + 2 (PC 407).
    expect(
      [0, 159, 160, 170, 178, 257].map(
        (age) => animationFrame('35+3', age, 'zmega').image,
      ),
    ).toEqual([183, 183, 177, 176, 175, 175]);
  });

  it('wins after DEMO stand, looping image 319 (PC 626), and draws looping 201', () => {
    expect(
      [0, 8, 16, 66, 71, 121, 129, 2000].map(
        (age) => animationFrame('win', age, 'zmega').image,
      ),
    ).toEqual([115, 116, 117, 116, 115, 116, 319, 319]);
    expect(
      [0, 120, 121, 2000].map(
        (age) => animationFrame('draw', age, 'zmega').image,
      ),
    ).toEqual([115, 115, 201, 201]);
    expect(faceImage(-1, 'zmega')).toBe(2001);
    // In Shin form the draw's DEMO stand (PC 716) tests variable 0 for 100
    // (PC 342) into DEMO stand sp (31): image 319 for 100 ticks.
    const { zmega } = zmegaPlayer();
    Object.assign(zmega, { action: 'draw', variables: { 0: 100 } });
    expect(
      [0, 99, 100, 2000].map((age) => fighterPose({ ...zmega, age }).image),
    ).toEqual([319, 319, 201, 201]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'zmega']);
    const zmega = match.fighters[1];
    const entered = new Set<unknown>();
    // His CPU's own Cpu dash, CPU DASH J and CPU KAISA, whose GAISA fires
    // its second level (262).
    const wanted = [371, 372, 373, 262];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (zmega.action === 'script') entered.add(zmega.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
