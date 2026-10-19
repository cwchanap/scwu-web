// Ports of the title (0x4080a0) and the character select screen (object
// type 10, 0x406fc0) as VS single (mode 1) runs it: their demos (T1 and T2,
// CHAR SELECT), the KGT cursors and each hovered player's select face, run
// from their raw records.
import { CHARACTERS } from './characters';
import type { Who } from './characters';
import type { Color } from './animations';
import type { Input } from './match';
import type { Frame } from './standing';
import ui from './generated/ui.json';
import select from './generated/select.json';
import t1 from './generated/t1.json';
import t2 from './generated/t2.json';

type Records = number[][];
type Program = Record<string, Records>;
// A demo's objects, records and header (export_demo).
interface Demo {
  objects: { action: number; z: number }[];
  actions: Program;
  flags: number;
  duration: number;
}
const DEMOS: Record<'select' | 't1' | 't2', Demo> = { select, t1, t2 };
export type SelectContainer = keyof typeof DEMOS | 'kgt' | Who;

const u16 = (r: number[], i: number) => r[i] | (r[i + 1] << 8);
const s16 = (r: number[], i: number) => (u16(r, i) << 16) >> 16;
const s8 = (r: number[], i: number) => (r[i] << 24) >> 24;

export const LAYOUT = ui.select;
// The players in file order (the KGT's 50 names): 43 B3–45 B5, 49 CPU-ZENKA
// and 50 CPU-ALPHA hold blank templates.
export const ROSTER: readonly (Who | null)[] = [
  'ryuko',
  'zoma',
  'kiki',
  'chung',
  'amiro',
  'anmc',
  'giant',
  'suneo',
  'yo',
  'sin',
  'lizard',
  'kay',
  'dido',
  'sakuya',
  'alex',
  'sou',
  'hiso',
  'erus',
  'feng',
  'sean',
  'gon',
  'kate',
  'remu',
  'rear',
  'gigi',
  'sww',
  'ogi',
  'ziro',
  'masa',
  'times',
  'zenka',
  'zmega',
  'alpha',
  'shinz',
  'zaku',
  'pachelo',
  'golf',
  'asura',
  'ttro',
  'astroman',
  'yinan',
  'aya',
  null,
  null,
  null,
  'dora',
  'rario',
  'training',
  null,
  null,
];
// A cell VS single lets a cursor rest on: a named player whose flag has bit 1
// (0x4079a0); SHIN-Z's has only bit 0 (story), DoraEmon's and the blanks'
// none.
export const selectable = (index: number) =>
  index >= 0 &&
  index < 50 &&
  LAYOUT.named[index] &&
  (LAYOUT.flags[index] & 2) !== 0 &&
  ROSTER[index] !== null;

const programs = (container: SelectContainer): Program =>
  container in DEMOS
    ? DEMOS[container as keyof typeof DEMOS].actions
    : container === 'kgt'
      ? LAYOUT.programs
      : (CHARACTERS[container as Who].select.actions as Program);

export interface SelectObject {
  container: SelectContainer;
  action: number;
  pc: number;
  // Ticks the display holds; Infinity for a zero-length one.
  timer: number;
  frame: Frame | null;
  displayed: boolean;
  // Source pixels.
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  facing: 1 | -1;
  z: number;
  color: Color;
  locals: Record<number, number>;
  alive: boolean;
  born: number;
  owner: number;
}
export interface Cue {
  container: SelectContainer;
  index: number;
}

// Raw velocities in source pixels a tick (SOURCE_VELOCITY_SCALE / 1.5).
const VELOCITY = 655 / 65536;
// 0x414770: a held direction repeats after 50 ticks (0x41e3fc), then every 5
// (0x41e400).
const REPEAT_DELAY = 50;
const REPEAT_INTERVAL = 5;
// The buttons that choose (0x407814): A–F.
const BUTTONS = 0x3f0;
// Where each cursor rests, kept from one visit to the next as the engine's
// statics at 0x424e50 and 0x424e58 are; both start on Ryuko's cell.
const remembered: [number, number][] = [
  [0, 0],
  [0, 0],
];

