import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  SAKUYA_INTRO_EX_TICK,
} from './animations';
import type { Action } from './animations';
import { faceImage } from './hud';
import { exMode, fighterPose, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

const VELOCITY = (655 / 65536) * 1.5;

// SAKUYA as player 1, `gap` from a standing opponent.
function sakuyaPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['sakuya', opponent]);
  const [sakuya, other] = match.fighters;
  other.x = sakuya.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, sakuya, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// A move entered by its key, in EX mode or not, with `follow` (or the key
// again) pressed at `again`, run until both are back on their feet: SAKUYA's
// actions and the damage dealt.
function byKey(
  key: Input,
  {
    gap = 90,
    ex = false,
    stock = 3,
    again = [] as number[],
    follow = key,
  } = {},
) {
  const { sakuya, other, steps } = sakuyaPlayer(gap);
  sakuya.variables[0] = ex ? 100 : 0;
  sakuya.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(t ? (again.includes(t) ? follow : {}) : key);
    if (mine.at(-1) !== now(sakuya)) mine.push(now(sakuya));
  }
  return { sakuya, other, mine, damage: lifeOf('ryuko') - other.hp };
}

describe('SAKUYA (14 SAKUYA.PLAYER)', () => {
  it('takes 470 life from her parameter block, desperate at 141', () => {
    expect([lifeOf('sakuya'), desperationOf('sakuya')]).toEqual([470, 141]);
    const { sakuya } = sakuyaPlayer();
    expect(sakuya).toMatchObject({ who: 'sakuya', hp: 470, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's, but for her UNCOUNTER reactions", () => {
    const twins = CHARACTERS.sakuya.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('sakuya')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (139, 140)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 98, 139],
      [77, 96, 140],
    ]);
    expect(CHARACTERS.sakuya.aliases).toEqual({ 139: 79, 140: 77 });
    // Thirteen after Ryuko's KOs, nineteen after her hits, eighteen from
    // Shock, FB and FBB swapped, twenty from Pull Back, nineteen past Chuck
    // Hiso and twenty from the guards.
    expect(
      [60, 73, 88, 90, 105, 110, 111, 112, 121, 140, 149].map((r) => twins[r]),
    ).toEqual([73, 92, 107, 108, 123, 129, 128, 130, 141, 159, 169]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.sakuya.levels).toMatchObject({
      198: 21, // P1
      238: 22, // K J
      256: 31, // TO EX
      260: 31, // FIRE START
      370: 41, // spark start
      438: 42, // en300 START
    });
    const { sakuya, steps } = sakuyaPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(sakuya).toMatchObject({ action: 'script', branch: 198, age: 0 });
  });

  it('plays her specials and their EX forms (op 0x1f on variable 0)', () => {
    const specials = [
      [{ axe: true }, false, [260, 'idle'], 23],
      [{ axe: true }, true, [268, 'idle'], 25],
      [{ megaBeam: true }, false, [359, 'idle'], 12],
      [{ megaBeam: true }, true, [270, 'idle'], 15],
      [{ drill: true }, false, [311, 312, 'idle'], 33],
      [{ drill: true }, true, [314, 315, 'idle'], 30],
      [{ blackRush: true }, false, [303, 304, 'idle'], 20],
      [{ blackRush: true }, true, [296, 'idle'], 40],
      [{ command: 6 }, false, [347, 348, 'idle'], 35],
    ] as const;
    for (const [key, ex, mine, damage] of specials)
      expect(byKey(key, { ex })).toMatchObject({ mine, damage });
  });

  it('follows iori with ↓← J twice (op 0x24, PCs 4223, 4228), and C C with ↓→ K or J (PCs 5382–5387)', () => {
    expect(byKey({ iori: true })).toMatchObject({
      mine: [285, 286, 'turn', 'idle'],
      damage: 13,
    });
    expect(byKey({ iori: true }, { again: [30, 70] })).toMatchObject({
      mine: [285, 286, 289, 291, 'idle'],
      damage: 41,
    });
    expect(byKey({ iori: true }, { ex: true, again: [30, 70] })).toMatchObject({
      mine: [273, 275, 277, 'idle'],
      damage: 43,
    });
    // CC hit 3 enters CC K NEW (357) for ↓→ K, which LOW FIRE's key writes,
    // or CC hit P (355) for ↓→ J, FIRE's.
    for (const [follow, branch, damage] of [
      [{ megaBeam: true }, 357, 45],
      [{ axe: true }, 355, 25],
    ] as const)
      expect(byKey({ command: 6 }, { again: [120], follow })).toMatchObject({
        mine: [347, 348, branch, 'idle'],
        damage,
      });
  });

  it('counters a strike in New Counter’s window (variable 4 at 100, PCs 4923–4934)', () => {
    const { sakuya, other, steps } = sakuyaPlayer();
    steps({}, 2);
    const mine: unknown[] = [];
    for (let t = 0; t < 400; t++) {
      steps(t ? {} : { dst: true }, 1, t === 2 ? { punch: true } : {});
      if (mine.at(-1) !== now(sakuya)) mine.push(now(sakuya));
    }
    // The reaction's op 0x1f (PC 883) enters NewCounter Get (319), whose
    // grab's hit handler enters New Counter get2 (322, PC 4959).
    expect(mine).toEqual([318, 319, 322, 'idle']);
    expect(other.hp).toBe(510 - 40);
    // In EX mode it is Ex Beam Start (331), which fires from range.
    expect(byKey({ dst: true }, { ex: true, gap: 300 })).toMatchObject({
      mine: [331, 'idle'],
      damage: 40,
    });
  });

  it("pulls the victim back up into HISA with K3 Hit New's response 53 (op 0x14, PC 3034)", () => {
    for (const opponent of ['ryuko', 'giant', 'sakuya'] as const) {
      const { sakuya, other, steps } = sakuyaPlayer(90, opponent);
      steps({}, 2);
      const theirs: unknown[] = [];
      let held = 0;
      let pulled = 0;
      for (let t = 0; t < 600; t++) {
        steps(t === 0 || t === 20 || t === 50 ? { kick: true } : {});
        if (theirs.at(-1) !== other.action) theirs.push(other.action);
        if (other.action === 'superHeld') held = other.x - sakuya.x;
        if (other.action === 'chainPull' && !pulled)
          pulled = other.x - sakuya.x;
      }
      expect(theirs.slice(-6)).toEqual([
        'superHeld',
        'chainPull',
        'launchAway',
        'knockdown',
        'getUp',
        'idle',
      ]);
      // Held 249 source pixels out (PC 3030), then placed 350 out (PC 3034)
      // as the pull starts at raw 500.
      expect([held, pulled + 500 * VELOCITY]).toEqual([
        249 * 1.5,
        expect.closeTo(350 * 1.5, 6),
      ]);
    }
  });

  it('spends her stocks on en300 (3), super HIT UP and SPARK (one each), and their EX forms', () => {
    const supers = [
      [{ getterBeam: true }, false, 90, [438, 441, '449+46', 'idle'], 216, 0],
      [{ musashi: true }, false, 90, [380, 384, 'idle'], 120, 2],
      [{ musashi: true }, true, 90, [395, 396, 397, 405, 406, 'idle'], 112, 2],
      // Its rolls (PCs 5614–5620) only pick her voice: Spark voice2 + 17
      // runs past its payment.
      [{ changeAttack: true }, false, 90, ['371+17', 'turn', 'idle'], 84, 2],
      // EX beam start's ray rises from well ahead of her (PCs 6296–6303).
      [{ changeAttack: true }, true, 90, [410, 'idle'], 0, 2],
      [{ changeAttack: true }, true, 300, [410, 'idle'], 55, 2],
    ] as const;
    for (const [key, ex, gap, mine, damage, stock] of supers)
      expect(byKey(key, { ex, gap })).toMatchObject({
        mine,
        damage,
        sakuya: { stock },
      });
    // Too little stock enters No super (363).
    expect(byKey({ getterBeam: true }, { stock: 2 }).mine).toEqual([
      363,
      'idle',
    ]);
  });

  it('switches to EX mode for 50 power with --TYPE-- (TO EX, PC 3692)', () => {
    const { sakuya, steps } = sakuyaPlayer();
    sakuya.stock = 1;
    steps({}, 2);
    steps({ ex: true });
    steps({}, 40);
    expect([exMode(sakuya), sakuya.stock, sakuya.power]).toEqual([true, 0, 50]);
    steps({ ex: true });
    steps({}, 40);
    expect(exMode(sakuya)).toBe(false);
  });

  it('flies out of HISA Down at −800 (PC 1938), as every fighter but Ryuko, Zoma, YINAN, AYA and DoraEmon', () => {
    for (const who of Object.keys(CHARACTERS) as Who[]) {
      const match = new Match('practice', false, 0, ['ryuko', who]);
      const victim = match.fighters[1];
      (match as unknown as { queue(f: Fighter, a: Action): void }).queue(
        victim,
        'launchDown',
      );
      match.step();
      while (victim.age < 9) match.step();
      const vx = victim.vx / victim.facing / VELOCITY;
      expect([who, vx]).toEqual([
        who,
        ['ryuko', 'zoma', 'yinan', 'aya', 'dora'].includes(who) ? -500 : -800,
      ]);
    }
  });

  it('stands in action 1, or her EX stance (1 + 25) in EX mode (PC 9)', () => {
    for (const [ex, last] of [
      [0, 116],
      [100, 237],
    ]) {
      const vm = new StandingVM(CHARACTERS.sakuya.idle, 0, 10, { 0x40: ex });
      let ticks = 0;
      while (!vm.ended && ticks < 400) {
        vm.tick();
        ticks++;
      }
      expect([vm.ended, vm.frame?.image]).toEqual([true, last]);
    }
  });

  it('opens her Vs. intro from Round 1 + 3, charged with two stocks, in EX mode with down held (PC 413)', () => {
    expect([
      SAKUYA_INTRO_EX_TICK,
      animationDuration('intro', 'sakuya'),
    ]).toEqual([120, 200]);
    // Round 1 (40) from PC 399: images 415–421 and 129, then STAND DEMO.
    expect(
      [0, 64, 110, 120, 199].map(
        (age) => animationFrame('intro', age, 'sakuya').image,
      ),
    ).toEqual([415, 420, 129, 117, 116]);
    for (const crouch of [false, true]) {
      const match = new Match('cpu', true, 0, ['sakuya', 'zoma']);
      const sakuya = match.fighters[0];
      const images: number[] = [];
      while (sakuya.action === 'intro') {
        images[sakuya.age] = fighterPose(sakuya).image;
        match.step(crouch ? { crouch } : {});
      }
      expect([sakuya.x, sakuya.stock, exMode(sakuya)]).toEqual([
        390 * 1.5,
        2,
        crouch,
      ]);
      // In EX mode STAND DEMO jumps to Skill1 (32, PC 296): images 236–238
      // for the same 80 ticks (PCs 308–311).
      expect([120, 140, 160, 185, 199].map((age) => images[age])).toEqual(
        crouch ? [236, 237, 238, 237, 237] : [117, 115, 115, 116, 116],
      );
    }
  });

  it('wins after a call of STAND DEMO (PC 683), holding image 436, and draws holding 444', () => {
    expect(
      [0, 80, 96, 1000].map(
        (age) => animationFrame('win', age, 'sakuya').image,
      ),
    ).toEqual([117, 121, 435, 436]);
    // Skill1 in EX mode, the same 80 ticks.
    expect(
      [0, 80, 1000].map(
        (age) => animationFrame('win', age, 'sakuya', true).image,
      ),
    ).toEqual([236, 121, 436]);
    expect(animationFrame('draw', 0, 'sakuya', true).image).toBe(236);
    expect(animationFrame('draw', 1000, 'sakuya').image).toBe(444);
    expect(BLACK.sakuya.opaque.image).toBe(1009);
    // EX mode cycles the face through 2002, 2006, 2000 and 2006 (PCs
    // 852–861).
    expect(
      [-1, 0, 40, 80, 120].map((face) => faceImage(face, 'sakuya')),
    ).toEqual([2001, 2002, 2006, 2000, 2006]);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'sakuya']);
    const sakuya = match.fighters[1];
    const entered = new Set<unknown>();
    // FIRE, Dragon punch and New Counter.
    const wanted = [260, 311, 318];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (sakuya.action === 'script') entered.add(sakuya.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
