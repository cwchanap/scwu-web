// The HPA-972 Match rules: round 1's starting EN, the EN gain assignment,
// the 1P low-life line with its damage cut, the verified low-HP super gates
// (both predicate directions and SIN's/SOU's idle lines), B.R.'s No partner
// re-seating with its per-kill awards, and the live Enemy HP bars option.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHEATS } from './cheats';
import type { CheatOptions } from './cheats';
import { script } from './animations';
import type { ObjectKey } from './animations';
import {
  CHARACTERS,
  lifeOf,
  stocksOf,
  superGateOf,
  SUPER_GATES,
} from './characters';
import type { Who } from './characters';
import { brAnotherStages } from './br-another';
import { Match } from './match';
import type { Fighter } from './match';
import { scenarioOf } from './story';
import type { Battle, Slot } from './story';
import { enter, named, playing, RYUKO, strike } from './testing';
import { StandingVM } from './standing';

const cheats = (fields: Partial<CheatOptions> = {}): CheatOptions => ({
  ...DEFAULT_CHEATS,
  ...fields,
});

// Ryuko's first story battle lends its slots to these tests, as the
// cheat-option tests in match.test.ts do.
const STORY_FIRST = scenarioOf('ryuko')[0] as Battle;
const storySlot = (fields: Partial<Slot> = {}): Slot => ({
  ...STORY_FIRST.slots[0]!,
  ...fields,
});
const storyBattle = (fields: Partial<Battle> = {}): Battle => ({
  ...STORY_FIRST,
  slots: [storySlot(), null, null, null, null, null, null],
  ...fields,
});
// Plays a match to the fight's first tick.
const toFight = (match: Match) => {
  while (match.roundTicks <= match.fightTick) match.step();
};
// Ends a round by emptying `losers`' life, stepping into the next round.
const finishRound = (match: Match, ...losers: number[]) => {
  for (const i of losers) match.fighters[i].hp = 0;
  const { round } = match;
  for (let t = 0; t < 5000 && match.round === round; t++) match.step();
};
function ticks(
  match: Match,
  count: number,
  input: Record<string, boolean> = {},
) {
  for (let i = 0; i < count; i++) match.step(input);
}

