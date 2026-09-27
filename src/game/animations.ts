import data from './generated/assets.json';
import type { Frame } from './standing';

// `held` marks an op 0x07 held-pose display, drawn by heldPlacement.
export type Pose = Frame & { width: number; height: number; held?: boolean };
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
  return { frames, ticks, loopStart };
}

const THROW_GRIP_TICKS = 12;
const spinTicks = data.clips.throwSpin.map((frame) => frame.duration);
const spinDuration = spinTicks.reduce((total, ticks) => total + ticks, 0);
// ponytail: three authored rotations; original object dispatch is not interpreted.
const throwSpin = Array.from({ length: 3 }, () => data.clips.throwSpin).flat();
export const THROW_RELEASE_TICK = THROW_GRIP_TICKS + spinDuration * 3;

// Shared by the held fighter's physics and draw order to stay in sync with the turn.
export function throwHold(age: number) {
  if (age < THROW_GRIP_TICKS || age >= THROW_RELEASE_TICK)
    return { x: 90, y: -24, behind: false };
  const angle = ((age - THROW_GRIP_TICKS) / spinDuration) * Math.PI * 2;
  return {
    x: Math.cos(angle) * 90,
    y: -48 - Math.sin(angle) * 24,
    behind: Math.sin(angle) > 0,
  };
}

// Action 215 calls the throw spin (199) three times, then 217 ten times.
const dstSpins = [
  ...Array.from({ length: 3 }, () => data.clips.throwSpin).flat(),
  ...Array.from({ length: 10 }, () => data.clips.dstSpin).flat(),
];
export const DST_TOSS_TICK =
  data.clips.dstHit[0].duration +
  dstSpins.reduce((total, frame) => total + frame.duration, 0);
// Actions 199/217 run op 0x07 before each spin display: the held offset in
// source pixels, bit 2 (face the holder's way, mirrored image) and bit 0
// (drawn behind the holder). Response 30 first places the victim 60 ahead.
const DST_HOLDS = [
  { x: 60, same: true, behind: true },
  { x: -10, same: true, behind: true },
  { x: -60, same: false, behind: true },
  { x: 0, same: false, behind: false },
];
export function dstHold(age: number) {
  const first = data.clips.dstHit[0].duration;
  if (age < first) return { x: 60, same: false, behind: false };
  let time = age - first;
  for (const [index, frame] of dstSpins.entries()) {
    if (time < frame.duration) return DST_HOLDS[index % DST_HOLDS.length];
    time -= frame.duration;
  }
  return null;
}
const dstHeld = () => [
  { ...data.clips.grabbed[0], duration: data.clips.dstHit[0].duration },
  // Op 0x07 selects held pose 1 from the victim's table and adds the bit 2 flip.
  ...dstSpins.map((frame, index) => ({
    ...heldFrame(1, DST_HOLDS[index % DST_HOLDS.length].same ? 4 : 0),
    duration: frame.duration,
  })),
];

