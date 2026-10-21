import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { StandingVM } from './standing';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

// GIGI as player 1, `gap` from a standing opponent as player 2.
function gigiPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['gigi', opponent]);
  const [gigi, other] = match.fighters;
  other.x = gigi.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, gigi, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
const noInput: (t: number) => Input = () => ({});
// Inputs from `at(t)` (and the opponent's from `theirs(t)`) for 3000 ticks:
// GIGI's actions, the objects he spawned and the damage each took. `change`
// starts him in his Change form (variable 0 at 100).
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, hp = 0, change = false, theirs = noInput } = {},
) {
  const { match, gigi, other, steps } = gigiPlayer(gap);
  gigi.stock = stock;
  if (hp) gigi.hp = hp;
  if (change) gigi.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(gigi)) mine.push(now(gigi));
    for (const e of match.effects) objects.add(e.clip);
  }
  return {
    gigi,
    mine,
    objects,
    damage: lifeOf('ryuko') - other.hp,
    taken: lifeOf('gigi') - gigi.hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
// Held from `from` to `until`, after the presses.
const holding =
  (from: number, held: Input, keys: Record<number, Input>, until = 400) =>
  (t: number) =>
    keys[t] ?? (t >= from && t < until ? held : {});

describe('GIGI (25 GIGI.PLAYER)', () => {
  it('takes 500 life from his parameter block, desperate at 150', () => {
    expect([lifeOf('gigi'), desperationOf('gigi')]).toEqual([500, 150]);
    const { gigi } = gigiPlayer();
    expect(gigi).toMatchObject({ who: 'gigi', hp: 500, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.gigi.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('gigi')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (124, 125)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 81, 124],
      [77, 79, 125],
    ]);
    expect(CHARACTERS.gigi.aliases).toEqual({ 124: 79, 125: 77 });
    // Two before Ryuko's KOs, two after his hits, three for Twis 2 and the
    // shock, two from Shock, three from Clothes off500, six from Chain pull
    // back, his own FB two before hers, three from HISO stop, five from Pull
    // Back and four past Chuck Hiso.
    expect(
      [59, 60, 73, 86, 87, 88, 90, 104, 105, 110, 113, 121, 140, 149].map(
        (r) => twins[r],
      ),
    ).toEqual([57, 58, 75, 88, 90, 91, 92, 107, 111, 108, 116, 126, 144, 153]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.gigi.levels).toMatchObject({
      182: 21, // P1
      202: 22, // K J
      216: 31, // Change
      225: 31, // DIVE
      239: 31, // Dragon start
      270: 31, // K' start
      281: 31, // Bike start K
      282: 31, // Bike start P
      292: 41, // Ranbu start
      308: 41, // super chuck start
      327: 42, // Call GIGI
    });
    const { gigi, steps } = gigiPlayer();
    steps({}, 2);
    steps({ kick: true });
    expect(gigi).toMatchObject({ action: 'script', branch: 189, age: 0 });
  });

  it('chains J and K through p1 hit or k1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    // P1's roll (rand % 4 > 1, PC 2497) skips to 182 + 6. P3 runs past the
    // opponent and grabs from behind (P3 hit, 186), throwing them over.
    expect(
      play(
        presses({
          0: { punch: true },
          14: { punch: true },
          45: { punch: true },
        }),
      ),
    ).toMatchObject({
      mine: ['182+6', 183, 184, 185, 186, 'turn', 'idle'],
      damage: 70,
    });
    expect(
      play(
        presses({ 0: { kick: true }, 14: { kick: true }, 45: { kick: true } }),
      ),
    ).toMatchObject({ mine: [189, 190, 191, 192, 193, 'idle'], damage: 60 });
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [209, 210, '210+14', '198+2', 'idle'],
      damage: 35,
    });
    // Hit up hit (207) takes ↑ within 20 ticks (PC 3001) into Jump cancel.
    expect(
      play(holding(10, { jump: true }, { 0: { hitUp: true } })),
    ).toMatchObject({ mine: [206, 207, 208, 'land', 'turn', 'idle'] });
  });

  it("plays his specials: Dragon, K' and its follow-ups, DIVE and the Bikes", () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [239, 240, 'idle'], 20],
      [{ axe: true }, [270, 'idle'], 20],
      [{ dst: true }, [282, 'idle'], 43],
      [{ blackRush: true }, [281, 240, 'turn', 'idle'], 33],
      // Bike start PK jumps to Bike start P (PC 4510).
      [{ megaBeam: true }, [283, 'idle'], 43],
      // DIVE's variable 2 runs down from 305 (PCs 3297, 3315) into DIVE Out.
      [{ iori: true }, [225, 234, 236, 'idle'], 0],
    ] as const) {
      const move = byKey(key);
      expect(move).toMatchObject({ mine, damage });
      expect(move.gigi.stock).toBe(3);
    }
    // K' start takes → J or → K within 20 ticks (PCs 4185–4186): K' P
    // fires k' fire (272), K' K swings up.
    const kP = play(
      presses({ 0: { axe: true }, 25: { right: true, punch: true } }),
    );
    expect(kP).toMatchObject({ mine: [270, 271, 'idle'], damage: 40 });
    expect(kP.objects).toContain(272);
    expect(
      play(presses({ 0: { axe: true }, 25: { right: true, kick: true } })),
    ).toMatchObject({ mine: [270, 274, 273, 'idle'], damage: 35 });
    // Under the floor, J and K come up as DIVE P and DIVE K (PCs 3319–3320).
    expect(
      play(presses({ 0: { iori: true }, 60: { punch: true } })),
    ).toMatchObject({ mine: [225, 230, 234, 236, 'idle'], damage: 10 });
    expect(
      play(presses({ 0: { iori: true }, 60: { kick: true } })),
    ).toMatchObject({ mine: [225, 231, 240, 'idle'], damage: 35 });
  });

  it('runs his air specials, Air Bike K landing through 技名11 (285) into Dragon lend', () => {
    expect(
      play(presses({ 0: { jump: true }, 10: { drill: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 242, 240, 'idle'],
      damage: 30,
    });
    // 285 has no display: it spawns Fly bike (284) and enters 240 at once.
    const bike = play(presses({ 0: { jump: true }, 10: { blackRush: true } }));
    expect(bike).toMatchObject({
      mine: ['takeoff', 'jump', 278, 240, 'idle'],
      damage: 16,
    });
    expect(bike.objects).toContain(284);
  });

  it('spends 50 power on Change (216), which sets variable 0 (PC 3125), and back (217)', () => {
    const change = byKey({ ex: true });
    expect([change.mine, exMode(change.gigi), change.gigi.stock]).toEqual([
      [216, 'idle'],
      true,
      2,
    ]);
    expect(change.gigi.power).toBe(50);
    const back = byKey({ ex: true }, { change: true });
    expect([back.mine, exMode(back.gigi), back.gigi.stock]).toEqual([
      [217, 'idle'],
      false,
      2,
    ]);
  });

  it('turns his specials into GIGI P, Jump att, Chuck ECC and Doge D in his Change form', () => {
    const change = { change: true };
    for (const [key, mine, damage] of [
      [{ iori: true }, [219, 'idle'], 15],
      [{ drill: true }, [256, 257, 261, 'idle'], 40],
      [{ axe: true }, [263, 'idle'], 20],
      [{ dst: true }, [244, 240, 'turn', 'idle'], 35],
      // Doge D K comes out 300 source pixels on, past him.
      [{ blackRush: true }, [245, 240, 'turn', 'idle'], 0],
      // Doge D P takes K within 10 ticks (PC 3706) into Doge D PK.
      [{ megaBeam: true }, [246, 240, 'idle'], 35],
    ] as const)
      expect(byKey(key, change)).toMatchObject({ mine, damage });
    expect(byKey({ axe: true }, change).objects).toContain('266+85');
    // GIGIP1 takes ↓← J or K within 30 ticks (PCs 3180–3181), checked past
    // its strike's stops.
    const chain = (button: Input) =>
      play(
        presses({
          0: { iori: true },
          40: { crouch: true },
          41: { crouch: true },
          42: { left: true },
          43: button,
        }),
        change,
      );
    expect(chain({ punch: true })).toMatchObject({
      mine: [219, 220, 'idle'],
      damage: 20,
    });
    expect(chain({ kick: true })).toMatchObject({
      mine: [219, 223, 'idle'],
      damage: 31,
    });
  });

  it('spends a stock on Ranbu, whose finish takes ↑ or ↓ (PCs 4693–4697), and S chuck, and three on EN3', () => {
    for (const [key, held, mine, damage, left] of [
      ['getterBeam', {}, [292, 'idle'], 102, 2],
      ['getterBeam', { jump: true }, [292, 298, 222, 'idle'], 112, 2],
      [
        'getterBeam',
        { crouch: true },
        [292, 299, 'crouchEnter', 'crouch', 'stand', 'idle'],
        112,
        2,
      ],
      [
        'musashi',
        {},
        [308, 309, '311+9', '312+9', '313+7', 212, '198+2', 'idle'],
        100,
        2,
      ],
      ['changeAttack', {}, [327, 'idle'], 240, 0],
    ] as const) {
      const move = play(holding(100, held, { 0: { [key]: true } }));
      expect([move.mine, move.damage, move.gigi.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    expect(byKey({ changeAttack: true }, { stock: 2 })).toMatchObject({
      mine: [287, 'idle'],
      damage: 0,
    });
    expect(byKey({ changeAttack: true }).objects).toContain(335);
  });

  it('fires Bean start and Counter in his Change form', () => {
    // call handen (304) strikes 5 twenty times from 114 source pixels ahead
    // (PCs 4780, 4804), past a near opponent.
    for (const [gap, damage] of [
      [90, 0],
      [150, 100],
    ])
      expect(byKey({ getterBeam: true }, { change: true, gap })).toMatchObject({
        mine: [301, 'idle'],
        damage,
      });
    // Counter holds variable 4 at 100 for 100 ticks (PCs 4995–5008): struck
    // then, his reaction enters Counter!! (322), whose kick counters for 90.
    const struck = (at: number) =>
      byKey(
        { musashi: true },
        { change: true, theirs: presses({ [at]: { punch: true } }) },
      );
    expect(struck(20)).toMatchObject({
      mine: [321, 322, 240, 'idle'],
      damage: 90,
      taken: 3,
    });
    expect(struck(130)).toMatchObject({
      mine: [321, 'hit', 'idle'],
      damage: 0,
    });
  });

  it('cancels the moves that set variable 6 into a super for two stocks (Ranbu SC, SC SUPER)', () => {
    const scRanbu = play(
      presses({ 0: { dst: true }, 15: { getterBeam: true } }),
    );
    expect([scRanbu.mine, scRanbu.damage, scRanbu.gigi.stock]).toEqual([
      [282, 293, 'idle'],
      117,
      1,
    ]);
    // super chuck start enters SC SUPER + 5, which jumps to SC Super Chuck
    // (317, PC 4567).
    const scChuck = play(presses({ 0: { dst: true }, 15: { musashi: true } }));
    expect([scChuck.mine, scChuck.damage, scChuck.gigi.stock]).toEqual([
      [282, '290+5', 309, '311+9', '312+9', '313+7', 212, '198+2', 'idle'],
      115,
      1,
    ]);
    const cancel = (key: Input, gap = 90) =>
      play(presses({ 0: { iori: true }, 15: key }), { change: true, gap });
    const bean = cancel({ getterBeam: true }, 150);
    expect([bean.mine, bean.damage, bean.gigi.stock]).toEqual([
      [219, 290, 'idle'],
      115,
      1,
    ]);
    // SC COUNTER (323) catches the opponent itself (PCs 5057–5058).
    const counter = cancel({ musashi: true });
    expect([counter.mine, counter.damage, counter.gigi.stock]).toEqual([
      [219, '290+13', 324, 240, 'idle'],
      75,
      1,
    ]);
  });

  it('slides his heavy crouching guard at raw −320 unslowed (PC 2251)', () => {
    const { other: gigi, steps } = gigiPlayer(90, 'gigi');
    const guard = { crouch: true, guard: true };
    steps({}, 2);
    steps({ punch: true }, 1, guard);
    steps({}, 13, guard);
    steps({ punch: true }, 1, guard);
    while (gigi.action !== 'crouchBlockHeavy' || gigi.age < 8)
      steps({}, 1, guard);
    const x = gigi.x;
    steps({}, 22, guard);
    expect(gigi.action).toBe('crouchBlockHeavy');
    expect(gigi.x - x).toBeCloseTo(22 * 320 * (655 / 65536) * 1.5, 6);
  });

  it('charges two stocks through his Vs. intro and starts his Change form while down is held at its check (PC 361)', () => {
    expect(animationDuration('32+3', 'gigi')).toBe(200);
    for (const crouch of [false, true]) {
      // The check jumps to 開始時 2P (31) + 13.
      const { path, f } = brIntro('gigi', 0, () => ({ crouch }));
      // OP super Charge (38, PC 351) runs alongside.
      expect([path, exMode(f), f.stock]).toEqual([
        [30, '32+3', ...(crouch ? ['31+13'] : [])],
        crouch,
        2,
      ]);
    }
    expect([0, 40, 80, 120].map((face) => faceImage(face, 'gigi'))).toEqual([
      2002, 2001, 2000, 2001,
    ]);
  });

  it('wins after Demo stand, looping image 211 (PC 578), and draws after two, holding image 2000', () => {
    expect(
      [0, 81, 100, 105, 145, 2000].map(
        (age) => animationFrame('win', age, 'gigi').image,
      ),
    ).toEqual([113, 209, 210, 211, 211, 211]);
    expect(
      [80, 81, 161, 162, 164, 2000].map(
        (age) => animationFrame('draw', age, 'gigi').image,
      ),
    ).toEqual([122, 113, 122, 297, 2000, 2000]);
    expect(BLACK.gigi.opaque.image).toBe(1009);
    expect(faceImage(-1, 'gigi')).toBe(2001);
  });

  it("sounds his idle's sound 8 in the half its roll picks (PCs 13, 24)", () => {
    const passes = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => {
      const vm = new StandingVM(CHARACTERS.gigi.idle, seed);
      while (!vm.ended) vm.tick();
      return [vm.branches[0].taken, vm.sounds] as const;
    });
    expect(new Set(passes.map(([taken]) => taken)).size).toBe(2);
    for (const [taken, sounds] of passes)
      expect(sounds).toEqual(taken ? [8] : []);
    expect(CHARACTERS.gigi.sounds.map(({ index }) => index)).toContain(8);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'gigi']);
    const gigi = match.fighters[1];
    const entered = new Set<unknown>();
    // Dragon start, Bike start P, super chuck start and his CPU's own cpu
    // k' shot, Cpu k' up and cpu DIVE.
    const wanted = [239, 282, 308, 402, 403, 408];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (gigi.action === 'script') entered.add(gigi.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
