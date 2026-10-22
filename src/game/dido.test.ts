import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro, spawn } from './testing';

// DIDO as player 1 at `x`, `gap` from a standing opponent.
function didoPlayer(x = 900, gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['dido', opponent]);
  const [dido, other] = match.fighters;
  dido.x = x;
  other.x = x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, dido, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, run until both are back on their feet: DIDO's
// actions and the damage dealt.
function play(
  at: (t: number) => Input,
  { x = 900, gap = 90, hp = 490, stock = 3, opponent = 'ryuko' as Who } = {},
) {
  const { dido, other, steps } = didoPlayer(x, gap, opponent);
  dido.hp = hp;
  dido.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(dido)) mine.push(now(dido));
  }
  return { dido, other, mine, damage: lifeOf(opponent) - other.hp };
}
const byKey = (key: Input, options = {}) =>
  play((t) => (t ? {} : key), options);

describe('DIDO (13 DIDO.PLAYER)', () => {
  it('takes 490 life from her parameter block, desperate at 147', () => {
    expect([lifeOf('dido'), desperationOf('dido')]).toEqual([490, 147]);
    const { dido } = didoPlayer();
    expect(dido).toMatchObject({ who: 'dido', hp: 490, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.dido.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('dido')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([twin, own]) => twin !== own)).toEqual([]);
    // Three after Ryuko's KOs, six after her hits, seven from BEAM Stand to
    // SHOCK INFINITY (her ★変なＴＥＣＨ, 89, comes before them).
    expect([60, 73, 83, 88, 90, 149].map((r) => twins[r])).toEqual([
      63, 79, 90, 95, 96, 155,
    ]);
    expect([CHARACTERS.dido.aliases, CHARACTERS.dido.counters]).toEqual([
      {},
      {},
    ]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.dido.levels).toMatchObject({
      184: 21, // P1
      210: 22, // K J
      231: 31, // Sliding start
      257: 31, // RS START
      268: 41, // super dragon start
      307: 42, // en3 start
      334: 42, // Hidden En300
    });
    const { dido, steps } = didoPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(dido).toMatchObject({ action: 'script', branch: 184, age: 0 });
  });

  it('plays her specials: slid for 35, fire for 30, and doge, whose probe meets nothing', () => {
    expect(byKey({ drill: true })).toMatchObject({
      mine: [231, 'turn', 'idle'],
      damage: 35,
    });
    expect(byKey({ axe: true })).toMatchObject({
      mine: [251, 'idle'],
      damage: 30,
    });
    // Its box sits at (0, 9905) (PC 3302), where only VS CHARGE's body
    // (36, PC 407) is, so Doge near Hit (236) never plays.
    expect(byKey({ dst: true })).toMatchObject({
      mine: [235, 'turn', 'idle'],
      damage: 0,
    });
  });

  it('keeps striking with RAiden while K comes within its windows (PCs 3624–3651)', () => {
    expect(byKey({ iori: true })).toMatchObject({
      mine: [257, 258, 'idle'],
      damage: 21,
    });
    const mashed = play((t) =>
      t === 0 ? { iori: true } : t % 6 === 3 && t < 400 ? { kick: true } : {},
    );
    expect(mashed).toMatchObject({ mine: [257, 258, 'idle'], damage: 56 });
  });

  it('turns Hidden En300 into slid at 147 life or more (op 0x11, PC 4526)', () => {
    expect(byKey({ getterBeam: true })).toMatchObject({
      mine: [231, 'turn', 'idle'],
      damage: 35,
    });
    // Its hit runs on to >HE300 Hit5 (359), which lands in en300 hit + 28,
    // one past that action's end (slot 1, PC 5047), and runs out at once.
    // Its two 20-damage strikes (PCs 4962, 4984) take responses 54 and 55,
    // 'ICE Punch' and its air form, which play as ERUS INATUMA's do, for
    // every player.
    for (const opponent of ['ryuko', 'zoma'] as const) {
      const hidden = byKey({ getterBeam: true }, { hp: 146, opponent });
      expect(hidden).toMatchObject({ mine: [334, 341, 'idle'], damage: 120 });
      expect(hidden.dido.stock).toBe(0);
    }
  });

  it('plays her supers: Temjin fly for 75, dragon super for 100 up close, Raiden for 55', () => {
    for (const [key, branch, damage] of [
      ['musashi', 285, 75],
      ['changeAttack', 268, 100],
      ['blackRush', 294, 55],
    ] as const) {
      const move = byKey({ [key]: true });
      expect([move.mine[0], move.damage, move.dido.stock]).toEqual([
        branch,
        damage,
        2,
      ]);
    }
    expect(byKey({ changeAttack: true }, { gap: 300 }).damage).toBe(0);
  });

  it("strikes with every box slot: Raiden att handen's eight (PCs 4146–4153) reach 500 source pixels out", () => {
    // Slot 0 reaches 404 source pixels (298 ± 106); slot 1, 498 ± 106.
    const far = byKey({ blackRush: true }, { gap: 750 });
    expect(far.damage).toBe(50);
  });

  it("sweeps EN300's hands from behind her, or from the other side when the wall culls its probe", () => {
    const en300 = byKey({ megaBeam: true });
    expect(en300).toMatchObject({ mine: [307, 310, 'idle'], damage: 209 });
    expect(en300.dido.stock).toBe(0);
    // 技名8 (331) sets variable 7 to 10 and clears it after 10 ticks
    // flying back (PCs 4504–4507); culled at the wall (0x4124c9), it leaves
    // it set, and en300 hit 2 enters en300 hit 2.5 (312, PC 4275).
    expect(byKey({ megaBeam: true }, { x: 292 })).toMatchObject({
      mine: [307, 310, 312, 'idle'],
      damage: 209,
    });
  });

  it('stops every sound while en300 hit holds global 14 at 200, and the stage loops its track again once it clears (PCs 4259, 4270)', () => {
    const { match, dido, steps } = didoPlayer();
    dido.stock = 3;
    const seen: unknown[][] = [];
    let held = 0;
    for (let tick = 1; tick <= 1000; tick++) {
      steps(tick === 3 ? { megaBeam: true } : {});
      for (const { owner, index } of match.sounds)
        if (owner < 0) seen.push([tick, index]);
      if ((match.globals[14] ?? 0) !== held)
        seen.push([tick, 'global 14', (held = match.globals[14]), now(dido)]);
    }
    // Sport Court's off (2) tests every 5 ticks until it sees 200, then
    // every tick (PCs 3–13).
    expect(seen).toEqual([
      [1, 0],
      [6, 2],
      [124, 'global 14', 200, 310],
      [126, 0],
      [949, 'global 14', 0, 310],
      [950, 2],
    ]);
  });

  it("sends K2's shots off the stage while en300 hit holds variable 7 at 100, even within their calls (PC 2745)", () => {
    // K2 obj2 (196) calls a 1-tick pass of itself 40 times, each first
    // testing variable 7 into Skill7 (198), which flies off at 30000.
    const shot = (at: number) => {
      const { match, dido } = didoPlayer(900, 600);
      const k2 = spawn(match, 0, 196, { x: dido.x, y: -100 });
      return Array.from({ length: 6 }, (_, t) => {
        dido.variables[7] = t === at ? 100 : 0;
        match.step();
        return match.effects.includes(k2) ? `${k2.clip}/${k2.age}` : 'culled';
      }).join(' ');
    };
    expect(shot(-1)).toBe('196/0 196/1 196/2 196/3 196/4 196/5');
    expect(shot(3)).toBe('196/0 196/1 196/2 198/0 198/1 culled');
  });

  it('stands in action 1 until it runs out (PC 16), with no EX or life check', () => {
    const vm = new StandingVM(CHARACTERS.dido.idle);
    let ticks = 0;
    while (!vm.ended && ticks < 400) {
      vm.tick();
      ticks++;
    }
    expect([vm.ended, vm.frame?.image]).toEqual([true, 113]);
  });

  it("rolls her Vs. intro's path (PC 360): Round 1 + 3's stance or op2's hop, charged with two stocks", () => {
    // Round 1 (34) from PC 379: images 343–353, then 113, for 200 ticks.
    expect(animationDuration('33+4', 'dido')).toBe(200);
    expect(
      [0, 80, 173, 183].map((age) => animationFrame('33+4', age, 'dido').image),
    ).toEqual([343, 344, 353, 113]);
    // 開始時 (31) shows its blank display a tick (PC 323) before 開始時 BR,
    // whose 50-tick display KGT 13's global 14 keeps (PCs 361, 367), and
    // the script runs out a tick after its last display.
    const stance = brIntro('dido', 1);
    expect([stance.path, stance.ticks, stance.f.x, stance.f.stock]).toEqual([
      [31, 33],
      252,
      390 * 1.5,
      2,
    ]);
    // A third of the time she hops through op2 (44) + 2 (PC 372): up at raw
    // −300 for 16 ticks (PC 500), a hang, then gravity 20 (PC 511) from
    // tick 163, its 28th move past the floor; the landing enters 44 + 26
    // (PC 510), image 113 for 10 ticks.
    const hop = brIntro('dido', 0);
    expect([hop.path, hop.ticks, hop.f.x, hop.f.stock]).toEqual([
      [31, '33+8', '44+26'],
      252,
      390 * 1.5,
      2,
    ]);
    expect(Math.min(...hop.heights) / 1.5).toBeCloseTo(
      (-16 * 300 * 655) / 65536,
      3,
    );
    expect(hop.images.indexOf(113)).toBe(50 + 163 + 28);
  });

  it('wins after a call of Demo Stand (PC 681), holding image 330, and draws holding 382', () => {
    expect(
      [0, 50, 72, 118, 152, 1000].map(
        (age) => animationFrame('win', age, 'dido').image,
      ),
    ).toEqual([113, 114, 113, 326, 329, 330]);
    expect(animationFrame('draw', 1000, 'dido').image).toBe(382);
    expect(BLACK.dido.opaque.image).toBe(1009);
    expect(faceImage(-1, 'dido')).toBe(2001);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'dido']);
    const dido = match.fighters[1];
    const entered = new Set<unknown>();
    // slid, fire and RAiden.
    const wanted = [231, 251, 257];
    for (let t = 0; t < 20000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (dido.action === 'script') entered.add(dido.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
