import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  battlePalettes,
  CharacterSelect,
  Continue,
  CONTINUE,
  LAYOUT,
  MODES,
  ROSTER,
  selectable,
  StoryDemo,
  TEAM_SIZE,
  Title,
  TITLE,
} from './select';
import type { Demo } from './select';
import type { Input } from './match';
import continueDemo from './generated/demos/9.json';
import next from './generated/demos/3.json';
import ending from './generated/demos/22.json';
import yinanEnd from './generated/demos/87.json';
import teamDemo from './generated/demos/11.json';

const fresh = () =>
  new CharacterSelect([
    [0, 0],
    [0, 0],
  ]);
const run = (select: { step(input: Input): void }, inputs: Input[]) => {
  for (const input of inputs) select.step(input);
};
const tap = (input: Input) => [input, {}];
const shown = (select: CharacterSelect, container: string, action: number) =>
  select.objects.find((o) => o.container === container && o.action === action);

describe('character select (object type 10, VS single)', () => {
  it('reads the grid, its spots and the flags from the KGT system block', () => {
    expect(LAYOUT).toMatchObject({
      cursors: [84, 85, 86, 87],
      origin: [233, 50],
      step: [26, 70],
      cols: 8,
      rows: 6,
      sides: [
        [100, 470],
        [540, 470],
      ],
    });
    // Bit 1 lets VS single rest on a player: not SHIN-Z (story only), nor
    // DoraEmon and the blank templates.
    const locked = ROSTER.flatMap((who, i) => (selectable(i) ? [] : [i]));
    expect(locked).toEqual([33, 42, 43, 44, 45, 48, 49]);
    expect(ROSTER[47]).toBe('training');
  });

  it('opens on CHAR SELECT with both cursors on Ryuko, each side showing her select face', () => {
    const select = fresh();
    select.step();
    expect(
      select.objects
        .filter((o) => o.container === 'select')
        .map((o) => o.action),
    ).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(select.hover).toEqual([0, 0]);
    expect(
      select.objects
        .filter((o) => o.container === 'ryuko')
        .map((o) => [o.action, o.x, o.y, o.facing]),
    ).toEqual([
      [67, 100, 470, 1],
      [67, 540, 470, -1],
    ]);
    // BackBlue sets global 3 to 10 and 10 to 10 (PCs 3, 6); past its first
    // display the 2P cursor raises 3 to 50 and clears 10 (KGT PCs 541–542),
    // and the box swaps to its locked grid (30) the tick after.
    run(select, Array<Input>(5).fill({}));
    expect([select.globals[3], select.globals[10]]).toEqual([10, 10]);
    select.step();
    expect([select.globals[3], select.globals[10]]).toEqual([50, 0]);
    expect(shown(select, 'select', 4)?.frame?.image).toBe(13);
    select.step();
    expect(shown(select, 'select', 4)?.frame?.image).toBe(30);
    // Ryuko's *NAME (66) slides in from (−100, −85) at raw 470, 250, 130.
    run(select, Array<Input>(22).fill({}));
    const names = select.objects.filter(
      (o) => o.container === 'ryuko' && o.action === 66,
    );
    expect(names.map((o) => [Math.round(o.x), o.y])).toEqual([
      [68, 385],
      [572, 385],
    ]);
  });

  it('moves a cell a press, wrapping, and repeats a held direction after 50 ticks, then every 5', () => {
    const select = fresh();
    select.step();
    select.step({ right: true });
    // Leaving a cell clears its player for a tick (0x406520).
    expect(select.hover[0]).toBe(-1);
    select.step();
    expect(select.hover[0]).toBe(1);
    const held = fresh();
    held.step();
    const changes: number[][] = [];
    for (let t = 1; t <= 62; t++) {
      const before = held.hover[0];
      held.step({ left: true });
      if (held.hover[0] !== before) changes.push([t, held.hover[0]]);
    }
    // The press wraps to the last column (SUNEO, 7); held, it repeats 50
    // ticks on, then every 5.
    expect(changes).toEqual([
      [1, -1],
      [2, 7],
      [51, -1],
      [52, 6],
      [56, -1],
      [57, 5],
      [61, -1],
      [62, 4],
    ]);
  });

  it("paints DoraEmon's face over his GATE LOCK cell (authored)", () => {
    // A pixel of the export's RGBA, filter-0 PNG.
    const pixel = (file: string, x: number, y: number) => {
      const png = readFileSync(
        new URL(`../../public/assets/${file}`, import.meta.url),
      );
      expect(png[25]).toBe(6);
      const width = png.readUInt32BE(16);
      const idat: Buffer[] = [];
      for (let at = 8; at < png.length;) {
        const size = png.readUInt32BE(at);
        if (png.toString('latin1', at + 4, at + 8) === 'IDAT')
          idat.push(png.subarray(at + 8, at + 8 + size));
        at += size + 12;
      }
      const rows = inflateSync(Buffer.concat(idat));
      const row = y * (1 + 4 * width);
      expect(rows[row]).toBe(0);
      return [...rows.subarray(row + 1 + 4 * x, row + 5 + 4 * x)];
    };
    for (const file of ['select/13.png', 'select/30.png', 'demo11/13.png']) {
      // His yellow eye and red nose, and cell 44's GATE LOCK untouched.
      expect(pixel(file, 130, 366)).toEqual([240, 192, 0, 255]);
      expect(pixel(file, 146, 370)).toEqual([224, 0, 0, 255]);
      expect(pixel(file, 110, 380)).toEqual([254, 254, 254, 255]);
    }
  });

  it('leaves locked cells empty and unchoosable', () => {
    const select = fresh();
    select.step();
    // SHIN-Z's cell (33): down 4, right 1.
    run(select, [
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ right: true }),
    ]);
    run(select, [{}, {}]);
    expect(select.hover[0]).toBe(-1);
    run(select, tap({ punch: true }));
    expect(select.decided).toEqual([false, false]);
    expect(select.objects.some((o) => o.container === 'shinz')).toBe(false);
  });

  it('chooses with any button, hands the keys to 2P, and starts the battle 101 ticks after both choose', () => {
    const select = fresh();
    select.step();
    // J chooses Ryuko (D, palette 3): KGT 86 replaces the 1P cursor.
    run(select, [{ punch: true }, { punch: true }, {}]);
    expect(select.decided).toEqual([true, false]);
    expect(shown(select, 'kgt', 86)).toBeDefined();
    // The held J isn't a fresh press for 2P; left and up wrap it to
    // TRAINING (47).
    run(select, [...tap({ left: true }), ...tap({ jump: true }), {}, {}]);
    expect(select.hover[1]).toBe(47);
    select.step({ kick: true });
    expect([select.decided, select.palettes]).toEqual([
      [true, true],
      [3, 0],
    ]);
    let ticks = 1;
    while (!select.done) {
      select.step();
      ticks++;
      // Each decided cursor adds 5 to global 7 as its flash ends (KGT PCs
      // 569, 605); at 10 the panels (11, 12) slide shut over the screen.
      if (ticks === 70)
        expect(
          [11, 12].map((a) => shown(select, 'select', a)?.frame?.image),
        ).toEqual([33, 34]);
    }
    expect([ticks, select.done]).toEqual([102, ['ryuko', 'training']]);
  });

  it("draws each chosen face in its button's palette, moved off the other side's", () => {
    const select = fresh();
    select.step();
    expect(select.drawn).toEqual(Array(8).fill(-1));
    // H is B, palette 1, for 1P; 2P's H takes the next palette, 2
    // (0x406f20).
    run(select, [{ hitUp: true }, {}]);
    expect(select.drawn.slice(0, 2)).toEqual([1, -1]);
    run(select, [{ hitUp: true }, {}]);
    expect([select.palettes, select.drawn.slice(0, 2)]).toEqual([
      [1, 1],
      [1, 2],
    ]);
    // In battle player 1 enters first and moves off player 2's (0x412056).
    expect(battlePalettes(select.palettes)).toEqual([2, 1]);
    expect(battlePalettes([3, 0])).toEqual([3, 0]);
  });
});