describe('starting EN (HPA-972)', () => {
  it('grants cap − 1 stock and no power on practice’s first active tick', () => {
    const match = new Match();
    match.useCheats(cheats({ enabled: true }));
    expect(match.ticks).toBe(0);
    match.step();
    expect(match.ticks).toBe(1);
    expect(match.fighters[0]).toMatchObject({ stock: 2, power: 0 });
    // The dummy keeps its native seat: no stock and no grant.
    expect(match.fighters[1].stock).toBe(0);
  });

  it('keeps practice native with the master switch off', () => {
    const match = new Match();
    match.useCheats(cheats({ enabled: false }));
    match.step();
    expect(match.fighters[0].stock).toBe(0);
  });

  it.each([
    ['Vs. CPU', new Match('cpu', true, 0, ['ryuko', 'zoma'])],
    ['Vs. single', new Match('cpu', true, 0, ['ryuko', 'zoma'], 'court', true)],
    ['story', Match.story('ryuko', storyBattle())],
  ] as const)(
    '%s grants on round 1’s first active tick after the intro',
    (_label, match) => {
      match.useCheats(cheats({ enabled: true }));
      // The fight tick itself is the first active one: the grant is in.
      toFight(match);
      expect(match.ticks).toBe(1);
      expect(match.fighters[0]).toMatchObject({ stock: 2, power: 0 });
    },
  );

  it('grants whatever the intro length, different letterings alike', () => {
    for (const letterings of [3, 2, 0]) {
      const match = Match.story('ryuko', storyBattle({ letterings }));
      match.useCheats(cheats({ enabled: true }));
      toFight(match);
      expect(match.ticks).toBe(1);
      expect(match.fighters[0]).toMatchObject({ stock: 2, power: 0 });
    }
  });

  it('follows the EN cap: 10 stocks grant 9, one stock grants none', () => {
    for (const [playerMaxEn, stock] of [
      [1000, 9],
      [100, 0],
    ] as const) {
      const match = new Match();
      match.useCheats(cheats({ enabled: true, playerMaxEn }));
      match.step();
      expect(match.fighters[0]).toMatchObject({ stock, power: 0 });
    }
  });

  it('lets Unlimited EN refill over the grant in the same tick', () => {
    const match = new Match();
    match.useCheats(cheats({ enabled: true, unlimitedEn: true }));
    match.step();
    expect(match.fighters[0]).toMatchObject({ stock: 3, power: 0 });
  });

  it('keeps later rounds on the native carryover', () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'zoma']);
    match.useCheats(cheats({ enabled: true, playerMaxEn: 600 }));
    toFight(match);
    expect(match.ticks).toBe(1);
    // Round 1 grants cap − 1: five of six.
    expect(match.fighters[0].stock).toBe(5);
    // A full bar carries into round 2: no second grant follows. The
    // intro's native 開始時 recharge runs on the carried EN — a −300
    // drain, then +2 a tick for 100 ticks through the snapshot's ×2.5
    // gain, which refills the surviving half back to the cap. A fresh
    // grant would hold cap − 1 instead of the cap.
    match.fighters[0].stock = 6;
    match.fighters[0].power = 0;
    finishRound(match, 1);
    expect(match.round).toBe(2);
    toFight(match);
    expect(match.ticks).toBe(1);
    expect(match.fighters[0]).toMatchObject({ stock: 6, power: 0 });
    // The master off keeps the whole path native: the carried three
    // stocks drain to none and recharge to the source's two.
    const native = new Match('cpu', true, 0, ['ryuko', 'zoma']);
    native.useCheats(cheats({ enabled: false }));
    toFight(native);
    native.fighters[0].stock = 3;
    native.fighters[0].power = 0;
    finishRound(native, 1);
    toFight(native);
    expect(native.fighters[0]).toMatchObject({ stock: 2, power: 0 });
  });
});

