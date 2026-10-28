import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro, enter } from './testing';

// OGI as player 1, `gap` from a standing opponent as player 2.
function ogiPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['ogi', opponent]);
  const [ogi, other] = match.fighters;
  other.x = ogi.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, ogi, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: OGI's actions, the objects he spawned
// and the damage each took. `x` places him first.
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, hp = 0, x = 0 } = {},
) {
  const { match, ogi, other, steps } = ogiPlayer();
  if (x) ogi.x = x;
  other.x = ogi.x + gap;
  ogi.stock = stock;
  if (hp) ogi.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(ogi)) mine.push(now(ogi));
    for (const e of match.effects) if (e.owner === 0) objects.add(e.clip);
  }
  return { match, ogi, mine, objects, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const J = { punch: true };
const K = { kick: true };

describe('OGI (27 OGI.PLAYER)', () => {
  it('takes 500 life from his parameter block, desperate at 150', () => {
    expect([lifeOf('ogi'), desperationOf('ogi')]).toEqual([500, 150]);
    const { ogi } = ogiPlayer();
    expect(ogi).toMatchObject({ who: 'ogi', hp: 500, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.ogi.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('ogi')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.ogi.aliases).toEqual({});
    // Four after Ryuko's KOs, seven after his hits, eight for the twists
    // and the shock, seven from Shock, eight from Fire HISA and seven past
    // Chuck Hiso.
    expect(
      [59, 60, 73, 81, 85, 88, 90, 99, 104, 137, 140, 172].map((r) => twins[r]),
    ).toEqual([63, 64, 80, 88, 93, 96, 97, 106, 112, 145, 147, 179]);
  });

  it("has no body while held: SAKUYA's CC hit shocks him before its box strikes (PCs 5325–5333)", () => {
    // Op 0x07 (PC 5325) clears his bodies (0x40e550), his Chuck Hit's from
    // its first display (PC 1753) too, where Ryuko's sets none (PC 1732).
    // So the box armed beside the shock's op 0x14 (PCs 5327, 5333) meets
    // only the shock's own bodies, a step later, as it does Ryuko's.
    const match = new Match('practice', false, 3, ['sakuya', 'ogi']);
    const [sakuya, ogi] = match.fighters;
    match.step({}, {});
    ogi.x = sakuya.x + 40;
    enter(match, sakuya, 347);
    const path: [string, number][] = [];
    while (ogi.action !== 'hitRapid') {
      match.step({}, {});
      if (path.at(-1)?.[0] !== ogi.action) path.push([ogi.action, ogi.hp]);
    }
    expect(path.slice(-3)).toEqual([
      ['superHeld', 500],
      ['shock', 495],
      ['hitRapid', 495],
    ]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.ogi.levels).toMatchObject({
      185: 21, // P1
      191: 21, // K1
      230: 31, // Dragon Start
      238: 31, // Shoot start K
      241: 31, // shoot start P
      244: 31, // Crush start
      247: 31, // Air Crush
      253: 31, // rose start
      263: 41, // S crush start
      277: 41, // Scc start Near
      297: 41, // SCC far start
      314: 41, // S SHOOT START
      316: 41, // S SHOOT AIR
      327: 42, // En 300 start
    });
    const { ogi, steps } = ogiPlayer();
    steps({}, 2);
    steps(K);
    expect(ogi).toMatchObject({ action: 'script', branch: 191, age: 0 });
  });

  it('chains J and K through P1 hit or K1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    // P1 strikes thrice, entering P1 hit (186) and P1 hit 2 (187); P1 hit
    // takes J or K within 20 ticks (PCs 2415–2416), P2 within 30 (PCs
    // 2481–2482).
    expect(byKey(J)).toMatchObject({
      mine: [185, 186, 187, 'idle'],
      damage: 17,
    });
    expect(play(presses({ 0: J, 30: J, 80: J }))).toMatchObject({
      mine: [185, 186, 188, 190, 'idle'],
      damage: 61,
    });
    expect(play(presses({ 0: K, 30: K, 70: J }))).toMatchObject({
      mine: [191, 192, 194, 190, 'idle'],
      damage: 66,
    });
    // K3 grabs (box kind 234, PC 2676) into K3 hit (197), or EVIL K3 (199)
    // below 150 life (op 0x11, PC 2686), which flings the victim in its own
    // Chuck OGI BALL (response 62) into the wall, where its fire (205)
    // strikes 20 more.
    const kkk = presses({ 0: K, 30: K, 70: K });
    expect(play(kkk)).toMatchObject({
      mine: [191, 192, 194, 196, 197, 'idle'],
      damage: 70,
    });
    expect(play(kkk, { hp: 100 })).toMatchObject({
      mine: [191, 192, 194, 196, 199, 'idle'],
      damage: 80,
    });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [223, 225, 'idle'],
      damage: 20,
    });
    // hit up hit (221) takes ↑ within 20 ticks (PC 3181) into Jump cancel.
    expect(
      play((t) =>
        t === 0 ? { hitUp: true } : t >= 10 && t < 400 ? { jump: true } : {},
      ),
    ).toMatchObject({ mine: [220, 221, 222, 'land', 'turn', 'idle'] });
  });

  it('plays his specials: Dragon, Crush attack, Rose attack, fire p and FIRE K', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [230, 233, 'idle'], 40],
      [{ axe: true }, [244, 245, 'idle'], 20],
      [{ dst: true }, [241, 'idle'], 28],
      [{ megaBeam: true }, [238, 'idle'], 18],
    ] as const) {
      const move = byKey(key);
      expect(move).toMatchObject({ mine, damage });
      expect(move.ogi.stock).toBe(3);
    }
    // The rose (250) arcs over a near opponent.
    for (const [gap, damage] of [
      [90, 0],
      [600, 10],
    ])
      expect(byKey({ iori: true }, { gap })).toMatchObject({
        mine: [253, 'idle'],
        damage,
      });
    expect(
      play(presses({ 0: { jump: true }, 10: { axe: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 247, 248, 'idle'],
      damage: 18,
    });
  });

  it('spends a stock on s shoot, SCC and S Crush, SCC grabbing near and leaping far', () => {
    for (const [key, gap, mine, damage] of [
      ['getterBeam', 90, [314, 'idle'], 84],
      ['musashi', 90, [277, 280, 286, 'idle'], 100],
      ['musashi', 300, [297, 300, '300+38', '308+55', 'idle'], 100],
      ['changeAttack', 90, [263, 264, 266, 268, 270, 'turn', 'idle'], 90],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.ogi.stock]).toEqual([
        mine,
        damage,
        2,
      ]);
    }
    expect(
      play(presses({ 0: { jump: true }, 10: { getterBeam: true } }), {
        gap: 300,
      }),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 316, 317, 'idle'],
      damage: 84,
    });
    // > SCC NHIT2 takes ↓→ K or → ↘ ↓ ↙ ← K within 60 ticks (PCs
    // 4619–4620) into its hit up or chuck follow-up.
    expect(
      play(
        presses({
          0: { musashi: true },
          350: { crouch: true },
          351: { crouch: true, right: true },
          352: { right: true },
          353: K,
        }),
      ),
    ).toMatchObject({ mine: [277, 280, 286, 290, 'idle'], damage: 60 });
    expect(
      play(
        presses({
          0: { musashi: true },
          350: { right: true },
          351: { crouch: true, right: true },
          352: { crouch: true },
          353: { crouch: true, left: true },
          354: { left: true },
          355: K,
        }),
      ),
    ).toMatchObject({ mine: [277, 280, 286, 292, 294, 'idle'], damage: 120 });
  });

  it('spends three stocks on EN300, whose near boom needs EN3 Stop culled at a wall (variable 7, PC 5714)', () => {
    // In open space EN3 Stop (329) clears variable 7 after 10 ticks (PC
    // 5759), so the far boom (322) arcs over a near opponent.
    const open = byKey({ blackRush: true });
    expect([open.mine, open.damage, open.ogi.stock]).toEqual([
      [327, 'idle'],
      0,
      0,
    ]);
    expect(open.objects).toContain(322);
    const wall = byKey({ blackRush: true }, { x: 1500, gap: 150 });
    expect(wall).toMatchObject({ mine: [327, '328+30', 'idle'], damage: 212 });
    expect(wall.objects).toContain(320);
    expect(byKey({ blackRush: true }, { stock: 2 })).toMatchObject({
      mine: [257, 'idle'],
      damage: 0,
    });
  });

  it('cancels fire p, which sets variable 6 (PC 3671), into a super for two stocks', () => {
    for (const [key, mine, damage] of [
      ['getterBeam', [241, '260+13', 'idle'], 112],
      ['musashi', [241, '260+5', 280, 286, 'idle'], 128],
      ['changeAttack', [241, 260, 264, 266, 268, 270, 'turn', 'idle'], 118],
    ] as const) {
      const move = play(presses({ 0: { dst: true }, 45: { [key]: true } }));
      expect([move.mine, move.damage, move.ogi.stock]).toEqual([
        mine,
        damage,
        1,
      ]);
    }
    // EN300's level 42 is past fire p's window (40–41, PC 3688).
    expect(
      play(presses({ 0: { dst: true }, 45: { blackRush: true } })),
    ).toMatchObject({ mine: [241, 'idle'], damage: 28 });
  });

  it("rolls his Vs. intro's path (PC 381), charging two stocks", () => {
    // 開始時 BR + 4 into Round 1 (37) + 4 (PC 387), or half the time + 10
    // into RANDON OP1 (31) + 2 (PC 393): 200 ticks each, after 開始時's (34)
    // blank display. KGT 13's global 14 keeps the 50-tick display each global
    // 14 = 0 check skips (PCs 382, 388), from 開始時 BR or + 8.
    expect([
      animationDuration('36+4', 'ogi'),
      animationDuration('36+10', 'ogi'),
    ]).toEqual([200, 200]);
    const runs = [0, 1].map((seed) => {
      const { path, ticks, f, objects } = brIntro('ogi', seed);
      return [path, ticks, f.stock, [...objects]];
    });
    // Black (47) and OP super Charge (43) either way; Round 1 spawns *OP obj
    // (33) twice (PCs 401–402), RANDON OP1 its 375 (PC 320).
    expect(runs).toEqual([
      [[34, 36], 252, 2, [47, 43, 33, '33+6']],
      [[34, '36+8'], 252, 2, [47, 43, 375]],
    ]);
  });

  it('wins after demo act, looping image 642 (PC 660), and draws holding image 142 (PC 745)', () => {
    expect(
      [0, 130, 135, 240, 243, 2000].map(
        (age) => animationFrame('win', age, 'ogi').image,
      ),
    ).toEqual([116, 129, 133, 641, 642, 642]);
    expect(
      [0, 130, 145, 2000].map(
        (age) => animationFrame('draw', age, 'ogi').image,
      ),
    ).toEqual([116, 141, 142, 142]);
    expect(BLACK.ogi.opaque.image).toBe(1009);
    expect(faceImage(-1, 'ogi')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 39, ['ryuko', 'ogi']);
    const ogi = match.fighters[1];
    const entered = new Set<unknown>();
    // Shoot start K, shoot start P, Crush start, S SHOOT START and his CPU's
    // own CPU dash, CPU DJ and CPU SCC.
    const wanted = [238, 241, 244, 314, 390, 391, 392];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (ogi.action === 'script') entered.add(ogi.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
