import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, stocksOf } from './characters';
import type { Who } from './characters';
import { DEFAULT_CHEATS } from './cheats';
import { Match } from './match';
import type { Fighter } from './match';
import { BOSSES, ROSTER } from './select';
import { opensOnModeSelect, validateLineupCoverage } from './story';
import type { Battle, Slot, Step } from './story';
import {
  BR_LONG_DEMO,
  brAnotherStages,
  brLongPartner,
  brLongStory,
  bossBrAnotherStory,
} from './br-another';
import type { BrAnotherStages } from './br-another';
import { BR_ANOTHER_LINEUPS, BR_LONG_LINEUPS } from './br-lineups';
import type { LineupPair } from './br-lineups';

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

const built = (stages: BrAnotherStages): Battle[] => [
  stages.stage1,
  stages.stage2,
  stages.stage3,
];
const seatsOf = (pairs: readonly LineupPair[]) =>
  pairs.flat().map((who) => ROSTER.indexOf(who));
const namesOf = (battle: Battle) => battle.slots.map((s) => ROSTER[s!.player]!);
const countIn = (
  map: Map<string, number>,
  key: string,
  lo: number,
  hi: number,
  label: string,
) => {
  const n = map.get(key) ?? 0;
  expect(n, `${label} ${key}`).toBeGreaterThanOrEqual(lo);
  expect(n, `${label} ${key}`).toBeLessThanOrEqual(hi);
};
const pairKey = (players: readonly number[]) =>
  [...players].sort((a, b) => a - b).join(',');
const leaderPosKey = (players: readonly number[], pos: number) =>
  `${Math.floor(players[0]! / 2)},${players[0]! % 2},${pos}`;

// Team membership independent of the builder's mask arithmetic: a slot is
// an ally when its flags carry bit 9 (0x200), the same bit Match reads.
const isAllySlot = (slot: Slot | null) => !!(slot && slot.flags & 0x200);
const enemySlotsOf = (battle: Battle) =>
  battle.slots.filter((slot) => !isAllySlot(slot));
const allySlotsOf = (battle: Battle) =>
  battle.slots.filter((slot) => isAllySlot(slot));

// Friendship over the original seat indices — seat 0 is the 1P, seat s the
// slot at index s − 1. A seat joins the 1P's team when it is the 1P or a
// 0x200-flagged ally; two seats are friendly when both are on that team or
// both are enemies paired as mates (consecutive enemy seats).
const onPlayerTeam = (battle: Battle, seat: number) =>
  seat === 0 || isAllySlot(battle.slots[seat - 1]!);
const friendlySeats = (
  battle: Battle,
  paired: boolean,
  a: number,
  b: number,
) => {
  if (a === b) return true;
  const pa = onPlayerTeam(battle, a);
  const pb = onPlayerTeam(battle, b);
  if (pa !== pb) return false;
  if (pa) return true;
  return paired && Math.floor((a - 1) / 2) === Math.floor((b - 1) / 2);
};

// The hostility mask of the slot at index i, derived seat by seat from team
// membership and pairing alone — never from the builder's own arithmetic.
const enemyMask = (battle: Battle, i: number, paired: boolean) => {
  let mask = 0;
  for (let seat = 0; seat <= battle.slots.length; seat++)
    if (!friendlySeats(battle, paired, i + 1, seat)) mask |= 1 << seat;
  return mask;
};

// Every slot equals its donor role slot with only the seat details
// overridden, enemies and allies told apart by the 0x200 flag rather than
// position: the enemies keep their original indices (0 first, the last the
// chain's end) and the allies follow them.
const expectRoles = (
  who: Who,
  battle: Battle,
  roles: Battle,
  paired: boolean,
) => {
  const ally = roles.slots[6]!;
  const enemies = enemySlotsOf(battle);
  const allies = allySlotsOf(battle);
  battle.slots.forEach((slot, i) => {
    const role = isAllySlot(slot)
      ? ally
      : i === 0
        ? roles.slots[0]!
        : i === enemies.length - 1
          ? roles.slots[5]!
          : roles.slots[1]!;
    const { player, enemies: hostility, watch, below, x } = slot!;
    expect(slot, `${who} slot ${i}`).toEqual({
      ...role,
      player,
      enemies: hostility,
      watch,
      below,
      x,
    });
    expect(slot!.enemies, `${who} slot ${i}`).toBe(
      enemyMask(battle, i, paired),
    );
  });
  expect(
    battle.slots.map((s) => s!.watch),
    who,
  ).toEqual(battle.slots.map((s, i) => (isAllySlot(s) ? 0 : i)));
  expect(
    battle.slots.map((s) => s!.x),
    who,
  ).toEqual([
    ...enemies.map((_, i) =>
      i === enemies.length - 1 ? 450 : i % 2 === 0 ? 850 : 450,
    ),
    ...allies.map(() => ally.x),
  ]);
  expect(
    battle.slots.map((s) => s!.below),
    who,
  ).toEqual([
    0,
    ...enemies.slice(0, -1).map((s) => desperationOf(ROSTER[s!.player]!)),
    ...allies.map(() => desperationOf(who)),
  ]);
};