describe('EN gain assignment (HPA-972)', () => {
  it('assigns 1P’s gain from the effective cap, never stacked', () => {
    for (const [playerMaxEn, gain] of [
      [100, 1],
      [300, 1],
      [500, 2],
      [600, 2.5],
      [1000, 4.5],
    ] as const) {
      const match = new Match();
      match.useCheats(cheats({ enabled: true, playerMaxEn }));
      expect(match.fighters[0].maxStock).toBe(playerMaxEn / 100);
      expect(match.fighters[0].enGainMultiplier).toBe(gain);
    }
  });

  it('assigns native high-stock enemies ×2 and ×2.5 at default settings', () => {
    for (const [who, gain] of [
      ['ryuko', 1],
      ['zenka', 2],
      ['shinz', 2.5],
    ] as const) {
      const match = new Match('practice', false, 0, ['ryuko', who]);
      match.useCheats(cheats({ enabled: true }));
      expect(match.fighters[1].maxStock).toBe(stocksOf(who));
      expect(match.fighters[1].enGainMultiplier).toBe(gain);
    }
  });

  it('keeps a tough five-stock seat at ×2, and caps its stocks at ten', () => {
    const seat = (multiplier: number) => {
      const match = Match.story(
        'ryuko',
        storyBattle({
          slots: [
            storySlot({ tough: true }),
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        }),
      );
      match.useCheats(
        cheats({ enabled: true, enemyStocksMultiplier: multiplier }),
      );
      return match.fighters[1];
    };
    // ZAKU's route base: ×2 life at the five-stock cap, whose gain is ×2 —
    // never ×4 from stacking onto the route's own ×2.
    expect(seat(1)).toMatchObject({
      maxHp: 400,
      hp: 400,
      maxStock: 5,
      enGainMultiplier: 2,
    });
    // ×2 stocks caps at min(10, 5 × 2), whose gain is ×4.5.
    expect(seat(2)).toMatchObject({ maxStock: 10, enGainMultiplier: 4.5 });
  });

  it('caps a native six-stock enemy’s stocks at ten under ×3', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'shinz']);
    match.useCheats(cheats({ enabled: true, enemyStocksMultiplier: 3 }));
    expect(match.fighters[1]).toMatchObject({
      maxStock: 10,
      enGainMultiplier: 4.5,
    });
  });

  it('seats allies by Partner HP ×, at their own gain', () => {
    const match = Match.story(
      'ryuko',
      storyBattle({
        slots: [
          storySlot(),
          storySlot({ flags: 0x201 }),
          null,
          null,
          null,
          null,
          null,
        ],
      }),
    );
    match.useCheats(cheats({ enabled: true, partnerHpMultiplier: 2 }));
    const [, enemy, ally] = match.fighters;
    // ZAKU's 200 × 2 as the 1P's ally, with its native one-stock gain.
    expect(ally).toMatchObject({
      maxHp: 400,
      hp: 400,
      maxStock: 1,
      enGainMultiplier: 1,
    });
    // The enemy keeps its own multiplier path.
    expect(enemy).toMatchObject({ maxHp: 200, enGainMultiplier: 1 });
  });

  it('retains the native gains, the tough ×2 included, with the master off', () => {
    const practice = new Match('practice', false, 0, ['ryuko', 'zenka']);
    practice.useCheats(cheats({ enabled: false }));
    expect(practice.fighters[1].enGainMultiplier).toBe(1);
    const story = Match.story(
      'ryuko',
      storyBattle({
        slots: [storySlot({ tough: true }), null, null, null, null, null, null],
      }),
    );
    story.useCheats(cheats({ enabled: false, enemyStocksMultiplier: 5 }));
    expect(story.fighters[1]).toMatchObject({
      maxStock: 5,
      enGainMultiplier: 2,
    });
  });

  it('recomputes, never compounds, on the next round’s re-seat', () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'shinz']);
    match.useCheats(cheats({ enabled: true, playerMaxEn: 600 }));
    expect(match.fighters[0].enGainMultiplier).toBe(2.5);
    expect(match.fighters[1].enGainMultiplier).toBe(2.5);
    finishRound(match, 1);
    expect(match.round).toBe(2);
    toFight(match);
    expect(match.fighters[0].enGainMultiplier).toBe(2.5);
    expect(match.fighters[1].enGainMultiplier).toBe(2.5);
  });
});

