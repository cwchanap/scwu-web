// Test helpers. Ryuko's moves play from their own timelines, entered by
// source action; these name the ones the tests drive, and the objects they
// spawn (the axe, DST's missiles).
import type { ObjectKey } from './animations';
import { CHARACTERS } from './characters';
import type { Who } from './characters';
import { fighterPose, firstStrike, HUD_FACES, Match } from './match';
import type { Effect, Fighter, Input } from './match';

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
  counterHit: 174,
  airNoSuper: 250,
  noSuper: 251,
  // Action 254: a super cancelling IORI spends two stocks here.
  superCancel: 254,
  musashi: 256,
  musashiHit: 257,
  airGetterBeam: 263,
  getterBeam: 264,
  scGetterBeam: 265,
  evilBeam: 278,
  scEvilBeam: 279,
  airEvilBeam: 280,
  blackRush: 286,
  megaBeam: 292,
  megaBeamHit: 294,
  changeAttack: 319,
  changeAttackHit: 320,
  efs: 331,
  efsCancel: 332,
} as const;

// What a fighter plays: a timeline's source action, or a clip action.
export const playing = (f: Fighter) =>
  f.action === 'script' ? f.branch : f.action;

// Enters a source action (at `offset`, as a jump does) as a command does,
// then runs its records through `age` without moving anyone, so a test can
// start a move mid-timeline. Entered between steps, its first tick skips the
// hit test (the next step runs its second first), so a box living on that
// tick alone never meets: those tests enter through the command (TTRO's and
// ASTROMAN's CC).
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

// The match's objects but those keeping to the HUD faces (spawnFaces), which
// every round outside a story has, and the VS CHARGE each player starts with
// in a match with no intro.
export const fightObjects = (match: Match) =>
  match.effects.filter(
    (e) =>
      !HUD_FACES.some((face) => face === e.follow?.parent) &&
      base(e.clip) !== CHARACTERS[e.who as Who]?.charge,
  );

// A fighter's objects of one source action, its branches included.
export const objects = (match: Match, index: number, owner?: number) =>
  match.effects.filter(
    (e) => base(e.clip) === index && (owner === undefined || e.owner === owner),
  );

// Spawns one of fighter `owner`'s objects at a stage position as op 0x04
// does, in slot `slot` or in none; it first steps at the next tick.
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
  const before = new Set(match.effects);
  m.spawnObject({ x, y, facing }, owner, {
    flags: slot === undefined ? 5 : 1,
    action: index,
    offset: 0,
    x: 0,
    y: 0,
    slot: slot ?? 0,
    z: 0,
  });
  return match.effects.find((e) => !before.has(e))!;
}

// A Vs. CPU intro, which the title's demos play with global 3 at 0: 開始時
// jumps to 開始時 BR. It steps `who`, as player 1 against Zoma, until it
// idles, recording the timelines it plays, each tick's image and height,
// the sounds it cues by tick and the objects it spawns.
export function brIntro(
  who: Who,
  seed = 0,
  input: (t: number) => Input = () => ({}),
) {
  const match = new Match('cpu', true, seed, [who, 'zoma']);
  const f = match.fighters[0];
  const [path, images, heights] = [[], [], []] as [
    ObjectKey[],
    number[],
    number[],
  ];
  const sounds: [number, number][] = [];
  const objects = new Set<ObjectKey>();
  let ticks = 0;
  while (f.action === 'script') {
    match.step(input(ticks++));
    for (const { owner, index } of match.sounds)
      if (owner === 0) sounds.push([ticks - 1, index]);
    for (const e of fightObjects(match)) if (e.owner === 0) objects.add(e.clip);
    if (f.action !== 'script') break;
    if (path.at(-1) !== f.branch) path.push(f.branch!);
    images.push(fighterPose(f).image);
    heights.push(f.y);
  }
  return { match, f, path, images, heights, sounds, objects, ticks };
}

// LIZARD's chuck sup on side `side`, catching `victim` at 1 life as it jumps:
// the victim's path until the round can end, and the sounds and screen
// objects of the tick it took its seventh.
export function chuckKO(side: number, victim: Who) {
  const match = new Match(
    'practice',
    false,
    3,
    side ? [victim, 'lizard'] : ['lizard', victim],
  );
  const lizard = match.fighters[side];
  const other = match.fighters[1 - side];
  other.x = lizard.x + 90 * lizard.facing;
  other.hp = 1;
  lizard.stock = 3;
  const step = (mine: Input, theirs: Input) =>
    side ? match.step(theirs, mine) : match.step(mine, theirs);
  step({}, {});
  step({}, {});
  const path: unknown[] = [];
  let entry = {};
  for (let t = 0; t < 3000 && !match.resultReady; t++) {
    step(t ? {} : { musashi: true }, t === 50 ? { jump: true } : {});
    if (path.at(-1) === playing(other)) continue;
    path.push(playing(other));
    if (path.length === 7)
      entry = {
        sounds: match.sounds,
        screen: fightObjects(match)
          .filter((e) => e.screen)
          .map((e) => e.clip),
      };
  }
  return { match, path, entry };
}
