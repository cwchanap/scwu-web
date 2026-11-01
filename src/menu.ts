import type { DummyBehavior } from './game/dummy';
import type { Mode } from './game/match';

// The consolidated Opponent select's values: each practice partner, plus
// 'vsCpu' for a real CPU match and 'story' as a placeholder while a story
// battle runs. Reads status.mode — the App-side mode state never takes
// 'story', so it cannot see a story battle.
export const opponentChoiceOf = (mode: Mode, partner: DummyBehavior): string =>
  mode === 'cpu' ? 'vsCpu' : mode === 'story' ? 'story' : partner;

// The mode a picked value resets to: a partner while practice runs changes
// the live match without one; anything else starts that mode fresh.
export const resetModeOf = (value: string, mode: Mode): Mode | null =>
  value === 'vsCpu'
    ? 'cpu'
    : mode === 'practice' || value === 'story'
      ? null
      : 'practice';
