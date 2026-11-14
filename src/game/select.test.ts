import { script } from './animations';
import { CHARACTERS } from './characters';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  battlePalettes,
  CharacterSelect,
  Continue,
  CONTINUE,
  LAYOUT,
  MODE_BOARDS,
  ModeSelect,
  MODES,
  ROSTER,
  ROUTE_BOARDS,
  selectable,
  StoryDemo,
  TEAM_SIZE,
  Title,
  TITLE,
} from './select';
import type { Demo } from './select';
import type { Input } from './match';
import { scenarioOf, TAKES } from './story';
import type { Battle } from './story';
import { itWithArt } from './testing';
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
    // the blank templates. DoraEmon (45) has none, but the port lets him
    // (authored).
    const locked = ROSTER.flatMap((who, i) => (selectable(i) ? [] : [i]));
    expect(locked).toEqual([33, 42, 43, 44, 48, 49]);
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

  itWithArt("paints DoraEmon's face over his GATE LOCK cell (authored)", () => {
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

  it('lets VS pick DoraEmon (45), authored', () => {
    const select = new CharacterSelect([
      [5, 5],
      [0, 0],
    ]);
    select.step();
    expect(select.hover[0]).toBe(45);
    // His face (84) tests the mode at record 1 and calls the name (83) after
    // it in VS, as SEAN's layout his file keeps; his muscular portrait shows
    // (authored).
    for (let t = 0; t < 30; t++) select.step();
    expect(shown(select, 'dora', 84)?.frame?.image).toBe(140);
    expect(shown(select, 'dora', 83)?.frame?.image).toBe(247);
    expect(CHARACTERS.dora.images.find((i) => i.index === 140)).toMatchObject({
      width: 207,
      height: 400,
    });
    run(select, [{ punch: true }, {}]);
    run(select, tap({ kick: true }));
    while (!select.done) select.step();
    expect(select.done).toEqual(['dora', 'ryuko']);
  });

  it('lets TEAM VS seat DoraEmon', () => {
    const select = new CharacterSelect(
      [
        [5, 5],
        [0, 0],
      ],
      false,
      teamDemo as Demo,
    );
    select.step();
    expect(select.hover[0]).toBe(45);
    // TEAM VS sets global 3 to 100, so his face jumps to 85, which past its
    // own blank hold flickers image 140 every 5 ticks, as the others' team
    // faces flicker theirs.
    const images = new Set<number | undefined>();
    for (let t = 0; t < 40; t++) {
      select.step();
      const face = select.objects.find(
        (o) => o.container === 'dora' && o.owner === 3,
      );
      expect(face?.action).toBe(85);
      if (t >= 20) images.add(face?.frame?.image);
    }
    expect([...images].sort()).toEqual([0, 140]);
    // The name call sits past the TEAM branch, as the original's: no other
    // fighter's name shows there.
    expect(
      select.objects.some((o) => o.container === 'dora' && o.action === 83),
    ).toBe(false);
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

  it('opens on T2 until a press brings the menu, clearing the session globals (authored)', () => {
    const title = new Title();
    title.globals[3] = 100;
    title.globals[15] = 5;
    title.step();
    // T1's action 2 zeroed globals 0–15; skipping the intro keeps that clear
    // at T2's start (authored).
    expect([title.globals[3], title.globals[15]]).toEqual([0, 0]);
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
    // Bit 0 locks out the blank templates; DoraEmon (45) is let in
    // (authored).
    const locked = ROSTER.flatMap((_, i) => (selectable(i, 1) ? [] : [i]));
    expect(locked).toEqual([42, 43, 44, 47, 48, 49]);
  });

  it('lets story mode choose DoraEmon (authored)', () => {
    const select = new CharacterSelect([[5, 5]], true);
    select.step();
    expect(select.hover).toEqual([45, -1]);
    run(select, tap({ punch: true }));
    while (!select.done) select.step();
    expect(select.done).toEqual(['dora', 'dora']);
  });

  it('lands its cursor on tick 1 without choosing (0x407782)', () => {
    // Tick 1 puts the cursor down via rest() (0x407782); a pick waits for
    // a fresh press on a later tick so a held button landing on tick 1
    // does not fire before the cursor sits on a cell.
    const select = new CharacterSelect([[0, 0]], true);
    select.step({ punch: true });
    expect(select.decided).toEqual([false, false]);
    select.step({});
    select.step({ punch: true });
    expect(select.decided).toEqual([true, false]);
    while (!select.done) select.step();
    expect(select.done).toEqual(['ryuko', 'ryuko']);
    // VS single's cursor lands the same way.
    const vs = new CharacterSelect([
      [0, 0],
      [0, 0],
    ]);
    vs.step({ punch: true });
    expect(vs.decided).toEqual([false, false]);
    vs.step({});
    vs.step({ punch: true });
    expect(vs.decided).toEqual([true, false]);
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

describe('mode select (authored, HPA-765)', () => {
  // A finished story select — Ryuko taken with J — for the menu to sit
  // over.
  const picked = () => {
    const select = new CharacterSelect([[0, 0]], true);
    select.step();
    run(select, tap({ punch: true }));
    while (!select.done) select.step();
    return select;
  };
  const signs = (mode: ModeSelect) =>
    mode.objects.filter((o) => o.alive && o.frame && o.container !== 'kgt');
  // A fresh press: the tick before lets any held keys — and with them the
  // latch — go.
  const press = (mode: ModeSelect, input: Input) => run(mode, [{}, input]);

  it('opens on the STORY and B.R. boards and the bobbing 1P arrow, its first tick deaf to the pick button', () => {
    const mode = new ModeSelect(picked());
    // The button that chose the fighter is still down on tick one: the
    // screen arms without it (authored).
    mode.step({ punch: true });
    expect(mode.stage).toBe(0);
    expect(mode.done).toBeNull();
    expect(signs(mode).map((o) => [o.container, o.frame!.image])).toEqual([
      ['zaku', 8001],
      ['pachelo', 8001],
    ]);
    expect(
      mode.objects.some((o) => o.container === 'kgt' && o.action === 84),
    ).toBe(true);
    expect([0, 1]).toContain(mode.choice);
    // Held past the first tick it is still not fresh; let go and pressed
    // again it confirms the mode and brings up the route step.
    mode.step({ punch: true });
    expect(mode.stage).toBe(0);
    mode.choice = 0;
    press(mode, { punch: true });
    expect(mode.stage).toBe(1);
    expect(signs(mode).map((o) => [o.frame!.image, o.scale])).toEqual([
      [8005, 1.2],
      [8005, 1.1],
      [8001, 0.5],
    ]);
    // The chosen mode's smaller board heads the route step.
    expect(
      mode.objects.some((o) => o.frame?.image === 8001 && o.scale === 0.5),
    ).toBe(true);
  });

  it('steps its finished select with no input, palette and pick intact', () => {
    const background = picked();
    const view = background as unknown as { tick: number };
    const before = view.tick;
    const mode = new ModeSelect(background);
    expect(mode.who).toBe('ryuko');
    mode.step();
    mode.step();
    expect(view.tick).toBe(before + 2);
    expect(mode.background).toBe(background);
    expect(mode.background.drawn).toBe(background.drawn);
    expect(mode.background.done).toEqual(['ryuko', 'ryuko']);
    // The menu's own objects write none of the session globals.
    for (let t = 0; t < 200; t++) mode.step();
    expect(mode.globals).toEqual(Array<number>(64).fill(0));
  });

  it('moves the arrow with any direction, latching until every key is let go, and confirms the route on step two', () => {
    const mode = new ModeSelect(picked());
    mode.step();
    const start = mode.choice;
    mode.step({ right: true });
    mode.step({ right: true });
    expect(mode.choice).toBe(1 - start);
    mode.step({ crouch: true });
    // A held direction can't move again until all keys come up.
    expect(mode.choice).toBe(1 - start);
    mode.step();
    mode.step({ crouch: true });
    expect(mode.choice).toBe(start);
    mode.choice = 0;
    press(mode, { punch: true });
    expect(mode.stage).toBe(1);
    mode.choice = 1;
    press(mode, { kick: true });
    expect(mode.done).toBe('story-hard');
  });

  it('remembers the last mode and each mode’s route for the page session', () => {
    const first = new ModeSelect(picked());
    first.step();
    first.choice = 1;
    press(first, { punch: true });
    first.choice = 1;
    press(first, { punch: true });
    expect(first.done).toBe('br-another');
    const second = new ModeSelect(picked());
    second.step();
    expect(second.choice).toBe(1);
    press(second, { punch: true });
    expect(second.choice).toBe(1);
    press(second, { punch: true });
    expect(second.done).toBe('br-another');
  });

  it('back() returns to the mode step, the confirmed picks still held', () => {
    const mode = new ModeSelect(picked());
    mode.step();
    mode.choice = 1;
    press(mode, { punch: true });
    expect(mode.stage).toBe(1);
    const remembered = mode.choice;
    mode.choice = remembered ? 0 : 1;
    mode.back();
    expect([mode.stage, mode.done]).toEqual([0, null]);
    expect(mode.choice).toBe(1);
    expect(signs(mode).map((o) => o.frame!.image)).toEqual([8001, 8001]);
    // The route step picks up its remembered route again.
    press(mode, { punch: true });
    expect(mode.stage).toBe(1);
    expect(mode.choice).toBe(remembered);
  });

  it('draws the pick’s board slightly larger than the other ~1.1× one', () => {
    // The issue’s mockup asked for two boards at about 1.2× source, the
    // picked one slightly larger; its link is dead so this lands on the
    // playable view (authored, HPA-765). The ~1.3/1.2 pair cannot fit —
    // two 507px boxes over 960px of canvas — so the pair sits a size
    // down with the same step between them.
    const mode = new ModeSelect(picked());
    mode.step();
    // The remembered mode decides which board starts lit; whichever it
    // is, its board draws slightly larger than the other's ~1.1×.
    const start = mode.choice;
    expect(signs(mode)[start].scale).toBe(1.2);
    expect(signs(mode)[1 - start].scale).toBe(1.1);
    mode.step({ right: true });
    expect(mode.choice).toBe(1 - start);
    expect(signs(mode)[mode.choice].scale).toBe(1.2);
    expect(signs(mode)[start].scale).toBe(1.1);
  });

  it('takes a tap on a board through the same pick a button confirms, with a cooldown', () => {
    const mode = new ModeSelect(picked());
    // Before the arm tick there is nothing to hit; after done nothing.
    expect(mode.tap(720, 394)).toBe(false);
    mode.step();
    // The right board’s centre — B.R. — picks and confirms it like a
    // button press does.
    expect(mode.tap(720, 394)).toBe(true);
    expect(mode.stage).toBe(1);
    expect(signs(mode).map((o) => o.frame!.image)).toEqual([8006, 8006, 8001]);
    // A second tap within the 15-tick cooldown does not confirm the
    // overlapping route board immediately.
    for (let i = 0; i < 14; i++) mode.step();
    expect(mode.tap(720, 469)).toBe(false);
    expect(mode.done).toBeNull();
    // Once the cooldown elapses, the right route board lands its route.
    mode.step();
    expect(mode.tap(720, 469)).toBe(true);
    expect(mode.done).toBe('br-another');
    expect(mode.tap(240, 469)).toBe(false);
  });

  it('forwards sounds queued by its finished background select', () => {
    const background = new CharacterSelect(undefined, true);
    background.done = ['ryuko', 'ryuko'];
    const mode = new ModeSelect(background);
    for (let i = 0; i < 10 && !mode.sounds.length; i++) mode.step();
    expect(mode.sounds).toContainEqual({ container: 'select', index: 1 });
  });

  it('pins MODE_BOARDS and ROUTE_BOARDS to the Chii sign actors and scripts', () => {
    const chii = scenarioOf('ryuko')[0] as Battle;
    const owners = chii.slots
      .filter(
        (s): s is NonNullable<typeof s> => s !== null && !(s.flags & 0x200),
      )
      .map((s) => ROSTER[s.player]);
    expect(owners.slice(0, 2)).toEqual(['zaku', 'pachelo']);
    expect(new Set(owners)).toEqual(new Set(['zaku', 'pachelo']));

    const spawnImage = (who: 'zaku' | 'pachelo', actorScript: number) => {
      const child = script(actorScript, who).events.find(
        (e) => e.op === 'spawn',
      );
      expect(child?.action).toBeDefined();
      return script(child!.action!, who).frames[0].image;
    };
    const otherLife = (who: 'zaku' | 'pachelo', actorScript: number) =>
      script(actorScript, who).events.find((e) => e.op === 'power')?.otherLife;

    // Mode boards match each Chii actor's Single Start sign script (75 -> 2 -> 8001).
    for (const [i, board] of MODE_BOARDS.entries()) {
      expect(board.who).toBe(owners[i]);
      expect(board.image).toBe(spawnImage(board.who, 75));
    }
    // Route boards match script 80 (STORY, 5 -> 8005) and 83 (B.R., 8 -> 8006)
    // and their exact power takes in zaku and pachelo.
    const routeScripts = [80, 83] as const;
    for (const [m, boards] of ROUTE_BOARDS.entries()) {
      for (const [r, board] of boards.entries()) {
        expect(board.who).toBe(owners[r]);
        expect(board.image).toBe(spawnImage(board.who, routeScripts[m]));
        expect(-otherLife(board.who, routeScripts[m])!).toBe(
          TAKES[board.route],
        );
      }
    }
  });

  // A sign's drawn box, read off its object as the sprite draws it: the
  // display anchored centre-bottom, its scale growing from the top left.
  const boxOf = (o: { x: number; y: number; scale?: number }) => {
    const s = o.scale ?? 1;
    return {
      x: (o.x - 130) * 1.5,
      y: (o.y - 204) * 1.5,
      w: 390 * s,
      h: 306 * s,
    };
  };

  it('keeps every sign’s drawn box on-canvas and clear of the other', () => {
    // The pick's larger board must leave the other's box alone and stay
    // on the 960×720 canvas: the review caught the ~1.3× sign drawn
    // over the left board's tap area and past the canvas edge.
    const expectClear = (mode: ModeSelect) => {
      const boxes = signs(mode).map(boxOf);
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(960);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(720);
      }
      expect(boxes[0].x + boxes[0].w).toBeLessThan(boxes[1].x);
    };
    for (const pick of [0, 1]) {
      const mode = new ModeSelect(picked());
      mode.step();
      mode.choice = pick;
      mode.step();
      expectClear(mode);
      press(mode, { punch: true });
      // Both route picks' placements on the second step too.
      for (const route of [0, 1]) {
        mode.choice = route;
        mode.step();
        expectClear(mode);
      }
    }
  });

  it('takes a tap on a board’s drawn edge through to its routes', () => {
    // A tap tests the same box the sign draws: its edge pixels pick the
    // board they cover — never the other sign (review, HPA-765): with
    // B.R. lit, (470,221) sat inside its drawn board but read STORY.
    for (const pick of [0, 1]) {
      const mode = new ModeSelect(picked());
      mode.step();
      mode.choice = pick;
      mode.step();
      const b = signs(mode).map(boxOf)[pick];
      // One pixel inside the lit board's inner top edge.
      const x = pick ? b.x + 1 : b.x + b.w - 1;
      expect(mode.tap(x, b.y + 1)).toBe(true);
      expect(mode.stage).toBe(1);
      // STORY's routes read 8005, B.R.'s 8006: the board tapped is the
      // mode whose routes opened.
      expect(
        signs(mode)
          .slice(0, 2)
          .map((o) => o.frame!.image),
      ).toEqual(Array(2).fill(pick ? 8006 : 8005));
    }
  });

  it('ignores taps in the boards’ gap and off them', () => {
    const mode = new ModeSelect(picked());
    mode.step();
    mode.choice = 1;
    mode.step();
    expect(mode.tap(470, 221)).toBe(false); // between the drawn boards
    expect(mode.tap(480, 394)).toBe(false); // the strip between them
    expect(mode.tap(480, 120)).toBe(false); // above them
    expect(mode.tap(4, 394)).toBe(false); // left of the first
    expect(mode.tap(956, 394)).toBe(false); // right of the last
    expect([mode.stage, mode.done]).toEqual([0, null]);
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
