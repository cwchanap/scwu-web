// Port of the engine's CPU (routine 0x411270, control type 1 at 0x4112f9),
// driven by the character's CPU table. It only produces input, so the CPU plays
// through the same rules as the player.
import data from './generated/assets.json';
import type { Control, Fighter, Input } from './match';
import { rand } from './standing';

export interface CpuStep {
  direction: number;
  command: number;
  duration: number;
}
export interface CpuEntry {
  flags: number;
  probability: number;
  min: number;
  max: number;
  steps: CpuStep[];
}
// Ryuko's table: 100 slots of 111 bytes after the held-pose table, 43 used.
export const RYUKO_CPU: readonly CpuEntry[] = data.cpu;
// Authored: the Vs. level comes from the story setup (+0xdf61), not recovered.
export const CPU_LEVEL = 50;
// The scan draws a roll for every slot, used or not.
const SLOTS = 100;
// Tables 0x41f138/0x41f178 by direction nibble. The mirrored one applies when
// the CPU is right of its opponent, so F is always toward them.
const DIRECTIONS = [
  '',
  '',
  'F',
  'DF',
  'D',
  'DB',
  'B',
  'UB',
  'U',
  'UF',
  'B',
  'U',
  'F',
  'D',
  '',
  '',
];
// Ryuko's command table (1-based) as the port's single-button controls, with
// the direction a jump or dash command carries.
const COMMANDS: Record<number, [Control, string?]> = {
  1: ['changeAttack'],
  2: ['megaBeam'],
  3: ['musashi'],
  4: ['getterBeam'],
  5: ['blackRush'],
  6: ['axe'],
  7: ['dst'],
  8: ['drill'],
  9: ['iori'],
  10: ['jump'],
  11: ['jump', 'F'],
  12: ['jump', 'B'],
  13: ['dash'],
  14: ['dash', 'B'],
  17: ['hitUp'],
  18: ['throw'],
  19: ['punch'],
  20: ['kick'],
  22: ['cpuIori'],
};
type Body = Pick<Fighter, 'x' | 'y'>;
const airborne = (f: Body) => f.y < 0;

export class CpuVM {
  // Player +0xdf7d (decision timer), +0xdf75 (active entry), +0xdf81 (step)
  // and +0xdf79 (step timer).
  private timer = 0;
  private entry: CpuEntry | null = null;
  private step = -1;
  private stepTimer = 0;
  private last: Input = {};

  constructor(
    private entries: readonly CpuEntry[] = RYUKO_CPU,
    public level = CPU_LEVEL,
    public seed = 0,
  ) {}

  // Authored: the engine shares one rand seed with everything; the CPU keeps
  // its own.
  private random() {
    const [seed, value] = rand(this.seed);
    this.seed = seed;
    return value;
  }

  input(self: Body, opponent: Body): Input {
    if (!this.entry) {
      if (!this.level || --this.timer > 0) return this.emit({});
      this.timer = (this.random() % (101 - this.level)) - this.level + 50;
      // Source pixels: the arena draws the source at 1.5x.
      const distance = Math.floor(Math.abs(self.x - opponent.x) / 1.5);
      for (let slot = 0; slot < SLOTS; slot++) {
        const roll = this.random() % 100;
        const entry = this.entries[slot];
        if (
          entry &&
          roll < entry.probability &&
          distance >= entry.min &&
          distance <= entry.max &&
          Boolean(entry.flags & 1) === airborne(self) &&
          Boolean(entry.flags & 2) === airborne(opponent)
        ) {
          this.entry = entry;
          this.step = -1;
          this.stepTimer = 0;
        }
      }
    }
    if (this.entry && --this.stepTimer < 0) {
      this.step++;
      const duration = this.entry.steps[this.step]?.duration ?? 0;
      if (this.step >= this.entry.steps.length) this.entry = null;
      // Drawn even as the entry ends.
      this.stepTimer = duration + (this.random() % (101 - this.level));
    }
    if (!this.entry) return this.emit({});
    return this.emit(
      this.stepInput(this.entry.steps[this.step], self, opponent),
    );
  }

  // 0x40f3a2: a CPU victim ignores its input and guards on rand % 100 < level.
  guards() {
    return this.random() % 100 < this.level;
  }

  // A step holds its direction, and a command step adds its command, as
  // 0x411644 adds the step's direction to the command's input. The engine
  // clears the CPU's input history every tick (0x403300) and rewrites the
  // command, so a command step re-enters it each tick; a port button needs a
  // release to count again, so it presses on alternate ticks (authored).
  private stepInput(step: CpuStep, self: Body, opponent: Body): Input {
    const toward = self.x > opponent.x ? 'left' : 'right';
    const away = toward === 'left' ? 'right' : 'left';
    const input: Input = {};
    const hold = (direction = '') => {
      if (direction.includes('F')) input[toward] = true;
      if (direction.includes('B')) input[away] = true;
      if (direction.includes('U')) input.jump = true;
      if (direction.includes('D')) input.crouch = true;
    };
    hold(DIRECTIONS[step.direction]);
    const command = COMMANDS[step.command];
    if (command) {
      const [control, direction] = command;
      hold(direction);
      input[control] = !this.last[control];
    }
    return input;
  }

  private emit(input: Input) {
    this.last = input;
    return input;
  }
}