describe('low-life line and damage cut (HPA-972)', () => {
  // Punches 1P once at `hp` under `fields`: the practice partner strikes.
  const punched = (hp: number, fields: Partial<CheatOptions> = {}) => {
    const match = new Match();
    match.useCheats(cheats({ enabled: true, ...fields }));
    const [one, dummy] = match.fighters;
    dummy.x = one.x + 200;
    one.hp = hp;
    strike(match, dummy, RYUKO.punch);
    ticks(match, 2);
    return one.hp;
  };
  // Punches the fighter at index `victim` once, from the other side.
  const punchedAt = (
    victim: 0 | 1,
    hp: number,
    fields: Partial<CheatOptions> = {},
  ) => {
    const match = new Match('practice', false, 0, ['ryuko', 'ryuko']);
    match.useCheats(cheats({ enabled: true, ...fields }));
    const [one, dummy] = match.fighters;
    dummy.x = one.x + 200;
    (match.fighters[victim] as Fighter).hp = hp;
    strike(match, victim === 0 ? dummy : one, RYUKO.punch);
    ticks(match, 2);
    return match.fighters[victim].hp;
  };

  it('keeps the native 30% line and reduction at the defaults', () => {
    // Ryuko's punch 1 lands 10: at 152 (≤153) it shrinks to 6, at 154 it
    // lands whole.
    expect(punched(152)).toBe(146);
    expect(punched(154)).toBe(144);
    expect(punchedAt(1, 152)).toBe(146);
  });

  it('moves 1P’s reduction line with the Low HP line, others native', () => {
    // 60% of the effective maximum: the reduction now reaches 306.
    expect(punched(306, { lowHpLine: 60 })).toBe(300);
    expect(punched(308, { lowHpLine: 60 })).toBe(298);
    // The opponent's line stays the native 30%: at 306 of its 510 the
    // punch lands whole, far above the 153 mark.
    expect(punchedAt(1, 306, { lowHpLine: 60 })).toBe(296);
    // A line of 0 never reduces.
    expect(punched(152, { lowHpLine: 0 })).toBe(142);
  });

  it('scales the reduction by Damage cut ×, from none to all of it', () => {
    // ×0 keeps every point whole at the line.
    expect(punched(152, { damageCutMultiplier: 0 })).toBe(142);
    // ×2.5 on Ryuko's native 40% reaches the full 100%: no damage at all,
    // flooring included.
    expect(punched(152, { damageCutMultiplier: 2.5 })).toBe(152);
    expect(punched(10, { damageCutMultiplier: 2.5 })).toBe(10);
    // ×1 stays the native 60%.
    expect(punched(152, { damageCutMultiplier: 1 })).toBe(146);
  });

  it('cuts CHUNG’s and ALPHA’s native reductions by the same rule', () => {
    const struck = (
      who: Who,
      hp: number,
      fields: Partial<CheatOptions> = {},
    ) => {
      const match = new Match('practice', false, 0, [who, 'ryuko']);
      match.useCheats(cheats({ enabled: true, ...fields }));
      const [one, dummy] = match.fighters;
      dummy.x = one.x + 200;
      one.hp = hp;
      strike(match, dummy, RYUKO.punch);
      ticks(match, 2);
      return one.hp;
    };
    // CHUNG takes 65%: ×1 keeps 6 of 10, ×2 keeps 3, ×5 keeps none.
    expect(struck('chung', 152)).toBe(146);
    expect(struck('chung', 152, { damageCutMultiplier: 2 })).toBe(149);
    expect(struck('chung', 152, { damageCutMultiplier: 5 })).toBe(152);
    // ALPHA takes 45% at its own 150 line: ×1 keeps 4 of 10, ×2 caps at
    // the whole 100% and leaves her untouched.
    expect(struck('alpha', 150)).toBe(146);
    expect(struck('alpha', 150, { damageCutMultiplier: 2 })).toBe(150);
    // A mid cut keeps the native floor: ALPHA at ×1.5 keeps 17.5%, so 1.
    expect(struck('alpha', 150, { damageCutMultiplier: 1.5 })).toBe(149);
  });

  it('holds practice Low health just under the moved line', () => {
    const match = new Match();
    match.practice.lowHealth = true;
    match.useCheats(
      cheats({ enabled: true, playerHpMultiplier: 2, lowHpLine: 60 }),
    );
    match.step();
    // 60% of 1020 is 612; the native line would hold 305.
    expect(match.fighters[0].hp).toBe(611);
  });

  it('holds practice Low health at 1 HP when the line is 0%', () => {
    const match = new Match();
    match.practice.lowHealth = true;
    match.useCheats(cheats({ enabled: true, lowHpLine: 0 }));
    match.step();
    // The 0% mark is 0: the hold clamps at 1 instead of writing a negative,
    // truthy life.
    expect(match.fighters[0].hp).toBe(1);
  });

  it('reads a non-divisible percent off the scaled maximum exactly', () => {
    const match = new Match();
    match.practice.lowHealth = true;
    match.useCheats(
      cheats({ enabled: true, playerHpMultiplier: 100, lowHpLine: 1 }),
    );
    match.step();
    // 1% of the ×100 bar is 510 — the percent reaches the effective
    // maximum whole, so the hold keeps 509 (a mark truncated before
    // scaling would read 500 and hold 499).
    expect(match.fighters[0].hp).toBe(509);
  });
});

