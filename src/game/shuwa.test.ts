import { describe, expect, it } from 'vitest';
import { CHARACTERS, lifeOf } from './characters';
import type { Who } from './characters';
import { entriesOf, KEYS } from './commands';
import { exMode, fighterPose, LIFE, Match } from './match';
import type { Fighter, Input } from './match';
import { named, objects, playing, RYUKO } from './testing';

// SHUWA (authored: art/shuwa/game) plays RYUKO's export with his drawings,
// his command table and SWING without the missile volley. `who` on side
// `side` (0 on the left facing right, 1 on the right facing left), `gap`
// from a standing RYUKO, with three stocks.
function duel(who: Who, side = 0, gap = 130) {
  const match = new Match(
    'practice',
    false,
    3,
    side ? ['ryuko', who] : [who, 'ryuko'],
  );
  const f = match.fighters[side];
  const other = match.fighters[1 - side];
  other.x = f.x + gap * f.facing;
  f.stock = 3;
  const step = (mine: Input, theirs: Input = {}) =>
    side ? match.step(theirs, mine) : match.step(mine, theirs);
  return { match, f, other, step };
}

const OWN = new Set(
  CHARACTERS.shuwa.images.filter((i) => i.own).map(({ index }) => index),
);
// Runs `input` for `ticks` from `hp` life: when each action began, the ticks
// RYUKO lost life on and how much, the stocks left, how many DST missiles
// flew and, for SHUWA, any image he showed that is not his own (0 and 8191
// show nothing).
function run(
  who: Who,
  input: (t: number) => Input,
  { side = 0, gap = 130, ticks = 1500, hp = 0 } = {},
) {
  const { match, f, other, step } = duel(who, side, gap);
  if (hp) f.hp = hp;
  const path: [number, unknown][] = [];
  const struck: number[] = [];
  const foreign = new Set<number>();
  let missiles = 0;
  for (let t = 0; t < ticks; t++) {
    const before = other.hp;
    step(input(t));
    if (path.at(-1)?.[1] !== playing(f)) path.push([t, playing(f)]);
    if (other.hp !== before) struck.push(t);
    missiles += objects(match, RYUKO.dstMissile, side).length;
    const { image } = fighterPose(f);
    if (who === 'shuwa' && image && image !== 8191 && !OWN.has(image))
      foreign.add(image);
  }
  return {
    path,
    struck,
    damage: LIFE - other.hp,
    stock: f.stock,
    hits: f.hits,
    missiles,
    foreign: [...foreign],
  };
}

// Motions as commands.test's perform(): each token held two ticks from tick
// 2, f toward the opponent, with an optional button ('b+P').
function motion(text: string, side = 0) {
  const [forward, back] = side
    ? [{ left: true }, { right: true }]
    : [{ right: true }, { left: true }];
  const keys: Record<string, Input> = {
    d: { crouch: true },
    f: forward,
    b: back,
  };
  const tokens = text.split(' ');
  return (t: number): Input => {
    const token = tokens[(t - 2) >> 1];
    if (t < 2 || !token) return {};
    const [direction, button] = token.split('+');
    return { ...keys[direction], punch: button === 'P', kick: button === 'K' };
  };
}
const firstMove = (path: [number, unknown][]) =>
  path.find(([, action]) => typeof action === 'number')?.[1];

