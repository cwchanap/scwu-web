import { describe, expect, it } from 'vitest';
import { animationFrame } from './animations';
import type { Action, ObjectKey } from './animations';
import type { Who } from './characters';
import { FIGHT_TICK } from './hud';
import { EX_MODE, exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { enter, named } from './testing';

// A Vs. match the select screen started: global 3 is 50 (KGT PCs 541, 548,
// 585), global 10 is 0 (PC 542), so each 開始時 takes its VS path.
const vsMatch = (who: Who = 'ryuko', seed = 0) =>
  new Match('cpu', true, seed, [who, who], 'court', true);
const steps = (match: Match, ticks: number, input: Input = {}) => {
  for (let t = 0; t < ticks; t++) match.step(input);
};
// Source pixels.
const at = (f: Fighter) => f.x / 1.5;
// The VS 1P banners: Ryuko's 54, Zoma's 53.
const banners = (match: Match, vs = 54) =>
  match.effects
    .filter((e) => e.clip === vs || e.clip === `${vs}+9`)
    .map((e) => [e.owner, e.clip, e.facing]);
// Op 0x01 velocity, 16.16 scaled by floor(65536 / 100), per tick.
const speed = (raw: number) => (raw * 655) / 65536;

describe("Ryuko's VS 開始時 (30)", () => {
  it('vanishes, dashes to the window edges and crosses, then walks in Round 1', () => {
    const match = vsMatch();
    const [p1, p2] = match.fighters;
    // VS single places the players at 390 and 890 (0x408ac3).
    expect([at(p1), at(p2), p1.facing, p2.facing]).toEqual([390, 890, 1, -1]);
    steps(match, 5);
    expect([p1.branch, p2.branch, at(p1), at(p2)]).toEqual([30, 30, 390, 890]);
    expect(animationFrame(30, p1.age).image).toBe(0);
    // Round 1 (PC 290) spawns VS 1P's two banners (PCs 293–294) and dashes
    // back at −10000: the camera window (320 + 50, 320 + 590) stops both.
    match.step();
    expect([p1.branch, p2.branch, at(p1), at(p2)]).toEqual([
      '30+9',
      '30+9',
      370,
      910,
    ]);
    match.step();
    // Both take the 1P path (player variable 2 is 0, PC 289): player 2's
    // banners face left and leave the world.
    expect(banners(match)).toEqual([
      [0, 54, 1],
      [0, '54+9', 1],
      [1, 54, -1],
      [1, '54+9', -1],
    ]);
    // Then 2870 for 15 ticks: they cross and stand facing away.
    steps(match, 23);
    const cross = 15 * speed(2870);
    expect(at(p1)).toBeCloseTo(370 + cross, 6);
    expect(at(p2)).toBeCloseTo(910 - cross, 6);
    expect([p1.facing, p2.facing]).toEqual([1, -1]);
    expect(banners(match)).toEqual([
      [0, 54, 1],
      [0, '54+9', 1],
    ]);
    // Image 3 for 70 ticks, then Round 1 (33) from its start (PC 305).
    steps(match, 70);
    expect([p1.branch, animationFrame('30+9', p1.age - 1).image]).toEqual([
      '30+9',
      3,
    ]);
    match.step();
    expect([p1.branch, p2.branch]).toEqual([33, 33]);
    // OP super Charge (39) takes VS CHARGE (38) for global 3 > 40 (PC 417).
    match.step();
    expect(
      match.effects.filter((e) => e.clip === 38).map((e) => e.owner),
    ).toEqual([0, 1]);
    // Round 1 steps back at −2000 for 5 ticks, then walks in at 200 for 50.
    steps(match, 48);
    expect(at(p1)).toBeCloseTo(370 + cross, 6);
    steps(match, 5);
    expect(at(p1)).toBeCloseTo(370 + cross - 5 * speed(2000), 6);
    steps(match, 50);
    expect(at(p1)).toBeCloseTo(
      370 + cross - 5 * speed(2000) + 50 * speed(200),
      6,
    );
    // 100 ticks of 開始時 and Round 1's 254 run out into idle.
    steps(match, 149);
    expect([named(p1), named(p2)]).toEqual(['33', '33']);
    match.step();
    expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
    // No stocks, where OP super Charge charges two; they turn once the
    // round starts.
    while (match.roundTicks < FIGHT_TICK - 1) match.step();
    expect(match.fighters.map((f) => [f.stock, f.power])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(p1.facing).toBe(1);
    match.step();
    expect([p1.action, p1.facing]).toEqual(['turn', -1]);
  });

  it("enters EX mode while down is held at Round 1's check (PC 348)", () => {
    const run = (tick: number) => {
      const match = vsMatch();
      for (let t = 0; t < 330; t++)
        match.step(t === tick ? { crouch: true } : {});
      return [named(match.fighters[0]), exMode(match.fighters[0])];
    };
    expect(run(316)).toEqual(['33', false]);
    // 'Chage Character' (37) sets variable 0 to 10 and rejoins Round 1.
    expect(run(317)).toEqual(['37', true]);
  });

  it('plays Demo twice from round 2, its EX check between (PC 307)', () => {
    const match = vsMatch();
    while (match.roundTicks < FIGHT_TICK) match.step();
    match.fighters[1].hp = 0;
    while (match.round === 1) match.step();
    const [p1, p2] = match.fighters;
    expect([at(p1), at(p2), p1.branch]).toEqual([390, 890, 30]);
    steps(match, 6);
    // No banners past round 1; the same dash.
    expect([p1.branch, at(p1), at(p2), banners(match)]).toEqual([
      30,
      370,
      910,
      [],
    ]);
    steps(match, 95);
    // Demo (28) inlined from age 100: images 3, 6, 8, 7, 6, 2, 1, 295.
    expect(animationFrame(30, p1.age).image).toBe(3);
    steps(match, 124);
    expect(p1.branch).toBe(30);
    match.step({ crouch: true });
    // 'Chage Character' + 3 sets variable 0 and calls Demo again.
    expect([p1.branch, exMode(p1), p2.branch, exMode(p2)]).toEqual([
      '37+3',
      true,
      30,
      false,
    ]);
    steps(match, 124);
    expect([p1.action, p2.action]).toEqual(['script', 'script']);
    match.step();
    expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
  });

  it("plays each fighter's own, or the Br. intro if one has none exported", () => {
    const mixed = new Match('cpu', true, 0, ['ryuko', 'zoma'], 'court', true);
    expect(mixed.fighters.map((f) => f.branch)).toEqual([30, 28]);
    const other = new Match(
      'cpu',
      true,
      0,
      ['zoma', 'training'],
      'court',
      true,
    );
    expect(other.fighters.map((f) => f.action)).toEqual(['intro', 'intro']);
  });
});

// The 開始時 the other fighters share with Ryuko's: VS 1P twice, the dash
// and cross, an image held 70 ticks while Black and OP super Charge spawn,
// then in round 1 the action the round copy jumps to, from its start. Each
// row: those actions and images, round 2's images by age, the ticks to idle
// in rounds 1 and 2, how far round 1's action walks, and the action it runs
// out of when that action jumps on, with a seed whose rolls both take it,
// and the timeline the round copy jumps to.
const TEMPLATE: {
  who: Who;
  start: number;
  round1: number;
  banner: number;
  image: number;
  charge: number;
  demo: [number, number][];
  idle: [number, number];
  walk?: number;
  ends?: number | string;
  seed?: number;
  copy?: ObjectKey;
}[] = [
  // Start N (31, PC 284): 250 ticks of displays (PCs 308–321). From round 2
  // image 114 for 30 ticks (PC 285), then DEMO STAND (41) four times (PC
  // 286): 113, 114, 115 and 114 for 11, 11, 22, 11.
  {
    who: 'zoma',
    start: 28,
    round1: 31,
    banner: 53,
    image: 113,
    charge: 35,
    demo: [
      [99, 113],
      [100, 114],
      [129, 114],
      [130, 113],
      [141, 114],
      [152, 115],
      [174, 114],
      [185, 113],
      [349, 114],
    ],
    idle: [351, 351],
  },
  // Round 1 (33, PC 302): 250 ticks of displays, Start Smoke (331) at PC
  // 333. From round 2 DEMO Stand (28) twice (PC 303): 113 for 25, then 114
  // and 115 for 20 each.
  {
    who: 'kiki',
    start: 30,
    round1: 33,
    banner: 53,
    image: 113,
    charge: 37,
    demo: [
      [100, 113],
      [125, 114],
      [145, 115],
      [225, 113],
      [250, 114],
      [349, 114],
    ],
    idle: [351, 351],
  },
  // ROUND 1 (33, PC 306): 200 ticks of displays with OP eff (36) twice at
  // PCs 335–336, its EX check (PC 338), then Demo stand (27) once. From
  // round 2 Demo stand twice (PC 307), the EX check (PC 308), then three
  // times (PC 309): 113, 114, 115 and 114 for 15, 10, 15, 10.
  {
    who: 'chung',
    start: 30,
    round1: 33,
    banner: 54,
    image: 113,
    charge: 38,
    demo: [
      [100, 113],
      [115, 114],
      [125, 115],
      [140, 114],
      [150, 113],
      [340, 114],
      [349, 114],
    ],
    idle: [351, 351],
  },
  // Round 1 (32, PC 326): Ami (34), 115 blank ticks, its EX check (PC 356),
  // displays (PCs 357–361) and Demo stand (27) once. From round 2 one tick
  // more of image 113 (PC 327), Demo stand twice (PC 328), the EX check
  // (PC 329), then once more (PC 330): 113 to 117 and back, 8 ticks each,
  // 18 for 117.
  {
    who: 'amiro',
    start: 29,
    round1: 32,
    banner: 56,
    image: 113,
    charge: 40,
    demo: [
      [100, 113],
      [109, 114],
      [117, 115],
      [125, 116],
      [133, 117],
      [151, 116],
      [192, 114],
      [341, 113],
      [349, 113],
    ],
    idle: [351, 351],
  },
  // Round 1 (35, PC 329): 206 ticks of displays, its EX check (PC 363),
  // then 44 more (PCs 364–367). From round 2 image 114 for 4 ticks (PC 330),
  // DEMO STAND (30) three times (PC 331), the EX check (PC 332), then three
  // times more (PC 333): 113 for 15, 114 to 117 for 5 each, 114 for 6.
  {
    who: 'anmc',
    start: 32,
    round1: 35,
    banner: 56,
    image: 113,
    charge: 40,
    demo: [
      [100, 114],
      [103, 114],
      [104, 113],
      [119, 114],
      [124, 115],
      [129, 116],
      [134, 117],
      [139, 114],
      [145, 113],
      [349, 114],
    ],
    idle: [351, 351],
  },
  // Round 1 (33, PC 287): 200 ticks of displays, its EX check (PC 328),
  // then 50 more. From round 2 Demo Stand (28) three times (PC 288), the
  // EX check (PC 289), then twice (PC 290): 113, 114, 115 and 114 for 12,
  // 12, 14, 12.
  {
    who: 'giant',
    start: 30,
    round1: 33,
    banner: 57,
    image: 113,
    charge: 38,
    demo: [
      [111, 113],
      [112, 114],
      [124, 115],
      [138, 114],
      [150, 113],
      [338, 114],
      [349, 114],
    ],
    idle: [351, 351],
  },
  // Round 1 (35, PC 356): 214 ticks of displays, its EX check (PC 403),
  // 26 more, then image 113 through 開始時 BR + 16 in EX mode (PC 410) or
  // 194, 10 ticks. From round 2 image 620 for 2 ticks (PC 357), Demo stand
  // (49) twice (PC 358), the EX check (PC 359), then twice more (PC 360):
  // 621, 622, 624, 623, 622 and 620 for 13, 10, 6, 13, 12, 8.
  {
    who: 'suneo',
    start: 32,
    round1: 35,
    banner: 63,
    image: 621,
    charge: 42,
    demo: [
      [99, 621],
      [100, 620],
      [102, 621],
      [115, 622],
      [125, 624],
      [131, 623],
      [144, 622],
      [156, 620],
      [164, 621],
      [349, 620],
    ],
    idle: [351, 351],
  },
  // Round 1 (35, PC 350) steps back at −2000 for 5 ticks and walks in at
  // 110 for 90 (PCs 374–385), 255 ticks in all. From round 2 image 117 for
  // 5 ticks (PC 351), then Demo Stand (29) seven times (PC 352): 113 to 117
  // for 7 ticks each.
  {
    who: 'yo',
    start: 32,
    round1: 35,
    banner: 55,
    image: 113,
    charge: 39,
    demo: [
      [99, 113],
      [100, 117],
      [105, 113],
      [112, 114],
      [119, 115],
      [126, 116],
      [133, 117],
      [140, 113],
      [349, 117],
    ],
    idle: [356, 351],
    walk: -5 * speed(2000) + 90 * speed(110),
  },
  // Round 1 (36, PC 368): 125 ticks of blanks and displays, its EX check
  // (PC 403), then STAND DEMO 2 (30) once. From round 2 STAND DEMO 2 once
  // (PC 371), the EX check (PC 372), then once more (PC 373): image 365 for
  // 125 ticks.
  {
    who: 'sin',
    start: 33,
    round1: 36,
    banner: 57,
    image: 365,
    charge: 41,
    demo: [
      [100, 365],
      [349, 365],
    ],
    idle: [351, 351],
  },
  // Round 1 (34, PC 348): blanks for 200 ticks while OP (35) and OP bkg
  // (37) spawn, then it jumps into OP lend (36, PC 392), his Br. intro's
  // landing, 50 more. From round 2 DEMO STAND (29) twice by op 0x0b: from
  // PC 11 (PC 349), then from its start (PC 350).
  {
    who: 'lizard',
    start: 31,
    round1: 34,
    banner: 57,
    image: 113,
    charge: 41,
    demo: [
      [99, 113],
      [100, 117],
      [103, 118],
      [153, 119],
      [158, 120],
      [165, 121],
      [179, 113],
      [194, 114],
      [336, 121],
      [349, 121],
    ],
    idle: [351, 351],
    ends: 36,
  },
  // Round 1 (33, PC 326) steps back at −2250 for 5 ticks, waits 45, walks
  // in at 200 for 56 (PCs 352–365), shows image 113 for 26, checks down
  // (PC 367) and calls Demo stand (28) from + 2. From round 2 image 113 for
  // 14 ticks (PC 327), Demo stand from + 2 (PC 328), the EX check (PC 329),
  // then Demo stand again (PC 330).
  {
    who: 'kay',
    start: 30,
    round1: 33,
    banner: 54,
    image: 114,
    charge: 38,
    demo: [
      [99, 114],
      [100, 113],
      [114, 114],
      [122, 115],
      [130, 116],
      [139, 117],
      [145, 118],
      [151, 119],
      [157, 120],
      [163, 113],
      [349, 113],
    ],
    idle: [351, 351],
    walk: -5 * speed(2250) + 56 * speed(200),
  },
  // Round 1 (34, PC 343): 250 ticks of displays, unless its roll takes op2
  // (below). From round 2 image 113 for 14 ticks (PC 344), then Demo Stand
  // (29) twice (PC 345): 113, 114, 115, 114 and 113 for 50, 5, 8, 5, 50.
  {
    who: 'dido',
    start: 31,
    round1: 34,
    banner: 58,
    image: 113,
    charge: 36,
    demo: [
      [99, 113],
      [163, 113],
      [164, 114],
      [169, 115],
      [177, 114],
      [182, 113],
      [282, 114],
      [300, 113],
      [349, 113],
    ],
    idle: [351, 351],
    seed: 1,
  },
  // 開始時 jumps into 開始時 1P (37, PC 340), the template from + 8, holding
  // a blank. Round 1 (40, PC 360): 170 ticks of displays unless its rolls
  // take others (below), its EX check (PC 413), then STAND DEMO (31) once.
  // From round 2 image 116 for 10 ticks (PC 362), STAND DEMO from + 2
  // twice (PC 363), the EX check (PC 364), then STAND DEMO once (PC 365):
  // 117, 115 and 116 for 15, 45 and 20.
  {
    who: 'sakuya',
    start: 36,
    copy: '37+8',
    round1: 40,
    banner: 66,
    image: 0,
    charge: 50,
    demo: [
      [99, 0],
      [100, 116],
      [110, 117],
      [125, 115],
      [170, 116],
      [190, 117],
      [270, 117],
      [285, 115],
      [330, 116],
      [349, 116],
    ],
    idle: [351, 351],
    seed: 5,
  },
  // Round 1 (33, PC 306): 151 ticks of displays, its EX check (PC 356),
  // then 99 more. From round 2 image 116 for 42 ticks (PC 307), DEMO stand
  // (27) once (PC 308), the EX check (PC 309), then once more (PC 310):
  // 117, 116, 115 and 116 twice over, 13 ticks each.
  {
    who: 'alex',
    start: 30,
    round1: 33,
    banner: 56,
    image: 117,
    charge: 40,
    demo: [
      [99, 117],
      [100, 116],
      [142, 117],
      [155, 116],
      [168, 115],
      [181, 116],
      [194, 117],
      [337, 116],
      [349, 116],
    ],
    idle: [351, 351],
  },
  // Round 1 (37, PC 373) hops on image 306 (PCs 405–413), holding it until
  // it lands in + 10, 159 ticks in: its EX check (PC 415), images 124 and
  // 123, then DEMO stand (29) from + 1. From round 2 image 116 for 34 ticks
  // (PC 374), DEMO stand from + 2 twice (PC 375), the EX check (PC 376),
  // then DEMO stand from + 1 (PC 377): 115, 116, 117 and 116 for 20, 12,
  // 20, 20.
  {
    who: 'sou',
    start: 34,
    round1: 37,
    banner: 59,
    image: 115,
    charge: 42,
    demo: [
      [99, 115],
      [100, 116],
      [134, 115],
      [154, 116],
      [166, 117],
      [186, 116],
      [206, 115],
      [278, 115],
      [330, 116],
      [349, 116],
    ],
    idle: [351, 351],
    ends: '37+10',
  },
  // Round 1 (33, PC 313): 250 ticks of displays. From round 2 image 118 for
  // 70 ticks (PC 314), then Stand Demo (27) from + 1 (PC 315): 117, 116,
  // 115, 116, 117 and 118 for 8, 7, 80, 7, 8, 70.
  {
    who: 'hiso',
    start: 30,
    round1: 33,
    banner: 55,
    image: 117,
    charge: 37,
    demo: [
      [99, 117],
      [100, 118],
      [169, 118],
      [170, 117],
      [178, 116],
      [185, 115],
      [265, 116],
      [272, 117],
      [280, 118],
      [349, 118],
    ],
    idle: [351, 351],
  },
  // 開始時 jumps into 開始時 1P (32, PC 296), the template from + 8. Round 1
  // (35, PC 317): 145 ticks of displays, its EX check (PC 357), images 258
  // and 341, then stand demo (28) from + 1. From round 2 image 115 for 10
  // ticks (PC 318), stand demo from + 2 twice (PC 319), the EX check (PC
  // 320), then stand demo from + 1 (PC 321): 116, 117, 118 and 115 for 15,
  // 15, 20, 30.
  {
    who: 'erus',
    start: 31,
    copy: '32+8',
    round1: 35,
    banner: 57,
    image: 116,
    charge: 40,
    demo: [
      [99, 116],
      [100, 115],
      [110, 116],
      [125, 117],
      [140, 118],
      [160, 115],
      [190, 116],
      [270, 116],
      [320, 115],
      [349, 115],
    ],
    idle: [351, 351],
  },
  // Round 1 (35, PC 341): 248 ticks of displays and its EX check (PC 393),
  // unless its roll takes OP2 (below). From round 2 image 115 for 10 ticks
  // (PC 342), Demo stand (28) from + 2 twice (PC 343), the EX check (PC
  // 344), then Demo stand from + 1 (PC 345): 116, 117, 118 and 115 for 12,
  // 13, 15, 40.
  {
    who: 'feng',
    start: 32,
    round1: 35,
    banner: 64,
    image: 116,
    charge: 46,
    demo: [
      [99, 116],
      [100, 115],
      [110, 116],
      [122, 117],
      [135, 118],
      [150, 115],
      [190, 116],
      [270, 116],
      [310, 115],
      [349, 115],
    ],
    idle: [349, 351],
    seed: 1,
  },
  // Round 1 (36, PC 349) leaps off at −20000 for 4 ticks, waits 50, then
  // drops back at 500 (PCs 384–391) through 115 and 121 until it lands in
  // + 15 (PC 390), 214 ticks in, image 115 for 36. From round 2 STAND DEMO
  // (29) twice (PC 351): 115, 116, 117 and 116 for 65, 20, 20, 20.
  {
    who: 'sean',
    start: 33,
    round1: 36,
    banner: 56,
    image: 116,
    charge: 40,
    demo: [
      [99, 116],
      [100, 115],
      [165, 116],
      [185, 117],
      [205, 116],
      [225, 115],
      [290, 116],
      [310, 117],
      [330, 116],
      [349, 116],
    ],
    idle: [351, 351],
    ends: '36+15',
  },
];

describe.each(TEMPLATE)(
  "$who's VS 開始時 ($start)",
  ({
    who,
    start,
    round1,
    banner,
    image,
    charge,
    demo,
    idle,
    walk = 0,
    ends = round1,
    seed = 0,
    copy = `${start}+9`,
  }) => {
    it('dashes, crosses and stands, then plays its round 1 action', () => {
      const match = vsMatch(who, seed);
      const [p1, p2] = match.fighters;
      steps(match, 5);
      expect([p1.branch, p2.branch]).toEqual([start, start]);
      // The round copy passes in round 1: VS 1P twice, and the dash.
      match.step();
      expect([p1.branch, at(p1), at(p2)]).toEqual([copy, 370, 910]);
      match.step();
      expect(banners(match, banner)).toEqual([
        [0, banner, 1],
        [0, `${banner}+9`, 1],
        [1, banner, -1],
        [1, `${banner}+9`, -1],
      ]);
      steps(match, 23);
      const cross = 15 * speed(2870);
      expect(at(p1)).toBeCloseTo(370 + cross, 6);
      expect(at(p2)).toBeCloseTo(910 - cross, 6);
      expect(banners(match, banner)).toEqual([
        [0, banner, 1],
        [0, `${banner}+9`, 1],
      ]);
      steps(match, 70);
      expect(animationFrame(copy, p1.age, who).image).toBe(image);
      match.step();
      expect([p1.branch, p2.branch]).toEqual([round1, round1]);
      // OP super Charge takes VS CHARGE for global 3 > 40.
      match.step();
      expect(
        match.effects.filter((e) => e.clip === charge).map((e) => e.owner),
      ).toEqual([0, 1]);
      steps(match, idle[0] - 103);
      expect([named(p1), named(p2)]).toEqual([`${ends}`, `${ends}`]);
      match.step();
      expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
      expect(at(p1)).toBeCloseTo(370 + cross + walk, 6);
      while (match.roundTicks < FIGHT_TICK - 1) match.step();
      expect(match.fighters.map((f) => [f.stock, f.power])).toEqual([
        [0, 0],
        [0, 0],
      ]);
    });

    it('plays its round 2 images where round 1 has the banners', () => {
      const match = vsMatch(who, seed);
      while (match.roundTicks < FIGHT_TICK) match.step();
      match.fighters[1].hp = 0;
      while (match.round === 1) match.step();
      const [p1, p2] = match.fighters;
      steps(match, 6);
      expect([p1.branch, at(p1), at(p2), banners(match, banner)]).toEqual([
        start,
        370,
        910,
        [],
      ]);
      const ages: [number, number][] = [[29, 0], [30, image], ...demo];
      expect(
        ages.map(([age]) => [age, animationFrame(start, age, who).image]),
      ).toEqual(ages);
      steps(match, idle[1] - 7);
      expect([p1.branch, p2.branch]).toEqual([start, start]);
      match.step();
      expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
    });
  },
);

// Down held on the step from `tick` in round 1 or 2 of a VS match between
// two of `who`: where its 開始時 is 350 ticks in, whether EX mode is on, and
// the images it showed after the press.
function exCheck(who: Who, round2: boolean, tick: number) {
  const match = vsMatch(who);
  if (round2) {
    while (match.roundTicks < FIGHT_TICK) match.step();
    match.fighters[1].hp = 0;
    while (match.round === 1) match.step();
  }
  const [p1] = match.fighters;
  const images: number[] = [];
  for (let t = 0; t < 350; t++) {
    match.step(t === tick ? { crouch: true } : {});
    if (t > tick && p1.action === 'script')
      images.push(animationFrame(p1.branch!, p1.age, who).image);
  }
  return [named(p1), exMode(p1), [...new Set(images)]];
}

describe("Chung's EX checks", () => {
  // Down held at ROUND 1's check (PC 338) or between round 2's Demo stands
  // (PC 308) enters Change EX (35) or + 3, which set variable 0 to 100 and
  // call Demo stand once or three times: Demo stand EX (28), as its check
  // of variable 0 jumps there inside each call (PC 259).
  it('in round 1, at ROUND 1 + 200', () => {
    expect(exCheck('chung', false, 299)).toEqual([
      '33',
      false,
      [113, 114, 115],
    ]);
    expect(exCheck('chung', false, 300)).toEqual(['35', true, [372, 373, 374]]);
  });

  it('from round 2, between the Demo stands', () => {
    expect(exCheck('chung', true, 199)).toEqual(['30', false, [113, 114, 115]]);
    expect(exCheck('chung', true, 200)).toEqual([
      '35+3',
      true,
      [372, 373, 374],
    ]);
  });
});

describe("Amiro's EX checks", () => {
  // Down held at Round 1's check (PC 356) or between round 2's Demo stands
  // (PC 329) enters EX CHANGE (39) + 3 or 39, which set variable 0 to 100
  // and rejoin the displays they skip from (PCs 357, 330).
  const round1 = [172, 208, 430, 128, 113, 114, 115, 116, 117];
  it('in round 1, at Round 1 + 115', () => {
    expect(exCheck('amiro', false, 214)).toEqual(['32', false, round1]);
    expect(exCheck('amiro', false, 215)).toEqual(['39+3', true, round1]);
  });

  it('from round 2, between the Demo stands', () => {
    const demo = [113, 114, 115, 116, 117];
    expect(exCheck('amiro', true, 266)).toEqual(['29', false, demo]);
    expect(exCheck('amiro', true, 267)).toEqual(['39', true, demo]);
  });
});

describe("ANMC P's EX checks", () => {
  // Down held at Round 1's check (PC 363) or between round 2's DEMO STANDs
  // (PC 332) enters 'Chage Character' (39) or + 3, which set variable 0 to
  // 100 and rejoin the displays they skip from (PCs 364, 333).
  it('in round 1, at Round 1 + 206', () => {
    expect(exCheck('anmc', false, 305)).toEqual([
      '35',
      false,
      [316, 317, 138, 113],
    ]);
    expect(exCheck('anmc', false, 306)).toEqual([
      '39',
      true,
      [316, 317, 138, 113],
    ]);
  });

  it('from round 2, between the DEMO STANDs', () => {
    expect(exCheck('anmc', true, 226)).toEqual([
      '32',
      false,
      [113, 114, 115, 116, 117],
    ]);
    expect(exCheck('anmc', true, 227)).toEqual([
      '39+3',
      true,
      [113, 114, 115, 116, 117],
    ]);
  });
});

describe("Giant's EX checks", () => {
  // Down held at Round 1's check (PC 328) or between round 2's Demo Stands
  // (PC 289) enters 'Chung Style' (37) or + 3, which set variable 0 to 100
  // and rejoin the displays they skip from (PCs 329, 290).
  it('in round 1, at Round 1 + 200', () => {
    expect(exCheck('giant', false, 299)).toEqual([
      '33',
      false,
      [340, 341, 342],
    ]);
    expect(exCheck('giant', false, 300)).toEqual(['37', true, [340, 341, 342]]);
  });

  it('from round 2, between the Demo Stands', () => {
    expect(exCheck('giant', true, 249)).toEqual(['30', false, [113, 114, 115]]);
    expect(exCheck('giant', true, 250)).toEqual([
      '37+3',
      true,
      [113, 114, 115],
    ]);
  });
});

describe("G Suneo's EX checks", () => {
  // Down held at Round 1's check (PC 403) enters 'change character' (41),
  // which sets variable 0 to 100 and rejoins at PC 405; Round 1 then shows
  // image 113 through 開始時 BR + 16 (PC 410). Between round 2's Demo
  // stands (PC 359) it enters 41 + 3, whose Demo stands play DEMO STAND2
  // (48), as their check of variable 0 jumps there inside each call (PC
  // 513).
  it('in round 1, at Round 1 + 214', () => {
    expect(exCheck('suneo', false, 313)).toEqual([
      '35',
      false,
      [139, 117, 118, 194],
    ]);
    expect(exCheck('suneo', false, 314)).toEqual([
      '34+16',
      true,
      [139, 117, 118, 113],
    ]);
  });

  it('from round 2, between the Demo stands', () => {
    expect(exCheck('suneo', true, 225)).toEqual([
      '32',
      false,
      [621, 622, 624, 623, 620],
    ]);
    expect(exCheck('suneo', true, 226)).toEqual([
      '41+3',
      true,
      [113, 114, 115, 116, 117, 118],
    ]);
  });
});

describe("SIN's EX checks", () => {
  // Down held at Round 1's check (PC 403) or between round 2's STAND DEMO
  // 2s (PC 372) enters 'hanshin change' (40), which sets variable 0 to 10
  // and rejoins 開始時 at PC 372: its STAND DEMO 2 plays STAND DEMO (29),
  // as its check of variable 0 jumps there inside the call (PC 324), and
  // runs out sooner.
  it('in round 1, at Round 1 + 125', () => {
    expect(exCheck('sin', false, 224)).toEqual(['36', false, [365]]);
    expect(exCheck('sin', false, 225)).toEqual([
      'idle',
      true,
      [113, 114, 115, 116, 117],
    ]);
  });

  it('from round 2, between the STAND DEMO 2s', () => {
    expect(exCheck('sin', true, 224)).toEqual(['33', false, [365]]);
    expect(exCheck('sin', true, 225)).toEqual([
      'idle',
      true,
      [113, 114, 115, 116, 117],
    ]);
  });
});

describe("KAY's EX checks", () => {
  // Down held at Round 1's check (PC 367) or between round 2's Demo stands
  // (PC 329) enters 'EX CH' (36), which sets variable 0 to 100 and jumps to
  // 開始時 + 25 (PC 408), its last Demo stand call (PC 330).
  const demo = [114, 115, 116, 117, 118, 119, 120, 113];
  it('in round 1, at Round 1 + 132', () => {
    expect(exCheck('kay', false, 231)).toEqual(['33', false, demo]);
    expect(exCheck('kay', false, 232)).toEqual(['36', true, demo]);
  });

  it('from round 2, between the Demo stands', () => {
    expect(exCheck('kay', true, 231)).toEqual(['30', false, demo]);
    expect(exCheck('kay', true, 232)).toEqual(['36', true, demo]);
  });
});

describe("DIDO's Round 1 roll", () => {
  // Round 1 opens with an op 0x20 roll (PC 377) that may take op2 (44): its
  // displays, a hop (PCs 500–511) held on image 400 until it lands in op2
  // + 26, then image 113 for 10 ticks. Each fighter rolls for itself: seed
  // 0's take op2 for player 1 and Round 1 for player 2.
  it('takes op2 for one fighter and Round 1 for the other', () => {
    const match = vsMatch('dido');
    const [p1, p2] = match.fighters;
    steps(match, 101);
    expect([named(p1), named(p2)]).toEqual(['44', '34']);
    steps(match, 240);
    expect([named(p1), named(p2)]).toEqual(['44+26', '34']);
    steps(match, 10);
    expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
    expect(at(p1)).toBeCloseTo(370 + 15 * speed(2870), 6);
  });
});

describe("SAKUYA's Round 1 rolls and EX checks", () => {
  // Round 1's op 0x20s take Random OP3 (45) in 2 of 4 (PC 397), and 89
  // ticks in RANDOM OP1 (41) in 2 of 6 (PC 403), which takes random op2
  // (42) in 1 of 3 (PC 416); both jump back to Round 1 + 17 (PCs 427, 440).
  it.each([
    [0, 101, ['40', '45']],
    [2, 190, ['45', '41']],
    [4, 190, ['40', '42']],
  ] as const)('seed %i: %i ticks in, %j', (seed, ticks, names) => {
    const match = vsMatch('sakuya', seed);
    steps(match, ticks);
    expect(match.fighters.map(named)).toEqual(names);
    steps(match, 351 - ticks);
    expect(match.fighters.map((f) => f.action)).toEqual(['idle', 'idle']);
  });

  // Down held at Round 1's check (PC 413) or round 2's (PC 364) enters 'ex
  // change' (49), which sets variable 0 to 100 and jumps to 開始時 1P + 24
  // (PC 522): STAND DEMO from its start, whose test of variable 0 takes
  // Skill1 (32, PC 296).
  it('in round 1, at Round 1 + 170', () => {
    expect(exCheck('sakuya', false, 269)).toEqual([
      '40',
      false,
      [117, 115, 116],
    ]);
    expect(exCheck('sakuya', false, 270)).toEqual([
      '49',
      true,
      [236, 237, 238],
    ]);
  });

  it('from round 2, after two STAND DEMOs', () => {
    expect(exCheck('sakuya', true, 269)).toEqual([
      '36',
      false,
      [117, 115, 116],
    ]);
    expect(exCheck('sakuya', true, 270)).toEqual(['49', true, [236, 237, 238]]);
  });
});

describe("ALEX's EX checks", () => {
  // Down held at Round 1's check (PC 356) enters 'EX change' (39), which
  // sets variable 0 to 100 and rejoins at PC 357; between round 2's DEMO
  // stands (PC 309) it enters + 3, which rejoins at PC 310, where DEMO
  // stand's test of variable 0 plays DEMO stand 2 (28, PC 254).
  it('in round 1, at Round 1 + 151', () => {
    expect(exCheck('alex', false, 250)).toEqual([
      '33',
      false,
      [333, 158, 334, 335],
    ]);
    expect(exCheck('alex', false, 251)).toEqual([
      '39',
      true,
      [333, 158, 334, 335],
    ]);
  });

  it('from round 2, between the DEMO stands', () => {
    expect(exCheck('alex', true, 245)).toEqual(['30', false, [117, 116, 115]]);
    expect(exCheck('alex', true, 246)).toEqual(['39+3', true, [363, 364, 365]]);
  });
});

describe("SOU's EX checks", () => {
  // Down held as Round 1 lands (PC 415) enters 'Change Character' (41),
  // which sets variable 0 to 10 and rejoins at PC 416; after round 2's DEMO
  // stands (PC 376) it enters + 3, which rejoins at PC 377. DEMO stand from
  // + 1 then tests variable 0 (PC 309) and plays DEMO stand 2 (30).
  it('in round 1, as Round 1 lands', () => {
    expect(exCheck('sou', false, 258)).toEqual([
      '37+10',
      false,
      [124, 123, 115, 116, 117],
    ]);
    expect(exCheck('sou', false, 259)).toEqual([
      '41',
      true,
      [124, 123, 349, 350, 351, 352, 353, 354],
    ]);
  });

  it('from round 2, after two DEMO stands', () => {
    expect(exCheck('sou', true, 277)).toEqual(['34', false, [115, 116, 117]]);
    expect(exCheck('sou', true, 278)).toEqual([
      '41+3',
      true,
      [349, 350, 351, 352, 353, 354],
    ]);
  });
});

describe("ERUS's EX checks", () => {
  // Down held at Round 1's check (PC 357) enters 'EX Ch' + 3 (39), which
  // sets variable 0 to 10 and rejoins at PC 358; after round 2's stand
  // demos (PC 320) it enters 'EX Ch', which rejoins at PC 321. His stand
  // demo has no EX form.
  it('in round 1, at Round 1 + 145', () => {
    const images = [258, 341, 116, 117, 118, 115];
    expect(exCheck('erus', false, 244)).toEqual(['35', false, images]);
    expect(exCheck('erus', false, 245)).toEqual(['39+3', true, images]);
  });

  it('from round 2, after two stand demos', () => {
    const images = [116, 117, 118, 115];
    expect(exCheck('erus', true, 269)).toEqual(['31', false, images]);
    expect(exCheck('erus', true, 270)).toEqual(['39', true, images]);
  });
});

describe("OS FENG's Round 1 roll and EX checks", () => {
  // Round 1 opens with an op 0x20 roll (PC 376) that takes OP2 (43) in 1 of
  // 3: calls of >OP2 RP1 and RP2 among its displays, its own EX check (PC
  // 538), running out 2 ticks after Round 1 does.
  it('takes OP2 for one fighter and Round 1 for the other', () => {
    const match = vsMatch('feng');
    const [p1, p2] = match.fighters;
    steps(match, 101);
    expect([named(p1), named(p2)]).toEqual(['43', '35']);
    steps(match, 248);
    expect([p1.action, p2.action]).toEqual(['script', 'idle']);
    match.step();
    match.step();
    expect(p1.action).toBe('idle');
  });

  // Down held at OP2's check (PC 538) enters 'OP TYPE CHANGE' + 7 (52),
  // which sets variable 0 to 100 and rejoins at OP2 + 21 (PC 589); after
  // round 2's Demo stands (PC 344) it enters + 3, which rejoins at PC 345,
  // where Demo stand's test of variable 0 plays Demo stand 2 (29, PC 286).
  it('in round 1, at OP2 + 184', () => {
    expect(exCheck('feng', false, 283)).toEqual(['43', false, [573, 138, 137]]);
    expect(exCheck('feng', false, 284)).toEqual([
      '52+7',
      true,
      [573, 138, 137],
    ]);
  });

  it('from round 2, after two Demo stands', () => {
    expect(exCheck('feng', true, 269)).toEqual([
      '32',
      false,
      [116, 117, 118, 115],
    ]);
    expect(exCheck('feng', true, 270)).toEqual([
      '52+3',
      true,
      [495, 496, 497, 494],
    ]);
  });
});

// `who` as player 1, `gap` from Ryuko, with three stocks, after `input`
// (held `held` ticks) or entering source action `input`: Ryuko's actions in
// order, the striker's branches and the life Ryuko has left.
function finish(
  vs: boolean,
  gap: number,
  input: Input | number,
  {
    held = 1,
    who = 'ryuko',
    ex = false,
    life,
    down,
    victim,
    press,
    air,
  }: FinishOptions = {},
) {
  const match = new Match('practice', false, 0, [who, 'ryuko'], 'court', vs);
  const [striker, target] = match.fighters;
  striker.x = 500;
  target.x = 500 + gap;
  striker.stock = 3;
  // EX mode: variable 0 at its EX value.
  if (ex) striker.variables[0] = EX_MODE[who]!.value;
  // A desperation super's op 0x11 wants low life.
  if (life) striker.hp = life;
  // A victim lying down, as a knockdown leaves it.
  if (down) {
    (match as unknown as { queue(f: Fighter, a: Action): void }).queue(
      target,
      'knockdown',
    );
    match.step();
  }
  if (typeof input === 'number' && air === undefined)
    enter(match, striker, input);
  const seen: string[] = [];
  const branches = new Set<string>();
  for (let t = 0; t < 3000; t++) {
    // An air move, entered `air` ticks into a jump.
    if (t === air) enter(match, striker, input as number);
    match.step(
      typeof input !== 'number' && t < held
        ? input
        : t === press?.[0]
          ? press[1]
          : air !== undefined && t < 1
            ? { jump: true }
            : {},
      // The victim's input for two ticks: a jump into an anti-air, a strike
      // into a counter.
      victim && t >= victim[0] && t < victim[0] + 2 ? victim[1] : undefined,
    );
    if (seen.at(-1) !== target.action) seen.push(target.action);
    if (striker.action === 'script') branches.add(String(striker.branch));
  }
  return { seen, hp: target.hp, branches };
}
type FinishOptions = {
  held?: number;
  who?: Who;
  ex?: boolean;
  life?: number;
  down?: boolean;
  victim?: readonly [number, Input];
  air?: number;
  // A press at a tick, for a follow-up's op 0x24.
  press?: readonly [number, Input];
};

describe("Ryuko's ZA finishers (global 3 > 0)", () => {
  // Each ZA form swaps its op 0x15 life loss for an attack box (op 0x18),
  // whose response a contact queues after the op 0x14 one.
  it('Chuck Hit ZA (198) strikes for 20 where Chuck Hit takes 30', () => {
    const br = finish(false, 110, { throw: true }, { held: 9 });
    const vs = finish(true, 110, { throw: true }, { held: 9 });
    expect([br.branches.has('198'), vs.branches.has('198')]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual([480, 490]);
    expect(br.seen.slice(0, 3)).toEqual(['idle', 'superHeld', 'dstToss']);
    expect(vs.seen.slice(0, 4)).toEqual([
      'idle',
      'superHeld',
      'rushAirHit',
      'dstToss',
    ]);
  });

  it('DST Hit ZA (216) strikes for 10, and both missiles then connect', () => {
    const br = finish(false, 120, { dst: true });
    const vs = finish(true, 120, { dst: true });
    expect(vs.branches.has('216')).toBe(true);
    // Op 0x15's 10, then one missile's 22; a box's 10, then two.
    expect([br.hp, vs.hp]).toEqual([510 - 10 - 22, 510 - 10 - 2 * 22]);
  });

  it('MUSASHI HIT ZA (258) strikes for the 120 Musashi Hit takes', () => {
    const br = finish(false, 130, { musashi: true });
    const vs = finish(true, 130, { musashi: true });
    expect(vs.branches.has('258')).toBe(true);
    expect([br.hp, vs.hp]).toEqual([390, 390]);
    expect(vs.seen.slice(1, 4)).toEqual(['superHeld', 'rushAirHit', 'fly']);
  });

  it('GCA hit 2 ZA (322) strikes with a box that re-arms each display', () => {
    const br = finish(false, 120, { changeAttack: true });
    const vs = finish(true, 120, { changeAttack: true });
    expect(vs.branches.has('322')).toBe(true);
    // Op 0x15's 40 and ten beam hits of 6; the ZA box's 39 three times,
    // op 0x15's 1, and the same beam.
    expect([br.hp, vs.hp]).toEqual([510 - 40 - 60, 510 - 3 * 39 - 1 - 60]);
  });
});

describe("Kiki's ZA finisher (global 3 > 0)", () => {
  it('CHUCK HIT ZA (209, PC 2861) strikes for the 20 CHUCK HIT takes', () => {
    const br = finish(false, 110, { throw: true }, { held: 9, who: 'kiki' });
    const vs = finish(true, 110, { throw: true }, { held: 9, who: 'kiki' });
    expect([br.branches.has('209'), vs.branches.has('209')]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual([490, 490]);
    // Response 76 (op 0x14, PC 2878), then the box's 32 (PC 2881) where
    // CHUCK HIT applies 32 (PC 2862).
    expect(br.seen.slice(0, 3)).toEqual(['idle', 'superHeld', 'twist']);
    expect(vs.seen.slice(0, 4)).toEqual([
      'idle',
      'superHeld',
      'rushAirHit',
      'twist',
    ]);
  });
});

describe("Chung's ZA finishers (global 3 > 0)", () => {
  // Each swaps op 0x15's life for a box: the move entered, its ZA form, the
  // gap, EX mode, and the life Ryuko has left without and with VS. P3 Hit
  // ZA's kind-2 box spans two displays (PCs 2451–2452) and re-arms at each
  // (0x41257d), so it strikes twice for 35; en300 end ZA's two boxes strike
  // for the 50 and 120 its op 0x15s take.
  it.each([
    ['P3 Hit ZA (187, PC 2431)', 185, 187, 80, false, [475, 440]],
    ['Chuck hit ZA (223, PC 3086)', 221, 223, 80, false, [470, 470]],
    ['EX chuck Hit ZA (227, PC 3159)', 221, 227, 80, true, [470, 470]],
    ['Orochi hit ZA (252, PC 3600)', 250, 252, 130, false, [470, 470]],
    ['lee lend ZA (286, PC 4197)', 281, 286, 100, false, [410, 410]],
    ['Evil LEE last lend ZA (303, PC 4522)', 294, 303, 400, true, [391, 391]],
    ['en300 end ZA (334, PC 5226)', 329, 334, 120, false, [289, 289]],
  ] as const)('%s', (_, move, za, gap, ex, hp) => {
    const br = finish(false, gap, move, { who: 'chung', ex });
    const vs = finish(true, gap, move, { who: 'chung', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("Amiro's ZA finishers (global 3 > 0)", () => {
  // The move entered, its ZA form, the gap, EX mode, and the life Ryuko has
  // left without and with VS: each box strikes for what op 0x15 takes. EX
  // P3 Hit ZA applies response 59 where the others apply 76 (PC 2754).
  it.each([
    ['EX P3 Hit ZA (188, PC 2742)', 186, 188, 80, true, [470, 470]],
    ['Chuck hit ZA (211, PC 3246)', 209, 211, 80, false, [490, 490]],
    ['cc hit ZA (244, PC 3737)', 242, 244, 100, false, [480, 480]],
    ['ERX Fin Grab Hit ZA (361, PC 5805)', 359, 361, 80, false, [440, 440]],
    ['WHIP Fin ZA (373, PC 6074)', 368, 373, 120, true, [409, 409]],
  ] as const)('%s', (_, move, za, gap, ex, hp) => {
    const br = finish(false, gap, move, { who: 'amiro', ex });
    const vs = finish(true, gap, move, { who: 'amiro', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("ANMC P's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for the 25 or 100 its op 0x15 takes. CHUCK enters
  // cHUCK NEW (232), or CHUCK (238) in EX mode (PC 3143).
  it('cHUCK HIT NEW ZA (234, PC 3186)', () => {
    const br = finish(false, 80, { throw: true }, { held: 9, who: 'anmc' });
    const vs = finish(true, 80, { throw: true }, { held: 9, who: 'anmc' });
    expect([br.branches.has('234'), vs.branches.has('234')]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual([485, 485]);
  });

  it.each([
    ['CHUCK HIT ZA (240, PC 3264)', 232, 240, 80, true, [485, 485]],
    ['chuck sp hit ZA (298, PC 4114)', 296, 298, 100, false, [410, 410]],
  ] as const)('%s', (_, move, za, gap, ex, hp) => {
    const br = finish(false, gap, move, { who: 'anmc', ex });
    const vs = finish(true, gap, move, { who: 'anmc', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("Giant's VS finishers", () => {
  // Each ZA box strikes for what op 0x15 takes. counter start (278) enters
  // New movieng chuck (290) in EX mode (PC 4261), whose hit runs into
  // Moving C fin (293, PC 4483).
  it.each([
    ['K3 hit ZA (198, PC 2839)', 196, 198, false, [470, 470]],
    ['New K3 Hit ZA (203, PC 2933)', 201, 203, false, [470, 470]],
    ['Counter hit ZA (283, PC 4341)', 279, 283, false, [450, 450]],
    ['Moving C fin ZA (294, PC 4537)', 278, 294, true, [470, 470]],
  ] as const)('%s', (_, move, za, ex, hp) => {
    const br = finish(false, 80, move, { who: 'giant', ex });
    const vs = finish(true, 80, move, { who: 'giant', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });

  it('sings SINGING START through (PC 3306) where Chuck hit ZA (221) sings less', () => {
    // Chuck hit jumps into SINGING START (PC 3270), whose global 3 = 0 test
    // takes 221 (820 ticks) outside VS; VS sings its own (PCs 3307–3346)
    // and returns to Chuck hit + 32: 40 ticks sooner into FLY NO HIT.
    const flies = (vs: boolean) => {
      const match = new Match(
        'practice',
        false,
        0,
        ['giant', 'ryuko'],
        'court',
        vs,
      );
      const [giant, ryuko] = match.fighters;
      giant.x = 500;
      ryuko.x = 580;
      const branches = new Set<string>();
      for (let t = 0; t < 2000; t++) {
        match.step(t < 9 ? { throw: true } : {});
        if (giant.action === 'script') branches.add(String(giant.branch));
        if (ryuko.action === 'stun') return [branches.has('221'), t];
      }
    };
    expect(flies(false)).toEqual([true, 903]);
    expect(flies(true)).toEqual([false, 863]);
  });
});

describe("G Suneo's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. CHUCK enters CHUCK HIT NEW, or
  // CHUCK HIT in EX mode; HH Start (345) wants life below 150 (op 0x11, PC
  // 5436).
  it.each([
    [
      'CHUCK HIT NEW ZA (229, PC 3341)',
      { throw: true },
      229,
      false,
      0,
      [490, 490],
    ],
    ['CHUCK HIT ZA (230, PC 3377)', { throw: true }, 230, true, 0, [490, 490]],
    ['HH hit 2 ZA (348, PC 5545)', 345, 348, false, 100, [260, 260]],
  ] as const)('%s', (_, move, za, ex, life, hp) => {
    const options = { held: 9, who: 'suneo', ex, life } as const;
    const br = finish(false, 80, move, options);
    const vs = finish(true, 80, move, options);
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("Yo's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes; Press Hit ZA's op 0x15 then
  // takes 1 more (PC 3328).
  it.each([
    ['Chuck hit ZA (203, PC 2713)', { throw: true }, 203, [475, 475]],
    ['Zombi hit ZA (221, PC 3009)', 218, 221, [475, 475]],
    ['Press Hit ZA (240, PC 3308)', 238, 240, [410, 409]],
  ] as const)('%s', (_, move, za, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'yo' });
    const vs = finish(true, 80, move, { held: 9, who: 'yo' });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("SIN's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. At life 165 or below Clack
  // chuck and RUN CHUCK take their EVIL forms (op 0x11, PCs 3103, 3515) and
  // NOZAN starts; LOW CHUCK START's first box (PC 2960) catches a victim
  // lying down into LOw Chuck hit Down (221, PC 2958).
  it.each([
    ['Chuck hit ZA (206, PC 2754)', { throw: true }, 206, {}, [480, 480]],
    ['LOw Chuck hit ZA (222, PC 2997)', 219, 222, {}, [475, 475]],
    [
      'LOw Chuck hit Down ZA (223, PC 3030)',
      219,
      223,
      { down: true },
      [490, 490],
    ],
    ['New CC down ZA (229, PC 3130)', 225, 229, {}, [455, 455]],
    ['EVIL CLACK FIN ZA (245, PC 3400)', 225, 245, { life: 100 }, [440, 440]],
    ['RUN C DOWN ZA (251, PC 3526)', 247, 251, {}, [455, 455]],
    ['EVIL RUN C DOWN ZA (253, PC 3561)', 247, 253, { life: 100 }, [445, 445]],
    ['RUN CHUCK DOWN ZA (260, PC 3684)', 247, 260, { ex: true }, [445, 445]],
    ['RUN CHUCK SUPER ZA (267, PC 3781)', 272, 267, { ex: true }, [390, 390]],
    ['new src down ZA (278, PC 3991)', 272, 278, {}, [390, 390]],
    ['new en300 hit ZA (299, PC 4323)', 296, 299, {}, [280, 280]],
    ['NOZAN FIN ZA (321, PC 4785)', 310, 321, { life: 100 }, [260, 260]],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'sin', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'sin', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });

  it('takes nozan SF BR (318) outside VS and nozan SF2 in VS (PC 4682)', () => {
    const sf = (vs: boolean) =>
      finish(vs, 80, 310, { who: 'sin', life: 100 }).branches.has('318');
    expect([sf(false), sf(true)]).toEqual([true, false]);
  });
});

describe("LIZARD's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. HID START (279) wants life
  // below 153 (op 0x11, PC 3749).
  it.each([
    ['chuck hit ZA (211, PC 2886)', { throw: true }, 211, 0, [490, 490]],
    ['jump hit ZA (235, PC 3207)', 230, 235, 0, [470, 470]],
    ['HID HIT ZA (283, PC 3821)', 279, 283, 100, [430, 430]],
  ] as const)('%s', (_, move, za, life, hp) => {
    const options = { held: 9, who: 'lizard', life } as const;
    const br = finish(false, 80, move, options);
    const vs = finish(true, 80, move, options);
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("KAY's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes, EX Shamshel Hit Fin ZA's 40
  // where the Br. form's takes 30 (PC 4089). At life 150 or below Comment
  // Chuck and EX Sachiel take their Evil forms; Lilith (258) enters EX
  // Sachiel in EX mode (PC 4122), and Chuck at its op 0x24 (PC 4197)
  // enters EX Sachiel G. Matriel (280) strikes rising (PC 4559): an
  // anti-air.
  const sachiel = [30, { throw: true }] as [number, Input];
  it.each([
    ['Chuck hit ZA (225, PC 3426)', { throw: true }, 225, {}, [485, 485]],
    ['CC hit ZA (243, PC 3745)', 240, 243, {}, [480, 480]],
    ['Evil CC hit ZA (247, PC 3879)', 241, 247, { life: 100 }, [450, 450]],
    [
      'EX Shamshel Hit Fin ZA (256, PC 4087)',
      240,
      256,
      { ex: true },
      [480, 470],
    ],
    [
      'EX Sachiel G hit ZA (269, PC 4263)',
      258,
      269,
      { ex: true, press: sachiel },
      [465, 465],
    ],
    [
      'EX Sachiel G hit ZA Evil (270, PC 4348)',
      258,
      270,
      { ex: true, life: 100, press: sachiel },
      [450, 450],
    ],
    [
      'Matriel hit ZA (282, PC 4617)',
      280,
      282,
      { victim: [0, { jump: true }] },
      [470, 470],
    ],
    ['Kaoru hit ZA (342, PC 5690)', 339, 342, {}, [410, 410]],
    ['en300 drop ZA (369, PC 6220)', 361, 369, {}, [280, 280]],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'kay', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'kay', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("DIDO's ZA finisher (global 3 > 0)", () => {
  it('Chuck hit ZA (227, PC 3237) strikes for what op 0x15 takes', () => {
    const br = finish(false, 80, { throw: true }, { held: 9, who: 'dido' });
    const vs = finish(true, 80, { throw: true }, { held: 9, who: 'dido' });
    expect([br.branches.has('227'), vs.branches.has('227')]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual([480, 480]);
  });
});

describe("SAKUYA's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. counter (318) sets variable 4
  // to 100 (PC 4923), so a strike takes her hit reactions into NewCounter
  // Get (319, PCs 883, 922, ...).
  it.each([
    ['Chuck Hit ZA (252, PC 3636)', { throw: true }, 252, {}, [490, 490]],
    [
      'New Counter get2 ZA (323, PC 5012)',
      318,
      323,
      { victim: [0, { punch: true }] },
      [470, 470],
    ],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'sakuya', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'sakuya', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("ALEX's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. GYSA FAR (308) takes EX en
  // chuck far (331) in EX mode (PC 4517), which hits into EN chuck hit.
  it.each([
    ['chuck hit ZA (221, PC 3274)', { throw: true }, 221, false, [490, 490]],
    ['EN chuck hit ZA (334, PC 4899)', 308, 334, true, [410, 410]],
  ] as const)('%s', (_, move, za, ex, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'alex', ex });
    const vs = finish(true, 80, move, { held: 9, who: 'alex', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("SOU's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes. Chuck takes ex Chuck hit and
  // Rangeki Start EX SLASH SUP (456, PC 7115) in EX mode; Beast FIN hit
  // takes BA Stop (418) for global 3 = 0 (PC 6751), so only the Br. path
  // plays it.
  it.each([
    ['Chuck hit ZA (218, PC 2943)', { throw: true }, 218, false, [495, 495]],
    ['ex Chuck hit ZA (220, PC 2977)', { throw: true }, 220, true, [495, 495]],
    ['beast att3 ZA (415, PC 6718)', 403, 415, false, [300, 300]],
    ['>EX SLASH HIT Land ZA (460, PC 7452)', 444, 460, true, [410, 410]],
  ] as const)('%s', (_, move, za, ex, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'sou', ex });
    const vs = finish(true, 80, move, { held: 9, who: 'sou', ex });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });

  it('plays BA Stop (418) only outside VS', () => {
    const stop = (vs: boolean) =>
      finish(vs, 80, 403, { who: 'sou' }).branches.has('418');
    expect([stop(false), stop(true)]).toEqual([true, false]);
  });
});

describe("HISO's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes; Fly Arm hit Fin ZA's is
  // *CARD EXPLOR ZA's (285), which it spawns (PC 4312).
  it.each([
    ['Chuck hit ZA (224, PC 3252)', { throw: true }, 224, [480, 480]],
    ['Fly Arm hit Fin ZA (287, PC 4284)', 278, 287, [410, 410]],
    ['Fish hit ZA (296, PC 4482)', 289, 296, [430, 430]],
  ] as const)('%s', (_, move, za, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'hiso' });
    const vs = finish(true, 80, move, { held: 9, who: 'hiso' });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("ERUS's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes, chuck hit ZA's 25 where the
  // Br. form takes 30 (PC 3066). In EX mode the TELPs take their CCs (PCs
  // 3932, 3968, ...), air fire start EX Air Chuck (PC 4598) and en300
  // START EX EN3. CC PK, the air moves and LIZARD FLY strike a jumping
  // victim. ponytail: CC K Hit Fin ZA enters at CC K Hit (269), as CC K's
  // box sits 9923 below it (PC 4152) and nothing found reaches its hit.
  const jumping = [0, { jump: true }] as [number, Input];
  it.each([
    ['chuck hit ZA (215, PC 3064)', { throw: true }, 215, {}, [480, 485]],
    ['CC P Hit ZA (266, PC 4087)', 260, 266, { ex: true }, [485, 485]],
    ['CC K Hit Fin ZA (272, PC 4284)', 269, 272, {}, [485, 485]],
    [
      'CC PK Hit ZA (280, PC 4452)',
      262,
      280,
      { ex: true, victim: jumping },
      [485, 485],
    ],
    [
      'EXAIRC HIT ZA (299, PC 4720)',
      291,
      299,
      { ex: true, air: 5, victim: jumping },
      [490, 490],
    ],
    ['scc HIT ZA (372, PC 6106)', 369, 372, {}, [430, 430]],
    [
      'Air CC hit ZA (382, PC 6292)',
      375,
      382,
      { air: 5, victim: jumping },
      [450, 450],
    ],
    [
      'lizard fly att hit ZA (391, PC 6427)',
      387,
      391,
      { victim: [40, { jump: true }] as [number, Input] },
      [430, 430],
    ],
    ['EN300 hit ZA (406, PC 6647)', 399, 406, {}, [349, 349]],
    ['EX EN3 Hit ZA (509, PC 9029)', 399, 509, { ex: true }, [370, 370]],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'erus', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'erus', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("OS FENG's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes; New Chuck Hit ZA's and Chuck
  // hit ZA's op 0x15 then take 1 more (PCs 3116, 3205), Chuck hit ZA's box
  // 1 less. K3 (206) is the third link of P and K's chain (op 0x24, PCs
  // 2529, 2654), entered here; Chuck takes New Chuck Hit in EX mode; A SUCK
  // START is SUCK's air form, striking a jumping victim.
  it.each([
    ['K3 hit ZA (208, PC 2703)', 206, 208, {}, [474, 474]],
    [
      'New Chuck Hit ZA (232, PC 3098)',
      { throw: true },
      232,
      { ex: true },
      [490, 489],
    ],
    ['Chuck hit ZA (236, PC 3187)', { throw: true }, 236, {}, [475, 475]],
    ['SUCK HIT ZA (263, PC 3733)', 260, 263, {}, [465, 465]],
    [
      '>A SUCK HIT ZA (270, PC 3838)',
      267,
      270,
      { air: 20, victim: [0, { jump: true }] },
      [465, 465],
    ],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'feng', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'feng', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});

describe("SEAN's ZA finishers (global 3 > 0)", () => {
  // Each box strikes for what op 0x15 takes; CC start AIR (232) strikes a
  // jumping victim.
  it.each([
    ['Chuck hit ZA (213, PC 3090)', { throw: true }, 213, {}, [480, 480]],
    [
      'air CC hit ZA (235, PC 3447)',
      232,
      235,
      { air: 3, victim: [0, { jump: true }] },
      [465, 465],
    ],
    ['SCC hit1-2 2 (264, PC 3865)', 256, 264, {}, [420, 420]],
  ] as const)('%s', (_, move, za, options, hp) => {
    const br = finish(false, 80, move, { held: 9, who: 'sean', ...options });
    const vs = finish(true, 80, move, { held: 9, who: 'sean', ...options });
    expect([br.branches.has(`${za}`), vs.branches.has(`${za}`)]).toEqual([
      false,
      true,
    ]);
    expect([br.hp, vs.hp]).toEqual(hp);
  });
});
