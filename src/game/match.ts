// New MVP rules. These are intentionally separate from recovered idle semantics.
import { animationDuration, THROW_RELEASE_TICK, throwHold } from './animations';
import type { Action, AnimatedAction } from './animations';
import { ROUND_END_TICKS } from './hud';
export type Control =
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'hitUp'
  | 'iori'
  | 'guard'
  | 'dash'
  | 'drill'
  | 'axe'
  | 'throw';
export type Input = Partial<Record<Control, boolean>>;
export type Mode = 'practice' | 'cpu';
export const TICK_MS = 10;
export const WIDTH = 960;
// The source camera views 640 pixels of a 1280-pixel stage.
export const STAGE_WIDTH = 1920;
export const HEIGHT = 720;
export const GROUND = 636;
// Reserve the extended air dash (181.5px) and throw/recovery poses, including rounding.
// Keep one wall for every state so changing pose never relocates a fighter.
export const FIGHTER_MARGIN = 185;
export const ATTACKS = {
  punch: { startup: 7, active: 5, range: 145, damage: 8 },
  kick: { startup: 10, active: 7, range: 190, damage: 13 },
  crouchPunch: { startup: 14, active: 10, range: 175, damage: 8 },
  crouchKick: { startup: 18, active: 15, range: 195, damage: 13 },
  airPunch: { startup: 18, active: 19, range: 150, damage: 8 },
  airKick: { startup: 15, active: 24, range: 180, damage: 13 },
  punch2: { startup: 18, active: 18, range: 205, damage: 10 },
  punch3: { startup: 29, active: 20, range: 235, damage: 16 },
  kick2: { startup: 13, active: 16, range: 205, damage: 14 },
  hitUp: { startup: 15, active: 10, range: 165, damage: 15 },
  iori: { startup: 21, active: 8, range: 180, damage: 10 },
  iori2: { startup: 23, active: 8, range: 220, damage: 12 },
  iori3: { startup: 21, active: 5, range: 195, damage: 16 },
  kick3: { startup: 15, active: 48, range: 225, damage: 17 },
  drill: { startup: 23, active: 36, range: 310, damage: 18 },
  // The short diagonal drill reaches ~125px, plus the opponent's ~55px body.
  airDrill: { startup: 22, active: 0, range: 180, damage: 16 },
  airDrillSpin: { startup: 0, active: Infinity, range: 180, damage: 16 },
};
// Recovered strike/gap cycles. Damage above is the total for a complete move.
const multiHits: Partial<
  Record<
    keyof typeof ATTACKS,
    { interval: number; active: number; count: number }
  >
