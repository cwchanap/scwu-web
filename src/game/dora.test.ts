import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  desperationOf,
  lifeOf,
  perStockOf,
  responsesOf,
  SEAT_GATES,
  stocksOf,
} from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  hurtboxes,
  pushboxes,
  script,
} from './animations';
import { bossBrAnotherStory, brAnotherStages } from './br-another';
import { faceImage, gaugeCrop } from './hud';
import { addPower, fighterPose, firstStrike, Match } from './match';
import type { Effect, Fighter, Input } from './match';
import { CharacterSelect, StoryDemo } from './select';
import type { Demo } from './select';
import { StandingVM } from './standing';
import { Story, scenarioOf } from './story';
import type { Battle } from './story';
import { base, enter, spawn, strike } from './testing';

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
// Each input held from its tick until the next one's.
const holding = (keys: Record<number, Input>) => (t: number) => {
  let input: Input = {};
  for (const [at, key] of Object.entries(keys)) if (+at <= t) input = key;
  return input;
};

describe('DoraEmon (46 B6.PLAYER)', () => {
  it('starts with 600 life and five stocks of 90 power', () => {
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

  it('keeps J for throws, K and ↘G for the launch', () => {
    expect(byKey({ throw: true }).mine).toEqual([234, 235, 'idle']);
    expect(byKey({ hitUp: true }).mine).toEqual([231, 232, 'idle']);
    expect(byKey({ punch: true, right: true, crouch: true }).mine).toEqual([
      231,
      232,
      'idle',
    ]);
  });

  it.each([false, true])(
    'takes Hug as G G → H G — his LP LP → LK HP, the last press neutral (forward held through the kick: %s)',
    (holdForward) => {
      const { dora, other, steps } = doraPlayer(90);
      dora.stock = 3;
      steps({}, 2);
      steps({ punch: true });
      steps({}, 5);
      steps({ punch: true });
      steps({}, 5);
      steps({ right: true }, 6);
      steps({ kick: true, right: holdForward });
      steps({ right: holdForward }, 5);
      steps({ punch: true });
      // The final press may land during the normal attack's contact pause.
      for (let t = 0; t < 100 && dora.branch !== 347; t++)
        steps({ punch: true });
      expect(dora.branch).toBe(347);
      expect(dora.stock).toBe(0);
      const before = other.hp;
      steps({}, 700);
      expect(before - other.hp).toBe(270);
      expect(dora.stock).toBe(0);
    },
  );

  it('ends Hug on a press holding the source’s E — G or J — and needs three stocks', () => {
    const hug = (last: Input, stock: number) =>
      play(
        presses({
          0: { punch: true },
          6: { punch: true },
          12: { right: true },
          18: { kick: true },
          24: last,
        }),
        { gap: 90, stock },
      );
    expect(hug({ punch: true }, 3).mine).toContain(347);
    // J's chuck pair holds E too; K's HK pair does not.
    expect(hug({ throw: true }, 3).mine).toContain(347);
    expect(hug({ hitUp: true }, 3).stock).toBe(3);
    expect(hug({ punch: true }, 2).mine).toContain(290);
  });

  it('spends FK stocks only at its casting flash, keeping them if interrupted', () => {
    const start = () => {
      const state = doraPlayer(300);
      state.dora.stock = 3;
      state.steps({}, 2);
      state.steps({ command: 2 });
      return state;
    };
    const { dora, steps } = start();
    expect(dora.branch).toBe(356);
    expect(dora.stock).toBe(3);
    while (dora.age < 75) steps({});
    steps({});
    expect(dora.variables[14]).toBe(100);
    expect(dora.stock).toBe(0);
    steps({}, 300);
    expect(dora.stock).toBe(0);

    const interrupted = start();
    interrupted.other.x = interrupted.dora.x + 50;
    for (let t = 0; t < 20; t++)
      interrupted.match.step({}, t === 0 ? { punch: true } : {});
    expect(interrupted.dora.hp).toBeLessThan(600);
    expect(interrupted.dora.stock).toBe(3);
    expect(interrupted.dora.branch).not.toBe(356);
    expect(byKey({ command: 2 }, { stock: 2 }).mine).toEqual([290, 'idle']);
  });

  it.each([296, 305])('cannot be hit during one-stock super %i', (action) => {
    const key = (
      {
        296: 'getterBeam',
        305: 'musashi',
      } as const
    )[action as 296 | 305];
    const { match, dora, other, steps } = doraPlayer(90);
    dora.stock = 1;
    steps({}, 2);
    steps({ [key]: true });
    expect(dora.stock).toBe(0);
    for (
      let t = 0;
      t < 800 &&
      dora.action === 'script' &&
      dora.branch !== 270 &&
      dora.branch !== '305+46';
      t++
    ) {
      expect(hurtboxes(dora.branch!, dora.age, 'dora')).toEqual([]);
      other.x = dora.x + 50;
      match.step({}, { punch: t % 60 === 0 });
      expect(dora.hp).toBe(600);
    }
    // The shared landing recoveries (270; 305+46, which 356 lands through
    // too) end casting and can be hit.
    steps({}, 30);
    expect(dora.action).toBe('idle');
  });

  it.each([90, 1000])(
    'keeps Twin Hammer invincible through its cast (gap %i)',
    (gap) => {
      const { match, dora, steps } = doraPlayer(gap);
      steps({}, 2);
      steps({ crouch: true }, 6);
      steps({ crouch: true, left: true }, 6);
      steps({ left: true }, 6);
      match.step({ punch: true }, { punch: true });
      expect(dora.branch).toBe(252);
      const entered = new Set();
      let open = 0;
      for (let t = 0; t < 1000 && dora.action === 'script'; t++) {
        entered.add(dora.branch);
        const bodies = hurtboxes(dora.branch!, dora.age, 'dora');
        // The follow-up (254) swings no hammer: it is open to strikes now.
        if (base(dora.branch) === 254) open += bodies.length;
        else expect(bodies).toEqual([]);
        match.step({}, {});
        expect(dora.hp).toBe(lifeOf('dora'));
      }
      expect(entered.has(254)).toBe(gap === 90);
      if (gap === 90) expect(open).toBeGreaterThan(0);
      expect(dora.action).toBe('idle');
      expect(hurtboxes('idle', dora.age, 'dora').length).toBeGreaterThan(0);
    },
  );

  it.each([250, 252])(
    'protects every Twin Hammer swing frame of action %i without losing its pushbox',
    (action) => {
      for (const frame of script(action, 'dora').frames)
        expect(hurtboxes(action, frame.t, 'dora')).toEqual([]);
      expect(pushboxes(action, 0, 'dora').length).toBeGreaterThan(0);
    },
  );

  it('lets the Twin Hammer follow-up 254 be struck, its pushbox kept', () => {
    expect(pushboxes(254, 0, 'dora').length).toBeGreaterThan(0);
    expect(
      script(254, 'dora').frames.some(
        (frame) => hurtboxes(254, frame.t, 'dora').length,
      ),
    ).toBe(true);
    const { match, dora, other } = doraPlayer();
    enter(match, dora, 254);
    strike(match, other, 246);
    other.x = dora.x + firstStrike('ryuko', 246, 'dora').reach - 15;
    other.facing = -1;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('spends a stock on COUNTER HIT from a block on K alone', () => {
    const { match, dora } = doraPlayer(90);
    dora.stock = 2;
    const seen: unknown[] = [];
    for (let t = 0; t < 500 && dora.branch !== 197; t++) {
      const input: Input = { left: true };
      // The guard reaction's checks (172's at ages 0, 8 and 18) take a
      // fresh B+C press — K alone — inside their window.
      if (dora.action === 'block' && dora.age >= 3 && dora.age <= 6)
        input.hitUp = true;
      match.step(input, { punch: t % 60 === 0 });
      const now = dora.action === 'script' ? dora.branch : dora.action;
      if (seen.at(-1) !== now) seen.push(now);
    }
    expect(seen).toEqual(['backwalk', 'block', 197]);
    expect(dora.stock).toBe(1);
  });

  it.each([
    { punch: true, kick: true }, // the old two-key pair, G with H
    { kick: true }, // H alone
    { punch: true }, // G alone
    { throw: true }, // J alone
    { ex: true }, // E alone
  ])('takes no counter from %s', (keys) => {
    const { match, dora } = doraPlayer(90);
    dora.stock = 2;
    for (let t = 0; t < 500 && dora.branch !== 197; t++) {
      const input: Input = { left: true };
      if (dora.action === 'block' && dora.age >= 3 && dora.age <= 6)
        Object.assign(input, keys);
      match.step(input, { punch: t % 60 === 0 });
    }
    expect(dora.branch).not.toBe(197);
    expect(dora.stock).toBe(2);
  });

  it('takes no counter with no stock', () => {
    const { match, dora } = doraPlayer(90);
    dora.stock = 0;
    dora.maxStock = 0;
    for (let t = 0; t < 500 && dora.branch !== 197; t++) {
      const input: Input = { left: true };
      if (dora.action === 'block' && dora.age >= 3 && dora.age <= 6)
        input.hitUp = true;
      match.step(input, { punch: t % 60 === 0 });
    }
    expect(dora.branch).not.toBe(197);
    expect(dora.stock).toBe(0);
  });

  it('retimes only his own ground counter commands — K alone, B+C (0x2060)', () => {
    for (const index of [172, 174, 177, 179, 182, 184, 186, 188, 191, 193]) {
      const commands = script(index, 'dora').events.filter(
        (e) => e.op === 'command',
      );
      expect(commands.length, String(index)).toBeGreaterThan(0);
      for (const event of commands)
        if (event.op === 'command') {
          expect(event.steps).toEqual([0x2060]);
          expect(event.action).toBe(197);
          expect(event.window).toBeGreaterThanOrEqual(10);
        }
    }
    // Everyone else's keep theirs: Ryuko's guard reactions take a fresh
    // Hit Up (0x2020) as before.
    for (const event of script(149, 'ryuko').events)
      if (event.op === 'command') expect(event.steps).toEqual([0x2020]);
  });

  it('spends a stock on COUNTER HIT from a heavy ground block on K alone', () => {
    const { match, dora } = doraPlayer(90);
    dora.stock = 2;
    enter(match, dora, 177);
    dora.action = 'blockHeavy';
    dora.hitStop = 0;
    dora.age = 2;
    match.step({ left: true, hitUp: true }, {});
    expect(dora).toMatchObject({ action: 'script', branch: 197, stock: 1 });
  });

  it.each([327, 328, 332] as const)(
    'shadows each damaging punch of %i until the punch slot closes or reopens',
    (index) => {
      const events = script(index, 'dora').events.filter((e) => e.op === 'box');
      const slot0 = events.filter((e) => e.op === 'box' && e.slot === 0);
      const punches = slot0.filter((e) => e.op === 'box' && e.damage > 0);
      expect(punches.length).toBeGreaterThan(0);
      const guards = events.filter(
        (e) => e.op === 'box' && e.slot === 1 && e.w > 0,
      );
      expect(guards.map((e) => e.t)).toEqual(punches.map((e) => e.t));
      for (const [i, guard] of guards.entries()) {
        const punch = punches[i];
        if (guard.op !== 'box' || punch.op !== 'box') continue;
        expect([guard.x, guard.y, guard.w, guard.h]).toEqual([
          punch.x,
          punch.y,
          punch.w,
          punch.h,
        ]);
        expect([guard.kind, guard.damage]).toEqual([0x103, 0]);
      }
      const expectedCloses = slot0.flatMap((e, i) => {
        const next = slot0[i + 1];
        return e.op === 'box' &&
          e.damage > 0 &&
          next?.op === 'box' &&
          !next.damage
          ? [next.t]
          : [];
      });
      expect(
        events
          .filter((e) => e.op === 'box' && e.slot === 1 && !e.w)
          .map((e) => e.t),
      ).toEqual(expectedCloses);
    },
  );

  it.each([false, true])(
    'does not super-cancel Fists after its kind-6 punches meet guard %s',
    (guard) => {
      const { match, dora, other } = doraPlayer(180);
      const defense = guard ? { right: true } : {};
      dora.stock = 5;
      match.step({ changeAttack: true }, defense);
      expect(dora.branch).toBe(327);
      let blocked = false;
      for (let t = 0; t < 2000 && dora.branch === 327 && dora.age < 188; t++) {
        other.x = dora.x + 180;
        match.step({}, defense);
        blocked ||= other.action === 'timeStopGuard';
      }
      expect([dora.branch, dora.age]).toEqual([327, 188]);
      expect(dora.hits > 0).toBe(!guard);
      expect(blocked).toBe(guard);
      expect(dora.contact).toBe(0);
      match.step({ blackRush: true }, defense);
      expect([dora.branch, dora.stock, dora.contact]).toEqual([327, 4, 0]);
    },
  );

  it.each([false, true])(
    'still super-cancels a real normal punch after %s guard',
    (guard) => {
      const { match, dora, other } = doraPlayer(120);
      dora.stock = 5;
      const defense = guard ? { right: true } : {};
      match.step({ punch: true }, defense);
      expect(dora.branch).toBe(203);
      for (let t = 0; t < 100 && dora.contact !== 2; t++)
        match.step({}, defense);
      expect(dora.contact).toBe(2);
      expect(dora.hits > 0).toBe(!guard);
      match.step({ blackRush: true }, defense);
      for (let t = 0; t < 100 && dora.branch === 203; t++)
        match.step({}, defense);
      expect(dora.branch).toBe(338);
      expect(dora.stock).toBe(4);
      expect(other.hp < lifeOf('ryuko')).toBe(!guard);
    },
  );

  it.each([0, 1])(
    'cancels a strike that meets a Fists punch, DoraEmon as holder %i, then re-arms',
    (seat) => {
      const match = new Match(
        'practice',
        false,
        3,
        seat ? ['ryuko', 'dora'] : ['dora', 'ryuko'],
      );
      const dora = match.fighters[seat];
      const other = match.fighters[1 - seat];
      dora.stock = 5;
      enter(match, dora, 327, 21);
      strike(match, other, 246);
      other.x = dora.x + 240;
      other.facing = -1;
      dora.facing = 1;
      // The super's cast flash stops both; let the punch tick run free.
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
      // Both sides lose every box at once: nobody is hit, no clash handler
      // is queued, and his script runs on into the next punch at 28.
      expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
      expect(dora.box).toBeNull();
      expect(dora.boxes.every((b) => !b)).toBe(true);
      expect(other.box).toBeNull();
      expect(dora.pending).toBeNull();
      expect(other.pending).toBeNull();
      expect(dora.action).toBe('script');
      for (const punch of [28, 34]) {
        for (let t = 0; t < 6 && dora.age < punch - 1; t++) match.step({}, {});
        expect(dora.age).toBe(punch - 1);
        expect(dora.branch).toBe(327);
        strike(match, other, 246);
        other.x = dora.x + 240;
        other.facing = -1;
        match.step({}, {});
        expect(dora.age).toBe(punch);
        expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
        expect(dora.box).toBeNull();
        expect(dora.boxes.every((b) => !b)).toBe(true);
        expect(other.box).toBeNull();
        expect(other.boxes.every((b) => !b)).toBe(true);
        expect(dora.pending).toBeNull();
        expect(other.pending).toBeNull();
        expect(dora.action).toBe('script');
      }
    },
  );

  it.each([21, 99, 177])(
    'cancels a strike at the first and later punch ticks (%i)',
    (age) => {
      const { match, dora, other } = doraPlayer();
      dora.stock = 5;
      enter(match, dora, 327, age);
      strike(match, other, 246);
      other.x = dora.x + 240;
      other.facing = -1;
      dora.facing = 1;
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
      expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
      expect(dora.action).toBe('script');
      expect(dora.pending).toBeNull();
    },
  );

  it('lets a strike through in the gap between punches', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 327, 24);
    strike(match, other, 246);
    other.x = dora.x + 240;
    other.facing = -1;
    dora.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('lets a strike that misses the fist box through during a punch', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 327, 21);
    strike(match, other, 246);
    // From behind: his punch box never meets the forward guard's, while
    // the punch pose's body still reaches back this far.
    other.x = dora.x - 180;
    other.facing = 1;
    dora.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('gives every Fists follow-up 332 pose a hurtbox without changing its pushboxes', () => {
    for (const frame of script(332, 'dora').frames) {
      expect(hurtboxes(332, frame.t, 'dora').length).toBeGreaterThan(0);
      expect(pushboxes(332, frame.t, 'dora')).toEqual(
        frame.t < 94
          ? []
          : [{ x: -2, y: -87, w: 30, h: 100, kind: 3, taken: 120 }],
      );
    }
    expect(hurtboxes(332, 0, 'dora')).toEqual([
      { x: -6, y: -87, w: 30, h: 99, kind: 2, taken: 120 },
      { x: 49, y: -98, w: 41, h: 92, kind: 2, taken: 120 },
    ]);
    expect(hurtboxes(332, 94, 'dora')).toEqual([
      { x: -2, y: -87, w: 30, h: 100, kind: 3, taken: 120 },
      { x: 51, y: -79, w: 46, h: 73, kind: 2, taken: 120 },
    ]);
    expect(hurtboxes(332, 99, 'dora')).toEqual([
      { x: -2, y: -87, w: 30, h: 100, kind: 3, taken: 120 },
      { x: 42, y: -123, w: 32, h: 119, kind: 2, taken: 120 },
    ]);
  });

  it.each([1, 34, 94, 99, 100, 112, 131])(
    'lets a rear strike bypass Fists follow-up 332 at age %i',
    (age) => {
      const { match, dora, other } = doraPlayer();
      enter(match, dora, 332, age - 1);
      strike(match, other, 246);
      other.x = dora.x - 210;
      other.facing = 1;
      dora.facing = 1;
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
      expect(dora.age).toBe(age);
      if (age === 99 || age === 100)
        expect(dora.boxes[1]).toMatchObject({ kind: 0x103 });
      if (age === 112) expect(dora.boxes[1] ?? null).toBeNull();
      expect(dora.hp).toBeLessThan(lifeOf('dora'));
    },
  );

  it.each([
    [327, 202],
    [327, 230],
    [328, 192],
    [328, 220],
    [332, 105],
  ] as const)(
    'keeps Fists guard active past the opening tick of %i at age %i',
    (index, age) => {
      const { match, dora, other } = doraPlayer();
      dora.stock = 5;
      enter(match, dora, index, age - 1);
      strike(match, other, 246);
      other.x = dora.x + 180;
      other.facing = -1;
      dora.facing = 1;
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
      expect(dora.age).toBe(age);
      expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
      expect(dora.box).toBeNull();
      expect(dora.boxes.every((b) => !b)).toBe(true);
      expect(other.box).toBeNull();
    },
  );

  it('does not let rearm() reset connected on Fists uppercut via the 0x103 guard box', () => {
    const { match, dora, other } = doraPlayer();
    enter(match, dora, 332, 98);
    other.x = dora.x + 120;
    other.facing = -1;
    dora.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect(dora.age).toBe(99);
    const afterFirstHit = other.hp;
    expect(afterFirstHit).toBeLessThan(lifeOf('ryuko'));
    expect(dora.connected).toBe(true);
    // Frames 101, 103, 105, 107 run while the 0x103 guard box is still active;
    // the single-hit kind-0x4 uppercut must stay connected and hit only once.
    for (let t = 0; t < 15; t++) {
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
    }
    expect(other.hp).toBe(afterFirstHit);
  });

  it.each([0, 1])(
    'does not strip a zero-damage opponent clash box via Fists guard, holder %i',
    (seat) => {
      const match = new Match(
        'practice',
        false,
        3,
        seat ? ['ttro', 'dora'] : ['dora', 'ttro'],
      );
      const dora = match.fighters[seat];
      const ttro = match.fighters[1 - seat];
      dora.stock = 5;
      enter(match, dora, 327, 21);
      enter(match, ttro, 166, 2);
      ttro.x = dora.x + 160;
      ttro.facing = -1;
      dora.facing = 1;
      dora.hitStop = 0;
      ttro.hitStop = 0;
      match.step({}, {});
      // TTRO's slot-5 clash handler 167 must still trigger against Dora's punch.
      expect(ttro.pending).toEqual({ key: 167 });
      expect(dora.box).toBeNull();
      expect(ttro.box).toBeNull();
    },
  );

  it('marks the story HUD enemy when Fists guard clashes on seat 0', () => {
    const first = scenarioOf('ryuko')[0] as Battle;
    const foe = { ...first.slots[0]!, player: 0, delay: 0, watch: 0 };
    const match = Match.story('dora', {
      ...first,
      slots: [
        { ...foe, x: 900 },
        { ...foe, x: 540 },
      ],
    });
    const [dora, , other] = match.fighters;
    expect(match.enemy).toBe(-1);
    dora.stock = 5;
    enter(match, dora, 327, 21);
    strike(match, other, 246);
    other.x = dora.x + 240;
    other.facing = -1;
    dora.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
    expect(match.enemy).toBe(2);
    expect((match as unknown as { enemyTicks: number }).enemyTicks).toBe(1000);
  });

  it('cancels projectiles on Fists guard while running projectile onClash handlers', () => {
    const match = new Match('practice', false, 3, ['dora', 'kiki']);
    const [dora] = match.fighters;
    dora.stock = 5;
    enter(match, dora, 327, 21);
    dora.facing = 1;
    dora.hitStop = 0;
    const potato = spawn(match, 1, 189, {
      x: dora.x + 150,
      y: -130,
      facing: -1,
    });
    match.step({}, {});
    // Kiki's potato runs its slot-5 clash handler (194) and loses its boxes,
    // while Dora keeps continuing Fists with no handler queued.
    expect(dora.hp).toBe(lifeOf('dora'));
    expect(dora.pending).toBeNull();
    expect(dora.action).toBe('script');
    expect(potato.box).toBeNull();
    expect(potato.boxes.every((b) => !b)).toBe(true);
    expect(potato.pending).toBe(194);
    match.step({}, {});
    expect(potato.clip).toBe(194);
  });

  it.each([0, 1])(
    'strips both holders without handlers when Fists follow-up 332 uppercut clashes, holder %i',
    (seat) => {
      const match = new Match(
        'practice',
        false,
        3,
        seat ? ['ryuko', 'dora'] : ['dora', 'ryuko'],
      );
      const dora = match.fighters[seat];
      const other = match.fighters[1 - seat];
      enter(match, dora, 332, 98);
      strike(match, other, 246);
      other.x = dora.x + 180;
      other.facing = -1;
      dora.facing = 1;
      dora.onClash = 225;
      other.onClash = 247;
      dora.hitStop = 0;
      other.hitStop = 0;
      match.step({}, {});
      expect(dora.age).toBe(99);
      expect([dora.hp, other.hp]).toEqual([lifeOf('dora'), lifeOf('ryuko')]);
      for (const f of [dora, other]) {
        expect(f.box).toBeNull();
        expect(f.boxes.every((b) => !b)).toBe(true);
        expect(f.pending).toBeNull();
      }
      strike(match, other, 246);
      other.x = dora.x + 180;
      other.facing = -1;
      match.step({}, {});
      expect(dora.age).toBe(100);
      expect(dora.boxes[1] ?? null).toBeNull();
      expect(dora.hp).toBeLessThan(lifeOf('dora'));
      // On a fresh uppercut without a prior clash, age 100 still guards.
      const fresh = doraPlayer();
      enter(fresh.match, fresh.dora, 332, 99);
      strike(fresh.match, fresh.other, 246);
      fresh.other.x = fresh.dora.x + 180;
      fresh.other.facing = -1;
      fresh.dora.facing = 1;
      fresh.dora.hitStop = 0;
      fresh.other.hitStop = 0;
      fresh.match.step({}, {});
      expect(fresh.dora.age).toBe(100);
      expect(fresh.dora.hp).toBe(lifeOf('dora'));
    },
  );

  it('enters the vulnerable Fists follow-up 332 through the dash hit handler', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 327, 198);
    other.x = dora.x + 180;
    other.facing = -1;
    dora.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect(other.hp).toBeLessThan(lifeOf('ryuko'));
    expect(dora.pending).toEqual({ key: 332 });
    match.step({}, {});
    expect(dora.branch).toBe(332);
    expect(hurtboxes(332, dora.age, 'dora').length).toBeGreaterThan(0);
    strike(match, other, 246);
    other.x = dora.x - 210;
    other.facing = 1;
    dora.hitStop = 0;
    other.hitStop = 0;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('keeps SP2 6LK (225) without a guard box, its clash handler intact', () => {
    const boxes = script(225, 'dora').events.filter((e) => e.op === 'box');
    expect(boxes.every((e) => e.op === 'box' && e.slot === 0)).toBe(true);
    const { match, dora, other } = doraPlayer();
    enter(match, dora, 225, 29);
    strike(match, other, 246);
    other.x = dora.x + 240;
    other.facing = -1;
    dora.facing = 1;
    match.step({}, {});
    match.step({}, {});
    // An ordinary unflagged clash: slot 5 enters 226, both boxes spent.
    expect(base(dora.branch)).toBe(226);
  });

  it('lets ordinary unflagged boxes pass through a meet', () => {
    const { match, dora, other } = doraPlayer();
    // 231's kind-1 punch carries no flag and no slot-5 handler: Ryuko's
    // box passes it and strikes him.
    enter(match, dora, 231, 14);
    strike(match, other, 246);
    other.x = dora.x + 240;
    other.facing = -1;
    dora.facing = 1;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it("skips 突進's strike and grab contacts for 100 match ticks from the cast", () => {
    const { match, dora, other, steps } = doraPlayer();
    dora.stock = 5;
    steps({}, 2);
    steps({ blackRush: true });
    expect(dora.pierceCastTick).toBe(match.roundTicks);
    expect([338, 339]).toContain(base(dora.branch));
    // Keep Ryuko unstruck while the rush crosses the stage.
    other.bare = true;
    for (let t = 0; t < 98; t++) match.step({}, {});
    expect(dora.action).toBe('script');
    // `strike` re-enters him mid-punch, so its box opens this very tick:
    // elapsed 99 — still guarded. It meets his back: the 340 rush keeps a
    // box out in front that would only clash a frontal strike away.
    strike(match, other, 246);
    other.bare = false;
    other.x = dora.x - 240;
    other.facing = 1;
    match.step({}, {});
    expect(dora.hp).toBe(lifeOf('dora'));
    // Elapsed 100 — open, the same reach lands.
    strike(match, other, 246);
    other.x = dora.x - 240;
    other.facing = 1;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('counts hit-stop ticks toward the 100', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 338);
    // The clock is the match's, not his script age's: 50 stopped ticks
    // still count, and at the window's edge he is back in the cast's
    // standing frames, where a rear reach meets his body with no rush box
    // out front to clash it.
    dora.hitStop = 50;
    for (let t = 0; t < 99; t++) match.step({}, {});
    expect(dora.age).toBeLessThan(99);
    strike(match, other, 246);
    other.x = dora.x - 160;
    other.facing = 1;
    match.step({}, {});
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
  });

  it('keeps the cast tick through the follow-up handlers', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 338);
    const cast = dora.pierceCastTick;
    for (const [index, offset] of [
      [340, 0],
      [340, 3],
      [341, 0],
      [342, 0],
    ] as const) {
      for (let t = 0; t < 12; t++) match.step({}, {});
      enter(match, dora, index, 0, offset);
      expect(dora.pierceCastTick).toBe(cast);
    }
    strike(match, other, 246);
    other.x = dora.x + 240;
    other.facing = -1;
    match.step({}, {});
    expect(dora.hp).toBe(lifeOf('dora'));
  });

  it('expires Pierce 100 ticks after 338 even after a 339 jump', () => {
    const { match, dora, other } = doraPlayer(500);
    dora.stock = 5;
    dora.variables[6] = 100;
    enter(match, dora, 338);
    expect(dora.branch).toBe(339);
    expect(dora.pierceCastTick).toBe(0);
    for (let t = 0; t < 47; t++) match.step({}, {});
    dora.hitStop = 50;
    for (let t = 0; t < 51; t++) match.step({}, {});
    strike(match, other, 246);
    other.x = dora.x - 160;
    other.facing = 1;
    match.step({}, {});
    expect(match.roundTicks).toBe(99);
    expect(dora.hp).toBe(lifeOf('dora'));
    strike(match, other, 246);
    other.x = dora.x - 160;
    other.facing = 1;
    match.step({}, {});
    expect(match.roundTicks).toBe(100);
    expect(dora.hp).toBeLessThan(lifeOf('dora'));
    match.step({}, {});
    expect(dora.action).not.toBe('script');
    expect(dora.pierceCastTick).toBeUndefined();
    enter(match, dora, 338);
    expect(dora.pierceCastTick).toBe(match.roundTicks);
  });

  it.each([338, 339])(
    'starts a fresh Pierce cast at the current tick for %i',
    (index) => {
      const { match, dora } = doraPlayer();
      dora.stock = 5;
      for (let t = 0; t < 12; t++) match.step({}, {});
      enter(match, dora, index);
      expect(dora.pierceCastTick).toBe(match.roundTicks);
      for (let t = 0; t < 6; t++) match.step({}, {});
      enter(match, dora, index);
      expect(dora.pierceCastTick).toBe(match.roundTicks);
      enter(match, dora, 327, 9);
      expect(dora.pierceCastTick).toBeUndefined();
      dora.stock = 5;
      for (let t = 0; t < 12; t++) match.step({}, {});
      enter(match, dora, index);
      expect(dora.pierceCastTick).toBe(match.roundTicks);
    },
  );

  it('keeps the cast tick through the real Pierce hit and landing route', () => {
    const { match, dora, other, steps } = doraPlayer(150);
    dora.stock = 5;
    steps({}, 2);
    steps({ blackRush: true });
    const cast = match.roundTicks;
    expect(dora.branch).toBe(338);
    expect(dora.pierceCastTick).toBe(cast);
    const path: unknown[] = [dora.branch];
    for (let t = 0; t < 500 && dora.action === 'script'; t++) {
      const branch = dora.branch;
      match.step({}, {});
      if (branch === dora.branch) continue;
      path.push(dora.branch);
      if (dora.branch !== 270 && dora.branch !== null) {
        expect(match.roundTicks).toBeGreaterThan(cast);
        expect(dora.pierceCastTick).toBe(cast);
      } else expect(dora.pierceCastTick).toBeUndefined();
    }
    expect(path).toEqual([338, 340, '340+3', 341, 342, 270, null]);
    expect(other.hp).toBeLessThan(lifeOf('ryuko'));
  });

  it('takes the real 338 to 339 redirect with the initial cast tick', () => {
    const { match, dora, steps } = doraPlayer(150);
    dora.stock = 5;
    steps({}, 2);
    dora.variables[6] = 100;
    steps({ blackRush: true });
    const cast = match.roundTicks;
    expect(dora.branch).toBe(339);
    expect(dora.pierceCastTick).toBe(cast);
    for (let t = 0; t < 200 && dora.branch !== 340; t++) match.step({}, {});
    expect(dora.branch).toBe(340);
    expect(match.roundTicks).toBeGreaterThan(cast);
    expect(dora.pierceCastTick).toBe(cast);
  });

  it.each([270, 269, 327])(
    'drops the 突進 guard entering %i — landing, loop and another super',
    (index) => {
      const { match, dora, other } = doraPlayer();
      dora.stock = 5;
      enter(match, dora, 338);
      expect(dora.pierceCastTick).not.toBeUndefined();
      // 327's early frames carry only a pushbox; enter it far enough in
      // that a hurtbox stands.
      enter(match, dora, index, index === 327 ? 9 : 0);
      expect(dora.pierceCastTick).toBeUndefined();
      strike(match, other, 246);
      // The casts' flashes stop both; let the punch open at once.
      dora.hitStop = 0;
      other.hitStop = 0;
      other.x = dora.x + 240;
      other.facing = -1;
      match.step({}, {});
      expect(dora.hp).toBeLessThan(lifeOf('dora'));
    },
  );

  it('guards grabs inside the window and takes them after it', () => {
    const { match, dora, other } = doraPlayer();
    dora.stock = 5;
    enter(match, dora, 338);
    other.hitStop = 0;
    // Held through the cast, the match's clock carries him past the window
    // while his tall cast frames — the only ones a low grab box meets —
    // still stand (340's rush crouches under them).
    dora.hitStop = 44;
    for (let t = 0; t < 98; t++) match.step({}, {});
    // Elapsed 99, his cast frame 55: the grab box meets his back body (his
    // own front box would only clash it away) but no contact is made.
    strike(match, other, 196);
    other.x = dora.x - firstStrike('ryuko', 196, 'dora').reach + 30;
    other.facing = 1;
    match.step({}, {});
    expect(dora.action).toBe('script');
    // Elapsed 100: the same grab catches him.
    strike(match, other, 196);
    other.x = dora.x - firstStrike('ryuko', 196, 'dora').reach + 30;
    other.facing = 1;
    match.step({}, {});
    for (let t = 0; t < 20 && dora.action === 'script'; t++) match.step({}, {});
    expect(dora.action).not.toBe('script');
  });

  it('leaves other fighters open during their own casts', () => {
    const { match, dora, other } = doraPlayer();
    enter(match, other, 246);
    strike(match, dora, 231);
    other.x = dora.x + 100;
    other.facing = -1;
    dora.facing = 1;
    match.step({}, {});
    expect(other.hp).toBeLessThan(lifeOf('ryuko'));
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

  it('punches and kicks standing, crouching and after a forward step', () => {
    // G his HP normals, H LK, K the launch; the LP pair has no key, and HK
    // leaves the grounded keys to it too (authored).
    expect(byKey({ punch: true })).toMatchObject({
      mine: [203, 'idle'],
      damage: 12,
    });
    expect(byKey({ kick: true })).toMatchObject({
      mine: [202, 'idle'],
      damage: 8,
    });
    expect(byKey({ hitUp: true })).toMatchObject({
      mine: [231, 232, 'idle'],
      damage: 15,
    });
    expect(byKey({ punch: true, crouch: true })).toMatchObject({
      mine: [207, 'idle'],
      damage: 15,
    });
    expect(byKey({ kick: true, crouch: true })).toMatchObject({
      mine: [206, 'idle'],
      damage: 10,
    });
    expect(byKey({ hitUp: true, crouch: true })).toMatchObject({
      mine: [231, 232, 'idle'],
      damage: 15,
    });
    // → with HP or LK: SP1 6LP and SP2 6LK, the dashing punches — 6LP's
    // step rides the HP pair, the LP pair having no key.
    expect(byKey({ punch: true, right: true })).toMatchObject({
      mine: [223, 'idle'],
      damage: 25,
    });
    expect(byKey({ kick: true, right: true })).toMatchObject({
      mine: [225, 'idle'],
      damage: 30,
    });
    // LP's hit opened levels 22–50 (PC 2740) for a cancel; the LP pair has
    // no key, so his normal chain starts with the CPU only.
    expect(
      play(presses({ 0: { kick: true }, 8: { punch: true } })).mine,
    ).toEqual([202, 'idle']);
    expect(
      play(presses({ 0: { punch: true }, 12: { punch: true } })).mine,
    ).toEqual([203, 'idle']);
  });

  it('launches with ↘G or K, jumps after it on ↑, grabs with his chuck and dashes', () => {
    const hitUp = { punch: true, right: true, crouch: true };
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
    expect(
      play(presses({ 0: { hitUp: true }, 30: { jump: true } })).mine,
    ).toEqual([231, 232, 233, 'land', 'idle']);
    expect(byKey({ throw: true })).toMatchObject({
      mine: [234, 235, 'idle'],
      damage: 30,
    });
    expect(byKey({ dash: true }, { gap: 400 }).mine).toEqual([14, 'idle']);
    expect(byKey({ dash: true, left: true }).mine).toEqual([15, 'idle']);
  });

  it('strikes in the air, its dash form after an air dash, its 2 form after a double jump', () => {
    expect(
      play(presses({ 0: { jump: true }, 30: { punch: true } })).mine,
    ).toEqual(['takeoff', 'jump', 215, 'land', 'idle']);
    // J HP tests variable 1 for 20 (Dash AF) into its dash form (216).
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
    ).toEqual(['takeoff', 'jump', 16, 216, 'land', 'idle']);
    // His file gives Jump 2's two steps a 1-tick window (0x410171–0x41087c
    // run it once), which never matches; authored, it takes the others' 10,
    // so ↑ again double jumps (11) and J HK takes its 2 form (220).
    expect(
      play(
        presses({
          0: { jump: true },
          20: {},
          21: { jump: true },
          40: { hitUp: true },
        }),
      ).mine,
    ).toEqual(['takeoff', 'jump', 11, 220, 'land', 'idle']);
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

  it('takes his motions by hand, in the windows the other files give them (authored)', () => {
    // Each direction held 60 ms, past his file's 10-tick windows.
    const [d, df, f] = [
      { crouch: true },
      { crouch: true, right: true },
      { right: true },
    ];
    const first = (keys: Record<number, Input>) =>
      play(holding(keys)).mine.find((action) => typeof action === 'number');
    // ↓↘→ G: 機猫神空砲 HP.
    expect(first({ 0: d, 6: df, 12: f, 18: { punch: true }, 19: {} })).toBe(
      260,
    );
    // →↓↘ G: 機猫神天翔 HP.
    expect(first({ 0: f, 6: d, 12: df, 18: { punch: true }, 19: {} })).toBe(
      278,
    );
    // ↓ ↓ H: 機猫神瞬移 HK.
    expect(first({ 0: d, 6: {}, 12: d, 18: { kick: true }, 19: {} })).toBe(286);
    // ↓↘→↓↘→ G: 魔神空大砲.
    expect(
      first({
        0: d,
        6: df,
        12: f,
        18: d,
        24: df,
        30: f,
        36: { punch: true },
        37: {},
      }),
    ).toBe(296);
    // → → 60 ms apart: Dash F.
    expect(first({ 0: f, 6: {}, 12: f, 13: {} })).toBe(14);
  });

  it.each([
    [
      'cannon',
      ['d', 'df', 'f', 'd', 'df', 'f'],
      ['punch', 'throw'],
      ['kick', 'hitUp'],
      296,
    ],
    [
      'gadgets',
      ['d', 'db', 'b', 'd', 'df', 'f'],
      ['punch', 'throw'],
      ['kick', 'hitUp'],
      305,
    ],
    [
      'fists',
      ['d', 'db', 'b', 'd', 'db', 'b'],
      ['punch', 'throw'],
      ['kick', 'hitUp'],
      327,
    ],
    [
      'pierce',
      ['d', 'df', 'f', 'd', 'db', 'b'],
      ['kick', 'hitUp'],
      ['punch', 'throw'],
      338,
    ],
    ['FK', ['f', 'b', 'd', 'f'], ['kick', 'hitUp'], ['punch', 'throw'], 356],
  ] as const)(
    'casts %s on a press holding its source ending',
    (_, motion, casting, failing, action) => {
      const directions: Record<string, Input> = {
        d: { crouch: true },
        df: { crouch: true, right: true },
        f: { right: true },
        db: { crouch: true, left: true },
        b: { left: true },
      };
      const cast = (button: 'punch' | 'kick' | 'throw' | 'hitUp') => {
        const { dora, steps } = doraPlayer(500);
        dora.stock = 5;
        steps({}, 2);
        for (const direction of motion) steps(directions[direction], 6);
        steps({ [button]: true });
        return dora;
      };
      // A punch ending (D or E) takes G or J, both holding E; a kick ending
      // (A or B) takes H, or K for the HK form. The strong variant wins in
      // table order.
      for (const button of casting) expect(cast(button).branch).toBe(action);
      for (const button of failing) {
        const f = cast(button);
        expect(f.branch).not.toBe(action);
        expect(f.stock).toBe(5);
      }
    },
  );

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

  it('charges no EN while E (EN, buttons E and F) is held as 1P: 239 and the held 240+3 never enter', () => {
    // Authored (HPA-858): the EN charge is disabled for fighter 0 in every
    // mode (TEAM VS's active 1P included) and for any DoraEmon seat on a
    // B.R. route; the press (EN up, 239) and the held entry's charge window
    // (240+3) both enter nothing, and no other EN source is touched.
    expect(
      play((t) => (t < 100 ? { ex: true } : {}), { stock: 0 }),
    ).toMatchObject({ mine: ['idle'], stock: 0, power: 0 });
    expect(
      play((t) => (t < 300 ? { ex: true } : {}), { stock: 0 }),
    ).toMatchObject({ mine: ['idle'], stock: 0 });
  });

  it('keeps the CPU partner’s EN charge outside B.R., while non-CPU 2P stays blocked', () => {
    // Source behavior preserved for a CPU-driven partner (the matrix below
    // covers the B.R. seats): seed 4's real CpuVM chooses CPU EN (command 42
    // -> 421) and charges stocks; a CPU input pressing E enters 239/239+6.
    const cpuMatch = new Match('practice', false, 4, ['ryuko', 'dora']);
    cpuMatch.practice.partner = 'cpu';
    const cpuDora = cpuMatch.fighters[1];
    cpuDora.stock = 0;
    const cpuSeen = new Set<unknown>();
    for (let t = 0; t < 400; t++) {
      cpuMatch.step({});
      if (cpuDora.action === 'script') cpuSeen.add(cpuDora.branch);
    }
    expect([...cpuSeen]).toContain(421);
    expect(cpuDora.stock).toBeGreaterThan(0);

    const exCpu = new Match('practice', false, 3, ['ryuko', 'dora']);
    exCpu.practice.partner = 'cpu';
    exCpu.cpu.input = () => ({ ex: true });
    const exDora = exCpu.fighters[1];
    exDora.stock = 0;
    const exSeen = new Set<unknown>();
    for (let t = 0; t < 300; t++) {
      exCpu.step({});
      if (exDora.action === 'script') exSeen.add(exDora.branch);
    }
    expect([...exSeen]).toContain(239);
    expect(exDora.stock).toBeGreaterThan(0);

    // Passing explicit 2P input makes the seat non-CPU-driven, so EN
    // charge is blocked just like 1P ("only a CPU DoraEmon elsewhere charges").
    const dummyMatch = new Match('practice', false, 3, ['ryuko', 'dora']);
    const dummyDora = dummyMatch.fighters[1];
    dummyDora.stock = 0;
    const dummySeen = new Set<unknown>();
    for (let t = 0; t < 300; t++) {
      dummyMatch.step({}, { ex: true });
      if (dummyDora.action === 'script') dummySeen.add(dummyDora.branch);
    }
    expect([...dummySeen].some((b) => b === 239 || b === '240+3')).toBe(false);
    expect([dummyDora.stock, dummyDora.power]).toEqual([0, 0]);
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
    while (dora.action === 'intro' && ticks < 400) {
      match.step({});
      ticks++;
    }
    expect(dora.action).not.toBe('intro');
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

  it('plays his own CPU table in Vs. CPU, light variants and all', () => {
    // The shared scan resolves the injected LP/LK steps to their own
    // entries: the light 機猫神双槌 (250), 空砲 (259), 突進 (266), 天翔
    // (277/279) and 瞬移 (283/284) all play.
    for (const [seed, wanted] of [
      [4, [421, 245, 241, 296, 283, 266]],
      [37, [260, 285, 266, 327]],
      [2, [250, 284, 277, 347, 348]],
      [3, [338, 342, 259]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'dora']);
      const dora = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 6000 && !wanted.every((b) => entered.has(b)); t++) {
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
  // Step `step`'s battle from FIGHT, or once a fighter's box has met his
  // (`caught`, the striker 0x40e863 scores), with him at 1 life and `stock`
  // stocks, until `until`: the globals, his action at FIGHT, the result, his
  // actions, stock and life.
  const lose = (
    step: number,
    stock: number,
    until = (m: Match) => !!m.winner,
    caught = false,
  ) => {
    const globals = reach(step);
    const battle = scenarioOf('dora')[step] as Battle;
    const match = Match.story('dora', battle, 0, undefined, globals);
    const [dora] = match.fighters;
    while (match.roundTicks <= match.fightTick) match.step();
    const atFight = dora.action;
    for (let t = 0; caught && !dora.caught && t < 20000; t++) match.step();
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
      downed: dora.downed,
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

  it('loses the duel on an ordinary KO with three stocks: no KO RELOAD (72/74) for the player', () => {
    // Authored (HPA-858): player-controlled outside B.R., KO RELOAD's stock
    // test (PC 775) is bypassed; global 3 at 10 still takes the KO NORMAL
    // CPU chain (70) that scores the story slot.
    const result = lose(1, 4);
    expect(result.path).not.toContain('72');
    expect(result.path).not.toContain('74');
    expect(result).toMatchObject({
      g3: 10,
      atFight: 'idle',
      winner: 'opponent',
      hp: 0,
      stock: 4,
    });
  });

  // Steps 5, 11, 13, 15, 19 and 21 give his KO to the last fighter whose box
  // met his (KO scorer 0); KO'd from FIGHT, before any has, nobody scores it.
  it('loses the brawl to an ordinary KO with three stocks: no KO RELOAD (72/74) for the player', () => {
    // KO'd from FIGHT before any box has met his: nobody scores the KO.
    const result = lose(5, 4, (m) => !!m.winner);
    expect(result).toMatchObject({
      g3: 0,
      atFight: 'idle',
      winner: 'opponent',
      hp: 0,
      stock: 4,
      downed: true,
    });
    expect(result.path).not.toContain('72');
    expect(result.path).not.toContain('74');
  });

  it("loses a brawl when KO'd with fewer than three stocks before anyone has caught him", () => {
    expect(lose(5, 0).winner).toBe('opponent');
  });

  it('ends the brawl on the ordinary KO even though an enemy has caught him for 100 points', () => {
    const result = lose(5, 4, (m) => !!m.winner, true);
    // The catch scores the KO (scorer 0) as before; only the reload is gone.
    expect(result.winner).toBe('opponent');
    expect(result.stock).toBe(4);
    expect(result.path).not.toContain('72');
    expect(result.path).not.toContain('74');
    expect(Math.max(...result.points.slice(1))).toBeGreaterThanOrEqual(100);
  });

  it('loses a brawl knocked out at time-up, however many points he holds', () => {
    const globals = reach(5);
    const battle = { ...(scenarioOf('dora')[5] as Battle), time: 60 };
    const match = Match.story('dora', battle, 0, undefined, globals);
    const [dora] = match.fighters;
    while (match.roundTicks <= match.fightTick) match.step();
    match.ticks = 6000;
    [dora.points, dora.hp] = [200, 0];
    for (let t = 0; t < 10 && !match.winner; t++) match.step();
    expect(match.winner).toBe('opponent');
  });

  it('loses the final SHIN-Z battle (step 24) on a KO', () => {
    expect(lose(24, 0)).toMatchObject({
      g3: 10,
      atFight: 'idle',
      winner: 'opponent',
    });
  });
});

describe("DoraEmon's modes and seats (authored, HPA-858)", () => {
  // A forced KO queues the same lose action a hit's KO does (team.test.ts);
  // `caught` stays unset, so nobody scores it.
  const knockOut = (match: Match, f: Fighter) => {
    f.hp = 0;
    (match as unknown as { knockOut(f: Fighter): void }).knockOut(f);
  };
  // Settle an intro match past FIGHT; a free match (practice) has no round
  // flow, so the cap bounds it there.
  const settle = (match: Match) => {
    for (let t = 0; t < 900 && match.roundTicks <= match.fightTick; t++)
      match.step({});
  };
  const driveCpus = (match: Match, except: number, input: Input) => {
    for (const [i, vm] of match.cpus.entries())
      if (i !== except && vm) vm.input = () => input;
  };

  it.each([
    ['practice', () => new Match('practice', false, 3, ['dora', 'ryuko'])],
    [
      'VS single',
      () => new Match('cpu', true, 0, ['dora', 'ryuko'], 'court', true),
    ],
    [
      'TEAM VS',
      () =>
        Match.team(
          [
            ['dora', 'ryuko'],
            ['kiki', 'zoma'],
          ],
          'court',
        ),
    ],
    [
      'his authored story',
      () => Match.story('dora', scenarioOf('dora')[1] as Battle),
    ],
  ] as const)(
    'denies %s 1P DoraEmon his EN charge and lets an ordinary KO stand',
    (_mode, build) => {
      const match = build();
      const [dora, other] = match.fighters;
      driveCpus(match, 0, {});
      settle(match);
      dora.stock = 0;
      const seen = new Set<unknown>();
      for (let t = 0; t < 200; t++) {
        match.step({ ex: true });
        if (dora.action === 'script') seen.add(dora.branch);
      }
      // Neither charge action ever enters: the press (239), the held
      // entry's window (240+3) or the CPU's EN command (421).
      expect(
        [...seen].some((b) => b === 239 || b === '240+3' || b === 421),
      ).toBe(false);
      expect([dora.stock, dora.power]).toEqual([0, 0]);
      // Ordinary KO: no KO RELOAD (72), no KR Down (74) — and no reload
      // spends a stock. Four stocks sit inside KO RELOAD's own three-stock
      // test, so a missing bypass cannot hide behind an empty stock table.
      dora.stock = 4;
      other.x = dora.x + 90;
      driveCpus(match, 0, { punch: true });
      knockOut(match, dora);
      const path: unknown[] = [];
      for (let t = 0; t < 2000 && match.winner === null; t++) {
        match.step({}, { punch: true });
        const action = now(dora);
        if (path.at(-1) !== action) path.push(action);
      }
      expect(match.winner).toBe('opponent');
      expect([dora.hp, dora.downed]).toEqual([0, true]);
      expect(path.some((a) => a === 72 || a === 74)).toBe(false);
      expect(dora.stock).toBe(4);
    },
  );

  it('lets an ordinary KO stand for 1P DoraEmon in his B.R. ANOTHER while E stays dead', () => {
    const battle = bossBrAnotherStory('dora').find(
      (s): s is Battle => s.type === 1,
    )!;
    const match = Match.story('dora', battle, 0, undefined, undefined, true);
    expect(match.br).toBe(true);
    const [dora] = match.fighters;
    driveCpus(match, 0, {});
    while (match.roundTicks <= match.fightTick) match.step({});
    dora.stock = 4;
    const seen = new Set<unknown>();
    for (let t = 0; t < 200; t++) {
      match.step({ ex: true });
      if (dora.action === 'script') seen.add(dora.branch);
    }
    expect([...seen].some((b) => b === 239 || b === '240+3' || b === 421)).toBe(
      false,
    );
    expect(dora.stock).toBe(4);
    // Ordinary KO: no KO RELOAD (72), no KR Down (74) — the player seat's
    // stock test is off in every mode, B.R. included (HPA-858); CPU seats
    // keep theirs until HPA-1035.
    knockOut(match, dora);
    const path: unknown[] = [];
    for (let t = 0; t < 2000 && match.winner === null; t++) {
      match.step({});
      const action = now(dora);
      if (path.at(-1) !== action) path.push(action);
    }
    expect(match.winner).toBe('opponent');
    expect(path.some((a) => a === 72 || a === 74)).toBe(false);
    expect([dora.hp, dora.stock, dora.downed]).toEqual([0, 4, true]);
  });

  it('keeps the global-0 KO path (77) from reloading player DoraEmon in any mode', () => {
    // His lose action (68) jumps on global 0 at 10 — which LIZARD's, HISO's,
    // SEAN's and G Suneo's lethal blows hold for their strike's tick —
    // straight into 77, whose own three-stock op 0x10 enters KO RELOAD (72)
    // through the generic stock handler, past enterPending's guarded check
    // (PC 775). The authored restriction covers that entry too; the global
    // stands in for the striker's tick, as the source test reads it.
    const run = (br: boolean, player: boolean) => {
      const match = br
        ? Match.story(
            'dora',
            bossBrAnotherStory('dora').find((s): s is Battle => s.type === 1)!,
            0,
            undefined,
            undefined,
            true,
          )
        : new Match(
            'practice',
            false,
            3,
            player ? ['dora', 'ryuko'] : ['ryuko', 'dora'],
          );
      match.globals[0] = 10;
      const dora = match.fighters[player ? 0 : 1];
      driveCpus(match, player ? 0 : 1, {});
      settle(match);
      dora.stock = 4;
      knockOut(match, dora);
      const path: unknown[] = [];
      for (
        let t = 0;
        t < 2000 && match.winner === null && (!br || dora.hp < lifeOf('dora'));
        t++
      ) {
        match.step({});
        const action = now(dora);
        if (path.at(-1) !== action) path.push(action);
      }
      return {
        path,
        hp: dora.hp,
        stock: dora.stock,
        downed: dora.downed,
        winner: match.winner,
      };
    };
    // The player's stocks buy no reload through 77 in any mode, B.R.
    // included: the jump itself still plays its ordinary fall, and he
    // stays down.
    for (const br of [false, true] as const) {
      const solo = run(br, true);
      expect(solo.path).toContain(77);
      expect(solo.path.some((a) => a === 72 || a === 74)).toBe(false);
      expect(solo).toMatchObject({
        hp: 0,
        stock: 4,
        downed: true,
        winner: 'opponent',
      });
    }
    // For a non-B.R. CPU the same path still reloads him.
    const kept = run(false, false);
    const reload = kept.path.indexOf(72);
    expect(reload).toBeGreaterThanOrEqual(0);
    expect(kept.path.indexOf(74)).toBeGreaterThan(reload);
    expect(kept).toMatchObject({ hp: lifeOf('dora'), stock: 1 });
  });

  it('skips the CPU’s EN command (42) in B.R. — seed 4 — without stalling, and still blocks injected 42', () => {
    // The Vs. CPU table run (seed 4) enters 421 outside B.R. Here the same
    // table runs against a grounded opponent inside slot 56's distance
    // window (250–700 source pixels, both standing). CpuVM skips slot 56
    // during the scan when command 42 is blocked, so he never chooses it or
    // freezes waiting for its step duration; and Match.command still blocks
    // command 42 as defense-in-depth.
    const match = Match.story(
      'kiki',
      brAnotherStages('kiki').stage3,
      4,
      undefined,
      undefined,
      true,
    );
    const dora = match.fighters[4];
    expect(dora.who).toBe('dora');
    driveCpus(match, 4, {});
    while (match.roundTicks <= match.fightTick) match.step();
    const [, alpha, shinz, zenka] = match.fighters;
    for (const [watched, next] of [
      [alpha, shinz],
      [shinz, zenka],
      [zenka, dora],
    ] as const) {
      watched.hp = desperationOf(watched.who) - 1;
      match.step();
      expect(next.present).toBe(true);
      watched.hp = watched.maxHp;
    }
    // The late entrance still plays his authored intro — its own charge
    // stocks him — before the CPU ever thinks.
    for (let t = 0; t < 400 && dora.action === 'intro'; t++) match.step();
    expect(dora.action).not.toBe('intro');
    expect(dora.stock).toBe(4);
    // One grounded target inside the EN entry's distance window; every
    // other fighter stands beyond it, so the nearest is always that one.
    for (const f of match.fighters)
      if (f !== dora && f.present) f.x = dora.x + 1500;
    alpha.x = dora.x + 600;
    dora.stock = 0;
    const vm = match.cpus[4]!;
    const real = vm.input.bind(vm);
    const commands: (number | undefined)[] = [];
    vm.input = (self, opponent) => {
      const fed = real(self, opponent);
      commands.push(fed.command);
      return fed;
    };
    const total = () => dora.power + dora.stock * perStockOf('dora');
    const entered: [number, unknown][] = [];
    let prev: unknown = 'idle';
    for (let t = 0; t < 200; t++) {
      match.step();
      const action = now(dora);
      if (action !== prev) {
        prev = action;
        entered.push([t, action]);
      }
    }
    // Slot 56 (command 42) was never selected, and no charge action entered.
    expect(commands).not.toContain(42);
    expect(
      entered.some(([, b]) => b === 239 || b === '240+3' || b === 421),
    ).toBe(false);
    // Skipping slot 56 lets him enter an earlier-slot attack immediately
    // rather than freezing for ~1.9 s.
    expect(entered.some(([t, b]) => t < 60 && typeof b === 'number')).toBe(
      true,
    );
    // Defense-in-depth: injecting command 42 directly at command() still blocks it.
    vm.input = () => ({ command: 42 });
    const hold = total();
    const injectStart = entered.length;
    for (let t = 0; t < 20; t++) {
      match.step();
      const action = now(dora);
      if (action !== prev) {
        prev = action;
        entered.push([200 + t, action]);
      }
    }
    expect(entered.slice(injectStart).some(([, b]) => b === 421)).toBe(false);
    expect(total()).toBe(hold);
  });

  it('plays his whole Br. intro from a waiting seat in B.R., untouchable, before the CPU wakes', () => {
    // kiki's stage-3 brawl seats DoraEmon last, watching ZENKA's seat:
    // arrive → opening enters the authored Br. intro mid-fight, as a first
    // seat's does before the fight.
    const battle = brAnotherStages('kiki').stage3;
    const match = Match.story('kiki', battle, 0, undefined, undefined, true);
    expect(match.br).toBe(true);
    const dora = match.fighters[4];
    expect(dora.who).toBe('dora');
    const ally = match.fighters[5];
    driveCpus(match, 4, {});
    while (match.roundTicks <= match.fightTick) match.step();
    const [kiki, alpha, shinz, zenka] = match.fighters;
    for (const [watched, next] of [
      [alpha, shinz],
      [shinz, zenka],
      [zenka, dora],
    ] as const) {
      watched.hp = desperationOf(watched.who) - 1;
      match.step();
      expect(next.present).toBe(true);
      watched.hp = watched.maxHp;
    }
    // The 337 ticks start on his actual entry, long after the fight began.
    expect([dora.action, dora.age]).toEqual(['intro', 0]);
    expect(match.roundTicks).toBeGreaterThan(match.fightTick);
    const vm = match.cpus[4]!;
    const real = vm.input.bind(vm);
    let thinks = 0;
    vm.input = (self: Fighter, opponent: Fighter) => (
      thinks++,
      real(self, opponent)
    );
    // The intro poses carry no body boxes, so a hostile strike neither hits
    // nor pushes him: kiki punches at him for the whole intro.
    const x = dora.x;
    kiki.x = x - 90;
    kiki.facing = 1;
    for (const f of [alpha, shinz, zenka]) f.x = x + 1500;
    const ages = [0, 149, 150, 177, 257, 266, 267, 276, 336];
    const poses = new Map<number, [number, number]>();
    const black = new Set<Effect>();
    const charge = new Set<Effect>();
    let landing = false;
    let ticks = 0;
    let gauge = 0;
    do {
      poses.set(dora.age, [fighterPose(dora).image, dora.y]);
      if (kiki.action !== 'script') strike(match, kiki, 177);
      kiki.x = x - 90;
      match.step();
      ticks++;
      for (const e of match.effects) {
        if (e.owner !== 4) continue;
        if (e.clip === 50) black.add(e);
        if (e.clip === 46) charge.add(e);
        if (e.clip === 407) landing = true;
      }
      gauge = Math.max(gauge, dora.power + dora.stock * perStockOf('dora'));
      if (dora.action === 'intro')
        expect([dora.hp, dora.hitStop, dora.x]).toEqual([dora.maxHp, 0, x]);
    } while (dora.action === 'intro' && ticks < 400);
    expect(dora.action).not.toBe('intro');
    // The first-seat test's 337 ticks, sampled sprite ids and landing.
    expect(ticks).toBe(337);
    expect(ages.map((a) => poses.get(a)![0])).toEqual([
      263, 263, 264, 268, 268, 125, 124, 124, 184,
    ]);
    const ys = ages.map((a) => poses.get(a)![1]);
    expect([ys[0], ys[1], ys[2]]).toEqual([0, 0, 0]);
    expect(ys[3]).toBeLessThan(0);
    expect(ys[4]).toBe(ys[3]);
    expect(ys[5]).toBeLessThan(0);
    expect(ys[5]).toBeGreaterThan(ys[4]);
    expect([ys[6], ys[7], ys[8]]).toEqual([0, 0, 0]);
    // OP super Charge's 360 power buys four 90-EN stocks exactly once; the
    // B.R. seat's dead voluntary EN command (HPA-858) never gated it.
    expect([gauge, dora.stock, dora.power]).toEqual([360, 4, 0]);
    // Black (50), OP super Charge (46) and the landing's object (407).
    expect(black.size).toBe(1);
    expect(charge.size).toBe(1);
    expect(landing).toBe(true);
    // The CPU never thought during the intro; the ally's own watch never
    // tripped, and the battle still offers Continue.
    expect(thinks).toBe(0);
    expect(ally.present).toBe(false);
    expect(battle.flags & 1).toBe(1);
    // Ordinary CPU input resumes only once the intro ends (a strike that
    // met him on the change tick queues its reaction first).
    for (let t = 0; t < 60 && !thinks; t++) match.step();
    expect(thinks).toBeGreaterThan(0);
    // The same strike lands once ordinary control resumes.
    for (let t = 0; t < 60 && dora.hp === dora.maxHp; t++) {
      if (kiki.action !== 'script') strike(match, kiki, 177);
      kiki.x = dora.x - 90;
      match.step();
    }
    expect(dora.hp).toBeLessThan(dora.maxHp);
  });

  it('pins SEAT_GATES.dora to DoraEmon’s exported command entries and KO RELOAD stock op', () => {
    const gate = SEAT_GATES.dora!;
    const entries = CHARACTERS.dora.commands.entries;
    const en = entries.find((e) => e.name === 'EN');
    const cpuEx = entries.find((e) => e.name === '---cpu---' && e.near === 239);
    const cpuEn = entries.find((e) => e.name === 'CPU EN');
    expect(gate.enChargeActions).toEqual(
      new Set([cpuEx!.near, en!.near, cpuEn!.near]),
    );
    expect(gate.enChargeCpuCommands).toEqual(
      new Set([entries.indexOf(cpuEn!) + 1]),
    );
    const stockEvent = script(69, 'dora').events.find((e) => e.op === 'stock');
    expect(stockEvent?.op === 'stock' && stockEvent.target).toBe(gate.koReload);
  });

  it('marks a B.R. ZERO battle B.R. through its story route, though DoraEmon is absent there', () => {
    // The scene derives the flag from the route (startBattle); these seat
    // rules read exactly that flag, so B.R. ZERO propagates it the same.
    const story = new Story('ryuko');
    let next = story.startOnRoute('br-zero');
    while (next.kind === 'demo') next = story.next();
    if (next.kind !== 'battle') throw new Error('expected a battle');
    const match = Match.story(
      'ryuko',
      next.battle,
      0,
      undefined,
      undefined,
      story.br,
    );
    expect(match.br).toBe(true);
  });
});
