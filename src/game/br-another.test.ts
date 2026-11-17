import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, stocksOf } from './characters';
import type { Who } from './characters';
import { Match } from './match';
import { BOSSES, ROSTER } from './select';
import { opensOnModeSelect } from './story';
import type { Battle, Step } from './story';
import { brAnotherStages, bossBrAnotherStory } from './br-another';
import type { BrAnotherStages } from './br-another';

const ELIGIBLE = (Object.keys(CHARACTERS) as Who[]).filter((who) =>
  opensOnModeSelect(who),
);
const FOLDED: readonly Who[] = ['masa', 'times', 'zmega', 'rario'];
const TWINS: readonly Who[] = ['yinan', 'aya'];
const OWN_PAIR: readonly Who[] = [
  'gigi',
  'sww',
  'masa',
  'times',
  'yinan',
  'aya',
  'ogi',
  'ziro',
];
const STAGE_ONE_POOL: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
  [14, 15],
  [16, 17],
  [18, 19],
  [20, 21],
  [22, 23],
];
const STAGE_TWO_PAIRS: readonly (readonly [number, number])[] = [
  [24, 25],
  [28, 29],
  [40, 41],
  [26, 27],
];
const BOSS_SEATS = BOSSES.map((who) => ROSTER.indexOf(who));
const ARENAS: ReadonlyMap<number, number> = new Map([
  [30, 12],
  [32, 14],
  [33, 15],
  [45, 18],
]);
const HEADER_KEYS = [
  'type',
  'rounds',
  'recover',
  'flags',
  'time',
  'x',
  'letterings',
  'timeUp',
  'koScorer',
  'koPoints',
] as const;

const sourceStep = (who: Who, index: number) =>
  (CHARACTERS[who].scenario as readonly Step[])[index] as Battle;
const finaleOf = (who: Who) =>
  sourceStep(who, FOLDED.includes(who) ? 49 : TWINS.includes(who) ? 67 : 65);

const pairsOf = (players: readonly number[]) =>
  Array.from(
    { length: players.length / 2 },
    (_, i) => [players[2 * i]!, players[2 * i + 1]!] as const,
  );

const built = (stages: BrAnotherStages): Battle[] =>
  [stages.stage1, stages.stage2, stages.stage3].filter(
    (battle): battle is Battle => battle !== null,
  );

const enemyMask = (battle: Battle, i: number, paired: boolean) => {
  const last = battle.slots.length - 1;
  const all = (1 << (last + 2)) - 1;
  if (i === last) return all & ~1 & ~(1 << (last + 1));
  let mask = all & ~(1 << (i + 1));
  if (paired) mask &= ~(1 << (i % 2 === 0 ? i + 2 : i));
  return mask;
};

const expectRoles = (
  who: Who,
  battle: Battle,
  roles: Battle,
  paired: boolean,
) => {
  const ally = roles.slots[6]!;
  const n = battle.slots.length - 1;
  battle.slots.forEach((slot, i) => {
    const role =
      i === n
        ? ally
        : i === 0
          ? roles.slots[0]!
          : i === n - 1
            ? roles.slots[5]!
            : roles.slots[1]!;
    const { player, enemies, watch, below, x } = slot!;
    expect(slot, `${who} slot ${i}`).toEqual({
      ...role,
      player,
      enemies,
      watch,
      below,
      x,
    });
    expect(slot!.enemies, `${who} slot ${i}`).toBe(
      enemyMask(battle, i, paired),
    );
  });
  const players = battle.slots.map((s) => s!.player);
  expect(
    battle.slots.map((s) => s!.watch),
    who,
  ).toEqual([0, ...Array.from({ length: n - 1 }, (_, i) => i + 1), 0]);
  expect(
    battle.slots.map((s) => s!.x),
    who,
  ).toEqual([
    ...Array.from({ length: n - 1 }, (_, i) => (i % 2 === 0 ? 850 : 450)),
    450,
    ally.x,
  ]);
  expect(
    battle.slots.map((s) => s!.below),
    who,
  ).toEqual([
    0,
    ...players.slice(0, n - 1).map((p) => desperationOf(ROSTER[p]!)),
    desperationOf(who),
  ]);
};

