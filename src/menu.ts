import type { ProfileUser } from './auth/api';
import type { DummyBehavior } from './game/dummy';
import type { Mode } from './game/match';

// The consolidated Opponent select's values: each practice partner, plus
// 'vsCpu' for a real CPU match and 'story' as a placeholder while a story
// battle runs. Reads status.mode, which alone takes 'story' for a battle's
// duration.
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

export const profileConfigured = (clientId: string | undefined): boolean =>
  !!clientId;

export const identityRefresher = (
  read: () => Promise<ProfileUser | null>,
  apply: (user: ProfileUser | null) => void,
): (() => Promise<void>) => {
  let begun = 0;
  return async () => {
    const mine = ++begun;
    const user = await read();
    if (mine === begun) apply(user);
  };
};
