import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  KAY_INTRO_EX_TICK,
} from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// KAY as player 1, `gap` from a standing opponent.
function kayPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['kay', opponent]);
  const [kay, other] = match.fighters;
  other.x = kay.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, kay, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// A move entered by its key, in EX mode or not, run until both are back on
// their feet, the opponent jumping `jumped` ticks before and `follow` pressed
// at `at`: KAY's actions and the damage dealt.
function byKey(
  key: Input,
  {
    gap = 90,
    ex = false,
    stock = 3,
    jumped = 0,
    follow = {} as Input,
    at = -1,
  },
) {
  const { kay, other, steps } = kayPlayer(gap);
  kay.variables[0] = ex ? 100 : 0;
  kay.stock = stock;
  steps({}, 2);
  for (let t = 0; t < jumped; t++) steps({}, 1, t ? {} : { jump: true });
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(t ? (t === at ? follow : {}) : key);
    if (mine.at(-1) !== now(kay)) mine.push(now(kay));
  }
  return { kay, other, mine, damage: 510 - other.hp };
}

describe('KAY (12 KAY.PLAYER)', () => {
  it('takes 500 life from his parameter block, desperate at 150', () => {
    expect([lifeOf('kay'), desperationOf('kay')]).toEqual([500, 150]);
    const { kay } = kayPlayer();
    expect(kay).toMatchObject({ who: 'kay', hp: 500, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.kay.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('kay')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (124, 125)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 82, 124],
      [77, 80, 125],
    ]);
    expect(CHARACTERS.kay.aliases).toEqual({ 124: 79, 125: 77 });
    // Ryuko's KOs, three after her hits, four for the twists and the shock,
    // six from Chain pull back (the stun), his own FB, FBB and FBH two
    // before hers, three from HISO stop (ERUS INATUMA) and five from Pull
    // Back.
    expect(
      [60, 73, 85, 86, 88, 90, 104, 108, 110, 112, 118, 121, 149].map(
        (r) => twins[r],
      ),
    ).toEqual([60, 76, 88, 90, 92, 93, 107, 114, 108, 110, 121, 126, 154]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.kay.levels).toMatchObject({
      183: 21, // P1
      210: 22, // K J
      227: 31, // EX
      258: 31, // Lilith
      280: 32, // Matriel
      314: 41, // super punch start
      339: 41, // KAORU START
      361: 42, // EN3 start Near
    });
    const { kay, steps } = kayPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(kay).toMatchObject({ action: 'script', branch: 183, age: 0 });
  });

  it("throws Lilith's lance for six strikes of 6, and 13 P's arms rise 250 source pixels out", () => {
    expect(byKey({ axe: true }, {})).toMatchObject({
      mine: [258, 'idle'],
      damage: 36,
    });
    expect(byKey({ command: 9 }, {}).damage).toBe(0);
    expect(byKey({ command: 9 }, { gap: 300 }).damage).toBe(36);
  });

  it('catches only an airborne opponent with Matriel (box kind 0x50, PC 4559), falling into his own knockdown', () => {
    expect(byKey({ drill: true }, {})).toMatchObject({
      mine: [280, '280+28', 'turn', 'idle'],
      damage: 0,
    });
    // Matriel hit Down (283) lands, slot 1 at PC 4637, in DOWN normal (151).
    expect(byKey({ drill: true }, { jumped: 10 })).toMatchObject({
      mine: [280, 281, 'knockdown', 'getUp', 'idle'],
      damage: 40,
    });
  });

  it('counters a strike in Counter start’s window (variable 4 at 100, PCs 3482–3498)', () => {
    const { kay, other, steps } = kayPlayer(70);
    steps({}, 2);
    const mine: unknown[] = [];
    for (let t = 0; t < 400; t++) {
      steps(t ? {} : { iori: true }, 1, t === 5 ? { punch: true } : {});
      if (mine.at(-1) !== now(kay)) mine.push(now(kay));
    }
    // The reaction's op 0x1f (PC 760) enters Counter Get (232), whose leap
    // lands (slot 1, PC 3539) in its own records + 31.
    expect(mine).toEqual([230, 232, '232+31', 'idle']);
    expect(other.hp).toBe(510 - 48);
  });

  it('switches to EX mode for 50 power, where Fire is the EX Sachiel stance', () => {
    const { kay, steps } = kayPlayer();
    kay.stock = 1;
    steps({}, 2);
    steps({ ex: true });
    steps({}, 40);
    expect([exMode(kay), kay.stock, kay.power]).toEqual([true, 0, 50]);
    steps({ ex: true });
    steps({}, 40);
    expect(exMode(kay)).toBe(false);
    // Its op 0x24s (PCs 4197–4201) take chuck to EX Sachiel G (264) and
    // Hit Up to EX Sachiel A (271). G's hit (265) ends in his own FLY NO HIT
    // + 16 (PC 4267), as Ryuko's Musashi finish does.
    expect(byKey({ axe: true }, { ex: true }).mine).toEqual([263, 'idle']);
    expect(
      byKey({ axe: true }, { ex: true, follow: { throw: true }, at: 40 }),
    ).toMatchObject({
      mine: [263, 264, 265, 'fly', 'knockdown', 'getUp', 'idle'],
      damage: 45,
    });
  });

  it('spends his stocks on en300 (3), KAORU and SUPER P (one each), and their EX forms', () => {
    const supers = [
      [{ getterBeam: true }, false, [361, 362, 368, '368+21', 'idle'], 230, 0],
      [{ getterBeam: true }, true, [381, 'idle'], 210, 0],
      [
        { musashi: true },
        false,
        [339, '339+30', 340, 344, 'turn', 'idle'],
        100,
        2,
      ],
      [{ musashi: true }, true, [353, 355, 356, 357, 'idle'], 112, 2],
      [{ changeAttack: true }, false, [314, 'turn', 'idle'], 84, 2],
      [{ changeAttack: true }, true, [333, 332, 'idle'], 100, 2],
    ] as const;
    for (const [key, ex, mine, damage, stock] of supers)
      expect(byKey(key, { ex, gap: 60 })).toMatchObject({
        mine,
        damage,
        kay: { stock },
      });
  });

  it('credits a striker 13 power for his Fire HISA (PC 1324) and HISA’s 3 for his FBH (PC 1408)', () => {
    // EX 13 P's pillar (304) strikes with response 58, FBH.
    const fbh = (victim: Who) => {
      const { kay, steps } = kayPlayer(300, victim);
      kay.variables[0] = 100;
      steps({}, 2);
      steps({ command: 9 });
      steps({}, 300);
      return kay.power;
    };
    expect([fbh('ryuko'), fbh('kay')]).toEqual([8 + 13, 8 + 3]);
    // Chung's crouching kick strikes with response 48, Fire HISA.
    const fire = (victim: Who) => {
      const match = new Match('practice', false, 3, ['chung', victim]);
      const [chung, other] = match.fighters;
      other.x = chung.x + 100;
      match.step({});
      match.step({ kick: true, crouch: true });
      for (let t = 0; t < 300; t++) match.step({});
      return chung.power;
    };
    expect([fire('ryuko'), fire('kay')]).toEqual([5 + 3, 5 + 13]);
  });

  it("shows H SLASH (387) for P3's hits, which set his variable 2 to 5 (PC 2615)", () => {
    // HP hit (385), spawned from his container, tests his variable 2 (PC
    // 6520): the runner reads an object's player variables from its
    // player's struct (0x411c12).
    const { match, kay, steps } = kayPlayer();
    steps({}, 2);
    const effects = new Set<unknown>();
    const mine: unknown[] = [];
    for (let t = 0; t < 300; t++) {
      steps(t % 6 === 0 && t < 200 ? { punch: true } : {});
      if (mine.at(-1) !== now(kay)) mine.push(now(kay));
      for (const e of match.effects) if (e.owner === 0) effects.add(e.clip);
    }
    expect(mine.slice(0, 4)).toEqual([183, 184, 185, 189]);
    expect([...effects]).toEqual(expect.arrayContaining([385, 387]));
  });

  it('frees him 6 ticks into an air guard, where Ryuko’s holds 23 (PC 2195)', () => {
    expect(
      (['ryuko', 'kay'] as const).map((who) =>
        animationDuration('airBlock', who),
      ),
    ).toEqual([23, 6]);
  });

  it('stands in action 1 until it runs out', () => {
    const vm = new StandingVM(CHARACTERS.kay.idle);
    let ticks = 0;
    for (; ticks < 400 && !vm.ended; ticks++) vm.tick();
    expect(vm.ended).toBe(true);
  });

  it('walks in from Round 1 + 5 at raw 200 (PC 356) and calls Demo stand twice, charged with two stocks', () => {
    expect([KAY_INTRO_EX_TICK, animationDuration('intro', 'kay')]).toEqual([
      82, 200,
    ]);
    const match = new Match('cpu', true, 0, ['kay', 'zoma']);
    const kay = match.fighters[0];
    while (kay.age < 56) match.step({});
    // From 390 source pixels (0x408ac3), raw 200 for 56 ticks.
    expect(kay.x - 390 * 1.5).toBeCloseTo(56 * 200 * (655 / 65536) * 1.5, 6);
    while (kay.action === 'intro') match.step({});
    for (let t = 0; t < 100; t++) match.step({});
    expect([kay.stock, kay.power]).toEqual([2, 0]);
  });

  it('enters EX CH (36) with down held as Round 1’s op 0x16 checks (PC 367)', () => {
    const held = new Match('cpu', true, 0, ['kay', 'zoma']);
    for (let t = 0; t < KAY_INTRO_EX_TICK; t++) held.step({ crouch: true });
    expect(exMode(held.fighters[0])).toBe(true);
    const late = new Match('cpu', true, 0, ['kay', 'zoma']);
    for (let t = 0; t <= KAY_INTRO_EX_TICK; t++)
      late.step({ crouch: t === KAY_INTRO_EX_TICK });
    expect(exMode(late.fighters[0])).toBe(false);
  });

  it('hops in his win (PC 579), landing into 57 + 10, then rolls his voice (PCs 588–596) into WIN RP (58)', () => {
    const image = (age: number) => animationFrame('win', age, 'kay').image;
    expect([0, 76, 77, 1000].map(image)).toEqual([114, 375, 376, 376]);
    const win = (seed: number) => {
      const match = new Match('practice', false, seed, ['kay', 'ryuko']);
      const [kay, ryuko] = match.fighters;
      ryuko.hp = 0;
      ryuko.action = 'koLand';
      match.winner = 'player';
      while (kay.action !== 'win') match.step();
      const seen: [unknown, number, number, unknown][] = [];
      const cued: [number, number][] = [];
      for (let t = 0; t < 300; t++) {
        match.step({});
        seen.push([kay.branch, kay.age, kay.y / 1.5, kay.entered?.image]);
        for (const { owner, index } of match.sounds)
          if (owner === 0) cued.push([t, index]);
      }
      return { seen, cued };
    };
    const { seen, cued } = win(0);
    // Up 9.57 source pixels on the first move at age 77, 114 at the peak;
    // the step after his 47th move passes the floor (0x41187f) lands him
    // into 57 + 10.
    expect(seen[75].slice(1, 3)).toEqual([76, 0]);
    expect(seen[76][2]).toBeCloseTo(-9.57, 2);
    expect(Math.min(...seen.map(([, , y]) => y))).toBeCloseTo(-114.0, 1);
    expect(seen[122][2]).toBeGreaterThan(0);
    expect(seen[123]).toEqual(['57+10', 0, 0, 376]);
    expect(seen[164][3]).toBe(380);
    // The hop's sound (42, PC 580), the landing's (41, PC 584), then the
    // voice: each roll falls through to its sound or branches on, the last
    // back to the second (PC 594), and WIN RP loops without replaying it.
    expect(cued).toEqual([
      [76, 42],
      [143, 41],
      [164, 32],
    ]);
    expect([1, 2, 3, 4, 5].map((seed) => win(seed).cued.slice(2))).toEqual([
      [[164, 32]],
      [[164, 37]],
      [[164, 37]],
      [[164, 32]],
      [[164, 32]],
    ]);
    expect(animationFrame('draw', 1000, 'kay').image).toBe(201);
    expect(BLACK.kay.opaque.image).toBe(1013);
    expect(faceImage(-1, 'kay')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'kay']);
    const kay = match.fighters[1];
    const entered = new Set<unknown>();
    const wanted = [258, 298];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (kay.action === 'script') entered.add(kay.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
