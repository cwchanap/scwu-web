import { describe, expect, it } from 'vitest';
import { CHARACTERS, lampOf, lifeOf } from './characters';
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

// His own drawings and effects are the images he publishes under shuwa/
// (HPA-1308 recolours his drawings, so `own` no longer marks them all).
const OWN = new Set(
  CHARACTERS.shuwa.images
    .filter((i) => i.filename.startsWith('shuwa/'))
    .map(({ index }) => index),
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
    df: { crouch: true, ...forward },
    n: {},
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
      'GIANT STEP',
      'SPECIUM RAY',
      '--------',
      'RING',
      'SWING',
      'SHUWATCH',
      'SPECIUM',
    ]);
    expect(names.slice(14, 16)).toEqual(['BARRIER', 'RECHARGE']);
    for (const entry of [5, 22])
      expect(entriesOf('shuwa')[entry - 1]).toMatchObject({
        air: 0,
        near: 0,
        far: 0,
        crouch: 0,
        steps: [0x2000],
      });
    // His keys: Ryuko's where his moves keep her numbers, BARRIER on F (her
    // IORI key) and RECHARGE on E (her EX key).
    expect(KEYS.shuwa).toEqual([
      ['getterBeam', 4],
      ['musashi', 3],
      ['changeAttack', 1],
      ['megaBeam', 2],
      ['drill', 8],
      ['iori', 15],
      ['dst', 7],
      ['axe', 6],
      ['ex', 16],
      ['dash', 13],
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

  // Her low-life forms, which his scripts keep (op 0x11, PCs of 264 and
  // 214), their mark moved from her 153 of 510 to his 144 of 480: 30%.
  it.each([
    ['getterBeam', 'SPECIUM RAY', 'G BEAM EVIL', 200, 264, [278], 120],
    ['dst', 'SWING', 'Evil DST', 130, 214, [221, 222], 10],
  ] as const)(
    '%s turns %s into her %s at 144 life or less, his drawings throughout',
    (key, _name, _form, gap, normal, path, damage) => {
      const input = (t: number) => ({ [key]: t === 2 });
      const low = run('shuwa', input, { gap, hp: 144 });
      expect(low.path.slice(1).map(([, action]) => action)).toEqual([
        ...path,
        'idle',
      ]);
      expect(low).toMatchObject({ damage, foreign: [] });
      expect(firstMove(run('shuwa', input, { gap, hp: 145 }).path)).toBe(
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
    // HPA-1305's: SPECIUM is her EX Fire (231), the others grafted
    // (export_authored graft: DoraEmon's 278, ALEX's 261, ZOMA's 229, REMU's
    // 347 at 11000, 12000, 13000 and 14000 on).
    ['d f f+P', 'SPECIUM', 200, 231],
    ['f d df df+P', 'SHUWATCH', 200, 11278],
    ['d f f+K', 'BARRIER', 200, 12261],
    ['d n d d+P', 'RECHARGE', 200, 13229],
    ['d b d b b+K', 'GIANT STEP', 250, 14347],
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

  // His keys for the new moves: DRILL's for SHUWATCH, MUSASHI's for GIANT
  // STEP (a stock), IORI's (F) for BARRIER and EX's (E) for RECHARGE.
  it.each([
    ['drill', 'SHUWATCH', 11278, 3],
    ['musashi', 'GIANT STEP', 14347, 2],
    ['iori', 'BARRIER', 12261, 3],
    ['ex', 'RECHARGE', 13229, 3],
  ] as const)('enters %s as %s', (key, _name, action, stock) => {
    const his = run('shuwa', (t) => ({ [key]: t === 2 }), {
      gap: 250,
      ticks: 300,
    });
    expect(firstMove(his.path)).toBe(action);
    expect(his).toMatchObject({ stock, foreign: [] });
  });

  // REMU's GOLD HAND dove about 536 px on a diagonal, past the opponent;
  // spec.json's patches make it a rise and a straight stamp about 250 px
  // ahead, its box at the sole, for 100 (export_authored graft patch).
  it('stamps with GIANT STEP ahead of him for 100, never past RYUKO', () => {
    for (const side of [0, 1])
      for (const [gap, damage] of [
        [120, 100],
        [250, 100],
        [360, 100],
        [480, 0],
      ] as const) {
        const { f, other, step } = duel('shuwa', side, gap);
        const start = f.x;
        let passed = false;
        for (let t = 0; t < 300; t++) {
          step({ musashi: t === 2 });
          passed ||= (other.x - f.x) * f.facing < 0;
        }
        expect([LIFE - other.hp, f.stock, passed]).toEqual([damage, 2, false]);
        // A miss lands him about 250 px ahead.
        if (!damage) expect((f.x - start) * f.facing).toBeGreaterThan(200);
      }
  });

  it("rises with SHUWATCH from a jump too (DoraEmon's Sky Rise 280)", () => {
    const { path } = run('shuwa', (t) => ({ jump: t === 0, drill: t === 20 }), {
      ticks: 200,
    });
    expect(path.map(([, action]) => action)).toEqual([
      'takeoff',
      'jump',
      11280,
      'land',
      'turn',
      'idle',
    ]);
  });

  it("sends RYUKO's RING back with BARRIER (ALEX's REFLACT 261)", () => {
    // Her axe (227) thrown from 300 away meets the wall at tick 25: he turns
    // it (12267) into his own shot (12269), which knocks her down.
    const { match, f, other } = duel('shuwa', 0, 300);
    const path = new Set<unknown>();
    const shots = new Set<unknown>();
    for (let t = 0; t < 300; t++) {
      match.step({ iori: t === 2 }, { axe: t === 0 });
      path.add(playing(f));
      for (const e of objects(match, 12269, 0)) shots.add(e.clip);
    }
    expect([...path]).toEqual(['idle', 12261, 12267]);
    expect(shots.size).toBeGreaterThan(0);
    expect(f.hp).toBe(480);
    expect(other.hp).toBeLessThan(LIFE);
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
    // RYUKO's moves his new entries replaced: MUSASHI (GIANT STEP), DRILL
    // (SHUWATCH), IORI and CPU IORI (BARRIER) and EX (RECHARGE).
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
        // HPA-1305's SPECIUM, SHUWATCH, BARRIER and GIANT STEP.
        RYUKO.exFire,
        11278,
        12261,
        14347,
      ]),
    );
    expect(lacks.filter((action) => moves.has(action))).toEqual([]);
  });
});

