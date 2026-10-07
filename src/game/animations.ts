import { CHARACTERS } from './characters';
import type { Who } from './characters';
import data from './generated/assets.json';
import zoma from './generated/zoma.json';
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
  events?: PoseEvent[];
};
// JSON infers each event's op as a string; the export writes only Pose's.
const clips = data.clips as unknown as Record<keyof typeof data.clips, Pose[]>;
const zomaClips = zoma.clips as unknown as Record<
  keyof typeof zoma.clips,
  Pose[]
>;
interface Clip {
  frames: Pose[];
  ticks: number[];
  // Index of the first looping pose, or -1 to hold the final pose.
  loopStart: number;
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
  return { frames, ticks, loopStart };
}

// Action 197 calls the throw spin (199) three times (PC 2767), then tosses.
const throwSpins = Array.from({ length: 3 }, () => clips.throwSpin).flat();
export const THROW_TOSS_TICK =
  clips.throw[0].duration +
  throwSpins.reduce((total, frame) => total + frame.duration, 0);
// Action 215 plays the same three spins, then 217 ten times.
const dstSpins = [
  ...throwSpins,
  ...Array.from({ length: 10 }, () => clips.dstSpin).flat(),
];
export const DST_TOSS_TICK =
  clips.dstHit[0].duration +
  dstSpins.reduce((total, frame) => total + frame.duration, 0);
// Actions 199/217 run op 0x07 before each spin display: the held offset in
// source pixels, bit 2 (face the holder's way, mirrored image) and bit 0
// (drawn behind the holder). Response 30 (op 0x14) first places the victim 60
// ahead. The throw (197) opens with the same five ticks, so it shares these
// holds. `place` is true when an op places the victim this tick: op 0x14 at
// age 0, op 0x07 as its display starts, and every tick through 217, whose bit
// 4 (0x10) has the holder's motion step re-place it (0x40fa29).
const DST_HOLDS = [
  { x: 60, same: true, behind: true },
  { x: -10, same: true, behind: true },
  { x: -60, same: false, behind: true },
  { x: 0, same: false, behind: false },
];
export function dstHold(age: number) {
  const first = clips.dstHit[0].duration;
  if (age < first) return { x: 60, same: false, behind: false, place: !age };
  let time = age - first;
  for (const [index, frame] of dstSpins.entries()) {
    if (time < frame.duration)
      return {
        ...DST_HOLDS[index % DST_HOLDS.length],
        place: !time || index >= throwSpins.length,
      };
    time -= frame.duration;
  }
  return null;
}
// The victim's poses (its grabbed pose and held table) to Ryuko's timing.
const dstHeld = (grabbed: Pose[], who: Who) => [
  { ...grabbed[0], duration: clips.dstHit[0].duration },
  // Op 0x07 selects held pose 1 from the victim's table and adds the bit 2 flip.
  ...dstSpins.map((frame, index) => ({
    ...heldFrame(1, DST_HOLDS[index % DST_HOLDS.length].same ? 4 : 0, who),
    duration: frame.duration,
  })),
];

// Super timelines flattened by scripts/export_assets.py: displays with op 0x09
// calls inlined and op 0x0a jumps followed, plus the gameplay opcodes at their
// action ages. The match plays their events; conditions are checked at entry.
export type ScriptEvent = { t: number } & SourceEvent;
export const POSE_EVENTS = [
  'sound',
  'spawn',
  'screen',
  'trail',
  'variable',
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
  | { op: 'stock'; target: number; min: number; add: number }
  | { op: 'life'; target: number; below: boolean; value: number }
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
  | { op: 'freeze'; add: number }
  | ({ op: 'color' } & Color)
  | ({ op: 'trail' } & TrailSpec)
  | { op: 'variable'; index: number; value: number }
  | { op: 'add'; index: number; value: number }
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
    };
