import { describe, expect, it } from 'vitest';
import {
  addPower,
  afterimageColor,
  exMode,
  fighterPose,
  FIGHTER_MARGIN,
  FixedClock,
  LIFE,
  firstStrike,
  Match,
  WIDTH,
  STAGE_WIDTH,
  stepShake,
} from './match';
import type { Effect, Fighter, Input } from './match';
import type { DummyBehavior } from './dummy';
import { CpuVM } from './cpu';
import type { CpuEntry } from './cpu';
import { FIGHT_TICK, ROUND_END_TICKS } from './hud';
import {
  animationDuration,
  animationFrame,
  INTRO_EX_TICK,
  NORMAL_COLOR,
  RESPONSE_EFFECTS,
} from './animations';
import { rand } from './standing';
import {
  base,
  enter,
  named,
  objects,
  playing,
  pose,
  RYUKO,
  spawn,
  strike,
} from './testing';

function ticks(
  match: Match,
  count: number,
  input: Input = {},
  opponent: Input = {},
) {
  for (let i = 0; i < count; i++) match.step(input, opponent);
}

// Steps an ending until its result shows.
function untilResult(match: Match) {
  for (let tick = 0; tick < 2000 && !match.resultReady; tick++)
    match.step({}, {});
  expect(match.resultReady).toBe(true);
}

// Air Drill's contact branches: each spin's hit and guard handlers (209 +
// 12/23, 209 + 42/43, 210 and 211 + 12/13), which shake on image 136.
const DRILL_CONTACT = /^(209\+(12|23|42|43)|21[01]\+1[23])$/;
// A side's axes (227), flying or breaking into their impact (230).
const axes = (match: Match, owner?: number) =>
  match.effects.filter(
    (e) =>
      [RYUKO.axe, RYUKO.axeHit].includes(base(e.clip) as 227 | 230) &&
      (owner === undefined || e.owner === owner),
  );
// The response hit effects 0x40f567 spawns at contact.
const HIT_EFFECTS = new Set(RESPONSE_EFFECTS.filter(Boolean));
const hitEffects = (match: Match) =>
  match.effects.filter((e) => HIT_EFFECTS.has(e.clip as number));
// An object (op 0x04) of fighter `owner`, as the effect pass keeps them.
const object = (
  clip: Effect['clip'],
  owner: number,
  fields: Partial<Effect> = {},
): Effect => ({
  clip,
  who: 'ryuko',
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ax: 0,
  gravity: 0,
  facing: 1,
  age: 0,
  front: true,
  owner,
  slot: 0,
  screen: false,
  follow: null,
  box: null,
  objectBox: null,
  responses: [],
  connected: false,
  color: NORMAL_COLOR,
  trail: null,
  ...fields,
});

describe('Hit Up launcher', () => {
  it.each([1, -1] as const)(
    'steps forward, pauses, launches and recovers facing %i',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 440 : 1100;
      target.x = attacker.x + facing * 220;
      const startX = attacker.x;
      ticks(match, 8, { hitUp: true });
      expect((attacker.x - startX) * facing).toBeCloseTo(120.084, 3);
      ticks(match, 7);
      expect(attacker.age).toBe(14);
      expect(target.hp).toBe(LIFE);
      match.step();
      expect(attacker).toMatchObject({
        action: 'script',
        branch: RYUKO.hitUpRecover,
        hitStop: 33,
      });
      // Hit Up's box (PC 2824) deals 15.
      expect(target).toMatchObject({
        action: 'launchUp',
        hitStop: 10,
        hp: LIFE - 15,
      });
      const contactX = target.x;
      ticks(match, 34, {}, { jump: true, punch: true });
      expect(target).toMatchObject({ age: 24, y: 0, x: contactX });
      match.step();
      expect(target.age).toBe(25);
      expect(target.y).toBeCloseTo(-24.946, 3);
      expect((target.x - contactX) * facing).toBeCloseTo(2.39868, 4);
      const seen = new Set<string>();
      let apex = 0;
      for (let tick = 0; tick < 210; tick++) {
        seen.add(target.action);
        apex = Math.min(apex, target.y);
        match.step({}, { punch: true });
      }
      // Sum 47 source integration steps: -47*v + g*47*48/2.
      expect(apex).toBeCloseTo(-589.056, 3);
      expect(seen).toEqual(new Set(['launchUp', 'knockdown', 'getUp', 'idle']));
      expect(target).toMatchObject({ y: 0, vx: 0, vy: 0, hp: LIFE - 15 });
      expect(attacker.hits).toBe(1);
      expect(match.cameraY).toBe(0);
    },
  );

  it.each([2, 16, 40])(
    'chases on up held from tick %i through the check at recovery age 5 (PC 2837)',
    (jumpTick) => {
      const match = new Match();
      const [attacker] = match.fighters;
      attacker.x = 440;
      for (let tick = 0; tick < 110; tick++) {
        match.step({ hitUp: tick === 0, jump: tick >= jumpTick }, {});
        if (playing(attacker) === RYUKO.hitUpJump) break;
      }
      expect(attacker).toMatchObject({
        action: 'script',
        branch: RYUKO.hitUpJump,
        age: 0,
        y: 0,
      });
      ticks(match, 7, { jump: true });
      expect(attacker.y).toBe(0);
      match.step({ jump: true });
      expect(attacker.y).toBeCloseTo(-22.5596, 4);
      expect(attacker.vx).toBeCloseTo(4.79736, 4);
      ticks(match, 10, { jump: true });
      expect(playing(attacker)).toBe(RYUKO.hitUpJump);
    },
  );

  // Contact at tick 15 stops Hit Up 33 ticks; 201 reaches age 5 at tick 53.
  it.each([
    [33, false],
    [34, true],
    [53, true],
    [54, false],
  ] as const)(
    'reads one tick of up at tick %i against the 20-tick window: %s',
    (tick, chased) => {
      const match = new Match();
      const [attacker] = match.fighters;
      attacker.x = 440;
      const actions = new Set<unknown>();
      for (let t = 0; t < 120; t++) {
        match.step({ hitUp: t === 0, jump: t === tick }, {});
        actions.add(playing(attacker));
      }
      expect(actions.has(RYUKO.hitUpJump)).toBe(chased);
    },
  );

  it('lets the chase connect aerial attacks and keeps the flight in view', () => {
    const match = new Match();
    match.fighters[0].x = 440;
    let highestCamera = 0;
    for (let tick = 0; tick < 260; tick++) {
      match.step(
        { hitUp: tick === 0, jump: tick === 40, kick: tick === 70 },
        {},
      );
      highestCamera = Math.min(highestCamera, match.cameraY);
      expect(match.cameraY).toBeGreaterThanOrEqual(-720);
      expect(match.cameraY).toBeLessThanOrEqual(0);
    }
    // Hit Up's 15, then the air kick's three 4s.
    expect(match.fighters[0]).toMatchObject({ hits: 4, damage: 15 + 3 * 4 });
    expect(match.fighters[1].hp).toBe(LIFE - 15 - 3 * 4);
    expect(highestCamera).toBeLessThan(-300);
    expect(match.cameraY).toBe(0);
    expect(match.fighters.every((f) => f.y === 0)).toBe(true);
  });

  it('uses the shorter hold and outward launch against an airborne target', () => {
    const match = new Match();
    match.fighters[0].x = 440;
    for (let tick = 0; tick < 16; tick++)
      match.step({ hitUp: tick === 0 }, { jump: tick === 6 });
    const [attacker, target] = match.fighters;
    expect(attacker.hitStop).toBe(13);
    expect(target).toMatchObject({ action: 'launchAway', hitStop: 13 });
    expect(target.y).toBeLessThan(0);
    const contactY = target.y;
    ticks(match, 18);
    expect(target).toMatchObject({ age: 5, y: contactY, vx: 0, vy: 0 });
    match.step();
    expect(target.age).toBe(6);
    expect(target.y - contactY).toBeCloseTo(-17.4804, 4);
    expect(target.vx).toBeCloseTo(8.99506, 4);
    ticks(match, 180);
    expect(target).toMatchObject({ action: 'idle', y: 0 });
  });

  it.each(['block', 'miss', 'late'] as const)(
    'does not chase on %s or repeat held Hit Up',
    (outcome) => {
      const match = new Match();
      if (outcome !== 'miss') match.fighters[0].x = 440;
      const actions = new Set<unknown>();
      for (let tick = 0; tick < 250; tick++) {
        match.step(
          { hitUp: true, jump: tick >= (outcome === 'late' ? 73 : 16) },
          { guard: outcome === 'block' },
        );
        actions.add(playing(match.fighters[0]));
        if (tick === 15 && outcome === 'block') {
          expect(match.fighters[0]).toMatchObject({
            action: 'script',
            branch: RYUKO.hitUp,
            hitStop: 10,
          });
          expect(match.fighters[1]).toMatchObject({
            action: 'blockHeavy',
            hitStop: 10,
          });
        }
      }
      expect(actions.has(RYUKO.hitUpJump)).toBe(false);
      expect(match.fighters[0].action).toBe('idle');
      expect(match.fighters[1].hp).toBe(outcome === 'late' ? LIFE - 15 : LIFE);
    },
  );

  it('takes the hit when interrupted, trade or not', () => {
    for (const trade of [false, true]) {
      const match = new Match();
      match.fighters[0].x = 440;
      for (let tick = 0; tick < 16; tick++)
        match.step(
          { hitUp: tick === 0, jump: tick === 2 },
          { punch: tick === (trade ? 8 : 7) },
        );
      expect(match.fighters[0].action).toBe('hit');
      // The punching victim's body box takes 120% of Hit Up's 15.
      expect(match.fighters[1].hp).toBe(trade ? LIFE - 18 : LIFE);
      ticks(match, 250);
      expect(match.fighters[0].action).toBe('idle');
    }
  });

  it("runs the lose action 59's records as a KO enters (PCs 584–589)", () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    target.hp = 1;
    target.variables[14] = 100;
    const beam = object(398, 1, { slot: 7 });
    match.effects.push(beam);
    match.step({ punch: true });
    while (target.action !== 'down') match.step();
    // It deletes objects 7–9 and clears variable 14, the darkening.
    expect(match.effects).not.toContain(beam);
    expect(target.variables[14]).toBe(0);
  });

  it("relaunches a KO'd fighter struck again through KO NORMAL 2nd (61)", () => {
    const match = new Match();
    const [player, target] = match.fighters;
    player.x = 840;
    target.x = 960;
    target.hp = 6;
    ticks(match, 8, { punch: true });
    while (target.age < 20) match.step();
    expect(target).toMatchObject({ action: 'down', hp: 0 });
    const stops = player.hitStop;
    // A DST missile (218, box y −21, PC 3164), which pauses only its victim,
    // on KO Normal's body box (PC 619: y −100 ± 34). It sets its box as it
    // next steps (PC 3164), before it moves.
    match.effects.push(
      object(RYUKO.dstMissile, 0, {
        x: target.x,
        y: target.y + (21 - 100) * 1.5,
        slot: -1,
      }),
    );
    match.step();
    expect(target).toMatchObject({ action: 'koAgain', age: 0, hp: 0 });
    // Neither PC 607's ten ticks nor PC 611's hold, and no second flash.
    expect(player.hitStop).toBe(stops);
    expect(match.effects.filter((e) => e.clip === '59+9')).toEqual([]);
    while (target.age < 6) match.step();
    // PC 631 launches again at raw −500/−1520 and gravity 90.
    expect(target.vy).toBeCloseTo(
      -1520 * (655 / 65536) * 1.5 + 90 * (393 / 65536) * 1.5,
      6,
    );
    while (target.action === 'koAgain') match.step();
    expect(target).toMatchObject({ action: 'koLand', y: 0 });
  });

  it('keeps KO and timeout on their own ending paths', () => {
    const ko = new Match();
    ko.fighters[0].x = 440;
    // 60% of Hit Up's 15 at desperation life.
    ko.fighters[1].hp = 9;
    ticks(ko, 16, { hitUp: true });
    expect(ko.fighters[1].action).toBe('down');
    ticks(ko, ROUND_END_TICKS);
    expect(ko.fighters[1]).toMatchObject({ action: 'koLand', y: 0 });

    for (const endTick of [16, 55, 90]) {
      const match = new Match('cpu');
      match.fighters[0].x = 440;
      for (let tick = 0; tick < endTick; tick++)
        match.step({ hitUp: tick === 0, jump: tick === 16 }, {});
      match.ticks = 5999;
      match.step({}, {});
      expect(match.winner).toBe('player');
      untilResult(match);
      expect(match.fighters[0]).toMatchObject({ action: 'win', y: 0 });
      // A timeout gives the loser result 3, the draw action (0x409444).
      expect(match.fighters[1]).toMatchObject({ action: 'draw', y: 0 });
    }
  });
});

describe('recovered neutral and round animations', () => {
  it('keeps op 0x23 colour through action changes until a clip resets it', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    target.x = 750;
    const tint = { mode: 2, r: -10, g: 20, b: 0, fade: 0 };
    target.color = tint;
    match.step({ iori: true });
    ticks(match, 30);
    // 0x410cf0 leaves +0x44–0x54; hit 75 sets no colour.
    expect(target).toMatchObject({ action: 'hitHeavy', color: tint });
    while (target.action !== 'idle') match.step();
    // Action 1 resets it at PC 11, before its first display.
    expect(target.color).toEqual(NORMAL_COLOR);
  });

  it('turns a standing fighter for ten ticks, then walks, and lets attacks interrupt', () => {
    const match = new Match();
    const [f, other] = match.fighters;
    other.x = f.x - 200;
    match.step({ right: true });
    expect(f).toMatchObject({ action: 'turn', facing: -1, age: 0 });
    const x = f.x;
    ticks(match, animationDuration('turn') - 1, { right: true });
    expect(f).toMatchObject({ action: 'turn', x });
    match.step({ right: true });
    expect(f.action).toBe('backwalk');
    expect(f.x).toBeGreaterThan(x);
    other.x = f.x + 200;
    match.step();
    expect(f).toMatchObject({ action: 'turn', facing: 1 });
    match.step({ punch: true });
    expect(playing(f)).toBe(RYUKO.punch);
  });

  it('uses the crouching turn while crouched and stays down afterwards', () => {
    const match = new Match();
    const [f, other] = match.fighters;
    ticks(match, 10, { crouch: true });
    expect(f.action).toBe('crouch');
    other.x = f.x - 200;
    match.step({ crouch: true });
    expect(f).toMatchObject({ action: 'crouchTurn', facing: -1 });
    expect(animationFrame('crouchTurn', 0)).toMatchObject({
      image: 25,
      flip_x: true,
    });
    ticks(match, animationDuration('crouchTurn'), { crouch: true });
    expect(f.action).toBe('crouch');
  });

  it('does not turn in the air, and turns after landing on the far side', () => {
    const match = new Match();
    const [f, other] = match.fighters;
    match.step({ jump: true });
    ticks(match, 10);
    other.x = f.x - 200;
    match.step();
    expect(f).toMatchObject({ action: 'jump', facing: -1 });
    for (let i = 0; i < 200 && f.action !== 'land'; i++) match.step();
    ticks(match, animationDuration('land'));
    expect(f.action).toBe('idle');
  });

  it.each([1, -1] as const)(
    'sweeps a standing target into the action 79 pop and knockdown facing %i',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 440 : 1100;
      attacker.facing = facing;
      target.x = attacker.x + facing * 150;
      target.facing = facing === 1 ? -1 : 1;
      ticks(match, 19, { crouch: true, kick: true });
      expect(target).toMatchObject({
        action: 'sweep',
        hitStop: 13,
        hp: LIFE - 30,
      });
      expect(attacker.hitStop).toBe(13);
      const startX = target.x;
      ticks(match, 13 + 6);
      expect(target).toMatchObject({ action: 'sweep', age: 6 });
      let apex = 0;
      const seen = new Set<string>();
      for (let tick = 0; tick < 200; tick++) {
        seen.add(target.action);
        apex = Math.min(apex, target.y);
        match.step();
      }
      // Raw −300/−1020 with gravity 90: 18 rising steps and 37 in the air.
      expect(apex).toBeCloseTo(-136.8148, 3);
      expect((target.x - startX) * facing).toBeCloseTo(
        37 * 300 * (655 / 65536) * 1.5,
        3,
      );
      expect(seen).toEqual(new Set(['sweep', 'knockdown', 'getUp', 'idle']));
    },
  );

  it('walks both fighters in for the recovered intro, then waits for SHOW TIME', () => {
    const match = new Match('cpu', true);
    const [player, cpu] = match.fighters;
    expect(animationDuration('intro')).toBe(199);
    expect(
      [0, 50, 70, 120, 152, 162, 167, 172, 198].map(
        (age) => animationFrame('intro', age).image,
      ),
    ).toEqual([353, 356, 358, 359, 295, 364, 365, 295, 295]);
    expect(match.fighters.map((f) => f.action)).toEqual(['intro', 'intro']);
    ticks(match, 50, { punch: true, right: true });
    expect(player.x).toBeCloseTo(780, 3);
    expect(cpu.x).toBeCloseTo(1140, 3);
    ticks(match, 148, { punch: true });
    expect(player).toMatchObject({ action: 'intro', x: player.x });
    expect(match).toMatchObject({ ticks: 0, seconds: 60 });
    match.step({ punch: true });
    expect(match.fighters.map((f) => f.action)).toEqual(['idle', 'idle']);
    // Round phase 0 lasts until the fight lettering: no commands or clock.
    ticks(match, FIGHT_TICK - 200, { punch: true });
    expect(player.action).toBe('idle');
    expect(match).toMatchObject({ roundTicks: FIGHT_TICK - 1, ticks: 0 });
    match.step({ punch: true });
    expect(player.action).toBe('idle');
    expect(match.ticks).toBe(1);
    match.step({});
    match.step({ punch: true });
    expect(playing(player)).toBe(RYUKO.punch);
  });

  describe('Vs. CPU match', () => {
    // Play the round to SHOW TIME, then KO a side (both for a double KO).
    const ko = (match: Match, losers: number[], winnerHp = LIFE) => {
      while (match.roundTicks < FIGHT_TICK) match.step();
      match.fighters.forEach(
        (f, i) => (f.hp = losers.includes(i) ? 0 : winnerHp),
      );
      match.step();
    };

    it('sets up the next round after the result waits, keeping stock and power (0x411f2d)', () => {
      const match = new Match('cpu', true);
      ko(match, [1], 500);
      expect(match).toMatchObject({
        winner: 'player',
        wins: [1, 0],
        roundEnd: 651,
      });
      ticks(match, 651 + 50);
      expect(match.round).toBe(1);
      Object.assign(match.fighters[0], {
        stock: 2,
        power: 40,
        variables: { 0: 10 },
      });
      match.step();
      expect(match).toMatchObject({
        round: 2,
        roundTicks: 0,
        ticks: 0,
        winner: null,
      });
      expect(match.effects).toEqual([]);
      expect(
        match.fighters.map((f) => [
          f.action,
          f.hp,
          f.stock,
          f.power,
          exMode(f),
        ]),
      ).toEqual([
        ['intro', LIFE, 2, 40, false],
        ['intro', LIFE, 0, 0, false],
      ]);
    });

    it('credits a double KO to both and ends the match at three wins (state 902)', () => {
      const match = new Match('cpu', true);
      ko(match, [1]);
      // PERFECT (27) adds a tick.
      expect(match.roundEnd).toBe(652);
      ticks(match, 652 + 51);
      ko(match, [0, 1]);
      expect(match).toMatchObject({
        winner: 'draw',
        wins: [2, 1],
        roundEnd: 301,
      });
      ticks(match, 301 + 51);
      ko(match, [1]);
      expect(match).toMatchObject({
        round: 3,
        wins: [3, 1],
        matchOver: true,
        matchWinner: 'player',
      });
      ticks(match, 651);
      expect(match.resultReady).toBe(false);
      match.step();
      expect(match.resultReady).toBe(true);
      expect(match.round).toBe(3);
    });
  });
});

describe('Daisetsuzan Oroshi command throw', () => {
  it.each([1, -1] as const)(
    'grabs at long range, spins, tosses, and catches the fall with missiles facing %i',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 600 : 1300;
      // Beyond the near distance the command enters DST FAR (220), whose
      // box still reaches 169 arena pixels.
      target.x = attacker.x + facing * 169;
      // A turning fighter (23/24) has no body box low enough to grab.
      attacker.facing = facing;
      target.facing = facing === 1 ? -1 : 1;
      ticks(match, 4, { dst: true });
      expect({ ...attacker, action: named(attacker) }).toMatchObject({
        action: 'dstFar',
        age: 3,
      });
      match.step();
      expect({ ...attacker, action: named(attacker) }).toMatchObject({
        action: 'dstHit',
        age: 0,
      });
      expect(target).toMatchObject({
        action: 'superHeld',
        x: attacker.x + facing * 90,
      });
      const offsets = new Set<number>();
      for (let tick = 0; tick < 185; tick++) {
        match.step();
        if (target.action === 'superHeld')
          offsets.add(Math.round((target.x - attacker.x) * facing));
      }
      // Op 0x07 holds at 60, −10, −60 and 0 source pixels, scaled by 1.5.
      expect([...offsets]).toEqual([90, -15, -90, 0]);
      expect(attacker.age).toBe(185);
      // PC 3111 places the victim at (14, −96) and enters 129, whose script
      // runs after Ryuko's this tick: it launches at once at −200/−3000.
      expect(target).toMatchObject({
        action: 'dstToss',
        x: attacker.x + facing * (21 + 200 * (655 / 65536) * 1.5),
        y: -144 - 3000 * (655 / 65536) * 1.5 + 90 * (393 / 65536) * 1.5,
        facing: -facing,
        // PC 3112 (op 0x15).
        hp: LIFE - 10,
      });
      const tossX = attacker.x;
      ticks(match, 83);
      expect(attacker.age).toBe(268);
      expect(objects(match, RYUKO.dstMissile)).toHaveLength(2);
      expect(match.effects.map((e) => e.clip)).toEqual(
        expect.arrayContaining([385, 219, 396]),
      );
      ticks(match, 17);
      expect(target.action).toBe('dstToss');
      match.step();
      // The lower missile meets the falling victim 18 ticks after launch;
      // the other, 3 pixels lower, passes 2 under it. Its box (PC 3164)
      // deals 22.
      expect(target).toMatchObject({
        action: 'twist',
        hitStop: 13,
        hp: LIFE - 10 - 22,
      });
      // The grab, the toss and the missile.
      expect(attacker).toMatchObject({ age: 286, hitStop: 0, hits: 3 });
      expect((tossX - attacker.x) * facing).toBeCloseTo(
        19 * 400 * (655 / 65536) * 1.5,
        3,
      );
      const seen = new Set<string>();
      for (let tick = 0; tick < 300; tick++) {
        seen.add(target.action);
        match.step();
      }
      expect(seen).toEqual(
        new Set(['twist', 'twistBounce', 'knockdown', 'getUp', 'idle']),
      );
      expect(attacker.action).toBe('idle');
      expect(objects(match, RYUKO.dstMissile)).toEqual([]);
    },
  );

  it('switches to EVIL DST at 30% health: five held strikes, then the DST spin', () => {
    // From afar, DST FAR's op 0x11 (PC 3180) enters EVIL DST FAR (224).
    for (const hp of [154, 153]) {
      const far = new Match();
      far.fighters[0].hp = hp;
      far.step({ dst: true });
      expect(named(far.fighters[0])).toBe(hp > 153 ? 'dstFar' : 'evilDstFar');
    }
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    target.x = 750;
    attacker.hp = 153;
    ticks(match, 4, { dst: true });
    // PC 3082 (op 0x11) enters action 221 at 153 of 510 life or less.
    expect({ ...attacker, action: named(attacker) }).toMatchObject({
      action: 'evilDst',
      age: 3,
      power: 8,
    });
    match.step();
    // Hit branch 222 applies response 30 at 60 source pixels.
    expect({ ...attacker, action: named(attacker) }).toMatchObject({
      action: 'evilDstHit',
      age: 0,
    });
    expect(target).toMatchObject({ action: 'superHeld', x: attacker.x + 90 });
    const poses = new Set<number>();
    const objects = new Set<unknown>();
    for (let tick = 0; tick < 165; tick++) {
      match.step();
      if (target.action === 'superHeld') poses.add(target.held!.pose);
      match.effects.forEach((e) => objects.add(e.clip));
    }
    // Op 0x07 held poses; each of the five 223 strikes spawns HP hit (340,
    // playing 346 and its sparks) and landing smoke (400), credits 5 power
    // and takes no life.
    expect([...poses]).toEqual([0, 1, 8, 12, 6]);
    expect([...objects]).toEqual(expect.arrayContaining([340, 400]));
    // PC 3233 jumps into DST Hit at PC 3104, which re-applies response 30.
    expect({ ...attacker, action: named(attacker) }).toMatchObject({
      action: 'evilDstHit',
      age: 165,
      power: 33,
    });
    expect(target).toMatchObject({
      action: 'superHeld',
      x: attacker.x + 90,
      y: 0,
      hp: LIFE,
    });
    ticks(match, 185);
    expect(target).toMatchObject({ action: 'dstToss', hp: LIFE - 10 });
  });

  it("keeps DST FAR's grab box open through its recovery", () => {
    // 220 sets its box at age 4 (PC 3189) and, unlike 214, 221 and 224,
    // never clears it, so it grabs whoever steps in until it ends at 58.
    for (const age of [10, 56, 57]) {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = 600;
      target.x = 900;
      match.step({ dst: true });
      while (f.age < age) match.step();
      expect(named(f)).toBe('dstFar');
      target.x = f.x + 120;
      match.step();
      expect(target.action).toBe(age < 57 ? 'superHeld' : 'idle');
    }
  });

  it('whiffs outside its range or against an airborne target with a long recovery', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    // Just past DST FAR's reach.
    target.x = 600 + 170;
    match.step({ dst: true });
    ticks(match, animationDuration(RYUKO.dstFar) - 1);
    expect(named(attacker)).toBe('dstFar');
    match.step();
    expect(attacker.action).toBe('idle');
    expect(target.hp).toBe(LIFE);
    target.x = 600 + 150;
    ticks(match, 10, {}, { jump: true });
    expect(target.y).toBeLessThan(0);
    ticks(match, 10, { dst: true });
    expect(named(attacker)).toBe('dst');
    expect(target.action).not.toBe('superHeld');
  });

  it('protects the held victim and keeps the hold through a time-out', () => {
    const match = new Match('cpu');
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    target.x = 700;
    match.ticks = 5990;
    ticks(match, 5, { dst: true }, {});
    expect(target.action).toBe('superHeld');
    // An axe (227) whose box covers the held victim, which has no body box.
    spawn(match, 0, RYUKO.axe, { x: target.x - 63 * 1.5, y: -3 * 1.5 });
    match.step({}, {});
    expect(target).toMatchObject({ action: 'superHeld', hp: LIFE });
    ticks(match, 10, {}, {});
    expect(match.winner).toBe('draw');
    // The round phase stays 1 (0x408f38), so the throw runs on: the toss and
    // the missiles still take life after the round is decided.
    expect(target.action).toBe('superHeld');
    while (target.action === 'superHeld') match.step({}, {});
    expect(target).toMatchObject({ action: 'dstToss', hp: LIFE - 10 });
    while (target.action === 'dstToss') match.step({}, {});
    expect(target).toMatchObject({ action: 'twist', hp: LIFE - 10 - 22 });
    untilResult(match);
    expect(match.fighters.map((f) => f.action)).toEqual(['draw', 'draw']);
  });

  it('KOs the victim at a lethal toss and finishes the move before celebrating', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    target.x = 700;
    // 60% of the toss's 10 at desperation life.
    target.hp = 6;
    ticks(match, 5 + 185, { dst: true });
    // The toss's op 0x15 (PC 3112) empties life, so the victim enters the
    // lose action 59 where it was tossed (0x40e83e).
    expect(target).toMatchObject({ action: 'down', hp: 0, y: -144 });
    expect(match.winner).toBe('player');
    // DST Hit runs on and fires its missiles over the lying victim.
    while (attacker.age < 268) match.step();
    expect(target.action).toBe('koLand');
    expect(objects(match, RYUKO.dstMissile)).toHaveLength(2);
    untilResult(match);
    expect(attacker.action).toBe('win');
    expect(target.action).toBe('koLand');
  });
});

