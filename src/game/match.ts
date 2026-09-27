// New MVP rules. These are intentionally separate from recovered idle semantics.
import {
  animationDuration,
  DST_TOSS_TICK,
  dstHold,
  eventsAt,
  isScripted,
  RESPONSES,
  script,
  SCRIPTED,
  THROW_RELEASE_TICK,
  throwHold,
} from './animations';
import type {
  Action,
  AnimatedAction,
  ScriptedAction,
  ScriptEvent,
} from './animations';
import { CPU_LEVEL, CpuVM, RYUKO_CPU } from './cpu';
import { dummyInput } from './dummy';
import type { DummyBehavior } from './dummy';
import { ROUND_END_TICKS } from './hud';
export const SUPER_CONTROLS = [
  'getterBeam',
  'musashi',
  'changeAttack',
  'blackRush',
  'megaBeam',
] as const;
export type SuperControl = (typeof SUPER_CONTROLS)[number];
export type Control =
  | 'left'
  | 'right'
  | 'jump'
  | 'crouch'
  | 'punch'
  | 'kick'
  | 'hitUp'
  | 'iori'
  | 'guard'
  | 'dash'
  | 'drill'
  | 'axe'
  | 'throw'
  | 'dst'
  | 'cpuIori'
  | SuperControl;
export type Input = Partial<Record<Control, boolean>>;
export type Mode = 'practice' | 'cpu';
// Free-practice settings (authored): the partner's behavior, stock topped up
// to three whenever a fighter is idle, and Ryuko's health held at 30%.
export interface PracticeOptions {
  partner: DummyBehavior;
  maxStock: boolean;
  lowHealth: boolean;
}
export const TICK_MS = 10;
export const WIDTH = 960;
// The source camera views 640 pixels of a 1280-pixel stage.
export const STAGE_WIDTH = 1920;
export const HEIGHT = 720;
export const GROUND = 636;
// Reserve the extended air dash (181.5px) and throw/recovery poses, including rounding.
// Keep one wall for every state so changing pose never relocates a fighter.
export const FIGHTER_MARGIN = 185;
export const ATTACKS = {
  punch: { startup: 7, active: 5, range: 145, damage: 8 },
  kick: { startup: 10, active: 7, range: 190, damage: 13 },
  crouchPunch: { startup: 14, active: 10, range: 175, damage: 8 },
  crouchKick: { startup: 18, active: 15, range: 195, damage: 13 },
  airPunch: { startup: 18, active: 19, range: 150, damage: 8 },
  airKick: { startup: 15, active: 24, range: 180, damage: 13 },
  punch2: { startup: 18, active: 18, range: 205, damage: 10 },
  punch3: { startup: 36, active: 20, range: 235, damage: 16 },
  kick2: { startup: 13, active: 16, range: 205, damage: 14 },
  hitUp: { startup: 15, active: 10, range: 165, damage: 15 },
  iori: { startup: 21, active: 8, range: 180, damage: 10 },
  iori2: { startup: 23, active: 8, range: 220, damage: 12 },
  iori3: { startup: 21, active: 5, range: 195, damage: 16 },
  kick3: { startup: 15, active: 48, range: 225, damage: 17 },
  drill: { startup: 23, active: 36, range: 310, damage: 18 },
  // The short diagonal drill reaches ~125px, plus the opponent's ~55px body.
  airDrill: { startup: 22, active: 0, range: 180, damage: 16 },
  airDrillSpin: { startup: 0, active: Infinity, range: 180, damage: 16 },
};
// Recovered strike/gap cycles. Damage above is the total for a complete move.
const multiHits: Partial<
  Record<
    keyof typeof ATTACKS,
    { interval: number; active: number; count: number }
  >
> = {
  punch2: { interval: 6, active: 3, count: 3 },
  airKick: { interval: 8, active: 4, count: 3 },
  kick3: { interval: 6, active: 3, count: 8 },
  drill: { interval: 6, active: 3, count: 6 },
};
// Ryuko's op 0x17 selects the victim response by stance: standing, crouching,
// airborne, then the same three while guarding. Each response names a victim
// action (RESPONSE_REACTIONS), whose op 0x1a pauses both fighters. These are
// contact pauses, not active-frame gaps; SCWU.KGT's base pause is zero. Punch 2
// and the drill switch sets before their last strike (`last`).
const ATTACK_RESPONSES: Record<
  keyof typeof ATTACKS,
  { ids: number[]; last?: number[] }
> = {
  punch: { ids: [1, 1, 2, 22, 23, 2] }, // PC 2366
  kick: { ids: [1, 1, 2, 22, 23, 2] }, // PC 2558
  crouchPunch: { ids: [3, 3, 4, 25, 26, 4] }, // PC 2540
  crouchKick: { ids: [7, 7, 7, 25, 26, 7] }, // PC 2731
  // Air attacks hit a crouching guard (response 5/6) and push a standing one.
  airPunch: { ids: [5, 5, 4, 28, 5, 27] }, // PC 2476
  airKick: { ids: [6, 6, 11, 28, 6, 27] }, // PC 2648
  punch2: { ids: [8, 8, 9, 22, 23, 9], last: [10, 10, 11, 22, 23, 11] }, // PCs 2400/2413
  punch3: { ids: [77, 77, 77, 25, 77, 27] }, // PC 2453
  kick2: { ids: [3, 3, 4, 25, 26, 4] }, // PC 2594
  kick3: { ids: [20, 20, 21, 34, 35, 36] }, // PC 2631 (action 190)
  hitUp: { ids: [19, 19, 17, 25, 26, 17] }, // PC 2823
  iori: { ids: [3, 3, 4, 28, 29, 27] }, // PC 3619
  iori2: { ids: [71, 71, 4, 28, 29, 27] }, // PC 3655
  iori3: { ids: [18, 18, 77, 25, 26, 27] }, // PC 3689
  drill: { ids: [10, 10, 11, 25, 26, 27], last: [18, 18, 18, 28, 29, 27] }, // PCs 2920/2941
  // Action 208 has no response of its own; its spins (209–211) strike.
  airDrill: { ids: [56, 56, 56, 34, 35, 80] },
  airDrillSpin: { ids: [56, 56, 56, 34, 35, 80] }, // PCs 2984/3014
};
// Authored impact effect weight: heavy impacts add the 348 streak.
const heavyImpacts = new Set<Action>([
  'crouchPunch',
  'crouchKick',
  'airPunch',
  'airKick',
  'punch3',
  'kick2',
  'hitUp',
  'iori',
  'iori2',
  'iori3',
  'drill',
  'airDrill',
  'airDrillSpin',
]);
const followUps = { iori: 'iori2', iori2: 'iori3' } as const;
// Op 0x24 (handler 0x413a50) at these action ages runs the command check at
// 0x410a50 over the last `window` ticks of input: the newest fresh P (checked
// first) or K press, preceded by a neutral frame. A match enters that attack.
const CHAINS: Partial<
  Record<
    Action,
    {
      checks: [age: number, window: number][];
      next: [AnimatedAction, AnimatedAction];
    }
  >
> = {
  punchHit: { checks: [[8, 20]], next: ['punch2', 'kick2'] }, // PCs 2380–2381
  kickHit: { checks: [[8, 25]], next: ['punch2', 'kick2'] }, // PCs 2572–2573
  // PCs 2403–2404, 2409–2410 and 2416–2417, after each strike.
  punch2: {
    checks: [
      [21, 10],
      [27, 10],
      [33, 30],
    ],
    next: ['punch3', 'kick3'],
  },
  kick2: { checks: [[26, 30]], next: ['punch3', 'kick3'] }, // PCs 2597–2598
};
// Op 0x1e cancel windows, read at 0x41193a: from `age` (until `until`), a
// command whose action level (header byte 2: normals 21–22, specials 31,
// supers 41, Mega Getter Beam 42, double jump 255) lies in [min, max] cancels
// the action, always or once the action's own box has connected (`contact`:
// the counter at player +0xdf85 that op 0x18 arms and a contact raises to 2).
const cancelRange = (
  min: number,
  max: number,
  contact = true,
  age = 0,
  until?: number,
) => ({ min, max, contact, age, until });
const CANCELS: Partial<Record<Action, ReturnType<typeof cancelRange>>> = {
  punch: cancelRange(30, 50), // 178
  kick: cancelRange(30, 50), // 186
  crouchPunch: cancelRange(30, 50), // 185
  crouchKick: cancelRange(30, 50), // 194
  punch2: cancelRange(30, 50), // 180
  kick2: cancelRange(30, 50), // 188
  punchHit: cancelRange(30, 50, false), // 179
  kickHit: cancelRange(30, 50, false), // 187
  airPunch: cancelRange(22, 255), // 182
  airKick: cancelRange(30, 255), // 191
  // IORI's stages accept supers (41) but not specials or the Mega Getter Beam.
  iori: cancelRange(32, 41), // 246
  iori2: cancelRange(32, 41), // 247
  iori3: cancelRange(32, 41), // 248
  airDash: cancelRange(20, 50, false, 3), // 16
  airBackdash: cancelRange(20, 50, false, 3), // 17
  counterHit: cancelRange(30, 50, true, 0, 50), // 174
};
const IORI = new Set<Action>(['iori', 'iori2', 'iori3']);
// A super entered while op 0x1f player variable 6 is 100 (set during each IORI
// stage, PCs 3606/3638/3673) takes its super-cancel path. Getter Beam checks
// it itself (PC 3972 → 265); the others go through action 254, which needs
// two stocks (else NO SUPER), spends them and spawns GENGAI! (253). The hidden
// super's entry (254 + 9) also enters NO SUPER at 150 life or more.
const SUPER_CANCELS: Partial<
  Record<
    SuperControl,
    { action: ScriptedAction; via254: boolean; life?: number }
  >
> = {
  getterBeam: { action: 'scGetterBeam', via254: false },
  musashi: { action: 'scMusashi', via254: true }, // 254 + 0 → 260
  changeAttack: { action: 'scChangeAttack', via254: true }, // 254 + 14 → 318
  blackRush: { action: 'blackRush', via254: true, life: 150 }, // 254 + 9 → 286 + 5
};
// Op 0x24 in the standing and crouching guard reactions: with a stock (their
// op 0x10 otherwise enters a twin without these checks), a fresh Hit Up
// button press (0x2020) in the last `window` ticks enters COUNTER HIT (174).
const guardChecks = (first: number): [age: number, window: number][] =>
  first === 8
    ? [
        [0, 8],
        [8, 10],
        [18, 10],
      ]
    : [
        [0, 10],
        [3, 10],
        [6, 10],
        [9, 10],
        [19, 13],
      ];