> = {
  punch2: { interval: 6, active: 3, count: 3 },
  airKick: { interval: 8, active: 4, count: 3 },
  kick3: { interval: 6, active: 3, count: 8 },
  drill: { interval: 6, active: 3, count: 6 },
};
// Ryuko opcode 0x17 selects the victim response; its opcode 0x1a adds
// hit-stop to BOTH fighters. These are contact pauses, not active-frame gaps.
// SCWU.KGT's base hit/guard pause is zero. See README's recovered timing table.
// ponytail: other attacks retain MVP knockback; Hit Up and IORI execute the
// selected response motion until the remaining callers are reconstructed too.
const hitResponses = {
  punch: { stop: 10, kind: 'light' },
  kick: { stop: 10, kind: 'light' },
  crouchPunch: { stop: 15, kind: 'heavy' },
  crouchKick: { stop: 13, kind: 'heavy' },
  airPunch: { stop: 15, kind: 'heavy' },
  airKick: { stop: 15, kind: 'heavy' },
  punch2: { stop: 10, kind: 'light' },
  punch3: { stop: 15, kind: 'heavy' },
  kick2: { stop: 15, kind: 'heavy' },
  hitUp: { stop: 13, kind: 'heavy' },
  iori: { stop: 15, kind: 'heavy' },
  iori2: { stop: 15, kind: 'heavy' },
  iori3: { stop: 13, kind: 'heavy' },
  kick3: { stop: 0, kind: 'rapid' },
  drill: { stop: 15, kind: 'heavy' },
  // Aerial drill pauses are applied by the attacker's contact branch instead.
  airDrill: { stop: 0, kind: 'heavy' },
  airDrillSpin: { stop: 0, kind: 'heavy' },
} as const;
const followUps = {
  punch: 'punch2',
  punch2: 'punch3',
  kick: 'kick2',
  kick2: 'kick3',
  iori: 'iori2',
  iori2: 'iori3',
} as const;
const FOLLOW_UP_GRACE_TICKS = 15;
const dashes = new Set<Action>(['dash', 'backdash', 'airDash', 'airBackdash']);
const aerialDrills = new Set<Action>([
  'airDrill',
  'airDrillSpin',
  'airDrillContact',
]);
const AIR_DRILL_DAMAGE = [16, 5, 3, 1];
// Opcode 1 uses 16.16 velocity scaled by floor(65536 / 100) at speed 10.
// Convert the recovered source velocities to the web's 1.5-scale arena.
const SOURCE_VELOCITY_SCALE = (655 / 65536) * 1.5;
// Opcode 1 acceleration uses floor(0x3c0000 / 100²) in the same 16.16 units.
const SOURCE_ACCELERATION_SCALE = (393 / 65536) * 1.5;
const JUMP_GRAVITY = 80 * SOURCE_ACCELERATION_SCALE;
// Source actions 75/121/159/161: nine impact ticks, then 25/23 moving ticks.
const reactionSlides = {
  hitSlide: { velocity: -650, acceleration: 10 },
  hitPull: { velocity: 650, acceleration: -10 },
  blockStop: { velocity: -250, acceleration: 8 },
  crouchBlockStop: { velocity: -250, acceleration: 8 },
};
const launchMotion = {
  launchUp: { tick: 25, vx: -160, vy: -1700, gravity: 60 },
  launchAway: { tick: 6, vx: -600, vy: -1220, gravity: 90 },
  launchDown: { tick: 9, vx: -500, vy: 2000, gravity: 100 },
  slamBounce: { tick: 10, vx: -400, vy: -700, gravity: 70 },
};
const DOUBLE_TAP_TICKS = 20;
export const AXE_RELEASE_TICK = 16;
export { THROW_RELEASE_TICK } from './animations';
const THROW_STARTUP = 7;
const THROW_RANGE = 115;
const THROW_DAMAGE = 18;
export function isAttack(action: Action): action is keyof typeof ATTACKS {
  return Object.hasOwn(ATTACKS, action);
}
const blocks = new Set<Action>([
  'block',
  'blockHeavy',
  'crouchBlock',
  'crouchBlockHeavy',
  'airBlock',
  'airBlockHeavy',
  'blockRapid',
  'crouchBlockRapid',
  'airBlockRapid',
  'blockStop',
  'crouchBlockStop',
]);
const guards = new Set<Action>(['guard', 'crouchGuard', 'airGuard', ...blocks]);
const reactions = new Set<Action>([
  'hit',
  'hitHeavy',
  'airHit',
  'airHitHeavy',
  'hitRapid',
  'airHitRapid',
  ...(Object.keys(launchMotion) as (keyof typeof launchMotion)[]),
  'hitSlide',
  'hitPull',
  ...blocks,
]);
const groundReactions: Partial<Record<Action, AnimatedAction>> = {
  airHit: 'hit',
  airHitHeavy: 'hitHeavy',
  airHitRapid: 'hitRapid',
  airBlock: 'block',
  airBlockHeavy: 'blockHeavy',
  airBlockRapid: 'blockRapid',
};
const protectedReactions = new Set<Action>([
  'grabbed',
  'thrown',
  'knockdown',
  'slamBounce',
  'bounceDown',
  'getUp',
]);
export interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  hp: number;
  facing: -1 | 1;
  action: Action;
  age: number;
  airAge: number;
  hitStop: number;
  connected: boolean;
  airDrillStage: number;
  hits: number;
  damage: number;
  doubleJumped: boolean;
  airDashed: boolean;
  nextAttack: keyof typeof ATTACKS | null;
  nextJump: boolean;
}
export interface Projectile {
  owner: number;
  x: number;
  y: number;
  facing: -1 | 1;
  age: number;
  hit: boolean;
}
export interface Impact {
  x: number;
  y: number;
  age: number;
  blocked: boolean;
  heavy: boolean;
  facing: -1 | 1;
  effect: 'hitSpark' | 'guardSpark';
}
const fighter = (x: number, facing: -1 | 1): Fighter => ({
  x,
  y: 0,
  vx: 0,
  vy: 0,
  gravity: 0.24,
  hp: 100,
  facing,
  action: 'idle',
  age: 0,
  airAge: 0,
  hitStop: 0,
  connected: false,
  airDrillStage: 0,
  hits: 0,
  damage: 0,
  doubleJumped: false,
  airDashed: false,
  nextAttack: null,
  nextJump: false,
});
const clampX = (x: number) =>
  Math.max(FIGHTER_MARGIN, Math.min(STAGE_WIDTH - FIGHTER_MARGIN, x));
function gravity(f: Fighter) {
  f.x = clampX(f.x + f.vx);
  f.vy += f.gravity;
  f.y = Math.min(0, f.y + f.vy);
  if (f.action === 'thrown') f.x = clampX(f.x - f.facing * 2);
  if (f.y === 0) {
    f.vx = f.vy = 0;
    f.gravity = 0.24;
  }
}
function launchJump(f: Fighter, double = false) {
  // Actions 4–6 and 10–12 choose neutral or directional velocity at takeoff.
  const speed = double ? (f.vx === 0 ? 1300 : 1200) : f.vx === 0 ? 1450 : 1400;
  f.vy = -speed * SOURCE_VELOCITY_SCALE;
  f.gravity = JUMP_GRAVITY;
  f.airAge = 0;
}