// A screen's objects, run from their records as the engine's objects are.
abstract class Screen {
  objects: SelectObject[] = [];
  // Op 0x1f's globals (0x4456b0), which the title's demos clear.
  globals: number[] = Array<number>(64).fill(0);
  sounds: Cue[] = [];
  protected tick = 0;

  step(input: Input = {}) {
    this.tick++;
    this.sounds = [];
    // 0x404d4c: the pass takes the objects alive at the tick's start by
    // priority; those spawned during it step next tick.
    const pass = this.objects
      .filter((o) => o.alive && o.born < this.tick)
      .sort((a, b) => a.z - b.z);
    for (const o of pass) if (o.alive) this.run(o);
    for (const o of pass) this.move(o);
    // The screen's own object runs at priority 0x7f, after them.
    this.control(input);
    this.objects = this.objects.filter((o) => o.alive);
  }

  protected abstract control(input: Input): void;

  // 0x406450 clears the screen's objects; 0x406790 makes the loaded demo's.
  protected load(demo: keyof typeof DEMOS) {
    for (const o of this.objects) o.alive = false;
    for (const { action, z } of DEMOS[demo].objects)
      this.spawn(demo, action, 0, 0, z);
    return DEMOS[demo];
  }

  protected spawn(
    container: SelectContainer,
    action: number,
    x: number,
    y: number,
    z: number,
    facing: 1 | -1 = 1,
    owner = -1,
    offset = 0,
  ) {
    const o: SelectObject = {
      container,
      action,
      pc: offset,
      timer: 0,
      frame: null,
      displayed: false,
      x,
      y,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      facing,
      z,
      color: { mode: 0, r: 0, g: 0, b: 0, fade: 0 },
      locals: {},
      alive: true,
      born: this.tick,
      owner,
    };
    this.objects.push(o);
    return o;
  }

  // One script step (0x4125fc) of an object's raw records.
  private run(o: SelectObject) {
    if (--o.timer > 0) return;
    const program = programs(o.container);
    for (let steps = 0; ; steps++) {
      if (steps >= 300)
        throw new Error(`Select ${o.container} ${o.action} runs no display`);
      const records = program[o.action];
      if (!records) throw new Error(`Select ${o.container} lacks ${o.action}`);
      // Running out restarts an object that has shown a display and deletes
      // one that hasn't (0x4127b7).
      if (o.pc >= records.length) {
        if (!o.displayed) {
          o.alive = false;
          return;
        }
        o.pc = 0;
        continue;
      }
      const r = records[o.pc++];
      switch (r[0]) {
        case 0x00:
        case 0x19:
        case 0x1e:
          break;
        case 0x0c: {
          const packed = u16(r, 3);
          o.frame = {
            pc: o.pc - 1,
            image: packed & 8191,
            duration: u16(r, 1),
            dx: s16(r, 5),
            dy: s16(r, 7),
            flip_x: (packed & 0x4000) !== 0,
            flip_y: (packed & 0x8000) !== 0,
            ignore_facing: (r[9] & 1) !== 0,
            packed_image: packed,
            extra_bytes: '',
          };
          o.displayed = true;
          o.timer = o.frame.duration || Infinity;
          return;
        }
        case 0x0a:
          if (u16(r, 1)) {
            o.action = u16(r, 1);
            o.pc = r[3];
          }
          break;
        case 0x1f:
          if (this.variable(o, r)) {
            o.action = u16(r, 1);
            o.pc = r[3];
          }
          break;
        case 0x03:
          this.sounds.push({ container: o.container, index: u16(r, 2) });
          break;
        case 0x23:
          o.color = {
            mode: r[1],
            r: s8(r, 2),
            g: s8(r, 3),
            b: s8(r, 4),
            fade: r[1] === 4 ? s8(r, 5) : 0,
          };
          break;
        case 0x01: {
          // r[9]: bit 0 adds; bits 1–4 keep vx, vy, ax and ay.
          const add = r[9] & 1 ? 1 : 0;
          if (!(r[9] & 2)) o.vx = add * o.vx + s16(r, 3) * VELOCITY;
          if (!(r[9] & 4)) o.vy = add * o.vy + s16(r, 5) * VELOCITY;
          if (!(r[9] & 8)) o.ax = add * o.ax + s16(r, 1) * VELOCITY;
          if (!(r[9] & 16)) o.ay = add * o.ay + s16(r, 7) * VELOCITY;
          break;
        }
        case 0x04:
          // The select face spawns its *NAME beside it, facing its way.
          if (u16(r, 2))
            this.spawn(
              o.container,
              u16(r, 2),
              o.x + o.facing * s16(r, 8),
              o.y + s16(r, 10),
              r[13] || o.z,
              o.facing,
              o.owner,
              r[4],
            );
          break;
        case 0x05:
          o.alive = false;
          return;
        default:
          throw new Error(
            `Select ${o.container} ${o.action} runs opcode ${r[0]}`,
          );
      }
    }
  }

