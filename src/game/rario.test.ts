import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  desperationOf,
  lifeOf,
  perStockOf,
  responsesOf,
  stocksOf,
} from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage, FIGHT_TICK } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// RARIO as player 1, `gap` from Ryuko as player 2.
function rarioPlayer(gap = 90, seed = 3) {
  const match = new Match('practice', false, seed, ['rario', 'ryuko']);
  const [rario, other] = match.fighters;
  other.x = rario.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, rario, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`: his actions, the damage Ryuko took, his stock, power
// and life.
function play(
  at: (t: number) => Input,
  { gap = 120, stock = 3, ticks = 1500, seed = 3, hp = 450 } = {},
) {
  const { rario, other, steps } = rarioPlayer(gap, seed);
  rario.stock = stock;
  rario.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(rario)) mine.push(now(rario));
  }
  return {
    mine,
    damage: lifeOf('ryuko') - other.hp,
    stock: rario.stock,
    power: rario.power,
    hp: rario.hp,
  };
}
type Options = Parameters<typeof play>[1];
const byKey = (key: Input, options: Options = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('RARIO (47 RARIO.PLAYER)', () => {
  it('takes 450 life and three stocks of 100 from his parameter block', () => {
    expect([lifeOf('rario'), desperationOf('rario')]).toEqual([450, 135]);
    expect([perStockOf('rario'), stocksOf('rario')]).toEqual([100, 3]);
    expect(rarioPlayer().rario).toMatchObject({
      who: 'rario',
      hp: 450,
      action: 'idle',
    });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.rario.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('rario')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.rario.aliases).toEqual({});
    // Eight before Ryuko's KOs, seven before her hits, eight from her Shock
    // rp, seven from FLY NO HIT, three from her Chuck GON MISS, four from her
    // Chuck Yo, fourteen before her DOWN section, and his guards from 141.
    expect(
      [
        59, 60, 61, 62, 73, 88, 90, 96, 97, 136, 137, 140, 143, 145, 147, 149,
        172,
      ].map((r) => twins[r]),
    ).toEqual([
      51, 52, 53, 54, 66, 81, 82, 88, 90, 129, 134, 136, 139, 131, 133, 141,
      154,
    ]);
  });

  it('enters each command at its level', () => {
    // No Jump 2, Hit Up or Chuck entry names an action.
    expect(CHARACTERS.rario.levels).toEqual({
      10: 30, // Dash F
      11: 10, // Dash B
      158: 21, // P
      159: 22, // K
      160: 21, // P J
      161: 21, // K J
      163: 31, // Fire ball
      168: 31, // Shoryu start
      186: 31, // Tatumaki start
      193: 41, // shinkuhado start
      200: 41, // Shinshoryu start
    });
  });

  it('punches and kicks, P chaining into K or a special', () => {
    expect(byKey({ punch: true })).toMatchObject({
      mine: [158, 'idle'],
      damage: 18,
    });
    // K's second box (kind 0x8b, PC 1783) skips a reeling victim.
    expect(byKey({ kick: true })).toMatchObject({
      mine: [159, 'idle'],
      damage: 15,
    });
    // P's window takes levels 22–50 (PC 1753), K's only 30–50 (PC 1770).
    // P strikes at 13 and Ryuko's reaction, stepping first (struck, 0x4f),
    // stops him to 27, so a button press counts from 20.
    expect(
      play(presses({ 0: { punch: true }, 24: { kick: true } })),
    ).toMatchObject({ mine: [158, 159, 'idle'], damage: 33 });
    expect(
      play(presses({ 0: { kick: true }, 12: { punch: true } })).mine,
    ).toEqual([159, 'idle']);
    expect(
      play(presses({ 0: { punch: true }, 12: { drill: true } })),
    ).toMatchObject({ mine: [158, 163, 'idle'], damage: 48 });
    expect(byKey({ dash: true }, { gap: 400 }).mine).toEqual([10, 'idle']);
    expect(byKey({ dash: true, left: true }).mine).toEqual([11, 'idle']);
    // His Hit Up and Chuck entries name no action.
    expect(byKey({ hitUp: true }).mine).toEqual(['idle']);
    expect(byKey({ throw: true }).mine).toEqual(['idle']);
  });

  it('strikes in the air, with no double jump', () => {
    expect(
      play(presses({ 0: { jump: true }, 30: { punch: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 160, 'land', 'idle'],
      damage: 15,
    });
    expect(
      play(presses({ 0: { jump: true }, 30: { kick: true } })).mine,
    ).toEqual(['takeoff', 'jump', 161, 'land', 'idle']);
    expect(
      play(presses({ 0: { jump: true }, 20: {}, 21: { jump: true } })).mine,
    ).toEqual(['takeoff', 'jump', 'land', 'idle']);
  });

  it('throws a bouncing fireball, one at a time', () => {
    expect(byKey({ drill: true })).toMatchObject({
      mine: [163, 'idle'],
      damage: 30,
    });
    // Its hit handler (slot 2) enters Nothing (268), which clears its
    // landing handler (0x40e510), so one struck on the way down falls on
    // without bouncing into a second hit.
    expect(byKey({ drill: true }, { gap: 477 })).toMatchObject({
      mine: [163, 'idle'],
      damage: 30,
    });
    // fire (164) lands into fire bunce (165, slot 1), which hops on.
    const { match, steps } = rarioPlayer(500);
    steps({ drill: true });
    const clips = new Set<unknown>();
    for (let t = 0; t < 200; t++) {
      steps({});
      for (const e of match.effects) clips.add(e.clip);
    }
    expect([164, 165, 166].every((c) => clips.has(c))).toBe(true);
    // While it flies in slot 0, HADO enters P instead (PC 1829).
    expect(
      play(presses({ 0: { drill: true }, 66: { drill: true } }), {
        gap: 800,
      }).mine,
    ).toEqual([163, 'idle', 158, 'idle']);
  });

  it('knocks a block loose with his Shoryu, which drops a coin or an item', () => {
    expect(byKey({ axe: true })).toMatchObject({
      mine: [168, 169, 'idle'],
      damage: 35,
    });
    // RANDON OBJ (171) rolls rand % 5 > 1 for the coin (PC 2020), which
    // adds 2 life and 10 power (PC 2027); else the mushroom, the poison
    // mushroom or the 1UP, whose responses (65–67) have no reaction here.
    const items = [0, 4, 5].map((seed) => {
      const { match, rario, steps } = rarioPlayer(300, seed);
      rario.hp = 400;
      steps({}, 2);
      steps({ axe: true });
      const clips = new Set<unknown>();
      for (let t = 0; t < 600; t++) {
        steps({});
        for (const e of match.effects) clips.add(e.clip);
      }
      return [[172, 173, 177, 181].filter((c) => clips.has(c)), rario.hp];
    });
    expect(items).toEqual([
      [[], 402],
      [[177], 400],
      [[181], 400],
    ]);
  });

  it("lands his mushrooms in the opponent's own grow, YARA and 1UP", () => {
    // From 500 pixels a mushroom lands and slides into Ryuko: the poison
    // one (177) names her 'RARIO YARA' (response 66, 116), which takes 29
    // (PC 1519), and the 1UP (181) her 'RARIO 1UP' (67, 117), which gives 50
    // life and 100 power (PC 1539) with no display; each box takes 1.
    const items = [4, 5].map((seed) => {
      const { rario, other, steps } = rarioPlayer(500, seed);
      other.hp = 300;
      steps({}, 2);
      const hers: unknown[] = [];
      for (let t = 0; t < 600; t++) {
        steps(t ? {} : { axe: true });
        if (hers.at(-1) !== now(other)) hers.push(now(other));
      }
      return [hers, other.hp, other.stock, rario.hp];
    });
    expect(items).toEqual([
      [['idle', 116, 'idle'], 270, 0, 450],
      [['idle'], 349, 1, 450],
    ]);
  });

  it('spins up and over with his Tatumaki', () => {
    expect(byKey({ iori: true })).toMatchObject({
      mine: [186, '186+17', 'idle'],
      damage: 36,
    });
  });

  it('spends his stocks on his supers', () => {
    expect(byKey({ getterBeam: true })).toMatchObject({
      mine: [193, 194, 'idle'],
      damage: 84,
      stock: 2,
    });
    // Shin Shoryu grabs (PC 2516), stomps the opponent seven times and five
    // more for 1UPs, then takes 200 life (PCs 2768–2773) and flies to the
    // flagpole.
    expect(byKey({ musashi: true })).toMatchObject({
      mine: [200, 202, '215+28', 218, 'idle'],
      damage: 200,
      stock: 1,
    });
    // It takes two stocks (PC 2474), or enters No super, which adds 10
    // power (PC 2328).
    expect(byKey({ musashi: true }, { stock: 1 })).toMatchObject({
      mine: [190, 'idle'],
      damage: 0,
      stock: 1,
      power: 10,
    });
  });

  it('darkens the court through variable 14, which his Black (36) tests', () => {
    const { rario, steps } = rarioPlayer();
    rario.stock = 3;
    steps({}, 2);
    steps({ getterBeam: true });
    expect(rario.variables[14]).toBe(100);
    expect(BLACK.rario.opaque.image).toBe(1011);
  });

  it('jumps straight up when knocked out and sinks through the floor', () => {
    const match = new Match('practice', false, 3, ['ryuko', 'rario']);
    const [ryuko, rario] = match.fighters;
    rario.x = ryuko.x + 90;
    rario.hp = 1;
    match.step({}, {});
    match.step({}, {});
    let launchX = 0;
    let peak = 0;
    let landed = 0;
    for (let t = 0; t < 400; t++) {
      match.step(t ? {} : { punch: true }, {});
      if (rario.action === 'down' && rario.age === 14) launchX = rario.x;
      peak = Math.min(peak, rario.y);
      if (rario.action === 'koLand' && !landed) landed = t;
    }
    // KO NORMAL launches at raw 0/−1820, gravity 90 (PC 487); KO down has no
    // slide (PC 508) and shows image 207 lower each 2 ticks, then 8191.
    expect([landed, rario.x - launchX]).toEqual([129, 0]);
    expect(peak).toBeCloseTo(-446.245, 3);
    expect(animationDuration('koLand', 'rario')).toBe(66);
    expect(
      [0, 15, 16, 1000].map(
        (age) => animationFrame('koLand', age, 'rario').image,
      ),
    ).toEqual([207, 207, 8191, 8191]);
  });

  it('hops twice through his Vs. intro, charging two stocks', () => {
    const { path, ticks, f, heights, images } = brIntro('rario');
    // 開始時 BR's 50-tick display comes first, as KGT 13's global 14 keeps
    // it (PC 229). The second hop's fall passes the floor on its 56th move,
    // and the landing (0x41187f) enters Round 1 + 19 (slot 1, PC 250) a tick
    // later.
    expect([path, ticks, f.stock, f.y]).toEqual([[24, 26, '27+19'], 252, 2, 0]);
    expect([heights[225] > 0, heights[226]]).toEqual([true, 0]);
    // After 開始時's (24) blank display and that display: Round 1's crouch,
    // the hop, the hang, the second hop's wait for landing, then Round 1 +
    // 19.
    expect([51, 75, 95, 170, 225, 226, 236].map((t) => images[t])).toEqual([
      220, 223, 224, 169, 169, 139, 140,
    ]);
  });

  it('wins after Demo stand, looping three poses, and draws holding image 227', () => {
    expect(animationDuration('win', 'rario')).toBe(135);
    expect(
      [0, 55, 63, 87, 95, 103, 134, 1000].map(
        (age) => animationFrame('win', age, 'rario').image,
      ),
    ).toEqual([115, 225, 226, 229, 228, 227, 228, 227]);
    expect(animationDuration('draw', 'rario')).toBe(87);
    expect(
      [0, 55, 63, 71, 1000].map(
        (age) => animationFrame('draw', age, 'rario').image,
      ),
    ).toEqual([115, 225, 226, 227, 227]);
    // Action 63's face (PC 584).
    expect(faceImage(-1, 'rario')).toBe(2001);
  });

  it('stands through his idle program', () => {
    const vm = new StandingVM(CHARACTERS.rario.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([115, 116, 117, 118, 119, 118, 117, 116]);
  });

  it('comes back at full life after a TEAM VS win below 180: his Team VS 1P 270 jumps to itself (PC 350)', () => {
    const next = (life: number) => {
      const match = Match.team(
        [
          ['rario', 'ryuko'],
          ['ryuko', 'ryuko'],
        ],
        'court',
      );
      while (match.roundTicks <= FIGHT_TICK) match.step();
      match.fighters[0].hp = life;
      match.fighters[1].hp = 0;
      while (match.round === 1) match.step();
      while (match.roundTicks <= FIGHT_TICK) match.step();
      return match.fighters[0].hp;
    };
    // 1P WIN's global 8 (KGT PC 251) runs his checker down Team VS 1P 360
    // and 270 (39, 40) by his life. 270 sets global 8 to 3 at 180 or more
    // (PC 351), for 270 the next round, but below it jumps to itself (PC
    // 350), spinning out the step's 300 records, and the engine deletes it
    // (0x413b7b): global 8 stays 1, for full life.
    expect([next(200), next(150)]).toEqual([270, 450]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const wanted = [158, 159, 160, 163, 168, 186, 193, 200];
    const entered = new Set<unknown>();
    for (const seed of [1, 2]) {
      const match = new Match('cpu', true, seed, ['ryuko', 'rario']);
      const rario = match.fighters[1];
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (rario.action === 'script') entered.add(rario.branch);
      }
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
