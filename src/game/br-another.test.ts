import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf } from './characters';
import type { Who } from './characters';
import { ROSTER } from './select';
import { rand } from './standing';
import { opensOnModeSelect } from './story';
import type { Battle, Step } from './story';
import { brAnotherStages } from './br-another';
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
const BOSSES = [30, 32, 33, 45];
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

const seeded = (who: Who) => {
  let seed = ROSTER.indexOf(who);
  const shuffle = <T>(units: readonly T[]): T[] => {
    const shuffled = [...units];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const [next, pick] = rand(seed);
      seed = next;
      const j = pick % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  };
  const stage1 = FOLDED.includes(who)
    ? shuffle(STAGE_ONE_POOL).slice(0, 3)
    : null;
  const stage2 = shuffle(
    STAGE_TWO_PAIRS.filter((pair) => !pair.includes(ROSTER.indexOf(who))),
  );
  const stage3 = shuffle(BOSSES);
  return { stage1, stage2, stage3 };
};

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
      const drawn = seeded(who).stage1!.flat();
      expect(drawn).toHaveLength(6);
      expect(stage1!.slots).toHaveLength(7);
      expect(
        stage1!.slots.map((s) => s?.player),
        who,
      ).toEqual([...drawn, finaleOf(who).slots[6]!.player]);
      for (const index of drawn)
        expect(
          STAGE_ONE_POOL.some((pair) => pair.includes(index)),
          `${who} drew ${index}`,
        ).toBe(true);
      expectRoles(who, stage1!, template, true);
      const opener = sourceStep(who, 45);
      for (const key of HEADER_KEYS)
        expect(stage1![key], `${who} ${key}`).toBe(opener[key]);
      expect(stage1!.stage).toBe(9);
    }
    expect(brAnotherStages('times').stage1!.x).toBe(300);
    expect(brAnotherStages('times').stage1!.slots[0]!.delay).toBe(0);
    expect(brAnotherStages('masa').stage1!.slots.map((s) => s?.player)).toEqual(
      [12, 13, 0, 1, 22, 23, 29],
    );
  });

  it('seats the seeded stage-2 pairs on sakuranight minus the pair holding the fighter', () => {
    for (const who of ELIGIBLE) {
      const { stage2 } = brAnotherStages(who);
      const pairs = seeded(who).stage2;
      const enemies = pairs.flat();
      const finale = finaleOf(who);
      expect(stage2.slots).toHaveLength(enemies.length + 1);
      expect(
        stage2.slots.map((s) => s?.player),
        who,
      ).toEqual([...enemies, finale.slots[6]!.player]);
      for (const key of HEADER_KEYS)
        expect(stage2[key], `${who} ${key}`).toBe(finale[key]);
      expect(stage2.stage, who).toBe(3);
      expectRoles(who, stage2, finale, true);
    }
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
      const bosses = seeded(who).stage3;
      expect(stage3.slots, who).toHaveLength(5);
      expect(
        stage3.slots.map((s) => s?.player),
        who,
      ).toEqual([...bosses, finaleOf(who).slots[6]!.player]);
      expect(stage3.stage, who).toBe(ARENAS.get(bosses[3]!));
      landed.set(bosses[3]!, [...(landed.get(bosses[3]!) ?? []), who]);
    }
    expect([...landed.keys()].sort((a, b) => a - b)).toEqual([30, 32, 33, 45]);
    for (const who of ELIGIBLE) {
      const { stage3 } = brAnotherStages(who);
      const finale = finaleOf(who);
      expectRoles(who, stage3, finale, false);
    }
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