export interface Script {
  frames: (Pose & { t: number })[];
  events: ScriptEvent[];
  loop: number;
  // The first event of a loop's target record.
  loopEvent?: number;
  end: 'end' | 'hold' | 'loop' | 'jump';
  next: number | null;
}
const scripts = {
  ryuko: data.scripts,
  zoma: zoma.scripts,
} as unknown as Record<Who, Record<string, Script>>;
// A source action, or "action+offset" for an op 0x20 branch entering mid-action.
export type ObjectKey = number | `${number}+${number}`;
// The victim action selected by each op 0x17 response id.
export const RESPONSES: readonly number[] = data.responses;
// The hit-effect action each response spawns at contact (0 = none).
export const RESPONSE_EFFECTS: readonly number[] = data.response_effects;
export function script(index: ObjectKey, who: Who = 'ryuko') {
  const found = scripts[who][index];
  if (!found) throw new Error(`Source action ${index} was not exported`);
  return found;
}
const scriptEvents = new Map<string, Map<number, ScriptEvent[]>>();
// Events that run when a scripted action or object reaches the given age. A
// looping timeline repeats: each time it wraps, the records after its last
// display run, then those from the loop's target on.
export function eventsAt(index: ObjectKey, age: number, who: Who = 'ryuko') {
  let byTick = scriptEvents.get(`${who}:${index}`);
  const found = script(index, who);
  if (!byTick) {
    byTick = new Map();
    for (const event of found.events)
      byTick.set(event.t, [...(byTick.get(event.t) ?? []), event]);
    scriptEvents.set(`${who}:${index}`, byTick);
  }
  const duration = animationDuration(index, who);
  if (found.end !== 'loop' || age < duration) return byTick.get(age) ?? [];
  const start = found.frames[found.loop].t;
  const t = start + ((age - start) % (duration - start));
  if (t !== start) return byTick.get(t) ?? [];
  return [
    ...(byTick.get(duration) ?? []),
    ...found.events.filter((e, i) => i >= found.loopEvent! && e.t === start),
  ];
}
// A zero-length display waits for gameplay (landing); hold it like a long pose.
const scriptClip = (index: ObjectKey, who: Who = 'ryuko') => {
  const { frames, loop } = script(index, who);
  return clip(
    frames,
    loop >= 0 ? loop : false,
    frames.map((frame) => frame.duration || 1),
  );
};
const objectClips = new Map<string, Clip | null>();
function objectClip(index: ObjectKey, who: Who) {
  const key = `${who}:${index}`;
  if (!objectClips.has(key))
    objectClips.set(
      key,
      script(index, who).frames.length ? scriptClip(index, who) : null,
    );
  return objectClips.get(key)!;
}
// Image 0 (a solid marker block) and 8191 are the source's blank displays,
// as is an empty image (Zoma's 2000).
export const isBlank = (pose: Pose) =>
  pose.image === 0 || pose.image === 8191 || !pose.width;
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

// Action 33's op 0x16 at PC 348 checks down once the display at PC 347 ends.
export const INTRO_EX_TICK = clips.intro
  .slice(2)
  .filter((frame) => frame.pc < 348)
  .reduce((total, frame) => total + frame.duration, 0);

