import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  ERUS_INTRO_EX_TICK,
} from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import { enter } from './testing';
import type { Fighter, Input } from './match';
import type { Action } from './animations';

// ERUS as player 1, `gap` from a standing opponent as player 2.
function erusPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['erus', opponent]);
  const [erus, other] = match.fighters;
  other.x = erus.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, erus, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`, and the opponent's from `theirs(t)`, run until she is
// back on her feet: ERUS's actions, the opponent's, and the damage dealt.
function play(
  at: (t: number) => Input,
  {
    gap = 90,
    stock = 3,
    ex = false,
    hp = 0,
    seed = 3,
    opponent = 'ryuko' as Who,
    theirs = (() => ({})) as (t: number) => Input,
  } = {},
) {
  const { erus, other, steps } = erusPlayer(gap, opponent, seed);
  erus.stock = stock;
  if (hp) erus.hp = hp;
  if (ex) erus.variables[0] = 10;
  steps({}, 2);
  const mine: unknown[] = [];
  const yours: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(erus)) mine.push(now(erus));
    if (yours.at(-1) !== now(other)) yours.push(now(other));
  }
  return { erus, other, mine, yours, damage: lifeOf(opponent) - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);

describe('ERUS (18 ERUS.PLAYER)', () => {
  it('takes 450 life from her parameter block, desperate at 135', () => {
    expect([lifeOf('erus'), desperationOf('erus')]).toEqual([450, 135]);
    const { erus } = erusPlayer();
    expect(erus).toMatchObject({ who: 'erus', hp: 450, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's, but for her UNCOUNTER reactions", () => {
    const twins = CHARACTERS.erus.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('erus')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (128, 129)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 86, 128],
      [77, 84, 129],
    ]);
    expect(CHARACTERS.erus.aliases).toEqual({ 128: 79, 129: 77 });
    // Two after Ryuko's KOs, seven after her hits, eight from BEAM Stand to
    // SHOCK INFINITY, seven from Shock, fifteen for FB, four from HISO stop,
    // nine from Pull Back and eight past Chuck Hiso.
    expect(
      [60, 73, 83, 88, 90, 110, 113, 121, 140, 149].map((r) => twins[r]),
    ).toEqual([62, 80, 91, 96, 97, 125, 117, 130, 148, 157]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.erus.levels).toMatchObject({
      186: 21, // P1
      205: 22, // KJ
      222: 31, // vo5 START
      305: 31, // Counter start
      365: 41, // Super slash
      399: 42, // en300 START
      416: 42, // Hidden EN3 Start
    });
    const { erus, steps } = erusPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(erus).toMatchObject({ action: 'script', branch: 186, age: 0 });
  });

  it('plays her specials: INATUMA, Coin, COUNTER and VO5, air fire in the air', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [343, 'idle'], 15],
      [{ iori: true }, [333, 'idle'], 19],
      [{ dst: true }, [305, 'idle'], 0],
      [{ axe: true }, [222, 'idle'], 15],
    ] as const)
      expect(byKey(key)).toMatchObject({ mine, damage });
    const air = play((t) =>
      t === 0 ? { jump: true, right: true } : t === 12 ? { axe: true } : {},
    );
    expect(air.mine.slice(0, 3)).toEqual(['takeoff', 'jump', 291]);
  });

  it('spends a stock on lizard fly, SCC and Super slash, and three on EN300', () => {
    for (const [key, gap, mine, damage, stock] of [
      // lizard fly's grab box (kind 0x10, PC 6363) skips a grounded victim.
      ['musashi', 200, [387, 388, 'turn', 'idle'], 0, 2],
      ['changeAttack', 90, [369, 371, 'turn', 'idle'], 80, 2],
      // SCC far (373) whiffs.
      ['changeAttack', 300, [373, 'idle'], 0, 2],
      ['megaBeam', 300, [365, 'idle'], 80, 2],
      ['blackRush', 90, [399, 405, 'idle'], 161, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.erus.stock]).toEqual([
        mine,
        damage,
        stock,
      ]);
    }
    // It catches a victim in the air: lizard fly att hit (390) for 80.
    const caught = byKey(
      { musashi: true },
      { gap: 200, theirs: (t) => (t === 45 ? { jump: true } : {}) },
    );
    expect([caught.mine, caught.damage]).toEqual([[387, 390, 393, 'idle'], 80]);
  });

  it('enters Hidden EN3 only in desperation (op 0x11, PC 6782), healing her or dropping stones by its roll', () => {
    expect(byKey({ getterBeam: true })).toMatchObject({ mine: [357, 'idle'] });
    // [HE3 Randon1] calls HP Charge; Randon2 (442, PC 6803) drops stones.
    const healed = byKey({ getterBeam: true }, { hp: 100, gap: 200, seed: 1 });
    expect([healed.mine, healed.erus.hp, healed.damage]).toEqual([
      [416, 'idle'],
      260,
      0,
    ]);
    const stones = byKey({ getterBeam: true }, { hp: 100, gap: 200, seed: 0 });
    expect([stones.mine, stones.erus.hp, stones.damage]).toEqual([
      [416, 442, 'idle'],
      100,
      180,
    ]);
  });

  it('has seven coins: Coin Start adds 100 to variable 13 (PC 5434) and enters no coin at 700 (PC 5424), which takes 100 back', () => {
    const coins = play(
      (t) => (t % 150 === 0 && t < 1500 ? { iori: true } : {}),
      {
        gap: 400,
      },
    );
    expect(coins.mine.filter((m) => m === 333 || m === 332)).toEqual([
      333, 333, 333, 333, 333, 333, 333, 332, 333,
    ]);
    // A press while her coin flies jumps to idle + 18 (op 0x04's busy
    // target, PC 5423).
    expect(coins.mine).toContain('1+18');
    expect(coins.erus.variables[13]).toBe(700);
  });

  it("answers a strike in Counter start's 128 ticks with Counter get (306, variable 4 at 100)", () => {
    const struck = (at: number) =>
      play((t) => (t ? {} : { dst: true }), {
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    expect(struck(3)).toMatchObject({ mine: [305, 306, 'idle'], damage: 36 });
    expect(struck(120)).toMatchObject({ mine: [305, 306, 'idle'] });
  });

  it('turns to EX for a stock, where COUNTER calls her Book (310, variables 4 and 2 held for 30 ticks)', () => {
    const turned = byKey({ ex: true });
    expect([turned.mine, turned.erus.stock, turned.erus.variables[0]]).toEqual([
      [217, 'idle'],
      2,
      10,
    ]);
    const struck = (at: number) =>
      play((t) => (t ? {} : { dst: true }), {
        ex: true,
        theirs: (t) => (t === at ? { punch: true } : {}),
      });
    // Counter get tests variable 0 (PC 4814): BOOK COUNTER GET (313).
    expect(struck(3)).toMatchObject({ mine: [310, 313, 'idle'], damage: 35 });
    expect(struck(40)).toMatchObject({ mine: [310, 'hit', 'idle'], damage: 0 });
  });

  it("counters a special through her reactions' test of variable 2 at 10: HISO's GUN SHOT enters Book Coun 2 (311, PC 1494)", () => {
    const booked = (at: number) =>
      play((t) => (t === at ? { dst: true } : {}), {
        ex: true,
        gap: 250,
        opponent: 'hiso',
        theirs: (t) => (t ? {} : { megaBeam: true }),
      });
    // GUN SHOT's shot meets her at tick 95.
    expect(booked(75)).toMatchObject({
      mine: ['idle', 310, 311, 'idle'],
      damage: 50,
    });
    expect(booked(55)).toMatchObject({
      mine: ['idle', 310, 'hisoStop', 'idle'],
      damage: 0,
    });
  });

  it('clears her variable 2 as a hit reaction opens (PC 787), before testing variable 4', () => {
    const { erus, match } = erusPlayer(90, 'ryuko');
    erus.variables[2] = 10;
    match.step({}, {});
    match.step({}, {});
    for (let t = 0; t < 40 && erus.action === 'idle'; t++)
      match.step({}, t ? {} : { punch: true });
    expect([erus.action, erus.variables[2]]).toEqual(['hit', 0]);
  });

  it('sends her EX forms from variable 0 at 10', () => {
    for (const [key, first] of [
      ['musashi', 454], // TELP Att
      ['changeAttack', 482], // coin SP
      ['blackRush', 505], // EX EN3
      ['megaBeam', 449], // Rising Strom
      ['drill', 345], // Saku Sta
      ['iori', 246], // Call Rber
      ['axe', 233], // Call Cerb
      ['ex', 218], // Typpe to Normal
    ] as const)
      expect(byKey({ [key]: true }, { ex: true }).mine[0]).toBe(first);
  });

  it("strikes again from Cerb Att's hit handler: its loop re-arms its box (PC 3573)", () => {
    const cerb = byKey({ axe: true }, { ex: true, gap: 300 });
    expect([cerb.yours.slice(0, 3), cerb.damage]).toEqual([
      ['idle', 'rushAirHit', 'flySide'],
      15,
    ]);
  });

  it('adds her no power for her stop guards (167, 169: no op 0x15)', () => {
    const match = new Match('practice', false, 3, ['ryuko', 'erus']);
    const erus = match.fighters[1];
    (
      match as unknown as {
        queue(f: Fighter, a: Action, s: number, a2: number): void;
      }
    ).queue(erus, 'blockStop', 0, 0);
    const power = erus.power;
    match.step();
    expect([erus.action, erus.power - power]).toEqual(['blockStop', 0]);
  });

  it('stands through her 202-tick Vs. intro from 開始時 BR + 9 (PC 344), turning EX with down at 97 (PC 357)', () => {
    expect([animationDuration('intro', 'erus'), ERUS_INTRO_EX_TICK]).toEqual([
      202, 97,
    ]);
    expect(
      [0, 97, 110, 201].map(
        (age) => animationFrame('intro', age, 'erus').image,
      ),
    ).toEqual([340, 258, 341, 115]);
    for (const down of [false, true]) {
      const match = new Match('cpu', true, 0, ['erus', 'zoma']);
      const erus = match.fighters[0];
      const x = erus.x;
      for (let t = 0; erus.action === 'intro'; t++)
        match.step(down && t > 90 && t < 100 ? { crouch: true } : {});
      // OP super Charge (41, PC 341) charges two stocks.
      expect([erus.x, erus.stock, erus.variables[0] ?? 0]).toEqual([
        x,
        2,
        down ? 10 : 0,
      ]);
    }
  });

  it('wins holding image 350 (PC 612), draws holding 365, and shows face 2001, cycling in EX mode', () => {
    expect(
      [0, 80, 1000].map((age) => animationFrame('win', age, 'erus').image),
    ).toEqual([116, 346, 350]);
    expect(animationFrame('draw', 1000, 'erus').image).toBe(365);
    expect(BLACK.erus.opaque.image).toBe(1009);
    expect([-1, 0, 40, 80].map((face) => faceImage(face, 'erus'))).toEqual([
      2001, 2002, 2001, 2000,
    ]);
  });

  it('opens no cancel from K3 (196), whose kind-0 box arms no counter (PC 2729)', () => {
    // K3's window takes levels 30–50 once its box has connected (PC 2708),
    // but op 0x18 arms the counter (+0xdf85) only for kind bit 0, so its hit
    // never raises it: EN300 (level 42) doesn't cancel it.
    const { match, erus, other, steps } = erusPlayer();
    erus.stock = 3;
    steps({}, 2);
    enter(match, erus, 196);
    while (other.action === 'idle') steps({});
    expect([erus.branch, erus.window?.mode, erus.contact]).toEqual([196, 1, 0]);
    while (erus.hitStop) steps({});
    steps({ command: 4 });
    steps({}, 3);
    expect([erus.branch, erus.age]).toEqual([196, 40]);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'erus']);
    const erus = match.fighters[1];
    const entered = new Set<unknown>();
    // Counter start, CPU VO5 5, Coin Start and inatuma START.
    const wanted = [305, 577, 333, 343];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (erus.action === 'script') entered.add(erus.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
