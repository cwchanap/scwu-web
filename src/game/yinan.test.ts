import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// YINAN as player 1, `gap` from Ryuko as player 2, who plays `theirs`.
function yinanPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['yinan', 'ryuko']);
  const [yinan, other] = match.fighters;
  other.x = yinan.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, yinan, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: her actions, the damage Ryuko took, her
// stock and the life she gained from `hp`. `ex` starts her in EX mode.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    hp = lifeOf('yinan'),
    ex = false,
    ticks = 1500,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { yinan, other, steps } = yinanPlayer(gap);
  yinan.stock = stock;
  yinan.hp = hp;
  if (ex) yinan.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(yinan)) mine.push(now(yinan));
  }
  return {
    mine,
    damage: lifeOf('ryuko') - other.hp,
    stock: yinan.stock,
    healed: yinan.hp - hp,
  };
}
type Options = Parameters<typeof play>[1];
const byKey = (key: Input, options: Options = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const P = { punch: true };
const K = { kick: true };
// Her Driver's follow-ups, back or forward then a button within 20 ticks.
const driver = (direction: Input, button: Input) =>
  presses({ 0: { drill: true }, 20: direction, 22: button });
// ↓→↓→ K, each direction held for a few ticks, as fingers do.
const en3 = presses({
  0: { crouch: true },
  3: {},
  5: { right: true },
  8: {},
  10: { crouch: true },
  13: {},
  15: { right: true },
  18: K,
});

describe('YINAN (41 YINAN.PLAYER)', () => {
  it('takes 450 life from her parameter block, desperate at 135', () => {
    expect([lifeOf('yinan'), desperationOf('yinan')]).toEqual([450, 135]);
    const { yinan } = yinanPlayer();
    expect(yinan).toMatchObject({ who: 'yinan', hp: 450, action: 'idle' });
    expect(exMode(yinan)).toBe(false);
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.yinan.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('yinan')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Her UNCOUNTER DOWN and Air Fire (154, 155) answer Ryuko's DOWN and J
    // attack responses.
    expect(
      paired.filter(([, twin, own]) => twin !== own).map(([, , own]) => own),
    ).toEqual(expect.arrayContaining([154, 155]));
    expect(CHARACTERS.yinan.aliases).toEqual({ 154: 79, 155: 77 });
    // 33 after Ryuko's KOs, 34 from her light hit to SHOCK INFINITY, 33
    // again, 35 from her Pull Back and 34 from her Chuck Yo.
    expect(
      [59, 61, 73, 77, 88, 90, 96, 118, 121, 128, 137, 140, 149, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([
      92, 94, 107, 111, 122, 123, 129, 151, 156, 163, 172, 174, 183, 206,
    ]);
    // Her KO NORMAL lies on a 0-tick display (PC 1113).
    expect(animationDuration('koAgain', 'yinan')).toBe(32);
  });

  it('opens her reactions with BTK S’s and Driver Shield’s counter tests (variable 4)', () => {
    const counters = CHARACTERS.yinan.counters as Record<string, number[][]>;
    // ヒット 弱 立ち enters BTK Hit (315) at 100 (PC 1271); FLY NO HIT
    // enters Driver Shield tobi Hit (418) at 50 (PC 1731); both clear it.
    expect(counters[107]).toEqual([
      [4, 100, 315],
      [4, 0, 0],
    ]);
    expect(counters[130]).toEqual([
      [4, 50, 418],
      [4, 0, 0],
    ]);
    // In EX mode, ↓← K is BTK S (314), which holds variable 4 at 100 for
    // 30 ticks (PCs 5552–5565): a punch inside it is countered, one after
    // it lands.
    expect(
      play((t) => (t ? {} : { iori: true }), {
        ex: true,
        theirs: (t) => (t === 6 ? P : {}),
      }),
    ).toEqual({
      mine: [314, 315, 316, '316+17', 317, 'idle'],
      damage: 41,
      stock: 3,
      healed: -3,
    });
    expect(
      play((t) => (t ? {} : { iori: true }), {
        ex: true,
        theirs: (t) => (t === 40 ? P : {}),
      }).mine,
    ).toEqual([314, 'hit', 'idle']);
  });

  it('answers a fireball with Driver Shield tobi Hit (418) while the shield holds variable 4 at 50', () => {
    const match = new Match('practice', false, 3, ['yinan', 'zoma']);
    const [yinan, zoma] = match.fighters;
    zoma.x = yinan.x + 350;
    yinan.stock = 3;
    match.step({}, {});
    match.step({}, {});
    const mine: unknown[] = [];
    for (let t = 0; t < 1200; t++) {
      // EN Driver, then Zoma's FIRE (204) into its shield.
      match.step(t ? {} : { musashi: true }, t === 30 ? { axe: true } : {});
      if (mine.at(-1) !== now(yinan)) mine.push(now(yinan));
    }
    expect([mine, lifeOf('zoma') - zoma.hp, yinan.hp]).toEqual([
      [411, 418, 'idle'],
      86,
      450,
    ]);
  });

  it('reads her command table', () => {
    expect(CHARACTERS.yinan.levels).toEqual({
      10: 255, // Jump 2
      11: 255,
      12: 255,
      13: 25, // Dash F
      17: 0, // Dash B
      20: 254, // Dash A F
      23: 254, // Dash A B
      212: 21, // P1
      220: 14, // K1
      229: 21, // P sit
      231: 21, // K sit
      232: 21, // P J
      238: 22, // K J
      247: 21, // Hit up
      252: 21, // Chuck
      258: 31, // TO EX
      268: 31, // Driver
      294: 45, // DG A
      320: 31, // ECS P
      321: 31, // ECS K
      337: 31, // Assault
      351: 41, // Sharp Shooter
      389: 21, // Savage
      394: 31, // DOGE Start
      411: 41, // Driver Shield
      452: 41, // Venom Doll near
      453: 41, // Venom Doll far
      481: 42, // EN3 Start
      519: 40, // R100
      532: 42, // R300
      656: 0, // CPU DJ
      657: 31, // CPU Driver
      658: 31, // CPU Driver Far
      664: 41, // CPU SS
    });
  });

  it('chains P and K through their hits’ op 0x24 checks, in both modes', () => {
    expect(byKey(P)).toEqual({
      mine: [212, '212+13', 213, 'idle'],
      damage: 10,
      stock: 3,
      healed: 0,
    });
    expect(byKey(P, { gap: 400 }).mine).toEqual([212, '212+13', 'idle']);
    expect(byKey(K)).toMatchObject({
      mine: [220, '220+13', 221, 'idle'],
      damage: 15,
    });
    // P1 hit's P (PC 3174) enters P2 (214), whose P enters P3 (216).
    expect(play(presses({ 0: P, 10: P }))).toMatchObject({
      mine: [212, '212+13', 213, 214, '214+15', 'idle'],
      damage: 25,
    });
    expect(play(presses({ 0: P, 14: P, 44: P }))).toMatchObject({
      mine: [212, '212+13', 213, 214, '214+15', 216, 'idle'],
      damage: 50,
    });
    // K1 hit's P and K (PCs 3464–3465) enter P2 and K2, and K2's K K3.
    expect(play(presses({ 0: K, 30: P }))).toMatchObject({
      mine: [220, '220+13', 221, 214, 'idle'],
      damage: 30,
    });
    expect(play(presses({ 0: K, 30: K, 70: K }))).toMatchObject({
      mine: [220, '220+13', 221, 222, 225, 'idle'],
      damage: 56,
    });
    // In EX mode (variable 0 = 100) each jumps to its EX form.
    expect(byKey(P, { ex: true }).mine).toEqual([
      '212+4',
      '212+13',
      '213+6',
      'idle',
    ]);
    expect(play(presses({ 0: K, 30: K, 70: K }), { ex: true })).toMatchObject({
      mine: ['220+4', '220+13', '221+6', 223, 226, 227, 'idle'],
      damage: 55,
    });
    // Crouching: P sit Nor and K sit Nor, or in EX mode P sit and K sit.
    for (const [ex, p, k] of [
      [false, 228, 230],
      [true, 229, 231],
    ] as const) {
      expect(byKey({ ...P, crouch: true }, { ex })).toMatchObject({
        mine: [p, 'idle'],
        damage: 25,
      });
      expect(byKey({ ...K, crouch: true }, { ex })).toMatchObject({
        mine: [k, 'idle'],
        damage: 20,
      });
    }
  });

  it('strikes in the air in forms variable 0 and her double jump or air dash pick', () => {
    const air = (button: Input, ex = false, gap = 90) =>
      play(presses({ 0: { jump: true }, 30: button }), { ex, gap }).mine;
    // P J (232) and K J (238) jump to their Normal forms, 235 and 242, for
    // variable 0 = 0 (PCs 3855, 3997).
    expect(air(P)).toEqual(['takeoff', 'jump', 235, 'land', 'idle']);
    expect(air(K)).toEqual(['takeoff', 'jump', 242, 'land', 'idle']);
    expect(air(P, true)).toEqual([
      'takeoff',
      'jump',
      232,
      '232+15',
      'land',
      'idle',
    ]);
    expect(air(K, true)).toEqual(['takeoff', 'jump', 238, 'land', 'idle']);
    // Jump 2 sets variable 1 to 10 and Dash A F to 20 (PCs 141, 380).
    const doubled = presses({
      0: { jump: true },
      20: {},
      21: { jump: true },
      40: P,
    });
    expect(play(doubled).mine).toEqual([
      'takeoff',
      'jump',
      10,
      237,
      'land',
      'idle',
    ]);
    expect(play(doubled, { ex: true }).mine).toEqual([
      'takeoff',
      'jump',
      '10+20',
      234,
      '234+12',
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
    expect(play(dashed(P), { gap: 400 })).toMatchObject({
      mine: ['takeoff', 'jump', 20, 236, 'land', 'idle'],
      damage: 13,
    });
    expect(play(dashed(K), { gap: 400, ex: true }).mine).toEqual([
      'takeoff',
      'jump',
      21,
      239,
      '240+38',
      241,
      'idle',
    ]);
  });

  it('launches with Hit Up, jumps after it on ↑, and grabs with Chuck', () => {
    expect(byKey({ hitUp: true })).toMatchObject({
      mine: [249, 250, 'idle'],
      damage: 15,
    });
    expect(byKey({ hitUp: true }, { ex: true }).mine).toEqual([
      247,
      248,
      'idle',
    ]);
    // Hit up Nor Hit's ↑ (PCs 4295–4301) enters Jump cancel (251).
    expect(
      play(presses({ 0: { hitUp: true }, 40: { jump: true } })).mine,
    ).toEqual([249, 250, 251, 'land', 'turn', 'idle']);
    expect(byKey({ throw: true })).toMatchObject({
      mine: [252, 255, 'idle'],
      damage: 35,
    });
    expect(byKey({ throw: true }, { ex: true })).toMatchObject({
      mine: [252, 253, 'turn', 'idle'],
      damage: 30,
    });
    expect(byKey({ throw: true }, { gap: 400 }).mine).toEqual([252, 'idle']);
  });

  it('runs while → is held, jumps or Savages out of it, and dashes back', () => {
    const run = (at: (t: number) => Input) => play(at, { gap: 900 }).mine;
    // Dash F loops from PC 244 while → is held (PC 273).
    expect(run((t) => (t < 100 ? { right: true, dash: true } : {}))).toEqual([
      13,
      '13+45',
      'idle',
    ]);
    expect(
      run((t) =>
        t === 0
          ? { dash: true }
          : t < 20
            ? { right: true }
            : t < 30
              ? { right: true, jump: true }
              : {},
      ),
    ).toEqual([13, 14, 'land', 'idle']);
    expect(
      run((t) =>
        t === 0
          ? { dash: true }
          : t < 20
            ? { right: true }
            : t === 20
              ? { right: true, ...K }
              : {},
      ),
    ).toEqual([13, 389, '389+13', 'idle']);
    expect(byKey({ dash: true, left: true }).mine).toEqual([17, 19, 'idle']);
    // In EX mode her dashes jump to Dash EX (15) and Dash B EX (18), and
    // after a normal's hit (variable 6 = 10, PC 3165) to Dash EX CC (16).
    expect(byKey({ dash: true }, { ex: true, gap: 600 }).mine).toEqual([
      15,
      'idle',
    ]);
    expect(byKey({ dash: true, left: true }, { ex: true }).mine).toEqual([
      18,
      'idle',
    ]);
    expect(
      play(presses({ 0: P, 15: { dash: true } }), { ex: true }).mine,
    ).toEqual(['212+4', '212+13', '213+6', 16, 'idle']);
  });

  it('switches type with TO EX for half a stock', () => {
    const { yinan, steps } = yinanPlayer();
    yinan.stock = 3;
    steps({}, 2);
    steps({ ex: true });
    steps({}, 60);
    expect([
      yinan.variables[0],
      exMode(yinan),
      yinan.stock,
      yinan.power,
    ]).toEqual([100, true, 2, 50]);
    // Again, TO NORMAL (259) for another half (PC 4446).
    steps({ ex: true });
    steps({}, 60);
    expect([
      yinan.variables[0],
      exMode(yinan),
      yinan.stock,
      yinan.power,
    ]).toEqual([0, false, 2, 0]);
    // Without 50 power, it enters No super (PC 4442), which gives 10.
    expect(byKey({ ex: true }, { stock: 0 }).mine).toEqual(['258+3', 'idle']);
  });

  it('plays her Normal specials and their follow-ups', () => {
    expect(byKey({ drill: true })).toMatchObject({
      mine: [268, '268+14', 269, 'idle'],
      damage: 10,
    });
    // Driver's checks (PCs 4579–4605): ← P Boxer, ← K Venom, → P ARX-7,
    // → K Codarl.
    expect(play(driver({ left: true }, P))).toMatchObject({
      mine: [268, '268+14', 269, 276, '280+7', '280+18', '280+29', 'idle'],
      damage: 35,
    });
    expect(play(driver({ left: true }, K))).toMatchObject({
      mine: [268, '268+14', 269, '282+3', '282+33', '283+6', 'idle'],
      damage: 35,
    });
    expect(play(driver({ right: true }, P))).toMatchObject({
      mine: [268, '268+14', 269, 270, '270+13', 272, 'idle'],
      damage: 20,
    });
    expect(play(driver({ right: true }, K))).toMatchObject({
      mine: [268, '268+14', 269, 273, 274, 'idle'],
      damage: 25,
    });
    for (const gap of [90, 700])
      expect(byKey({ axe: true }, { gap })).toMatchObject({
        mine: [337, 338, 341, 'turn', 'idle'],
        damage: 40,
      });
    // DOGE Start dodges back into Doge RP, whose checks (PCs 7179–7182)
    // take P, K, Chuck or Hit Up within 5 ticks.
    expect(byKey({ iori: true })).toMatchObject({
      mine: [394, 'idle'],
      damage: 0,
    });
    for (const [button, mine, damage] of [
      [P, [394, 402, 'idle'], 25],
      [K, [394, 400, 401, 'idle'], 20],
      [{ throw: true }, [394, 396, 398, 'idle'], 20],
      [{ hitUp: true }, [394, 291, 293, 'idle'], 45],
    ] as const)
      expect(play(presses({ 0: { iori: true }, 30: button }))).toMatchObject({
        mine,
        damage,
      });
    // ECS P speeds through her unseen (PCs 5661–5666).
    expect(byKey({ dst: true }, { gap: 300 })).toMatchObject({
      mine: [320, 'turn', 'idle'],
      damage: 0,
    });
    expect(
      play((t) => (t === 20 ? { iori: true } : t ? {} : { jump: true })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 294, 297, 'idle'],
      damage: 35,
    });
  });

  it('plays her EX specials, counting Fist S’s and p90’s passes in her own variable 0', () => {
    // PAtt's box (response 62, PC 5127) flings the opponent in its own Chuck
    // OGI BALL, and its hit handler enters PAtt Hit (288, PC 5123).
    expect(byKey({ drill: true }, { ex: true }).mine).toEqual([
      286,
      288,
      'idle',
    ]);
    // Fist S fires two volleys (PCs 6315, 6327), then more while P is
    // pressed, up to six (PC 6317), or seizes her on a hit (348).
    expect(byKey({ axe: true }, { ex: true, gap: 300 }).mine).toEqual([
      345,
      '345+14',
      'idle',
    ]);
    expect(byKey({ axe: true }, { ex: true })).toMatchObject({
      mine: [345, 348, 'idle'],
      damage: 46,
    });
    expect(byKey({ iori: true }, { ex: true }).mine).toEqual([314, 'idle']);
    expect(byKey({ dst: true }, { ex: true }).mine).toEqual([
      325,
      '325+16',
      'idle',
    ]);
    expect(
      play((t) => (t === 20 ? { iori: true } : t ? {} : { jump: true }), {
        ex: true,
      }),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 299, '299+15', '299+31', '8+3', 'land', 'idle'],
      damage: 30,
    });
  });

  it('spends her stocks on her Normal supers', () => {
    // Sharp Shooter aims until P fires (PC 6441) or K lowers it (PC
    // 6442); each shot's DRAGON Yinan lifts Ryuko above the next.
    expect(
      play(
        presses({ 0: { getterBeam: true }, 100: P, 160: P, 220: P, 280: P }),
        { gap: 300 },
      ),
    ).toMatchObject({
      mine: [351, 353, 355, 357, 359, 'idle'],
      damage: 10,
      stock: 2,
    });
    expect(
      play(presses({ 0: { getterBeam: true }, 90: K }), { gap: 300 }).mine,
    ).toEqual([351, 360, 'idle']);
    expect(byKey({ getterBeam: true }, { stock: 0 }).mine).toEqual([
      406,
      'idle',
    ]);
    expect(byKey({ musashi: true })).toMatchObject({
      mine: [411, 417, 'idle'],
      damage: 80,
      stock: 2,
    });
    expect(byKey({ blackRush: true })).toMatchObject({
      mine: [452, '452+25', 456, 'idle'],
      damage: 50,
      stock: 2,
    });
    expect(byKey({ blackRush: true }, { gap: 300 }).mine).toEqual([
      453,
      '453+25',
      'idle',
    ]);
    // EN3 takes three stocks (PC 8918).
    expect(play(en3)).toMatchObject({
      mine: ['crouchEnter', 'crouch', 'stand', 13, 481, '481+19', 483, 'idle'],
      damage: 211,
      stock: 0,
    });
    expect(play(en3, { stock: 2 }).mine).toContain(406);
  });

  it('keeps Eat and R300 for under 150 life', () => {
    // Above, R100 and R300 jump to Driver (PCs 9971, 10272).
    expect(byKey({ changeAttack: true }).mine).toEqual([
      268,
      '268+14',
      269,
      406,
      'idle',
    ]);
    expect(byKey({ megaBeam: true }).mine).toEqual([
      268,
      '268+14',
      269,
      'idle',
    ]);
    // R100 leaps with a box that skips grounded victims (kind 0x10, PC
    // 10011), catching Ryuko's jump and eating her life.
    expect(byKey({ changeAttack: true }, { hp: 100 })).toMatchObject({
      mine: [519, 521, 'turn', 'idle'],
      damage: 0,
      stock: 2,
    });
    expect(
      byKey(
        { changeAttack: true },
        { hp: 100, theirs: (t) => (t === 55 ? { jump: true } : {}) },
      ),
    ).toEqual({
      mine: [519, 523, 524, 'idle'],
      damage: 80,
      stock: 2,
      healed: 50,
    });
    // R300's shell drops and bursts (541) for a further 100 power (PC
    // 10531); its hit sets variable 1 to 2 (PC 11027) for the dash (534),
    // whose time stop (response 80) is a hit, into the finale (542).
    expect(
      byKey({ megaBeam: true }, { hp: 100, gap: 200, ticks: 2500 }),
    ).toMatchObject({
      mine: [532, 533, 542, 'idle'],
      damage: 230,
      stock: 0,
    });
  });

  it('cancels Driver into her supers’ SC forms for two stocks', () => {
    const cancel = (key: Input) =>
      play(presses({ 0: { drill: true }, 25: key }));
    expect(cancel({ getterBeam: true })).toMatchObject({
      mine: [268, '268+14', 269, 352],
      stock: 1,
    });
    expect(cancel({ musashi: true })).toMatchObject({
      mine: [268, '268+14', 269, 414, 417, 'idle'],
      damage: 90,
      stock: 1,
    });
    expect(cancel({ blackRush: true })).toMatchObject({
      mine: [268, '268+14', 269, 454, '454+30', 456, 'idle'],
      damage: 60,
      stock: 1,
    });
  });

  it('spends her stocks on her EX supers', () => {
    expect(byKey({ getterBeam: true }, { ex: true, gap: 300 })).toMatchObject({
      mine: [370, 'idle'],
      stock: 2,
    });
    expect(byKey({ musashi: true }, { ex: true })).toMatchObject({
      mine: [426, 428, 429, 'idle'],
      damage: 91,
    });
    for (const gap of [90, 600])
      expect(byKey({ blackRush: true }, { ex: true, gap })).toMatchObject({
        mine: [463, 'idle'],
        damage: 100,
      });
    expect(play(en3, { ex: true })).toMatchObject({
      mine: ['crouchEnter', 'crouch', 'stand', 15, 508, 509, 510, 511, 'idle'],
      damage: 189,
      stock: 0,
    });
  });

  it('darkens the court through variable 14, which her Black (57) tests', () => {
    const { yinan, steps } = yinanPlayer();
    yinan.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // Driver Shield sets it at age 0 (PC 7452).
    expect(yinan.variables[14]).toBe(100);
    expect(BLACK.yinan.opaque.image).toBe(1011);
  });

  it('charges two stocks through her Vs. intro, from which ↓ starts EX mode', () => {
    const intro = (down = -1) => {
      const { path, ticks, f } = brIntro('yinan', 0, (t) =>
        t === down ? { crouch: true } : {},
      );
      return { path, ticks, stock: f.stock, ex: exMode(f) };
    };
    // 開始時 BR (41) jumps past its display (PC 621) to Round 1 (42) + 7
    // (PC 624).
    expect(intro()).toEqual({
      path: [38, 41, '41+12'],
      ticks: 204,
      stock: 2,
      ex: false,
    });
    // Round 1's op 0x16 (PC 648) checks down as its 190-tick display ends,
    // after 開始時's (38) blank display, entering 開始時 SELECT (40) + 8.
    expect([192, 193, 194].map((down) => intro(down).ex)).toEqual([
      false,
      true,
      false,
    ]);
    // 開始時 BR's first display, then Round 1 from PC 647.
    const { images } = brIntro('yinan');
    expect([1, 2, 3, 192, 193, 198, 199, 202].map((t) => images[t])).toEqual([
      4007, 4007, 4007, 4007, 4006, 4006, 4000, 4000,
    ]);
  });

  it('wins after Demo Stand, looping her last two poses, and draws looping from PC 1177', () => {
    expect(animationDuration('win', 'yinan')).toBe(247);
    expect(
      [0, 84, 85, 124, 125, 127, 133, 160, 165, 180, 1000].map(
        (age) => animationFrame('win', age, 'yinan').image,
      ),
    ).toEqual([
      4000, 4000, 4001, 4005, 4000, 4407, 4408, 4410, 4410, 4412, 4414,
    ]);
    expect(animationDuration('draw', 'yinan')).toBe(402);
    expect(
      [0, 125, 225, 237, 242, 1000].map(
        (age) => animationFrame('draw', age, 'yinan').image,
      ),
    ).toEqual([4000, 4534, 4536, 4537, 4538, 4537]);
    // Action 104's face: 2001, or in EX mode 2002, 2007, 2008 and 2007.
    expect(faceImage(-1, 'yinan')).toBe(2001);
    expect(
      [0, 40, 80, 120, 160].map((face) => faceImage(face, 'yinan')),
    ).toEqual([2002, 2007, 2008, 2007, 2002]);
  });

  it('stands through her idle program until it ends', () => {
    const vm = new StandingVM(CHARACTERS.yinan.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([
      4000, 4001, 4002, 4003, 4004, 4005, 4000, 4006, 4007, 4006, 4000,
    ]);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    // Her CPU's own CPU Driver Far (658) and its ARX-7 (660).
    for (const [seed, wanted] of [
      [19, [337, 658, 394, 252, 212, 213, 214, 216, 276]],
      [7, ['660+3', 661]],
      [4, [411, 249]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'yinan']);
      const yinan = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (yinan.action === 'script') entered.add(yinan.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
