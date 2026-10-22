// Ports of the title (0x4080a0), the character select screen (object type
// 10, 0x406fc0) as VS single (mode 1), VS multi (2) and story mode (0) run
// it, a story's demos (type 16, 0x406c10) and the continue screen (13,
// 0x4084f0): their demos (T1 and T2, CHAR SELECT, TEAM VS, the story's,
// CONTINUE), the KGT cursors and each hovered player's select face, run from
// their raw records.
import { CHARACTERS } from './characters';
import type { Who } from './characters';
import type { Color } from './animations';
import type { Input } from './match';
import { rand } from './standing';
import type { Frame } from './standing';
import ui from './generated/ui.json';
import select from './generated/select.json';
import t1 from './generated/t1.json';
import t2 from './generated/t2.json';

type Records = number[][];
type Program = Record<string, Records>;
// A demo's objects, records and header (export_demo).
export interface Demo {
  objects: { action: number; z: number }[];
  actions: Program;
  flags: number;
  duration: number;
}
const DEMOS: Record<'select' | 't1' | 't2', Demo> = { select, t1, t2 };
// A story's demos load as they play (scene.ts), each its own container.
export type SelectContainer =
  keyof typeof DEMOS | `demo${number}` | 'kgt' | Who;

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
// none. Story mode asks for bit 0 (0x407c5c).
export const selectable = (index: number, bit = 2) =>
  index >= 0 &&
  index < 50 &&
  LAYOUT.named[index] &&
  (LAYOUT.flags[index] & bit) !== 0 &&
  ROSTER[index] !== null;

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
  // Op 0x0b's return (+0x85), and op 0x09's: the action it runs, the times
  // left and the return (+0x7c, +0x7d, +0x81); each an action and offset.
  single: [number, number] | null;
  call: { left: number; to: [number, number]; back: [number, number] } | null;
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
// statics at 0x424e50 and 0x424e58 are, and story mode's at 0x424e68; all
// start on Ryuko's cell.
const remembered: [number, number][] = [
  [0, 0],
  [0, 0],
];
const storyRemembered: [number, number][] = [[0, 0]];
// VS multi (TEAM VS) plays the KGT's demo 11 (0x44389f) in CHAR SELECT's
// place, and each side picks GAME.INI's Editor.TestPlay.VSTeamPlay players
// (3: 0x430128, 0x40707c).
export const TEAM_DEMO = 11;
export const TEAM_SIZE = 3;

// A screen's objects, run from their records as the engine's objects are.
abstract class Screen {
  objects: SelectObject[] = [];
  // Op 0x1f's globals (0x4456b0), which the title's demos clear.
  globals: number[] = Array<number>(64).fill(0);
  sounds: Cue[] = [];
  protected tick = 0;
  // The rand op 0x20 rolls (0x417a22). Authored: each screen seeds its own;
  // the engine shares one with everything.
  protected seed = 0;

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
  protected load(
    container: SelectContainer,
    demo = DEMOS[container as keyof typeof DEMOS],
  ) {
    for (const o of this.objects) o.alive = false;
    for (const { action, z } of demo.objects)
      this.spawn(container, action, 0, 0, z);
    return demo;
  }