const GUARD_COUNTERS: Partial<Record<Action, [number, number][]>> = {
  block: guardChecks(8), // 149, PCs 2016/2018/2021
  crouchBlock: guardChecks(8), // 151, PCs 2040/2042/2045
  blockHeavy: guardChecks(10), // 154, PCs 2073–2083
  crouchBlockHeavy: guardChecks(10), // 156, PCs 2105–2115
  blockStop: guardChecks(10), // 159, PCs 2146–2156
  crouchBlockStop: guardChecks(10), // 161, PCs 2177–2187
  blockRapid: guardChecks(10), // 163, PCs 2207–2217
  crouchBlockRapid: guardChecks(10), // 165, PCs 2237–2247
  timeStopGuard: guardChecks(10), // 168, PCs 2275–2283
  crouchTimeStopGuard: guardChecks(10), // 170, PCs 2300–2308
};
// The input history those checks read: direction and fresh buttons per tick.
interface InputFrame {
  neutral: boolean;
  punch: boolean;
  kick: boolean;
  hitUp: boolean;
}
const HISTORY_TICKS = 30;
// Newest fresh press first, then (for two-step commands) an earlier neutral frame.
function commanded(
  history: InputFrame[],
  button: 'punch' | 'kick' | 'hitUp',
  window: number,
  afterNeutral = true,
) {
  let pressed = false;
  for (let i = history.length - 1; i >= history.length - window && i >= 0; i--)
    if (!pressed) {
      pressed = history[i][button];
      if (pressed && !afterNeutral) return true;
    } else if (history[i].neutral) return true;
  return false;
}
const dashes = new Set<Action>(['dash', 'backdash', 'airDash', 'airBackdash']);
const aerialDrills = new Set<Action>([
  'airDrill',
  'airDrillSpin',
  'airDrillContact',
]);
const AIR_DRILL_DAMAGE = [16, 5, 3, 1];
// Opcode 1 uses 16.16 velocity scaled by floor(65536 / 100) at speed 10.
// Convert the recovered source velocities to the web's 1.5-scale arena.
const SOURCE_VELOCITY_SCALE = (655 / 65536) * 1.5;
// Opcode 1 acceleration uses floor(0x3c0000 / 100²) in the same 16.16 units.
const SOURCE_ACCELERATION_SCALE = (393 / 65536) * 1.5;
const JUMP_GRAVITY = 80 * SOURCE_ACCELERATION_SCALE;
// Op 0x01 in each grounded reaction: raw velocity and acceleration from its
// first moving tick (after the impact displays), until `until` or its end.
const slide = (start: number, velocity: number, acceleration = 0) => ({
  start,
  velocity,
  acceleration,
});
const reactionSlides: Partial<
  Record<Action, ReturnType<typeof slide> & { until?: number }>
> = {
  hit: { ...slide(5, -280), until: 25 }, // 73, PCs 758–760
  hitHeavy: slide(9, -650, 10), // 75, PC 800
  jumpHit: slide(9, -250, 10), // 77, PC 845
  hitPull: slide(9, 650, -10), // 121, PC 1602
  block: slide(8, -320), // 149, PC 2019
  crouchBlock: slide(8, -320), // 151, PC 2043
  blockHeavy: slide(9, -650, 8), // 154, PC 2081
  crouchBlockHeavy: slide(9, -650, 8), // 156, PC 2113
  blockStop: slide(9, -250, 8), // 159, PC 2154
  crouchBlockStop: slide(9, -250, 8), // 161, PC 2185
  blockRapid: slide(9, -650, 8), // 163, PC 2215
  crouchBlockRapid: slide(9, -650, 8), // 165, PC 2245
  // Unclamped: the beam hit stops at its 25th moving tick, then drifts back in.
  hitRapid: slide(1, -150, 10), // 83, PC 954
};
// Air reactions without a landing handler play the op 0x01 commands of their
// flattened scripts; move() ends them on landing (0x411810).
const AIR_REACTIONS: Partial<Record<Action, number>> = {
  airHit: 74, // PCs 774/778: rise at raw 100, then −300/−650, ax 1, gravity 66
  airHitHeavy: 76, // PCs 816/823: the same, then −300/−850 at age 6
  airHitRapid: 84, // PCs 979/990: drift at −100, then −400/−830, gravity 80
  airBlock: 153, // PCs 2060/2063: −420, ax −15, gravity 70; vy 0 at age 3
  airBlockHeavy: 158, // PCs 2133/2136: −450 and vy 0 at age 6
  airBlockRapid: 167, // PCs 2263/2266: as 158
  airTimeStopGuard: 172, // PC 2323: falls from rest at gravity 70
};
// Motion starts at the listed action age; landing enters the next action.
// Commands before a reaction's first display apply on its first moving tick.
const launchMotion: Partial<
  Record<
    Action,
    {
      tick: number;
      vx: number;
      vy: number;
      gravity: number;
      land: AnimatedAction;
      // Raw horizontal velocity before the launch, with no fall.
      drift?: number;
    }
  >
> = {
  launchUp: { tick: 25, vx: -160, vy: -1700, gravity: 60, land: 'knockdown' },
  launchAway: { tick: 6, vx: -600, vy: -1220, gravity: 90, land: 'knockdown' },
  // Crouching kick response 7 selects action 79: a lower pop into knockdown.
  sweep: { tick: 6, vx: -300, vy: -1020, gravity: 90, land: 'knockdown' },
  launchDown: { tick: 9, vx: -500, vy: 2000, gravity: 100, land: 'slamBounce' },
  // Air Drill response 56 → action 135 (PC 1841); its landing branch enters 124.
  drillDown: { tick: 1, vx: -800, vy: 2000, gravity: 100, land: 'slamBounce' },
  slamBounce: { tick: 10, vx: -400, vy: -700, gravity: 70, land: 'bounceDown' },
  // DST response 31 → action 129 (PC 1747); its landing branch at PC 1756.
  dstToss: { tick: 1, vx: -200, vy: -3000, gravity: 90, land: 'tossBounce' },
  tossBounce: { tick: 10, vx: -100, vy: -1000, gravity: 80, land: 'knockdown' },
  // Missile response 32 → action 85 (PC 1002); its landing branch at PC 1011.
  twist: { tick: 1, vx: -500, vy: -1700, gravity: 90, land: 'twistBounce' },
  twistBounce: { tick: 5, vx: -200, vy: -1200, gravity: 90, land: 'knockdown' },
  // Response 43 → action 97 (PC 1186), spinning in 98 until its landing → 146.
  fly: { tick: 6, vx: -100, vy: -2400, gravity: 90, land: 'knockdown' },
  // Response 76 → action 122 in the air: PC 1616 drifts, PC 1628 launches,
  // and its landing handler (slot 1, PC 1627) enters 146.
  rushAirHit: {
    tick: 9,
    vx: -400,
    vy: -830,
    gravity: 80,
    land: 'knockdown',
    drift: -100,
  },
};
const hasMotion = (action: Action) =>
  Object.hasOwn(reactionSlides, action) ||
  Object.hasOwn(launchMotion, action) ||
  Object.hasOwn(AIR_REACTIONS, action);
// Ryuko's parameter block (file offset 0x157a1d9): 100 power per stock, three
// stocks, none at the start. Routine 0x40e6f0 carries and borrows between them.
export const POWER_PER_STOCK = 100;
export const MAX_STOCK = 3;
// The same block's 30% (153 of 510 life) selects desperation branches.
export const DESPERATION_HP = 30;
// Opcode 0x15 self power in each attack's script, credited when it starts.
const ATTACK_POWER: Partial<Record<Action, number>> = {
  punch2: 3,
  punch3: 23,
  airPunch: 5,
  crouchPunch: 5,
  kick2: 3,
  kick3: 16,
  airKick: 5,
  crouchKick: 5,
  hitUp: 5,
  drill: 8,
  airDrill: 8,
  iori: 8,
  iori2: 3,
  iori3: 3,
  dst: 8,
  evilDst: 8,
};
// Victim reaction scripts add opcode 0x15 power to themselves and the attacker.
const REACTION_POWER: Partial<Record<Action, [number, number]>> = {
  hit: [3, 2],
  airHit: [3, 2],
  hitRapid: [1, 0],
  airHitRapid: [1, 0],
  block: [1, 0],
  crouchBlock: [1, 0],
  airBlock: [1, 0],
  blockHeavy: [3, 0],
  crouchBlockHeavy: [3, 0],
  airBlockHeavy: [3, 0],
  blockStop: [5, 0],
  crouchBlockStop: [5, 0],
  blockRapid: [2, 0],
  crouchBlockRapid: [2, 0],
  airBlockRapid: [2, 0],
  timeStopGuard: [2, 0],
  crouchTimeStopGuard: [2, 0],
  airTimeStopGuard: [2, 0],
  rushAirHit: [1, 0],
};
for (const action of [
  'hitHeavy',
  'airHitHeavy',
  'jumpHit',
  'launchUp',
  'launchAway',
  'sweep',
  'hitPull',
  'launchDown',
  'twist',
  'fly',
] as const)
  REACTION_POWER[action] = [5, 3];
// Action 135 credits only the victim.
REACTION_POWER.drillDown = [5, 0];
const DOUBLE_TAP_TICKS = 20;
// Action 33 walks at raw velocity 200 until PC 339, after its first 50 ticks.
const INTRO_WALK_TICKS = 50;
const INTRO_WALK = INTRO_WALK_TICKS * 200 * SOURCE_VELOCITY_SCALE;
export const AXE_RELEASE_TICK = 16;
export { THROW_RELEASE_TICK } from './animations';
const THROW_STARTUP = 7;
const THROW_RANGE = 115;
const THROW_DAMAGE = 18;
// Action 214's one-tick grab box reaches 137 source pixels, versus 76 for the
// normal grab (196). Its range and both damages are training rules.
// PC 3082 (op 0x11) enters EVIL DST (221) at 153 of 510 life or less; its box
// and timing match 214's.
const DST_STARTUP = 4;
const DST_RANGE = THROW_RANGE + (137 - 76) * 1.5;
const DST_DAMAGE = 10;
const MISSILE_DAMAGE = 8;
// Action 215 slides back at raw velocity −400 from PC 3120 to PC 3132 and
// fires two missiles (218) at raw velocity 1000/−1000 from PCs 3127–3128.
const DST_FIRE_TICK = 268;
const DST_SLIDE_TICKS = 25;
const grabs = {
  grab: { startup: THROW_STARTUP, range: THROW_RANGE, hold: 'throw' },
  dst: { startup: DST_STARTUP, range: DST_RANGE, hold: 'dstHit' },
  evilDst: { startup: DST_STARTUP, range: DST_RANGE, hold: 'evilDstHit' },
} as const;
const held = {
  throw: 'grabbed',
  dstHit: 'dstHeld',
  evilDstHit: 'superHeld',
} as const;
// Spawns from actions 199, 217 and 215 by DST action age (op 0x04): source
// offsets, draw order from flag bit 0, and the spawned action's own velocity.
function dstEffects(age: number) {
  const spawns: {
    clip: AnimatedAction;
    x: number;
    y: number;
    front: boolean;
    vx?: number;
  }[] = [];
  const slow = age - 5;
  if (slow >= 0 && slow < 60 && slow % 20 === 0)
    spawns.push({ clip: 'smokeLeft', x: -40, y: 0, front: true, vx: -100 });
  if (slow >= 0 && slow < 60 && slow % 20 === 10)
    spawns.push({ clip: 'smokeRight', x: 40, y: 0, front: true, vx: 100 });
  const fast = age - 65;
  if (fast >= 0 && fast < 120 && fast % 12 === 0)
    spawns.push({ clip: 'hisaSmokeBack', x: 0, y: 0, front: true });
  if (fast >= 0 && fast < 120 && fast % 12 === 6)
    spawns.push({ clip: 'hisaSmoke', x: 30, y: 0, front: false });
  if (age === DST_FIRE_TICK)
    spawns.push(
      { clip: 'dstFire', x: 0, y: -80, front: true },
      { clip: 'dstFire', x: 40, y: -80, front: false },
      { clip: 'dashSmoke', x: 0, y: 0, front: true },
      { clip: 'hisaSmokeBack', x: 0, y: 0, front: true },
    );
  return spawns;
}
// Command table entries 'G BEAM LV1', 'MUSASHI', 'CGA', 'hidden sup' and 'B G';
// only Getter Beam lists an air action (263).
const SUPER_COMMANDS: Record<
  SuperControl,
  { ground: ScriptedAction; air?: ScriptedAction }