// These are authored visual timelines, not execution of non-idle action bytecode.
// Zero/very long source displays wait for gameplay; give them explicit end behavior.
export const animations = {
  walk: clip(clips.walk, true),
  backwalk: clip(clips.backwalk, true),
  takeoff: clip(clips.jump.slice(0, 1)),
  jump: clip(clips.jump.slice(1), false, [13, 5, 15, 1]),
  doubleJump: clip(clips.doubleJump, false, [3, 5, 27]),
  dash: clip(clips.dash, false, [5, 5, 5, 8]),
  backdash: clip(clips.backdash, false, [10, 5, 5, 15, 8]),
  airDash: clip(clips.airDash),
  airBackdash: clip(clips.airBackdash),
  land: clip(clips.land),
  crouchEnter: clip(clips.crouchEnter),
  crouch: clip(clips.crouch, true),
  stand: clip(clips.stand),
  // Actions 23/24 display a mirrored mid-turn pose for ten ticks.
  turn: clip(clips.turn),
  crouchTurn: clip(clips.crouchTurn),
  // Action 32 jumps to action 33 at PC 333, after its blank repositioning displays.
  intro: clip(clips.intro.slice(2)),
  punch: clip(clips.punch),
  kick: clip(clips.kick, false, [5, 5, 7, 10, 11]),
  // Punch 1 and kick 1 enter 179/187 on contact (op 0x02 slots 2 and 3).
  punchHit: clip(clips.punchHit),
  kickHit: clip(clips.kickHit),
  punch2: clip(clips.punch2),
  // Action 181's two hop poses last until each landing: 12 and 8 ticks.
  punch3: clip(clips.punch3, false, [12, 2, 8, 6, 8, 5, 15, 8]),
  kick2: clip(clips.kick2),
  hitUp: clip(clips.hitUp),
  hitUpRecover: clip(clips.hitUpRecover),
  hitUpJump: clip(clips.hitUpJump, false, [8, 13, 5, 15, 1]),
  // Actions 204/205 (EX Ch, NOR Ch): four flashing displays of image 366.
  exChange: clip(clips.exChange),
  norChange: clip(clips.norChange),
  iori: clip(clips.iori),
  iori2: clip(clips.iori2),
  iori3: clip(clips.iori3),
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
  sweep: clip(clips.sweep, false, [2, 2, 2, 25, 1]),
  // Response 41 (a chuck's toss) → action 132, waiting for its landing.
  chuckToss: clip(clips.chuckToss, false, [2, 2, 2, 25, 1]),
  // Response 42 (Zoma's DRAGON) → action 96, waiting for its landing.
  uppercut: clip(clips.uppercut, false, [5, 30, 10, 1]),
  kick3: clip([
    ...clips.kick3.slice(0, 3),
    ...Array.from({ length: 8 }, () => clips.kick3Repeat).flat(),
    ...clips.kick3.slice(3),
  ]),
  drill: clip(clips.drill),
  airDrill: clip(clips.airDrill.slice(0, 3)),
  // Actions 209–211 loop these poses until contact or landing.
  airDrillSpin: clip(clips.airDrillSpin.slice(0, 2), true),
  // Actions 209–211: eight ticks of hit-stop, then this two-tick transition.
  // Every contact branch shakes alike before its display (PCs 2991, 3002,
  // 3022, 3043, 3064).
  airDrillContact: clip(
    [{ ...clips.airDrillSpin[0], events: clips.airDrillSpin[2].events }],
    false,
    [2],
  ),
  drillLand: clip(clips.drillLand),
  dst: clip(clips.dst),
  // Action 221 repeats DST's grab and 58-tick miss with its own images.
  evilDst: clip(clips.evilDst),
  // DST FAR (220) and EVIL DST FAR (224) repeat 214 and 221 with a shorter box.
  dstFar: clip(clips.dstFar),
  evilDstFar: clip(clips.evilDstFar),
  dstHit: clip([clips.dstHit[0], ...dstSpins, ...clips.dstHit.slice(1)]),
  dstHeld: clip(dstHeld(clips.grabbed, 'ryuko')),
  // Response 31 enters action 129, which jumps to the spinning loop 130; its
  // landing branch bounces through PC 1752 into the slower loop 131.
  dstToss: clip([clips.dstToss[0], ...clips.dstTossSpin], 1),
  tossBounce: clip([...clips.dstToss.slice(1), ...clips.dstTossSpin2], 2),
  // Missile response 32 enters action 85, then 86; landing bounces into 87.
  twist: clip([clips.twist[0], ...clips.twisting], 1),
  twistBounce: clip([clips.twist[1], ...clips.twisting2], 1),
  dstMissile: clip(clips.dstMissile, true),
  // Action 225, which 226 jumps to while its axe flies (PC 3267): one
  // display, then neutral.
  axeBusy: clip(clips.axeBusy),
  axeThrow: clip(clips.axeThrow),
  axeFlight: clip(clips.axeFlight, true),
  axeHit: clip(clips.axeHit),
  grab: clip(clips.grab),
  // Its victim plays dstHeld until the toss: the same response 30 and spins.
  throw: clip([clips.throw[0], ...throwSpins, ...clips.throw.slice(1)]),
  knockdown: clip(clips.knockdown),
  getUp: clip(clips.getUp),
  crouchPunch: clip(clips.crouchPunch),
  crouchKick: clip(clips.crouchKick),
  airPunch: clip(clips.airPunch),
  airKick: clip(clips.airKick),
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
  // Supers and their hit branches, played from the flattened source timelines.
  noSuper: scriptClip(251),
  airNoSuper: scriptClip(250),
  getterBeam: scriptClip(264),
  airGetterBeam: scriptClip(263),
  evilBeam: scriptClip(278),
  airEvilBeam: scriptClip(280),
  musashi: scriptClip(256),
  musashiHit: scriptClip(257),
  blackRush: scriptClip(286),
  megaBeam: scriptClip(292),
  megaBeamHit: scriptClip(294),
  changeAttack: scriptClip(319),
  changeAttackHit: scriptClip(320),
  // EVIL DST's hit branch (222) strikes the held opponent five times, then
  // jumps into DST Hit (215) at PC 3104.
  evilDstHit: scriptClip(222),
  // A guard reaction's op 0x24 enters COUNTER HIT (174), spending a stock.
  counterHit: scriptClip(174),
  // EX mode's axe throw: action 231, with its charge branches (237, 238).
  exFire: scriptClip(231),
  // Command 22 (CPU IORI): action 410 jumps to 411, which jumps to iori3 (248).
  cpuIori: scriptClip(410),
  cpuIoriRecover: clip(clips.cpuIoriRecover),
  // Super-cancel versions, entered when a super cancels IORI.
  scMusashi: scriptClip(260),
  scGetterBeam: scriptClip(265),
  scEvilBeam: scriptClip(279),
  scChangeAttack: scriptClip(318),
  // EX mode's Getter Beam: EFS (331) and its IORI cancel version (332).
  efs: scriptClip(331),
  efsCancel: scriptClip(332),
  // Responses 43 (action 97, looping 98 until landing) and 33 (88, looping 90).
  fly: scriptClip(97),
  shock: scriptClip(88),
  // Response 76 in the air → action 122; its op 0x20 reorders poses (+18).
  rushAirHit: scriptClip(122),
  // Response 30 (action 128); op 0x07 then replaces the pose from the held table.
  superHeld: clip(clips.grabbed.slice(0, 1)),
};
export type AnimatedAction = keyof typeof animations;
// 'script' runs the source action in the fighter's `branch` from its own
// timeline: Zoma's moves, entered by number.
export type Action = 'idle' | 'script' | AnimatedAction;
// What a fighter shows: an action's clip, or a source action's timeline.
export type Shown = Exclude<Action, 'script'> | ObjectKey;
// Actions whose events the match runs, by source action.
export const SCRIPTED = {
  noSuper: 251,
  airNoSuper: 250,
  getterBeam: 264,
  airGetterBeam: 263,
  evilBeam: 278,
  airEvilBeam: 280,
  musashi: 256,
  musashiHit: 257,
  blackRush: 286,
  megaBeam: 292,
  megaBeamHit: 294,
  changeAttack: 319,
  changeAttackHit: 320,
  evilDstHit: 222,
  counterHit: 174,
  exFire: 231,
  cpuIori: 410,
  scMusashi: 260,
  scGetterBeam: 265,
  scEvilBeam: 279,
  scChangeAttack: 318,
  efs: 331,
  efsCancel: 332,
} satisfies Partial<Record<Action, number>>;
export type ScriptedAction = keyof typeof SCRIPTED;
export const isScripted = (
  action: Action,
): action is ScriptedAction | 'script' =>
  action === 'script' || Object.hasOwn(SCRIPTED, action);

