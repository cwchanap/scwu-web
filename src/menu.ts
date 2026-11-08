import type { MeResult, ProfileUser } from './auth/api';
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

export interface MenuIdentity {
  user: ProfileUser | null;
  loaded: boolean;
  failed: boolean;
}

// The Menu's identity moves only on an authoritative /api/me answer: a
// failed read keeps the last verified user instead of signing it out, and
// flags the row so an unanswered check never poses as signed out.
export const applyMe = (
  identity: MenuIdentity,
  result: MeResult,
): MenuIdentity =>
  result.ok
    ? { user: result.user, loaded: true, failed: false }
    : { ...identity, loaded: true, failed: true };

export interface IdentityRefresher {
  (): Promise<void>;
  invalidate(): void;
}

export const identityRefresher = <T = ProfileUser | null>(
  read: () => Promise<T>,
  apply: (result: T) => void,
): IdentityRefresher => {
  let begun = 0;
  const fn: IdentityRefresher = Object.assign(
    async () => {
      const mine = ++begun;
      const result = await read();
      if (mine === begun) apply(result);
    },
    {
      invalidate: () => {
        ++begun;
      },
    },
  );
  return fn;
};
