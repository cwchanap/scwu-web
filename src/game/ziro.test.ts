import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  ZIRO_INTRO_EX_TICK,
  ZIRO_KO,
  ZIRO_LANDING,
} from './animations';
import { commanded, entriesOf } from './commands';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';

// ZIRO as player 1, `gap` from a standing opponent as player 2.
function ziroPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['ziro', opponent]);
  const [ziro, other] = match.fighters;
  other.x = ziro.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, ziro, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 3000 ticks: ZIRO's actions, the objects he spawned
// and the damage each took. `ex` starts him in EX mode (variable 0 at 100).
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, hp = 0, ex = false } = {},
) {
  const { match, ziro, other, steps } = ziroPlayer(gap);
  ziro.stock = stock;
  if (hp) ziro.hp = hp;
  if (ex) ziro.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(ziro)) mine.push(now(ziro));
    for (const e of match.effects) if (e.owner === 0) objects.add(e.clip);
  }
  return {
    ziro,
    mine,
    objects,
    damage: lifeOf('ryuko') - other.hp,
    behind: Math.sign(ziro.x - other.x),
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const J = { punch: true };
const K = { kick: true };

describe('ZIRO (28 ZIRO.PLAYER)', () => {
  it('takes 470 life from his parameter block, desperate at 141', () => {
    expect([lifeOf('ziro'), desperationOf('ziro')]).toEqual([470, 141]);
    const { ziro } = ziroPlayer();
    expect(ziro).toMatchObject({ who: 'ziro', hp: 470, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.ziro.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('ziro')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.ziro.aliases).toEqual({});
    // Eight after Ryuko's KOs, seventeen up to the shock, sixteen from Shock
    // to the clothes, seventeen from Clothes off500 and sixteen past Chuck
    // Hiso.
    expect(
      [59, 60, 73, 81, 88, 90, 97, 104, 128, 140, 143, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([67, 68, 90, 98, 105, 106, 113, 121, 145, 156, 159, 188]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.ziro.levels).toMatchObject({
      194: 21, // P1
      215: 21, // K1
      251: 31, // TO EX
      255: 50, // TELE P N
      257: 50, // TALE K N
      270: 31, // NATAKU FIST NTAIR
      272: 31, // NATAKU FIST K
      288: 31, // Shoot start
      317: 31, // CC START
      336: 31, // IORI start
      355: 41, // ALL HASHA st
      392: 41, // Rambu FAR
      393: 41, // Rambu Start
      428: 42, // EN 300 air
      433: 42, // EN300 start
      494: 42, // HiddenEN3
    });
    const { ziro, steps } = ziroPlayer();
    steps({}, 2);
    steps(K);
    expect(ziro).toMatchObject({ action: 'script', branch: 215, age: 0 });
  });

  it('chains neutral J or K through P1 hit or K1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    // P1 rolls rand % 4 > 1 past its first display (PC 2586); P1 hit takes
    // J or K within 20 ticks (PCs 2613–2614), P2 within 30 (PCs 2651–2652).
    expect(byKey(J)).toMatchObject({ mine: [194, '194+7', 195, 'idle'] });
    expect(play(presses({ 0: J, 25: J, 60: J }))).toMatchObject({
      mine: [194, '194+7', 195, 196, 199, 203, 'idle'],
      damage: 63,
    });
    expect(play(presses({ 0: J, 25: J, 60: K }))).toMatchObject({
      mine: [194, '194+7', 195, 196, 220, 'idle'],
      damage: 65,
    });
    expect(play(presses({ 0: K, 25: K, 90: K }))).toMatchObject({
      mine: [215, 216, 217, 220, 'idle'],
      damage: 69,
    });
    // In EX mode K2's rp is k2 rp ex (219, PC 3084).
    expect(play(presses({ 0: K, 25: K, 70: K }), { ex: true })).toMatchObject({
      mine: [215, 216, 217, 219, 'idle'],
      damage: 34,
    });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [245, 246, 'idle'],
      damage: 25,
    });
    // HIT UP HIT (243) takes ↑ within 20 ticks (PC 3652) into jUMP CANCEL.
    expect(
      play((t) =>
        t === 0 ? { hitUp: true } : t >= 10 && t < 400 ? { jump: true } : {},
      ),
    ).toMatchObject({ mine: [242, 243, 244, 'land', 'turn', 'idle'] });
  });

  it('plays his specials: Fire Ball, nataku p, CC and IORI3HIT, which takes ↓→ J twice more', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [288, 'idle'], 30],
      [{ axe: true }, [270, 'idle'], 20],
      [{ megaBeam: true }, [317, 318, 319, '319+17', 'idle'], 40],
      [{ dst: true }, [336, 'idle'], 15],
    ] as const) {
      const move = byKey(key);
      expect([move.mine, move.damage, move.ziro.stock]).toEqual([
        mine,
        damage,
        3,
      ]);
    }
    // At or below 141 life Shoot start enters evil shoot start (287, op
    // 0x11, PC 4383).
    expect(byKey({ drill: true }, { hp: 100 })).toMatchObject({
      mine: [287, 'idle'],
      damage: 40,
    });
    // IORI start and IORI 2nd take ↓→ J within 30 ticks (PCs 5699, 5758).
    const iori = (t: number) => ({
      [t]: { crouch: true },
      [t + 1]: { crouch: true, right: true },
      [t + 2]: { right: true },
      [t + 3]: J,
    });
    expect(play(presses({ 0: { dst: true }, ...iori(20) }))).toMatchObject({
      mine: [336, 338, 'idle'],
      damage: 25,
    });
    expect(
      play(presses({ 0: { dst: true }, ...iori(20), ...iori(60) })),
    ).toMatchObject({ mine: [336, 338, 340, 341, 'idle'], damage: 45 });
  });

  it('teleports past the opponent with telepot (raw 10000, PC 3853)', () => {
    for (const [gap, mine] of [
      [90, 257],
      [300, 258],
    ] as const) {
      expect(byKey({ iori: true }, { gap })).toMatchObject({
        mine: [mine, 'turn', 'idle'],
        damage: 0,
        behind: 1,
      });
    }
  });

  it('spends a stock on MISS ALL and RAMBU, three on EN300, or enters No super', () => {
    for (const [key, gap, mine, damage, stock] of [
      ['getterBeam', 90, [355, 'idle'], 108, 2],
      ['musashi', 90, [393, 395, 396, 398, 409, 'idle'], 116, 2],
      ['musashi', 300, [392, 395, 396, 398, 409, 'idle'], 116, 2],
      ['changeAttack', 90, [433, 435, 'idle'], 220, 0],
    ] as const) {
      const move = byKey({ [key]: true }, { gap });
      expect([move.mine, move.damage, move.ziro.stock]).toEqual([
        mine,
        damage,
        stock,
      ]);
    }
    expect(
      play(presses({ 0: { jump: true }, 10: { changeAttack: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 428, 435, 'idle'],
      damage: 220,
    });
    expect(byKey({ getterBeam: true }, { stock: 0 })).toMatchObject({
      mine: [349, 'idle'],
      damage: 0,
    });
    expect(byKey({ changeAttack: true }, { stock: 2 })).toMatchObject({
      mine: [349, 'idle'],
      damage: 0,
    });
  });

  it('turns the stick for TWIN SHOT, whose HiddenEN3 needs less than 141 life (op 0x11, PC 8353)', () => {
    const steps = entriesOf('ziro')[0].steps;
    const params = entriesOf('ziro')[0].params;
    expect([steps, params]).toEqual([
      [0xf000, 0x2080],
      [1, 20],
    ]);
    // Back, down, forward, up (or forward, down, back, up), then J.
    const turned = (...words: number[]) =>
      commanded([...Array(40).fill(0), ...words, 0x80], steps, 40, params);
    expect(turned(1, 1, 8, 2, 4)).toBe(true);
    expect(turned(2, 8, 8, 1, 4)).toBe(true);
    expect(turned(9, 2, 6)).toBe(false);
    expect(turned(8, 2, 4)).toBe(false);
    // The diagonals start a turn as F, D, B or U do (0x410a00) but don't
    // step it on.
    expect(turned(1, 9, 10, 6)).toBe(false);
    // Through real input, up taking off: the scan still reads it on the ground.
    const input = ['left', 'crouch', 'right', 'jump'].flatMap((d) => [
      { [d]: true },
      { [d]: true },
    ]);
    expect(
      play((t) => input[t] ?? (t === 8 ? J : {}), { hp: 100 }),
    ).toMatchObject({
      mine: ['backwalk', 'crouchEnter', 'takeoff', 494, 435, 'idle'],
      damage: 170,
    });
    // The key writes the turn too. At 141 life or more HiddenEN3 enters CC
    // START; with fewer than three stocks No super.
    for (const [options, mine, damage] of [
      [{ hp: 100 }, [494, 435, 'idle'], 170],
      [{}, [317, 318, 319, '319+17', 'idle'], 40],
      [{ hp: 100, stock: 2 }, [349, 'idle'], 0],
    ] as const)
      expect(byKey({ blackRush: true }, options)).toMatchObject({
        mine,
        damage,
      });
  });

  it('enters EX mode through --TYPE-- for 50 power, swapping his moves for their EX forms', () => {
    const type = byKey({ ex: true });
    expect([type.mine, exMode(type.ziro), type.ziro.stock]).toEqual([
      [251, 'idle'],
      true,
      2,
    ]);
    expect(type.ziro.power).toBe(50);
    const back = byKey({ ex: true }, { ex: true });
    expect([back.mine, exMode(back.ziro)]).toEqual([[252, 'idle'], false]);
    const ex = { ex: true };
    for (const [key, mine, damage, gap] of [
      [{ drill: true }, [302, 303, 'idle'], 37, 90],
      [{ axe: true }, [277, 279, 'idle'], 40, 90],
      [{ megaBeam: true }, [325, 329, 'idle'], 43, 90],
      [{ dst: true }, [344, 'idle'], 25, 90],
      [{ getterBeam: true }, [379, 382, 'idle'], 100, 90],
      [{ musashi: true }, [414, 415, 'idle'], 112, 90],
      [{ musashi: true }, [425, 'idle'], 0, 300],
      [{ changeAttack: true }, [449, 478, 479, 490, 'turn', 'idle'], 232, 90],
    ] as const)
      expect(byKey(key, { ...ex, gap })).toMatchObject({ mine, damage });
  });

  it('cancels nataku p, which sets variable 6 (PC 4055), into MISS ALL or RAMBU for two stocks', () => {
    for (const [key, mine, damage] of [
      ['getterBeam', [270, 352, 'idle'], 127],
      ['musashi', [270, '352+5', 395, 396, 398, 409, 'idle'], 136],
    ] as const) {
      const move = play(presses({ 0: { axe: true }, 20: { [key]: true } }));
      expect([move.mine, move.damage, move.ziro.stock]).toEqual([
        mine,
        damage,
        1,
      ]);
    }
    // EN300's level 42 is past its window (40–41, PC 4054).
    expect(
      play(presses({ 0: { axe: true }, 20: { changeAttack: true } })),
    ).toMatchObject({ mine: [270, 'idle'], damage: 20 });
  });

  it('drops in from the sky for his Vs. intro, charging two stocks and starting in EX mode while down is held (PC 486)', () => {
    expect([
      animationDuration('intro', 'ziro'),
      ZIRO_LANDING,
      ZIRO_INTRO_EX_TICK,
    ]).toEqual([278, 119, 187]);
    for (const crouch of [false, true]) {
      const match = new Match('cpu', true, 0, ['ziro', 'zoma']);
      const ziro = match.fighters[0];
      const heights: number[] = [];
      while (ziro.action === 'intro') {
        match.step({ crouch });
        heights.push(ziro.y);
      }
      // 1599 source pixels up after eight ticks, back down on the 119th.
      expect(heights[7]).toBeCloseTo(-1599.12 * 1.5, 0);
      expect([heights[117] < 0, heights[118]]).toEqual([true, 0]);
      expect([exMode(ziro), ziro.stock]).toEqual([crouch, 2]);
    }
    expect([0, 40, 80, 120].map((face) => faceImage(face, 'ziro'))).toEqual([
      2002, 2006, 2000, 2006,
    ]);
  });

  it('gets up from his KO, then bursts and flies into ko DOWN3 (ZIRO_KO)', () => {
    const { match, ziro, steps } = ziroPlayer(90, 'ryuko');
    const ryuko = match.fighters[1];
    ziro.hp = 1;
    steps({}, 2);
    steps({}, 1, K);
    while (ziro.action !== 'koLand') steps({});
    expect(
      [0, 60, 140, 150, 180, 228, 234, 322, 400].map(
        (age) => animationFrame('koLand', age, 'ziro').image,
      ),
    ).toEqual([207, 128, 125, 473, 474, 202, 203, 207, 208]);
    while (ziro.age < ZIRO_KO.burst) steps({});
    // ko DOWN2's op 0x1a stops both players 13 ticks (PC 858); Ryuko, who
    // steps after him, has counted one.
    expect([ziro.hitStop, ryuko.hitStop]).toEqual([13, 12]);
    let top = 0;
    while (ziro.age < ZIRO_KO.launch + ZIRO_KO.flight) {
      expect(match.resultReady).toBe(false);
      steps({});
      top = Math.min(top, ziro.y);
    }
    // 521 source pixels up at the peak, landing on the 88th move.
    expect([Math.round(top / 1.5), ziro.y]).toEqual([-521, 0]);
    while (!match.resultReady) steps({});
    expect(ziro.action).toBe('koLand');
  });

  it('wins after demo act, looping image 142 (PC 766), and draws looping Randon op rp (32, PC 948)', () => {
    expect(
      [0, 83, 88, 93, 2000].map(
        (age) => animationFrame('win', age, 'ziro').image,
      ),
    ).toEqual([115, 119, 120, 142, 142]);
    expect(
      [83, 88, 96, 104, 119, 134, 152, 167].map(
        (age) => animationFrame('draw', age, 'ziro').image,
      ),
    ).toEqual([125, 126, 157, 465, 466, 472, 466, 465]);
    expect(BLACK.ziro.opaque.image).toBe(1009);
    expect(faceImage(-1, 'ziro')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 4, ['ryuko', 'ziro']);
    const ziro = match.fighters[1];
    const entered = new Set<unknown>();
    // TALE K N, NATAKU FIST K, Shoot start, CC START and his CPU's own cpu
    // DASH, CPU DASH j, CPU IORI and cpu telp.
    const wanted = [257, 272, 288, 317, 581, 582, 583, 586];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (ziro.action === 'script') entered.add(ziro.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