// A display of 0 or 1000-odd ticks waits for gameplay (landing or a jump
// back to itself): play it as one held tick.
const waits = (frames: Pose[]) =>
  frames.map(({ duration }) =>
    duration > 0 && duration < 1000 ? duration : 1,
  );
const z = zomaClips;
// Zoma's neutral, guard, victim and result clips: the engine's own states
// and the twins of Ryuko's victim actions (export_zoma), shaped like his.
const zomaAnimations: Partial<Record<AnimatedAction, Clip>> = {
  walk: clip(z.walk, true),
  backwalk: clip(z.backwalk, true),
  takeoff: clip(z.jump.slice(0, 1)),
  jump: clip(z.jump.slice(1), false, waits(z.jump.slice(1))),
  land: clip(z.land),
  crouchEnter: clip(z.crouchEnter),
  // Action 19 holds a single zero-length display.
  crouch: clip(z.crouch, true, waits(z.crouch)),
  stand: clip(z.stand),
  turn: clip(z.turn),
  crouchTurn: clip(z.crouchTurn),
  guard: clip(z.guard.slice(0, 1)),
  crouchGuard: clip(z.crouchGuard.slice(0, 1)),
  airGuard: clip(z.airGuard.slice(0, 1)),
  block: clip(z.guard),
  crouchBlock: clip(z.crouchGuard),
  airBlock: clip(z.airGuard),
  blockHeavy: clip(z.blockHeavy),
  crouchBlockHeavy: clip(z.crouchBlockHeavy),
  airBlockHeavy: clip(z.airBlockHeavy),
  blockRapid: clip(z.blockRapid),
  crouchBlockRapid: clip(z.crouchBlockRapid),
  airBlockRapid: clip(z.airBlockRapid),
  timeStopGuard: clip(z.timeStopGuard),
  crouchTimeStopGuard: clip(z.crouchTimeStopGuard),
  airTimeStopGuard: clip(z.airTimeStopGuard),
  blockStop: clip(z.blockStop),
  crouchBlockStop: clip(z.crouchBlockStop),
  hit: clip(z.hit),
  hitHeavy: clip(z.hitHeavy),
  airHit: clip(z.airHit),
  airHitHeavy: clip(z.airHitHeavy),
  jumpHit: clip(z.jumpHit),
  hitPull: clip(z.hitPull),
  hitRapid: scriptClip(84, 'zoma'),
  airHitRapid: scriptClip(85, 'zoma'),
  drillDown: clip(z.drillDown, false, waits(z.drillDown)),
  launchDown: clip(z.launchDown, false, waits(z.launchDown)),
  slamBounce: clip(z.slamBounce, false, waits(z.slamBounce)),
  bounceDown: clip(z.bounceDown),
  launchUp: clip(z.launchUp, false, waits(z.launchUp)),
  launchAway: clip(z.launchAway, false, waits(z.launchAway)),
  sweep: clip(z.sweep, false, waits(z.sweep)),
  chuckToss: clip(z.chuckToss, false, waits(z.chuckToss)),
  uppercut: clip(z.uppercut, false, waits(z.uppercut)),
  dstToss: clip([z.dstToss[0], ...z.dstTossSpin], 1),
  tossBounce: clip([...z.dstToss.slice(1), ...z.dstTossSpin2], 2),
  twist: clip([z.twist[0], ...z.twisting], 1),
  twistBounce: clip([z.twist[1], ...z.twisting2], 1),
  dstHeld: clip(dstHeld(z.grabbed, 'zoma')),
  superHeld: clip(z.grabbed.slice(0, 1)),
  knockdown: clip(z.knockdown),
  getUp: clip(z.getUp),
  down: clip(z.ko, false, waits(z.ko)),
  koAgain: clip(z.koAgain),
  koLand: clip(z.down),
  // WIN (56) and the draw (63) call DEMO STAND (41) once, then hold.
  win: clip([...z.winStand, ...z.win]),
  draw: clip([...z.winStand, ...z.draw]),
  fly: scriptClip(98, 'zoma'),
  shock: scriptClip(90, 'zoma'),
  rushAirHit: scriptClip(123, 'zoma'),
};

