import { describe, expect, it } from 'vitest';
import {
  AXE_RELEASE_TICK,
  THROW_RELEASE_TICK,
  FIGHTER_MARGIN,
  FixedClock,
  Match,
  WIDTH,
} from './match';
import type { Input } from './match';
import { ROUND_END_TICKS } from './hud';
import { animationDuration, animationFrame } from './animations';
import { placement } from './standing';

function ticks(
  match: Match,
  count: number,
  input: Input = {},
  opponent: Input = {},
) {
  for (let i = 0; i < count; i++) match.step(input, opponent);
}

describe('prototype training rules', () => {
  it.each([1, -1] as const)(
    'plays the catching attack before releasing the opponent facing %i',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 550 : 410;
      target.x = facing === 1 ? 660 : 300;
      ticks(match, 8, { throw: true });
      const poses = new Set<number>();
      const sides = new Set<number>();
      for (let tick = 0; tick < 72; tick++) {
        expect(attacker.action).toBe('throw');
        expect(target.action).toBe('grabbed');
        expect(target.hp).toBe(100);
        poses.add(animationFrame('throw', attacker.age).image);
        sides.add(Math.sign(Math.round((target.x - attacker.x) * facing)));
        match.step({ punch: true, jump: true }, { jump: true, dash: true });
      }
      expect(poses).toEqual(new Set([106, 107, 108, 110]));
      expect(sides).toEqual(new Set([-1, 0, 1]));
      expect(target.action).toBe('thrown');
      expect(target.hp).toBe(82);
      expect(attacker.hits).toBe(1);
      expect(animationFrame('throw', attacker.age).image).toBe(111);
    },
  );

  it.each([1, -1] as const)(
    'keeps bodies separated through throw recovery facing %i without a wake-up snap',
    (facing) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = facing === 1 ? 550 : 410;
      target.x = facing === 1 ? 660 : 300;
      ticks(match, 8, { throw: true });
      const seen = new Set<string>();
      for (let tick = 0; tick < 300; tick++) {
        const recovering = ['knockdown', 'getUp'].includes(target.action);
        const previousX = match.fighters.map((f) => f.x);
        match.step(
          target.action === 'getUp'
            ? {}
            : { right: facing === 1, left: facing === -1 },
          {},
        );
        seen.add(target.action);
        if (['knockdown', 'getUp'].includes(target.action))
          expect((target.x - attacker.x) * facing).toBeGreaterThanOrEqual(
            90 - 1e-6,
          );
        if (recovering)
          match.fighters.forEach((f, index) =>
            expect(Math.abs(f.x - previousX[index])).toBeLessThanOrEqual(
              2.8 + 1e-6,
            ),
          );
      }
      expect(seen).toEqual(
        new Set(['grabbed', 'thrown', 'knockdown', 'getUp', 'idle']),
      );
      expect(target.hp).toBe(82);
    },
  );

  it.each([1, -1] as const)(
    'keeps the full held, thrown and recovery sprites inside the court facing %i',
    (facing) => {
      for (const lethal of [false, true]) {
        const match = new Match();
        if (facing === -1) match.fighters.reverse();
        const direction = { right: facing === 1, left: facing === -1 };
        // Reach the actual wall through movement and body separation.
        ticks(match, 500, direction, direction);
        const target = match.fighters[1];
        if (lethal) target.hp = 18;
        for (let tick = 0; tick < 300; tick++) {
          match.step({ throw: tick === 0 }, {});
          if (
            target.action === 'idle' ||
            !['grabbed', 'thrown', 'knockdown', 'getUp'].includes(target.action)
          )
            continue;
          const pose = animationFrame(target.action, target.age);
          // Match the renderer's 1.5x artwork scale and integer placement.
          const p = placement(
            pose,
            pose.width,
            pose.height,
            target.x / 1.5,
            0,
            target.facing === -1,
          );
          expect(p.left * 1.5).toBeGreaterThanOrEqual(0);
          expect((p.left + pose.width) * 1.5).toBeLessThanOrEqual(WIDTH);
        }
        expect(target.hp).toBe(lethal ? 0 : 82);
        expect(target.action).toBe(lethal ? 'knockdown' : 'idle');
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
      expect(attacker.action).toBe('throw');
      expect(target.action).toBe('grabbed');
      expect(target.y).toBeLessThan(0);
      ticks(match, THROW_RELEASE_TICK - 1, {}, { punch: true, jump: true });
      expect(target.hp).toBe(100);
      expect(target.action).toBe('grabbed');
      match.step();
      expect(target.hp).toBe(82);
      expect(target.action).toBe('thrown');
      expect(attacker.hits).toBe(1);
      expect(match.impacts).toMatchObject([
        { blocked: false, heavy: true, facing },
      ]);
      const releaseX = target.x;
      for (let tick = 0; tick < 100 && target.action === 'thrown'; tick++)
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
      expect(target.action).toBe('punch');
      expect(target.hp).toBe(82);
      expect(attacker.hits).toBe(1);
    },
  );

  it('whiffs out of range or against an airborne target without repeating a held throw', () => {
    for (const airborne of [false, true]) {
      const match = new Match();
      if (airborne) match.fighters[0].x = 550;
      ticks(match, 15, {}, { jump: airborne });
      ticks(match, 8, { throw: true });
      expect(match.fighters[0].action).toBe('grab');
      ticks(match, 150, { throw: true });
      expect(match.fighters[0].action).toBe('idle');
      expect(match.fighters[1].hp).toBe(100);
      expect(match.fighters[0].hits).toBe(0);
    }
    const match = new Match();
    ticks(match, 15, { jump: true });
    match.step({ throw: true });
    expect(match.fighters[0].action).toBe('jump');
  });

  it('lets strikes interrupt a grab and makes simultaneous grabs whiff fairly', () => {
    for (const attack of ['punch', 'throw'] as const) {
      const match = new Match();
      match.fighters[0].x = 550;
      ticks(match, 8, { throw: true }, { [attack]: true });
      expect(match.fighters[0].action).toBe(
        attack === 'punch' ? 'hit' : 'grab',
      );
      expect(match.fighters[1].action).not.toBe('grabbed');
      expect(match.fighters[1].hp).toBe(100);
    }
  });

  it.each([0, 20, 65])(
    'releases a grabbed fighter if a projectile interrupts at hold tick %i',
    (age) => {
      const match = new Match();
      const [attacker, target] = match.fighters;
      attacker.x = 550;
      ticks(match, 8 + age, { throw: true });
      match.projectiles.push({
        owner: 1,
        x: attacker.x + 50,
        y: -140,
        facing: -1,
        age: 0,
        hit: false,
      });
      match.step();
      expect(attacker.action).toBe('hitHeavy');
      expect(target.action).toBe('airHit');
      ticks(match, 100);
      expect(target.action).toBe('idle');
      expect(target.y).toBe(0);
      expect(target.hp).toBe(100);
      expect(attacker.hits).toBe(0);
    },
  );

  it('finishes a lethal throw on the floor without getting up', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 550;
    target.hp = 18;
    ticks(match, 8 + THROW_RELEASE_TICK, { throw: true });
    expect(match.winner).toBe('player');
    expect(attacker.action).toBe('throw');
    expect(target.action).toBe('thrown');
    ticks(match, ROUND_END_TICKS);
    expect(target.action).toBe('knockdown');
    expect(target.y).toBe(0);
    expect(attacker.action).toBe('win');
    expect(match.resultReady).toBe(true);
  });

  it('protects the throw recovery from melee and projectile hits', () => {
    const match = new Match();
    const [attacker, target] = match.fighters;
    attacker.x = 550;
    ticks(match, 8 + THROW_RELEASE_TICK, { throw: true });
    for (let tick = 0; tick < 142; tick++) {
      // Keep attacks in range while the victim falls, lies down, and gets up.
      attacker.x = target.x - 100;
      match.projectiles = [
        {
          owner: 0,
          x: target.x,
          y: target.y - 125,
          facing: 1,
          age: 0,
          hit: false,
        },
      ];
      match.step({ punch: tick % 2 === 0 });
      expect(target.hp).toBe(82);
    }
    expect(target.action).toBe('getUp');
    match.projectiles = [];
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
      expect(['thrown', 'knockdown', 'getUp']).toContain(target.action);
      match.ticks = 5999;
      match.step({}, {});
      expect(target.action).not.toBe('lose');
      ticks(match, ROUND_END_TICKS);
      expect(target.action).toBe('lose');
      expect(target.y).toBe(0);
      expect(match.resultReady).toBe(true);
    },
  );

  it('releases a held fighter when time expires and keeps throws inside the court', () => {
    for (const facing of [1, -1]) {
      const match = new Match('cpu');
      const [attacker, target] = match.fighters;
      attacker.x =
        facing === 1 ? WIDTH - FIGHTER_MARGIN - 110 : FIGHTER_MARGIN + 110;
      target.x = facing === 1 ? WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
      ticks(match, 8, { throw: true });
      expect(target.action).toBe('grabbed');
      expect(target.x).toBeGreaterThanOrEqual(FIGHTER_MARGIN);
      expect(target.x).toBeLessThanOrEqual(WIDTH - FIGHTER_MARGIN);
      match.ticks = 5999;
      match.step({}, {});
      expect(match.winner).toBe('draw');
      expect(target.action).not.toBe('grabbed');
      ticks(match, ROUND_END_TICKS);
      expect(target.y).toBe(0);
      expect(target.action).toBe('draw');
      expect(target.hp).toBe(100);
    }
  });

  it('anchors hit and guard effects at contact before knockback, facing the strike', () => {
    for (const facing of [1, -1] as const) {
      for (const blocked of [false, true]) {
        const match = new Match();
        const [attacker, target] = match.fighters;
        attacker.x = facing === 1 ? 530 : 660;
        target.x = facing === 1 ? 660 : 530;
        const contactX = target.x - facing * 42;
        ticks(match, 11, { kick: true }, { guard: blocked });
        expect(match.impacts).toEqual([
          {
            x: contactX,
            y: 491,
            age: 0,
            blocked,
            heavy: true,
            facing,
            effect: blocked ? 'guardSpark' : 'hitSpark',
          },
        ]);
        expect(target.x).not.toBe(contactX + facing * 42);
        const duration = animationDuration(blocked ? 'guardSpark' : 'hitSpark');
        ticks(match, duration - 1);
        expect(match.impacts).toHaveLength(1);
        ticks(match, 1);
        expect(match.impacts).toHaveLength(0);
      }
    }
  });

  it('uses a lower contact for crouching attacks and emits no effect on a whiff', () => {
    const match = new Match();
    ticks(match, 45, { punch: true });
    expect(match.impacts).toHaveLength(0);
    match.fighters[0].x = 530;
    match.step();
    ticks(match, 15, { crouch: true, punch: true });
    expect(match.impacts).toMatchObject([
      { y: 561, heavy: false, effect: 'hitSpark' },
    ]);
  });

  it('keeps both impact animations when hits trade and finishes them after a KO', () => {
    const match = new Match();
    match.fighters[0].x = 530;
    match.fighters.forEach((f) => {
      f.hp = 8;
    });
    ticks(match, 8, { punch: true }, { punch: true });
    expect(match.winner).toBe('draw');
    expect(match.impacts).toMatchObject([
      { x: 618, age: 0, facing: 1, heavy: false },
      { x: 572, age: 0, facing: -1, heavy: false },
    ]);
    ticks(match, 20);
    expect(match.impacts).toHaveLength(2);
    match.step();
    expect(match.impacts).toHaveLength(0);
    expect(new Match().impacts).toHaveLength(0);
  });

  it('uses the same effects for projectile hits and blocks', () => {
    for (const blocked of [false, true]) {
      const match = new Match();
      ticks(match, 40, { axe: true }, { guard: blocked });
      expect(match.impacts).toMatchObject([
        { effect: blocked ? 'guardSpark' : 'hitSpark', heavy: true, y: 496 },
      ]);
      expect(match.fighters[1].hp).toBe(blocked ? 100 : 84);
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
        const action = backwards ? 'backdash' : 'dash';
        const startup = backwards ? 10 : 5;
        expect(f.action).toBe(action);
        ticks(match, startup - 1, input);
        expect(f.x).toBe(start);
        expect(f.y).toBe(0);
        ticks(match, 6, input);
        expect(f.action).toBe(action);
        expect(f.y).toBeLessThan(-10);
        expect((f.x - start) * facing).toBeCloseTo(backwards ? -30 : 54);
        let landed = false;
        for (let i = 0; i < 80; i++) {
          match.step(input, {});
          if (f.action === 'land') {
            landed = true;
            break;
          }
          expect(f.action).toBe(action);
        }
        expect(landed).toBe(true);
        expect(f.y).toBe(0);
        expect(Math.abs(f.x - start)).toBeGreaterThan(150);
        ticks(match, 8, { dash: true });
        expect(f.action).toBe('idle');
      }
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
    'carries the recovered jump arc and takeoff direction %i without air steering',
    (direction) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = direction === -1 ? 775 : direction === 1 ? 185 : 480;
      target.x = direction === -1 ? 185 : 775;
      const start = f.x;
      match.step({
        jump: true,
        left: direction === -1,
        right: direction === 1,
      });
      ticks(match, 8);
      expect(f.x).toBe(start);
      expect(f.action).toBe('jump');
      let apex = 0;
      let flight = 0;
      while (f.action !== 'land' && flight < 100) {
        // Holding the opposite direction cannot steer or stop the jump.
        match.step({ left: direction >= 0, right: direction === -1 });
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
      ticks(match, 3);
      expect(f.x).toBe(start);
      expect(f.y).toBe(height);
      expect(f.vy).toBeCloseTo(direction ? -17.9901 : -19.4893, 3);
      ticks(match, 5);
      expect(f.x - start).toBeCloseTo(direction * 29.9835, 3);
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
      expect(f.x - start).toBe(control === 'dash' ? 60 : 0);
      expect(f.y).toBe(height);
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
        ticks(match, 19);
        match.step(input);
        expect(match.fighters[0].action).toBe(
          direction === facing ? 'dash' : 'backdash',
        );
        const start = match.fighters[0].x;
        ticks(match, 16, input);
        expect((match.fighters[0].x - start) * direction).toBeGreaterThan(25);
      }
    },
  );

  it('requires fresh same-direction taps within 200 ms and clears stale input', () => {
    for (const interruption of [
      'timeout',
      'opposite',
      'both',
      'clear',
      'attack',
    ]) {
      const match = new Match();
      match.step({ right: true });
      if (interruption === 'timeout') ticks(match, 20);
      else if (interruption === 'opposite') match.step({ left: true });
      else if (interruption === 'both') match.step({ left: true, right: true });
      else if (interruption === 'clear') match.clearInput();
      else match.step({ punch: true });
      match.step();
      match.step({ right: true });
      expect(match.fighters[0].action).not.toBe('dash');
    }
    const held = new Match();
    ticks(held, 20, { right: true });
    expect(held.fighters[0].action).toBe('walk');
  });

  it('double-taps for one air dash per flight', () => {
    const match = new Match();
    match.step({ jump: true });
    ticks(match, 25);
    match.step({ left: true });
    match.step();
    match.step({ left: true });
    expect(match.fighters[0].action).toBe('airBackdash');
    ticks(match, animationDuration('airBackdash'));
    match.step({ right: true });
    match.step();
    match.step({ right: true });
    expect(match.fighters[0].action).toBe('jump');
  });

  it('allows one double jump and one air dash per flight and resets both on landing', () => {
    const match = new Match();
    const f = match.fighters[0];
    match.step({ jump: true });
    ticks(match, 15);
    match.step({ jump: true });
    expect(f.action).toBe('doubleJump');
    const pauseHeight = f.y;
    expect(f.vy).toBe(0);
    ticks(match, 2, { jump: true });
    expect(f.y).toBe(pauseHeight);
    match.step();
    expect(f.y).toBe(pauseHeight);
    expect(f.vy).toBeCloseTo(-19.4893, 3);
    match.step({ jump: true });
    expect(f.vy).toBeGreaterThan(-19.4893);
    match.step({ dash: true });
    expect(f.action).toBe('airDash');
    const height = f.y;
    ticks(match, 20);
    expect(f.y).toBe(height);
    ticks(match, animationDuration('airDash') - 20);
    match.step({ dash: true });
    expect(f.action).toBe('jump');
    ticks(match, 150);
    expect(f.y).toBe(0);
    expect(f.doubleJumped).toBe(false);
    expect(f.airDashed).toBe(false);
  });

  it.each([1, -1] as const)(
    'keeps every forward air-dash pose inside the wall facing %i without snapping',
    (facing) => {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = facing === 1 ? WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
      f.x = target.x - facing * 110;
      match.step({ jump: true }, {});
      ticks(match, 32);
      match.step({ dash: true }, {});
      expect(f.action).toBe('airDash');
      expect(f.y).toBeLessThan(-120);
      for (let age = 0; age < animationDuration('airDash'); age++) {
        const pose = animationFrame('airDash', f.age);
        const p = placement(
          pose,
          pose.width,
          pose.height,
          f.x / 1.5,
          0,
          f.facing === -1,
        );
        expect(p.left * 1.5).toBeGreaterThanOrEqual(0);
        expect((p.left + pose.width) * 1.5).toBeLessThanOrEqual(WIDTH);
        const previousX = f.x;
        match.step({}, {});
        expect((f.x - previousX) * facing).toBeGreaterThanOrEqual(0);
        expect(Math.abs(f.x - previousX)).toBeLessThanOrEqual(6);
      }
      expect(f.x).toBe(facing === 1 ? WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN);
    },
  );

  it('queues punch and kick follow-ups on fresh presses, then returns to idle', () => {
    for (const control of ['punch', 'kick'] as const) {
      const match = new Match();
      const f = match.fighters[0];
      match.step({ [control]: true });
      ticks(match, 20);
      match.step({ [control]: true });
      ticks(match, animationDuration(control) - f.age);
      expect(f.action).toBe(`${control}2`);
      ticks(match, 20);
      match.step({ [control]: true });
      ticks(match, animationDuration(`${control}2`) - f.age);
      expect(f.action).toBe(`${control}3`);
      ticks(match, animationDuration(`${control}3`) + 20, { [control]: true });
      expect(f.action).toBe('idle');
    }
  });

  it('plays all three attacks for taps at 0, 200, and 400 ms', () => {
    for (const control of ['punch', 'kick'] as const) {
      const match = new Match();
      const sequence: [number, string][] = [];
      let previous = 'idle';
      for (let tick = 0; tick < 200; tick++) {
        match.step([0, 20, 40].includes(tick) ? { [control]: true } : {}, {});
        const action = match.fighters[0].action;
        if (action !== previous) sequence.push([tick * 10, action]);
        previous = action;
      }
      expect(sequence).toEqual(
        control === 'punch'
          ? [
              [0, 'punch'],
              [270, 'punch2'],
              [780, 'punch3'],
              [1350, 'idle'],
            ]
          : [
              [0, 'kick'],
              [380, 'kick2'],
              [840, 'kick3'],
              [1720, 'idle'],
            ],
      );
    }
  });

  it('accepts early and late follow-ups, then closes the extra 150 ms window', () => {
    for (const [control, age, follows] of [
      ['punch', 6, true],
      ['punch', 30, true],
      ['punch', 41, true],
      ['punch', 42, false],
      ['kick', 6, true],
      ['kick', 45, true],
      ['kick', 52, true],
      ['kick', 53, false],
    ] as const) {
      const match = new Match();
      const f = match.fighters[0];
      match.step({ [control]: true });
      ticks(match, age - 1);
      match.step({ [control]: true });
      if (age < animationDuration(control)) {
        expect(f.nextAttack).toBe(`${control}2`);
        ticks(match, animationDuration(control) - f.age);
      }
      expect(f.action).toBe(follows ? `${control}2` : control);
    }
  });

  it('holds the recovery pose longer without adding active hits or auto-chaining', () => {
    for (const [control, end] of [
      ['punch', 42],
      ['kick', 53],
    ] as const) {
      const match = new Match();
      match.step({ [control]: true });
      ticks(match, animationDuration(control), { [control]: true });
      expect(match.fighters[0].action).toBe(control);
      match.fighters[0].x = 530;
      ticks(match, end - 1 - match.fighters[0].age, { [control]: true });
      expect(match.fighters[0].action).toBe(control);
      expect(match.fighters[1].hp).toBe(100);
      match.step({ [control]: true });
      expect(match.fighters[0].action).toBe('idle');
      ticks(match, 100, { [control]: true });
      expect(match.fighters[0].action).toBe('idle');
      expect(match.fighters[1].hp).toBe(100);
    }
  });

  it('clears a buffered follow-up when the fighter is hit', () => {
    const match = new Match();
    match.step({ punch: true });
    ticks(match, 13);
    match.step({ punch: true });
    expect(match.fighters[0].nextAttack).toBe('punch2');
    match.fighters[0].x = 530;
    ticks(match, 8, {}, { punch: true });
    expect(match.fighters[0].action).toBe('hit');
    expect(match.fighters[0].nextAttack).toBeNull();
    ticks(match, 60);
    expect(match.fighters[0].action).toBe('idle');
  });

  it.each([
    ['punch2', [18, 24, 30], 36, 10],
    ['airKick', [15, 23, 31], 87, 13],
    ['kick3', [15, 21, 27, 33, 39, 45, 51, 57], 82, 17],
  ] as const)(
    'gives %s one contact per strike, with knockback only at the end',
    (action, ages, image, damage) => {
      for (const facing of [1, -1] as const)
        for (const guarded of [false, true]) {
          const match = new Match();
          const [f, target] = match.fighters;
          f.x = facing === 1 ? 420 : 540;
          f.facing = facing;
          target.x = f.x + facing * 140;
          const targetX = target.x;
          f.action = action;
          if (action === 'airKick') {
            f.y = target.y = -80;
            f.vy = target.vy = -8;
          }
          const contacts: number[] = [];
          for (let tick = 0; tick < 120; tick++) {
            match.step({}, { guard: guarded });
            const impact = match.impacts.find((impact) => impact.age === 0);
            if (impact) {
              contacts.push(f.age);
              expect(animationFrame(action, f.age).image).toBe(image);
              expect(impact.blocked).toBe(guarded);
            }
            if (contacts.length < ages.length) expect(target.x).toBe(targetX);
          }
          expect(contacts).toEqual(ages);
          expect(f.hits).toBe(guarded ? 0 : ages.length);
          expect(f.damage).toBe(guarded ? 0 : damage);
          expect(target.hp).toBe(guarded ? 100 : 100 - damage);
          expect(target.x).toBe(targetX + facing * (guarded ? 8 : 22));
        }
    },
  );

  it.each([
    ['punch2', 21, 205, 24],
    ['airKick', 19, 180, 23],
    ['kick3', 18, 225, 21],
  ] as const)(
    'does not hit during the gaps in %s',
    (action, gapAge, range, nextAge) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.action = action;
      target.x = f.x + range + 2;
      if (action === 'airKick') {
        f.y = target.y = -80;
        f.vy = target.vy = -8;
      }
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
        f.action = 'drill';
        f.age = age - 1;
        const start = f.x;
        match.step({ left: facing === 1, right: facing === -1 }, {});
        expect((f.x - start) * facing).toBeCloseTo(displacement, 5);
        expect(f.action).toBe('drill');
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
      expect(f.action).toBe('airDrillSpin');
      ticks(match, 12);
      expect((f.x - startX) * facing).toBeCloseTo(155.914307, 5);
      expect(f.y).toBeLessThan(0);
      match.step();
      expect(f.action).toBe('drillLand');
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
      f.action = 'airDrillSpin';
      target.x = f.x + 150;
      match.step({}, { guard: guarded });
      expect(f.action).toBe('airDrillContact');
      const contact = { x: f.x, y: f.y };
      ticks(match, 7, {}, { guard: guarded });
      expect({ x: f.x, y: f.y }).toEqual(contact);
      ticks(match, 2, {}, { guard: guarded });
      expect(f.x - contact.x).toBeCloseTo(23.986816, 5);
      expect(f.y - contact.y).toBeCloseTo(29.983521, 5);
      const transitionY = f.y;
      match.step({}, { guard: guarded });
      expect(f.y - transitionY).toBeCloseTo(22.48764, 5);
      expect(f.action).toBe('airDrillContact');
      expect(target.hp).toBe(guarded ? 100 : 79);
    },
  );

  it.each([1, -1] as const)(
    'keeps drill movement inside the wall without crossing the opponent facing %i',
    (facing) => {
      for (const airborne of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        target.x = facing === 1 ? WIDTH - FIGHTER_MARGIN : FIGHTER_MARGIN;
        f.x = target.x - facing * 100;
        f.facing = facing;
        f.action = airborne ? 'airDrillSpin' : 'drill';
        if (airborne) f.y = -80;
        for (let tick = 0; tick < 120; tick++) {
          match.step({}, { guard: true });
          expect(f.x).toBeGreaterThanOrEqual(FIGHTER_MARGIN);
          expect(f.x).toBeLessThanOrEqual(WIDTH - FIGHTER_MARGIN);
          expect((target.x - f.x) * facing).toBeGreaterThanOrEqual(90);
        }
        expect(f.action).toBe('idle');
        expect(target.hp).toBe(100);
        const endX = f.x;
        ticks(match, 20);
        expect(f.x).toBe(endX);
      }
    },
  );

  it.each(['drill', 'airDrillSpin'] as const)(
    'stops %s travel when interrupted',
    (action) => {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = f.x + 150;
      f.action = action;
      f.age = action === 'drill' ? 10 : 0;
      if (action === 'airDrillSpin') f.y = -40;
      target.action = 'punch';
      target.age = 6;
      match.step({}, {});
      expect(f.hp).toBe(92);
      expect(f.action).toBe(action === 'drill' ? 'hit' : 'airHit');
      const interruptedX = f.x;
      ticks(match, 120);
      expect(f.x).toBe(interruptedX);
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
          f.action = 'airDrillSpin';
          const damage: number[] = [];
          const contacts: number[] = [];
          for (let tick = 0; tick < 120; tick++) {
            const hp = target.hp;
            match.step({ punch: true, drill: true }, { guard: guarded });
            const impact = match.impacts.find((impact) => impact.age === 0);
            if (impact) {
              contacts.push(tick + 1);
              damage.push(hp - target.hp);
              expect(impact.blocked).toBe(guarded);
              expect(f.action).toBe('airDrillContact');
              expect(animationFrame('airDrillContact', f.age).image).toBe(136);
            }
          }
          expect(contacts).toEqual(height === -40 ? [1] : [1, 11, 21, 31, 41]);
          expect(damage).toEqual(
            guarded
              ? height === -40
                ? [0]
                : [0, 0, 0, 0, 0]
              : height === -40
                ? [16]
                : [16, 5, 3, 1, 1],
          );
          expect(f.hits).toBe(guarded ? 0 : contacts.length);
          expect(f.action).toBe('idle');
          expect(f.y).toBe(0);
        }
    },
  );

  it('holds aerial drill startup, keeps missed spins armed, and recovers only on landing', () => {
    const match = new Match();
    const [f, target] = match.fighters;
    f.y = -200;
    f.action = 'jump';
    match.step({ drill: true }, {});
    const height = f.y;
    ticks(match, 21, { punch: true });
    expect(f.y).toBe(height);
    expect(f.action).toBe('airDrill');
    ticks(match, 7);
    expect(f.action).toBe('airDrillSpin');
    expect(f.hits).toBe(0);
    target.x = f.x + 130;
    match.step();
    expect(target.hp).toBe(84);
    expect(f.action).toBe('airDrillContact');
    for (let i = 0; i < 100 && f.y < 0; i++) match.step();
    expect(f.action).toBe('drillLand');
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
      f.action = 'airDrillSpin';
      target.action = 'airPunch';
      target.age = 17;
      match.step({}, {});
      expect([f.hp, target.hp]).toEqual([92, 84]);
      expect(f.action).toBe('airHit');
      expect(f.airDrillStage).toBe(0);
      ticks(match, 100);
      expect([f.hits, target.hits]).toEqual([1, 1]);
      expect([f.hp, target.hp]).toEqual([92, 84]);
    },
  );

  it.each(['punch2', 'airKick', 'kick3', 'drill', 'airDrillSpin'] as const)(
    'stops %s after a lethal first strike',
    (action) => {
      const match = new Match();
      const [f, target] = match.fighters;
      f.x = 500;
      target.x = 640;
      target.hp = 1;
      f.action = action;
      if (action.startsWith('air')) {
        f.y = target.y = -80;
        f.vy = target.vy = -8;
      }
      ticks(match, 250);
      expect(match.winner).toBe('player');
      expect(f.hits).toBe(1);
      expect(target.hp).toBe(0);
      expect(f.action).toBe('win');
      expect(f.airDrillStage).toBe(0);
    },
  );

  it('lands six drill hits at extended range and uses the aerial drill landing recovery', () => {
    const match = new Match();
    match.fighters[1].x = 570;
    ticks(match, 120, { drill: true });
    expect(match.fighters[1].hp).toBe(82);
    expect(match.fighters[0].hits).toBe(6);
    expect(match.fighters[0].action).toBe('idle');
    match.step({ jump: true });
    ticks(match, 40);
    match.step({ drill: true });
    expect(match.fighters[0].action).toBe('airDrill');
    for (let i = 0; i < 100 && match.fighters[0].action !== 'drillLand'; i++)
      match.step();
    expect(match.fighters[0].action).toBe('drillLand');
    ticks(match, animationDuration('drillLand'));
    expect(match.fighters[0].action).toBe('idle');
  });

  it.each([1, -1] as const)(
    'times six drill contacts to the spin poses, blocks all six, and knocks back only on the finisher facing %i',
    (facing) => {
      for (const guarded of [false, true]) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? FIGHTER_MARGIN : WIDTH - FIGHTER_MARGIN;
        target.x = f.x + facing * 270;
        const targetX = target.x;
        const contacts: number[] = [];
        match.step({ drill: true }, { guard: guarded });
        for (let tick = 0; tick < 120; tick++) {
          match.step({ drill: true }, { guard: guarded });
          const impact = match.impacts.find((impact) => impact.age === 0);
          if (impact) {
            contacts.push(f.age);
            expect(animationFrame('drill', f.age).image).toBe(121);
            expect(impact.blocked).toBe(guarded);
            expect(impact.heavy).toBe(contacts.length === 6);
            // The lunge pushes bodies together. Only the final strike adds
            // attack knockback beyond the normal 90px body separation.
            if (contacts.length === 1) expect(target.x).toBe(targetX);
            else
              expect((target.x - f.x) * facing).toBeCloseTo(
                contacts.length === 6 ? (guarded ? 98 : 112) : 90,
              );
          }
        }
        expect(contacts).toEqual([23, 29, 35, 41, 47, 53]);
        expect(
          (f.x - (facing === 1 ? FIGHTER_MARGIN : WIDTH - FIGHTER_MARGIN)) *
            facing,
        ).toBeGreaterThan(400);
        expect(target.hp).toBe(guarded ? 100 : 82);
        expect(f.hits).toBe(guarded ? 0 : 6);
        expect(f.damage).toBe(guarded ? 0 : 18);
        expect(f.action).toBe('idle');
      }
    },
  );

  it.each([1, -1] as const)(
    'makes aerial drill miss across a gap but hit or block on visible contact facing %i',
    (facing) => {
      for (const [distance, guarded, hp, hits] of [
        [228, false, 100, 0],
        [180, false, 84, 1],
        [180, true, 100, 0],
      ] as const) {
        const match = new Match();
        const [f, target] = match.fighters;
        f.x = facing === 1 ? 432 : 528;
        target.x = f.x + facing * distance;
        const targetX = target.x;
        match.step({ jump: true }, {});
        ticks(match, 9);
        match.step({ drill: true }, { guard: guarded });
        for (let tick = 0; tick < 100; tick++) {
          match.step({}, { guard: guarded });
          if (match.impacts.some((impact) => impact.age === 0)) {
            expect(f.action).toBe('airDrillContact');
            expect(animationFrame('airDrillContact', f.age).image).toBe(136);
            expect(match.impacts[0].blocked).toBe(guarded);
          }
        }
        expect(target.hp).toBe(hp);
        expect(f.hits).toBe(hits);
        expect(target.x).toBe(targetX);
        expect(f.action).toBe('idle');
      }
    },
  );

  it('releases an axe at the throw pose, travels in either direction, and hits only once', () => {
    for (const facing of [1, -1]) {
      const match = new Match();
      if (facing === -1) match.fighters.reverse();
      ticks(match, AXE_RELEASE_TICK, { axe: true });
      expect(match.projectiles).toHaveLength(0);
      match.step({ axe: true });
      expect(match.projectiles).toMatchObject([{ age: 0, facing, hit: false }]);
      expect(match.fighters[1].hp).toBe(100);
      ticks(match, 100, { axe: true });
      expect(match.fighters[1].hp).toBe(84);
      expect(match.fighters[0].hits).toBe(1);
      expect(match.projectiles).toHaveLength(0);
    }
  });

  it('blocks an axe, permits jumping over it, and expires missed projectiles', () => {
    const match = new Match();
    ticks(match, 100, { axe: true }, { guard: true });
    expect(match.fighters[1].hp).toBe(100);
    expect(match.fighters[0].hits).toBe(0);
    const airborne = new Match();
    ticks(airborne, 57, { axe: true }, { jump: true });
    expect(airborne.fighters[1].hp).toBe(100);
    ticks(airborne, 180);
    expect(airborne.projectiles).toHaveLength(0);
  });

  it('limits active axes and cancels a throw interrupted before release', () => {
    const match = new Match();
    match.fighters[0].x = FIGHTER_MARGIN;
    match.fighters[1].x = WIDTH - FIGHTER_MARGIN;
    match.step({ axe: true });
    ticks(match, animationDuration('axeThrow'));
    match.step({ axe: true });
    expect(match.fighters[0].action).toBe('idle');
    expect(match.projectiles).toHaveLength(1);
    const interrupted = new Match();
    interrupted.fighters[0].x = 530;
    ticks(interrupted, 8, { axe: true }, { punch: true });
    expect(interrupted.fighters[0].action).toBe('hit');
    ticks(interrupted, 60, { axe: true });
    expect(interrupted.projectiles).toHaveLength(0);
  });

  it('lets axes trade and clears projectiles when the round ends', () => {
    const match = new Match();
    match.fighters.forEach((f) => {
      f.hp = 16;
    });
    ticks(match, 100, { axe: true }, { axe: true });
    expect(match.winner).toBe('draw');
    expect(match.fighters.map((f) => f.hp)).toEqual([0, 0]);
    expect(match.projectiles).toHaveLength(0);
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

  it.each(['melee', 'projectile'] as const)(
    'lands before celebrating an airborne %s KO',
    (attack) => {
      const match = new Match();
      const [player, target] = match.fighters;
      player.x = attack === 'melee' ? 530 : FIGHTER_MARGIN;
      target.x = attack === 'melee' ? 660 : 792;
      target.hp = 8;
      for (let tick = 0; tick < 100 && !match.winner; tick++) {
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
      expect(player.action).toBe(attack === 'melee' ? 'airPunch' : 'jump');
      const end = match.ticks;
      const airAge = player.airAge;
      for (let tick = 0; tick < 100 && player.y < 0; tick++) {
        expect(player.action).not.toBe('win');
        match.step({ jump: true, punch: true });
      }
      expect(player.airAge).toBeGreaterThan(airAge);
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

  it.each([92, 100])('lands before timeout poses with opponent HP %i', (hp) => {
    const match = new Match('cpu');
    match.step({ jump: true }, { jump: true });
    ticks(match, 20);
    match.fighters[1].hp = hp;
    match.ticks = 5999;
    match.step({}, {});
    expect(match.fighters.map((f) => f.action)).toEqual(['jump', 'jump']);
    for (let tick = 0; tick < 100 && match.fighters[0].y < 0; tick++)
      match.step();
    expect(match.fighters.map((f) => f.action)).toEqual(['land', 'land']);
    ticks(match, animationDuration('land'));
    expect(match.fighters.map((f) => f.action)).toEqual(
      hp === 100 ? ['draw', 'draw'] : ['win', 'lose'],
    );
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
    ticks(match, 43); // Return to ground-attack height on the descending arc.
    for (let i = 0; i < 8; i++) match.step({}, { punch: true });
    expect(match.fighters[0].action).toBe('airHit');
  });

  it.each([
    ['punch', false, 'airHit', 'hit'],
    ['kick', false, 'airHitHeavy', 'hitHeavy'],
    ['punch', true, 'airBlock', 'block'],
    ['kick', true, 'airBlockHeavy', 'blockHeavy'],
  ] as const)(
    'preserves recovery after landing from %s with guard=%s',
    (attack, guard, airReaction, groundReaction) => {
      const match = new Match();
      const player = match.fighters[0];
      player.x = 530;
      for (let tick = 0; tick <= 66; tick++)
        match.step(
          { jump: tick === 0, guard: guard && tick > 0 },
          { [attack]: tick === (attack === 'punch' ? 59 : 56) },
        );
      expect(player.action).toBe(airReaction);
      expect(player.y).toBeLessThan(0);
      const duration = animationDuration(airReaction);
      ticks(match, 2);
      expect(player.y).toBe(0);
      expect(player.action).toBe(groundReaction);
      const x = player.x;
      ticks(match, duration - 4, {
        right: true,
        punch: true,
        jump: true,
        dash: true,
        drill: true,
      });
      match.step();
      expect(player.action).toBe(groundReaction);
      expect(player.x).toBe(x);
      expect(player.y).toBe(0);
      match.step({ punch: true });
      expect(player.action).toBe('punch');
    },
  );

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
    expect(match.fighters[0].x).toBe(FIGHTER_MARGIN);
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
    ticks(match, 45, { punch: true });
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
    expect(match.impacts.at(-1)?.blocked).toBe(true);
    ticks(match, 40);
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