> = {
  getterBeam: { ground: 'getterBeam', air: 'airGetterBeam' },
  musashi: { ground: 'musashi' },
  changeAttack: { ground: 'changeAttack' },
  blackRush: { ground: 'blackRush' },
  megaBeam: { ground: 'megaBeam' },
};
// Source actions entered by op 0x10/0x11 branches, hit handlers and final jumps.
const SOURCE_ACTIONS: Record<number, Action> = {
  ...(Object.fromEntries(
    Object.entries(SCRIPTED).map(([action, index]) => [index, action]),
  ) as Record<number, Action>),
  97: 'fly',
  226: 'axeThrow',
};
// Victim actions reached through the response table, with their op 0x1a stops
// for the victim and, where they differ, the attacker.
const RESPONSE_REACTIONS: Record<
  number,
  { action: AnimatedAction; stop: number; attackerStop?: number }
> = {
  73: { action: 'hit', stop: 10 },
  74: { action: 'airHit', stop: 10 },
  75: { action: 'hitHeavy', stop: 15 },
  76: { action: 'airHitHeavy', stop: 15 },
  77: { action: 'jumpHit', stop: 15 },
  79: { action: 'sweep', stop: 13 },
  80: { action: 'launchAway', stop: 13 },
  // PC 932: ten ticks for the victim, 33 for the attacker.
  81: { action: 'launchUp', stop: 10, attackerStop: 33 },
  83: { action: 'hitRapid', stop: 0 },
  84: { action: 'airHitRapid', stop: 0 },
  88: { action: 'shock', stop: 0 },
  97: { action: 'fly', stop: 13 },
  121: { action: 'hitPull', stop: 15 },
  123: { action: 'launchDown', stop: 15 },
  135: { action: 'drillDown', stop: 0 },
  149: { action: 'block', stop: 10 },
  151: { action: 'crouchBlock', stop: 10 },
  153: { action: 'airBlock', stop: 10 },
  159: { action: 'blockStop', stop: 10 },
  161: { action: 'crouchBlockStop', stop: 10 },
  // FBB and FBH jump to 83 and 80; FBH first adds 10 power to the attacker.
  111: { action: 'hitRapid', stop: 0 },
  112: { action: 'launchAway', stop: 13 },
  122: { action: 'rushAirHit', stop: 0 },
  128: { action: 'superHeld', stop: 0 },
  129: { action: 'dstToss', stop: 0 },
  154: { action: 'blockHeavy', stop: 10 },
  156: { action: 'crouchBlockHeavy', stop: 10 },
  158: { action: 'airBlockHeavy', stop: 10 },
  163: { action: 'blockRapid', stop: 0 },
  165: { action: 'crouchBlockRapid', stop: 0 },
  167: { action: 'airBlockRapid', stop: 0 },
  // The hidden super's 'time stop' guards have no op 0x1a and no slide.
  168: { action: 'timeStopGuard', stop: 0 },
  170: { action: 'crouchTimeStopGuard', stop: 0 },
  172: { action: 'airTimeStopGuard', stop: 0 },
};
const FBH = 112;
const FBH_POWER = 10;
// Super damage converts the source's 510-point life to the 100-point bar.
const SOURCE_LIFE = 510;
const sourceDamage = (life: number) =>
  Math.max(1, Math.round((life * 100) / SOURCE_LIFE));
// Op 0x19 body box of the victim reactions (83, NO SUPER), in source pixels.
const BODY = { x: -1, y: -92, w: 37, h: 102 };
export function isAttack(action: Action): action is keyof typeof ATTACKS {
  return Object.hasOwn(ATTACKS, action);
}
const blocks = new Set<Action>([
  'block',
  'blockHeavy',
  'crouchBlock',
  'crouchBlockHeavy',
  'airBlock',
  'airBlockHeavy',
  'blockRapid',
  'crouchBlockRapid',
  'airBlockRapid',
  'blockStop',
  'crouchBlockStop',
  'timeStopGuard',
  'crouchTimeStopGuard',
  'airTimeStopGuard',
]);
const guards = new Set<Action>(['guard', 'crouchGuard', 'airGuard', ...blocks]);
// Where move() lets a fighter start guarding: the authored stand-in for the
// engine's object flags +0x15e & 0xc, under which a CPU victim rolls a guard.
// Finished actions become idle or jump in move() before contacts are checked.
const neutralActions = new Set<Action>([
  'idle',
  'walk',
  'backwalk',
  'turn',
  'crouchTurn',
  'crouch',
  'crouchEnter',
  'jump',
]);
const neutral = (f: Fighter) =>
  neutralActions.has(f.action) ||
  (f.action === 'doubleJump' && f.age >= 3) ||
  (f.action === 'hitUpJump' && f.age >= 8);
const reactions = new Set<Action>([
  'hit',
  'hitHeavy',
  'airHit',
  'airHitHeavy',
  'hitRapid',
  'airHitRapid',
  ...(Object.keys(launchMotion) as Action[]),
  'jumpHit',
  'hitPull',
  'shock',
  ...blocks,
]);
const protectedReactions = new Set<Action>([
  'grabbed',
  'dstHeld',
  'superHeld',
  'thrown',
  'knockdown',
  'slamBounce',
  'bounceDown',
  'getUp',
]);
export interface Fighter {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  hp: number;
  facing: -1 | 1;
  action: Action;
  age: number;
  airAge: number;
  hitStop: number;
  connected: boolean;
  airDrillStage: number;
  hits: number;
  damage: number;
  doubleJumped: boolean;
  airDashed: boolean;
  nextAttack: keyof typeof ATTACKS | null;
  nextJump: boolean;
  power: number;
  stock: number;
  // Scripted (super) state: the last age whose events ran, op 0x01 horizontal
  // acceleration, the active op 0x18 box and op 0x17 responses, the op 0x02 hit
  // handler, and op 0x23 fade.
  fired: number;
  ax: number;
  box: ScriptBox | null;
  responses: number[];
  onHit: number;
  fade: number;
  // Set on a fighter held by a super: op 0x07's pose, flags and holder offset.
  held: { pose: number; flags: number; x: number; y: number } | null;
  // This action's own attack or box has connected (hit or block).
  contact: boolean;
  // Op 0x1f player variable 1: 10 after a double jump, 20 in an air dash.
  jumpVariable: number;
}
export interface ScriptBox {
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
}
export interface Projectile {
  owner: number;
  kind: 'axe' | 'missile';
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: -1 | 1;
  age: number;
  hit: boolean;
}
// Spawned objects, positioned like characters by the renderer. A numeric clip
// is a source object that runs its flattened timeline: spawns, motion, boxes.
export interface Effect {
  clip: AnimatedAction | number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  gravity: number;
  facing: -1 | 1;
  age: number;
  front: boolean;
  // Owning fighter and op 0x04 object id (r[12]; 0 = none).
  owner: number;
  slot: number;
  // Op 0x04 flag 0x40: viewport coordinates instead of the stage.
  screen: boolean;
  box: ScriptBox | null;
  responses: number[];
  connected: boolean;
  // Op 0x23: mode 2 draws additively, mode 4 fades by fade/32.
  mode: number;
  fade: number;
}
const newEffect = (fields: Partial<Effect> & Pick<Effect, 'clip'>): Effect => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ax: 0,
  gravity: 0,
  facing: 1,
  age: 0,
  front: true,
  owner: 0,
  slot: 0,
  screen: false,
  box: null,
  responses: [],
  connected: false,
  mode: 0,
  fade: 0,
  ...fields,
});
export interface Impact {
  x: number;
  y: number;
  age: number;
  blocked: boolean;
  heavy: boolean;
  facing: -1 | 1;
  effect: 'hitSpark' | 'guardSpark';
}
const fighter = (x: number, facing: -1 | 1): Fighter => ({
  x,
  y: 0,
  vx: 0,
  vy: 0,
  gravity: 0.24,
  hp: 100,
  facing,
  action: 'idle',
  age: 0,
  airAge: 0,
  hitStop: 0,
  connected: false,
  airDrillStage: 0,
  hits: 0,
  damage: 0,
  doubleJumped: false,
  airDashed: false,
  nextAttack: null,
  nextJump: false,
  power: 0,
  stock: 0,
  fired: -1,
  ax: 0,
  box: null,
  responses: [],
  onHit: 0,
  fade: 0,
  held: null,
  contact: false,
  jumpVariable: 0,
});
const clampX = (x: number) =>
  Math.max(FIGHTER_MARGIN, Math.min(STAGE_WIDTH - FIGHTER_MARGIN, x));
function gravity(f: Fighter) {
  f.vx += f.ax;
  f.x = clampX(f.x + f.vx);
  f.vy += f.gravity;
  f.y = Math.min(0, f.y + f.vy);
  if (f.action === 'thrown') f.x = clampX(f.x - f.facing * 2);
  if (f.y === 0) {
    f.vx = f.vy = 0;
    f.gravity = 0.24;
  }
}
// Op 0x01: flag bit 0 adds; bits 1–4 keep vx, vy, ax and ay unchanged.
function motion(
  actor: Pick<Fighter, 'vx' | 'vy' | 'ax' | 'gravity' | 'facing'>,
  event: Extract<ScriptEvent, { op: 'motion' }>,
) {
  const set = (current: number, value: number) =>
    event.flags & 1 ? current + value : value;
  if (!(event.flags & 2))
    actor.vx = set(actor.vx, actor.facing * event.vx * SOURCE_VELOCITY_SCALE);
  if (!(event.flags & 4))
    actor.vy = set(actor.vy, event.vy * SOURCE_VELOCITY_SCALE);
  if (!(event.flags & 8))
    actor.ax = set(
      actor.ax,
      actor.facing * event.ax * SOURCE_ACCELERATION_SCALE,
    );
  if (!(event.flags & 16))
    actor.gravity = set(actor.gravity, event.ay * SOURCE_ACCELERATION_SCALE);
}
// Op 0x01 velocity and gravity from a script, in raw source units.
function scriptMotion(f: Fighter, vx: number, vy: number, gravity: number) {
  f.vx = f.facing * vx * SOURCE_VELOCITY_SCALE;
  f.vy = vy * SOURCE_VELOCITY_SCALE;
  f.gravity = gravity * SOURCE_ACCELERATION_SCALE;
}
function launchJump(f: Fighter, double = false) {
  // Actions 4–6 and 10–12 choose neutral or directional velocity at takeoff.
  const speed = double ? (f.vx === 0 ? 1300 : 1200) : f.vx === 0 ? 1450 : 1400;
  f.vy = -speed * SOURCE_VELOCITY_SCALE;
  f.gravity = JUMP_GRAVITY;
  f.airAge = 0;
}

function launchHitUpJump(f: Fighter) {
  // Action 202 prepares for eight ticks, then follows the launched opponent.
  if (f.action === 'hitUpJump' && f.age === 8) {
    f.vx = f.facing * 320 * SOURCE_VELOCITY_SCALE;
    f.vy = -1530 * SOURCE_VELOCITY_SCALE;
    f.gravity = 42 * SOURCE_ACCELERATION_SCALE;
    f.airAge = 0;
  }
}

