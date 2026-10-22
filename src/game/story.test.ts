import { describe, expect, it } from 'vitest';
import { Story, scenarioOf } from './story';

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
});
