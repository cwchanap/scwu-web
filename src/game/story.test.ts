import { describe, expect, it } from 'vitest';
import { Story, scenarioOf } from './story';
import type { Battle } from './story';

const at = (story: Story) => story.step;

describe('story runner', () => {
  it('opens Ryuko’s story on her first battle', () => {
    const story = new Story('ryuko');
    const next = story.next();
    expect(at(story)).toBe(0);
    expect(next.kind).toBe('battle');
    if (next.kind !== 'battle') return;
    // Stage 1 (Sport Court), one round, ZAKU and PAC-HELO with reinforcements
    // that enter as players 1 and 2 fall.
    expect(next.battle).toMatchObject({ stage: 1, rounds: 1, x: 540 });
    expect(next.battle.slots.map((s) => s && [s.player, s.flags])).toEqual([
      [34, 0],
      [35, 0],
      [34, 4],
      [35, 4],
      [34, 4],
      [35, 4],
      null,
    ]);
  });

  it('takes the jumps on the 1P’s life after the battle', () => {
    // Steps 1–3 jump below 162, 163 and 250 life to steps 62, 47 and 21.
    for (const [life, step, demo] of [
      [510, 4, 3],
      [250, 4, 3],
      [249, 21, 3],
      [162, 47, 18],
      [161, 62, 4],
    ]) {
      const story = new Story('ryuko');
      story.next();
      expect(story.next(life, 0)).toEqual({ kind: 'demo', demo });
      expect(at(story)).toBe(step);
    }
  });

  it('jumps on a battle without a lost round', () => {
    // Step 40, Z-MEGA, then step 41 skips his win demo when no round was
    // lost.
    const story = new Story('ryuko');
    story.step = 40;
    expect(story.next(510, 0)).toEqual({ kind: 'demo', demo: 16 });
    story.step = 40;
    expect(story.next(510, 1)).toEqual({ kind: 'demo', demo: 15 });
  });

  it('ends at the title and retries a battle', () => {
    const story = new Story('ryuko');
    story.step = 60;
    expect(story.next()).toEqual({ kind: 'title' });
    story.step = 5;
    expect(story.retry()).toMatchObject({ kind: 'battle' });
    expect(at(story)).toBe(5);
  });

  it('runs every story to a battle, a demo or the title', () => {
    expect(scenarioOf('rario').length).toBeGreaterThan(0);
    expect(scenarioOf('training')).toEqual([]);
    expect(new Story('training').next()).toEqual({ kind: 'title' });
  });

  it("runs DoraEmon's authored story on SHIN-Z's route", () => {
    const dora = scenarioOf('dora');
    const shinz = scenarioOf('shinz');
    expect(dora).toHaveLength(27);
    const players = (step: number) =>
      (dora[step] as Battle).slots.flatMap((s) => (s ? [s.player] : []));
    expect(
      [1, 3, 5, 7, 9, 11, 15].map((step) => [step, players(step)]),
    ).toEqual([
      [1, [6]],
      [3, [14]],
      [5, [13, 3, 9, 8, 20, 21, 36]],
      [7, [26, 11, 15, 10, 5, 24, 37]],
      [9, [19, 0, 23, 17, 4, 16, 36]],
      [11, [7, 22, 18, 1, 12, 2, 37]],
      [15, [28, 27, 29, 25, 39, 38, 31]],
    ]);
    expect(dora[1]).toMatchObject({ stage: 8, flags: 1 });
    for (const step of [
      0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22,
    ])
      expect(dora[step]).toEqual(shinz[step]);
    expect(dora.slice(23)).toEqual([
      { type: 2, demo: 8 },
      { ...scenarioOf('alpha')[21], stage: 3 },
      { type: 2, demo: 89 },
      { type: 4 },
    ]);
    const story = new Story('dora');
    expect(story.next()).toEqual({ kind: 'demo', demo: 3 });
    const giant = story.next();
    expect(giant.kind === 'battle' && giant.battle.slots[0]?.player).toBe(6);
    expect(story.retry()).toEqual(giant);
  });
});