describe('low-HP super gates (HPA-972)', () => {
  // A practice pair at fighting range for the shortcut-key supers.
  const superMatch = () => {
    const match = new Match();
    const [ryuko, target] = match.fighters;
    ryuko.x = 500;
    target.x = 750;
    ryuko.stock = 3;
    return { match, ryuko, target };
  };

  it('tables only real generated life events with values above one', () => {
    for (const [who, gates] of Object.entries(SUPER_GATES)) {
      for (const [key, gate] of Object.entries(gates)) {
        const life = script(key as ObjectKey, who as Who).events.filter(
          (e) => e.op === 'life',
        );
        expect(life, `${who} ${key}`).toHaveLength(1);
        expect(
          life.map((e) =>
            e.op === 'life' ? { below: e.below, value: e.value } : null,
          ),
          `${who} ${key}`,
        ).toEqual([{ below: gate.below, value: gate.value }]);
        expect(gate.value).toBeGreaterThan(1);
        expect(superGateOf(who as Who, key)).toBe(gate);
      }
    }
  });

  it('runs Ryuko’s hidden super at any HP with the option on', () => {
    const above = superMatch();
    above.match.useCheats(cheats({ enabled: true, lowHpSupers: true }));
    above.ryuko.hp = 250;
    above.match.step({ blackRush: true });
    // Native: at 250 (≥153) the axe throw takes the command.
    const native = superMatch();
    native.ryuko.hp = 250;
    native.match.step({ blackRush: true });
    expect(named(native.ryuko)).toBe('axeThrow');
    expect(named(above.ryuko)).toBe('blackRush');
  });

  it('keeps Getter Beam’s desperation form gated without the option', () => {
    const { match, ryuko } = superMatch();
    ryuko.hp = 250;
    match.step({ getterBeam: true });
    // The life check (264, value 153) fails at 250: the beam plays.
    expect(named(ryuko)).toBe('getterBeam');
  });

  it('forces a below:true gate’s jump at any HP', () => {
    const { match, ryuko } = superMatch();
    match.useCheats(cheats({ enabled: true, lowHpSupers: true }));
    ryuko.hp = 250;
    match.step({ getterBeam: true });
    // Forced through the 153 check into G BEAM EVIL (278–280).
    expect(['evilBeam', 'scEvilBeam', 'airEvilBeam']).toContain(named(ryuko));
  });

  it('suppresses the hidden super cancel’s high-HP escape to NO SUPER', () => {
    const run = (fields: Partial<CheatOptions>) => {
      const { match, ryuko } = superMatch();
      match.useCheats(cheats(fields));
      ryuko.hp = 250;
      // Action 254 at offset 9, the hidden super's cancel entry.
      enter(match, ryuko, 254, 1, 9);
      return named(ryuko);
    };
    // Native: at 250 (≥150) the cancel bails to NO SUPER (251).
    expect(run({ enabled: false })).toBe('noSuper');
    expect(run({ enabled: true })).toBe('noSuper');
    // The option suppresses the escape and the cancel plays on: the
    // branch stays the cancel entry, action 254 at offset 9.
    const { match, ryuko } = superMatch();
    match.useCheats(cheats({ enabled: true, lowHpSupers: true }));
    ryuko.hp = 250;
    enter(match, ryuko, 254, 1, 9);
    expect(String(playing(ryuko))).toBe('254+9');
  });

  it('moves the tabled thresholds with the Low HP line', () => {
    const run = (hp: number, lowHpLine: number) => {
      const { match, ryuko } = superMatch();
      match.useCheats(cheats({ enabled: true, lowHpLine }));
      ryuko.hp = hp;
      match.step({ blackRush: true });
      return named(ryuko);
    };
    // 60% doubles the axe-throw threshold 153 → 306.
    expect(run(300, 60)).toBe('blackRush');
    expect(run(400, 60)).toBe('axeThrow');
    // The native line keeps the native threshold.
    expect(run(300, 30)).toBe('axeThrow');
  });

  it('keeps a non-divisible gate threshold exact at a high maximum', () => {
    const run = (hp: number) => {
      const { match, ryuko } = superMatch();
      match.useCheats(
        cheats({ enabled: true, playerHpMultiplier: 100, lowHpLine: 1 }),
      );
      ryuko.hp = hp;
      match.step({ blackRush: true });
      return named(ryuko);
    };
    // 153 × 1/30 of the ×100 bar scales to 510 whole (a mark truncated
    // before scaling would read 500): 505 is under the super, 511 past it.
    expect(run(505)).toBe('blackRush');
    expect(run(511)).toBe('axeThrow');
  });

  it('leaves untabled life checks native under the option', () => {
    const { match, ryuko } = superMatch();
    match.useCheats(cheats({ enabled: true, lowHpSupers: true }));
    // DST's Evil swap (214, value 153) is no super gate: at 400 it must
    // not jump.
    ryuko.hp = 400;
    enter(match, ryuko, RYUKO.dst, 1);
    expect(named(ryuko)).toBe('dst');
    // At 152 the native check still swaps to Evil DST.
    ryuko.hp = 152;
    enter(match, ryuko, RYUKO.dst, 1);
    expect(named(ryuko)).toBe('evilDst');
  });

  it('moves SIN’s idle stance line without ever bypassing it', () => {
    const stance = (life: number, scale: number) => {
      const vm = new StandingVM(CHARACTERS.sin.idle);
      vm.life = life;
      vm.lifeMax = 1100;
      vm.lifeNative = 550;
      vm.lifeLineScale = scale;
      for (let t = 0; t < 40 && !vm.ended; t++) vm.tick();
      // The tired loop's images (334–339) show only past the check.
      return vm.events.some((e) => e.image >= 334 && e.image <= 339);
    };
    // SIN's op 0x11 (PC 16, value 165): the tired loop at 330 of the
    // doubled effective maximum, at the native mark with scale 1.
    expect(stance(330, 1)).toBe(true);
    expect(stance(331, 1)).toBe(false);
    // The Low HP line of 60 doubles the mark 330 → 660.
    expect(stance(500, 2)).toBe(true);
    expect(stance(660, 2)).toBe(true);
    expect(stance(661, 2)).toBe(false);
    // A line of 0 closes the stance change entirely.
    expect(stance(100, 0)).toBe(false);
  });

  it('moves SOU’s idle stance line the same way', () => {
    const stance = (life: number, scale: number) => {
      const vm = new StandingVM(CHARACTERS.sou.idle);
      vm.life = life;
      vm.lifeMax = 960;
      vm.lifeNative = 480;
      vm.lifeLineScale = scale;
      for (let t = 0; t < 40 && !vm.ended; t++) vm.tick();
      // The tired stand shows its image 360 only past the check.
      return vm.events.some((e) => e.image === 360);
    };
    // SOU's op 0x11 (PC 8, value 144) at the native mark.
    expect(stance(288, 1)).toBe(true);
    expect(stance(289, 1)).toBe(false);
    // At 60% the mark 288 doubles to 576.
    expect(stance(400, 2)).toBe(true);
    expect(stance(576, 2)).toBe(true);
    expect(stance(577, 2)).toBe(false);
    expect(stance(100, 0)).toBe(false);
  });
});

