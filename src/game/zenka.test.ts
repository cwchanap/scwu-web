import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  hurtboxes,
  script,
  yowaiKey,
} from './animations';
import { faceImage, FIGHT_TICK } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

// ZENKA as player 1, `gap` from a standing Ryuko as player 2.
function zenkaPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['zenka', 'ryuko']);
  const [zenka, other] = match.fighters;
  other.x = zenka.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, zenka, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: ZENKA's actions, the damage Ryuko took
// and her stock.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { zenka, other, steps } = zenkaPlayer(gap);
  zenka.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(zenka)) mine.push(now(zenka));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: zenka.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const J = { punch: true };
const K = { kick: true };

describe('ZENKA (31 ZENKA.PLAYER)', () => {
  it('takes 480 life from her parameter block, desperate at 144', () => {
    expect([lifeOf('zenka'), desperationOf('zenka')]).toEqual([480, 144]);
    const { zenka } = zenkaPlayer();
    expect(zenka).toMatchObject({ who: 'zenka', hp: 480, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.zenka.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('zenka')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.zenka.aliases).toEqual({});
    // Nineteen after Ryuko's KOs, twenty-two up to the shock, twenty-one from
    // Shock, twenty past Chuck Hiso and twenty-one again from DOWN.
    expect(
      [59, 60, 62, 73, 88, 90, 128, 140, 145, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([78, 79, 81, 95, 110, 111, 149, 160, 166, 170, 172, 193]);
  });

  it("reads her command table, entering each move's source action", () => {
    expect(CHARACTERS.zenka.levels).toMatchObject({
      199: 21, // P 1
      206: 21, // K1
      211: 21, // P sit
      212: 10, // K sit
      219: 21, // PJ
      222: 22, // KJ
      226: 21, // HIT UP
      229: 21, // CHUCK
      238: 31, // FIRE BALL
      243: 31, // Dragon P
      246: 31, // New move start
      254: 41, // DAISHARIN START
      261: 41, // Ranbu start N
      270: 42, // En500 Start
    });
    // K sit throws K BALL (213), which rolls along the floor.
    expect(
      play((t) => (t < 80 ? { crouch: true, kick: t === 5 } : {}), {
        gap: 300,
      }),
    ).toMatchObject({ mine: ['crouchEnter', 212, 'idle'], damage: 24 });
  });

  it('strings P1 and K1 into the blue and red robots through op 0x24', () => {
    // P1's hit (200) takes neutral J or K within 20 ticks at its age 12 (PCs
    // 2628–2629) into P2 (203) or K2 (208).
    expect(byKey(J)).toMatchObject({ mine: [199, 200, 'idle'], damage: 15 });
    expect(play(presses({ 0: J, 20: J }))).toMatchObject({
      mine: [199, 200, 203, 'idle'],
      damage: 35,
    });
    // P2 takes them into P3 (204) or K3 (210) (PCs 2707–2708).
    expect(play(presses({ 0: J, 20: J, 60: J }))).toMatchObject({
      mine: [199, 200, 203, 204, 'idle'],
      damage: 80,
    });
    expect(play(presses({ 0: J, 20: J, 60: K }))).toMatchObject({
      mine: [199, 200, 203, 210, 'idle'],
      damage: 70,
    });
    // K1's hit (207) into K2, whose drill strikes until K3 cuts in (PCs
    // 2823–2835).
    expect(play(presses({ 0: K, 12: K, 40: K }))).toMatchObject({
      mine: [206, 207, 208, 210, 'idle'],
      damage: 60,
    });
  });

  it('chases Hit Up with ↑ (PC 3172) and follows the Chuck with ↓↘→ K (PC 3250)', () => {
    expect(
      play((t) =>
        t === 0 ? { hitUp: true } : t >= 40 && t < 43 ? { jump: true } : {},
      ),
    ).toMatchObject({
      mine: expect.arrayContaining([226, 227, 228, '4+22']),
      damage: 20,
    });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [229, 230, 'idle'],
      damage: 25,
    });
    expect(
      play((t) =>
        t === 0
          ? { throw: true }
          : t === 50
            ? { crouch: true }
            : t === 52
              ? { crouch: true, right: true }
              : t === 54
                ? { right: true }
                : t === 56
                  ? { right: true, kick: true }
                  : {},
      ),
    ).toMatchObject({ mine: [229, 230, 232, 236, 'idle'], damage: 55 });
  });

  it('plays Dragon P, FIRE BALL and the new move', () => {
    for (const [key, gap, mine, damage] of [
      ['drill', 90, [243, 242, 'idle'], 55],
      ['axe', 90, [238, 'idle'], 45],
      ['axe', 600, [238, 'idle'], 45],
      ['iori', 90, [246, 'idle'], 70],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toMatchObject({ mine, damage });
  });

  it('spends a stock on DAISHARIN and Ranbu, or enters NO SUPER', () => {
    for (const [key, gap, mine, damage] of [
      ['musashi', 90, [254, 'idle'], 120],
      ['getterBeam', 90, [261, 263, 'turn', 'idle'], 130],
      ['getterBeam', 300, [262, 263, 'turn', 'idle'], 130],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toEqual({
        mine,
        damage,
        stock: 2,
      });
    expect(byKey({ musashi: true }, { stock: 0 })).toMatchObject({
      mine: [249, 'idle'],
      damage: 0,
    });
  });

  it('falls from en500 into En300, whose grab strips the victim in its own Clothes off', () => {
    // En500 Start (270) needs more than four stocks (op 0x10, PC 4079), so
    // it enters En300 start (275), which spends three (PC 4182). Close in,
    // its leap lands behind Ryuko.
    expect(byKey({ changeAttack: true })).toEqual({
      mine: [275, '275+42', 'turn', 'idle'],
      damage: 0,
      stock: 0,
    });
    // Its grab names her Clothes off (response 46, 101): 228 ticks held,
    // 320 stripped, then 260 life (PC 1265) and FLY NO HIT + 19 (PC 1267),
    // its launch.
    const strip = (stock: number) => {
      const { match, zenka, other, steps } = zenkaPlayer(200);
      zenka.stock = stock;
      steps({}, 2);
      const hers: unknown[] = [];
      for (let t = 0; t < 1500; t++) {
        steps(t ? {} : { changeAttack: true });
        if (hers.at(-1) !== now(other)) hers.push(now(other));
      }
      return [hers, lifeOf('ryuko') - other.hp, match.winner];
    };
    expect(strip(3)).toEqual([
      ['idle', 101, 'fly', 'knockdown', 'getUp', 'idle'],
      261,
      null,
    ]);
    // With five stocks, en500's grab names Clothes off 500 (response 47,
    // 103), which takes 1000 (PC 1292): the loss queues her lose action
    // (0x40e84b), which her next step enters, after the jump into FLY NO
    // HIT.
    expect(strip(5)).toEqual([
      ['idle', 103, 'fly', 'down', 'koLand'],
      510,
      'player',
    ]);
    expect(byKey({ changeAttack: true }, { stock: 2 })).toEqual({
      mine: [249, 'idle'],
      damage: 0,
      stock: 2,
    });
  });

  it('cancels FIRE BALL, which sets variable 6 (PC 3390), into SC SUPER for two stocks', () => {
    for (const [key, mine, damage] of [
      ['musashi', [238, 252, 'idle'], 165],
      ['getterBeam', [238, '252+5', 263, 'turn', 'idle'], 175],
    ] as const)
      expect(play(presses({ 0: { axe: true }, 20: { [key]: true } }))).toEqual({
        mine,
        damage,
        stock: 1,
      });
    // Its window takes levels 40–41 (PC 3389), not en500's 42.
    expect(
      play(presses({ 0: { axe: true }, 20: { changeAttack: true } })),
    ).toEqual({ mine: [238, 'idle'], damage: 45, stock: 3 });
  });

  it('darkens the court through variable 13, which her Black (54) tests', () => {
    const { zenka, steps } = zenkaPlayer();
    zenka.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // DAISHARIN START sets it at age 0 (PC 3669).
    expect(zenka.variables[13]).toBe(100);
    const shown: string[] = [];
    while (zenka.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(zenka.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(shown.filter((s) => s === 'half')).toHaveLength(5);
    expect(BLACK.zenka.opaque.image).toBe(1011);
  });

  it('charges four stocks through her Vs. intro, 開始時 BR + 3 (PC 466)', () => {
    expect(animationDuration('32+3', 'zenka')).toBe(384);
    // OP super Charge (49) clears her power and adds 400 (PCs 586–587):
    // four of her five stocks (+0x7cb2).
    const { path, ticks, f } = brIntro('zenka');
    // 開始時 BR's 50-tick display comes first, as KGT 13's global 14 keeps
    // it (PC 464).
    expect([path, ticks, f.stock]).toEqual([[30, 32], 436, 4]);
    // demo speak rp (38) ten times (PC 470), then her stance (284–287).
    expect(
      [0, 15, 30, 299, 300, 334, 383].map(
        (age) => animationFrame('32+3', age, 'zenka').image,
      ),
    ).toEqual([327, 328, 327, 328, 284, 113, 113]);
  });

  // A VS single with ZENKA as player `side`, from its FIGHT, global 1 at
  // `global1`.
  function vsFight(side: 0 | 1, global1: number) {
    const match = new Match(
      'cpu',
      true,
      0,
      side ? ['ryuko', 'zenka'] : ['zenka', 'ryuko'],
      'court',
      true,
    );
    match.globals[1] = global1;
    while (
      match.roundTicks < FIGHT_TICK ||
      !match.fighters.every((f) => f.action === 'idle')
    )
      match.step({}, {});
    return {
      match,
      zenka: match.fighters[side],
      other: match.fighters[1 - side],
    };
  }

  it('takes more of each hit and enters P1 y in her yowai form (global 1 = 1000)', () => {
    // VS's select screen leaves global 1 at 1000: 開始時 enters 開始時 yowai,
    // which sets variable 14 to 10 (PC 478). Her stand's test of it keeps
    // its 179% box (PCs 10–12), so Ryuko's 10-damage P1 takes 17; below
    // 1000 it takes 10. Her P 1 (199) tests it into P1 y (201).
    const taken = [1000, 0].map((global1) => {
      const { match, zenka, other } = vsFight(1, global1);
      zenka.x = other.x + 100;
      const hp = zenka.hp;
      for (let t = 0; t < 60; t++) match.step(t ? {} : J, {});
      return [zenka.variables[14] ?? 0, hp - zenka.hp];
    });
    expect(taken).toEqual([
      [10, 17],
      [0, 10],
    ]);
    const entered = [1000, 0].map((global1) => {
      const { match, zenka } = vsFight(0, global1);
      match.step(J, {});
      return now(zenka);
    });
    expect(entered).toEqual([201, 199]);
  });

  it('jumps, falls and lands on her yowai copies', () => {
    // Each jump's test of variable 14 (PC 57) enters a copy whose boxes
    // take 179%; the side jumps run on into the up jump's (+ 22, PCs 106, 154).
    expect(
      ['takeoffForward', 'jumpForward', 'jump'].map((action) =>
        hurtboxes(action as 'jump', 0, 'zenka', true).map((box) => box.taken),
      ),
    ).toEqual([[179], [179], [179]]);
    expect(hurtboxes('jump', 0, 'zenka').map((box) => box.taken)).toEqual([
      100,
    ]);
    // Her fall's copy (8 + 11) falls at 80, not 60 (PC 172); J LEND's holds
    // one 8-tick display (PC 203).
    const gravity = (key: number | `${number}+${number}`) =>
      script(key, 'zenka').events.find((e) => e.op === 'motion');
    const { fall } = CHARACTERS.zenka;
    expect(yowaiKey(fall, 'zenka')).toBe('8+11');
    expect(gravity(yowaiKey(fall, 'zenka'))).toMatchObject({ ay: 80 });
    expect(gravity(fall)).toMatchObject({ ay: 60 });
    expect(
      [false, true].map((yowai) =>
        animationDuration('land', 'zenka', false, yowai),
      ),
    ).toEqual([16, 8]);
  });

  it('double-jumps on her 179% copy after any jump, whose takeoff sets variable 9 to 100 (PCs 58, 207)', () => {
    // JUMP 2 tests variable 9 for 100 (PC 207) into JUMP 2 + 15, the copy
    // her yowai form takes, which clears it (PC 227), as J LEND does.
    const { match, zenka } = zenkaPlayer();
    const seen: unknown[] = [];
    for (let t = 0; t < 120; t++) {
      match.step(t < 3 || (t >= 20 && t < 23) ? { jump: true } : {}, {});
      if (seen.at(-1) !== now(zenka)) seen.push(now(zenka));
    }
    expect(seen).toEqual(['takeoff', 'jump', '11+15', 'land', 'idle']);
    expect(zenka.variables[14] ?? 0).toBe(0);
    expect(zenka.variables[9]).toBe(0);
    const taken = (key: number | `${number}+${number}`) =>
      script(key, 'zenka').frames[0].body!.map((box) => box.taken);
    expect([taken(11), taken('11+15')]).toEqual([
      [100, 100],
      [179, 179],
    ]);
  });

  it('wins after DEMO STAND and her speech, holding image 283 (PC 799), and draws holding it too', () => {
    expect(animationDuration('win', 'zenka')).toBe(640);
    expect(
      [0, 116, 166, 176, 200, 439, 440, 3000].map(
        (age) => animationFrame('win', age, 'zenka').image,
      ),
    ).toEqual([113, 113, 287, 286, 327, 328, 283, 283]);
    expect(
      [0, 116, 166, 200, 2000].map(
        (age) => animationFrame('draw', age, 'zenka').image,
      ),
    ).toEqual([113, 113, 287, 283, 283]);
    expect(faceImage(-1, 'zenka')).toBe(2001);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'zenka']);
    const zenka = match.fighters[1];
    const entered = new Set<unknown>();
    // Her CPU's own CPU DJ and cpu chuck, whose hit runs into CHUCK ADD ATT
    // (PC 5065).
    const wanted = [358, 360, 361, 232];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (zenka.action === 'script') entered.add(zenka.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