describe('SHUWA (authored, donor RYUKO)', () => {
  it("takes spec.json's 480 life, three stocks and chip 20", () => {
    expect(lifeOf('shuwa')).toBe(480);
    expect(CHARACTERS.shuwa).toMatchObject({ stocks: 3, chip: 20 });
    expect(duel('shuwa').f).toMatchObject({ who: 'shuwa', hp: 480 });
  });

  it("keeps RYUKO's numbering with his entries; the rest are inert", () => {
    const names = entriesOf('shuwa').map(({ name }) => name);
    expect(names.slice(0, 9)).toEqual([
      'ULTRA SWING',
      'THREE MINUTES',
      '--------',
      'SPECIUM RAY',
      '--------',
      'RING',
      'SWING',
      '--------',
      '--------',
    ]);
    for (const entry of [3, 5, 8, 9, 15, 22])
      expect(entriesOf('shuwa')[entry - 1]).toMatchObject({
        air: 0,
        near: 0,
        far: 0,
        crouch: 0,
        steps: [0x2000],
      });
    // Only his keys: no MUSASHI, hidden super, Drill, IORI, CPU IORI or EX.
    expect(KEYS.shuwa.map(([control]) => control)).toEqual([
      'getterBeam',
      'changeAttack',
      'megaBeam',
      'dst',
      'axe',
      'dash',
    ]);
  });

  it.each([0, 1])(
    "plays the P and K chains on hit with RYUKO's timing (side %i)",
    (side) => {
      const punches = (t: number) => ({ punch: [0, 10, 50].includes(t) });
      expect(run('shuwa', punches, { side, ticks: 200 })).toMatchObject({
        path: [
          [0, RYUKO.punch],
          [8, RYUKO.punchHit],
          [26, RYUKO.punch2],
          [57, RYUKO.punch3],
          [69, '181+11'],
          [79, '181+18'],
          [151, 'idle'],
        ],
        damage: 10 + 5 + 35,
        hits: 3,
      });
      const kicks = (t: number) => ({ kick: [0, 10, 50].includes(t) });
      const kick = run('shuwa', kicks, { side, ticks: 300 });
      expect(kick).toEqual(run('ryuko', kicks, { side, ticks: 300 }));
      expect(kick.path.map(([, action]) => action)).toEqual([
        RYUKO.kick,
        RYUKO.kickHit,
        RYUKO.kick2,
        RYUKO.kick3,
        'idle',
      ]);
      expect(kick.damage).toBe(60);
    },
  );

  it('launches with Hit Up for 15 and chases on up held', () => {
    const chase = run('shuwa', (t) => ({ hitUp: t === 0, jump: t >= 2 }), {
      ticks: 60,
    });
    expect(chase).toMatchObject({
      path: [
        [0, RYUKO.hitUp],
        [16, RYUKO.hitUpRecover],
        [54, RYUKO.hitUpJump],
      ],
      damage: 15,
    });
  });

  it('catches with Chuck for 30', () => {
    const chuck = run('shuwa', (t) => ({ throw: t === 0 }), { gap: 80 });
    expect(chuck).toMatchObject({
      path: [
        [0, RYUKO.grab],
        [8, RYUKO.throw],
        [213, 'idle'],
      ],
      damage: 30,
    });
  });

  // Each special by its key, on RYUKO's timeline: RING is her axe (226),
  // SPECIUM RAY her G BEAM (264), ULTRA SWING her CGA (319) and THREE
  // MINUTES her B G (292), with her damage and stock costs (0, 1, 1, 3).
  it.each([
    ['axe', 'RING', [226], 30, 3],
    ['getterBeam', 'SPECIUM RAY', [264], 100, 2],
    ['changeAttack', 'ULTRA SWING', [319, 320, 'land'], 100, 2],
    ['megaBeam', 'THREE MINUTES', [292, 294], 240, 0],
  ] as const)(
    '%s plays %s on her frames, hitting RYUKO from three stocks',
    (key, _name, path, damage, stock) => {
      const input = (t: number) => ({ [key]: t === 2 });
      const his = run('shuwa', input, { gap: 200 });
      expect(his.path.slice(1, -1).map(([, action]) => action)).toEqual(path);
      expect(his).toMatchObject({ damage, stock, foreign: [] });
      expect(his).toEqual(run('ryuko', input, { gap: 200 }));
    },
  );

  it("throws with SWING for less than RYUKO's DST: no missile volley", () => {
    const input = (t: number) => ({ dst: t === 2 });
    const swing = run('shuwa', input);
    const dst = run('ryuko', input);
    // Both toss RYUKO (214 into 215) for the toss's 10 (response 31) at
    // 215's age 185, tick 192. SWING drops 215's volley frames (368 ticks to
    // 283) and with them the missiles' hit, whose 13-tick stop holds her:
    // the whole move runs 288 ticks (entered at tick 2, idle at 290), back
    // 98 ticks after the toss against her 196. Costs nothing.
    expect(swing).toEqual({
      path: [
        [0, 'idle'],
        [2, RYUKO.dst],
        [7, RYUKO.dstHit],
        [290, 'idle'],
      ],
      struck: [192],
      damage: 10,
      stock: 3,
      // The catch and the toss.
      hits: 2,
      missiles: 0,
      foreign: [],
    });
    expect(dst).toMatchObject({
      path: [
        [0, 'idle'],
        [2, RYUKO.dst],
        [7, RYUKO.dstHit],
        [388, 'idle'],
      ],
      struck: [192, 294],
      damage: 32,
    });
    expect(dst.missiles).toBeGreaterThan(0);
    expect(swing.damage).toBeLessThan(dst.damage);
  });

  // Her low-life forms, which his scripts keep (op 0x11 at 153 life, PCs of
  // 264 and 214): 153 of his 480 is 32%.
  it.each([
    ['getterBeam', 'SPECIUM RAY', 'G BEAM EVIL', 200, 264, [278], 120],
    ['dst', 'SWING', 'Evil DST', 130, 214, [221, 222], 10],
  ] as const)(
    '%s turns %s into her %s at 153 life or less, his drawings throughout',
    (key, _name, _form, gap, normal, path, damage) => {
      const input = (t: number) => ({ [key]: t === 2 });
      const low = run('shuwa', input, { gap, hp: 153 });
      expect(low.path.slice(1).map(([, action]) => action)).toEqual([
        ...path,
        'idle',
      ]);
      expect(low).toMatchObject({ damage, foreign: [] });
      expect(firstMove(run('shuwa', input, { gap, hp: 154 }).path)).toBe(
        normal,
      );
    },
  );

  // The ticket's inputs pressed in full from idle, facing either way: ULTRA
  // SWING's ends in RING's ↓←G, and SPECIUM RAY's and THREE MINUTES' end in
  // a bare G or K, but the scan takes the first entry that matches.
  it.each([
    ['f d b f d b b+P', 'ULTRA SWING', 200, 319],
    ['d b b+P', 'RING', 200, 226],
    ['d f d f f+P', 'SPECIUM RAY', 200, 264],
    ['d f d f f+K', 'THREE MINUTES', 200, 292],
    ['b d f f+K', 'SWING', 130, 214],
  ] as const)('enters %s as %s', (text, _name, gap, action) => {
    for (const side of [0, 1]) {
      const { path } = run('shuwa', motion(text, side), {
        side,
        gap,
        ticks: 30,
      });
      expect(firstMove(path)).toBe(action);
    }
  });

  // Her intros' op 0x16s jump to Chage Character (37) while down is held,
  // which sets variable 0 to 10, her EX mode; his export cuts them
  // (cutInputs). Vs. CPU's intro (30 into 32) and VS single's (30 + 9 into
  // 33), against RYUKO's.
  it.each([false, true])(
    'never enters EX mode, down held through the intro (VS single %s)',
    (vs) => {
      for (const who of ['shuwa', 'ryuko'] as const) {
        const match = new Match('cpu', true, 0, [who, 'ryuko'], 'court', vs);
        const f = match.fighters[0];
        const path = new Set<unknown>();
        for (let t = 0; t < 700; t++) {
          match.step({ crouch: true });
          path.add(playing(f));
        }
        const ex = who === 'ryuko';
        expect(path.has(vs ? 33 : 32)).toBe(true);
        expect([path.has(37), f.variables[0] ?? 0, exMode(f)]).toEqual([
          ex,
          ex ? 10 : 0,
          ex,
        ]);
      }
    },
  );

  it('counters a blocked punch with Hit Up, spending a stock (174)', () => {
    // As match.test's recovered guard counter: punch 1 blocked at tick 7,
    // block 149's age-8 check reading the press at tick 19.
    const match = new Match('practice', false, 0, ['ryuko', 'shuwa']);
    const [f, target] = match.fighters;
    target.x = f.x + 130;
    target.stock = 1;
    const seen = new Set<string>();
    for (let tick = 0; tick < 120; tick++) {
      match.step(
        { punch: tick === 0 },
        { guard: tick <= 7, hitUp: tick === 19 },
      );
      seen.add(named(target));
      if (named(target) === 'counterHit' && !seen.has('start'))
        seen.add('start').add(`at ${tick}`);
    }
    expect(seen.has('at 26')).toBe(true);
    expect(target).toMatchObject({ stock: 0, power: 4, hits: 1 });
    expect(f.hp).toBe(LIFE - 12);
  });

  it('plays Vs. CPU rounds from his CPU table, never a move he lacks', () => {
    const lacks = [
      RYUKO.musashi,
      RYUKO.blackRush,
      RYUKO.drill,
      RYUKO.airDrill,
      RYUKO.iori,
      RYUKO.exChange,
      RYUKO.cpuIori,
    ];
    const moves = new Set<unknown>();
    for (const seed of [1, 4]) {
      const match = new Match('cpu', false, seed, ['ryuko', 'shuwa']);
      const shuwa: Fighter = match.fighters[1];
      for (let t = 0; t < 8000 && !match.resultReady; t++) {
        match.step({});
        if (shuwa.action === 'script') moves.add(shuwa.branch);
      }
      expect(match.resultReady).toBe(true);
    }
    expect([...moves]).toEqual(
      expect.arrayContaining([
        RYUKO.dst,
        RYUKO.axeThrow,
        RYUKO.changeAttack,
        RYUKO.hitUp,
      ]),
    );
    expect(lacks.filter((action) => moves.has(action))).toEqual([]);
  });
});
