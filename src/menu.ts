import type { MeResult, ProfileUser } from './auth/api';
import {
  DEFAULT_CHEATS,
  changedCheats as changedCheatsOf,
  normalizeCheats,
  readCheats,
} from './game/cheats';
import type { CheatOptions } from './game/cheats';
import type { DummyBehavior } from './game/dummy';
import type { Mode } from './game/match';
import type { Stage, Who } from './game/characters';
import { GRID, NAMEPLATES, ROSTER, XS, YS } from './instructions/fighters';

// The Cheats menu's settings persist as one JSON object under this key,
// on the device alone (authored, HPA-767).
export const CHEATS_KEY = 'scwu.cheats';

// Reads the saved cheats. A storage that throws (denied, full, sandboxed)
// reads as never saved, so the Menu opens on the defaults.
export const loadCheats = (
  read: (key: string) => string | null,
): CheatOptions => {
  try {
    return readCheats(read(CHEATS_KEY));
  } catch {
    return { ...DEFAULT_CHEATS };
  }
};

// Saves the cheats. A failed write is swallowed: the setting stays usable
// for this visit, just not restored on a reload.
export const saveCheats = (
  write: (key: string, value: string) => void,
  cheats: CheatOptions,
) => {
  try {
    write(CHEATS_KEY, JSON.stringify(cheats));
  } catch {
    // Nothing more can be done without storage.
  }
};

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

// ---- HPA-972: the pause Menu's data, kept out of Menu.svelte so it stays
// unit-testable and the component renders only ----

// The Match tab's stage picker, with each stage's display name (App's
// loading overlay reads it too).
export const STAGE_LABELS: Record<Stage, string> = {
  court: 'Sport Court',
  train: 'Train Morning',
  sakuranight: 'Sakura Night',
  trainnight: 'Train Night',
  dojin: 'Dojin BKG',
  japan: 'Japan Street',
  park: 'Park Morning',
  parknight: 'Park Night',
  sakura: 'Sakura Street',
  greek: 'Greek',
  space: 'Space',
  boss: 'Boss Base',
  office: 'ZM Office',
  office2: 'ZM Office T2',
  brboss: 'BR Boss Base',
  gi: 'GI Stage',
  spacenight: 'Space Night',
  streetnight: 'Street Night',
};

// The Opponent select's practice partners.
export const PARTNER_LABELS: Record<DummyBehavior, string> = {
  stand: 'Stand',
  guard: 'Guard',
  crouchGuard: 'Crouch guard',
  airGuard: 'Air guard',
  attack: 'Attack',
  jumpIn: 'Jump in',
  cpu: 'CPU partner',
};

// A parameter row of the Cheats tab: switches toggle, steppers step by
// `step` within [min, max], and the two nullable B.R. awards are typed
// number inputs (blank = Game). `digits` marks Max EN, whose value shows
// the game's own stock-digit art.
export interface CheatRow {
  field: Exclude<keyof CheatOptions, 'enabled'>;
  label: string;
  kind: 'switch' | 'stepper' | 'input';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  digits?: boolean;
  help: string;
}

export const CHEAT_GROUPS: { name: string; rows: CheatRow[] }[] = [
  {
    name: 'You · 1P',
    rows: [
      {
        field: 'playerHpMultiplier',
        label: 'HP ×',
        kind: 'stepper',
        min: 1,
        max: 100,
        step: 1,
        suffix: '×',
        help: 'Multiplies 1P’s maximum and starting life, 1–100.',
      },
      {
        field: 'playerDamageMultiplier',
        label: 'Damage ×',
        kind: 'stepper',
        min: 1,
        max: 100,
        step: 1,
        suffix: '×',
        help: 'Multiplies 1P’s attack damage to hostiles only, 1–100.',
      },
      {
        field: 'playerMaxEn',
        label: 'Max EN',
        kind: 'stepper',
        min: 100,
        max: 1000,
        step: 100,
        suffix: 'EN',
        digits: true,
        help: '1P’s EN cap in hundreds: 1–10 stocks. The gauge shows the game’s own digit.',
      },
      {
        field: 'unlimitedEn',
        label: 'Unlimited EN',
        kind: 'switch',
        help: 'Refills 1P’s EN to the cap every tick.',
      },
    ],
  },
  {
    name: 'Low HP · all fighters',
    rows: [
      {
        field: 'lowHpLine',
        label: 'Low HP line',
        kind: 'stepper',
        min: 0,
        max: 100,
        step: 10,
        suffix: '%',
        help: 'The share of max HP where every fighter’s low-HP state starts.',
      },
      {
        field: 'damageCutMultiplier',
        label: 'Damage cut ×',
        kind: 'stepper',
        min: 0,
        max: 5,
        step: 1,
        suffix: '×',
        help: 'Scales every fighter’s low-HP damage reduction, 0–5; ×0 removes it, and it caps at 100%.',
      },
      {
        field: 'lowHpSupers',
        label: 'Supers at any HP · 1P only',
        kind: 'switch',
        help: 'Lets 1P cast the supers whose source gates them behind low HP at any HP.',
      },
    ],
  },
  {
    name: 'Partners & enemies',
    rows: [
      {
        field: 'partnerHpMultiplier',
        label: 'Partner HP ×',
        kind: 'stepper',
        min: 1,
        max: 100,
        step: 1,
        suffix: '×',
        help: 'Multiplies every ally’s life: story, B.R. and summoned partners.',
      },
      {
        field: 'enemyHpMultiplier',
        label: 'Enemy HP ×',
        kind: 'stepper',
        min: 1,
        max: 100,
        step: 1,
        suffix: '×',
        help: 'Multiplies every hostile CPU’s life, summoned enemies included.',
      },
      {
        field: 'enemyStocksMultiplier',
        label: 'Enemy EN stocks ×',
        kind: 'stepper',
        min: 1,
        max: 5,
        step: 1,
        suffix: 'stocks',
        help: 'Multiplies hostiles’ EN stock cap, up to 10 stocks.',
      },
    ],
  },
  {
    name: 'B.R. modes',
    rows: [
      {
        field: 'brNoPartner',
        label: 'No partner',
        kind: 'switch',
        help: 'B.R. runs seat no native ally, from the next battle on.',
      },
      {
        field: 'brHpPerKill',
        label: 'HP per kill',
        kind: 'input',
        min: 0,
        max: 1000,
        help: 'Replaces the life a B.R. kill awards 1P, 0–1000; blank keeps the game’s own.',
      },
      {
        field: 'brEnPerKill',
        label: 'EN per kill',
        kind: 'input',
        min: 0,
        max: 1000,
        help: 'Replaces the EN a B.R. kill awards 1P, 0–1000; blank keeps the game’s own.',
      },
    ],
  },
];