// Super timelines flattened by scripts/export_assets.py: displays with op 0x09
// calls inlined and op 0x0a jumps followed, plus the gameplay opcodes at their
// action ages. The match plays their events; conditions are checked at entry.
export type ScriptEvent = { t: number } & (
  | {
      op: 'motion';
      ax: number;
      vx: number;
      vy: number;
      ay: number;
      flags: number;
    }
  | { op: 'handler'; slot: number; action: number; offset: number }
  | {
      op: 'spawn';
      flags: number;
      action: number;
      x: number;
      y: number;
      slot: number;
      z: number;
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
  | { op: 'color'; mode: number; fade: number }
);
export interface Script {
  frames: (Pose & { t: number })[];
  events: ScriptEvent[];
  loop: number;
  end: 'end' | 'hold' | 'loop' | 'jump';
  next: number | null;
}
const scripts = data.scripts as unknown as Record<string, Script>;
// The victim action selected by each op 0x17 response id.
export const RESPONSES: readonly number[] = data.responses;
export function script(index: number) {
  const found = scripts[index];
  if (!found) throw new Error(`Source action ${index} was not exported`);
  return found;
}
const scriptEvents = new Map<number, Map<number, ScriptEvent[]>>();
// Events that run when a scripted action or object reaches the given age.
export function eventsAt(index: number, age: number) {
  let byTick = scriptEvents.get(index);
  if (!byTick) {
    byTick = new Map();
    for (const event of script(index).events)
      byTick.set(event.t, [...(byTick.get(event.t) ?? []), event]);
    scriptEvents.set(index, byTick);
  }
  return byTick.get(age) ?? [];
}
// A zero-length display waits for gameplay (landing); hold it like a long pose.
const scriptClip = (index: number) => {
  const { frames, loop } = script(index);
  return clip(
    frames,
    loop >= 0 ? loop : false,
    frames.map((frame) => frame.duration || 1),
  );
};
const objectClips = new Map<number, Clip | null>();
function objectClip(index: number) {
  if (!objectClips.has(index))
    objectClips.set(
      index,
      script(index).frames.length ? scriptClip(index) : null,
    );
  return objectClips.get(index)!;
}
// Image 0 (a solid marker block) and 8191 are the source's blank displays.
export const isBlank = (pose: Pose) => pose.image === 0 || pose.image === 8191;
// Op 0x07 draws the held opponent with an entry of its held-pose table. Bit 2
// faces the holder's way with a mirrored image; bit 3 flips it vertically.
export function heldFrame(pose: number, flags: number): Pose {
  return {
    ...data.held[pose],
    pc: 0,
    duration: 1,
    flip_x: (flags & 4) !== 0,
    flip_y: (flags & 8) !== 0,
    ignore_facing: false,
    packed_image: data.held[pose].image,
    extra_bytes: '',
    held: true,
  };
}

// These are authored visual timelines, not execution of non-idle action bytecode.
// Zero/very long source displays wait for gameplay; give them explicit end behavior.
export const animations = {
  walk: clip(data.clips.walk, true),
  backwalk: clip(data.clips.backwalk, true),
  takeoff: clip(data.clips.jump.slice(0, 1)),
  jump: clip(data.clips.jump.slice(1), false, [13, 5, 15, 1]),
  doubleJump: clip(data.clips.doubleJump, false, [3, 5, 27]),
  dash: clip(data.clips.dash, false, [5, 5, 5, 8]),
  backdash: clip(data.clips.backdash, false, [10, 5, 5, 15, 8]),
  airDash: clip(data.clips.airDash),
  airBackdash: clip(data.clips.airBackdash),
  land: clip(data.clips.land),
  crouchEnter: clip(data.clips.crouchEnter),
  crouch: clip(data.clips.crouch, true),
  stand: clip(data.clips.stand),
  // Actions 23/24 display a mirrored mid-turn pose for ten ticks.
  turn: clip(data.clips.turn),
  crouchTurn: clip(data.clips.crouchTurn),
  // Action 32 jumps to action 33 at PC 333, after its blank repositioning displays.
  intro: clip(data.clips.intro.slice(2)),
  punch: clip(data.clips.punch),
  kick: clip(data.clips.kick, false, [5, 5, 7, 10, 11]),
  // Punch 1 and kick 1 enter 179/187 on contact (op 0x02 slots 2 and 3).
  punchHit: clip(data.clips.punchHit),
  kickHit: clip(data.clips.kickHit),
  punch2: clip(data.clips.punch2),
  // Action 181's two hop poses last until each landing: 12 and 8 ticks.
  punch3: clip(data.clips.punch3, false, [12, 2, 8, 6, 8, 5, 15, 8]),
  kick2: clip(data.clips.kick2),
  hitUp: clip(data.clips.hitUp),
  hitUpRecover: clip(data.clips.hitUpRecover),
  hitUpJump: clip(data.clips.hitUpJump, false, [8, 13, 5, 15, 1]),
  iori: clip(data.clips.iori),
  iori2: clip(data.clips.iori2),
  iori3: clip(data.clips.iori3),
  hitPull: clip(data.clips.hitPull),
  // Response 5/6 (air punch and kick against a grounded opponent) → action 77.
  jumpHit: clip(data.clips.jumpHit),
  // Air Drill response 56 → action 135: slammed down until landing enters 124.
  drillDown: clip(data.clips.drillDown, false, [1]),
  blockStop: clip(data.clips.blockStop),
  crouchBlockStop: clip(data.clips.crouchBlockStop),
  launchDown: clip(data.clips.launchDown, false, [3, 3, 3, 1]),
  slamBounce: clip(data.clips.slamBounce, false, [10, 20, 1]),
  bounceDown: clip(data.clips.bounceDown),
  // The long final displays wait for landing, rather than ending the reaction.
  launchUp: clip(data.clips.launchUp, false, [25, 30, 10, 1]),
  launchAway: clip(data.clips.launchAway, false, [2, 2, 2, 25, 1]),
  sweep: clip(data.clips.sweep, false, [2, 2, 2, 25, 1]),
  kick3: clip([
    ...data.clips.kick3.slice(0, 3),
    ...Array.from({ length: 8 }, () => data.clips.kick3Repeat).flat(),
    ...data.clips.kick3.slice(3),
  ]),
  drill: clip(data.clips.drill),
  airDrill: clip(data.clips.airDrill.slice(0, 3)),
  // Actions 209–211 loop these poses until contact or landing.
  airDrillSpin: clip(data.clips.airDrillSpin.slice(0, 2), true),
  // Actions 209–211: eight ticks of hit-stop, then this two-tick transition.
  airDrillContact: clip(data.clips.airDrillSpin.slice(0, 1), false, [2]),
  drillLand: clip(data.clips.drillLand),
  dst: clip(data.clips.dst),
  // Action 221 repeats DST's grab and 58-tick miss with its own images.
  evilDst: clip(data.clips.evilDst),
  dstHit: clip([
    data.clips.dstHit[0],
    ...dstSpins,
    ...data.clips.dstHit.slice(1),
  ]),
  dstHeld: clip(dstHeld()),
  // Response 31 enters action 129, which jumps to the spinning loop 130; its
  // landing branch bounces through PC 1752 into the slower loop 131.
  dstToss: clip([data.clips.dstToss[0], ...data.clips.dstTossSpin], 1),
  tossBounce: clip(
    [...data.clips.dstToss.slice(1), ...data.clips.dstTossSpin2],
    2,
  ),
  // Missile response 32 enters action 85, then 86; landing bounces into 87.
  twist: clip([data.clips.twist[0], ...data.clips.twisting], 1),
  twistBounce: clip([data.clips.twist[1], ...data.clips.twisting2], 1),
  dstMissile: clip(data.clips.dstMissile, true),
  dstMissileSmoke: clip(data.clips.dstMissileSmoke),
  dstFire: clip(data.clips.dstFire),
  smokeRight: clip(data.clips.smokeRight),
  smokeLeft: clip(data.clips.smokeLeft),
  dashSmoke: clip(data.clips.dashSmoke),
  hisaSmoke: clip(data.clips.hisaSmoke),
  hisaSmokeBack: clip(data.clips.hisaSmokeBack),
  landingSmoke: clip(data.clips.landingSmoke),
  axeThrow: clip(data.clips.axeThrow),
  axeFlight: clip(data.clips.axeFlight, true),
  axeHit: clip(data.clips.axeHit),
  grab: clip(data.clips.grab),
  throw: clip(
    [data.clips.throw[0], ...throwSpin, ...data.clips.throw.slice(1)],
    false,
    [
      THROW_GRIP_TICKS,
      ...throwSpin.map((frame) => frame.duration),
      18,
      10,
      8,
      8,
    ],
  ),
  grabbed: clip(
    [
      data.clips.grabbed[0],
      ...Array.from({ length: 3 }, () => [
        data.clips.grabbedSpin[0],
        data.clips.grabbedSpin[0],
        data.clips.grabbedSpin[1],
        data.clips.grabbedSpin[1],
      ]).flat(),
    ],
    false,
    [THROW_GRIP_TICKS, ...Array.from({ length: 3 }, () => spinTicks).flat()],
  ),
  thrown: clip(data.clips.thrown, false, [2, 2, 2, 12, 1]),
  knockdown: clip(data.clips.knockdown),
  getUp: clip(data.clips.getUp),
  hitSpark: clip(data.clips.hitSpark),
  // Select the first branch; the remaining displays are its mirrored alternative.
  hitStreak: clip(data.clips.hitStreak.slice(0, 13)),
  guardSpark: clip(data.clips.guardSpark),
  crouchPunch: clip(data.clips.crouchPunch),
  crouchKick: clip(data.clips.crouchKick),
  airPunch: clip(data.clips.airPunch),
  airKick: clip(data.clips.airKick),
  guard: clip(data.clips.guard.slice(0, 1)),
  crouchGuard: clip(data.clips.crouchGuard.slice(0, 1)),
  airGuard: clip(data.clips.airGuard.slice(0, 1)),
  block: clip(data.clips.guard),
  crouchBlock: clip(data.clips.crouchGuard),
  airBlock: clip(data.clips.airGuard),
  blockHeavy: clip(data.clips.blockHeavy),
  crouchBlockHeavy: clip(data.clips.crouchBlockHeavy),
  airBlockHeavy: clip(data.clips.airBlockHeavy),
  blockRapid: clip(data.clips.blockRapid),
  crouchBlockRapid: clip(data.clips.crouchBlockRapid),
  airBlockRapid: clip(data.clips.airBlockRapid),
  // The hidden super's guards (responses 78–80 → 168–172).
  timeStopGuard: clip(data.clips.timeStopGuard),
  crouchTimeStopGuard: clip(data.clips.crouchTimeStopGuard),
  airTimeStopGuard: clip(data.clips.airTimeStopGuard),
  hit: clip(data.clips.hit),
  hitHeavy: clip(data.clips.hitHeavy),
  airHit: clip(data.clips.airHit),
  airHitHeavy: clip(data.clips.airHitHeavy),
  // Op 0x20 in 83/84 only picks which of two pose orders plays (PCs 957, 982).
  hitRapid: scriptClip(83),
  airHitRapid: scriptClip(84),
  // Action 60's last display waits for landing; action 62 then slides and holds.
  down: clip(
    data.clips.ko,
    false,
    data.clips.ko.map((frame) => frame.duration || 1),
  ),
  koLand: clip(data.clips.down),
  // Actions 57/65 call WIN STAND (58) once through opcode 0x09 at PCs 565/667.
  win: clip([...data.clips.winStand, ...data.clips.win], false, [
    ...data.clips.winStand.map((frame) => frame.duration),
    10,
    10,
    1,
  ]),
  // The source loss action is a blank screen. Use the recovered seated draw pose.
  lose: clip(data.clips.draw),
  draw: clip([...data.clips.winStand, ...data.clips.draw]),
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
  // Command 22 (CPU IORI): action 410 jumps to 411, which jumps to iori3 (248).
  cpuIori: scriptClip(410),
  cpuIoriRecover: clip(data.clips.cpuIoriRecover),
  // Super-cancel versions, entered when a super cancels IORI.
  scMusashi: scriptClip(260),
  scGetterBeam: scriptClip(265),
  scEvilBeam: scriptClip(279),
  scChangeAttack: scriptClip(318),
  // Responses 43 (action 97, looping 98 until landing) and 33 (88, looping 90).
  fly: scriptClip(97),
  shock: scriptClip(88),
  // Response 76 in the air → action 122; op 0x20 there only reorders poses.
  rushAirHit: scriptClip(122),
  // Response 30 (action 128); op 0x07 then replaces the pose from the held table.
  superHeld: clip(data.clips.grabbed.slice(0, 1)),
};
export type AnimatedAction = keyof typeof animations;
export type Action = 'idle' | AnimatedAction;
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
  cpuIori: 410,
  scMusashi: 260,
  scGetterBeam: 265,
  scEvilBeam: 279,
  scChangeAttack: 318,
} satisfies Partial<Record<Action, number>>;
export type ScriptedAction = keyof typeof SCRIPTED;
export const isScripted = (action: Action): action is ScriptedAction =>
  Object.hasOwn(SCRIPTED, action);

// Numbers name a spawned source object, played from its flattened timeline.
export function animationDuration(action: AnimatedAction | number) {
  const found =
    typeof action === 'number' ? objectClip(action) : animations[action];
  return found ? found.ticks.reduce((total, ticks) => total + ticks, 0) : 0;
}

export function animationFrame(
  action: AnimatedAction | number,
  age: number,
): Pose {
  const found =
    typeof action === 'number' ? objectClip(action) : animations[action];
  if (!found) throw new Error(`Source object ${action} has no displays`);
  const { frames, ticks, loopStart } = found;
  const duration = animationDuration(action);
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