  // Op 0x1f (0x4137a4) on an object's own variables (selector below 0x40)
  // and the globals (0x80 up): set (r[5] & 3 = 1) or add, clamped to ±30000
  // (2), then compare against r[9:11] (bits 2–3: 1 ==, 2 >, 3 <).
  private variable(o: SelectObject, r: number[]) {
    const kind = r[4] >> 6;
    if ((kind !== 0 && kind !== 2) || r[5] & 0x80)
      throw new Error(`Select ${o.container} ${o.action} reads ${r[4]}`);
    const store = kind ? this.globals : o.locals;
    const index = r[4] & 0x3f;
    const value = s16(r, 7);
    if ((r[5] & 3) === 1) store[index] = value;
    if ((r[5] & 3) === 2)
      store[index] = Math.max(
        -30000,
        Math.min(30000, (store[index] ?? 0) + value),
      );
    const current = store[index] ?? 0;
    const compare = (r[5] >> 2) & 3;
    const against = s16(r, 9);
    return (
      u16(r, 1) !== 0 &&
      (compare === 1
        ? current === against
        : compare === 2
          ? current > against
          : compare === 3 && current < against)
    );
  }

  // The motion pass: velocity, then acceleration, in source pixels.
  private move(o: SelectObject) {
    o.x += o.facing * o.vx;
    o.y += o.vy;
    o.vx += o.ax;
    o.vy += o.ay;
  }
}

export class CharacterSelect extends Screen {
  hover = [-1, -1];

  decided = [false, false];
  // The button each side chose with (0x406ee0), which picks its palette.
  palettes = [0, 0];
  // The palette each side's face draws with (player +0xe00b), −1 for palette
  // 0 until it chooses.
  drawn = [-1, -1];
  // Authored: one person drives the 1P cursor, then the 2P one.
  active = 0;
  done: [Who, Who] | null = null;
  private wait = 0;
  private cursors: SelectObject[] = [];
  private previous = [0, 0];
  private held = [0, 0];
  private countdown = [0, 0];

  constructor(private cells = remembered) {
    super();
  }

  protected control(input: Input) {
    if (this.tick === 1) this.open();
    this.choose(input);
  }

  // State 0 (0x40701f): the demo's objects (0x406790) and both cursors
  // (0x4071ae).
  private open() {
    this.load('select');
    this.cursors = [0, 1].map((p) =>
      this.spawn('kgt', LAYOUT.cursors[p], 0, 0, 0x65),
    );
  }