describe('character select (object type 10, VS multi)', () => {
  const team = () =>
    new CharacterSelect(
      [
        [0, 0],
        [0, 0],
      ],
      false,
      teamDemo as Demo,
    );
  // Ryuko's select faces (67, then 68), not her *NAME (66).
  const faces = (select: CharacterSelect) =>
    select.objects
      .filter((o) => o.container === 'ryuko' && o.action !== 66)
      .map((o) => [o.container, o.x, o.y, o.z, o.owner]);

  it('opens on TEAM VS, whose global 3 of 100 the 2P cursor keeps', () => {
    const select = team();
    select.step();
    expect(
      select.objects
        .filter((o) => o.container === 'demo11')
        .map((o) => o.action),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15]);
    run(select, Array<Input>(10).fill({}));
    expect(select.globals[3]).toBe(100);
    // Each side's hovered player is its seat 4 × side + 3's.
    expect(faces(select)).toEqual([
      ['ryuko', 100, 470, 0x50, 3],
      ['ryuko', 540, 470, 0x50, 7],
    ]);
  });

  it('picks three members a side, standing each but the last 150 pixels a pick left higher', () => {
    const select = team();
    select.step();
    // K, palette 0, then K again, which seat 0 holds: 1 (0x406f20).
    run(select, [...tap({ kick: true }), ...tap({ kick: true })]);
    expect(select.members[0]).toEqual([0, 0]);
    expect(faces(select)).toEqual([
      ['ryuko', 100, 470, 0x50, 3],
      ['ryuko', 540, 470, 0x50, 7],
      ['ryuko', 100, 170, 0x52, 0],
      ['ryuko', 100, 320, 0x51, 1],
    ]);
    // Moving clears only the hovered player, for a tick that picks no one
    // (0x407442).
    run(select, [{ right: true, hitUp: true }, {}]);
    expect([select.hover[0], select.members[0].length]).toEqual([1, 2]);
    // H, palette 1, which seat 1 holds: 2. The last pick decides.
    run(select, tap({ hitUp: true }));
    expect(select.decided).toEqual([true, false]);
    expect(select.drawn.slice(0, 4)).toEqual([0, 1, 2, -1]);
    // Player 2's J, palette 3, then 4 and 5 as its seats take them.
    for (let i = 0; i < TEAM_SIZE; i++) run(select, tap({ punch: true }));
    expect(select.drawn.slice(4)).toEqual([3, 4, 5, -1]);
    while (!select.done) select.step();
    expect(select.done).toEqual(['ryuko', 'ryuko']);
    expect(select.teams).toEqual([
      [
        { who: 'ryuko', palette: 0 },
        { who: 'ryuko', palette: 1 },
        { who: 'zoma', palette: 2 },
      ],
      [
        { who: 'ryuko', palette: 3 },
        { who: 'ryuko', palette: 4 },
        { who: 'ryuko', palette: 5 },
      ],
    ]);
  });
});