describe('fighter clip spawns (op 0x04)', () => {
  it('puffs landing smoke behind a fighter as it lands (action 9, PC 115)', () => {
    const match = new Match();
    const [f] = match.fighters;
    match.step({ jump: true });
    while (f.action !== 'land') match.step();
    // Flags 4: behind its spawner, in no slot.
    expect(match.effects.filter((e) => e.clip === 400)).toMatchObject([
      { owner: 0, x: f.x, y: 0, front: false, slot: -1 },
    ]);
  });

  it('raises hit dust at the hit reaction’s second display (action 73, PC 757)', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    match.step({ punch: true });
    while (target.action !== 'hit') match.step();
    const dust = () =>
      match.effects.filter((e) => e.clip === 394 && e.owner === 1);
    while (target.age < 5) {
      expect(dust()).toEqual([]);
      match.step();
    }
    expect(dust()).toMatchObject([{ x: target.x, front: true, slot: -1 }]);
  });

  it('flashes the court behind the fighters on a KO (59 + 9, PC 600)', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    target.hp = 1;
    match.step({ punch: true });
    while (target.action !== 'down') match.step();
    const flash = () => match.effects.filter((e) => e.clip === '59+9');
    // Flags 0x46 at z 15: a viewport object behind every fighter, its panel
    // 294 added at +25 (PC 592) for ten ticks.
    expect(flash()).toMatchObject([
      {
        owner: 1,
        x: 327 * 1.5,
        y: 498 * 1.5,
        screen: true,
        front: false,
        color: { mode: 2, r: 25, g: 25, b: 25 },
      },
    ]);
    ticks(match, 9);
    expect(flash()).toHaveLength(1);
    match.step();
    expect(flash()).toEqual([]);
  });

  it('registers a spawn without flag bit 2 in its owner’s slot (0x412caf)', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    match.step({ punch: true });
    while (playing(f) !== RYUKO.punchHit || f.hitStop || f.age < 6)
      match.step();
    match.step({ punch: true });
    while (!match.effects.some((e) => e.clip === 395)) match.step();
    // Punch 2's dust, flags 0 (PC 2394), takes slot 0 behind Ryuko.
    expect(f).toMatchObject({
      action: 'script',
      branch: RYUKO.punch2,
      age: 13,
    });
    expect(match.effects.filter((e) => e.clip === 395)).toMatchObject([
      { owner: 0, slot: 0, front: false },
    ]);
  });

  it('deletes only the victim’s registered objects 7–9 as a hit reaction enters, rolled or not', () => {
    const branches = new Set<Fighter['branch']>();
    for (let seed = 0; seed < 8; seed++) {
      const match = new Match('practice', false, seed);
      const [f, target] = match.fighters;
      enter(match, f, RYUKO.kick3);
      target.x = f.x + 140;
      const beam = object(398, 1, { slot: 7 });
      const smoke = object(398, 1, { slot: -1 });
      match.effects.push(beam, smoke);
      while (target.action !== 'hitRapid') match.step();
      branches.add(target.branch);
      // Action 83's records before its roll (PCs 949–956) run either way.
      expect(match.effects).not.toContain(beam);
      expect(match.effects).toContain(smoke);
      expect(match.effects.filter((e) => e.clip === 394)).toMatchObject([
        { owner: 1, x: target.x },
      ]);
    }
    expect(branches).toEqual(new Set([null, '83+18']));
  });

  it("plays the DST dash smoke's own puffs (object 396, PCs 5705–5710)", () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    match.step({ dst: true });
    const dash = () => match.effects.find((e) => e.clip === 396);
    while (!dash()) match.step();
    const smoke = dash()!;
    const puffs: { age: number; dx: number; front: boolean }[] = [];
    const seen = new Set();
    while (smoke.age < 25) {
      match.step();
      for (const e of match.effects)
        if (e.clip === 394 && !seen.has(e)) {
          seen.add(e);
          puffs.push({ age: smoke.age, dx: e.x - smoke.x, front: e.front });
        }
    }
    // Flag 4 draws each behind its spawner, 20, 30 and 40 source pixels on.
    expect(puffs).toEqual(
      [20, 30, 40].map((x, i) => ({
        age: 10 + 5 * i,
        dx: f.facing * x * 1.5,
        front: false,
      })),
    );
  });
});

describe('practice partner', () => {
  // Without an explicit opponent input, practice mode asks the partner.
  function partner(behavior: DummyBehavior, gap = 120) {
    const match = new Match();
    match.practice.partner = behavior;
    const [ryuko, target] = match.fighters;
    target.x = ryuko.x + gap;
    return { match, ryuko, target };
  }

  it('plays the original CPU, guard roll included', () => {
    const { match, ryuko, target } = partner('cpu');
    match.cpu = new CpuVM([], 100);
    strike(match, ryuko, RYUKO.punch);
    match.step();
    expect(target.action).toBe('block');
    const walkIn: CpuEntry = {
      flags: 0,
      probability: 100,
      min: 0,
      max: 2000,
      steps: [{ direction: 2, command: 0, duration: 5 }],
    };
    const walker = partner('cpu', 400);
    walker.match.cpu = new CpuVM([walkIn], 100);
    walker.match.step();
    expect(walker.target.action).toBe('walk');
  });

  it('stands still by default', () => {
    const { match, target } = partner('stand');
    for (let tick = 0; tick < 200; tick++) match.step();
    expect(target).toMatchObject({
      action: 'idle',
      x: match.fighters[0].x + 120,
    });
  });

  it.each([
    ['guard', 'guard', 'block'],
    ['crouchGuard', 'crouchGuard', 'crouchBlock'],
  ] as const)('holds a %s', (behavior, guard, block) => {
    const { match, ryuko, target } = partner(behavior);
    match.step();
    expect(target.action).toBe(guard);
    strike(match, ryuko, RYUKO.punch);
    match.step();
    expect(target).toMatchObject({ action: block, hp: LIFE });
  });

  it('crouch-guards against air attacks, which hit it as overheads', () => {
    const { match, ryuko, target } = partner('crouchGuard');
    match.step();
    ryuko.y = -60;
    strike(match, ryuko, RYUKO.airPunch);
    match.step();
    expect(target).toMatchObject({ action: 'jumpHit', hp: LIFE - 15 });
  });

  it.each([
    ['punch', 0, 'airHit', LIFE - 10],
    ['airPunch', 1, 'airBlockHeavy', LIFE],
  ] as const)(
    'jumps and guards in the air: %s (airborne %i) selects %s',
    (attack, airborne, reaction, hp) => {
      const { match, ryuko, target } = partner('airGuard');
      for (let tick = 0; tick < 100 && target.action !== 'airGuard'; tick++)
        match.step();
      expect(target.y).toBeLessThan(0);
      if (airborne) ryuko.y = target.y;
      strike(match, ryuko, RYUKO[attack]);
      match.step();
      expect(target).toMatchObject({ action: reaction, hp });
    },
  );

  it('punches in range once a second, so the player can block and counter', () => {
    const { match, ryuko, target } = partner('attack', 130);
    match.practice.maxStock = true;
    const seen = new Set<string>();
    for (let tick = 0; tick < 250; tick++) {
      // Block 149 checks for Hit Up at age 8; press three ticks after the stop.
      const counter =
        ryuko.action === 'block' && ryuko.age === 3 && ryuko.hitStop === 0;
      match.step({ guard: !counter, hitUp: counter });
      seen.add(named(ryuko));
    }
    expect([...seen]).toEqual(expect.arrayContaining(['block', 'counterHit']));
    expect(target.hp).toBeLessThan(LIFE);
  });

  it('jumps in from a distance with an air kick', () => {
    const { match, ryuko, target } = partner('jumpIn', 400);
    const seen = new Set<unknown>();
    for (let tick = 0; tick < 300; tick++) {
      match.step();
      seen.add(playing(target));
    }
    expect([...seen]).toEqual(expect.arrayContaining(['jump', RYUKO.airKick]));
    expect(ryuko.hp).toBeLessThan(LIFE);
  });

  it('tops up stock while idle with Max stock, in practice only', () => {
    const { match, ryuko } = partner('stand', 250);
    match.practice.maxStock = true;
    match.step();
    expect(ryuko.stock).toBe(3);
    match.step({ getterBeam: true });
    expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
      action: 'getterBeam',
      stock: 2,
    });
    for (let tick = 0; tick < 500 && ryuko.action !== 'idle'; tick++)
      match.step();
    match.step();
    expect(ryuko.stock).toBe(3);
    const cpu = new Match('cpu');
    cpu.practice.maxStock = true;
    cpu.step();
    expect(cpu.fighters[0].stock).toBe(0);
  });

  it('holds Ryuko at 30% with Low health, for the desperation moves', () => {
    const { match, ryuko } = partner('stand', 150);
    match.practice.lowHealth = true;
    match.step();
    expect(ryuko.hp).toBe(153);
    match.step({ dst: true });
    expect(named(ryuko)).toBe('evilDst');
  });
});

describe('recovered attack boxes', () => {
  // Whether the move, at this age, hurts a standing victim `gap` ahead.
  function contact(
    action: keyof typeof RYUKO,
    age: number,
    gap: number,
    offset = 0,
  ) {
    const match = new Match();
    const [f, victim] = match.fighters;
    victim.x = f.x + gap;
    if (action.startsWith('air')) f.y = -60;
    enter(match, f, RYUKO[action], age - 1, offset);
    match.step();
    return victim.hp < LIFE;
  }

  it.each([
    ['punch', 7, 74, 63], // PC 2367
    ['kick', 7, 92, 60], // PC 2559
    ['crouchPunch', 14, 96, 60], // PC 2541
    ['airKick', 15, 10, 53], // PC 2649
    ['kick3', 15, 169, 163], // PC 2632
  ] as const)(
    'reaches with %s (age %i) as far as its op 0x18 box: x %i, ±%i',
    (action, age, x, w) => {
      // The victim's body (−1, ±37) faces back: its centre sits 1 px nearer.
      const edge = (x + w + 37 - 1) * 1.5;
      expect(contact(action, age, edge - 1)).toBe(true);
      expect(contact(action, age, edge + 1)).toBe(false);
    },
  );

  it.each([
    ['kick', 7, 12, 0], // PCs 2559/2562
    ['kick2', 16, 26, 0],
    ['crouchKick', 18, 28, 0],
    ['airPunch', 18, 33, 0],
    // After its second hop lands, 181 + 18 (PCs 2454/2459).
    ['punch3', 14, 19, 18],
  ] as const)('opens %s from age %i until %i', (action, from, to, offset) => {
    expect(contact(action, from - 1, 150, offset)).toBe(false);
    expect(contact(action, from, 150, offset)).toBe(true);
    expect(contact(action, to - 1, 150, offset)).toBe(true);
    expect(contact(action, to, 150, offset)).toBe(false);
  });
});

describe('recovered body boxes', () => {
  // A punch at age 7 against a victim held in one pose `gap` ahead.
  function punched(action: string, gap: number, input: Input = {}, y = 0) {
    const match = new Match();
    const [f, victim] = match.fighters;
    victim.x = f.x + gap;
    pose(match, victim, action, 12);
    victim.y = y;
    strike(match, f, RYUKO.punch);
    match.step({}, input);
    return victim.hp < LIFE;
  }

  it.each([
    // Punch box (74, ±63); idle (action 1, PC 10) (−1, ±37) reaches 259.5.
    ['idle', {}, 259, true],
    // Crouch (action 19, PC 237): (−2, −71, ±32, ±83) reaches 250.5.
    ['crouch', { crouch: true }, 255, false],
    ['crouch', { crouch: true }, 250, true],
  ] as const)(
    'hurts %s through its own op 0x19 box (%j, gap %i: %s)',
    (pose, input, gap, hit) => {
      expect(punched(pose, gap, input)).toBe(hit);
    },
  );

  it('leaves a backdash nothing to hit once it leaves the ground (action 14)', () => {
    // PCs 177–184: a low kind-2 box during the wind-up, then push boxes only.
    expect(punched('backdash', 120, {}, -30)).toBe(false);
  });
});

describe('recovered damage (0x40f010, 0x40e7c0)', () => {
  // `action`'s first strike meets a victim holding `victimPose` 200 ahead:
  // punch 1, or IORI's first stage (box at age 21, PC 3620).
  function struck(
    action: 'punch' | 'iori',
    victimPose = 'idle',
    defense: Input = {},
    life = LIFE,
  ) {
    const match = new Match();
    const [f, victim] = match.fighters;
    victim.x = f.x + 200;
    pose(match, victim, victimPose, 12);
    victim.hp = life;
    if (action === 'punch') strike(match, f, RYUKO.punch);
    else pose(match, f, 'iori', 20);
    match.step({}, defense);
    return { f, victim };
  }

  it("takes a hit box's byte 12 through a 100% body box: punch 1 does 10 of 510", () => {
    const { f, victim } = struck('punch');
    expect(victim.hp).toBe(LIFE - 10);
    expect(f.damage).toBe(10);
  });

  it("scales by the struck body box's byte 11: 120% on an attacking pose", () => {
    expect(struck('punch', 'kick').victim.hp).toBe(LIFE - 12);
  });

  it('chips 20% (+0x7ca5) on guard only from boxes of kind bit 2', () => {
    // IORI's box (PC 3620) is kind 7 with damage 15; punch 1's is kind 3.
    expect(struck('iori', 'idle', { guard: true }).victim.hp).toBe(LIFE - 3);
    expect(struck('punch', 'idle', { guard: true }).victim.hp).toBe(LIFE);
  });

  it('shrinks losses to 60% at 30% life (153 of 510) or less', () => {
    expect(struck('punch', 'idle', {}, 154).victim.hp).toBe(154 - 10);
    expect(struck('punch', 'idle', {}, 153).victim.hp).toBe(153 - 6);
    // trunc(3 × 60%) is 0, raised to 1.
    const chip = struck('iori', 'idle', { guard: true }, 153);
    expect(chip.victim.hp).toBe(153 - 1);
  });

  it('KOs through a guard when a chip empties life (0x40e7c0)', () => {
    const { f, victim } = struck('iori', 'idle', { guard: true }, 1);
    expect(victim).toMatchObject({ action: 'down', hp: 0 });
    expect(f.hits).toBe(0);
  });
});

describe('recovered victim responses', () => {
  const S = (655 / 65536) * 1.5;
  const A = (393 / 65536) * 1.5;
  // The tick before each move's first strike: punch 3's, after its second
  // hop lands (181 + 18), IORI's at age 21 (PC 3620) and the drill's at 23.
  function hit(
    action: keyof typeof RYUKO | 'iori' | 'drill',
    defense: Input,
    target: { y?: number } = {},
  ) {
    const match = new Match();
    const [f, victim] = match.fighters;
    victim.x = f.x + 120;
    victim.y = target.y ?? 0;
    if (action.startsWith('air')) f.y = -60;
    if (action === 'punch3') enter(match, f, RYUKO.punch3, 13, 18);
    else if (action === 'iori') pose(match, f, action, 20);
    else if (action === 'drill') pose(match, f, action, 22);
    else strike(match, f, RYUKO[action]);
    match.step({}, defense);
    return { match, f, victim };
  }

  it.each([
    ['airPunch', {}, 'jumpHit', LIFE - 15],
    ['airPunch', { guard: true }, 'blockStop', LIFE],
    ['airPunch', { guard: true, crouch: true }, 'jumpHit', LIFE - 15],
    ['airKick', { guard: true, crouch: true }, 'jumpHit', LIFE - 4],
  ] as const)(
    'makes %s an overhead: %j selects %s',
    (action, defense, reaction, hp) => {
      // Responses 5/6 (action 77) for standing and crouch-guarding victims.
      const { match, victim } = hit(action, defense);
      expect(victim).toMatchObject({ action: reaction, hp });
      const x = victim.x;
      ticks(match, 15 + 39);
      // The air kick's next strikes restart 77 before it slides.
      if (reaction === 'jumpHit' && action === 'airPunch')
        // PC 845: raw −250 with +10 per tick from age 9 to the end (38).
        expect(victim.x - x).toBeCloseTo(
          30 * 250 * S - (10 * A * 30 * 31) / 2,
          3,
        );
    },
  );

  it.each([
    ['punch', 'airHit', LIFE - 10],
    ['crouchKick', 'sweep', LIFE - 30],
    ['hitUp', 'launchAway', LIFE - 15],
    // IORI and the drill chip 20% (kind 7); punch 3's kind 0 doesn't.
    ['iori', 'airBlockHeavy', LIFE - 3],
    ['drill', 'airBlockHeavy', LIFE - 1],
    ['punch3', 'airBlockHeavy', LIFE],
  ] as const)(
    'lets an air guard stop only its air-guard responses: %s selects %s',
    (action, reaction, hp) => {
      const { victim } = hit(action, { guard: true }, { y: -40 });
      expect(victim).toMatchObject({ action: reaction, hp });
    },
  );

  it('slams any grounded victim of punch 3 into a floor bounce', () => {
    for (const defense of [{}, { guard: true, crouch: true }]) {
      // Response 77 → action 123, including through a crouching guard.
      const { match, victim } = hit('punch3', defense);
      expect(victim).toMatchObject({ action: 'launchDown', hp: LIFE - 35 });
      const seen = new Set<string>();
      for (let i = 0; i < 300; i++) {
        match.step();
        seen.add(victim.action);
      }
      expect(seen).toEqual(
        new Set(['launchDown', 'slamBounce', 'bounceDown', 'getUp', 'idle']),
      );
    }
    const { victim } = hit('punch3', { guard: true });
    expect(victim).toMatchObject({ action: 'blockHeavy', hp: LIFE });
  });

  it('lets a strike reach a slam bounce once its body box opens (124, PC 1668)', () => {
    // No authored protection: the bounce's first display has no hurtbox and
    // its second sets one at (9, −33) ±(67, 32), which a crouching kick meets.
    const struck = (age: number) => {
      const match = new Match();
      const [f, victim] = match.fighters;
      Object.assign(victim, { action: 'slamBounce', age, reaction: 8 });
      victim.x = f.x + 120;
      strike(match, f, RYUKO.crouchKick);
      match.step();
      return victim.action;
    };
    expect(struck(5)).toBe('slamBounce');
    expect(struck(9)).toBe('sweep');
  });
});

describe('recovered guard counter', () => {
  // Punch 1 is blocked at tick 7; block 149 checks at ages 0, 8 and 18.
  function blocked(stock: number, press: (tick: number) => boolean) {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 130;
    target.stock = stock;
    const seen = new Set<string>();
    for (let tick = 0; tick < 120; tick++) {
      match.step(
        { punch: tick === 0 },
        { guard: tick <= 7, hitUp: press(tick) },
      );
      seen.add(named(target));
      if (named(target) === 'counterHit' && !seen.has('start'))
        seen.add('start').add(`at ${tick}`);
    }
    return { match, f, target, seen };
  }

  it('spends a stock on COUNTER HIT (174), which launches the attacker', () => {
    // A press at tick 19 falls in the age-8 check's window (ticks 16–25).
    const { f, target, seen } = blocked(1, (tick) => tick === 19);
    expect(seen.has('at 25')).toBe(true);
    // Guard 149 adds 1 power; op 0x15 then takes 100, borrowing the stock,
    // and the launch (80) credits the counter 3 more.
    expect(target).toMatchObject({ stock: 0, power: 4 });
    // Its box selects response 17 (action 80) for 10 damage, which the
    // punch's recovery pose takes at 120%.
    expect(seen.has('counterHit')).toBe(true);
    expect(f.hp).toBe(LIFE - 12);
    expect(f.hits).toBe(0);
    expect(target.hits).toBe(1);
  });

  it('reads presses up to eight ticks before the block, but needs a stock', () => {
    expect(blocked(1, (tick) => tick === 0).seen.has('at 7')).toBe(true);
    expect(blocked(1, (tick) => tick === -1).seen.has('counterHit')).toBe(
      false,
    );
    const empty = blocked(0, (tick) => tick === 19);
    expect(empty.seen.has('counterHit')).toBe(false);
    expect(empty.target).toMatchObject({ stock: 0, power: 1 });
  });

  it('has no counter from an air guard', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    target.y = -40;
    target.stock = 1;
    pose(match, f, 'iori', 20);
    match.step({}, { guard: true, hitUp: true });
    expect(target.action).toBe('airBlockHeavy');
    ticks(match, 30, {}, { guard: true, hitUp: true });
    expect(target.stock).toBe(1);
  });
});

describe('recovered afterimages (op 0x25)', () => {
  it('samples a backdash every six ticks before its script, keeps three, and stops on landing', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ dash: true, left: true });
    expect(playing(f)).toBe(RYUKO.backdash);
    // Action 14, PC 176: three images, one every 5 + 1 ticks, half blended.
    expect(f.trail).toMatchObject({
      spec: { count: 3, interval: 5, mode: 1, tint: 0 },
      samples: [],
    });
    // 0x412271 samples at the next step, before the scripts and motion.
    const pose = fighterPose(f);
    const x = f.x;
    match.step();
    expect(f.trail!.samples).toEqual([{ x, y: 0, facing: 1, pose }]);
    ticks(match, 5);
    expect(f.trail!.samples).toHaveLength(1);
    match.step();
    expect(f.trail!.samples).toHaveLength(2);
    ticks(match, 12);
    expect(f.trail!.samples).toHaveLength(3);
    while (playing(f) === RYUKO.backdash) match.step();
    // Its landing handler enters Dash F lend (15), which frees the slot at
    // PC 191.
    expect(f).toMatchObject({
      action: 'script',
      branch: RYUKO.dashLand,
      trail: null,
    });
  });

  it("keeps an air dash's afterimages through an air attack until landing", () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 20);
    match.step({ dash: true });
    const trail = f.trail;
    expect(trail?.spec).toMatchObject({ count: 2, interval: 5, mode: 4 });
    ticks(match, 10);
    match.step({ punch: true });
    // In an air dash (variable 1 at 20) 182 jumps to 183, which has no op
    // 0x25, and 0x410cf0 keeps the slot.
    expect(f).toMatchObject({
      action: 'script',
      branch: RYUKO.airDashPunch,
      trail,
    });
    while (f.y < 0) match.step();
    expect(f.trail).toBeNull();
  });

  it('keeps sampling through hit-stop', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 130;
    match.step({ drill: true });
    while (f.hitStop === 0) match.step();
    // Action 207 samples every other tick, frozen or not; the frozen drill
    // repeats its display (the body push can still move it).
    let last = f.trail!.samples.at(-1);
    let added = 0;
    for (let i = 0; i < 6; i++) {
      match.step();
      expect(f.hitStop).toBeGreaterThan(0);
      if (f.trail!.samples.at(-1) !== last) added++;
      last = f.trail!.samples.at(-1);
    }
    expect(added).toBe(3);
    expect(new Set(f.trail!.samples.map((s) => s.pose)).size).toBe(1);
  });

  it('colours each image by r[6] (0x40ce8e)', () => {
    // Air dash 16: blend from (10, 0, 30) faded 32/32 toward the object's.
    const spec = { count: 2, interval: 5, mode: 4, tint: 2 };
    const trail = (counter: number) => ({
      spec: { ...spec, r: 10, g: 0, b: 30, fade: 32 },
      counter,
      samples: [],
    });
    expect(afterimageColor(trail(5), 0, NORMAL_COLOR)).toEqual({
      mode: 4,
      r: 5,
      g: 0,
      b: 15,
      fade: 16,
    });
    expect(afterimageColor(trail(5), 1, NORMAL_COLOR)).toEqual({
      ...NORMAL_COLOR,
      mode: 4,
    });
    expect(afterimageColor(trail(2), 0, NORMAL_COLOR)).toEqual({
      mode: 4,
      r: 8,
      g: 0,
      b: 24,
      fade: 25,
    });
    expect(afterimageColor(trail(2), 1, NORMAL_COLOR)).toEqual({
      mode: 4,
      r: 3,
      g: 0,
      b: 9,
      fade: 9,
    });
    // The Change Attack's (318) take the record's darkening; tint 0 keeps
    // the object's colour in the record's mode.
    const own = { mode: 2, r: 4, g: 4, b: 4, fade: 0 };
    const fixed = {
      spec: {
        count: 3,
        interval: 5,
        mode: 1,
        tint: 1,
        r: -5,
        g: -5,
        b: -5,
        fade: 0,
      },
      counter: 0,
      samples: [],
    };
    expect(afterimageColor(fixed, 0, own)).toEqual({
      mode: 1,
      r: -5,
      g: -5,
      b: -5,
      fade: 0,
    });
    expect(
      afterimageColor({ ...fixed, spec: { ...fixed.spec, tint: 0 } }, 0, own),
    ).toEqual({ ...own, mode: 1 });
  });
});

describe('recovered screen shake (op 0x0e)', () => {
  it('shakes from the record before a display, on a whiff too', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ hitUp: true });
    while (!match.quake.y) match.step();
    // PC 2819 runs before action 200's fifth display (2 + 6 + 4 + 3 ticks in).
    expect(f).toMatchObject({ action: 'script', branch: RYUKO.hitUp, age: 15 });
    expect(match.quake).toEqual({
      x: null,
      y: { type: 4, amplitude: 3, frames: 5 },
    });
    expect(match.fighters[1].hp).toBe(LIFE);
  });

  it('shakes on every Air Drill contact, hit or guard', () => {
    for (const guard of [false, true]) {
      const match = new Match();
      const [f, target] = match.fighters;
      f.y = -100;
      // Air Drill (208) opens its first spin's box at age 22.
      enter(match, f, RYUKO.airDrill, 22);
      target.x = f.x + 150;
      match.step({}, { guard });
      // The hit and guard handlers, 209 + 12 and 209 + 23 (PCs 2979–2980).
      expect(playing(f)).toBe(guard ? '209+23' : '209+12');
      // PCs 2991 (hit) and 3002 (guard) shake alike.
      expect(match.quake).toEqual({
        x: { type: 4, amplitude: 4, frames: 4 },
        y: { type: 4, amplitude: 8, frames: 8 },
      });
    }
  });

  it('restarts an axis on every record, even an identical one', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 120;
    match.step({ dst: true });
    const seen = new Set();
    while (['dst', 'dstHit'].includes(named(f))) {
      match.step();
      if (match.quake.x) seen.add(match.quake.x);
    }
    // DST Hit (215) shakes once; each of its ten fast spins (217) again.
    expect(seen.size).toBe(11);
  });

  it('steps each axis once per drawn frame (0x40c9e0)', () => {
    const frames = (type: number, amplitude: number, length: number) => {
      const axis = { type, amplitude, frames: length, offset: 0, left: length };
      const rolls = [7, 23, 4, 18, 9, 31, 12, 5, 26, 14];
      return Array.from({ length: length + 1 }, (_, frame) => {
        stepShake(axis, frame, () => rolls[frame]);
        return axis.offset || 0;
      });
    };
    // Knockdown 146's y: decays as amplitude × left / frames, flipping on
    // odd frames; the last frame zeroes it.
    expect(frames(1, 3, 5)).toEqual([2, -1, 1, 0, 0, 0]);
    // The KO's: rand() % 10 each frame.
    expect(frames(4, 10, 10)).toEqual([7, -3, 4, -8, 9, -1, 2, -5, 6, 0, 0]);
  });
});

