import { CHARACTERS, STAGES, twin } from './characters';
import type { Container, Who } from './characters';
import data from './generated/assets.json';
import type { Frame } from './standing';

// Op 0x19 box in source pixels: centre and half size from the fighter's origin.
export type BodyBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: number;
  taken: number;
};
// Op 0x23 (0x413a07): blit mode (+0x54), signed offsets added to each 5-bit
// palette channel (+0x44/+0x48/+0x4c, 0x40d070) and mode 4's fade (+0x50).
export type Color = {
  mode: number;
  r: number;
  g: number;
  b: number;
  fade: number;
};
export const NORMAL_COLOR: Color = { mode: 0, r: 0, g: 0, b: 0, fade: 0 };
// Op 0x25 (0x413a9a): `count` afterimages, one sampled every `interval` + 1
// ticks, drawn in blit `mode`; `tint` picks each image's colour (0x40ce8e).
export type TrailSpec = Color & {
  count: number;
  interval: number;
  tint: number;
};
// Op 0x0e's shake for one axis: 0x40c9e0's type, amplitude in source pixels
// and length in drawn frames.
export type Quake = { type: number; amplitude: number; frames: number };
// Op 0x0e's colour fader: type, target r, g, b and fade, length in ticks, and
// flags picking the faders it starts (1 the owner, 2 the caught opponent, 4
// the screen's, 8 a second global).
export type FaderSpec = Omit<Color, 'mode'> & {
  type: number;
  ticks: number;
  flags: number;
};
// `held` marks an op 0x07 held-pose display, drawn by heldPlacement. `body`
// lists the op 0x19 boxes set when the pose displays, `color` the op 0x23
// state an earlier record of its clip set, `events` the op 0x03, 0x04, 0x0e,
// 0x1f (player variables) and 0x25 records run just before it, in a clip or
// a flattened timeline.
export type Pose = Frame & {
  width: number;
  height: number;
  held?: boolean;
  body?: BodyBox[];
  color?: Color;
  // The idle's op 0x15 too (idlePower).
  events?: (PoseEvent | Extract<SourceEvent, { op: 'power' }>)[];
};
// JSON infers each event's op as a string; the export writes only Pose's.
const clips = data.clips as unknown as Record<keyof typeof data.clips, Pose[]>;
const fighterClips = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, { clips }]) => [who, clips]),
) as unknown as Record<Who, Record<string, Pose[]>>;
interface Clip {
  frames: Pose[];
  ticks: number[];
  // Index of the first looping pose, or -1 to hold the final pose.
  loopStart: number;
  // Total ticks, and those before the loop.
  duration: number;
  intro: number;
}
// A numeric loop plays the earlier poses once, like a source jump back to a later PC.
function clip(
  frames: Pose[],
  loop: boolean | number = false,
  ticks = frames.map((f) => f.duration),
): Clip {
  const loopStart = loop === true ? 0 : loop === false ? -1 : loop;
  if (
    !frames.length ||
    ticks.length !== frames.length ||
    ticks.some((n) => !Number.isInteger(n) || n <= 0) ||
    loopStart >= frames.length
  )
    throw new Error('Animation clips need one positive tick duration per pose');
  // A pose that sets no body boxes keeps the previous pose's, as op 0x09 calls
  // and op 0x0a jumps keep them in the source (only 0x410cf0 clears them).
  let body: BodyBox[] | undefined;
  frames = frames.map((frame) => {
    body = frame.body ?? body;
    return frame.body || !body ? frame : { ...frame, body };
  });
  const total = (n: number) => ticks.slice(0, n).reduce((a, b) => a + b, 0);
  return {
    frames,
    ticks,
    loopStart,
    duration: total(ticks.length),
    intro: total(Math.max(0, loopStart)),
  };
}

// Source timelines flattened by scripts/export_assets.py: displays with op 0x09
// calls inlined and op 0x0a jumps followed, plus the gameplay opcodes at their
// action ages. The match plays every move and object from them.
export type ScriptEvent = { t: number } & SourceEvent;
export const POSE_EVENTS = [
  'sound',
  'spawn',
  'screen',
  'trail',
  'variable',
  // A clip action's op 0x1e window, which Zoma's stand (20) opens.
  'window',
] as const;
export type PoseEvent = Extract<
  SourceEvent,
  { op: (typeof POSE_EVENTS)[number] }
