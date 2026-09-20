// Port of the handoff's verified StandingVM subset, not the full gameplay VM.
export interface Frame {
  pc: number;
  image: number;
  duration: number;
  dx: number;
  dy: number;
  flip_x: boolean;
  flip_y: boolean;
  ignore_facing: boolean;
  packed_image: number;
  extra_bytes: string;
}
export interface IdleProgram {
  start: number;
  end: number;
  records: number[][];
}

const u16 = (r: number[], i: number) => r[i] | (r[i + 1] << 8);
const s16 = (r: number[], i: number) => (u16(r, i) << 16) >> 16;

export function timingScale(speed: number) {
  if (!Number.isInteger(speed) || speed < 0 || speed > 20)
    throw new Error('Speed must be an integer from 0 to 20');
  return speed <= 10 ? 50 + 5 * speed : 10 * speed;
}

export function placement(
  frame: Frame,
  width: number,
  height: number,
  x: number,
  y: number,
  facingLeft: boolean,
) {
  const mirrored = facingLeft && !frame.ignore_facing;
  return {
    left:
      Math.trunc(x) +
      (mirrored
        ? Math.floor(width / 2) - frame.dx - width
        : frame.dx - Math.floor(width / 2)),
    top: Math.trunc(y) + frame.dy - height,
    flip_x: frame.flip_x !== mirrored,
    flip_y: frame.flip_y,
  };
}

export class StandingVM {
  pc: number;
  timer = 0;
  seed: number;
  scale: number;
  tickIndex = 0;
  ended = false;
  frame: Frame | null = null;
  variables: Record<number, number> = {};
  collisionRecords: Record<number, number | null> = {};
  color: number | null = null;
  events: (Frame & { tick: number; action: number })[] = [];
  branches: {
    tick: number;
    pc: number;
    random: number;
    remainder: number;
    taken: boolean;
  }[] = [];
  instructionTrace: {
    tick: number;
    action: number;
    pc: number;
    opcode: number;
  }[] = [];

  constructor(
    public program: IdleProgram,
    seed = 0,
    speed = 10,
  ) {
    if (
      !Number.isInteger(program.start) ||
      program.start < 0 ||
      program.end <= program.start ||
      program.end > program.records.length ||
      program.records.some(
        (r) =>
          r.length !== 16 ||
          r.some((b) => !Number.isInteger(b) || b < 0 || b > 255),
      )
    )
      throw new Error('Invalid idle program');
    this.pc = program.start;
    this.seed = seed >>> 0;
    this.scale = timingScale(speed);
  }

  private target(action: number, offset: number) {
    const pc = this.program.start + offset;
    if (action !== 1 || pc < this.program.start || pc >= this.program.end)
      throw new Error('Jump outside the supported standing action');
    this.pc = pc;
  }

  tick() {
    if (this.ended || this.timer < 0) return;
    this.timer -= 100;
    if (this.timer >= 0) {
      this.tickIndex++;
      return;
    }
    for (let steps = 0; ; steps++) {
      if (steps >= 299)
        throw new Error('Instruction budget exceeded before a display');
      if (this.pc >= this.program.end) {
        this.ended = true;
        break;
      }
      if (this.pc < this.program.start)
        throw new Error('PC precedes the current action');
      const pc = this.pc;
      const r = this.program.records[pc];
      const op = r[0];
      this.instructionTrace.push({
        tick: this.tickIndex,
        action: 1,
        pc,
        opcode: op,
      });
      if (op === 12) {
        const packed = u16(r, 3);
        this.frame = {
          pc,
          image: packed & 8191,
          duration: u16(r, 1),
          dx: s16(r, 5),
          dy: s16(r, 7),
          flip_x: Boolean(packed & 0x4000),
          flip_y: Boolean(packed & 0x8000),
          ignore_facing: Boolean(r[9] & 1),
          packed_image: packed,
          extra_bytes: r
            .slice(9)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(''),
        };
        this.timer = this.frame.duration
          ? this.timer + this.frame.duration * this.scale
          : -1;
        this.pc++;
        this.events.push({ tick: this.tickIndex, action: 1, ...this.frame });
        break;
      }
      if (op === 5 || op === 41) {
        this.ended = true;
        break;
      }
      if (op === 10) {
        if (u16(r, 1)) {
          this.target(u16(r, 1), r[3]);
          continue;
        }
      } else if (op === 32) {
        this.seed = (Math.imul(this.seed, 214013) + 2531011) >>> 0;
        const random = (this.seed >>> 16) & 32767;
        const remainder = random % (u16(r, 1) + 1);
        const taken = remainder > u16(r, 3) && u16(r, 6) !== 0;
        this.branches.push({
          tick: this.tickIndex,
          pc,
          random,
          remainder,
          taken,
        });
        if (taken) {
          this.target(u16(r, 6), r[8]);
          continue;
        }
      } else if (op === 31) {
        if (r[4] >> 6 === 3 || r[5] !== 1)
          throw new Error(`Unsupported variable operation at PC ${pc}`);
        this.variables[r[4]] = s16(r, 7);
      } else if (op === 25) {
        if (r[9] >= 20) throw new Error('Collision slot out of range');
        this.collisionRecords[r[9]] = u16(r, 5) && u16(r, 7) ? pc : null;
      } else if (op === 35) {
        if (r.slice(1, 6).some(Boolean))
          throw new Error('Only normal color is supported');
        this.color = 0;
      } else if (op === 37) {
        if (r[3] && r[4]) throw new Error('Animated effects are unsupported');
      } else if (op !== 0)
        throw new Error(`Unsupported opcode ${op} at PC ${pc}`);
      this.pc++;
    }
    if (!this.ended) this.tickIndex++;
  }
}