describe('BR Another seeded lineup builder', () => {
  it('rebuilds the same seeded lineups for a fighter on every call', () => {
    expect(brAnotherStages('masa')).toEqual(brAnotherStages('masa'));
    expect(brAnotherStages('ryuko')).toEqual(brAnotherStages('ryuko'));
    expect(brAnotherStages('rario')).toEqual(brAnotherStages('rario'));
  });

  it('lets different fighters draw different orders from their roster seeds', () => {
    expect(ELIGIBLE).toHaveLength(34);
    const orders = new Set(
      ELIGIBLE.map((who) =>
        brAnotherStages(who)
          .stage3.slots.slice(0, 4)
          .map((s) => s!.player)
          .join(','),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
    const pairs = new Set(
      ELIGIBLE.map((who) =>
        brAnotherStages(who)
          .stage2.slots.map((s) => s!.player)
          .join(','),
      ),
    );
    expect(pairs.size).toBeGreaterThan(1);
  });

  it('builds stage 1 only for the folded fighters on the twelve regular pairs', () => {
    const template = sourceStep('ryuko', 63);
    for (const who of ELIGIBLE.filter((who) => !FOLDED.includes(who)))
      expect(brAnotherStages(who).stage1, who).toBeNull();
    for (const who of FOLDED) {
      const { stage1 } = brAnotherStages(who);
      expect(stage1).not.toBeNull();
      expect(stage1!.slots).toHaveLength(7);
      const enemies = stage1!.slots.slice(0, -1).map((s) => s!.player);
      const drawn = pairsOf(enemies);
      expect(new Set(enemies).size, who).toBe(6);
      for (const [a, b] of drawn)
        expect(
          STAGE_ONE_POOL.some(([pa, pb]) => pa === a && pb === b),
          `${who} drew [${a}, ${b}]`,
        ).toBe(true);
      expect(stage1!.slots.at(-1)!.player, who).toBe(
        finaleOf(who).slots[6]!.player,
      );
      expectRoles(who, stage1!, template, true);
      const opener = sourceStep(who, 45);
      for (const key of HEADER_KEYS)
        expect(stage1![key], `${who} ${key}`).toBe(opener[key]);
      expect(stage1!.stage).toBe(9);
    }
    expect(brAnotherStages('times').stage1!.x).toBe(300);
    expect(brAnotherStages('times').stage1!.slots[0]!.delay).toBe(0);
    expect(
      Object.fromEntries(
        FOLDED.map((who) => [
          who,
          brAnotherStages(who).stage1!.slots.map((s) => s?.player),
        ]),
      ),
    ).toEqual({
      masa: [12, 13, 0, 1, 22, 23, 29],
      times: [14, 15, 20, 21, 12, 13, 28],
      zmega: [4, 5, 0, 1, 12, 13, 46],
      rario: [4, 5, 2, 3, 22, 23, 31],
    });
  });

  it('seats the seeded stage-2 pairs on sakuranight minus the pair holding the fighter', () => {
    for (const who of ELIGIBLE) {
      const { stage2 } = brAnotherStages(who);
      const index = ROSTER.indexOf(who);
      const expectedPairs = STAGE_TWO_PAIRS.filter(
        (pair) => !pair.includes(index),
      );
      const enemies = stage2.slots.slice(0, -1).map((s) => s!.player);
      const actualPairs = pairsOf(enemies);
      const finale = finaleOf(who);
      expect(stage2.slots, who).toHaveLength(expectedPairs.length * 2 + 1);
      expect(new Set(enemies).size, who).toBe(expectedPairs.length * 2);
      for (const [a, b] of actualPairs)
        expect(
          expectedPairs.some(([pa, pb]) => pa === a && pb === b),
          `${who} stage2 pair [${a}, ${b}]`,
        ).toBe(true);
      expect(stage2.slots.at(-1)!.player, who).toBe(finale.slots[6]!.player);
      for (const key of HEADER_KEYS)
        expect(stage2[key], `${who} ${key}`).toBe(finale[key]);
      expect(stage2.stage, who).toBe(3);
      expectRoles(who, stage2, finale, true);
    }
    expect(
      Object.fromEntries(
        (['ryuko', 'kiki', 'gigi', 'yinan', 'masa'] as Who[]).map((who) => [
          who,
          brAnotherStages(who).stage2.slots.map((s) => s?.player),
        ]),
      ),
    ).toEqual({
      ryuko: [28, 29, 26, 27, 24, 25, 40, 41, 1],
      kiki: [26, 27, 24, 25, 40, 41, 28, 29, 3],
      gigi: [28, 29, 40, 41, 26, 27, 25],
      yinan: [24, 25, 26, 27, 28, 29, 41],
      masa: [26, 27, 40, 41, 24, 25, 29],
    });
  });

  it('drops the stage-2 pair containing each of the eight named fighters and keeps the partner allied', () => {
    for (const who of OWN_PAIR) {
      const index = ROSTER.indexOf(who);
      const { stage2 } = brAnotherStages(who);
      const enemies = stage2.slots.slice(0, -1).map((s) => s!.player);
      expect(enemies, who).toHaveLength(6);
      expect(enemies, who).not.toContain(index);
      expect(enemies, who).not.toContain(index ^ 1);
      expect(stage2.slots.at(-1)!.player, who).toBe(
        finaleOf(who).slots[6]!.player,
      );
    }
  });

  it('seats ten fighters in stage 2 for Z-MEGA, RARIO and regulars facing all four pairs', () => {
    for (const who of ['zmega', 'rario', 'ryuko'] as Who[]) {
      const { stage2 } = brAnotherStages(who);
      expect(stage2.slots, who).toHaveLength(9);
      expect(stage2.slots[8]!.enemies, who).toBe(0b111111110);
      if (who === 'zmega')
        expect(stage2.slots.map((s) => s?.player)).toEqual([
          24, 25, 28, 29, 26, 27, 40, 41, 46,
        ]);
      if (who === 'rario')
        expect(stage2.slots.map((s) => s?.player)).toEqual([
          28, 29, 40, 41, 24, 25, 26, 27, 31,
        ]);
      for (const [i, slot] of stage2.slots.entries()) {
        expect(slot!.enemies, `${who} ${i}`).toBeLessThan(1 << 10);
        if (i < 8)
          expect(slot!.enemies & (1 << 9), `${who} ${i} vs ally`).toBe(1 << 9);
      }
    }
  });

  it('rebuilds symmetric hostility and pair friendship masks for the new seats', () => {
    for (const who of ELIGIBLE) {
      const { stage1, stage2, stage3 } = brAnotherStages(who);
      for (const battle of [stage1, stage2, stage3]) {
        if (!battle) continue;
        const last = battle.slots.length - 1;
        const limit = 1 << (last + 2);
        for (const [i, a] of battle.slots.entries()) {
          expect(a!.enemies, `${who} slot ${i}`).toBeLessThan(limit);
          expect(a!.enemies & (1 << (i + 1)), `${who} self ${i}`).toBe(0);
          expect(!!(a!.enemies & 1), `${who} vs 1P ${i}`).toBe(
            !(a!.flags & 0x200),
          );
          for (const [j, b] of battle.slots.entries())
            expect(
              !!(a!.enemies & (1 << (j + 1))),
              `${who} ${i + 1}->${j + 1}`,
            ).toBe(!!(b!.enemies & (1 << (i + 1))));
        }
        for (let i = 0; i < last; i++)
          for (let j = 0; j < last; j++) {
            const paired =
              battle !== stage3 &&
              i !== j &&
              Math.floor(i / 2) === Math.floor(j / 2);
            expect(
              !!(battle.slots[i]!.enemies & (1 << (j + 1))),
              `${who} ${i + 1}->${j + 1}`,
            ).toBe(i !== j && !paired);
          }
        expect(battle.slots[last]!.enemies, who).toBe(
          (((1 << (last + 2)) - 1) & ~1 & ~(1 << (last + 1))) >>> 0,
        );
      }
    }
  });

  it('shuffles the four bosses and picks the arena by the last one', () => {
    const landed = new Map<number, Who[]>();
    for (const who of ELIGIBLE) {
      const { stage3 } = brAnotherStages(who);
      expect(stage3.slots, who).toHaveLength(5);
      const bosses = stage3.slots.slice(0, 4).map((s) => s!.player);
      expect(
        [...bosses].sort((a, b) => a - b),
        who,
      ).toEqual(BOSS_SEATS);
      expect(stage3.slots[4]!.player, who).toBe(finaleOf(who).slots[6]!.player);
      expect(stage3.stage, who).toBe(ARENAS.get(bosses[3]!));
      landed.set(bosses[3]!, [...(landed.get(bosses[3]!) ?? []), who]);
    }
    expect([...landed.keys()].sort((a, b) => a - b)).toEqual([30, 32, 33, 45]);
    for (const who of ELIGIBLE) {
      const { stage3 } = brAnotherStages(who);
      const finale = finaleOf(who);
      expectRoles(who, stage3, finale, false);
    }
    expect(
      (['times', 'ryuko', 'masa', 'kiki'] as Who[]).map((who) => {
        const { stage3 } = brAnotherStages(who);
        return [who, stage3.stage, stage3.slots.map((s) => s?.player)];
      }),
    ).toEqual([
      ['times', 12, [45, 32, 33, 30, 28]],
      ['ryuko', 14, [30, 45, 33, 32, 1]],
      ['masa', 15, [45, 32, 30, 33, 29]],
      ['kiki', 18, [32, 33, 30, 45, 3]],
    ]);
  });

  it('keeps the KO striker bonus on the first and middle enemies and the final scorer payout', () => {
    for (const who of [
      'masa',
      'times',
      'zmega',
      'rario',
      'ryuko',
      'gigi',
      'yinan',
    ] as Who[])
      for (const battle of built(brAnotherStages(who))) {
        const n = battle.slots.length - 1;
        for (let i = 0; i < n - 1; i++) {
          const slot = battle.slots[i]!;
          expect((slot.flags >> 7) & 3, `${who} ${i}`).toBe(2);
          expect([slot.life, slot.power], `${who} ${i}`).toEqual([50, 10]);
          expect(slot.points, `${who} ${i}`).toBe(0);
        }
        const last = battle.slots[n - 1]!;
        expect((last.flags >> 7) & 3, who).toBe(0);
        expect(last.points, who).toBe(100);
        expect(last.scorer, who).toBe(1);
      }
    expect(brAnotherStages('ryuko').stage2.slots[0]!.scorer).toBe(1);
    expect(brAnotherStages('ryuko').stage3.slots[0]!.scorer).toBe(1);
    expect(brAnotherStages('times').stage2.slots[0]!.delay).toBe(1);
    expect(brAnotherStages('times').stage3.slots[0]!.delay).toBe(1);
  });

  it("enters each waiting enemy below the watched fighter's own 30% threshold", () => {
    expect(desperationOf('shinz')).toBe(240);
    expect(desperationOf('dora')).toBe(180);
    const times = brAnotherStages('times').stage3;
    expect(times.slots.map((s) => s?.player)).toEqual([45, 32, 33, 30, 28]);
    expect(times.slots.map((s) => s?.below)).toEqual([0, 180, 150, 240, 120]);
    const masa = brAnotherStages('masa').stage3;
    expect(masa.slots.map((s) => s?.player)).toEqual([45, 32, 30, 33, 29]);
    expect(masa.slots.map((s) => s?.below)).toEqual([0, 180, 150, 144, 135]);
    for (const who of ELIGIBLE)
      for (const battle of built(brAnotherStages(who))) {
        const players = battle.slots.map((s) => s!.player);
        for (let i = 1; i < battle.slots.length - 1; i++)
          expect(battle.slots[i]!.below, `${who} ${i}`).toBe(
            desperationOf(ROSTER[players[i - 1]!]!),
          );
      }
  });

  it('keeps the fighter-specific finale ally watching the 1P at its own threshold', () => {
    for (const who of ELIGIBLE) {
      const finale = finaleOf(who);
      for (const battle of built(brAnotherStages(who))) {
        const ally = battle.slots.at(-1)!;
        expect(ally.player, who).toBe(finale.slots[6]!.player);
        expect(ally.flags & 0x200, who).toBe(0x200);
        expect(ally.watch, who).toBe(0);
        expect(ally.below, who).toBe(desperationOf(who));
        expect(ally.x, who).toBe(finale.slots[6]!.x);
        expect(ally.enemies, who).toBe(((1 << battle.slots.length) - 1) & ~1);
      }
    }
    for (const [who, ally] of [
      ['zmega', 'rario'],
      ['rario', 'zmega'],
      ['masa', 'times'],
      ['times', 'masa'],
      ['ryuko', 'zoma'],
    ] as [Who, Who][]) {
      for (const battle of built(brAnotherStages(who)))
        expect(ROSTER[battle.slots.at(-1)!.player], who).toBe(ally);
    }
  });

  it('reuses the source finale header on stages 2 and 3', () => {
    for (const who of ELIGIBLE) {
      const { stage2, stage3 } = brAnotherStages(who);
      const finale = finaleOf(who);
      for (const battle of [stage2, stage3])
        for (const key of HEADER_KEYS)
          expect(battle[key], `${who} ${key}`).toBe(finale[key]);
      expect(stage2.stage, who).toBe(3);
    }
    expect(brAnotherStages('masa').stage2.x).toBe(300);
    expect(brAnotherStages('masa').stage3.x).toBe(300);
  });

  it('does not mutate the exported scenarios or reuse their slot objects', () => {
    const before = new Map(
      (Object.keys(CHARACTERS) as Who[]).map((who) => [
        who,
        JSON.stringify(CHARACTERS[who].scenario),
      ]),
    );
    for (const who of ELIGIBLE) brAnotherStages(who);
    for (const who of ELIGIBLE) {
      expect(JSON.stringify(CHARACTERS[who].scenario), who).toBe(
        before.get(who),
      );
      const finale = finaleOf(who);
      for (const battle of built(brAnotherStages(who)))
        for (const slot of battle.slots)
          expect(finale.slots, who).not.toContain(slot);
      const template = sourceStep('ryuko', 63);
      for (const slot of brAnotherStages('masa').stage1!.slots)
        expect(template.slots).not.toContain(slot);
    }
  });
});

describe('boss B.R. ANOTHER route', () => {
  const battlesOf = (who: Who): Battle[] =>
    bossBrAnotherStory(who).filter((step): step is Battle => step.type === 1);

  // Authored (HPA-858): each slot equals its donor role slot with only the
  // seat details overridden — the ally role never appears.
  const expectDonorRoles = (
    battle: Battle,
    roles: Battle,
    paired: boolean,
    tough: boolean,
  ) => {
    const n = battle.slots.length;
    battle.slots.forEach((slot, i) => {
      const role =
        i === 0
          ? roles.slots[0]!
          : i === n - 1
            ? roles.slots[5]!
            : roles.slots[1]!;
      const { player, enemies, watch, below, x } = slot!;
      expect(slot).toEqual({
        ...role,
        player,
        enemies,
        watch,
        below,
        x,
        tough: tough || undefined,
      });
      const all = (1 << (n + 1)) - 1;
      let expected = all & ~(1 << (i + 1));
      if (paired) expected &= ~(1 << (i % 2 === 0 ? i + 2 : i));
      expect(slot!.enemies).toBe(expected);
    });
  };

  it('shares the one boss list with the selector, seated at 30, 32, 33 and 45', () => {
    expect([...BOSSES]).toEqual(['zenka', 'alpha', 'shinz', 'dora']);
    expect(BOSSES.map((who) => ROSTER.indexOf(who))).toEqual([30, 32, 33, 45]);
  });

  it('is three battles and the end step, no demos, every stage permitting Continue', () => {
    for (const who of BOSSES) {
      const steps = bossBrAnotherStory(who);
      expect(steps, who).toHaveLength(4);
      expect(
        steps.map((s) => s.type),
        who,
      ).toEqual([1, 1, 1, 4]);
      for (const battle of battlesOf(who))
        expect(battle.flags & 1, who).toBe(1);
    }
  });

  it('builds 6, 6 and 3 hostile seats, no ally, and never the player’s own boss', () => {
    for (const who of BOSSES) {
      const [stage1, stage2, stage3] = battlesOf(who);
      expect(stage1.slots, who).toHaveLength(6);
      expect(stage2.slots, who).toHaveLength(6);
      expect(stage3.slots, who).toHaveLength(3);
      const own = ROSTER.indexOf(who);
      for (const battle of [stage1, stage2, stage3])
        for (const slot of battle.slots) {
          expect(slot!.player, who).not.toBe(own);
          expect(slot!.flags & 0x200, who).toBe(0);
          expect(slot!.enemies & 1, `${who} seat ${slot!.player}`).toBe(1);
        }
      expect(
        stage3.slots.map((s) => s!.player).sort((a, b) => a - b),
        who,
      ).toEqual(BOSS_SEATS.filter((seat) => seat !== own));
    }
  });

  it('draws stable, distinct seeded lineups on one stream from the boss’s roster seat', () => {
    const drawn = Object.fromEntries(
      BOSSES.map((who) => {
        const [stage1, stage2, stage3] = battlesOf(who);
        return [
          who,
          {
            stage1: stage1.slots.map((s) => s!.player),
            stage2: stage2.slots.map((s) => s!.player),
            stage3: stage3.slots.map((s) => s!.player),
            arena: stage3.stage,
          },
        ];
      }),
    );
    expect(drawn).toEqual({
      zenka: {
        stage1: [2, 3, 0, 1, 18, 19],
        stage2: [24, 25, 26, 27, 28, 29],
        stage3: [45, 33, 32],
        arena: 14,
      },
      alpha: {
        stage1: [8, 9, 10, 11, 4, 5],
        stage2: [24, 25, 28, 29, 26, 27],
        stage3: [45, 30, 33],
        arena: 15,
      },
      shinz: {
        stage1: [18, 19, 12, 13, 16, 17],
        stage2: [28, 29, 24, 25, 26, 27],
        stage3: [32, 30, 45],
        arena: 18,
      },
      dora: {
        stage1: [14, 15, 4, 5, 22, 23],
        stage2: [28, 29, 40, 41, 24, 25],
        stage3: [30, 33, 32],
        arena: 14,
      },
    });
    for (const who of BOSSES)
      expect(bossBrAnotherStory(who), who).toEqual(bossBrAnotherStory(who));
  });

  it('keeps drawn pairs whole, omits exactly one extra pair, and stages on 9/3/the last boss’s arena', () => {
    for (const who of BOSSES) {
      const [stage1, stage2, stage3] = battlesOf(who);
      for (const [battle, pool] of [
        [stage1, STAGE_ONE_POOL],
        [stage2, STAGE_TWO_PAIRS],
      ] as const) {
        const drawn = pairsOf(battle.slots.map((s) => s!.player));
        expect(drawn, who).toHaveLength(3);
        for (const [a, b] of drawn)
          expect(
            pool.some(([pa, pb]) => pa === a && pb === b),
            `${who} drew [${a}, ${b}]`,
          ).toBe(true);
      }
      const omitted = STAGE_TWO_PAIRS.filter(
        (pair) =>
          !pairsOf(stage2.slots.map((s) => s!.player)).some(
            ([a, b]) => a === pair[0] && b === pair[1],
          ),
      );
      expect(omitted, who).toHaveLength(1);
      expect(stage1.stage, who).toBe(9);
      expect(stage2.stage, who).toBe(3);
      expect(stage3.stage, who).toBe(ARENAS.get(stage3.slots.at(-1)!.player));
    }
  });

  it('runs symmetric hostility from the real seat count: mates allied on stages 1–2, every boss hostile on stage 3', () => {
    for (const who of BOSSES)
      for (const [i, battle] of battlesOf(who).entries()) {
        const paired = i < 2;
        const n = battle.slots.length;
        const all = (1 << (n + 1)) - 1;
        for (const [a, seat] of battle.slots.entries()) {
          expect(seat!.enemies, `${who} range ${a}`).toBeLessThanOrEqual(all);
          expect(seat!.enemies & (1 << (a + 1)), `${who} self ${a}`).toBe(0);
          for (const [b, other] of battle.slots.entries())
            expect(
              Boolean(seat!.enemies & (1 << (b + 1))),
              `${who} ${a + 1}->${b + 1}`,
            ).toBe(Boolean(other!.enemies & (1 << (a + 1))));
          const mate = paired ? (a % 2 === 0 ? a + 1 : a - 1) : null;
          for (let b = 0; b < n; b++)
            expect(
              Boolean(seat!.enemies & (1 << (b + 1))),
              `${who} stage ${i + 1} ${a}->${b}`,
            ).toBe(b !== a && b !== mate);
        }
      }
  });

  it('watches the seat before each enemy and enters it below that fighter’s own mark', () => {
    for (const who of BOSSES)
      for (const battle of battlesOf(who)) {
        const players = battle.slots.map((s) => s!.player);
        expect(
          battle.slots.map((s) => s!.watch),
          who,
        ).toEqual(players.map((_, i) => i));
        expect(
          battle.slots.map((s) => s!.below),
          who,
        ).toEqual([
          0,
          ...players.slice(0, -1).map((p) => desperationOf(ROSTER[p]!)),
        ]);
        expect(
          battle.slots.map((s) => s!.x),
          who,
        ).toEqual(players.map((_, i) => (i % 2 === 0 ? 850 : 450)));
      }
  });

  it('donates ryuko’s source steps 63 and 65 for headers and roles, overriding only stage and seat details', () => {
    const opener = sourceStep('ryuko', 63);
    const finale = sourceStep('ryuko', 65);
    for (const who of BOSSES) {
      const [stage1, stage2, stage3] = battlesOf(who);
      for (const key of HEADER_KEYS)
        expect(stage1[key], `${who} ${key}`).toBe(opener[key]);
      for (const battle of [stage2, stage3])
        for (const key of HEADER_KEYS)
          expect(battle[key], `${who} ${key}`).toBe(finale[key]);
      expectDonorRoles(stage1, opener, true, true);
      expectDonorRoles(stage2, finale, true, true);
      expectDonorRoles(stage3, finale, false, false);
    }
  });

  it('marks the six enemy slots of stages 1 and 2 tough and leaves stage 3 native', () => {
    for (const who of BOSSES) {
      const [stage1, stage2, stage3] = battlesOf(who);
      for (const slot of stage1.slots) expect(slot!.tough, who).toBe(true);
      for (const slot of stage2.slots) expect(slot!.tough, who).toBe(true);
      for (const slot of stage3.slots) expect(slot!.tough, who).toBeUndefined();
    }
    for (const slot of sourceStep('ryuko', 63).slots)
      expect(slot!.tough).toBeUndefined();
    for (const battle of built(brAnotherStages('masa')))
      for (const slot of battle.slots) expect(slot!.tough).toBeUndefined();
  });

  it('seats the boss route tough through Match while the regular route stays native', () => {
    const boss = Match.story('zenka', battlesOf('zenka')[0]!);
    expect(boss.fighters[0]).toMatchObject({ maxHp: lifeOf('zenka') });
    for (const f of boss.fighters.slice(1))
      expect(f, f.who).toMatchObject({
        hp: 2 * lifeOf(f.who),
        maxHp: 2 * lifeOf(f.who),
        maxStock: 5,
        enGainMultiplier: 2,
      });
    const regular = Match.story('masa', built(brAnotherStages('masa'))[1]!);
    for (const f of regular.fighters)
      expect(f, f.who).toMatchObject({
        hp: lifeOf(f.who),
        maxHp: lifeOf(f.who),
        maxStock: stocksOf(f.who),
        enGainMultiplier: 1,
      });
  });

  it('never mutates the source scenarios or the regular B.R. ANOTHER stages, and reuses no donor slot', () => {
    const before = new Map(
      (Object.keys(CHARACTERS) as Who[]).map((who) => [
        who,
        JSON.stringify(CHARACTERS[who].scenario),
      ]),
    );
    const regular = JSON.stringify(brAnotherStages('masa'));
    const donors = [sourceStep('ryuko', 63), sourceStep('ryuko', 65)];
    for (const who of BOSSES)
      for (const battle of battlesOf(who))
        for (const slot of battle.slots)
          for (const donor of donors) expect(donor.slots).not.toContain(slot);
    for (const who of BOSSES) bossBrAnotherStory(who);
    for (const [who, json] of before)
      expect(JSON.stringify(CHARACTERS[who].scenario), who).toBe(json);
    expect(JSON.stringify(brAnotherStages('masa'))).toBe(regular);
  });
});