>;
export type SourceEvent =
  | {
      op: 'motion';
      ax: number;
      vx: number;
      vy: number;
      ay: number;
      flags: number;
    }
  | { op: 'handler'; slot: number; action: number; offset: number }
  // Op 0x03 plays sound `index` of the running container's table.
  | { op: 'sound'; index: number }
  // Op 0x0b calls an action without displays once (228/229 for the EX ball).
  | { op: 'call'; action: number }
  // Op 0x16 jumps when input condition r[7] holds, or fails with `negate`.
  | {
      op: 'input';
      condition: number;
      negate: boolean;
      action: number;
      offset: number;
    }
  // Op 0x1f jumps when its variable (r[4]) is == (1), > (2) or < (3) `value`.
  | {
      op: 'test';
      selector: number;
      compare: number;
      value: number;
      action: number;
      offset: number;
      // A forward skip in an inlined call, over the tick's next `skip` events
      // when it reaches its target within the tick.
      called?: boolean;
      skip?: number;
      // A jump back in an inlined call: the target's tick, past the events
      // already at it.
      rewind?: { t: number; skip: number };
      // A jump out of an inlined call, whose target runs out back into it:
      // the tick where this pass of the call runs out, past the events
      // already at it.
      resume?: { t: number; skip: number };
      // Below selector 0x40, the object's own variable, set or added to
      // first, or set to the round.
      pre?: { value: number; add: boolean; round?: boolean; x?: boolean };
    }
  | {
      op: 'spawn';
      flags: number;
      action: number;
      // The record the object starts at (r[4], 0x412c86).
      offset: number;
      x: number;
      y: number;
      slot: number;
      z: number;
      // While the slot's object lives, a player jumps here instead.
      busy: number;
      busyOffset: number;
    }
  | { op: 'hold'; flags: number; pose: number; x: number; y: number }
  // Op 0x10: stock <= min jumps, else stock += add; `atLeast`, stock >= min.
  | {
      op: 'stock';
      target: number;
      offset: number;
      min: number;
      add: number;
      atLeast: boolean;
    }
  | {
      op: 'life';
      target: number;
      offset: number;
      below: boolean;
      value: number;
    }
  | { op: 'apply'; flags: number; response: number; x: number; y: number }
  | {
      op: 'power';
      selfLife: number;
      selfPower: number;
      otherLife: number;
      otherPower: number;
    }
  | { op: 'responses'; ids: number[] }
  | {
      op: 'box';
      slot: number;
      x: number;
      y: number;
      w: number;
      h: number;
      kind: number;
      damage: number;
    }
  | { op: 'stop'; self: number; other: number }
  // Op 0x1e's cancel window: mode 1 after contact, 2 always; type 0 levels
  // [min, max], 1 only `action`.
  | {
      op: 'window';
      mode: number;
      type: number;
      min: number;
      max: number;
      action: number;
    }
  // Op 0x24 jumps when `steps` matched within the last `window` ticks.
  | {
      op: 'command';
      action: number;
      offset: number;
      window: number;
      steps: number[];
    }
  | { op: 'freeze'; add: number; set?: boolean }
  | { op: 'global'; index: number; value: number }
  | ({ op: 'color' } & Color)
  | ({ op: 'trail' } & TrailSpec)
  | { op: 'variable'; index: number; value: number }
  | { op: 'add'; index: number; value: number }
  | { op: 'local'; index: number; value: number; add: boolean }
  | {
      op: 'screen';
      fader: FaderSpec | null;
      x: Quake | null;
      y: Quake | null;
    }
  | {
      op: 'random';
      divisor: number;
      above: number;
      action: number;
      offset: number;
      // In an inlined call.
      called?: boolean;
    };
export interface Script {
  frames: (Pose & { t: number })[];
  events: ScriptEvent[];
  loop: number;
  // The first event of a loop's target record.
  loopEvent?: number;
  // Running out, a zero-length display, a loop, a jump, or op 0x05.
  end: 'end' | 'hold' | 'loop' | 'jump' | 'delete';
  // A final op 0x0a's target and its record offset.
  next: number | null;
  offset?: number;
}
const scripts = Object.fromEntries(
  [...Object.entries(CHARACTERS), ...Object.entries(STAGES)].map(
    ([who, { scripts }]) => [who, scripts],
  ),
) as unknown as Record<Container, Record<string, Script>>;
// A source action, or "action+offset" for an op 0x20 branch entering mid-action.
export type ObjectKey = number | `${number}+${number}`;
// The victim action selected by each op 0x17 response id.
export const RESPONSES: readonly number[] = data.responses;
// The hit-effect action each response spawns at contact (0 = none).
export const RESPONSE_EFFECTS: readonly number[] = data.response_effects;
export const exported = (index: ObjectKey, who: Container) =>
  index in scripts[who];
export function script(index: ObjectKey, who: Container = 'ryuko') {
  const found = scripts[who][index];
  if (!found) throw new Error(`Source action ${index} was not exported`);
  return found;
}
// Keyed by the timeline, so a lookup builds no string.
const scriptEvents = new WeakMap<object, Map<number, ScriptEvent[]>>();
// Events that run when a scripted action or object reaches the given age. A
// looping timeline repeats: each time it wraps, the records after its last
// display run, then those from the loop's target on.
// A timeline's tick at `age`: a looping one wraps past its end to its loop.
export function scriptTick(
  index: ObjectKey,
  age: number,
  who: Container = 'ryuko',
) {
  const found = script(index, who);
  const duration = animationDuration(index, who);
  if (found.end !== 'loop' || age < duration) return age;
  const start = found.frames[found.loop].t;
  return start + ((age - start) % (duration - start));
}
export function eventsAt(
  index: ObjectKey,
  age: number,
  who: Container = 'ryuko',
) {
  const found = script(index, who);
  let byTick = scriptEvents.get(found);
  if (!byTick) {
    byTick = new Map();
    for (const event of found.events)
      byTick.set(event.t, [...(byTick.get(event.t) ?? []), event]);
    scriptEvents.set(found, byTick);
  }
  const t = scriptTick(index, age, who);
  if (t === age) return byTick.get(age) ?? [];
  const start = found.frames[found.loop].t;
  if (t !== start) return byTick.get(t) ?? [];
  return [
    ...(byTick.get(animationDuration(index, who)) ?? []),
    ...found.events.filter((e, i) => i >= found.loopEvent! && e.t === start),
  ];
}
// A looping clip whose events the match runs itself.
const silent = (frames: Pose[]) =>
  clip(
    frames.map((frame) => ({ ...frame, events: undefined })),
    true,
  );
