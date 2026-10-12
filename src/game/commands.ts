// The command recognizer. Every tick the engine records each player's input
// as a word (0x4146d0 via 0x414340): bit 1 back, 2 forward, 4 up and 8 down,
// then the buttons K 0x10, Hit Up 0x20, P 0x80 and Chuck 0x100 (0x40 only
// appears in CPU IORI's command). Left and right count from the opponent's
// side, and 0x40e6c2 flips the tick's word when that changes; Ryuko's
// +0x7cb6 lacks bit 8, so neither check below mirrors.
import type { Who } from './characters';
import data from './generated/assets.json';
import zoma from './generated/zoma.json';
import kiki from './generated/kiki.json';
import chung from './generated/chung.json';
import amiro from './generated/amiro.json';
import type { Control, Input } from './match';

export interface CommandEntry {
  name: string;
  window: number;
  air: number;
  near: number;
  far: number;
  crouch: number;
  steps: number[];
}
// Each player's entries (player +0x4da2: Ryuko's 23, Zoma's 25, Kiki's 20,
// Chung's 22)
// and the distance in source pixels that splits their near and far actions
// (+0x7ca3).
const TABLES: Record<Who, { entries: readonly CommandEntry[]; near: number }> =
  {
    ryuko: data.commands,
    zoma: zoma.commands,
    kiki: kiki.commands,
    chung: chung.commands,
    amiro: amiro.commands,
  };
export const entriesOf = (who: Who) => TABLES[who].entries;
export const nearOf = (who: Who) => TABLES[who].near;
export const ENTRIES = entriesOf('ryuko');
export const NEAR = nearOf('ryuko');
export const DOWN = 8;
const BUTTONS = { kick: 0x10, hitUp: 0x20, punch: 0x80, throw: 0x100 };
// Entries (1-based) as the port's controls, with the direction a jump or
// dash carries.
export const CONTROLS: Record<number, [Control, string?]> = {
  1: ['changeAttack'],
  2: ['megaBeam'],
  3: ['musashi'],
  4: ['getterBeam'],
  5: ['blackRush'],
  6: ['axe'],
  7: ['dst'],
  8: ['drill'],
  9: ['iori'],
  10: ['jump'],
  11: ['jump', 'F'],
  12: ['jump', 'B'],
  13: ['dash'],
  14: ['dash', 'B'],
  15: ['ex'],
  17: ['hitUp'],
  18: ['throw'],
  19: ['punch'],
  20: ['kick'],
  22: ['cpuIori'],
};
// Authored: the port's command keys, in the order one is taken when several
// are pressed together. Each writes its entry's steps as the CPU does.
const RYUKO_KEYS: [Control, number][] = [
  ['getterBeam', 4],
  ['musashi', 3],
  ['changeAttack', 1],
  ['blackRush', 5],
  ['megaBeam', 2],
  ['drill', 8],
  ['iori', 9],
  ['cpuIori', 22],
  ['dst', 7],
  ['axe', 6],
  ['ex', 15],
  // Shift: DASH F, or DASH B (14) while back is held (Match.record).
  ['dash', 13],
];
// Zoma's moves take Ryuko's keys: SPAKE (3), DST (1), EN300 (4) and his
// 'コマンド 1', Shin Spark (2), on 1-4, DRAGON (6), dragon 2 p (9), BOMB
// (11), FIRE (10) and g beam (5), then DASH F (15) and DASH B (16).
export const KEYS: Record<Who, [Control, number][]> = {
  ryuko: RYUKO_KEYS,
  zoma: [
    ['getterBeam', 3],
    ['musashi', 1],
    ['changeAttack', 4],
    ['blackRush', 2],
    ['drill', 6],
    ['iori', 9],
    ['dst', 11],
    ['axe', 10],
    ['ex', 5],
    ['dash', 15],
  ],
  // Kiki's supers ranbu, MAGIC FIRE and EN3 majic dance on 1-3, and her
  // specials DRAGON O (5), K' (4) and TATUMAKI (6) on Ryuko's special keys,
  // then DASH F (11) and DASH B (12).
  kiki: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 5],
    ['iori', 6],
    ['axe', 4],
    ['dash', 11],
  ],
  // Chung's supers gesar, KICK UP and EN3 on 1-3; his specials Dragon (6),
  // orochi (4), BK (8) and Fire ball (7) on Ryuko's special keys, --TYPE--
  // (13, TO EX) on EX, then Dash F (14) and Dash B (15). Jump wall move (5)
  // and air fire (9) take their commands only.
  chung: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 6],
    ['iori', 4],
    ['dst', 8],
    ['axe', 7],
    ['ex', 13],
    ['dash', 14],
  ],
  // Amiro's supers scc, medeo, NT and funnal on 1-4; her specials Dragon (7),
  // Coment chuck (6), morning star (8) and BEAM (5) on Ryuko's special keys,
  // ----- (9, EX Ch) on EX, then Dash F (13) and Dash B (14).
  amiro: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['drill', 7],
    ['iori', 6],
    ['dst', 8],
    ['axe', 5],
    ['ex', 9],
    ['dash', 13],
  ],
};
export const BACK_DASH: Record<Who, number> = {
  ryuko: 14,
  zoma: 16,
  kiki: 12,
  chung: 15,
  amiro: 14,
};
// Long enough for the longest window (90) and the tick before it.
export const HISTORY_TICKS = 128;

