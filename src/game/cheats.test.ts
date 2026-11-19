import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHEATS,
  changedCheats,
  enGainOf,
  normalizeCheats,
  readCheats,
} from './cheats';

describe('cheat options (HPA-767, HPA-972)', () => {
  it('defaults to a disabled master switch with neutral values', () => {
    expect(DEFAULT_CHEATS).toEqual({
      enabled: false,
      playerHpMultiplier: 1,
      playerMaxEn: 300,
      unlimitedEn: false,
      enemyHpMultiplier: 1,
      playerDamageMultiplier: 1,
      partnerHpMultiplier: 1,
      enemyStocksMultiplier: 1,
      lowHpLine: 30,
      damageCutMultiplier: 1,
      lowHpSupers: false,
      brNoPartner: false,
      brHpPerKill: null,
      brEnPerKill: null,
    });
    // A plain object copy, safe to hand to a Match.
    expect({ ...DEFAULT_CHEATS }).not.toBe(DEFAULT_CHEATS);
  });

  it('defaults mirror native play, so an off switch changes nothing', () => {
    // The 1–10-stock cap 300/100 = 3, every multiplier ×1, the native 30%
    // low-life line, no cut, no bypass, and the source Game's B.R. awards.
    expect(DEFAULT_CHEATS.playerMaxEn / 100).toBe(3);
    expect(DEFAULT_CHEATS.playerHpMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.partnerHpMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.enemyHpMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.enemyStocksMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.playerDamageMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.lowHpLine).toBe(30);
    expect(DEFAULT_CHEATS.damageCutMultiplier).toBe(1);
    expect(DEFAULT_CHEATS.lowHpSupers).toBe(false);
    expect(DEFAULT_CHEATS.brNoPartner).toBe(false);
    expect(DEFAULT_CHEATS.brHpPerKill).toBeNull();
    expect(DEFAULT_CHEATS.brEnPerKill).toBeNull();
  });

  it('reads stored settings', () => {
    expect(
      readCheats(
        JSON.stringify({
          enabled: true,
          playerHpMultiplier: 2.5,
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
        }),
      ),
    ).toEqual({
      enabled: true,
      playerHpMultiplier: 2.5,
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
    });
  });

  it('falls back to the defaults for absent, empty or malformed storage', () => {
    for (const raw of [null, '', 'not json', '{"enabled":', '3', '[]', 'null'])
      expect(readCheats(raw)).toEqual(DEFAULT_CHEATS);
  });

  it('fills missing fields with their defaults', () => {
    expect(readCheats('{"enabled":true,"playerMaxEn":500}')).toEqual({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerMaxEn: 500,
    });
  });

  it('bounds every multiplier to 1–100 (HPA-972)', () => {
    expect(
      readCheats(
        '{"playerHpMultiplier":1000,"enemyHpMultiplier":1000,' +
          '"playerDamageMultiplier":1000,"partnerHpMultiplier":1000,' +
          '"playerMaxEn":2000,"enemyStocksMultiplier":9,' +
          '"lowHpLine":120,"damageCutMultiplier":8}',
      ),
    ).toEqual({
      ...DEFAULT_CHEATS,
      playerHpMultiplier: 100,
      enemyHpMultiplier: 100,
      playerDamageMultiplier: 100,
      partnerHpMultiplier: 100,
      playerMaxEn: 1000,
      enemyStocksMultiplier: 5,
      lowHpLine: 100,
      damageCutMultiplier: 5,
    });
    expect(
      readCheats(
        '{"playerHpMultiplier":-2,"enemyHpMultiplier":0.01,' +
          '"playerDamageMultiplier":0.5,"partnerHpMultiplier":0,' +
          '"playerMaxEn":9,"enemyStocksMultiplier":0,' +
          '"lowHpLine":-3,"damageCutMultiplier":-1}',
      ),
    ).toEqual({
      ...DEFAULT_CHEATS,
      playerHpMultiplier: 1,
      enemyHpMultiplier: 1,
      playerDamageMultiplier: 1,
      partnerHpMultiplier: 1,
      playerMaxEn: 100,
      enemyStocksMultiplier: 1,
      lowHpLine: 0,
      damageCutMultiplier: 0,
    });
  });

  it('rounds the whole-step fields to their step', () => {
    const read = (raw: string) => readCheats(raw);
    expect(read('{"playerMaxEn":240}').playerMaxEn).toBe(200);
    expect(read('{"playerMaxEn":260}').playerMaxEn).toBe(300);
    expect(read('{"playerMaxEn":150}').playerMaxEn).toBe(200);
    expect(read('{"enemyStocksMultiplier":2.4}').enemyStocksMultiplier).toBe(2);
    expect(read('{"enemyStocksMultiplier":2.6}').enemyStocksMultiplier).toBe(3);
    expect(read('{"lowHpLine":29.4}').lowHpLine).toBe(29);
    expect(read('{"lowHpLine":29.6}').lowHpLine).toBe(30);
  });

  it('keeps the per-kill B.R. awards blank (null) for the source Game', () => {
    expect(readCheats('{"brHpPerKill":null,"brEnPerKill":null}')).toEqual(
      DEFAULT_CHEATS,
    );
    expect(readCheats('{}').brHpPerKill).toBeNull();
    expect(readCheats('{}').brEnPerKill).toBeNull();
    // A blank field arrives as a string, NaN or null through the object
    // path; none of them is a number, so all read as the Game default.
    expect(
      normalizeCheats({ brHpPerKill: '50', brEnPerKill: Number.NaN }),
    ).toEqual(DEFAULT_CHEATS);
    expect(normalizeCheats({ brEnPerKill: null })).toEqual(DEFAULT_CHEATS);
  });

  it('takes a per-kill award of 0 as a real zero, not blank', () => {
    expect(readCheats('{"brHpPerKill":0,"brEnPerKill":0}')).toEqual({
      ...DEFAULT_CHEATS,
      brHpPerKill: 0,
      brEnPerKill: 0,
    });
    expect(changedCheats(readCheats('{"brHpPerKill":0,"brEnPerKill":0}'))).toBe(
      2,
    );
  });

  it('rounds and bounds the per-kill awards into 0–1000', () => {
    const read = (raw: string) => readCheats(raw);
    expect(read('{"brHpPerKill":100.6}').brHpPerKill).toBe(101);
    expect(read('{"brHpPerKill":100.4}').brHpPerKill).toBe(100);
    expect(read('{"brHpPerKill":-5}').brHpPerKill).toBe(0);
    expect(read('{"brEnPerKill":2000}').brEnPerKill).toBe(1000);
    expect(read('{"brEnPerKill":-1}').brEnPerKill).toBe(0);
  });

  it('reads the old six-field storage without migrating it (HPA-972)', () => {
    // No migration: the dropped stock field reads as the new default.
    expect(
      readCheats(
        JSON.stringify({
          enabled: true,
          playerHpMultiplier: 2,
          playerEnLimit: 6,
          unlimitedEn: false,
          enemyHpMultiplier: 1,
          playerDamageMultiplier: 1,
        }),
      ),
    ).toEqual({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerHpMultiplier: 2,
    });
  });

  it('drops non-numbers and non-finite numbers to their defaults', () => {
    // 1e999 parses as Infinity; NaN cannot be spelled in JSON but arrives
    // through the object path.
    expect(
      readCheats('{"playerHpMultiplier":1e999,"playerMaxEn":1e999}'),
    ).toEqual(DEFAULT_CHEATS);
    expect(
      normalizeCheats({
        playerHpMultiplier: Number.NaN,
        enemyHpMultiplier: '2',
        playerMaxEn: undefined,
        playerDamageMultiplier: {},
        lowHpLine: null,
        brNoPartner: 'yes',
      }),
    ).toEqual(DEFAULT_CHEATS);
  });

  it('drops invalid booleans to their defaults', () => {
    expect(
      readCheats(
        '{"enabled":"yes","unlimitedEn":1,"lowHpSupers":0,"brNoPartner":null}',
      ),
    ).toEqual(DEFAULT_CHEATS);
    expect(
      normalizeCheats({ enabled: 0, unlimitedEn: null, lowHpSupers: 1 }),
    ).toEqual(DEFAULT_CHEATS);
  });

  it('normalizes any object into a fresh copy', () => {
    const passed = { ...DEFAULT_CHEATS, enabled: true, playerMaxEn: 100 };
    const normalized = normalizeCheats(passed);
    expect(normalized).toEqual({
      ...DEFAULT_CHEATS,
      enabled: true,
      playerMaxEn: 100,
    });
    expect(normalized).not.toBe(passed);
    expect(normalizeCheats(null)).toEqual(DEFAULT_CHEATS);
  });
});

