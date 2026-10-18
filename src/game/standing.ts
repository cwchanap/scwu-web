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

// Held path 0x40d6a0..0x40d76d, taken while op 0x07 has set the victim's +0x40
// to -1 (0x41303a): offsets are from the image's corner, mirrored by the
// holder's facing XOR the record's flip_x, and negated with flip_y.
export function heldPlacement(
  frame: Frame,
  width: number,
  height: number,
  x: number,
  y: number,
  holderFacingLeft: boolean,
) {
  const mirrored = holderFacingLeft !== frame.flip_x;
  return {
    left: Math.trunc(x) + (mirrored ? -frame.dx - width : frame.dx),
    top: Math.trunc(y) + (frame.flip_y ? -frame.dy - height : frame.dy),
    flip_x: mirrored,
    flip_y: frame.flip_y,
  };
}

// MSVC rand (engine 0x417a22): the next 32-bit seed and its 15-bit result.
export function rand(seed: number): [number, number] {
  const next = (Math.imul(seed, 214013) + 2531011) >>> 0;
  return [next, (next >>> 16) & 32767];
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
  // The fighter's life (+0xdf05) for op 0x11, which the scene sets each tick.
  life?: number;
  collisionRecords: Record<number, number | null> = {};
  color: number | null = null;
  // Op 0x03 cues (0x4132c8) since the scene last played them: GIGI's idle
  // sounds its sound 8 in the half its roll picks (PC 24).
  sounds: number[] = [];
  // Op 0x09 calls: where each returns, its repeats left and its entry.
  calls: { ret: number; remaining: number; entry: number }[] = [];
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

  // `variables` seeds the player variables by selector (0x40 is variable 0).
  constructor(
    public program: IdleProgram,
    seed = 0,
    speed = 10,
    variables: Record<number, number> = {},
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
    this.variables = { ...variables };
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
        // Running out repeats a call at its entry or returns from it
        // (0x4125ea, 0x4126ae); with none, the action ends.
        const call = this.calls.at(-1);
        if (!call) {
          this.ended = true;
          break;
        }
        if (--call.remaining) this.pc = this.program.start + call.entry;
        else this.pc = this.calls.pop()!.ret;
        continue;
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
      } else if (op === 9) {
        // Op 0x09 (0x4129a9) calls r[2:4] r[1] times, entering at r[4]: ANMC
        // P's idle repeats its last three displays three times (PC 20).
        if (r[1]) {
          this.calls.push({ ret: pc + 1, remaining: r[1], entry: r[4] });
          this.target(u16(r, 2), r[4]);
          continue;
        }
      } else if (op === 32) {
        const [seed, random] = rand(this.seed);
        this.seed = seed;
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
        // A player variable's or global's test (r[5] bits 2-3: 1 ==, 2 >, 3
        // <) jumps to r[1:3] + r[3]: Chung's checks EX mode (variable 0 at
        // 100, PC 9), and ZAKU's and PAC-HELO's global 10 for 10 (PC 3), which
        // only KGT PCs 542 and 590 write, to 0, as an unseeded selector reads
        // here.
        const compare = (r[5] >> 2) & 3;
        if ((r[4] >> 6 === 1 || r[4] >> 6 === 2) && compare && !(r[5] & 3)) {
          const variable = this.variables[r[4]] ?? 0;
          const value = s16(r, 9);
          if (
            compare === 1
              ? variable === value
              : compare === 2
                ? variable > value
                : variable < value
          ) {
            this.target(u16(r, 1), r[3]);
            continue;
          }
        } else if (r[4] >> 6 === 3 || r[5] !== 1)
          throw new Error(`Unsupported variable operation at PC ${pc}`);
        else this.variables[r[4]] = s16(r, 7);
      } else if (op === 17) {
        // Op 0x11 (0x413164) jumps to r[2:4] + r[4] with life at or below
        // r[6:8] if r[5] bit 0, otherwise at or above it: SIN tires at 165
        // (PC 16), checked again each pass of his stance (PC 20).
        if (this.life === undefined)
          throw new Error(`Op 0x11 at PC ${pc} needs the fighter's life`);
        const value = u16(r, 6);
        if (r[5] & 1 ? this.life <= value : this.life >= value && u16(r, 2)) {
          this.target(u16(r, 2), r[4]);
          continue;
        }
      } else if (op === 3) {
        this.sounds.push(u16(r, 2));
      } else if (op === 4) {
        // Op 0x04 (0x412a7b) spawns and deletes objects, which the match runs
        // from the idle clip's events: DoraEmon's empties his slot 9 (PC 11).
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
