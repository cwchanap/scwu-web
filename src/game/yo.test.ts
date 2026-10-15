import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match, STAGE_WIDTH } from './match';
import type { Fighter, Input } from './match';
import { enter } from './testing';

const VELOCITY = (655 / 65536) * 1.5;

// Yo as player 1, `gap` from a standing opponent.
function yoPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['yo', opponent]);
  const [yo, other] = match.fighters;
  other.x = yo.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, yo, other, steps };
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
// A super entered with three stocks, run until both are back on their feet.
function superOn(move: number, gap: number, opponent: Who = 'ryuko') {
  const { match, yo, other } = yoPlayer(gap, opponent);
  yo.stock = 3;
  match.step();
  enter(match, yo, move);
  const life = other.hp;
  const mine = played(yo, () => match.step(), 600);
  return { yo, other, mine, damage: life - other.hp };
}

describe('Yo (09 YO.PLAYER)', () => {
  it('takes 480 life from her parameter block, desperate at 144', () => {
    expect([lifeOf('yo'), desperationOf('yo')]).toEqual([480, 144]);
    const { yo } = yoPlayer();
    expect(yo).toMatchObject({ who: 'yo', hp: 480, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.yo.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('yo')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([twin, own]) => twin !== own)).toEqual([]);
    // Her KOs at Ryuko's numbers, her reactions two after Zoma's, the twists
    // three, and Chuck Yo two.
    expect([twins[60], twins[73], twins[86], twins[87], twins[140]]).toEqual([
      60, 76, 90, 91, 142,
    ]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.yo.levels).toMatchObject({
      180: 21, // P1
      194: 22, // K J
      205: 31, // Run new
      238: 41, // rugal
      254: 42, // en300 start
    });
    const { yo, steps } = yoPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(yo).toMatchObject({ action: 'script', branch: 180, age: 0 });
  });

  it('carries the opponent to the wall with GIGA PRESS, whose wall handler slams them for 99', () => {
    for (const opponent of ['ryuko', 'zoma', 'chung', 'suneo'] as const) {
      const { match, yo, other } = yoPlayer(60, opponent);
      yo.stock = 3;
      match.step();
      enter(match, yo, 238);
      const life = other.hp;
      const mine: unknown[] = [];
      const theirs = played(
        other,
        () => {
          match.step();
          if (mine.at(-1) !== now(yo)) mine.push(now(yo));
        },
        600,
      );
      // rugal's box (PC 3270, 1 damage) enters Press Hit (239, PC 3267),
      // whose op 0x14 sends them off in Chuck Yo (response 73, PC 3294);
      // its wall handler (PC 3291) enters 239 + 15 at the wall, which
      // launches them with response 43 and takes 99 (PCs 3309–3310).
      // The flight drifts back past her (raw −100), so she turns.
      expect(mine.slice(0, 4)).toEqual([238, 239, '239+15', 'turn']);
      expect(theirs).toEqual([
        'idle',
        'chuckYo',
        'flySideWall',
        'fly',
        'knockdown',
        'getUp',
        'idle',
      ]);
      expect([life - other.hp, yo.stock]).toEqual([100, 2]);
    }
  });

  it('flies Chuck Yo flat out at raw 1100 (PC 1907) until the wall', () => {
    const { match, other } = yoPlayer(60);
    match.fighters[0].stock = 3;
    match.step();
    enter(match, match.fighters[0], 238);
    const flight: number[][] = [];
    for (let t = 0; t < 200; t++) {
      match.step();
      if (other.action === 'chuckYo')
        flight.push([other.vx / other.facing / VELOCITY, other.y]);
    }
    expect(new Set(flight.map(String))).toEqual(new Set(['-1100,-75']));
    expect(other.x).toBeLessThan(STAGE_WIDTH);
  });

  it('plays HIDDEN only below 144 life, entering TOFU (225) at or above it (PC 3361)', () => {
    const low = yoPlayer();
    low.match.practice.lowHealth = true;
    low.yo.stock = 3;
    low.steps({}, 2);
    low.steps({ musashi: true });
    expect([low.yo.hp, low.yo.branch]).toEqual([143, 245]);
    for (const [hp, result] of [
      [480, [225, 35, 3]],
      [143, [245, 100, 2]],
    ] as const) {
      const { match, yo, other } = yoPlayer(100);
      yo.hp = hp;
      yo.stock = 3;
      match.step();
      enter(match, yo, 245);
      const branch = yo.branch;
      for (let t = 0; t < 600; t++) match.step();
      // hidden come out's strikes: 15, 15 and 20, then 10, 10 and 30.
      expect([branch, 510 - other.hp, yo.stock]).toEqual(result);
    }
  });

  it("strikes 90 with snake's four boxes and 210 with en300's SHOOT for three stocks", () => {
    // snake super 2: 20, 15, 15 and 40.
    expect(superOn(235, 100)).toMatchObject({ damage: 90 });
    // SHOOT (258): 50, 60 and 100; en300 start takes three stocks (PC 3566).
    const en300 = superOn(254, 100);
    expect([en300.damage, en300.yo.stock]).toEqual([210, 0]);
  });

  it('bites with ZOMBI WALK for 35, healing her 20 up to her full life', () => {
    for (const [hp, stock, after] of [
      [300, 0, ['220+35', 320]],
      [470, 0, ['220+35', 480]],
      // With two stocks or more Zombi hit opens its super window (levels
      // 40–41, PC 3017) instead of skipping past it (220 + 35, PC 3016).
      [300, 3, ['idle', 320]],
    ] as const) {
      const { match, yo, other } = yoPlayer(100);
      yo.hp = hp;
      yo.stock = stock;
      match.step();
      enter(match, yo, 218);
      const seen = played(yo, () => match.step(), 700);
      // ZOMBI RP adds 2 a pass, seven passes (PC 3056), then the bite 6 and
      // takes 35 (PC 3011).
      expect([seen[2], yo.hp, 510 - other.hp]).toEqual([...after, 35]);
    }
  });

  it('rides in on her robot in her Vs. intro, then calls Demo Stand three times', () => {
    const match = new Match('cpu', true, 0, ['yo', 'zoma']);
    const yo = match.fighters[0];
    // Round 1 + 5: raw 110 for six 15-tick displays (PCs 378–385).
    expect(STAGE_WIDTH / 2 - 180 - yo.x).toBeCloseTo(110 * 90 * VELOCITY, 6);
    expect(animationDuration('intro', 'yo')).toBe(115 + 3 * 35);
    for (let t = 0; t < 115; t++) match.step({ crouch: true });
    // PC 388 spawns RObort (31), which drives off.
    expect(match.effects.map((e) => e.clip)).toContain(31);
    for (let t = 115; t < 220; t++) match.step({ crouch: true });
    expect(yo.action).toBe('idle');
    expect(yo.x).toBeCloseTo(STAGE_WIDTH / 2 - 180, 6);
    // No --TYPE CHANGE-- and no intro check: she has no EX mode.
    expect(exMode(yo)).toBe(false);
  });

  it('has no EX mode, so variable 0 at 100 changes nothing', () => {
    const { yo } = yoPlayer();
    yo.variables[0] = 100;
    expect(exMode(yo)).toBe(false);
    expect(faceImage(-1, 'yo')).toBe(2001);
  });

  it('wins with Demo Stand (29), then holds image 350 (PC 602)', () => {
    expect(
      [0, 35, 42, 50, 65, 500].map(
        (age) => animationFrame('win', age, 'yo').image,
      ),
    ).toEqual([113, 125, 348, 349, 350, 350]);
    expect(BLACK.yo.opaque.image).toBe(1009);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'yo']);
    const yo = match.fighters[1];
    const entered = new Set<unknown>();
    // Dragon, ZOMBI WALK and TOFU.
    const wanted = [208, 218, 225];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (yo.action === 'script') entered.add(yo.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
