import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro, spawn } from './testing';

// KATE as player 1, `gap` from a standing opponent as player 2.
function katePlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['kate', opponent]);
  const [kate, other] = match.fighters;
  other.x = kate.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, kate, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until she is
// back on her feet: KATE's actions, the opponent's, the objects she spawned
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
  const { match, kate, other, steps } = katePlayer(gap);
  kate.stock = stock;
  if (hp) kate.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(kate)) mine.push(now(kate));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
    for (const e of match.effects) objects.add(e.clip);
  }
  return {
    kate,
    mine,
    yours,
    objects,
    damage: lifeOf('ryuko') - other.hp,
    taken: (hp || lifeOf('kate')) - kate.hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('KATE (22 KATE.PLAYER)', () => {
  it('takes 430 life from her parameter block, desperate at 129', () => {
    expect([lifeOf('kate'), desperationOf('kate')]).toEqual([430, 129]);
    const { kate } = katePlayer();
    expect(kate).toMatchObject({ who: 'kate', hp: 430, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's, but for her UNCOUNTER reactions", () => {
    const twins = CHARACTERS.kate.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('kate')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (127, 128)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 85, 127],
      [77, 83, 128],
    ]);
    expect(CHARACTERS.kate.aliases).toEqual({ 127: 79, 128: 77 });
    // Ryuko's own for her KOs, six after her first hits, seven from BEAM
    // Stand to SHOCK INFINITY, six from Shock, fourteen for FB, three from
    // HISO stop, eight from Pull Back, seven past Chuck Hiso and eight from
    // the guards.
    expect(
      [60, 73, 83, 88, 90, 110, 113, 121, 140, 149].map((r) => twins[r]),
    ).toEqual([60, 79, 90, 95, 96, 124, 116, 129, 147, 157]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.kate.levels).toMatchObject({
      186: 21, // P1
      202: 22, // KJ
      216: 31, // Dragon start
      224: 51, // Air fire Start
      238: 31, // counter start
      255: 41, // SUPER BEAM start
      268: 41, // EN slash start
      290: 42, // en300 START
    });
    const { kate, steps } = katePlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(kate).toMatchObject({ action: 'script', branch: 186, age: 0 });
  });

  it('chains J and K through P1 hit or K1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    expect(
      play(
        presses({
          0: { punch: true },
          14: { punch: true },
          45: { punch: true },
        }),
      ),
    ).toMatchObject({ mine: [186, 187, 189, 190, 'idle'], damage: 50 });
    // K3's low grab holds the victim through K3 hit (195).
    expect(
      play(
        presses({
          0: { punch: true },
          14: { kick: true },
          45: { kick: true },
        }),
      ),
    ).toMatchObject({ mine: [186, 187, 193, 194, 195, 'idle'], damage: 60 });
    expect(
      play(
        presses({
          0: { kick: true },
          18: { kick: true },
          50: { punch: true },
        }),
      ),
    ).toMatchObject({ mine: [191, 192, 193, 190, 'idle'], damage: 50 });
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [211, 213, 'idle'],
      damage: 30,
    });
  });

  it('plays her specials: neko punch, af add, DASH ATTACK (also in the air) and Counter', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [216, 217, 'idle'], 38],
      [{ axe: true }, [232, 'idle'], 15],
      [{ dst: true }, [238, 'idle'], 0],
    ] as const)
      expect(byKey(key)).toMatchObject({ mine, damage });
    expect(
      play(presses({ 0: { jump: true }, 30: { iori: true } }), { gap: 150 }),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 242, 243, 'idle'],
      damage: 16,
    });
  });

  it("lets DASH ATTACK's victim out of CHUCK HIT after 40 ticks, unheld, for dash att handen's five strikes", () => {
    // Response 30 enters CHUCK HIT (Ryuko's 128); Dash att Hit (245) runs
    // through with no op 0x07, then spawns dash att handen (246, PC 3620)
    // 190 source pixels behind her, which strikes 5, 5, 5, 5 and 15.
    const dash = byKey({ iori: true });
    expect(dash).toMatchObject({ damage: 40 });
    expect(dash.mine.slice(0, 2)).toEqual([244, 245]);
    expect(dash.yours.slice(0, 3)).toEqual(['idle', 'superHeld', 'hitRapid']);
    expect(dash.objects).toContain(246);
  });

  it('drops a victim caught in the air through CHUCK HIT at gravity 80, landing into the display it lands in again (PCs 1730, 1734)', () => {
    // Unheld, CHUCK HIT's op 0x01 drops Ryuko from rest; she lands in its
    // 30-tick display, whose landing handler (slot 1, PC 1734) enters it
    // again, so dash att handen strikes her on the floor.
    const { kate, other, steps } = katePlayer();
    kate.stock = 3;
    steps({}, 2);
    steps({ iori: true }, 1, { jump: true });
    const gravity = 80 * (393 / 65536) * 1.5;
    let before = other.y;
    while (other.action !== 'superHeld') {
      before = other.y;
      steps({});
    }
    expect(before).toBeLessThan(-90);
    for (let n = 1; other.y < 0; n++) {
      expect(other.y).toBeCloseTo(before + (gravity * n * (n + 1)) / 2, 6);
      steps({});
    }
    steps({});
    expect(other).toMatchObject({ action: 'superHeld', age: 10, y: 0 });
    while (other.action === 'superHeld') steps({});
    expect(other.action).toBe('hitRapid');
  });

  it('drops a hovering Air fire as af add adds to variable 8 (PC 3401), which each hover tests (PCs 3179–3180)', () => {
    // Air fire Start (224) leaves *eff af01 (220) hovering for 60 calls of
    // its rp (221); af add strikes for 15, and the fire drops (227) on the
    // opponent below it for 25.
    const drop = play(
      presses({ 0: { jump: true }, 30: { axe: true }, 150: { axe: true } }),
      { gap: 120 },
    );
    expect(drop.mine).toEqual([
      'takeoff',
      'jump',
      224,
      'land',
      'idle',
      232,
      'idle',
    ]);
    expect(drop).toMatchObject({ damage: 40 });
    expect(drop.objects).toContain(227);
    // Unanswered, it times out (223) after its 600 ticks, and af add finds
    // nothing to drop.
    const late = play(
      presses({ 0: { jump: true }, 30: { axe: true }, 700: { axe: true } }),
      { gap: 120 },
    );
    expect(late).toMatchObject({ damage: 15 });
    expect(late.objects).not.toContain(227);
  });

  it("counters through her reactions' test of variable 4 at 100 (PC 773), which counter start holds for 30 ticks (PCs 3499–3509)", () => {
    const counter = (at: number) =>
      play(presses({ 0: { dst: true } }), {
        gap: 120,
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    // Its body takes 30% (op 0x19 r[11], PC 3501): Ryuko's 10 as 3.
    expect(counter(20)).toMatchObject({
      mine: [238, 239, 'idle'],
      damage: 54,
      taken: 3,
    });
    // PC 3509 has cleared it: an ordinary hit, 120%.
    expect(counter(60)).toMatchObject({
      mine: [238, 'hit', 'idle'],
      damage: 0,
      taken: 12,
    });
  });

  it('spends a stock on SLASH SUPER and BEAM, three on en300, or enters No super (249)', () => {
    for (const [key, stock, mine, damage, left] of [
      ['musashi', 3, [268, 269, 'idle'], 113, 2],
      ['changeAttack', 3, [255, 'idle'], 120, 2],
      ['getterBeam', 3, [290, 'idle'], 225, 0],
      ['getterBeam', 2, [249, 'idle'], 0, 2],
      ['musashi', 0, [249, 'idle'], 0, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { stock });
      expect([move.mine, move.damage, move.kate.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    // At 129 life or less, EN slash start enters EN slash evil start (275,
    // op 0x11, PC 3859).
    expect(byKey({ musashi: true }, { hp: 120 })).toMatchObject({
      mine: [275, 277, 278, 'idle'],
      damage: 125,
    });
  });

  it("cancels af add into BEAM or SLASH SUPER through SC Super (252), for two stocks, as af add's variable 6 at 100 allows (PCs 3393, 3721, 3852)", () => {
    const cancel = (key: Input) => play(presses({ 0: { axe: true }, 15: key }));
    const beam = cancel({ changeAttack: true });
    expect([beam.mine, beam.damage, beam.kate.stock]).toEqual([
      [232, 252, '255+23', 'idle'],
      125,
      1,
    ]);
    const slash = cancel({ musashi: true });
    expect([slash.mine, slash.damage, slash.kate.stock]).toEqual([
      [232, '252+6', 269, 'idle'],
      118,
      1,
    ]);
  });

  it('holds *ATT HANDEN RP at its last display while frozen, its test jumping back a record (PC 4287)', () => {
    // *ATT HANDEN (288) calls RP (289), each pass striking at its start. Each
    // tick's freeze and the object's age, starred while it holds a box.
    const ages = (freeze: number) => {
      const { match, kate } = katePlayer();
      const handen = spawn(match, 0, 288, { x: kate.x, y: 0 });
      return Array.from({ length: 14 }, (_, t) => {
        if (t === 5) match.freeze = freeze;
        match.step();
        return `${match.freeze}:${handen.age}${handen.box ? '*' : ''}`;
      });
    };
    expect(ages(0).join(' ')).toBe(
      '0:0* 0:1* 0:2* 0:3 0:4 0:5 0:6 0:7* 0:8* 0:9* 0:10 0:11 0:12 0:13',
    );
    // With no display between, the step spins out its 300 records (0x4125c0)
    // and goes on at the test the next.
    expect(ages(6).join(' ')).toBe(
      '0:0* 0:1* 0:2* 0:3 0:4 5:5 4:6 3:6 2:6 1:6 0:6 0:7* 0:8* 0:9*',
    );
  });

  it('stands through her Vs. intro, charged to two stocks', () => {
    expect(animationDuration('32+3', 'kate')).toBe(200);
    // 開始時 BR's 50-tick display comes first, as KGT 13's global 14 keeps
    // it (PC 333).
    const { path, ticks, f } = brIntro('kate');
    expect([path, ticks, f.x, f.stock]).toEqual([[30, 32], 252, 390 * 1.5, 2]);
  });

  it('wins after two calls of sTAND demo, looping images 265 and 266 (PC 620), holds her draw and shows face 2001', () => {
    expect(
      [0, 136, 146, 156, 174, 192, 1000].map(
        (age) => animationFrame('win', age, 'kate').image,
      ),
    ).toEqual([115, 130, 265, 265, 266, 265, 265]);
    expect(animationFrame('draw', 1000, 'kate').image).toBe(267);
    expect(BLACK.kate.opaque.image).toBe(1009);
    expect(faceImage(-1, 'kate')).toBe(2001);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 1, ['ryuko', 'kate']);
    const kate = match.fighters[1];
    const entered = new Set<unknown>();
    // DASH ATTACK, af add, EN slash start and counter start.
    const wanted = [244, 232, 268, 238];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (kate.action === 'script') entered.add(kate.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