describe('B.R. No partner (HPA-972)', () => {
  // A regular B.R. ANOTHER battle: pairs of enemies with the route's ally.
  const brMatch = (fields: Partial<CheatOptions> = {}) => {
    const battle = brAnotherStages('masa').stage2!;
    const match = Match.story('masa', battle, 0, undefined, undefined, true);
    match.useCheats(cheats({ enabled: true, ...fields }));
    return { match, battle };
  };

  it('re-seats once without the ally at snapshot installation', () => {
    const native = Match.story(
      'masa',
      brAnotherStages('masa').stage2!,
      0,
      undefined,
      undefined,
      true,
    );
    const withAlly = native.fighters.map((f) => f.who);
    const { match } = brMatch({ brNoPartner: true });
    const without = match.fighters.map((f) => f.who);
    // One fighter fewer — the ally — everyone else in place.
    expect(without.length).toBe(withAlly.length - 1);
    expect(without).toEqual(expect.arrayContaining(without));
    const ally = withAlly.find((who) => !without.includes(who));
    expect(withAlly.filter((who) => who === ally)).toHaveLength(1);
    expect(match.cheats.brNoPartner).toBe(true);
    // The rebuilt 1P sits under the snapshot.
    expect(match.fighters[0].maxHp).toBe(lifeOf('masa'));
    // The route's slot numbers keep their places: exactly one seat drops,
    // the ally's (its mask spares the 1P), and the rest renumber not.
    const seatsOf = (m: Match) => (m as unknown as { seats: number[] }).seats;
    const nativeSeats = seatsOf(native);
    const dropped = nativeSeats.filter((s) => !seatsOf(match).includes(s));
    expect(dropped).toHaveLength(1);
    expect(native.fighters[nativeSeats.indexOf(dropped[0])].enemies & 1).toBe(
      0,
    );
    expect(seatsOf(match)).toEqual(nativeSeats.filter((s) => s !== dropped[0]));
  });

  it('leaves no duplicated pre-fight objects', () => {
    const { match } = brMatch({ brNoPartner: true });
    expect(match.effects).toHaveLength(0);
    // Only the re-held KGT 13 opening object.
    expect((match as unknown as { kgt: unknown[] }).kgt).toHaveLength(1);
  });

  it('keeps the native story seating with the option off', () => {
    const { match, battle } = brMatch();
    const expected = battle.slots.filter(Boolean).length + 1;
    expect(match.fighters).toHaveLength(expected);
    expect(match.fighters.map((f) => f.who)).toEqual(
      Match.story('masa', battle, 0, undefined, undefined, true).fighters.map(
        (f) => f.who,
      ),
    );
  });

  it('only ever touches a B.R. battle', () => {
    const battle = storyBattle({
      slots: [
        storySlot(),
        storySlot({ flags: 0x201 }),
        null,
        null,
        null,
        null,
        null,
      ],
    });
    const match = Match.story('ryuko', battle);
    match.useCheats(cheats({ enabled: true, brNoPartner: true }));
    // The regular story keeps its ally.
    expect(match.fighters).toHaveLength(3);
  });

  // A forced KO queues the same lose action a hit's KO does (dora.test.ts);
  // `caught` stays unset, so nobody scores it unless a test names the
  // striker. The award slot seats first, so the victim is fighters[1].
  const ko = (
    br: boolean,
    flags: number,
    fields: Partial<CheatOptions> = {},
    strike1p = false,
  ) => {
    const match = Match.story(
      'ryuko',
      storyBattle({
        slots: [
          storySlot({ flags, life: 100, power: 100 }),
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      }),
      0,
      undefined,
      undefined,
      br,
    );
    match.useCheats(cheats({ enabled: true, ...fields }));
    const [one, victim] = match.fighters;
    // A near-empty bar and gauge make both awards visible: the life share
    // moves the bar, and the power fills stock 1 without capping out.
    one.hp = 100;
    one.stock = 0;
    one.power = 0;
    if (strike1p) victim.caught = one;
    victim.hp = 0;
    (match as unknown as { knockOut(f: Fighter): void }).knockOut(victim);
    return [one.hp, one.power, one.stock] as const;
  };

  it('replaces only a B.R. kill award paid to the 1P', () => {
    // The source award pays 100 native life and 100 power to the 1P: the
    // life share lifts 100 to 200, and the power fills stock 1 at the
    // ×1 gain of its native one-stock cap.
    expect(ko(true, 0x80)).toEqual([200, 0, 1]);
    // A positive HP override replaces the life award with its own share:
    // 255 native units on Ryuko's bar at the default multipliers.
    expect(ko(true, 0x80, { brHpPerKill: 255 })).toEqual([355, 0, 1]);
    // Zero skips the gain entirely (lifeAmountOf(0) would force 1); the
    // EN award stands.
    expect(ko(true, 0x80, { brHpPerKill: 0 })).toEqual([100, 0, 1]);
    // The EN override replaces the power award; zero skips it.
    expect(ko(true, 0x80, { brEnPerKill: 250 })).toEqual([200, 50, 2]);
    expect(ko(true, 0x80, { brEnPerKill: 0 })).toEqual([200, 0, 0]);
  });

  it('keeps the source award outside B.R. and for other recipients', () => {
    // The same overrides outside a B.R. route: the native award stands.
    expect(ko(false, 0x80, { brHpPerKill: 0, brEnPerKill: 0 })).toEqual([
      200, 0, 1,
    ]);
    // A B.R. award paid to the striker (bits 2) is not 1P's own: the 1P
    // collects it only as the striker, through the source amounts.
    expect(ko(true, 0x100, { brHpPerKill: 0, brEnPerKill: 0 }, true)).toEqual([
      200, 0, 1,
    ]);
    // The master off keeps the source award whatever the overrides.
    expect(ko(true, 0x80, { enabled: false })).toEqual([200, 0, 1]);
  });
});

describe('live enemy bars (HPA-972)', () => {
  it('shows a hostile’s bar only while the option is on, without cheats', () => {
    const match = new Match();
    expect(match.lifeBars).toHaveLength(0);
    match.practice.enemyBars = true;
    expect(match.lifeBars).toEqual([match.fighters[1]]);
    match.fighters[1].hp = 0;
    expect(match.lifeBars).toHaveLength(0);
  });

  it('keeps the story allies’ bars and adds the option’s enemies', () => {
    const match = Match.story(
      'ryuko',
      storyBattle({
        slots: [
          storySlot({ flags: 0x201 }),
          storySlot(),
          null,
          null,
          null,
          null,
          null,
        ],
      }),
    );
    // The ally's slot sets the bar bit; the hostile does not show.
    expect(match.lifeBars).toEqual([match.fighters[1]]);
    match.practice.enemyBars = true;
    expect(match.lifeBars).toEqual([match.fighters[1], match.fighters[2]]);
  });

  it('bars a living summoned ally with the option off or on, a summoned enemy only with it on', () => {
    const match = Match.story('ryuko', storyBattle());
    // A summon holds no slot and an ally is no hostile of the 1P, so only
    // the summon clause bars it; it is present, shown and living from its
    // spawn on.
    const ally = match.summon('shinz', 1, DEFAULT_CHEATS)!;
    const foe = match.summon('zoma', -1, DEFAULT_CHEATS)!;
    expect(match.lifeBars).toEqual([ally]);
    match.practice.enemyBars = true;
    expect(match.lifeBars).toEqual([match.fighters[1], ally, foe]);
    // Living, present and shown gate every clause: a fallen ally drops out,
    // and with the option off only the summon keeps its bar.
    ally.hp = 0;
    expect(match.lifeBars).toEqual([match.fighters[1], foe]);
    // Turning the option off leaves nothing: the summoned enemy's bar was
    // the option's alone, and the fallen ally's was the summon clause's.
    match.practice.enemyBars = false;
    expect(match.lifeBars).toEqual([]);
  });

  it('applies in every mode, instantly', () => {
    const match = new Match('cpu', true, 0, ['ryuko', 'zoma']);
    expect(match.lifeBars).toHaveLength(0);
    // No cheats and no restart: the hostile stands present, shown and
    // living from the intro on, so its bar follows at once.
    match.practice.enemyBars = true;
    expect(match.lifeBars).toEqual([match.fighters[1]]);
    toFight(match);
    expect(match.lifeBars).toEqual([match.fighters[1]]);
  });
});
