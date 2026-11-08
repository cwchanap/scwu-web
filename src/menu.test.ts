import { describe, expect, it } from 'vitest';
import type { ProfileUser } from './auth/api';
import {
  applyMe,
  identityRefresher,
  opponentChoiceOf,
  profileConfigured,
  resetModeOf,
  type MenuIdentity,
} from './menu';

describe('opponent select', () => {
  it('maps the match mode and partner to its value', () => {
    expect(opponentChoiceOf('practice', 'guard')).toBe('guard');
    expect(opponentChoiceOf('cpu', 'stand')).toBe('vsCpu');
    expect(opponentChoiceOf('story', 'stand')).toBe('story');
  });

  it('resets to the picked mode, live partner changes aside', () => {
    expect(resetModeOf('vsCpu', 'practice')).toBe('cpu');
    expect(resetModeOf('vsCpu', 'story')).toBe('cpu');
    expect(resetModeOf('guard', 'cpu')).toBe('practice');
    expect(resetModeOf('guard', 'story')).toBe('practice');
    expect(resetModeOf('guard', 'practice')).toBeNull();
    expect(resetModeOf('story', 'practice')).toBeNull();
  });
});

describe('profileConfigured', () => {
  it('holds only with a build-time Google client ID', () => {
    expect(profileConfigured('google-client-id')).toBe(true);
    expect(profileConfigured('')).toBe(false);
    expect(profileConfigured(undefined)).toBe(false);
  });
});

describe('applyMe', () => {
  const blank: MenuIdentity = { user: null, loaded: false, failed: false };
  const user: ProfileUser = {
    name: 'Ryuko',
    avatarUrl: null,
    createdAt: '2026-11-06T05:53:34Z',
  };

  it('loads the verified identity', () => {
    expect(applyMe(blank, { ok: true, user })).toEqual({
      user,
      loaded: true,
      failed: false,
    });
  });

  it('keeps it through a failed read, then recovers on the next answer', () => {
    const signedIn = applyMe(blank, { ok: true, user });
    const failed = applyMe(signedIn, { ok: false, user: null });
    expect(failed).toEqual({ user, loaded: true, failed: true });
    expect(applyMe(failed, { ok: true, user })).toEqual(signedIn);
  });

  it('signs out only on an authoritative answer', () => {
    const signedIn = applyMe(blank, { ok: true, user });
    expect(applyMe(signedIn, { ok: true, user: null })).toEqual({
      user: null,
      loaded: true,
      failed: false,
    });
  });

  it('fails rather than posing as signed out before the first answer', () => {
    expect(applyMe(blank, { ok: false, user: null })).toEqual({
      user: null,
      loaded: true,
      failed: true,
    });
  });
});

describe('identityRefresher', () => {
  const user: ProfileUser = {
    name: 'Ryuko',
    avatarUrl: null,
    createdAt: '2026-11-06T05:53:34Z',
  };
  const deferred = <T>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };

  it('applies the resolved identity', async () => {
    const applied: (ProfileUser | null)[] = [];
    const refresh = identityRefresher(
      () => Promise.resolve(user),
      (next) => applied.push(next),
    );
    await refresh();
    expect(applied).toEqual([user]);
  });

  it('applies null for a signed-out or failed read', async () => {
    const applied: (ProfileUser | null)[] = [];
    const refresh = identityRefresher(
      () => Promise.resolve(null),
      (next) => applied.push(next),
    );
    await refresh();
    expect(applied).toEqual([null]);
  });

  it('keeps only the newest open when reads race', async () => {
    const first = deferred<ProfileUser | null>();
    const second = deferred<ProfileUser | null>();
    const reads = [first.promise, second.promise];
    const applied: (ProfileUser | null)[] = [];
    const refresh = identityRefresher(
      () => reads.shift() ?? Promise.resolve(null),
      (next) => applied.push(next),
    );
    const stale = refresh();
    const fresh = refresh();
    second.resolve(user);
    await fresh;
    first.resolve(null);
    await stale;
    expect(applied).toEqual([user]);
  });

  it('drops in-flight reads when invalidated', async () => {
    const pending = deferred<ProfileUser | null>();
    const applied: (ProfileUser | null)[] = [];
    const refresh = identityRefresher(
      () => pending.promise,
      (next) => applied.push(next),
    );
    const read = refresh();
    refresh.invalidate();
    pending.resolve(user);
    await read;
    expect(applied).toEqual([]);
  });
});
