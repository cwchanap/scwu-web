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
import { faceImage, gaugeCrop } from './hud';
import { addPower, Match } from './match';
import type { Fighter, Input } from './match';
import { CharacterSelect, StoryDemo } from './select';
import type { Demo } from './select';
import { StandingVM } from './standing';
import { scenarioOf } from './story';
import type { Battle } from './story';

// DoraEmon as player 1, `gap` from Ryuko as player 2.
function doraPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['dora', 'ryuko']);
  const [dora, other] = match.fighters;
  other.x = dora.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, dora, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took,
// his stock and power.
function play(
  at: (t: number) => Input,
  { gap = 120, stock = 5, ticks = 1500 } = {},
) {
  const { dora, other, steps } = doraPlayer(gap);
  dora.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(dora)) mine.push(now(dora));
  }
  return {
    mine,
    damage: lifeOf('ryuko') - other.hp,
    stock: dora.stock,
    power: dora.power,
  };
}
type Options = Parameters<typeof play>[1];
const byKey = (key: Input, options: Options = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('DoraEmon (46 B6.PLAYER)', () => {
  it('takes 600 life and five stocks of 90 power from his parameter block', () => {
    expect([lifeOf('dora'), desperationOf('dora')]).toEqual([600, 180]);
    expect([perStockOf('dora'), stocksOf('dora')]).toEqual([90, 5]);
    const { dora } = doraPlayer();
    expect(dora).toMatchObject({ who: 'dora', hp: 600, action: 'idle' });
    // 0x40e6f0 carries each 90 into a stock, up to five.
    addPower(dora, 95);
    expect([dora.stock, dora.power]).toEqual([1, 5]);
    addPower(dora, 1000);
    expect([dora.stock, dora.power]).toEqual([5, 0]);
    // The gauge draws power × 126 / 90 pixels (0x40de1b).
    expect(gaugeCrop(45, perStockOf('dora'))).toEqual({ x: 63, width: 63 });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.dora.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('dora')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.dora.aliases).toEqual({});
    // His lose action, KO NORMAL, its 2nd and KO down; then 25 after Ryuko's
    // hits, 24 from her DOWN, 23 from her Shock rp, 22 from her Chuck Yo and
    // 23 again from her guards.
    expect(
      [
        59, 60, 61, 62, 73, 77, 79, 88, 90, 100, 104, 137, 140, 145, 147, 149,
        172,
      ].map((r) => twins[r]),
    ).toEqual([
      68, 69, 71, 76, 98, 102, 103, 112, 113, 123, 127, 160, 162, 167, 169, 172,
      195,
    ]);
  });

  it('enters each command at its level', () => {
    expect(CHARACTERS.dora.levels).toEqual({
      11: 255, // Jump 2
      12: 255,
      13: 255,
      14: 0, // Dash F
      15: 0, // Dash B
      16: 254, // Dash AF
      17: 254, // Dash AB
      201: 21, // LP
      202: 22, // LK
      203: 23, // HP
      204: 24, // HK
      205: 21, // S LP
      206: 22,
      207: 23,
      208: 24,
      209: 21, // J LP
      212: 22,
      215: 23,
      218: 24,
      223: 25, // SP1 6LP
      225: 26, // SP2 6LK
      231: 26, // Hit up
      234: 21, // Chuck
      239: 1, // EN up
      240: 2, // EN up タメ中
      250: 31, // 機猫神双槌 LP
      252: 31,
      259: 31, // 機猫神空砲 LP
      260: 31,
      266: 31, // 機猫神突進 LK
      267: 31,
      277: 31, // 機猫神天翔 LP
      278: 31,
      279: 31,
      280: 31,
      283: 31, // 機猫神瞬移 LP
      284: 31,
      285: 31,
      286: 31,
      296: 41, // 魔神空大砲
      305: 41, // 秘神具騒嵐
      327: 41, // 鬼神双乱槌
      338: 41, // 覇神極突貫
      347: 42, // 激神超抱擁
      356: 42, // FK之意思
      419: 0, // CPU D
      421: 10, // CPU EN up
    });
  });

  it('strikes with his four buttons, each two of the source six', () => {
    expect(byKey({ punch: true })).toMatchObject({
      mine: [201, 'idle'],
      damage: 5,
    });
    expect(byKey({ kick: true })).toMatchObject({
      mine: [202, 'idle'],
      damage: 8,
    });
    expect(byKey({ hitUp: true })).toMatchObject({
      mine: [203, 'idle'],
      damage: 12,
    });
    expect(byKey({ dst: true })).toMatchObject({
      mine: [204, 'idle'],
      damage: 12,
    });
    expect(byKey({ punch: true, crouch: true })).toMatchObject({
      mine: [205, 'idle'],
      damage: 7,
    });
    expect(byKey({ kick: true, crouch: true })).toMatchObject({
      mine: [206, 'idle'],
      damage: 10,
    });
    expect(byKey({ hitUp: true, crouch: true })).toMatchObject({
      mine: [207, 'idle'],
      damage: 15,
    });
    expect(byKey({ dst: true, crouch: true })).toMatchObject({
      mine: [208, 'idle'],
      damage: 12,
    });
    // → with LP or LK: SP1 6LP and SP2 6LK, dashing punches.
    expect(byKey({ punch: true, right: true })).toMatchObject({
      mine: [223, 'idle'],
      damage: 25,
    });
    expect(byKey({ kick: true, right: true })).toMatchObject({
      mine: [225, 'idle'],
      damage: 30,
    });
    // LP's hit opens levels 22–50 (PC 2740), so LK, HP and HK cancel it, but
    // not LP again.
    expect(
      play(presses({ 0: { punch: true }, 8: { hitUp: true } })),
    ).toMatchObject({
      mine: [201, 203, 'idle'],
      damage: 17,
    });
    expect(
      play(presses({ 0: { punch: true }, 8: { dst: true } })),
    ).toMatchObject({
      mine: [201, 204, 'idle'],
      damage: 17,
    });
    expect(
      play(presses({ 0: { punch: true }, 12: { punch: true } })).mine,
    ).toEqual([201, 'idle']);
  });

  it('launches with ↘ HP, jumps after it on ↑, grabs with his chuck and dashes', () => {
    const hitUp = { hitUp: true, right: true, crouch: true };
    expect(byKey(hitUp)).toMatchObject({
      mine: [231, 232, 'idle'],
      damage: 15,
    });
    // hit up hit's ↑ (PC 3322) enters Jump cancel (233).
    expect(play(presses({ 0: hitUp, 30: { jump: true } })).mine).toEqual([
      231,
      232,
      233,
      'land',
      'idle',
    ]);
    expect(byKey({ throw: true })).toMatchObject({
      mine: [234, 235, 'idle'],
      damage: 30,
    });
    expect(byKey({ dash: true }, { gap: 400 }).mine).toEqual([14, 'idle']);
    expect(byKey({ dash: true, left: true }).mine).toEqual([15, 'idle']);
  });

  it('strikes in the air, its dash form after an air dash, with no double jump', () => {
    expect(
      play(presses({ 0: { jump: true }, 30: { punch: true } })).mine,
    ).toEqual(['takeoff', 'jump', 209, 'land', 'idle']);
    // J LP tests variable 1 for 20 (Dash AF, PC 224) into J LPD (210, PC
    // 2906).
    expect(
      play(
        presses({
          0: { jump: true },
          18: { right: true },
          19: {},
          20: { right: true },
          30: { punch: true },
        }),
        {
          gap: 400,
        },
      ).mine,
    ).toEqual(['takeoff', 'jump', 16, 210, 'land', 'idle']);
    // Jump 2's two steps take a 1-tick window (0x410171–0x41087c run it
    // once), so they never match, and ↑ again strikes J HK straight off.
    expect(
      play(
        presses({
          0: { jump: true },
          20: {},
          21: { jump: true },
          40: { dst: true },
        }),
      ).mine,
    ).toEqual(['takeoff', 'jump', 218, 'land', 'idle']);
  });

  it('plays his keyed specials', () => {
    // 機猫神空砲 HP's shot (262) starts 132 source pixels ahead (PC 3791).
    expect(byKey({ drill: true })).toMatchObject({
      mine: [260, 'idle'],
      damage: 0,
    });
    expect(byKey({ drill: true }, { gap: 600 })).toMatchObject({
      mine: [260, 'idle'],
      damage: 40,
    });
    expect(byKey({ axe: true })).toMatchObject({
      mine: [278, 270, 'idle'],
      damage: 60,
    });
    expect(byKey({ iori: true })).toMatchObject({
      mine: [267, 'idle'],
      damage: 50,
    });
    expect(
      play(presses({ 0: { jump: true }, 20: { axe: true } })).mine,
    ).toEqual(['takeoff', 'jump', 280, 270, 'turn', 'idle']);
  });

  it('spends his stocks on his supers', () => {
    // His block's decay (+0x7ca8) takes 2% of each hit's damage per hit the
    // victim has taken since its last run-out (0x40f795), so 秘神具騒嵐's
    // 5s and 6s fall to 1.
    expect(byKey({ getterBeam: true })).toMatchObject({
      mine: [296, 'idle'],
      damage: 130,
      stock: 4,
    });
    expect(byKey({ musashi: true })).toMatchObject({
      mine: [305, '305+46', 'idle'],
      damage: 191,
      stock: 4,
    });
    expect(byKey({ changeAttack: true })).toMatchObject({
      mine: [327, 332, 'idle'],
      damage: 175,
      stock: 4,
    });
    expect(byKey({ blackRush: true })).toMatchObject({
      mine: [338, 340, '340+3', 341, 342, 270, 'idle'],
      damage: 173,
      stock: 4,
    });
    // 激神超抱擁 takes three stocks (PC 5943), or enters No super, which adds
    // 10 power five times (PCs 4353–4356).
    expect(byKey({ megaBeam: true }, { gap: 90 })).toMatchObject({
      mine: [347, 348, 'idle'],
      damage: 270,
      stock: 2,
    });
    expect(byKey({ megaBeam: true }, { gap: 90, stock: 2 })).toMatchObject({
      mine: [290, 'idle'],
      damage: 0,
      stock: 2,
      power: 50,
    });
  });

  it('cancels Charge into his supers’ SC forms for two stocks', () => {
    // 機猫神突進 HK and its hit set variable 6 to 100 (PCs 3899, 3929), which
    // each super tests (PCs 4396, 4601, 5518, 5749).
    const cancel = (key: Input) =>
      play((t) => (t === 0 ? { iori: true } : t === 40 ? key : {}));
    expect(cancel({ getterBeam: true })).toMatchObject({
      mine: [267, 297, 'idle'],
      stock: 3,
    });
    expect(cancel({ changeAttack: true })).toMatchObject({
      mine: [267, 328, 332, 'idle'],
      damage: 219,
      stock: 3,
    });
    expect(cancel({ blackRush: true }).mine).toEqual([
      267,
      339,
      340,
      '340+3',
      341,
      342,
      270,
      'idle',
    ]);
  });

  it('charges power while E (EN, buttons E and F) is held, taunting once full', () => {
    // EN up (239) opens a level-2 window (PC 3409) that the held EN entry
    // keeps re-entering, 4 power a tick (PCs 3432–3442).
    expect(
      play((t) => (t < 100 ? { ex: true } : {}), { stock: 0 }),
    ).toMatchObject({
      mine: [239, '240+3', 'idle'],
      stock: 4,
      power: 56,
    });
    // At five stocks it enters 挑発 (241, PC 3428), a taunt that gives the
    // opponent 20 power (PC 3451).
    expect(
      play((t) => (t < 300 ? { ex: true } : {}), { stock: 0 }),
    ).toMatchObject({
      mine: [239, '240+3', 241, 242, 'idle'],
      stock: 5,
    });
  });

  it('darkens the court through variable 14, which his Black (50) tests', () => {
    const { dora, steps } = doraPlayer();
    dora.stock = 5;
    steps({}, 2);
    steps({ getterBeam: true });
    expect(dora.variables[14]).toBe(100);
    expect(BLACK.dora.opaque.image).toBe(1011);
  });

  it('pops out, rises and lands through his Vs. intro, charging four stocks', () => {
    expect(animationDuration('intro', 'dora')).toBe(337);
    const match = new Match('cpu', true, 0, ['dora', 'zoma']);
    const dora = match.fighters[0];
    let ticks = 0;
    while (dora.action === 'intro') {
      match.step({});
      ticks++;
    }
    // OP super Charge (46) clears his power and adds 360 (PCs 573–574).
    expect([ticks, dora.stock, dora.y]).toEqual([337, 4, 0]);
    // 開始時 BR's display and Round 1's pocket pose (image 263, PC 365),
    // the rise, OP RP, the wait for landing, then Round 1 + 27 and STAND
    // DEMO.
    expect(
      [0, 149, 150, 177, 257, 266, 267, 276, 336].map(
        (age) => animationFrame('intro', age, 'dora').image,
      ),
    ).toEqual([263, 263, 264, 268, 268, 125, 124, 124, 184]);
  });

  it('wins after STAND DEMO, looping three poses, and draws hiding on image 0', () => {
    expect(animationDuration('win', 'dora')).toBe(132);
    expect(
      [0, 59, 60, 92, 98, 111, 112, 131, 1000].map(
        (age) => animationFrame('win', age, 'dora').image,
      ),
    ).toEqual([116, 184, 269, 273, 274, 275, 273, 275, 274]);
    expect(animationDuration('draw', 'dora')).toBe(63);
    expect(
      [0, 59, 60, 61, 62, 1000].map(
        (age) => animationFrame('draw', age, 'dora').image,
      ),
    ).toEqual([116, 184, 221, 221, 0, 0]);
    // Action 95's face (PC 1085).
    expect(faceImage(-1, 'dora')).toBe(2001);
  });

  it('stands through his idle program, past its slot 9 delete (PC 11)', () => {
    const vm = new StandingVM(CHARACTERS.dora.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([116, 139, 116, 184, 185, 184]);
  });

  it('reloads from a KO with three stocks: KO NORMAL’s op 0x10 (PC 775) enters KO RELOAD (72)', () => {
    // Ryuko punches him at 1 life: his actions, life and the winner.
    const knockOut = (stock: number, global3 = 0) => {
      const match = new Match('practice', false, 3, ['ryuko', 'dora']);
      const [ryuko, dora] = match.fighters;
      match.globals[3] = global3;
      match.step({}, {});
      dora.x = ryuko.x + 90;
      [dora.stock, dora.hp] = [stock, 1];
      const path: unknown[][] = [];
      for (let t = 0; t < 750; t++) {
        match.step(t ? {} : { punch: true }, {});
        if (path.at(-1)?.[1] !== now(dora)) path.push([t, now(dora), dora.hp]);
      }
      return { path, stock: dora.stock, winner: match.winner };
    };
    // KO RELOAD takes him back to 1 life (PC 833) before the round
    // controller reads it; KR Down (74) spends 270 power (PC 884), three
    // stocks, and its Stop (79) gives him 2 life 300 times (PCs 1015–1018).
    expect(knockOut(4)).toEqual({
      path: [
        [0, 'idle', 1],
        [8, 72, 1],
        [118, 74, 1],
        [705, 'land', 600],
        [713, 'idle', 600],
      ],
      stock: 1,
      winner: null,
    });
    expect(knockOut(2)).toMatchObject({
      path: [
        [0, 'idle', 1],
        [8, 'down', 0],
        [118, 'koLand', 0],
      ],
      winner: 'player',
    });
    // With fewer at global 3 = 10, as a story leaves it, KO NORMAL's next
    // test (PC 776) enters KO NORMAL CPU (70), which spawns ten 技名16 (80,
    // PCs 804–813). Each tick each adds 1 to his variable 4 and takes 1000
    // life (PCs 1022–1023), a KO that scores the story slot's points, and
    // each KO enters 70 again, past its spawns (PC 803). Past 100 (PC 802)
    // he falls on into KO NORMAL + 3: SHIN-Z's story battle with him (step
    // 24), 1 point a KO, ends on those 100 KOs.
    expect(knockOut(2, 10).path).toEqual([
      [0, 'idle', 1],
      [8, 70, 0],
      [9, '70+13', 0],
      [19, '69+3', 0],
      [129, 76, 0],
      [190, '76+11', 0],
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // 421's box 9870 down meets Ryuko's object 39, 9900 down, into its hit
    // handler 421 + 28 (0x40f010 tests every box against objects' bodies).
    for (const [seed, wanted] of [
      [4, [283, 421, '421+28', 245, 284, 241, 252, 254, 296]],
      [37, [286, 356, 327]],
      [2, [305]],
      [15, [204, 338]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'dora']);
      const dora = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (dora.action === 'script') entered.add(dora.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});

describe("DoraEmon's story (authored)", () => {
  const demos = import.meta.glob<{ default: Demo }>(
    './generated/demos/*.json',
    {
      eager: true,
    },
  );
  // The globals his story leaves at `step`: chosen on the story select
  // screen, then every demo before it (the battles between are skipped).
  // Demo 25 waits for a press.
  const reach = (step: number) => {
    const select = new CharacterSelect([[5, 5]], true);
    select.step();
    select.step({ punch: true });
    while (!select.done) select.step();
    const { globals } = select;
    for (const s of scenarioOf('dora').slice(0, step)) {
      if (s.type !== 2) continue;
      const demo = new StoryDemo(
        s.demo,
        demos[`./generated/demos/${s.demo}.json`].default,
        0,
      );
      demo.globals = globals;
      for (let t = 0; !demo.done; t++)
        demo.step(t > 3000 && t % 2 ? { punch: true } : {});
    }
    return globals;
  };
  // Step `step`'s battle from FIGHT with him at 1 life and `stock` stocks,
  // until `until`: the globals, his action at FIGHT, the result, his
  // actions, stock and life.
  const lose = (
    step: number,
    stock: number,
    until = (m: Match) => !!m.winner,
  ) => {
    const globals = reach(step);
    const battle = scenarioOf('dora')[step] as Battle;
    const match = Match.story('dora', battle, 0, undefined, globals);
    const [dora] = match.fighters;
    while (match.roundTicks <= match.fightTick) match.step();
    const atFight = dora.action;
    [dora.stock, dora.hp] = [stock, 1];
    const path: string[] = [];
    for (let t = 0; t < 20000 && !until(match); t++) {
      match.step();
      const action = String(now(dora));
      if (path.at(-1) !== action) path.push(action);
    }
    return {
      g3: globals[3],
      atFight,
      winner: match.winner,
      points: match.fighters.map((f) => f.points),
      path,
      stock: dora.stock,
      hp: dora.hp,
    };
  };

  it('loses step 1 to GIANT on a KO, which offers Continue', () => {
    const result = lose(1, 0);
    expect(result).toMatchObject({
      g3: 10,
      atFight: 'idle',
      winner: 'opponent',
    });
    expect(result.points[1]).toBeGreaterThanOrEqual(100);
    expect((scenarioOf('dora')[1] as Battle).flags & 1).toBe(1);
  });

  it('enters KO RELOAD in a duel with three stocks but still loses, unrecovered', () => {
    const result = lose(1, 4);
    expect(result.path).toContain('72');
    expect(result).toMatchObject({ winner: 'opponent', stock: 4 });
    expect(result.hp).toBeLessThanOrEqual(1);
  });

  it('revives through KO RELOAD in a brawl, spending three stocks for 600 life', () => {
    const result = lose(5, 4, (m) => m.fighters[0].hp === 600);
    expect(result).toMatchObject({ g3: 0, atFight: 'idle', stock: 1, hp: 600 });
    const reload = result.path.indexOf('72');
    expect(reload).toBeGreaterThanOrEqual(0);
    expect(result.path.indexOf('74')).toBeGreaterThan(reload);
  });

  it("draws a brawl when KO'd with fewer than three stocks", () => {
    expect(lose(5, 0).winner).toBe('draw');
  });

  it('loses the final SHIN-Z battle (step 24) on a KO', () => {
    expect(lose(24, 0)).toMatchObject({
      g3: 10,
      atFight: 'idle',
      winner: 'opponent',
    });
  });
});