// A zero-length display waits for gameplay (landing); hold it like a long pose.
const scriptClip = (index: ObjectKey, who: Container = 'ryuko') => {
  const { frames, loop } = script(index, who);
  return clip(
    frames,
    loop >= 0 ? loop : false,
    frames.map((frame) => frame.duration || 1),
  );
};
const objectClips = new WeakMap<object, Clip | null>();
function objectClip(index: ObjectKey, who: Container) {
  const found = script(index, who);
  if (!objectClips.has(found))
    objectClips.set(found, found.frames.length ? scriptClip(index, who) : null);
  return objectClips.get(found)!;
}
// Image 0 (a solid marker block) and 8191 are a player's blank displays, as
// is an empty image (Zoma's 2000, a stage's 1000). A stage's image 0 is its
// background.
export const isBlank = (pose: Pose, who: Container = 'ryuko') =>
  ((pose.image === 0 || pose.image === 8191) && who in CHARACTERS) ||
  !pose.width;
// Op 0x07 draws the held opponent with an entry of its held-pose table. Bit 2
// faces the holder's way with a mirrored image; bit 3 flips it vertically.
export function heldFrame(
  pose: number,
  flags: number,
  who: Who = 'ryuko',
): Pose {
  const held = CHARACTERS[who].held[pose];
  return {
    ...held,
    pc: 0,
    duration: 1,
    flip_x: (flags & 4) !== 0,
    flip_y: (flags & 8) !== 0,
    ignore_facing: false,
    packed_image: held.image,
    extra_bytes: '',
    held: true,
  };
}

// DoraEmon's, 100 ticks still, 27 rising at raw vy −50 (PC 381), 81 still
// (PC 393), then falling under gravity 50 (PC 398) until the fall reaches
// the floor 13 source pixels down on his 9th move, into Round 1 + 27 (slot
// 1, PC 399).
export const DORA_LANDING = 217;
// How many times each win calls its stand demo: twice, ZAKU's and
// PAC-HELO's four times, TRAINING's three (PC 366), otherwise once.
const winStands = (who: Who) =>
  who === 'zaku' || who === 'pachelo'
    ? 4
    : who === 'training'
      ? 3
      : who === 'kate' || who === 'remu' || who === 'rear' || who === 'times'
        ? 2
        : 1;
// And each draw: TRAINING's three times (PC 446).
const drawStands = (who: Who) =>
  who === 'training'
    ? 3
    : who === 'rear' || who === 'gigi' || who === 'masa' || who === 'times'
      ? 2
      : 1;
// A flight's displays until `age`, then its landing action's.
function landed(flight: Pose[], landing: Pose[], age: number) {
  const ticks = flight.map((f) => f.duration);
  ticks[ticks.length - 1] -= ticks.reduce((a, b) => a + b) - age;
  return clip([...flight, ...landing], false, [
    ...ticks,
    ...landing.map((f) => f.duration),
  ]);
}

const waits = (frames: Pose[]) =>
  frames.map(({ duration }) =>
    duration > 0 && duration < 1000 ? duration : 1,
  );
// A player's up, forward and back jumps, the default-action table's words
// 3–5 (+0x7580, 0x4110f0): each takeoff, the displays before its op 0x01
// launches it (AMIRO's up jump three, 11 ticks), then its air poses up to the
// first that waits for the landing (a zero duration, 0x412800): ALPHA's 132
// (PC 56), or looping as its timeline does: TTRO's and Yo's J RP (7, 6)
// loop two poses until they land (PCs 86, ...). And its fall, word 6
// (+0x7586), which holds Ryuko's 16 (PC 100) or Zoma's 121 for 1010 ticks.
function jumpClips(who: Who) {
  const [takeoff, jump, takeoffForward, jumpForward, takeoffBack, jumpBack] =
    CHARACTERS[who].jumps.flatMap((index) => {
      const timeline = script(index, who);
      const { frames } = timeline;
      const launch = timeline.events.find((event) => event.op === 'motion')!.t;
      let n = 0;
      for (let t = 0; t < launch; n++) t += frames[n].duration;
      const wait = frames.findIndex((frame, k) => k >= n && !frame.duration);
      const air = frames.slice(n, wait < 0 ? undefined : wait + 1);
      const loop = timeline.end === 'loop' && timeline.loop - n;
      return [clip(frames.slice(0, n)), clip(air, loop, waits(air))];
    });
  const fall = fighterClips[who].fall;
  return {
    takeoff,
    jump,
    takeoffForward,
    jumpForward,
    takeoffBack,
    jumpBack,
    fall: clip(fall, false, waits(fall)),
  };
}