  protected programs(container: SelectContainer): Program {
    if (container in DEMOS)
      return DEMOS[container as keyof typeof DEMOS].actions;
    if (container === 'kgt') return LAYOUT.programs;
    return CHARACTERS[container as Who].select.actions as Program;
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
      single: null,
      call: null,
    };
    this.objects.push(o);
    return o;
  }

  // One script step (0x4125fc) of an object's raw records.
  private run(o: SelectObject) {
    if (--o.timer > 0) return;
    const program = this.programs(o.container);
    for (let steps = 0; ; steps++) {
      if (steps >= 300)
        throw new Error(`Select ${o.container} ${o.action} runs no display`);
      const records = program[o.action];
      if (!records) throw new Error(`Select ${o.container} lacks ${o.action}`);
      // Running out returns from a single call, runs a call again until its
      // times are up and then returns (0x412625), and otherwise ends the
      // object: these restart action 0 (+0x34, which their spawns leave 0),
      // whose one empty record runs out again until the 300-step limit
      // deletes them (0x4127b7, 0x413b7b), or delete one that showed nothing.
      if (o.pc >= records.length) {
        if (o.single) {
          [o.action, o.pc] = o.single;
          o.single = null;
        } else if (o.call) {
          [o.action, o.pc] = --o.call.left ? o.call.to : o.call.back;
          if (!o.call.left) o.call = null;
        } else {
          o.alive = false;
          return;
        }
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
        // Op 0x09 runs action r[2:4] from r[4], r[1] times; op 0x0b runs
        // r[1:3] from r[3] once (0x4129a9, 0x412a2f).
        case 0x09:
          if (r[1] && u16(r, 2)) {
            const to: [number, number] = [u16(r, 2), r[4]];
            o.call = { left: r[1], to, back: [o.action, o.pc] };
            [o.action, o.pc] = to;
          }
          break;
        case 0x0b:
          if (u16(r, 1)) {
            o.single = [o.action, o.pc];
            [o.action, o.pc] = [u16(r, 1), r[3]];
          }
          break;
        // 0x4139a3: a roll of rand % (r[1:3] + 1) above r[3:5] jumps to
        // r[6:8] at r[8].
        case 0x20: {
          const [seed, value] = rand(this.seed);
          this.seed = seed;
          if (value % (u16(r, 1) + 1) > u16(r, 3) && u16(r, 6))
            [o.action, o.pc] = [u16(r, 6), r[8]];
          break;
        }
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
  // The palette each seat's face draws with (player +0xe00b), −1 for palette
  // 0 until it chooses: VS's side's own, TEAM VS's 4 × side + the member it
  // picked, or + 3 for the player its cursor rests on.
  drawn = Array<number>(8).fill(-1);
  // TEAM VS's picks by side (0x47006c + 16 × side, counted by 0x4700ec).
  members: number[][] = [[], []];
  // Authored: one person drives the 1P cursor, then the 2P one.
  active = 0;
  // The pair chosen; story mode's 1P, twice.
  done: [Who, Who] | null = null;
  private wait = 0;
  private cursors: SelectObject[] = [];
  private previous = [0, 0];
  private held = [0, 0];
  private countdown = [0, 0];
  private cells: [number, number][];
  // Story mode (0x407ad6) moves the 1P cursor alone over the players whose
  // flag has bit 0.
  private sides: number[];

  constructor(
    cells?: [number, number][],
    readonly story = false,
    // TEAM VS's demo, which the scene loads first.
    readonly team: Demo | null = null,
  ) {
    super();
    this.cells = cells ?? (story ? storyRemembered : remembered);
    this.sides = story ? [0] : [0, 1];
  }

  // Each side's picks and the palettes their seats took (0x47011c).
  get teams() {
    return this.members.map((picks, p) =>
      picks.map((index, k) => ({
        who: ROSTER[index]!,
        palette: this.drawn[4 * p + k],
      })),
    );
  }

  protected programs(container: SelectContainer) {
    return this.team && container === `demo${TEAM_DEMO}`
      ? this.team.actions
      : super.programs(container);
  }

  protected control(input: Input) {
    if (this.tick === 1) this.open();
    this.choose(input);
  }

  // State 0 (0x40701f): the demo's objects (0x406790) and both cursors
  // (0x4071ae), or story mode's 1P one (0x407207).
  private open() {
    if (this.team) this.load(`demo${TEAM_DEMO}`, this.team);
    else this.load('select');
    this.cursors = this.sides.map((p) =>
      this.spawn('kgt', LAYOUT.cursors[p], 0, 0, 0x65),
    );
  }

  // State 1, VS single (0x407782), for each side, or story mode's: a button
  // chooses the player under the cursor, else the cursor moves. VS multi
  // (0x4072c1) moves first and then picks there, a member at a time.
  private choose(input: Input) {
    const words = [0, 1].map((p) => (p === this.active ? word(input) : 0));
    const [pressed, directions] = this.read(words);
    for (const p of this.sides) {
      const cell = this.cells[p];
      const cursor = this.cursors[p];
      cursor.x = LAYOUT.origin[0] + LAYOUT.step[0] * cell[0];
      cursor.y = LAYOUT.origin[1] + LAYOUT.step[1] * cell[1];
      if (this.decided[p]) continue;
      if (this.team) {
        if (this.rest(p, directions[p]) && pressed[p] & BUTTONS)
          this.pick(p, pressed[p]);
      } else if (this.hover[p] >= 0 && pressed[p] & BUTTONS) {
        // Any button chooses.
        this.palettes[p] = buttonIndex(pressed[p]);
        takePalette(this.drawn, p, this.palettes[p]);
        this.decide(p);
      } else this.rest(p, directions[p]);
    }
    if (this.sides.some((p) => !this.decided[p]) || this.done) return;
    // 0x407a94: then a hundred ticks before the battle, or story mode's
    // first step (0x407b1f); VS multi's first members (0x40772a).
    if (this.wait++ > 100)
      this.done = this.team
        ? [ROSTER[this.members[0][0]]!, ROSTER[this.members[1][0]]!]
        : [ROSTER[this.hover[0]]!, ROSTER[this.hover[this.sides.at(-1)!]]!];
  }

  // 0x406e70 moves a cursor a cell at a time, wrapping at the edges. Leaving
  // a cell clears its player (0x406520) for a tick; resting on a selectable
  // one stands its select face at the side's spot (0x4079ad), as its seat's
  // player (VS multi's 4 × side + 3, 0x40746b). Whether it rests on one.
  private rest(p: number, directions: number) {
    const cell = this.cells[p];
    if (directions & 4) this.moveCell(cell, 0, -1);
    if (directions & 8) this.moveCell(cell, 0, 1);
    if (directions & 1) this.moveCell(cell, -1, 0);
    if (directions & 2) this.moveCell(cell, 1, 0);
    const index = LAYOUT.cols * cell[1] + cell[0];
    if (index === this.hover[p]) return true;
    const seat = this.team ? 4 * p + 3 : p;
    if (this.hover[p] !== -1) {
      for (const o of this.objects)
        if (o.owner === seat && o.container !== 'kgt') o.alive = false;
      this.hover[p] = -1;
      return false;
    }
    if (!selectable(index, this.story ? 1 : 2)) return false;
    this.hover[p] = index;
    const who = ROSTER[index]!;
    const [x, y] = LAYOUT.sides[p];
    this.spawn(who, CHARACTERS[who].selectFace, x, y, 0x50, p ? -1 : 1, seat);
    return true;
  }

  // VS multi's button (0x40754c) seats the player as the side's next member
  // in its button's palette (0x406f20). Each member but the last stands its
  // face above the side's spot, the further up the more are left to pick
  // (0x40760d); the last decides.
  private pick(p: number, pressed: number) {
    const picks = this.members[p];
    const seat = 4 * p + picks.length;
    picks.push(this.hover[p]);
    takePalette(this.drawn, seat, buttonIndex(pressed));
    const left = TEAM_SIZE - picks.length;
    if (!left) return this.decide(p);
    const who = ROSTER[this.hover[p]]!;
    const [x, y] = LAYOUT.sides[p];
    const [dx, dy] = LAYOUT.members[p];
    this.spawn(
      who,
      CHARACTERS[who].selectFace,
      x + dx * left,
      y + dy * left,
      0x50 + left,
      p ? -1 : 1,
      seat,
    );
  }

  // The cursor gives way to its decided form (0x407834).
  private decide(p: number) {
    const cursor = this.cursors[p];
    cursor.alive = false;
    this.cursors[p] = this.spawn(
      'kgt',
      LAYOUT.cursors[2 + p],
      cursor.x,
      cursor.y,
      0x65,
    );
    this.decided[p] = true;
    // The 2P cursor takes over the keys as they are held, so the press that
    // chose isn't fresh for it too.
    if (p === 0) {
      this.active = 1;
      this.previous[1] = this.previous[0];
      this.held[1] = this.held[0];
      this.countdown[1] = this.countdown[0];
    }
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
    } else if (pressed & BUTTONS && !this.latch)
      this.done = MODES[this.items[place]];
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

// A story step's demo (object type 16, 0x406c10). Its first step loads it
// (0x403fc0) and makes its objects (0x406790); from then on its ticks (0
// for until a press) run out, and ten ticks on a fresh button skips one
// whose flag allows it (bit 0) once a tick has passed without one. The step
// after, the story runs on (state 2).
export class StoryDemo extends Screen {
  done = false;
  private state = 0;
  private wait = 0;
  private armed = false;
  private left = 0;
  private previous = 0;

  constructor(
    readonly index: number,
    private demo: Demo,
    seed = 0,
  ) {
    super();
    this.seed = seed;
  }

  protected programs(container: SelectContainer) {
    return container === `demo${this.index}`
      ? this.demo.actions
      : super.programs(container);
  }

  protected control(input: Input) {
    const now = word(input);
    const pressed = (now ^ this.previous) & now;
    this.previous = now;
    if (this.state === 2) {
      this.done = true;
      return;
    }
    if (this.state === 0) {
      this.state = 1;
      this.left = this.load(`demo${this.index}`, this.demo).duration;
    }
    if (this.wait < 10) this.wait++;
    else if (this.demo.flags & 1) {
      if (!(pressed & BUTTONS)) this.armed = true;
      else if (this.armed) {
        this.state = 2;
        return;
      }
    }
    if (this.left && --this.left === 0) this.state = 2;
  }
}

// The continue screen (object type 13, 0x4084f0): CONTINUE (the demo at
// 0x4438a0, whose ticks it doesn't count) and its cursor (KGT 81,
// 0x44524a), which stands where YES's or NO's action's first record says
// (82, 83: 0x44524c, 0x44524e). With a key held, a fresh direction turns
// it over or a fresh button chooses, once every key was let go since; yes
// runs the battle again (0x408585), no returns to the title.
export const CONTINUE = ui.continue;
export class Continue extends Screen {
  done: 'yes' | 'no' | null = null;
  choice = 0;
  private cursor: SelectObject | null = null;
  private latch = false;
  private previous = 0;

  constructor(private demo: Demo) {
    super();
  }

  protected programs(container: SelectContainer) {
    return container === 'demo9'
      ? this.demo.actions
      : super.programs(container);
  }

  protected control(input: Input) {
    const now = word(input);
    const pressed = (now ^ this.previous) & now;
    this.previous = now;
    if (!this.cursor) {
      this.load('demo9', this.demo);
      this.cursor = this.spawn('kgt', CONTINUE.cursor, 0, 0, 0x65);
      return;
    }
    if (!now) this.latch = false;
    else if (pressed & 0xf && !this.latch) {
      this.choice ^= 1;
      this.latch = true;
    } else if (pressed & BUTTONS && !this.latch) {
      this.done = this.choice ? 'no' : 'yes';
      return;
    }
    [this.cursor.x, this.cursor.y] = CONTINUE.items[this.choice];
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
// 0x406f20 and 0x412056: a palette any other of the eight seats holds
// (player +0xe00b) moves on to the next of the eight, and the seat takes it.
export function takePalette(held: number[], seat: number, palette: number) {
  while (held.some((other, i) => i !== seat && other === palette))
    palette = (palette + 1) % 8;
  held[seat] = palette;
}
// The battle sets each player's palette to its button (0x40789a, 0x408a9f),
// or in VS multi to the one its member's seat took (0x407577), and each
// fighter, player 1's first, moves off the other's as it enters (0x412056):
// the same button twice turns player 1's.
export function battlePalettes(buttons: number[]) {
  const held = [...buttons];
  buttons.forEach((palette, seat) => takePalette(held, seat, palette));
  return held;
}
