import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import type { Action } from './animations';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { enter } from './testing';

// Giant as player 1, `gap` from a standing opponent.
function giantPlayer(gap = 90, opponent: Who = 'ryuko', vs = false) {
  const match = new Match(
    'practice',
    false,
    3,
    ['giant', opponent],
    'court',
    vs,
  );
  const [giant, other] = match.fighters;
  other.x = giant.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, giant, other, steps };
}
const until = (match: Match, done: () => boolean, limit = 3000) => {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    match.step();
  }
  throw new Error('never happened');
};
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

describe('Giant (07 GIANT.PLAYER)', () => {
  it('takes 550 life from his parameter block, desperate at 165', () => {
    expect([lifeOf('giant'), desperationOf('giant')]).toEqual([550, 165]);
    const { giant } = giantPlayer();
    expect(giant).toMatchObject({ who: 'giant', hp: 550, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.giant.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[id, twins[ryuko], responsesOf('giant')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 (Kiki's En300, ANMC P's jump fire ball) name
    // UNCOUNTER DOWN and Air Fire (126, 127) where Ryuko's name DOWN and J
    // atttack: copies of his 83 and 81 that clear variable 4.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [69, 83, 126],
      [70, 81, 127],
    ]);
    expect(CHARACTERS.giant.aliases).toEqual({ 126: 79, 127: 77 });
  });

  it("reads his own command table, entering each move's source action", () => {
    expect(CHARACTERS.giant.levels).toMatchObject({
      13: 30, // Dash F
      184: 21, // P1
      231: 31, // TO EX
      278: 31, // counter start
      305: 41, // Fire Start
      343: 41, // hariken start
      362: 42, // en300 start
    });
    const { giant, steps } = giantPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(giant).toMatchObject({ action: 'script', branch: 184, age: 0 });
  });

  it("counters a hit inside counter start's window with counter hit (279)", () => {
    for (const [press, result] of [
      [20, [530, 450, 279]],
      // PC 4282 has cleared variable 4: an ordinary hit, 120% (PC 4283).
      [90, [538, 510, 'hit']],
    ] as const) {
      const { match, giant, other, steps } = giantPlayer(100);
      steps({});
      enter(match, giant, 278);
      const seen = played(
        giant,
        (t) => steps({}, 1, t === press ? { punch: true } : {}),
        500,
      );
      // Ryuko's P1 strikes his 200% body (PC 4268), then his reaction's
      // first record jumps (PC 723); counter hit's grab (282) hides her in
      // Chuck 消える (143) before tossing her (PC 4342).
      expect([giant.hp, other.hp, seen[1]]).toEqual(result);
    }
  });

  it('enters counter hit only from the reactions that test variable 4', () => {
    const queue = (match: Match, f: Fighter, action: Action, own: number) =>
      (
        match as unknown as {
          queue(
            f: Fighter,
            a: Action,
            s: number,
            a2: number,
            p: number,
            o: number,
          ): void;
        }
      ).queue(f, action, 13, 13, 0, own);
    for (const [own, result] of [
      [83, ['script', 279]],
      // UNCOUNTER DOWN clears it (PC 1679) and plays its own records.
      [126, ['sweep', 126]],
    ] as const) {
      const { match, giant } = giantPlayer();
      giant.variables[4] = 100;
      queue(match, giant, 'sweep', own);
      match.step();
      expect([giant.action, giant.branch, giant.variables[4]]).toEqual([
        ...result,
        0,
      ]);
    }
  });

  it('sings to a chucked victim through GIANT!! MUSIC ATTACK (133), rolling its sound each pass', () => {
    const { match, giant, other, steps } = giantPlayer(90, 'ryuko', true);
    steps({}, 2);
    const sounds: number[] = [];
    const seen = played(
      other,
      (t) => {
        steps(t ? {} : { throw: true });
        for (const s of match.sounds)
          if (s.owner === 1 && s.index === 16) sounds.push(t);
      },
      900,
    );
    expect(seen).toEqual(['idle', 'superHeld', 'musicAttack', 'stun', 'fly']);
    // rand() % 31 > 1 skips sound 16 (PC 1803) on all but two of 78 passes.
    expect(sounds).toEqual([653, 793]);
    // The music explosion (228) strikes for 50 as PC 3291 enters his own
    // FLY NO HIT (101), which plays as the port's.
    expect([other.hp, giant.action]).toEqual([460, 'fly']);
    until(match, () => giant.action === 'knockdown');
  });

  it('spawns love heart (440) each pass of his own MUSIC ATTACK (PC 1944)', () => {
    const { match, other, steps } = giantPlayer(90, 'giant');
    steps({}, 2);
    steps({ throw: true });
    until(match, () => other.action === 'musicAttack');
    expect(animationDuration('musicAttack', 'giant')).toBe(4);
    const hearts = new Set();
    for (let t = 0; t < 40; t++) {
      match.step();
      for (const e of match.effects) if (e.clip === 440) hearts.add(e);
    }
    // The entry's and ten more.
    expect(hearts.size).toBe(11);
  });

  it('kicks through K3, or New K3 in EX mode (PC 2771); K3 hit knocks him into his own HISA (PC 2843)', () => {
    for (const [ex, moves] of [
      [0, [192, 193, 194, 196, 197, 'launchAway']],
      [100, [192, 193, 194, 201, 202]],
    ] as const) {
      const { giant, steps } = giantPlayer();
      giant.variables[0] = ex;
      steps({}, 2);
      const seen = played(
        giant,
        (t) => steps(t % 6 ? {} : { kick: true }),
        500,
      );
      expect(seen.slice(0, moves.length)).toEqual(moves);
    }
  });

  it('runs his own HISA’s stops and power entering it from K3 hit (PCs 890, 893)', () => {
    // K3 hit's last records credit him 6 three times and 5 (ages 210–220)
    // and apply TWIS HIT (response 32: 13 stops for each, 5 power to Ryuko
    // and 3 to him); HISA's op 0x1a adds 13 more to both, and its op 0x15
    // gives him 5 and Ryuko 3.
    const { giant, other, steps } = giantPlayer();
    steps({}, 2);
    let power: number[] = [];
    for (let t = 0; giant.action !== 'launchAway'; t++) {
      if (giant.branch === 197 && giant.age === 207)
        power = [giant.power, other.power];
      steps(t % 6 ? {} : { kick: true });
    }
    expect(power).toEqual([23, 8]);
    expect([giant.hitStop, other.hitStop]).toEqual([26, 26]);
    expect([giant.power, other.power]).toEqual([54, 16]);
  });

  it('drops a punch from the air with base ball (261), landing through 262 and 263', () => {
    const { giant, other, steps } = giantPlayer(150);
    steps({}, 2);
    const seen = played(
      giant,
      (t) => steps(t < 3 ? { jump: true } : t === 25 ? { axe: true } : {}),
      400,
    );
    expect(seen).toEqual(['takeoff', 'jump', 261, 262, 263, 'idle']);
    expect(other.hp).toBe(450);
  });

  it('toggles EX mode with --TYPE--: TO EX (231) sets variable 0 to 100 for half a stock, TO NORMAL clears it', () => {
    const { match, giant } = giantPlayer();
    giant.stock = 1;
    enter(match, giant, 231);
    expect([
      giant.variables[0],
      exMode(giant),
      giant.stock,
      giant.power,
    ]).toEqual([100, true, 0, 50]);
    until(match, () => giant.action === 'idle');
    enter(match, giant, 231);
    expect([giant.branch, giant.variables[0], exMode(giant)]).toEqual([
      232,
      0,
      false,
    ]);
  });

  it('enters EX mode with down held as his Vs. intro checks it (PC 328)', () => {
    expect(animationDuration('32+3', 'giant')).toBe(200);
    const match = new Match('cpu', true, 0, ['giant', 'zoma']);
    const giant = match.fighters[0];
    const { x } = giant;
    // 開始時 BR's 50-tick display comes first, as KGT 13's global 14 keeps it
    // (PC 305).
    for (let t = 0; t < 252; t++) match.step({ crouch: t >= 190 });
    // Round 1 (33) has no op 0x01: he stands where he starts. Chung Style
    // (37) sets variable 0 (PC 367) and jumps back (PC 368).
    expect([giant.action, giant.x, exMode(giant)]).toEqual(['idle', x, true]);
  });

  it('wins with Demo Stand (28), then loops PCs 560–563', () => {
    expect(
      [0, 50, 55, 70, 140, 175, 220, 275, 330].map(
        (age) => animationFrame('win', age, 'giant').image,
      ),
    ).toEqual([113, 120, 153, 194, 196, 195, 196, 194, 196]);
    expect(BLACK.giant.opaque.image).toBe(1009);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const entered = new Set<unknown>();
    // H PUNCH, base ball and counter, over two seeds.
    const wanted = [254, 235, 278];
    for (const seed of [0, 3]) {
      const match = new Match('cpu', false, seed, ['ryuko', 'giant']);
      const giant = match.fighters[1];
      for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (giant.action === 'script') entered.add(giant.branch);
      }
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
