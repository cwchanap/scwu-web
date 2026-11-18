import { describe, expect, it } from 'vitest';
import { DEFAULT_CHEATS } from './cheats';
import { DRESS_TICK, letteringSounds } from './hud';
import { CPU_TABLES } from './cpu';
import { desperationOf, lifeOf, stocksOf } from './characters';
import type { Who } from './characters';
import { addPower, firstStrike, LIFE, Match } from './match';
import type { Fighter } from './match';
import { BOSSES, ROSTER } from './select';
import { scenarioOf, Story } from './story';
import { enter, playing, RYUKO, strike } from './testing';
import type { Battle, Slot } from './story';
import { bossBrAnotherStory, brAnotherStages } from './br-another';

// A third player borrowed from another match: a story battle seats up to
// eight.
function trio() {
  const match = new Match();
  match.fighters.push(new Match().fighters[1]);
  match.cpus.push(null);
  match.clearInput();
  return match;
}

describe('more than two players', () => {
  it('targets and faces the nearest player it fights (0x40e5c0)', () => {
    const match = trio();
    const [f, a, b] = match.fighters;
    [f.x, a.x, b.x] = [600, 900, 450];
    match.step();
    expect(f.target).toBe(b);
    expect(f).toMatchObject({ action: 'turn', facing: -1 });
    // One it doesn't fight (+0xdfb7) or that is KO'd is passed over.
    f.enemies = ~(1 << 2);
    match.step();
    expect(f.target).toBe(a);
    f.enemies = -1;
    b.hp = 0;
    match.step();
    expect(f.target).toBe(a);
    a.hp = 0;
    match.step();
    expect(f.target).toBeNull();
  });

  it('strikes every player it fights that its box reaches, and no ally', () => {
    for (const ally of [false, true]) {
      const match = trio();
      const [f, a, b] = match.fighters;
      [a.x, b.x] = [f.x + 120, f.x + 120];
      if (ally) f.enemies = ~(1 << 2);
      match.step({ punch: true });
      while (f.action === 'script' && a.hp === LIFE) match.step();
      expect(a.hp).toBeLessThan(LIFE);
      expect(b.hp < LIFE).toBe(!ally);
    }
  });

  it("stops every other player, not just the striker, with a reaction's other stop", () => {
    const match = trio();
    const [f, a, b] = match.fighters;
    [a.x, b.x] = [f.x + 120, 1400];
    match.step({ punch: true });
    while (a.hp === LIFE) match.step();
    match.step();
    // Op 0x1a's r[2] (0x4136ae) reaches the striker and the bystander alike;
    // the bystander, stepping after the victim, counts it down at once.
    expect(a.hitStop).toBeGreaterThan(0);
    expect(f.hitStop).toBeGreaterThan(1);
    expect(b.hitStop).toBe(f.hitStop - 1);
  });
});

// Ryuko's first battle: ZAKU and PAC-HELO at CPU level 0, each pair of
// reinforcements entering as the one they watch falls.
const FIRST = scenarioOf('ryuko')[0] as Battle;
const slot = (fields: Partial<Slot> = {}): Slot => ({
  ...FIRST.slots[0]!,
  ...fields,
});
const battle = (fields: Partial<Battle> = {}): Battle => ({
  ...FIRST,
  slots: [slot(), null, null, null, null, null, null],
  ...fields,
});
const knockOut = (match: Match, f: Fighter, by: Fighter) => {
  f.hp = 0;
  f.caught = by;
  (
    match as unknown as { knockOut(f: Fighter, wasOut: boolean): void }
  ).knockOut(f, false);
};
// Play to the fight, whose phase 1 the players read from the tick after
// SHOW TIME's.
const fight = (match: Match) => {
  while (match.roundTicks <= match.fightTick) match.step();
};

