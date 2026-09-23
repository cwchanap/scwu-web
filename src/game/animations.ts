import data from './generated/assets.json';
import type { Frame } from './standing';

export type Pose = Frame & { width: number; height: number };
interface Clip {
  frames: Pose[];
  ticks: number[];
  loop: boolean;
}
function clip(
  frames: Pose[],
  loop = false,
  ticks = frames.map((f) => f.duration),
): Clip {
  if (
    !frames.length ||
    ticks.length !== frames.length ||
    ticks.some((n) => !Number.isInteger(n) || n <= 0)
  )
    throw new Error('Animation clips need one positive tick duration per pose');
  return { frames, ticks, loop };
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
  punch: clip(data.clips.punch),
  kick: clip(data.clips.kick, false, [5, 5, 7, 10, 11]),
  punch2: clip(data.clips.punch2),
  punch3: clip(data.clips.punch3, false, [5, 2, 8, 6, 8, 5, 15, 8]),
  kick2: clip(data.clips.kick2),
  hitUp: clip(data.clips.hitUp),
  hitUpRecover: clip(data.clips.hitUpRecover),
  hitUpJump: clip(data.clips.hitUpJump, false, [8, 13, 5, 15, 1]),
  iori: clip(data.clips.iori),
  iori2: clip(data.clips.iori2),
  iori3: clip(data.clips.iori3),
  hitSlide: clip(data.clips.hitHeavy),
  hitPull: clip(data.clips.hitPull),
  blockStop: clip(data.clips.blockStop),
  crouchBlockStop: clip(data.clips.crouchBlockStop),
  launchDown: clip(data.clips.launchDown, false, [3, 3, 3, 1]),
  slamBounce: clip(data.clips.slamBounce, false, [10, 20, 1]),
  bounceDown: clip(data.clips.bounceDown),
  // The long final displays wait for landing, rather than ending the reaction.
  launchUp: clip(data.clips.launchUp, false, [25, 30, 10, 1]),
  launchAway: clip(data.clips.launchAway, false, [2, 2, 2, 25, 1]),
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
  hit: clip(data.clips.hit),
  hitHeavy: clip(data.clips.hitHeavy),
  airHit: clip(data.clips.airHit),
  airHitHeavy: clip(data.clips.airHitHeavy),
  hitRapid: clip(data.clips.hitRapid),
  airHitRapid: clip(data.clips.airHitRapid),
  // Action 60's last display waits for landing; action 62 then slides and holds.
  down: clip(
    data.clips.ko,
    false,
    data.clips.ko.map((frame) => frame.duration || 1),
  ),
  koLand: clip(data.clips.down),
  win: clip(data.clips.win, false, [10, 10, 1]),
  // The source loss action is a blank screen. Use the recovered seated draw pose.
  lose: clip(data.clips.draw),
  draw: clip(data.clips.draw),
};
export type AnimatedAction = keyof typeof animations;
export type Action = 'idle' | AnimatedAction;

export function animationDuration(action: AnimatedAction) {
  return animations[action].ticks.reduce((total, ticks) => total + ticks, 0);
}

export function animationFrame(action: AnimatedAction, age: number): Pose {
  const { frames, ticks, loop } = animations[action];
  const duration = animationDuration(action);
  let time = loop
    ? Math.max(0, age) % duration
    : Math.min(Math.max(0, age), duration - 1);
  for (let i = 0; i < frames.length; i++) {
    if (time < ticks[i]) return frames[i];
    time -= ticks[i];
  }
  return frames[frames.length - 1];
}