// Neutral, guard, victim and result clips, which the match drives itself.
// Zero/very long source displays wait for gameplay; give them explicit end behavior.
export const animations = {
  walk: clip(clips.walk, true),
  backwalk: clip(clips.backwalk, true),
  ...jumpClips('ryuko'),
  land: clip(clips.land),
  crouchEnter: clip(clips.crouchEnter),
  crouch: clip(clips.crouch, true),
  stand: clip(clips.stand),
  // Actions 23/24 display a mirrored mid-turn pose for ten ticks.
  turn: clip(clips.turn),
  crouchTurn: clip(clips.crouchTurn),
  hitPull: clip(clips.hitPull),
  // Response 5/6 (air punch and kick against a grounded opponent) → action 77.
  jumpHit: clip(clips.jumpHit),
  // Air Drill response 56 → action 135: slammed down until landing enters 124.
  drillDown: clip(clips.drillDown, false, [1]),
  blockStop: clip(clips.blockStop),
  crouchBlockStop: clip(clips.crouchBlockStop),
  launchDown: clip(clips.launchDown, false, [3, 3, 3, 1]),
  slamBounce: clip(clips.slamBounce, false, [10, 20, 1]),
  bounceDown: clip(clips.bounceDown),
  // The long final displays wait for landing, rather than ending the reaction.
  launchUp: clip(clips.launchUp, false, [25, 30, 10, 1]),
  launchAway: clip(clips.launchAway, false, [2, 2, 2, 25, 1]),
  // Response 53 (SAKUYA's K3 Hit New) → action 105, waiting for its landing.
  chainPull: clip(clips.chainPull, false, [2, 2, 2, 25, 1]),
  sweep: clip(clips.sweep, false, [2, 2, 2, 25, 1]),
  // Response 41 (a chuck's toss) → action 132, waiting for its landing.
  chuckToss: clip(clips.chuckToss, false, [2, 2, 2, 25, 1]),
  // Response 42 (Zoma's DRAGON) → action 96, waiting for its landing.
  uppercut: clip(clips.uppercut, false, [5, 30, 10, 1]),
  // Response 82 (Kiki's EN3) → action 126, the same rise straight up.
  liftUp: clip(clips.liftUp, false, [5, 30, 10, 1]),
  // Responses 44 and 45 (Kiki's EN3 beam) → actions 99 and 100.
  tatumakiIn: clip(clips.tatumakiIn, false, [2, 2, 2, 25, 1]),
  tatumakiOut: clip(clips.tatumakiOut, false, [2, 2, 2, 25, 1]),
  // Response 48 (Chung's crouching kick and air fire) → action 104, HISA's
  // flight burning.
  fireLaunch: clip(clips.fireLaunch, false, [2, 2, 2, 25, 1]),
  // Response 52 (Amiro's Coment chuck and scc) → action 134, thrown up.
  chuckUp: clip(clips.chuckUp, false, [1, 30, 10, 1]),
  // Response 37 (Chung's chuck) → action 91, flying flat out until a wall
  // enters 95, which holds there, then drops.
  flySide: clip(clips.flySide, false, [2, 2, 2, 1]),
  flySideWall: clip(clips.flySideWall, false, [3, 3, 3, 3, 3, 3, 1]),
  // Response 73 (Yo's GIGA PRESS) → action 140, which jumps back to itself
  // (PC 1911) until a wall enters 95.
  chuckYo: clip(clips.chuckYo, true),
  // Response 57 (Chung's EN300) → action 136, spinning in 93 until a wall
  // enters 94, which bounces back out into 87's spin.
  twistSide: clip([...clips.twistSide, ...clips.twistFly], 3),
  // Response 38 (Giant's BASE BALL MISS ATT) → action 92, the same but for
  // its first three body boxes, which don't push (kind 2, PC 1097).
  twistSideHit: clip([...clips.twistSideHit, ...clips.twistFly], 3),
  twistWall: clip([...clips.twistWall, ...clips.twisting2], 2),
  // Response 61 (Chung's lee) → action 137, a float before HISA.
  gonMiss: clip(clips.gonMiss),
  // Response 49 (Giant's chuck) → action 133, a looped daze; the match runs
  // each pass's records (Match.musicAttack), so the clip carries none.
  musicAttack: silent(clips.musicAttack),
  // Response 81 (Giant's counter hit) → action 143: nothing shown and no
  // body for 100 ticks (PCs 1962–1964), then rambu AIR (122, PC 1965).
  vanish: clip(clips.vanish),
  // Responses 59 and 60 (Zoma's EN300 and DST) → actions 108 and 109, whose
  // op 0x20 reorders their shaking (+17, +18).
  stun: scriptClip(108),
  airStun: scriptClip(109),
  // Response 31 enters action 129, which jumps to the spinning loop 130; its
  // landing branch bounces through PC 1752 into the slower loop 131.
  dstToss: clip([clips.dstToss[0], ...clips.dstTossSpin], 1),
  tossBounce: clip([...clips.dstToss.slice(1), ...clips.dstTossSpin2], 2),
  // Missile response 32 enters action 85, then 86; landing bounces into 87.
  twist: clip([clips.twist[0], ...clips.twisting], 1),
  twistBounce: clip([clips.twist[1], ...clips.twisting2], 1),
  knockdown: clip(clips.knockdown),
  getUp: clip(clips.getUp),
  guard: clip(clips.guard.slice(0, 1)),
  crouchGuard: clip(clips.crouchGuard.slice(0, 1)),
  airGuard: clip(clips.airGuard.slice(0, 1)),
  block: clip(clips.guard),
  crouchBlock: clip(clips.crouchGuard),
  airBlock: clip(clips.airGuard),
  blockHeavy: clip(clips.blockHeavy),
  crouchBlockHeavy: clip(clips.crouchBlockHeavy),
  airBlockHeavy: clip(clips.airBlockHeavy),
  blockRapid: clip(clips.blockRapid),
  crouchBlockRapid: clip(clips.crouchBlockRapid),
  airBlockRapid: clip(clips.airBlockRapid),
  // The hidden super's guards (responses 78–80 → 168–172).
  timeStopGuard: clip(clips.timeStopGuard),
  crouchTimeStopGuard: clip(clips.crouchTimeStopGuard),
  airTimeStopGuard: clip(clips.airTimeStopGuard),
  hit: clip(clips.hit),
  hitHeavy: clip(clips.hitHeavy),
  airHit: clip(clips.airHit),
  airHitHeavy: clip(clips.airHitHeavy),
  // Response 68 (G Suneo's EX D Driver) → 'ヒット ERUS INATUMA' (118), which
  // calls its rp (119) seven times (PC 1554) before its slide; airborne, its
  // op 0x16 (PC 1541) enters ERUS INATUMA AIR (120), which calls it the same
  // (PC 1580), then runs out into 76's launch (PC 1582).
  inatuma: clip([...Array(7).fill(clips.inatumaRp).flat(), ...clips.inatuma]),
  airInatuma: clip(Array(7).fill(clips.inatumaRp).flat()),
  icePunch: clip(clips.icePunch),
  airIcePunch: clip(clips.airIcePunch),
  hisoStop: clip(clips.hisoStop),
  airHisoStop: clip(clips.airHisoStop),
  // Op 0x20 in 83/84 picks which of two pose orders plays (PCs 957, 982); the
  // match rolls it and draws branch 83/84 + 18.
  hitRapid: scriptClip(83),
  airHitRapid: scriptClip(84),
  // Action 60's last display waits for landing; action 62 then slides and holds.
  down: clip(
    clips.ko,
    false,
    clips.ko.map((frame) => frame.duration || 1),
  ),
  // Action 61, KO NORMAL 2nd: a KO'd fighter struck again relaunches at age
  // 6 (PC 631), holding its last pose until landing enters 62.
  koAgain: clip(clips.koAgain),
  koLand: clip(clips.down),
  // Actions 57/65 call WIN STAND (58) once through opcode 0x09 at PCs 565/667.
  win: clip([...clips.winStand, ...clips.win], false, [
    ...clips.winStand.map((frame) => frame.duration),
    10,
    10,
    1,
  ]),
  draw: clip([...clips.winStand, ...clips.draw]),
  // Responses 43 (action 97, looping 98 until landing) and 33 (88, looping 90).
  fly: scriptClip(97),
  shock: scriptClip(88),
  // Response 76 in the air → action 122; its op 0x20 reorders poses (+18).
  rushAirHit: scriptClip(122),
  // Response 30 (action 128); op 0x07 then replaces the pose from the held
  // table, or its two displays run out (holdVictims).
  superHeld: clip(clips.grabbed),
};
// 'intro' is DoraEmon's Br. intro, whose 開始時 isn't exported (Match.entrants).
export type AnimatedAction = keyof typeof animations | 'intro';
// 'script' runs the source action in the fighter's `branch` from its own
// timeline: every move, entered by number.
export type Action = 'idle' | 'script' | AnimatedAction;
// What a fighter shows: an action's clip, or a source action's timeline.
export type Shown = Exclude<Action, 'script'> | ObjectKey;
// A display of 0 or 1000-odd ticks waits for gameplay (landing or a jump
// back to itself): play it as one held tick.
// A player's guard clips; with `ex`, ANMC P's EX forms (export_fighter).
const guardAnimations = (
  z: Record<string, Pose[]>,
  ex = '',
): Partial<Record<AnimatedAction, Clip>> => {
  const g = (name: string) => z[name + ex];
  return {
    guard: clip(g('guard').slice(0, 1)),
    crouchGuard: clip(g('crouchGuard').slice(0, 1)),
    airGuard: clip(g('airGuard').slice(0, 1)),
    block: clip(g('guard')),
    crouchBlock: clip(g('crouchGuard')),
    airBlock: clip(g('airGuard')),
    blockHeavy: clip(g('blockHeavy')),
    crouchBlockHeavy: clip(g('crouchBlockHeavy')),
    airBlockHeavy: clip(g('airBlockHeavy')),
    blockRapid: clip(g('blockRapid')),
    crouchBlockRapid: clip(g('crouchBlockRapid')),
    airBlockRapid: clip(g('airBlockRapid')),
    timeStopGuard: clip(g('timeStopGuard')),
    crouchTimeStopGuard: clip(g('crouchTimeStopGuard')),
    airTimeStopGuard: clip(g('airTimeStopGuard')),
    blockStop: clip(g('blockStop')),
    crouchBlockStop: clip(g('crouchBlockStop')),
  };
};
// The other players' neutral, guard, victim and result clips: the engine's
// own states and the twins of Ryuko's victim actions (export_fighter), shaped
// like his.
function twinAnimations(who: Exclude<Who, 'ryuko'>, z = fighterClips[who]) {
  const timeline = (index: number) => scriptClip(twin(who, index), who);
  const table: Partial<Record<AnimatedAction, Clip>> = {
    walk: clip(z.walk, true),
    backwalk: clip(z.backwalk, true),
    ...jumpClips(who),
    land: clip(z.land),
    crouchEnter: clip(z.crouchEnter),
    // Action 19 holds a single zero-length display.
    crouch: clip(z.crouch, true, waits(z.crouch)),
    stand: clip(z.stand),
    turn: clip(z.turn),
    crouchTurn: clip(z.crouchTurn),
    // DoraEmon's 開始時 BR (32) from PC 366 (authored, export_assets.py)
    // runs into Round 1 + 3, rises and lands out of the wait at PC 400 at
    // DORA_LANDING into Round 1 + 27.
    ...(who === 'dora' && {
      intro: landed(z.intro, z.introLand, DORA_LANDING),
    }),
    ...guardAnimations(z),
    hit: clip(z.hit),
    hitHeavy: clip(z.hitHeavy),
    airHit: clip(z.airHit),
    airHitHeavy: clip(z.airHitHeavy),
    inatuma: clip([...Array(7).fill(z.inatumaRp).flat(), ...z.inatuma]),
    airInatuma: clip(Array(7).fill(z.inatumaRp).flat()),
    icePunch: clip(z.icePunch),
    airIcePunch: clip(z.airIcePunch),
    hisoStop: clip(z.hisoStop),
    airHisoStop: clip(z.airHisoStop),
    jumpHit: clip(z.jumpHit),
    hitPull: clip(z.hitPull),
    hitRapid: timeline(83),
    airHitRapid: timeline(84),
    drillDown: clip(z.drillDown, false, waits(z.drillDown)),
    launchDown: clip(z.launchDown, false, waits(z.launchDown)),
    slamBounce: clip(z.slamBounce, false, waits(z.slamBounce)),
    bounceDown: clip(z.bounceDown),
    launchUp: clip(z.launchUp, false, waits(z.launchUp)),
    launchAway: clip(z.launchAway, false, waits(z.launchAway)),
    chainPull: clip(z.chainPull, false, waits(z.chainPull)),
    sweep: clip(z.sweep, false, waits(z.sweep)),
    chuckToss: clip(z.chuckToss, false, waits(z.chuckToss)),
    uppercut: clip(z.uppercut, false, waits(z.uppercut)),
    liftUp: clip(z.liftUp, false, waits(z.liftUp)),
    tatumakiIn: clip(z.tatumakiIn, false, waits(z.tatumakiIn)),
    tatumakiOut: clip(z.tatumakiOut, false, waits(z.tatumakiOut)),
    fireLaunch: clip(z.fireLaunch, false, waits(z.fireLaunch)),
    chuckUp: clip(z.chuckUp, false, waits(z.chuckUp)),
    flySide: clip(z.flySide, false, waits(z.flySide)),
    flySideWall: clip(z.flySideWall, false, waits(z.flySideWall)),
    chuckYo: clip(z.chuckYo, true),
    twistSide: clip([...z.twistSide, ...z.twistFly], z.twistSide.length),
    twistSideHit: clip(
      [...z.twistSideHit, ...z.twistFly],
      z.twistSideHit.length,
    ),
    twistWall: clip([...z.twistWall, ...z.twisting2], z.twistWall.length),
    gonMiss: clip(z.gonMiss),
    // MASA's and 3-TIMES's pass calls its two displays ten times (PCs 2038,
    // 1938).
    musicAttack: silent(
      who === 'masa' || who === 'times'
        ? Array(10).fill(z.musicAttack).flat()
        : z.musicAttack,
    ),
    vanish: clip(z.vanish),
    stun: timeline(108),
    airStun: timeline(109),
    dstToss: clip([z.dstToss[0], ...z.dstTossSpin], 1),
    tossBounce: clip([...z.dstToss.slice(1), ...z.dstTossSpin2], 2),
    twist: clip([z.twist[0], ...z.twisting], 1),
    twistBounce: clip([z.twist[1], ...z.twisting2], 1),
    superHeld: clip(z.grabbed),
    knockdown: clip(z.knockdown),
    getUp: clip(z.getUp),
    down: clip(z.ko, false, waits(z.ko)),
    // ASTROMAN's lies on a 0-tick display (PC 694).
    koAgain: clip(z.koAgain, false, waits(z.koAgain)),
    // ZIRO's plays from its timeline (KO_TIMELINES).
    koLand: clip(z.down),
    // WIN and the draw call DEMO STAND once, then hold; Kiki's WIN calls
    // 'win rp' (57) three times before its last display (PC 536) and G
    // Suneo's 'win talk' (67) seven times (PC 707). Giant's loops from PC
    // 560 (winLoop, PC 564), SIN's from PC 617 (PC 619), SEAN's from PC 621
    // (PC 623), GON's from PC 699 (PC 707) and KATE's from PC 618 (PC 620),
    // past the records before them: Giant's sound (PC 559), SIN's sound and
    // WIN RP (PC 616), SEAN's sound (PC 620), GON's sound and *eff WIN (PCs
    // 697–698), KATE's sound (PC 616). KATE's 勝ち (58) calls sTAND demo
    // twice (PC 602), as REMU's (60) does stand demo (30, PC 647) and REAR's
    // (59) STAND DEMO (29, PC 591); REMU's loops image 138 from PC 652 (PC
    // 653), past his sound (PC 650) and flight (PC 651, rollResult), and REAR's
    // image 384 from PC 595 (PC 596), past his sound and shake (PCs
    // 593–594). REAR's draw (66) calls STAND DEMO twice too (PC 678), as
    // GIGI's (63) does Demo stand (28, PC 659); GIGI's 勝ち (56) loops image
    // 211 from PC 577 (PC 578), past his sounds (PCs 574, 576). SWW's 勝ち
    // (57) loops from PC 542 (PC 560), past his sound and trail (PCs
    // 540–541), and his draw (64) from PC 644 (PC 646), past his sound (PC
    // 643). OGI's 勝ち (62) loops image 642 from PC 659 (PC 660), past his
    // sound and *ef win (PCs 657–658), and ZIRO's 勝ち (66) image 142 from PC
    // 765 (PC 766), past his sound (PC 764); its rand % 3 > 1 (PC 758) into
    // randon win1 (51) rolls in the match (rollResult). MASA's 勝ち (94)
    // plays flattened, calling DEMO STAND (32) twice (PC 861) and jumping to
    // Win Motion (95, PC 881), then loops images 450–451 from PC 889 (PC
    // 891); his draw (105) calls 32 twice too (PC 1006).
    // 3-TIMES's 勝ち (94) calls DEMO STAND (32) twice (PC 769) and loops
    // his stance from PC 789 (PC 792), and his draw (104) calls 32 twice
    // too (PC 907). The rolls that pick their voices (PCs 862–880; 770–788)
    // roll in the match (rollResult). ZENKA's 勝ち (77) plays flattened,
    // holding image 283 (PC 799). Z-MEGA's 勝ち (65) calls DEMO stand (30)
    // once (PC 619) and loops image 319 from PC 623 (PC 626), and his draw
    // (73) loops image 201 from PC 717 (PC 719). ALPHA's 勝ち (82) calls demo
    // stand (28) once (PC 1002) and loops his stance from PC 1010 (PC 1017);
    // his draw (98) holds image 130 (PC 1285). ZAKU's 勝ち (56) calls DEMO
    // STAND (34) four times (PC 476) and loops his stance from PC 478 (PC
    // 481), and his draw (67) loops it from its start (PC 605), as
    // PAC-HELO's do (PCs 484, 486, 488; 613).
    // SIN's draw holds its last display (PC 714). LIZARD's 勝ち (60) plays
    // flattened (export_fighter), calls and all, holding image 409 (PC 638),
    // as DIDO's 勝ち (61) does image 330 (PC 688), SAKUYA's 勝ち (69) image
    // 436 (PC 692), ALEX's 勝ち (59) image 330 (PC 593), SOU's 勝ち (62)
    // image 310 (PC 650), HISO's 勝ち (58) image 436 (PC 603), ERUS's 勝ち
    // (60) image 350 (PC 612) and OS FENG's 勝ち (67) image 431 (PC 734).
    // KAY's 勝ち (57) plays flattened up to its hop, waiting on its display
    // (PC 581) until the match lands it into 57 + 10 (rollResult).
    win: clip(
      who === 'kay' ||
        who === 'lizard' ||
        who === 'dido' ||
        who === 'sakuya' ||
        who === 'alex' ||
        who === 'sou' ||
        who === 'hiso' ||
        who === 'erus' ||
        who === 'feng' ||
        who === 'zenka' ||
        who === 'masa'
        ? [...z.win, ...(z.winLoop ?? [])]
        : z.winRp
          ? [
              ...z.winStand,
              ...z.win.slice(0, -1),
              ...Array(who === 'kiki' ? 3 : 7)
                .fill(z.winRp)
                .flat(),
              ...z.win.slice(-1),
            ]
          : [
              ...Array<Pose[]>(winStands(who)).fill(z.winStand).flat(),
              ...z.win,
              ...(z.winLoop ?? []),
            ],
      who === 'masa'
        ? z.win.length
        : z.winLoop
          ? z.winStand.length * winStands(who) + z.win.length
          : false,
      // OS FENG's holds its last pose with a zero-length display (PC
      // 734), as KAY's (PC 581) and AYA's (PC 605) do.
      who === 'feng' || who === 'kay'
        ? waits(z.win)
        : who === 'aya'
          ? waits([...z.winStand, ...z.win])
          : undefined,
    ),
    // ZIRO's draw (78) then loops a call of Randon op rp (32, PCs 947–948);
    // the match steps it back at raw −200 (PC 944, rollResult).
    draw: clip(
      [
        ...Array<Pose[]>(drawStands(who)).fill(z.winStand).flat(),
        ...z.draw,
        ...(z.drawLoop ?? []),
      ],
      who === 'sww'
        ? z.winStand.length
        : z.drawLoop
          ? z.winStand.length * drawStands(who) + z.draw.length
          : false,
      waits([
        ...Array<Pose[]>(drawStands(who)).fill(z.winStand).flat(),
        ...z.draw,
        ...(z.drawLoop ?? []),
      ]),
    ),
    fly: timeline(97),
    shock: timeline(88),
    rushAirHit: timeline(122),
  };
  return table;
}
const TWIN_ANIMATIONS = {
  zoma: twinAnimations('zoma'),
  kiki: twinAnimations('kiki'),
  chung: twinAnimations('chung'),
  amiro: twinAnimations('amiro'),
  anmc: twinAnimations('anmc'),
  giant: twinAnimations('giant'),
  suneo: twinAnimations('suneo'),
  yo: twinAnimations('yo'),
  sin: twinAnimations('sin'),
  lizard: twinAnimations('lizard'),
  kay: twinAnimations('kay'),
  dido: twinAnimations('dido'),
  sakuya: twinAnimations('sakuya'),
  alex: twinAnimations('alex'),
  sou: twinAnimations('sou'),
  hiso: twinAnimations('hiso'),
  erus: twinAnimations('erus'),
  feng: twinAnimations('feng'),
  sean: twinAnimations('sean'),
  gon: twinAnimations('gon'),
  kate: twinAnimations('kate'),
  remu: twinAnimations('remu'),
  rear: twinAnimations('rear'),
  gigi: twinAnimations('gigi'),
  sww: twinAnimations('sww'),
  ogi: twinAnimations('ogi'),
  ziro: twinAnimations('ziro'),
  masa: twinAnimations('masa'),
  times: twinAnimations('times'),
  zenka: twinAnimations('zenka'),
  zmega: twinAnimations('zmega'),
  alpha: twinAnimations('alpha'),
  shinz: twinAnimations('shinz'),
  zaku: twinAnimations('zaku'),
  pachelo: twinAnimations('pachelo'),
  golf: twinAnimations('golf'),
  asura: twinAnimations('asura'),
  ttro: twinAnimations('ttro'),
  astroman: twinAnimations('astroman'),
  yinan: twinAnimations('yinan'),
  aya: twinAnimations('aya'),
  dora: twinAnimations('dora'),
  rario: twinAnimations('rario'),
  training: twinAnimations('training'),
};
// ANMC P's guards jump to their EX forms while variable 0 is 100 (op 0x1f,
// PCs 1970, 2015, ...): the same records showing his other costume.
// ponytail: 'time stop sit EX' (195) also spawns 365 and slides at raw −650
// (PCs 2566–2567), which only the hidden super's guard reaches; the port
// draws its images over the normal guard's rules.
// Demo stands jump to their EX stance while variable 0 holds the EX value
// (op 0x1f, export_fighter), so in EX mode each call of one in a result
// plays that stance: SAKUYA's STAND DEMO plays Skill1 (32, PC 296).
function exStands(who: Exclude<Who, 'ryuko'>) {
  const z = fighterClips[who];
  const stand = new Set(z.winStand.map((frame) => frame.pc));
  const swap = (frames: Pose[]) =>
    frames.flatMap((frame) =>
      frame.pc === z.winStand[0].pc
        ? z.winStandEx
        : stand.has(frame.pc)
          ? []
          : [frame],
    );
  const { win, draw } = twinAnimations(who, {
    ...z,
    ...Object.fromEntries(
      ['win', 'draw', 'winStand']
        .filter((name) => z[name])
        .map((name) => [name, swap(z[name])]),
    ),
  });
  return { win, draw };
}
const EX_ANIMATIONS = Object.fromEntries(
  Object.entries(fighterClips)
    .filter(([, z]) => z.guardEx || z.winStandEx)
    .map(([who, z]) => [
      who,
      {
        ...(z.guardEx && guardAnimations(z, 'Ex')),
        ...(z.winStandEx && exStands(who as Exclude<Who, 'ryuko'>)),
      },
    ]),
) as Partial<Record<Who, Partial<Record<AnimatedAction, Clip>>>>;

