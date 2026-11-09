// The Cheats menu's settings (authored, HPA-767). Pure model: the browser
// storage lives in App.svelte, the pending values and the per-battle
// snapshot in scene.ts and Match. All combat effects are gated on
// `enabled`; with it off every value below is native.

export interface CheatOptions {
  // The master switch: an enabled switch marks a battle as cheated even
  // with neutral multipliers.
  enabled: boolean;
  // 1P's maximum and starting life, ×0.5–×5.
  playerHpMultiplier: number;
  // 1P's stock cap, whole stocks 1–6.
  playerEnLimit: number;
  // Refills 1P's stock to the cap every active tick.
  unlimitedEn: boolean;
  // The maximum and starting life of every fighter hostile to 1P, ×0.1–×5.
  enemyHpMultiplier: number;
  // 1P's positive outgoing attack damage to hostile targets, ×0.5–×10.
  playerDamageMultiplier: number;
}

export const DEFAULT_CHEATS: CheatOptions = {
  enabled: false,
  playerHpMultiplier: 1,
  playerEnLimit: 3,
  unlimitedEn: false,
  enemyHpMultiplier: 1,
  playerDamageMultiplier: 1,
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
      0.5,
      5,
      DEFAULT_CHEATS.playerHpMultiplier,
    ),
    playerEnLimit: Math.round(
      bounded(raw.playerEnLimit, 1, 6, DEFAULT_CHEATS.playerEnLimit),
    ),
    unlimitedEn: flagOf(raw.unlimitedEn, DEFAULT_CHEATS.unlimitedEn),
    enemyHpMultiplier: bounded(
      raw.enemyHpMultiplier,
      0.1,
      5,
      DEFAULT_CHEATS.enemyHpMultiplier,
    ),
    playerDamageMultiplier: bounded(
      raw.playerDamageMultiplier,
      0.5,
      10,
      DEFAULT_CHEATS.playerDamageMultiplier,
    ),
  };
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
