import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { fighterPose, Match } from './match';
import type { Input } from './match';
import type { DummyBehavior } from './dummy';
import { enter, RYUKO, strike } from './testing';

const ZOMA_IMAGES = new Set(CHARACTERS.zoma.images.map(({ index }) => index));

// Ryuko against Zoma in free practice, `gap` apart.
function versus(gap = 120, partner: DummyBehavior = 'stand', seed = 0) {
  const match = new Match('practice', false, seed, ['ryuko', 'zoma']);
  match.practice.partner = partner;
  const [ryuko, zoma] = match.fighters;
  zoma.x = ryuko.x + gap;
  return { match, ryuko, zoma };
}
// Zoma as player 1, driven by input, `gap` from a standing Ryuko.
function zomaPlayer(gap = 120) {
  const match = new Match('practice', false, 0, ['zoma', 'ryuko']);
  const [zoma, ryuko] = match.fighters;
  ryuko.x = zoma.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input);
  };
  return { match, zoma, ryuko, steps };
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
    expect(paired).toHaveLength(59);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("takes Ryuko's punch with his own weak hit (74): stops, damage and power", () => {
    const { match, ryuko, zoma } = versus();
    strike(match, ryuko, RYUKO.punch);
    // The contact queues the reaction, which his next step enters.
    match.step();
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
      strike(match, ryuko, RYUKO.punch);
      match.step();
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
      strike(match, ryuko, RYUKO.punch);
      match.step();
      expect(zoma.hp).toBe(after);
    }
  });

  it('rolls his jump hit (78, PC 784), which Ryuko’s lacks', () => {
    const branches = new Set<unknown>();
    for (let seed = 0; seed < 20; seed++) {
      const { match, ryuko, zoma } = versus(120, 'stand', seed);
      ryuko.y = -60;
      strike(match, ryuko, RYUKO.airPunch);
      match.step();
      match.step();
      expect(zoma.action).toBe('jumpHit');
      branches.add(zoma.branch);
    }
    expect(branches).toEqual(new Set([null, '78+17']));
  });

  it('falls through KO NORMAL (58) into KO down (60) while Ryuko wins', () => {
    const { match, ryuko, zoma } = versus();
    zoma.hp = 1;
    strike(match, ryuko, RYUKO.punch);
    match.step();
    match.step();
    expect(zoma).toMatchObject({ action: 'down', hp: 0 });
    expect(match.winner).toBe('player');
    for (let t = 0; t < 400 && zoma.action !== 'koLand'; t++) match.step();
    expect([zoma.action, ryuko.action]).toEqual(['koLand', 'win']);
    expect(ZOMA_IMAGES.has(fighterPose(zoma).image)).toBe(true);
  });

  it("is held in his own pose table's poses through Ryuko's throw", () => {
    const { match, ryuko, zoma } = versus(80);
    enter(match, ryuko, RYUKO.grab, 6);
    match.step();
    match.step();
    expect(zoma.action).toBe('superHeld');
    const poses = new Set<number>();
    for (let t = 0; t < 120 && zoma.action === 'superHeld'; t++) {
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

  it("reads his own command table, entering each move's source action", () => {
    expect(CHARACTERS.zoma.levels).toMatchObject({
      11: 255, // JUMP 2
      14: 0, // DASH F
      16: 254, // DASH A F
      178: 21, // P 1
      193: 22, // K J
    });
    const { zoma, steps } = zomaPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(zoma).toMatchObject({ action: 'script', branch: 178, age: 0 });
  });

  it('chains P 1 into P 2 through P1 HIT (179) and its op 0x24 at age 8', () => {
    const { zoma, ryuko, steps } = zomaPlayer();
    steps({}, 2);
    steps({ punch: true });
    // The box (PC 2256) strikes at age 7; slots 2 and 3 queue 179 (PCs
    // 2252–2253), entered with Ryuko's reaction at their next steps.
    steps({}, 6);
    expect(ryuko.hp).toBe(510);
    steps({});
    expect(ryuko.hp).toBe(500);
    steps({});
    expect(ryuko).toMatchObject({ action: 'hit', hp: 500 });
    expect(zoma).toMatchObject({ branch: 179, age: 0, hitStop: 10 });
    // A fresh P during the stop counts toward PC 2269's 20-tick window.
    steps({}, 4);
    steps({ punch: true });
    steps({}, 12);
    expect(zoma).toMatchObject({ branch: 179, age: 7 });
    steps({});
    expect(zoma).toMatchObject({ branch: 180, age: 0 });
  });

  it('ends a whiffed punch in neutral after its 27 ticks', () => {
    const { zoma, steps } = zomaPlayer(400);
    steps({}, 2);
    steps({ punch: true });
    steps({}, 26);
    expect(zoma).toMatchObject({ action: 'script', branch: 178 });
    steps({});
    expect(zoma.action).toBe('idle');
  });

  it('sweeps from the crouch with K SIT (189)', () => {
    const { zoma, ryuko, steps } = zomaPlayer();
    steps({}, 2);
    steps({ crouch: true }, 5);
    steps({ crouch: true, kick: true });
    expect(zoma.branch).toBe(189);
    for (let t = 0; t < 30 && ryuko.action !== 'sweep'; t++)
      steps({ crouch: true });
    // Response 7 (PC 2552) → Ryuko's 79, for the box's 30 (PC 2553).
    expect(ryuko).toMatchObject({ action: 'sweep', hp: 480 });
  });

  it('jumps again with JUMP 2 (11), whose variable 1 turns P into P J 2 (192)', () => {
    const { zoma, steps } = zomaPlayer(400);
    steps({}, 2);
    steps({ jump: true });
    steps({}, 20);
    steps({ jump: true });
    expect(zoma).toMatchObject({ action: 'script', branch: 11 });
    steps({}, 3);
    expect(zoma.variables[1]).toBe(10);
    steps({ punch: true });
    // JUMP 2 (entry 12) still matches its own neutral-then-up and comes
    // first: its level 255 is refused (11's window passes 1–254, PC 131),
    // holding P back until that neutral tick leaves its 10.
    steps({}, 4);
    expect(zoma).toMatchObject({ branch: 11, age: 8 });
    steps({});
    // PC 2561 jumps to 192 while variable 1 is 10.
    expect(zoma).toMatchObject({ branch: 192, age: 0 });
    for (let t = 0; t < 120 && zoma.y < 0; t++) steps({});
    // The next step lands it: the handler (slot 1 → 10) enters J Lend.
    steps({});
    expect(zoma.action).toBe('land');
  });

  it('runs with DASH F while forward is held, and stops when released', () => {
    const { zoma, steps } = zomaPlayer(600);
    steps({}, 2);
    steps({ dash: true, right: true });
    expect(zoma.branch).toBe(14);
    steps({ right: true }, 10);
    // PC 176's op 0x16 loops the run while forward is held.
    expect(zoma.branch).toBe('14+12');
    steps({ right: true }, 5);
    expect(zoma.branch).toBe('14+7');
    const x = zoma.x;
    // Released, the checks fall through: raw 200 (PC 183), then the stop.
    steps({}, 29);
    expect(zoma.branch).toBe('14+7');
    expect(zoma.x).toBeGreaterThan(x);
    steps({});
    expect(zoma.action).toBe('idle');
  });

  it('leaps from the run into HIGH JUMP (6) on up (PC 175)', () => {
    const { zoma, steps } = zomaPlayer(600);
    steps({}, 2);
    steps({ dash: true, right: true });
    steps({ right: true }, 9);
    steps({ right: true, jump: true });
    expect(zoma).toMatchObject({ branch: 6, age: 0 });
    steps({}, 10);
    expect(zoma.y).toBeLessThan(0);
  });

  it('chases a Hit Up (197 → 198) into JUMP CANCEL (199) on up', () => {
    const { zoma, ryuko, steps } = zomaPlayer(90);
    steps({}, 2);
    steps({ hitUp: true });
    for (let t = 0; t < 30 && zoma.branch === 197; t++) steps({});
    // Response 19 → Ryuko's 81; slot 2 enters 198 (PC 2726).
    expect(ryuko).toMatchObject({ action: 'launchUp', hp: 495 });
    expect(zoma.branch).toBe(198);
    for (let t = 0; t < 40 && zoma.branch === 198; t++) steps({ jump: true });
    expect(zoma.branch).toBe(199);
    steps({}, 10);
    expect(zoma.y).toBeLessThan(0);
  });

  it('chucks: grabs (response 30), slams, then tosses with response 41', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer(70);
    steps({}, 2);
    steps({ throw: true });
    steps({}, 8);
    // The kind 0xa8 box at age 7 (PC 2770) catches; slot 2 enters 201 at
    // the next step.
    expect(ryuko.action).toBe('superHeld');
    expect(zoma.branch).toBe(201);
    steps({}, 43);
    // PC 2806 applies response 41: Ryuko's 132, launched at its age 6.
    expect(ryuko.action).toBe('chuckToss');
    for (let t = 0; t < 40 && !match.effects.some((e) => e.clip === 202); t++)
      steps({});
    // PC 2815 throws TOMAHU (202), which catches the toss with response
    // 32 (Ryuko's 85) for 20.
    expect(match.effects.some((e) => e.clip === 202)).toBe(true);
    for (let t = 0; t < 100 && ryuko.action !== 'twist'; t++) steps({});
    expect(ryuko).toMatchObject({ action: 'twist', hp: 490 });
  });

  it('counters a guard with Hit Up for a stock: COUNTER HIT (174)', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer();
    zoma.stock = 1;
    steps({ guard: true });
    strike(match, ryuko, RYUKO.punch);
    steps({ guard: true }, 2);
    expect(zoma).toMatchObject({ action: 'block', hitStop: 10 });
    steps({ guard: true }, 15);
    // 149's op 0x24 at age 8 reads Hit Up over the last 10 ticks.
    steps({ guard: true, hitUp: true });
    steps({ guard: true }, 2);
    expect(zoma).toMatchObject({ action: 'script', branch: 174 });
    // Its op 0x15 spends the stock (PC 2218).
    expect(zoma.stock).toBe(0);
  });

  it('throws FIRE on ↓→ P: its fireball (205) hits for 25 through response 50', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer(400);
    steps({}, 2);
    steps({ crouch: true }, 2);
    steps({ right: true }, 2);
    steps({ punch: true });
    expect(zoma.branch).toBe(204);
    steps({}, 20);
    // PC 2858 spawns it into slot 1 at age 20.
    expect(match.effects.find((e) => e.slot === 1)?.clip).toBe(205);
    for (let t = 0; t < 60 && ryuko.hp === 510; t++) steps({});
    steps({});
    // Response 50 → Ryuko's FB (110), which enters 75.
    expect(ryuko).toMatchObject({ action: 'hitHeavy', hp: 485 });
  });

  it('punches instead of throwing FIRE while its fireball flies (0x412ac0)', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer(300);
    zoma.x = ryuko.x = 900;
    ryuko.x += 300;
    steps({ axe: true });
    steps({}, 15);
    // Out of the fireball's way, so it flies on.
    ryuko.x = zoma.x - 300;
    steps({}, 50);
    expect(match.effects.some((e) => e.slot === 1 && e.clip === 205)).toBe(
      true,
    );
    steps({ axe: true });
    // PC 2846 finds slot 1 alive and jumps to P 1 (178).
    expect(zoma).toMatchObject({ action: 'script', branch: 178 });
  });

  it('rises with DRAGON on →↓↘ P, launching with its last strike', () => {
    const { zoma, ryuko, steps } = zomaPlayer(90);
    steps({}, 2);
    // Each direction step follows an any-direction step (0x3000), so each
    // takes two ticks.
    steps({ right: true }, 2);
    steps({ crouch: true }, 2);
    steps({ crouch: true, right: true }, 2);
    steps({ punch: true });
    expect(zoma.branch).toBe(208);
    const reactions = new Set<string>();
    for (let t = 0; t < 250 && zoma.action !== 'idle'; t++) {
      steps({});
      if (ryuko.action !== 'idle') reactions.add(ryuko.action);
    }
    // Response 42 → Ryuko's 96; the last box's 18 → 80.
    expect([...reactions].slice(0, 3)).toEqual([
      'uppercut',
      'launchAway',
      'knockdown',
    ]);
    expect(ryuko.hp).toBe(474);
    // Landing (slot 1, PC 2906) enters DRAGON LEND (210), then neutral.
    expect(zoma.action).toBe('idle');
  });

  it('vanishes and reappears with dragon 2 P, 225 pixels ahead', () => {
    const { zoma, ryuko, steps } = zomaPlayer(400);
    steps({}, 2);
    const x = zoma.x;
    steps({ iori: true });
    expect(zoma.branch).toBe(213);
    // Raw 15000 for one tick (PC 3021), then 216's rising strike.
    steps({}, 22);
    expect(zoma.x - x).toBeCloseTo(15000 * (655 / 65536) * 1.5, 6);
    for (let t = 0; t < 30 && ryuko.hp === 510; t++) steps({});
    steps({});
    expect(ryuko).toMatchObject({ action: 'launchAway', hp: 475 });
  });

  it('fires g beam (219): its beam (220) strikes three times', () => {
    const { ryuko, steps } = zomaPlayer(250);
    steps({}, 2);
    steps({ ex: true });
    steps({}, 100);
    // Response 51 → FBB (111) → 83 per strike of 20.
    expect(ryuko.hp).toBe(450);
  });

  it('drops BOMB on three marks, and reloads after five', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer(300);
    steps({}, 2);
    steps({ dst: true });
    steps({}, 21);
    // PC 3154 adds 10 to player variable 0 per bomb.
    expect(zoma.variables[0]).toBe(10);
    expect(match.effects.filter((e) => e.clip === 223)).toHaveLength(1);
    for (let t = 0; t < 400 && ryuko.hp === 510; t++) steps({});
    steps({});
    // A bomb (227) falls on the second mark: response 50, 20. Its stop
    // holds Zoma too (0x4136ae).
    expect(ryuko).toMatchObject({ action: 'hitHeavy', hp: 490 });
    expect(zoma.hitStop).toBe(15);
    while (zoma.hitStop) steps({});
    for (let k = 0; k < 4; k++) {
      steps({ dst: true });
      steps({}, 95);
    }
    expect(zoma.variables[0]).toBe(50);
    steps({ dst: true });
    // PC 3146 jumps to BOMB RELORD (229) at 50, which clears it.
    expect(zoma.branch).toBe(229);
    steps({}, 60);
    expect(zoma.variables[0]).toBe(0);
  });

  it('shouts NO SUPER (233) for a super without stock (op 0x10)', () => {
    const { zoma, steps } = zomaPlayer(200);
    steps({}, 2);
    steps({ getterBeam: true });
    expect(zoma).toMatchObject({ action: 'script', branch: 233 });
  });

  it('dashes through with SPAKE on ↓→↓→ P for a stock, under his own panel', () => {
    const { match, zoma, ryuko, steps } = zomaPlayer(300);
    zoma.stock = 1;
    steps({}, 2);
    for (let k = 0; k < 2; k++)
      for (const input of [{ crouch: true }, { right: true }]) steps(input, 2);
    steps({ punch: true });
    // Op 0x10 at PC (239) takes the stock; variable 14 darkens the stage.
    expect(zoma).toMatchObject({
      branch: 239,
      stock: 0,
      variables: expect.objectContaining({ 14: 100 }),
    });
    expect(match.freeze).toBeGreaterThan(0);
    steps({});
    expect(zoma.black.shown).toBe('opaque');
    expect(BLACK.zoma.opaque.image).toBe(1009);
    for (let t = 0; t < 120 && ryuko.hp === 510; t++) steps({});
    steps({});
    // The dash's object (242) strikes with response 43 for 84.
    expect(ryuko).toMatchObject({ action: 'fly', hp: 426 });
  });

  it('grabs with DST, then juggles and finishes the tossed victim', () => {
    const { zoma, ryuko, steps } = zomaPlayer(90);
    zoma.stock = 1;
    steps({}, 2);
    steps({ musashi: true });
    expect(zoma.branch).toBe(251);
    for (let t = 0; t < 80 && ryuko.action !== 'superHeld'; t++) steps({});
    // The kind 8 box (PC 3500) catches with response 30; slot 2 enters 253.
    expect(zoma.branch).toBe(253);
    // Op 0x07 places the victim from Zoma past the floor too: 15 below his
    // feet at age 20, where flag 0x10 keeps it.
    while (zoma.age < 20) steps({});
    expect(ryuko.y).toBeCloseTo(15 * 1.5);
    const seen = new Set<string>();
    for (let t = 0; t < 500 && ryuko.action !== 'getUp'; t++) {
      steps({});
      seen.add(ryuko.action);
    }
    // Response 31 tosses; ops 0x14 re-place the struck victim (+0xdef9)
    // through 21s and 60, whose stun the last box's 120, queued that tick,
    // replaces at the next step, sending it flying.
    expect([...seen]).toEqual([
      'superHeld',
      'dstToss',
      'airHitRapid',
      'airStun',
      'fly',
      'knockdown',
    ]);
    expect(ryuko.hp).toBe(390);
  });

  it('cancels DRAGON into DST for two stocks (variable 6, 236 + 9)', () => {
    const { zoma, ryuko, steps } = zomaPlayer(90);
    zoma.stock = 3;
    steps({}, 2);
    steps({ drill: true });
    for (let t = 0; t < 20 && ryuko.action !== 'uppercut'; t++) steps({});
    // DRAGON's window (PC 2896) passes levels 40–41 once it has connected,
    // read once the contact stop ends.
    steps({ musashi: true });
    expect(zoma).toMatchObject({ branch: 208, stock: 3 });
    while (zoma.hitStop > 0) steps({});
    steps({});
    expect(zoma).toMatchObject({ branch: '236+9', stock: 1 });
  });

  it('needs three stocks for EN300, whose sun ball stuns', () => {
    const { zoma, ryuko, steps } = zomaPlayer(300);
    zoma.stock = 2;
    steps({}, 2);
    steps({ changeAttack: true });
    expect(zoma.branch).toBe(233);
    // The refused command stays in its 50-tick window, so it shouts again
    // once the first NO SUPER ends.
    steps({}, 110);
    expect(zoma.action).toBe('idle');
    zoma.stock = 3;
    steps({ changeAttack: true });
    expect(zoma).toMatchObject({ branch: 265, stock: 0 });
    const seen = new Set<string>();
    for (let t = 0; t < 700 && zoma.action === 'script'; t++) {
      steps({});
      seen.add(ryuko.action);
    }
    // Its burst (273) alternates responses 51 and 59 (Ryuko's 108).
    expect(seen).toContain('hitRapid');
    expect(seen).toContain('stun');
  });

  it('turns Shin Spark into BOMB at 147 life or more (op 0x11)', () => {
    const { zoma, ryuko, steps } = zomaPlayer(200);
    zoma.stock = 3;
    steps({}, 2);
    steps({ blackRush: true });
    expect(zoma.branch).toBe(222);
    steps({}, 120);
    zoma.hp = 146;
    zoma.stock = 3;
    steps({ blackRush: true });
    expect(zoma).toMatchObject({ branch: 279, stock: 0 });
    for (let t = 0; t < 100 && ryuko.hp === 510; t++) steps({});
    steps({});
    // Its dash strikes with response 32 (Ryuko's 85).
    expect(ryuko.action).toBe('twist');
  });

  it("stands through his Vs. intro (31 + 2) where Ryuko's walk ends", () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'zoma']);
    const [ryuko, zoma] = match.fighters;
    expect(animationDuration('intro', 'zoma')).toBe(200);
    expect(
      [0, 40, 48, 63, 73, 113, 123, 131, 199].map(
        (age) => animationFrame('intro', age, 'zoma').image,
      ),
    ).toEqual([280, 281, 282, 283, 287, 284, 285, 286, 286]);
    expect(zoma).toMatchObject({ action: 'intro', x: 1140 });
    // Start N has no op 0x16, so down held through it starts no EX mode.
    for (let t = 0; t < 199; t++) match.step({}, { crouch: true });
    expect([ryuko.action, zoma.action]).toEqual(['idle', 'intro']);
    expect([ryuko.x, zoma.x]).toEqual([780, 1140]);
    match.step({}, { crouch: true });
    expect(zoma).toMatchObject({ action: 'idle', x: 1140, variables: {} });
  });

  it("enters a command the CPU writes, with its step's direction (0x411644)", () => {
    const { match, zoma } = versus(200);
    match.step({}, { command: 10 });
    expect(zoma).toMatchObject({ action: 'script', branch: 204 });
    const crouching = versus(200);
    crouching.match.step({}, { command: 19, crouch: true });
    // Down in the written word picks P's crouching action, P SIT (188).
    expect(crouching.zoma.branch).toBe(188);
  });

  it('leaps from the CPU dash jump (343) into HIGH JUMP (6), its last jump (PC 4696)', () => {
    const { match, zoma } = versus(500);
    match.step({}, { command: 24 });
    expect(zoma).toMatchObject({ action: 'script', branch: 343 });
    while (zoma.branch === 343) match.step({}, {});
    expect(zoma).toMatchObject({ branch: 6, age: 0, y: 0 });
    for (let t = 0; t < 20; t++) match.step({}, {});
    expect(zoma.y).toBeLessThan(0);
  });

  it('plays his own CPU table in Vs. CPU, keyless commands included', () => {
    const match = new Match('cpu', false, 7, ['ryuko', 'zoma']);
    const zoma = match.fighters[1];
    const entered = new Set<unknown>();
    // FIRE, BOMB and DST have keys; dragon 2 k (214, entry 8) has none.
    const wanted = [204, 222, 251, 214];
    for (let t = 0; t < 2000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (zoma.action === 'script') entered.add(zoma.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
