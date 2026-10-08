import { describe, expect, it } from 'vitest';
import { commanded, ENTRIES, NEAR } from './commands';
import { LIFE, Match } from './match';
import type { Fighter, Input } from './match';
import { named, playing, RYUKO } from './testing';

// Motions for player 1 on the left, facing right: f is right, b is left.
const KEYS: Record<string, Input> = {
  n: {},
  d: { crouch: true },
  f: { right: true },
  b: { left: true },
  df: { crouch: true, right: true },
  db: { crouch: true, left: true },
};
// Each token is held two ticks, with an optional button: 'f+P'. Each step
// needs a tick of its own, and the steps marked 0x3000 between directions
// take one each, so a direction held one tick can be lost.
function perform(motion: string, setup: (f: Fighter) => void = () => {}) {
  const match = new Match();
  const [f, target] = match.fighters;
  target.x = f.x + 150;
  setup(f);
  for (const token of motion.split(' ')) {
    const [direction, button] = token.split('+');
    const input = {
      ...KEYS[direction],
      punch: button === 'P',
      kick: button === 'K',
      hitUp: button === 'H',
    };
    match.step(input);
    match.step(input);
  }
  return f;
}

const ticks2 = (match: Match, input: Input) => {
  match.step(input);
  match.step(input);
};

describe('recovered command recognizer', () => {
  it("reads Ryuko's 23 command entries and near distance", () => {
    expect(ENTRIES).toHaveLength(23);
    expect(NEAR).toBe(110);
    expect(
      ENTRIES.slice(0, 9).map(({ name, window }) => [name, window]),
    ).toEqual([
      ['CGA', 90],
      ['B G', 50],
      ['MUSASHI', 90],
      ['G BEAM LV1', 50],
      ['hidden sup', 50],
      ['fire', 40],
      ['DST', 45],
      ['Drill Punch', 40],
      ['IORI', 40],
    ]);
  });

  it.each([
    ['d df f f+P', 'axeThrow'],
    ['d db b b+K', 'drill'],
    ['d db b b+P', 'iori'],
    ['b db d df f f+K', 'dst'],
    ['d n d d+H', 'exChange'],
    ['d df f d df f f+P', 'getterBeam'],
    ['d df f d df f f+K', 'megaBeam'],
    ['f d b f d b b+P', 'musashi'],
    ['f d b f d b b+K', 'changeAttack'],
    // At 153 life or more the hidden super throws the axe instead.
    ['d db b d df f f+P', 'blackRush', 150],
  ])('enters %s as %s', (motion, action, hp = LIFE) => {
    const f = perform(motion, (f) =>
      Object.assign(f, { stock: 3, power: 50, hp }),
    );
    expect(named(f)).toBe(action);
  });

  it("reads back and forward from the opponent's side", () => {
    const match = new Match();
    const [f, target] = match.fighters;
    target.x = f.x - 150;
    for (const input of [
      { crouch: true },
      { crouch: true, left: true },
      { left: true },
      { left: true, punch: true },
    ])
      ticks2(match, input);
    expect(named(f)).toBe('axeThrow');
  });

  it('needs each exact direction before the button, else falls back to P', () => {
    // ↘ is not →, so P alone matches, crouching while down is held.
    expect(playing(perform('d df df+P'))).toBe(RYUKO.crouchPunch);
    // P's own tick doesn't count as the → before it.
    expect(playing(perform('d df f+P'))).toBe(RYUKO.punch);
  });

  it('takes the first matching entry in table order', () => {
    // G BEAM LV1 (4) comes before fire (6), which its motion also contains.
    expect(named(perform('d df f d df f f+P', (f) => (f.stock = 1)))).toBe(
      'getterBeam',
    );
  });

  it('finds every step within the window, newest first', () => {
    const fire = ENTRIES[5];
    // ↓ and → before a fresh P; the oldest step needs any tick.
    const history = (gap: number) => [
      0,
      8,
      ...Array<number>(gap).fill(0),
      2,
      0x82,
    ];
    expect(commanded(history(35), fire.steps, fire.window)).toBe(true);
    expect(commanded(history(36), fire.steps, fire.window)).toBe(true);
    expect(commanded(history(37), fire.steps, fire.window)).toBe(false);
    // A held P is not fresh.
    expect(commanded([0, 8, 2, 0x82, 0x82], fire.steps, fire.window)).toBe(
      false,
    );
  });

  it('double jumps on neutral, then up within 10 ticks (Jump 2)', () => {
    const held = new Match();
    for (let t = 0; t < 30; t++) held.step({ jump: true });
    expect(held.fighters[0]).toMatchObject({ action: 'jump', vx: 0 });
    for (const [input, action, vx] of [
      [{ jump: true }, RYUKO.doubleJump, 0],
      [{ jump: true, right: true }, RYUKO.doubleJumpF, 1],
      [{ jump: true, left: true }, RYUKO.doubleJumpB, -1],
    ] as const) {
      const match = new Match();
      const f = match.fighters[0];
      match.fighters[1].x = f.x + 150;
      ticks2(match, { jump: true });
      for (let t = 0; t < 12; t++) match.step({});
      match.step(input);
      expect(playing(f)).toBe(action);
      // Each hovers three ticks before its op 0x01 (PCs 129, 144, 159).
      for (let t = 0; t < 3; t++) match.step({});
      expect(Math.sign(f.vx)).toBe(vx);
    }
  });

  it('cancels a connected punch into a forward dash (level 30), not a backdash (0)', () => {
    for (const [direction, dashed] of [
      ['f', true],
      ['b', false],
    ] as const) {
      const match = new Match();
      const [f, target] = match.fighters;
      target.x = f.x + 110;
      match.step({ punch: true });
      for (let t = 0; t < 30 && f.hitStop === 0; t++) match.step();
      expect(playing(f)).toBe(RYUKO.punchHit);
      for (const input of [KEYS[direction], {}, KEYS[direction]])
        match.step(input);
      expect([RYUKO.dash, RYUKO.backdash].includes(playing(f) as 13 | 14)).toBe(
        dashed,
      );
    }
  });

  it('reads no air command within 50 source pixels of the floor on the way down', () => {
    for (const [y, action] of [
      [-75, 'jump'],
      [-76, RYUKO.airPunch],
    ] as const) {
      const match = new Match();
      const [f] = match.fighters;
      Object.assign(f, { action: 'jump', y, vy: 1, gravity: 0 });
      match.step({ punch: true });
      expect(playing(f)).toBe(action);
    }
  });
});