  // State 1, VS single (0x407782), for each side.
  private choose(input: Input) {
    const words = [0, 1].map((p) => (p === this.active ? word(input) : 0));
    const [pressed, directions] = this.read(words);
    for (const p of [0, 1]) {
      const cell = this.cells[p];
      const cursor = this.cursors[p];
      cursor.x = LAYOUT.origin[0] + LAYOUT.step[0] * cell[0];
      cursor.y = LAYOUT.origin[1] + LAYOUT.step[1] * cell[1];
      if (this.decided[p]) continue;
      if (this.hover[p] >= 0 && pressed[p] & BUTTONS) {
        // Any button chooses: the cursor gives way to its decided form.
        cursor.alive = false;
        this.cursors[p] = this.spawn(
          'kgt',
          LAYOUT.cursors[2 + p],
          cursor.x,
          cursor.y,
          0x65,
        );
        this.decided[p] = true;
        this.palettes[p] = buttonIndex(pressed[p]);
        this.drawn[p] = apart(this.palettes[p], this.drawn[1 - p]);
        // The 2P cursor takes over the keys as they are held, so the press
        // that chose isn't fresh for it too.
        if (p === 0) {
          this.active = 1;
          this.previous[1] = this.previous[0];
          this.held[1] = this.held[0];
          this.countdown[1] = this.countdown[0];
        }
        continue;
      }
      // 0x406e70 moves a cursor a cell at a time, wrapping at the edges.
      if (directions[p] & 4) this.moveCell(cell, 0, -1);
      if (directions[p] & 8) this.moveCell(cell, 0, 1);
      if (directions[p] & 1) this.moveCell(cell, -1, 0);
      if (directions[p] & 2) this.moveCell(cell, 1, 0);
      const index = LAYOUT.cols * cell[1] + cell[0];
      if (index === this.hover[p]) continue;
      // Leaving a cell clears its player (0x406520) for a tick; resting on a
      // selectable one stands its select face at the side's spot (0x4079ad).
      if (this.hover[p] !== -1) {
        for (const o of this.objects)
          if (o.owner === p && o.container !== 'kgt') o.alive = false;
        this.hover[p] = -1;
      } else if (selectable(index)) {
        this.hover[p] = index;
        const who = ROSTER[index]!;
        const [x, y] = LAYOUT.sides[p];
        this.spawn(who, CHARACTERS[who].selectFace, x, y, 0x50, p ? -1 : 1, p);
      }
    }
    if (!this.decided[0] || !this.decided[1] || this.done) return;
    // 0x407a94: then a hundred ticks before the battle.
    if (this.wait++ > 100)
      this.done = [ROSTER[this.hover[0]]!, ROSTER[this.hover[1]]!];
  }

  private moveCell(cell: [number, number], dx: number, dy: number) {
    cell[0] += dx;
    cell[1] += dy;
    if (cell[0] < 0) cell[0] = LAYOUT.cols - 1;
    if (cell[1] < 0) cell[1] = LAYOUT.rows - 1;
    if (cell[0] >= LAYOUT.cols) cell[0] = 0;
    if (cell[1] >= LAYOUT.rows) cell[1] = 0;
  }

  // 0x414770: fresh presses, and directions that repeat while held, without
  // retriggering an axis held across a change.
  private read(words: number[]) {
    const pressed = [0, 0];
    const directions = [0, 0];
    for (const p of [0, 1]) {
      const now = words[p];
      pressed[p] = (now ^ this.previous[p]) & now;
      this.previous[p] = now;
      if (now && now === this.held[p]) {
        if (--this.countdown[p] === 0) {
          directions[p] = now;
          this.countdown[p] = REPEAT_INTERVAL;
        }
        continue;
      }
      directions[p] = now;
      this.countdown[p] = REPEAT_DELAY;
      if (this.held[p] & 3) directions[p] &= ~3;
      if (this.held[p] & 0xc) directions[p] &= ~0xc;
      this.held[p] = now;
    }
    return [pressed, directions];
  }
}

// The title's menu (KGT system block): its cursor action, the modes
// 0x4438a4 allows and where the cursor stands for each.
export const TITLE = ui.title;
// The modes the menu lists: story, VS single and VS multi (0x408263).
export const MODES = ['story', 'vs', 'multi'] as const;
// The menu's place, kept from one visit to the next as the static at 0x424780
// is; it starts on story.
let place = 0;

// The title (0x4080a0) by its state (+0x152): 0 loads T1, 1 plays it, 2 loads
// T2, 3 waits for a press, 4 sets up the menu and 5 runs it.
export class Title extends Screen {
  state = 0;
  // The menu's modes, by MODES' index.
  items: number[] = [];
  // The mode chosen (0x470058).
  done: (typeof MODES)[number] | null = null;
  // Ticks before T1 reads presses (+0x156), whether a press may skip it
  // (+0x15a), and T2's countdown back to T1 (+0x15e).
  private wait = 0;
  private armed = false;
  private countdown = 0;
  // The loaded demo's flags (0x424f04) and ticks left (0x424f08).
  private flags = 0;
  private left = 0;
  private cursor: SelectObject | null = null;
  // A menu move or choice waits for every key to be let go (+8).
  private latch = false;
  private previous = 0;

