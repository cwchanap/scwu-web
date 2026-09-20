// New MVP rules. These are intentionally separate from recovered idle semantics.
import { animationDuration } from './animations';
import type { Action } from './animations';
import { ROUND_END_TICKS } from './hud';
export type Control =
  'left' | 'right' | 'jump' | 'crouch' | 'punch' | 'kick' | 'guard';
export type Input = Partial<Record<Control, boolean>>;
export type Mode = 'practice' | 'cpu';
export const TICK_MS = 10;
export const WIDTH = 960;
export const HEIGHT = 720;
export const GROUND = 636;
export const ATTACKS = {
  punch: { startup: 7, active: 5, range: 145, damage: 8 },
  kick: { startup: 10, active: 7, range: 190, damage: 13 },
  crouchPunch: { startup: 14, active: 10, range: 175, damage: 8 },
  crouchKick: { startup: 18, active: 15, range: 195, damage: 13 },
  airPunch: { startup: 18, active: 19, range: 150, damage: 8 },
  airKick: { startup: 15, active: 24, range: 180, damage: 13 },
};
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
]);
const guards = new Set<Action>(['guard', 'crouchGuard', 'airGuard', ...blocks]);
const reactions = new Set<Action>([
  'hit',
  'hitHeavy',
  'airHit',
  'airHitHeavy',
  ...blocks,
]);
export interface Fighter {
  x: number;
  y: number;
  vy: number;
  hp: number;
  facing: -1 | 1;
  action: Action;
  age: number;
  airAge: number;
  connected: boolean;
  hits: number;
  damage: number;
}
export interface Impact {
  x: number;
  y: number;
  age: number;
  blocked: boolean;
}
const fighter = (x: number, facing: -1 | 1): Fighter => ({
  x,
  y: 0,
  vy: 0,
  hp: 100,
  facing,
  action: 'idle',
  age: 0,
  airAge: 0,
  connected: false,
  hits: 0,
  damage: 0,
});
const clampX = (x: number) => Math.max(65, Math.min(WIDTH - 65, x));
function gravity(f: Fighter) {
  f.vy += 0.24;
  f.y = Math.min(0, f.y + f.vy);
  if (f.y === 0) f.vy = 0;
}

export class Match {
  fighters: [Fighter, Fighter] = [fighter(300, 1), fighter(660, -1)];
  ticks = 0;
  winner: 'player' | 'opponent' | 'draw' | null = null;
  endingTicks = 0;
  impact: Impact | null = null;
  private previous: [Input, Input] = [{}, {}];

  constructor(public mode: Mode = 'practice') {}

  get seconds() {
    return this.mode === 'practice'
      ? Infinity
      : Math.max(0, 60 - Math.floor(this.ticks / 100));
  }

  get resultReady() {
    return this.winner !== null && this.endingTicks >= ROUND_END_TICKS;
  }

  private action(f: Fighter, action: Action, restart = false) {
    if (f.action === action && !restart) return;
    f.action = action;
    f.age = 0;
    f.connected = false;
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

  private move(f: Fighter, other: Fighter, input: Input, previous: Input) {
    f.age++;
    if (f.y < 0 || f.vy < 0) {
      f.airAge++;
      gravity(f);
      if (f.y === 0) {
        this.action(f, 'land');
        return;
      }
    }
    if (f.action === 'takeoff') {
      if (f.age < animationDuration('takeoff')) return;
      f.vy = -8.2;
      f.airAge = 0;
      this.action(f, 'jump');
      return;
    }
    if (
      f.action !== 'idle' &&
      (isAttack(f.action) ||
        reactions.has(f.action) ||
        ['land', 'stand'].includes(f.action)) &&
      f.age < animationDuration(f.action)
    )
      return;
    const airborne = f.y < 0 || f.vy < 0;
    const crouched = f.action.startsWith('crouch');
    f.facing = other.x >= f.x ? 1 : -1;
    if (input.guard) {
      this.action(
        f,
        airborne ? 'airGuard' : input.crouch ? 'crouchGuard' : 'guard',
      );
      return;
    }
    if (!airborne && input.jump && !previous.jump) {
      this.action(f, 'takeoff');
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
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    f.x = clampX(f.x + direction * 2.8);
    this.action(
      f,
      airborne
        ? 'jump'
        : direction
          ? direction === f.facing
            ? 'walk'
            : 'backwalk'
          : 'idle',
    );
  }

  step(player: Input = {}, opponent?: Input) {
    if (this.winner) {
      if (this.resultReady) return;
      this.endingTicks++;
      this.fighters.forEach((f) => {
        f.age++;
        if (f.y < 0 || f.vy < 0) gravity(f);
      });
      if (this.impact && ++this.impact.age > 14) this.impact = null;
      return;
    }
    this.ticks++;
    if (this.impact && ++this.impact.age > 14) this.impact = null;
    const inputs: [Input, Input] = [player, opponent ?? this.ai()];
    this.fighters.forEach((f, i) =>
      this.move(f, this.fighters[1 - i], inputs[i], this.previous[i]),
    );
    this.previous = [{ ...inputs[0] }, { ...inputs[1] }];
    const [a, b] = this.fighters;
    // Separate grounded bodies, including at the edges of the court.
    if (Math.abs(a.y - b.y) < 120 && Math.abs(a.x - b.x) < 90) {
      const sign = a.x <= b.x ? 1 : -1;
      const mid = Math.max(110, Math.min(WIDTH - 110, (a.x + b.x) / 2));
      a.x = mid - sign * 45;
      b.x = mid + sign * 45;
    }
    // Collect contacts before applying them so same-tick attacks can trade.
    const contacts = this.fighters.flatMap((f, i) => {
      if (!isAttack(f.action)) return [];
      const attack = ATTACKS[f.action];
      const target = this.fighters[1 - i];
      const distance = (target.x - f.x) * f.facing;
      return !f.connected &&
        f.age >= attack.startup &&
        f.age < attack.startup + attack.active &&
        distance >= 0 &&
        distance <= attack.range &&
        Math.abs(f.y - target.y) < 110
        ? [
            {
              f,
              target,
              attack,
              blocked: guards.has(target.action) && target.facing !== f.facing,
            },
          ]
        : [];
    });
    for (const { f, target, attack, blocked } of contacts) {
      f.connected = true;
      const damage = blocked ? 0 : attack.damage;
      target.hp = Math.max(0, target.hp - damage);
      f.damage += damage;
      const airborne = target.y < 0 || target.vy < 0;
      const heavy = damage >= 13 || (blocked && attack.damage >= 13);
      if (blocked) {
        const reaction = airborne
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
        this.action(target, reaction, true);
      } else {
        f.hits++;
        this.action(
          target,
          target.hp === 0
            ? 'down'
            : airborne
              ? heavy
                ? 'airHitHeavy'
                : 'airHit'
              : heavy
                ? 'hitHeavy'
                : 'hit',
          true,
        );
        if (target.hp === 0) target.vy = -3.5;
      }
      target.x = clampX(target.x + f.facing * (blocked ? 8 : 22));
      this.impact = {
        x: (f.x + target.x) / 2,
        y: GROUND + target.y - 125,
        age: 0,
        blocked,
      };
    }
    if (a.hp === 0 || b.hp === 0 || this.seconds === 0) {
      this.winner =
        a.hp === b.hp ? 'draw' : a.hp > b.hp ? 'player' : 'opponent';
      this.fighters.forEach((f, index) => {
        if (f.hp === 0) return;
        this.action(
          f,
          this.winner === 'draw'
            ? 'draw'
            : (this.winner === 'player') === (index === 0)
              ? 'win'
              : 'lose',
        );
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