describe('story battles', () => {
  it('seats the 1P and each slot at their x, the slots facing it', () => {
    const match = Match.story('ryuko', FIRST);
    expect(match.stage).toBe('court');
    expect(
      match.fighters.map(({ who, x, facing, present }) => [
        who,
        x / 1.5,
        facing,
        present,
      ]),
    ).toEqual([
      ['ryuko', 540, 1, true],
      ['zaku', 450, -1, true],
      ['pachelo', 830, -1, true],
      ['zaku', 450, -1, false],
      ['pachelo', 830, -1, false],
      ['zaku', 450, -1, false],
      ['pachelo', 830, -1, false],
    ]);
    // No ROUND n or FIGHT, so phase 1 follows KGT 13 by two ticks, with no
    // timer; set-up centres the camera on every seat (4380 / 7 − 320).
    expect(match.fightTick).toBe(DRESS_TICK + 2);
    expect(match.seconds).toBe(Infinity);
    expect(match.cameraX / 1.5).toBe(305);
  });

  it('draws a life bar only under a slot that sets bit 0, once present, while it has life (0x404e2d)', () => {
    const match = Match.story(
      'ryuko',
      battle({
        slots: [
          slot({ flags: 0x201 }),
          slot(),
          slot({ flags: 0x205 }),
          null,
          null,
          null,
          null,
        ],
      }),
    );
    const [, ally, , waiting] = match.fighters;
    expect(waiting.present).toBe(false);
    expect(match.lifeBars).toEqual([ally]);
    ally.hp = 0;
    expect(match.lifeBars).toEqual([]);
  });

  it('brings in a waiting slot once its watched seat falls below its mark', () => {
    const match = Match.story('ryuko', FIRST);
    fight(match);
    const [ryuko, , pachelo, three, four, five] = match.fighters;
    pachelo.hp = 0;
    match.step();
    // Seats 3 and 4 watch seat 2 (life below 1).
    expect([three.present, four.present, five.present]).toEqual([
      true,
      true,
      false,
    ]);
    // Its retried set-up enters 開始時 at its step, which plays the next.
    expect(three).toMatchObject({ action: 'script', age: -1, shown: false });
    match.step();
    expect(three).toMatchObject({ age: 0, shown: true });
    // A KO'd player is no target; the 1P takes the nearest who entered.
    expect(ryuko.target).toBe(match.fighters[1]);
  });

  it('gives each player as it enters the first palette no seat holds, those earlier battles seated too (0x412056)', () => {
    // The 1P chose with K, palette 0; the select screen left no other.
    const held = [0, -1, -1, -1, -1, -1, -1, -1];
    const match = Match.story('ryuko', FIRST, 0, held);
    // Seats 1 and 2 enter as the round sets up; 3–6 wait with none.
    expect(match.palettes).toEqual([0, 1, 2, 0, 0, 0, 0]);
    fight(match);
    match.fighters[2].hp = 0;
    match.step();
    // Seats 3 and 4, watching seat 2, enter as it falls.
    expect(match.palettes).toEqual([0, 1, 2, 3, 4, 0, 0]);
    // The seats keep theirs into the next battle, where seat 7 enters with
    // none and passes over all five.
    const next = Match.story(
      'ryuko',
      battle({ slots: [null, null, null, null, null, null, slot()] }),
      0,
      held,
    );
    expect(next.palettes).toEqual([0, 5]);
    expect(held).toEqual([0, 1, 2, 3, 4, -1, -1, 5]);
  });

  it('seats ten players on the scene’s eight-entry palette array, a repeat once the eight run out (authored)', () => {
    const held = [0, -1, -1, -1, -1, -1, -1, -1];
    const match = Match.story(
      'ryuko',
      battle({ slots: Array.from({ length: 9 }, () => slot()) }),
      0,
      held,
    );
    expect(match.held).toBe(held);
    expect(match.palettes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 0]);
    for (const palette of match.palettes) {
      expect(Number.isInteger(palette)).toBe(true);
      expect(palette).toBeGreaterThanOrEqual(0);
      expect(palette).toBeLessThanOrEqual(7);
    }
    expect(held).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 0]);
    const next = Match.story(
      'ryuko',
      battle({
        slots: [slot(), null, null, null, slot(), null, null, slot(), slot()],
      }),
      0,
      held,
    );
    expect(next.palettes).toEqual([0, 1, 5, 0, 0]);
    expect(held).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 0]);
  });

  it('pads held to battles with more than nine seats so waiting seats never read NaN', () => {
    const held = [0, -1, -1, -1, -1, -1, -1, -1];
    const match = Match.story(
      'ryuko',
      battle({
        slots: Array.from({ length: 11 }, (_, i) =>
          i < 9 ? slot() : slot({ flags: 4, watch: i, below: 150 }),
        ),
      }),
      0,
      held,
    );
    expect(held).toHaveLength(12);
    expect(match.palettes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 0, 0, 0]);
    for (const palette of match.palettes)
      expect(Number.isNaN(palette)).toBe(false);
  });

  it.each([
    ['dora', 5, 0],
    ['dora', 5, 10],
    ['ryuko', 0, 0],
    ['shinz', 5, 0],
    ['masa', 0, 0],
    ['yinan', 0, 0],
  ] as const)(
    'keeps %s step %i running past 100 points (global 10: %i)',
    (who, step, global10) => {
      const globals = Object.assign(Array<number>(64).fill(0), {
        10: global10,
      });
      const match = Match.story(
        who,
        scenarioOf(who)[step] as Battle,
        0,
        undefined,
        globals,
      );
      fight(match);
      const [one, early] = match.fighters;
      knockOut(match, early, one);
      // Later hits on an already KO'd fighter can award these points again.
      one.points = 100;
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner).toBeNull();
      expect(match.matchOver).toBe(false);
      expect(
        match.fighters.some((f, i) => one.enemies & (1 << i) && f.hp > 0),
      ).toBe(true);
      expect(match.fighters.some((f) => !f.present && f.hp > 0)).toBe(true);
    },
  );

  it('wins a brawl only after the final enemy falls, regardless of points or a living ally', () => {
    const match = Match.story(
      'ryuko',
      battle({
        slots: [
          slot({ points: 0 }),
          slot({ flags: 0x201, points: 0 }),
          slot({ points: 0 }),
        ],
      }),
    );
    fight(match);
    const [one, early, ally, last] = match.fighters;
    knockOut(match, early, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBeNull();
    knockOut(match, last, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(one.points).toBe(0);
    expect(ally.hp).toBeGreaterThan(0);
    expect(match).toMatchObject({ winner: 'player', wins: [1, 0], lost: 0 });
    expect(match.matchOver).toBe(true);
  });

  it('waits for a delayed enemy after the active enemy is defeated', () => {
    const match = Match.story(
      'ryuko',
      battle({ slots: [slot({ points: 100 }), slot({ flags: 2, delay: 10 })] }),
    );
    fight(match);
    const [one, early, delayed] = match.fighters;
    expect(delayed.shown).toBe(false);
    knockOut(match, early, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBeNull();
    expect(delayed.shown).toBe(false);
    while (!delayed.shown) match.step();
    knockOut(match, delayed, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('player');
  });

  it('finishes Doraemon’s brawl after all six enemy waves, leaving the ally alive', () => {
    const match = Match.story('dora', scenarioOf('dora')[5] as Battle);
    fight(match);
    const [one] = match.fighters;
    const enemies = match.fighters.filter((_, i) => one.enemies & (1 << i));
    expect(enemies).toHaveLength(6);
    for (const [i, enemy] of enemies.entries()) {
      expect(enemy.present).toBe(true);
      knockOut(match, enemy, one);
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner).toBe(i === 5 ? 'player' : null);
    }
    expect(match.fighters[7].hp).toBeGreaterThan(0);
  });

  it('keeps the point-based objective in a duel', () => {
    const match = Match.story('ryuko', battle());
    fight(match);
    match.fighters[0].points = 100;
    for (let t = 0; t < 3; t++) match.step();
    expect(match).toMatchObject({ winner: 'player', wins: [1, 0] });
    expect(match.fighters[1].hp).toBeGreaterThan(0);
  });

  it('loses a brawl when the player falls even if nobody scores points', () => {
    const match = Match.story('ryuko', FIRST);
    fight(match);
    const [ryuko, zaku] = match.fighters;
    knockOut(match, ryuko, zaku);
    for (let t = 0; t < 3; t++) match.step();
    expect(match).toMatchObject({ winner: 'opponent', wins: [0, 1], lost: 1 });
  });

  it('draws a brawl when the player and every enemy fall together', () => {
    const match = Match.story(
      'ryuko',
      battle({
        koPoints: 0,
        slots: [slot({ points: 0 }), slot({ points: 0 })],
      }),
    );
    fight(match);
    const [one, a, b] = match.fighters;
    knockOut(match, a, one);
    knockOut(match, b, one);
    knockOut(match, one, a);
    for (let t = 0; t < 3; t++) match.step();
    expect(match).toMatchObject({ winner: 'draw', wins: [1, 1], lost: 1 });
  });

  it('ends a brawl once every hostile has fallen, a revived one still counting', () => {
    const match = Match.story(
      'ryuko',
      battle({
        koPoints: 0,
        slots: [slot({ points: 0 }), slot({ points: 0 })],
      }),
    );
    fight(match);
    const [one, a, b] = match.fighters;
    knockOut(match, a, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBeNull();
    // ZAKU and PAC-HELO rise about 5 s after a KO: it stands again, and
    // the brawl still ends once the last hostile falls.
    a.hp = 400;
    knockOut(match, b, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match).toMatchObject({ winner: 'player', wins: [1, 0] });
    expect(a.hp).toBe(400);
  });

  it('wins a timed brawl whose last enemy fell on the final tick, not the time-up’s points', () => {
    const match = Match.story(
      'ryuko',
      battle({
        time: 1,
        timeUp: 100,
        slots: [slot({ timeUp: 100 }), slot({ timeUp: 100 })],
      }),
    );
    fight(match);
    const [one, a, b] = match.fighters;
    one.hp = 1;
    knockOut(match, a, one);
    for (let t = 0; t < 3; t++) match.step();
    // A risen hostile at time-up would score its slot's points; the last
    // one falling as the clock runs out still wins the wipe-out.
    a.hp = 400;
    while (match.ticks < 99) match.step();
    knockOut(match, b, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('player');
  });

  it('still resolves a timed brawl at time-up with surviving enemies', () => {
    const match = Match.story(
      'ryuko',
      battle({
        time: 1,
        timeUp: 100,
        slots: [slot({ timeUp: 100 }), slot({ timeUp: 100 })],
      }),
    );
    fight(match);
    match.fighters[0].hp = 1;
    while (!match.winner) match.step();
    expect(match.winner).toBe('opponent');
    expect(match.fighters.slice(1).every((f) => f.hp > 0)).toBe(true);
  });

  it('scores a time-up by life per mille', () => {
    // Seat 1 takes 100 for more life than the 1P; the 1P each slot's +0x14
    // for more than its player.
    const match = Match.story(
      'ryuko',
      battle({ time: 1, timeUp: 100, slots: [slot({ timeUp: 100 }), null] }),
    );
    fight(match);
    const [ryuko, zaku] = match.fighters;
    ryuko.hp = 255;
    zaku.hp = 101;
    while (!match.winner) match.step();
    expect([ryuko.points, zaku.points]).toEqual([0, 100]);
    expect(match).toMatchObject({ winner: 'opponent', lost: 1 });
    // The 1P lost at a time-up: it takes the draw, the slot the win.
    while (ryuko.action !== 'draw') match.step();
    expect(zaku.action).toBe('win');
  });

  it('holds a slot that enters after its seconds unseen and untargeted', () => {
    const match = Match.story(
      'ryuko',
      battle({ slots: [slot({ flags: 2, delay: 1 }), null] }),
    );
    const [ryuko, zaku] = match.fighters;
    expect(zaku).toMatchObject({ present: true, shown: false, hitStop: 100 });
    for (let t = 0; t < 100; t++) match.step();
    expect(zaku.shown).toBe(false);
    expect(ryuko.target).toBeNull();
    match.step();
    expect(zaku.shown).toBe(true);
    match.step();
    expect(ryuko.target).toBe(zaku);
  });

  it("holds no waiting slot with KO Normal's stop, so it enters unheld", () => {
    const match = Match.story('ryuko', FIRST);
    fight(match);
    const [ryuko, zaku, , three] = match.fighters;
    knockOut(match, ryuko, zaku);
    for (let t = 0; t < 100 && zaku.hitStop < 20; t++) match.step();
    // PC 611's 40 for the others (op 0x1a, 0x4136ae) reaches only seats
    // whose set-up ran (+0x2238, 0x411fb0); the story step clears it
    // (0x4069eb).
    expect(zaku.hitStop).toBeGreaterThan(20);
    expect(three).toMatchObject({ present: false, hitStop: 0 });
  });

  it("gives a slot's KO bonus to the 1P (bit 7) or the striker (bit 8)", () => {
    for (const flags of [0x80, 0x100]) {
      const match = Match.story(
        'ryuko',
        battle({
          slots: [slot({ flags, life: 50, power: 10 }), slot(), null],
        }),
      );
      fight(match);
      const [ryuko, zaku, other] = match.fighters;
      ryuko.hp = other.hp = 100;
      ryuko.stock = other.stock = 0;
      knockOut(match, zaku, other);
      const gainer = flags === 0x80 ? ryuko : other;
      expect(gainer).toMatchObject({ hp: 150, power: 10 });
    }
  });

  it("scales the slot's KO bonus with the taker's effective maximum (HPA-767)", () => {
    // The bonus is the fallen slot's `life` (30–100 in the shipped stories),
    // a transfer like any scripted gain: it reads as its share of the
    // taker's bar — 50 of 510 at ×5 reads 250 of 2550 — and stays native
    // without cheats.
    const bonus = (playerHpMultiplier: number) => {
      const match = Match.story(
        'ryuko',
        battle({
          slots: [slot({ flags: 0x80, life: 50, power: 10 }), slot(), null],
        }),
      );
      match.useCheats({
        ...DEFAULT_CHEATS,
        enabled: true,
        playerHpMultiplier,
      });
      fight(match);
      const [ryuko, zaku] = match.fighters;
      ryuko.hp = 100;
      ryuko.stock = 0;
      knockOut(match, zaku, ryuko);
      return ryuko.hp;
    };
    expect(bonus(5)).toBe(350);
    expect(bonus(0.5)).toBe(125);
  });

  it("pays a KO again for each hit that takes life from a KO'd player, but not for one without damage (0x40f747)", () => {
    for (const damage of [10, 0]) {
      const match = Match.story(
        'ryuko',
        battle({ slots: [slot({ flags: 0x80, life: 50, power: 10 }), null] }),
      );
      fight(match);
      const [ryuko, zaku] = match.fighters;
      zaku.x = ryuko.x + 120 * ryuko.facing;
      ryuko.hp = 100;
      ryuko.stock = 0;
      zaku.hp = 0;
      // At punch's first box, which the next step's hit test reads.
      const { from } = firstStrike('ryuko', RYUKO.punch, 'ryuko');
      enter(match, ryuko, RYUKO.punch, from);
      ryuko.box = { ...ryuko.box!, damage };
      match.step();
      expect(ryuko.connected).toBe(true);
      expect(ryuko).toMatchObject(
        damage ? { hp: 150, power: 10 } : { hp: 100, power: 0 },
      );
      expect(zaku.pending).toMatchObject({
        action: damage ? 'down' : 'hit',
      });
    }
  });

  it("shows the only other player with life on the HUD's 2P side (0x40a36e)", () => {
    const match = Match.story(
      'ryuko',
      battle({ slots: [slot(), slot(), null] }),
    );
    const [, first, second] = match.fighters;
    match.step();
    expect(match.rival).toBeNull();
    first.hp = 0;
    match.step();
    expect(match.rival).toBe(second);
    // Vs. shows player 2.
    const vs = new Match();
    expect(vs.rival).toBe(vs.fighters[1]);
  });

  it("shows the player whose box the 1P's met, before any hit (0x40ed54)", () => {
    const match = Match.story(
      'ryuko',
      battle({ slots: [slot(), slot(), null] }),
    );
    fight(match);
    const [ryuko, first, second] = match.fighters;
    expect(match.rival).toBeNull();
    // Facing each other, both boxes sit 45 pixels in front: in one place.
    const box = { x: 30, y: -100, w: 40, h: 40, damage: 0, kind: 1 };
    second.x = ryuko.x + 90 * ryuko.facing;
    second.facing = -ryuko.facing as -1 | 1;
    first.x = ryuko.x - 900 * ryuko.facing;
    ryuko.box = { ...box };
    second.box = { ...box };
    match.step();
    expect([ryuko.box, second.box]).toEqual([null, null]);
    expect(match.rival).toBe(second);
  });

  it('walls a story without letterings bit 2 at the stage, not the screen', () => {
    for (const letterings of [0, 4]) {
      const match = Match.story('ryuko', battle({ letterings }));
      fight(match);
      const [, zaku] = match.fighters;
      zaku.x = 1100 * 1.5;
      match.step();
      expect(match.cameraX / 1.5).toBeLessThan(500);
      expect(zaku.x / 1.5).toBe(letterings ? match.cameraX / 1.5 + 590 : 1100);
    }
  });

  // Story's select screen leaves global 3 at 10 and 10 at 10 (CHAR SELECT's
  // BackBlue), which a demo before a battle may set again (--NEXT--'s 10 at
  // 100); the title's demos leave both 0.
  const left = (globals: Record<number, number>) =>
    Object.assign(Array<number>(64).fill(0), globals);
  const SCREENS: Record<number, number>[] = [
    {},
    { 3: 10, 10: 10 },
    { 3: 10, 10: 100 },
  ];

  it("takes each 開始時's path and KGT 13's by the globals the screens left", () => {
    // Ryuko's 開始時 takes BR at global 3 = 0 (PC 286), from + 2 at 10 = 10
    // (PC 287), and otherwise its VS path; KGT 13 the logo wipe at 3 = 0
    // (PC 72), demo black at 10 = 10 (PC 71), or else the VS splash, whose
    // VS L slides in with sound 12.
    expect(
      SCREENS.map((globals) => {
        const match = Match.story('ryuko', FIRST, 0, undefined, left(globals));
        const heard: number[] = [];
        while (match.roundTicks < 200) {
          match.step();
          if (letteringSounds(match).includes(12)) heard.push(match.roundTicks);
          if (match.roundTicks === 6)
            heard.push(match.fighters[0].branch as never);
        }
        return heard;
      }),
    ).toEqual([[32], ['32+2'], ['30+9', 152]]);
  });

  it('revives ZAKU and PAC-HELO in their story rounds, whose KO downs test variable 11 (PCs 535, 545)', () => {
    // Global 4 at 70 (--NEXT Zaku Halo--) takes Round BR 2 + 4 (PC 317),
    // setting variable 11 to 2 (PC 344): KO down enters KO Down BR (62) at
    // once, which lies 10 + 500 ticks, spawns KO BR HP and stands, 10 + 4 ×
    // 41 (DEMO STAND): 684. At 1, as +BR-OP's Round BR leaves it (PC 338),
    // Round BR 2 sets 1 (PC 342), and KO down waits out its 2000-tick pose
    // into KO Down BR + 10: PAC-HELO's stands 5 + 5 + 4 × 35 (Demo stand).
    // At 0 it lies on.
    const revive = (player: number, global4: number) => {
      const match = Match.story(
        'ryuko',
        battle({
          slots: [slot({ player }), null, null, null, null, null, null],
        }),
        0,
        undefined,
        left({ 4: global4 }),
      );
      const [ryuko, f] = match.fighters;
      fight(match);
      f.hp = 1;
      f.x = ryuko.x + 90 * ryuko.facing;
      const path: unknown[] = [];
      for (let t = 0; t < 3000; t++) {
        match.step(t ? {} : { punch: true });
        if (path.at(-1) !== playing(f)) path.push(t, playing(f));
      }
      return [...path, f.hp];
    };
    expect(revive(34, 70)).toEqual([
      0,
      'turn',
      8,
      'down',
      118,
      62,
      802,
      'idle',
      200,
    ]);
    expect(revive(35, 1)).toEqual([
      0,
      'turn',
      8,
      'down',
      118,
      61,
      2128,
      '62+10',
      2278,
      'idle',
      200,
    ]);
    expect(revive(34, 0)).toEqual([0, 'turn', 8, 'down', 118, 61, 0]);
  });

  it("hides Sport Court's dancers at global 10 = 10 (PCs 36–351)", () => {
    expect(
      SCREENS.map((globals) => {
        const match = Match.story('ryuko', FIRST, 0, undefined, left(globals));
        for (let t = 0; t < 10; t++) match.step();
        return match.layers.slice(6).map(({ clip }) => `${clip}`);
      }),
    ).toEqual([
      ['7', '8+26', '9', '10', '11', '12+26', '13', '14'],
      Array(8).fill('6+4'),
      ['7', '8+26', '9', '10', '11', '12+26', '13', '14'],
    ]);
  });

  it('plays the unreachable sign battle by the usual brawl rules (HPA-765)', () => {
    // Global 10 = 10 on an all-sign battle used to exempt it from the
    // hostile-wipe rule: the mode select's scripted point objective stood
    // in. The quick selector replaced it, so a battle of that shape —
    // unreachable through the UI — ends like any brawl.
    const match = Match.story('ryuko', FIRST, 0, undefined, left({ 10: 10 }));
    fight(match);
    const [one, early] = match.fighters;
    knockOut(match, early, one);
    // 100 points alone no longer ends it while hostile seats still stand.
    one.points = 100;
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBeNull();
    for (const f of match.fighters.slice(1)) knockOut(match, f, one);
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('player');
  });

  it('seats the 1P’s life under cheats in the old sign battle too (HPA-765)', () => {
    // The Chii bout kept its 1P native so striking a sign read the route
    // off raw life; unreachable now, the usual Player HP seating applies.
    const match = Match.story('ryuko', FIRST, 0, undefined, left({ 10: 10 }));
    match.useCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerHpMultiplier: 0.5,
    });
    expect(match.fighters[0].maxHp).toBe(255);
  });

  it("makes the 1P's HUD face, where SWW's sets variable 12 above global 3 = 1", () => {
    // His face helper (72 + 26) takes Team VS 1P + 2 (PC 710), which sets
    // the variable One Only tests (380).
    const sww = scenarioOf('sww').find(({ type }) => type === 1) as Battle;
    expect(
      SCREENS.map((globals) => {
        const match = Match.story('sww', sww, 0, undefined, left(globals));
        for (let t = 0; t < 3; t++) match.step();
        return match.fighters[0].variables[12];
      }),
    ).toEqual([undefined, 1, 1]);
  });

  describe('KO Down life checks (HPA-973)', () => {
    // A slot's bit-7 bonus pays its KO's life to a seat (0x40e863);
    // caught mid-air or lying in the KO down, a fighter with any life
    // again gets up at its KO down's own check. Striking the 1P and a
    // paying seat in the same hitTest makes the payer the striker's KO
    // the very tick the 1P falls: the bonus lands before the next step's
    // KO check reads the 1P at 0, so no loss is picked and its `downed`
    // mark stands for the brawl.
    const trade = (who: Who, br = false) => {
      const match = Match.story(
        who,
        battle({
          slots: [slot({ enemies: 5 }), slot({ flags: 0x80, life: 50 }), null],
        }),
        0,
        undefined,
        undefined,
        br,
      );
      fight(match);
      const [one, striker, paying] = match.fighters;
      one.hp = paying.hp = 1;
      // ZAKU's 186 sweep meets both at its first box (t = 23), which its
      // facing +1 spans about 90–255 arena px out; felling the paying
      // seat pays its slot's bonus to the 1P the same tick.
      striker.facing = 1;
      paying.x = striker.x + 150;
      one.x = striker.x + 230;
      strike(match, striker, 186);
      match.step();
      return { match, one, striker, paying };
    };
    const path = (match: Match, f: Fighter) => {
      const seen: [number, Fighter['action']][] = [];
      for (let t = 0; t < 400 && f.action !== 'idle'; t++) {
        match.step();
        expect(match.winner).toBeNull();
        if (seen.at(-1)?.[1] !== f.action) seen.push([t, f.action]);
      }
      return seen;
    };

    it('restores a 1P KO’d the tick a slot’s life pays, getting up at its KO down’s own check', () => {
      const { match, one, paying } = trade('ryuko');
      expect(one).toMatchObject({ hp: 50, downed: true });
      expect(paying).toMatchObject({ hp: 0, downed: true });
      expect(match.winner).toBeNull();
      const seen = path(match, one);
      expect(seen).toEqual([
        [0, 'down'],
        [expect.any(Number), 'koLand'],
        [expect.any(Number), 'getUp'],
        [expect.any(Number), 'idle'],
      ]);
      // Action 62's op 0x11 (HP ≥ 1) at its own tick 60, its get-up the
      // target — the op 0x1f of global 15 passed (PC 645).
      expect(seen[2][0] - seen[1][0]).toBe(60);
      expect(one.downed).toBe(true);
      // The seat it felled at 0 life never rose.
      expect(paying.action).not.toBe('getUp');
    });

    it('gets DoraEmon up at his KO down’s first check (76: t = 61, before t = 62)', () => {
      const { match, one } = trade('dora');
      const seen = path(match, one);
      expect(seen).toEqual([
        [0, 'down'],
        [expect.any(Number), 'koLand'],
        [expect.any(Number), 'getUp'],
        [expect.any(Number), 'idle'],
      ]);
      expect(seen[2][0] - seen[1][0]).toBe(61);
    });

    it('checks TRAINING’s at the landing itself: its t = 0 target is the knockdown (113)', () => {
      const { match, one } = trade('training');
      const seen = path(match, one);
      expect(seen).toEqual([
        [0, 'down'],
        [expect.any(Number), 'knockdown'],
        [expect.any(Number), 'getUp'],
        [expect.any(Number), 'idle'],
      ]);
    });

    it('enters ZIRO’s get-up through his rolled KO down’s life branch (70)', () => {
      const { match, one } = trade('ziro');
      const seen = path(match, one);
      expect(seen).toEqual([
        [0, 'down'],
        [expect.any(Number), 'koLand'],
        [expect.any(Number), 'getUp'],
        [expect.any(Number), 'idle'],
      ]);
      expect(seen[2][0] - seen[1][0]).toBe(60);
    });

    it('wakes no paid 1P on a B.R. route, where the authored !br gate stands', () => {
      const { match, one } = trade('ryuko', true);
      expect(one).toMatchObject({ hp: 50, downed: true });
      for (let t = 0; t < 200; t++) {
        match.step();
        expect(match.winner).toBeNull();
        expect(one.action).not.toBe('getUp');
      }
      expect(one).toMatchObject({ action: 'koLand', hp: 50, downed: true });
    });

    it('lets no bonus a tick late undo a picked loss', () => {
      // run() latches `picking` on the first step it sees the 1P at 0;
      // the recovered KO Down check stands down behind it and `winner`,
      // and TRAINING's — the only check with no round-over test — is no
      // hole in that gate.
      const match = Match.story(
        'ryuko',
        battle({ slots: [slot(), slot(), null] }),
      );
      fight(match);
      const [ryuko, zaku] = match.fighters;
      knockOut(match, ryuko, zaku);
      for (let t = 0; t < 3; t++) match.step();
      expect(match).toMatchObject({ winner: 'opponent', lost: 1 });
      ryuko.hp = 50;
      for (let t = 0; t < 200; t++) {
        match.step();
        expect(ryuko.action).not.toBe('getUp');
      }
      expect(ryuko).toMatchObject({ downed: true });
    });
  });
});

describe('Vs. results', () => {
  it('compare life per mille at a time-up (0x408f68)', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'zaku']);
    const [ryuko, zaku] = match.fighters;
    // 255 of 510 is 500; 101 of 200 is 505.
    ryuko.hp = 255;
    zaku.hp = 101;
    match.ticks = 5999;
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('opponent');
  });

  it('picks the result from the lives the tick after the round ends, and credits it the tick after that (0x408ec7, 0x408f68, 0x409444)', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'zaku']);
    const zaku = match.fighters[1];
    match.ticks = 5999;
    match.step();
    const seconds = match.seconds;
    zaku.hp = 1;
    match.step();
    expect(match.winner).toBe(null);
    match.step();
    expect(match).toMatchObject({
      winner: 'player',
      wins: [1, 0],
      endingTicks: 0,
      seconds,
    });
  });
});