// Object keys name a spawned source object, played from its flattened timeline.
export const isObject = (
  action: AnimatedAction | ObjectKey,
): action is ObjectKey =>
  action !== 'intro' && !Object.hasOwn(animations, action);
function clipOf(action: AnimatedAction | ObjectKey, who: Container) {
  if (isObject(action)) return objectClip(action, who);
  const found =
    who === 'ryuko'
      ? (animations as Partial<Record<AnimatedAction, Clip>>)[action]
      : TWIN_ANIMATIONS[who as Exclude<Who, 'ryuko'>][action];
  if (!found) throw new Error(`${who} has no ${action} clip yet`);
  return found;
}
// `ex`: in EX mode, where the player has an EX form of the clip.
const exClipOf = (
  action: AnimatedAction | ObjectKey,
  who: Container,
  ex: boolean,
) =>
  (ex && EX_ANIMATIONS[who as Who]?.[action as AnimatedAction]) ||
  clipOf(action, who);
export function animationDuration(
  action: AnimatedAction | ObjectKey,
  who: Container = 'ryuko',
  ex = false,
) {
  return exClipOf(action, who, ex)?.duration ?? 0;
}

// The op 0x19 boxes the hit test reads (0x40f1b8: kind bit 1 or 2) for a
// fighter's pose. Idle keeps action 1's one box (PCs 10 and 24).
// A fighter action's display at an age; idle stands for action 1's first,
// as scene.ts draws idle from its VM.
export const clipPose = (
  action: Shown,
  age: number,
  who: Who = 'ryuko',
  ex = false,
) =>
  action === 'idle'
    ? fighterClips[who].idle[0]
    : animationFrame(action, age, who, ex);