export function addPower(f: Fighter, amount: number) {
  f.power += amount;
  while (f.power < 0) {
    if (f.stock === 0) f.power = 0;
    else {
      f.stock--;
      f.power += POWER_PER_STOCK;
    }
  }
  while (f.power >= POWER_PER_STOCK && f.stock < MAX_STOCK) {
    f.power -= POWER_PER_STOCK;
    f.stock++;
  }
  if (f.stock >= MAX_STOCK) {
    f.stock = MAX_STOCK;
    f.power = 0;
  }
}

function slideDst(f: Fighter) {
  if (
    f.action === 'dstHit' &&
    f.age >= DST_FIRE_TICK &&
    f.age < DST_FIRE_TICK + DST_SLIDE_TICKS
  )
    f.x = clampX(f.x - f.facing * 400 * SOURCE_VELOCITY_SCALE);
}

export class Match {
  fighters: [Fighter, Fighter] = [fighter(300, 1), fighter(660, -1)];
  ticks = 0;
  winner: 'player' | 'opponent' | 'draw' | null = null;
  endingTicks = 0;
  impacts: Impact[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  practice: PracticeOptions = {
    partner: 'stand',
    maxStock: false,
    lowHealth: false,
  };
  cpu: CpuVM;
  // This tick's opponent input comes from the CPU (none was supplied, in Vs.
  // CPU or with the CPU practice partner).
  private cpuDriven = false;
  private previous: [Input, Input] = [{}, {}];
  private history: [InputFrame[], InputFrame[]] = [[], []];
  private directionTaps: ({ direction: number; tick: number } | null)[] = [
    null,
    null,
  ];

  constructor(
    public mode: Mode = 'practice',
    intro = false,
    seed = 0,
  ) {
    this.cpu = new CpuVM(RYUKO_CPU, CPU_LEVEL, seed);
    if (!intro) return;
    // Authored start: both walk-ins end 360 pixels apart around the stage center.
    this.fighters = [
      fighter(STAGE_WIDTH / 2 - 180 - INTRO_WALK, 1),
      fighter(STAGE_WIDTH / 2 + 180 + INTRO_WALK, -1),
    ];
    for (const f of this.fighters) f.action = 'intro';
  }

  clearInput() {
    this.previous = [{}, {}];
    this.history = [[], []];
    this.directionTaps = [null, null];
  }

  private doubleTap(input: Input, index: number) {
    if (input.left && input.right) {
      this.directionTaps[index] = null;
      return false;
    }
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    if (!direction || this.previous[index][direction === 1 ? 'right' : 'left'])
      return false;
    const tap = this.directionTaps[index];
    const dash =
      tap?.direction === direction && this.ticks - tap.tick <= DOUBLE_TAP_TICKS;
    this.directionTaps[index] = dash ? null : { direction, tick: this.ticks };
    return dash;
  }

  get cameraX() {
    // Authored player lock, including round endings. Stage bounds are recovered.
    return Math.max(
      0,
      Math.min(STAGE_WIDTH - WIDTH, this.fighters[0].x - WIDTH / 2),
    );
  }

  get seconds() {
    return this.mode === 'practice'
      ? Infinity
      : Math.max(0, 60 - Math.floor(this.ticks / 100));
  }

  get cameraY() {
    // Keep the court framed until the player rises above the vertical dead zone.
    return Math.max(-HEIGHT, Math.min(0, this.fighters[0].y + 250));
  }

  get resultReady() {
    return this.winner !== null && this.endingTicks >= ROUND_END_TICKS;
  }

  private action(f: Fighter, action: Action, restart = false) {
    if (f.action === action && !restart) return;
    addPower(f, ATTACK_POWER[action] ?? 0);
    // Variable 1: set by actions 10–12 and 16–17 (PCs 119/199/217); an air
    // dash's end (op 0x0a into action 7 + 0) clears it.
    if (action === 'doubleJump') f.jumpVariable = 10;
    else if (action === 'airDash' || action === 'airBackdash')
      f.jumpVariable = 20;
    else if (action === 'jump' && dashes.has(f.action)) f.jumpVariable = 0;
    f.action = action;
    f.age = 0;
    f.connected = false;
    f.contact = false;
    if (!aerialDrills.has(action) || action === 'airDrill') f.airDrillStage = 0;
    f.nextAttack = null;
    f.nextJump = false;
    f.fired = -1;
    f.ax = 0;
    f.box = null;
    f.responses = [];
    f.onHit = 0;
    f.fade = 0;
    if (action !== 'superHeld') f.held = null;
    // Scripts own their motion: each starts still until its op 0x01 commands.
    if (isScripted(action) || action === 'superHeld' || action === 'shock') {
      f.vx = f.vy = 0;
      f.gravity = 0;
    } else if (f.gravity === 0) f.gravity = 0.24;
    if (
      action === 'dash' ||
      action === 'backdash' ||
      aerialDrills.has(action) ||
      ['grabbed', 'thrown', 'down'].includes(action)
    ) {
      f.vx = 0;
      f.gravity = 0.24;
    }
    // 183/192 (entered in an air dash) fall at acceleration 45 (PCs 2489/2668).
    if (
      (action === 'airPunch' || action === 'airKick') &&
      f.jumpVariable === 20
    )
      f.gravity = 45 * SOURCE_ACCELERATION_SCALE;
    // Action 181 hops at once (PC 2434); its landing handler ends the pose.
    if (action === 'punch3') scriptMotion(f, 300, -400, 110);
  }

  private showResultPose(f: Fighter, index: number) {
    if (
      f.hp === 0 ||
      f.hitStop > 0 ||
      f.y < 0 ||
      f.vy < 0 ||
      f.action === 'knockdown' ||
      f.action === 'bounceDown' ||
      Object.hasOwn(launchMotion, f.action) ||
      (f.action === 'hitUpJump' && f.age < 8) ||
      // A timeout release skips the remaining DST; a toss finishes its missiles.
      (f.action === 'dstHit' &&
        f.age >= DST_TOSS_TICK &&
        f.age < animationDuration('dstHit')) ||
      ((f.action === 'land' ||
        f.action === 'drillLand' ||
        f.action === 'getUp' ||
        f.action === 'throw') &&
        f.age < animationDuration(f.action))
    )
      return;
    this.action(
      f,
      this.winner === 'draw'
        ? 'draw'
        : (this.winner === 'player') === (index === 0)
          ? 'win'
          : 'lose',
    );
  }

  private recoverKnockdown(f: Fighter) {
    if (
      (f.action === 'knockdown' || f.action === 'bounceDown') &&
      f.hp > 0 &&
      f.age >= animationDuration(f.action)
    )
      this.action(f, 'getUp');
  }

  private moveLaunch(f: Fighter) {
    const motion = launchMotion[f.action];
    if (!motion) return false;
    // Victim actions hold their impact pose before the motion command.
    if (motion.drift && f.age < motion.tick)
      f.x = clampX(f.x + f.facing * motion.drift * SOURCE_VELOCITY_SCALE);
    if (f.age === motion.tick) {
      f.vx = f.facing * motion.vx * SOURCE_VELOCITY_SCALE;
      f.vy = motion.vy * SOURCE_VELOCITY_SCALE;
      f.gravity = motion.gravity * SOURCE_ACCELERATION_SCALE;
      f.airAge = 0;
    }
    if (f.age >= motion.tick) {
      f.airAge++;
      gravity(f);
      if (f.y === 0) {
        f.doubleJumped = f.airDashed = false;
        f.jumpVariable = 0;
        this.action(f, motion.land);
      }
    }
    return true;
  }

  private slideReaction(f: Fighter) {
    const slide = reactionSlides[f.action];
    if (slide) {
      if (
        f.age >= (slide.until ?? animationDuration(f.action as AnimatedAction))
      )
        f.vx = 0;
      else if (f.age >= slide.start) {
        f.vx =
          f.facing *
          (slide.velocity * SOURCE_VELOCITY_SCALE +
            (f.age - slide.start + 1) *
              slide.acceleration *
              SOURCE_ACCELERATION_SCALE);
        f.x = clampX(f.x + f.vx);
      }
    }
    if (f.action === 'bounceDown' && f.age <= 10)
      f.x = clampX(f.x - f.facing * 200 * SOURCE_VELOCITY_SCALE);
  }

  private resolveThrows(frozen: boolean[]) {
    // Strikes resolve first; simultaneous grab attempts both miss.
    const attempts = this.fighters.filter((f, index) => {
      const target = this.fighters[1 - index];
      const distance = (target.x - f.x) * f.facing;
      const grab = grabs[f.action as keyof typeof grabs];
      return (
        grab &&
        !frozen[index] &&
        f.hitStop === 0 &&
        f.age === grab.startup &&
        f.hp > 0 &&
        target.hp > 0 &&
        target.y === 0 &&
        target.vy === 0 &&
        !protectedReactions.has(target.action) &&
        !reactions.has(target.action) &&
        !Object.hasOwn(held, target.action) &&
        distance >= 0 &&
        distance <= grab.range
      );
    });
    if (attempts.length === 1) {
      const attacker = attempts[0];
      const target = this.fighters[attacker === this.fighters[0] ? 1 : 0];
      const hold = grabs[attacker.action as keyof typeof grabs].hold;
      this.action(attacker, hold);
      this.action(target, held[hold]);
      // A scripted hold (EVIL DST's 222) applies its response at once.
      this.fireEvents(attacker);
    }
    this.fighters.forEach((target, index) => {
      const attacker = this.fighters[1 - index];
      if (target.action === 'dstHeld') this.holdDst(attacker, target);
      // A held or shocked victim follows its super, or is released without it.
      if (
        (target.action === 'superHeld' &&
          (!isScripted(attacker.action) || attacker.hp === 0)) ||
        (target.action === 'shock' && attacker.action !== 'megaBeamHit')
      )
        this.action(target, target.y < 0 ? 'airHit' : 'hit');
      if (target.action === 'superHeld') this.placeHeld(attacker, target);
      if (target.action !== 'grabbed') return;
      if (attacker.action !== 'throw' || attacker.hp === 0) {
        this.action(target, target.y < 0 ? 'airHit' : 'hit');
        return;
      }
      const hold = throwHold(attacker.age);
      target.x = clampX(attacker.x + attacker.facing * hold.x);
      target.y = hold.y;
      target.vy = 0;
      target.facing = attacker.facing === 1 ? -1 : 1;
      if (attacker.age !== THROW_RELEASE_TICK) return;
      this.action(target, 'thrown');
      target.vy = -6;
      target.hp = Math.max(0, target.hp - THROW_DAMAGE);
      attacker.hits++;
      attacker.damage += THROW_DAMAGE;
      // PC 2770 adds 5 to both; the thrown victim's action 132 adds 8 more.
      addPower(attacker, 5);
      addPower(target, 13);
      this.impacts.push({
        x: target.x - attacker.facing * 42,
        y: GROUND + target.y - 145,
        age: 0,
        blocked: false,
        heavy: true,
        facing: attacker.facing,
        effect: 'hitSpark',
      });
    });
  }

  private holdDst(attacker: Fighter, target: Fighter) {
    if (attacker.action !== 'dstHit' || attacker.hp === 0) {
      this.action(target, 'hit');
      return;
    }
    if (attacker.age === DST_TOSS_TICK) {
      // PC 3111: response 31 places the victim at (14, −96), then action 129.
      this.action(target, 'dstToss');
      target.x = clampX(attacker.x + attacker.facing * 14 * 1.5);
      target.y = -96 * 1.5;
      target.vy = 0;
      target.facing = attacker.facing === 1 ? -1 : 1;
      target.hp = Math.max(0, target.hp - DST_DAMAGE);
      attacker.hits++;
      attacker.damage += DST_DAMAGE;
      // PC 3112 adds 5 power to both fighters.
      addPower(attacker, 5);
      addPower(target, 5);
      this.impacts.push({
        x: target.x - attacker.facing * 42,
        y: GROUND + target.y - 145,
        age: 0,
        blocked: false,
        heavy: true,
        facing: attacker.facing,
        effect: 'hitSpark',
      });
      return;
    }
    const hold = dstHold(attacker.age);
    if (!hold) return;
    target.x = clampX(attacker.x + attacker.facing * hold.x * 1.5);
    target.y = 0;
    target.vy = 0;
    target.facing = hold.same === (attacker.facing === 1) ? 1 : -1;
  }

  private spawnEffect(
    parent: { x: number; y: number; facing: -1 | 1 },
    effect: {
      clip: AnimatedAction;
      x: number;
      y: number;
      front: boolean;
      vx?: number;
      vy?: number;
    },
  ) {
    this.effects.push(
      newEffect({
        clip: effect.clip,
        x: parent.x + parent.facing * effect.x * 1.5,
        y: parent.y + effect.y * 1.5,
        vx: parent.facing * (effect.vx ?? 0) * SOURCE_VELOCITY_SCALE,
        vy: (effect.vy ?? 0) * SOURCE_VELOCITY_SCALE,
        facing: parent.facing,
        front: effect.front,
      }),
    );
  }

  // A guard reaction's op 0x24 check at its current age (see GUARD_COUNTERS).
  private counter(f: Fighter, history: InputFrame[]) {
    const check = GUARD_COUNTERS[f.action]?.find(([age]) => age === f.age);
    if (!check || !f.stock || !commanded(history, 'hitUp', check[1], false))
      return false;
    this.action(f, 'counterHit', true);
    this.fireEvents(f);
    return true;
  }

  // Ops 0x11 (life) and 0x10 (stock) precede each super's first display. Check
  // them in script order: a branch enters its target, a pass spends the stock.
  private startSuper(f: Fighter, control: SuperControl, airborne: boolean) {
    const command = SUPER_COMMANDS[control];
    const cancel = IORI.has(f.action) ? SUPER_CANCELS[control] : undefined;
    if (cancel?.via254) {
      const life = (f.hp * SOURCE_LIFE) / 100;
      const enter =
        f.stock >= 2 && (cancel.life === undefined || life < cancel.life);
      if (enter) f.stock -= 2;
      this.action(f, enter ? cancel.action : 'noSuper', true);
      if (enter)
        this.spawnObject(f, this.fighters.indexOf(f), {
          flags: 5,
          action: 253,
          x: 0,
          y: -80,
          slot: 0,
        });
      this.fireEvents(f);
      return true;
    }
    let action: Action | undefined = airborne
      ? command.air
      : (cancel?.action ?? command.ground);
    const entered = new Set<Action>();
    while (action && isScripted(action) && !entered.has(action)) {
      entered.add(action);
      let next: Action | undefined;
      for (const event of eventsAt(SCRIPTED[action], 0)) {
        const life = (f.hp * SOURCE_LIFE) / 100;
        const branch =
          event.op === 'life'
            ? event.below
              ? life <= event.value
              : life >= event.value
            : event.op === 'stock' && f.stock <= event.min;
        if (branch && (event.op === 'life' || event.op === 'stock')) {
          next = SOURCE_ACTIONS[event.target];
          break;
        }
        if (event.op === 'stock') f.stock += event.add;
      }
      if (!next) break;
      action = next;
    }
    if (
      !action ||
      (action === 'axeThrow' &&
        this.projectiles.some(
          (p) => p.kind === 'axe' && this.fighters[p.owner] === f,
        ))
    )
      return false;
    this.action(f, action, true);
    this.fireEvents(f);
    return true;
  }

  // Runs a scripted fighter's events once per action age.
  private fireEvents(f: Fighter) {
    if (!isScripted(f.action) || f.fired === f.age) return;
    f.fired = f.age;
    const owner = this.fighters.indexOf(f);
    for (const event of eventsAt(SCRIPTED[f.action], f.age))
      this.runEvent(f, owner, event);
  }

  private fireEffect(e: Effect) {
    if (typeof e.clip !== 'number') return;
    for (const event of eventsAt(e.clip, e.age))
      this.runEvent(e, e.owner, event);
  }

  private runEvent(actor: Fighter | Effect, owner: number, event: ScriptEvent) {
    const self = this.fighters[owner];
    const other = this.fighters[1 - owner];
    switch (event.op) {
      case 'spawn':
        this.spawnObject(actor, owner, event);
        break;
      case 'motion':
        motion(actor, event);
        break;
      case 'box':
        // Slot 1 boxes sit 2000 pixels down: they meet objects, not bodies.
        if (event.slot !== 0) break;
        actor.box =
          event.w || event.h
            ? {
                x: event.x,
                y: event.y,
                w: event.w,
                h: event.h,
                damage: event.damage,
              }
            : null;
        actor.connected = false;
        break;
      case 'responses':
        actor.responses = event.ids;
        break;
      case 'stop':
        other.hitStop += event.other;
        if (actor === self) self.hitStop += event.self;
        break;
      case 'handler':
        if (event.slot === 2 && actor === self) self.onHit = event.action;
        break;
      case 'hold':
        if (!this.catchHeld(other)) break;
        other.held = {
          pose: event.pose,
          flags: event.flags,
          x: event.x,
          y: event.y,
        };
        this.placeHeld(self, other);
        break;
      case 'apply': {
        const reaction = RESPONSE_REACTIONS[RESPONSES[event.response]];
        if (!reaction || !this.catchHeld(other)) break;
        other.held = { pose: 0, flags: event.flags, x: event.x, y: event.y };
        this.placeHeld(self, other);
        this.action(other, reaction.action, true);
        other.hitStop += reaction.stop;
        self.hitStop += reaction.stop;
        const [victimPower, attackerPower] = REACTION_POWER[
          reaction.action
        ] ?? [0, 0];
        addPower(other, victimPower);
        addPower(self, attackerPower);
        break;
      }
      case 'power':
        if (event.otherLife < 0) {
          const damage = sourceDamage(-event.otherLife);
          other.hp = Math.max(0, other.hp - damage);
          self.hits++;
          self.damage += damage;
        }
        addPower(self, event.selfPower);
        addPower(other, event.otherPower);
        break;
      case 'color':
        actor.fade = event.mode === 4 ? event.fade : 0;
        if ('mode' in actor) actor.mode = event.mode;
        break;
    }
  }

  // Ops 0x07/0x14 move the opponent this super holds or has just tossed.
  private catchHeld(target: Fighter) {
    if (target.action === 'dstToss') this.action(target, 'superHeld');
    return target.action === 'superHeld';
  }

  private placeHeld(holder: Fighter, target: Fighter) {
    const held = target.held;
    if (!held) return;
    target.x = clampX(holder.x + holder.facing * held.x * 1.5);
    target.y = Math.min(0, holder.y + held.y * 1.5);
    target.vx = target.vy = 0;
    target.facing =
      held.flags & 4 ? holder.facing : holder.facing === 1 ? -1 : 1;
  }

  private spawnObject(
    parent: Fighter | Effect,
    owner: number,
    event: {
      flags: number;
      action: number;
      x: number;
      y: number;
      slot: number;
    },
  ) {
    // Action 0 deletes the owner's objects with that id (several may share it).
    if (!event.action) {
      this.effects = this.effects.filter(
        (e) => e.owner !== owner || e.slot !== event.slot,
      );
      return;
    }
    const screen = (event.flags & 0x40) !== 0;
    // Children of viewport objects start from the same point on the stage.
    const origin =
      'screen' in parent && parent.screen
        ? {
            x: parent.x + this.cameraX,
            y: parent.y + this.cameraY - GROUND,
          }
        : parent;
    const child = newEffect({
      clip: event.action,
      x: screen ? event.x * 1.5 : origin.x + parent.facing * event.x * 1.5,
      y: screen ? event.y * 1.5 : origin.y + event.y * 1.5,
      facing: parent.facing,
      // Flag bits 0–1: 0 draws behind the fighters, 1 in front, 2 at z r[13].
      front: (event.flags & 3) !== 0,
      owner,
      slot: event.slot,
      screen,
    });
    // A script without displays never advances, so its events all fire at t=0
    // (anime beam 296 only spawns 297 and 299); nothing is left to draw.
    if (animationDuration(event.action)) this.effects.push(child);
    this.fireEffect(child);
  }

  // A scripted fighter's own motion; false when its timeline has ended on foot.
  private moveScripted(f: Fighter) {
    const action = f.action as ScriptedAction;
    this.fireEvents(f);
    const airborne = f.y < 0 || f.vy < 0;
    f.vx += f.ax;
    f.vy += f.gravity;
    f.x = clampX(f.x + f.vx);
    f.y = Math.min(0, f.y + f.vy);
    if (f.action !== action) return true;
    // Airborne supers end on landing (handler slot 1 enters a landing action).
    if (airborne && f.y === 0) {
      f.vx = f.vy = 0;
      f.doubleJumped = f.airDashed = false;
      f.jumpVariable = 0;
      this.action(f, 'land');
      return true;
    }
    const { end, next } = script(SCRIPTED[action]);
    if (end === 'hold' || end === 'loop' || f.age < animationDuration(action))
      return true;
    if (next === 97) this.action(f, 'fly');
    // CPU IORI: op 0x20 at PC 5887 jumps to its recovery (411 + 31) when
    // rand % 6 > 4; otherwise 411 jumps into iori3 at PC 5888.
    else if (next === 248)
      this.action(f, this.cpu.random() % 6 > 4 ? 'cpuIoriRecover' : 'iori3');
    else if (next === 215) {
      // Action 222 continues into DST Hit, which re-applies response 30.
      const target = this.fighters[1 - this.fighters.indexOf(f)];
      this.action(f, 'dstHit');
      if (target.action === 'superHeld') this.action(target, 'dstHeld');
    } else if (f.y < 0) {
      // Op 0x0a into action 7: the ordinary fall.
      this.action(f, 'jump');
      f.gravity = JUMP_GRAVITY;
    } else {
      f.vx = f.vy = 0;
      return false;
    }
    return true;
  }

  // Script boxes hit the opponent's op 0x19 body box through op 0x17 responses.
  private boxContact(source: Fighter | Effect, owner: number) {
    const box = source.box;
    const attacker = this.fighters[owner];
    const target = this.fighters[1 - owner];
    if (!box || source.connected || protectedReactions.has(target.action))
      return [];
    const origin =
      'screen' in source && source.screen
        ? {
            x: source.x + this.cameraX,
            y: source.y + this.cameraY - GROUND,
          }
        : source;
    const x = origin.x + source.facing * box.x * 1.5;
    const y = origin.y + box.y * 1.5;
    if (
      Math.abs(x - (target.x + target.facing * BODY.x * 1.5)) >=
        (box.w + BODY.w) * 1.5 ||
      Math.abs(y - (target.y + BODY.y * 1.5)) >= (box.h + BODY.h) * 1.5
    )
      return [];
    const guarding = this.guarding(target, source);
    const stance =
      target.y < 0 || target.vy < 0
        ? 2
        : target.action.startsWith('crouch')
          ? 1
          : 0;
    const victim = RESPONSES[source.responses[(guarding ? 3 : 0) + stance]];
    const reaction = RESPONSE_REACTIONS[victim];
    if (!reaction) return [];
    const blocked = blocks.has(reaction.action);
    return [
      {
        f: attacker,
        target,
        damage: blocked || !box.damage ? 0 : sourceDamage(box.damage),
        heavy: true,
        hitStop: reaction.stop,
        // Objects, like DST's missiles, pause without pausing Ryuko.
        attackerStop:
          source === attacker ? (reaction.attackerStop ?? reaction.stop) : 0,
        airDrill: false,
        reaction: reaction.action as AnimatedAction | null,
        facing: source.facing,
        x: target.x - source.facing * 42,
        y: GROUND + target.y - 145,
        projectile: null as Projectile | null,
        blocked,
        source: source as Fighter | Effect | null,
        fbh: victim === FBH,
      },
    ];
  }

  private ai(): Input {
    const [player, opponent] = this.fighters;
    const { partner } = this.practice;
    if (this.mode === 'practice' && partner !== 'cpu')
      return dummyInput(partner, opponent, player, this.ticks);
    return this.cpu.input(opponent, player);
  }

  // 0x40f3a2: a CPU victim ignores its input. In a neutral state it guards on
  // rand % 100 < level; in a guard reaction it keeps guarding, whichever way
  // it faces (0x40f449).
  private guarding(target: Fighter, source: { facing: number }) {
    if (this.cpuDriven && target === this.fighters[1])
      return (
        guards.has(target.action) || (neutral(target) && this.cpu.guards())
      );
    return guards.has(target.action) && target.facing !== source.facing;
  }

  private doubleJump(f: Fighter, direction: number) {
    f.doubleJumped = true;
    f.vx = direction * 400 * SOURCE_VELOCITY_SCALE;
    f.vy = 0;
    f.airAge = 0;
    this.action(f, 'doubleJump');
  }

  // Command entry. Each command carries its action's level (header byte 2);
  // a cancel window passes only the levels it accepts.
  private command(
    f: Fighter,
    input: Input,
    previous: Input,
    airborne: boolean,
    ok: (level: number) => boolean = () => true,
  ) {
    const fresh = (control: Control) => !!input[control] && !previous[control];
    const start = (action: Action) => {
      this.action(f, action, true);
      return true;
    };
    for (const control of SUPER_CONTROLS)
      if (
        fresh(control) &&
        ok(control === 'megaBeam' ? 42 : 41) &&
        this.startSuper(f, control, airborne)
      )
        return true;
    if (fresh('drill') && ok(31)) return start(airborne ? 'airDrill' : 'drill');
    if (airborne) {
      if (fresh('punch') && ok(21)) return start('airPunch');
      if (fresh('kick') && ok(22)) return start('airKick');
      return false;
    }
    if (fresh('iori') && ok(31)) return start('iori');
    // Command 22 enters CPU IORI (410, level 31) on button 0x40, which only
    // the CPU injects.
    if (fresh('cpuIori') && ok(31)) {
      this.action(f, 'cpuIori', true);
      this.fireEvents(f);
      return true;
    }
    if (fresh('throw') && ok(21)) return start('grab');
    // PC 3082 (op 0x11) enters EVIL DST at 153 of 510 life or less.
    if (fresh('dst') && ok(31))
      return start(f.hp <= DESPERATION_HP ? 'evilDst' : 'dst');
    if (
      fresh('axe') &&
      ok(31) &&
      !this.projectiles.some(
        (p) => p.kind === 'axe' && this.fighters[p.owner] === f,
      )
    )
      return start('axeThrow');
    if (fresh('punch') && ok(21))
      return start(input.crouch ? 'crouchPunch' : 'punch');
    if (fresh('hitUp') && ok(21)) return start('hitUp');
    if (fresh('kick') && ok(21))
      return start(input.crouch ? 'crouchKick' : 'kick');
    return false;
  }

  // Op 0x1e windows (CANCELS), read on every tick, contact stops included.
  private cancel(f: Fighter, input: Input, previous: Input) {
    const range = CANCELS[f.action];
    if (
      !range ||
      f.age < range.age ||
      f.age >= (range.until ?? Infinity) ||
      (range.contact && !f.contact)
    )
      return false;
    // 183/184 and 192/193 cap their range at 50: no double jump cancel.
    const max =
      f.jumpVariable && (f.action === 'airPunch' || f.action === 'airKick')
        ? 50
        : range.max;
    const ok = (level: number) => level >= range.min && level <= max;
    const airborne = f.y < 0 || f.vy < 0;
    if (
      airborne &&
      ok(255) &&
      input.jump &&
      !previous.jump &&
      !f.doubleJumped
    ) {
      this.doubleJump(
        f,
        Number(Boolean(input.right)) - Number(Boolean(input.left)),
      );
      return true;
    }
    return this.command(f, input, previous, airborne, ok);
  }

  private move(
    f: Fighter,
    other: Fighter,
    input: Input,
    previous: Input,
    doubleTap: boolean,
    history: InputFrame[],
  ) {
    if (f.hitStop === 0) f.age++;
    if (this.cancel(f, input, previous)) return;
    const followUp = followUps[f.action as keyof typeof followUps];
    const ioriFollowUp =
      !!followUp && f.age < animationDuration(f.action as 'iori' | 'iori2');
    if (ioriFollowUp && input.iori && !previous.iori) f.nextAttack = followUp;
    if (
      (f.action === 'hitUp' || (f.action === 'hitUpRecover' && f.age < 25)) &&
      input.jump &&
      !previous.jump
    )
      f.nextJump = true;
    if (f.hitStop > 0) {
      f.hitStop--;
      return;
    }
    if (
      f.action === 'grabbed' ||
      f.action === 'dstHeld' ||
      f.action === 'superHeld' ||
      f.action === 'shock'
    )
      return;
    const chain = CHAINS[f.action];
    const check = chain?.checks.find(([age]) => age === f.age);
    if (chain && check) {
      const next = commanded(history, 'punch', check[1])
        ? chain.next[0]
        : commanded(history, 'kick', check[1])
          ? chain.next[1]
          : null;
      if (next) {
        this.action(f, next, true);
        return;
      }
    }
    if (this.counter(f, history)) return;
    if (isScripted(f.action) && this.moveScripted(f)) return;
    if (this.moveLaunch(f)) return;
    this.slideReaction(f);
    launchHitUpJump(f);
    if (f.action === 'hitUpJump' && f.age < 8) return;
    // Commands before a reaction's first display apply on its first moving tick.
    const reaction = AIR_REACTIONS[f.action];
    if (reaction)
      for (const event of script(reaction).events)
        if (event.op === 'motion' && Math.max(event.t, 1) === f.age)
          motion(f, event);
    if (f.y < 0 || f.vy < 0) {
      f.airAge++;
      if (aerialDrills.has(f.action)) {
        if (f.action === 'airDrill' && f.age < animationDuration('airDrill'))
          f.vy = 0;
        // Hit-stop is separate; the contact clip contains two transition ticks.
        else {
          if (
            f.action !== 'airDrillContact' ||
            f.age >= animationDuration('airDrillContact')
          )
            f.vy =
              (f.airDrillStage === 0 ? 1000 : 1500) * SOURCE_VELOCITY_SCALE;
          f.x = clampX(f.x + f.facing * 800 * SOURCE_VELOCITY_SCALE);
          f.y = Math.min(0, f.y + f.vy);
          if (f.y === 0) f.vy = 0;
        }
      } else if (f.action === 'doubleJump' && f.age <= 3) {
        if (f.age === 3) launchJump(f, true);
      } else if (f.action === 'airDash' || f.action === 'airBackdash') {
        const backwards = f.action === 'airBackdash';
        // Actions 16/17 keep incoming motion until PCs 205/223 at age 3.
        // PCs 211/227 restore gravity after 30/20 level ticks; flag 0x02
        // retains horizontal velocity through recovery and action 7's fall.
        if (f.age === 3) {
          f.vx = f.facing * (backwards ? -800 : 800) * SOURCE_VELOCITY_SCALE;
          f.vy = 0;
          f.gravity = JUMP_GRAVITY;
        }
        if (f.age >= 3 && f.age < (backwards ? 23 : 33))
          f.x = clampX(f.x + f.vx);
        else gravity(f);
      } else gravity(f);
      if (f.y === 0) {
        f.doubleJumped = false;
        f.airDashed = false;
        f.jumpVariable = 0;
        if (f.action === 'thrown') {
          this.action(f, 'knockdown');
          return;
        }
        // 0x411810: landing without a slot-1 handler ends the action, and the
        // free state reads commands on the same tick. The air reactions have
        // none.
        if (AIR_REACTIONS[f.action]) this.action(f, 'idle');
        // Punch 3's landing handlers (slot 1, PCs 2433/2439) continue it.
        else if (f.action === 'punch3') return;
        else {
          this.action(f, aerialDrills.has(f.action) ? 'drillLand' : 'land');
          return;
        }
      }
    }
    this.recoverKnockdown(f);
    if (
      f.action === 'thrown' ||
      f.action === 'knockdown' ||
      f.action === 'bounceDown'
    )
      return;
    if (f.action === 'takeoff') {
      if (f.age < animationDuration('takeoff')) return;
      launchJump(f);
      this.action(f, 'jump');
      return;
    }
    if (f.action === 'doubleJump' && f.age < 3) return;
    if (f.action === 'hitUpRecover') {
      // Action 201 opens command 202 after its first five-tick display.
      // Early Jump taps are buffered using the training mode's input policy.
      if (f.age >= 5 && f.age < 25 && f.nextJump) {
        this.action(f, 'hitUpJump');
        return;
      }
      if (f.age < animationDuration('hitUpRecover')) return;
    }
    if (aerialDrills.has(f.action)) {
      if (
        f.action !== 'airDrillSpin' &&
        f.age >= animationDuration(f.action as AnimatedAction)
      )
        this.action(f, 'airDrillSpin');
      // A whole spin of action 211 without contact jumps back to 210 (PC 3060).
      else if (
        f.action === 'airDrillSpin' &&
        f.airDrillStage === 3 &&
        f.age === animationDuration('airDrillSpin')
      )
        f.airDrillStage = 2;
      return;
    }
    if (
      ioriFollowUp &&
      f.nextAttack &&
      f.age >= (f.action === 'iori' ? 29 : 31)
    ) {
      // Actions 246/247 open follow-up commands after their active display.
      this.action(f, f.nextAttack, true);
      return;
    }
    if (
      f.action !== 'idle' &&
      (isAttack(f.action) ||
        f.action === 'axeThrow' ||
        reactions.has(f.action) ||
        [
          'punchHit',
          'cpuIoriRecover',
          'kickHit',
          'land',
          'drillLand',
          'stand',
          'grab',
          'throw',
          'dst',
          'evilDst',
          'dstHit',
          'getUp',
        ].includes(f.action)) &&
      f.age < animationDuration(f.action)
    ) {
      slideDst(f);
      // Action 207 moves before its first strike, then slides during recovery.
      if (f.action === 'drill' && f.age >= 11 && f.age < 69)
        f.x = clampX(
          f.x + f.facing * (f.age < 59 ? 900 : 100) * SOURCE_VELOCITY_SCALE,
        );
      // Actions 180/188 lunge at raw velocity 600: from their first moving
      // tick until PC 2393 (13 ticks), and from PC 2584 until PC 2592.
      if (
        (f.action === 'punch2' && f.age >= 1 && f.age <= 13) ||
        (f.action === 'kick2' && f.age >= 2 && f.age < 13)
      )
        f.x = clampX(f.x + f.facing * 600 * SOURCE_VELOCITY_SCALE);
      // Action 181 hops again after its two-tick pose (PC 2440), then slides
      // at raw 500 from PC 2447 until PC 2457.
      if (f.action === 'punch3' && f.age === 14)
        scriptMotion(f, 300, -300, 120);
      if (f.action === 'punch3' && f.age >= 29 && f.age <= 41)
        f.x = clampX(f.x + f.facing * 500 * SOURCE_VELOCITY_SCALE);
      // Action 200: six accelerating ticks, then stop before the kick.
      if (f.action === 'hitUp' && f.age >= 2 && f.age < 8)
        f.x = clampX(
          f.x +
            f.facing *
              (600 * SOURCE_VELOCITY_SCALE +
                (f.age - 1) * 350 * SOURCE_ACCELERATION_SCALE),
        );
      if (
        (f.action === 'iori' && f.age >= 13 && f.age < 21) ||
        (f.action === 'iori2' && f.age >= 8 && f.age < 23) ||
        (f.action === 'iori3' && f.age >= 8 && f.age < 21)
      )
        f.x = clampX(
          f.x +
            f.facing *
              (f.action === 'iori2' ? 700 : 800) *
              SOURCE_VELOCITY_SCALE,
        );
      return;
    }
    if (dashes.has(f.action) && f.action !== 'idle') {
      if (f.action === 'dash' || f.action === 'backdash') {
        const backwards = f.action === 'backdash';
        const startup = backwards ? 10 : 5;
        if (f.age < startup) return;
        if (f.age === startup) {
          // PCs 169/182 set the whole hop; use the shared integrator thereafter.
          f.vx = f.facing * (backwards ? -500 : 900) * SOURCE_VELOCITY_SCALE;
          f.vy = (backwards ? -900 : -500) * SOURCE_VELOCITY_SCALE;
          f.gravity = 90 * SOURCE_ACCELERATION_SCALE;
          f.airAge = 0;
          gravity(f);
        }
        // The source dash holds its final airborne pose until landing.
        return;
      }
      if (f.age < animationDuration(f.action)) return;
    }
    const airborne = f.y < 0 || f.vy < 0;
    // Air attacks jump into action 7 (PCs 2485/2507/2528, 2664/2692/2719) and
    // an air reaction that ends airborne enters it through 0x411a80 (+0x7586).
    // Its op 0x01 (PC 99, flags 0xe) keeps vx, vy and ax and sets gravity 80.
    if (
      airborne &&
      (AIR_REACTIONS[f.action] ||
        f.action === 'airPunch' ||
        f.action === 'airKick')
    ) {
      const { ax } = f;
      this.action(f, 'jump');
      f.ax = ax;
      f.gravity = JUMP_GRAVITY;
    }
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    const crouched = f.action.startsWith('crouch');
    const facing = other.x >= f.x ? 1 : -1;
    const turning = !airborne && facing !== f.facing;
    f.facing = facing;
    if (input.guard) {
      this.action(
        f,
        airborne ? 'airGuard' : input.crouch ? 'crouchGuard' : 'guard',
      );
      return;
    }
    if (input.jump && !previous.jump) {
      if (!airborne) {
        this.action(f, 'takeoff');
        f.vx = direction * 400 * SOURCE_VELOCITY_SCALE;
        return;
      }
      if (!f.doubleJumped) {
        this.doubleJump(f, direction);
        return;
      }
    }
    // The dash shortcuts are keyboard/touch input choices; the CPU dashes only
    // through its DASH commands.
    const shortcuts = !(this.cpuDriven && f === this.fighters[1]);
    const directionalDash =
      shortcuts &&
      (airborne
        ? direction !== 0 && !previous[direction === 1 ? 'right' : 'left']
        : doubleTap);
    if (
      ((input.dash && !previous.dash) || directionalDash) &&
      (!airborne || !f.airDashed)
    ) {
      const backwards = direction !== 0 && direction !== f.facing;
      this.action(
        f,
        airborne
          ? backwards
            ? 'airBackdash'
            : 'airDash'
          : backwards
            ? 'backdash'
            : 'dash',
      );
      if (airborne) f.airDashed = true;
      return;
    }
    if (this.command(f, input, previous, airborne)) return;
    // Actions 23/24: a grounded fighter turns before walking or idling again.
    // Any other input interrupts the turn, as it does standing.
    if (
      turning ||
      ((f.action === 'turn' || f.action === 'crouchTurn') &&
        f.age < animationDuration(f.action))
    ) {
      this.action(f, turning ? (crouched ? 'crouchTurn' : 'turn') : f.action);
      return;
    }
    if (f.action === 'crouchEnter' && f.age < animationDuration('crouchEnter'))
      return;
    if (!airborne && crouched && !input.crouch) {
      this.action(f, 'stand');
      return;
    }
    if (!airborne && input.crouch) {
      this.action(f, crouched ? 'crouch' : 'crouchEnter');
      return;
    }
    if (!airborne) f.x = clampX(f.x + direction * 2.8);
    this.action(
      f,
      airborne
        ? (f.action === 'doubleJump' || f.action === 'hitUpJump') &&
          f.age < animationDuration(f.action)
          ? f.action
          : 'jump'
        : direction
          ? direction === f.facing
            ? 'walk'
            : 'backwalk'
          : 'idle',
    );
  }

  step(player: Input = {}, opponent?: Input) {
    if (this.resultReady) return;
    this.impacts = this.impacts.filter(
      (impact) => ++impact.age < animationDuration(impact.effect),
    );
    // Objects spawned during this pass start moving next tick.
    for (const e of [...this.effects]) {
      if (!this.effects.includes(e)) continue;
      e.vx += e.ax;
      e.vy += e.gravity;
      e.x += e.vx;
      e.y += e.vy;
      if (++e.age < animationDuration(e.clip)) this.fireEffect(e);
    }
    this.effects = this.effects.filter(
      (e) => e.age < animationDuration(e.clip),
    );
    if (this.winner) {
      this.endingTicks++;
      let koStop = 0;
      this.fighters.forEach((f, index) => {
        if (f.hitStop > 0) {
          f.hitStop--;
          return;
        }
        f.age++;
        if (f.action === 'down') {
          // Action 60: PC 611 holds both fighters for 40 ticks. The four
          // opening displays total 14 action ticks, then PC 617 launches.
          if (f.age === 5) koStop += 40;
          if (f.age === 14) {
            f.vx = -f.facing * 500 * SOURCE_VELOCITY_SCALE;
            f.vy = -1520 * SOURCE_VELOCITY_SCALE;
            f.gravity = 90 * SOURCE_ACCELERATION_SCALE;
            f.airAge = 0;
          }
          if (f.age >= 14) {
            f.airAge++;
            gravity(f);
            if (f.y === 0) this.action(f, 'koLand');
          }
          return;
        }
        if (f.action === 'koLand') {
          // Action 62, PCs 641–644: ten ticks of backward slide, then rest.
          if (f.age <= 10)
            f.x = clampX(f.x - f.facing * 200 * SOURCE_VELOCITY_SCALE);
          return;
        }
        if (this.moveLaunch(f)) return;
        this.slideReaction(f);
        launchHitUpJump(f);
        slideDst(f);
        if (f.y < 0 || f.vy < 0) {
          f.airAge++;
          gravity(f);
          if (f.y === 0 && f.action === 'thrown') this.action(f, 'knockdown');
          else if (f.y === 0 && f.hp > 0)
            this.action(f, aerialDrills.has(f.action) ? 'drillLand' : 'land');
        }
        this.recoverKnockdown(f);
        this.showResultPose(f, index);
      });
      // Apply together after frame entry so a double KO is iteration-independent.
      for (const f of this.fighters) f.hitStop += koStop;
      return;
    }
    if (this.fighters.some((f) => f.action === 'intro')) {
      for (const f of this.fighters) {
        f.age++;
        if (f.age <= INTRO_WALK_TICKS)
          f.x = clampX(f.x + f.facing * 200 * SOURCE_VELOCITY_SCALE);
        if (f.age >= animationDuration('intro')) this.action(f, 'idle');
      }
      // Held buttons must be pressed again once control begins.
      this.previous = [{ ...player }, { ...opponent }];
      return;
    }
    this.ticks++;
    if (this.mode === 'practice') {
      for (const f of this.fighters)
        if (this.practice.maxStock && f.action === 'idle') {
          f.stock = MAX_STOCK;
          f.power = 0;
        }
      if (this.practice.lowHealth)
        this.fighters[0].hp = Math.min(this.fighters[0].hp, DESPERATION_HP);
    }
    this.cpuDriven =
      !opponent && (this.mode === 'cpu' || this.practice.partner === 'cpu');
    const inputs: [Input, Input] = [player, opponent ?? this.ai()];
    // The engine records every tick of input, including frozen ones.
    this.history.forEach((history, i) => {
      const [input, previous] = [inputs[i], this.previous[i]];
      history.push({
        neutral: !input.left && !input.right && !input.jump && !input.crouch,
        punch: !!input.punch && !previous.punch,
        kick: !!input.kick && !previous.kick,
        hitUp: !!input.hitUp && !previous.hitUp,
      });
      if (history.length > HISTORY_TICKS) history.shift();
    });
    const frozen = this.fighters.map((f) => f.hitStop > 0);
    this.fighters.forEach((f, i) => {
      this.move(
        f,
        this.fighters[1 - i],
        inputs[i],
        this.previous[i],
        this.doubleTap(inputs[i], i),
        this.history[i],
      );
      if (
        !['idle', 'walk', 'backwalk', 'turn', 'jump', 'doubleJump'].includes(
          f.action,
        )
      )
        this.directionTaps[i] = null;
    });
    this.previous = [{ ...inputs[0] }, { ...inputs[1] }];
    const [a, b] = this.fighters;
    this.projectiles = this.projectiles.filter((p) => {
      p.age++;
      if (p.hit) return p.kind === 'axe' && p.age < animationDuration('axeHit');
      p.x += p.vx;
      p.y += p.vy;
      return (
        (p.kind === 'missile' || p.age < 180) &&
        p.x >= -80 &&
        p.x <= STAGE_WIDTH + 80 &&
        p.y > -3 * HEIGHT
      );
    });
    this.fighters.forEach((f, owner) => {
      if (frozen[owner]) return;
      if (f.action === 'axeThrow' && f.age === AXE_RELEASE_TICK)
        this.projectiles.push({
          owner,
          kind: 'axe',
          x: f.x + f.facing * 140,
          y: f.y - 140,
          vx: f.facing * 7,
          vy: 0,
          facing: f.facing,
          age: 0,
          hit: false,
        });
      if (f.action !== 'dstHit') return;
      for (const effect of dstEffects(f.age)) this.spawnEffect(f, effect);
      if (f.age !== DST_FIRE_TICK) return;
      for (const [x, y] of [
        [30, -80],
        [71, -78],
      ]) {
        const missile: Projectile = {
          owner,
          kind: 'missile',
          x: f.x + f.facing * x * 1.5,
          y: f.y + y * 1.5,
          vx: f.facing * 1000 * SOURCE_VELOCITY_SCALE,
          vy: -1000 * SOURCE_VELOCITY_SCALE,
          facing: f.facing,
          age: 0,
          hit: false,
        };
        this.projectiles.push(missile);
        // PC 3160: each missile leaves a smoke ring drifting at −400/+400.
        this.spawnEffect(missile, {
          clip: 'dstMissileSmoke',
          x: 70,
          y: -60,
          front: false,
          vx: -400,
          vy: 400,
        });
      }
    });
    // Hit immunity does not disable body separation during knockdown/get-up.
    // Only the held pairs and the airborne throw may overlap.
    // Action 294 hides Ryuko and walks her through the shocked victim.
    const overlapping = new Set<Action>([
      'grabbed',
      'dstHeld',
      'superHeld',
      'thrown',
      'megaBeamHit',
    ]);
    if (
      !overlapping.has(a.action) &&
      !overlapping.has(b.action) &&
      Math.abs(a.y - b.y) < 120 &&
      Math.abs(a.x - b.x) < 90
    ) {
      const sign = a.x <= b.x ? 1 : -1;
      const mid = Math.max(
        FIGHTER_MARGIN + 45,
        Math.min(STAGE_WIDTH - FIGHTER_MARGIN - 45, (a.x + b.x) / 2),
      );
      if (frozen[0] && !frozen[1]) b.x = clampX(a.x + sign * 90);
      else if (frozen[1] && !frozen[0]) a.x = clampX(b.x - sign * 90);
      else if (!frozen[0] && !frozen[1]) {
        a.x = mid - sign * 45;
        b.x = mid + sign * 45;
      }
    }
    // Collect contacts before applying them so same-tick attacks can trade.
    const contacts = this.fighters.flatMap((f, i) => {
      if (frozen[i] || !isAttack(f.action)) return [];
      const attack = ATTACKS[f.action];
      const cycle = multiHits[f.action];
      const airDrill = f.action === 'airDrillSpin';
      const activeAge = f.age - attack.startup;
      if (cycle && activeAge >= 0 && activeAge % cycle.interval === 0)
        f.connected = false;
      const finisher = airDrill
        ? f.airDrillStage === 3
        : !cycle || Math.floor(activeAge / cycle.interval) === cycle.count - 1;
      const count = cycle?.count ?? 1;
      const damage = airDrill
        ? AIR_DRILL_DAMAGE[f.airDrillStage]
        : Math.floor(attack.damage / count) +
          (finisher ? attack.damage % count : 0);
      const target = this.fighters[1 - i];
      const distance = (target.x - f.x) * f.facing;
      if (
        protectedReactions.has(target.action) ||
        f.connected ||
        f.age < attack.startup ||
        f.age >= attack.startup + attack.active ||
        (cycle && activeAge % cycle.interval >= cycle.active) ||
        distance < 0 ||
        distance > attack.range ||
        Math.abs(f.y - target.y) >= 110
      )
        return [];
      // Decided on contact only: a CPU victim draws its guard roll here.
      const guarding = this.guarding(target, f);
      const stance =
        target.y < 0 || target.vy < 0
          ? 2
          : target.action.startsWith('crouch')
            ? 1
            : 0;
      const { ids, last } = ATTACK_RESPONSES[f.action];
      const response =
        RESPONSE_REACTIONS[
          RESPONSES[
            (finisher && last ? last : ids)[(guarding ? 3 : 0) + stance]
          ]
        ];
      const reaction = response.action;
      const blocked = blocks.has(reaction);
      const heavy =
        heavyImpacts.has(f.action) ||
        (f.action === 'punch2' && finisher && !blocked);
      // Aerial drill pauses are applied by the attacker's contact branch instead.
      const hitStop = airDrill ? 0 : response.stop;
      return [
        {
          f,
          target,
          damage,
          heavy,
          hitStop,
          attackerStop: airDrill ? 0 : (response.attackerStop ?? response.stop),
          airDrill,
          reaction: reaction as AnimatedAction | null,
          facing: f.facing,
          x: target.x - f.facing * 42,
          y:
            GROUND +
            target.y -
            (f.action.startsWith('crouch') || target.action.startsWith('crouch')
              ? 75
              : 145),
          projectile: null as Projectile | null,
          blocked,
          source: null as Fighter | Effect | null,
          fbh: false,
        },
      ];
    });
    this.fighters.forEach((f, i) => {
      if (!frozen[i] && isScripted(f.action))
        contacts.push(...this.boxContact(f, i));
    });
    for (const e of this.effects) contacts.push(...this.boxContact(e, e.owner));
    for (const projectile of this.projectiles) {
      const f = this.fighters[projectile.owner];
      const target = this.fighters[1 - projectile.owner];
      if (projectile.hit || protectedReactions.has(target.action)) continue;
      if (projectile.kind === 'missile') {
        // Action 218's box (−6, −21, ±47, ±29) against the tossed victim's
        // (−1, −92, ±37, ±102), in source pixels. Every response is 32 → 85.
        if (
          Math.abs(
            projectile.x -
              projectile.facing * 9 -
              (target.x - target.facing * 1.5),
          ) <
            (47 + 37) * 1.5 &&
          Math.abs(projectile.y - 31.5 - (target.y - 138)) < (29 + 102) * 1.5
        )
          contacts.push({
            f,
            target,
            damage: MISSILE_DAMAGE,
            heavy: true,
            // Action 85, PC 1000: 13 stop ticks, once for simultaneous missiles.
            // The missile, not Ryuko, pauses.
            hitStop: contacts.some(
              (c) => c.projectile?.kind === 'missile' && c.target === target,
            )
              ? 0
              : 13,
            attackerStop: 0,
            airDrill: false,
            reaction: 'twist',
            facing: projectile.facing,
            x: projectile.x,
            y: GROUND + projectile.y - 31.5,
            projectile,
            blocked: false,
            source: null,
            fbh: false,
          });
        continue;
      }
      if (
        Math.abs(projectile.x - target.x) < 65 &&
        Math.abs(projectile.y - (target.y - 125)) < 90
      ) {
        const blocked = this.guarding(target, projectile);
        // Action 227 selects FB on ground (no stop), strong hit in air.
        const hitStop = blocked ? 10 : target.y < 0 || target.vy < 0 ? 15 : 0;
        contacts.push({
          f,
          target,
          damage: 16,
          heavy: true,
          hitStop,
          attackerStop: hitStop,
          airDrill: false,
          reaction: null,
          facing: projectile.facing,
          x: target.x - projectile.facing * 42,
          y: GROUND + projectile.y,
          projectile,
          blocked,
          source: null,
          fbh: false,
        });
      }
    }
    for (const {
      f,
      target,
      damage: strength,
      heavy,
      hitStop,
      attackerStop,
      reaction,
      facing,
      x,
      y,
      projectile,
      blocked,
      source,
      fbh,
    } of contacts) {
      if (projectile) {
        projectile.hit = true;
        projectile.age = 0;
      } else if (source) source.connected = true;
      else f.connected = true;
      // The contact handler (0x40eec4) raises the attacker's cancel counter.
      if (!projectile && (!source || source === f)) f.contact = true;
      // Hit reactions delete the victim's objects with ids 7–9 (op 0x04, action 0).
      if (!blocked) {
        const victim = this.fighters.indexOf(target);
        this.effects = this.effects.filter(
          (e) => e.owner !== victim || e.slot < 7 || e.slot > 9,
        );
      }
      if (fbh) addPower(f, FBH_POWER);
      const damage = blocked ? 0 : strength;
      target.hp = Math.max(0, target.hp - damage);
      f.damage += damage;
      f.hitStop += attackerStop;
      target.hitStop += hitStop;
      const airborne = target.y < 0 || target.vy < 0;
      // Only the axe leaves its reaction to stance: action 227's strong
      // responses (50 → FB → 75, 4, 25–27).
      if (blocked)
        this.action(
          target,
          reaction ??
            (airborne
              ? 'airBlockHeavy'
              : target.action.startsWith('crouch')
                ? 'crouchBlockHeavy'
                : 'blockHeavy'),
          true,
        );
      else {
        f.hits++;
        this.action(
          target,
          target.hp === 0
            ? 'down'
            : (reaction ?? (airborne ? 'airHitHeavy' : 'hitHeavy')),
          true,
        );
      }
      // Axe response 50 (action 110) credits only the thrower on the ground.
      const [victimPower, attackerPower] =
        projectile?.kind === 'axe' && target.action === 'hitHeavy'
          ? [0, 10]
          : (REACTION_POWER[target.action] ?? [0, 0]);
      addPower(target, victimPower);
      addPower(f, attackerPower);
      // Reactions with recovered motion (and every super response) stop
      // incoming motion before their impact hold.
      const moved = source !== null || hasMotion(target.action);
      if (target.hp === 0 || moved) {
        target.vx = target.vy = 0;
        target.facing = facing === 1 ? -1 : 1;
      }
      this.impacts.push({
        x,
        y,
        age: 0,
        blocked,
        heavy,
        facing,
        effect: blocked ? 'guardSpark' : 'hitSpark',
      });
      // The guard reaction's first op 0x24 runs before its first display.
      if (blocked)
        this.counter(target, this.history[this.fighters.indexOf(target)]);
    }
    // Run contact branches after all hits: an interrupted aerial drill must not
    // apply its own stop or restart, regardless of fighter update order.
    for (const {
      f,
      target,
      airDrill,
      blocked,
      projectile,
      source,
    } of contacts) {
      // Action 200's hit handler enters 201 (a blocked kick does not).
      if (
        f.action === 'hitUp' &&
        !blocked &&
        !projectile &&
        !source &&
        target.hp > 0
      ) {
        const nextJump = f.nextJump;
        this.action(f, 'hitUpRecover');
        f.nextJump = nextJump;
      }
      // Op 0x02 slots 2 and 3 (hit, guard) enter 179/187 at contact.
      if ((f.action === 'punch' || f.action === 'kick') && !projectile)
        this.action(f, f.action === 'punch' ? 'punchHit' : 'kickHit');
      if (airDrill && f.action === 'airDrillSpin') {
        f.hitStop += 8;
        target.hitStop += blocked ? 3 : 9;
        f.airDrillStage = Math.min(3, f.airDrillStage + 1);
        this.action(f, 'airDrillContact');
      }
      // Op 0x02 slot 2: the super's own box enters its hit branch.
      if (source === f && f.onHit && !blocked && target.hp > 0) {
        this.action(f, SOURCE_ACTIONS[f.onHit], true);
        this.fireEvents(f);
      }
    }
    this.resolveThrows(frozen);
    if (a.hp === 0 || b.hp === 0 || this.seconds === 0) {
      this.projectiles = [];
      this.winner =
        a.hp === b.hp ? 'draw' : a.hp > b.hp ? 'player' : 'opponent';
      this.fighters.forEach((f, index) => {
        // KO action 60, PC 607 adds ten stop ticks to the other fighter.
        if (f.action === 'down') this.fighters[1 - index].hitStop += 10;
      });
      this.fighters.forEach((f, index) => {
        if (f.action === 'grabbed') this.action(f, 'airHit');
        if (f.action === 'dstHeld') this.action(f, 'hit');
        // A super's hold or cinematic ends with the round.
        if (f.action === 'superHeld' || f.action === 'shock')
          this.action(f, f.hp === 0 ? 'down' : f.y < 0 ? 'airHit' : 'hit');
        if (isScripted(f.action)) {
          f.box = null;
          f.ax = 0;
          if (f.y < 0) {
            this.action(f, 'jump');
            f.gravity = JUMP_GRAVITY;
          }
        }
        this.showResultPose(f, index);
      });
    }
  }
}

export class FixedClock {
  private remainder = 0;
  advance(deltaMs: number, tick: () => void) {
    // ponytail: discard long stalls after 250 ms; no background catch-up for a local match.
    this.remainder += Math.max(0, Math.min(250, deltaMs));
    while (this.remainder >= TICK_MS) {
      this.remainder -= TICK_MS;
      tick();
    }
  }
  reset() {
    this.remainder = 0;
  }
}