describe('recovered cancels', () => {
  it('cancels a connected normal into a special or super, but not a whiff', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 130;
    f.stock = 1;
    match.step({ punch: true });
    ticks(match, 3);
    // Op 0x1e mode 1: punch 1 accepts levels 30–50 only after contact.
    match.step({ drill: true });
    expect(playing(f)).toBe(RYUKO.punch);
    while (playing(f) === RYUKO.punch) match.step();
    // 179 accepts them always; the drill waits out the contact stop.
    match.step({ drill: true });
    expect({ ...f, action: named(f) }).toMatchObject({
      action: 'drill',
      age: 0,
    });
    expect(f.hitStop).toBeGreaterThan(0);
    const beam = new Match();
    beam.fighters[1].x = beam.fighters[0].x + 130;
    beam.fighters[0].stock = 1;
    beam.step({ punch: true });
    ticks(beam, 8);
    beam.step({ getterBeam: true });
    expect({
      ...beam.fighters[0],
      action: named(beam.fighters[0]),
    }).toMatchObject({ action: 'getterBeam', stock: 0 });
    const whiff = new Match();
    whiff.fighters[1].x = whiff.fighters[0].x + 400;
    whiff.step({ punch: true });
    for (let tick = 1; tick < animationDuration(RYUKO.punch); tick++)
      whiff.step({ drill: tick === 10 });
    expect(playing(whiff.fighters[0])).toBe(RYUKO.punch);
    // The press stays within the drill's 40-tick window, so the free state
    // enters it once the punch ends.
    whiff.step();
    expect({
      ...whiff.fighters[0],
      action: named(whiff.fighters[0]),
    }).toMatchObject({ action: 'drill', age: 0 });
  });

  // Musashi, the Change Attack and the hidden super check variable 6 (PCs
  // 3775, 4702, 4177) and jump into action 254 (+ 0, 14, 9), which spends two
  // stocks, spawns GENGAI! and plays on into their cancel versions (260, 318,
  // 286 + 5); Getter Beam checks it for 265, which checks life for 279.
  it.each([
    [2, LIFE, 'musashi', 'superCancel', 0],
    [2, LIFE, 'getterBeam', 'scGetterBeam', 0],
    [2, 147, 'getterBeam', 'scEvilBeam', 0],
    [2, LIFE, 'changeAttack', 'superCancel', 0],
    [2, 147, 'blackRush', 'superCancel', 0],
    [2, LIFE, 'blackRush', 'noSuper', 2],
    [1, LIFE, 'musashi', 'noSuper', 1],
    [1, LIFE, 'getterBeam', 'noSuper', 1],
  ] as const)(
    'super-cancels IORI with %i stocks at %i health: %s enters %s',
    (stock, hp, control, action, left) => {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = f.x + 150;
      f.stock = stock;
      f.hp = hp;
      match.step({ iori: true });
      while (!f.contact) match.step();
      match.step({ [control]: true });
      expect({ ...f, action: named(f) }).toMatchObject({ action, stock: left });
      // Action 254 and 265 spawn GENGAI! (253); NO SUPER does not.
      expect(match.effects.some((e) => e.clip === 253)).toBe(
        action !== 'noSuper',
      );
    },
  );

  it('keeps specials, the Mega Getter Beam and a whiffed IORI uncancelled', () => {
    for (const control of ['drill', 'dst', 'axe', 'megaBeam'] as const) {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = f.x + 150;
      f.stock = 3;
      match.step({ iori: true });
      while (!f.contact) match.step();
      match.step({ [control]: true });
      expect(named(f)).toBe('iori');
    }
    const whiff = new Match();
    whiff.fighters[1].x = whiff.fighters[0].x + 500;
    whiff.fighters[0].stock = 2;
    whiff.step({ iori: true });
    ticks(whiff, 30);
    whiff.step({ musashi: true });
    expect({
      ...whiff.fighters[0],
      action: named(whiff.fighters[0]),
    }).toMatchObject({ action: 'iori', stock: 2 });
  });

  it('cancels a connected air attack into the air kick or a double jump', () => {
    function airPunch(setup: (f: Match['fighters'][0]) => void = () => {}) {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = f.x + 120;
      f.y = target.y = -80;
      setup(f);
      strike(match, f, RYUKO.airPunch);
      match.step();
      expect(f.contact).toBe(true);
      return { match, f };
    }
    const kick = airPunch();
    kick.match.step({ kick: true });
    expect(playing(kick.f)).toBe(RYUKO.airKick);
    const jump = airPunch();
    jump.match.step({ jump: true });
    expect(playing(jump.f)).toBe(RYUKO.doubleJump);
    // After an air dash (variable 1 = 20), 182 jumps to 183, which caps the
    // range at 50.
    const dashed = () => airPunch((f) => (f.variables[1] = 20));
    const refused = dashed();
    refused.match.step({ jump: true });
    expect(playing(refused.f)).toBe(RYUKO.airDashPunch);
    // Jump 2 still matches first for its 10 ticks, and enters nothing.
    refused.match.step({ kick: true });
    expect(playing(refused.f)).toBe(RYUKO.airDashPunch);
    // K Jump (191) jumps to its air-dash version (192) likewise.
    const kicked = dashed();
    kicked.match.step({ kick: true });
    expect(playing(kicked.f)).toBe(RYUKO.airDashKick);
  });

  it('attacks out of an air dash from its third tick with the floatier variant', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 20);
    match.step({ dash: true });
    expect(f).toMatchObject({
      action: 'script',
      branch: RYUKO.airDash,
      variables: expect.objectContaining({ 1: 20 }),
    });
    // PC 207 opens a window of levels 20–50 at age 3. Each tick the
    // controller reads the window (0x411810, at 0x41251d) before the script
    // step (0x412564) runs on, so a command enters from age 4.
    match.step();
    match.step({ drill: true });
    match.step();
    expect(playing(f)).toBe(RYUKO.airDash);
    match.step();
    expect(named(f)).toBe('airDrill');
    const punched = new Match();
    const p = punched.fighters[0];
    punched.step({ jump: true });
    ticks(punched, 20);
    punched.step({ dash: true });
    // DASH F matches first, refused at level 254, until its first step is
    // 13 ticks old; 182 then jumps to 183, which sets acceleration 45.
    ticks(punched, 9);
    punched.step({ punch: true });
    expect(playing(p)).toBe(RYUKO.airDash);
    punched.step();
    expect(p).toMatchObject({
      action: 'script',
      branch: RYUKO.airDashPunch,
      variables: expect.objectContaining({ 1: 20 }),
    });
    expect(p.gravity).toBeCloseTo(45 * (393 / 65536) * 1.5);
    while (p.y < 0) punched.step();
    expect(p.variables[1]).toBe(0);
  });

  it('enters no movement command from an air attack fall (action 7, PC 94)', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 12);
    match.step({ kick: true });
    f.y = -2000;
    // K Jump (191) jumps to the fall at age 54 (PC 2664): levels 0–250.
    while (f.age < 54) match.step();
    expect(f.window).toMatchObject({ mode: 2, min: 0, max: 250 });
    match.step({ jump: true });
    expect(playing(f)).toBe(RYUKO.airKick);
    // Past Jump 2's 10 ticks, so DASH F is the first match.
    ticks(match, 10);
    match.step({ right: true });
    match.step();
    match.step({ right: true });
    expect(playing(f)).toBe(RYUKO.airKick);
  });

  it.each(['punch', 'kick'] as const)(
    'restores gravity 80 when an air-dash %s ends airborne (action 7, PC 99)',
    (button) => {
      const match = new Match();
      const f = match.fighters[0];
      match.step({ jump: true });
      ticks(match, 20);
      match.step({ dash: true });
      ticks(match, 10);
      match.step({ [button]: true });
      f.y = -2000;
      const index = button === 'punch' ? RYUKO.airDashPunch : RYUKO.airDashKick;
      expect(playing(f)).toBe(index);
      // Each jumps to the fall at 7 + 2 (PC 2507 at age 47, 2692 at 54),
      // past PC 93's clear of variable 1.
      while (f.age < (button === 'punch' ? 47 : 54)) match.step();
      expect(f).toMatchObject({
        branch: index,
        variables: expect.objectContaining({ 1: 20 }),
      });
      expect(f.y).toBeLessThan(0);
      expect(f.gravity).toBeCloseTo(80 * (393 / 65536) * 1.5);
    },
  );
});

describe('recovered power gauge', () => {
  it('carries into up to three stocks and borrows back from them', () => {
    const f = new Match().fighters[0];
    addPower(f, 95);
    expect(f).toMatchObject({ power: 95, stock: 0 });
    addPower(f, 10);
    expect(f).toMatchObject({ power: 5, stock: 1 });
    addPower(f, 250);
    expect(f).toMatchObject({ power: 0, stock: 3 });
    addPower(f, -1);
    expect(f).toMatchObject({ power: 99, stock: 2 });
    addPower(f, -250);
    expect(f).toMatchObject({ power: 49, stock: 0 });
    addPower(f, -60);
    expect(f).toMatchObject({ power: 0, stock: 0 });
  });

  it('credits the attack and both sides of each hit or block reaction', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 600;
    target.x = 750;
    // Action 246 adds 8; each strong hit (75) adds 5 to the victim, 3 to Ryuko.
    match.step({ iori: true });
    expect(attacker.power).toBe(8);
    ticks(match, 30);
    expect(target).toMatchObject({ action: 'hitHeavy', power: 5 });
    expect(attacker.power).toBe(11);
    const blocker = new Match();
    blocker.fighters[1].x = blocker.fighters[0].x + 100;
    ticks(blocker, 10, { punch: true }, { guard: true });
    // Weak guard (149) adds 1 to the defender only; punch 1 adds nothing.
    expect(blocker.fighters[1]).toMatchObject({ action: 'block', power: 1 });
    expect(blocker.fighters[0].power).toBe(0);
  });

  it('credits both sides of a grounded axe hit and of a throw', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 500;
    target.x = 900;
    match.step({ axe: true });
    for (let i = 0; i < 100 && target.action === 'idle'; i++) match.step();
    // Response 50 → FB (110) adds 10 to the thrower (PC 1442), then 75 adds
    // 5 and 3 (PC 790) and stops the victim 15 ticks (PC 791). Authored: an
    // object's victim doesn't pause its owner.
    expect(target).toMatchObject({ action: 'hitHeavy', power: 5, hitStop: 15 });
    expect(attacker).toMatchObject({ power: 13, hitStop: 0 });
    const thrower = new Match();
    thrower.fighters[1].x = thrower.fighters[0].x + 100;
    // The grab box at age 7, then Chuck Hit's toss at its age 65 (PC 2769).
    ticks(thrower, 8 + 65, { throw: true });
    expect(thrower.fighters[1].action).toBe('dstToss');
    // PC 2770 credits 5 to both; the toss (129) credits none.
    expect(thrower.fighters[0].power).toBe(5);
    expect(thrower.fighters[1].power).toBe(5);
  });
});

describe('recovered supers', () => {
  function superMatch(gap: number, stock = 3, facing: 1 | -1 = 1) {
    const match = new Match();
    const [ryuko, target] = match.fighters;
    ryuko.x = facing === 1 ? 500 : 1400;
    target.x = ryuko.x + facing * gap;
    ryuko.stock = stock;
    return { match, ryuko, target };
  }
  function until(match: Match, done: () => boolean, limit = 2000) {
    for (let i = 0; i < limit && !done(); i++) match.step();
    expect(done()).toBe(true);
  }

  it.each([1, -1] as const)(
    'fires Getter Beam for one stock: freeze, 19 rapid hits, then a launch, facing %i',
    (facing) => {
      const { match, ryuko, target } = superMatch(250, 2, facing);
      match.step({ getterBeam: true });
      expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
        action: 'getterBeam',
        stock: 1,
      });
      // Action 264 spawns SUPER STAR (371) and stops the opponent 10 + 65 ticks.
      expect(match.effects.map((e) => e.clip)).toEqual([371]);
      expect(match.effects[0].x - ryuko.x).toBeCloseTo(facing * 21 * 1.5);
      until(match, () => ryuko.age === 73);
      expect(target.hitStop).toBe(1);
      match.step();
      expect(target.hitStop).toBe(0);
      until(match, () => ryuko.age === 94);
      expect(target.hp).toBe(LIFE);
      // Muzzle 271, beam 273 and hitbox 269 spawn at age 95; 269 hits at once.
      match.step();
      expect(
        match.effects.filter((e) => [271, 273, 269].includes(e.clip as number)),
      ).toHaveLength(3);
      // Each box of 269 and 270 (PCs 4036/4040) deals 5.
      expect(target).toMatchObject({ action: 'hitRapid', hp: LIFE - 5 });
      until(match, () => ryuko.age === 284);
      expect(target).toMatchObject({ action: 'hitRapid', hp: LIFE - 19 * 5 });
      // Its final box selects response 58: FBH (112) → action 80.
      match.step();
      expect(target).toMatchObject({ action: 'launchAway', hp: LIFE - 20 * 5 });
      expect(ryuko).toMatchObject({ hits: 20, damage: 20 * 5, power: 13 });
      until(match, () => named(ryuko) !== 'getterBeam');
      expect(ryuko).toMatchObject({ action: 'idle', age: 0, stock: 1 });
      expect(animationDuration(RYUKO.getterBeam)).toBe(375);
    },
  );

  it('guards Getter Beam with rapid blocks, each chipping 1 (20% of 5)', () => {
    const { match, ryuko, target } = superMatch(250);
    match.step({ getterBeam: true }, { guard: true });
    while (ryuko.age < 95) match.step({}, { guard: true });
    expect(target).toMatchObject({ action: 'blockRapid', hp: LIFE - 1 });
    for (let i = 0; i < 300 && named(ryuko) === 'getterBeam'; i++)
      match.step({}, { guard: true });
    expect(target.hp).toBe(LIFE - 20);
  });

  it("hands a cornered beam victim's slide to Ryuko, and her beam follows her (0x40f8ac, 0x40f992)", () => {
    const { match, ryuko, target } = superMatch(400);
    target.x = STAGE_WIDTH - FIGHTER_MARGIN;
    ryuko.x = target.x - 400;
    match.step({ getterBeam: true });
    while (ryuko.age < 95) match.step();
    // Hitbox 269 (op 0x04 flag 0x21) follows Ryuko at (26, −115) and records
    // itself as the striker, so the slides the wall stops push her back.
    const hitbox = match.effects.find((e) => e.clip === 269);
    expect(target.striker).toBe('object');
    ticks(match, 40);
    expect(target.x).toBe(STAGE_WIDTH - FIGHTER_MARGIN);
    expect(ryuko.x).toBeLessThan(target.x - 400);
    expect(hitbox).toMatchObject({ x: ryuko.x + 26 * 1.5, y: -115 * 1.5 });
  });

  it('shouts NO SUPER without stock and gains its power, on the ground and in the air', () => {
    const { match, ryuko } = superMatch(250, 0);
    match.step({ getterBeam: true });
    // Op 0x10 finds no stock and enters action 251, which spawns the NO SUPER
    // lettering (392) and adds 10 power after its five 252 calls.
    expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
      action: 'noSuper',
      stock: 0,
      power: 0,
    });
    expect(match.effects.map((e) => e.clip)).toEqual([392]);
    until(match, () => ryuko.age === 30);
    expect(ryuko.power).toBe(10);
    until(match, () => named(ryuko) !== 'noSuper');
    expect(ryuko.age).toBe(0);
    expect(animationDuration(RYUKO.noSuper)).toBe(40);
    const air = superMatch(250, 0);
    air.match.step({ jump: true });
    ticks(air.match, 20);
    air.match.step({ getterBeam: true });
    const y = air.ryuko.y;
    expect(named(air.ryuko)).toBe('airNoSuper');
    ticks(air.match, 39);
    expect(air.ryuko.y).toBe(y);
    // Action 250 hovers, then jumps to the fall (action 7 + 3).
    air.match.step();
    expect(playing(air.ryuko)).toBe('7+3');
    until(air.match, () => air.ryuko.action === 'land');
  });

  it('hovers during the air Getter Beam, then falls into Dash F lend', () => {
    const { match, ryuko, target } = superMatch(200);
    match.step({ jump: true });
    ticks(match, 20);
    match.step({ getterBeam: true });
    const y = ryuko.y;
    expect(named(ryuko)).toBe('airGetterBeam');
    until(match, () => ryuko.age === 150);
    expect(ryuko.y).toBe(y);
    expect(target.hp).toBeLessThan(LIFE);
    // At age 350 it falls at gravity 60, its landing handler (slot 1, PC
    // 3964) set to Dash F lend (15).
    until(match, () => ryuko.age === 349);
    expect(ryuko.y).toBe(y);
    until(match, () => named(ryuko) === 'dashLand');
    expect(ryuko.y).toBe(0);
  });

  it('switches to the desperation beam at 30% health, with a stronger finish', () => {
    const { match, ryuko, target } = superMatch(250);
    ryuko.hp = 153;
    match.step({ getterBeam: true });
    // Op 0x11 enters G BEAM EVIL (278) at 153 of 510 life or less.
    expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
      action: 'evilBeam',
      stock: 2,
    });
    until(match, () => named(ryuko) !== 'evilBeam');
    // Nineteen 5-damage hits and action 282's 25-damage finish.
    expect(target.hp).toBe(LIFE - 19 * 5 - 25);
  });

  it('grabs with Musashi, lifts and slams the opponent, then both fly', () => {
    const { match, ryuko, target } = superMatch(130);
    match.step({ musashi: true });
    expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
      action: 'musashi',
      stock: 2,
    });
    until(match, () => named(ryuko) === 'musashiHit');
    // Action 256's grab box opens at age 52; its hit handler enters 257.
    expect(target).toMatchObject({ action: 'superHeld', hp: LIFE });
    ticks(match, 20);
    // Op 0x07 lifts held pose 2 (image 102) overhead at (105, −210).
    expect(target.held).toMatchObject({ pose: 2, x: 105, y: -210 });
    expect(target.x - ryuko.x).toBeCloseTo(105 * 1.5);
    expect(target.y).toBeCloseTo(-315);
    until(match, () => target.action === 'fly');
    // Op 0x15 takes 120 of 510 life. The 30-damage box that follows finds no
    // body box: FLY NO HIT (97) sets only a kind-0 one (PC 1181).
    until(match, () => ryuko.action === 'fly');
    expect(target.hp).toBe(LIFE - 120);
    until(match, () => ryuko.action === 'getUp');
    expect(target.action).not.toBe('superHeld');
  });

  it('darkens the court while a super holds variable 14 (action 43)', () => {
    const { match, ryuko, target } = superMatch(300);
    match.step({ getterBeam: true });
    // Action 264 sets variable 14 to 100 at age 0 (PC 3975); action 43, in
    // bucket 15,
    // reads it a tick later.
    expect(ryuko).toMatchObject({
      variables: expect.objectContaining({ 14: 100 }),
      black: { shown: 'none' },
    });
    const shown = Array.from({ length: 13 }, () => {
      match.step();
      return ryuko.black.shown;
    });
    expect(shown).toEqual([
      ...['opaque', 'half', 'half', 'half', 'half', 'half'],
      ...['opaque', 'half', 'half', 'half', 'half', 'half'],
      'opaque',
    ]);
    expect(target.black.shown).toBe('none');
    until(match, () => ryuko.variables[14] === 0);
    // PC 3990 clears it at age 80 (PC 3975 set it); the panel finishes its
    // display.
    expect(ryuko.age).toBe(80);
    let left = 0;
    while (ryuko.black.shown !== 'none') {
      match.step();
      left++;
    }
    expect(left).toBeLessThanOrEqual(6);
  });

  it("fades Musashi Hit's Ryuko to green and back through her fader", () => {
    const { match, ryuko } = superMatch(130);
    match.step({ musashi: true });
    until(match, () => named(ryuko) === 'musashiHit' && ryuko.age === 513);
    // PC 3849: type 2, toward g +30 over 30 ticks from her colour then (0);
    // PC 3850's op 0x23 keeps only its additive mode under the fader. The
    // tick ends at 29 ticks left: g = 30 × (100 − 96) / 100.
    expect(ryuko.fader).toMatchObject({ type: 2, left: 29, ticks: 30 });
    expect(ryuko.color).toEqual({ mode: 2, r: 0, g: 1, b: 0, fade: 0 });
    ticks(match, 29);
    // The last write, at 1 tick left, stays: 30 × 97 / 100.
    expect(ryuko.color).toEqual({ mode: 2, r: 0, g: 29, b: 0, fade: 0 });
    match.step();
    // PC 3857: type 1 back to 0 over 10 ticks from g 29; PC 3861 resets the
    // mode first, and the fader overwrites the offsets: 29 × 90 / 100.
    expect(ryuko).toMatchObject({ age: 543, fader: { type: 1, left: 9 } });
    expect(ryuko.color).toEqual({ mode: 0, r: 0, g: 26, b: 0, fade: 0 });
    ticks(match, 9);
    expect(ryuko.color.g).toBe(2);
  });

  it('misses Musashi out of reach and still spends the stock', () => {
    const { match, ryuko, target } = superMatch(300);
    match.step({ musashi: true });
    until(match, () => named(ryuko) !== 'musashi');
    expect(ryuko).toMatchObject({ action: 'idle', stock: 2 });
    expect(target.hp).toBe(LIFE);
    expect(animationDuration(RYUKO.musashi)).toBe(140);
  });

  it('passes Musashi over an opponent in a guard reaction (kind 0x2a, 0x40f168)', () => {
    for (const bits of [0, 0xc]) {
      const { match, ryuko, target } = superMatch(130);
      match.step({ musashi: true });
      until(match, () => ryuko.age === 51);
      Object.assign(target, { action: 'block', age: 0, reaction: bits });
      match.step();
      expect(target.action).toBe(bits ? 'block' : 'superHeld');
    }
  });

  it('grabs an airborne victim with the IORI cancel Musashi’s slot-1 box (260)', () => {
    // Slot 0 (44, 10) ±(63, 10), kind 0x2a, skips the air; slot 1
    // (60, −130) ±(60, 55), kind 0x18, skips the ground.
    for (const y of [0, -150]) {
      const { match, ryuko, target } = superMatch(120);
      // Action 254 jumps straight into 260, whose boxes open at age 42.
      enter(match, ryuko, RYUKO.superCancel, 41);
      const action = y ? 'airHit' : 'hit';
      Object.assign(target, { action, age: 0, y, vy: 0, reaction: 8 });
      target.gravity = 0;
      match.step();
      expect(target.action).toBe('superHeld');
    }
  });

  it('throws an axe with the hidden command until desperation, then rushes', () => {
    const axe = superMatch(250);
    axe.match.step({ blackRush: true });
    // Action 286 jumps to the axe throw (226) at 153 of 510 life or more.
    expect({ ...axe.ryuko, action: named(axe.ryuko) }).toMatchObject({
      action: 'axeThrow',
      stock: 3,
    });
    const { match, ryuko, target } = superMatch(200);
    ryuko.hp = 147;
    match.step({ blackRush: true });
    expect({ ...ryuko, action: named(ryuko) }).toMatchObject({
      action: 'blackRush',
      stock: 2,
    });
    until(match, () => named(ryuko) !== 'blackRush');
    // Strikes of 30, 13, 13, 13, 13, 13 and 30 source damage.
    expect(ryuko.hits).toBe(7);
    expect(target.hp).toBe(LIFE - 30 - 5 * 13 - 30);
    expect(animationDuration(RYUKO.blackRush)).toBe(270);
  });

  it('meets a guard with the time-stop guards (responses 78–80 → 168–172)', () => {
    const { match, ryuko, target } = superMatch(200);
    match.practice.partner = 'guard';
    // Guard before the super's entry stop freezes the partner.
    match.step();
    expect(target.action).toBe('guard');
    ryuko.hp = 147;
    match.step({ blackRush: true });
    const seen = new Set<string>();
    until(match, () => {
      seen.add(target.action);
      return named(ryuko) !== 'blackRush';
    });
    // Strikes 1–6 guard with 78 → 168; the finish guards with 25 → 154.
    expect([...seen].filter((action) => action !== 'guard')).toEqual([
      'timeStopGuard',
      'blockHeavy',
    ]);
    // Every box but the finish's (kind 4) is kind 6: all chip 20%.
    expect(target.hp).toBe(LIFE - 6 - 5 * 2 - 6);
  });

  it('needs all three stocks for the Mega Getter Beam cinematic', () => {
    const short = superMatch(150, 2);
    short.match.step({ megaBeam: true });
    expect({ ...short.ryuko, action: named(short.ryuko) }).toMatchObject({
      action: 'noSuper',
      stock: 2,
    });
    const { match, ryuko, target } = superMatch(150);
    match.step({ megaBeam: true });
    until(match, () => named(ryuko) === 'megaBeamHit');
    // Response 33 holds the victim in HIT SHOCK INFIN (88) during action 294.
    expect(target.action).toBe('shock');
    expect(ryuko.stock).toBe(0);
    // Every object left between ticks must be drawable; anime beam 296 has no
    // displays and only spawns 297 and 299.
    const seen = new Set<unknown>();
    const drawable = () => {
      match.effects.forEach((e) => seen.add(e.clip));
      expect(match.effects.filter((e) => !animationDuration(e.clip))).toEqual(
        [],
      );
      return false;
    };
    until(match, () => drawable() || target.action === 'fly');
    until(match, () => drawable() || named(ryuko) !== 'megaBeamHit');
    expect([296, 297, 299].map((clip) => seen.has(clip))).toEqual([
      false,
      true,
      true,
    ]);
    // One shock hit, 39 hits from object 303, and its 40-damage finish.
    expect(target.hp).toBe(LIFE - 5 - 39 * 5 - 40);
    expect(animationDuration(RYUKO.megaBeamHit)).toBe(823);
  });

  it('carries the Getter Change Attack through toss, air catch, throw and beam', () => {
    const { match, ryuko, target } = superMatch(120);
    match.step({ changeAttack: true });
    until(match, () => named(ryuko) === 'changeAttackHit');
    expect(ryuko.age).toBe(0);
    expect(target.action).toBe('superHeld');
    // The DST spins (199, 217) end with response 31's toss at age 185.
    until(match, () => target.action === 'dstToss');
    expect(ryuko.age).toBe(185);
    until(match, () => target.action === 'superHeld');
    expect(ryuko.y).toBeLessThan(-700);
    until(match, () => target.action === 'launchAway');
    // Op 0x15 at PC 4808.
    expect(target.hp).toBe(LIFE - 40);
    until(match, () => ryuko.action === 'land');
    expect(target.hp).toBeLessThan(LIFE - 40);
  });

  it('loses the beam objects when Ryuko is hit, and releases a held opponent', () => {
    const { match, ryuko, target } = superMatch(250);
    match.step({ getterBeam: true });
    // Behind Ryuko, the opponent is out of the beam and punches after the freeze.
    target.x = ryuko.x - 100;
    until(match, () => ryuko.age === 100);
    expect(match.effects.some((e) => e.slot === 7)).toBe(true);
    ticks(match, 1, {}, { punch: true });
    until(match, () => named(ryuko) !== 'getterBeam', 20);
    expect(match.effects.filter((e) => e.slot >= 7 && e.slot <= 9)).toEqual([]);
    const held = superMatch(130);
    held.match.step({ musashi: true });
    until(held.match, () => held.target.action === 'superHeld');
    // Any interruption of the holder's script lets go of the victim.
    held.ryuko.action = 'hit';
    held.match.step();
    expect(held.target.action).toBe('hit');
  });
});

