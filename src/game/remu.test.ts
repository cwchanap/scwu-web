import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

// REMU as player 1, `gap` from a standing opponent as player 2.
function remuPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['remu', opponent]);
  const [remu, other] = match.fighters;
  other.x = remu.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, remu, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until he is
// back on his feet: REMU's actions, the opponent's, the objects he spawned
// and the damage each took.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    hp = 0,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { match, remu, other, steps } = remuPlayer(gap);
  remu.stock = stock;
  if (hp) remu.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(remu)) mine.push(now(remu));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
    for (const e of match.effects) objects.add(e.clip);
  }
  return {
    remu,
    mine,
    yours,
    objects,
    damage: lifeOf('ryuko') - other.hp,
    taken: (hp || lifeOf('remu')) - remu.hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('REMU (23 REMU.PLAYER)', () => {
  it('takes 480 life from his parameter block, desperate at 144', () => {
    expect([lifeOf('remu'), desperationOf('remu')]).toEqual([480, 144]);
    const { remu } = remuPlayer();
    expect(remu).toMatchObject({ who: 'remu', hp: 480, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.remu.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('remu')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (129, 130)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 85, 129],
      [77, 83, 130],
    ]);
    expect(CHARACTERS.remu.aliases).toEqual({ 129: 79, 130: 77 });
    // Two after Ryuko's KOs, six after his first hits, seven from BEAM
    // Stand, six from Shock, eight from Clothes off500, sixteen for FB, five
    // from HISO stop and ten from Pull Back.
    expect(
      [60, 73, 83, 88, 90, 104, 110, 113, 121, 140, 149].map((r) => twins[r]),
    ).toEqual([62, 79, 90, 95, 96, 112, 126, 118, 131, 150, 159]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.remu.levels).toMatchObject({
      188: 21, // P1
      212: 22, // K J
      233: 31, // SLASH START
      244: 31, // CALL JET
      256: 31, // CALL DRILL
      275: 31, // new tasu start
      284: 31, // BAKURETU START
      289: 31, // air slash start
      310: 41, // Thander start
      317: 41, // Phso driver start
      329: 41, // NANAMI start
      347: 42, // GOLD HAND
    });
    const { remu, steps } = remuPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(remu).toMatchObject({ action: 'script', branch: 188, age: 0 });
  });

  it('chains J and K through P1 Hit or K1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    // P3's grab beats the victim through p3 hit (192) into P3 FIN (194).
    expect(
      play(
        presses({
          0: { punch: true },
          14: { punch: true },
          45: { punch: true },
        }),
      ),
    ).toMatchObject({
      mine: [188, 189, 190, 191, 192, 'land', 'idle'],
      damage: 70,
    });
    expect(
      play(
        presses({
          0: { punch: true },
          14: { kick: true },
          45: { kick: true },
        }),
      ),
    ).toMatchObject({
      mine: [188, 189, 200, 201, 203, '202+13', 'idle'],
      damage: 60,
    });
    expect(
      play(
        presses({
          0: { kick: true },
          18: { kick: true },
          50: { punch: true },
        }),
      ),
    ).toMatchObject({
      // K2's lunge resumes a tick before Ryuko's slide (struck, he steps
      // first and spends his stop a tick later), so P3's grab falls short.
      mine: [198, 199, 200, 191, '202+13', 'turn', 'idle'],
      damage: 35,
    });
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [223, 224, 'idle'],
      damage: 40,
    });
  });

  it('plays his specials: tatsumaki, slash, JET, Drill, air slash and BAKURETU', () => {
    for (const [key, mine, damage, object] of [
      [{ drill: true }, [275, 'idle'], 36, 274],
      [{ axe: true }, [233, 234, 'turn', 'idle'], 35, 232],
      [{ iori: true }, [244, 'idle'], 25, 246],
      [{ dst: true }, [256, 'idle'], 28, 259],
      [{ changeAttack: true }, [284, 'idle'], 60, 285],
    ] as const) {
      const move = byKey(key);
      expect(move).toMatchObject({ mine, damage });
      expect(move.objects).toContain(object);
      // BAKURETU is a special: no stock.
      expect(move.remu.stock).toBe(3);
    }
    expect(
      play(presses({ 0: { jump: true }, 30: { axe: true } }), { gap: 120 }),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 289, 291, 292, 'turn', 'idle'],
      damage: 30,
    });
    // Its hit lands into air slash lend hit (292), which sets variable 4 to
    // 10 (PC 4278) for SLASH START's Slash cancel ver (235, PC 3424) until
    // it clears it (PC 4290).
    const follow = (at: number) =>
      play(
        presses({ 0: { jump: true }, 30: { axe: true }, [at]: { axe: true } }),
        {
          gap: 120,
        },
      );
    expect(follow(70)).toMatchObject({
      mine: ['takeoff', 'jump', 289, 291, 292, 235, 236, 'turn', 'idle'],
      damage: 45,
    });
    expect(follow(120).mine.slice(4)).toEqual([292, 233, 'idle']);
  });

  it('spends a stock on Thander p and Phsy driver, three on GOLD HAND, which dives past a near opponent', () => {
    for (const [key, gap, mine, damage, left] of [
      ['megaBeam', 90, [310, 313, 'idle'], 90, 2],
      ['blackRush', 90, [317, 319, '319+14', 321, 324, 'idle'], 120, 2],
      ['getterBeam', 300, [347, 348, 349, 356, 'idle'], 221, 0],
      ['getterBeam', 90, [347, '347+32', 'turn', 'idle'], 0, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.remu.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
  });

  it('plays MINAMI as CALL DRILL at 156 life or more (op 0x11, PC 4745), else a counter through variable 4 at 100 (PCs 809, 4757)', () => {
    expect(byKey({ musashi: true })).toMatchObject({
      mine: [256, 'idle'],
      damage: 28,
    });
    expect(byKey({ musashi: true }).remu.stock).toBe(3);
    const counter = (at: number) =>
      play(presses({ 0: { musashi: true } }), {
        hp: 120,
        gap: 120,
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    // Struck in NANAMI start's 100 ticks (PCs 4757–4763), NANAMI hit (332);
    // its body takes 30% (op 0x19 r[11], PC 4755), then 60% at 144 life.
    const hit = counter(20);
    expect(hit).toMatchObject({
      mine: [329, 332, 333, '332+29', 'idle'],
      damage: 89,
      taken: 1,
    });
    expect(hit.remu.stock).toBe(2);
    expect(counter(110)).toMatchObject({
      mine: [329, 'hit', 'idle'],
      damage: 0,
      taken: 7,
    });
  });

  it('cancels tatsumaki into the supers through SC SUPER (305), for two stocks, as its variable 6 at 100 allows (PCs 4025, 4418, 4567, 4744)', () => {
    const cancel = (key: Input, at: number, hp = 0) =>
      play(presses({ 0: { drill: true }, [at]: key }), { hp });
    const thander = cancel({ megaBeam: true }, 40);
    expect([thander.mine, thander.damage, thander.remu.stock]).toEqual([
      [275, 305, 313, 'idle'],
      108,
      1,
    ]);
    const phsy = cancel({ blackRush: true }, 10);
    expect([phsy.mine, phsy.damage, phsy.remu.stock]).toEqual([
      [275, '305+5', 319, '319+14', 321, 324, 'idle'],
      129,
      1,
    ]);
    // At 156 life or more, SC SUPER's own op 0x11 (PC 4389) enters No super
    // (302).
    const minami = cancel({ musashi: true }, 10);
    expect([minami.mine.slice(0, 2), minami.remu.stock]).toEqual([
      [275, 302],
      3,
    ]);
    expect(cancel({ musashi: true }, 10, 120).remu.stock).toBe(1);
  });

  it('rolls his Vs. intro voice (PCs 396, 399), rises, sinks, soars and falls, charged to two stocks', () => {
    const runs = [0, 1, 6].map((seed) => brIntro('remu', seed));
    // Round 1's rand % 4 > 1 (PC 396) enters 36 + 8, whose rand % 3 > 1 (PC
    // 399) enters 36 + 11: voices 5, 6 or 4 (PCs 397, 400, 402).
    expect(runs.map(({ path, sounds }) => [path, sounds[0]])).toEqual([
      [
        [33, 35, '36+44'],
        [52, 5],
      ],
      [
        [33, 35, '36+8', '36+44'],
        [52, 6],
      ],
      [
        [33, 35, '36+11', '36+44'],
        [52, 4],
      ],
    ]);
    const [{ ticks, f }] = runs;
    const heights = runs[0].heights.map((y) => y / 1.5);
    // After 開始時's (33) blank display, 300 source pixels up; KGT 13's
    // global 14 fails 開始時 BR's jump to + 10 (PC 379), so he stops there
    // through seven calls of 40 (PCs 382–383). Then 280 down, then 989 up and
    // back, a tick past the floor before the landing (0x41187f) enters 36 +
    // 44 (slot 1, PC 430).
    expect(heights[2]).toBeCloseTo(-299.835, 3);
    expect(heights[51]).toBe(heights[2]);
    expect(heights[121]).toBeCloseTo(-19.99, 2);
    expect(Math.min(...heights)).toBeCloseTo(-1009.445, 2);
    expect([
      heights[294] < 0,
      heights[295] > 0,
      heights[296],
      f.x,
      f.stock,
      ticks,
    ]).toEqual([true, true, 0, 390 * 1.5, 2, 332]);
  });

  it('wins after two calls of stand demo, then flies up at raw −1450 (PC 651); holds his draw and shows face 2001', () => {
    expect(
      [0, 105, 106, 116, 2000].map(
        (age) => animationFrame('win', age, 'remu').image,
      ),
    ).toEqual([115, 116, 137, 138, 138]);
    const match = new Match('practice', false, 0, ['remu', 'ryuko']);
    const [remu, ryuko] = match.fighters;
    ryuko.hp = 0;
    ryuko.action = 'koLand';
    match.winner = 'player';
    const heights: Record<number, number> = {};
    while (remu.action !== 'win') match.step();
    for (let t = 0; t < 2000 && remu.age < 130; t++) {
      match.step({});
      heights[remu.age] = remu.y / 1.5;
    }
    expect(heights[115]).toBe(0);
    expect(heights[116]).toBeCloseTo(-14.49, 2);
    expect(heights[117]).toBeCloseTo(-28.98, 2);
    expect(
      [53, 61, 1000].map((age) => animationFrame('draw', age, 'remu').image),
    ).toEqual([145, 419, 419]);
    expect(BLACK.remu.opaque.image).toBe(1009);
    expect(faceImage(-1, 'remu')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'remu']);
    const remu = match.fighters[1];
    const entered = new Set<unknown>();
    // CALL JET, SLASH START, new tasu start and BAKURETU START.
    const wanted = [244, 233, 275, 284];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (remu.action === 'script') entered.add(remu.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
