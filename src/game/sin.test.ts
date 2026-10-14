import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  SIN_INTRO_EX_TICK,
} from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { enter } from './testing';

// SIN as player 1, `gap` from a standing opponent.
function sinPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['sin', opponent]);
  const [sin, other] = match.fighters;
  other.x = sin.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, sin, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// The actions a fighter plays over `ticks`, each once in order.
function played(f: Fighter, step: (t: number) => void, ticks: number) {
  const seen: unknown[] = [];
  for (let t = 0; t < ticks; t++) {
    step(t);
    if (seen.at(-1) !== now(f)) seen.push(now(f));
  }
  return seen;
}
// A move entered by its key, in EX mode or not and at `hp`, run until both
// are back on their feet: SIN's actions and the damage it took.
function byKey(key: Input, { gap = 100, ex = false, hp = 550, stock = 3 }) {
  const { sin, other, steps } = sinPlayer(gap);
  sin.variables[0] = ex ? 10 : 0;
  sin.hp = hp;
  sin.stock = stock;
  steps({}, 2);
  const mine = played(sin, (t) => steps(t ? {} : key), 3500);
  return { sin, other, mine, damage: 510 - other.hp };
}

describe('SIN (10 SIN.PLAYER)', () => {
  it('takes 550 life from his parameter block, desperate at 165', () => {
    expect([lifeOf('sin'), desperationOf('sin')]).toEqual([550, 165]);
    const { sin } = sinPlayer();
    expect(sin).toMatchObject({ who: 'sin', hp: 550, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.sin.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('sin')[id]]] : [],
    );
    expect(paired).toHaveLength(72);
    expect(paired.filter(([twin, own]) => twin !== own)).toEqual([]);
    // His KOs three after Ryuko's, the hits four, the twists and the shock
    // five, Shock rp four and the reactions from Clothes off 500 five.
    expect([60, 73, 85, 88, 90, 104, 149].map((ryuko) => twins[ryuko])).toEqual(
      [63, 77, 90, 93, 94, 109, 154],
    );
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.sin.levels).toMatchObject({
      183: 21, // P1
      197: 22, // K J
      208: 31, // TO EX
      271: 51, // SRC AIR
      272: 41, // SUPER RUN CHUCK
      296: 42, // new EN300 start
      310: 42, // nozan start
    });
    const { sin, steps } = sinPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(sin).toMatchObject({ action: 'script', branch: 183, age: 0 });
  });

  it('slams with Clack chuck for 55, through Clack hit in EX mode and EVIL CLACK HIT when desperate', () => {
    // New CC start (226) enters Clack chuck start (234) for variable 0 = 10
    // (PC 3081); New CC hit (227) enters EVIL CLACK HIT (240) at 165 life or
    // below (PC 3103).
    expect(byKey({ dst: true }, {})).toMatchObject({
      mine: expect.arrayContaining([226, 227, 228]),
      damage: 55,
    });
    expect(byKey({ dst: true }, { ex: true })).toMatchObject({
      mine: expect.arrayContaining([234, 235, 237, 228]),
      damage: 55,
    });
    expect(byKey({ dst: true }, { hp: 165 })).toMatchObject({
      mine: expect.arrayContaining([226, 240, 244]),
      damage: 70,
    });
  });

  it('carries the opponent up with RUN CHUCK, dropping them for 55, or 65 in EX mode or desperate', () => {
    for (const [options, actions, damage] of [
      [{}, [248, 258, 249, 250], 55],
      // RUN CHUCK HIT jumps to run c hit (249) below variable 0 = 10 (PC
      // 3675), so EX mode lands in its own RUN CHUCK DOWN (259).
      [{ ex: true }, [257, 258, 259], 65],
      [{ hp: 165 }, [248, 258, 249, 252], 65],
    ] as const) {
      const { mine, damage: taken } = byKey({ iori: true }, options);
      expect(mine).toEqual(expect.arrayContaining([...actions]));
      expect(taken).toBe(damage);
    }
  });

  it('cancels a connected S PUNCH into `*-*-*-SC SUPER` for two stocks (variable 6, PCs 2834 and 4191)', () => {
    const plain = byKey({ drill: true }, {});
    expect([plain.damage, plain.sin.stock]).toEqual([45, 3]);
    const { match, sin, other, steps } = sinPlayer();
    sin.stock = 3;
    steps({}, 2);
    let gengai = false;
    const mine = played(
      sin,
      (t) => {
        steps(t === 0 ? { drill: true } : t === 45 ? { getterBeam: true } : {});
        gengai ||= match.effects.some((e) => e.clip === 287);
      },
      600,
    );
    // BAKU enters it for variable 6 = 100, which S PUNCH sets; it takes two
    // stocks (PC 4143), spawns GENGAI (287) and jumps to SC BAKU (290, PC
    // 4146), which plays inline.
    expect(mine.slice(0, 3)).toEqual([211, 288, 'idle']);
    expect([sin.stock, 510 - other.hp, gengai]).toEqual([1, 8 + 90, true]);
  });

  it('throws with SUP RUN C for 120, through RUN CHUCK SUPER in EX mode', () => {
    for (const [ex, actions] of [
      [false, [272, 275, 277]],
      // super run chuck hit new (275) enters SUPER RUN CHUCK HIT (274) for
      // variable 0 = 10 (PC 3948), which lands in RUN CHUCK SUPER (266).
      [true, [272, 274, 266]],
    ] as const) {
      const { mine, damage, sin } = byKey({ musashi: true }, { ex });
      expect(mine).toEqual(expect.arrayContaining([...actions]));
      expect([damage, sin.stock]).toEqual([120, 2]);
    }
  });

  it('strikes 90 with BAKU and 230 with EN300 for three stocks, or 195 through its EX pillars', () => {
    expect(byKey({ getterBeam: true }, {})).toMatchObject({ damage: 90 });
    const en300 = byKey({ changeAttack: true }, {});
    expect([en300.damage, en300.sin.stock]).toEqual([230, 0]);
    // new EN300 start enters EN300 start (304) for variable 0 = 10 (PC
    // 4248), whose EN 300 hit (306) spawns EN300 BAKU (307) three times (PCs
    // 4460–4466).
    const ex = byKey({ changeAttack: true }, { ex: true });
    expect(ex.mine).toEqual(expect.arrayContaining([304]));
    expect(ex.damage).toBe(195);
  });

  it('plays NOZAN only below 165 life, entering RUN CHUCK Start (257) at or above it (PC 4537)', () => {
    const low = sinPlayer();
    low.match.practice.lowHealth = true;
    low.sin.stock = 3;
    low.steps({}, 2);
    low.steps({ blackRush: true });
    expect([low.sin.hp, low.sin.branch]).toEqual([164, 310]);
    // Outside EX mode its RUN CHUCK HIT drops them through run c hit.
    const high = byKey({ blackRush: true }, {});
    expect(high.mine).toEqual(expect.arrayContaining([257, 258, 249, 250]));
    expect([high.damage, high.sin.stock]).toEqual([55, 3]);
    // nozan lend (313) runs into nozan SF (316), whose 46 calls of 技名2
    // (319, PCs 4684–4775) hide the opponent (response 81) 50 ticks each,
    // then NOZAN FIN takes 250 (PC 4799).
    const nozan = byKey({ blackRush: true }, { hp: 164 });
    expect(nozan.mine).toEqual(expect.arrayContaining([310, 311, 313]));
    expect([nozan.damage, nozan.sin.stock]).toEqual([250, 0]);
  });

  it('toggles EX mode with --TYPE Change--: TO EX (208) sets variable 0 to 10 for half a stock, TO NORMAL clears it', () => {
    const { match, sin } = sinPlayer();
    sin.stock = 1;
    enter(match, sin, 208);
    expect([sin.variables[0], exMode(sin), sin.stock, sin.power]).toEqual([
      10,
      true,
      0,
      50,
    ]);
    for (let t = 0; t < 200 && sin.action !== 'idle'; t++) match.step();
    enter(match, sin, 208);
    expect([sin.branch, sin.variables[0], exMode(sin)]).toEqual([
      209,
      0,
      false,
    ]);
  });

  it('stands in his EX stance while variable 0 is 10 (idle PC 9 jumps to PC 31)', () => {
    const first = (ex: number) => {
      const vm = new StandingVM(CHARACTERS.sin.idle, 0, 10, { 0x40: ex });
      vm.tick();
      return vm.frame?.image;
    };
    expect([first(0), first(10)]).toEqual([365, 113]);
  });

  it('tires at 165 life or less (idle PC 16), checking again each pass of his stance', () => {
    const images = (life: (t: number) => number, ticks = 400) => {
      const vm = new StandingVM(CHARACTERS.sin.idle);
      const seen: number[] = [];
      for (let t = 0; t < ticks; t++) {
        vm.life = life(t);
        vm.tick();
        if (vm.frame && !seen.includes(vm.frame.image))
          seen.push(vm.frame.image);
      }
      return seen;
    };
    expect(images(() => 550)).toEqual([365, 366, 367, 331, 332]);
    expect(images(() => 166)).toEqual([365, 366, 367, 331, 332]);
    expect(images(() => 165)).toEqual([
      365, 366, 367, 334, 335, 336, 337, 338, 339,
    ]);
    // 34 ticks in, then 230 a pass: ticked at 100, tired from tick 264.
    expect(images((t) => (t < 100 ? 550 : 165), 270)).toEqual([
      365, 366, 367, 331, 332, 334,
    ]);
    const unset = new StandingVM(CHARACTERS.sin.idle);
    expect(() => {
      for (let t = 0; t < 40; t++) unset.tick();
    }).toThrow("Op 0x11 at PC 16 needs the fighter's life");
  });

  it('rises from his shadow in his Vs. intro, entering EX mode with down held as it checks (PC 403)', () => {
    expect([SIN_INTRO_EX_TICK, animationDuration('intro', 'sin')]).toEqual([
      75, 200,
    ]);
    const match = new Match('cpu', true, 0, ['sin', 'zoma']);
    const sin = match.fighters[0];
    const { x } = sin;
    for (let t = 0; t < 200; t++) match.step({ crouch: t >= 60 });
    expect([sin.action, sin.x, exMode(sin)]).toEqual(['idle', x, true]);
  });

  it('wins with STAND DEMO 2 (30), then loops PCs 617–618 with WIN RP spawned once (PC 616)', () => {
    expect(
      [0, 124, 125, 133, 141, 149, 157, 500].map(
        (age) => animationFrame('win', age, 'sin').image,
      ),
    ).toEqual([365, 365, 303, 304, 303, 304, 303, 303]);
    const spawns = (age: number) =>
      (animationFrame('win', age, 'sin').events ?? []).filter(
        (e) => e.op === 'spawn',
      );
    expect([
      spawns(141).length,
      spawns(157).length,
      spawns(173).length,
    ]).toEqual([1, 0, 0]);
    expect(animationFrame('draw', 1000, 'sin').image).toBe(309);
    expect(BLACK.sin.opaque.image).toBe(1009);
  });

  it("shows HUD face 2006 for 2001's turns in EX mode (PCs 756–774)", () => {
    expect([-1, 0, 40, 80, 120].map((face) => faceImage(face, 'sin'))).toEqual([
      2001, 2002, 2006, 2000, 2006,
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'sin']);
    const sin = match.fighters[1];
    const entered = new Set<unknown>();
    // WOLF att, Clack chuck and RUN CHUCK.
    const wanted = [217, 226, 248];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (sin.action === 'script') entered.add(sin.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