describe('IORI chain', () => {
  // The F key writes IORI's ↓← and P; each stage's op 0x24 reads them at age
  // 29 or 31 (PCs 3625, 3661). Press one tick before.
  const followUp = (f: Fighter) =>
    (named(f) === 'iori' && f.age === 28) ||
    (named(f) === 'iori2' && f.age === 30);
  it.each([1, -1] as const)(
    'plays all three strikes and the knockdown facing %i',
    (facing) => {
      for (const blocked of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 440 : 1480;
        target.x = f.x + facing * 220;
        const contacts: number[] = [];
        const actions = new Set<string>();
        for (let tick = 0; tick < 320; tick++) {
          match.step(
            {
              iori: tick === 0 || followUp(f),
            },
            { guard: blocked },
          );
          actions.add(named(f));
          if (hitEffects(match).some((e) => e.age === 0))
            contacts.push(match.ticks);
        }
        expect(actions).toEqual(new Set(['iori', 'iori2', 'iori3', 'idle']));
        expect(contacts).toEqual(blocked ? [22, 63, 102] : [22, 68, 112]);
        // Boxes of 15, 18 and 20 (kind 7), or 20% chip of each on guard.
        const damage = blocked ? 3 + 3 + 4 : 15 + 18 + 20;
        expect(f).toMatchObject({ hits: blocked ? 0 : 3, damage });
        expect(target).toMatchObject({
          hp: LIFE - damage,
          y: 0,
          action: blocked ? 'guard' : 'idle',
        });
      }
    },
  );

  it.each([1, -1] as const)(
    'preserves the three source lunge distances on whiff facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = facing === 1 ? 185 : 1735;
      target.x = f.x + facing * 800;
      const start = f.x;
      const stages: number[] = [];
      let previous = named(f);
      for (let tick = 0; tick < 140; tick++) {
        match.step({
          iori: tick === 0 || followUp(f),
        });
        if (
          named(f) !== previous &&
          ['iori2', 'iori3', 'idle'].includes(named(f))
        )
          stages.push((f.x - start) * facing);
        previous = named(f);
      }
      expect(stages[0]).toBeCloseTo(95.947266, 5);
      expect(stages[1] - stages[0]).toBeCloseTo(157.413483, 5);
      expect(stages[2] - stages[1]).toBeCloseTo(155.914307, 5);
      expect(f.action).toBe('idle');
      expect(f.hits).toBe(0);
      expect(hitEffects(match)).toHaveLength(0);
    },
  );

  it('reads a press during hit-stop at the check after the active display', () => {
    // After contact, the cancel window (PC 3603) scans every tick, and each
    // match of IORI's 40-tick command clears all but the last 20 ticks
    // (0x41073e): a press early in the hit-stop has lost its ↓← by age 29.
    for (const early of [true, false]) {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = 440;
      ticks(match, 22, { iori: true });
      expect({ ...f, action: named(f) }).toMatchObject({
        action: 'iori',
        age: 21,
        hitStop: 15,
      });
      const positions = [f.x, target.x];
      ticks(match, early ? 1 : 11);
      match.step({ iori: true });
      ticks(match, early ? 13 : 3);
      expect(f).toMatchObject({ age: 21, hitStop: 0 });
      expect([f.x, target.x]).toEqual(positions);
      ticks(match, 7);
      expect({ ...f, action: named(f) }).toMatchObject({
        action: 'iori',
        age: 28,
      });
      match.step();
      expect({ ...f, action: named(f) }).toMatchObject(
        early ? { action: 'iori', age: 29 } : { action: 'iori2', age: 0 },
      );
    }
  });

  it('chains only at its checks, and a held button never chains or repeats', () => {
    for (const late of [false, true]) {
      const match = new Match();
      match.fighters[1].x = 1700;
      ticks(match, 58, { iori: true });
      expect({
        ...match.fighters[0],
        action: named(match.fighters[0]),
      }).toMatchObject({ action: 'iori', age: 57 });
      if (late) {
        match.step();
        // The finite recovery has ended: this is a new stage one, not stage two.
        match.step({ iori: true });
        expect({
          ...match.fighters[0],
          action: named(match.fighters[0]),
        }).toMatchObject({ action: 'iori', age: 0 });
      } else {
        ticks(match, 100, { iori: true });
        expect(match.fighters[0].action).toBe('idle');
      }
    }
    // The last check reads 20 ticks at age 54 (PC 3630). A press after it
    // stays buffered in IORI's 40-tick window and starts IORI again.
    for (const age of [54, 55]) {
      const late = new Match();
      late.fighters[1].x = 1700;
      late.step({ iori: true });
      ticks(late, age - 1);
      late.step({ iori: true });
      expect({
        ...late.fighters[0],
        action: named(late.fighters[0]),
      }).toMatchObject(
        age === 54 ? { action: 'iori2', age: 0 } : { action: 'iori', age },
      );
      if (age === 55) {
        ticks(late, 4);
        expect({
          ...late.fighters[0],
          action: named(late.fighters[0]),
        }).toMatchObject({ action: 'iori', age: 0 });
      }
    }
  });

  it.each([1, -1] as const)(
    'pulls the second-hit victim inward after its hold facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      Object.assign(f, { x: 960, facing });
      enter(match, f, RYUKO.iori2, 22);
      target.x = f.x + facing * 200;
      match.step();
      expect(target).toMatchObject({ action: 'hitPull', hitStop: 15 });
      const start = target.x;
      ticks(match, 23);
      expect(target).toMatchObject({ age: 8, x: start });
      match.step();
      expect((target.x - start) * facing).toBeCloseTo(-9.654694, 5);
    },
  );

  it('slams an airborne finisher into a bounce, floor recovery, and get-up', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    f.x = 530;
    enter(match, f, RYUKO.iori3, 20);
    Object.assign(target, {
      action: 'jump',
      y: -80,
      vy: 0,
      gravity: 0,
    });
    match.step();
    expect(target).toMatchObject({
      action: 'launchDown',
      hitStop: 15,
      hp: LIFE - 20,
    });
    ticks(match, 23);
    expect(target).toMatchObject({ age: 8, y: -80, vx: 0, vy: 0 });
    match.step();
    expect(target.y).toBeCloseTo(-49.116974, 5);
    ticks(match, 2);
    expect(target).toMatchObject({ action: 'slamBounce', y: 0 });
    ticks(match, 9);
    expect(target.y).toBe(0);
    match.step();
    expect(target.y).toBeCloseTo(-9.864578, 5);
    const seen = new Set<string>();
    for (let tick = 0; tick < 180; tick++) {
      seen.add(target.action);
      match.step({}, { jump: true, punch: true });
    }
    expect(seen).toEqual(
      new Set(['slamBounce', 'bounceDown', 'getUp', 'idle']),
    );
    expect(target).toMatchObject({ y: 0, hp: LIFE - 20 });
  });

  it.each([false, true])(
    'clears buffered follow-ups on interruption (trade=%s)',
    (trade) => {
      const match = new Match();
      const f = match.fighters[0];
      f.x = 530;
      for (let tick = 0; tick < 23; tick++)
        match.step(
          { iori: tick === 0 || tick === 2 },
          { kick: tick === (trade ? 14 : 0) },
        );
      expect(f.action).toBe('hit');
      expect(f.hits).toBe(trade ? 1 : 0);
      ticks(match, 160);
      expect(f.action).toBe('idle');
    },
  );

  it('has no air action and uses the normal KO path on a lethal finisher', () => {
    // In the air IORI's command has no action, so its P makes the air punch.
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 20);
    match.step({ iori: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.airPunch);
    const ko = new Match();
    ko.fighters[0].x = 530;
    enter(ko, ko.fighters[0], RYUKO.iori3, 20);
    // 60% of IORI 3's 20 at desperation life.
    ko.fighters[1].hp = 12;
    ko.step();
    expect(ko.fighters[1]).toMatchObject({ action: 'down', hp: 0 });
    ticks(ko, ROUND_END_TICKS);
    expect(ko.fighters[1]).toMatchObject({ action: 'koLand', y: 0 });
  });

  it.each([1, -1] as const)(
    'keeps the chain bounded at the stage wall facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = facing === 1 ? STAGE_WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
      f.x = target.x - facing * 130;
      for (let tick = 0; tick < 220; tick++) {
        match.step({
          iori: tick === 0 || followUp(f),
        });
        expect(f.x).toBeGreaterThanOrEqual(FIGHTER_MARGIN);
        expect(f.x).toBeLessThanOrEqual(STAGE_WIDTH - FIGHTER_MARGIN);
      }
      expect(f.hits).toBe(3);
    },
  );

  it('finishes the airborne slam and bounce recovery after timeout', () => {
    const match = new Match('cpu');
    match.fighters[0].x = 530;
    enter(match, match.fighters[0], RYUKO.iori3, 20);
    Object.assign(match.fighters[1], {
      action: 'jump',
      y: -80,
      vy: 0,
      gravity: 0,
    });
    match.ticks = 5999;
    match.step({}, {});
    expect(match.winner).toBe('player');
    expect(match.fighters[1].action).toBe('launchDown');
    untilResult(match);
    expect(match.fighters[1]).toMatchObject({ action: 'draw', y: 0 });
  });
});

