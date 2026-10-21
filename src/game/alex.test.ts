import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import type { Action } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// ALEX as player 2, `gap` from a standing opponent as player 1.
function alexPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['alex', opponent]);
  const [alex, other] = match.fighters;
  other.x = alex.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, alex, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` (and the opponent's from `theirs(t)`), in EX mode or
// not, run until both are back on their feet: ALEX's actions and the damage
// dealt.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    ex = false,
    stock = 3,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { alex, other, steps } = alexPlayer(gap);
  alex.variables[0] = ex ? 100 : 0;
  alex.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(alex)) mine.push(now(alex));
  }
  return { alex, other, mine, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options = {}) =>
  play((t) => (t ? {} : key), options);

describe('ALEX (15 ALEX.PLAYER)', () => {
  it('takes 450 life from his parameter block, desperate at 135', () => {
    expect([lifeOf('alex'), desperationOf('alex')]).toEqual([450, 135]);
    const { alex } = alexPlayer();
    expect(alex).toMatchObject({ who: 'alex', hp: 450, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.alex.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('alex')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (128, 129)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 85, 128],
      [77, 83, 129],
    ]);
    expect(CHARACTERS.alex.aliases).toEqual({ 128: 79, 129: 77 });
    // Two after Ryuko's KOs, six after her hits, seven from BEAM Stand, six
    // from Shock, seven from Clothes off 500, ten from Chain pull back, his
    // FB two after hers, seven from HISO stop (here ERUS INATUMA) and nine
    // from Pull Back.
    expect(
      [60, 73, 83, 90, 104, 105, 110, 118, 121, 149].map((r) => twins[r]),
    ).toEqual([62, 79, 90, 96, 111, 115, 112, 125, 130, 158]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.alex.levels).toMatchObject({
      187: 21, // P1
      210: 22, // K J
      225: 31, // TO EX
      229: 31, // dragon start
      276: 31, // HAOU START
      305: 41, // GYSA NEW
      339: 42, // en300 START
    });
    const { alex, steps } = alexPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(alex).toMatchObject({ action: 'script', branch: 187, age: 0 });
  });

  it('plays his specials and their EX forms (op 0x1f on variable 0)', () => {
    const specials = [
      [{ drill: true }, false, [229, 'idle'], 35],
      // dragon start has no EX form.
      [{ drill: true }, true, [229, 'idle'], 35],
      [{ iori: true }, false, [261, 'idle'], 36],
      // PC 3785: Unbrock Blade.
      [{ iori: true }, true, [274, 'idle'], 30],
      [{ blackRush: true }, false, [276, 283, 'idle'], 50],
      // PC 3958: ex haou start.
      [{ blackRush: true }, true, [287, 283, 'idle'], 44],
    ] as const;
    for (const [key, ex, mine, damage] of specials)
      expect(byKey(key, { ex })).toMatchObject({ mine, damage });
  });

  it('fires his air fire only in the air: on the ground ↓→ J enters P1', () => {
    expect(byKey({ axe: true }).mine).toEqual([187, 188, 'idle']);
    const air = play((t) =>
      t === 0 ? { jump: true, right: true } : t === 10 ? { axe: true } : {},
    );
    expect(air).toMatchObject({
      mine: ['takeoff', 'jump', 240, 248, 'idle'],
      damage: 25,
    });
  });

  it("turns a projectile back with REFLACT: REF OBJ's slot-0 box meets it 2000 pixels down (PC 3842)", () => {
    const match = new Match('practice', false, 3, ['zoma', 'alex']);
    const [zoma, alex] = match.fighters;
    alex.x = zoma.x + 600;
    match.step({}, {});
    match.step({}, {});
    const mine: unknown[] = [];
    let sosatu = 0;
    for (let t = 0; t < 600; t++) {
      match.step(t ? {} : { axe: true }, t === 10 ? { iori: true } : {});
      if (mine.at(-1) !== now(alex)) mine.push(now(alex));
      sosatu = Math.max(sosatu, alex.variables[2] ?? 0);
    }
    // Its hit handler, REF SOSATU (266), sets his variable 2 to 200 (PC
    // 3847), whose test (PC 3800) enters reflact succ (267): ref ball's 50
    // (269, PC 3878), on a body of Zoma's that takes 120%.
    expect([mine, sosatu, alex.hp]).toEqual([
      ['idle', 261, 267, 'idle'],
      200,
      450,
    ]);
    expect(zoma.hp).toBe(490 - 60);
  });

  it('counters a strike while counter start holds variable 4 at 100 (PCs 3643–3655)', () => {
    const struck = (ex: boolean, at: number) =>
      play((t) => (t ? {} : { dst: true }), {
        ex,
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    expect(struck(false, 10)).toMatchObject({
      mine: [251, 252, 'turn', 'idle'],
      damage: 48,
    });
    expect(struck(false, 40)).toMatchObject({
      mine: [251, 'hit', 'idle'],
      damage: 0,
    });
    // In EX mode, EX counter start (256, PC 3640) and EX counterget (257).
    expect(struck(true, 10)).toMatchObject({
      mine: [256, 257, 'idle'],
      damage: 45,
    });
  });

  it('spends his stocks on en300 (3), GYSA and super fire (one each), and their EX forms', () => {
    const supers = [
      [{ getterBeam: true }, false, 90, [339, 'idle'], 139, 0],
      [{ getterBeam: true }, true, 90, [359, 'idle'], 92, 0],
      // GYSA NEW near, GYSA FAR beyond 120 source pixels: 60, 30 and 20
      // (PCs 4467, 4479, 4492).
      [{ musashi: true }, false, 90, [305, 'idle'], 110, 2],
      [{ musashi: true }, false, 300, [308, 'idle'], 110, 2],
      [{ musashi: true }, true, 90, [332, 333, 'idle'], 100, 2],
      [{ changeAttack: true }, false, 90, [317, 'idle'], 64, 2],
      [{ changeAttack: true }, true, 90, [312, 'idle'], 100, 2],
    ] as const;
    for (const [key, ex, gap, mine, damage, stock] of supers)
      expect(byKey(key, { ex, gap })).toMatchObject({
        mine,
        damage,
        alex: { stock },
      });
    // Too little stock enters No super (295).
    expect(byKey({ getterBeam: true }, { stock: 2 }).mine).toEqual([
      295,
      'idle',
    ]);
  });

  it('switches to EX mode for 50 power with --TYPE CHANGE-- (TO EX, PC 3315)', () => {
    const { alex, steps } = alexPlayer();
    alex.stock = 1;
    steps({}, 2);
    steps({ ex: true });
    steps({}, 40);
    expect([exMode(alex), alex.stock, alex.power]).toEqual([true, 0, 50]);
    steps({ ex: true });
    steps({}, 40);
    expect(exMode(alex)).toBe(false);
  });

  it('gains no power from his air time guards (176, 181), which lack op 0x15', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'alex']);
    const alex = match.fighters[1];
    for (const action of ['airBlockRapid', 'blockRapid'] as const) {
      alex.power = 0;
      (match as unknown as { queue(f: Fighter, a: Action): void }).queue(
        alex,
        action,
      );
      match.step();
      expect([action, alex.power]).toEqual([
        action,
        action === 'blockRapid' ? 2 : 0,
      ]);
    }
  });

  it('stands in action 1, or his EX stance (1 + 24) in EX mode (PC 10)', () => {
    for (const [ex, last] of [
      [0, 116],
      [100, 366],
    ]) {
      const vm = new StandingVM(CHARACTERS.alex.idle, 0, 10, { 0x40: ex });
      let ticks = 0;
      while (!vm.ended && ticks < 400) {
        vm.tick();
        ticks++;
      }
      expect([vm.ended, vm.frame?.image]).toEqual([true, last]);
    }
  });

  it('opens his Vs. intro from 開始時 BR + 9, charged with two stocks, in EX mode with down held (PC 356)', () => {
    expect(animationDuration('32+9', 'alex')).toBe(200);
    // PC 333, then Round 1 (33) from PC 343: images 323–331 and 158, then
    // 333, 158, 334 and 335.
    expect(
      [0, 2, 12, 101, 121, 129, 199].map(
        (age) => animationFrame('32+9', age, 'alex').image,
      ),
    ).toEqual([0, 323, 324, 333, 158, 334, 335]);
    for (const crouch of [false, true]) {
      // After 開始時's (30) blank display; Round 1's check (PC 356) enters EX
      // change (39) for down.
      const { path, ticks, f, match } = brIntro('alex', 0, () => ({ crouch }));
      expect([path, ticks]).toEqual([
        [30, '32+9', ...(crouch ? [39] : [])],
        202,
      ]);
      // OP super Charge, spawned 2 ticks in (PC 336), adds its last 2 power
      // (42, PC 434) the tick after.
      expect([f.stock, f.power]).toEqual([1, 98]);
      match.step({ crouch });
      expect([f.x, f.stock, exMode(f)]).toEqual([390 * 1.5, 2, crouch]);
    }
  });

  it('wins after a call of DEMO stand (PC 576), holding image 330, and draws holding 332', () => {
    expect(
      [0, 104, 150, 1000].map(
        (age) => animationFrame('win', age, 'alex').image,
      ),
    ).toEqual([117, 339, 343, 330]);
    expect(animationFrame('draw', 1000, 'alex').image).toBe(332);
    expect(BLACK.alex.opaque.image).toBe(1009);
    // EX mode cycles the face through 2002, 2006, 2000 and 2006 (PCs
    // 737–750).
    expect([-1, 0, 40, 80, 120].map((face) => faceImage(face, 'alex'))).toEqual(
      [2001, 2002, 2006, 2000, 2006],
    );
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'alex']);
    const alex = match.fighters[1];
    const entered = new Set<unknown>();
    // dragon, counter, REFLACT and HAOU.
    const wanted = [229, 251, 261, 276];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (alex.action === 'script') entered.add(alex.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
