// The Cheats menu's settings (authored, HPA-767; HPA-972 expansion). Pure
// model: the browser storage lives in App.svelte, the pending values and
// the per-battle snapshot in scene.ts and Match. All combat effects are
// gated on `enabled`; with it off every value below is native.

export interface CheatOptions {
  // The master switch: an enabled switch marks a battle as cheated even
  // with neutral multipliers.
  enabled: boolean;
  // 1P's maximum and starting life, ×1–×100 (HPA-972 re-bounds the old
  // ×0.5–×5 to the design table's shared multiplier range).
  playerHpMultiplier: number;
  // 1P's maximum EN in hundreds of a stock, 100–1000 by 100: the stock
  // cap is the value / 100 (authored, HPA-972).
  playerMaxEn: number;
  // Refills 1P's stock to the cap every active tick.
  unlimitedEn: boolean;
  // The maximum and starting life of every fighter hostile to 1P, ×1–×100
  // (HPA-972).
  enemyHpMultiplier: number;
  // 1P's positive outgoing attack damage to hostile targets, ×1–×100
  // (HPA-972).
  playerDamageMultiplier: number;
  // The maximum and starting life of every 1P ally, ×1–×100 (HPA-972).
  partnerHpMultiplier: number;
  // Hostiles' stock cap multiplier, whole ×1–×5 up to 10 stocks (HPA-972).
  enemyStocksMultiplier: number;
  // 1P's low-life line, whole percent 0–100 of the effective maximum;
  // the native line is 30 (HPA-972).
  lowHpLine: number;
  // Scales 1P's native low-life damage reduction, ×0–×5 (HPA-972).
  damageCutMultiplier: number;
  // Lets 1P pass the verified low-HP super gates at any HP (HPA-972).
  lowHpSupers: boolean;
  // Omits a B.R. battle's native ally when the snapshot installs (HPA-972).
  brNoPartner: boolean;
  // Replaces a B.R. kill's HP award to 1P, 0–1000 native HP units; null
  // keeps the source Game's amount (HPA-972).
  brHpPerKill: number | null;
  // Replaces a B.R. kill's EN award to 1P, 0–1000 native EN units; null
  // keeps the source Game's amount (HPA-972).
  brEnPerKill: number | null;
}

export const DEFAULT_CHEATS: CheatOptions = {
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
};

// A number field: non-numbers and non-finite values fall back to their
// default, finite ones clamp to their range.
const bounded = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

// A boolean field: only true and false pass, anything else the default.
const flagOf = (value: unknown, fallback: boolean) =>
  value === true || value === false ? value : fallback;

// A nullable whole-number field (HPA-972's B.R. per-kill awards): blank —
// null, absent, or not a finite number — keeps the null "Game" default,
// finite ones clamp their rounded value into the range, 0 included.
const nullableBounded = (value: unknown, min: number, max: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, Math.round(value)));
};

// Normalizes any stored or passed value into a fresh, safe options object.
// No versioning or migrations: what does not read cleanly is dropped.
export function normalizeCheats(value: unknown): CheatOptions {
  const raw = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Partial<Record<keyof CheatOptions, unknown>>;
  return {
    enabled: flagOf(raw.enabled, DEFAULT_CHEATS.enabled),
    playerHpMultiplier: bounded(
      raw.playerHpMultiplier,
      1,
      100,
      DEFAULT_CHEATS.playerHpMultiplier,
    ),
    playerMaxEn:
      Math.round(
        bounded(raw.playerMaxEn, 100, 1000, DEFAULT_CHEATS.playerMaxEn) / 100,
      ) * 100,
    unlimitedEn: flagOf(raw.unlimitedEn, DEFAULT_CHEATS.unlimitedEn),
    enemyHpMultiplier: bounded(
      raw.enemyHpMultiplier,
      1,
      100,
      DEFAULT_CHEATS.enemyHpMultiplier,
    ),
    playerDamageMultiplier: bounded(
      raw.playerDamageMultiplier,
      1,
      100,
      DEFAULT_CHEATS.playerDamageMultiplier,
    ),
    partnerHpMultiplier: bounded(
      raw.partnerHpMultiplier,
      1,
      100,
      DEFAULT_CHEATS.partnerHpMultiplier,
    ),
    enemyStocksMultiplier: Math.round(
      bounded(
        raw.enemyStocksMultiplier,
        1,
        5,
        DEFAULT_CHEATS.enemyStocksMultiplier,
      ),
    ),
    lowHpLine: Math.round(
      bounded(raw.lowHpLine, 0, 100, DEFAULT_CHEATS.lowHpLine),
    ),
    damageCutMultiplier: bounded(
      raw.damageCutMultiplier,
      0,
      5,
      DEFAULT_CHEATS.damageCutMultiplier,
    ),
    lowHpSupers: flagOf(raw.lowHpSupers, DEFAULT_CHEATS.lowHpSupers),
    brNoPartner: flagOf(raw.brNoPartner, DEFAULT_CHEATS.brNoPartner),
    brHpPerKill: nullableBounded(raw.brHpPerKill, 0, 1000),
    brEnPerKill: nullableBounded(raw.brEnPerKill, 0, 1000),
  };
}

// The positive EN fill multiplier by effective stock cap (authored,
// HPA-972): three stocks fill at the native speed, five at double, ten at
// 4.5×, and a low cap never slows the fill. A stock-count rule, not a
// claim about native EN per stock (DoraEmon holds 90).
export const enGainOf = (stocks: number): number =>
  Math.max(1, 1 + (stocks - 3) / 2);

// The cheats a mid-battle summon alone takes (authored, HPA-972): the
// battle's snapshot when it was already cheat-enabled, otherwise a cheat
// mode the player turned on mid-battle (still pending for the next
// battle); with both off, the unscaled defaults.
export const effectiveSummonCheats = (
  snapshot: Readonly<CheatOptions>,
  pending: Readonly<CheatOptions> = DEFAULT_CHEATS,
): CheatOptions => (snapshot.enabled ? { ...snapshot } : { ...pending });

// Counts the parameters that differ from the defaults, excluding the
// master switch: the Cheats tab shows this count next to Reset all, and
// flipping the switch alone is not a change (authored, HPA-972).
export function changedCheats(value: CheatOptions): number {
  let count = 0;
  for (const key of Object.keys(DEFAULT_CHEATS) as (keyof CheatOptions)[]) {
    if (key !== 'enabled' && value[key] !== DEFAULT_CHEATS[key]) count += 1;
  }
  return count;
}

// Reads the settings string the browser stored: absent, empty or malformed
// storage yields the defaults.
export function readCheats(raw: string | null): CheatOptions {
  if (raw === null) return { ...DEFAULT_CHEATS };
  try {
    return normalizeCheats(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CHEATS };
  }
}