describe('BR Another approved lineups', () => {
  it('rebuilds the same approved lineups for a fighter on every call', () => {
    for (const who of ELIGIBLE)
      expect(brAnotherStages(who), who).toEqual(brAnotherStages(who));
  });

  // The one table-driven check: every constructed battle equals its approved
  // HPA-1035 §7 row — pairs with their leader, the ordered boss sequence and
  // the last boss's arena — with the family's own role/header donors.
  it('constructs each approved §7 row for all 34 fighters', () => {
    expect(ELIGIBLE).toHaveLength(34);
    for (const who of ELIGIBLE) {
      const row = BR_ANOTHER_LINEUPS[who];
      if (!row) throw new Error(`${who} has no approved row`);
      const { stage1, stage2, stage3 } = brAnotherStages(who);
      const finale = finaleOf(who);
      const folded = FOLDED.includes(who);
      const fin = folded ? 49 : TWINS.includes(who) ? 67 : 65;
      const opener = folded ? sourceStep(who, 45) : sourceStep(who, fin - 2);
      const roles = folded ? sourceStep('ryuko', 63) : opener;
      expect(namesOf(stage1).slice(0, 6), `${who} stage 1`).toEqual(
        row.stage1.flat(),
      );
      expect(stage1.stage, who).toBe(9);
      for (const key of HEADER_KEYS)
        expect(stage1[key], `${who} stage1 ${key}`).toBe(opener[key]);
      expectRoles(who, stage1, roles, true);
      expect(namesOf(stage2).slice(0, 6), `${who} stage 2`).toEqual(
        row.stage2.flat(),
      );
      expect(stage2.stage, who).toBe(3);
      for (const key of HEADER_KEYS)
        expect(stage2[key], `${who} stage2 ${key}`).toBe(finale[key]);
      expectRoles(who, stage2, finale, true);
      expect(namesOf(stage3).slice(0, 4), `${who} stage 3`).toEqual([
        ...row.stage3,
      ]);
      expect(stage3.stage, who).toBe(
        ARENAS.get(ROSTER.indexOf(row.stage3.at(-1)!)),
      );
      for (const key of HEADER_KEYS)
        expect(stage3[key], `${who} stage3 ${key}`).toBe(finale[key]);
      expectRoles(who, stage3, finale, false);
      expect(stage1.slots.at(-1)!.player, `${who} stage1 ally`).toBe(
        (folded ? finale : opener).slots[6]!.player,
      );
      for (const battle of [stage2, stage3])
        expect(battle.slots.at(-1)!.player, `${who} ally`).toBe(
          finale.slots[6]!.player,
        );
    }
  });

  // Independent of the typed table: RYUKO's rows straight from the ticket.
  it('seats RYUKO’s hard-coded rows: G SUNEO+GIANT / LIZARD+KAY / ERUS+HISO, OGI+ZIRO / GIGI+SWW / YINAN+AYA, SHIN-Z, ALPHA, DoraEmon, ZENKA', () => {
    const { stage1, stage2, stage3 } = brAnotherStages('ryuko');
    expect(stage1.slots.map((s) => s!.player)).toEqual([
      7, 6, 10, 11, 17, 16, 1,
    ]);
    expect(stage2.slots.map((s) => s!.player)).toEqual([
      26, 27, 24, 25, 40, 41, 1,
    ]);
    expect(stage3.slots.map((s) => s!.player)).toEqual([33, 32, 45, 30, 1]);
    expect(stage3.stage).toBe(ARENAS.get(30));
    expect(stage1.stage).toBe(9);
    expect(stage2.stage).toBe(3);
    expect(namesOf(stage1).slice(0, 6)).toEqual([
      'suneo',
      'giant',
      'lizard',
      'kay',
      'erus',
      'hiso',
    ]);
  });

  it('meets §7 stage-1 spread: every pair 8-9 times, 2-3 per position, all 72 lead/slot combos, 34 distinct rows, never the own pair', () => {
    const perPair = new Map<string, number>();
    const perSlot = Array.from({ length: 3 }, () => new Map<string, number>());
    const combos = new Map<string, number>();
    const lineups = new Map<string, Who>();
    const sets = new Map<string, Who>();
    for (const who of ELIGIBLE) {
      const players = brAnotherStages(who)
        .stage1.slots.slice(0, 6)
        .map((s) => s!.player);
      const names = players.map((p) => ROSTER[p]!);
      lineups.set(names.join(','), who);
      sets.set([...names].sort().join(','), who);
      expect(players, who).not.toContain(ROSTER.indexOf(who));
      pairsOf(players).forEach(([a, b], pos) => {
        const key = pairKey([a, b]);
        perPair.set(key, (perPair.get(key) ?? 0) + 1);
        perSlot[pos]!.set(key, (perSlot[pos]!.get(key) ?? 0) + 1);
        const combo = leaderPosKey([a, b], pos);
        combos.set(combo, (combos.get(combo) ?? 0) + 1);
      });
    }
    expect(lineups.size, 'distinct ordered stage-1 lineups').toBe(34);
    expect(sets.size, 'distinct stage-1 pair sets').toBe(34);
    expect(perPair.size).toBe(12);
    for (const key of perPair.keys())
      countIn(perPair, key, 8, 9, 'stage1 pair');
    for (const slot of perSlot)
      for (const key of slot.keys())
        countIn(slot, key, 2, 3, 'stage1 position');
    expect(combos.size, 'lead/slot combos').toBe(72);
    for (const [key, n] of combos) {
      expect(n, `combo ${key}`).toBeGreaterThanOrEqual(1);
      expect(n, `combo ${key}`).toBeLessThanOrEqual(2);
    }
  });

  it('meets §7 stage-2 spread: each pair seated 25-26 times, 8-9 per position, 24 orders shared only with opposite leaders, never pair mates', () => {
    const perPair = new Map<string, number>();
    const perSlot = Array.from({ length: 3 }, () => new Map<string, number>());
    const combos = new Map<string, number>();
    const orders = new Map<string, Who[]>();
    for (const who of ELIGIBLE) {
      const players = brAnotherStages(who)
        .stage2.slots.slice(0, 6)
        .map((s) => s!.player);
      expect(players, who).not.toContain(ROSTER.indexOf(who));
      const drawn = pairsOf(players);
      const orderKey = drawn.map(([a, b]) => pairKey([a, b])).join('>');
      orders.set(orderKey, [...(orders.get(orderKey) ?? []), who]);
      drawn.forEach(([a, b], pos) => {
        const key = pairKey([a, b]);
        perPair.set(key, (perPair.get(key) ?? 0) + 1);
        perSlot[pos]!.set(key, (perSlot[pos]!.get(key) ?? 0) + 1);
        const combo = leaderPosKey([a, b], pos);
        combos.set(combo, (combos.get(combo) ?? 0) + 1);
      });
    }
    expect(perPair.size).toBe(4);
    // The approved table seats each pair 25 or 26 times over the 34 rows
    // (102 pair slots): the recount is OGI+ZIRO 26, YINAN+AYA 26, GIGI+SWW
    // 25, MASA+3-TIMES 25, which the corrected design prose now matches.
    // The 25–26 bound stays the invariant; the per-row comparison pins the
    // data.
    for (const key of [
      pairKey([24, 25]),
      pairKey([26, 27]),
      pairKey([28, 29]),
      pairKey([40, 41]),
    ])
      countIn(perPair, key, 25, 26, 'stage2 pair seated');
    for (const slot of perSlot)
      for (const key of slot.keys())
        countIn(slot, key, 8, 9, 'stage2 position');
    expect(combos.size, 'lead/slot combos').toBe(24);
    for (const [key, n] of combos) {
      expect(n, `combo ${key}`).toBeGreaterThanOrEqual(4);
      expect(n, `combo ${key}`).toBeLessThanOrEqual(5);
    }
    expect(orders.size, 'stage-2 pair orders').toBe(24);
    const repeated = [...orders.entries()].filter(([, ws]) => ws.length > 1);
    expect(repeated).toHaveLength(10);
    for (const [, ws] of repeated) {
      expect(ws).toHaveLength(2);
      const [a, b] = ws as [Who, Who];
      const pa = pairsOf(
        brAnotherStages(a)
          .stage2.slots.slice(0, 6)
          .map((s) => s!.player),
      );
      const pb = pairsOf(
        brAnotherStages(b)
          .stage2.slots.slice(0, 6)
          .map((s) => s!.player),
      );
      pa.forEach(([x], i) =>
        expect(x, `${a}/${b} pair ${i}`).not.toBe(pb[i]![0]),
      );
      expect(
        Math.abs(ROSTER.indexOf(a) - ROSTER.indexOf(b)),
        `${a}/${b} pair mates`,
      ).not.toBe(1);
    }
  });

  it('meets §7 stage-3 spread: all 24 boss orders (10 twice, never pair mates), 8-9 per boss per position, arenas 8/9/8/9', () => {
    const perPos = Array.from({ length: 4 }, () => new Map<string, number>());
    const orders = new Map<string, Who[]>();
    const arenas = new Map<number, number>();
    for (const who of ELIGIBLE) {
      const { stage3 } = brAnotherStages(who);
      const bosses = stage3.slots.slice(0, 4).map((s) => s!.player);
      expect(
        [...bosses].sort((a, b) => a - b),
        who,
      ).toEqual(BOSS_SEATS);
      expect(stage3.stage, who).toBe(ARENAS.get(bosses.at(-1)!));
      arenas.set(stage3.stage, (arenas.get(stage3.stage) ?? 0) + 1);
      orders.set(bosses.join(','), [
        ...(orders.get(bosses.join(',')) ?? []),
        who,
      ]);
      bosses.forEach((b, pos) =>
        perPos[pos]!.set(String(b), (perPos[pos]!.get(String(b)) ?? 0) + 1),
      );
    }
    expect(orders.size, 'boss orders').toBe(24);
    const repeated = [...orders.entries()].filter(([, ws]) => ws.length > 1);
    expect(repeated).toHaveLength(10);
    for (const [, ws] of repeated) {
      expect(ws).toHaveLength(2);
      const [a, b] = ws as [Who, Who];
      expect(
        Math.abs(ROSTER.indexOf(a) - ROSTER.indexOf(b)),
        `${a}/${b} pair mates`,
      ).not.toBe(1);
    }
    for (const slot of perPos)
      for (const boss of slot.keys())
        countIn(slot, boss, 8, 9, 'boss position');
    expect(arenas.get(ARENAS.get(30)!)).toBe(8);
    expect(arenas.get(ARENAS.get(32)!)).toBe(9);
    expect(arenas.get(ARENAS.get(33)!)).toBe(8);
    expect(arenas.get(ARENAS.get(45)!)).toBe(9);
  });

  it('meets §7 LONG spread in the table: 16 pairs 14-15 times, 2-3 per position, 38 distinct rows (the 34 plus the four bosses), 192 lead/slot combos (36 twice), own pair out', () => {
    const keys = Object.keys(BR_LONG_LINEUPS) as Who[];
    expect([...keys].sort(), 'LONG rows').toEqual(
      [...ELIGIBLE, ...BOSSES].sort(),
    );
    const perPair = new Map<string, number>();
    const perSlot = Array.from({ length: 6 }, () => new Map<string, number>());
    const combos = new Map<string, number>();
    const lineups = new Map<string, string>();
    const sets = new Map<string, string>();
    for (const [who, row] of Object.entries(BR_LONG_LINEUPS)) {
      const players = seatsOf(row);
      const names = row.flat();
      lineups.set(names.join(','), who);
      sets.set([...names].sort().join(','), who);
      if ((BOSSES as readonly Who[]).includes(who as Who))
        expect(
          BOSSES.some((b) => players.includes(ROSTER.indexOf(b))),
          `${who} hosts no boss`,
        ).toBe(false);
      else expect(players, who).not.toContain(ROSTER.indexOf(who as Who));
      expect(new Set(players).size, who).toBe(12);
      pairsOf(players).forEach(([a, b], pos) => {
        const key = pairKey([a, b]);
        perPair.set(key, (perPair.get(key) ?? 0) + 1);
        perSlot[pos]!.set(key, (perSlot[pos]!.get(key) ?? 0) + 1);
        const combo = leaderPosKey([a, b], pos);
        combos.set(combo, (combos.get(combo) ?? 0) + 1);
      });
    }
    expect(lineups.size, 'distinct ordered LONG lineups').toBe(38);
    expect(sets.size, 'distinct LONG pair sets').toBe(38);
    expect(perPair.size).toBe(16);
    for (const key of perPair.keys())
      countIn(perPair, key, 14, 15, 'long pair');
    for (const slot of perSlot)
      for (const key of slot.keys()) countIn(slot, key, 2, 3, 'long position');
    expect(combos.size, 'lead/slot combos').toBe(192);
    expect([...combos.values()].filter((n) => n === 1)).toHaveLength(156);
    expect([...combos.values()].filter((n) => n === 2)).toHaveLength(36);
  });

  it('validates the lineup tables against the eligible roster at load (authored, HPA-1251)', () => {
    const eligibleLong = [...ELIGIBLE, ...(BOSSES as readonly Who[])];
    // The shipped tables cover exactly their rosters: ANOTHER the 34
    // mode-select fighters (the bosses route the generated ANOTHER), LONG
    // them plus the four bosses.
    expect(() =>
      validateLineupCoverage(
        'B.R. ANOTHER',
        new Set(Object.keys(BR_ANOTHER_LINEUPS)),
        ELIGIBLE,
      ),
    ).not.toThrow();
    expect(() =>
      validateLineupCoverage(
        'B.R. LONG',
        new Set(Object.keys(BR_LONG_LINEUPS)),
        eligibleLong,
      ),
    ).not.toThrow();
    // A doctored map is named: a missing row would silently start the
    // native story with Story.br set; an extra one would never run.
    const missing = new Set(Object.keys(BR_LONG_LINEUPS));
    missing.delete('kay');
    expect(() =>
      validateLineupCoverage('B.R. LONG', missing, eligibleLong),
    ).toThrow(/B\.R\. LONG lineups[\s\S]*missing: kay/);
    const extra = new Set([...Object.keys(BR_ANOTHER_LINEUPS), 'zenka']);
    expect(() =>
      validateLineupCoverage('B.R. ANOTHER', extra, ELIGIBLE),
    ).toThrow(/B\.R\. ANOTHER lineups[\s\S]*extra: zenka/);
  });

  it('donates stage-1 roles and headers from the fighter’s own stage-9 opener, or ryuko 63 and own 45 for the folded', () => {
    for (const who of ELIGIBLE) {
      const { stage1 } = brAnotherStages(who);
      const folded = FOLDED.includes(who);
      const fin = folded ? 49 : TWINS.includes(who) ? 67 : 65;
      const opener = folded ? sourceStep(who, 45) : sourceStep(who, fin - 2);
      if (!folded) expect(opener.stage, who).toBe(9);
      expect(stage1.stage, who).toBe(9);
      for (const key of HEADER_KEYS)
        expect(stage1[key], `${who} ${key}`).toBe(opener[key]);
      expectRoles(who, stage1, folded ? sourceStep('ryuko', 63) : opener, true);
    }
    // The folded openers are native stage battles — the folded stage 1 must
    // not inherit their arena.
    expect(FOLDED.map((who) => sourceStep(who, 45).stage)).toEqual([
      6, 9, 1, 2,
    ]);
    expect(brAnotherStages('times').stage1!.x).toBe(300);
    expect(brAnotherStages('times').stage1!.slots[0]!.delay).toBe(0);
  });

  it('seats the approved stage-2 pairs on sakuranight, three pairs for everyone', () => {
    for (const who of ELIGIBLE) {
      const { stage2 } = brAnotherStages(who);
      const row = BR_ANOTHER_LINEUPS[who]!;
      const enemies = stage2.slots.slice(0, -1).map((s) => s!.player);
      const actualPairs = pairsOf(enemies);
      const finale = finaleOf(who);
      expect(stage2.slots, who).toHaveLength(7);
      expect(new Set(enemies).size, who).toBe(6);
      expect(actualPairs, who).toEqual(
        row.stage2.map((p) => p.map((w) => ROSTER.indexOf(w))),
      );
      for (const [a, b] of actualPairs)
        expect(
          STAGE_TWO_PAIRS.some(
            ([pa, pb]) => pairKey([a, b]) === pairKey([pa, pb]),
          ),
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
      ryuko: [26, 27, 24, 25, 40, 41, 1],
      kiki: [29, 28, 24, 25, 41, 40, 3],
      gigi: [28, 29, 26, 27, 41, 40, 25],
      yinan: [25, 24, 27, 26, 29, 28, 41],
      masa: [25, 24, 27, 26, 40, 41, 29],
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

  it('seats seven fighters in stage 2: three pairs and the finale ally, allies hostile only to the pairs', () => {
    for (const who of ['zmega', 'rario', 'ryuko'] as Who[]) {
      const { stage2 } = brAnotherStages(who);
      expect(stage2.slots, who).toHaveLength(7);
      expect(stage2.slots[6]!.enemies, who).toBe(0b1111110);
      if (who === 'zmega')
        expect(stage2.slots.map((s) => s?.player)).toEqual([
          29, 28, 25, 24, 27, 26, 46,
        ]);
      if (who === 'rario')
        expect(stage2.slots.map((s) => s?.player)).toEqual([
          40, 41, 27, 26, 24, 25, 31,
        ]);
      for (const [i, slot] of stage2.slots.entries()) {
        expect(slot!.enemies, `${who} ${i}`).toBeLessThan(1 << 8);
        if (i < 6)
          expect(slot!.enemies & (1 << 7), `${who} ${i} vs ally`).toBe(1 << 7);
      }
    }
  });

  it('rebuilds symmetric hostility and pair friendship masks for the new seats', () => {
    for (const who of ELIGIBLE) {
      const { stage1, stage2, stage3 } = brAnotherStages(who);
      for (const battle of [stage1, stage2, stage3]) {
        if (!battle) continue;
        const paired = battle !== stage3;
        for (const [i, a] of battle.slots.entries()) {
          // The whole mask, seat by seat from team membership: hostile to
          // the 1P unless an ally, never to itself, friendly to its pair
          // mate and to its team, hostile to every other seat.
          expect(a!.enemies, `${who} slot ${i}`).toBe(
            enemyMask(battle, i, paired),
          );
          expect(a!.enemies & (1 << (i + 1)), `${who} self ${i}`).toBe(0);
          expect(!!(a!.enemies & 1), `${who} vs 1P ${i}`).toBe(!isAllySlot(a));
          for (const [j, b] of battle.slots.entries())
            expect(
              !!(a!.enemies & (1 << (j + 1))),
              `${who} ${i + 1}->${j + 1}`,
            ).toBe(!!(b!.enemies & (1 << (i + 1))));
        }
      }
    }
  });

  it('seats the approved four-boss sequence and picks the arena by the last one', () => {
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
      ['times', 12, [32, 33, 45, 30, 28]],
      ['ryuko', 12, [33, 32, 45, 30, 1]],
      ['masa', 12, [45, 33, 32, 30, 29]],
      ['kiki', 18, [33, 30, 32, 45, 3]],
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
        const enemies = enemySlotsOf(battle);
        for (const [i, slot] of enemies.slice(0, -1).entries()) {
          expect((slot!.flags >> 7) & 3, `${who} ${i}`).toBe(2);
          expect([slot!.life, slot!.power], `${who} ${i}`).toEqual([50, 10]);
          expect(slot!.points, `${who} ${i}`).toBe(0);
        }
        const last = enemies.at(-1)!;
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
    expect(times.slots.map((s) => s?.player)).toEqual([32, 33, 45, 30, 28]);
    expect(times.slots.map((s) => s?.below)).toEqual([0, 150, 240, 180, 120]);
    const masa = brAnotherStages('masa').stage3;
    expect(masa.slots.map((s) => s?.player)).toEqual([45, 33, 32, 30, 29]);
    expect(masa.slots.map((s) => s?.below)).toEqual([0, 180, 240, 150, 135]);
    for (const who of ELIGIBLE)
      for (const battle of built(brAnotherStages(who))) {
        const enemies = enemySlotsOf(battle);
        for (let i = 1; i < enemies.length; i++)
          expect(enemies[i]!.below, `${who} ${i}`).toBe(
            desperationOf(ROSTER[enemies[i - 1]!.player]!),
          );
      }
  });

  it('donates stage 1’s ally from its opener — the finale’s for the folded four — and the finale’s on stages 2–3, watching the 1P at their threshold', () => {
    for (const who of ELIGIBLE) {
      const folded = FOLDED.includes(who);
      const fin = folded ? 49 : TWINS.includes(who) ? 67 : 65;
      const finale = finaleOf(who);
      const donors = [
        (folded ? finale : sourceStep(who, fin - 2)).slots[6]!,
        finale.slots[6]!,
        finale.slots[6]!,
      ];
      const battles = built(brAnotherStages(who));
      for (const [i, donor] of donors.entries()) {
        const battle = battles[i]!;
        const ally = battle.slots.at(-1)!;
        expect(ally.player, who).toBe(donor.player);
        expect(ally.flags & 0x200, who).toBe(0x200);
        expect(ally.watch, who).toBe(0);
        expect(ally.below, who).toBe(desperationOf(who));
        expect(ally.x, who).toBe(donor.x);
        // Hostile exactly to the enemy seats — never the 1P or itself —
        // derived from team membership, not the builder's arithmetic.
        expect(ally.enemies, who).toBe(
          enemyMask(battle, battle.slots.length - 1, battle !== battles[2]),
        );
      }
    }
    // The rebuilt slot binds the ally donor, not its stale thresholds: sww is
    // the one fighter whose opener ally differs from the finale's (below 160
    // vs 138), so give the opener a sentinel ally and follow it through.
    const opener = (CHARACTERS['sww'].scenario as Step[])[63] as Battle;
    const original = opener.slots[6]!;
    opener.slots[6] = {
      ...original,
      player: ROSTER.indexOf('kay'),
      below: 999,
      life: 77,
    };
    try {
      const { stage1, stage2, stage3 } = brAnotherStages('sww');
      const ally = stage1.slots.at(-1)!;
      expect(ally.player).toBe(ROSTER.indexOf('kay'));
      expect(ally.life).toBe(77);
      expect(ally.watch).toBe(0);
      expect(ally.below).toBe(desperationOf('sww'));
      expect(ally.enemies).toBe(
        enemyMask(stage1, stage1.slots.length - 1, true),
      );
      for (const battle of [stage2, stage3])
        expect(battle.slots.at(-1)!.player).toBe(original.player);
    } finally {
      opener.slots[6] = original;
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
      // No ally seats here: hostile to every seat but itself and, in a
      // paired battle, its mate — derived from team membership by seat.
      expect(slot!.enemies).toBe(enemyMask(battle, i, paired));
    });
  };

  it('shares the one boss list with the selector, seated at 30, 32, 33 and 45', () => {
    expect([...BOSSES]).toEqual(['zenka', 'alpha', 'shinz', 'dora']);
    expect(BOSSES.map((who) => ROSTER.indexOf(who))).toEqual([30, 32, 33, 45]);
  });

  it('plays ANOTHER’s loading screens before its three battles, then ends, every stage permitting Continue', () => {
    for (const who of BOSSES) {
      const steps = bossBrAnotherStory(who);
      expect(steps, who).toHaveLength(7);
      expect(
        steps.map((s) => s.type),
        who,
      ).toEqual([2, 1, 2, 1, 2, 1, 4]);
      // The same screens as everyone's ANOTHER: the BR ANOTHER roll call,
      // SEEDED PLAYERS before the extra pairs, NEXT CHALLENGER before the
      // bosses.
      expect(
        steps.flatMap((s) => (s.type === 2 ? [s.demo] : [])),
        who,
      ).toEqual([4, 5, 7]);
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

describe('B.R. LONG route', () => {
  const rows = Object.entries(BR_LONG_LINEUPS) as [
    Who,
    readonly LineupPair[],
  ][];
  const isBoss = (who: Who) => (BOSSES as readonly Who[]).includes(who);
  const opener = sourceStep('ryuko', 63);
  const longBattle = (who: Who): Battle => {
    const steps = brLongStory(who);
    expect(
      steps.map((s) => s.type),
      who,
    ).toEqual([2, 1, 4]);
    return steps[1] as Battle;
  };
  const toFight = (match: Match) => {
    while (match.roundTicks <= match.fightTick) match.step();
  };
  const knockOut = (match: Match, f: Fighter, by: Fighter) => {
    f.hp = 0;
    f.caught = by;
    (
      match as unknown as { knockOut(f: Fighter, wasOut: boolean): void }
    ).knockOut(f, false);
  };

  it('builds the approved one-battle route for all 38 rows on Sakura Street', () => {
    expect(rows).toHaveLength(38);
    for (const [who, row] of rows) {
      const battle = longBattle(who);
      expect(battle.stage, who).toBe(9);
      expect(battle.slots, who).toHaveLength(isBoss(who) ? 12 : 13);
      expect(namesOf(battle).slice(0, 12), who).toEqual(row.flat());
      for (const key of HEADER_KEYS)
        expect(battle[key], `${who} ${key}`).toBe(opener[key]);
    }
    // Every seat is a fresh spread of its donor role slot.
    for (const who of ['ryuko', 'dora'] as Who[])
      for (const slot of longBattle(who).slots)
        expect(opener.slots).not.toContain(slot);
  });

  it('seats ryuko’s hard-coded row and dora’s straight from the ticket', () => {
    expect(namesOf(longBattle('ryuko')).slice(0, 12)).toEqual([
      'sww',
      'gigi',
      'feng',
      'sean',
      'kay',
      'lizard',
      'kate',
      'gon',
      'times',
      'masa',
      'dido',
      'sakuya',
    ]);
    expect(namesOf(longBattle('dora')).slice(0, 12)).toEqual([
      'zoma',
      'ryuko',
      'giant',
      'suneo',
      'yo',
      'sin',
      'alex',
      'sou',
      'kiki',
      'chung',
      'aya',
      'yinan',
    ]);
  });

  it('opens on the HERE COMES A NEW CHALLENGER screen for all 38 rows', () => {
    expect(BR_LONG_DEMO).toBe(24);
    for (const [who] of rows)
      expect(brLongStory(who)[0], who).toEqual({ type: 2, demo: 24 });
  });

  it('gives the Z-MEGA ally the partner life bar from the first tick', () => {
    for (const [who] of rows) {
      if (isBoss(who)) continue;
      const battle = longBattle(who);
      // Bit 0 (+0xdf0d) is the story partner's bar flag (Match.lifeBars).
      expect(battle.slots.at(-1)!.flags & 1, who).toBe(1);
      // The enemies keep the opener's bar-less roles.
      for (const slot of battle.slots.slice(0, 12))
        expect(slot!.flags & 1, who).toBe(0);
    }
    const match = Match.story('ryuko', longBattle('ryuko'));
    const partner = match.fighters.at(-1)!;
    expect(partner.who).toBe('zmega');
    toFight(match);
    expect(match.lifeBars).toEqual([partner]);
    // A boss plays alone: no partner, no bar.
    const boss = Match.story('zenka', longBattle('zenka'));
    toFight(boss);
    expect(boss.lifeBars).toEqual([]);
  });

  it('adds Z-MEGA as the ordinary player’s first-tick ally (RARIO for Z-MEGA) and gives a boss no ally', () => {
    expect(brLongPartner('ryuko')).toBe('zmega');
    expect(brLongPartner('rario')).toBe('zmega');
    expect(brLongPartner('zmega')).toBe('rario');
    for (const [who] of rows) {
      const battle = longBattle(who);
      for (const slot of battle.slots)
        expect(slot!.tough, `${who} tough`).toBe(
          isBoss(who) ? true : undefined,
        );
      if (isBoss(who)) continue;
      const ally = battle.slots.at(-1)!;
      expect(ROSTER[ally.player], who).toBe(
        who === 'zmega' ? 'rario' : 'zmega',
      );
      expect(ally.flags & 0x200, who).toBe(0x200);
      // Entry bits 1–2 are 0: on stage from the first tick.
      expect((ally.flags >> 1) & 3, who).toBe(0);
      expect(ally.watch, who).toBe(0);
      // Hostile exactly to the twelve enemy seats — never the 1P or itself.
      expect(ally.enemies, who).toBe(
        enemyMask(battle, battle.slots.length - 1, true),
      );
      // The left opening faces right toward the 1P and never overlaps the
      // first enemy's right-side slot.
      expect(ally.x, who).toBe(450);
      expect(ally.x, who).not.toBe(battle.slots[0]!.x);
    }
  });

  it('paces natively: the first enemy present, each next waiting on its predecessor’s own mark', () => {
    for (const [who] of rows) {
      const battle = longBattle(who);
      const players = battle.slots.slice(0, 12).map((s) => s!.player);
      expect((battle.slots[0]!.flags >> 1) & 3, `${who} first enemy`).toBe(0);
      for (let i = 1; i < 12; i++) {
        const slot = battle.slots[i]!;
        expect((slot.flags >> 1) & 3, `${who} entry ${i}`).toBe(2);
        expect(slot.watch, `${who} watch ${i}`).toBe(i);
        expect(slot.below, `${who} below ${i}`).toBe(
          desperationOf(ROSTER[players[i - 1]!]!),
        );
      }
      expect(
        battle.slots.slice(0, 12).map((s) => s!.x),
        who,
      ).toEqual(players.map((_, i) => (i % 2 === 0 ? 850 : 450)));
    }
  });

  it('seats symmetric hostility: mates allied, the others hostile, the ally against all twelve', () => {
    for (const [who] of rows) {
      const battle = longBattle(who);
      for (const [i, a] of battle.slots.entries()) {
        // The whole mask from team membership by seat: mates friendly,
        // the 1P and the ally one team, every other seat hostile.
        expect(a!.enemies, `${who} slot ${i}`).toBe(enemyMask(battle, i, true));
        expect(a!.enemies & (1 << (i + 1)), `${who} self ${i}`).toBe(0);
        expect(!!(a!.enemies & 1), `${who} vs 1P ${i}`).toBe(!isAllySlot(a));
        for (const [j, b] of battle.slots.entries())
          expect(
            !!(a!.enemies & (1 << (j + 1))),
            `${who} ${i + 1}->${j + 1}`,
          ).toBe(!!(b!.enemies & (1 << (i + 1))));
      }
    }
  });

  it('meets §7 LONG spread through the builder: 16 pairs 14-15 times, 2-3 per position, 38 distinct rows, 192 combos (36 twice)', () => {
    const perPair = new Map<string, number>();
    const perSlot = Array.from({ length: 6 }, () => new Map<string, number>());
    const combos = new Map<string, number>();
    const lineups = new Map<string, Who>();
    for (const [who] of rows) {
      const players = longBattle(who)
        .slots.slice(0, 12)
        .map((s) => s!.player);
      lineups.set(players.join(','), who);
      pairsOf(players).forEach(([a, b], pos) => {
        const key = pairKey([a, b]);
        perPair.set(key, (perPair.get(key) ?? 0) + 1);
        perSlot[pos]!.set(key, (perSlot[pos]!.get(key) ?? 0) + 1);
        const combo = leaderPosKey([a, b], pos);
        combos.set(combo, (combos.get(combo) ?? 0) + 1);
      });
    }
    expect(lineups.size, 'distinct ordered LONG lineups').toBe(38);
    expect(perPair.size).toBe(16);
    for (const key of perPair.keys())
      countIn(perPair, key, 14, 15, 'built long pair');
    for (const slot of perSlot)
      for (const key of slot.keys())
        countIn(slot, key, 2, 3, 'built long position');
    expect(combos.size, 'lead/slot combos').toBe(192);
    expect([...combos.values()].filter((n) => n === 1)).toHaveLength(156);
    expect([...combos.values()].filter((n) => n === 2)).toHaveLength(36);
  });

  it('seats 14 native fighters for an ordinary player and 13 for a boss, Z-MEGA present from the first tick', () => {
    const ordinary = Match.story(
      'ryuko',
      longBattle('ryuko'),
      0,
      undefined,
      undefined,
      true,
    );
    expect(ordinary.fighters.map((f) => f.who)).toEqual([
      'ryuko',
      'sww',
      'gigi',
      'feng',
      'sean',
      'kay',
      'lizard',
      'kate',
      'gon',
      'times',
      'masa',
      'dido',
      'sakuya',
      'zmega',
    ]);
    // The 1P, the first enemy and Z-MEGA are in; the other eleven wait.
    expect(ordinary.fighters.map((f) => f.present)).toEqual([
      true,
      true,
      ...Array<boolean>(11).fill(false),
      true,
    ]);
    const boss = Match.story('dora', longBattle('dora'));
    expect(boss.fighters.map((f) => f.who)).toEqual([
      'dora',
      'zoma',
      'ryuko',
      'giant',
      'suneo',
      'yo',
      'sin',
      'alex',
      'sou',
      'kiki',
      'chung',
      'aya',
      'yinan',
    ]);
    expect(boss.fighters.map((f) => f.present)).toEqual([
      true,
      true,
      ...Array<boolean>(11).fill(false),
    ]);
  });

  it('enters each next enemy below its predecessor’s own mark, unstalled at a 0% cheat line', () => {
    const match = Match.story(
      'ryuko',
      longBattle('ryuko'),
      0,
      undefined,
      undefined,
      true,
    );
    match.useCheats({ ...DEFAULT_CHEATS, enabled: true, lowHpLine: 0 });
    toFight(match);
    const [, first, second] = match.fighters;
    expect(second.present).toBe(false);
    // The native mark of the watched fighter, never 1P's cheat line.
    first.hp = desperationOf(first.who) - 1;
    match.step();
    expect(second.present).toBe(true);
  });

  it('keeps HPA-972’s no-partner cheat removing Z-MEGA without corrupting the waits', () => {
    const match = Match.story(
      'ryuko',
      longBattle('ryuko'),
      0,
      undefined,
      undefined,
      true,
    );
    match.useCheats({ ...DEFAULT_CHEATS, enabled: true, brNoPartner: true });
    expect(match.fighters.map((f) => f.who)).not.toContain('zmega');
    expect(match.fighters).toHaveLength(13);
    const waits = (match as unknown as { waits: (Slot | null)[] }).waits;
    expect(waits).toHaveLength(13);
    expect(waits.slice(0, 2).every((w) => w === null)).toBe(true);
    expect(waits.slice(2).every((w) => w !== null)).toBe(true);
    toFight(match);
    const [, first, second] = match.fighters;
    expect(second.present).toBe(false);
    first.hp = desperationOf(first.who) - 1;
    match.step();
    expect(second.present).toBe(true);
  });

  it('marks a boss LONG tough through Match and leaves the ordinary native', () => {
    const boss = Match.story('dora', longBattle('dora'));
    expect(boss.fighters[0]).toMatchObject({ maxHp: lifeOf('dora') });
    for (const f of boss.fighters.slice(1))
      expect(f, f.who).toMatchObject({
        hp: 2 * lifeOf(f.who),
        maxHp: 2 * lifeOf(f.who),
        maxStock: 5,
        enGainMultiplier: 2,
      });
    const ordinary = Match.story('kiki', longBattle('kiki'));
    for (const f of ordinary.fighters)
      expect(f, f.who).toMatchObject({
        hp: lifeOf(f.who),
        maxHp: lifeOf(f.who),
        maxStock: stocksOf(f.who),
        enGainMultiplier: 1,
      });
  });

  it('wins by defeating all twelve, never six, and loses on the 1P’s KO', () => {
    const match = Match.story(
      'ryuko',
      longBattle('ryuko'),
      0,
      undefined,
      undefined,
      true,
    );
    toFight(match);
    const [one] = match.fighters;
    for (let i = 1; i <= 12; i++) {
      const enemy = match.fighters[i]!;
      expect(enemy.present, `enemy ${i} in place`).toBe(true);
      knockOut(match, enemy, one);
      for (let t = 0; t < 3; t++) match.step();
      expect(match.winner, `after ${i} KOs`).toBe(i === 12 ? 'player' : null);
    }
    expect(one.points).toBe(100);
    expect(match).toMatchObject({ winner: 'player', wins: [1, 0], lost: 0 });
    const loss = Match.story(
      'ryuko',
      longBattle('ryuko'),
      0,
      undefined,
      undefined,
      true,
    );
    toFight(loss);
    knockOut(loss, loss.fighters[0]!, loss.fighters[1]!);
    for (let t = 0; t < 3; t++) loss.step();
    expect(loss).toMatchObject({ winner: 'opponent', wins: [0, 1], lost: 1 });
  });
});