describe('VS multi (TEAM VS)', () => {
  // A round's result: player 2's member (or both) out at once.
  const finish = (match: Match, ...losers: number[]) => {
    for (const i of losers) match.fighters[i].hp = 0;
    const { round } = match;
    for (let t = 0; t < 5000 && match.round === round; t++) match.step();
  };
  const branches = (match: Match, ticks: number) => {
    const seen: Fighter['branch'][] = [];
    for (let t = 0; t < ticks; t++) {
      match.step();
      const { branch } = match.fighters[0];
      if (seen.at(-1) !== branch) seen.push(branch);
    }
    return seen;
  };

  it('moves on the member of the side that lost or drew, to its team size in wins', () => {
    const match = Match.team(
      [
        ['ryuko', 'zoma', 'kiki'],
        ['chung', 'amiro', 'anmc'],
      ],
      'court',
    );
    expect(match.rounds).toBe(3);
    expect(match.fighters.map((f) => f.who)).toEqual(['ryuko', 'chung']);
    fight(match);
    match.fighters[1].power = 37;
    match.fighters[1].stock = 2;
    finish(match, 1);
    // Amiro takes the seat at full life with its stock and power, and
    // player 2's CPU her table, rolling on.
    expect(match.members).toEqual([0, 1]);
    expect(match.fighters.map(({ who, hp }) => [who, hp])).toEqual([
      ['ryuko', LIFE],
      ['amiro', 470],
    ]);
    expect(match.fighters[1]).toMatchObject({ stock: 2 });
    expect(match.fighters[1].power).toBeGreaterThanOrEqual(37);
    expect(match.cpu.entries).toBe(CPU_TABLES.amiro);
    // A double KO is a draw: both move on.
    fight(match);
    finish(match, 0, 1);
    expect([match.wins, match.members]).toEqual([
      [2, 1],
      [1, 2],
    ]);
    expect(match.fighters.map((f) => f.who)).toEqual(['zoma', 'anmc']);
    fight(match);
    match.fighters[1].hp = 0;
    while (!match.winner) match.step();
    expect([match.matchOver, match.matchWinner]).toEqual([true, 'player']);
  });

  it("leaves global 3 at 100, so every round's 開始時 takes its TEAM VS path (PCs 5, 100)", () => {
    // VS single's round 1 enters 33 at 100 ticks; round 2 skips the VS
    // intro.
    const vs = new Match('cpu', true, 0, ['ryuko', 'ryuko'], 'court', true);
    expect(branches(vs, 400)).toEqual([30, '30+9', 33, null]);
    finish(vs, 1);
    expect(branches(vs, 400)).toEqual([30, null]);
    const team = Match.team(
      [
        ['ryuko', 'zoma', 'kiki'],
        ['ryuko', 'amiro', 'anmc'],
      ],
      'court',
    );
    expect(branches(team, 400)).toEqual([30, '30+9', 34, null]);
    // The member that won stays, marked by its Team VS 1P (below), so Team
    // VS Start jumps to Skill4 (36), past the entrance.
    finish(team, 1);
    expect(branches(team, 400)).toEqual([30, '30+9', 36, null]);
  });

  it("carries the winner's life into the next round in fifths, and skips its entrance (Team VS 1P/2P, Skill4)", () => {
    // Round 1's winner at this life, against a loser on that side.
    const next = (life: number, loser: number) => {
      const match = Match.team(
        [
          ['ryuko', 'zoma', 'kiki'],
          ['ryuko', 'amiro', 'anmc'],
        ],
        'court',
      );
      fight(match);
      match.fighters[1 - loser].hp = life;
      match.fighters[loser].hp = 0;
      const global = 8 + (1 - loser);
      // 1P or 2P WIN sets its side's global 1 the tick after KO's 240-tick
      // wait; the winner's Team VS 1P or 2P (44 + 4, 49 + 5) finds it and
      // writes its life's level there.
      const set: number[] = [];
      while (match.round === 1) {
        match.step();
        const value = match.globals[global] ?? 0;
        if (value !== (set.at(-2) ?? 0)) set.push(value, match.endingTicks);
      }
      expect(set.slice(0, 2)).toEqual([1, 241]);
      const winner = () => match.fighters[1 - loser];
      const lives = [];
      while (match.roundTicks < 4) {
        match.step();
        lives.push(winner().hp);
      }
      const seen = new Set<Fighter['branch']>();
      while (match.roundTicks < 101) {
        match.step();
        seen.add(winner().branch);
      }
      // Skill4 clears both globals and the mark.
      expect(seen.has(36)).toBe(true);
      expect([match.globals[8], match.globals[9]]).toEqual([0, 0]);
      expect(winner().variables[15]).toBe(0);
      // The loser's next member, Amiro or Zoma, enters at full life.
      return [lives[2], lives[3], match.fighters[loser].hp];
    };
    // Above 408 (four fifths of 510) it keeps its full life; at or below
    // 408, 306 or 204 it enters with 102, 204 or 306 less (Team VS 1P 400,
    // 300, 200: 46 + 5, 47 + 5, 48 + 4), so even 1 comes back as 204.
    expect(next(510, 1)).toEqual([LIFE, LIFE, 470]);
    expect(next(409, 1)).toEqual([LIFE, LIFE, 470]);
    expect(next(408, 1)).toEqual([LIFE, 408, 470]);
    expect(next(306, 1)).toEqual([LIFE, 306, 470]);
    expect(next(204, 1)).toEqual([LIFE, 204, 470]);
    expect(next(1, 1)).toEqual([LIFE, 204, 470]);
    expect(next(300, 0)).toEqual([LIFE, 306, 490]);
  });
});