describe('title (0x4080a0)', () => {
  const frame = (title: Title, container: string, action: number) =>
    title.objects.find((o) => o.container === container && o.action === action)
      ?.frame?.image;

  it('plays T1 for its 700 ticks, then T2 until a press brings the menu', () => {
    const title = new Title();
    title.step();
    expect([title.state, title.objects.map((o) => o.container)]).toEqual([
      1,
      ['t1', 't1', 't1'],
    ]);
    // Its backdrop shows the volume warning (2) for 300 ticks, ALICUU (0) for
    // 150, then NEO TEAM F.K. (1), cueing sounds 1–3.
    title.step();
    expect(frame(title, 't1', 3)).toBe(2);
    expect(title.sounds).toEqual([{ container: 't1', index: 1 }]);
    // T1's flags don't let a press skip it: ten ticks, then its 700.
    for (let t = 2; t < 710; t++) title.step({ punch: !(t % 2) });
    expect(title.state).toBe(1);
    title.step();
    expect(title.state).toBe(2);
    title.step();
    expect([title.state, title.objects.map((o) => o.container)]).toEqual([
      3,
      Array(9).fill('t2'),
    ]);
    // T2 lasts until a press: the logo (1) and the backdrop's quadrants.
    for (let t = 0; t < 2000; t++) title.step();
    expect([title.state, frame(title, 't2', 8)]).toEqual([3, 1]);
    title.step({ crouch: true });
    expect(title.state).toBe(4);
    title.step({ crouch: true });
    // The cursor (KGT 78) sets global 0, which shows T2's menu (5).
    expect(title.items).toEqual([0, 1, 2]);
    expect(title.state).toBe(5);
    title.step();
    title.step();
    expect(frame(title, 't2', 9)).toBe(5);
    expect(frame(title, 'kgt', TITLE.cursor)).toBe(137);
  });

  it('moves its cursor a press at a time, wrapping, and enters story or VS single', () => {
    const title = new Title();
    while (title.state !== 3) title.step();
    title.step({ kick: true });
    title.step();
    const cursor = () => title.objects.find((o) => o.container === 'kgt')!;
    const start = title.place;
    expect([cursor().x, cursor().y]).toEqual(TITLE.items[start]);
    // A held key moves once; another press moves on.
    title.step({ crouch: true });
    title.step({ crouch: true });
    expect(title.place).toBe((start + 1) % 3);
    title.step();
    title.step({ jump: true });
    title.step();
    title.step({ jump: true });
    expect(title.place).toBe((start + 2) % 3);
    expect([cursor().x, cursor().y]).toEqual(TITLE.items[title.place]);
    // A button chooses the mode under the cursor.
    for (const mode of MODES) {
      const menu = new Title();
      while (menu.state !== 3) menu.step();
      menu.step({ kick: true });
      menu.step();
      while (MODES[menu.items[menu.place]] !== mode) {
        menu.step({ crouch: true });
        menu.step();
      }
      menu.step({ punch: true });
      expect(menu.done).toBe(mode);
    }
  });
});

