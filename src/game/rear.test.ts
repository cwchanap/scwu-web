import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

// REAR as player 1, `gap` from a standing opponent as player 2.
function rearPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['rear', opponent]);
  const [rear, other] = match.fighters;
  other.x = rear.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, rear, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` run until he is back on his feet: REAR's actions, the
// objects he spawned and the damage each took.
function play(at: (t: number) => Input, { gap = 90, stock = 3, hp = 0 } = {}) {
  const { match, rear, other, steps } = rearPlayer(gap);
  rear.stock = stock;
  if (hp) rear.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(rear)) mine.push(now(rear));
    for (const e of match.effects) objects.add(e.clip);
  }
  return { rear, mine, objects, damage: lifeOf('ryuko') - other.hp };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('REAR (24 REAR.PLAYER)', () => {
  it('takes 470 life from his parameter block, desperate at 141', () => {
    expect([lifeOf('rear'), desperationOf('rear')]).toEqual([470, 141]);
    const { rear } = rearPlayer();
    expect(rear).toMatchObject({ who: 'rear', hp: 470, action: 'idle' });
  });

  it("pairs every one of his victim actions with Ryuko's", () => {
    const twins = CHARACTERS.rear.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('rear')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.rear.aliases).toEqual({});
    // One after Ryuko's KOs, five after his first hits and BEAM Stand, six
    // from BEAM air, five from Shock, four from Chuck Yo and five from the
    // guards.
    expect(
      [60, 73, 83, 84, 88, 90, 137, 140, 149].map((r) => twins[r]),
    ).toEqual([61, 78, 88, 90, 94, 95, 142, 144, 154]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.rear.levels).toMatchObject({
      183: 21, // P1
      199: 22, // KJ
      212: 31, // sama start
      214: 31, // air sama start
      221: 31, // FIRE BALL start
      226: 31, // Churaka start
      229: 31, // Viper start
      238: 41, // GYSA start
      250: 41, // VIPER FINAL start
      265: 42, // EN300 start
      282: 42, // Evil EN3
    });
    const { rear, steps } = rearPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(rear).toMatchObject({ action: 'script', branch: 183, age: 0 });
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
    ).toMatchObject({ mine: [183, 184, 186, 188, 'idle'], damage: 56 });
    // K3 spawns *K3 eff (192) along the floor.
    const k3 = play(
      presses({ 0: { punch: true }, 14: { kick: true }, 45: { kick: true } }),
    );
    expect(k3).toMatchObject({
      mine: [183, 184, 191, 193, '193+28', 'idle'],
      damage: 50,
    });
    expect(k3.objects).toContain(192);
    expect(
      play(
        presses({ 0: { kick: true }, 18: { kick: true }, 50: { punch: true } }),
      ),
    ).toMatchObject({ mine: [189, 190, 191, 188, 'idle'], damage: 53 });
    expect(byKey({ throw: true }, { gap: 60 })).toMatchObject({
      mine: [206, 208, 'idle'],
      damage: 25,
    });
  });

  it('plays his specials: SAMA (also in the air), Fire ball, DOWN ATTACK and VIPER WHIP', () => {
    for (const [key, gap, mine, damage] of [
      [{ drill: true }, 90, [212, 213, 'idle'], 38],
      [{ axe: true }, 90, [221, 'idle'], 20],
      [{ dst: true }, 90, [229, 'idle'], 25],
      // Churaka start leaps at raw 650/−1300 (PC 3240) over a near
      // opponent, striking as it lands (PCs 3260–3261).
      [{ iori: true }, 350, [226, '226+25', 'idle'], 28],
      [{ iori: true }, 90, [226, '226+25', 'turn', 'idle'], 0],
    ] as const) {
      const move = byKey(key, { gap });
      expect(move).toMatchObject({ mine, damage });
      expect(move.rear.stock).toBe(3);
    }
    expect(byKey({ axe: true }).objects).toContain(218);
    expect(
      play(presses({ 0: { jump: true }, 10: { drill: true } })),
    ).toMatchObject({
      mine: ['takeoff', 'jump', 214, 213, 'idle'],
      damage: 36,
    });
  });

  it('spends a stock on GYSA and VIPER FINAL and three on en300, or enters No super (232)', () => {
    for (const [key, stock, gap, mine, damage, left] of [
      ['getterBeam', 3, 90, [238, 'idle'], 84, 2],
      // Viper hit flings the victim in its own Chuck OGI BALL (response 62,
      // PC 3735) into the wall, where *viper fire (253) strikes 50 more.
      ['musashi', 3, 90, [250, 255, 'idle'], 101, 2],
      ['changeAttack', 3, 200, [265, 266, '273+30', 'idle'], 220, 0],
      ['getterBeam', 0, 90, [232, 'idle'], 0, 0],
      ['changeAttack', 2, 200, [232, 'idle'], 0, 2],
    ] as const) {
      const move = byKey({ [key]: true }, { stock, gap });
      expect([move.mine, move.damage, move.rear.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    // Below 141 life GYSA start enters Evil GYSA (244, op 0x11, PC 3420).
    const evil = byKey({ getterBeam: true }, { hp: 120 });
    expect([evil.mine, evil.damage, evil.rear.stock]).toEqual([
      [244, 'idle'],
      100,
      2,
    ]);
  });

  it('plays evil en3 below 141 life (op 0x11, PC 4149): its clock sets variable 1 to 100 (PC 4123) for EVIL EN3 start, which spends 200 more power', () => {
    const full = byKey({ blackRush: true });
    expect([full.mine, full.rear.stock]).toEqual([[232, 'idle'], 3]);
    const evil = byKey({ blackRush: true }, { hp: 120 });
    expect([evil.mine, evil.damage, evil.rear.stock]).toEqual([
      [282, 291, '295+24', 'idle'],
      240,
      0,
    ]);
    expect(evil.objects).toContain(280);
    expect(evil.objects).toContain(292);
  });

  it('cancels Fire ball into GYSA or VIPER FINAL through SC SUPER (235), for two stocks, as its variable 6 at 100 allows (PCs 3178, 3416, 3627)', () => {
    const cancel = (key: Input) => play(presses({ 0: { axe: true }, 15: key }));
    const gysa = cancel({ getterBeam: true });
    expect([gysa.mine, gysa.damage, gysa.rear.stock]).toEqual([
      [221, 235, 'idle'],
      104,
      1,
    ]);
    const viper = cancel({ musashi: true });
    expect([viper.mine, viper.damage, viper.rear.stock]).toEqual([
      [221, '235+6', 255, 'idle'],
      121,
      1,
    ]);
  });

  it('rises unseen and glides in through his Vs. intro, landing into Round BR + 9, charged to two stocks', () => {
    const { path, ticks, f, match, heights } = brIntro('rear');
    expect([path, ticks]).toEqual([[31, 33, '36+9'], 241]);
    // After 開始時's (31) blank display, 140 source pixels up; KGT 13's
    // global 14 fails 開始時 BR's jump to + 10 (PC 336), so he stops there
    // unseen for 43 ticks (PCs 339–340). Then 54 down gliding; the fall
    // passes the floor on its 17th move, and the landing (0x41187f) enters
    // Round BR + 9 (slot 1, PC 374) a tick later.
    expect(heights[7] / 1.5).toBeCloseTo(-139.923, 3);
    expect(heights[50]).toBe(heights[7]);
    expect(heights[77] / 1.5).toBeCloseTo(-85.953, 3);
    expect([heights[94] > 0, heights[95]]).toEqual([true, 0]);
    // The glide carries him 539.85 on.
    expect(f.x).toBeCloseTo(390 * 1.5 + 539.85, 2);
    // OP super Charge (41) runs on past it.
    for (let t = 0; t < 30; t++) match.step({});
    expect(f.stock).toBe(2);
  });

  it('wins and draws after two calls of STAND DEMO, looping image 384 (PC 596) or holding 386, and shows face 2001', () => {
    expect(
      [0, 129, 130, 145, 2000].map(
        (age) => animationFrame('win', age, 'rear').image,
      ),
    ).toEqual([115, 116, 383, 384, 384]);
    expect(
      [129, 130, 135, 2000].map(
        (age) => animationFrame('draw', age, 'rear').image,
      ),
    ).toEqual([116, 126, 386, 386]);
    expect(BLACK.rear.opaque.image).toBe(1009);
    expect(faceImage(-1, 'rear')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 75, ['ryuko', 'rear']);
    const rear = match.fighters[1];
    const entered = new Set<unknown>();
    // Viper start, FIRE BALL start, sama start, Churaka start and EN300
    // start.
    const wanted = [229, 221, 212, 226, 265];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (rear.action === 'script') entered.add(rear.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
