import { describe, expect, it } from 'vitest';
import { DRESS_TICK, letteringSounds } from './hud';
import { CPU_TABLES } from './cpu';
import { firstStrike, LIFE, Match } from './match';
import type { Fighter } from './match';
import type { Who } from './characters';
import { scenarioOf, Story } from './story';
import { enter, RYUKO } from './testing';
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
        action: damage ? 'koAgain' : 'hit',
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
    ).toEqual([[32], ['32+2'], ['30+9', 150]]);
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

  it('picks the mode by the Chii the 1P strikes at global 10 = 10', () => {
    // Story's mode select: each Chii's 通常立ち takes its stance (PC 3), and
    // a strike enters Hit Mode (177, 178; PCs 751, 758), whose box meets the
    // 1P's VS CHARGE far below and whose skill sets global 9. The Chii's
    // logo then KOs it, the pair watching it enter its modes (Easy and
    // Hard, BR ZERO and BR Another), and KOing one costs the 1P the life
    // that steps 1–3 read (Single Start's 1, then 100, 346, 347 or 348).
    // The other Chii vanishes, and loses into INAI (11, PC 492) as the round
    // ends.
    const STANCE = /^1\+(1[56]|3[2367])$/;
    const mode = (picks: Who[]) => {
      const match = Match.story(
        'ryuko',
        FIRST,
        0,
        undefined,
        left({ 2: 50, 3: 10, 10: 10 }),
      );
      for (let t = 0; t < 10; t++) match.step();
      const stances = match.fighters.slice(1, 3).map(({ branch }) => branch);
      for (let t = 0; !match.resultReady && t < 5000; t++) {
        const [one, ...rest] = match.fighters;
        const pick = picks[rest.filter((f) => f.present && !f.hp).length];
        const target = rest.find(
          (f) => f.who === pick && f.hp && STANCE.test(`${f.branch}`),
        );
        const dx = target ? target.x - one.x : 0;
        match.step(
          !target || match.winner
            ? {}
            : Math.abs(dx) > 90
              ? { [dx < 0 ? 'left' : 'right']: true }
              : { punch: t % 20 === 0 },
        );
      }
      const story = new Story('ryuko');
      story.next();
      story.next(match.fighters[0].hp);
      const vanished = match.fighters[picks[0] === 'zaku' ? 2 : 1];
      return [...stances, vanished.branch, match.fighters[0].hp, story.step];
    };
    expect(
      (
        [
          ['zaku', 'zaku'],
          ['zaku', 'pachelo'],
          ['pachelo', 'zaku'],
          ['pachelo', 'pachelo'],
        ] as Who[][]
      ).map(mode),
    ).toEqual([
      ['1+16', '1+15', 11, 409, 4],
      ['1+16', '1+15', 11, 163, 21],
      ['1+16', '1+15', 11, 162, 47],
      ['1+16', '1+15', 11, 161, 62],
    ]);
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