function launchHitUpJump(f: Fighter) {
  // Action 202 prepares for eight ticks, then follows the launched opponent.
  if (f.action === 'hitUpJump' && f.age === 8) {
    f.vx = f.facing * 320 * SOURCE_VELOCITY_SCALE;
    f.vy = -1530 * SOURCE_VELOCITY_SCALE;
    f.gravity = 42 * SOURCE_ACCELERATION_SCALE;
    f.airAge = 0;
  }
}

export class Match {
  fighters: [Fighter, Fighter] = [fighter(300, 1), fighter(660, -1)];
  ticks = 0;
  winner: 'player' | 'opponent' | 'draw' | null = null;
  endingTicks = 0;
  impacts: Impact[] = [];
  projectiles: Projectile[] = [];
  private previous: [Input, Input] = [{}, {}];
  private directionTaps: ({ direction: number; tick: number } | null)[] = [
    null,
    null,
  ];

  constructor(public mode: Mode = 'practice') {}

  clearInput() {
    this.previous = [{}, {}];
    this.directionTaps = [null, null];
  }

  private doubleTap(input: Input, index: number) {
    if (input.left && input.right) {
      this.directionTaps[index] = null;
      return false;
    }
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    if (!direction || this.previous[index][direction === 1 ? 'right' : 'left'])
      return false;
    const tap = this.directionTaps[index];
    const dash =
      tap?.direction === direction && this.ticks - tap.tick <= DOUBLE_TAP_TICKS;
    this.directionTaps[index] = dash ? null : { direction, tick: this.ticks };
    return dash;
  }

  get cameraX() {
    // Authored player lock, including round endings. Stage bounds are recovered.
    return Math.max(
      0,
      Math.min(STAGE_WIDTH - WIDTH, this.fighters[0].x - WIDTH / 2),
    );
  }

  get seconds() {
    return this.mode === 'practice'
      ? Infinity
      : Math.max(0, 60 - Math.floor(this.ticks / 100));
  }

  get cameraY() {
    // Keep the court framed until the player rises above the vertical dead zone.
    return Math.max(-HEIGHT, Math.min(0, this.fighters[0].y + 250));
  }

  get resultReady() {
    return this.winner !== null && this.endingTicks >= ROUND_END_TICKS;
  }

  private action(f: Fighter, action: Action, restart = false) {
    if (f.action === action && !restart) return;
    f.action = action;
    f.age = 0;
    f.connected = false;
    if (!aerialDrills.has(action) || action === 'airDrill') f.airDrillStage = 0;
    f.nextAttack = null;
    f.nextJump = false;
    if (
      action === 'dash' ||
      action === 'backdash' ||
      aerialDrills.has(action) ||
      ['grabbed', 'thrown', 'down'].includes(action)
    ) {
      f.vx = 0;
      f.gravity = 0.24;
    }
  }

  private showResultPose(f: Fighter, index: number) {
    if (
      f.hp === 0 ||
      f.hitStop > 0 ||
      f.y < 0 ||
      f.vy < 0 ||
      f.action === 'knockdown' ||
      f.action === 'bounceDown' ||
      Object.hasOwn(launchMotion, f.action) ||
      (f.action === 'hitUpJump' && f.age < 8) ||
      ((f.action === 'land' ||
        f.action === 'drillLand' ||
        f.action === 'getUp' ||
        f.action === 'throw') &&
        f.age < animationDuration(f.action))
    )
      return;
    this.action(
      f,
      this.winner === 'draw'
        ? 'draw'
        : (this.winner === 'player') === (index === 0)
          ? 'win'
          : 'lose',
    );
  }

  private recoverKnockdown(f: Fighter) {
    if (
      (f.action === 'knockdown' || f.action === 'bounceDown') &&
      f.hp > 0 &&
      f.age >= animationDuration(f.action)
    )
      this.action(f, 'getUp');
  }

  private moveLaunch(f: Fighter) {
    const motion = launchMotion[f.action as keyof typeof launchMotion];
    if (!motion) return false;
    // Victim actions hold their impact pose before the motion command.
    if (f.age === motion.tick) {
      f.vx = f.facing * motion.vx * SOURCE_VELOCITY_SCALE;
      f.vy = motion.vy * SOURCE_VELOCITY_SCALE;
      f.gravity = motion.gravity * SOURCE_ACCELERATION_SCALE;
      f.airAge = 0;
    }
    if (f.age >= motion.tick) {
      f.airAge++;
      gravity(f);
      if (f.y === 0) {
        f.doubleJumped = f.airDashed = false;
        this.action(
          f,
          f.action === 'launchDown'
            ? 'slamBounce'
            : f.action === 'slamBounce'
              ? 'bounceDown'
              : 'knockdown',
        );
      }
    }
    return true;
  }

  private slideReaction(f: Fighter) {
    const slide = reactionSlides[f.action as keyof typeof reactionSlides];
    if (slide) {
      if (f.age >= animationDuration(f.action as AnimatedAction)) f.vx = 0;
      else if (f.age >= 9) {
        f.vx =
          f.facing *
          (slide.velocity * SOURCE_VELOCITY_SCALE +
            (f.age - 8) * slide.acceleration * SOURCE_ACCELERATION_SCALE);
        f.x = clampX(f.x + f.vx);
      }
    }
    if (f.action === 'bounceDown' && f.age <= 10)
      f.x = clampX(f.x - f.facing * 200 * SOURCE_VELOCITY_SCALE);
  }

