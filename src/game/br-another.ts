import { CHARACTERS, desperationOf } from './characters';
import type { Who } from './characters';
import { BOSSES, ROSTER } from './select';
import { rand } from './standing';
import type { Battle, Slot, Step } from './story';

export interface BrAnotherStages {
  stage1: Battle | null;
  stage2: Battle;
  stage3: Battle;
}

const FOLDED: readonly Who[] = ['masa', 'times', 'zmega', 'rario'];
const TWINS: readonly Who[] = ['yinan', 'aya'];
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
const BOSS_SEATS: readonly number[] = BOSSES.map((who) => ROSTER.indexOf(who));
const BOSS_ARENAS: Record<number, number> = {
  30: 12,
  32: 14,
  33: 15,
  45: 18,
};

const FOLDED_START = 44;

// The seeded Fisher–Yates draw both route builders share: one stream per
// fighter, seeded by its ROSTER seat, every stage drawn in order.
const seededShuffle = (start: number) => {
  let seed = start;
  return <T>(units: readonly T[]): T[] => {
    const shuffled = [...units];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const [next, pick] = rand(seed);
      seed = next;
      const j = pick % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  };
};

const finaleIndex = (who: Who) =>
  FOLDED.includes(who) ? 49 : TWINS.includes(who) ? 67 : 65;

const sourceStep = (who: Who, index: number) =>
  (CHARACTERS[who].scenario as readonly Step[])[index] as Battle;

const assemble = (
  roles: Battle,
  header: Battle,
  players: readonly number[],
  paired: boolean,
  stage: number,
  ally?: Slot,
): Battle => {
  const n = players.length;
  // The hostility bits cover the actual seats: the 1P, the n players and,
  // when the route's finale donates one, the ally behind them.
  const all = (1 << (n + (ally ? 2 : 1))) - 1;
  const slots: Slot[] = players.map((player, i) => {
    const enemies =
      all & ~(1 << (i + 1)) & ~(paired ? 1 << (i % 2 === 0 ? i + 2 : i) : 0);
    if (i === 0) return { ...roles.slots[0]!, player, enemies };
    if (i === n - 1)
      return {
        ...roles.slots[5]!,
        player,
        enemies,
        watch: n - 1,
        x: 450,
        below: desperationOf(ROSTER[players[n - 2]!]!),
      };
    return {
      ...roles.slots[1]!,
      player,
      enemies,
      watch: i,
      x: i % 2 === 0 ? 850 : 450,
      below: desperationOf(ROSTER[players[i - 1]!]!),
    };
  });
  if (ally) slots.push({ ...ally, enemies: all & ~1 & ~(1 << (n + 1)) });
  return {
    type: header.type,
    stage,
    rounds: header.rounds,
    recover: header.recover,
    flags: header.flags,
    time: header.time,
    x: header.x,
    letterings: header.letterings,
    timeUp: header.timeUp,
    koScorer: header.koScorer,
    koPoints: header.koPoints,
    slots,
  };
};

export const brAnotherStages = (who: Who): BrAnotherStages => {
  const shuffle = seededShuffle(ROSTER.indexOf(who));
  const finale = sourceStep(who, finaleIndex(who));
  const ally = finale.slots[6]!;
  const stage1 = FOLDED.includes(who)
    ? assemble(
        sourceStep('ryuko', 63),
        sourceStep(who, 45),
        shuffle(STAGE_ONE_POOL).slice(0, 3).flat(),
        true,
        9,
        ally,
      )
    : null;
  const pairs = STAGE_TWO_PAIRS.filter(
    (pair) => !pair.includes(ROSTER.indexOf(who)),
  );
  const stage2 = assemble(finale, finale, shuffle(pairs).flat(), true, 3, ally);
  const bosses = shuffle(BOSS_SEATS);
  const stage3 = assemble(
    finale,
    finale,
    bosses,
    false,
    BOSS_ARENAS[bosses.at(-1)!],
    ally,
  );
  return { stage1, stage2, stage3 };
};

// Authored (HPA-858): the four bosses' B.R. ANOTHER route — three pure
// battles and the end step, no demos and no ally. Ryuko's source steps
// donate the roles and header: 63 for stage 1, 65 for stages 2 and 3; both
// flags' bit 0 keeps Continue. One seed stream from the boss's ROSTER seat
// draws stage 1's three of the twelve regular pairs, stage 2's three of the
// four extra pairs (one seeded omission) and the three other bosses in
// order; the last boss's arena hosts stage 3. Stages 1–2 mark all six enemy
// slots tough (Slot.tough; match.ts applies the stats).
export const bossBrAnotherStory = (who: Who): readonly Step[] => {
  const shuffle = seededShuffle(ROSTER.indexOf(who));
  const opener = sourceStep('ryuko', 63);
  const finale = sourceStep('ryuko', 65);
  const stage1 = assemble(
    opener,
    opener,
    shuffle(STAGE_ONE_POOL).slice(0, 3).flat(),
    true,
    9,
  );
  const stage2 = assemble(
    finale,
    finale,
    shuffle(STAGE_TWO_PAIRS).slice(0, 3).flat(),
    true,
    3,
  );
  const bosses = shuffle(
    BOSS_SEATS.filter((seat) => seat !== ROSTER.indexOf(who)),
  );
  const stage3 = assemble(
    finale,
    finale,
    bosses,
    false,
    BOSS_ARENAS[bosses.at(-1)!],
  );
  for (const battle of [stage1, stage2])
    for (const slot of battle.slots) slot!.tough = true;
  return [stage1, stage2, stage3, { type: 4 }];
};

export const brAnotherStory = (who: Who): readonly Step[] => {
  const source = CHARACTERS[who].scenario as readonly Step[];
  const { stage1, stage2, stage3 } = brAnotherStages(who);
  const finale = finaleIndex(who);
  const steps: Step[] = [...source];
  if (stage1 !== null) {
    steps.splice(
      FOLDED_START,
      finale - FOLDED_START + 1,
      { type: 2, demo: 4 },
      stage1,
      { type: 2, demo: 7 },
      stage2,
      stage3,
      who === 'rario'
        ? { type: 3, condition: 0, value: 0, offset: source.length - finale }
        : { type: 2, demo: 0 },
    );
    if (who === 'rario') steps.push({ type: 2, demo: 25 }, { type: 4 });
    return steps;
  }
  const returnJump = source[finale + 1];
  if (returnJump?.type !== 3)
    throw new Error(`${who} step ${finale + 1} is not a return jump`);
  const ending = finale + 1 + returnJump.offset;
  steps[finale] = stage2;
  steps[finale + 1] = {
    type: 3,
    condition: 0,
    value: 0,
    offset: source.length - (finale + 1),
  };
  steps.push(stage3, {
    type: 3,
    condition: 0,
    value: 0,
    offset: ending - (source.length + 1),
  });
  return steps;
};
