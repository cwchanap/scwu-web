// Test helpers. Ryuko's moves play from their own timelines, entered by
// source action; these name the ones the tests drive.
import { firstStrike } from './match';
import type { Fighter, Match } from './match';

export const RYUKO = {
  fall: 7,
  doubleJump: 10,
  doubleJumpF: 11,
  doubleJumpB: 12,
  dash: 13,
  backdash: 14,
  dashLand: 15,
  airDash: 16,
  airBackdash: 17,
  punch: 178,
  punchHit: 179,
  punch2: 180,
  punch3: 181,
  airPunch: 182,
  airDashPunch: 183,
  doubleJumpPunch: 184,
  crouchPunch: 185,
  kick: 186,
  kickHit: 187,
  kick2: 188,
  kick3: 189,
  kick3Repeat: 190,
  airKick: 191,
  airDashKick: 192,
  doubleJumpKick: 193,
  crouchKick: 194,
  hitUp: 200,
  hitUpRecover: 201,
  hitUpJump: 202,
} as const;

// What a fighter plays: a timeline's source action, or a clip action.
export const playing = (f: Fighter) =>
  f.action === 'script' ? f.branch : f.action;

// Enters a source action (at `offset`, as a jump does) as a command does,
// then runs its records through `age` without moving anyone, so a test can
// start a move mid-timeline.
export function enter(
  match: Match,
  f: Fighter,
  index: number,
  age = 0,
  offset = 0,
) {
  const m = match as unknown as {
    enterSource(f: Fighter, index: number, offset: number): void;
    fireEvents(f: Fighter): void;
  };
  m.enterSource(f, index, offset);
  while (f.age < age) {
    f.age++;
    m.fireEvents(f);
  }
}

// The tick before a move's first strike (its first op 0x18 box).
export function strike(match: Match, f: Fighter, index: number) {
  enter(match, f, index, firstStrike(f.who, index, 'ryuko').from - 1);
}

// Puts a fighter at `age` of an action: one of Ryuko's moves through its
// timeline, or a clip action.
export function pose(match: Match, f: Fighter, action: string, age: number) {
  if (action in RYUKO)
    enter(match, f, RYUKO[action as keyof typeof RYUKO], age);
  else Object.assign(f, { action, age });
}

// A fighter's move by name: one of RYUKO's, counting the branches its
// timeline jumps to within the same action ("181+11" is punch 3), or its
// clip action.
export function named(f: Fighter): string {
  if (f.action !== 'script') return f.action;
  const index = Number(String(f.branch).split('+')[0]);
  const found = Object.entries(RYUKO).find(([, i]) => i === index);
  return found ? found[0] : String(f.branch);
}