describe('prototype training rules', () => {
  // Action 180 lunges 13 ticks at raw velocity 600 before its first strike.
  const LUNGE = 13 * 600 * (655 / 65536) * 1.5;
  it.each([1, -1] as const)(
    'holds the opponent through three spins of action 199, then tosses them facing %i',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 550 : 410;
      target.x = facing === 1 ? 660 : 300;
      // A turning fighter (23/24) has no body box low enough to grab.
      attacker.facing = facing;
      target.facing = facing === 1 ? -1 : 1;
      ticks(match, 8, { throw: true });
      // PC 2765: response 30 holds the victim 60 source pixels ahead.
      expect({ ...attacker, action: named(attacker) }).toMatchObject({
        action: 'throw',
        age: 0,
      });
      expect(target).toMatchObject({
        action: 'superHeld',
        x: attacker.x + facing * 90,
        y: 0,
      });
      const poses = new Set<number>();
      const offsets = new Set<number>();
      // Chuck Hit tosses at its age 65 (PC 2769).
      for (let tick = 1; tick < 65; tick++) {
        match.step({ punch: true, jump: true }, { jump: true, dash: true });
        expect(named(attacker)).toBe('throw');
        expect(target).toMatchObject({ action: 'superHeld', hp: LIFE });
        poses.add(animationFrame(RYUKO.throw, attacker.age).image);
        offsets.add(Math.round((target.x - attacker.x) * facing));
      }
      expect(poses).toEqual(new Set([106, 107, 108, 110]));
      // Op 0x07 holds at 60, −10, −60 and 0 source pixels, scaled by 1.5.
      expect([...offsets]).toEqual([90, -15, -90, 0]);
      match.step();
      // PC 2769: response 31 at (14, −96) enters action 129, which launches
      // as it runs after Ryuko's script; PC 2770 deals 30.
      expect(target).toMatchObject({
        action: 'dstToss',
        x: attacker.x + facing * (21 + 200 * (655 / 65536) * 1.5),
        y: -144 - 3000 * (655 / 65536) * 1.5 + 90 * (393 / 65536) * 1.5,
        facing: -facing,
        hp: LIFE - 30,
      });
      // The grab and the toss.
      expect({ ...attacker, action: named(attacker) }).toMatchObject({
        action: 'throw',
        age: 65,
        hits: 2,
      });
      expect(animationFrame(RYUKO.throw, attacker.age).image).toBe(111);
    },
  );

  it.each([1, -1] as const)(
    'keeps bodies apart through throw recovery facing %i, easing out on wake-up',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 550 : 410;
      target.x = facing === 1 ? 660 : 300;
      // A turning fighter (23/24) has no body box low enough to grab.
      attacker.facing = facing;
      target.facing = facing === 1 ? -1 : 1;
      ticks(match, 8, { throw: true });
      const seen = new Set<string>();
      for (let tick = 0; tick < 450; tick++) {
        const recovering = ['knockdown', 'getUp'].includes(target.action);
        const previousX = match.fighters.map((f) => f.x);
        match.step(
          target.action === 'getUp'
            ? {}
            : { right: facing === 1, left: facing === -1 },
          {},
        );
        seen.add(target.action);
        // The walker presses into the downed body's push box (knockdown ±26,
        // get-up ±40). Against the wall, get-up's wider box, met a tick late
        // as fighter 1's last box, opens 36 px of overlap at once, which the
        // push eases out a quarter per tick instead of snapping.
        if (['knockdown', 'getUp'].includes(target.action))
          expect((target.x - attacker.x) * facing).toBeGreaterThan(60);
        if (recovering)
          match.fighters.forEach((f, index) =>
            expect(Math.abs(f.x - previousX[index])).toBeLessThanOrEqual(13.5),
          );
      }
      expect(seen).toEqual(
        new Set([
          'superHeld',
          'dstToss',
          'tossBounce',
          'knockdown',
          'getUp',
          'idle',
        ]),
      );
      expect(target.hp).toBe(LIFE - 30);
    },
  );

  it.each([1, -1] as const)(
    'throws at the wall through recovery facing %i',
    (facing) => {
      for (const lethal of [false, true]) {
        const match = new Match();
        if (facing === -1) match.fighters.reverse();
        const direction = { right: facing === 1, left: facing === -1 };
        // Reach the actual wall through movement and body separation.
        ticks(match, 500, direction, direction);
        const target = match.fighters[1];
        if (lethal) target.hp = 18;
        match.step({ throw: true }, {});
        ticks(match, 449);
        expect(target.hp).toBe(lethal ? 0 : LIFE - 30);
        expect(target.action).toBe(lethal ? 'koLand' : 'idle');
      }
    },
  );

  it.each([1, -1] as const)(
    'throws through guard facing %i, then lands and gets up before accepting input',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 550 : 660;
      target.x = facing === 1 ? 660 : 550;
      ticks(match, 8, { throw: true }, { guard: true });
      expect(named(attacker)).toBe('throw');
      expect(target.action).toBe('superHeld');
      ticks(match, 65 - 1, {}, { punch: true, jump: true });
      expect(target).toMatchObject({ action: 'superHeld', hp: LIFE });
      match.step();
      expect(target).toMatchObject({ action: 'dstToss', hp: LIFE - 30 });
      expect(attacker.hits).toBe(2);
      // Op 0x14 applies response 31 without the hit test; its effect word is 0.
      expect(hitEffects(match)).toHaveLength(0);
      // Action 129 flies at raw −200/−3000, gravity 90; landing bounces
      // through PC 1756 into 131, then knockdown.
      const releaseX = target.x;
      for (let tick = 0; tick < 200 && target.action !== 'knockdown'; tick++)
        match.step({}, { jump: true, punch: true });
      expect((target.x - releaseX) * facing).toBeGreaterThan(0);
      expect(target.y).toBe(0);
      expect(target.action).toBe('knockdown');
      ticks(match, animationDuration('knockdown') - 1, {}, { jump: true });
      expect(target.action).toBe('knockdown');
      match.step();
      expect(target.action).toBe('getUp');
      ticks(match, animationDuration('getUp') - 1);
      expect(target.action).toBe('getUp');
      match.step({}, { punch: true });
      expect(playing(target)).toBe(RYUKO.punch);
      expect(target.hp).toBe(LIFE - 30);
      expect(attacker.hits).toBe(2);
    },
  );

  it('whiffs out of range or against an airborne target without repeating a held throw', () => {
    for (const airborne of [false, true]) {
      const match = new Match();
      if (airborne) match.fighters[0].x = 550;
      ticks(match, 15, {}, { jump: airborne });
      ticks(match, 8, { throw: true });
      expect(named(match.fighters[0])).toBe('grab');
      ticks(match, 150, { throw: true });
      expect(match.fighters[0].action).toBe('idle');
      expect(match.fighters[1].hp).toBe(LIFE);
      expect(match.fighters[0].hits).toBe(0);
    }
    const match = new Match();
    ticks(match, 15, { jump: true });
    match.step({ throw: true });
    expect(match.fighters[0].action).toBe('jump');
  });

  it.each([
    ['grab', 7, 167, 168],
    ['dst', 4, 169, 170],
  ] as const)(
    "grabs when %s's op 0x18 box meets the idle body box",
    (move, startup, reached, missed) => {
      // Action 196's box (35, 6) ±(41, 3) (PC 2750) and, beyond the near
      // distance, 220's (37, 6) ±(40, 1) (PC 3189) against idle's (−1, −92)
      // ±(37, 102), both mirrored.
      for (const gap of [reached, missed]) {
        const match = new Match();
        const [attacker, target] = match.fighters;
        attacker.x = 600;
        target.x = 600 + gap;
        ticks(match, startup + 1, {
          [move === 'grab' ? 'throw' : 'dst']: true,
        });
        expect(target.action).toBe(gap === reached ? 'superHeld' : 'idle');
      }
    },
  );

  it.each([
    ['throw', 'punch', 4, true],
    ['throw', 'hit', 8, false],
    ['throw', 'block', 0xc, false],
    ['dst', 'hit', 8, true],
    ['dst', 'block', 0xc, false],
    ['throw', 'turn', 0, false],
    ['dst', 'turn', 0, false],
  ] as const)(
    '%s against a victim in %s (bits %i) grabs: %s',
    (control, state, bits, grabbed) => {
      // 0x40f010 skips a kind-0x80 box against +0x15e & 0xc == 8 (a hit
      // reaction) and a kind-8 box against 0xc (a guard reaction). Action
      // 196's box is kind 0xa8, 214's kind 8. A turn's body box (23, PC 252)
      // ends at y −1, above either box.
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = 600;
      target.x = 720;
      ticks(match, control === 'throw' ? 7 : 4, { [control]: true });
      pose(match, target, state, 0);
      target.reaction = bits;
      match.step();
      expect(target.action).toBe(grabbed ? 'superHeld' : state);
    },
  );

  it('lets strikes interrupt a grab and makes simultaneous grabs whiff fairly', () => {
    for (const attack of ['punch', 'throw'] as const) {
      const match = new Match();
      match.fighters[0].x = 550;
      // A punch pressed a tick earlier lands before the grab's own tick.
      if (attack === 'punch') match.step({}, { punch: true });
      ticks(match, 8, { throw: true }, { [attack]: true });
      expect(named(match.fighters[0])).toBe(
        attack === 'punch' ? 'hit' : 'grab',
      );
      expect(match.fighters[1].action).not.toBe('superHeld');
      expect(match.fighters[1].hp).toBe(LIFE);
    }
    // Action 196's grab tick (PC 2748) keeps only a kind-1 body box, so a
    // simultaneous punch passes through and the grab wins.
    const match = new Match();
    match.fighters[0].x = 550;
    ticks(match, 8, { throw: true }, { punch: true });
    expect(match.fighters[1].action).toBe('superHeld');
  });

  it.each([0, 20, 64])(
    'lets an axe pass through the thrower at hold tick %i',
    (age) => {
      // Chuck Hit (197) sets no op 0x19 body box, so nothing strikes it.
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = 550;
      ticks(match, 8 + age, { throw: true });
      // The other side's axe (227), its box over Ryuko.
      spawn(match, 1, RYUKO.axe, { x: attacker.x + 50, y: -153, facing: -1 });
      match.step();
      expect({ ...attacker, action: named(attacker) }).toMatchObject({
        action: 'throw',
        hp: LIFE,
      });
      expect(target.action).toBe(age === 64 ? 'dstToss' : 'superHeld');
      expect(objects(match, RYUKO.axe)).toHaveLength(1);
    },
  );

  it('KOs the victim at a lethal throw toss, which lies without getting up', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 550;
    // 60% of the throw's 30 at desperation life.
    target.hp = 18;
    ticks(match, 8 + 65, { throw: true });
    expect(match.winner).toBe('player');
    expect(named(attacker)).toBe('throw');
    // The toss's op 0x15 (PC 2770) KOs the victim where it was tossed.
    expect(target).toMatchObject({ action: 'down', hp: 0, y: -144 });
    untilResult(match);
    expect(target).toMatchObject({ action: 'koLand', y: 0 });
    expect(attacker.action).toBe('win');
  });

  it('protects knockdown and get-up after a throw from melee and projectile hits', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 550;
    ticks(match, 8 + 65, { throw: true });
    for (let tick = 0; tick < 200 && target.action !== 'knockdown'; tick++)
      match.step();
    expect(target.action).toBe('knockdown');
    const protectedTicks =
      animationDuration('knockdown') + animationDuration('getUp') - 1;
    for (let tick = 0; tick < protectedTicks; tick++) {
      // Keep attacks in range while the victim lies down and gets up.
      attacker.x = target.x - 100;
      // A fresh axe (227) each tick, its box over the victim.
      match.effects = match.effects.filter(
        (e) => objects(match, RYUKO.axe).indexOf(e) < 0,
      );
      spawn(match, 0, RYUKO.axe, { x: target.x - 80, y: target.y - 125 });
      match.step({ punch: tick % 2 === 0 });
      expect(target.hp).toBe(LIFE - 30);
    }
    expect(target.action).toBe('getUp');
    match.effects = [];
    // Out of reach of the attacker's latest punch.
    attacker.x = target.x - 400;
    match.step();
    expect(target.action).toBe('idle');
  });

  it.each([85, 140, 200])(
    'finishes recovery before a timeout pose at throw tick %i',
    (elapsed) => {
      const match = new Match('cpu');
      match.fighters[0].x = 550;
      ticks(match, elapsed, { throw: true });
      const target = match.fighters[1];
      expect(['dstToss', 'tossBounce', 'knockdown', 'getUp']).toContain(
        target.action,
      );
      match.ticks = 5999;
      match.step({}, {});
      expect(target.action).not.toBe('draw');
      untilResult(match);
      expect(target).toMatchObject({ action: 'draw', y: 0 });
    },
  );

  it('keeps a throw going through a time-out and inside the court', () => {
    for (const facing of [1, -1] as const) {
      const match = new Match('cpu');
      const [attacker, target] = match.fighters;
      attacker.x =
        facing === 1 ? WIDTH - FIGHTER_MARGIN - 110 : FIGHTER_MARGIN + 110;
      target.x = facing === 1 ? WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
      // A turning fighter (23/24) has no body box low enough to grab.
      attacker.facing = facing;
      target.facing = facing === 1 ? -1 : 1;
      ticks(match, 8, { throw: true });
      expect(target.action).toBe('superHeld');
      expect(target.x).toBeGreaterThanOrEqual(FIGHTER_MARGIN);
      expect(target.x).toBeLessThanOrEqual(WIDTH - FIGHTER_MARGIN);
      match.ticks = 5999;
      match.step({}, {});
      expect(match.winner).toBe('draw');
      expect(target.action).toBe('superHeld');
      untilResult(match);
      expect(target).toMatchObject({ action: 'draw', y: 0, hp: LIFE - 30 });
    }
  });

  it('spawns the response effect at the box overlap before knockback, facing the strike', () => {
    for (const facing of [1, -1] as const) {
      for (const blocked of [false, true]) {
        const match = new Match();
        const [attacker, target] = match.fighters;
        attacker.x = facing === 1 ? 530 : 660;
        target.x = facing === 1 ? 660 : 530;
        const targetX = target.x;
        ticks(match, 8, { kick: true }, { guard: blocked });
        // Kick responses 1 and 22 name 339 and 370. Its box (92, −91) ±(60, 31)
        // spans the idle body box (−1, −92) ±(37, 102) across, so the overlap
        // centres on the body's x and the box's y. Only 339 spawns streak 348,
        // whose op 0x20 chain rolls 38, 7719, 21238, 2437 from seed 0: 38 % 3
        // mirrors, 7719 % 6 moves on to 349, 21238 % 5 mirrors, 2437 % 4 stays.
        const clip = blocked ? 370 : 339;
        const x = targetX + facing * 1.5;
        expect(match.effects.map((e) => e.clip)).toEqual(
          blocked ? [370] : [339, '349+17'],
        );
        expect(hitEffects(match)).toMatchObject([
          { clip, x, y: -136.5, age: 0, facing, front: true, owner: 0 },
        ]);
        // Reactions 73/149 slide only after their stop and impact display.
        expect(target.x).toBe(targetX);
        ticks(match, animationDuration(clip) - 1);
        expect(hitEffects(match)).toMatchObject([{ clip, x }]);
        ticks(match, 1);
        expect(hitEffects(match)).toHaveLength(0);
        ticks(match, 20);
        expect((target.x - targetX) * facing).toBeGreaterThan(18);
      }
    }
  });

  it('rolls each streak and star branch of op 0x20 with the shared rand', () => {
    const streaks = new Set();
    const stars = new Set();
    for (let seed = 0; seed < 200; seed++) {
      const match = new Match('practice', false, seed);
      match.fighters[0].x = 530;
      match.fighters[1].x = 660;
      // 345 spawns the streak at contact and small stars 351 at 4 and 14.
      ticks(match, 8, { kick: true });
      streaks.add(match.effects[1].clip);
      ticks(match, 14);
      for (const { clip } of match.effects)
        if (typeof clip === 'number' && clip > 350 && clip < 360)
          stars.add(clip);
    }
    // Three pose sets (348–350), each mirrored at offset 17; 351 falls through
    // to 356's flight or jumps to 352, 354 or 358, each with its trail object.
    expect(streaks).toEqual(
      new Set([348, '348+17', 349, '349+17', 350, '350+17']),
    );
    expect(stars).toEqual(new Set([351, 352, 354, 358, 353, 355, 357, 359]));
  });

  it('centres a crouching punch effect on its box and emits none on a whiff', () => {
    const match = new Match();
    ticks(match, 45, { punch: true });
    expect(hitEffects(match)).toHaveLength(0);
    match.fighters[0].x = 530;
    match.step();
    ticks(match, 15, { crouch: true, punch: true });
    // Response 3 names 340; the box (96, −89) ±(60, 24) lies within the body.
    expect(hitEffects(match)).toMatchObject([{ clip: 340, y: -133.5 }]);
  });

  it('keeps both hit effects when hits trade and finishes them after a KO', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    // Each punch meets the other's 120% body box: 12, or 7 at desperation.
    match.fighters.forEach((f) => {
      f.hp = 7;
    });
    ticks(match, 8, { punch: true }, { punch: true });
    expect(match.winner).toBe('draw');
    expect(hitEffects(match)).toMatchObject([
      { clip: 339, x: 661.5, age: 0, facing: 1, owner: 0 },
      { clip: 339, x: 528.5, age: 0, facing: -1, owner: 1 },
    ]);
    ticks(match, 20);
    expect(hitEffects(match)).toHaveLength(2);
    match.step();
    expect(hitEffects(match)).toHaveLength(0);
    expect(new Match().effects).toHaveLength(0);
  });

  it('spawns the axe response effects for hits and blocks', () => {
    for (const blocked of [false, true]) {
      const match = new Match();
      ticks(match, 40, { axe: true }, { guard: blocked });
      // Responses 50 and 25 name 340 and 370, at the axe box's height.
      expect(hitEffects(match)).toMatchObject([
        { clip: blocked ? 370 : 340, y: -148.5 },
      ]);
      // Action 227's box deals 30 and, as kind 6, chips 20% on guard.
      expect(match.fighters[1].hp).toBe(LIFE - (blocked ? 6 : 30));
    }
  });

  it.each([1, -1] as const)(
    'launches a fast dash hop after startup and lands without repeating facing %i',
    (facing) => {
      for (const backwards of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 440 : 520;
        target.x = facing === 1 ? 775 : 185;
        const start = f.x;
        const input = {
          dash: true,
          left: backwards && facing === 1,
          right: backwards && facing === -1,
        };
        match.step(input);
        const action = backwards ? RYUKO.backdash : RYUKO.dash;
        const startup = backwards ? 10 : 5;
        expect(playing(f)).toBe(action);
        ticks(match, startup - 1, input);
        expect(f.x).toBe(start);
        expect(f.y).toBe(0);
        ticks(match, 6, input);
        expect(playing(f)).toBe(action);
        expect(f.y).toBeLessThan(-10);
        expect((f.x - start) * facing).toBeCloseTo(
          backwards ? -44.975281 : 80.955505,
          5,
        );
        let landed = false;
        // Each lands into Dash F lend (15, handler slot 1 at PCs 170/180).
        for (let i = 0; i < 80; i++) {
          match.step(input, {});
          if (playing(f) === RYUKO.dashLand) {
            landed = true;
            break;
          }
          expect(playing(f)).toBe(action);
        }
        expect(landed).toBe(true);
        expect(f.y).toBe(0);
        expect(Math.abs(f.x - start)).toBeGreaterThan(150);
        ticks(match, 8, { dash: true });
        expect(f.action).toBe('idle');
      }
    },
  );

  it.each([1, -1] as const)(
    'matches complete source ground-dash travel and airtime facing %i',
    (facing) => {
      for (const backwards of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        // Far enough that the dash never reaches the target's push box, and
        // near enough that the back dash stays inside the camera walls.
        f.x = facing === 1 ? 440 : 760;
        target.x = f.x + facing * 500;
        const start = f.x;
        match.step({
          dash: true,
          left: backwards && facing === 1,
          right: backwards && facing === -1,
        });
        ticks(match, backwards ? 9 : 4);
        let flight = 0;
        let apex = 0;
        while (playing(f) !== RYUKO.dashLand && flight < 80) {
          match.step();
          flight++;
          apex = Math.max(apex, -f.y);
        }
        // PCs 169/182: vx 900/-500, vy -500/-900, gravity 90.
        expect(flight).toBe(backwards ? 33 : 18);
        expect((f.x - start) * facing).toBeCloseTo(
          backwards ? -247.364044 : 242.866516,
          5,
        );
        expect(apex).toBeCloseTo(backwards ? 105.78186 : 31.032944, 5);
        expect(f.vx).toBe(0);
        ticks(match, 20);
        expect(f.x).toBeCloseTo(
          start + facing * (backwards ? -247.364044 : 242.866516),
          5,
        );
      }
    },
  );

  it.each([1, -1] as const)(
    'keeps incoming jump momentum until the air-dash launch facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = facing === 1 ? 185 : 775;
      target.x = facing === 1 ? 775 : 185;
      match.step({ jump: true, right: facing === 1, left: facing === -1 });
      ticks(match, 20);
      match.step({ dash: true, left: facing === 1, right: facing === -1 });
      const x = f.x;
      const y = f.y;
      expect(playing(f)).toBe(RYUKO.airBackdash);
      expect(f.vx * facing).toBeCloseTo(5.996704, 5);
      expect(f.vy).toBeCloseTo(-11.633606, 5);
      ticks(match, 2);
      expect((f.x - x) * facing).toBeCloseTo(11.993408, 5);
      expect(f.y - y).toBeCloseTo(-21.108398, 5);
      const launchY = f.y;
      match.step();
      expect(f.x).toBeCloseTo(x, 5);
      expect(f.vx * facing).toBeCloseTo(-11.993408, 5);
      expect(f.vy).toBe(0);
      expect(f.y).toBe(launchY);
    },
  );

  it.each([1, -1] as const)(
    'carries recovered air-dash velocity through level travel and falling facing %i',
    (facing) => {
      for (const backwards of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        const direction = facing * (backwards ? -1 : 1);
        f.x = direction === 1 ? (backwards ? 300 : 185) : backwards ? 660 : 775;
        target.x = facing === 1 ? 775 : 185;
        match.step({ jump: true });
        ticks(match, 32);
        match.step({
          dash: true,
          left: backwards && facing === 1,
          right: backwards && facing === -1,
        });
        const start = f.x;
        const entryHeight = f.y;
        const action = backwards ? RYUKO.airBackdash : RYUKO.airDash;
        expect(playing(f)).toBe(action);
        ticks(match, 2);
        expect(f.x).toBe(start);
        expect(f.y - entryHeight).toBeCloseTo(-5.337067, 5);
        const height = f.y;
        match.step();
        expect((f.x - start) * direction).toBeCloseTo(11.993408, 5);
        expect(animationFrame(action, f.age).image).toBe(backwards ? 46 : 45);
        // Actions 16/17: raw velocity +/-800 for 30/20 level ticks.
        ticks(match, backwards ? 19 : 29);
        expect((f.x - start) * direction).toBeCloseTo(
          backwards ? 239.868164 : 359.802246,
          5,
        );
        expect(f.y).toBe(height);
        match.step();
        expect(f.y - height).toBeCloseTo(0.719604, 5);
        // The ten recovery ticks restore gravity, retaining horizontal velocity.
        ticks(match, 9);
        expect((f.x - start) * direction).toBeCloseTo(
          backwards ? 359.802246 : 479.736328,
          5,
        );
        expect(f.y - height).toBeCloseTo(39.578247, 5);
        expect(playing(f)).toBe(action);
        match.step();
        // Then the fall (7) it jumps to, still acting: the guard key, which
        // only a free fighter reads, waits for the landing (0x40f3c2).
        const driftStart = f.x;
        match.step({ guard: true });
        expect(playing(f)).toBe(action);
        expect((f.x - driftStart) * direction).toBeCloseTo(11.993408, 5);
        expect(f.y).toBeGreaterThan(height + 39.578247);
        ticks(match, 100);
        expect(f.y).toBe(0);
        expect(f.vx).toBe(0);
        const landedX = f.x;
        ticks(match, 20);
        expect(f.x).toBe(landedX);
      }
    },
  );

  it.each([1, -1] as const)(
    'finishes the whole air dash past the opponent facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = facing === 1 ? 300 : 1620;
      target.x = facing === 1 ? 660 : 1260;
      match.step({ jump: true });
      ticks(match, 32);
      match.step({ dash: true });
      const start = f.x;
      let elapsed = 0;
      while (f.action !== 'land' && elapsed < 100) {
        match.step();
        elapsed++;
      }
      expect(elapsed).toBe(62);
      // 30 level ticks + 30 falling ticks at raw velocity 800.
      expect((f.x - start) * facing).toBeCloseTo(719.604492, 5);
      expect(f.vx).toBe(0);
      expect(f.hp).toBe(LIFE);
      expect(target.hp).toBe(LIFE);
    },
  );

  it('keeps projectiles active beyond the original viewport edge', () => {
    const match = new Match();
    match.fighters[0].x = 1100;
    match.fighters[1].x = 1460;
    ticks(match, 40, { axe: true });
    expect(match.fighters[1].hp).toBe(LIFE - 30);
    // The axe box's leading 13 pixels overlap the body box from x 1406.
    const [effect] = hitEffects(match);
    expect(effect.clip).toBe(340);
    expect(effect.x).toBeCloseTo(1412.702, 3);
  });

  it('eases the camera halfway to the fighters each tick, within the stage (0x40b022)', () => {
    const match = new Match();
    const [player, target] = match.fighters;
    // Until the first step it sits on its aim, 320 source pixels left of and
    // above the midpoint: here the stage's left end and the floor.
    expect([match.cameraX, match.cameraY]).toEqual([0, 0]);
    match.step();
    player.x = 525;
    target.x = 885;
    // The aim is now 470 − 320 = 150 source pixels, and the camera keeps
    // moving through round endings.
    const xs: number[] = [];
    for (const winner of [null, null, 'player', 'draw'] as const) {
      match.winner = winner;
      match.step();
      xs.push(match.cameraX / 1.5);
    }
    expect(xs).toEqual([75, 112, 131, 140]);
    const at = (positions: [number, number, number, number]) => {
      const fresh = new Match();
      [fresh.fighters[0].x, fresh.fighters[0].y] = positions;
      [fresh.fighters[1].x, fresh.fighters[1].y] = positions.slice(2);
      return [fresh.cameraX, fresh.cameraY];
    };
    // Vertically it aims 320 above the midpoint, so it rises once the pair's
    // midpoint is 120 source pixels (180 arena) off the floor.
    expect(at([900, -300, 1260, 0])).toEqual([600, 0]);
    expect(at([900, -600, 1260, 0])).toEqual([600, -120]);
    expect(at([900, -2000, 1260, -2000])).toEqual([600, -720]);
    expect(at([FIGHTER_MARGIN, 0, 885, 0])).toEqual([0, 0]);
    expect(at([1035, 0, STAGE_WIDTH - FIGHTER_MARGIN, 0])).toEqual([
      STAGE_WIDTH - WIDTH,
      0,
    ]);
  });

  it('holds both fighters inside walls 50 and 590 source pixels from the camera (0x40fba2)', () => {
    const match = new Match();
    const [player, target] = match.fighters;
    match.step();
    expect(match.cameraX).toBe(0);
    for (let tick = 0; tick < 300; tick++)
      match.step({ left: true }, { right: true });
    // Pulling apart, they meet the walls 540 source pixels apart, and the
    // camera settles on their midpoint.
    expect(target.x - player.x).toBe(540 * 1.5);
    expect(player.x - match.cameraX).toBe(FIGHTER_MARGIN);
    expect(target.x - match.cameraX).toBe(WIDTH - FIGHTER_MARGIN);
  });

  it('ends a low air dash on landing before its recovery clip finishes', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    f.x = 185;
    target.x = 775;
    // Rising, as no air command comes within 50 source pixels of the floor
    // on the way down (0x410096).
    Object.assign(f, { action: 'jump', y: -10, vy: -5, gravity: 0.72 });
    match.step({ dash: true });
    ticks(match, 2);
    const height = f.y;
    ticks(match, 30);
    expect(f.y).toBe(height);
    while (f.y < 0) {
      expect(playing(f)).toBe(RYUKO.airDash);
      match.step();
    }
    // Before its fall (age 43) the dash sets no landing handler, so landing
    // ends it (0x411810) and the free state takes over.
    expect(f.action).toBe('idle');
    expect(f.vx).toBe(0);
    const landedX = f.x;
    ticks(match, 20);
    expect(f.x).toBe(landedX);
  });

  it('takes no air dash within 50 source pixels of the floor on the way down (0x410096)', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 65);
    match.step({ dash: true });
    expect(f.action).toBe('jump');
  });

  it.each([1, 10])(
    'falls after an air dash is interrupted at age %i',
    (age) => {
      const match = new Match();
      const [f, target] = match.fighters;
      match.step({ jump: true });
      ticks(match, 32);
      match.step({ dash: true });
      ticks(match, age - 1);
      target.x = f.x + 100;
      target.y = f.y;
      target.vy = target.gravity = 0;
      strike(match, target, RYUKO.airPunch);
      match.step();
      expect(f.action).toBe('airHitHeavy');
      expect(f.hitStop).toBe(15);
      const height = f.y;
      const x = f.x;
      ticks(match, 15);
      expect(f.y).toBe(height);
      expect(f.x).toBe(x);
      match.step();
      // Hit 76's first op 0x01 (PC 816) replaces the dash's motion either way.
      expect(f.y - height).toBeCloseTo(-100 * (655 / 65536) * 1.5, 6);
      ticks(match, 100);
      expect(f.y).toBe(0);
      expect(f.vx).toBe(0);
    },
  );

  it('clamps a backdash at the wall while completing its hop', () => {
    const match = new Match();
    match.fighters[0].x = FIGHTER_MARGIN + 5;
    ticks(match, 20, { left: true, dash: true });
    expect(match.fighters[0].x).toBe(FIGHTER_MARGIN);
    expect(match.fighters[0].y).toBeLessThan(0);
    ticks(match, 80, { dash: true });
    expect(match.fighters[0].action).toBe('idle');
  });

  it.each([-1, 0, 1] as const)(
    'keeps the jump arc with a held takeoff direction %i, then released input',
    (direction) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = direction === -1 ? 775 : direction === 1 ? 185 : 480;
      target.x = direction === -1 ? 185 : 775;
      const start = f.x;
      const held = {
        left: direction === -1,
        right: direction === 1,
      };
      match.step({ jump: true, ...held });
      ticks(match, 8, held);
      expect(f.x).toBe(start);
      expect(f.action).toBe('jump');
      let apex = 0;
      let flight = 0;
      while (f.action !== 'land' && flight < 100) {
        // Holding through takeoff does not dash; releasing preserves momentum.
        match.step(flight < 15 ? held : {});
        apex = Math.max(apex, -f.y);
        flight++;
      }
      expect(flight).toBe(direction ? 58 : 60);
      expect(apex).toBeCloseTo(direction ? 295.6375 : 317.5255, 3);
      expect(f.x - start).toBeCloseTo(direction * 347.8088, 3);
      const landingX = f.x;
      ticks(match, 20);
      expect(f.x).toBe(landingX);
    },
  );

  it.each(['punch', 'kick', 'guard'] as const)(
    'preserves jump travel during aerial %s',
    (control) => {
      const match = new Match();
      match.fighters[0].x = 185;
      match.fighters[1].x = 775;
      match.step({ jump: true, right: true });
      ticks(match, 12);
      match.step({ [control]: true });
      const start = match.fighters[0].x;
      ticks(match, 10, { [control]: true });
      expect(match.fighters[0].x - start).toBeCloseTo(59.967, 3);
    },
  );

  it.each([-1, 0, 1] as const)(
    'selects double-jump direction %i after its brief pause',
    (direction) => {
      const match = new Match();
      const f = match.fighters[0];
      f.x = 480;
      match.fighters[1].x = 775;
      match.step({ jump: true, right: true });
      ticks(match, 20);
      match.step({
        jump: true,
        left: direction === -1,
        right: direction === 1,
      });
      const start = f.x;
      const height = f.y;
      // Jump 2 (10–12) holds still for three ticks (PC 124), then PCs
      // 129/144/159 set raw ±400 and −1300/−1200 with gravity 80, which the
      // motion pass (0x40f910) applies on that tick.
      ticks(match, 2);
      expect(f.x).toBe(start);
      expect(f.y).toBe(height);
      match.step();
      expect(f.vy).toBeCloseTo(
        (direction ? -1200 : -1300) * (655 / 65536) * 1.5 +
          80 * (393 / 65536) * 1.5,
        5,
      );
      expect(f.y - height).toBeCloseTo(f.vy, 5);
      ticks(match, 5);
      expect(f.x - start).toBeCloseTo(direction * 35.9802, 3);
    },
  );

  it.each(['dash', 'drill'] as const)(
    'replaces jump momentum with aerial %s motion',
    (control) => {
      const match = new Match();
      const f = match.fighters[0];
      f.x = 185;
      match.fighters[1].x = 775;
      match.step({ jump: true, right: true });
      ticks(match, 20);
      match.step({ [control]: true });
      const start = f.x;
      const height = f.y;
      ticks(match, 10);
      expect(f.x - start).toBeCloseTo(control === 'dash' ? 107.940674 : 0, 5);
      expect(f.y - height).toBeCloseTo(control === 'dash' ? -21.108398 : 0, 5);
      ticks(match, 150);
      const landedX = f.x;
      ticks(match, 20);
      expect(f.x).toBe(landedX);
      expect(f.y).toBe(0);
    },
  );

  it.each([1, -1] as const)(
    'double-taps either direction to dash relative to facing %i',
    (facing) => {
      for (const direction of [1, -1]) {
        const match = new Match();
        if (facing === -1) match.fighters.reverse();
        const input = { left: direction === -1, right: direction === 1 };
        match.step(input);
        expect(match.fighters[0].action).toBe(
          direction === facing ? 'walk' : 'backwalk',
        );
        // DASH F and B: the direction, neutral, then the direction again,
        // all within 13 ticks.
        ticks(match, 11);
        match.step(input);
        expect(playing(match.fighters[0])).toBe(
          direction === facing ? RYUKO.dash : RYUKO.backdash,
        );
        const start = match.fighters[0].x;
        ticks(match, 16, input);
        expect((match.fighters[0].x - start) * direction).toBeGreaterThan(25);
      }
    },
  );

  it('needs a neutral tick between the taps, all within the window', () => {
    for (const between of [
      Array<Input>(12).fill({}),
      [{ left: true }],
      [{ right: true, crouch: true }],
      'clear',
    ] as const) {
      const match = new Match();
      match.step({ right: true });
      if (between === 'clear') match.clearInput();
      else between.forEach((input) => match.step(input));
      match.step({ right: true });
      expect(playing(match.fighters[0])).not.toBe(RYUKO.dash);
    }
    const held = new Match();
    ticks(held, 20, { right: true });
    expect(held.fighters[0].action).toBe('walk');
  });

  it.each([1, -1] as const)(
    'double-taps either direction for an air dash relative to facing %i',
    (facing) => {
      for (const direction of [1, -1]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = 960;
        target.x = f.x + facing * 300;
        match.step({ jump: true });
        ticks(match, 25);
        const input = { left: direction === -1, right: direction === 1 };
        match.step(input);
        match.step();
        match.step(input);
        expect(playing(f)).toBe(
          direction === facing ? RYUKO.airDash : RYUKO.airBackdash,
        );
        const start = f.x;
        ticks(match, 6, input);
        expect((f.x - start) * direction).toBeCloseTo(47.97363, 4);
      }
    },
  );

  it('ignores simultaneous directions in the air and needs neutral between taps', () => {
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 20);
    match.step({ left: true, right: true });
    expect(match.fighters[0].action).toBe('jump');
    match.step({ right: true });
    expect(match.fighters[0].action).toBe('jump');
    match.step();
    match.step({ right: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.airDash);
  });

  it('takes only one air dash per flight', () => {
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 25);
    match.step({ left: true });
    match.step();
    match.step({ left: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.airBackdash);
    // Into its fall (7) at age 33, whose window (0–250) refuses DASH F (254).
    ticks(match, 33);
    match.step({ right: true });
    match.step();
    match.step({ right: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.airBackdash);
  });

  it('allows one double jump and one air dash per flight and resets both on landing', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 15);
    match.step({ jump: true });
    expect(playing(f)).toBe(RYUKO.doubleJump);
    const pauseHeight = f.y;
    expect(f.vy).toBe(0);
    ticks(match, 2, { jump: true });
    expect(f.y).toBe(pauseHeight);
    match.step();
    expect(f.y).toBeLessThan(pauseHeight);
    // Its window (PC 130, levels 1–254) refuses another Jump 2 (255).
    match.step({ jump: true });
    expect(playing(f)).toBe(RYUKO.doubleJump);
    match.step({ dash: true });
    expect(playing(f)).toBe(RYUKO.airDash);
    const height = f.y;
    ticks(match, 20);
    // Two more ticks of Jump 2's rise (raw −1300, gravity 80 from its age 3,
    // now its ages 6 and 7), then PC 205's level flight.
    expect(f.y - height).toBeCloseTo(
      -2 * 1300 * (655 / 65536) * 1.5 + 9 * 80 * (393 / 65536) * 1.5,
      5,
    );
    // Into its fall (7) at age 43, which refuses the air dash (254).
    ticks(match, 43 - 20);
    match.step({ dash: true });
    expect(playing(f)).toBe(RYUKO.airDash);
    ticks(match, 150);
    expect(f.y).toBe(0);
    // Landing frees it, and a jump takes a double jump again.
    match.step({ jump: true });
    ticks(match, 15);
    match.step({ jump: true });
    expect(playing(f)).toBe(RYUKO.doubleJump);
  });

  it.each([1, -1] as const)(
    'stops a forward air dash at the wall facing %i, then falls off the cornered body',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = facing === 1 ? STAGE_WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
      f.x = target.x - facing * 110;
      match.step({ jump: true }, {});
      ticks(match, 32);
      match.step({ dash: true }, {});
      expect(playing(f)).toBe(RYUKO.airDash);
      expect(f.y).toBeLessThan(-120);
      for (let age = 0; age < 42; age++) {
        const previousX = f.x;
        match.step({}, {});
        expect((f.x - previousX) * facing).toBeGreaterThanOrEqual(0);
        expect(Math.abs(f.x - previousX)).toBeLessThanOrEqual(12);
      }
      // The dash box (−76 ±27) passes over the idle body (−92 ±102) to the
      // wall. The fall (7) it jumps to at age 43 pushes with its own box (−3,
      // −141) ±(39, 52) (PC 96), which clears that body until the jumper
      // comes down to it at age 53. Sharing x, the push then moves the jumper
      // off a quarter of their overlap, in whole source pixels.
      expect(f.x).toBe(target.x);
      while (f.x === target.x) match.step({}, {});
      expect(f).toMatchObject({ branch: RYUKO.airDash, age: 53 });
      expect((target.x - f.x) * facing).toBe(facing === 1 ? 27.75 : 27);
    },
  );

  // Chains follow op 0x24: punch 1 and kick 1 enter 179/187 on contact, which
  // check for P or K at their eighth tick; punch 2 and kick 2 check after
  // their strikes. Each check needs a fresh press after a neutral frame.
  function chainMatch(gap = 130) {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + gap;
    return { match, f, target };
  }

  it('chains punch 1 or kick 1 into either second attack only after contact', () => {
    for (const first of ['punch', 'kick'] as const)
      for (const second of ['punch', 'kick'] as const)
        for (const guard of [false, true]) {
          const { match, f } = chainMatch();
          match.step({ [first]: true }, { guard });
          while (named(f) === first) match.step({}, { guard });
          // Op 0x02 slots 2 and 3 enter the branch on a hit or a block.
          expect([named(f), f.age]).toEqual([`${first}Hit`, 0]);
          const contact = match.ticks;
          match.step({ [second]: true }, { guard });
          while (named(f) === `${first}Hit`) match.step({}, { guard });
          // After the 10-tick contact stop and the branch's 8-tick display.
          expect([named(f), f.age]).toEqual([`${second}2`, 0]);
          expect(match.ticks - contact).toBe(18);
        }
    // A whiff has no branch, so the same presses do nothing, though one in
    // P's 10-tick window before the punch ends starts another.
    const end = animationDuration(RYUKO.punch);
    for (const last of [end - 10, end - 9]) {
      const { match, f } = chainMatch(400);
      match.step({ punch: true });
      for (let tick = 1; tick <= end; tick++)
        match.step({ punch: (tick % 4 === 0 && tick < 20) || tick === last });
      expect(named(f)).toBe(last === end - 10 ? 'idle' : 'punch');
    }
  });

  it.each([
    ['on the check', (t: number) => ({ punch: t === 18 }), true],
    ['after the check', (t: number) => ({ punch: t === 19 }), false],
    ['at contact', (t: number) => ({ punch: t === 0 }), true],
    // The window's first tick has no earlier neutral frame inside it.
    ['a tick before contact', (t: number) => ({ punch: t === -1 }), false],
    [
      'holding forward',
      (t: number) => ({ right: true, punch: t === 5 }),
      false,
    ],
    ['after neutral', (t: number) => ({ right: t < 3, punch: t === 5 }), true],
  ] as const)(
    'reads a chain press %s against the 20-tick window of 179',
    (_, input, chains) => {
      // Punch 1 connects at tick 7; 179 checks 18 ticks later.
      const { match, f } = chainMatch();
      const seen = new Set<string>();
      for (let tick = 0; tick < 40; tick++) {
        const pressed = input(tick - 7);
        match.step({ ...pressed, punch: tick === 0 || pressed.punch });
        seen.add(named(f));
      }
      expect(seen.has('punchHit')).toBe(true);
      expect(seen.has('punch2')).toBe(chains);
    },
  );

  it.each([
    // Press 13 falls in the first 10-tick window; press 12 has no neutral
    // frame inside it, so only the 30-tick check at 33 accepts it.
    ['punch2', 13, 21],
    ['punch2', 12, 33],
    ['punch2', 27, 27],
    ['kick2', 26, 26],
    ['kick2', 27, null],
  ] as const)(
    'cancels %s into punch 3 or kick 3 for a press at age %i, hit or miss',
    (first, press, switchAge) => {
      for (const second of ['punch', 'kick'] as const) {
        const { match, f } = chainMatch(600);
        enter(match, f, RYUKO[first]);
        let switched: number | null = null;
        for (let age = 1; age <= 60 && named(f) === first; age++) {
          match.step({ [second]: age === press });
          if (named(f) === `${second}3`) switched = age;
        }
        expect(switched).toBe(switchAge);
      }
    },
  );

  it("hops twice on punch 3's landing handlers, then slides into the strike", () => {
    // Action 181: PC 2434 hops at raw 300/-400 with gravity 110, and its
    // landing handler (slot 1, PC 2433) jumps to 181 + 11. After two ticks
    // PC 2440 hops at 300/-300 with gravity 120, landing into 181 + 18 (PC
    // 2439); PC 2447 slides at raw 500 until PC 2457. The motion pass
    // (0x40f910) moves each hop from the tick its op 0x01 runs.
    const raw = (655 / 65536) * 1.5;
    const acc = (393 / 65536) * 1.5;
    const { match, f } = chainMatch(1200);
    enter(match, f, RYUKO.punch2, 19);
    match.step({});
    match.step({ punch: true });
    expect(f).toMatchObject({ action: 'script', branch: RYUKO.punch3, age: 0 });
    expect(f.y).toBeCloseTo(-400 * raw + 110 * acc, 6);
    const x = f.x;
    const heights: number[] = [];
    const branches: unknown[] = [];
    let strike = 0;
    for (let tick = 1; tick <= 41; tick++) {
      match.step({});
      heights.push(f.y);
      branches.push(f.branch);
      if (!strike && f.box?.damage) strike = tick;
    }
    const airborne = heights.map((y) => y < 0);
    const ticks = (from: number, to: number) => airborne.slice(from - 1, to);
    expect(ticks(1, 10).every(Boolean)).toBe(true);
    expect(ticks(11, 12).some(Boolean)).toBe(false);
    expect(ticks(13, 19).every(Boolean)).toBe(true);
    expect(ticks(20, 41).some(Boolean)).toBe(false);
    expect(branches[10]).toBe('181+11');
    expect(branches[19]).toBe('181+18');
    expect(Math.min(...heights.slice(0, 10))).toBeCloseTo(-15.2015, 3);
    // Twelve and eight ticks at 300 (the first already taken), then 13 at 500.
    expect(f.x - x).toBeCloseTo(19 * 300 * raw + 13 * 500 * raw, 3);
    // Its box (PC 2454) opens at 181 + 18's age 14, 34 ticks after entry.
    expect(strike).toBe(20 + 14);
  });

  it('plays a full punch string on hit with the recovered timing', () => {
    const { match, f, target } = chainMatch();
    const sequence: [number, string][] = [];
    let previous = 'idle';
    for (let tick = 0; tick < 200; tick++) {
      match.step([0, 10, 50].includes(tick) ? { punch: true } : {});
      if (named(f) !== previous) sequence.push([tick, named(f)]);
      previous = named(f);
    }
    // The lunge of 180 carries punch 2 back into range after 73's slide.
    expect(sequence).toEqual([
      [0, 'punch'],
      [7, 'punchHit'],
      [25, 'punch2'],
      [56, 'punch3'],
      // Punch 3's two hops (11, then 2 + 7) and 181 + 18's 57 ticks (6, 8,
      // 5, 30 and 8: PC 2460 shows 30), plus the 15-tick stop of its slam.
      [148, 'idle'],
    ]);
    // Punch 1, punch 2's first strike, then punch 3.
    expect(f.hits).toBe(3);
    expect(target.hp).toBe(LIFE - 10 - 5 - 35);
  });

  it('returns to idle after a whiff without repeating a held button', () => {
    for (const control of ['punch', 'kick'] as const) {
      const { match, f } = chainMatch(400);
      match.step({ [control]: true });
      ticks(match, animationDuration(RYUKO[control]) - 1, { [control]: true });
      expect(named(f)).toBe(control);
      match.step({ [control]: true });
      expect(f.action).toBe('idle');
      ticks(match, 100, { [control]: true });
      expect(f.action).toBe('idle');
    }
  });

  it.each([false, true])(
    'freezes both fighters on each drill contact without repeating damage (guard=%s)',
    (guarded) => {
      for (const facing of [1, -1] as const) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? FIGHTER_MARGIN : WIDTH - FIGHTER_MARGIN;
        target.x = f.x + facing * 270;
        const contacts: number[] = [];
        ticks(match, 24, { drill: true }, { guard: guarded });
        contacts.push(match.ticks);
        expect(target.action).toBe(guarded ? 'blockHeavy' : 'hitHeavy');
        const frozen = match.fighters.map(({ y, vx, vy, age, airAge }) => ({
          y,
          vx,
          vy,
          age,
          airAge,
        }));
        const centre = f.x + target.x;
        let gap = (target.x - f.x) * facing;
        const hp = target.hp;
        for (let tick = 0; tick < (guarded ? 10 : 15); tick++) {
          match.step({}, { guard: guarded });
          expect(
            match.fighters.map(({ y, vx, vy, age, airAge }) => ({
              y,
              vx,
              vy,
              age,
              airAge,
            })),
          ).toEqual(frozen);
          // Hit stop skips motion, not the push (0x40f963, 0x40fcbc): the
          // bodies ease apart evenly.
          expect(f.x + target.x).toBe(centre);
          expect((target.x - f.x) * facing).toBeGreaterThanOrEqual(gap);
          gap = (target.x - f.x) * facing;
          expect(target.hp).toBe(hp);
          expect(hitEffects(match).some((e) => e.age === 0)).toBe(false);
        }
        for (; match.ticks < 210;) {
          match.step({}, { guard: guarded });
          if (hitEffects(match).some((e) => e.age === 0)) {
            contacts.push(match.ticks);
            if (contacts.length === 6) {
              // The finisher uses response 18 / action 80: 13 ticks, not 15.
              const age = f.age;
              ticks(match, guarded ? 10 : 13, {}, { guard: guarded });
              expect(f.age).toBe(age);
              match.step({}, { guard: guarded });
              expect(f.age).toBe(age + 1);
            }
          }
        }
        expect(contacts).toEqual(
          guarded ? [24, 40, 56, 72, 88, 104] : [24, 45, 66, 87, 108, 129],
        );
        // Boxes of 5, 5, 5, 5, 7 and 8 (kind 7): each chips 1 on guard.
        expect(target.hp).toBe(LIFE - (guarded ? 6 : 35));
        expect(f.action).toBe('idle');
      }
    },
  );

  it.each([
    ['punch2', [18, 34, 50], ['hit', 'hit', 'hitHeavy']],
    ['kick3', [15, 21, 27, 33, 39, 45, 51, 57], Array(8).fill('hitRapid')],
    ['airKick', [15, 38, 61], ['airHitHeavy', 'airHitHeavy', 'airHitHeavy']],
  ] as const)(
    'uses the recovered per-hit cadence for %s',
    (action, expectedTicks, expectedReactions) => {
      const match = new Match();
      const [f, target] = match.fighters;
      // An air-hit victim drifts 13 px per strike; the air kick reaches 148.5.
      target.x = f.x + (action === 'airKick' ? 120 : 140);
      if (action === 'airKick') {
        f.y = target.y = -80;
        f.vy = target.vy = -8;
      }
      enter(match, f, RYUKO[action]);
      const contacts: number[] = [];
      const reactions: string[] = [];
      for (let tick = 0; tick < 120; tick++) {
        match.step();
        if (hitEffects(match).some((e) => e.age === 0)) {
          contacts.push(match.ticks);
          reactions.push(target.action);
        }
      }
      expect(contacts).toEqual(expectedTicks);
      expect(reactions).toEqual(expectedReactions);
    },
  );

  it('keeps a missed drill on its original clock', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.y = -1000;
    target.gravity = 0;
    ticks(match, 60, { drill: true });
    expect(f.age).toBe(59);
    expect(f.hits).toBe(0);
    expect(f.hitStop).toBe(0);
    expect(hitEffects(match)).toEqual([]);
  });

  it.each([false, true])(
    'pauses the aerial drill attacker for eight ticks and its victim by contact outcome (guard=%s)',
    (guarded) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.y = -100;
      enter(match, f, RYUKO.airDrill, 22);
      target.x = f.x + 150;
      match.step({}, { guard: guarded });
      const contact = { x: f.x, y: f.y, age: f.age };
      for (let tick = 1; tick <= 8; tick++) {
        match.step({}, { guard: guarded });
        expect({ x: f.x, y: f.y, age: f.age }).toEqual(contact);
        expect(target.age).toBe(guarded ? Math.max(0, tick - 3) : 0);
      }
      match.step({}, { guard: guarded });
      expect(f.x).toBeGreaterThan(contact.x);
      expect(f.y).toBeGreaterThan(contact.y);
      expect(target.age).toBe(guarded ? 6 : 0);
    },
  );

  it.each([
    // Hit 73 slides from its fifth tick, so punch 2 drifts between strikes;
    // its last strike selects 75. Guards 149/163 slide after the last strike.
    ['punch2', [18, 24, 30], 36, 3 * 5, [0, 8.395], 231.173, 95.947],
    // Air hit 76 rises for five ticks, then flies back at raw 300 (PC 823);
    // air guard 158 slides at raw 450, speeding up, out of the next strike.
    [
      'airKick',
      [15, 23, 31],
      87,
      3 * 4,
      [0, 13.439, 26.877],
      195.265,
      243.271,
      [15],
    ],
  ] as const)(
    'gives %s one contact per strike, then its reaction motion',
    (
      action,
      ages,
      image,
      damage,
      drift,
      hitShift,
      guardShift,
      guardAges: readonly number[] = ages,
    ) => {
      for (const facing of [1, -1] as const)
        for (const guarded of [false, true]) {
          const match = new Match();
          const [f, target] = match.fighters;
          f.x = facing === 1 ? 420 : 1500;
          f.facing = facing;
          target.x =
            f.x +
            facing *
              ((action === 'airKick' ? 120 : 140) +
                (action === 'punch2' ? LUNGE : 0));
          const targetX = target.x;
          if (action === 'airKick') {
            f.y = target.y = -80;
            f.vy = target.vy = -8;
          }
          enter(match, f, RYUKO[action]);
          const contacts: number[] = [];
          for (let tick = 0; tick < 120; tick++) {
            match.step({}, { guard: guarded });
            const impact = hitEffects(match).find((e) => e.age === 0);
            if (impact) {
              if (contacts.length < ages.length - 1)
                expect((target.x - targetX) * facing).toBeCloseTo(
                  guarded ? 0 : (drift[contacts.length] ?? 0),
                  3,
                );
              contacts.push(f.age);
              expect(animationFrame(RYUKO[action], f.age).image).toBe(image);
              expect(impact.clip === 370).toBe(guarded);
            }
          }
          expect(contacts).toEqual(guarded ? guardAges : ages);
          expect(f.hits).toBe(guarded ? 0 : ages.length);
          expect(f.damage).toBe(guarded ? 0 : damage);
          expect(target.hp).toBe(guarded ? LIFE : LIFE - damage);
          expect((target.x - targetX) * facing).toBeCloseTo(
            !guarded
              ? hitShift
              : typeof guardShift === 'number'
                ? guardShift
                : guardShift[facing === 1 ? 0 : 1],
            3,
          );
        }
    },
  );

  it('pushes with kick 3’s leg box through all eight strikes (PCs 2617–2622)', () => {
    // PC 2617 sets body slot 1, a push box (57, −56) ±(57, 65), before the
    // eight calls of 190 (PC 2619), and PC 2622 clears it after them. It
    // shoves the victim on as the first strike opens, a quarter of the
    // overlap in whole source pixels; beam hit 83 then slides at raw 150
    // with +10 (PC 954), 11.604 per strike, while a guard is shoved again at
    // the second strike, then holds its place.
    for (const facing of [1, -1] as const)
      for (const guarded of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 420 : 1500;
        f.facing = facing;
        target.x = f.x + facing * 140;
        const targetX = target.x;
        enter(match, f, RYUKO.kick3);
        const contacts: number[] = [];
        const drift: number[] = [];
        for (let tick = 0; tick < 120; tick++) {
          match.step({}, { guard: guarded });
          if (hitEffects(match).some((e) => e.age === 0)) {
            contacts.push(f.age);
            drift.push((target.x - targetX) * facing);
          }
        }
        expect(contacts).toEqual([15, 21, 27, 33, 39, 45, 51, 57]);
        const pushed = facing === 1 ? 21.375 : 21;
        expect(drift[0]).toBe(pushed);
        if (guarded) {
          expect(drift.slice(1).every((x) => x === pushed + 21)).toBe(true);
          expect(target.hp).toBe(LIFE);
        } else {
          expect(drift[2] - drift[1]).toBeCloseTo(11.604, 3);
          expect(f).toMatchObject({ hits: 8, damage: 8 * 4 });
        }
        expect((target.x - targetX) * facing).toBeCloseTo(
          guarded ? (facing === 1 ? 246.641 : 246.266) : 143.972,
          3,
        );
      }
  });

  it.each([
    ['punch2', 21, 24],
    ['airKick', 19, 23],
    ['kick3', 18, 21],
  ] as const)(
    'does not hit during the gaps in %s',
    (action, gapAge, nextAge) => {
      const match = new Match();
      const [f, target] = match.fighters;
      const { reach } = firstStrike('ryuko', RYUKO[action], 'ryuko');
      // enter() runs the entry's records without its motion tick: 12 of the
      // lunge's 13.
      target.x =
        f.x + reach + 2 + (action === 'punch2' ? (LUNGE * 12) / 13 : 0);
      if (action === 'airKick') {
        f.y = target.y = -80;
        f.vy = target.vy = -8;
      }
      enter(match, f, RYUKO[action]);
      ticks(match, gapAge - 1);
      // Move the target into range during the inactive gap, including in air.
      target.x -= 2.8;
      match.step();
      expect(f.hits).toBe(0);
      ticks(match, nextAge - gapAge);
      expect(f.hits).toBe(1);
    },
  );

  it.each([1, -1] as const)(
    'uses the recovered ground drill movement phases facing %i',
    (facing) => {
      // Action 207: PC 2912 starts the lunge at 110ms; 2947 slows at
      // 590ms; 2954 stops at 690ms. Positions include the web's 1.5 art scale.
      for (const [age, displacement] of [
        [10, 0],
        [11, 13.492584],
        [22, 13.492584],
        [23, 13.492584],
        [58, 13.492584],
        [59, 1.499176],
        [68, 1.499176],
        [69, 0],
        [88, 0],
      ]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 300 : 660;
        f.facing = facing;
        target.x = WIDTH - f.x;
        enter(match, f, RYUKO.drill, age - 1);
        const start = f.x;
        match.step({ left: facing === 1, right: facing === -1 }, {});
        expect((f.x - start) * facing).toBeCloseTo(displacement, 5);
        expect(named(f)).toBe('drill');
      }
    },
  );

  it.each([1, -1] as const)(
    'dives forward after aerial drill startup and stops on landing facing %i',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = facing === 1 ? FIGHTER_MARGIN : WIDTH - FIGHTER_MARGIN;
      target.x = WIDTH - f.x;
      f.y = -200;
      f.action = 'jump';
      match.step({ drill: true }, {});
      const startX = f.x;
      const startY = f.y;
      ticks(match, 21);
      expect([f.x, f.y]).toEqual([startX, startY]);
      match.step();
      expect((f.x - startX) * facing).toBeCloseTo(11.993408, 5);
      expect(f.y - startY).toBeCloseTo(14.99176, 5);
      // PC 2971 jumps into spin 209, which the timeline continues.
      expect([named(f), f.age]).toEqual(['airDrill', 22]);
      ticks(match, 12);
      expect((f.x - startX) * facing).toBeCloseTo(155.914307, 5);
      expect(f.y).toBeLessThan(0);
      match.step();
      expect(named(f)).toBe('drillLand');
      expect([f.y, f.vy]).toEqual([0, 0]);
      const landedX = f.x;
      ticks(match, 23);
      expect(f.x).toBe(landedX);
      expect(f.action).toBe('idle');
      expect(f.hits).toBe(0);
    },
  );

  it.each([false, true])(
    'pauses the aerial dive on contact then resumes with a steeper follow-up (guard=%s)',
    (guarded) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.y = -100;
      enter(match, f, RYUKO.airDrill, 22);
      target.x = f.x + 150;
      match.step({}, { guard: guarded });
      // Spin 209's hit and guard handlers (PCs 2979–2980).
      expect(playing(f)).toBe(guarded ? '209+23' : '209+12');
      const contact = { x: f.x, y: f.y };
      ticks(match, 8, {}, { guard: guarded });
      expect({ x: f.x, y: f.y }).toEqual(contact);
      match.step({}, { guard: guarded });
      expect(f.x - contact.x).toBeCloseTo(11.993408, 5);
      expect(f.y - contact.y).toBeCloseTo(14.99176, 5);
      const transitionY = f.y;
      match.step({}, { guard: guarded });
      expect(f.y - transitionY).toBeCloseTo(22.48764, 5);
      // PC 2997's op 0x14 lifts the hit victim to (100, −20), into action
      // 135 again, and guard 163 slides back; stage 2's box meets either at
      // once: its hit handler is 209 + 42, its guard handler 209 + 43 (PCs
      // 3008–3009).
      expect(playing(f)).toBe(guarded ? '209+43' : '209+42');
      expect(target.action).toBe(guarded ? 'blockRapid' : 'drillDown');
      // Stage 1's 20 and stage 2's 5 (kind 6), or 20% chips of them.
      expect(target.hp).toBe(LIFE - (guarded ? 4 + 1 : 20 + 5));
    },
  );

  it.each([1, -1] as const)(
    'keeps drill movement inside the wall without crossing the opponent facing %i',
    (facing) => {
      for (const airborne of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        target.x = facing === 1 ? STAGE_WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
        f.x = target.x - facing * 100;
        f.facing = facing;
        if (airborne) f.y = -80;
        if (airborne) enter(match, f, RYUKO.airDrill, 22);
        else enter(match, f, RYUKO.drill);
        for (let tick = 0; tick < 210; tick++) {
          match.step({}, { guard: true });
          expect(f.x).toBeGreaterThanOrEqual(FIGHTER_MARGIN);
          expect(f.x).toBeLessThanOrEqual(STAGE_WIDTH - FIGHTER_MARGIN);
          // Pressed into the cornered body's push box, never through it.
          expect((target.x - f.x) * facing).toBeGreaterThan(80);
        }
        expect(f.action).toBe('idle');
        // Every guarded box chips 20% (kind 6 or 7), at least 1.
        expect(target.hp).toBe(LIFE - (airborne ? 4 + 1 : 6));
        const endX = f.x;
        ticks(match, 20);
        expect(f.x).toBe(endX);
      }
    },
  );

  it.each(['drill', 'airDrill'] as const)(
    'stops %s travel when interrupted',
    (action) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = 900;
      target.x = f.x + 150;
      if (action === 'airDrill') f.y = -40;
      // The ground drill before its lunge, or the air drill's first spin.
      enter(match, f, RYUKO[action], action === 'drill' ? 10 : 22);
      strike(match, target, RYUKO.punch);
      match.step({}, {});
      // The drilling pose's body box takes 120% of the punch's 10.
      expect(f.hp).toBe(LIFE - 12);
      expect(f.action).toBe(action === 'drill' ? 'hit' : 'airHit');
      const interruptedX = f.x;
      ticks(match, 120);
      // Only the reaction moves the drill: hit 73's slide (−280 for 20 ticks),
      // or air hit 74's flight (−300 with ax 1 from age 5), kept through
      // action 7's gravity-80 fall.
      expect(interruptedX - f.x).toBeCloseTo(
        action === 'drill' ? 20 * 280 * (655 / 65536) * 1.5 : 147.56,
        2,
      );
      expect(f.action).toBe('idle');
    },
  );

  it.each([-40, -300])(
    'continues aerial drill contact stages until landing from y=%i',
    (height) => {
      for (const facing of [1, -1] as const)
        for (const guarded of [false, true]) {
          const match = new Match();
          const [f, target] = match.fighters;
          f.x = facing === 1 ? 420 : 540;
          f.facing = facing;
          target.x = f.x + facing * 100;
          f.y = target.y = height;
          enter(match, f, RYUKO.airDrill, 22);
          const damage: number[] = [];
          const contacts: number[] = [];
          for (let tick = 0; tick < 120; tick++) {
            const hp = target.hp;
            match.step({ punch: true }, { guard: guarded });
            const impact = hitEffects(match).find((e) => e.age === 0);
            if (impact) {
              contacts.push(tick + 1);
              damage.push(hp - target.hp);
              expect(impact.clip === 370).toBe(guarded);
              expect(String(f.branch)).toMatch(DRILL_CONTACT);
              expect(fighterPose(f).image).toBe(136);
            }
          }
          // Response 56 → action 135 drives a hit victim down, but its nine
          // stop ticks hold it in reach of each stage until it lands. An air
          // guard selects 80 → 172, which falls from rest at gravity 70 (PC
          // 2323); its body box (−4, −120, ±37, ±73) leaves the diving box's
          // reach after three stages.
          expect(contacts).toEqual(
            height === -40
              ? [1]
              : guarded
                ? [1, 11, 21]
                : [1, 11, 21, 31, 41, 51, 61],
          );
          // Stage boxes of 20, 5, 3 and 1 (kind 6), or 20% chips of them.
          expect(damage).toEqual(
            guarded
              ? height === -40
                ? [4]
                : [4, 1, 1]
              : height === -40
                ? [20]
                : [20, 5, 3, 1, 1, 1, 1],
          );
          expect(f.hits).toBe(guarded ? 0 : contacts.length);
          expect(f.action).toBe('idle');
          expect(f.y).toBe(0);
        }
    },
  );

  it('returns a third-stage spin (211) that passes without contact to 210', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    f.y = -300;
    target.x = f.x + 600;
    // Stage 2's hit branch (210 + 12): eight stop ticks and a two-tick
    // display, then 211's spin (box 1) for six; without contact, PC 3060
    // jumps back to 210 (box 3).
    enter(match, f, RYUKO.airDrillSpin2, 0, 12);
    ticks(match, 8 + 2);
    expect(f.box?.damage).toBe(1);
    ticks(match, 5);
    expect(f.box?.damage).toBe(1);
    match.step();
    expect(f.box?.damage).toBe(3);
    target.x = f.x + 130;
    target.y = f.y;
    match.step();
    expect(target.hp).toBe(LIFE - 3);
    expect(playing(f)).toBe('210+12');
  });

  it('holds aerial drill startup, keeps missed spins armed, and recovers only on landing', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    f.y = -200;
    f.action = 'jump';
    match.step({ drill: true }, {});
    const height = f.y;
    ticks(match, 21, { punch: true });
    expect(f.y).toBe(height);
    expect(named(f)).toBe('airDrill');
    ticks(match, 7);
    expect([named(f), f.age]).toEqual(['airDrill', 28]);
    expect(f.hits).toBe(0);
    target.x = f.x + 130;
    match.step();
    expect(target.hp).toBe(LIFE - 20);
    expect(playing(f)).toBe('209+12');
    for (let i = 0; i < 100 && f.y < 0; i++) match.step();
    expect(named(f)).toBe('drillLand');
    ticks(match, 23);
    expect(f.action).toBe('idle');
  });

  it.each([0, 1])(
    'cancels fighter %i’s aerial drill stages when a simultaneous strike interrupts it',
    (index) => {
      const match = new Match();
      const f = match.fighters[index];
      const target = match.fighters[1 - index];
      f.x = index === 0 ? 420 : 540;
      target.x = f.x + f.facing * 100;
      f.y = target.y = -80;
      enter(match, f, RYUKO.airDrill, 22);
      strike(match, target, RYUKO.airPunch);
      match.step({}, {});
      // Both attacking poses take 120%: the air punch's 15 and the spin's 20.
      expect([f.hp, target.hp]).toEqual([LIFE - 18, LIFE - 24]);
      expect(f.action).toBe('airHitHeavy');
      expect([f.hitStop, target.hitStop]).toEqual([15, 15]);
      ticks(match, 100);
      expect([f.hits, target.hits]).toEqual([1, 1]);
      expect([f.hp, target.hp]).toEqual([LIFE - 18, LIFE - 24]);
    },
  );

  // The round phase stays 1 after a KO, so a move's later strikes hit the
  // falling fighter again, which enters KO NORMAL 2nd (61, PC 595).
  it.each([
    ['punch2', 3],
    ['airKick', 1],
    ['kick3', 5],
    ['drill', 5],
    ['airDrill', 2],
  ] as const)(
    'keeps striking with %s after a lethal first strike: %i hits',
    (action, hits) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = 500;
      target.x = 640;
      target.hp = 1;
      if (action.startsWith('air')) {
        f.y = target.y = -80;
        f.vy = target.vy = -8;
      }
      // The air drill from its first spin's box.
      pose(match, f, action, action === 'airDrill' ? 22 : 0);
      const seen = new Set<string>();
      for (let tick = 0; tick < 1000 && !match.resultReady; tick++) {
        match.step();
        seen.add(target.action);
      }
      expect(match.winner).toBe('player');
      expect(f.hits).toBe(hits);
      expect(seen.has('koAgain')).toBe(hits > 1);
      expect(target).toMatchObject({ action: 'koLand', hp: 0 });
      expect(f.action).toBe('win');
    },
  );

  it('lands six drill hits at extended range and uses the aerial drill landing recovery', () => {
    const match = new Match();
    match.fighters[1].x = 570;
    ticks(match, 210, { drill: true });
    expect(match.fighters[1].hp).toBe(LIFE - 35);
    expect(match.fighters[0].hits).toBe(6);
    expect(match.fighters[0].action).toBe('idle');
    // The finisher launched the opponent (response 18 → 80); bring it back.
    for (let i = 0; i < 200 && match.fighters[1].action !== 'idle'; i++)
      match.step();
    match.fighters[1].x = match.fighters[0].x + 112;
    match.step({ jump: true });
    ticks(match, 40);
    match.step({ drill: true });
    expect(named(match.fighters[0])).toBe('airDrill');
    for (let i = 0; i < 100 && named(match.fighters[0]) !== 'drillLand'; i++)
      match.step();
    expect(named(match.fighters[0])).toBe('drillLand');
    // Spin 209's landing handler (PC 2978) plays Drill Lend (212).
    ticks(match, animationDuration(RYUKO.drillLand) - 1);
    expect(named(match.fighters[0])).toBe('drillLand');
    match.step();
    expect(match.fighters[0].action).toBe('idle');
  });

  it.each([1, -1] as const)(
    'times six drill contacts to the spin poses, blocks all six, and launches on the finisher facing %i',
    (facing) => {
      for (const guarded of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 185 : STAGE_WIDTH - 185;
        target.x = f.x + facing * 270;
        const targetX = target.x;
        const contacts: number[] = [];
        const reactions = new Set<string>();
        match.step({ drill: true }, { guard: guarded });
        for (let tick = 0; tick < 210; tick++) {
          match.step({ drill: true }, { guard: guarded });
          reactions.add(target.action);
          const impact = hitEffects(match).find((e) => e.age === 0);
          if (impact) {
            contacts.push(f.age);
            expect(animationFrame(RYUKO.drill, f.age).image).toBe(121);
            expect(impact.clip === 370).toBe(guarded);
            // From age 13 the drill's forward push box, (44, −74) ±(38, 86),
            // shoves the target ahead of the lunge: 34.5 before the first
            // strike, then 40.5 between strikes, all landing 163.6 apart.
            expect((target.x - targetX) * facing).toBeCloseTo(
              34.5 + 40.5 * (contacts.length - 1),
              3,
            );
            expect((target.x - f.x) * facing).toBeCloseTo(163.6, 0);
          }
        }
        expect(contacts).toEqual([23, 29, 35, 41, 47, 53]);
        // The last strike selects 18 → 80 (launch), or guard 28/29 → 159/161.
        expect(
          [...reactions].filter((a) => !['idle', 'turn', 'guard'].includes(a)),
        ).toEqual(
          guarded
            ? ['blockHeavy', 'blockStop']
            : ['hitHeavy', 'launchAway', 'knockdown'],
        );
        expect(
          (f.x - (facing === 1 ? 185 : STAGE_WIDTH - 185)) * facing,
        ).toBeGreaterThan(390);
        // Boxes of 5, 5, 5, 5, 7 and 8, or six chips of 1.
        expect(target.hp).toBe(LIFE - (guarded ? 6 : 35));
        expect(f.hits).toBe(guarded ? 0 : 6);
        expect(f.damage).toBe(guarded ? 6 : 35);
        expect(f.action).toBe('idle');
      }
    },
  );

  it.each([1, -1] as const)(
    'makes aerial drill miss across a gap but hit or block on visible contact facing %i',
    (facing) => {
      // A hit slams the victim (135) into its floor bounce (124, 147); a block
      // slides it back (163).
      for (const [distance, guarded, hp, hits, shift] of [
        [228, false, LIFE, 0, 0],
        // PC 2997's op 0x14 re-applies response 56 at (100, −20).
        [180, false, LIFE - 20, 1, 233.855],
        [180, true, LIFE - 4, 0, 204.266],
      ] as const) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 432 : 1488;
        target.x = f.x + facing * distance;
        const targetX = target.x;
        match.step({ jump: true }, {});
        ticks(match, 9);
        match.step({ drill: true }, { guard: guarded });
        for (let tick = 0; tick < 100; tick++) {
          match.step({}, { guard: guarded });
          if (hitEffects(match).some((e) => e.age === 0)) {
            expect(String(f.branch)).toMatch(DRILL_CONTACT);
            expect(fighterPose(f).image).toBe(136);
            expect(hitEffects(match)[0].clip === 370).toBe(guarded);
          }
        }
        expect(target.hp).toBe(hp);
        expect(f.hits).toBe(hits);
        expect((target.x - targetX) * facing).toBeCloseTo(shift, 3);
        expect(f.action).toBe('idle');
      }
    },
  );

  it('releases an axe at the throw pose, travels in either direction, and hits only once', () => {
    for (const facing of [1, -1]) {
      const match = new Match();
      if (facing === -1) match.fighters.reverse();
      const thrower = match.fighters[0];
      ticks(match, 16, { axe: true });
      expect(axes(match)).toHaveLength(0);
      match.step({ axe: true });
      // At age 16 PC 3279 spawns action 227 at (−6, −102) in slot 6; PC 3293
      // moves it at raw 900.
      expect(axes(match)).toMatchObject([
        { clip: 227, age: 0, facing, slot: 6, x: thrower.x - facing * 9 },
      ]);
      expect(axes(match)[0].y).toBe(-153);
      expect(axes(match)[0].vx).toBeCloseTo(facing * 13.493, 3);
      expect(match.fighters[1].hp).toBe(LIFE);
      ticks(match, 100, { axe: true });
      expect(match.fighters[1].hp).toBe(LIFE - 30);
      expect(match.fighters[0].hits).toBe(1);
      expect(axes(match)).toHaveLength(0);
    }
  });

  it('releases one axe, which strikes on its release tick', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 140;
    target.y = -80;
    target.gravity = 0;
    ticks(match, 17, { axe: true });
    // The axe's box meets the target as it spawns; authored, its victim
    // doesn't pause the thrower.
    expect(f).toMatchObject({ age: 16, hits: 1, hitStop: 0 });
    expect(axes(match).map((e) => e.clip)).toEqual([230]);
    ticks(match, 15);
    expect(f).toMatchObject({ age: 31, hits: 1 });
    expect(axes(match)).toHaveLength(0);
    expect(target.hp).toBe(LIFE - 30);
  });

  it('blocks an axe, permits jumping over it, and expires missed projectiles', () => {
    const match = new Match();
    ticks(match, 100, { axe: true }, { guard: true });
    expect(match.fighters[1].hp).toBe(LIFE - 6);
    expect(match.fighters[0].hits).toBe(0);
    const airborne = new Match();
    ticks(airborne, 57, { axe: true }, { jump: true });
    expect(airborne.fighters[1].hp).toBe(LIFE);
    ticks(airborne, 180);
    expect(axes(airborne)).toHaveLength(0);
  });

  it('hits through the body box, 120% against an attacking pose', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 500;
    target.x = 900;
    match.step({ axe: true });
    for (let i = 0; i < 100 && target.hp === LIFE; i++) {
      pose(match, target, 'punch', 3);
      match.step();
    }
    expect(target.hp).toBe(LIFE - 36);
  });

  it('keeps a flying axe, stands a tick for a throw meanwhile and cancels one interrupted before release', () => {
    const match = new Match();
    const [f] = match.fighters;
    f.x = FIGHTER_MARGIN;
    match.fighters[1].x = STAGE_WIDTH - FIGHTER_MARGIN;
    match.step({ axe: true });
    ticks(match, animationDuration(RYUKO.axeThrow));
    const [axe] = axes(match);
    expect(axe.clip).toBe(227);
    // While its axe (slot 6) lives, 226 jumps to 225 (PC 3267): one display,
    // then neutral, and the axe flies on. The command stays in its 40-tick
    // window, so the free state enters it again each tick while the axe
    // flies and breaks (its impact, 230, keeps the slot); once that is gone,
    // the same command throws another.
    match.step({ axe: true });
    expect(named(f)).toBe('axeBusy');
    expect(axes(match)).toEqual([axe]);
    while (axes(match).length) {
      expect(named(f)).toBe('axeBusy');
      match.step();
    }
    expect(named(f)).toBe('axeThrow');
    for (
      let tick = 0;
      tick < 1000 && (axes(match).length || f.action !== 'idle');
      tick++
    )
      match.step();
    match.step({ axe: true });
    expect(named(f)).toBe('axeThrow');
    ticks(match, 16);
    expect(axes(match)).toMatchObject([{ age: 0 }]);
    const interrupted = new Match();
    interrupted.fighters[0].x = 530;
    ticks(interrupted, 8, { axe: true }, { punch: true });
    expect(interrupted.fighters[0].action).toBe('hit');
    ticks(interrupted, 60, { axe: true });
    expect(axes(interrupted)).toHaveLength(0);
  });

  it('breaks opposing axes where their object boxes meet', () => {
    const match = new Match();
    ticks(match, 17, { axe: true }, { axe: true });
    expect(axes(match).map((e) => e.x)).toEqual([291, 669]);
    ticks(match, 2);
    expect(axes(match).map((e) => e.clip)).toEqual([227, 227]);
    // Each slot-1 box (±39) reaches the other's slot-0 body (±34), both 63
    // ahead, under 109.5 arena pixels apart: both break into 230.
    match.step();
    expect(axes(match)).toMatchObject([
      { clip: 230, age: 0 },
      { clip: 230, age: 0 },
    ]);
    expect(match.fighters.map((f) => f.hitStop)).toEqual([0, 0]);
    expect(hitEffects(match)).toEqual([]);
    ticks(match, 100);
    expect(match.fighters.map((f) => f.hp)).toEqual([LIFE, LIFE]);
    expect(axes(match)).toHaveLength(0);
  });

  describe('the y + 2000 object layer', () => {
    // A side's axe (227) flying at a height of −153, its first records run.
    const axe = (match: Match, owner: number, x: number) =>
      spawn(match, owner, RYUKO.axe, {
        x,
        y: -153,
        facing: owner === 0 ? 1 : -1,
      });

    it("breaks the other side's axes on B G's stage-wide bodies (303)", () => {
      const match = new Match();
      match.effects = [object(303, 1, { x: 1500 })];
      const flying = [axe(match, 0, 1100), axe(match, 1, 1700)];
      match.step();
      // Its bodies (0, 1995) ±(10000, 182) meet the axe's box 2000 down.
      expect(flying.map((e) => [e.clip, e.age])).toEqual([
        [230, 0],
        [227, 1],
      ]);
    });

    it("marks a beam that meets the other side's axe as having hit, leaving the axe", () => {
      const match = new Match();
      // A downed Ryuko's body box lies below the floor, so only the axe meets
      // the beam.
      match.fighters[0].action = 'knockdown';
      // Object 269 (calling 270) sets its boxes as it starts; slot 1's
      // (644, 1995) ±(644, 72) reaches the axe's body.
      const beam = object(269, 1, { x: 1500, facing: -1, age: -1 });
      match.effects = [beam];
      const flying = axe(match, 0, 1100);
      match.step();
      expect(beam.objectBox).toMatchObject({ y: 1995, w: 644 });
      expect(beam.connected).toBe(true);
      expect(flying.clip).toBe(227);
    });

    it('re-arms an object at each display holding a box of kind bit 1 (0x41257d)', () => {
      const match = new Match();
      // Object 303's first box (kind 6) has hit; its second display starts
      // at age 3, before the op that clears the box.
      const bg = object(303, 1, {
        x: 1500,
        age: 2,
        connected: true,
        box: { x: 0, y: -5, w: 10000, h: 182, damage: 5, kind: 6 },
      });
      match.effects = [bg];
      match.step();
      expect(bg).toMatchObject({ age: 3, box: null, connected: false });
    });

    it('culls an object that leaves the world unless it follows a parent (0x4124c9)', () => {
      const match = new Match();
      const outside = { x: 1331 * 1.5, y: 0, facing: 1 as const };
      const follow = { parent: outside, x: 0, y: 0 };
      match.effects = [object(273, 0, outside), object(273, 0, { follow })];
      match.step();
      expect(match.effects.map((e) => e.follow)).toEqual([follow]);
    });

    it("enters B G's hit branch (294) when its lunge meets the other side's axe", () => {
      const match = new Match();
      const bg = match.fighters[1];
      // B G's entry (PC 4296) spends three stocks.
      bg.stock = 3;
      enter(match, bg, RYUKO.megaBeam, 89);
      // At age 90 action 292 sets its slot-1 box (59, 1908) ±(40, 89) and
      // hit handler 294 (PC 4311).
      // Without the axe's fighter-layer box, only the object layer meets B G.
      const flying = axe(match, 0, 470);
      flying.box = null;
      match.step();
      expect(named(bg)).toBe('megaBeamHit');
      expect(flying.clip).toBe(227);
    });

    it('cannot be guarded with a box of kind 0x40 (0x40f469)', () => {
      const struck = (kind: number) => {
        const match = new Match('cpu');
        match.cpu = new CpuVM([], 0);
        const cpu = match.fighters[1];
        // A CPU in a guard reaction keeps guarding (0x40f449).
        Object.assign(cpu, { action: 'block', age: 0, reaction: 0xc });
        match.effects = [
          object(347, 0, {
            x: cpu.x,
            box: { x: 0, y: -100, w: 100, h: 100, damage: 10, kind },
            responses: [1, 1, 2, 22, 23, 2],
          }),
        ];
        match.step();
        return cpu.action;
      };
      expect(struck(7)).toBe('block');
      // Musashi's finish (257, 0x46) and COUNTER HIT (174, 0x47).
      expect(struck(0x47)).toBe('hit');
    });
  });

  it('keeps projectiles playing when the round ends', () => {
    const match = new Match();
    match.fighters[1].hp = 16;
    for (let i = 0; i < 100 && !match.winner; i++) match.step({ axe: true });
    expect(match.winner).toBe('player');
    expect(axes(match).map((e) => e.clip)).toEqual([230]);
    ticks(match, animationDuration(RYUKO.axeHit));
    expect(axes(match)).toEqual([]);
  });

  it('holds an axe through the Getter Beam freeze, which op 0x1f adds to global 6', () => {
    const match = new Match();
    const [ryuko, target] = match.fighters;
    target.x = 1700;
    target.stock = 1;
    ticks(match, 20, { axe: true });
    const [axe] = axes(match);
    match.step({}, { getterBeam: true });
    // Action 264 adds 10, then 65 at age 5, with its op 0x1a stops; KGT 58
    // counts it down after the fighters and the axe have read it.
    expect([match.freeze, ryuko.hitStop]).toEqual([9, 10]);
    ticks(match, 2);
    // The axe checks after each 3-tick display (PCs 3297–3318): from age 6
    // it replays its second display (227 + 16) without box or motion until
    // a check finds the freeze over, 75 ticks later.
    expect(axe).toMatchObject({ clip: '227+16', box: null });
    const x = axe.x;
    ticks(match, 75);
    expect(match.freeze).toBe(0);
    expect(axe.x).toBe(x);
    match.step();
    expect(axe.x).toBeCloseTo(x + 13.493, 3);
  });

  it('holds a flying axe without its box while global 6 is positive, and a missile once at 1', () => {
    const match = new Match();
    const target = match.fighters[1];
    // An axe (227) at rest at its age 2, its box over the target.
    const axe = spawn(match, 0, RYUKO.axe, { x: 560, y: -153 });
    Object.assign(axe, { age: 2, vx: 0 });
    // Scripts read global 6 before KGT 58 counts it down: 3, then 0 at the
    // axe's next 3-tick display.
    match.freeze = 3;
    for (let tick = 0; tick < 3; tick++) {
      match.step();
      expect(axe).toMatchObject({ clip: '227+9', box: null });
    }
    expect(target.hp).toBe(LIFE);
    match.step();
    expect(target.hp).toBe(LIFE - 30);
    // A missile (218) replays its display while global 6 is exactly 1 (PC
    // 3168). ponytail: objects move before their script step, so it moves
    // once more before the hold, where the source's motion pass (0x40f910)
    // follows the scripts.
    const missile = spawn(match, 0, RYUKO.dstMissile, { x: 1000, y: -600 });
    const v = 1000 * (655 / 65536) * 1.5;
    match.freeze = 2;
    const xs = [];
    for (let tick = 0; tick < 4; tick++) {
      match.step();
      xs.push(missile.x - 1000);
    }
    expect(xs.map((x) => x / v)).toEqual([1, 2, 2, 3]);
  });

  it('deletes a missile 50 source pixels outside the world (0x4124c9)', () => {
    const match = new Match();
    // Missiles (218) moving before their script sets their own motion: each
    // pair ends on a bound and just past it.
    const missile = (x: number, y: number, vx: number, vy: number) =>
      object(RYUKO.dstMissile, 0, { x, y, vx, vy, slot: -1 });
    match.effects = [
      missile(1985, -300, 10, 0),
      missile(1985, -300, 11, 0),
      missile(-65, -300, -10, 0),
      missile(-65, -300, -11, 0),
      missile(900, -1445, 0, -10),
      missile(900, -1445, 0, -11),
    ];
    match.step();
    expect(objects(match, RYUKO.dstMissile).map((e) => [e.x, e.y])).toEqual([
      [1995, -300],
      [-75, -300],
      [900, -1455],
    ]);
  });

  it('uses a backward walk when moving away from the opponent', () => {
    const match = new Match();
    match.step({ left: true });
    expect(match.fighters[0].action).toBe('backwalk');
    match.step({ right: true });
    expect(match.fighters[0].action).toBe('walk');
  });

  it('plays jump takeoff and landing before returning to idle', () => {
    const match = new Match();
    match.step({ jump: true });
    expect(match.fighters[0].action).toBe('takeoff');
    expect(match.fighters[0].y).toBe(0);
    ticks(match, 8, { jump: true });
    expect(match.fighters[0].action).toBe('jump');
    for (let i = 0; i < 100 && match.fighters[0].action !== 'land'; i++)
      match.step({ jump: true });
    expect(match.fighters[0].action).toBe('land');
    expect(match.fighters[0].y).toBe(0);
    ticks(match, 8, { jump: true });
    expect(match.fighters[0].action).toBe('idle');
  });

  it('enters crouch, plays a low attack, and stands up on release', () => {
    const match = new Match();
    match.step({ crouch: true });
    expect(match.fighters[0].action).toBe('crouchEnter');
    ticks(match, 5, { crouch: true });
    expect(match.fighters[0].action).toBe('crouch');
    match.step({ crouch: true, punch: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.crouchPunch);
    ticks(match, 49, { crouch: true });
    // P Sit runs out into the return to neutral, which clears the stance
    // bits on the ground (0x411b01), so the neutral handler crouches through
    // 18 again (0x4110c3).
    expect(match.fighters[0].action).toBe('crouchEnter');
    ticks(match, 5, { crouch: true });
    expect(match.fighters[0].action).toBe('crouch');
    match.step();
    expect(match.fighters[0].action).toBe('stand');
    ticks(match, 5);
    expect(match.fighters[0].action).toBe('idle');
  });

  it('uses airborne attacks and interrupts them with the landing animation', () => {
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 50);
    match.step({ kick: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.airKick);
    for (let i = 0; i < 100 && match.fighters[0].action !== 'land'; i++)
      match.step();
    expect(match.fighters[0].action).toBe('land');
  });

  it('accepts a crouching attack pressed during the crouch transition', () => {
    const match = new Match();
    match.step({ crouch: true });
    match.step({ crouch: true, kick: true });
    expect(playing(match.fighters[0])).toBe(RYUKO.crouchKick);
  });

  it('uses crouching guard and plays a block reaction without taking damage', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    ticks(match, 12, { kick: true }, { crouch: true, guard: true });
    expect(match.fighters[1].hp).toBe(LIFE);
    expect(match.fighters[1].action).toBe('crouchBlock');
    ticks(match, 44, {}, { crouch: true, guard: true });
    expect(match.fighters[1].action).toBe('crouchGuard');
  });

  it.each([1, -1] as const)(
    'holds the lethal impact, launches away and slides on landing facing %i',
    (facing) => {
      const match = new Match();
      const [player, target] = match.fighters;
      player.x = 960 - facing * 120;
      target.x = 960;
      // 60% of punch 1's 10 at desperation life.
      target.hp = 6;
      ticks(match, 8, { punch: true });
      expect(match.winner).toBe('player');
      expect(target).toMatchObject({
        action: 'down',
        x: 960,
        y: 0,
        vx: 0,
        vy: 0,
      });
      expect([player.hitStop, target.hitStop]).toEqual([20, 10]);
      ticks(match, 10);
      expect(target.age).toBe(0);
      ticks(match, 5);
      expect(target.age).toBe(5);
      expect([player.hitStop, target.hitStop]).toEqual([45, 40]);
      const held = match.fighters.map((f) => [f.age, f.x, f.y]);
      ticks(match, 40, {}, { jump: true });
      expect(match.fighters.map((f) => [f.age, f.x, f.y])).toEqual(held);
      ticks(match, 8);
      expect(target).toMatchObject({ age: 13, x: 960, y: 0 });
      match.step();
      expect(target.age).toBe(14);
      expect(target.vx).toBeCloseTo(facing * 7.49588, 4);
      expect(target.y).toBeCloseTo(-21.977921, 4);
      let apex = target.y;
      for (let tick = 1; tick < 56; tick++) {
        expect(target.action).toBe('down');
        expect(animationFrame('down', target.age).image).not.toBe(63);
        match.step();
        apex = Math.min(apex, target.y);
      }
      expect(apex).toBeCloseTo(-309.369965, 4);
      expect(target).toMatchObject({ action: 'koLand', age: 0, y: 0 });
      expect((target.x - 960) * facing).toBeCloseTo(419.769287, 4);
      ticks(match, 10);
      expect((target.x - 960) * facing).toBeCloseTo(449.752808, 4);
      expect(animationFrame('koLand', target.age).image).toBe(63);
      const floorX = target.x;
      ticks(match, ROUND_END_TICKS);
      expect(target).toMatchObject({
        action: 'koLand',
        x: floorX,
        y: 0,
        hp: 0,
      });
      expect(player.hits).toBe(1);
      expect(match.resultReady).toBe(true);
    },
  );

  it('holds an airborne KO through impact and keeps the fall pose until it reaches the floor', () => {
    const match = new Match();
    const [player, target] = match.fighters;
    player.x = 840;
    target.x = 960;
    player.y = target.y = -500;
    strike(match, player, RYUKO.airPunch);
    target.hp = 1;
    match.step();
    const height = target.y;
    ticks(match, 15 + 5 + 40 + 8);
    expect(target).toMatchObject({ action: 'down', age: 13, y: height, vy: 0 });
    ticks(match, 26);
    expect(target.action).toBe('down');
    expect(target.y).toBeLessThan(-700);
    expect(animationFrame('down', target.age).image).toBe(61);
    for (let tick = 0; tick < 100 && target.action === 'down'; tick++)
      match.step();
    expect(target).toMatchObject({ action: 'koLand', y: 0 });
  });

  it('holds a projectile winner before celebration', () => {
    const match = new Match();
    const [player, target] = match.fighters;
    target.hp = 1;
    match.step({ axe: true });
    for (let tick = 0; tick < 100 && !match.winner; tick++) match.step();
    expect(match.winner).toBe('player');
    expect(player.action).not.toBe('win');
    // FB's 75 stops its victim 15 ticks (authored: not the axe's thrower);
    // KO Normal adds 10 to the thrower (PC 607), then holds both 40 at its
    // age 5 (PC 611).
    expect([player.hitStop, target.hitStop]).toEqual([10, 15]);
    ticks(match, 20);
    expect([player.hitStop, target.hitStop]).toEqual([40, 40]);
    // It finishes the throw before taking its result back in neutral.
    while (named(player) === 'axeThrow') {
      expect(player.age).toBeLessThan(animationDuration(RYUKO.axeThrow));
      match.step();
    }
    expect(player).toMatchObject({ action: 'win', age: 0 });
  });

  it('finishes both lethal launches in a draw without replaying the impact holds', () => {
    const match = new Match();
    const [a, b] = match.fighters;
    a.x = 800;
    b.x = 930;
    // 60% of punch 1's 10 on a 120% body box.
    a.hp = b.hp = 7;
    ticks(match, 8, { punch: true }, { punch: true });
    expect(match.winner).toBe('draw');
    ticks(match, 35);
    expect(match.fighters.map((f) => [f.age, f.hitStop])).toEqual([
      [5, 80],
      [5, 80],
    ]);
    ticks(match, 80);
    expect(match.fighters.map((f) => [f.age, f.hitStop])).toEqual([
      [5, 0],
      [5, 0],
    ]);
    ticks(match, ROUND_END_TICKS);
    for (const f of match.fighters) {
      expect(f).toMatchObject({ action: 'koLand', y: 0, hits: 1, hp: 0 });
      expect(f.age).toBeGreaterThanOrEqual(60);
    }
  });

  it.each([790, 1100])(
    'stops a ranged KO from x=%i at the right camera wall',
    (x) => {
      const match = new Match();
      const [player, target] = match.fighters;
      target.x = x;
      target.hp = 1;
      match.step({ axe: true });
      for (let tick = 0; tick < 200 && !match.winner; tick++) match.step();
      expect(match.winner).toBe('player');
      ticks(match, ROUND_END_TICKS);
      expect(target).toMatchObject({ action: 'koLand', y: 0 });
      expect(target.x - match.cameraX).toBe(WIDTH - FIGHTER_MARGIN);
      expect([player.x, match.cameraX, match.cameraY]).toEqual([300, 220.5, 0]);
    },
  );

  it('keeps ending animations moving after a KO without advancing combat', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    match.fighters[1].hp = 6;
    ticks(match, 8, { punch: true });
    expect(match.winner).toBe('player');
    // The lethal hit still enters punch 1's hit branch (179).
    expect(playing(match.fighters[0])).toBe(RYUKO.punchHit);
    expect(match.fighters[1].action).toBe('down');
    const end = match.ticks;
    const age = match.fighters[1].age;
    ticks(match, 10, { kick: true });
    expect(match.fighters[1].age).toBe(age);
    ticks(match, 100, { kick: true });
    expect(match.fighters[0].action).toBe('win');
    expect(match.ticks).toBe(end);
    expect(match.fighters[1].age).toBe(age + 60); // Includes the KO's 40-tick hold.
    expect(match.fighters[1].hp).toBe(0);
    expect(match.resultReady).toBe(false);
    ticks(match, ROUND_END_TICKS - 110);
    expect(match.resultReady).toBe(true);
    expect(match.fighters[1].y).toBe(0);
    const finalAge = match.fighters[1].age;
    ticks(match, 20);
    expect(match.fighters[1].age).toBe(finalAge);
  });

  it.each(['melee', 'projectile'] as const)(
    'lands before celebrating an airborne %s KO',
    (attack) => {
      const match = new Match();
      const [player, target] = match.fighters;
      player.x = attack === 'melee' ? 530 : 185;
      target.x = attack === 'melee' ? 660 : 985;
      target.hp = 8;
      for (let tick = 0; tick < 100 && !match.winner; tick++) {
        // The camera walls keep the axe's flight short of the jump, so a
        // super's freeze (global 6) holds it until Ryuko is airborne.
        if (attack === 'projectile' && tick === 10) match.freeze = 24;
        match.step(
          {
            jump: tick === (attack === 'melee' ? 0 : 56),
            punch: attack === 'melee' && tick === 41,
            axe: attack === 'projectile' && tick === 0,
          },
          {},
        );
      }
      expect(match.winner).toBe('player');
      expect(player.y).toBeLessThan(0);
      expect(playing(player)).toBe(
        attack === 'melee' ? RYUKO.airPunch : 'jump',
      );
      const end = match.ticks;
      for (let tick = 0; tick < 200 && player.y < 0; tick++) {
        expect(player.action).not.toBe('win');
        match.step();
      }
      expect(player.y).toBe(0);
      expect(player.action).toBe('land');
      ticks(match, animationDuration('land') - 1);
      expect(player.action).toBe('land');
      match.step();
      expect(player.action).toBe('win');
      expect(player.age).toBe(0);
      expect(target.action).toBe('down');
      expect(match.ticks).toBe(end);
      ticks(match, ROUND_END_TICKS - match.endingTicks);
      expect(match.resultReady).toBe(true);
    },
  );

  it.each([500, LIFE])(
    'lands before timeout poses with opponent HP %i',
    (hp) => {
      const match = new Match('cpu');
      match.step({ jump: true }, { jump: true });
      ticks(match, 20);
      match.fighters[1].hp = hp;
      match.ticks = 5999;
      match.step({}, {});
      expect(match.fighters.map((f) => f.action)).toEqual(['jump', 'jump']);
      for (let tick = 0; tick < 100 && match.fighters[0].y < 0; tick++)
        match.step({}, {});
      expect(match.fighters.map((f) => f.action)).toEqual(['land', 'land']);
      ticks(match, animationDuration('land'));
      expect(match.fighters.map((f) => f.action)).toEqual(
        hp === LIFE ? ['draw', 'draw'] : ['win', 'draw'],
      );
    },
  );

  it('returns from an air guard to the current jump phase and uses air hit reactions', () => {
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 12);
    match.step({ guard: true });
    expect(match.fighters[0].action).toBe('airGuard');
    const airAge = match.fighters[0].airAge;
    match.step();
    expect(match.fighters[0].action).toBe('jump');
    expect(match.fighters[0].airAge).toBe(airAge + 1);
    match.fighters[1].x = match.fighters[0].x + 130;
    ticks(match, 43); // Return to ground-attack height on the descending arc.
    for (let i = 0; i < 8; i++) match.step({}, { punch: true });
    expect(match.fighters[0].action).toBe('airHit');
  });

  // An air guard cannot block these: their guard-air responses are 2 and 4.
  it.each([
    ['punch', false, 'airHit'],
    ['kick', false, 'airHit'],
    ['punch', true, 'airHit'],
    ['kick', true, 'airHit'],
    ['crouchPunch', false, 'airHitHeavy'],
    ['crouchPunch', true, 'airHitHeavy'],
  ] as const)(
    'launches a low jumper hit by %s with guard=%s past its recovery',
    (attack, guard, airReaction) => {
      const match = new Match();
      const player = match.fighters[0];
      player.x = 530;
      for (let tick = 0; tick <= 66; tick++)
        match.step(
          { jump: tick === 0, guard: guard && tick > 0 },
          attack === 'crouchPunch'
            ? { crouch: tick === 52, punch: tick === 52 }
            : { [attack]: tick === 59 },
        );
      expect(player.action).toBe(airReaction);
      expect(player.y).toBeLessThan(0);
      const contactHeight = player.y;
      ticks(match, attack === 'crouchPunch' ? 15 : 10);
      expect(player.y).toBe(contactHeight);
      // 74/76 rise at raw 100 (PCs 774/816), then fly up and back.
      match.step();
      expect(player.y).toBeCloseTo(
        contactHeight - 100 * (655 / 65536) * 1.5,
        6,
      );
      const duration = animationDuration(airReaction);
      ticks(match, duration - 1);
      expect(player.y).toBeLessThan(contactHeight);
      for (let tick = 0; tick < 100 && player.y < 0; tick++) match.step();
      expect(player.action).toBe('land');
    },
  );

  it.each([false, true])(
    'ends an air guard on landing, free at once (0x411810), punch=%s',
    (punch) => {
      const match = new Match();
      const player = match.fighters[0];
      Object.assign(player, { action: 'airBlock', age: 0, y: -10, vy: 0 });
      // 153 falls from rest at gravity 70 and restarts the fall at age 3.
      ticks(match, 6);
      expect(player).toMatchObject({ action: 'airBlock', age: 6 });
      // No landing handler: motion stops, the action ends, and the free state
      // reads commands on the landing tick itself.
      match.step({ punch });
      expect(playing(player)).toBe(punch ? RYUKO.punch : 'idle');
      expect(player).toMatchObject({ y: 0, vx: 0, vy: 0 });
    },
  );

  it('shows win or draw poses when time expires with both fighters alive', () => {
    for (const hp of [500, LIFE]) {
      const match = new Match('cpu');
      match.ticks = 5999;
      match.fighters[1].hp = hp;
      match.step({}, {});
      expect(match.fighters.map((f) => f.action)).toEqual(['idle', 'idle']);
      match.step({}, {});
      // The loser still standing takes result 3, the draw action.
      expect(match.fighters.map((f) => f.action)).toEqual(
        hp === LIFE ? ['draw', 'draw'] : ['win', 'draw'],
      );
      untilResult(match);
    }
  });

  // 0x40fad9: a victim reeling from the striker's own kick, stopped by the
  // wall, hands the stopped distance to the striker's transfer (+0xdf49), so
  // the cornered striker gives up the slide and the gap ends as in the open.
  it.each([1, -1] as const)(
    'pushes the striker back by the slide a cornered hit or guard loses facing %i',
    (facing) => {
      for (const guard of [false, true]) {
        const run = (targetX: number) => {
          const match = new Match();
          const [f, target] = match.fighters;
          target.x = targetX;
          f.x = targetX - facing * 130;
          ticks(match, 8, { kick: true }, { guard });
          ticks(match, 60, {}, { guard });
          return [f.x - targetX + facing * 130, target.x - targetX];
        };
        const slide = facing * (guard ? 95.947 : 83.954);
        const open = run(facing === 1 ? 900 : 700);
        const corner = run(
          facing === 1 ? STAGE_WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN,
        );
        expect(open[0]).toBeCloseTo(0, 3);
        expect(open[1]).toBeCloseTo(slide, 3);
        expect(corner[0]).toBeCloseTo(-slide, 3);
        expect(corner[1]).toBeCloseTo(0, 3);
      }
    },
  );

  it('keeps the reaction and striker through the knockdown until neutral (0x411abc)', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 440;
    target.x = 590;
    ticks(match, 19, { crouch: true, kick: true });
    const seen: [string, number, string | null][] = [];
    for (let tick = 0; tick < 300; tick++) {
      if (seen.at(-1)?.[0] !== target.action)
        seen.push([target.action, target.reaction, target.striker]);
      match.step();
    }
    expect(seen).toEqual([
      ['sweep', 8, 'body'],
      ['knockdown', 8, 'body'],
      ['getUp', 8, 'body'],
      ['idle', 0, null],
    ]);
  });

  // Punch 3's slam lands through its landing handler into the bounce (124),
  // keeping +0x15e, so a cornered bounce and its slide (147) still hand
  // their distance on.
  it.each([1, -1] as const)(
    'pushes the striker back by a cornered slam bounce facing %i',
    (facing) => {
      const run = (victimX: number) => {
        const match = new Match();
        const [f, victim] = match.fighters;
        Object.assign(victim, { x: victimX, facing: -facing });
        Object.assign(f, { x: victimX - facing * 120, facing });
        // The tick before punch 3's strike, after its hops (181 + 18).
        enter(match, f, RYUKO.punch3, 13, 18);
        let start: number[] = [];
        for (let tick = 0; tick < 300 && victim.action !== 'getUp'; tick++) {
          match.step();
          // Its motion starts at age 10, once the bodies have pushed apart.
          if (victim.action === 'slamBounce' && victim.age === 9)
            start = [f.x + f.transfer, victim.x];
        }
        expect(victim.action).toBe('getUp');
        return [f.x - start[0], victim.x - start[1]];
      };
      const open = run(facing === 1 ? 900 : 1000);
      const corner = run(
        facing === 1 ? STAGE_WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN,
      );
      expect(open[0]).toBe(0);
      expect(open[1] * facing).toBeGreaterThan(0);
      expect(corner[1]).toBe(0);
      expect(corner[0]).toBeCloseTo(-open[1], 3);
    },
  );

  it.each([1, -1] as const)(
    'pushes a cornered thrower out as its spins swing the victim into the wall facing %i',
    (facing) => {
      const match = new Match();
      const [thrower, victim] = match.fighters;
      const wall = facing === 1 ? FIGHTER_MARGIN : STAGE_WIDTH - FIGHTER_MARGIN;
      Object.assign(thrower, { x: wall, facing });
      Object.assign(victim, { x: wall + facing * 111, facing: -facing });
      for (let tick = 0; tick < 100 && victim.action !== 'dstToss'; tick++)
        match.step({ throw: tick === 0 }, {});
      // The grab records the thrower as striker, and ops 0x07 and 0x14 mark
      // the victim reeling and held. Spin 199's −10 and −60 holds land behind
      // the thrower, past the wall, which hands the 15 and 75 pixels it stops
      // to the thrower, so the next −60 hold meets the wall exactly.
      expect(victim).toMatchObject({
        action: 'dstToss',
        reaction: 0xa,
        striker: 'body',
      });
      expect((thrower.x - wall) * facing).toBe(90);
    },
  );

  it('measures the left camera wall from 50 − camera, so a scrolled one hands on nothing (0x40fbdd)', () => {
    const match = new Match();
    const [striker, victim] = match.fighters;
    // Snap the camera to the stage's right end (640).
    victim.x = 1700;
    striker.x = 1800;
    match.step();
    expect(match.cameraX).toBe(STAGE_WIDTH - WIDTH);
    // The camera moves halfway to the pair's aim of 110, to 375, so the left
    // wall is at source 425 and stops the reeling victim 25 pixels.
    Object.assign(victim, { x: 600, facing: 1, reaction: 8, striker: 'body' });
    Object.assign(striker, { x: 690, facing: -1 });
    match.step();
    expect(match.cameraX).toBe(375 * 1.5);
    expect(victim.x).toBe(425 * 1.5);
    // (50 − 375) − 400 is negative, so the striker's transfer stays 0.
    expect(striker.transfer).toBe(0);
  });

  it('pushes overlapping bodies apart by a quarter of their push-box overlap', () => {
    // Idle push boxes (−1, −92) ±(37, 102) at source x 200 and 240 overlap by
    // 74 − 42 = 32 pixels: each fighter moves 8, or 12 arena pixels.
    const push = (setup: (a: Fighter, b: Fighter) => void) => {
      const match = new Match();
      const [a, b] = match.fighters;
      a.x = 300;
      b.x = 360;
      setup(a, b);
      match.step();
      return [a.x, b.x];
    };
    expect(push(() => {})).toEqual([288, 372]);
    // Only the airborne one moves against a grounded one: jump box
    // (−5, −101) ±(38, 92) overlaps by 29.
    const jump = (f: Fighter) => {
      f.y = -30;
      f.action = 'jump';
    };
    expect(push((_, b) => jump(b))).toEqual([300, 370.875]);
    expect(push(jump)).toEqual([289.125, 360]);
    // Both airborne: 26 pixels, 9.75 each.
    expect(
      push((a, b) => {
        jump(a);
        jump(b);
      }),
    ).toEqual([290.25, 369.75]);
    // A KO'd fighter (life 0) pushes no one but is still pushed.
    expect(
      push((_, b) => {
        b.hp = 0;
      }),
    ).toEqual([300, 372]);
  });

  it('moves, clamps to the court, pushes bodies, and lands without auto-jumping', () => {
    const match = new Match();
    ticks(match, 500, { left: true });
    expect(match.fighters[0].x).toBe(FIGHTER_MARGIN);
    ticks(match, 500, { right: true });
    // Walking shoves the idle opponent along at half the walk, a quarter of
    // their 3–4 pixel overlap each, the gap swinging with whole pixels.
    const [a, b] = match.fighters;
    const start = b.x;
    ticks(match, 20, { right: true });
    expect((b.x - start) / 20).toBeCloseTo(1.4, 1);
    expect(b.x - a.x).toBeGreaterThan(84);
    expect(b.x - a.x).toBeLessThan(90);
    match.step({ jump: true });
    ticks(match, 30, { jump: true });
    expect(match.fighters[0].y).toBeLessThan(-100);
    ticks(match, 100, { jump: true });
    expect(match.fighters[0].y).toBe(0);
    expect(match.fighters[0].vy).toBe(0);
  });

  it('requires range, applies one hit per press, and uses attack recovery', () => {
    const match = new Match();
    ticks(match, 45, { punch: true });
    expect(match.fighters[1].hp).toBe(LIFE);
    match.fighters[0].x = 530;
    match.step();
    ticks(match, 100, { punch: true });
    expect(match.fighters[1].hp).toBe(LIFE - 10);
    expect(match.fighters[0].hits).toBe(1);
    expect(match.fighters[0].damage).toBe(10);
  });

  it('blocks damage while guarding and cannot attack during hitstun', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    ticks(match, 15, { kick: true }, { guard: true });
    expect(match.fighters[1].hp).toBe(LIFE);
    expect(hitEffects(match).at(-1)?.clip).toBe(370);
    ticks(match, 50);
    // Guard 149 slid the defender out of punch range.
    match.fighters[1].x = match.fighters[0].x + 130;
    ticks(match, 8, { punch: true });
    expect(match.fighters[1].action).toBe('hit');
    match.step({}, { kick: true });
    expect(match.fighters[1].action).toBe('hit');
  });

  it('allows simultaneous hits and resolves knockouts without further damage', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    // Each punch meets the other's 120% body box: 12, or 7 at desperation.
    match.fighters.forEach((f) => {
      f.hp = 7;
    });
    ticks(match, 8, { punch: true }, { punch: true });
    expect(match.fighters.map((f) => f.hp)).toEqual([0, 0]);
    expect(match.winner).toBe('draw');
    const end = match.ticks;
    ticks(match, 50, { kick: true });
    expect(match.ticks).toBe(end);
  });

  it('resolves the 60-second time limit', () => {
    const match = new Match('cpu');
    match.fighters[1].hp = 92;
    ticks(match, 6000);
    expect(match.seconds).toBe(0);
    expect(match.winner).toBe('player');
    expect(new Match('practice').seconds).toBe(Infinity);
  });
});

