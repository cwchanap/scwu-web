// Authored training partners for free practice. Each behavior only produces
// input, so the partner plays through the same rules as the player.
import { entriesOf } from './commands';
import { firstStrike } from './match';
import type { Fighter, Input } from './match';

export const DUMMY_BEHAVIORS = [
  'stand',
  'guard',
  'crouchGuard',
  'airGuard',
  'attack',
  'jumpIn',
  // The recovered CPU (cpu.ts), which the match plays itself.
  'cpu',
] as const;
export type DummyBehavior = (typeof DUMMY_BEHAVIORS)[number];

// P's ground action and K's air one, from the partner's command table.
const strike = (self: Fighter, opponent: Fighter, stance: 'near' | 'air') =>
  firstStrike(
    self.who,
    entriesOf(self.who)[stance === 'near' ? 18 : 19][stance],
    opponent.who,
  );
// Presses alternate with releases so that each one is fresh.
const press = (tick: number) => tick % 2 === 0;
const grounded = (f: Fighter) => f.y === 0 && f.vy === 0;
// Jump in from beyond this distance; closer, back away to try again.
const JUMP_IN_DISTANCE = 250;
const ATTACK_TICKS = 100;

export function dummyInput(
  behavior: Exclude<DummyBehavior, 'cpu'>,
  self: Fighter,
  opponent: Fighter,
  tick: number,
): Input {
  const distance = Math.abs(opponent.x - self.x);
  const toward = opponent.x > self.x ? 'right' : 'left';
  const away = toward === 'right' ? 'left' : 'right';
  switch (behavior) {
    case 'stand':
      return {};
    case 'guard':
      return { guard: true };
    case 'crouchGuard':
      return { guard: true, crouch: true };
    case 'airGuard':
      return grounded(self) ? { jump: press(tick) } : { guard: true };
    // The partner's P (entry 19) and air K (entry 20) time themselves by
    // their first boxes against the opponent's idle body.
    case 'attack':
      return {
        punch:
          self.action === 'idle' &&
          distance < strike(self, opponent, 'near').reach &&
          tick % ATTACK_TICKS === 0,
      };
    case 'jumpIn':
      // Kick so the strike comes out once the jump has closed within reach;
      // pushing bodies keep the jumper from landing any closer.
      if (!grounded(self)) {
        const { from, reach } = strike(self, opponent, 'air');
        return {
          kick:
            self.vy > 0 &&
            distance - from * Math.abs(self.vx) < reach &&
            press(tick),
        };
      }
      return distance > JUMP_IN_DISTANCE
        ? { [toward]: true, jump: press(tick) }
        : { [away]: true };
  }
}