// Object keys name a spawned source object, played from its flattened timeline.
export const isObject = (
  action: AnimatedAction | ObjectKey,
): action is ObjectKey => !Object.hasOwn(animations, action);
function clipOf(action: AnimatedAction | ObjectKey, who: Who) {
  if (isObject(action)) return objectClip(action, who);
  const found = who === 'ryuko' ? animations[action] : zomaAnimations[action];
  if (!found) throw new Error(`Zoma has no ${action} clip yet`);
  return found;
}
export function animationDuration(
  action: AnimatedAction | ObjectKey,
  who: Who = 'ryuko',
) {
  const found = clipOf(action, who);
  return found ? found.ticks.reduce((total, ticks) => total + ticks, 0) : 0;
}

// The op 0x19 boxes the hit test reads (0x40f1b8: kind bit 1 or 2) for a
// fighter's pose. Idle keeps action 1's one box (PCs 10 and 24).
// A fighter action's display at an age; idle stands for action 1's first,
// as scene.ts draws idle from its VM.
export const clipPose = (action: Shown, age: number, who: Who = 'ryuko') =>
  action === 'idle'
    ? (who === 'ryuko' ? clips : zomaClips).idle[0]
    : animationFrame(action, age, who);
function bodies(action: Shown, age: number, who: Who): BodyBox[] {
  return clipPose(action, age, who).body ?? [];
}
// Action 43's black panel (image 294, a 673 × 507 field of palette entry 0,
// (0, 0, 8), which is not the colour key), opaque (PC 432) and at 50% (436).
export const BLACK = { opaque: clips.black[1], half: clips.black[2] };
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
  who: Who = 'ryuko',
): Pose {
  const found = clipOf(action, who);
  if (!found) throw new Error(`Source object ${action} has no displays`);
  const { frames, ticks, loopStart } = found;
  const duration = animationDuration(action, who);
  const intro = ticks
    .slice(0, Math.max(0, loopStart))
    .reduce((total, n) => total + n, 0);
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
