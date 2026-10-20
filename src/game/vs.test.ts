import { describe, expect, it } from 'vitest';
import { animationFrame } from './animations';
import type { Who } from './characters';
import { FIGHT_TICK } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { named } from './testing';

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
    const other = new Match('cpu', true, 0, ['zoma', 'kiki'], 'court', true);
    expect(other.fighters.map((f) => f.action)).toEqual(['intro', 'intro']);
  });
});

describe("Zoma's VS 開始時 (28)", () => {
  it('crosses as Ryuko does, then plays Start N (31) from its start', () => {
    const match = vsMatch('zoma');
    const [p1, p2] = match.fighters;
    steps(match, 5);
    expect([p1.branch, p2.branch]).toEqual([28, 28]);
    // Round 1 (PC 269) spawns VS 1P (53) twice (PCs 272–273) and dashes.
    match.step();
    expect([p1.branch, at(p1), at(p2)]).toEqual(['28+9', 370, 910]);
    match.step();
    expect(banners(match, 53)).toEqual([
      [0, 53, 1],
      [0, '53+9', 1],
      [1, 53, -1],
      [1, '53+9', -1],
    ]);
    steps(match, 23);
    const cross = 15 * speed(2870);
    expect(at(p1)).toBeCloseTo(370 + cross, 6);
    expect(at(p2)).toBeCloseTo(910 - cross, 6);
    expect(banners(match, 53)).toEqual([
      [0, 53, 1],
      [0, '53+9', 1],
    ]);
    // Image 113 for 70 ticks (PC 280), then Start N from its start (PC
    // 284), whose 250 ticks of displays (PCs 308–321) don't move him.
    steps(match, 70);
    expect([p1.branch, animationFrame('28+9', p1.age, 'zoma').image]).toEqual([
      '28+9',
      113,
    ]);
    match.step();
    expect([p1.branch, p2.branch]).toEqual([31, 31]);
    // OP super Charge (36) takes VS CHARGE (35) for global 3 > 40 (PC 378).
    match.step();
    expect(
      match.effects.filter((e) => e.clip === 35).map((e) => e.owner),
    ).toEqual([0, 1]);
    steps(match, 248);
    expect([named(p1), named(p2)]).toEqual(['31', '31']);
    match.step();
    expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
    expect(at(p1)).toBeCloseTo(370 + cross, 6);
    while (match.roundTicks < FIGHT_TICK - 1) match.step();
    expect(match.fighters.map((f) => [f.stock, f.power])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it('shows image 114, then DEMO STAND four times from round 2', () => {
    const match = vsMatch('zoma');
    while (match.roundTicks < FIGHT_TICK) match.step();
    match.fighters[1].hp = 0;
    while (match.round === 1) match.step();
    const [p1, p2] = match.fighters;
    steps(match, 6);
    expect([p1.branch, at(p1), at(p2), banners(match, 53)]).toEqual([
      28,
      370,
      910,
      [],
    ]);
    // Image 113 from age 30 (PC 280), 114 for 30 (PC 285), then DEMO STAND
    // (41) four times (PC 286): 113, 114, 115 and 114 for 11, 11, 22, 11.
    expect(
      [29, 30, 99, 100, 129, 130, 141, 152, 174, 185, 349].map(
        (age) => animationFrame(28, age, 'zoma').image,
      ),
    ).toEqual([0, 113, 113, 114, 114, 113, 114, 115, 114, 113, 114]);
    steps(match, 344);
    expect([p1.branch, p2.branch]).toEqual([28, 28]);
    match.step();
    expect([p1.action, p2.action]).toEqual(['idle', 'idle']);
  });
});

// Ryuko as player 1, `gap` from the other, with three stocks.
function zaMatch(vs: boolean, gap: number) {
  const match = new Match(
    'practice',
    false,
    0,
    ['ryuko', 'ryuko'],
    'court',
    vs,
  );
  const [ryuko, target] = match.fighters;
  ryuko.x = 500;
  target.x = 500 + gap;
  ryuko.stock = 3;
  return { match, ryuko, target };
}
// The victim's actions in order, and the life it has left.
function finish(vs: boolean, gap: number, input: Input, held = 1) {
  const { match, ryuko, target } = zaMatch(vs, gap);
  const seen: string[] = [];
  const branches = new Set<string>();
  for (let t = 0; t < 900; t++) {
    match.step(t < held ? input : {});
    if (seen.at(-1) !== target.action) seen.push(target.action);
    if (ryuko.action === 'script') branches.add(String(ryuko.branch));
  }
  return { seen, hp: target.hp, branches };
}

describe("Ryuko's ZA finishers (global 3 > 0)", () => {
  // Each ZA form swaps its op 0x15 life loss for an attack box (op 0x18),
  // whose response a contact queues after the op 0x14 one.
  it('Chuck Hit ZA (198) strikes for 20 where Chuck Hit takes 30', () => {
    const br = finish(false, 110, { throw: true }, 9);
    const vs = finish(true, 110, { throw: true }, 9);
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