describe('BR Another stages', () => {
  it('seats the 1P, its eight enemies and its ally on ten fighters from the scene’s eight-entry held array', () => {
    for (const who of ['zmega', 'rario'] as const) {
      const held = [0, -1, -1, -1, -1, -1, -1, -1];
      const { stage2 } = brAnotherStages(who);
      const match = Match.story(who, stage2, 0, held);
      expect(match.held, who).toBe(held);
      expect(held, who).toHaveLength(10);
      expect(match.stage, who).toBe('sakuranight');
      expect(
        match.fighters.map((f) => f.who),
        who,
      ).toEqual([who, ...stage2.slots.map((s) => ROSTER[s!.player]!)]);
      expect(match.palettes, who).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(
        match.fighters.map((f) => f.present),
        who,
      ).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    }
  });

  it('marks every stage-2 enemy hostile to all but its pair-mate, and the ally only to them', () => {
    const mate = (k: number) => (k % 2 ? k + 1 : k - 1);
    for (const who of ['zmega', 'rario'] as const) {
      const match = Match.story(who, brAnotherStages(who).stage2);
      const all = (1 << 10) - 1;
      expect(
        match.fighters.map((f) => f.enemies),
        who,
      ).toEqual(
        match.fighters.map((_, k) =>
          k === 0 || k === 9
            ? all & ~1 & ~(1 << 9)
            : all & ~(1 << k) & ~(1 << mate(k)),
        ),
      );
      for (const [i, a] of match.fighters.entries())
        for (const [j, b] of match.fighters.entries())
          expect(Boolean(a.enemies & (1 << j)), `${who} ${i}->${j}`).toBe(
            Boolean(b.enemies & (1 << i)),
          );
    }
    const match = Match.story('gigi', brAnotherStages('gigi').stage2);
    expect(match.fighters.map((f) => f.who)).toEqual([
      'gigi',
      'masa',
      'times',
      'yinan',
      'aya',
      'ogi',
      'ziro',
      'sww',
    ]);
    const all = (1 << 8) - 1;
    expect(match.fighters.map((f) => f.enemies)).toEqual(
      match.fighters.map((_, k) =>
        k === 0 || k === 7
          ? all & ~1 & ~(1 << 7)
          : all & ~(1 << k) & ~(1 << mate(k)),
      ),
    );
    expect(match.fighters.map((f) => f.present)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('enters each stage-2 enemy once the fighter it watches falls below its own mark', () => {
    const match = Match.story('zmega', brAnotherStages('zmega').stage2);
    fight(match);
    const [one, ...rest] = match.fighters;
    expect(one.target).toBe(rest[0]);
    expect(match.rival).toBeNull();
    for (let k = 1; k <= 7; k++) {
      const watched = rest[k - 1]!;
      const next = rest[k]!;
      expect(next.present).toBe(false);
      watched.hp = desperationOf(watched.who);
      match.step();
      expect(next.present).toBe(false);
      watched.hp = desperationOf(watched.who) - 1;
      match.step();
      expect(next.present).toBe(true);
    }
  });

  it('sends the ally in once the 1P’s life falls below its mark', () => {
    for (const key of ['stage2', 'stage3'] as const) {
      const match = Match.story('zmega', brAnotherStages('zmega')[key]);
      fight(match);
      const [one] = match.fighters;
      const ally = match.fighters.at(-1)!;
      expect(ally.who, key).toBe('rario');
      expect(ally.present, key).toBe(false);
      one.hp = desperationOf('zmega');
      match.step();
      expect(ally.present, key).toBe(false);
      one.hp = desperationOf('zmega') - 1;
      match.step();
      expect(ally.present, key).toBe(true);
      for (let t = 0; t < 100 && !ally.shown; t++) match.step();
      expect(match.lifeBars, key).toEqual([ally]);
    }
  });

  it('names no rival while several stand, then the last left or the one the 1P’s box met', () => {
    const match = Match.story('zmega', brAnotherStages('zmega').stage2);
    fight(match);
    const [one, gigi] = match.fighters;
    const ally = match.fighters.at(-1)!;
    const box = { x: 30, y: -100, w: 40, h: 40, damage: 0, kind: 1 };
    gigi.x = one.x + 90 * one.facing;
    gigi.facing = -one.facing as -1 | 1;
    one.box = { ...box };
    gigi.box = { ...box };
    match.step();
    expect(match.rival).toBe(gigi);
    for (const vm of match.cpus) if (vm) vm.input = () => ({});
    for (const f of match.fighters.slice(2, 9)) f.hp = 0;
    for (let t = 0; t < 1001; t++) match.step();
    expect(match.rival).toBeNull();
    for (const f of match.fighters.slice(1, 9)) f.hp = 0;
    match.step();
    expect(match.rival).toBe(ally);
  });

  it('pays a KO on the first and middle stage-2 enemies to their striker, the last only to the 1P’s score', () => {
    const match = Match.story('zmega', brAnotherStages('zmega').stage2);
    fight(match);
    const [one, gigi, sww, masa, , , , , aya] = match.fighters;
    one.hp = 100;
    one.power = 0;
    one.points = 0;
    knockOut(match, gigi, one);
    expect([one.hp, one.power, one.points]).toEqual([150, 10, 0]);
    masa.hp = 100;
    masa.power = 0;
    knockOut(match, sww, masa);
    expect([masa.hp, masa.power, masa.points]).toEqual([150, 10, 0]);
    expect(one.points).toBe(0);
    knockOut(match, aya, masa);
    expect([masa.hp, masa.power, masa.points]).toEqual([150, 10, 0]);
    expect(one.points).toBe(100);
  });

  it('enters the stage-3 bosses in their seeded order, each once its watched boss runs low', () => {
    for (const [who, names, stage] of [
      ['ryuko', ['zenka', 'dora', 'shinz', 'alpha'], 'office2'],
      ['zmega', ['alpha', 'zenka', 'dora', 'shinz'], 'brboss'],
    ] as const) {
      const match = Match.story(who, brAnotherStages(who).stage3);
      expect(match.stage, who).toBe(stage);
      expect(
        match.fighters.map((f) => f.who),
        who,
      ).toEqual([
        who,
        ...brAnotherStages(who).stage3.slots.map((s) => ROSTER[s!.player]!),
      ]);
      expect(
        match.fighters.slice(1, 5).map((f) => f.who),
        who,
      ).toEqual(names);
      const all = (1 << 6) - 1;
      expect(
        match.fighters.map((f) => f.enemies),
        who,
      ).toEqual(
        match.fighters.map((_, k) =>
          k === 0 || k === 5 ? all & ~1 & ~(1 << 5) : all & ~(1 << k),
        ),
      );
      fight(match);
      expect(
        match.fighters.map((f) => f.present),
        who,
      ).toEqual([true, true, false, false, false, false]);
      for (const [watched, next] of [
        [match.fighters[1]!, match.fighters[2]!],
        [match.fighters[2]!, match.fighters[3]!],
        [match.fighters[3]!, match.fighters[4]!],
      ] as const) {
        watched.hp = desperationOf(watched.who);
        match.step();
        expect(next.present, `${who} ${next.who} at mark`).toBe(false);
        watched.hp = desperationOf(watched.who) - 1;
        match.step();
        expect(next.present, `${who} ${next.who} below mark`).toBe(true);
      }
    }
  });

  it('pays a boss KO’s bonus to its striker, the last boss’s only to the 1P’s score', () => {
    for (const who of ['zmega', 'ryuko'] as const) {
      const match = Match.story(who, brAnotherStages(who).stage3);
      fight(match);
      const [one, first, striker, , last] = match.fighters;
      one.hp = 100;
      one.power = 0;
      one.points = 0;
      striker.hp = 100;
      striker.power = 0;
      knockOut(match, first, striker);
      expect([striker.hp, striker.power, striker.points]).toEqual([150, 10, 0]);
      expect([one.hp, one.power, one.points]).toEqual([100, 0, 0]);
      knockOut(match, last, striker);
      expect([striker.hp, striker.power, striker.points]).toEqual([150, 10, 0]);
      expect([one.hp, one.power, one.points]).toEqual([100, 0, 100]);
    }
  });

  it('wins the stage-3 brawl only once every boss has fallen', () => {
    const match = Match.story('ryuko', brAnotherStages('ryuko').stage3);
    fight(match);
    const [one] = match.fighters;
    for (const [i, boss] of match.fighters.slice(1, 5).entries()) {
      expect(boss.present, boss.who).toBe(true);
      knockOut(match, boss, one);
      match.step();
      if (i < 3) expect(match.winner).toBeNull();
    }
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('player');
    expect(match).toMatchObject({ wins: [1, 0], lost: 0 });
    expect(match.matchOver).toBe(true);
  });

  it('loses the stage-2 brawl when the 1P falls, and a continue retries the identical seeded battle', () => {
    const story = new Story('zmega');
    story.startOnRoute('br-another');
    story.next();
    story.next();
    const next = story.next();
    expect(next.kind).toBe('battle');
    if (next.kind !== 'battle') return;
    expect(next.battle.flags & 1).toBe(1);
    const match = Match.story(
      'zmega',
      next.battle,
      0,
      [0, -1, -1, -1, -1, -1, -1, -1],
    );
    fight(match);
    const [one, striker] = match.fighters;
    const lineUp = match.fighters.map((f) => f.who);
    const palettes = match.palettes;
    knockOut(match, one, striker);
    for (let t = 0; t < 3; t++) match.step();
    expect(match).toMatchObject({ winner: 'opponent', lost: 1 });
    const retried = story.retry();
    expect(retried).toEqual(next);
    if (retried.kind !== 'battle') return;
    expect(retried.battle).toBe(next.battle);
    const again = Match.story(
      'zmega',
      retried.battle,
      0,
      [0, -1, -1, -1, -1, -1, -1, -1],
    );
    expect(again.fighters.map((f) => f.who)).toEqual(lineUp);
    expect(again.palettes).toEqual(palettes);
  });

  it('scales each watched mark with its holder’s effective life under cheats', () => {
    const scaled = Match.story('ryuko', brAnotherStages('ryuko').stage3);
    scaled.useCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      enemyHpMultiplier: 2,
    });
    fight(scaled);
    const zenka = scaled.fighters[1]!;
    const dora = scaled.fighters[2]!;
    expect(zenka.maxHp).toBe(960);
    zenka.hp = 200;
    scaled.step();
    expect(dora.present).toBe(true);
    const native = Match.story('ryuko', brAnotherStages('ryuko').stage3);
    fight(native);
    native.fighters[1]!.hp = 200;
    native.step();
    expect(native.fighters[2]!.present).toBe(false);
    const scaledOne = Match.story('ryuko', brAnotherStages('ryuko').stage3);
    scaledOne.useCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerHpMultiplier: 2,
    });
    fight(scaledOne);
    const [one, , , , , zoma] = scaledOne.fighters;
    expect(one.maxHp).toBe(1020);
    one.hp = 200;
    scaledOne.step();
    expect(zoma.present).toBe(true);
    const plain = Match.story('ryuko', brAnotherStages('ryuko').stage3);
    fight(plain);
    plain.fighters[0]!.hp = 200;
    plain.step();
    expect(plain.fighters[5]!.present).toBe(false);
  });

  it('carries the seats’ palettes from stage 2 into stage 3 on the shared held array', () => {
    const held = [0, -1, -1, -1, -1, -1, -1, -1];
    const { stage2, stage3 } = brAnotherStages('zmega');
    const second = Match.story('zmega', stage2, 0, held);
    fight(second);
    for (const f of second.fighters.slice(1, 8)) {
      f.hp = 1;
      second.step();
    }
    expect(held).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, -1]);
    expect(second.palettes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, 0]);
    const third = Match.story('zmega', stage3, 0, held);
    expect(third.held).toBe(held);
    expect(third.palettes).toEqual([0, 1, 2, 3, 4, 5]);
    expect(held).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0, -1]);
  });

  it('plays each folded fighter’s stage 1 as one three-pair battle on Sakura Street', () => {
    for (const who of ['masa', 'times', 'zmega', 'rario'] as const) {
      const { stage1 } = brAnotherStages(who);
      const match = Match.story(who, stage1!);
      expect(match.stage, who).toBe('sakura');
      expect(
        match.fighters.map((f) => f.who),
        who,
      ).toEqual([who, ...stage1!.slots.map((s) => ROSTER[s!.player]!)]);
      const all = (1 << 8) - 1;
      expect(
        match.fighters.map((f) => f.enemies),
        who,
      ).toEqual(
        match.fighters.map((_, k) =>
          k === 0 || k === 7
            ? all & ~1 & ~(1 << 7)
            : all & ~(1 << k) & ~(1 << (k % 2 ? k + 1 : k - 1)),
        ),
      );
      expect(
        match.fighters.map((f) => f.present),
        who,
      ).toEqual([true, true, false, false, false, false, false, false]);
      fight(match);
      const [one] = match.fighters;
      for (const f of match.fighters.slice(1, 6)) {
        expect(f.present, `${who} ${f.who}`).toBe(true);
        knockOut(match, f, one);
        match.step();
      }
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner, who).toBeNull();
      const last = match.fighters[6]!;
      expect(last.present).toBe(true);
      knockOut(match, last, one);
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner, who).toBe('player');
      expect(match.lost, who).toBe(0);
    }
  });

  it('denies stage-3 boss DoraEmon his EN charge but keeps his KO RELOAD in a B.R. stage 3', () => {
    // Authored (HPA-858): on a B.R. route the charge is dead for any
    // DoraEmon seat, CPU included, while the KO RELOAD stocks stay live.
    const match = Match.story(
      'kiki',
      brAnotherStages('kiki').stage3,
      0,
      undefined,
      undefined,
      true,
    );
    expect(match.fighters.map((f) => f.who)).toEqual([
      'kiki',
      'alpha',
      'shinz',
      'zenka',
      'dora',
      'chung',
    ]);
    for (const [i, vm] of match.cpus.entries())
      if (i) vm!.input = i === 4 ? () => ({ ex: true }) : () => ({});
    fight(match);
    const [one, alpha, shinz, zenka, dora] = match.fighters;
    for (const [watched, next] of [
      [alpha, shinz],
      [shinz, zenka],
      [zenka, dora],
    ] as const) {
      watched.hp = desperationOf(watched.who) - 1;
      match.step();
      expect(next.present).toBe(true);
      watched.hp = watched.maxHp;
    }
    dora.stock = 0;
    const seen = new Set<unknown>();
    for (let t = 0; t < 120; t++) {
      match.step();
      if (dora.action === 'script') seen.add(dora.branch);
    }
    expect([...seen].some((b) => b === 239 || b === '240+3')).toBe(false);
    expect(dora.stock).toBe(0);
    dora.stock = 4;
    knockOut(match, dora, one);
    const path: unknown[] = [];
    for (let t = 0; t < 2000 && dora.hp < lifeOf('dora'); t++) {
      match.step();
      const current = playing(dora);
      if (path.at(-1) !== current) path.push(current);
    }
    expect(path.indexOf(72)).toBeGreaterThanOrEqual(0);
    expect(path.indexOf(74)).toBeGreaterThan(path.indexOf(72));
    expect([dora.hp, dora.stock, dora.downed, match.winner]).toEqual([
      lifeOf('dora'),
      1,
      true,
      null,
    ]);
    for (const boss of [alpha, shinz, zenka]) {
      knockOut(match, boss, one);
      match.step();
    }
    for (let t = 0; t < 3; t++) match.step();
    expect(match.winner).toBe('player');
  });
});