describe('enGainOf (HPA-972)', () => {
  it('fills at the native speed at three stocks and never below ×1', () => {
    expect(enGainOf(1)).toBe(1);
    expect(enGainOf(2)).toBe(1);
    expect(enGainOf(3)).toBe(1);
  });

  it('gains half a step per stock past three, by stock count alone', () => {
    expect(enGainOf(4)).toBe(1.5);
    expect(enGainOf(5)).toBe(2);
    expect(enGainOf(6)).toBe(2.5);
    expect(enGainOf(10)).toBe(4.5);
  });
});

describe('changedCheats (HPA-972)', () => {
  it('counts nothing on the defaults or with only the master switch on', () => {
    expect(changedCheats(DEFAULT_CHEATS)).toBe(0);
    expect(changedCheats({ ...DEFAULT_CHEATS, enabled: true })).toBe(0);
  });

  it('counts each parameter that differs from its default', () => {
    expect(changedCheats({ ...DEFAULT_CHEATS, playerMaxEn: 600 })).toBe(1);
    expect(
      changedCheats({
        ...DEFAULT_CHEATS,
        enabled: true,
        playerHpMultiplier: 3,
        damageCutMultiplier: 0,
        lowHpSupers: true,
        brHpPerKill: 0,
      }),
    ).toBe(4);
  });

  it('counts all thirteen parameters, the master excluded', () => {
    expect(
      changedCheats({
        enabled: true,
        playerHpMultiplier: 2,
        playerMaxEn: 100,
        unlimitedEn: true,
        enemyHpMultiplier: 2,
        playerDamageMultiplier: 2,
        partnerHpMultiplier: 2,
        enemyStocksMultiplier: 2,
        lowHpLine: 0,
        damageCutMultiplier: 0,
        lowHpSupers: true,
        brNoPartner: true,
        brHpPerKill: 1000,
        brEnPerKill: 1000,
      }),
    ).toBe(13);
  });

  it('reads zero again after a reset to the defaults', () => {
    expect(changedCheats(normalizeCheats(null))).toBe(0);
    expect(changedCheats({ ...DEFAULT_CHEATS })).toBe(0);
  });
});