it('uses fixed ticks regardless of render partition and drops suspended time', () => {
  const run = (deltas: number[]) => {
    const clock = new FixedClock();
    const match = new Match();
    deltas.forEach((delta) =>
      clock.advance(delta, () => match.step({ left: true })),
    );
    return match;
  };
  expect(run(Array<number>(1000).fill(1))).toEqual(
    run(Array<number>(40).fill(25)),
  );
  expect(run([5000]).ticks).toBe(25);
  const clock = new FixedClock();
  let count = 0;
  clock.advance(9, () => count++);
  clock.reset();
  clock.advance(1, () => count++);
  expect(count).toBe(0);
});

describe('CPU IORI', () => {
  it('plays 410 and 411, then continues into iori3', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + 1000; // out of reach: timing only
    match.step({}, { cpuIori: true });
    expect({ ...cpu, action: named(cpu) }).toMatchObject({
      action: 'cpuIori',
      age: 0,
    });
    // 410's displays (5 + 8 + 8 + 8 + 3) and 411's (3 + 5 + 5 + 10 + 8 + 3).
    expect(animationDuration(RYUKO.cpuIori)).toBe(66);
    ticks(match, 65);
    expect(named(cpu)).toBe('cpuIori');
    expect(cpu.x).toBeLessThan(ryuko.x + 1000);
    match.step({}, {});
    expect({ ...cpu, action: named(cpu) }).toMatchObject({
      action: 'iori3',
      age: 0,
    });
  });

  it('recovers one time in six instead (op 0x20 at PC 5887)', () => {
    // The match's CPU draws rand % 6; above 4 jumps to 411 + 31.
    const seedFor = (recover: boolean) => {
      let seed = 0;
      while (rand(seed)[1] % 6 > 4 !== recover) seed++;
      return seed;
    };
    for (const recover of [false, true]) {
      const match = new Match('cpu', false, seedFor(recover));
      const [ryuko, cpu] = match.fighters;
      cpu.x = ryuko.x + 1000;
      match.step({}, { cpuIori: true });
      ticks(match, 66);
      expect({ ...cpu, action: named(cpu) }).toMatchObject({
        action: recover ? 'cpuIoriRecover' : 'iori3',
        age: 0,
      });
    }
    // Images 441, 321 and 31 for five ticks each, then idle.
    expect(animationDuration('411+31')).toBe(15);
    const match = new Match('cpu', false, seedFor(true));
    const cpu = match.fighters[1];
    cpu.x = match.fighters[0].x + 1000;
    match.step({}, { cpuIori: true });
    ticks(match, 66 + 14);
    expect(named(cpu)).toBe('cpuIoriRecover');
    match.step({}, {});
    expect(cpu.action).toBe('idle');
  });

  it('hits with response 3 for source damage 10', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + 150;
    match.step({}, { cpuIori: true });
    for (let tick = 0; tick < 40 && ryuko.action !== 'hitHeavy'; tick++)
      match.step({}, {});
    expect(ryuko.action).toBe('hitHeavy'); // response 3 → action 75
    expect(ryuko.hp).toBe(LIFE - 10);
  });
});

