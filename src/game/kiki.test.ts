import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import type { Action } from './animations';
import { fighterPose, Match } from './match';
import type { Input } from './match';
import { enter, objects, pose, RYUKO, strike } from './testing';

const KIKI_IMAGES = new Set(CHARACTERS.kiki.images.map(({ index }) => index));
const VELOCITY = (655 / 65536) * 1.5;

// Ryuko against Kiki in free practice, `gap` apart.
function versus(gap = 120, seed = 0) {
  const match = new Match('practice', false, seed, ['ryuko', 'kiki']);
  const [ryuko, kiki] = match.fighters;
  kiki.x = ryuko.x + gap;
  return { match, ryuko, kiki };
}
// Kiki as player 1, driven by input, `gap` from a standing Ryuko.
function kikiPlayer(gap = 120) {
  const match = new Match('practice', false, 0, ['kiki', 'ryuko']);
  const [kiki, ryuko] = match.fighters;
  ryuko.x = kiki.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input);
  };
  return { match, kiki, ryuko, steps };
}
// The reactions Ryuko takes while Kiki plays source action `index`.
function reactions(index: number, gap = 120, ticks = 1500) {
  const match = new Match('practice', false, 0, ['kiki', 'ryuko']);
  const [kiki, ryuko] = match.fighters;
  ryuko.x = kiki.x + gap;
  kiki.stock = 3;
  enter(match, kiki, index);
  const seen = new Set<Action>();
  for (let t = 0; t < ticks; t++) {
    match.step();
    seen.add(ryuko.action);
  }
  return seen;
}

