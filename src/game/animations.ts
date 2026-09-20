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

// These are authored visual timelines, not execution of non-idle action bytecode.
// Zero/very long source displays wait for gameplay; give them explicit end behavior.
export const animations = {
  walk: clip(data.clips.walk, true),
  backwalk: clip(data.clips.backwalk, true),
  takeoff: clip(data.clips.jump.slice(0, 1)),
  jump: clip(data.clips.jump.slice(1), false, [13, 5, 15, 1]),
  land: clip(data.clips.land),
  crouchEnter: clip(data.clips.crouchEnter),
  crouch: clip(data.clips.crouch, true),
  stand: clip(data.clips.stand),
  punch: clip(data.clips.punch),
  kick: clip(data.clips.kick, false, [5, 5, 7, 10, 11]),
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
  hit: clip(data.clips.hit),
  hitHeavy: clip(data.clips.hitHeavy),
  airHit: clip(data.clips.airHit),
  airHitHeavy: clip(data.clips.airHitHeavy),
  down: clip(
    [...data.clips.ko, ...data.clips.down],
    false,
    [5, 5, 2, 2, 12, 10, 10, 50],
  ),
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
