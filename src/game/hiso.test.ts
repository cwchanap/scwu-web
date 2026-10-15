import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import type { Action } from './animations';

// HISO as player 1, `gap` from a standing opponent as player 2.
function hisoPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['hiso', opponent]);
  const [hiso, other] = match.fighters;
  other.x = hiso.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, hiso, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until he is
// back on his feet: HISO's actions, the opponent's, and the damage dealt.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    opponent = 'ryuko' as Who,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { hiso, other, steps } = hisoPlayer(gap, opponent);
  hiso.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(hiso)) mine.push(now(hiso));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
  }
  return { hiso, other, mine, yours, damage: lifeOf(opponent) - other.hp };
}
const byKey = (key: Input, options = {}) =>
  play((t) => (t ? {} : key), options);

describe('HISO (17 HISO.PLAYER)', () => {
  it('takes 480 life from his parameter block, desperate at 144', () => {
    expect([lifeOf('hiso'), desperationOf('hiso')]).toEqual([480, 144]);
    const { hiso } = hisoPlayer();
    expect(hiso).toMatchObject({ who: 'hiso', hp: 480, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.hiso.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('hiso')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (127, 128)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 85, 127],
      [77, 83, 128],
    ]);
    expect(CHARACTERS.hiso.aliases).toEqual({ 127: 79, 128: 77 });
    // Ryuko's KOs, six after her hits, seven from BEAM Stand to SHOCK
    // INFINITY, six from Shock but for FBB and FBH, which swap, then eight.
    expect(
      [60, 73, 83, 88, 90, 111, 112, 113, 121, 149].map((r) => twins[r]),
    ).toEqual([60, 79, 90, 95, 96, 118, 117, 119, 129, 157]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.hiso.levels).toMatchObject({
      186: 21, // P1
      208: 22, // K J
      228: 31, // Fire
      252: 31, // GUN SHOT START
      273: 41, // S SHOOT
      304: 42, // en300 START
    });
    const { hiso, steps } = hisoPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(hiso).toMatchObject({ action: 'script', branch: 186, age: 0 });
  });

  it('plays his specials: Dragon p (also in the air), bannaku, FIRE, striker and counter', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [234, 235, 'idle'], 27],
      [{ iori: true }, [240, 'idle'], 28],
      [{ axe: true }, [228, 'idle'], 25],
      [{ megaBeam: true }, [252, 'idle'], 15],
      [{ dst: true }, [243, 'idle'], 0],
    ] as const)
      expect(byKey(key)).toMatchObject({ mine, damage });
    const air = play((t) =>
      t === 0 ? { jump: true, right: true } : t === 12 ? { drill: true } : {},
    );
    expect(air).toMatchObject({
      mine: ['takeoff', 'jump', 233, 235, 'idle'],
      damage: 32,
    });
  });

  it('spends a stock on FISH, fly arm and S Shoot, and three on en300', () => {
    for (const [key, gap, mine, damage, stock] of [
      // Fish hit (295) up close; FISH FAR (298) whiffs.
      ['getterBeam', 90, [289, 295, 'idle'], 80, 2],
      ['getterBeam', 300, [298, 'idle'], 0, 2],
      ['changeAttack', 90, [278, 279, 'idle'], 100, 2],
      ['changeAttack', 300, [278, 'idle'], 0, 2],
      ['blackRush', 300, [273, 'idle'], 110, 2],
      ['musashi', 300, [304, 305, '350+9', 'idle'], 231, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.hiso.stock]).toEqual([
        mine,
        damage,
        stock,
      ]);
    }
  });

  it('cancels bannaku into a super through SC SUPER (268) for two stocks (variable 6 at 100, PC 3591)', () => {
    const cancelled = play((t) =>
      t === 0 ? { iori: true } : t === 20 ? { blackRush: true } : {},
    );
    // 28 from bannaku, then S Shoot's 110 (268 jumps to S SHOOT + 5).
    expect([cancelled.mine, cancelled.damage, cancelled.hiso.stock]).toEqual([
      [240, 268, 'idle'],
      138,
      1,
    ]);
  });

  it("answers a strike in Counter start's 30 ticks with Counter Get (244, variable 4 at 100)", () => {
    const struck = (at: number) =>
      play((t) => (t ? {} : { dst: true }), {
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    // Its Machine gun man (246, PC 3664) fires back for 30.
    expect(struck(3)).toMatchObject({ mine: [243, 244, 'idle'], damage: 30 });
    // PC 3640 has cleared variable 4: an ordinary hit.
    expect(struck(34)).toMatchObject({ mine: [243, 'hit', 'idle'], damage: 0 });
  });

  it("stops whom GUN SHOT's shot meets (response 64, HISO stop): 36 ticks, then the heavy hit's slide; KAY's 33 (PC 1559)", () => {
    for (const [opponent, slides] of [
      ['ryuko', 57],
      ['kay', 54],
    ] as const) {
      const shot = byKey({ megaBeam: true }, { gap: 250, opponent });
      expect([shot.yours, shot.damage]).toEqual([
        ['idle', 'hisoStop', 'idle'],
        15,
      ]);
      // 15 stop ticks, then 36 (KAY's 33) + 3 + 3 still (PCs 1466–1468).
      const { other, steps } = hisoPlayer(250, opponent);
      steps({}, 2);
      let start = -1;
      let moved = -1;
      for (let t = 0; t < 200; t++) {
        steps(t ? {} : { megaBeam: true });
        if (other.action !== 'hisoStop') continue;
        if (start < 0) start = t;
        if (moved < 0 && other.vx) moved = t - start;
      }
      // Struck at tick 95, it enters the reaction at its next step.
      expect([start, moved]).toEqual([96, slides]);
    }
  });

  it('hangs an airborne victim still 42 ticks in HISO stop air (op 0x16, PC 1455), then the heavy air launch', () => {
    const theirs = (t: number) => (t === 80 ? { jump: true } : {});
    const shot = play((t) => (t ? {} : { megaBeam: true }), {
      gap: 250,
      theirs,
    });
    expect([shot.yours, shot.damage]).toEqual([
      [
        'idle',
        'takeoff',
        'jump',
        'airHisoStop',
        'airHitHeavy',
        'jump',
        'land',
        'idle',
      ],
      15,
    ]);
    const entered: Record<string, number> = {};
    const at = new Set<number>();
    const { other, steps } = hisoPlayer(250);
    steps({}, 2);
    for (let t = 0; t < 200; t++) {
      steps(t ? {} : { megaBeam: true }, 1, theirs(t));
      entered[other.action] ??= t;
      if (other.action === 'airHisoStop') at.add(other.x).add(other.y);
    }
    expect(entered.airHitHeavy - entered.airHisoStop).toBe(57);
    expect(at.size).toBe(2);
  });

  it("hangs Ryuko's own ICE Punch Air and HISO stop air from their scripts", () => {
    for (const action of ['airIcePunch', 'airHisoStop'] as const) {
      const match = new Match('practice', false, 3, ['hiso', 'ryuko']);
      const ryuko = match.fighters[1];
      ryuko.y = -150;
      (
        match as unknown as {
          queue(f: Fighter, a: Action, s: number, a2: number): void;
        }
      ).queue(ryuko, action, 0, 0);
      for (let t = 0; t < 42; t++) match.step();
      expect([ryuko.action, ryuko.age, ryuko.y]).toEqual([action, 41, -150]);
      match.step();
      expect([ryuko.action, ryuko.age]).toEqual(['airHitHeavy', 6]);
    }
  });

  it('checks Hit Up at the end of his guard (PC 2209), not at 18 as Giant does', () => {
    // Ryuko's P1 meets his guard at tick 8, which stops 10 ticks.
    const guarded = (press: number) => {
      const match = new Match('practice', false, 3, ['ryuko', 'hiso']);
      const [ryuko, hiso] = match.fighters;
      hiso.x = ryuko.x + 90;
      hiso.stock = 1;
      match.step({}, {});
      match.step({}, {});
      for (let t = 0; t < 120; t++) {
        match.step(t ? {} : { punch: true }, {
          guard: true,
          hitUp: t === press,
        });
        if (hiso.action === 'script') return [t, hiso.branch, hiso.stock];
      }
      return null;
    };
    // The age-8 check (tick 26) reads ticks 17–26, the age-28 one (tick 46)
    // ticks 37–46; COUNTER HIT is 182.
    expect([25, 26, 27, 36, 37, 46].map(guarded)).toEqual([
      [26, 182, 0],
      [26, 182, 0],
      null,
      null,
      [46, 182, 0],
      [46, 182, 0],
    ]);
  });

  it('stands through his 200-tick Vs. intro from 開始時 BR + 3 (PC 332)', () => {
    expect(animationDuration('intro', 'hiso')).toBe(200);
    expect(
      [0, 10, 60, 199].map((age) => animationFrame('intro', age, 'hiso').image),
    ).toEqual([414, 415, 419, 414]);
    const match = new Match('cpu', true, 0, ['hiso', 'zoma']);
    const hiso = match.fighters[0];
    const x = hiso.x;
    while (hiso.action === 'intro') match.step({});
    // OP super Charge (38, PC 333) charges two stocks.
    expect([hiso.x, hiso.stock]).toEqual([x, 2]);
  });

  it('wins holding image 436 (PC 603), draws holding 201, and shows face 2001', () => {
    expect(
      [0, 80, 1000].map((age) => animationFrame('win', age, 'hiso').image),
    ).toEqual([117, 425, 436]);
    expect(animationFrame('draw', 1000, 'hiso').image).toBe(201);
    expect(BLACK.hiso.opaque.image).toBe(1009);
    expect(faceImage(-1, 'hiso')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'hiso']);
    const hiso = match.fighters[1];
    const entered = new Set<unknown>();
    // Fire, Dragon start, KNIFE START and GUN SHOT START.
    const wanted = [228, 234, 240, 252];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (hiso.action === 'script') entered.add(hiso.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