  private resolveThrows(frozen: boolean[]) {
    // Strikes resolve first; simultaneous grab attempts both miss.
    const attempts = this.fighters.filter((f, index) => {
      const target = this.fighters[1 - index];
      const distance = (target.x - f.x) * f.facing;
      return (
        f.action === 'grab' &&
        !frozen[index] &&
        f.hitStop === 0 &&
        f.age === THROW_STARTUP &&
        f.hp > 0 &&
        target.hp > 0 &&
        target.y === 0 &&
        target.vy === 0 &&
        !protectedReactions.has(target.action) &&
        !reactions.has(target.action) &&
        target.action !== 'throw' &&
        distance >= 0 &&
        distance <= THROW_RANGE
      );
    });
    if (attempts.length === 1) {
      const attacker = attempts[0];
      const target = this.fighters[attacker === this.fighters[0] ? 1 : 0];
      this.action(attacker, 'throw');
      this.action(target, 'grabbed');
    }
    this.fighters.forEach((target, index) => {
      if (target.action !== 'grabbed') return;
      const attacker = this.fighters[1 - index];
      if (attacker.action !== 'throw' || attacker.hp === 0) {
        this.action(target, target.y < 0 ? 'airHit' : 'hit');
        return;
      }
      const hold = throwHold(attacker.age);
      target.x = clampX(attacker.x + attacker.facing * hold.x);
      target.y = hold.y;
      target.vy = 0;
      target.facing = attacker.facing === 1 ? -1 : 1;
      if (attacker.age !== THROW_RELEASE_TICK) return;
      this.action(target, 'thrown');
      target.vy = -6;
      target.hp = Math.max(0, target.hp - THROW_DAMAGE);
      attacker.hits++;
      attacker.damage += THROW_DAMAGE;
      this.impacts.push({
        x: target.x - attacker.facing * 42,
        y: GROUND + target.y - 145,
        age: 0,
        blocked: false,
        heavy: true,
        facing: attacker.facing,
        effect: 'hitSpark',
      });
    });
  }

  private ai(): Input {
    if (this.mode === 'practice') return {};
    const [player, cpu] = this.fighters;
    const distance = Math.abs(player.x - cpu.x);
    const attacking = isAttack(player.action);
    if (attacking && distance < 200 && this.ticks % 180 < 90)
      return { guard: true };
    if (distance > 150)
      return { left: player.x < cpu.x, right: player.x > cpu.x };
    return { punch: this.ticks % 95 === 0, kick: this.ticks % 137 === 0 };
  }

