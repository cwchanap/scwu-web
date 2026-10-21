import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// AYA as player 1, `gap` from Ryuko as player 2.
function ayaPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['aya', 'ryuko']);
  const [aya, other] = match.fighters;
  other.x = aya.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, aya, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: her actions, the damage Ryuko took and
// her stock.
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, ticks = 1500 } = {},
) {
  const { aya, other, steps } = ayaPlayer(gap);
  aya.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(aya)) mine.push(now(aya));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: aya.stock };
}
type Options = Parameters<typeof play>[1];
const byKey = (key: Input, options: Options = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const P = { punch: true };
const K = { kick: true };

describe('AYA (42 AYA.PLAYER)', () => {
  it('takes 500 life from her parameter block, desperate at 150', () => {
    expect([lifeOf('aya'), desperationOf('aya')]).toEqual([500, 150]);
    const { aya } = ayaPlayer();
    expect(aya).toMatchObject({ who: 'aya', hp: 500, action: 'idle' });
    expect(exMode(aya)).toBe(false);
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.aya.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('aya')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Her UNCOUNTER DOWN and Air Fire (150, 151) answer Ryuko's DOWN and J
    // attack responses.
    expect(
      paired.filter(([, twin, own]) => twin !== own).map(([, , own]) => own),
    ).toEqual(expect.arrayContaining([150, 151]));
    expect(CHARACTERS.aya.aliases).toEqual({ 150: 79, 151: 77 });
    // 26 after Ryuko's KOs, 30 from her light hit to SHOCK INFINITY, 29 from
    // her Shock rp, 31 from her Pull Back and 30 from her Chuck Yo.
    expect(
      [59, 61, 73, 88, 90, 120, 121, 137, 140, 149, 172].map((r) => twins[r]),
    ).toEqual([85, 87, 103, 118, 119, 149, 152, 168, 170, 179, 202]);
    // Her KO NORMAL lies on a 0-tick display (PC 666).
    expect(animationDuration('koAgain', 'aya')).toBe(32);
  });

  it('enters each command at its level', () => {
    expect(CHARACTERS.aya.levels).toEqual({
      10: 255, // Jump 2
      11: 255,
      12: 255,
      13: 30, // Dash F
      15: 0, // Dash B
      17: 254, // Dash A F
      18: 254, // Dash A B
      208: 21, // P1
      214: 21, // K1
      218: 21, // P sit
      219: 21, // K sit
      220: 21, // P J
      223: 22, // K J
      227: 21, // Hit up
      230: 21, // Chuck
      239: 31, // Fire Ball
      246: 31, // Air Crush
      254: 31, // Air Kick
      257: 31, // ECS P
      258: 31, // ECS K
      267: 31, // DH
      269: 41, // DH Sp
      273: 31, // ap
      282: 41, // Driver Shield
      289: 41, // Rocket
      309: 42, // EN3 Start
    });
  });

  it('chains P and K through their hits’ op 0x24 checks', () => {
    expect(byKey(P)).toEqual({
      mine: [208, 209, 'idle'],
      damage: 20,
      stock: 3,
    });
    // Its lunge still connects at 400, late, into P1 hit 2 (PC 2531).
    expect(byKey(P, { gap: 400 }).mine).toEqual([208, 210, 'idle']);
    expect(byKey(P, { gap: 600 }).mine).toEqual([208, 'idle']);
    // P1 hit's P and K (PCs 2550–2562) enter P2 (211) and K2 (216), whose
    // P and K (PCs 2607–2612, 2719–2749) enter P3 (212) and K3 (217).
    expect(play(presses({ 0: P, 25: P }))).toMatchObject({
      mine: [208, 209, 211, 'idle'],
      damage: 35,
    });
    expect(play(presses({ 0: P, 25: P, 70: P }))).toMatchObject({
      mine: [208, 209, 211, 212, 'idle'],
      damage: 70,
    });
    expect(play(presses({ 0: P, 25: P, 70: K }))).toMatchObject({
      mine: [208, 209, 211, 217, 'idle'],
      damage: 65,
    });
    expect(play(presses({ 0: K, 20: K, 60: K }))).toMatchObject({
      mine: [214, 215, 216, 217, 'idle'],
      damage: 46,
    });
    expect(byKey({ ...P, crouch: true })).toMatchObject({
      mine: [218, 'idle'],
      damage: 20,
    });
    expect(byKey({ ...K, crouch: true })).toMatchObject({
      mine: [219, 'idle'],
      damage: 20,
    });
  });

  it('strikes in the air in forms her double jump or air dash pick', () => {
    expect(play(presses({ 0: { jump: true }, 30: P })).mine).toEqual([
      'takeoff',
      'jump',
      220,
      'land',
      'idle',
    ]);
    // P J and K J jump to their 2 forms for variable 1 = 10 (Jump 2) and
    // their D forms for 20 (Dash A F, PC 232; PCs 2883–2884, 2957–2958).
    const doubled = (button: Input) =>
      presses({ 0: { jump: true }, 20: {}, 21: { jump: true }, 40: button });
    expect(play(doubled(P)).mine).toEqual([
      'takeoff',
      'jump',
      10,
      222,
      'land',
      'idle',
    ]);
    expect(play(doubled(K)).mine).toEqual([
      'takeoff',
      'jump',
      10,
      225,
      'land',
      'idle',
    ]);
    const dashed = (button: Input) =>
      presses({
        0: { jump: true },
        18: { right: true },
        19: {},
        20: { right: true },
        30: button,
      });
    expect(play(dashed(P), { gap: 400 }).mine).toEqual([
      'takeoff',
      'jump',
      17,
      221,
      'land',
      'idle',
    ]);
    expect(play(dashed(K), { gap: 400 }).mine).toEqual([
      'takeoff',
      'jump',
      17,
      224,
      'land',
      'idle',
    ]);
  });

  it('launches with Hit Up, jumps after it on ↑, grabs with Chuck and dashes', () => {
    expect(byKey({ hitUp: true })).toMatchObject({
      mine: [227, 228, 'idle'],
      damage: 15,
    });
    // hit up hit's ↑ (PC 3044) enters Jump cancel (229).
    expect(
      play(presses({ 0: { hitUp: true }, 40: { jump: true } })).mine,
    ).toEqual([227, 228, 229, 'land', 'turn', 'idle']);
    expect(byKey({ throw: true })).toMatchObject({
      mine: [230, 231, 'idle'],
      damage: 30,
    });
    expect(byKey({ throw: true }, { gap: 300 }).mine).toEqual([230, 'idle']);
    expect(byKey({ dash: true }, { gap: 400 }).mine).toEqual([13, 'idle']);
    expect(byKey({ dash: true, left: true }).mine).toEqual([15, 16, 'idle']);
  });

  it('plays her specials', () => {
    for (const gap of [90, 700])
      expect(byKey({ drill: true }, { gap })).toMatchObject({
        mine: [239, 'idle'],
        damage: 30,
      });
    expect(byKey({ axe: true })).toMatchObject({
      mine: [267, 'idle'],
      damage: 30,
    });
    expect(byKey({ iori: true })).toMatchObject({
      mine: [273, 'idle'],
      damage: 35,
    });
    // ECS P and K dash ten passes (PCs 3495, 3526) with a box 9000 below
    // (PCs 3498, 3529), which never meets a body (0x40f23d–0x40f25d), into
    // AS Att (259), which leaps and strikes ahead.
    for (const key of [{ dst: true }, { ex: true }])
      expect(byKey(key)).toMatchObject({
        mine: [key.dst ? 257 : 258, 259, 'land', 'turn', 'idle'],
        damage: 0,
      });
    expect(byKey({ dst: true }, { gap: 900 }).damage).toBe(30);
    // In the air: Air Crush (246), Air Kick (254) and Rocket (289).
    const air = (key: Input) => play(presses({ 0: { jump: true }, 20: key }));
    expect(air({ drill: true }).mine).toEqual([
      'takeoff',
      'jump',
      246,
      'jump',
      'land',
      'idle',
    ]);
    expect(air({ axe: true })).toMatchObject({
      mine: ['takeoff', 'jump', 254, 255, 'turn', 'idle'],
      damage: 20,
    });
    expect(air({ musashi: true })).toMatchObject({
      mine: ['takeoff', 'jump', 289, 291, 298, 290, 'turn', 'idle'],
      damage: 107,
      stock: 2,
    });
  });

  it('spends her stocks on her supers', () => {
    expect(byKey({ getterBeam: true }, { gap: 500 })).toMatchObject({
      mine: [282, 'idle'],
      damage: 84,
      stock: 2,
    });
    // DH Sp's hit (291) holds Ryuko and, through Rocket Hit2 (292), calls
    // Rocket Hit2 att1 and att2 18 times (PCs 4097–4132), each returning on
    // its op 0x05s (PCs 4194, 4239), before Rocket Hit3 (296) and Fin (298).
    expect(byKey({ musashi: true })).toMatchObject({
      mine: [269, 291, 298, 290, 'turn', 'idle'],
      damage: 107,
      stock: 2,
    });
    // EN3 takes three stocks (PC 4651).
    expect(byKey({ changeAttack: true })).toMatchObject({
      mine: [309, 310, 315, 'idle'],
      damage: 211,
      stock: 0,
    });
    expect(byKey({ changeAttack: true }, { stock: 2 }).mine).toEqual([
      277,
      'idle',
    ]);
  });

  it('cancels SHO into her supers’ SC forms for two stocks', () => {
    // ap sets variable 6 (PC 3798), which Driver Shield and DH Sp test
    // (PCs 3908, 3726).
    const cancel = (key: Input, stock = 3) =>
      play(presses({ 0: { iori: true }, 25: key }), { stock });
    expect(cancel({ getterBeam: true })).toMatchObject({
      mine: [273, 283, 'idle'],
      damage: 119,
      stock: 1,
    });
    expect(cancel({ musashi: true })).toMatchObject({
      mine: [273, 270, 291, 298, 290, 'turn', 'idle'],
      damage: 142,
      stock: 1,
    });
    expect(cancel({ getterBeam: true }, 1).mine).toEqual([273, 277, 'idle']);
    // Its window takes no EN3 (level 42, PC 3799), and a punch sets no
    // variable 6.
    expect(cancel({ changeAttack: true }).mine).toEqual([273, 'idle']);
    expect(play(presses({ 0: P, 25: { getterBeam: true } }))).toMatchObject({
      mine: [208, 209, 282, 'idle'],
      stock: 2,
    });
  });

  it('darkens the court through variable 14, which her Black (50) tests', () => {
    const { aya, steps } = ayaPlayer();
    aya.stock = 3;
    steps({}, 2);
    steps({ getterBeam: true });
    // Driver Shield sets it at age 0 (PC 3910).
    expect(aya.variables[14]).toBe(100);
    expect(BLACK.aya.opaque.image).toBe(1011);
  });

  it('charges two stocks through her Vs. intro', () => {
    expect(animationDuration('intro', 'aya')).toBe(252);
    const match = new Match('cpu', true, 0, ['aya', 'zoma']);
    const aya = match.fighters[0];
    let ticks = 0;
    while (aya.action === 'intro') {
      match.step({});
      ticks++;
    }
    expect([ticks, aya.stock]).toEqual([252, 2]);
    // 開始時 BR's first display, then 開始時 from PC 335 and Demo Stand.
    expect(
      [0, 1, 2, 51, 52, 123, 124, 251].map(
        (age) => animationFrame('intro', age, 'aya').image,
      ),
    ).toEqual([4001, 4001, 4001, 4001, 4002, 4008, 4001, 4005]);
  });

  it('wins after Demo Stand, holding her last pose, and draws looping image 201', () => {
    expect(animationDuration('win', 'aya')).toBe(163);
    expect(
      [0, 151, 152, 157, 162, 1000].map(
        (age) => animationFrame('win', age, 'aya').image,
      ),
    ).toEqual([4006, 4005, 4133, 4134, 4135, 4135]);
    expect(animationDuration('draw', 'aya')).toBe(172);
    expect(
      [0, 151, 152, 1000].map(
        (age) => animationFrame('draw', age, 'aya').image,
      ),
    ).toEqual([4006, 4005, 201, 201]);
    // Action 100's face (PC 747).
    expect(faceImage(-1, 'aya')).toBe(2001);
  });

  it('stands through her idle program until it ends', () => {
    const vm = new StandingVM(CHARACTERS.aya.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([4006, 4007, 4008, 4001, 4002, 4003, 4004, 4005]);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    // 258's box 9000 down meets Ryuko's object 39, 9900 down, into its hit
    // handler 258 + 27 (0x40f010 tests every box against objects' bodies).
    for (const [seed, wanted] of [
      [3, [239, 282, 258, '258+27', 267, 230]],
      [21, [227, 228, 257, 211, 212, 259, 267, 282]],
      [1, [273]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'aya']);
      const aya = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (aya.action === 'script') entered.add(aya.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
