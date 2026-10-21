import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro, enter } from './testing';

// G Suneo as player 1, `gap` from a standing opponent.
function suneoPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['suneo', opponent]);
  const [suneo, other] = match.fighters;
  other.x = suneo.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, suneo, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// The actions a fighter plays over `ticks`, each once in order.
function played(f: Fighter, step: (t: number) => void, ticks: number) {
  const seen: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    step(t);
    if (seen.at(-1) !== now(f)) seen.push(now(f));
  }
  return seen;
}

describe('G Suneo (08 G SUNEO.PLAYER)', () => {
  it('takes 500 life from her parameter block, desperate at 150', () => {
    expect([lifeOf('suneo'), desperationOf('suneo')]).toEqual([500, 150]);
    const { suneo } = suneoPlayer();
    expect(suneo).toMatchObject({ who: 'suneo', hp: 500, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.suneo.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('suneo')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([twin, own]) => twin !== own)).toEqual([]);
    // KO NORMAL ten after Ryuko's, her light hit twelve, J Att thirteen
    // and Chuck 消える eleven.
    expect([twins[60], twins[73], twins[77], twins[143]]).toEqual([
      70, 85, 90, 154,
    ]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.suneo.levels).toMatchObject({
      189: 21, // P 1
      201: 10, // K SIT NEW
      235: 31, // TO EX
      258: 31, // G DRIVER START
      281: 41, // BP START
      311: 42, // En 300 start
      345: 42, // HH Start
    });
    const { suneo, steps } = suneoPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(suneo).toMatchObject({ action: 'script', branch: 189, age: 0 });
  });

  it('kicks through K2 NEW, or k 2 in EX mode (PC 2604), into K3', () => {
    for (const [ex, moves] of [
      [0, [193, 194, 195, 197, '197+19']],
      [100, [193, 194, 196, 197, '197+19']],
    ] as const) {
      const { suneo, steps } = suneoPlayer();
      suneo.variables[0] = ex;
      steps({}, 2);
      const seen = played(
        suneo,
        (t) => steps(t % 6 ? {} : { kick: true }),
        500,
      );
      expect(seen.slice(0, moves.length)).toEqual(moves);
    }
  });

  it('plays hh only below 150 life with three stocks, for 250, as Low health holds her', () => {
    const low = suneoPlayer();
    low.match.practice.lowHealth = true;
    low.suneo.stock = 3;
    low.steps({}, 2);
    low.steps({ getterBeam: true });
    expect([low.suneo.hp, low.suneo.branch]).toEqual([149, 345]);
    for (const [hp, stock, result] of [
      [500, 3, [276, 'idle', 510, 3]],
      [140, 2, [276, 'idle', 510, 2]],
      [140, 3, [345, 346, 260, 0]],
    ] as const) {
      const { match, suneo, other } = suneoPlayer(100);
      suneo.hp = hp;
      suneo.stock = stock;
      match.step();
      enter(match, suneo, 345);
      const seen = played(suneo, () => match.step(), 1400);
      // Op 0x11 (PC 5436) enters no super at 150 or more, op 0x10 (PC
      // 5438) at two stocks or fewer; it takes one, and op 0x15 200 power
      // (PC 5455). Its stage-wide box (PC 5454) shocks for 1 and its hit
      // handler enters HH hit (346), which hides the opponent (response 81)
      // through the beating and takes 249 (PC 5548).
      expect([...seen.slice(0, 2), other.hp, suneo.stock]).toEqual(result);
    }
  });

  it('shocks with EX D Driver through ERUS INATUMA (118), off the floor through its AIR form (120)', () => {
    for (const [air, actions] of [
      [false, ['idle', 'inatuma', 'idle']],
      [true, ['jump', 'airInatuma', 'airHitHeavy', 'jump', 'land', 'idle']],
    ] as const) {
      const { match, suneo, other } = suneoPlayer(60);
      suneo.stock = 3;
      suneo.variables[0] = 100;
      match.step();
      enter(match, suneo, 258);
      const x: number[] = [];
      const seen = played(
        other,
        (t) => {
          if (air && t < 30) [other.y, other.vy] = [-20, 0];
          match.step();
          if (other.action === 'inatuma') x.push(other.x);
        },
        200,
      );
      // G DRIVER START enters D Driver Start (261) in EX mode (PC 3872),
      // whose box answers response 68 (PC 3945).
      expect([seen, other.hp]).toEqual([actions, 490]);
      // Shocked through seven calls of its rp (PC 1554), then sliding back
      // at raw −650 (PC 1557).
      if (!air) expect([x[56], x[57] > x[56]]).toEqual([x[0], true]);
    }
  });

  it('grabs with GP, beats the opponent hidden in Chuck 消える (143), then launches them for 60', () => {
    const { match, suneo, other } = suneoPlayer(40);
    suneo.stock = 3;
    match.step();
    enter(match, suneo, 300);
    const seen = played(other, () => match.step(), 700);
    // GP HIT (301) grabs with response 30 (PC 4617), reapplies 81 through
    // GP HIT 2 (302), then places them with 76 and strikes with 63 (PCs
    // 4669–4671), 'ヒット DRAGON Fireball'.
    expect(seen).toEqual([
      'idle',
      'superHeld',
      'vanish',
      'rushAirHit',
      'uppercut',
      'knockdown',
      'getUp',
      'idle',
    ]);
    expect(other.hp).toBe(450);
  });

  it("strikes three times with BP's fist (284–286): 50, 30 and 20", () => {
    const { match, suneo, other } = suneoPlayer(300);
    suneo.stock = 3;
    match.step();
    enter(match, suneo, 281);
    const hp: number[] = [];
    for (let t = 0; t < 400; t++) {
      match.step();
      if (hp.at(-1) !== other.hp) hp.push(other.hp);
    }
    expect(hp).toEqual([510, 460, 430, 410]);
    expect(suneo.stock).toBe(2);
  });

  it('toggles EX mode with --TYPE CHANGE--: TO EX (235) sets variable 0 to 100 for half a stock, TO NORMAL clears it', () => {
    const { match, suneo } = suneoPlayer();
    suneo.stock = 1;
    enter(match, suneo, 235);
    expect([
      suneo.variables[0],
      exMode(suneo),
      suneo.stock,
      suneo.power,
    ]).toEqual([100, true, 0, 50]);
    for (let t = 0; t < 200 && suneo.action !== 'idle'; t++) match.step();
    enter(match, suneo, 235);
    expect([suneo.branch, suneo.variables[0], exMode(suneo)]).toEqual([
      236,
      0,
      false,
    ]);
  });

  it('enters EX mode with down held as her Vs. intro checks it (PC 403), ending on 開始時 BR + 16 (PC 410)', () => {
    // 開始時 BR's two 2-tick displays (PCs 382, 384) come first.
    expect(animationDuration('34+7', 'suneo')).toBe(204);
    for (const crouch of [false, true]) {
      // After 開始時's (32) blank display; change character (41) sets
      // variable 0 (PC 463) and jumps back (PC 464), and Round 1's test of it
      // (PC 410) then ends on BR's last pose (34 + 16, PC 390), 113 in
      // place of 194.
      const { path, ticks, f, images } = brIntro('suneo', 0, (t) =>
        crouch && t >= 150 ? { crouch: true } : {},
      );
      expect([path, ticks, f.x, exMode(f), images.at(-1)]).toEqual([
        [32, '34+7', ...(crouch ? [41, '34+16'] : [])],
        206,
        390 * 1.5,
        crouch,
        crouch ? 113 : 194,
      ]);
    }
  });

  it('wins with Demo stand (49), then win talk (67) seven times', () => {
    expect(
      [0, 62, 87, 97, 102, 117, 290, 312, 500].map(
        (age) => animationFrame('win', age, 'suneo').image,
      ),
    ).toEqual([621, 113, 415, 416, 418, 416, 418, 416, 416]);
    expect(BLACK.suneo.opaque.image).toBe(1009);
  });

  it("shows HUD face 2006 for 2001's turns in EX mode (PCs 845–863)", () => {
    expect(
      [-1, 0, 40, 80, 120].map((face) => faceImage(face, 'suneo')),
    ).toEqual([2001, 2002, 2006, 2000, 2006]);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'suneo']);
    const suneo = match.fighters[1];
    const entered = new Set<unknown>();
    // FIRE BALL, G DRIVER and GALION.
    const wanted = [238, 258, 263];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (suneo.action === 'script') entered.add(suneo.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
