import { CHARACTERS, desperationOf } from './characters';
import type { Who } from './characters';
import { BR_ANOTHER_LINEUPS, BR_LONG_LINEUPS } from './br-lineups';
import { BOSSES, ROSTER } from './select';
import { rand } from './standing';
import type { Battle, Slot, Step } from './story';

export interface BrAnotherStages {
  stage1: Battle;
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
const BOSS_ARENAS: Record<(typeof BOSSES)[number], number> = {
  zenka: 12,
  alpha: 14,
  shinz: 15,
  dora: 18,
};
const bossArena = (seat: number): number => {
  const who = ROSTER[seat];
  if (who && who in BOSS_ARENAS)
    return BOSS_ARENAS[who as (typeof BOSSES)[number]];
  throw new Error(`No boss arena for seat ${seat}`);
};

const FOLDED_START = 44;

// The seeded Fisher–Yates draw only the bosses' generated ANOTHER runs
// (HPA-858): one stream per boss, seeded by its ROSTER seat, every stage
// drawn in order. The approved table rows (br-lineups.ts) seat everyone
// else's B.R. stages and every B.R. LONG.
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

// Approved (HPA-1035 §7): the seats are the typed row's Who names in entering
// order, mapped back to ROSTER seats.
const seats = (row: readonly (readonly Who[])[]) =>
  row.flat().map((who) => ROSTER.indexOf(who));

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
  // when the route donates one, the ally behind them.
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
        x: i % 2 === 0 ? 850 : 450,
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

// Authored (HPA-1035 §7, owner-approved 16 Nov 2026): every fighter's three
// ANOTHER stages come from the approved lineup table. Stage 1 seats three of
// the twelve regular pairs; the roles, header and ally come from the
// fighter's own source stage-1 opener (finale − 2, itself a stage-9 battle),
// except the folded four, whose source stage-1 slot (45) is a native stage
// battle — they keep HPA-766's donation: ryuko's step 63 for roles, their
// own step 45 for the header, stage 9, the finale's ally. Stage 2 seats
// three of the four extra pairs (the fighter's own is out), stage 3 the four
// bosses in approved order with the last boss's arena; both keep the source
// finale's roles, header and ally. assemble derives each seat's watch/below
// from its actual predecessor, and a donated ally is rebuilt to watch the
// 1P at the 1P's own desperation mark rather than keeping the donor's stale
// threshold (sww's opener ships below 160).
export const brAnotherStages = (who: Who): BrAnotherStages => {
  const row = BR_ANOTHER_LINEUPS[who];
  if (!row) throw new Error(`${who} has no approved B.R. ANOTHER row`);
  const finale = sourceStep(who, finaleIndex(who));
  const folded = FOLDED.includes(who);
  const opener = folded
    ? sourceStep(who, 45)
    : sourceStep(who, finaleIndex(who) - 2);
  const allyOf = (donor: Battle): Slot => ({
    ...donor.slots[6]!,
    watch: 0,
    below: desperationOf(who),
  });
  const stage1 = assemble(
    folded ? sourceStep('ryuko', 63) : opener,
    opener,
    seats(row.stage1),
    true,
    9,
    allyOf(folded ? finale : opener),
  );
  const stage2 = assemble(
    finale,
    finale,
    seats(row.stage2),
    true,
    3,
    allyOf(finale),
  );
  const bosses = seats([row.stage3]);
  const stage3 = assemble(
    finale,
    finale,
    bosses,
    false,
    bossArena(bosses.at(-1)!),
    allyOf(finale),
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
    bossArena(bosses.at(-1)!),
  );
  for (const battle of [stage1, stage2])
    for (const slot of battle.slots) slot!.tough = true;
  return [stage1, stage2, stage3, { type: 4 }];
};

// Authored (HPA-1035 §5): the ANOTHER route now runs stage-1 intro → stage 1
// → demo 5 (SEEDED PLAYERS) → stage 2 → demo 7 (NEXT CHALLENGER) → stage 3 →
// the source finale, without shifting shared source indices. Non-folded
// fighters overwrite finale−2..finale+1 (all BR-Another-only steps) and
// append [demo 7, stage 3, jump → the original ending]; the folded four fill
// their 44..49 block with [demo 4, stage 1, demo 5, stage 2, demo 7, stage 3]
// and fall through to their source finale — except RARIO, whose unrelated
// shared tail (demo 91/Dora) starts at 50, so slot 49 jumps past it to the
// appended [stage 3, demo 25, end].
export const brAnotherStory = (who: Who): readonly Step[] => {
  const source = CHARACTERS[who].scenario as readonly Step[];
  const { stage1, stage2, stage3 } = brAnotherStages(who);
  const finale = finaleIndex(who);
  const steps: Step[] = [...source];
  if (FOLDED.includes(who)) {
    steps.splice(
      FOLDED_START,
      finale - FOLDED_START + 1,
      { type: 2, demo: 4 },
      stage1,
      { type: 2, demo: 5 },
      stage2,
      { type: 2, demo: 7 },
      who === 'rario'
        ? { type: 3, condition: 0, value: 0, offset: source.length - finale }
        : stage3,
    );
    if (who === 'rario') steps.push(stage3, { type: 2, demo: 25 }, { type: 4 });
    return steps;
  }
  const returnJump = source[finale + 1];
  if (returnJump?.type !== 3)
    throw new Error(`${who} step ${finale + 1} is not a return jump`);
  const ending = finale + 1 + returnJump.offset;
  steps[finale - 2] = stage1;
  steps[finale - 1] = { type: 2, demo: 5 };
  steps[finale] = stage2;
  steps[finale + 1] = {
    type: 3,
    condition: 0,
    value: 0,
    offset: source.length - (finale + 1),
  };
  steps.push({ type: 2, demo: 7 }, stage3, {
    type: 3,
    condition: 0,
    value: 0,
    offset: ending - (source.length + 2),
  });
  return steps;
};

// Authored (HPA-1035 §3, §8): the one-battle B.R. LONG route — the six
// approved ordered pairs (twelve enemies) on Sakura Street with the header
// and roles of ryuko's own stage-9 opener (63), followed by the end step; no
// demos and no Chii sign. An ordinary player adds DoraEmon as the sole
// partner, rebuilt from the opener's immediate-entry first slot with the
// ally flag (0x200) so he is on stage from the first tick; a boss player has
// no ally and all twelve hostile seats marked tough (Slot.tough; match.ts
// applies the stats). Pacing stays native: the first enemy is present at the
// start and each next enters once its predecessor falls below its own
// desperation mark (assemble's watch/below, read through match.ts lifeMark).
export const brLongStory = (who: Who): readonly Step[] => {
  const row = BR_LONG_LINEUPS[who];
  if (!row) throw new Error(`${who} has no approved B.R. LONG row`);
  const roles = sourceStep('ryuko', 63);
  const boss = (BOSSES as readonly Who[]).includes(who);
  const ally: Slot | undefined = boss
    ? undefined
    : {
        ...roles.slots[0]!,
        player: ROSTER.indexOf('dora'),
        flags: roles.slots[0]!.flags | 0x200,
      };
  const battle = assemble(roles, roles, seats(row), true, 9, ally);
  if (boss) for (const slot of battle.slots) slot!.tough = true;
  return [battle, { type: 4 }];
};