describe('story select (object type 10, story mode)', () => {
  it('moves the 1P cursor alone over the story players and runs the story 101 ticks after the choice', () => {
    const select = new CharacterSelect([[0, 0]], true);
    select.step();
    expect(
      select.objects.filter((o) => o.container === 'kgt').map((o) => o.action),
    ).toEqual([LAYOUT.cursors[0]]);
    // SHIN-Z's cell (33), down 4 and right 1, has bit 0 (story).
    run(select, [
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ crouch: true }),
      ...tap({ right: true }),
      {},
    ]);
    expect(select.hover).toEqual([33, -1]);
    select.step({ kick: true });
    let ticks = 1;
    while (!select.done) {
      select.step();
      ticks++;
    }
    expect([ticks, select.done, select.palettes[0]]).toEqual([
      102,
      ['shinz', 'shinz'],
      0,
    ]);
    // Bit 0 locks out DoraEmon (45) and the blank templates.
    const locked = ROSTER.flatMap((_, i) => (selectable(i, 1) ? [] : [i]));
    expect(locked).toEqual([42, 43, 44, 45, 47, 48, 49]);
  });
});

describe('story demos (object type 16, 0x406c10)', () => {
  const play = (demo: StoryDemo, input: (t: number) => Input = () => ({})) => {
    let ticks = 0;
    while (!demo.done) demo.step(input(++ticks));
    return ticks;
  };

  it('runs out its ticks, then the story runs on the step after', () => {
    // --BR-END (22): 1300 ticks, no skipping.
    expect(
      play(new StoryDemo(22, ending as Demo), (t) => ({ punch: !(t % 2) })),
    ).toBe(1301);
  });

  it('lets a fresh button skip a flag-1 demo once ten ticks pass', () => {
    // --NEXT-- (3): the press at tick 12 follows a tick without one.
    const tapped = (at: number) => (t: number) => ({
      punch: t === at || t === 5,
    });
    expect(play(new StoryDemo(3, next as Demo), tapped(12))).toBe(13);
    // Held from the start, it never finds a fresh press: the 1000 ticks run.
    expect(play(new StoryDemo(3, next as Demo), () => ({ punch: true }))).toBe(
      1001,
    );
  });

  it('runs op 0x09 calls their times and op 0x0b calls once, then returns (0x412625)', () => {
    // YINANendB (87): action 2 calls action 1 from its third record, two
    // 5-tick displays, 60 times (PC 21), then twice once (PCs 23, 25), and
    // shows image 1000 (PC 26).
    const demo = new StoryDemo(87, yinanEnd as Demo);
    demo.step();
    const o = demo.objects.find((o) => o.action === 2)!;
    while (o.action !== 1) demo.step();
    // 600 ticks, then 10 for each single call.
    for (let t = 1; t < 620; t++) {
      demo.step();
      expect([o.action, o.frame?.image]).toEqual([1, 4]);
    }
    demo.step();
    expect([o.action, o.pc, o.frame?.image]).toEqual([2, 27, 1000]);
  });
});

describe('continue screen (object type 13, 0x4084f0)', () => {
  const opened = () => {
    const screen = new Continue(continueDemo as Demo);
    screen.step();
    screen.step();
    return screen;
  };
  const cursor = (screen: Continue) => {
    const o = screen.objects.find((o) => o.container === 'kgt')!;
    return [o.x, o.y];
  };

  it('stands its cursor on YES, turns it over with a direction and chooses with a button', () => {
    const screen = opened();
    expect([cursor(screen), CONTINUE.items]).toEqual([
      [180, 158],
      [
        [180, 158],
        [180, 225],
      ],
    ]);
    // A held direction turns it once; the button waits for a release.
    run(screen, [
      { crouch: true },
      { crouch: true },
      { crouch: true, punch: true },
    ]);
    expect([screen.choice, screen.done, cursor(screen)]).toEqual([
      1,
      null,
      [180, 225],
    ]);
    run(screen, [{}, { punch: true }]);
    expect(screen.done).toBe('no');
    const yes = opened();
    yes.step({ kick: true });
    expect(yes.done).toBe('yes');
  });
});