  private move(
    f: Fighter,
    other: Fighter,
    input: Input,
    previous: Input,
    doubleTap: boolean,
  ) {
    if (f.hitStop === 0) f.age++;
    const followUp = followUps[f.action as keyof typeof followUps];
    const ioriFollowUp = f.action === 'iori' || f.action === 'iori2';
    const followUpOpen =
      followUp &&
      isAttack(f.action) &&
      f.age <
        animationDuration(f.action) +
          (ioriFollowUp ? 0 : FOLLOW_UP_GRACE_TICKS);
    if (followUpOpen) {
      const control = ioriFollowUp
        ? 'iori'
        : f.action.startsWith('punch')
          ? 'punch'
          : 'kick';
      if (input[control] && !previous[control]) f.nextAttack = followUp;
    }
    if (
      (f.action === 'hitUp' || (f.action === 'hitUpRecover' && f.age < 25)) &&
      input.jump &&
      !previous.jump
    )
      f.nextJump = true;
    if (f.hitStop > 0) {
      f.hitStop--;
      return;
    }
    if (f.action === 'grabbed') return;
    if (this.moveLaunch(f)) return;
    this.slideReaction(f);
    launchHitUpJump(f);
    if (f.action === 'hitUpJump' && f.age < 8) return;
    if (f.y < 0 || f.vy < 0) {
      f.airAge++;
      if (aerialDrills.has(f.action)) {
        if (f.action === 'airDrill' && f.age < animationDuration('airDrill'))
          f.vy = 0;
        // Hit-stop is separate; the contact clip contains two transition ticks.
        else {
          if (
            f.action !== 'airDrillContact' ||
            f.age >= animationDuration('airDrillContact')
          )
            f.vy =
              (f.airDrillStage === 0 ? 1000 : 1500) * SOURCE_VELOCITY_SCALE;
          f.x = clampX(f.x + f.facing * 800 * SOURCE_VELOCITY_SCALE);
          f.y = Math.min(0, f.y + f.vy);
          if (f.y === 0) f.vy = 0;
        }
      } else if (f.action === 'doubleJump' && f.age <= 3) {
        if (f.age === 3) launchJump(f, true);
      } else if (f.action === 'airDash' || f.action === 'airBackdash') {
        const backwards = f.action === 'airBackdash';
        // Actions 16/17 keep incoming motion until PCs 205/223 at age 3.
        // PCs 211/227 restore gravity after 30/20 level ticks; flag 0x02
        // retains horizontal velocity through recovery and action 7's fall.
        if (f.age === 3) {
          f.vx = f.facing * (backwards ? -800 : 800) * SOURCE_VELOCITY_SCALE;
          f.vy = 0;
          f.gravity = JUMP_GRAVITY;
        }
        if (f.age >= 3 && f.age < (backwards ? 23 : 33))
          f.x = clampX(f.x + f.vx);
        else gravity(f);
      } else gravity(f);
      if (f.y === 0) {
        f.doubleJumped = false;
        f.airDashed = false;
        if (f.action === 'thrown') {
          this.action(f, 'knockdown');
          return;
        }
        const groundReaction = groundReactions[f.action];
        if (groundReaction && f.action !== 'idle') {
          const remaining = animationDuration(f.action) - f.age;
          if (remaining > 0) {
            this.action(f, groundReaction);
            // Switch poses without restarting or shortening the hit/block recovery.
            f.age = animationDuration(groundReaction) - remaining;
            return;
          }
        }
        this.action(f, aerialDrills.has(f.action) ? 'drillLand' : 'land');
        return;
      }
    }
    this.recoverKnockdown(f);
    if (
      f.action === 'thrown' ||
      f.action === 'knockdown' ||
      f.action === 'bounceDown'
    )
      return;
    if (f.action === 'takeoff') {
      if (f.age < animationDuration('takeoff')) return;
      launchJump(f);
      this.action(f, 'jump');
      return;
    }
    if (f.action === 'doubleJump' && f.age < 3) return;
    if (f.action === 'hitUpRecover') {
      // Action 201 opens command 202 after its first five-tick display.
      // Early Jump taps are buffered using the training mode's input policy.
      if (f.age >= 5 && f.age < 25 && f.nextJump) {
        this.action(f, 'hitUpJump');
        return;
      }
      if (f.age < animationDuration('hitUpRecover')) return;
    }
    if (aerialDrills.has(f.action)) {
      if (
        f.action !== 'airDrillSpin' &&
        f.age >= animationDuration(f.action as AnimatedAction)
      )
        this.action(f, 'airDrillSpin');
      return;
    }
    if (
      ioriFollowUp &&
      f.nextAttack &&
      f.age >= (f.action === 'iori' ? 29 : 31)
    ) {
      // Actions 246/247 open follow-up commands after their active display.
      this.action(f, f.nextAttack, true);
      return;
    }
    if (
      f.action !== 'idle' &&
      (isAttack(f.action) ||
        f.action === 'axeThrow' ||
        reactions.has(f.action) ||
        ['land', 'drillLand', 'stand', 'grab', 'throw', 'getUp'].includes(
          f.action,
        )) &&
      f.age < animationDuration(f.action)
    ) {
      // Action 207 moves before its first strike, then slides during recovery.
      if (f.action === 'drill' && f.age >= 11 && f.age < 69)
        f.x = clampX(
          f.x + f.facing * (f.age < 59 ? 900 : 100) * SOURCE_VELOCITY_SCALE,
        );
      // Action 200: six accelerating ticks, then stop before the kick.
      if (f.action === 'hitUp' && f.age >= 2 && f.age < 8)
        f.x = clampX(
          f.x +
            f.facing *
              (600 * SOURCE_VELOCITY_SCALE +
                (f.age - 1) * 350 * SOURCE_ACCELERATION_SCALE),
        );
      if (
        (f.action === 'iori' && f.age >= 13 && f.age < 21) ||
        (f.action === 'iori2' && f.age >= 8 && f.age < 23) ||
        (f.action === 'iori3' && f.age >= 8 && f.age < 21)
      )
        f.x = clampX(
          f.x +
            f.facing *
              (f.action === 'iori2' ? 700 : 800) *
              SOURCE_VELOCITY_SCALE,
        );
      return;
    }
    if (f.nextAttack) {
      this.action(f, f.nextAttack, true);
      return;
    }
    // Hold the final pose for late input; queued attacks skip this extra recovery.
    if (followUpOpen) return;
    if (dashes.has(f.action) && f.action !== 'idle') {
      if (f.action === 'dash' || f.action === 'backdash') {
        const backwards = f.action === 'backdash';
        const startup = backwards ? 10 : 5;
        if (f.age < startup) return;
        if (f.age === startup) {
          // PCs 169/182 set the whole hop; use the shared integrator thereafter.
          f.vx = f.facing * (backwards ? -500 : 900) * SOURCE_VELOCITY_SCALE;
          f.vy = (backwards ? -900 : -500) * SOURCE_VELOCITY_SCALE;
          f.gravity = 90 * SOURCE_ACCELERATION_SCALE;
          f.airAge = 0;
          gravity(f);
        }
        // The source dash holds its final airborne pose until landing.
        return;
      }
      if (f.age < animationDuration(f.action)) return;
    }
    const airborne = f.y < 0 || f.vy < 0;
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    const crouched = f.action.startsWith('crouch');
    f.facing = other.x >= f.x ? 1 : -1;
    if (input.guard) {
      this.action(
        f,
        airborne ? 'airGuard' : input.crouch ? 'crouchGuard' : 'guard',
      );
      return;
    }
    if (input.jump && !previous.jump) {
      if (!airborne) {
        this.action(f, 'takeoff');
        f.vx = direction * 400 * SOURCE_VELOCITY_SCALE;
        return;
      }
      if (!f.doubleJumped) {
        f.doubleJumped = true;
        f.vx = direction * 400 * SOURCE_VELOCITY_SCALE;
        f.vy = 0;
        f.airAge = 0;
        this.action(f, 'doubleJump');
        return;
      }
    }
    const directionalDash = airborne
      ? direction !== 0 && !previous[direction === 1 ? 'right' : 'left']
      : doubleTap;
    if (
      ((input.dash && !previous.dash) || directionalDash) &&
      (!airborne || !f.airDashed)
    ) {
      const backwards = direction !== 0 && direction !== f.facing;
      this.action(
        f,
        airborne
          ? backwards
            ? 'airBackdash'
            : 'airDash'
          : backwards
            ? 'backdash'
            : 'dash',
      );
      if (airborne) f.airDashed = true;
      return;
    }
    if (input.drill && !previous.drill) {
      this.action(f, airborne ? 'airDrill' : 'drill', true);
      return;
    }
    if (!airborne && input.iori && !previous.iori) {
      this.action(f, 'iori', true);
      return;
    }
    if (!airborne && input.throw && !previous.throw) {
      this.action(f, 'grab', true);
      return;
    }
    if (
      !airborne &&
      input.axe &&
      !previous.axe &&
      !this.projectiles.some((p) => this.fighters[p.owner] === f)
    ) {
      this.action(f, 'axeThrow', true);
      return;
    }
    if (input.punch && !previous.punch) {
      this.action(
        f,
        airborne ? 'airPunch' : input.crouch ? 'crouchPunch' : 'punch',
        true,
      );
      return;
    }
    if (!airborne && input.hitUp && !previous.hitUp) {
      this.action(f, 'hitUp', true);
      return;
    }
    if (input.kick && !previous.kick) {
      this.action(
        f,
        airborne ? 'airKick' : input.crouch ? 'crouchKick' : 'kick',
        true,
      );
      return;
    }
    if (f.action === 'crouchEnter' && f.age < animationDuration('crouchEnter'))
      return;
    if (!airborne && crouched && !input.crouch) {
      this.action(f, 'stand');
      return;
    }
    if (!airborne && input.crouch) {
      this.action(f, crouched ? 'crouch' : 'crouchEnter');
      return;
    }
    if (!airborne) f.x = clampX(f.x + direction * 2.8);
    this.action(
      f,
      airborne
        ? (f.action === 'doubleJump' || f.action === 'hitUpJump') &&
          f.age < animationDuration(f.action)
          ? f.action
          : 'jump'
        : direction
          ? direction === f.facing
            ? 'walk'
            : 'backwalk'
          : 'idle',
    );
  }