  get place() {
    return place;
  }

  protected control(input: Input) {
    // 0x414770: the presses this tick (0x4280d8) and whether any key is held
    // (0x4cfa04).
    const now = word(input);
    const pressed = (now ^ this.previous) & now;
    this.previous = now;
    switch (this.state) {
      case 0:
        this.state = 1;
        this.play('t1');
        return;
      case 1:
        // 0x408122: ten ticks, then a fresh button skips a demo whose flag
        // allows it, else it runs its ticks out.
        if (this.wait < 10) {
          this.wait++;
          return;
        }
        if (this.flags & 1) {
          if (!(pressed & BUTTONS)) this.armed = true;
          else if (this.armed) this.state = 2;
          return;
        }
        if (this.left && --this.left === 0) this.state = 2;
        return;
      case 2:
        // 0x4081a6: T2, waiting for a press with 0x4438a4's bit 0x40.
        this.play('t2');
        this.countdown = this.left;
        this.state = TITLE.flags & 0x40 ? 3 : 4;
        return;
      case 3:
        if (pressed) this.state = 4;
        else if (this.countdown && --this.countdown === 0) this.restart();
        return;
      case 4:
        this.items = [4, 8, 0x10].flatMap((bit, mode) =>
          TITLE.flags & bit ? [mode] : [],
        );
        this.cursor = this.spawn('kgt', TITLE.cursor, 0, 0, 0x65);
        this.state = 5;
    }
    // 0x40830b: up or left moves up the menu, down or right down it, wrapping,
    // and a button chooses the mode under the cursor.
    const last = this.items.length - 1;
    if (!now) this.latch = false;
    else if (pressed & 5 && !this.latch) {
      place = place > 0 ? place - 1 : last;
      this.latch = true;
    } else if (pressed & 0xa && !this.latch) {
      place = place < last ? place + 1 : 0;
      this.latch = true;
    } else if (pressed & BUTTONS && !this.latch) {
      // Authored: only VS single is ported, so the others choose nothing.
      const mode = MODES[this.items[place]];
      if (mode === 'vs') this.done = mode;
    }
    [this.cursor!.x, this.cursor!.y] = TITLE.items[this.items[place]];
    // T2 lasts until a press, so no countdown returns the menu to T1.
    if (this.countdown && --this.countdown === 0) this.restart();
    if (now) this.countdown = this.left;
  }

  // 0x403fc0 loads a demo and 0x406790 makes its objects and reads its flags
  // and ticks.
  private play(demo: 't1' | 't2') {
    const { flags, duration } = this.load(demo);
    [this.flags, this.left] = [flags, duration];
  }

  private restart() {
    for (const o of this.objects) o.alive = false;
    this.state = 0;
  }
}

// The input word (0x414340): left 1, right 2, up 4, down 8, and the buttons
// A–D, E (bits 4–8).
function word(input: Input) {
  return (
    (input.left ? 1 : 0) |
    (input.right ? 2 : 0) |
    (input.jump ? 4 : 0) |
    (input.crouch ? 8 : 0) |
    (input.kick ? 0x10 : 0) |
    (input.hitUp ? 0x20 : 0) |
    (input.punch ? 0x80 : 0) |
    (input.throw ? 0x100 : 0)
  );
}
// 0x406ee0: the highest of A–F pressed.
function buttonIndex(pressed: number) {
  let index = 0;
  for (let bit = 0; bit < 6; bit++) if (pressed & (0x10 << bit)) index = bit;
  return index;
}
// 0x406f20 and 0x412056: a palette the other player holds moves on to the
// next of the eight.
const apart = (palette: number, other: number) =>
  palette === other ? (palette + 1) % 8 : palette;
// The battle sets each player's palette to its button (0x408a9f), and each
// fighter, player 1's first, moves off the other's as it enters (0x412056):
// the same button twice turns player 1's.
export function battlePalettes([first, second]: number[]) {
  const one = apart(first, second);
  return [one, apart(second, one)];
}
