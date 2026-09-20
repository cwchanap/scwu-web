import { describe, expect, it } from 'vitest';
import { FixedClock, Match } from './match';
import type { Input } from './match';
import { ROUND_END_TICKS } from './hud';

function ticks(
  match: Match,
  count: number,
  input: Input = {},
  opponent: Input = {},
) {
  for (let i = 0; i < count; i++) match.step(input, opponent);
}

describe('prototype training rules', () => {
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
    expect(match.fighters[0].action).toBe('crouchPunch');
    ticks(match, 49, { crouch: true });
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
    expect(match.fighters[0].action).toBe('airKick');
    for (let i = 0; i < 100 && match.fighters[0].action !== 'land'; i++)
      match.step();
    expect(match.fighters[0].action).toBe('land');
  });

  it('accepts a crouching attack pressed during the crouch transition', () => {
    const match = new Match();
    match.step({ crouch: true });
    match.step({ crouch: true, kick: true });
    expect(match.fighters[0].action).toBe('crouchKick');
  });

  it('uses crouching guard and plays a block reaction without taking damage', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    ticks(match, 12, { kick: true }, { crouch: true, guard: true });
    expect(match.fighters[1].hp).toBe(100);
    expect(match.fighters[1].action).toBe('crouchBlockHeavy');
    ticks(match, 34, {}, { crouch: true, guard: true });
    expect(match.fighters[1].action).toBe('crouchGuard');
  });

  it('keeps ending animations moving after a KO without advancing combat', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    match.fighters[1].hp = 8;
    ticks(match, 8, { punch: true });
    expect(match.winner).toBe('player');
    expect(match.fighters[0].action).toBe('win');
    expect(match.fighters[1].action).toBe('down');
    const end = match.ticks;
    const age = match.fighters[1].age;
    ticks(match, 100, { kick: true });
    expect(match.ticks).toBe(end);
    expect(match.fighters[1].age).toBe(age + 100);
    expect(match.fighters[1].hp).toBe(0);
    expect(match.resultReady).toBe(false);
    ticks(match, ROUND_END_TICKS - 100);
    expect(match.resultReady).toBe(true);
    expect(match.fighters[1].y).toBe(0);
    const finalAge = match.fighters[1].age;
    ticks(match, 20);
    expect(match.fighters[1].age).toBe(finalAge);
  });

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
    for (let i = 0; i < 8; i++) match.step({}, { punch: true });
    expect(match.fighters[0].action).toBe('airHit');
  });

  it('shows win/loss or draw poses when time expires with both fighters alive', () => {
    for (const hp of [92, 100]) {
      const match = new Match('cpu');
      match.ticks = 5999;
      match.fighters[1].hp = hp;
      match.step({}, {});
      expect(match.fighters.map((f) => f.action)).toEqual(
        hp === 100 ? ['draw', 'draw'] : ['win', 'lose'],
      );
      ticks(match, ROUND_END_TICKS);
      expect(match.resultReady).toBe(true);
    }
  });

  it('moves, clamps to the court, separates bodies, and lands without auto-jumping', () => {
    const match = new Match();
    ticks(match, 500, { left: true });
    expect(match.fighters[0].x).toBe(65);
    ticks(match, 500, { right: true });
    expect(match.fighters[1].x - match.fighters[0].x).toBeGreaterThanOrEqual(
      90,
    );
    match.step({ jump: true });
    ticks(match, 30, { jump: true });
    expect(match.fighters[0].y).toBeLessThan(-100);
    ticks(match, 100, { jump: true });
    expect(match.fighters[0].y).toBe(0);
    expect(match.fighters[0].vy).toBe(0);
  });

  it('requires range, applies one hit per press, and uses attack recovery', () => {
    const match = new Match();
    ticks(match, 40, { punch: true });
    expect(match.fighters[1].hp).toBe(100);
    match.fighters[0].x = 530;
    match.step();
    ticks(match, 100, { punch: true });
    expect(match.fighters[1].hp).toBe(92);
    expect(match.fighters[0].hits).toBe(1);
    expect(match.fighters[0].damage).toBe(8);
  });

  it('blocks damage while guarding and cannot attack during hitstun', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    ticks(match, 15, { kick: true }, { guard: true });
    expect(match.fighters[1].hp).toBe(100);
    expect(match.impact?.blocked).toBe(true);
    ticks(match, 30);
    ticks(match, 8, { punch: true });
    expect(match.fighters[1].action).toBe('hit');
    match.step({}, { kick: true });
    expect(match.fighters[1].action).toBe('hit');
  });

  it('allows simultaneous hits and resolves knockouts without further damage', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    match.fighters.forEach((f) => {
      f.hp = 8;
    });
    ticks(match, 8, { punch: true }, { punch: true });
    expect(match.fighters.map((f) => f.hp)).toEqual([0, 0]);
    expect(match.winner).toBe('draw');
    const end = match.ticks;
    ticks(match, 50, { kick: true });
    expect(match.ticks).toBe(end);
  });

  it('runs a CPU opponent and resolves the 60-second time limit', () => {
    const cpu = new Match('cpu');
    for (let i = 0; i < 500; i++) cpu.step();
    expect(cpu.fighters[0].hp).toBeLessThan(100);
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
