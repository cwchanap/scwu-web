import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { ATTACKS, fighterPose, Match } from './match';
import type { Fighter } from './match';
import type { DummyBehavior } from './dummy';

const ZOMA_IMAGES = new Set(CHARACTERS.zoma.images.map(({ index }) => index));

// Ryuko against Zoma in free practice, `gap` apart.
function versus(gap = 120, partner: DummyBehavior = 'stand', seed = 0) {
  const match = new Match('practice', false, seed, ['ryuko', 'zoma']);
  match.practice.partner = partner;
  const [ryuko, zoma] = match.fighters;
  zoma.x = ryuko.x + gap;
  return { match, ryuko, zoma };
}
// The step before the attack's first strike.
function strike(f: Fighter, action: keyof typeof ATTACKS) {
  f.action = action;
  f.age = ATTACKS[action].strikes[0].from - 1;
}

describe('Zoma (02 ZOMA.PLAYER)', () => {
  it('takes his life from his parameter block: 490, desperate at 147', () => {
    expect([lifeOf('zoma'), desperationOf('zoma')]).toEqual([490, 147]);
    const { zoma } = versus();
    expect(zoma).toMatchObject({ who: 'zoma', hp: 490, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.zoma.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('zoma')[id]]] : [],
    );
    expect(paired).toHaveLength(51);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("takes Ryuko's punch with his own weak hit (74): stops, damage and power", () => {
    const { match, ryuko, zoma } = versus();
    strike(ryuko, 'punch');
    match.step();
    // PC 697 stops both for 10 ticks; PC 700 adds 3 power to him, 2 to Ryuko.
    expect(zoma).toMatchObject({ action: 'hit', hp: 480, hitStop: 10 });
    expect([zoma.power, ryuko.power]).toEqual([3, 2]);
    // His display at PC 703: image 119.
    expect(fighterPose(zoma).image).toBe(119);
  });

  it.each([
    ['guard', 'block', 1],
    // Action 151's second op 0x15 (PC 1929) adds 2 more than Ryuko's.
    ['crouchGuard', 'crouchBlock', 3],
  ] as const)(
    'holds a %s and blocks in his own poses',
    (partner, block, power) => {
      const { match, ryuko, zoma } = versus(120, partner);
      match.step();
      strike(ryuko, 'punch');
      match.step();
      expect(zoma).toMatchObject({ action: block, hp: 490, power });
      expect(ZOMA_IMAGES.has(fighterPose(zoma).image)).toBe(true);
    },
  );

  it('shrinks losses to 60% at 147 of 490 life or less (0x40e7c0)', () => {
    for (const [life, after] of [
      [148, 138],
      [147, 141],
    ]) {
      const { match, ryuko, zoma } = versus();
      zoma.hp = life;
      strike(ryuko, 'punch');
      match.step();
      expect(zoma.hp).toBe(after);
    }
  });

  it('rolls his jump hit (78, PC 784), which Ryuko’s lacks', () => {
    const branches = new Set<unknown>();
    for (let seed = 0; seed < 20; seed++) {
      const { match, ryuko, zoma } = versus(120, 'stand', seed);
      ryuko.y = -60;
      strike(ryuko, 'airPunch');
      match.step();
      expect(zoma.action).toBe('jumpHit');
      branches.add(zoma.branch);
    }
    expect(branches).toEqual(new Set([null, '78+17']));
  });

  it('falls through KO NORMAL (58) into KO down (60) while Ryuko wins', () => {
    const { match, ryuko, zoma } = versus();
    zoma.hp = 1;
    strike(ryuko, 'punch');
    match.step();
    expect(zoma).toMatchObject({ action: 'down', hp: 0 });
    expect(match.winner).toBe('player');
    for (let t = 0; t < 400 && zoma.action !== 'koLand'; t++) match.step();
    expect([zoma.action, ryuko.action]).toEqual(['koLand', 'win']);
    expect(ZOMA_IMAGES.has(fighterPose(zoma).image)).toBe(true);
  });

  it("is held in his own pose table's poses through Ryuko's throw", () => {
    const { match, ryuko, zoma } = versus(80);
    ryuko.action = 'grab';
    ryuko.age = 6;
    match.step();
    expect(zoma.action).toBe('dstHeld');
    const poses = new Set<number>();
    for (let t = 0; t < 120 && zoma.action === 'dstHeld'; t++) {
      match.step();
      const pose = fighterPose(zoma);
      if (pose.held) poses.add(pose.image);
    }
    // Held pose 1 of his table (+0x70ca): image 119.
    expect(poses).toEqual(new Set([CHARACTERS.zoma.held[1].image]));
    expect(zoma.action).toBe('dstToss');
  });

  it('wins a match against Ryuko with his own result poses', () => {
    const match = new Match('practice', false, 0, ['zoma', 'ryuko']);
    const [zoma, ryuko] = match.fighters;
    ryuko.hp = 0;
    ryuko.action = 'koLand';
    match.winner = 'player';
    for (let t = 0; t < 10; t++) match.step();
    expect(zoma.action).toBe('win');
    expect(ZOMA_IMAGES.has(fighterPose(zoma).image)).toBe(true);
  });
});
