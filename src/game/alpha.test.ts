import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage, FIGHT_TICK } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro, named } from './testing';

// ALPHA as player 1, `gap` from a standing Ryuko as player 2.
function alphaPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['alpha', 'ryuko']);
  const [alpha, other] = match.fighters;
  other.x = alpha.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, alpha, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: ALPHA's actions, the damage Ryuko took
// and his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 3 } = {}) {
  const { alpha, other, steps } = alphaPlayer(gap);
  alpha.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(alpha)) mine.push(now(alpha));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: alpha.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const J = { punch: true };
const K = { kick: true };

describe('ALPHA (33 ALPHA.PLAYER)', () => {
  it('takes 500 life from his parameter block, desperate at 150', () => {
    expect([lifeOf('alpha'), desperationOf('alpha')]).toEqual([500, 150]);
    const { alpha } = alphaPlayer();
    expect(alpha).toMatchObject({ who: 'alpha', hp: 500, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.alpha.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('alpha')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.alpha.aliases).toEqual({});
    // 負け, KO NORMAL and KO down; thirty-eight after Ryuko's reactions up
    // to the shock, thirty-seven from Shock, thirty-eight from Fire HISA
    // and thirty-seven past Chuck Hiso.
    expect(
      [59, 60, 62, 73, 88, 90, 104, 128, 140, 145, 149, 151, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([83, 88, 91, 111, 126, 127, 142, 166, 177, 182, 186, 188, 209]);
  });

  it('reads his command table, entering each move as its source action', () => {
    expect(CHARACTERS.alpha.levels).toMatchObject({
      216: 21, // P1
      229: 21, // K1
      237: 21, // P sit
      239: 21, // K sit
      242: 21, // P J
      246: 22, // K J
      251: 21, // Hit Up
      254: 21, // Chuck
      259: 21, // anti air head
      262: 31, // Drop Kick
      267: 31, // Munt start
      271: 31, // CC start
      276: 31, // NC start
      289: 41, // Ranbu Start
      325: 41, // SNAKE FIRE STRAT
      329: 41, // SCC start
      344: 42, // Ryuon hasanken start
      351: 42, // NEW EN3 start
    });
    for (const [at, mine, damage] of [
      [
        (t: number) => (t < 60 ? { crouch: true, punch: t === 5 } : {}),
        237,
        40,
      ],
      [(t: number) => (t < 60 ? { crouch: true, kick: t === 5 } : {}), 239, 35],
      // ANTI AIR HEAD (entry 16): ↘ with P.
      [
        (t: number) =>
          t < 60 ? { crouch: true, right: true, punch: t === 5 } : {},
        259,
        30,
      ],
    ] as const)
      expect(play(at)).toMatchObject({
        mine: ['crouchEnter', mine, 'idle'],
        damage,
      });
    // Drop Kick (entry 15): ↘ with K in the air.
    expect(
      play(
        (t) =>
          t < 3
            ? { jump: true }
            : t >= 20 && t < 40
              ? { crouch: true, right: true, kick: t === 25 }
              : {},
        { gap: 150 },
      ),
    ).toMatchObject({ mine: expect.arrayContaining([262]), damage: 20 });
  });

  it("chains P1 and K1's hits through op 0x24 into his armours' blows", () => {
    // P1 hit (217) takes a fresh J or K within 30 ticks at its ages 5 and 14
    // (PCs 3111–3112, 3125–3126) into P2 (220) or K2 (233).
    expect(byKey(J)).toMatchObject({ mine: [216, 217, 'idle'], damage: 25 });
    expect(play(presses({ 0: J, 20: J }))).toMatchObject({
      mine: [216, 217, 220, 'idle'],
      damage: 42,
    });
    expect(play(presses({ 0: J, 20: K }))).toMatchObject({
      mine: [216, 217, 233, 'idle'],
      damage: 45,
    });
    // P2 takes them into P3 (221) or K3 (235) (PCs 3198–3213).
    expect(play(presses({ 0: J, 20: J, 58: J }))).toMatchObject({
      mine: [216, 217, 220, 221, 'idle'],
    });
    // K1 rolls rand % 4 > 1 (PC 3340) past its sound (229 + 13).
    expect(play(presses({ 0: K, 25: K, 50: K }))).toMatchObject({
      mine: [229, '229+13', 230, 233, 235, 'idle'],
      damage: 77,
    });
  });

  it('chases Hit Up with ↑ (PC 3861) and beams from his chuck', () => {
    expect(byKey({ hitUp: true })).toMatchObject({
      mine: [251, 252, 'idle'],
      damage: 20,
    });
    expect(
      play((t) =>
        t === 0 ? { hitUp: true } : t >= 35 && t < 38 ? { jump: true } : {},
      ),
    ).toMatchObject({ mine: expect.arrayContaining([251, 252, 253]) });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [254, 255, 'idle'],
      damage: 45,
    });
  });

  it('plays CC, Munt and NC, which ↓← J follows twice (op 0x24)', () => {
    for (const [key, gap, mine, damage] of [
      ['drill', 90, [271, 272, 'idle'], 65],
      ['drill', 300, [270, 'idle'], 0],
      // *munt obj (266) rises well ahead of him (PC 4136).
      ['axe', 90, [267, 'idle'], 0],
      ['axe', 300, [267, 'idle'], 50],
      ['iori', 90, [276, 'idle'], 30],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toMatchObject({ mine, damage });
    const back = (at: number) => ({
      [at]: { crouch: true },
      [at + 2]: { left: true },
      [at + 4]: { left: true, punch: true },
    });
    expect(
      play(presses({ 0: { iori: true }, ...back(50), ...back(90) })),
    ).toMatchObject({ mine: [276, 279, 281, 'idle'], damage: 80 });
  });

  it('spends a stock on SNAKE FIRE, Rambu and SCC, three on RYUON and NEW EN3', () => {
    for (const [key, gap, mine, damage, stock] of [
      ['getterBeam', 90, [325, 'idle'], 160, 2],
      ['changeAttack', 90, [289, 290, 292, 'idle'], 180, 2],
      ['megaBeam', 90, [329, 330, '332+8', 'idle'], 180, 2],
      ['megaBeam', 300, [328, 'idle'], 0, 2],
      ['musashi', 90, [344, '344+47', 'idle'], 280, 0],
      ['blackRush', 300, [351, 'idle'], 251, 0],
    ] as const)
      expect(byKey({ [key]: true }, { gap })).toEqual({
        mine,
        damage,
        stock,
      });
    // NEW EN3 start needs more than two (op 0x10, PC 6151).
    expect(byKey({ blackRush: true }, { stock: 2 })).toEqual({
      mine: [283, 'idle'],
      damage: 0,
      stock: 2,
    });
  });

  it('gains 10 power from No super, whose rp skips its 8 while variable 12 is 0', () => {
    const { alpha, steps } = alphaPlayer();
    alpha.stock = 0;
    steps({}, 2);
    steps({ blackRush: true });
    // No super rp's test (PC 4475) skips op 0x15 (PC 4477) in each of its
    // five calls (PC 4471); only Team VS 2P (65, PC 872) sets variable 12.
    steps({}, 39);
    expect([alpha.branch, alpha.age, alpha.power]).toEqual([283, 39, 10]);
    // Authored: a key's command enters once, though SCC's 90-tick window
    // outlasts No super.
    const scc = alphaPlayer();
    scc.alpha.stock = 0;
    scc.steps({}, 2);
    scc.steps({ megaBeam: true });
    scc.steps({}, 120);
    expect([scc.alpha.action, scc.alpha.power]).toEqual(['idle', 10]);
  });

  it('cancels NC, which sets variable 6 (PC 4274), into SC SUPER for two stocks', () => {
    for (const [key, mine, damage, stock] of [
      ['changeAttack', [276, 286, 290, 292, 'idle'], 195, 1],
      ['getterBeam', [276, '286+5', 'idle'], 175, 1],
      ['megaBeam', [276, '286+9', 330, '332+8', 'idle'], 195, 1],
      // Its window takes levels 40–41 (PC 4305), not RYUON's 42.
      ['musashi', [276, 'idle'], 30, 3],
    ] as const)
      expect(play(presses({ 0: { iori: true }, 30: { [key]: true } }))).toEqual(
        { mine, damage, stock },
      );
  });

  it('darkens the court through variable 13, which his Black (59) tests', () => {
    const { alpha, steps } = alphaPlayer();
    alpha.stock = 3;
    steps({}, 2);
    steps({ changeAttack: true });
    // Ranbu Start sets it at age 0 (PC 4545).
    expect(alpha.variables[13]).toBe(100);
    const shown: string[] = [];
    while (alpha.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(alpha.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(shown.filter((s) => s === 'half')).toHaveLength(5);
    expect(BLACK.alpha.opaque.image).toBe(1026);
  });

  it('rolls his Vs. intro (PC 463) into OP2 + 2 or Round 1 + 4, charging four stocks', () => {
    // OP2 (30) + 2 (PC 469), which calls demo stand (PC 422).
    expect(animationDuration('33+4', 'alpha')).toBe(346);
    expect(
      [0, 104, 105, 120, 196, 345].map(
        (age) => animationFrame('33+4', age, 'alpha').image,
      ),
    ).toEqual([130, 130, 129, 116, 118, 118]);
    // A third of the time Round 1 (35) + 4 (PC 475).
    expect(animationDuration('33+10', 'alpha')).toBe(298);
    // After 開始時's (31) blank display, and 開始時 BR's 50-tick display,
    // which KGT 13's global 14 keeps (PCs 464, 470), OP super Charge (54)
    // clears his power and adds 400 (PCs 800–801): four of his five stocks
    // (+0x7cb2).
    expect(
      [1, 0].map((seed) => {
        const { path, ticks, f } = brIntro('alpha', seed);
        return [path, ticks, f.stock];
      }),
    ).toEqual([
      [[31, 33], 398, 4],
      [[31, '33+8'], 350, 4],
    ]);
  });

  it('wins after demo stand, looping his stance (PC 1017), and draws holding 130', () => {
    expect(
      [0, 125, 126, 247, 248, 258, 2000].map(
        (age) => animationFrame('win', age, 'alpha').image,
      ),
    ).toEqual([116, 118, 574, 573, 573, 574, 571]);
    expect(
      [0, 225, 226, 236, 2000].map(
        (age) => animationFrame('draw', age, 'alpha').image,
      ),
    ).toEqual([116, 118, 129, 130, 130]);
    expect(faceImage(-1, 'alpha')).toBe(2001);
  });

  // ALPHA as player 2 at 1 life with a stock, punched by Ryuko at `punches`:
  // his actions as [tick, action, life], from `from`.
  function knockOut(match: Match, punches: number[], ticks: number, from = 0) {
    const [ryuko, alpha] = match.fighters;
    alpha.hp = 1;
    alpha.stock = 1;
    alpha.x = ryuko.x + 100;
    const path: [number, string, number][] = [];
    for (let t = 0; t < ticks; t++) {
      if (t === punches[1] - 11) {
        alpha.hp = 1;
        ryuko.x = alpha.x - 100;
      }
      match.step(punches.includes(t) ? J : {}, {});
      if (t >= from && path.at(-1)?.[1] !== named(alpha))
        path.push([t, named(alpha), alpha.hp]);
    }
    return { ryuko, alpha, path };
  }

  it('survives a KO with a stock through KO Boss (84), and the next one enters KO Boss N (87)', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'alpha']);
    // His lose action tests global 10 for 0 or above 200 (PCs 1029–1030),
    // which only his KO writes, so it enters KO Boss: 450 life and 449 back
    // (PCs 1037–1038), global 10 = 20000 (PC 1040), and a launch into KO
    // Boss Down (92, slot 1). The round controller reads the lives after his
    // step (0x408eda), so the round goes on. 180 ticks later KO Boss Down's
    // HP 1 (93) calls HP 2 (94) 250 times: 2 life and −1 power a pass, its
    // −2 passed over for global 3 < 40 (PC 1220).
    const { alpha, path } = knockOut(match, [3, 701], 1000);
    expect(path.slice(0, 4)).toEqual([
      [0, 'idle', 1],
      [11, '84', 1],
      [121, '92', 1],
      [616, 'idle', 500],
    ]);
    expect(match.winner).toBe('player');
    // KO Boss Down set variable 15 to 10 (PC 1146): KO Boss N takes 1000
    // (PC 1084) and adds 6 to variable 3 (PC 1081) each time it runs out
    // back into the lose action, until variable 3 passes 30 (PC 1080) into
    // KO NORMAL (88), whose landing enters KO down (91): global 10 = 10000
    // (PC 1130).
    expect(path.slice(4)).toEqual([
      [709, '87', 0],
      [715, '88', 0],
      [825, '91', 0],
    ]);
    expect([alpha.stock, alpha.variables[3], alpha.variables[15]]).toEqual([
      0, 36, 20,
    ]);
    expect(match.globals[10]).toBe(10000);
  });

  it('draws his life back only to desperation in VS single (global 3 = 50)', () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'alpha'], 'court', true);
    const [ryuko, alpha] = match.fighters;
    while (
      match.roundTicks < FIGHT_TICK ||
      ![ryuko, alpha].every((f) => f.action === 'idle')
    )
      match.step({}, {});
    // HP 2 takes its 2 back for global 3 ≥ 40 (PC 1221), but at desperation
    // (150) 0x40e7c0 scales a loss to 60%, 1 (+0x7ca7): he climbs to 151 and
    // ends on a loss.
    const { path } = knockOut(match, [3], 700);
    expect(path).toEqual([
      [0, 'turn', 1],
      [10, 'idle', 0],
      [11, '84', 1],
      [121, '92', 1],
      [616, 'idle', 149],
    ]);
    expect(match.winner).toBe(null);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 2, ['ryuko', 'alpha']);
    const alpha = match.fighters[1];
    const entered = new Set<unknown>();
    // His CPU's own cpu nc (412), and SCC's grab.
    const wanted = [412, 329, 330, 271];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (alpha.action === 'script') entered.add(alpha.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