  step(player: Input = {}, opponent?: Input) {
    if (this.resultReady) return;
    this.impacts = this.impacts.filter(
      (impact) => ++impact.age < animationDuration(impact.effect),
    );
    if (this.winner) {
      this.endingTicks++;
      let koStop = 0;
      this.fighters.forEach((f, index) => {
        if (f.hitStop > 0) {
          f.hitStop--;
          return;
        }
        f.age++;
        if (f.action === 'down') {
          // Action 60: PC 611 holds both fighters for 40 ticks. The four
          // opening displays total 14 action ticks, then PC 617 launches.
          if (f.age === 5) koStop += 40;
          if (f.age === 14) {
            f.vx = -f.facing * 500 * SOURCE_VELOCITY_SCALE;
            f.vy = -1520 * SOURCE_VELOCITY_SCALE;
            f.gravity = 90 * SOURCE_ACCELERATION_SCALE;
            f.airAge = 0;
          }
          if (f.age >= 14) {
            f.airAge++;
            gravity(f);
            if (f.y === 0) this.action(f, 'koLand');
          }
          return;
        }
        if (f.action === 'koLand') {
          // Action 62, PCs 641–644: ten ticks of backward slide, then rest.
          if (f.age <= 10)
            f.x = clampX(f.x - f.facing * 200 * SOURCE_VELOCITY_SCALE);
          return;
        }
        if (this.moveLaunch(f)) return;
        this.slideReaction(f);
        launchHitUpJump(f);
        if (f.y < 0 || f.vy < 0) {
          f.airAge++;
          gravity(f);
          if (f.y === 0 && f.action === 'thrown') this.action(f, 'knockdown');
          else if (f.y === 0 && f.hp > 0)
            this.action(f, aerialDrills.has(f.action) ? 'drillLand' : 'land');
        }
        this.recoverKnockdown(f);
        this.showResultPose(f, index);
      });
      // Apply together after frame entry so a double KO is iteration-independent.
      for (const f of this.fighters) f.hitStop += koStop;
      return;
    }
    this.ticks++;
    const inputs: [Input, Input] = [player, opponent ?? this.ai()];
    const frozen = this.fighters.map((f) => f.hitStop > 0);
    this.fighters.forEach((f, i) => {
      this.move(
        f,
        this.fighters[1 - i],
        inputs[i],
        this.previous[i],
        this.doubleTap(inputs[i], i),
      );
      if (
        !['idle', 'walk', 'backwalk', 'jump', 'doubleJump'].includes(f.action)
      )
        this.directionTaps[i] = null;
    });
    this.previous = [{ ...inputs[0] }, { ...inputs[1] }];
    const [a, b] = this.fighters;
    this.projectiles = this.projectiles.filter((p) => {
      p.age++;
      if (p.hit) return p.age < animationDuration('axeHit');
      p.x += p.facing * 7;
      return p.age < 180 && p.x >= -80 && p.x <= STAGE_WIDTH + 80;
    });
    this.fighters.forEach((f, owner) => {
      if (
        !frozen[owner] &&
        f.action === 'axeThrow' &&
        f.age === AXE_RELEASE_TICK
      )
        this.projectiles.push({
          owner,
          x: f.x + f.facing * 140,
          y: f.y - 140,
          facing: f.facing,
          age: 0,
          hit: false,
        });
    });
    // Hit immunity does not disable body separation during knockdown/get-up.
    // Only the held pair and the airborne throw may overlap.
    if (
      a.action !== 'grabbed' &&
      a.action !== 'thrown' &&
      b.action !== 'grabbed' &&
      b.action !== 'thrown' &&
      Math.abs(a.y - b.y) < 120 &&
      Math.abs(a.x - b.x) < 90
    ) {
      const sign = a.x <= b.x ? 1 : -1;
      const mid = Math.max(
        FIGHTER_MARGIN + 45,
        Math.min(STAGE_WIDTH - FIGHTER_MARGIN - 45, (a.x + b.x) / 2),
      );
      if (frozen[0] && !frozen[1]) b.x = clampX(a.x + sign * 90);
      else if (frozen[1] && !frozen[0]) a.x = clampX(b.x - sign * 90);
      else if (!frozen[0] && !frozen[1]) {
        a.x = mid - sign * 45;
        b.x = mid + sign * 45;
      }
    }
    // Collect contacts before applying them so same-tick attacks can trade.
    const contacts = this.fighters.flatMap((f, i) => {
      if (frozen[i] || !isAttack(f.action)) return [];
      const attack = ATTACKS[f.action];
      const cycle = multiHits[f.action];
      const airDrill = f.action === 'airDrillSpin';
      const activeAge = f.age - attack.startup;
      if (cycle && activeAge >= 0 && activeAge % cycle.interval === 0)
        f.connected = false;
      const finisher = airDrill
        ? f.airDrillStage === 3
        : !cycle || Math.floor(activeAge / cycle.interval) === cycle.count - 1;
      const count = cycle?.count ?? 1;
      const damage = airDrill
        ? AIR_DRILL_DAMAGE[f.airDrillStage]
        : Math.floor(attack.damage / count) +
          (finisher ? attack.damage % count : 0);
      const target = this.fighters[1 - i];
      if (protectedReactions.has(target.action)) return [];
      const blocked = guards.has(target.action) && target.facing !== f.facing;
      const response = hitResponses[f.action];
      const airborne = target.y < 0 || target.vy < 0;
      const reaction: AnimatedAction | null =
        f.action === 'hitUp' && !blocked
          ? airborne
            ? 'launchAway'
            : 'launchUp'
          : f.action === 'iori3' && !blocked
            ? airborne
              ? 'launchDown'
              : 'launchAway'
            : (f.action === 'iori' || f.action === 'iori2') && !airborne
              ? blocked
                ? target.action.startsWith('crouch')
                  ? 'crouchBlockStop'
                  : 'blockStop'
                : f.action === 'iori'
                  ? 'hitSlide'
                  : 'hitPull'
              : null;
      const heavy =
        response.kind === 'heavy' ||
        (f.action === 'punch2' && finisher && !blocked);
      const hitStop = airDrill
        ? 0
        : blocked
          ? response.kind === 'rapid'
            ? 0
            : 10
          : reaction === 'launchUp'
            ? 10
            : reaction === 'launchDown'
              ? 15
              : f.action === 'drill' && finisher
                ? 13
                : f.action === 'punch2' && finisher
                  ? 15
                  : response.stop;
      const distance = (target.x - f.x) * f.facing;
      return !f.connected &&
        f.age >= attack.startup &&
        f.age < attack.startup + attack.active &&
        (!cycle || activeAge % cycle.interval < cycle.active) &&
        distance >= 0 &&
        distance <= attack.range &&
        Math.abs(f.y - target.y) < 110
        ? [
            {
              f,
              target,
              damage,
              finisher,
              heavy,
              rapid: response.kind === 'rapid',
              hitStop,
              airDrill,
              reaction,
              facing: f.facing,
              x: target.x - f.facing * 42,
              y:
                GROUND +
                target.y -
                (f.action.startsWith('crouch') ||
                target.action.startsWith('crouch')
                  ? 75
                  : 145),
              projectile: null as Projectile | null,
              blocked,
            },
          ]
        : [];
    });
    for (const projectile of this.projectiles) {
      const f = this.fighters[projectile.owner];
      const target = this.fighters[1 - projectile.owner];
      if (
        !projectile.hit &&
        !protectedReactions.has(target.action) &&
        Math.abs(projectile.x - target.x) < 65 &&
        Math.abs(projectile.y - (target.y - 125)) < 90
      )
        contacts.push({
          f,
          target,
          damage: 16,
          finisher: true,
          heavy: true,
          rapid: false,
          // Action 227 selects FB on ground (no stop), strong hit in air.
          hitStop:
            guards.has(target.action) && target.facing !== projectile.facing
              ? 10
              : target.y < 0 || target.vy < 0
                ? 15
                : 0,
          airDrill: false,
          reaction: null,
          facing: projectile.facing,
          x: target.x - projectile.facing * 42,
          y: GROUND + projectile.y,
          projectile,
          blocked:
            guards.has(target.action) && target.facing !== projectile.facing,
        });
    }
    for (const {
      f,
      target,
      damage: strength,
      finisher,
      heavy,
      rapid,
      hitStop,
      reaction,
      facing,
      x,
      y,
      projectile,
      blocked,
    } of contacts) {
      if (projectile) {
        projectile.hit = true;
        projectile.age = 0;
      } else f.connected = true;
      const damage = blocked ? 0 : strength;
      target.hp = Math.max(0, target.hp - damage);
      f.damage += damage;
      f.hitStop += reaction === 'launchUp' ? 33 : hitStop;
      target.hitStop += hitStop;
      const airborne = target.y < 0 || target.vy < 0;
      if (blocked) {
        const blockReaction = rapid
          ? airborne
            ? 'airBlockRapid'
            : target.action.startsWith('crouch')
              ? 'crouchBlockRapid'
              : 'blockRapid'
          : airborne
            ? heavy
              ? 'airBlockHeavy'
              : 'airBlock'
            : target.action.startsWith('crouch')
              ? heavy
                ? 'crouchBlockHeavy'
                : 'crouchBlock'
              : heavy
                ? 'blockHeavy'
                : 'block';
        this.action(target, reaction ?? blockReaction, true);
      } else {
        f.hits++;
        this.action(
          target,
          target.hp === 0
            ? 'down'
            : reaction
              ? reaction
              : rapid
                ? airborne
                  ? 'airHitRapid'
                  : 'hitRapid'
                : airborne
                  ? heavy
                    ? 'airHitHeavy'
                    : 'airHit'
                  : heavy
                    ? 'hitHeavy'
                    : 'hit',
          true,
        );
      }
      if (target.hp === 0 || reaction) {
        // Scripted reactions stop incoming motion before their impact hold.
        target.vx = target.vy = 0;
        target.facing = facing === 1 ? -1 : 1;
      }
      if (finisher && target.hp > 0 && !reaction)
        target.x = clampX(target.x + facing * (blocked ? 8 : 22));
      this.impacts.push({
        x,
        y,
        age: 0,
        blocked,
        heavy,
        facing,
        effect: blocked ? 'guardSpark' : 'hitSpark',
      });
    }
    // Run contact branches after all hits: an interrupted aerial drill must not
    // apply its own stop or restart, regardless of fighter update order.
    for (const { f, target, airDrill, blocked, reaction } of contacts) {
      if (reaction && f.action === 'hitUp' && target.hp > 0) {
        const nextJump = f.nextJump;
        this.action(f, 'hitUpRecover');
        f.nextJump = nextJump;
      }
      if (airDrill && f.action === 'airDrillSpin') {
        f.hitStop += 8;
        target.hitStop += blocked ? 3 : 9;
        f.airDrillStage = Math.min(3, f.airDrillStage + 1);
        this.action(f, 'airDrillContact');
      }
    }
    this.resolveThrows(frozen);
    if (a.hp === 0 || b.hp === 0 || this.seconds === 0) {
      this.projectiles = [];
      this.winner =
        a.hp === b.hp ? 'draw' : a.hp > b.hp ? 'player' : 'opponent';
      this.fighters.forEach((f, index) => {
        // KO action 60, PC 607 adds ten stop ticks to the other fighter.
        if (f.action === 'down') this.fighters[1 - index].hitStop += 10;
      });
      this.fighters.forEach((f, index) => {
        if (f.action === 'grabbed') this.action(f, 'airHit');
        this.showResultPose(f, index);
      });
    }
  }
}

export class FixedClock {
  private remainder = 0;
  advance(deltaMs: number, tick: () => void) {
    // ponytail: discard long stalls after 250 ms; no background catch-up for a local match.
    this.remainder += Math.max(0, Math.min(250, deltaMs));
    while (this.remainder >= TICK_MS) {
      this.remainder -= TICK_MS;
      tick();
    }
  }
  reset() {
    this.remainder = 0;
  }
}