describe('Kiki (03 KIKI.PLAYER)', () => {
  it('takes her life from her parameter block: 490, desperate at 147', () => {
    expect([lifeOf('kiki'), desperationOf('kiki')]).toEqual([490, 147]);
    const { kiki } = versus();
    expect(kiki).toMatchObject({ who: 'kiki', hp: 490, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.kiki.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('kiki')[id]]] : [],
    );
    expect(paired).toHaveLength(63);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("takes Ryuko's punch with her own weak hit (74): stops, damage and power", () => {
    const { match, ryuko, kiki } = versus();
    strike(match, ryuko, RYUKO.punch);
    match.step();
    match.step();
    expect(kiki).toMatchObject({ action: 'hit', hp: 480, hitStop: 10 });
    expect([kiki.power, ryuko.power]).toEqual([3, 2]);
    // Her display at PC 691: image 127; PC 688 adds the power.
    expect(fighterPose(kiki).image).toBe(127);
  });

  it('flies out of HISA Down (124) at raw −800 (PC 1522), not −500', () => {
    for (const who of ['kiki', 'zoma'] as const) {
      const match = new Match('practice', false, 0, ['ryuko', who]);
      const victim = match.fighters[1];
      pose(match, victim, 'launchDown', 0);
      while (victim.age < 9) match.step();
      expect(victim.vx / victim.facing / VELOCITY).toBeCloseTo(
        who === 'kiki' ? -800 : -500,
        6,
      );
    }
  });

  it("reads her own command table, entering each move's source action", () => {
    expect(CHARACTERS.kiki.levels).toMatchObject({
      10: 255, // JUMP2
      13: 30, // DASH F
      177: 21, // P 1
      216: 31, // k' start
      247: 41, // ranbu start
    });
    const { kiki, steps } = kikiPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(kiki).toMatchObject({ action: 'script', branch: 177, age: 0 });
  });

  it('chains P 1 into P2 through P1 HIT (178) and its op 0x24 at age 8', () => {
    const { kiki, ryuko, steps } = kikiPlayer();
    steps({}, 2);
    steps({ punch: true });
    // The box strikes at age 8 (PC 2202); slots 2 and 3 queue P1 HIT (PCs
    // 2198–2199),
    // entered with Ryuko's reaction at their next steps.
    steps({}, 9);
    expect(ryuko).toMatchObject({ action: 'hit', hp: 500 });
    expect(kiki).toMatchObject({ branch: 178, age: 0, hitStop: 10 });
    // A fresh P during the stop counts toward the 20-tick window.
    steps({}, 4);
    steps({ punch: true });
    steps({}, 12);
    expect(kiki).toMatchObject({ branch: 178, age: 7 });
    steps({});
    expect(kiki).toMatchObject({ branch: 179, age: 0 });
  });

  it("follows a connecting K' second hit with 2ND rp hit (224) while variable 4 is 10", () => {
    const { match, kiki } = kikiPlayer(100);
    enter(match, kiki, 222);
    while (kiki.branch === 222) match.step();
    expect(kiki.branch).toBe(223);
    // >HIT spawns 2nd OBJ V (225), which sets variable 4 to 10 for its
    // 190-tick display (PCs 3154–3156).
    match.step();
    expect(objects(match, 225)).toHaveLength(1);
    expect(kiki.variables[4]).toBe(10);
    enter(match, kiki, 222);
    expect(kiki.branch).toBe(224);
    for (let t = 0; t < 200; t++) match.step();
    expect(kiki.variables[4]).toBe(0);
    enter(match, kiki, 222);
    expect(kiki.branch).toBe(222);
  });

  it('sends ranbu’s victim up through DRAGON Fireball (response 63), as the uppercut', () => {
    expect(responsesOf('ryuko')[63]).toBe(125);
    expect(reactions(247)).toContain('uppercut');
  });

  it('lifts EN3’s victim straight up (response 82), then hops it in and out with the beam', () => {
    expect([82, 44, 45].map((id) => responsesOf('ryuko')[id])).toEqual([
      126, 99, 100,
    ]);
    const seen = reactions(256);
    for (const action of ['liftUp', 'tatumakiIn', 'tatumakiOut'] as const)
      expect(seen).toContain(action);
    // Its rise is the uppercut's, without the drift (PC 1715).
    const [uppercut, liftUp] = (['uppercut', 'liftUp'] as const).map(
      (action) => {
        const match = new Match('practice', false, 0, ['kiki', 'ryuko']);
        const ryuko = match.fighters[1];
        pose(match, ryuko, action, 0);
        while (ryuko.age < 5) match.step();
        return [ryuko.vx / ryuko.facing / VELOCITY, ryuko.vy];
      },
    );
    expect(uppercut[0]).toBeCloseTo(-200, 6);
    expect(liftUp[0]).toBeCloseTo(0, 6);
    expect(liftUp[1]).toBe(uppercut[1]);
  });

  it('shouts NO SUPER (235) for a super without stock (op 0x10)', () => {
    const { match, kiki } = kikiPlayer();
    enter(match, kiki, 247);
    expect(kiki.branch).toBe(235);
  });

  it('shows her own darkening panel (action 42, image 1009)', () => {
    expect(BLACK.kiki.opaque.image).toBe(1009);
  });

  it("wins with DEMO Stand, then 'win rp' (57) three times", () => {
    expect(
      [0, 125, 145, 160, 175, 235, 239].map(
        (age) => animationFrame('win', age, 'kiki').image,
      ),
    ).toEqual([113, 279, 280, 281, 280, 282, 282]);
    expect(animationDuration('win', 'kiki')).toBe(240);
    const match = new Match('practice', false, 0, ['kiki', 'ryuko']);
    const [kiki, ryuko] = match.fighters;
    ryuko.hp = 0;
    ryuko.action = 'koLand';
    match.winner = 'player';
    for (let t = 0; t < 10; t++) match.step();
    expect(kiki.action).toBe('win');
    expect(KIKI_IMAGES.has(fighterPose(kiki).image)).toBe(true);
  });

  it("stands through her Vs. intro (33 + 2) where Ryuko's walk ends", () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'kiki']);
    const [ryuko, kiki] = match.fighters;
    expect(animationDuration('intro', 'kiki')).toBe(200);
    expect(
      [0, 40, 55, 110, 150, 155, 199].map(
        (age) => animationFrame('intro', age, 'kiki').image,
      ),
    ).toEqual([273, 274, 275, 276, 277, 278, 278]);
    expect(kiki).toMatchObject({ action: 'intro', x: 1140 });
    for (let t = 0; t < 200; t++) match.step({}, { crouch: true });
    expect([ryuko.x, kiki.x]).toEqual([780, 1140]);
    expect(kiki).toMatchObject({ action: 'idle', variables: {} });
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'kiki']);
    const kiki = match.fighters[1];
    const entered = new Set<unknown>();
    // DRAGON O, TATUMAKI in the air, MAGIC FIRE and CPU K' (333), which
    // has no key: her CPU writes every command into her history.
    const wanted = [212, 231, 241, 333];
    for (let t = 0; t < 6000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (kiki.action === 'script') entered.add(kiki.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
