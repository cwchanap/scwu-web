import { describe, expect, it } from 'vitest';
import { animationFrame } from './animations';
import type { Who } from './characters';
import { FIGHT_TICK } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { enter, named } from './testing';

// A Vs. match the select screen started: global 3 is 50 (KGT PCs 541, 548,
// 585), global 10 is 0 (PC 542), so each 開始時 takes its VS path.
const vsMatch = (who: Who = 'ryuko') =>
  new Match('cpu', true, 0, [who, who], 'court', true);
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
// row: those actions and images, round 2's images by age, and the ticks to
// idle in rounds 1 and 2.
const TEMPLATE: {
  who: Who;
  start: number;
  round1: number;
  banner: number;
  image: number;
  charge: number;
  demo: [number, number][];
  idle: [number, number];
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
];

describe.each(TEMPLATE)(
  "$who's VS 開始時 ($start)",
  ({ who, start, round1, banner, image, charge, demo, idle }) => {
    it('dashes, crosses and stands, then plays its round 1 action', () => {
      const match = vsMatch(who);
      const [p1, p2] = match.fighters;
      steps(match, 5);
      expect([p1.branch, p2.branch]).toEqual([start, start]);
      // The round copy passes in round 1: VS 1P twice, and the dash.
      match.step();
      expect([p1.branch, at(p1), at(p2)]).toEqual([`${start}+9`, 370, 910]);
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
      expect(animationFrame(`${start}+9`, p1.age, who).image).toBe(image);
      match.step();
      expect([p1.branch, p2.branch]).toEqual([round1, round1]);
      // OP super Charge takes VS CHARGE for global 3 > 40.
      match.step();
      expect(
        match.effects.filter((e) => e.clip === charge).map((e) => e.owner),
      ).toEqual([0, 1]);
      steps(match, idle[0] - 103);
      expect([named(p1), named(p2)]).toEqual([`${round1}`, `${round1}`]);
      match.step();
      expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
      expect(at(p1)).toBeCloseTo(370 + cross, 6);
      while (match.roundTicks < FIGHT_TICK - 1) match.step();
      expect(match.fighters.map((f) => [f.stock, f.power])).toEqual([
        [0, 0],
        [0, 0],
      ]);
    });

    it('plays its round 2 images where round 1 has the banners', () => {
      const match = vsMatch(who);
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

describe("Chung's EX checks", () => {
  // Down held at ROUND 1's check (PC 338) or between round 2's Demo stands
  // (PC 308) enters Change EX (35) or + 3, which set variable 0 to 100 and
  // call Demo stand once or three times: Demo stand EX (28), as its check
  // of variable 0 jumps there inside each call (PC 259).
  const run = (round2: boolean, tick: number) => {
    const match = vsMatch('chung');
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
        images.push(animationFrame(p1.branch!, p1.age, 'chung').image);
    }
    return [named(p1), exMode(p1), [...new Set(images)]];
  };

  it('in round 1, at ROUND 1 + 200', () => {
    expect(run(false, 299)).toEqual(['33', false, [113, 114, 115]]);
    expect(run(false, 300)).toEqual(['35', true, [372, 373, 374]]);
  });

  it('from round 2, between the Demo stands', () => {
    expect(run(true, 199)).toEqual(['30', false, [113, 114, 115]]);
    expect(run(true, 200)).toEqual(['35+3', true, [372, 373, 374]]);
  });
});

// `who` as player 1, `gap` from Ryuko, with three stocks, after `input`
// (held `held` ticks) or entering source action `input`: Ryuko's actions in
// order, the striker's branches and the life Ryuko has left.
function finish(
  vs: boolean,
  gap: number,
  input: Input | number,
  { held = 1, who = 'ryuko', ex = false }: FinishOptions = {},
) {
  const match = new Match('practice', false, 0, [who, 'ryuko'], 'court', vs);
  const [striker, target] = match.fighters;
  striker.x = 500;
  target.x = 500 + gap;
  striker.stock = 3;
  // EX mode: variable 0 at 100.
  if (ex) striker.variables[0] = 100;
  if (typeof input === 'number') enter(match, striker, input);
  const seen: string[] = [];
  const branches = new Set<string>();
  for (let t = 0; t < 3000; t++) {
    match.step(typeof input !== 'number' && t < held ? input : {});
    if (seen.at(-1) !== target.action) seen.push(target.action);
    if (striker.action === 'script') branches.add(String(striker.branch));
  }
  return { seen, hp: target.hp, branches };
}
type FinishOptions = { held?: number; who?: Who; ex?: boolean };

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
