// Test helpers. Ryuko's moves play from their own timelines, entered by
// source action; these name the ones the tests drive, and the objects they
// spawn (the axe, DST's missiles).
import type { ObjectKey } from './animations';
import { firstStrike } from './match';
import type { Effect, Fighter, Match } from './match';

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
  grab: 196,
  throw: 197,
  exChange: 204,
  norChange: 205,
  drill: 207,
  airDrill: 208,
  airDrillSpin: 209,
  airDrillSpin2: 210,
  airDrillSpin3: 211,
  drillLand: 212,
  dst: 214,
  dstHit: 215,
  dstMissile: 218,
  dstFar: 220,
  evilDst: 221,
  evilDstHit: 222,
  evilDstFar: 224,
  axeBusy: 225,
  axeThrow: 226,
  axe: 227,
  axeHit: 230,
  exFire: 231,
  iori: 246,
  iori2: 247,
  iori3: 248,
  cpuIori: 410,
  cpuIoriRecover: 411,
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

// The source action of a timeline key ("181+11" is 181).
export const base = (key: ObjectKey | null) =>
  Number(String(key).split('+')[0]);

// A fighter's move by name: one of RYUKO's, counting the branches its
// timeline jumps to within the same action ("181+11" is punch 3), or its
// clip action.
export function named(f: Fighter): string {
  if (f.action !== 'script') return f.action;
  const index = base(f.branch);
  const found = Object.entries(RYUKO).find(([, i]) => i === index);
  return found ? found[0] : String(f.branch);
}

// A fighter's objects of one source action, its branches included.
export const objects = (match: Match, index: number, owner?: number) =>
  match.effects.filter(
    (e) => base(e.clip) === index && (owner === undefined || e.owner === owner),
  );

// Spawns one of fighter `owner`'s objects at a stage position as op 0x04
// does, running its first records: in slot `slot`, or in none.
export function spawn(
  match: Match,
  owner: number,
  index: number,
  { x, y, facing = 1 }: { x: number; y: number; facing?: -1 | 1 },
  slot?: number,
): Effect {
  const m = match as unknown as {
    spawnObject(
      parent: { x: number; y: number; facing: -1 | 1 },
      owner: number,
      event: object,
    ): void;
  };
  const spawned = match.effects.length;
  m.spawnObject({ x, y, facing }, owner, {
    flags: slot === undefined ? 5 : 1,
    action: index,
    offset: 0,
    x: 0,
    y: 0,
    slot: slot ?? 0,
    z: 0,
  });
  // Its own children follow it.
  return match.effects[spawned];
}
