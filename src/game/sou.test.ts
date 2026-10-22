import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// SOU as player 1, `gap` from a standing opponent as player 2.
function souPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['sou', opponent]);
  const [sou, other] = match.fighters;
  other.x = sou.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, sou, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, in EX mode or not, run until he is back on his feet:
// SOU's actions and the damage dealt.
function play(
  at: (t: number) => Input,
  { gap = 90, ex = false, stock = 3, hp = 480, power = 0 } = {},
) {
  const { sou, other, steps } = souPlayer(gap);
  sou.variables[0] = ex ? 10 : 0;
  Object.assign(sou, { stock, hp, power });
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(sou)) mine.push(now(sou));
  }
  return { sou, other, mine, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options = {}) =>
  play((t) => (t ? {} : key), options);
const inAir = (key: Input, then: (t: number) => Input = () => ({})) =>
  play(
    (t) => (t === 0 ? { jump: true, right: true } : t === 10 ? key : then(t)),
    {
      ex: true,
    },
  );
const commands = (inputs: Input[], options = {}) =>
  play((t) => inputs[t] ?? {}, options);

describe('SOU (16 SOU.PLAYER)', () => {
  it('takes 480 life from his parameter block, desperate at 144', () => {
    expect([lifeOf('sou'), desperationOf('sou')]).toEqual([480, 144]);
    const { sou } = souPlayer();
    expect(sou).toMatchObject({ who: 'sou', hp: 480, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.sou.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('sou')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.sou.aliases).toEqual({});
    // Five after Ryuko's KOs, ten after her hits, eleven from DOWN to SHOCK
    // INFINITY (his ★変なＴＥＣＨ, 89, comes first), then ten.
    expect([60, 73, 79, 88, 90, 149].map((r) => twins[r])).toEqual([
      65, 83, 90, 99, 100, 159,
    ]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.sou.levels).toMatchObject({
      188: 21, // P1
      206: 22, // K J
      222: 31, // TYPE CHANGE to EX
      249: 31, // MID SLASH
      403: 42, // BEAST ATTACK
      438: 41, // KOKAKEN start
      444: 41, // Rangeki Start
    });
    const { sou, steps } = souPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(sou).toMatchObject({ action: 'script', branch: 188, age: 0 });
  });

  it('plays his specials and their EX forms (op 0x1f on variable 0 at 10)', () => {
    const specials = [
      [{ drill: true }, false, [272, 273, 'turn', 'idle'], 0],
      // PC 3773: Dragon P start.
      [{ drill: true }, true, [282, 283, 'idle'], 35],
      [{ iori: true }, false, [226, 'idle'], 15],
      // PC 3038: New Type DANKUHO start.
      [{ iori: true }, true, [241, 'idle'], 10],
      [{ dst: true }, false, [264, 265, 'idle'], 30],
      // PC 3708: CALL BEAST P.
      [{ dst: true }, true, [288, 'idle'], 20],
      [{ axe: true }, false, [246, 'idle'], 30],
      // PC 3404: CALL BEAST K.
      [{ axe: true }, true, [294, 'idle'], 15],
    ] as const;
    for (const [key, ex, mine, damage] of specials)
      expect(byKey(key, { ex })).toMatchObject({ mine, damage });
    // AKUMA jump's punch and kick (AKU P, AKU K).
    expect(
      play((t) => (t === 0 ? { drill: true } : t === 15 ? { kick: true } : {}))
        .mine,
    ).toEqual([272, 276, 277, 'turn', 'idle']);
  });

  it('takes MID SLASS (↓← K) and HIDDEN A (↓→ C) from their commands only', () => {
    const midSlash = [
      { crouch: true },
      {},
      { left: true },
      { left: true, kick: true },
    ];
    expect(commands(midSlash)).toMatchObject({
      mine: ['crouchEnter', 249, 'idle'],
      damage: 35,
    });
    // CHURAKA (PC 3462) leaps over a close opponent; from farther its rising
    // box's hit handler (slot 2, PC 3521) enters CHURAKA AIR HIT (253).
    expect(commands(midSlash, { ex: true }).mine).toEqual([
      'crouchEnter',
      251,
      '251+25',
      'turn',
      'idle',
    ]);
    expect(commands(midSlash, { ex: true, gap: 250 })).toMatchObject({
      mine: ['crouchEnter', 251, 253, '253+7', 'idle'],
      damage: 56,
    });
    const hidden = [
      { crouch: true },
      {},
      { right: true },
      { right: true, hitUp: true },
    ];
    expect(commands(hidden).mine).toEqual(['crouchEnter', 285, 'turn', 'idle']);
    // PC 3983: CALL BEAST A.
    expect(commands(hidden, { ex: true }).mine).toEqual([
      'crouchEnter',
      306,
      'idle',
    ]);
  });

  it('rides his Eagle (EX BK in the air) while Eagle OBJ holds variable 7 at 100 (PCs 5661–5663)', () => {
    const eagle = inAir({ dst: true });
    // 500 ticks, then Eagle Air (335, PC 4465) and Eagle Lend (346).
    expect(eagle.mine).toEqual(['takeoff', 'jump', 314, 335, '346+3', 'idle']);
    expect(eagle.sou.variables[7]).toBe(0);
    // Op 0x24 steers it within 10 ticks of a direction (PCs 4473–4480).
    expect(
      inAir({ dst: true }, (t) => (t > 30 && t < 300 ? { right: true } : {}))
        .mine,
    ).toEqual(['takeoff', 'jump', 314, 321, 335, '346+3', 'idle']);
    expect(
      inAir({ dst: true }, (t) => (t === 40 ? { punch: true } : {})),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 314, 336, 338, 'idle'],
      damage: 35,
    });
  });

  it('spends his stocks on Command 1, SPARK and DANKU SHOT (one each) and Beast att (3), and their EX forms', () => {
    const supers = [
      [{ musashi: true }, false, [444, 447, 450, 283, 'idle'], 120, 2],
      // PC 7115: EX SLASH SUP.
      [{ musashi: true }, true, [456, 458, 459, 'idle'], 100, 2],
      // Beast FIN hit enters BA Stop (418) at global 3 = 0 (PC 6751), off VS.
      [
        { changeAttack: true },
        false,
        [403, 404, '404+17', 418, '417+20', 'turn', 'idle'],
        210,
        0,
      ],
      // PC 6463: Final DANKUHO start.
      [{ changeAttack: true }, true, [424, 'idle'], 231, 0],
      [{ blackRush: true }, false, [390, 'turn', 'idle'], 84, 2],
      // PC 6288: DANKUSHOT.
      [{ blackRush: true }, true, [365, '368+16', 'idle'], 100, 2],
      [{ megaBeam: true }, false, [373, '373+27', '373+32', 'idle'], 95, 2],
      // PC 5863: Super DANKUKEN START.
      [{ megaBeam: true }, true, [379, '384+23', 'idle'], 115, 2],
    ] as const;
    for (const [key, ex, mine, damage, stock] of supers)
      expect(byKey(key, { ex })).toMatchObject({
        mine,
        damage,
        sou: { stock },
      });
    // Too little stock enters No super (353).
    expect(byKey({ changeAttack: true }, { stock: 2 }).mine).toEqual([
      353,
      'idle',
    ]);
  });

  it('keeps KOKAKEN for under 144 life (PC 7014) and EVIL DANKU LOW for 144 or less (PC 5870)', () => {
    expect(byKey({ getterBeam: true }, { hp: 144 }).mine).toEqual([
      353,
      'idle',
    ]);
    expect(byKey({ getterBeam: true }, { hp: 143 })).toMatchObject({
      mine: [438, '438+43', 'idle'],
      damage: 250,
      sou: { stock: 0 },
    });
    expect(byKey({ megaBeam: true }, { hp: 145 }).mine[0]).toBe(373);
    expect(byKey({ megaBeam: true }, { hp: 144 })).toMatchObject({
      mine: [375, '375+22', '375+26', 'idle'],
      damage: 115,
    });
  });

  it('switches mode with TYPE CHANGE for 50 power, or a stock (PCs 2995–3006)', () => {
    const change = (stock: number, power: number, ex = false) => {
      const { sou } = byKey({ ex: true }, { stock, power, ex });
      return [exMode(sou), sou.stock, sou.power];
    };
    expect(change(1, 0)).toEqual([true, 0, 50]);
    expect(change(0, 60)).toEqual([true, 0, 10]);
    // Short of 50, No super (353) adds 10 (PC 5686).
    expect(change(0, 0)).toEqual([false, 0, 10]);
    expect(change(1, 0, true)).toEqual([false, 0, 50]);
    expect(change(0, 0, true)).toEqual([true, 0, 10]);
  });

  it('stands in action 1, his EX stance (1 + 17, PC 9) or, at 144 life or less, 1 + 27 (PC 8)', () => {
    const stance = (ex: number, life: number) => {
      const vm = new StandingVM(CHARACTERS.sou.idle, 0, 10, { 0x40: ex });
      const seen: number[] = [];
      while (!vm.ended) {
        vm.life = life;
        vm.tick();
        if (vm.frame && seen.at(-1) !== vm.frame.image)
          seen.push(vm.frame.image);
      }
      return seen;
    };
    expect(stance(0, 480)).toEqual([115, 116, 117, 116]);
    expect(stance(10, 480)).toEqual([349, 350, 351, 352, 353, 354]);
    expect(stance(10, 144)).toEqual([360, 361, 355, 356, 357, 356, 358, 359]);
  });

  it('drops into his Vs. intro and lands, in EX mode with down held (PC 415)', () => {
    // 開始時 BR + 10 (PC 402), then Round 1 from PC 411.
    expect(
      [0, 2, 108].map((age) => animationFrame('36+10', age, 'sou').image),
    ).toEqual([8191, 306, 306]);
    // Landed, Round 1 + 10 from PC 418 with its call of DEMO stand (PC 420).
    expect(
      [0, 5, 19, 90].map((age) => animationFrame('37+10', age, 'sou').image),
    ).toEqual([124, 123, 115, 116]);
    for (const crouch of [false, true]) {
      // After 開始時's (34) blank display, KGT 13's global 14 fails 開始時
      // BR's jump to + 10 (PC 392): up 2 ticks, then stopped 50 on image
      // 306 (PCs 395–396). The fall passes the floor 319 source pixels down,
      // and the landing (0x41187f) enters Round 1 + 10 (slot 1, PC 409) a
      // tick later, whose check (PC 415) enters Change Character (41) for
      // down.
      const { path, ticks, f, match, heights } = brIntro('sou', 0, () => ({
        crouch,
      }));
      expect(Math.min(...heights) / 1.5).toBeCloseTo(-319.824, 3);
      expect([heights[159] > 0, heights[160]]).toEqual([true, 0]);
      expect([path, ticks]).toEqual([[34, 36, crouch ? 41 : '37+10'], 252]);
      // OP super Charge (43, PC 398) charges the second stock the tick
      // after.
      expect(f.stock).toBe(1);
      match.step({ crouch });
      expect([f.x, f.stock, exMode(f)]).toEqual([390 * 1.5, 2, crouch]);
    }
  });

  it('wins after a call of DEMO stand (PC 643), holding image 310, and draws holding 318', () => {
    expect(
      [0, 72, 88, 1000].map((age) => animationFrame('win', age, 'sou').image),
    ).toEqual([115, 307, 309, 310]);
    expect(animationFrame('draw', 1000, 'sou').image).toBe(318);
    expect(BLACK.sou.opaque.image).toBe(1009);
    // EX mode cycles the face through 2002, 2001, 2000 and 2001 (PCs
    // 792–806).
    expect([-1, 0, 40, 80, 120].map((face) => faceImage(face, 'sou'))).toEqual([
      2001, 2002, 2001, 2000, 2001,
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'sou']);
    const sou = match.fighters[1];
    const entered = new Set<unknown>();
    // BK GROUND, CPU IORI1, CPU AKU JUMP, HIDDEN MOVE and DANKUHO LOW START.
    const wanted = [264, 525, 527, 285, 373];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (sou.action === 'script') entered.add(sou.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