describe('recovered CPU', () => {
  // An empty table leaves only the guard roll acting.
  function vsCpu(vm: CpuVM, gap = 120) {
    const match = new Match('cpu');
    match.cpu = vm;
    const [ryuko, cpu] = match.fighters;
    cpu.x = ryuko.x + gap;
    return { match, ryuko, cpu };
  }
  // Ryuko's punch becomes active on the next tick; the CPU supplies its input.
  function punch(match: Match, ryuko: Fighter) {
    strike(match, ryuko, RYUKO.punch);
    match.step();
  }

  it('guards a neutral CPU on rand % 100 < level, ignoring its input', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    punch(match, ryuko);
    expect(cpu.action).toBe('block');
    const never = vsCpu(new CpuVM([], 0));
    punch(never.match, never.ryuko);
    expect(never.cpu.action).toBe('hit');
  });

  it('does not roll while the CPU attacks', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    // A command entered free marks it attacking (+0x15e bit 4, 0x411a41).
    match.step({}, { kick: true });
    expect([playing(cpu), cpu.reaction]).toEqual([RYUKO.kick, 4]);
    punch(match, ryuko);
    expect(cpu.action).toBe('hit');
  });

  it('keeps guarding through a guard reaction, even on a cross-up', () => {
    for (const facing of [-1, 1] as const) {
      const { match, ryuko, cpu } = vsCpu(new CpuVM([], 0));
      // Facing 1 turns the CPU away from Ryuko: 0x40f449 ignores facing.
      Object.assign(cpu, { action: 'block', age: 0, facing, reaction: 0xc });
      punch(match, ryuko);
      expect(cpu.action).toBe('block');
    }
  });

  it('rolls in the air only while free (0x40f3c2)', () => {
    // Ryuko's air punch meets the CPU after its inputs and the wait.
    const struck = (inputs: Input[], until: (cpu: Fighter) => boolean) => {
      const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
      for (const input of inputs) match.step({}, input);
      while (!until(cpu)) match.step({}, {});
      const { x, y, vy, gravity } = cpu;
      Object.assign(ryuko, { x: x - 120, y, vy, gravity });
      strike(match, ryuko, RYUKO.airPunch);
      match.step();
      return cpu.action;
    };
    const jumped = (age: number) => (cpu: Fighter) =>
      cpu.action === 'jump' && cpu.age === age;
    const jump: Input[] = [{ jump: true }, ...Array<Input>(14).fill({})];
    // The jump is free from takeoff (the neutral handler, 0x410dc0).
    expect(struck([{ jump: true }], (cpu) => cpu.age === 3)).toBe('blockStop');
    expect(struck([{ jump: true }], jumped(6))).toBe('airBlockHeavy');
    // A double jump is a command until it lands.
    const double = [...jump, { jump: true }];
    expect(struck(double, (cpu) => cpu.age === 2)).toBe('airHitHeavy');
    expect(struck(double, (cpu) => cpu.age === 30)).toBe('airHitHeavy');
    // An air attack falls through op 0x0a into action 7 (at age 47), keeping
    // bit 4.
    const fall = (cpu: Fighter) =>
      playing(cpu) === RYUKO.airPunch && cpu.age === 47 && cpu.reaction === 4;
    expect(struck([...jump, { punch: true }], fall)).toBe('airHitHeavy');
  });

  it('rolls only when a hit lands', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 0), 400);
    punch(match, ryuko);
    for (let tick = 0; tick < 10; tick++) match.step();
    expect(match.cpu.seed).toBe(0);
    cpu.x = ryuko.x + 120;
    punch(match, ryuko);
    expect(cpu.action).toBe('hit');
    expect(match.cpu.seed).not.toBe(0);
  });

  it('leaves a supplied opponent input and the practice partner to their own guard', () => {
    const { match, ryuko, cpu } = vsCpu(new CpuVM([], 100));
    strike(match, ryuko, RYUKO.punch);
    match.step({}, {});
    expect(cpu.action).toBe('hit');
    const practice = new Match();
    practice.cpu = new CpuVM([], 100);
    const [player, partner] = practice.fighters;
    partner.x = player.x + 120;
    punch(practice, player);
    expect(partner.action).toBe('hit');
  });

  it('air dashes through its DASH F command, which it writes (0x4115e3)', () => {
    const airborne = (direction: number, command: number) => {
      const { match, cpu } = vsCpu(
        new CpuVM(
          [
            {
              flags: 1,
              probability: 100,
              min: 0,
              max: 2000,
              steps: [{ direction, command, duration: 5 }],
            },
          ],
          100,
        ),
        400,
      );
      Object.assign(cpu, { action: 'jump', y: -200, vy: 0 });
      match.step();
      return playing(cpu);
    };
    // Its history holds only this tick (0x411307), so holding → is no motion,
    // but its cleared ticks read as neutral before ↗: Jump 2 F.
    expect(airborne(2, 0)).toBe('jump');
    expect(airborne(9, 0)).toBe(RYUKO.doubleJumpF);
    expect(airborne(0, 13)).toBe(RYUKO.airDash);
  });

  it('plays from the recovered table against an idle player', () => {
    const match = new Match('cpu');
    const [ryuko, cpu] = match.fighters;
    const actions = new Set<unknown>();
    for (let tick = 0; tick < 3000 && !match.winner; tick++) {
      match.step({});
      actions.add(playing(cpu));
    }
    expect(actions.size).toBeGreaterThan(3);
    expect(actions.has('jump')).toBe(true);
    expect(ryuko.hp).toBeLessThan(LIFE);
  });

  it('seeds the CPU from the match', () => {
    expect(new Match('cpu', false, 7).cpu.seed).toBe(7);
  });
});