describe('boss B.R. ANOTHER', () => {
  const battlesOf = (who: Who) =>
    bossBrAnotherStory(who).filter((s): s is Battle => s.type === 1);

  it('runs Story over exactly three battles then the title, and a continue replays the very battle it lost', () => {
    for (const who of BOSSES) {
      const story = new Story(who, 'boss-br');
      const stages: number[] = [];
      for (
        let next = story.next();
        next.kind === 'battle';
        next = story.next()
      ) {
        expect(next.battle.flags & 1, who).toBe(1);
        stages.push(next.battle.stage);
      }
      expect(stages, who).toEqual([9, 3, battlesOf(who)[2]!.stage]);
      const loser = new Story(who, 'boss-br');
      const lost = loser.next();
      if (lost.kind !== 'battle') throw new Error(lost.kind);
      const again = loser.retry();
      if (again.kind !== 'battle') throw new Error(again.kind);
      expect(again.battle, who).toBe(lost.battle);
      expect(again.battle, who).toEqual(lost.battle);
    }
  });

  it('seats stages 1 and 2 as the boss plus three allied pairs and no ally', () => {
    const mate = (k: number) => (k % 2 ? k + 1 : k - 1);
    for (const who of BOSSES)
      for (const [i, stage] of ['sakura', 'sakuranight'].entries()) {
        const battle = battlesOf(who)[i]!;
        const match = Match.story(who, battle);
        expect(match.stage, `${who} ${i + 1}`).toBe(stage);
        expect(match.fighters, `${who} ${i + 1}`).toHaveLength(7);
        expect(match.fighters[0]!.who, `${who} ${i + 1}`).toBe(who);
        expect(
          match.fighters.slice(1).map((f) => f.who),
          `${who} ${i + 1}`,
        ).toEqual(battle.slots.map((s) => ROSTER[s!.player]!));
        const all = (1 << 7) - 1;
        expect(
          match.fighters.map((f) => f.enemies),
          `${who} ${i + 1}`,
        ).toEqual(
          match.fighters.map((_, k) =>
            k === 0 ? all & ~1 : all & ~(1 << k) & ~(1 << mate(k)),
          ),
        );
        expect(
          match.fighters.map((f) => f.present),
          `${who} ${i + 1}`,
        ).toEqual([true, true, false, false, false, false, false]);
      }
  });

  it('brings each later stage-1 enemy in below the mark of the fighter it watches', () => {
    const match = Match.story('zenka', battlesOf('zenka')[0]!);
    fight(match);
    for (let k = 2; k <= 6; k++) {
      const watched = match.fighters[k - 1]!;
      const next = match.fighters[k]!;
      expect(next.present, `enemy ${k} waits`).toBe(false);
      // The route toughens every watched seat to twice the life, so its
      // desperation mark reads at the doubled maximum.
      watched.hp = 2 * desperationOf(watched.who);
      match.step();
      expect(next.present, `enemy ${k} at the mark`).toBe(false);
      watched.hp = 2 * desperationOf(watched.who) - 1;
      match.step();
      expect(next.present, `enemy ${k} below the mark`).toBe(true);
    }
  });

  it('seats the three other bosses in seeded order on the last boss’s arena and wins the brawl', () => {
    for (const [who, names, stage] of [
      ['zenka', ['dora', 'shinz', 'alpha'], 'office2'],
      ['alpha', ['dora', 'zenka', 'shinz'], 'brboss'],
      ['shinz', ['alpha', 'zenka', 'dora'], 'streetnight'],
      ['dora', ['zenka', 'shinz', 'alpha'], 'office2'],
    ] as const) {
      const match = Match.story(who, battlesOf(who)[2]!);
      expect(match.stage, who).toBe(stage);
      expect(match.fighters, who).toHaveLength(4);
      expect(match.fighters[0]!.who, who).toBe(who);
      expect(
        match.fighters.slice(1).map((f) => f.who),
        who,
      ).toEqual([...names]);
      const all = (1 << 4) - 1;
      expect(
        match.fighters.map((f) => f.enemies),
        who,
      ).toEqual(
        match.fighters.map((_, k) => (k === 0 ? all & ~1 : all & ~(1 << k))),
      );
      fight(match);
      expect(
        match.fighters.map((f) => f.present),
        who,
      ).toEqual([true, true, false, false]);
      const [one] = match.fighters;
      for (const boss of match.fighters.slice(1)) {
        knockOut(match, boss, one);
        match.step();
      }
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner, who).toBe('player');
    }
  });

  it('toughens every stage-1/2 enemy seat at construction, waiting ones included, the player native', () => {
    for (const who of BOSSES)
      for (const i of [0, 1]) {
        const match = Match.story(who, battlesOf(who)[i]!);
        const [one, ...enemies] = match.fighters;
        expect(one, `${who} ${i + 1} 1P`).toMatchObject({
          hp: lifeOf(who),
          maxHp: lifeOf(who),
          maxStock: stocksOf(who),
          enGainMultiplier: 1,
        });
        for (const f of enemies)
          expect(f, `${who} ${i + 1} ${f.who}`).toMatchObject({
            hp: 2 * lifeOf(f.who),
            maxHp: 2 * lifeOf(f.who),
            maxStock: 5,
            enGainMultiplier: 2,
          });
        // The five waiting seats carry the stats before they enter.
        expect(
          match.fighters.slice(2).map((f) => f.present),
          `${who} ${i + 1} waits`,
        ).toEqual([false, false, false, false, false]);
      }
  });

  it('keeps stage 3 and every fighter on it native', () => {
    for (const who of BOSSES) {
      const match = Match.story(who, battlesOf(who)[2]!);
      for (const f of match.fighters)
        expect(f, `${who} ${f.who}`).toMatchObject({
          hp: lifeOf(f.who),
          maxHp: lifeOf(f.who),
          maxStock: stocksOf(f.who),
          enGainMultiplier: 1,
        });
    }
  });

  it('re-seats the same tough stats after a drawn round instead of doubling them', () => {
    // The route's battles run a single round; two make the reset reachable.
    // A brawl drawn by survival — the 1P and every enemy fall in the same
    // tick — scores a draw and moves both sides' win counters on.
    const match = Match.story('zenka', {
      ...battlesOf('zenka')[0]!,
      rounds: 2,
    });
    fight(match);
    for (const f of match.fighters) f.hp = 0;
    const { round } = match;
    for (let t = 0; t < 5000 && match.round === round; t++) match.step();
    expect(match.round).toBe(2);
    expect(match.wins).toEqual([1, 1]);
    const [one, ...enemies] = match.fighters;
    expect(one).toMatchObject({
      hp: lifeOf('zenka'),
      maxHp: lifeOf('zenka'),
      maxStock: stocksOf('zenka'),
      enGainMultiplier: 1,
    });
    for (const f of enemies)
      expect(f, f.who).toMatchObject({
        hp: 2 * lifeOf(f.who),
        maxHp: 2 * lifeOf(f.who),
        maxStock: 5,
        enGainMultiplier: 2,
      });
  });

  it("doubles only a tough enemy's positive EN into five 100-EN stocks, paying natively", () => {
    const match = Match.story('zenka', battlesOf('zenka')[0]!);
    const [one, enemy] = match.fighters;
    // KIKI's 100 per stock gains doubled: one native stock's worth fills two.
    addPower(enemy, 100);
    expect(enemy).toMatchObject({ stock: 2, power: 0 });
    // The cap is five stocks — KIKI's native three overridden — and the
    // surplus past it is discarded.
    addPower(enemy, 100 * 4);
    expect(enemy).toMatchObject({ stock: 5, power: 0 });
    // A negative cost borrows stock back at the native 100, not doubled.
    [enemy.stock, enemy.power] = [1, 0];
    addPower(enemy, -1);
    expect(enemy).toMatchObject({ stock: 0, power: 99 });
    // The player gains at the native rate.
    addPower(one, 100);
    expect(one).toMatchObject({ stock: 1, power: 0 });
  });

  it('leaves normal story, VS single, TEAM VS and regular B.R. ANOTHER native', () => {
    const native = (label: string, match: Match) => {
      fight(match);
      for (const f of match.fighters)
        expect(f, `${label} ${f.who}`).toMatchObject({
          hp: lifeOf(f.who),
          maxHp: lifeOf(f.who),
          maxStock: stocksOf(f.who),
          enGainMultiplier: 1,
        });
    };
    native('story', Match.story('ryuko', FIRST));
    native('vs', new Match('cpu', true, 0, ['ryuko', 'zaku'], 'court', true));
    native(
      'team',
      Match.team(
        [
          ['ryuko', 'zoma'],
          ['zaku', 'zaku'],
        ],
        'court',
      ),
    );
    native(
      'regular B.R.',
      Match.story('masa', brAnotherStages('masa').stage2!),
    );
  });

  it('derives enemy cheat HP from the seat base rather than compounding on repeat cheatSeat calls', () => {
    const match = Match.story('zenka', battlesOf('zenka')[0]!);
    match.useCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      enemyHpMultiplier: 3,
    });
    const enemy = match.fighters[1]!;
    expect(enemy.maxHp).toBe(6 * lifeOf(enemy.who));
    (match as unknown as { cheatSeat(f: Fighter, i: number): void }).cheatSeat(
      enemy,
      1,
    );
    expect(enemy.maxHp).toBe(6 * lifeOf(enemy.who));
  });
});
