import { describe, expect, it } from 'vitest';
import {
  battlePalettes,
  CharacterSelect,
  LAYOUT,
  ROSTER,
  selectable,
} from './select';
import type { Input } from './match';

const fresh = () =>
  new CharacterSelect([
    [0, 0],
    [0, 0],
  ]);
const run = (select: CharacterSelect, inputs: Input[]) => {
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
    expect(select.drawn).toEqual([-1, -1]);
    // H is B, palette 1, for 1P; 2P's H takes the next palette, 2
    // (0x406f20).
    run(select, [{ hitUp: true }, {}]);
    expect(select.drawn).toEqual([1, -1]);
    run(select, [{ hitUp: true }, {}]);
    expect([select.palettes, select.drawn]).toEqual([
      [1, 1],
      [1, 2],
    ]);
    // In battle player 1 enters first and moves off player 2's (0x412056).
    expect(battlePalettes(select.palettes)).toEqual([2, 1]);
    expect(battlePalettes([3, 0])).toEqual([3, 0]);
  });
});