export function inputWord(input: Input, forwardIsRight: boolean) {
  let word = (input.jump ? 4 : 0) | (input.crouch ? DOWN : 0);
  if (input.left) word |= forwardIsRight ? 1 : 2;
  if (input.right) word |= forwardIsRight ? 2 : 1;
  for (const [control, bit] of Object.entries(BUTTONS))
    if (input[control as Control]) word |= bit;
  return word;
}

// 0x41f138: a step's direction nibble as input bits. 2–9 are F, DF, D, DB, B,
// UB, U and UF; 10–13 are back, up, forward and down.
const DIRECTIONS = [0, 0, 2, 10, 8, 9, 1, 5, 4, 6, 1, 4, 2, 8, 0, 0];

// 0x410acf–0x410c24 (and the scan's 0x4101a7–0x4102e8): nibble 0 takes any
// direction, 1–9 exactly theirs (1 none), 10–13 any that has their bit. The
// buttons, bits 4–9, must all be held, and none of them the tick before.
// ponytail: both fighters' steps are all type 0 (bits 14–15 clear); the
// scan's held types 1–3 (0x4102ed–0x41061a) aren't ported.
function stepMatches(step: number, word: number, before: number) {
  const nibble = step & 15;
  const direction = word & 15;
  const buttons = step & 0x3f0;
  return (
    !(step & 0xc000) &&
    (!nibble ||
      (nibble < 10
        ? direction === DIRECTIONS[nibble]
        : nibble < 14 && (direction & DIRECTIONS[nibble]) > 0)) &&
    (word & buttons) === buttons &&
    !(before & buttons)
  );
}

// The last step marked 0x2000 matches first, then each earlier step on an
// earlier tick, all within the last `window` ticks (op 0x24's 0x410a50 and
// the scan's 0x410171–0x410878).
export function commanded(
  history: readonly number[],
  steps: readonly number[],
  window: number,
) {
  let k = steps.length - 1;
  while (k >= 0 && !(steps[k] & 0x2000)) k--;
  if (k < 0) return false;
  const now = history.length - 1;
  for (let t = now; t > now - window; t--)
    if (stepMatches(steps[k], history[t] ?? 0, history[t - 1] ?? 0) && --k < 0)
      return true;
  return false;
}

// 0x410060, in free actions and op 0x1e windows: the first entry in table
// order whose steps match and that has an action for the fighter. Airborne
// it takes the air action, though none within 50 source pixels of the floor
// on the way down (0x410096); on the ground and still, the crouching one
// while down is held, else the near or far one (0x4107b7–0x41083a).
export type Stance = 'air' | 'near' | 'far' | 'crouch';
export function scan(
  history: number[],
  fighter: { air: boolean; still: boolean; landing: boolean; near: boolean },
  who: Who = 'ryuko',
): { entry: number; stance: Stance } | null {
  if (fighter.landing) return null;
  const now = history[history.length - 1];
  for (const [index, entry] of entriesOf(who).entries()) {
    if (!entry.window) continue;
    // An entry without steps ends the scan (0x410141).
    if (!entry.steps.length) return null;
    if (!commanded(history, entry.steps, entry.window)) continue;
    // 0x41073e: matching a command whose window exceeds 29 clears all but
    // the last 20 ticks, whether or not it has an action.
    if (entry.window > 29) history.fill(0, 0, history.length - 20);
    const stance: Stance | null = fighter.air
      ? 'air'
      : !fighter.still
        ? null
        : now & DOWN
          ? 'crouch'
          : fighter.near
            ? 'near'
            : 'far';
    if (stance && entry[stance]) return { entry: index + 1, stance };
  }
  return null;
}

// 0x4115e3–0x41166a: the CPU enters a command by writing its marked steps
// into its history, the last at this tick, each as its direction's bits from
// 0x41f138 plus its buttons, and `direction`'s bits.
export function inject(
  history: number[],
  entry: number,
  who: Who = 'ryuko',
  direction = 0,
) {
  const words = entriesOf(who)
    [entry - 1].steps.filter((step) => step & 0x2000)
    .map((step) => DIRECTIONS[step & 15] | (step & 0x3f0) | direction);
  history.splice(history.length - words.length, words.length, ...words);
}