// HPA-1305: his chest lamp is variable 10 (spec.json lamp), 0 full and 30
// empty: SPECIUM (231) and RING (226) each add a charge's 10 on firing, an
// empty lamp's shot plays RECHARGE (ZOMA's reload, 13229) instead, which
// sets it back to 0, and a landed Chuck (197) gives one back. At his 30%
// line (144 of 480) shots are free and never recharge.
describe("SHUWA's lamp (HPA-1305)", () => {
  const LAMP = 10;
  // Presses `input` at each tick of `at` from `lamp`, `hp` life: the first
  // timeline each press entered and the lamp once it played out.
  function presses(
    at: number[],
    input: Input,
    { lamp = 0, hp = 0, gap = 300 } = {},
  ) {
    const { f, step } = duel('shuwa', 0, gap);
    if (hp) f.hp = hp;
    f.variables[LAMP] = lamp;
    const entered: unknown[] = [];
    const lamps: number[] = [];
    for (let t = 0; t <= at.at(-1)! + 95; t++) {
      if (at.includes(t - 1)) entered.push(playing(f));
      if (at.includes(t - 95)) lamps.push(f.variables[LAMP] ?? 0);
      step(at.includes(t) ? input : {});
    }
    return { entered, lamps };
  }
  const ring = { axe: true };

  it('spends a charge per RING; the fourth press plays RECHARGE, a refill', () => {
    expect(presses([2, 100, 200, 300, 400], ring)).toEqual({
      entered: [226, 226, 226, 13229, 226],
      lamps: [10, 20, 30, 0, 10],
    });
  });

  it('spends one on SPECIUM too, and its fourth press recharges', () => {
    const specium = motion('d f f+P');
    const { f, step } = duel('shuwa', 0, 300);
    const entered: unknown[] = [];
    for (let press = 0; press < 4; press++) {
      for (let t = 0; t < 120; t++) {
        step(specium(t));
        if (t === 7) entered.push(playing(f));
      }
      if (press < 3) expect(f.variables[LAMP]).toBe(10 * (press + 1));
    }
    expect(entered).toEqual([231, 231, 231, 13229]);
    expect(f.variables[LAMP]).toBe(0);
  });

  it('recharges from E or ↓↓G at any time, open while he does', () => {
    expect(presses([2], { ex: true }, { lamp: 10 })).toEqual({
      entered: [13229],
      lamps: [0],
    });
  });

  it('can be hit out of RECHARGE before the refill', () => {
    const { f, step } = duel('shuwa', 0, 80);
    f.variables[LAMP] = 30;
    const path: unknown[] = [];
    for (let t = 0; t < 120; t++) {
      step({ ex: t === 2 }, { punch: t === 20 });
      if (path.at(-1) !== playing(f)) path.push(playing(f));
    }
    expect(path).toEqual(['idle', 13229, 'hit', 'idle']);
    expect([lifeOf('shuwa') - f.hp, f.variables[LAMP]]).toEqual([10, 30]);
  });

  // Both spawn their shot into RYUKO's axe slot (6, busy 225). A press
  // while one flies plays the stand and costs nothing, but a motion still
  // in its 40-tick window fires once the shot is gone, as RYUKO's own fire
  // does.
  it('keeps one RING or SPECIUM out at a time', () => {
    const specium = motion('d f f+P');
    const late = (t: number) => specium(t - 48);
    for (const [first, second, path, lamp] of [
      [specium, (t: number) => ({ axe: t === 50 }), [231, 225], 10],
      [specium, late, [231, 225], 10],
      [(t: number) => ({ axe: t === 2 }), late, [226, 225, 231], 20],
    ] as const) {
      const { f, step } = duel('shuwa', 0, 900);
      const seen = new Set<unknown>();
      for (let t = 0; t < 120; t++) {
        step({ ...first(t), ...second(t) });
        seen.add(playing(f));
      }
      expect([...seen].filter((a) => typeof a === 'number')).toEqual(path);
      expect(f.variables[LAMP]).toBe(lamp);
    }
  });

  it('gives a charge back for a landed Chuck, never past full', () => {
    for (const [lamp, after] of [
      [20, 10],
      [0, 0],
    ]) {
      const { f, other, step } = duel('shuwa', 0, 80);
      f.variables[LAMP] = lamp;
      for (let t = 0; t < 250; t++) step({ throw: t === 0 });
      expect([f.variables[LAMP], LIFE - other.hp]).toEqual([after, 30]);
    }
  });

  it('shoots free at 30% life or less: no charge spent, no RECHARGE', () => {
    expect(presses([2, 100, 200, 300], ring, { hp: 144 })).toEqual({
      entered: [226, 226, 226, 226],
      lamps: [0, 0, 0, 0],
    });
    // An empty lamp at the line still shoots; one life above it recharges.
    expect(presses([2], ring, { hp: 144, lamp: 30 }).entered).toEqual([226]);
    expect(presses([2], ring, { hp: 145, lamp: 30 }).entered).toEqual([13229]);
  });

  it('blinks red at 30% life or less, on his drawings only', () => {
    const { match, f } = duel('shuwa');
    const lamp = lampOf('shuwa');
    expect(lamp).toMatchObject({
      variable: LAMP,
      step: 10,
      charges: 3,
      colors: [
        [0x68c8f8, 0xf88088],
        [0x1870d8, 0xe82028],
        [0x102868, 0xa81018],
      ],
    });
    // His drawings and the grafted moves', not RYUKO's effects he shows.
    expect(lamp!.images).toEqual(
      expect.arrayContaining([1, 467, 11293, 12235, 13117]),
    );
    expect(lamp!.images).not.toContain(308);
    f.hp = 145;
    expect([match.lampLow(f), match.lampRed(f)]).toEqual([false, false]);
    f.hp = 144;
    const red: boolean[] = [];
    for (let t = 0; t < 100; t++) {
      red.push(match.lampRed(f));
      match.step();
    }
    expect(match.lampLow(f)).toBe(true);
    // 25 ticks (250 ms) red, then 25 blue.
    expect(red.filter(Boolean)).toHaveLength(50);
    expect(red.slice(1).filter((on, t) => on !== red[t])).toHaveLength(3);
    expect(lampOf('ryuko')).toBeUndefined();
  });

  it('starts every round full', () => {
    const match = new Match('cpu', true, 1, ['shuwa', 'ryuko']);
    while (match.roundTicks <= match.fightTick) match.step();
    match.fighters[0].variables[LAMP] = 30;
    match.fighters[1].hp = 0;
    for (let t = 0; t < 5000 && match.round === 1; t++) match.step();
    // Each round seats new fighters (nextRound), their variables empty.
    expect(match.round).toBe(2);
    expect(match.fighters[0]).toMatchObject({ who: 'shuwa', variables: {} });
  });
});