// The op 0x15 of the idle display that starts at a looping `age`: TRAINING's
// 通常立ち refills his life, drains his power and fills the opponent's as it
// reaches its 15th display (PC 24). His idle has no rolls, so its age stands
// for the program scene.ts runs.
export function idlePower(who: Who, age: number) {
  const frames = fighterClips[who].idle;
  if (!frames.some((frame) => frame.events?.some((e) => e.op === 'power')))
    return [];
  let t = age % frames.reduce((total, frame) => total + frame.duration, 0);
  for (const frame of frames) {
    if (t === 0) return (frame.events ?? []).filter((e) => e.op === 'power');
    t -= frame.duration;
  }
  return [];
}
function bodies(action: Shown, age: number, who: Who): BodyBox[] {
  return clipPose(action, age, who).body ?? [];
}
// Action 43's black panel (image 294, a 673 × 507 field of palette entry 0,
// (0, 0, 8), which is not the colour key), opaque (PC 432) and at 50% (436);
// Zoma's action 40 and Kiki's 42 show image 1009 alike. TRAINING has none,
// and nothing of his sets the variable that would show it.
export const BLACK = Object.fromEntries(
  Object.entries(fighterClips).map(([who, { black = [] }]) => [
    who,
    { opaque: black[1], half: black[2] },
  ]),
) as Record<Who, { opaque: Pose; half: Pose }>;
// The op 0x23 state a fighter's clip sets before its first display. Ryuko's
// neutral, knockdown and win clips reset it there; none changes it later.
export const entryColor = (action: Shown, who: Who = 'ryuko') =>
  clipPose(action, 0, who).color;
export function hurtboxes(
  action: Shown,
  age: number,
  who: Who = 'ryuko',
): BodyBox[] {
  return bodies(action, age, who).filter((box) => box.kind & 6);
}
// Kind bit 0 pushes (0x40fce9), walked from the last slot down.
export function pushboxes(
  action: Shown,
  age: number,
  who: Who = 'ryuko',
): BodyBox[] {
  return bodies(action, age, who)
    .filter((box) => box.kind & 1)
    .reverse();
}

export function animationFrame(
  action: AnimatedAction | ObjectKey,
  age: number,
  who: Container = 'ryuko',
  ex = false,
): Pose {
  const found = exClipOf(action, who, ex);
  if (!found) throw new Error(`Source object ${action} has no displays`);
  const { frames, ticks, loopStart, duration, intro } = found;
  let time = Math.max(0, age);
  time =
    loopStart < 0
      ? Math.min(time, duration - 1)
      : time < intro
        ? time
        : intro + ((time - intro) % (duration - intro));
  for (let i = 0; i < frames.length; i++) {
    if (time < ticks[i]) return frames[i];
    time -= ticks[i];
  }
  return frames[frames.length - 1];
}
