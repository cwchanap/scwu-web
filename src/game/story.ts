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

// Authored: DoraEmon's file has no story and the original never offers him
// in story mode (select flag 0). His runs SHIN-Z's route (steps 0–22) with
// these players, slot by slot, every other field SHIN-Z's: one seeded
// shuffle of the regulars, GOLF and ASURA as the brawls' allies and Z-MEGA
// as step 15's. Step 1's flag bit 0 offers Continue on a loss, as ALPHA's and
// ZENKA's step 1 do. SHIN-Z takes his own secret place (24), on stage 3 but
// from ALPHA's SHIN-Z battle (21), whose KO scorer makes a KO a loss, after
// demo 8 in DoraOP's place; his ending is SHIN-Z's (89, Zmega End).
const DORA_PLAYERS: Record<number, number[]> = {
  1: [6],
  3: [14],
  5: [13, 3, 9, 8, 20, 21, 36],
  7: [26, 11, 15, 10, 5, 24, 37],
  9: [19, 0, 23, 17, 4, 16, 36],
  11: [7, 22, 18, 1, 12, 2, 37],
  15: [28, 27, 29, 25, 39, 38, 31],
};
const doraStory = (): Step[] => {
  const route = CHARACTERS.shinz.scenario as readonly Step[];
  const steps = route.slice(0, 23).map((step, i) => {
    const players = DORA_PLAYERS[i];
    if (!players || step.type !== 1) return step;
    let slot = 0;
    return {
      ...step,
      flags: i === 1 ? 1 : step.flags,
      slots: step.slots.map((s) => s && { ...s, player: players[slot++] }),
    };
  });
  const shinz = (CHARACTERS.alpha.scenario as readonly Step[])[21] as Battle;
  return [
    ...steps,
    { type: 2, demo: 8 },
    { ...shinz, stage: 3 },
    { type: 2, demo: 89 },
    { type: 4 },
  ];
};
const DORA_STORY = doraStory();

export const scenarioOf = (who: Who) =>
  who === 'dora' ? DORA_STORY : (CHARACTERS[who].scenario as readonly Step[]);

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
