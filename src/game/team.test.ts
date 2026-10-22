import { describe, expect, it } from 'vitest';
import { DRESS_TICK } from './hud';
import { LIFE, Match } from './match';
import type { Fighter } from './match';
import { scenarioOf } from './story';
import type { Battle, Slot } from './story';

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
const fight = (match: Match) => {
  while (match.roundTicks < match.fightTick) match.step();
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

  it('ends the round at 100 points, the 1P winning and the slots losing', () => {
    const match = Match.story('ryuko', FIRST);
    fight(match);
    const [ryuko, zaku, pachelo, three] = match.fighters;
    knockOut(match, pachelo, ryuko);
    // Seat 2 gives seat 0 nothing; its reinforcements 100 each.
    expect(ryuko.points).toBe(0);
    match.step();
    expect(match.winner).toBeNull();
    knockOut(match, three, ryuko);
    expect(ryuko.points).toBe(100);
    match.step();
    expect(match).toMatchObject({ winner: 'player', wins: [1, 0], lost: 0 });
    expect(match.matchOver).toBe(true);
    // Back in neutral each takes its result: ZAKU, standing, the lose action.
    while (ryuko.action !== 'win') match.step();
    expect(zaku.action).toBe('down');
  });

  it('draws when the 1P falls and no one scores', () => {
    const match = Match.story('ryuko', FIRST);
    fight(match);
    const [ryuko, zaku] = match.fighters;
    knockOut(match, ryuko, zaku);
    match.step();
    expect(match).toMatchObject({ winner: 'draw', wins: [1, 1], lost: 1 });
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
});

describe('Vs. results', () => {
  it('compare life per mille at a time-up (0x408f68)', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'zaku']);
    const [ryuko, zaku] = match.fighters;
    // 255 of 510 is 500; 101 of 200 is 505.
    ryuko.hp = 255;
    zaku.hp = 101;
    match.ticks = 5999;
    match.step();
    expect(match.winner).toBe('opponent');
  });
});
