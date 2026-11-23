import { describe, expect, it } from 'vitest';
import type { ProfileUser } from './auth/api';
import { DEFAULT_CHEATS, normalizeCheats } from './game/cheats';
import type { CheatOptions } from './game/cheats';
import { GRID } from './instructions/moves';
import { ROSTER } from './instructions/fighters';
import {
  applyMe,
  CHEATS_KEY,
  CHEAT_GROUPS,
  CHEAT_ROWS,
  identityRefresher,
  loadCheats,
  opponentChoiceOf,
  profileConfigured,
  resetCheats,
  resetModeOf,
  saveCheats,
  stepCheat,
  SUMMON_COLUMNS,
  summonStep,
  summonables,
  tileOf,
  toggleSide,
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

describe('cheats storage', () => {
  const saved: CheatOptions = {
    enabled: true,
    playerHpMultiplier: 2,
    playerMaxEn: 600,
    unlimitedEn: true,
    enemyHpMultiplier: 5,
    playerDamageMultiplier: 10,
    partnerHpMultiplier: 100,
    enemyStocksMultiplier: 5,
    lowHpLine: 0,
    damageCutMultiplier: 5,
    lowHpSupers: true,
    brNoPartner: true,
    brHpPerKill: 1000,
    brEnPerKill: 0,
  };

  it('reads the saved settings as one JSON object under one key', () => {
    const keys: string[] = [];
    expect(
      loadCheats((key) => {
        keys.push(key);
        return JSON.stringify(saved);
      }),
    ).toEqual(saved);
    expect(keys).toEqual([CHEATS_KEY]);
  });

  it('reads the defaults for absent or malformed storage', () => {
    expect(loadCheats(() => null)).toEqual(DEFAULT_CHEATS);
    expect(loadCheats(() => '')).toEqual(DEFAULT_CHEATS);
    expect(loadCheats(() => 'not json')).toEqual(DEFAULT_CHEATS);
  });

  it('reads the defaults when the storage throws', () => {
    expect(
      loadCheats(() => {
        throw new Error('denied');
      }),
    ).toEqual(DEFAULT_CHEATS);
  });

  it('saves the whole object, and a reload restores it', () => {
    const writes: [string, string][] = [];
    saveCheats((key, value) => void writes.push([key, value]), saved);
    expect(writes).toEqual([[CHEATS_KEY, JSON.stringify(saved)]]);
    let stored: string | null = null;
    saveCheats((_key, value) => (stored = value), saved);
    expect(loadCheats(() => stored)).toEqual(saved);
  });

  it('swallows a failed write, leaving the setting usable', () => {
    expect(() =>
      saveCheats(() => {
        throw new Error('quota exceeded');
      }, saved),
    ).not.toThrow();
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

describe('cheat groups (HPA-972)', () => {
  it('groups every parameter row once, under the design table’s four groups', () => {
    expect(CHEAT_GROUPS.map((group) => group.name)).toEqual([
      'You · 1P',
      'Low HP · all fighters',
      'Partners & enemies',
      'B.R. modes',
    ]);
    expect(CHEAT_ROWS.map((row) => row.field)).toEqual([
      'playerHpMultiplier',
      'playerDamageMultiplier',
      'playerMaxEn',
      'unlimitedEn',
      'lowHpLine',
      'damageCutMultiplier',
      'lowHpSupers',
      'partnerHpMultiplier',
      'enemyHpMultiplier',
      'enemyStocksMultiplier',
      'brNoPartner',
      'brHpPerKill',
      'brEnPerKill',
    ]);
  });

  it('bounds each stepper to the normalization range at its step', () => {
    for (const row of CHEAT_ROWS) {
      if (row.kind !== 'stepper') continue;
      let value = normalizeCheats({
        ...DEFAULT_CHEATS,
        [row.field]: row.max!,
      })[row.field];
      expect(value, `${row.field} max`).toBe(row.max);
      // One step past the top clamps back to it.
      value = stepCheat(
        normalizeCheats({ ...DEFAULT_CHEATS, [row.field]: row.max! }),
        row.field,
        1,
      )[row.field];
      expect(value, `${row.field} over max`).toBe(row.max);
      value = stepCheat(
        normalizeCheats({ ...DEFAULT_CHEATS, [row.field]: row.min! }),
        row.field,
        -1,
      )[row.field];
      expect(value, `${row.field} under min`).toBe(row.min);
    }
  });

  it('steps each stepper by its own increment', () => {
    expect(stepCheat(DEFAULT_CHEATS, 'playerMaxEn', 1).playerMaxEn).toBe(400);
    expect(stepCheat(DEFAULT_CHEATS, 'playerMaxEn', -1).playerMaxEn).toBe(200);
    expect(
      stepCheat(DEFAULT_CHEATS, 'enemyStocksMultiplier', 1)
        .enemyStocksMultiplier,
    ).toBe(2);
    expect(stepCheat(DEFAULT_CHEATS, 'lowHpLine', -1).lowHpLine).toBe(20);
    // Switch rows only toggle, whichever way the arrows push.
    expect(stepCheat(DEFAULT_CHEATS, 'unlimitedEn', 1).unlimitedEn).toBe(true);
    expect(stepCheat(DEFAULT_CHEATS, 'unlimitedEn', -1).unlimitedEn).toBe(true);
    // The two nullable per-kill amounts are typed inputs, not steppers.
    for (const row of CHEAT_ROWS) {
      if (row.field === 'brHpPerKill' || row.field === 'brEnPerKill')
        expect(row.kind, row.field).toBe('input');
    }
  });

  it('shows the Max EN row with the stock digit art', () => {
    const maxEn = CHEAT_ROWS.find((row) => row.field === 'playerMaxEn');
    expect(maxEn?.digits).toBe(true);
    for (const row of CHEAT_ROWS)
      if (row.field !== 'playerMaxEn')
        expect(row.digits, row.field).toBeFalsy();
  });

  it('resets every parameter to the defaults, master switch included', () => {
    expect(resetCheats()).toEqual(DEFAULT_CHEATS);
    expect(Object.keys(resetCheats()).length).toBe(
      Object.keys(DEFAULT_CHEATS).length,
    );
  });
});

describe('summon grid (HPA-972)', () => {
  it('offers every fighter but TRAINING, in roster order', () => {
    expect(summonables.map((entry) => entry.id)).toEqual(
      ROSTER.filter((entry) => entry.id !== 'training').map(
        (entry) => entry.id,
      ),
    );
    expect(summonables.length).toBe(44);
  });

  it('places each summonable fighter on its select-sheet tile', () => {
    for (const entry of summonables) {
      const tile = tileOf(entry.id)!;
      const grid = GRID.indexOf(entry.id);
      expect(tile.x).toBe((grid % 8) * 26);
      expect(tile.y).toBe(Math.floor(grid / 8) * 70 + (grid % 2 ? 7 : 0));
      expect(tile.x).toBeLessThanOrEqual(206 - 24);
      expect(tile.y).toBeLessThanOrEqual(417 - 60);
    }
  });

  it('walks the grid with WASD and arrows, clamped at the edges', () => {
    const count = summonables.length;
    // Down a row and back up; the last row is partial.
    expect(summonStep(0, count, 's')).toBe(SUMMON_COLUMNS);
    expect(summonStep(SUMMON_COLUMNS, count, 'w')).toBe(0);
    expect(summonStep(40, count, 's')).toBe(43);
    expect(summonStep(43, count, 's')).toBe(43);
    expect(summonStep(0, count, 'w')).toBe(0);
    // Sideways never wraps between rows.
    expect(summonStep(0, count, 'a')).toBe(0);
    expect(summonStep(8, count, 'a')).toBe(8);
    expect(summonStep(7, count, 'd')).toBe(7);
    expect(summonStep(43, count, 'd')).toBe(43);
    expect(summonStep(5, count, 'd')).toBe(6);
    // Arrow keys step the same cells; other keys change nothing.
    expect(summonStep(3, count, 'ArrowRight')).toBe(4);
    expect(summonStep(3, count, 'ArrowLeft')).toBe(2);
    expect(summonStep(3, count, 'ArrowDown')).toBe(3 + SUMMON_COLUMNS);
    expect(summonStep(3, count, 'ArrowUp')).toBe(0);
    expect(summonStep(3, count, 'Enter')).toBe(3);
  });

  it('steps by the rendered column count at phone width', () => {
    const count = summonables.length;
    // Phone width renders four columns: down from the first tile is one
    // displayed row, not two.
    expect(summonStep(0, count, 's', 4)).toBe(4);
    expect(summonStep(4, count, 'w', 4)).toBe(0);
    expect(summonStep(40, count, 's', 4)).toBe(43);
    expect(summonStep(43, count, 's', 4)).toBe(43);
    expect(summonStep(0, count, 'w', 4)).toBe(0);
    // Sideways still never wraps between rows.
    expect(summonStep(0, count, 'a', 4)).toBe(0);
    expect(summonStep(4, count, 'a', 4)).toBe(4);
    expect(summonStep(3, count, 'd', 4)).toBe(3);
    expect(summonStep(5, count, 'd', 4)).toBe(6);
    expect(summonStep(3, count, 'ArrowDown', 4)).toBe(7);
  });

  it('switches the summon side', () => {
    expect(toggleSide(-1)).toBe(1);
    expect(toggleSide(1)).toBe(-1);
  });
});
