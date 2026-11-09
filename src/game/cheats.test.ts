import { describe, expect, it } from 'vitest';
import { DEFAULT_CHEATS, normalizeCheats, readCheats } from './cheats';

describe('cheat options (HPA-767)', () => {
  it('defaults to a disabled master switch with neutral values', () => {
    expect(DEFAULT_CHEATS).toEqual({
      enabled: false,
      playerHpMultiplier: 1,
      playerEnLimit: 3,
      unlimitedEn: false,
      enemyHpMultiplier: 1,
      playerDamageMultiplier: 1,
    });
    // A plain object copy, safe to hand to a Match.
    expect({ ...DEFAULT_CHEATS }).not.toBe(DEFAULT_CHEATS);
  });

  it('reads stored settings', () => {
    expect(
      readCheats(
        JSON.stringify({
          enabled: true,
          playerHpMultiplier: 2.5,
          playerEnLimit: 6,
          unlimitedEn: true,
          enemyHpMultiplier: 0.1,
          playerDamageMultiplier: 10,
        }),
      ),
    ).toEqual({
      enabled: true,
      playerHpMultiplier: 2.5,
      playerEnLimit: 6,
      unlimitedEn: true,
      enemyHpMultiplier: 0.1,
      playerDamageMultiplier: 10,
    });
  });

  it('falls back to the defaults for absent, empty or malformed storage', () => {
    for (const raw of [null, '', 'not json', '{"enabled":', '3', '[]', 'null'])
      expect(readCheats(raw)).toEqual(DEFAULT_CHEATS);
  });

  it('fills missing fields with their defaults', () => {
    expect(readCheats('{"enabled":true,"playerEnLimit":5}')).toEqual({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerEnLimit: 5,
    });
  });

  it('bounds finite out-of-range numbers to their range', () => {
    expect(
      readCheats(
        '{"playerHpMultiplier":100,"enemyHpMultiplier":0.01,' +
          '"playerDamageMultiplier":-5,"playerEnLimit":9}',
      ),
    ).toEqual({
      ...DEFAULT_CHEATS,
      playerHpMultiplier: 5,
      enemyHpMultiplier: 0.1,
      playerDamageMultiplier: 0.5,
      playerEnLimit: 6,
    });
    expect(readCheats('{"playerHpMultiplier":-2,"playerEnLimit":0}')).toEqual({
      ...DEFAULT_CHEATS,
      playerHpMultiplier: 0.5,
      playerEnLimit: 1,
    });
  });

  it('rounds the EN limit to a whole stock count', () => {
    const read = (raw: string) => readCheats(raw).playerEnLimit;
    expect(read('{"playerEnLimit":2.4}')).toBe(2);
    expect(read('{"playerEnLimit":2.6}')).toBe(3);
    expect(read('{"playerEnLimit":0.4}')).toBe(1);
    expect(read('{"playerEnLimit":6.4}')).toBe(6);
  });

  it('drops non-numbers and non-finite numbers to their defaults', () => {
    // 1e999 parses as Infinity; NaN cannot be spelled in JSON but arrives
    // through the object path.
    expect(readCheats('{"playerHpMultiplier":1e999}')).toEqual(DEFAULT_CHEATS);
    expect(
      normalizeCheats({
        playerHpMultiplier: Number.NaN,
        enemyHpMultiplier: '2',
        playerEnLimit: undefined,
        playerDamageMultiplier: {},
      }),
    ).toEqual(DEFAULT_CHEATS);
  });

  it('drops invalid booleans to their defaults', () => {
    expect(readCheats('{"enabled":"yes","unlimitedEn":1}')).toEqual(
      DEFAULT_CHEATS,
    );
    expect(normalizeCheats({ enabled: 0, unlimitedEn: null })).toEqual(
      DEFAULT_CHEATS,
    );
  });

  it('normalizes any object into a fresh copy', () => {
    const passed = { ...DEFAULT_CHEATS, enabled: true, playerEnLimit: 1 };
    const normalized = normalizeCheats(passed);
    expect(normalized).toEqual({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerEnLimit: 1,
    });
    expect(normalized).not.toBe(passed);
    expect(normalizeCheats(null)).toEqual(DEFAULT_CHEATS);
  });
});