export const CHEAT_ROWS: CheatRow[] = CHEAT_GROUPS.flatMap(
  (group) => group.rows,
);

// The count the Cheats tab header shows: parameters changed, master switch
// excluded (cheats.ts's own count).
export const changedCheats = changedCheatsOf;

// One ◀/▶ press on a stepper or switch row. Numeric rows clamp to their
// range through normalizeCheats; switches toggle either way.
export const stepCheat = (
  cheats: CheatOptions,
  field: CheatRow['field'],
  delta: 1 | -1,
): CheatOptions => {
  const row = CHEAT_ROWS.find((entry) => entry.field === field)!;
  if (row.kind === 'switch') return { ...cheats, [field]: !cheats[field] };
  const next =
    (cheats[field] as number) +
    delta * (row.kind === 'stepper' ? row.step! : 1);
  return normalizeCheats({ ...cheats, [field]: next });
};

// Reset all: the whole settings object back to the defaults.
export const resetCheats = (): CheatOptions => ({ ...DEFAULT_CHEATS });

// Whether a parameter row shows as changed (gold, per the mockup).
export const isChangedCheat = (
  cheats: CheatOptions,
  field: CheatRow['field'],
) => cheats[field] !== DEFAULT_CHEATS[field];

// ---- Summon (HPA-972) ----

// The summonable roster: every fighter but TRAINING, in roster order.
export const summonables: readonly { id: Who; name: string; plate: string }[] =
  ROSTER.filter((entry) => entry.id !== 'training').map((entry) => ({
    id: entry.id,
    name: entry.name,
    plate: NAMEPLATES[entry.id],
  }));

// The summon grid's columns (the select sheet's own 8).
export const SUMMON_COLUMNS = 8;

// A fighter's tile origin on the select face sheet, or null for one the
// grid holds no cell for.
export const tileOf = (who: Who): { x: number; y: number } | null => {
  const index = GRID.indexOf(who);
  if (index < 0) return null;
  return {
    x: XS[index % XS.length],
    y: YS[Math.floor(index / XS.length)] + (index % 2 ? 7 : 0),
  };
};

// One grid step: WASD or the arrows, over `columns` — the rendered grid's
// own column count (the stylesheet holds 8 desktop, 4 at phone width).
// Rows never wrap sideways; up/down clamp at the first and last filled
// cell, the last row being partial.
export const summonStep = (
  index: number,
  count: number,
  key: string,
  columns: number = SUMMON_COLUMNS,
): number => {
  const column = index % columns;
  const by = (delta: number) => Math.min(count - 1, Math.max(0, index + delta));
  switch (key) {
    case 'w':
    case 'W':
    case 'ArrowUp':
      return by(-columns);
    case 's':
    case 'S':
    case 'ArrowDown':
      return by(columns);
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return column > 0 ? index - 1 : index;
    case 'd':
    case 'D':
    case 'ArrowRight':
      return column < columns - 1 && index < count - 1 ? index + 1 : index;
    default:
      return index;
  }
};

// Tab flips between the enemies' and the 1P's side.
export const toggleSide = (side: -1 | 1): -1 | 1 => (side === 1 ? -1 : 1);
