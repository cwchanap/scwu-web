import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationFrame, BLACK } from './animations';
import { commanded, entriesOf } from './commands';
import { faceImage } from './hud';
import { exMode, fighterPose, Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

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

  it("teleports with telepot (raw 10000, PC 3853) until its box meets the opponent's VS CHARGE", () => {
    // Its hit handlers enter tele out (259, PCs 3851–3852, 3876–3877) as the
    // box, 9040 down, meets the body 9900 down (Ryuko's PC 410): TALE K N's
    // trails 80 behind him (PC 3854), so he stands past her; tele K's leads
    // 60 ahead (PC 3879), so he stops before her.
    for (const [gap, mine, behind] of [
      [90, [257, 259, 'turn', 'idle'], 1],
      [300, [258, 259, 'idle'], -1],
    ] as const) {
      expect(byKey({ iori: true }, { gap })).toMatchObject({
        mine,
        damage: 0,
        behind,
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

  it('walks in his EX form while variable 0 is 100 (PCs 38, 54), past where his walks run out (PCs 44, 60)', () => {
    const walk = (ex: boolean, input: Input) => {
      const { ziro, steps } = ziroPlayer(300);
      if (ex) ziro.variables[0] = 100;
      steps({}, 2);
      const shown: number[] = [];
      for (let t = 0; t < 70; t++) {
        steps(input);
        if (shown.at(-1) !== fighterPose(ziro).image)
          shown.push(t, fighterPose(ziro).image);
      }
      return shown;
    };
    expect(walk(false, { right: true })).toEqual([
      0, 122, 12, 123, 24, 124, 36, 121, 48, 122, 60, 123,
    ]);
    expect(walk(true, { right: true })).toEqual([
      0, 484, 15, 485, 30, 486, 45, 487, 60, 484,
    ]);
    expect(walk(true, { left: true })).toEqual([
      0, 487, 17, 486, 34, 485, 51, 484, 68, 487,
    ]);
  });

  it('cancels nataku p, which sets variable 6 (PC 4055), into MISS ALL or RAMBU for two stocks', () => {
    for (const [key, mine, damage] of [
      ['getterBeam', [270, 352, 'idle'], 119],
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

  it('rolls his Vs. intro (PC 428): dropping in from the sky or RANDOM OP1, charged with two stocks, in EX mode while down is held (PCs 486, 343)', () => {
    for (const crouch of [false, true]) {
      // Two thirds of the time 開始時 BR, after 開始時's (36) blank display,
      // fails its jump to + 18 (PC 429) on KGT 13's global 14: it rises
      // unseen at raw −20000 for 8 ticks (PC 430), 1599 source pixels, and
      // stops there 42 ticks (PCs 432–433), 22 more than + 18 would. Round
      // 1 (39) + 6 falls at 2000 under gravity 30 (PC 459); a tick past the
      // floor, the landing (0x41187f) enters 39 + 11 (slot 1, PC 458), whose
      // check (PC 486) enters Change EX (43).
      const drop = brIntro('ziro', 1, () => ({ crouch }));
      expect(drop.heights[8] / 1.5).toBeCloseTo(-1599.12, 1);
      expect(drop.heights[50]).toBe(drop.heights[8]);
      expect([
        drop.heights[140] < 0,
        drop.heights[141] > 0,
        drop.heights[142],
      ]).toEqual([true, true, 0]);
      expect([drop.path, drop.ticks, exMode(drop.f), drop.f.stock]).toEqual([
        [36, 38, '39+11', ...(crouch ? [43] : [])],
        302,
        crouch,
        2,
      ]);
      // A third of the time + 12 holds image 466 for 50 ticks (PC 440), as
      // its global 14 = 0 check fails too (PC 439), and enters RANDOM OP1
      // (31) + 2 (PC 444), which steps back at raw −200 for 8 ticks (PC 341)
      // past its check (PC 343), into Change EX + 3.
      const op1 = brIntro('ziro', 0, () => ({ crouch }));
      expect([op1.path, op1.ticks, exMode(op1.f), op1.f.stock]).toEqual([
        [36, '38+12', ...(crouch ? ['43+3'] : [])],
        252,
        crouch,
        2,
      ]);
      expect(op1.f.x / 1.5).toBeCloseTo(390 - (8 * 200 * 655) / 65536, 6);
    }
    expect([0, 40, 80, 120].map((face) => faceImage(face, 'ziro'))).toEqual([
      2002, 2006, 2000, 2006,
    ]);
  });

  it('rolls his KO voice and Random lose (PCs 828, 834), or bursts and flies into ko DOWN3', () => {
    const runs = [0, 1, 2].map((seed) => {
      const { match, ziro, steps } = ziroPlayer(90, 'ryuko', seed);
      const ryuko = match.fighters[1];
      ziro.hp = 1;
      steps({}, 2);
      steps({}, 1, K);
      while (ziro.action !== 'koLand') steps({});
      // Each sound but ko down 2 fly's spin (62), the tick of each branch,
      // both players' stops as ko DOWN2 cues 44, and the peak.
      const [cued, path, stops] = [[], [], []] as unknown[][];
      let top = 0;
      for (let t = 0; !match.resultReady; t++) {
        steps({});
        for (const { owner, index } of match.sounds)
          if (owner === 0 && index !== 62) cued.push([t, index]);
        if (path.at(-1) !== ziro.branch) path.push(t, ziro.branch);
        if (match.sounds.some((s) => s.index === 44))
          stops.push(ziro.hitStop, ryuko.hitStop);
        top = Math.min(top, ziro.y);
      }
      return {
        cued,
        path,
        stops,
        top: Math.round(top / 1.5),
        image: fighterPose(ziro).image,
      };
    });
    // KO down lies 60 ticks, voicing 12 or 29, and gets up flashing red
    // (473–475); ko DOWN2's op 0x1a stops both 13 ticks (PC 858), Ryuko, who
    // steps after him, having counted one. He lands 521 source pixels down
    // into ko DOWN3 (60) and lies; Random lose cues 42 three times and 13 as
    // it stands in 477.
    const burst = (voice: number, rolled: string) => ({
      cued: [
        [59, voice],
        [179, 42],
        [227, 44],
        [244, 19],
        [334, 60],
      ],
      path: [0, 70, 59, rolled, 334, 73],
      stops: [13, 12],
      top: -521,
      image: 208,
    });
    expect(runs).toEqual([
      burst(12, '70+15'),
      {
        cued: [
          [59, 29],
          [159, 42],
          [269, 42],
          [294, 42],
          [407, 13],
        ],
        path: [0, 70, 59, '70+16', 149, 75],
        stops: [],
        top: 0,
        image: 477,
      },
      burst(29, '70+16'),
    ]);
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
    const match = new Match('cpu', true, 0, ['ryuko', 'ziro']);
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
