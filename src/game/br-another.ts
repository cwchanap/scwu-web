import { CHARACTERS, desperationOf } from './characters';
import type { Who } from './characters';
import { ROSTER } from './select';
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
const BOSSES: readonly number[] = [30, 32, 33, 45];
const BOSS_ARENAS: Record<number, number> = {
  30: 12,
  32: 14,
  33: 15,
  45: 18,
};

const finaleIndex = (who: Who) =>
  FOLDED.includes(who) ? 49 : TWINS.includes(who) ? 67 : 65;

const sourceStep = (who: Who, index: number) =>
  (CHARACTERS[who].scenario as readonly Step[])[index] as Battle;

const assemble = (
  roles: Battle,
  header: Battle,
  ally: Slot,
  players: readonly number[],
  paired: boolean,
  stage: number,
): Battle => {
  const n = players.length;
  const all = (1 << (n + 2)) - 1;
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
  slots.push({ ...ally, enemies: all & ~1 & ~(1 << (n + 1)) });
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
  const finale = sourceStep(who, finaleIndex(who));
  const ally = finale.slots[6]!;
  const stage1 = FOLDED.includes(who)
    ? assemble(
        sourceStep('ryuko', 63),
        sourceStep(who, 45),
        ally,
        shuffle(STAGE_ONE_POOL).slice(0, 3).flat(),
        true,
        9,
      )
    : null;
  const pairs = STAGE_TWO_PAIRS.filter(
    (pair) => !pair.includes(ROSTER.indexOf(who)),
  );
  const stage2 = assemble(finale, finale, ally, shuffle(pairs).flat(), true, 3);
  const bosses = shuffle(BOSSES);
  const stage3 = assemble(
    finale,
    finale,
    ally,
    bosses,
    false,
    BOSS_ARENAS[bosses.at(-1)!],
  );
  return { stage1, stage2, stage3 };
};