describe('recovered rush and time-stop reactions', () => {
  const raw = (655 / 65536) * 1.5;

  it('drifts, launches and knocks down from the rush air hit (122)', () => {
    const match = new Match();
    const target = match.fighters[1];
    // Within the camera walls' 540 source pixels of Ryuko.
    match.fighters[0].x = 900;
    target.x = 1200;
    Object.assign(target, { action: 'rushAirHit', age: 0, y: -100, vy: 0 });
    // PC 1616: raw -100 away from Ryuko, with no fall, until PC 1628.
    ticks(match, 8);
    expect(target).toMatchObject({ action: 'rushAirHit', y: -100 });
    expect(target.x - 1200).toBeCloseTo(8 * 100 * raw, 3);
    // PC 1628 launches at -400/-830 with gravity 80; handler slot 1 → 146.
    match.step({}, {});
    expect(target.y).toBeLessThan(-100);
    for (let tick = 0; tick < 200 && target.action === 'rushAirHit'; tick++)
      match.step({}, {});
    expect(target.action).toBe('knockdown');
  });

  it('holds the standing time-stop guard in place with its counter checks', () => {
    const match = new Match();
    const target = match.fighters[1];
    // Within the camera walls' 540 source pixels of Ryuko.
    match.fighters[0].x = 900;
    target.x = 1200;
    target.stock = 1;
    Object.assign(target, { action: 'timeStopGuard', age: 0 });
    ticks(match, 2);
    expect(target).toMatchObject({ action: 'timeStopGuard', x: 1200 });
    // 168's op 0x24 at age 3 (PC 2279) reads Hit Up for COUNTER HIT.
    match.step({}, { hitUp: true });
    expect(named(target)).toBe('counterHit');
  });

  it('drops the air time-stop guard straight down at gravity 70 (PC 2323)', () => {
    const match = new Match();
    const target = match.fighters[1];
    // Within the camera walls' 540 source pixels of Ryuko.
    match.fighters[0].x = 900;
    target.x = 1200;
    Object.assign(target, {
      action: 'airTimeStopGuard',
      age: 0,
      y: -120,
      vx: 5,
      vy: -3,
    });
    match.step({}, {});
    expect(target.x).toBe(1200);
    expect(target.y).toBeCloseTo(-120 + 70 * (393 / 65536) * 1.5, 6);
  });
});

describe('recovered air and rapid reaction motion', () => {
  const raw = (655 / 65536) * 1.5;
  const acc = (393 / 65536) * 1.5;
  // Fighter 1 faces Ryuko on its left, so "back" is +x.
  function place(action: Fighter['action'], y = -150) {
    const match = new Match();
    const target = match.fighters[1];
    match.fighters[0].x = 900;
    Object.assign(target, { action, age: 0, x: 1200, y, vx: 0, vy: 0 });
    return { match, target };
  }

  it.each([
    ['airHit', 5, 650], // 74, PCs 774/778
    ['airHitHeavy', 6, 850], // 76, PCs 816/823
  ] as const)(
    '%s rises at raw 100, then flies back from age %i',
    (action, launch, vy) => {
      const { match, target } = place(action);
      ticks(match, launch - 1);
      expect(target.x).toBe(1200);
      expect(target.y).toBeCloseTo(-150 - (launch - 1) * 100 * raw, 6);
      const y = target.y;
      match.step({}, {});
      // Raw -300 and -vy with ax 1 and gravity 66.
      expect(target.x - 1200).toBeCloseTo(300 * raw - acc, 6);
      expect(target.y - y).toBeCloseTo(-vy * raw + 66 * acc, 6);
    },
  );

  it('drifts the air beam hit back for nine ticks, then launches it (84)', () => {
    const { match, target } = place('airHitRapid');
    ticks(match, 8);
    expect(target.y).toBe(-150);
    expect(target.x - 1200).toBeCloseTo(8 * 100 * raw, 6);
    // PC 990: raw -400/-830 with gravity 80; 84 has no landing handler.
    match.step({}, {});
    expect(target.y).toBeCloseTo(-150 - 830 * raw + 80 * acc, 6);
    for (let tick = 0; tick < 200 && target.y < 0; tick++) match.step({}, {});
    expect(target.action).toBe('land');
  });

  it.each([
    ['airBlock', 420, 3], // 153, PCs 2060/2063
    ['airBlockHeavy', 450, 6], // 158, PCs 2133/2136
    ['airBlockRapid', 450, 6], // 167, PCs 2263/2266
  ] as const)(
    '%s slides back at raw %i, speeding up, and restarts its fall at age %i',
    (action, vx, restart) => {
      const { match, target } = place(action);
      ticks(match, restart - 1);
      expect(target.vy).toBeCloseTo((restart - 1) * 70 * acc, 6);
      // Flag 0x1a zeroes vy and keeps vx, ax and gravity.
      match.step({}, {});
      expect(target.vy).toBeCloseTo(70 * acc, 6);
      expect(target.x - 1200).toBeCloseTo(
        restart * vx * raw + (15 * acc * restart * (restart + 1)) / 2,
        6,
      );
    },
  );

  it('falls as action 7 once a reaction ends airborne, keeping ax (0x411a80)', () => {
    const { match, target } = place('airBlock', -400);
    ticks(match, animationDuration('airBlock'));
    expect(target.action).toBe('jump');
    const { vx, vy } = target;
    match.step({}, {});
    // Action 7's op 0x01 (PC 99, flags 0xe) keeps vx, vy and ax; gravity 80.
    expect(target.vx - vx).toBeCloseTo(15 * acc, 9);
    expect(target.vy - vy).toBeCloseTo(80 * acc, 9);
    for (let tick = 0; tick < 200 && target.y < 0; tick++) match.step({}, {});
    // Its landing handler (slot 1, PC 95) enters LEND (9).
    expect(target.action).toBe('land');
  });

  it('pushes the beam hit back at raw 150, then drifts it in at +10 (83)', () => {
    const { match, target } = place('hitRapid', 0);
    ticks(match, 15);
    expect(target.x - 1200).toBeCloseTo(15 * 150 * raw - 120 * 10 * acc, 6);
    ticks(match, 18);
    expect(target.x - 1200).toBeCloseTo(33 * 150 * raw - 561 * 10 * acc, 6);
  });

  it('plays the beam hits for 34 ticks, one branch of their op 0x20', () => {
    expect(animationDuration('hitRapid')).toBe(34);
    expect(animationDuration('airHitRapid')).toBe(34);
  });

  it('rolls a beam hit’s op 0x20 on entry and draws its branch (PC 957)', () => {
    // Kick 3's beam (190) spawns 380 as it strikes, before the hit test, and
    // 380 rolls first: rand % 4 > 2 enters 381, otherwise rand % 3 > 1 enters
    // 382. Then the victim's: rand % 3 > 1 enters 83 + 18.
    const branches = new Set<Fighter['branch']>();
    for (let seed = 0; seed < 20; seed++) {
      const match = new Match('practice', false, seed);
      const [f, target] = match.fighters;
      enter(match, f, RYUKO.kick3);
      target.x = f.x + 140;
      while (target.action !== 'hitRapid') match.step();
      const rand = new CpuVM([], 0, seed);
      if (rand.random() % 4 <= 2) rand.random();
      const branch = rand.random() % 3 > 1;
      expect(target.branch).toBe(branch ? '83+18' : null);
      branches.add(target.branch);
    }
    expect(branches).toEqual(new Set([null, '83+18']));
    // The branch swaps the first three poses.
    const images = (clip: 'hitRapid' | '83+18') =>
      [0, 3, 6, 9].map((age) => animationFrame(clip, age).image);
    expect(images('hitRapid')).toEqual([47, 52, 47, 47]);
    expect(images('83+18')).toEqual([52, 47, 52, 47]);
  });
});

describe('EX mode', () => {
  // EX Fire's shot: the object in its owner's slot 6.
  const shot = (match: Match, owner = 0) =>
    match.effects.find((e) => e.owner === owner && e.slot === 6);
  const exMatch = () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x + 600;
    f.variables[0] = 10;
    return { match, f, target };
  };

  it('switches with EX Ch and NOR Ch for 50 power, or enters NO SUPER without it', () => {
    const broke = new Match();
    broke.step({ ex: true });
    // PCs 2858–2863: under 50 power in all, its branch (204 + 3) gives the
    // 50 back and jumps into NO SUPER (251).
    expect({
      ...broke.fighters[0],
      branch: playing(broke.fighters[0]),
      ex: exMode(broke.fighters[0]),
    }).toMatchObject({
      branch: '204+3',
      power: 0,
      ex: false,
    });
    const match = new Match();
    const [f] = match.fighters;
    f.power = 60;
    match.step({ ex: true });
    // EX Ch (204) spends 50, sets variable 0 (PC 2867) and spawns EX Obj 375.
    expect({ ...f, action: named(f), ex: exMode(f) }).toMatchObject({
      action: 'exChange',
      power: 10,
      ex: true,
    });
    expect(match.effects.map((e) => e.clip)).toEqual([375]);
    expect(f.face).toBe(-1);
    match.step();
    // The HUD face (action 70) counts its cycle from the next tick.
    expect(f.face).toBe(0);
    ticks(match, animationDuration(RYUKO.exChange));
    expect([f.action, exMode(f)]).toEqual(['idle', true]);
    Object.assign(f, { stock: 1, power: 0 });
    match.step({ ex: true });
    // In EX mode PC 2866 enters NOR Ch (205), which clears it (PC 2880).
    expect({ ...f, action: named(f), ex: exMode(f) }).toMatchObject({
      action: 'norChange',
      stock: 0,
      power: 50,
      ex: false,
    });
    match.step();
    expect(f.face).toBe(-1);
  });

  it('starts a Vs. CPU round in EX mode for down held at PC 348', () => {
    expect(INTRO_EX_TICK).toBe(162);
    const match = new Match('cpu', true);
    ticks(match, INTRO_EX_TICK - 1, { crouch: true });
    expect(exMode(match.fighters[0])).toBe(false);
    match.step({ crouch: true });
    expect(match.fighters.map(exMode)).toEqual([true, false]);
    const late = new Match('cpu', true);
    ticks(late, INTRO_EX_TICK);
    late.step({ crouch: true });
    expect(exMode(late.fighters[0])).toBe(false);
  });

  it('fires a tapped EX Fire (231): a 30-damage shot at raw 800 through FB', () => {
    const { match, f, target } = exMatch();
    match.step({ axe: true });
    expect(named(f)).toBe('exFire');
    // Holding back doesn't charge: condition 4 is forward.
    ticks(match, 17, { left: true });
    expect(shot(match)).toBeUndefined();
    // At age 18 the charge check (PC 3445) falls through to 231 + 13, which
    // spawns 233 at (−6, −102) in slot 6; 228 moves it at raw 800.
    match.step({ left: true });
    const ball = shot(match)!;
    expect(ball).toMatchObject({ clip: 233, age: 0, x: 291, y: -153 });
    expect(ball.vx).toBeCloseTo(11.993, 3);
    expect(ball.box).toMatchObject({ damage: 30, kind: 6 });
    for (let tick = 0; tick < 100 && target.hp === LIFE; tick++) match.step();
    // Response 50 → FB (110) credits the striker 10 power (PC 1442) and
    // enters 75; objects don't pause Ryuko.
    expect(target).toMatchObject({
      hp: LIFE - 30,
      action: 'hitHeavy',
      hitStop: 15,
    });
    expect(f).toMatchObject({ power: 13, hitStop: 0 });
    // The hit handler (slot 2) enters 235, a blank display for ten ticks.
    expect(ball).toMatchObject({ clip: 235, age: 0, box: null });
    ticks(match, 9);
    expect(shot(match)).toBe(ball);
    match.step();
    expect(shot(match)).toBeUndefined();
  });

  it('charges while forward is held: EX Fire 2 after 237, Genkai after 238', () => {
    const { match, f, target } = exMatch();
    match.step({ axe: true, right: true });
    const taken: unknown[] = [];
    for (let tick = 0; tick < 56; tick++) {
      match.step({ right: true });
      if (f.age === 0) taken.push(f.branch);
    }
    // Each op 0x16 (condition 4) after a charge display takes its jump.
    expect(taken).toEqual([
      '237+4',
      '237+9',
      '237+12',
      '237+15',
      '237+19',
      '237+22',
      '237+25',
      '237+29',
      '237+34',
    ]);
    // Released, 237's last check (PC 3475) enters EX Fire 2 (232), which sets
    // variable 12 (PC 3364): its shot calls 229, raw 1000 for 40.
    ticks(match, 2);
    expect(f).toMatchObject({
      branch: '237+34',
      age: 3,
      variables: expect.objectContaining({ 12: 10 }),
    });
    expect(shot(match)!.vx).toBeCloseTo(14.992, 3);
    expect(shot(match)!.box).toMatchObject({ damage: 40 });
    for (let tick = 0; tick < 100 && target.hp === LIFE; tick++) match.step();
    expect(target.hp).toBe(LIFE - 40);
    // The shot's hit (235) clears it (PC 3438).
    expect(f.variables[12]).toBe(0);

    const full = exMatch();
    full.match.step({ axe: true, right: true });
    let ticksTaken = 1;
    while (!shot(full.match)) {
      full.match.step({ right: true });
      ticksTaken++;
    }
    // 238 jumps to EX Fire Genkai (239), which recoils at raw −1000 and
    // spawns EFG Ball 240 (PC 3519), raw 1500 for 50.
    expect(ticksTaken).toBe(79);
    expect(full.f).toMatchObject({ branch: '238+30', age: 1 });
    expect(full.f.vx).toBeCloseTo(-14.992, 3);
    const big = shot(full.match)!;
    expect(big).toMatchObject({ clip: 240 });
    expect(big.vx).toBeCloseTo(22.488, 3);
    for (let tick = 0; tick < 100 && full.target.hp === LIFE; tick++)
      full.match.step({ right: true });
    // Response 58 → FBH (112) → 80; the ball explodes in 243.
    expect(full.target).toMatchObject({
      hp: LIFE - 50,
      action: 'launchAway',
      hitStop: 13,
    });
    expect(full.f.power).toBe(13);
    expect(big.clip).toBe(243);
  });

  it("replays the shot's display through the freeze (PC 3390)", () => {
    const { match, f } = exMatch();
    match.fighters[1].x = f.x + 900;
    ticks(match, 20, { axe: true });
    const ball = shot(match)!;
    expect(ball).toMatchObject({ clip: 233, age: 1 });
    match.freeze = 8;
    ticks(match, 2);
    // After its display, global 6 above 0 jumps it back to 234 + 8 with its
    // motion and box cleared, through the first display after the freeze.
    const x = ball.x;
    expect(ball).toMatchObject({ clip: '234+8', age: 0, box: null });
    for (let tick = 0; tick < 8; tick++) {
      match.step();
      expect(ball).toMatchObject({ clip: '234+8', x, box: null });
    }
    // The display after the freeze calls 228 again; motion resumes next tick.
    match.step();
    expect(ball).toMatchObject({ x, box: { damage: 30 } });
    match.step();
    expect(ball.x).toBeCloseTo(x + 11.993, 3);
  });

  it('stands a tick while the shot lives and breaks it on an opposing axe', () => {
    const { match, f } = exMatch();
    match.fighters[1].x = f.x + 1200;
    match.step({ axe: true });
    ticks(match, animationDuration(RYUKO.exFire));
    expect(f.action).toBe('idle');
    match.step({ axe: true });
    // 231's PC 3340 jumps to 225 while slot 6 lives.
    expect(named(f)).toBe('axeBusy');
    expect(shot(match)).toMatchObject({ clip: 233 });
    const versus = new Match();
    versus.fighters[0].variables[0] = 10;
    versus.step({ axe: true }, { axe: true });
    for (let tick = 0; tick < 30 && shot(versus)?.clip !== 235; tick++)
      versus.step();
    // The shot's slot-1 box and the axe's (y + 2000) each reach the other's
    // body: both break, without damage.
    expect(shot(versus)).toMatchObject({ clip: 235, age: 0 });
    expect(axes(versus, 1)).toMatchObject([{ clip: 230, age: 0 }]);
    expect(versus.fighters.map((f) => f.hp)).toEqual([LIFE, LIFE]);
  });

  it.each([
    [1, LIFE, false, 'efs', 0],
    [0, LIFE, false, 'noSuper', 0],
    // Its check of variable 0 (PC 3970) precedes EVIL's of life (PC 3974).
    [1, 147, false, 'efs', 0],
    [2, LIFE, true, 'efsCancel', 0],
    [1, LIFE, true, 'noSuper', 1],
  ] as const)(
    'enters EFS for Getter Beam with %i stocks at %i health (IORI: %s): %s',
    (stock, hp, iori, action, left) => {
      const { match, f, target } = exMatch();
      Object.assign(f, { stock, hp });
      if (iori) {
        target.x = f.x + 150;
        match.step({ iori: true });
        while (!f.contact) match.step();
      }
      match.step({ getterBeam: true });
      // EFS (331) checks variable 6 (PC 4918) for EFS SC (332), which spawns
      // GENGAI! (253) itself.
      expect({ ...f, action: named(f) }).toMatchObject({ action, stock: left });
      expect(match.effects.some((e) => e.clip === 253)).toBe(
        action === 'efsCancel',
      );
    },
  );

  it('keeps the air Getter Beam (263) in EX mode', () => {
    const { match, f } = exMatch();
    Object.assign(f, { stock: 1, action: 'jump', y: -200 });
    match.step({ getterBeam: true });
    expect(named(f)).toBe('airGetterBeam');
  });

  it('fires four EFS Att Balls (336) and the final one (337)', () => {
    const { match, f, target } = exMatch();
    f.stock = 1;
    match.step({ getterBeam: true });
    const losses: [number, string][] = [];
    for (let tick = 0; tick < 300; tick++) {
      const hp = target.hp;
      match.step();
      if (target.hp < hp) losses.push([hp - target.hp, target.action]);
    }
    // Each calls 243 on contact; 51 → FBB (111) → 83, and the final's 58 →
    // FBH (112) → 80.
    expect(losses).toEqual([
      [20, 'hitRapid'],
      [20, 'hitRapid'],
      [20, 'hitRapid'],
      [20, 'hitRapid'],
      [20, 'launchAway'],
    ]);
  });
});

describe('sound cues (op 0x03)', () => {
  it("plays a display's sounds as its script steps in, before the hit test", () => {
    const match = new Match();
    match.fighters[1].x = match.fighters[0].x + 150;
    match.step({ punch: true });
    ticks(match, 6);
    expect(match.sounds).toEqual([]);
    // Punch 1 plays 39 before the display it strikes from (PC 2364); its hit
    // enters 179, and the hit effect 339 plays 31 (PC 5084).
    match.step();
    expect(playing(match.fighters[0])).toBe(RYUKO.punchHit);
    expect(match.sounds).toEqual([
      { owner: 0, index: 39 },
      { owner: 0, index: 31 },
    ]);
    match.step();
    expect(match.sounds).toEqual([]);
  });

  it("skips the heavy hit's voice on its op 0x20 branch (PC 794)", () => {
    const voiced = new Set<boolean>();
    for (let seed = 0; seed < 10; seed++) {
      const match = new Match('practice', false, seed);
      match.fighters[1].x = match.fighters[0].x + 150;
      match.step({ drill: true });
      const target = match.fighters[1];
      for (let tick = 0; tick < 120; tick++) {
        const hp = target.hp;
        match.step();
        // Each drill strike enters 75 afresh.
        if (target.action !== 'hitHeavy' || target.hp === hp) continue;
        // Sound 14 sits between the roll and the branch's target (75 + 16).
        const voice = match.sounds.some((s) => s.owner === 1 && s.index === 14);
        expect(voice).toBe(target.branch === null);
        voiced.add(voice);
      }
    }
    expect(voiced).toEqual(new Set([true, false]));
  });

  it("plays the axe's impact (230, PC 3334) as it breaks", () => {
    const match = new Match();
    ticks(match, 20, { axe: true }, { axe: true });
    expect(axes(match).map((e) => e.clip)).toEqual([230, 230]);
    expect(match.sounds).toEqual([
      { owner: 0, index: 34 },
      { owner: 1, index: 34 },
    ]);
  });
});
