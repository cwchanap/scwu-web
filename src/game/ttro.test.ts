import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// TTRO as player 1, `gap` from a standing Ryuko as player 2.
function ttroPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['ttro', 'ryuko']);
  const [ttro, other] = match.fighters;
  other.x = ttro.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, ttro, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { ttro, other, steps } = ttroPlayer(gap);
  ttro.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 1500; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(ttro)) mine.push(now(ttro));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: ttro.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const sounds = (action: 'win' | 'draw', age: number) =>
  animationFrame(action, age, 'ttro')
    .events?.filter((e) => e.op === 'sound')
    .map((e) => (e.op === 'sound' ? e.index : 0));

describe('TTRO (39 TTRO.PLAYER)', () => {
  it('takes 820 life from his parameter block, desperate at 246', () => {
    expect([lifeOf('ttro'), desperationOf('ttro')]).toEqual([820, 246]);
    const { ttro } = ttroPlayer();
    expect(ttro).toMatchObject({ who: 'ttro', hp: 820, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.ttro.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('ttro')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.ttro.aliases).toEqual({});
    // Level with Ryuko's KOs, one after her reactions, two for SHOCK
    // INFINITY, level again past her Chuck Hiso, and his guards packed.
    expect(
      [59, 60, 73, 74, 75, 88, 104, 128, 140, 145, 149, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([59, 60, 74, 75, 76, 90, 105, 129, 140, 145, 149, 162]);
    expect(animationDuration('getUp', 'ttro')).toBe(30);
    expect(animationDuration('blockHeavy', 'ttro')).toBe(32);
    expect(animationDuration('musicAttack', 'ttro')).toBe(10);
    // Chuck Yo holds its pose 70 ticks (PC 1712) to Ryuko's 5; HISA Down
    // Down skips her 20-tick pose (PC 1508).
    expect([
      animationDuration('chuckYo', 'ttro'),
      animationDuration('chuckYo'),
    ]).toEqual([70, 5]);
    expect([
      animationDuration('slamBounce', 'ttro'),
      animationDuration('slamBounce'),
    ]).toEqual([11, 31]);
  });

  it('reads his command table; Hit Up names nothing', () => {
    expect(CHARACTERS.ttro.levels).toEqual({
      10: 255, // J 2
      11: 255, // J 2 F
      12: 255, // J 2 B
      13: 30, // DASH F
      14: 10, // DASH B
      17: 254, // DASH A F
      18: 254, // DASH A B
      166: 21, // P
      170: 21, // K
      171: 21, // P J
      174: 21, // K J
      177: 21, // P sit
      179: 10, // Chuck
      183: 31, // DASH PUNCH
      184: 31, // DASH KICK
      186: 31, // CC far
      187: 10, // CC start
      195: 31, // Fire start
      203: 10, // SCC FAR
      204: 10, // super cc start
      217: 41, // SP FIRE START
      225: 10, // EN 300 st
    });
    expect(byKey({ hitUp: true }, { gap: 60 })).toEqual({
      mine: ['idle'],
      damage: 0,
      stock: 3,
    });
  });

  it('swipes with P, claws with K, standing or crouching, hops with P sit, and strikes in the air', () => {
    for (const gap of [60, 200]) {
      expect(byKey({ punch: true }, { gap })).toEqual({
        mine: [166, 'idle'],
        damage: 33,
        stock: 3,
      });
      for (const key of [{ kick: true }, { kick: true, crouch: true }])
        expect(byKey(key, { gap })).toEqual({
          mine: [170, 'idle'],
          damage: 35,
          stock: 3,
        });
    }
    // P sit hops (PC 2203) and lands in 177 + 20.
    expect(byKey({ punch: true, crouch: true })).toEqual({
      mine: [177, '177+20', 'idle'],
      damage: 30,
      stock: 3,
    });
    // P J's swipe sits at his chest (PC 2061), over a standing foe's head.
    expect(play(presses({ 0: { jump: true }, 50: { punch: true } }))).toEqual({
      mine: ['takeoff', 'jump', 171, 'land', 'idle'],
      damage: 0,
      stock: 3,
    });
    expect(play(presses({ 0: { jump: true }, 30: { kick: true } }))).toEqual({
      mine: ['takeoff', 'jump', 174, 'land', 'idle'],
      damage: 30,
      stock: 3,
    });
    // Each tests variable 1 (PCs 2042–2043, 2123–2124): 10 after J 2 (PC
    // 104) into its 2 form, 20 after an air dash (PC 197) into its D form.
    expect(
      play(
        presses({ 0: { jump: true }, 25: { jump: true }, 45: { kick: true } }),
      ).mine,
    ).toEqual(['takeoff', 'jump', 10, 176, 'land', 'idle']);
    expect(
      play(
        presses({ 0: { jump: true }, 20: { dash: true }, 35: { punch: true } }),
        {
          gap: 400,
        },
      ),
    ).toEqual({
      mine: ['takeoff', 'jump', 17, 172, 'land', 'idle'],
      damage: 35,
      stock: 3,
    });
  });

  it('chucks within reach (box kind 136, PC 2233)', () => {
    for (const gap of [60, 250])
      expect(byKey({ throw: true }, { gap })).toEqual({
        mine: [179, 180, 'idle'],
        damage: 40,
        stock: 3,
      });
    expect(byKey({ throw: true }, { gap: 400 }).mine).toEqual([179, 'idle']);
  });

  it('dashes in with DASH P or DASH K, fires, and grabs with CC near or far', () => {
    for (const gap of [60, 400])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [183, 'idle'],
        damage: 35,
        stock: 3,
      });
    expect(byKey({ iori: true }, { gap: 60 })).toEqual({
      mine: [184, 'idle'],
      damage: 30,
      stock: 3,
    });
    // fire ball (196) starts 71 ahead (PC 2472) and strikes 124 beyond that
    // (PC 2484), so it passes a foe at his feet.
    expect(byKey({ axe: true }, { gap: 60 }).damage).toBe(0);
    expect(byKey({ axe: true }, { gap: 250 })).toEqual({
      mine: [195, 'idle'],
      damage: 50,
      stock: 3,
    });
    // CC start within 180 source pixels (+0x7ca3) grabs, leaps and slams;
    // CC far beyond them grabs only 100 ahead (box kind 138, PC 2351).
    for (const gap of [60, 250])
      expect(byKey({ dst: true }, { gap })).toEqual({
        mine: [187, 188, 191, '193+5', 'idle'],
        damage: 80,
        stock: 3,
      });
    expect(byKey({ dst: true }, { gap: 400 }).mine).toEqual([186, 'idle']);
  });

  it('cancels on a hit through his windows (op 0x1e, PCs 1973, 2018, 2280)', () => {
    expect(play(presses({ 0: { punch: true }, 20: { drill: true } }))).toEqual({
      mine: [166, 183, 'idle'],
      damage: 68,
      stock: 3,
    });
    expect(play(presses({ 0: { kick: true }, 20: { axe: true } }))).toEqual({
      mine: [170, 195, 'idle'],
      damage: 85,
      stock: 3,
    });
    expect(
      play(presses({ 0: { punch: true }, 20: { musashi: true } })),
    ).toEqual({ mine: [166, 217, 'idle'], damage: 133, stock: 2 });
    // K is level 21, CC start, SCC and the Chuck 10: below P's window (22).
    for (const key of [{ kick: true }, { dst: true }, { getterBeam: true }])
      expect(play(presses({ 0: { punch: true }, 20: key }))).toEqual({
        mine: [166, 'idle'],
        damage: 33,
        stock: 3,
      });
    // DASH PUNCH's window takes only DASH KICK (type 1).
    expect(play(presses({ 0: { drill: true }, 20: { iori: true } }))).toEqual({
      mine: [183, 184, 'idle'],
      damage: 65,
      stock: 3,
    });
    expect(
      play(presses({ 0: { drill: true }, 20: { axe: true } })).mine,
    ).toEqual([183, 'idle']);
    expect(
      play(presses({ 0: { punch: true }, 20: { drill: true } }), { gap: 700 })
        .mine,
    ).toEqual([166, 'idle']);
  });

  it('parries a box meeting his P’s in P gard (167, slot 5, 0x40eb60)', () => {
    // P's box without damage (PCs 1954, 1959) meets Ryuko's punch before the
    // hit test: both lose their boxes, and P gard stops her and swipes.
    const parry = (at: number) => {
      const { match, ttro, other } = ttroPlayer();
      const mine: unknown[] = [];
      for (let t = -2; t < 400; t++) {
        match.step(t ? {} : { punch: true }, t === at ? { punch: true } : {});
        if (t >= 0 && mine.at(-1) !== now(ttro)) mine.push(now(ttro));
      }
      return [mine, lifeOf('ttro') - ttro.hp, lifeOf('ryuko') - other.hp];
    };
    for (const at of [0, 8])
      expect(parry(at)).toEqual([[166, '167+15', 'idle'], 0, 39]);
    // Her punch pressed at 10 outlasts his box.
    expect(parry(10)).toEqual([[166, 'hit', 'idle'], 10, 0]);
  });

  it('spends a stock on SCC or SUPER FIRE and three on EN300, or enters No super', () => {
    // super cc start grabs (PC 2629) into two leaps and slams and a last
    // one, 200 (PC 2743); SCC FAR beyond 180 sets no hit handler.
    for (const gap of [60, 250])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [204, 205, 208, 211, 214, '193+5', 'idle'],
        damage: 200,
        stock: 2,
      });
    expect(byKey({ getterBeam: true }, { gap: 400 })).toEqual({
      mine: [203, 'idle'],
      damage: 0,
      stock: 2,
    });
    // call fires (218) sends five balls, each striking 224 ahead (PC 2817).
    for (const [gap, damage] of [
      [60, 0],
      [400, 125],
    ])
      expect(byKey({ musashi: true }, { gap })).toEqual({
        mine: [217, 'idle'],
        damage,
        stock: 2,
      });
    // EN 300 st needs more than two stocks and spends three (op 0x10, PC
    // 2899), calling CALL CAR (227) across the court.
    expect(byKey({ changeAttack: true }, { gap: 60 })).toEqual({
      mine: [225, 'idle'],
      damage: 120,
      stock: 0,
    });
    expect(byKey({ changeAttack: true }, { stock: 2 })).toEqual({
      mine: [200, 'idle'],
      damage: 0,
      stock: 2,
    });
    for (const key of [{ getterBeam: true }, { musashi: true }])
      expect(byKey(key, { stock: 0 })).toEqual({
        mine: [200, 'idle'],
        damage: 0,
        stock: 0,
      });
  });

  it('darkens the court through variable 14, which his Black (43) tests', () => {
    const { ttro, steps } = ttroPlayer();
    ttro.stock = 3;
    steps({}, 2);
    steps({ getterBeam: true });
    // super cc start sets it at age 0 (PC 2622).
    expect(ttro.variables[14]).toBe(100);
    const shown: string[] = [];
    while (ttro.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(ttro.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.ttro.opaque.image).toBe(1011);
  });

  it('hops forward and back, double jumps and air dashes', () => {
    expect(byKey({ dash: true }, { gap: 600 }).mine).toEqual([13, 15, 'idle']);
    expect(byKey({ dash: true, left: true }, { gap: 300 }).mine).toEqual([
      14,
      15,
      'idle',
    ]);
    expect(
      play(presses({ 0: { jump: true }, 30: { jump: true } })).mine,
    ).toEqual(['takeoff', 'jump', 10, 'land', 'idle']);
    expect(
      play(presses({ 0: { jump: true }, 20: { dash: true } }), { gap: 400 })
        .mine,
    ).toEqual(['takeoff', 'jump', 17, 'land', 'idle']);
  });

  it('shakes the screen as he walks, and loops J RP through his jumps', () => {
    // 前歩き's op 0x0e before its second and fourth poses (PCs 24, 28).
    const { match, steps } = ttroPlayer(600);
    steps({}, 2);
    steps({ right: true }, 10);
    expect(match.quake.y).toBeNull();
    steps({ right: true });
    expect(match.quake.y).toEqual({ type: 4, amplitude: 3, frames: 3 });
    // ジャンプ垂直 (4) jumps to J RP (7, PC 55), which loops two poses.
    expect(animationFrame('takeoff', 0, 'ttro').image).toBe(123);
    expect(
      [0, 8, 16, 24, 100].map(
        (age) => animationFrame('jump', age, 'ttro').image,
      ),
    ).toEqual([124, 125, 124, 125, 124]);
  });

  it('charges two stocks through his Vs. intro, 開始時 BR (33)', () => {
    expect(animationDuration('33+3', 'ttro')).toBe(268);
    const { path, ticks, f } = brIntro('ttro');
    expect([path, ticks, f.stock]).toEqual([[31, '33+3'], 270, 2]);
    // Round 1 (34) + 2 stamps through his stance, then calls DEMO ACT
    // twice (PC 333).
    expect(
      [0, 10, 20, 30, 60, 68, 83, 88, 118, 178, 267].map(
        (age) => animationFrame('33+3', age, 'ttro').image,
      ),
    ).toEqual([159, 160, 159, 160, 159, 158, 123, 113, 114, 113, 114]);
  });

  it('wins after a DEMO ACT, looping his last pose (PC 545), and draws looping its own (PC 632)', () => {
    expect(animationDuration('win', 'ttro')).toBe(158);
    expect(
      [0, 89, 90, 95, 110, 118, 128, 138, 1000].map(
        (age) => animationFrame('win', age, 'ttro').image,
      ),
    ).toEqual([113, 114, 123, 158, 159, 160, 159, 160, 160]);
    expect([0, 90, 110, 118, 128].map((age) => sounds('win', age))).toEqual([
      undefined,
      undefined,
      [1],
      [26],
      undefined,
    ]);
    expect(animationDuration('draw', 'ttro')).toBe(130);
    expect(
      [0, 89, 90, 1000].map((age) => animationFrame('draw', age, 'ttro').image),
    ).toEqual([113, 114, 209, 209]);
    expect([0, 90, 110].map((age) => sounds('draw', age))).toEqual([
      undefined,
      [26, 5],
      undefined,
    ]);
    expect(faceImage(-1, 'ttro')).toBe(2001);
  });

  it('stands through his idle program until it ends (PC 15)', () => {
    const vm = new StandingVM(CHARACTERS.ttro.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([113, 114, 115, 114]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His table names only his moves; its ---cpu--- entries name nothing.
    for (const [seed, wanted] of [
      [10, [166, 195, 183, 184, 204, 214]],
      [29, [170, 183, 195, 187, 191]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'ttro']);
      const ttro = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (ttro.action === 'script') entered.add(ttro.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
