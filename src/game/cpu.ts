// Port of the engine's CPU (routine 0x411270, control type 1 at 0x4112f9),
// driven by the character's CPU table. It only produces input, so the CPU plays
// through the same rules as the player.
import type { Who } from './characters';
import { CONTROLS } from './commands';
import data from './generated/assets.json';
import zoma from './generated/zoma.json';
import kiki from './generated/kiki.json';
import chung from './generated/chung.json';
import amiro from './generated/amiro.json';
import anmc from './generated/anmc.json';
import giant from './generated/giant.json';
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
// Ryuko's table: 100 slots of 111 bytes after the held-pose table, 43 used;
// Zoma's uses 44, Kiki's 43, Chung's 40, Amiro's 37, ANMC P's 45, Giant's 43.
export const RYUKO_CPU: readonly CpuEntry[] = data.cpu;
export const CPU_TABLES: Record<Who, readonly CpuEntry[]> = {
  ryuko: RYUKO_CPU,
  zoma: zoma.cpu,
  kiki: kiki.cpu,
  chung: chung.cpu,
  amiro: amiro.cpu,
  anmc: anmc.cpu,
  giant: giant.cpu,
};
// Ryuko's CPU presses the port's keys for its commands (authored); the
// others', with no keys for their CPU commands (Zoma's dashes, entries 22-24,
// Kiki's K' 18-20, Chung's cpu jump 21, Amiro's cpu mornign 20 and ANMC P's
// cpu dash and cpu DJ 19-20), write every command into their history as the
// engine does (0x4115e3).
export const CPU_CONTROLS: Record<Who, Record<number, [Control, string?]>> = {
  ryuko: CONTROLS,
  zoma: {},
  kiki: {},
  chung: {},
  amiro: {},
  anmc: {},
  giant: {},
};
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
    private controls = CONTROLS,
  ) {}

  // Authored: the engine shares one rand seed with everything; the CPU keeps
  // its own, and the match draws its other rolls from it.
  random() {
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
  // clears the CPU's input history every time it runs (0x403300) and
  // rewrites the command, so a command step re-enters it each time; a port
  // button needs a release to count again, so it presses every other time
  // (authored). A command without a key goes to the match to write.
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
    const command = this.controls[step.command];
    if (command) {
      const [control, direction] = command;
      hold(direction);
      input[control] = !this.last[control];
    } else if (step.command) input.command = step.command;
    return input;
  }

  private emit(input: Input) {
    this.last = input;
    return input;
  }
}
