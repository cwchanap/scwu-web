// Port of story mode's runner (0x4069b0): each player's story (PLAYER
// +0x7cc9, export_assets.scenario) is up to 100 steps, run from the step
// after the last until one starts a battle or a demo.
import { CHARACTERS } from './characters';
import type { Who } from './characters';

export interface Slot {
  flags: number;
  player: number;
  level: number;
  enemies: number;
  x: number;
  delay: number;
  random: number;
  watch: number;
  below: number;
  points: number;
  life: number;
  power: number;
  scorer: number;
  timeUp: number;
}
export interface Battle {
  type: 1;
  stage: number;
  rounds: number;
  recover: number;
  flags: number;
  time: number;
  x: number;
  letterings: number;
  timeUp: number;
  koScorer: number;
  koPoints: number;
  slots: (Slot | null)[];
}
export type Step =
  | Battle
  | { type: 2; demo: number }
  | { type: 3; condition: number; value: number; offset: number }
  | { type: 0 | 4 };
export type Next =
  | { kind: 'battle'; battle: Battle }
  | { kind: 'demo'; demo: number }
  | { kind: 'title' };

export const scenarioOf = (who: Who) =>
  CHARACTERS[who].scenario as readonly Step[];

export class Story {
  // The step counter (0x424f28), which the title sets to −1 (0x408263).
  step = -1;

  constructor(readonly who: Who) {}

  // The runner reads the 1P's life (+0xdf05) and the rounds it lost or drew
  // in the last battle (0x424e64) for its jumps.
  next(life = 0, lost = 0): Next {
    const steps = scenarioOf(this.who);
    // More than 200 steps in one run, a step out of 0–99, an empty step
    // (type 0) or the end (4) return to the title (0x406b75–0x406bcb).
    for (let runs = 1; runs <= 200; runs++) {
      if (++this.step < 0 || this.step >= 100) break;
      const step = steps[this.step] ?? { type: 0 };
      if (step.type === 1) {
        // A battle without a stage (+1) or a demo without an index runs on.
        if (step.stage) return { kind: 'battle', battle: step };
      } else if (step.type === 2) {
        if (step.demo) return { kind: 'demo', demo: step.demo };
      } else if (step.type === 3) {
        // 0x406bf4: always, a flag nothing sets (0x424f0c), the 1P's life
        // below the value, and no round lost or drawn. A jump lands
        // +5 steps on.
        const jumps = [true, false, life < step.value, lost === 0];
        if (jumps[step.condition]) this.step += step.offset - 1;
      } else break;
    }
    return { kind: 'title' };
  }

  // The continue screen's yes (0x4085d1) runs the battle again.
  retry() {
    this.step--;
    return this.next();
  }
}
