// New MVP rules. These are intentionally separate from recovered idle semantics.
import {
  animationDuration,
  animationFrame,
  clipPose,
  AMIRO_INTRO_EX_TICK,
  ANMC_INTRO_EX_TICK,
  CHUNG_INTRO_EX_TICK,
  GIANT_INTRO_EX_TICK,
  SUNEO_INTRO_EX_TICK,
  SIN_INTRO_EX_TICK,
  KAY_INTRO_EX_TICK,
  SAKUYA_INTRO_EX_TICK,
  ALEX_INTRO_EX_TICK,
  SOU_INTRO_EX_TICK,
  ERUS_INTRO_EX_TICK,
  SOU_LANDING,
  KAY_WIN_HOP,
  LIZARD_LANDING,
  INTRO_EX_TICK,
  entryColor,
  eventsAt,
  scriptTick,
  heldFrame,
  hurtboxes,
  pushboxes,
  NORMAL_COLOR,
  POSE_EVENTS,
  script,
} from './animations';
import type {
  Action,
  AnimatedAction,
  BodyBox,
  Color,
  ObjectKey,
  Pose,
  Quake,
  Shown,
  SourceEvent,
  TrailSpec,
} from './animations';
import {
  CHARACTERS,
  countersOf,
  desperationOf,
  twinOf,
  lifeOf,
  responseEffectsOf,
  responsesOf,
  ryukoTwin,
  STAGES,
  twin,
} from './characters';
import type { Container, Stage, Who } from './characters';
import {
  BACK_DASH,
  commanded,
  entriesOf,
  HISTORY_TICKS,
  inject,
  inputWord,
  KEYS,
  nearOf,
  scan,
} from './commands';
import { CPU_CONTROLS, CPU_LEVEL, CPU_TABLES, CpuVM } from './cpu';
import { dummyInput } from './dummy';
import type { DummyBehavior } from './dummy';
import {
  FIGHT_TICK,
  NEXT_ROUND_TICKS,
  roundEndTick,
  ROUND_END_TICKS,
} from './hud';
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
  | 'ex'
  | SuperControl;
// The CPU's command entry, written as 0x4115e3 does (cpu.ts).
export type Input = Partial<Record<Control, boolean>> & { command?: number };
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
// The walls with the camera at either end of the stage: 50 source pixels in.
export const FIGHTER_MARGIN = 50 * 1.5;
const blankHistory = () => Array<number>(HISTORY_TICKS).fill(0);
// Opcode 1 uses 16.16 velocity scaled by floor(65536 / 100) at speed 10.
// Convert the recovered source velocities to the web's 1.5-scale arena.
const SOURCE_VELOCITY_SCALE = (655 / 65536) * 1.5;
// Opcode 1 acceleration uses floor(0x3c0000 / 100²) in the same 16.16 units.
const SOURCE_ACCELERATION_SCALE = (393 / 65536) * 1.5;
const JUMP_GRAVITY = 80 * SOURCE_ACCELERATION_SCALE;
// Op 0x01 in each grounded reaction: raw velocity and acceleration from its
// age, until `until` or its end.
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
  inatuma: slide(42, -650, 10), // 118, PC 1557
  icePunch: slide(42, -650, 10), // 106, PC 1367
  hisoStop: slide(42, -650, 10), // 113, PC 1470
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
  hitRapid: slide(0, -150, 10), // 83, PC 954
};
// KAY's HISO stop holds 33 ticks (116, PC 1559) to Ryuko's 36.
const OWN_SLIDES: Partial<Record<Who, typeof reactionSlides>> = {
  kay: { hisoStop: slide(39, -650, 10) },
};
// Reactions whose op 0x16 enters their air form off the floor.
const AIR_FORMS: Partial<Record<Action, Action>> = {
  inatuma: 'airInatuma',
  hisoStop: 'airHisoStop',
};
// Air reactions without a landing handler play the op 0x01 commands of their
// flattened scripts; land() ends them (0x411810).
const AIR_REACTIONS: Partial<Record<Action, number>> = {
  airHit: 74, // PCs 774/778: rise at raw 100, then −300/−650, ax 1, gravity 66
  airHitHeavy: 76, // PCs 816/823: the same, then −300/−850 at age 6
  airInatuma: 120, // PC 1579: hangs still, without gravity
  airIcePunch: 107, // PC 1381: as 120
  airHisoStop: 114, // PC 1482: as 120
  airHitRapid: 84, // PCs 979/990: drift at −100, then −400/−830, gravity 80
  airBlock: 153, // PCs 2060/2063: −420, ax −15, gravity 70; vy 0 at age 3
  airBlockHeavy: 158, // PCs 2133/2136: −450 and vy 0 at age 6
  airBlockRapid: 167, // PCs 2263/2266: as 158
  airTimeStopGuard: 172, // PC 2323: falls from rest at gravity 70
};
// Motion starts at the listed action age; landing enters the next action.
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
      // The action a wall enters (op 0x02 slot 4).
      wall?: AnimatedAction;
    }
  >
> = {
  launchUp: { tick: 25, vx: -160, vy: -1700, gravity: 60, land: 'knockdown' },
  // Response 42 (Zoma's DRAGON) → action 96 (PC 1163), landing into 146.
  uppercut: { tick: 5, vx: -200, vy: -1620, gravity: 70, land: 'knockdown' },
  // Response 82 (Kiki's EN3) → action 126, rising straight up (PC 1715).
  liftUp: { tick: 5, vx: 0, vy: -1620, gravity: 70, land: 'knockdown' },
  // Responses 44 and 45 (Kiki's EN3 beam) → actions 99 and 100, hopping in
  // and out from their first tick (PCs 1217, 1240).
  tatumakiIn: { tick: 0, vx: 500, vy: -720, gravity: 90, land: 'knockdown' },
  tatumakiOut: { tick: 0, vx: -500, vy: -720, gravity: 90, land: 'knockdown' },
  // Response 48 (Chung's crouching kick and air fire) → action 104: HISA's
  // flight (PC 1318).
  fireLaunch: { tick: 6, vx: -600, vy: -1220, gravity: 90, land: 'knockdown' },
  // Response 52 (Amiro's Coment chuck and scc) → action 134: thrown straight
  // up after its first display (PC 1825), landing into 146 (PC 1824).
  chuckUp: { tick: 1, vx: -160, vy: -2000, gravity: 80, land: 'knockdown' },
  // Response 37 (Chung's chuck) → action 91: flat out with no fall (PC
  // 1081) until a wall enters 95 (PC 1079), which drops at age 18 (PC 1141).
  flySide: {
    tick: 6,
    vx: -1500,
    vy: -500,
    gravity: 0,
    land: 'knockdown',
    wall: 'flySideWall',
  },
  flySideWall: { tick: 18, vx: 0, vy: 0, gravity: 50, land: 'knockdown' },
  // Response 73 (Yo's GIGA PRESS) → action 140: flat out at its first tick
  // (PC 1907) with no fall until a wall enters 95 (PC 1906).
  chuckYo: {
    tick: 0,
    vx: -1100,
    vy: 0,
    gravity: 0,
    land: 'knockdown',
    wall: 'flySideWall',
  },
  // Response 57 (Chung's EN300) → action 136, the same flight (PC 1862),
  // spinning in 93 until a wall enters 94 (PC 1106), which bounces it back
  // out (PC 1126) into 87.
  twistSide: {
    tick: 6,
    vx: -1500,
    vy: -500,
    gravity: 0,
    land: 'knockdown',
    wall: 'twistWall',
  },
  twistWall: { tick: 8, vx: 700, vy: -800, gravity: 60, land: 'knockdown' },
  // Response 61 (Chung's lee) → action 137, floating from its first tick
  // (PC 1871) until GON_MISS_TICKS.
  gonMiss: { tick: 0, vx: -330, vy: -430, gravity: 0, land: 'knockdown' },
  // Response 60 (Zoma's DST) → action 109: nine ticks of shaking, then PC
  // 1434 drops it into 146 (PC 1433).
  airStun: { tick: 9, vx: 0, vy: -830, gravity: 80, land: 'knockdown' },
  launchAway: { tick: 6, vx: -600, vy: -1220, gravity: 90, land: 'knockdown' },
  // Response 53 (SAKUYA's K3 Hit New, op 0x14) → action 105: pulled up
  // toward the striker from its first tick (PC 1337), landing into 146 (PC
  // 1341).
  chainPull: { tick: 0, vx: 500, vy: -1520, gravity: 90, land: 'knockdown' },
  // A chuck's response 41 → action 132 (PC 1793), landing into 146 (PC 1792).
  chuckToss: { tick: 6, vx: -600, vy: -1920, gravity: 90, land: 'knockdown' },
  // Crouching kick response 7 selects action 79: a lower pop into knockdown.
  sweep: { tick: 6, vx: -300, vy: -1020, gravity: 90, land: 'knockdown' },
  launchDown: { tick: 9, vx: -500, vy: 2000, gravity: 100, land: 'slamBounce' },
  // Air Drill response 56 → action 135 (PC 1841); its landing branch enters 124.
  drillDown: { tick: 0, vx: -800, vy: 2000, gravity: 100, land: 'slamBounce' },
  slamBounce: { tick: 10, vx: -400, vy: -700, gravity: 70, land: 'bounceDown' },
  // DST response 31 → action 129 (PC 1747); its landing branch at PC 1756.
  dstToss: { tick: 0, vx: -200, vy: -3000, gravity: 90, land: 'tossBounce' },
  tossBounce: { tick: 10, vx: -100, vy: -1000, gravity: 80, land: 'knockdown' },
  // Missile response 32 → action 85 (PC 1002); its landing branch at PC 1011.
  twist: { tick: 0, vx: -500, vy: -1700, gravity: 90, land: 'twistBounce' },
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
// Ryuko's parameter block (file offset 0x157a1d9): 100 power per stock, three
// stocks, none at the start. Routine 0x40e6f0 carries and borrows between them.
export const POWER_PER_STOCK = 100;
export const MAX_STOCK = 3;
// The same block's 510 life. Its 30% (153, desperationOf) selects desperation
// branches and, in 0x40e7c0, shrinks every loss to 60%.
export const LIFE = 510;
// Vs. single play's rounds to win (0x470048, 0x4087da): GAME.INI's
// Editor.TestPlay.VSSinglePlay, 3 (0x414afc).
export const ROUNDS_TO_WIN = 3;
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
  // PCs 1212, 1235.
  tatumakiIn: [3, 0],
  tatumakiOut: [3, 0],
  chainPull: [3, 0], // PC 1332
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
  'uppercut',
  'liftUp',
  'fireLaunch',
  'flySide',
  'twistSide',
  'inatuma',
  'airInatuma',
  'icePunch',
  'airIcePunch',
  'hisoStop',
  'airHisoStop',
] as const)
  REACTION_POWER[action] = [5, 3];
// Action 135 credits only the victim, as do 132 (PC 1783), 134 (PC 1818) and
// 108–109 (PCs 1400, 1421).
REACTION_POWER.drillDown = [5, 0];
REACTION_POWER.chuckToss = [8, 0];
REACTION_POWER.chuckUp = [5, 0];
REACTION_POWER.stun = REACTION_POWER.airStun = [1, 0];
// Zoma's crouching guard (151) adds 2 more to him (PC 1929); ANMC P's
// Tatumaki >> (102) gives him 5 and the attacker 3 (PC 1229), and KAY's
// Fire HISA (107) the attacker 13 (PC 1324). ALEX's air time guards (176,
// 181) and ERUS's stop guards (167, 169) have no op 0x15, so add them none.
const OWN_REACTION_POWER: Partial<
  Record<Who, Partial<Record<Action, [number, number]>>>
> = {
  zoma: { crouchBlock: [3, 0] },
  anmc: { tatumakiOut: [5, 3] },
  kay: { fireLaunch: [5, 13] },
  alex: { airBlockRapid: [0, 0], airTimeStopGuard: [0, 0] },
  erus: { blockStop: [0, 0], crouchBlockStop: [0, 0] },
};
const reactionPower = (f: Fighter): [number, number] =>
  OWN_REACTION_POWER[f.who]?.[f.action] ?? REACTION_POWER[f.action] ?? [0, 0];
// The intros' op 0x01 runs, as [ticks, raw vx, vy, gravity] from the clip's
// start: action 33 walks at 200 until PC 339, after its first 50 ticks;
// Amiro's Round BR (33) drives in at 600 after its first display (PC 367),
// then at 60 (PC 372); Yo's Round 1 (35) rides in at 110 from PC 378 until
// PC 385. LIZARD's 開始時 BR (33) rises at −4000 for two ticks (PC 372),
// stops (PC 374), then leaps at 400/−1000 with gravity 60 (PC 377) until he
// lands (LIZARD_LANDING). KAY's Round 1 (33) walks at 200 from PC 356 to PC
// 365. SOU's 開始時 BR (36) rises at −7000 with gravity −10000 for two ticks
// (PC 401), then falls at 300 (PC 410) until he lands (SOU_LANDING). The
// others' have no op 0x01, so they start where these end.
type Runs = [number, number, number?, number?][];
const INTRO_MOTION: Partial<Record<Who, Runs>> = {
  ryuko: [[50, 200]],
  amiro: [
    [2, 0],
    [32, 600],
    [15, 60],
  ],
  yo: [[90, 110]],
  lizard: [
    [2, 0],
    [2, 0, -4000],
    [100, 0],
    [LIZARD_LANDING - 104, 400, -1000, 60],
  ],
  kay: [[56, 200]],
  sou: [
    [2, 0, -7000, -10000],
    [SOU_LANDING - 2, 0, 300],
  ],
};
// The wins' op 0x01 runs alike: KAY's hop (KAY_WIN_HOP).
const WIN_MOTION: Partial<Record<Who, Runs>> = {
  kay: [
    [KAY_WIN_HOP.at, 0],
    [KAY_WIN_HOP.ticks, 0, -1000, 70],
  ],
};
// A run's velocity at `age`, its gravity added before each move.
const runVelocity = (runs: Runs = [], age: number) => {
  for (const [ticks, vx, vy = 0, ay = 0] of runs) {
    if (age < ticks)
      return [
        vx * SOURCE_VELOCITY_SCALE,
        vy * SOURCE_VELOCITY_SCALE + (age + 1) * ay * SOURCE_ACCELERATION_SCALE,
      ];
    age -= ticks;
  }
  return [0, 0];
};
const introWalk = (who: Who) =>
  (INTRO_MOTION[who] ?? []).reduce((x, [ticks, vx]) => x + ticks * vx, 0) *
  SOURCE_VELOCITY_SCALE;
// Ryuko's lose action (+0x75a0), which jumps into KO Normal (60).
const LOSE = 59;
// Ryuko's knockdown, 'DOWN normal'.
const KNOCKDOWN = 146;
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
  // G Suneo's EX D Driver reaches 118 through response 68.
  118: { action: 'inatuma', stop: 15 },
  // DIDO's >HEN300 Hit reaches 'ICE Punch' and its air form through
  // responses 54 and 55; both play as ERUS INATUMA's do (PCs 1355–1367).
  106: { action: 'icePunch', stop: 15 },
  107: { action: 'airIcePunch', stop: 15 },
  // HISO's GUN SHOT reaches 'HISO stop' through response 64, whose op 0x16
  // enters its air form off the floor (PC 1455); both play as ICE Punch's do.
  113: { action: 'hisoStop', stop: 15 },
  114: { action: 'airHisoStop', stop: 15 },
  79: { action: 'sweep', stop: 13 },
  80: { action: 'launchAway', stop: 13 },
  // SAKUYA's K3 Hit New reaches 105 through response 53, with no op 0x1a.
  105: { action: 'chainPull', stop: 0 },
  96: { action: 'uppercut', stop: 13 },
  // Kiki's ranbu reaches 'DRAGON Fireball' through response 63, which plays
  // as 96 does, and her EN3 'DRAGON Yinan' through 82.
  125: { action: 'uppercut', stop: 13 },
  126: { action: 'liftUp', stop: 13 },
  // Its beam reaches 99 and 100 through responses 44 and 45, with no op 0x1a.
  99: { action: 'tatumakiIn', stop: 0 },
  100: { action: 'tatumakiOut', stop: 0 },
  // Chung's crouching kick and air fire reach 104 through response 48, his
  // chuck 91 through 37, his EN300 136 through 57 and his lee 137 through 61;
  // the last two have no op 0x1a.
  104: { action: 'fireLaunch', stop: 13 },
  91: { action: 'flySide', stop: 13 },
  136: { action: 'twistSide', stop: 0 },
  137: { action: 'gonMiss', stop: 0 },
  // Amiro's Coment chuck and scc reach 134 through response 52 (op 0x14).
  134: { action: 'chuckUp', stop: 0 },
  // Giant's BASE BALL MISS ATT reaches 92 through response 38, which flies as
  // 136 does with 91's stops (PC 1096). ponytail: its first three displays'
  // body boxes don't push (kind 2, PC 1097) where 136's do (PC 1857).
  92: { action: 'twistSide', stop: 13 },
  // His chuck reaches 133 through response 49 and his counter hit 143
  // through 81 (op 0x14), neither with an op 0x1a.
  133: { action: 'musicAttack', stop: 0 },
  143: { action: 'vanish', stop: 0 },
  // Yo's GIGA PRESS reaches 140 through response 73 (op 0x14), with no op
  // 0x1a.
  140: { action: 'chuckYo', stop: 0 },
  // Ryuko's DST missiles (218), Zoma's hatchets and Shin Spark reach it
  // through response 32 (PC 1000: 13 stop ticks).
  85: { action: 'twist', stop: 13 },
  108: { action: 'stun', stop: 0 },
  109: { action: 'airStun', stop: 0 },
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
  // FB (110) does too (PC 1442), then enters 75 on the ground (PC 1444) or 76
  // in the air (PC 1443): the EX ball's response 50.
  110: { action: 'hitHeavy', stop: 15 },
  111: { action: 'hitRapid', stop: 0 },
  112: { action: 'launchAway', stop: 13 },
  122: { action: 'rushAirHit', stop: 0 },
  128: { action: 'superHeld', stop: 0 },
  129: { action: 'dstToss', stop: 0 },
  132: { action: 'chuckToss', stop: 0 },
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
// Op 0x15 in FB (PC 1442) and FBH (PC 1448) credits the striker. KAY's
// FBH (110), a bare copy of HISA, gives only HISA's 3 (PC 1408).
const STRIKER_POWER: Partial<Record<number, number>> = { 110: 10, 112: 10 };
const OWN_STRIKER_POWER: Partial<Record<Who, Partial<Record<number, number>>>> =
  { kay: { 112: 0 } };
// A loss that empties life sets the lose action 59 (0x40e83e), which enters
// KO Normal (60), or KO NORMAL 2nd (61) while player variable 3 is above 40
// (PC 595): only a KO sets it (50, PC 596), so for a fighter already KO'd.
const knockedOut = (wasOut: boolean): Action => (wasOut ? 'koAgain' : 'down');
// 0x40e7c0: at 30% life or less, a loss shrinks to 60% (at least 1).
function loseLife(f: Fighter, loss: number) {
  if (loss && f.hp <= desperationOf(f.who))
    loss = Math.max(1, Math.trunc((loss * 60) / 100));
  f.hp = Math.max(0, f.hp - loss);
  return loss;
}
// 0x40f010: a hit takes the box's damage scaled by the struck body box's
// percentage `taken`; a guard takes 20% (+0x7ca5) only from a box of kind bit 2.
// Ryuko's combo decay (+0x7ca8) is 0, so the victim's hit count never reduces
// damage and isn't tracked.
function boxDamage(box: ScriptBox, taken: number, blocked: boolean) {
  if (!blocked)
    return box.damage && Math.max(1, Math.trunc((box.damage * taken) / 100));
  return box.damage && box.kind & 4
    ? Math.max(1, Math.trunc((box.damage * 20) / 100))
    : 0;
}
// Op 0x17 lists six responses: standing, crouching and airborne, then the
// same three guarding. This picks the victim's.
const responseFor = (
  ids: readonly number[],
  target: Fighter,
  guarding: boolean,
  crouching: boolean,
) =>
  ids[
    (guarding ? 3 : 0) + (target.y < 0 || target.vy < 0 ? 2 : crouching ? 1 : 0)
  ];
// 0x4124c9 deletes an object that doesn't follow its parent once it leaves
// x −50..1330 or y −50..1010 source pixels; the floor is y 920 (0x412247).
const inWorld = ({ x, y }: { x: number; y: number }) =>
  x >= -50 * 1.5 && x <= 1330 * 1.5 && y >= -970 * 1.5 && y <= 90 * 1.5;
// 0x40f010: a box from `origin` hits the first of the target's body boxes it
// overlaps on both axes, each mirrored by its owner's facing. 0x40eab0 puts
// the contact at the centre of that overlap.
function struck(
  origin: { x: number; y: number },
  facing: number,
  box: ScriptBox,
  target: Fighter,
) {
  const x = origin.x + facing * box.x * 1.5;
  const y = origin.y + box.y * 1.5;
  const mid = (a: number, r: number, b: number, s: number) =>
    (Math.min(a + r, b + s) + Math.max(a - r, b - s)) / 2;
  for (const body of hurtboxes(shown(target), target.age, target.who)) {
    const bx = target.x + target.facing * body.x * 1.5;
    const by = target.y + body.y * 1.5;
    if (
      Math.abs(x - bx) < (box.w + body.w) * 1.5 &&
      Math.abs(y - by) < (box.h + body.h) * 1.5
    )
      return {
        taken: body.taken,
        x: mid(x, box.w * 1.5, bx, body.w * 1.5),
        y: mid(y, box.h * 1.5, by, body.h * 1.5),
      };
  }
}
// Ops 0x07 and 0x14 mark the player they hold or toss reeling and held
// (+0x15e & ~5 | 0xa, 0x413020 and 0x41314a).
// The twins whose op 0x01 flies at another raw vx: every HISA Down but
// Ryuko's and Zoma's at −800 (Kiki's, Chung's, Amiro's, ANMC P's, Giant's, G
// Suneo's, Yo's, SIN's, LIZARD's, KAY's, DIDO's, SAKUYA's, ALEX's, SOU's and
// HISO's 124, 127, 128, 125, 130, 135, 126, 128, 126, 128, 129, 143, 132, 133
// and 131, PCs 1522, 1582, 1883, 1631, 1799, 1756, 1582, 1638, 1623, 1795,
// 1818, 1938, 1848, 1725 and 1814), and Amiro's Tatumaki >> (105) at −300 (PC 1398).
const LAUNCH_VX: Partial<Record<Who, Partial<Record<Action, number>>>> = {
  kiki: { launchDown: -800 },
  chung: { launchDown: -800 },
  amiro: { launchDown: -800, tatumakiOut: -300 },
  anmc: { launchDown: -800 },
  giant: { launchDown: -800 },
  suneo: { launchDown: -800 },
  yo: { launchDown: -800 },
  sin: { launchDown: -800 },
  lizard: { launchDown: -800 },
  kay: { launchDown: -800 },
  dido: { launchDown: -800 },
  sakuya: { launchDown: -800 },
  alex: { launchDown: -800 },
  sou: { launchDown: -800 },
  hiso: { launchDown: -800 },
  erus: { launchDown: -800 },
};
// Reactions whose script rolls op 0x20 on entry (PCs 794, 819, 909, 957, 982,
// 1159, 1215, 1238, 1403, 1425, 1619, 1711, 1787): 75, 76, 80, 96, 99, 100,
// 126 and 132 only skip a sound, while 83, 84, 108, 109 and 122 swap their
// first three poses. Ryuko's jump hit (77) has none, but Zoma's and Kiki's
// (78, PC 784) roll which displays play, and Amiro's knockdown (84, PC
// 990) whether to skip its sound.
const ROLLED: Partial<Record<Action, number>> = {
  sweep: 79,
  uppercut: 96,
  liftUp: 126,
  tatumakiIn: 99,
  tatumakiOut: 100,
  stun: 108,
  airStun: 109,
  hitHeavy: 75,
  airHitHeavy: 76,
  launchAway: 80,
  chainPull: 105,
  chuckToss: 132,
  hitRapid: 83,
  airHitRapid: 84,
  rushAirHit: 122,
  jumpHit: 77,
  flySide: 91,
};
// ponytail: ANMC P's Chuck Twis (131) rolls rand % 6 > 2 to skip its sound
// (PC 1719), but the toss plays as a clip, so it always sounds and draws no
// roll; add dstToss here once it plays from its timeline.
// Each player's twins that roll in its own records: Zoma's chuck toss (133)
// and Kiki's rises (97, 127) don't.
const ROLLS = Object.fromEntries(
  (Object.keys(CHARACTERS) as Who[]).map((who) => [
    who,
    Object.fromEntries(
      Object.entries(ROLLED)
        .map(([action, index]) => [action, twin(who, index)] as const)
        .filter(([, index]) =>
          script(index, who).events.some((e) => e.op === 'random'),
        ),
    ),
  ]),
) as Record<Who, Partial<Record<Action, number>>>;
const rolls = (who: Who) => ROLLS[who];
const markHeld = (f: Fighter) => (f.reaction = (f.reaction & ~5) | 0xa);
// A looping script never runs out, so its object lives until deleted.
const loops = (e: Effect) => script(e.clip, e.who).end === 'loop';
// A jump target: an action, or "action+offset" entering mid-action.
const sourceKey = (action: number, offset: number): ObjectKey =>
  offset ? `${action}+${offset}` : action;
// The timeline a scripted fighter runs.
const timeline = (f: Fighter) => f.branch!;
// Op 0x1f player variable 0 at 10: Ryuko's EX mode, which EX Ch (204, PC
// 2867) sets and NOR Ch (205, PC 2880) clears; Chung's at 100, set by TO EX
// (229, PC 3191) and cleared by TO NOR (230, PC 3204). Zoma's counts his
// bombs. Each intro's op 0x16 jumps while down is held when the tick comes:
// Ryuko's to 'Chage Character' (37), Chung's (PC 338) to Change EX (35),
// which set it and jump back. Amiro's at 100 too, set by EX Ch (214, PC 3287)
// and cleared by NOR Ch (215, PC 3300); her intro's (PC 382) enters EX
// CHANGE (39) + 3, which jumps to the same displays in Round 1 (32 + 6).
// ANMC P's at 100, set by to ex (242, PC 3299) and cleared by TO NOR (243,
// PC 3312); his intro's (PC 363) enters 'Chage Character' (39), as Ryuko's.
// Giant's at 100, set by TO EX (231, PC 3408) and cleared by TO NORMAL (232,
// PC 3421); his intro's (PC 328) enters Chung Style (37), which jumps back to
// Round 1 (33 + 18). G Suneo's at 100, set by TO EX (235, PC 3491) and
// cleared by TO NORMAL (236, PC 3504); her intro's (PC 403) enters change
// character (41), which sets it and jumps back (35 + 13, PC 464). SIN's at
// 10, set by TO EX (208) and cleared by TO NORMAL (209); his intro's (PC
// 403) enters hanshin change (40), which sets it and jumps back (33 + 26, PC
// 449). KAY's at 100, set by EX (227, PC 3453) and cleared by NOR (228, PC
// 3467); his intro's (PC 367) enters EX CH (36), which sets it (PC 407) and
// jumps to the same calls of Demo stand (30 + 25, PC 408). SAKUYA's at 100,
// set by TO EX (256, PC 3692) and cleared by TO NOR (257, PC 3705); her
// intro's (PC 413) enters ex change (49), which sets it (PC 521) and jumps
// to the same call of STAND DEMO (37 + 24, PC 522). ponytail: there STAND
// DEMO jumps to Skill1 (32, PC 296), the same 80 ticks in her EX stance,
// which the flattened intro doesn't follow. ALEX's at 100, set by TO EX (225,
// PC 3315) and cleared by TO NORMAL (226, PC 3328); his intro's (PC 356)
// enters EX change (39), which sets it (PC 412) and jumps back (33 + 18, PC
// 413). SOU's at 10, set by TYPE CHANGE to EX (222, PC 3006) and cleared by
// TYPE CHANGE to NOR (223, PC 3019), which the first enters while it is set
// (PC 3003); his intro's (PC 415) enters Change Character (41), which sets
// it (PC 464) and jumps back (37 + 12, PC 465).
const EX_MODE: Partial<Record<Who, { value: number; intro: number }>> = {
  ryuko: { value: 10, intro: INTRO_EX_TICK },
  chung: { value: 100, intro: CHUNG_INTRO_EX_TICK },
  amiro: { value: 100, intro: AMIRO_INTRO_EX_TICK },
  anmc: { value: 100, intro: ANMC_INTRO_EX_TICK },
  giant: { value: 100, intro: GIANT_INTRO_EX_TICK },
  suneo: { value: 100, intro: SUNEO_INTRO_EX_TICK },
  sin: { value: 10, intro: SIN_INTRO_EX_TICK },
  kay: { value: 100, intro: KAY_INTRO_EX_TICK },
  sakuya: { value: 100, intro: SAKUYA_INTRO_EX_TICK },
  alex: { value: 100, intro: ALEX_INTRO_EX_TICK },
  sou: { value: 10, intro: SOU_INTRO_EX_TICK },
  erus: { value: 10, intro: ERUS_INTRO_EX_TICK },
};
// Zoma, Kiki and Yo have none, whatever their variable 0 holds.
export const exMode = (f: Fighter) => {
  const ex = EX_MODE[f.who];
  return ex !== undefined && f.variables[0] === ex.value;
};
// What a fighter shows: under 'script', its source action's timeline.
const shown = (f: Fighter): Shown =>
  f.action === 'script' ? f.branch! : f.action;
// Each player's engine states by number (the export's `neutral`), which a
// handler enters as the port's actions, and their moves' levels (header r[2]).
const NEUTRAL = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, { neutral }]) => [who, neutral]),
) as unknown as Record<Who, Record<string, Action>>;
const LEVELS = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, { levels }]) => [who, levels]),
) as unknown as Record<Who, Record<string, number>>;
// Each victim action's source number (Ryuko's), for the guard reactions.
const REACTION_INDEX = new Map(
  Object.entries(RESPONSE_REACTIONS).map(([index, { action }]) => [
    action as Action,
    Number(index),
  ]),
);
// A command entered free and a landing handler mark a player acting
// (+0x15e & ~8 | 4, 0x411a41 and 0x4118f3); a cancel keeps the bits.
const markActing = (f: Fighter) => (f.reaction = (f.reaction & ~8) | 4);
// Returning to neutral (0x411a80) clears bits 4 and 8, on the ground 1 and 2
// as well, and the striker (0x411abc–0x411b06).
function toNeutral(f: Fighter) {
  f.reaction &= f.y < 0 ? ~0xc : ~0xf;
  f.striker = null;
  f.window = null;
}
// A script step that starts a display first re-arms an object holding an
// attack box of kind bit 1 (clears +0x15e bit 0x10, 0x41257d), its first
// display and each pass of a loop too: ERUS's Cerb Att (243) strikes again
// from its hit handler (PC 3573).
function rearm(actor: Fighter | Effect, index: ObjectKey, age: number) {
  const kinds = [actor.box, ...actor.boxes].reduce(
    (kinds, box) => kinds | (box?.kind ?? 0),
    0,
  );
  const t = scriptTick(index, age, actor.who);
  if (kinds & 2 && script(index, actor.who).frames.some((f) => f.t === t))
    actor.connected = false;
}
// 0x40f010 skips a player victim by the box's kind (0x40f12d–0x40f18e): 0x10
// one on the ground, 0x20 one in the air, 8 one in a guard reaction (+0x15e &
// 0xc is 0xc) and 0x80 one reeling or held (8). Free and attacking fighters (0
// and 4) meet every box. Ryuko's strikes carry none of these bits; Musashi's
// grab (0x2a) and its super-cancel version (0x18) and the grabs (0xa8, 8) do.
// Otherwise only body boxes protect: a lying fighter's sits below the floor, a
// getting-up or held one has none.
function skips(box: ScriptBox, target: Fighter) {
  const airborne = target.y < 0 || target.vy !== 0;
  if (box.kind & (airborne ? 0x20 : 0x10)) return true;
  const bits = target.reaction & 0xc;
  return (box.kind & 8 && bits === 0xc) || (box.kind & 0x80 && bits === 8);
}
// For the authored practice partners: when a move's first box opens, and the
// farthest centre distance at which it meets an idle `victim` facing it.
export function firstStrike(who: Who, index: number, victim: Who) {
  const box = script(index, who).events.find((e) => e.op === 'box' && e.w);
  if (box?.op !== 'box') throw new Error(`Source action ${index} has no box`);
  const [body] = hurtboxes('idle', 0, victim);
  return { from: box.t, reach: (box.x + box.w + body.w + body.x) * 1.5 };
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
// What the free state enters through the neutral handler (0x410dc0, actions
// 1–7 and 18–27) once a script ends in op 0x00, plus the authored guard poses.
// The fall is left out: air attacks, air dashes and supers reach it through
// op 0x0a, which keeps the bits, so only an air reaction's end clears them.
const neutralActions = new Set<Action>([
  'idle',
  'walk',
  'backwalk',
  'turn',
  'crouchTurn',
  'crouch',
  'crouchEnter',
  'stand',
  'takeoff',
  'guard',
  'crouchGuard',
  'airGuard',
]);
const reactions = new Set<Action>([
  'hit',
  'hitHeavy',
  'airHit',
  'airHitHeavy',
  'hitRapid',
  'airHitRapid',
  ...(Object.keys(launchMotion) as Action[]),
  'jumpHit',
  'inatuma',
  'airInatuma',
  'icePunch',
  'airIcePunch',
  'hisoStop',
  'airHisoStop',
  'hitPull',
  'shock',
  'stun',
  ...blocks,
]);
export interface Fighter {
  // Whose container the fighter plays: actions, art, sounds and tables.
  who: Who;
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
  // The input word op 0x1a's stop saved (+0x4dfd83), while its flag
  // (+0x4dfd7f) holds.
  stopInput: Input | null;
  connected: boolean;
  hits: number;
  damage: number;
  power: number;
  stock: number;
  // Scripted (super) state: the last age whose events ran, op 0x01 horizontal
  // acceleration, the active op 0x18 box and op 0x17 responses, the op 0x02 hit
  // handler.
  fired: number;
  ax: number;
  box: ScriptBox | null;
  // Op 0x18 slots 1–7, by slot: Ryuko's repeat a box 2000 pixels down, for
  // objects' bodies.
  boxes: (ScriptBox | null)[];
  responses: number[];
  onHit: ObjectKey;
  // Op 0x02 slots 3 (guard) and 1 (landing): each a jump target, 0 for none.
  onGuard: ObjectKey;
  onLand: ObjectKey;
  // Slot 4 (+0x70): what a wall enters.
  onWall: ObjectKey;
  // Op 0x1e's cancel window (+0xdf91): action changes keep it, and the
  // return to neutral clears it (0x411b0c). Zoma's moves read it.
  window: Window | null;
  // Op 0x23 and 0x25: action changes (0x410cf0) keep them. `entered` is the
  // display whose events last ran.
  color: Color;
  trail: Trail | null;
  entered: Pose | null;
  fader: Fader | null;
  // Action 43 'Black', which the round intro spawns for each player (PCs
  // 300/325): showing nothing, its panel opaque, or its panel at 50%, for
  // `left` more ticks.
  black: { shown: 'none' | 'opaque' | 'half'; left: number };
  // Set on a fighter held by a super: op 0x07's pose, flags and holder offset.
  held: { pose: number; flags: number; x: number; y: number } | null;
  // This action's own attack or box has connected (hit or block).
  contact: boolean;
  // The op 0x20 branch this reaction rolled on entry, drawn instead of its
  // clip, or the op 0x16 branch EX Fire's charge took, run instead of its
  // timeline.
  branch: ObjectKey | null;
  // The cycle of the HUD face (action 70's object variable 0) from EX mode's
  // first tick, or −1.
  face: number;
  // Op 0x1f's player variables by number (0x4dfa75 + player). Ryuko's: 0 is
  // EX mode (exMode), 1 is 10 after a double jump and 20 in an air dash, 6 is
  // 100 through an IORI stage, 12 is 10 from EX Fire 2 (232, PC 3364) until
  // EX Fire (231, PC 3341) or its shot's hit (235, PC 3438) clears it, and
  // 14 (selector 0x4e) is 100 through a super, which darkens the stage.
  // Zoma's 0 counts his bombs, ten each, and 6 marks DRAGON.
  variables: Record<number, number>;
  // +0x15e bits 0–3: a hit sets 8 and a guard 12 (0x40f7a8, 0x40f6a2), a
  // hold 0xa (0x413020). Action changes (0x410cf0) keep them until the
  // fighter returns to neutral. `striker` (+0xdefd): the opponent's own box
  // ('body', 0x40f8a4) or an object following it ('object', 0x40f8ac).
  reaction: number;
  striker: 'body' | 'object' | null;
  // Distance the walls stopped this tick, and player +0xdf49: x the next
  // motion step adds (0x40fa09).
  stopped: number;
  transfer: number;
  // What the motion pass (travel) does with an engine action this tick: add
  // its velocity, or move it so far along the ground. Scripts add theirs.
  moving: 'velocity' | number;
  // The next action (+0x38), which the next step enters (enterPending).
  pending: Pending | null;
}
// What a contact, an op 0x14 or a loss queues: a reaction, with its op 0x1a
// stops for the victim and the striker, the striker's op 0x15 power and the
// victim's own action its response named; or the striker's own hit or guard
// handler.
type Pending =
  | {
      action: Action;
      stop: number;
      attackerStop: number;
      power: number;
      own?: number;
    }
  | { key: ObjectKey };
type Window = Extract<SourceEvent, { op: 'window' }>;
export interface ScriptBox {
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
  kind: number;
}
// What spawns an object: a fighter or another object.
type Spawner = {
  x: number;
  y: number;
  facing: -1 | 1;
  screen?: boolean;
  z?: number;
  who?: Container;
  stage?: Effect['stage'];
};
// The fighters' priority (+4).
export const FIGHTER_Z = 0x50;
// Spawned source objects, positioned like characters by the renderer, each
// running its flattened timeline: spawns, motion, boxes.
export interface Effect {
  clip: ObjectKey;
  // The owner's container, which holds the object's action.
  who: Container;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  gravity: number;
  facing: -1 | 1;
  age: number;
  // Priority (+4, 10–127): the step pass (0x404d4c) and the draw (0x404df1)
  // take objects by it, lowest first, the fighters at 0x50.
  z: number;
  // Owning fighter, and the owner's object slot (r[12]) it holds, or −1.
  owner: number;
  slot: number;
  // Op 0x04 flag 0x40: viewport coordinates instead of the stage.
  screen: boolean;
  // Op 0x04 flag 0x20 (+0x28 bit 0x20000000): the parent it keeps to, at the
  // op's offset (+0x12d/+0x12f).
  follow: { parent: Spawner; x: number; y: number } | null;
  box: ScriptBox | null;
  boxes: (ScriptBox | null)[];
  responses: number[];
  connected: boolean;
  // Op 0x1a's stop ticks (+0x40) for an object following a stopped player.
  hitStop: number;
  color: Color;
  trail: Trail | null;
  // Op 0x02 handlers: what a hit (slot 2) or a guard (slot 3) enters.
  onHit?: ObjectKey;
  onGuard?: ObjectKey;
  // Slot 1: what landing on the floor enters (0x41241c).
  onLand?: ObjectKey;
  // The handler a contact queued (+0x38), which the next step enters.
  pending?: ObjectKey;
  // A stage object: the action it restarts and its scroll percentages.
  stage?: { home: number; x: number; y: number };
}
// Op 0x25's slot (+0x151; 100 samples at 0x447f80 + 0x650 each): the
// countdown and the samples to draw, oldest first.
export interface Trail {
  spec: TrailSpec;
  counter: number;
  samples: { x: number; y: number; facing: -1 | 1; pose: Pose }[];
}
// 0x413a9a: a record with no count or interval frees the slot; any other
// starts it afresh.
const startTrail = ({
  count,
  interval,
  mode,
  tint,
  r,
  g,
  b,
  fade,
}: TrailSpec): Trail | null =>
  count && interval
    ? {
        spec: { count, interval, mode, tint, r, g, b, fade },
        counter: 0,
        samples: [],
      }
    : null;
// 0x40ce8e: the k-th of `count` images (oldest 0) keeps the object's colour
// (tint 0), takes the record's (1), or blends from the record's toward the
// object's as k and the countdown grow (2). Each draws in the record's mode.
export function afterimageColor(trail: Trail, k: number, own: Color): Color {
  const { spec } = trail;
  if (spec.tint === 1)
    return {
      mode: spec.mode,
      r: spec.r,
      g: spec.g,
      b: spec.b,
      fade: spec.fade,
    };
  if (spec.tint !== 2) return { ...own, mode: spec.mode };
  const p = Math.trunc(
    (100 * (k * spec.interval + trail.counter)) / (spec.count * spec.interval),
  );
  const mix = (from: number, to: number) =>
    Math.trunc((from * (100 - p) + to * p) / 100);
  return {
    mode: spec.mode,
    r: mix(spec.r, own.r),
    g: mix(spec.g, own.g),
    b: mix(spec.b, own.b),
    fade: mix(spec.fade, own.fade),
  };
}
// One axis of op 0x0e's shake (0x447da9 x, 0x447dbd y), which 0x40c9e0
// steps once per drawn frame (0x404dd0, after the frame's ticks): `left`
// counts down from `frames`, and the offset decays (type 1), grows (2),
// holds (3) or is rand() % amplitude (4), then flips sign on odd frames
// (0x4456fc counts them). The last frame zeroes it.
export type ShakeAxis = Quake & { offset: number; left: number };
export function stepShake(
  axis: ShakeAxis,
  frame: number,
  random: () => number,
) {
  if (!axis.left) return;
  if (!--axis.left) {
    axis.offset = 0;
    return;
  }
  const p = Math.trunc((axis.left * 100) / axis.frames);
  const { type, amplitude } = axis;
  if (type === 1) axis.offset = Math.trunc((amplitude * p) / 100);
  else if (type === 2) axis.offset = Math.trunc((amplitude * (100 - p)) / 100);
  else if (type === 3) axis.offset = amplitude;
  else if (type === 4 && amplitude) axis.offset = random() % amplitude;
  if (frame & 1) axis.offset = -axis.offset;
}
// Op 0x0e's fader for one player (0x4dfd93 + player × 0xe03f): 0x40ca90
// writes r, g, b and fade over the colour of every object of that player
// while `left` runs. Type 1 blends from `start` toward the target as `left`
// falls; type 2 also shows `start` on odd drawn frames (scene.ts).
export interface Fader {
  type: number;
  start: Omit<Color, 'mode'>;
  target: Omit<Color, 'mode'>;
  left: number;
  ticks: number;
}
export function faderColor({ start, target, left, ticks }: Fader) {
  const p = Math.trunc((left * 100) / ticks);
  const mix = (to: number, from: number) =>
    Math.trunc((to * (100 - p) + from * p) / 100);
  return {
    r: mix(target.r, start.r),
    g: mix(target.g, start.g),
    b: mix(target.b, start.b),
    fade: mix(target.fade, start.fade),
  };
}
// The display a fighter shows.
export function fighterPose(f: Fighter): Pose {
  // Op 0x07 replaces a held player's display, whatever its action: Giant's
  // counter hit holds a vanished victim (PC 4334).
  if (f.held?.pose) return heldFrame(f.held.pose, f.held.flags, f.who);
  if (f.branch) return animationFrame(f.branch, f.age, f.who);
  return clipPose(
    shown(f),
    f.action === 'jump' ? f.airAge : f.age,
    f.who,
    exMode(f),
  );
}
const newEffect = (
  fields: Partial<Effect> & Pick<Effect, 'clip' | 'who'>,
): Effect => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  ax: 0,
  gravity: 0,
  facing: 1,
  age: 0,
  z: FIGHTER_Z + 1,
  owner: 0,
  slot: -1,
  screen: false,
  follow: null,
  box: null,
  boxes: [],
  responses: [],
  connected: false,
  hitStop: 0,
  color: NORMAL_COLOR,
  trail: null,
  ...fields,
});
const fighter = (x: number, facing: -1 | 1, who: Who = 'ryuko'): Fighter => ({
  who,
  x,
  y: 0,
  vx: 0,
  vy: 0,
  gravity: 0.24,
  hp: lifeOf(who),
  facing,
  action: 'idle',
  age: 0,
  airAge: 0,
  hitStop: 0,
  stopInput: null,
  connected: false,
  hits: 0,
  damage: 0,
  power: 0,
  stock: 0,
  fired: -1,
  ax: 0,
  box: null,
  boxes: [],
  responses: [],
  onHit: 0,
  onGuard: 0,
  onLand: 0,
  onWall: 0,
  window: null,
  color: NORMAL_COLOR,
  trail: null,
  entered: null,
  fader: null,
  black: { shown: 'none', left: 1 },
  held: null,
  contact: false,
  reaction: 0,
  striker: null,
  branch: null,
  face: -1,
  variables: {},
  stopped: 0,
  transfer: 0,
  moving: 0,
  pending: null,
});
// Camera scroll (0x447f2c) in source pixels, which the walls read this tick.
let cameraLeft = 0;
// In the Vs. modes (0x470058 1 or 2) a player's motion step clamps x to 50
// and 590 source pixels from the camera (0x40fba2–0x40fca2).
const clampX = (x: number) =>
  Math.max((cameraLeft + 50) * 1.5, Math.min((cameraLeft + 590) * 1.5, x));
// Moves stop at the walls at once; settle hands on the distance stopped. The
// left wall measures it as (50 − camera) − x (0x40fbdd), not from the wall.
// True when a wall stopped it.
function placeX(f: Fighter, x: number) {
  f.x = clampX(x);
  f.stopped += f.x > x ? Math.max(0, (50 - cameraLeft) * 1.5 - x) : f.x - x;
  return f.x !== x;
}
const clampCamera = ({ x, y }: { x: number; y: number }) => ({
  x: Math.max(0, Math.min(640, x)),
  y: Math.max(0, Math.min(480, y)),
});
// Op 0x01: flag bit 0 adds; bits 1–4 keep vx, vy, ax and ay unchanged.
function motion(
  actor: Pick<Fighter, 'vx' | 'vy' | 'ax' | 'gravity' | 'facing'>,
  event: Extract<SourceEvent, { op: 'motion' }>,
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
function launchJump(f: Fighter) {
  // Actions 4–6 choose neutral or directional velocity at takeoff.
  f.vy = -(f.vx === 0 ? 1450 : 1400) * SOURCE_VELOCITY_SCALE;
  f.gravity = JUMP_GRAVITY;
  f.airAge = 0;
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

// A stage object restarts the action it began in, and scrolls by that
// action's start record (0x41221d).
const stageScroll = (stage: Stage, home: number) => {
  const [x, y] = (STAGES[stage].scroll as Record<number, number[]>)[home];
  return { home, x, y };
};
// Round setup (0x408c3f) makes each stage object (0x406610) at the stage's
// top left, owned by no player; it first steps in the tick's pass.
const stageObjects = (stage: Stage) =>
  STAGES[stage].objects.map(({ action, z }) =>
    newEffect({
      clip: action,
      who: stage,
      age: -1,
      y: -920 * 1.5,
      z,
      owner: -1,
      stage: stageScroll(stage, action),
    }),
  );

// Authored start: both walk-ins end 360 pixels apart around the stage center.
const introFighters = ([a, b]: [Who, Who]): [Fighter, Fighter] => [
  { ...fighter(STAGE_WIDTH / 2 - 180 - introWalk(a), 1, a), action: 'intro' },
  { ...fighter(STAGE_WIDTH / 2 + 180 + introWalk(b), -1, b), action: 'intro' },
];

export class Match {
  fighters: [Fighter, Fighter];
  ticks = 0;
  winner: 'player' | 'opponent' | 'draw' | null = null;
  endingTicks = 0;
  // Ticks since round setup, and whether the match plays the Vs. CPU intro,
  // round calls and rounds.
  roundTicks = 0;
  readonly calls: boolean;
  // The round (0x470044) and each side's won rounds (0x4dfc6d, 0x4edcac).
  round = 1;
  wins: [number, number] = [0, 0];
  effects: Effect[] = [];
  // The stage's objects, which step with the others by priority.
  layers: Effect[];
  // Global 6 (0x4456bc): supers and COUNTER HIT add their freeze to it (op
  // 0x1f var 0x86), and KGT action 58 counts it down each tick unless paused
  // (PCs 366–371).
  freeze = 0;
  // PC 611's hold this tick, applied to both fighters after they move.
  private koStop = 0;
  // This tick's op 0x03 cues: each fighter's sound table (+0x221c) and index.
  sounds: { owner: number; index: number }[] = [];
  // The latest op 0x0e shake per axis; the renderer steps it (stepShake), and
  // a new object restarts it.
  quake: { x: Quake | null; y: Quake | null } = { x: null, y: null };
  // Camera scroll (0x447f2c, 0x447f30) in source pixels, from the first step.
  private camera: { x: number; y: number } | null = null;
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
  // This tick's input, which op 0x16 reads.
  private inputs: [Input, Input] = [{}, {}];
  private history = [blankHistory(), blankHistory()];

  constructor(
    public mode: Mode = 'practice',
    intro = false,
    seed = 0,
    // Player 1's and player 2's characters.
    readonly characters: [Who, Who] = ['ryuko', 'ryuko'],
    readonly stage: Stage = 'court',
  ) {
    this.layers = stageObjects(stage);
    const cpu = characters[1];
    this.cpu = new CpuVM(CPU_TABLES[cpu], CPU_LEVEL, seed, CPU_CONTROLS[cpu]);
    this.calls = intro;
    this.fighters = intro
      ? introFighters(characters)
      : [fighter(300, 1, characters[0]), fighter(660, -1, characters[1])];
  }

  // State 902 (0x40970a) ends a Vs. match once either side has won enough
  // rounds; a single round otherwise.
  get matchOver() {
    return !this.calls || this.wins.some((wins) => wins >= ROUNDS_TO_WIN);
  }

  get matchWinner() {
    if (!this.calls) return this.winner;
    const [a, b] = this.wins.map((wins) => wins >= ROUNDS_TO_WIN);
    return a && b ? 'draw' : a ? 'player' : b ? 'opponent' : null;
  }

  // Ticks after the KO until the transition to another round, or the match's
  // end: authored, the port ends where the source wipes to its post-match
  // screen, and a single round after the KO lettering and one more second.
  get roundEnd() {
    if (!this.calls) return ROUND_END_TICKS;
    const winner = this.fighters[this.winner === 'player' ? 0 : 1];
    return roundEndTick(this.winner, winner.hp === lifeOf(winner.who));
  }

  // State 100 (0x408970) counts the round and sets it up again: the fighters
  // re-enter at full life (0x411ca5) with their variables cleared
  // (0x4121cc), keeping their stock and power from round 2 (0x411f2d).
  private nextRound() {
    const fighters = introFighters(this.characters);
    fighters.forEach((f, i) => {
      f.stock = this.fighters[i].stock;
      f.power = this.fighters[i].power;
    });
    this.fighters = fighters;
    this.round++;
    this.ticks = 0;
    this.winner = null;
    this.endingTicks = 0;
    this.roundTicks = 0;
    this.effects = [];
    this.layers = stageObjects(this.stage);
    this.freeze = 0;
    this.koStop = 0;
    this.quake.x = this.quake.y = null;
    this.camera = null;
    this.clearInput();
  }

  // 0x4146d0 records each player's input word every tick, frozen or not.
  // The CPU clears its history first (0x411307, `clear`), then writes the
  // command it enters (commands.ts). Authored: the player's command keys do
  // the same, so a key enters its own command whatever was typed before it.
  private record(i: number, input: Input, clear = false) {
    const history = this.history[i];
    const [f, other] = [this.fighters[i], this.fighters[1 - i]];
    const key = KEYS[f.who].find(
      ([control]) => input[control] && !this.previous[i][control],
    );
    if (key || clear) history.fill(0);
    const word = inputWord(input, other.x >= f.x);
    history.push(word);
    history.shift();
    if (key)
      inject(
        history,
        key[0] === 'dash' && (word & 3) === 1 ? BACK_DASH[f.who] : key[1],
        f.who,
        0,
        true,
      );
    // Each word takes the step's direction too (0x411644).
    else if (input.command) inject(history, input.command, f.who, word & 15);
  }

  clearInput() {
    this.previous = [{}, {}];
    this.history = [blankHistory(), blankHistory()];
  }

  // Where the camera object (0x40af30, state 3) aims: 320 source pixels up
  // and left of the fighters' midpoint, its floor at y 920.
  private aim() {
    const [a, b] = this.fighters;
    return {
      x: Math.trunc((a.x + b.x) / 3) - 320,
      y: Math.trunc(920 + (a.y + b.y) / 3) - 320,
    };
  }

  // Authored start: the camera begins on the fighters, as round start's 320,
  // 480 (0x407094) does for fighters centred on the stage.
  private view() {
    return this.camera ?? clampCamera(this.aim());
  }

  get cameraX() {
    return this.view().x * 1.5;
  }

  get seconds() {
    return this.mode === 'practice'
      ? Infinity
      : Math.max(0, 60 - Math.floor(this.ticks / 100));
  }

  get cameraY() {
    return (this.view().y - 480) * 1.5;
  }

  get resultReady() {
    // Authored: after the lettering, wait for each fighter to take its result
    // or lie KO'd, as moves now run on past the round's end.
    return (
      this.winner !== null &&
      this.matchOver &&
      this.endingTicks >= this.roundEnd &&
      this.fighters.every((f) => ['win', 'draw', 'koLand'].includes(f.action))
    );
  }

  // Op 0x1a's stops (0x413637 self, 0x4136ae other) reach a player and
  // every object following it (+0x28 bit 0x20000000, op 0x04 flag 0x20).
  // Each saves the player's input word this tick (0x413676, 0x413715).
  private pause(f: Fighter, ticks: number) {
    if (!ticks) return;
    f.hitStop += ticks;
    const owner = this.fighters.indexOf(f);
    f.stopInput = { ...this.inputs[owner] };
    for (const e of this.effects)
      if (e.owner === owner && e.follow) e.hitStop += ticks;
  }

  // A reaction rolls its op 0x20 at its first script step, before the hit
  // effect's objects (the fighters' bucket 0x50 runs before their 0x5d).
  private roll(who: Who, action: Action): ObjectKey | null {
    const rolled = rolls(who)[action];
    const roll = rolled
      ? script(rolled, who).events.find((e) => e.op === 'random')
      : undefined;
    return roll?.op === 'random' &&
      this.cpu.random() % roll.divisor > roll.above
      ? `${roll.action}+${roll.offset}`
      : null;
  }

  private action(
    f: Fighter,
    action: Action,
    restart = false,
    branch?: ObjectKey | null,
  ) {
    if (f.action === action && !restart) return;
    // KO Normal's PC 607 adds ten stop ticks to the other fighter.
    if (action === 'down')
      this.pause(this.fighters[1 - this.fighters.indexOf(f)], 10);
    f.action = action;
    f.age = 0;
    f.connected = false;
    f.contact = false;
    // Air reactions land straight into idle, as landing without a handler
    // clears the bits too (0x4124c3).
    if (neutralActions.has(action)) toNeutral(f);
    f.branch = branch === undefined ? this.roll(f.who, action) : branch;
    // 0x410d50 stops a player entering an action on the ground, and keeps an
    // airborne one's motion: Zoma's moves take this.
    const flying = action === 'script' && (f.y < 0 || f.vy !== 0);
    f.fired = -1;
    if (!flying) f.ax = 0;
    f.box = null;
    f.boxes = [];
    f.responses = [];
    // 0x40e510 clears the handlers.
    f.onHit = f.onGuard = f.onLand = f.onWall = 0;
    // A source action's own op 0x23 sets its colour, and a clip action's op
    // 0x1e its window as its display starts (enter).
    if (action !== 'script') {
      f.color = entryColor(action, f.who) ?? f.color;
      f.window = null;
    }
    f.entered = null;
    if (action !== 'superHeld') f.held = null;
    // Scripts own their motion: each starts still until its op 0x01 commands.
    if (action === 'script') {
      if (!flying) f.vx = f.vy = f.gravity = 0;
    } else if (action === 'superHeld' || action === 'shock') {
      f.vx = f.vy = 0;
      f.gravity = 0;
      f.moving = 0;
    } else if (f.gravity === 0) f.gravity = 0.24;
    if (action === 'down' || action === 'koAgain') {
      f.vx = 0;
      f.gravity = 0.24;
      f.moving = 0;
    }
  }

  // The action of a standing fighter's round result (+0xe007): 1 win (57),
  // or 3 draw (65), which the result states (0x409444, 0x409519) also give
  // the loser once the timer (0x470050) has run out.
  private result(f: Fighter) {
    const index = this.fighters.indexOf(f);
    return this.winner !== 'draw' &&
      (this.winner === 'player') === (index === 0)
      ? 'win'
      : 'draw';
  }

  // KO Normal (60) holds both fighters 40 ticks at age 5 (PC 611) and
  // launches at age 14 (PC 617); KO NORMAL 2nd (61) launches at age 6 (PC
  // 631). Each lands into KO DOWN (62), which slides back for ten ticks
  // (PCs 641–644; Amiro's 63 for 12, PCs 710–714), then lies while the round
  // is over (PC 645).
  private moveKO(f: Fighter) {
    if (f.action === 'koLand') {
      if (f.age <= (f.who === 'amiro' ? 12 : 10))
        f.moving = -f.facing * 200 * SOURCE_VELOCITY_SCALE;
      return true;
    }
    const launch = f.action === 'down' ? 14 : f.action === 'koAgain' ? 6 : 0;
    if (!launch) return false;
    if (f.action === 'down' && f.age === 5) this.koStop += 40;
    if (f.age === launch) {
      f.vx = -f.facing * 500 * SOURCE_VELOCITY_SCALE;
      f.vy = -1520 * SOURCE_VELOCITY_SCALE;
      f.gravity = 90 * SOURCE_ACCELERATION_SCALE;
      f.airAge = 0;
    }
    if (f.age >= launch) {
      f.airAge++;
      f.moving = 'velocity';
    }
    return true;
  }

  private recoverKnockdown(f: Fighter) {
    if (
      (f.action === 'knockdown' || f.action === 'bounceDown') &&
      f.hp > 0 &&
      f.age >= animationDuration(f.action, f.who)
    )
      this.action(f, 'getUp');
  }

  // GIANT!! MUSIC ATTACK (133) loops until another action takes the victim,
  // each pass first running its records: Ryuko's rolls rand() % 31 > 1 to
  // jump past its sound (PCs 1803–1807); Giant's spawns love heart (440, PC
  // 1944).
  private musicAttack(f: Fighter) {
    if (f.action !== 'musicAttack') return false;
    if (f.age % animationDuration('musicAttack', f.who)) return true;
    const owner = this.fighters.indexOf(f);
    for (const event of script(twin(f.who, 133), f.who).events) {
      if (event.t) break;
      if (event.op !== 'random') this.runEvent(f, owner, event);
      else if (this.cpu.random() % event.divisor > event.above) break;
    }
    return true;
  }

  // Chuck 消える (143) holds its blank display for 100 ticks, then jumps into
  // rambu AIR (122, PC 1965), running its first records at once.
  private vanish(f: Fighter, other: Fighter) {
    if (f.action !== 'vanish') return false;
    if (f.age >= animationDuration('vanish', f.who)) {
      this.queue(f, 'rushAirHit');
      this.enterPending(f, other);
    }
    return true;
  }

  // GON MISS (137) floats until its display ends (PC 1873). Then its op
  // 0x15 (PC 1874) takes 40 life from the victim and adds 5 power to it and
  // 3 to the striker, and PC 1875 jumps into HISA (80), running its first
  // records at once: 13 stop ticks for both and its own power. Life that
  // runs out queues the lose action.
  private gonMiss(f: Fighter, other: Fighter) {
    if (f.action !== 'gonMiss' || f.age < animationDuration(f.action, f.who))
      return false;
    const wasOut = f.hp === 0;
    other.damage += loseLife(f, 40);
    addPower(f, 5);
    addPower(other, 3);
    this.queue(f, 'launchAway', 13, 13);
    this.enterPending(f, other);
    if (f.hp === 0) this.queue(f, knockedOut(wasOut));
    return true;
  }

  private moveLaunch(f: Fighter) {
    const motion = launchMotion[f.action];
    if (!motion) return false;
    // Victim actions hold their impact pose before the motion command.
    if (motion.drift && f.age < motion.tick)
      f.moving = f.facing * motion.drift * SOURCE_VELOCITY_SCALE;
    if (f.age === motion.tick) {
      const vx = LAUNCH_VX[f.who]?.[f.action] ?? motion.vx;
      f.vx = f.facing * vx * SOURCE_VELOCITY_SCALE;
      f.vy = motion.vy * SOURCE_VELOCITY_SCALE;
      f.gravity = motion.gravity * SOURCE_ACCELERATION_SCALE;
      f.airAge = 0;
    }
    if (f.age >= motion.tick) {
      f.airAge++;
      f.moving = 'velocity';
    }
    return true;
  }

  private slideReaction(f: Fighter) {
    const slide = OWN_SLIDES[f.who]?.[f.action] ?? reactionSlides[f.action];
    if (slide) {
      if (
        f.age >=
        (slide.until ?? animationDuration(f.action as AnimatedAction, f.who))
      )
        f.vx = 0;
      else if (f.age >= slide.start) {
        f.vx =
          f.facing *
          (slide.velocity * SOURCE_VELOCITY_SCALE +
            (f.age - slide.start + 1) *
              slide.acceleration *
              SOURCE_ACCELERATION_SCALE);
        f.moving = f.vx;
      }
    }
    if (f.action === 'bounceDown' && f.age <= 10)
      f.moving = -f.facing * 200 * SOURCE_VELOCITY_SCALE;
  }

  // A held or shocked victim follows its holder's script, or is released
  // without it (authored: when the holder is hit, KO'd or done).
  private holdVictims() {
    this.fighters.forEach((target, index) => {
      // A queued action takes the victim at its next step.
      if (target.pending) return;
      const holder = this.fighters[1 - index];
      const held =
        target.action === 'superHeld' ||
        target.action === 'shock' ||
        target.action === 'musicAttack' ||
        Boolean(target.held?.pose);
      if (held && (holder.action !== 'script' || holder.hp === 0)) {
        // One held below the floor is set on it.
        target.y = Math.min(0, target.y);
        this.action(target, target.y < 0 ? 'airHit' : 'hit');
      }
    });
  }

  // The guard reactions run their own op 0x24 checks at their ages, once
  // their op 0x10 has found a stock (else it enters a twin without them,
  // 150/152): Ryuko's a fresh Hit Up (PCs 2016–2021, 2073–2083, …), Zoma's
  // Hit Up at ages 0 and 8 and P+K (0x2090) at 18. Each enters COUNTER HIT.
  private counter(f: Fighter, history: number[]) {
    if (!blocks.has(f.action)) return false;
    const key = twin(f.who, REACTION_INDEX.get(f.action)!);
    const stock = script(key, f.who).events.find((e) => e.op === 'stock');
    if (stock?.op === 'stock' && f.stock <= stock.min) return false;
    const check = eventsAt(key, f.age, f.who).find(
      (e) => e.op === 'command' && commanded(history, e.steps, e.window),
    );
    if (check?.op !== 'command') return false;
    this.enterSource(f, check.action, check.offset);
    return true;
  }

  // Runs a scripted fighter's events once per action age.
  private fireEvents(f: Fighter) {
    if (f.action !== 'script' || f.fired === f.age) return;
    f.fired = f.age;
    const owner = this.fighters.indexOf(f);
    const key = timeline(f);
    rearm(f, key, f.age);
    // A branch has run its own events instead.
    for (const event of eventsAt(key, f.age, f.who))
      if (this.runEvent(f, owner, event)) return;
  }

  // True when the object jumped to another timeline.
  private fireEffect(e: Effect) {
    rearm(e, e.clip, e.age);
    for (const event of eventsAt(e.clip, e.age, e.who))
      if (this.runEvent(e, e.owner, event)) return true;
    return false;
  }

  // An action change (0x410cf0) by number: the engine states and a player's
  // own victim reactions (Ryuko's Musashi finish ends in FLY NO HIT, 97;
  // Giant's chuck in his, 101; KAY's Matriel hit Down lands, slot 1 at PC
  // 4637, in his knockdown, 151) play as the port's actions, and any other
  // source action runs its timeline. ponytail: a reaction entered so skips
  // its op 0x15 power and op 0x1a stops; a jump past them (Giant's Drop P
  // lend enters TWIS HIT + 12) skips them in the source too, and
  // export_fighter checks none goes further, past a display.
  private enterSource(f: Fighter, index: number, offset = 0) {
    const ryuko = twinOf(f.who, index) ?? 0;
    const named =
      (offset ? undefined : NEUTRAL[f.who][index]) ??
      (ryuko === KNOCKDOWN ? 'knockdown' : RESPONSE_REACTIONS[ryuko]?.action);
    if (named) return this.action(f, named, true);
    const key = sourceKey(index, offset);
    // A target one past its action's end runs out at once (0x4125ea): DIDO's
    // >HE300 Hit5 lands in en300 hit + 28 (slot 1, PC 5047), so she stands.
    // ponytail: a step early, where the engine's next step runs it out.
    if (!animationDuration(key, f.who) && script(key, f.who).end === 'end') {
      if (!this.runOut(f)) this.action(f, 'idle');
      return;
    }
    this.action(f, 'script', true);
    f.branch = key;
    this.fireEvents(f);
  }

  // A handler's target, "action+offset" entering mid-action.
  private enterKey(f: Fighter, key: ObjectKey) {
    const [index, offset = 0] = String(key).split('+').map(Number);
    this.enterSource(f, index, offset);
  }

  // A jump to another timeline (ops 0x16, 0x1f, 0x20 and 0x24) runs its
  // first records at once, in place of the rest of this step's.
  private branchTo(actor: Fighter | Effect, key: ObjectKey) {
    actor.age = 0;
    if ('clip' in actor) {
      actor.clip = key;
      // A stage object that runs out with no display between, as Sakura
      // Street's roll past the end of action 17 does (PC 159, 0x4125ea),
      // restarts at once (0x4127b7).
      const { frames, end } = script(key, actor.who);
      if (
        !this.fireEffect(actor) &&
        actor.stage &&
        !frames.length &&
        end === 'end'
      )
        this.branchTo(actor, actor.stage.home);
    } else {
      actor.branch = key;
      actor.fired = -1;
      this.fireEvents(actor);
    }
    return true;
  }

  // Op 0x1f's checks (0x4137a4) of player variables (selectors 0x40 up) and
  // global 6 (the freeze): == (1), > (2) or < (3).
  private passes(
    self: Fighter,
    { selector, compare, value }: Extract<SourceEvent, { op: 'test' }>,
  ) {
    const variable =
      selector === 0x86 ? this.freeze : (self.variables[selector & 0x3f] ?? 0);
    return compare === 1
      ? variable === value
      : compare === 2
        ? variable > value
        : variable < value;
  }

  // Op 0x16's conditions (0x412da7, table 0x413ce8) on this tick's input:
  // 1 on the ground, 2 and 3 there without or with down, 4 forward (toward
  // the facing at +0x5c), 5 back, 6 up, 7 down, 8 no direction.
  private holds(f: Fighter, owner: number, condition: number) {
    const input = this.inputs[owner];
    const grounded = f.y >= 0 && f.vy >= 0;
    const [forward, back] =
      f.facing === 1 ? [input.right, input.left] : [input.left, input.right];
    return !![
      grounded,
      grounded && !input.crouch,
      grounded && input.crouch,
      forward,
      back,
      input.jump,
      input.crouch,
      !input.left && !input.right && !input.jump && !input.crouch,
    ][condition - 1];
  }

  // Op 0x0b calls an action once; running out returns after the call
  // (+0x85, 0x412625). Ryuko's (228, 229) have no displays, so their
  // records run at once, and a passing check jumps into the other.
  private runCall(
    actor: Fighter | Effect,
    owner: number,
    key: ObjectKey,
  ): void {
    for (const event of script(key, actor.who).events)
      if (event.op !== 'test') this.runEvent(actor, owner, event);
      else if (this.passes(this.fighters[owner], event))
        return this.runCall(
          actor,
          owner,
          sourceKey(event.action, event.offset),
        );
  }

  // 0x40f36a, 0x40f88c: a hit or guard queues the striking object's op 0x02
  // handler, which its next step enters.
  private handle(e: Effect, guarded: boolean) {
    const handler = guarded ? e.onGuard : e.onHit;
    if (handler === undefined) return;
    Object.assign(e, {
      onHit: undefined,
      onGuard: undefined,
      pending: handler,
    });
  }

  // True when the actor jumped to another timeline.
  private runEvent(
    actor: Fighter | Effect,
    owner: number,
    event: SourceEvent,
  ): boolean {
    const self = this.fighters[owner];
    const other = this.fighters[1 - owner];
    switch (event.op) {
      case 'spawn':
        // 0x412ac0: Zoma's spawn into his slot r[12] while its object lives
        // jumps to r[5:7] instead, if set (FIRE enters P 1 while its
        // fireball flies).
        if (
          event.busy &&
          !(event.flags & 4) &&
          !('clip' in actor) &&
          actor.action === 'script' &&
          this.effects.some((e) => e.owner === owner && e.slot === event.slot)
        )
          return this.branchTo(actor, sourceKey(event.busy, event.busyOffset));
        this.spawnObject(actor, owner, event);
        break;
      case 'motion':
        motion(actor, event);
        break;
      case 'sound':
        this.sounds.push({ owner, index: event.index });
        break;
      case 'box': {
        const box =
          event.w || event.h
            ? {
                x: event.x,
                y: event.y,
                w: event.w,
                h: event.h,
                damage: event.damage,
                kind: event.kind,
              }
            : null;
        // 0x40f010 tries every slot against every body. Ryuko's slot 1 boxes
        // sit 2000 pixels down, where only objects meet; DIDO's Raiden att
        // handen (301) strikes with slots 0–7 (PCs 4146–4153).
        if (event.slot) {
          actor.boxes = [...actor.boxes];
          actor.boxes[event.slot] = box;
        } else actor.box = box;
        // Op 0x18 re-arms a player for a box of kind bit 1 (0x412d49), and
        // restarts its contact counter (0x412d2b). ponytail: a box without
        // kind bit 0 leaves the counter at 0, so no contact raises it; none of
        // Zoma's moves opens a window after one.
        if (box && !('clip' in actor)) {
          actor.contact = false;
          if (box.kind & 2) actor.connected = false;
        }
        break;
      }
      case 'responses':
        actor.responses = event.ids;
        break;
      case 'stop':
        this.pause(other, event.other);
        if (actor === self) this.pause(self, event.self);
        break;
      case 'freeze':
        this.freeze = (event.set ? 0 : this.freeze) + event.add;
        break;
      // ponytail: slot 5 (+0x74) takes a struck object to its action
      // (0x40edde), as Kiki's potatoes (189, 190) enter POTETO HIT (194);
      // the port strikes only fighters, so it never fires.
      // Action 0 clears the slot (0x40f6e6 tests it): LIZARD's SHOOT OBJ
      // EXPLO (290) clears its own (PCs 3940–3942) before it strikes.
      case 'handler':
        if (!('clip' in actor)) {
          const key = event.action && sourceKey(event.action, event.offset);
          if (event.slot === 1) actor.onLand = key;
          else if (event.slot === 2) actor.onHit = key;
          else if (event.slot === 3) actor.onGuard = key;
          else if (event.slot === 4) actor.onWall = key;
        } else if (event.slot >= 1 && event.slot <= 3)
          actor[(['onLand', 'onHit', 'onGuard'] as const)[event.slot - 1]] =
            event.action ? sourceKey(event.action, event.offset) : undefined;
        break;
      case 'call':
        this.runCall(actor, owner, event.action);
        break;
      // An object and Zoma take their checks' jumps; Ryuko's are his
      // entry's.
      case 'test':
        if (
          ('clip' in actor || actor.action === 'script') &&
          this.passes(self, event)
        )
          return this.branchTo(actor, sourceKey(event.action, event.offset));
        break;
      // Op 0x24 jumps when its steps match in the input history (0x410a50).
      case 'command':
        if (
          !('clip' in actor) &&
          actor.action === 'script' &&
          commanded(this.history[owner], event.steps, event.window)
        )
          return this.branchTo(actor, sourceKey(event.action, event.offset));
        break;
      case 'window':
        if (!('clip' in actor)) actor.window = event;
        break;
      case 'input':
        if (
          !('clip' in actor) &&
          this.holds(actor, owner, event.condition) !== event.negate
        )
          return this.branchTo(actor, sourceKey(event.action, event.offset));
        break;
      case 'hold':
        if (!this.struck(other)) break;
        other.held = {
          pose: event.pose,
          flags: event.flags,
          x: event.x,
          y: event.y,
        };
        // The hold replaces the victim's stop (+0x40 at -1, 0x41303a) and
        // zeroes its motion (0x412f66).
        other.hitStop = 0;
        Object.assign(other, { vx: 0, vy: 0, ax: 0, gravity: 0, moving: 0 });
        this.placeHeld(self, other);
        break;
      case 'apply': {
        const own = responsesOf(other.who)[event.response];
        const reaction = RESPONSE_REACTIONS[ryukoTwin(other.who, own)];
        if (!reaction || !this.struck(other)) break;
        other.held = { pose: 0, flags: event.flags, x: event.x, y: event.y };
        this.placeHeld(self, other);
        // Like a contact it queues the reaction (0x413136), and it clears
        // the victim's stop (0x413147).
        other.hitStop = 0;
        this.queue(
          other,
          reaction.action,
          reaction.stop,
          reaction.attackerStop ?? reaction.stop,
          0,
          own,
        );
        break;
      }
      case 'power':
        // 0x40e7c0 adds a gain to the player's own life, up to full life
        // (0x40ea9f): Yo's ZOMBI WALK bite, 2 a pass through ZOMBI RP (PC
        // 3056), then 6 (PC 3011). No script lowers its own.
        if (event.selfLife > 0)
          self.hp = Math.min(lifeOf(self.who), self.hp + event.selfLife);
        if (event.otherLife < 0) {
          const wasOut = other.hp === 0;
          const damage = loseLife(other, -event.otherLife);
          self.hits++;
          self.damage += damage;
          if (other.hp === 0) this.queue(other, knockedOut(wasOut));
        }
        addPower(self, event.selfPower);
        addPower(other, event.otherPower);
        break;
      case 'color': {
        const { mode, r, g, b, fade } = event;
        actor.color = { mode, r, g, b, fade };
        break;
      }
      case 'trail':
        actor.trail = startTrail(event);
        break;
      case 'variable':
        self.variables[event.index] = event.value;
        break;
      case 'add':
        self.variables[event.index] =
          (self.variables[event.index] ?? 0) + event.value;
        break;
      // Ops 0x10 and 0x11 (0x413500, 0x413164) jump to their target on too
      // little stock, which otherwise pays the super, or past a life
      // threshold. Op 0x10 without r[5] bit 0 (0x4135eb) jumps on enough
      // stock instead and pays nothing (EX Ch, PC 2861).
      case 'stock':
        if ('clip' in actor || actor.action !== 'script') break;
        if (event.atLeast) {
          if (self.stock >= event.min)
            return this.branchTo(actor, sourceKey(event.target, event.offset));
          break;
        }
        if (self.stock <= event.min)
          return this.branchTo(actor, sourceKey(event.target, event.offset));
        self.stock = Math.max(0, Math.min(MAX_STOCK, self.stock + event.add));
        if (self.stock === MAX_STOCK) self.power = 0;
        break;
      case 'life':
        if (
          !('clip' in actor) &&
          actor.action === 'script' &&
          event.target &&
          (event.below ? self.hp <= event.value : self.hp >= event.value)
        )
          return this.branchTo(actor, sourceKey(event.target, event.offset));
        break;
      case 'screen':
        // Op 0x0e flag 1 (0x41330b) starts the owner's fader from the
        // actor's colour. ponytail: flags 2 (the caught opponent's), 4 and 8
        // (global faders) start from 0 (0x41336c–0x413481) and are left out:
        // neither fighter's records use 2 or 8 (Zoma's have no faders), and 4
        // only fades the round intro's screen fader from 0 to 0 (PCs 303, 327).
        if (event.fader && event.fader.flags & 1) {
          const { type, r, g, b, fade, ticks } = event.fader;
          const { color } = actor;
          self.fader = {
            type,
            start: { r: color.r, g: color.g, b: color.b, fade: color.fade },
            target: { r, g, b, fade },
            left: ticks,
            ticks,
          };
        }
        // r[9:15] (0x41348b): each shake axis it names restarts.
        this.quake = {
          x: event.x ? { ...event.x } : this.quake.x,
          y: event.y ? { ...event.y } : this.quake.y,
        };
        break;
      case 'random':
        // Op 0x20 jumps to r[6] at offset r[8] when rand() % (r[1] + 1) > r[3]
        // (0x417a22). Objects roll it: streak 348 picks one of three pose sets,
        // each mirrored or not; stars 351/360 one of four flights. Fighters
        // roll their reactions' on entry (ROLLED) and their moves' (CPU
        // IORI's, PC 5887) at its record.
        if (!('clip' in actor) && actor.action !== 'script') break;
        if (this.cpu.random() % event.divisor <= event.above || !event.action)
          break;
        // One in a call jumps within the called action, rejoining this path
        // at its next display (Giant's super base ball picks a ball, PC
        // 5358): the target's records up to there replace this tick's rest.
        if (event.called) {
          const key = sourceKey(event.action, event.offset);
          for (const next of script(key, actor.who).events) {
            if (next.t) break;
            this.runEvent(actor, owner, next);
          }
          return true;
        }
        return this.branchTo(actor, sourceKey(event.action, event.offset));
    }
    return false;
  }

  // Ops 0x07/0x14 move the opponent this super holds, is taking hold of (a
  // queued 128) or has just tossed.
  private catchHeld(target: Fighter) {
    const queued =
      target.pending && 'action' in target.pending
        ? target.pending.action
        : null;
    if (!queued && target.action === 'dstToss')
      this.action(target, 'superHeld');
    if ((queued ?? target.action) !== 'superHeld') return false;
    markHeld(target);
    return true;
  }

  // Ops 0x07 (0x412e93) and 0x14 (0x413057) reach whoever this player's box
  // last struck (+0xdef9, 0x40f2e0), held or not: DST juggles its tossed
  // victim, and Chung's EN300 holds the one its shock struck.
  private struck(target: Fighter) {
    return (
      this.catchHeld(target) ||
      (target.striker !== null && target.hp > 0 && Boolean(markHeld(target)))
    );
  }

  // Ops 0x07 and 0x14, and a flag-0x10 hold's motion step, place the victim
  // from the holder past walls and floor alike; its own motion step then
  // clamps it to the walls (settle).
  private placeHeld(holder: Fighter, target: Fighter) {
    const held = target.held;
    if (!held) return;
    target.x = holder.x + holder.facing * held.x * 1.5;
    target.y = holder.y + held.y * 1.5;
    target.facing =
      held.flags & 4 ? holder.facing : holder.facing === 1 ? -1 : 1;
  }

  private spawnObject(
    parent: Spawner,
    owner: number,
    event: Omit<
      Extract<SourceEvent, { op: 'spawn' }>,
      'op' | 'busy' | 'busyOffset'
    >,
  ) {
    // A stage object's children are stage objects (0x412c40): on the stage
    // whatever flag 0x40 says (0x412b38), in no slot (0x412a7b, 0x412c99),
    // and scrolled by their own start records.
    const { stage } = parent;
    // Without flag bit 2 (0x412a88) the record first deletes the owner's
    // object in slot r[12], then registers the new one there (0x412caf); an
    // object's deletion clears its slot (0x40e4a0). A nonzero r[5:7] instead
    // jumps the spawner while the slot's object lives (runEvent).
    const registers = !stage && !(event.flags & 4);
    if (registers)
      this.effects = this.effects.filter(
        (e) => e.owner !== owner || e.slot !== event.slot,
      );
    if (!event.action) return;
    const clip = sourceKey(event.action, event.offset);
    const screen = !stage && (event.flags & 0x40) !== 0;
    // Children of viewport objects start from the same point on the stage.
    const origin =
      'screen' in parent && parent.screen
        ? {
            x: parent.x + this.cameraX,
            y: parent.y + this.cameraY - GROUND,
          }
        : parent;
    const who = stage ? parent.who! : this.fighters[owner].who;
    const child = newEffect({
      clip,
      who,
      age: -1,
      x: screen ? event.x * 1.5 : origin.x + parent.facing * event.x * 1.5,
      y: screen ? event.y * 1.5 : origin.y + event.y * 1.5,
      facing: parent.facing,
      // Flag bits 0–1 (0x412b83): just behind the spawner (10 at least),
      // just in front (127 at most), at r[13], or with it.
      z: [
        Math.max(10, (parent.z ?? FIGHTER_Z) - 1),
        Math.min(127, (parent.z ?? FIGHTER_Z) + 1),
        event.z,
        parent.z ?? FIGHTER_Z,
      ][event.flags & 3],
      owner,
      slot: registers ? event.slot : -1,
      screen,
      follow: event.flags & 0x20 ? { parent, x: event.x, y: event.y } : null,
      ...(stage && { stage: stageScroll(who as Stage, event.action) }),
    });
    // 0x406570 runs no script: the object first steps in the next tick's
    // pass (stepObjects), which lists only the objects alive at its start.
    (stage ? this.layers : this.effects).push(child);
  }

  // A player's motion step (0x40fa09–0x40fc9f) adds its transfer (+0xdf49),
  // then clamps it to the walls. Reeling from a strike and not KO'd, it hands
  // the distance the walls stopped to the striker's owner (0x40fb08), unless
  // the striker is reeling from a hit itself (0x40faf0); guarding, it still
  // takes it. An object striker's bits stay clear, so its owner always does.
  // Fighter 1 moves it this tick, fighter 0 the next.
  private settle(f: Fighter, walled = false) {
    const other = this.fighters[1 - this.fighters.indexOf(f)];
    f.x += f.transfer;
    f.transfer = 0;
    // 0x40fa29: a hold with flag 0x10 places its victim here, before the
    // holder's walls, until op 0x14 clears it (0x41314c). A victim moving
    // later in the pass clamps itself; fighter 0 stays where it is put.
    if (
      other.action === 'superHeld' &&
      !other.pending &&
      (other.held?.flags ?? 0) & 0x10
    )
      this.placeHeld(f, other);
    walled = placeX(f, f.x) || walled;
    // 0x40fcab: stopped by a wall, a player with a wall handler (op 0x02 slot
    // 4, +0x70) queues its action (+0x38): a flight's, or a move's, as Yo's
    // Press Hit carrying its victim (PC 3291).
    const wall = launchMotion[f.action]?.wall;
    if (walled && wall) this.queue(f, wall);
    else if (walled && f.action === 'script' && f.onWall && !f.pending)
      f.pending = { key: f.onWall };
    const reeling = f.striker === 'body' && (other.reaction & 12) === 8;
    if (f.hp > 0 && f.reaction & 8 && f.striker && !reeling)
      other.transfer += f.stopped;
    f.stopped = 0;
  }

  // The motion pass (0x40f910) follows the hit test. It skips a player
  // still stopped after the steps (0x40f963): a step counts the stop down
  // and ends (0x412390), so the tick it runs out moves, and a stop a step
  // adds (op 0x1a) holds that tick's motion. It adds the acceleration to the
  // velocity and the velocity to the position with no floor, as the next
  // step lands it (land), then takes the transfer and the walls (settle).
  private travel(f: Fighter) {
    let walled = false;
    if (f.hitStop === 0) {
      if (f.action === 'script' || f.moving === 'velocity') {
        f.vx += f.ax;
        f.vy += f.gravity;
        walled = placeX(f, f.x + f.vx);
        f.y += f.vy;
      } else if (f.moving) walled = placeX(f, f.x + f.moving);
    }
    this.settle(f, walled);
  }

  // The pass then moves each unstopped object, the stage's too, and one
  // following its parent takes the parent's position plus its offset,
  // mirrored by the parent's facing, stopped or not (0x40f992–0x40f9d9).
  private moveObjects() {
    const objects = [...this.layers, ...this.effects];
    for (const e of objects)
      if (e.hitStop === 0) {
        e.vx += e.ax;
        e.vy += e.gravity;
        e.x += e.vx;
        e.y += e.vy;
      }
    for (const e of objects)
      if (e.follow) {
        const { parent, x, y } = e.follow;
        e.x = parent.x + parent.facing * x * 1.5;
        e.y = parent.y + y * 1.5;
      }
  }

  // 0x411810: before its commands and script, a player at or past the floor
  // while falling lands (0x41187f). Its motion stops, and the landing handler
  // (slot 1) enters its action (her air beams land in Dash F lend, 15, PC
  // 3964), or the action ends. True when that ends the step.
  private land(f: Fighter) {
    if (f.y < 0 || f.vy <= 0) return false;
    f.y = 0;
    f.vx = f.vy = 0;
    if (f.action === 'script') {
      f.variables[1] = 0;
      if (!f.onLand) {
        this.action(f, 'idle');
        return false;
      }
      markActing(f);
      this.enterKey(f, f.onLand);
      return true;
    }
    f.gravity = 0.24;
    if (f.action === 'down' || f.action === 'koAgain') {
      this.action(f, 'koLand');
      return true;
    }
    f.variables[1] = 0;
    const launch = launchMotion[f.action];
    if (launch) this.action(f, launch.land);
    // The air reactions have no handler; the free state reads commands on
    // the same tick.
    else if (AIR_REACTIONS[f.action]) {
      this.action(f, 'idle');
      return false;
    } else {
      markActing(f);
      this.action(f, 'land');
    }
    return true;
  }

  // A scripted fighter's step; false when its timeline has ended on foot.
  private moveScripted(f: Fighter) {
    const branch = f.branch;
    this.fireEvents(f);
    if (f.action !== 'script' || f.branch !== branch) return true;
    const { end, next, offset = 0 } = script(timeline(f), f.who);
    if (
      end === 'hold' ||
      end === 'loop' ||
      f.age < animationDuration(timeline(f), f.who)
    )
      return true;
    // A last op 0x0a enters its target, the fall (7) among them.
    if (next !== null) this.enterSource(f, next, offset);
    else return this.runOut(f);
    return true;
  }

  // Running out airborne, the free state falls; false on foot.
  private runOut(f: Fighter) {
    if (f.y < 0) {
      this.action(f, 'jump');
      f.gravity = JUMP_GRAVITY;
      f.moving = 'velocity';
      return true;
    }
    f.vx = f.vy = 0;
    return false;
  }

  // Op 0x04 flag 0x40 objects sit in viewport coordinates.
  private origin(source: Fighter | Effect) {
    return 'screen' in source && source.screen
      ? { x: source.x + this.cameraX, y: source.y + this.cameraY - GROUND }
      : source;
  }

  // Script boxes hit the opponent's op 0x19 body box through op 0x17 responses.
  // 0x40f010 tries the striker's boxes in slot order: the IORI super-cancel
  // Musashi (260) grabs a grounded victim with slot 0 (kind 0x2a) and an
  // airborne one with slot 1 (kind 0x18).
  private boxContact(source: Fighter | Effect, owner: number) {
    const attacker = this.fighters[owner];
    const target = this.fighters[1 - owner];
    if (source.connected) return [];
    const box = [source.box, ...source.boxes].find(
      (box) =>
        box &&
        !skips(box, target) &&
        struck(this.origin(source), source.facing, box, target),
    );
    if (!box) return [];
    const body = struck(this.origin(source), source.facing, box, target)!;
    const guarding = this.guarding(target, source, box);
    const response = responseFor(
      source.responses,
      target,
      guarding,
      this.crouching(target),
    );
    // 0x40f539: a response id selects the victim action from the victim's
    // own table. Another player's follows its Ryuko twin's rules
    // (export_fighter), so `victim` is Ryuko's number for it.
    const own = responsesOf(target.who)[response];
    const victim = ryukoTwin(target.who, own);
    const reaction = RESPONSE_REACTIONS[victim];
    // 0x40f527: response 0 names no reaction, but a box without damage
    // still meets the victim, turning it and taking the striker's handler
    // (0x40f73c, 0x40f6e6, 0x40f885): LIZARD's dragon up handen (247) so
    // finds whom his birds strike.
    if (!reaction && (response || box.damage)) return [];
    const blocked = reaction ? blocks.has(reaction.action) : guarding;
    return [
      {
        f: attacker,
        target,
        damage: boxDamage(box, body.taken, blocked),
        damaging: box.damage > 0,
        effect: box.damage ? responseEffectsOf(attacker.who)[response] : 0,
        hitStop: reaction?.stop ?? 0,
        // The reaction's other stop (0x4136ae) reaches the striker's owner
        // whether its body or one of its objects struck.
        attackerStop: reaction?.attackerStop ?? reaction?.stop ?? 0,
        reaction: reaction?.action as AnimatedAction | undefined,
        facing: source.facing,
        x: body.x,
        y: body.y,
        blocked,
        source,
        bonus:
          OWN_STRIKER_POWER[target.who]?.[victim] ?? STRIKER_POWER[victim] ?? 0,
        own,
      },
    ];
  }

  // 0x40f010 tests every object's boxes against the other side's bodies. In
  // Ryuko's data objects meet only 2000 pixels down: an axe's box and body
  // (PCs 3290–3291), the beams' boxes (270, 277), B G's lunge box (292) and
  // its stage-wide bodies (303). An object victim (+0x15a 1) only fires the
  // striker's hit handler (0x40f36a, taken up next tick) and marks it as
  // having hit (0x40f31c), which 0x40f010 checks only before the striker's
  // pass: axes break into 230 without damage, stop or effect, even held by
  // the freeze; B G's lunge enters 294; a beam, which sets no handler, waits
  // for its next box. The lunge records the axe as caught (+0xdef9,
  // 0x40f2e0), but only grab-entered actions and Air Drill's hit branch hold
  // or toss with ops 0x07/0x14, so the axe flies on.
  private objectHits(frozen: boolean[]) {
    type At = { x: number; y: number; facing: -1 | 1; owner: number };
    const bodies: [At, Omit<BodyBox, 'kind' | 'taken'>][] = [];
    const strikers: [At, (ScriptBox | null)[], () => void][] = [];
    // An object yet to step shows nothing.
    for (const e of this.effects.filter((e) => e.age >= 0)) {
      const at = { ...this.origin(e), facing: e.facing, owner: e.owner };
      for (const body of animationFrame(e.clip, e.age, e.who).body ?? [])
        if (body.kind & 6) bodies.push([at, body]);
      // Every slot: ALEX's REF OBJ (265) strikes 2000 pixels down from slot
      // 0 (PC 3842).
      if (!e.connected)
        strikers.push([
          at,
          [e.box, ...e.boxes],
          () => {
            e.connected = true;
            this.handle(e, false);
          },
        ]);
    }
    this.fighters.forEach((f, owner) => {
      if (f.connected || frozen[owner]) return;
      strikers.push([
        { ...f, owner },
        f.boxes,
        () => {
          f.connected = true;
          if (f.onHit && !f.pending) f.pending = { key: f.onHit };
        },
      ]);
    });
    return strikers
      .filter(([a, boxes]) =>
        boxes.some(
          (box) =>
            box &&
            bodies.some(
              ([b, body]) =>
                a.owner !== b.owner &&
                Math.abs(
                  a.x + a.facing * box.x * 1.5 - b.x - b.facing * body.x * 1.5,
                ) <
                  (box.w + body.w) * 1.5 &&
                Math.abs(a.y + box.y * 1.5 - b.y - body.y * 1.5) <
                  (box.h + body.h) * 1.5,
            ),
        ),
      )
      .map(([, , fire]) => fire);
  }

  // An authored partner's input. The CPU's word starts as 0x4146d0 records
  // player 2's keys, none, until its step writes its own (think).
  private ai(): Input {
    const [player, opponent] = this.fighters;
    const { partner } = this.practice;
    return this.mode === 'practice' && partner !== 'cpu'
      ? dummyInput(partner, opponent, player, this.ticks)
      : {};
  }

  // 0x411867: the CPU (0x411270) runs at the start of its fighter's step,
  // which skips it while entering a queued action (0x412327), stopped
  // (0x412390) or held by op 0x07 (+0x40 at -1, 0x412397).
  private think(f: Fighter, other: Fighter) {
    const input = (this.inputs[1] = this.cpu.input(f, other));
    this.record(1, input, true);
    return input;
  }

  // 0x40f3a2: a CPU victim ignores its input. Free (+0x15e & 0xc is 0) it
  // guards on rand % 100 < level (0x40f3c2); in a guard reaction (0xc) it
  // keeps guarding, whichever way it faces (0x40f449). Ryuko's +0x7cb6 bit 2
  // lets it guard in the air (0x40f475). A box of kind 0x40 can't be guarded
  // (0x40f469): Musashi's finish (257) and COUNTER HIT (174).
  private guarding(
    target: Fighter,
    source: { facing: number },
    box: ScriptBox,
  ) {
    let guard = guards.has(target.action) && target.facing !== source.facing;
    if (this.cpuDriven && target === this.fighters[1]) {
      const bits = target.reaction & 0xc;
      guard = bits === 0xc || (bits === 0 && this.cpu.guards());
    }
    return guard && !(box.kind & 0x40);
  }

  // 0x40f4be: down in the victim's input word picks the crouching responses,
  // as do the port's crouching actions. The word is this tick's, or the one
  // a stop saved until the victim's next free step (0x40f2ff).
  private crouching(target: Fighter) {
    const input =
      target.stopInput ?? this.inputs[this.fighters.indexOf(target)];
    return target.action.startsWith('crouch') || Boolean(input.crouch);
  }

  // Command entry (0x411a01, and 0x41195a in a cancel window): the scan picks
  // the command (see commands.ts), and a cancel window passes only the levels
  // it accepts (header byte 2); a refused command enters nothing.
  private command(
    f: Fighter,
    other: Fighter,
    history: number[],
    ok: (level: number, action?: number) => boolean = () => true,
  ) {
    const found = scan(
      history,
      {
        air: f.y < 0,
        still: f.y === 0 && f.vy === 0,
        landing: f.y < 0 && f.y > -50 * 1.5 && f.vy > 0,
        near: Math.trunc(Math.abs(f.x - other.x) / 1.5) <= nearOf(f.who),
      },
      f.who,
    );
    if (!found) return false;
    // Each entry enters its stance's action, which plays from its own
    // timeline; a window passes it by that action's level.
    const index = entriesOf(f.who)[found.entry - 1][found.stance];
    if (!ok(LEVELS[f.who][index], index)) return false;
    this.enterSource(f, index);
    return true;
  }

  // Op 0x1e windows, read after the landing check (0x41193a) on steps a stop
  // doesn't skip (0x412390), so a press made during a stop enters once it
  // ends, while still in its command's window. Scripts and clips set the
  // window themselves: mode 1 once the move's box has connected, 2 always;
  // type 0 passes a command whose action's level lies in [min, max], type 1
  // only the action it names.
  private cancel(f: Fighter, other: Fighter, history: number[]) {
    const window = f.window;
    if (!window || !(window.mode === 2 || (window.mode === 1 && f.contact)))
      return false;
    return this.command(f, other, history, (level, action) =>
      window.type === 0
        ? level >= window.min && level <= window.max
        : window.type === 1 && action === window.action,
    );
  }

  // The victim's next action (+0x38), the last write winning: a contact's
  // reaction, op 0x14's, or the lose action (0x40e84b).
  private queue(
    target: Fighter,
    action: Action,
    stop = 0,
    attackerStop = 0,
    power = 0,
    own?: number,
  ) {
    target.pending = { action, stop, attackerStop, power, own };
  }

  // 0x412327: a step first enters the action queued for it, stopped or not,
  // and runs its first records (0x412564) instead of the CPU, the landing
  // check and the commands. A reaction's are its op 0x20 (roll), the op 0x01
  // that halts the victim (and any drift, which the motion pass adds once
  // the stop runs out), op 0x1a's stops for it and the striker (0x413637,
  // 0x4136ae), and op 0x15's power.
  private enterPending(f: Fighter, other: Fighter) {
    const pending = f.pending!;
    f.pending = null;
    if ('key' in pending) return this.enterKey(f, pending.key);
    const { action, stop, attackerStop, power, own } = pending;
    // Giant's reactions open by testing his counter's variable 4 (PCs 723,
    // 763, ...): at 100, which counter start (278) holds for 72 ticks (PCs
    // 4271–4282), they enter counter hit (279) before their stops and power.
    // Most others clear it (PCs 744, 788, ...). ERUS's also clear her Book's
    // variable 2 or test it at 10 (PCs 787, 1254, ...).
    for (const [index, value, target] of own === undefined
      ? []
      : (countersOf(f.who)[own] ?? [])) {
      if (!target) f.variables[index] = value;
      else if (f.variables[index] === value) return this.enterSource(f, target);
    }
    // ERUS INATUMA's op 0x16 (PC 1541) enters its AIR form off the floor, as
    // HISO stop's does (PC 1455).
    this.action(f, (f.y < 0 && AIR_FORMS[action]) || action, true);
    f.vx = f.vy = 0;
    f.moving = 0;
    this.pause(f, stop);
    this.pause(other, attackerStop);
    const [victimPower, attackerPower] = reactionPower(f);
    addPower(f, victimPower);
    addPower(other, attackerPower + power);
  }

  private move(
    f: Fighter,
    other: Fighter,
    input: Input,
    previous: Input,
    history: number[],
  ) {
    if (f.pending) this.enterPending(f, other);
    else {
      // Held by op 0x07 (+0x40 at -1), the step returns at once (0x412397).
      if (f.held?.pose) return;
      if (f.hitStop === 0) {
        // 0x4123c5: an unstopped step drops the word a stop saved.
        f.stopInput = null;
        if (this.cpuDriven && f === this.fighters[1])
          input = this.think(f, other);
        f.age++;
        f.moving = 0;
        if (this.land(f)) return;
        if (this.cancel(f, other, history)) return;
      } else {
        f.hitStop--;
        return;
      }
    }
    if (f.action === 'superHeld' || f.action === 'shock') return;
    // A winner holds its result (0x410ff1), moving only by its own runs from
    // the tick their op 0x01 runs, and lands as the source's step does
    // (0x41187f).
    if (f.action === 'win') {
      f.y = Math.min(0, f.y + runVelocity(WIN_MOTION[f.who], f.age)[1]);
      return;
    }
    if (this.musicAttack(f) || this.vanish(f, other)) return;
    if (this.moveKO(f)) return;
    if (this.counter(f, history)) return;
    if (f.action === 'script' && this.moveScripted(f)) return;
    if (this.gonMiss(f, other)) return;
    if (this.moveLaunch(f)) return;
    this.slideReaction(f);
    // ERUS INATUMA AIR, ICE Punch Air and HISO stop air run out into heavy
    // air hit + 19 (PCs 1582, 1390, 1488), its launch at age 6 (PC 823;
    // export_fighter checks every player's), past its roll.
    if (
      (f.action === 'airInatuma' ||
        f.action === 'airIcePunch' ||
        f.action === 'airHisoStop') &&
      f.age >= animationDuration(f.action, f.who)
    ) {
      this.action(f, 'airHitHeavy', true, null);
      f.age = 6;
    }
    const reaction = AIR_REACTIONS[f.action];
    if (reaction)
      for (const event of script(twin(f.who, reaction), f.who).events)
        if (event.op === 'motion' && event.t === f.age) motion(f, event);
    if (f.y < 0 || f.vy < 0) {
      f.airAge++;
      f.moving = 'velocity';
    }
    this.recoverKnockdown(f);
    if (f.action === 'knockdown' || f.action === 'bounceDown') return;
    if (f.action === 'takeoff') {
      if (f.age < animationDuration('takeoff', f.who)) return;
      // Action 4's op 0x01 follows its takeoff display (PC 54), so the jump
      // moves on this tick.
      launchJump(f);
      this.action(f, 'jump');
      f.moving = 'velocity';
      return;
    }
    if (
      f.action !== 'idle' &&
      f.action !== 'script' &&
      (reactions.has(f.action) ||
        ['land', 'stand', 'getUp'].includes(f.action)) &&
      f.age < animationDuration(f.action, f.who)
    )
      return;
    const airborne = f.y < 0 || f.vy < 0;
    // An air reaction that ends airborne enters action 7 through 0x411a80
    // (+0x7586), which frees the fighter. Its op 0x01 (PC 99, flags 0xe)
    // keeps vx, vy and ax and sets gravity 80.
    if (airborne && AIR_REACTIONS[f.action]) {
      const { ax } = f;
      toNeutral(f);
      this.action(f, 'jump');
      f.ax = ax;
      f.gravity = JUMP_GRAVITY;
    }
    // Back in neutral once the round is decided, 0x410ff1 enters the result's
    // action instead of reading commands; airborne, the fall reads them.
    if (this.winner && !airborne) {
      this.action(f, this.result(f));
      return;
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
    // Authored: a fresh press jumps from the ground, where the source's
    // 0x410dc0 jumps while up is held.
    if (input.jump && !previous.jump && !airborne) {
      this.action(f, 'takeoff');
      f.vx = direction * 400 * SOURCE_VELOCITY_SCALE;
      return;
    }
    // The free state scans commands (0x411a01) after the port's own guard
    // and jump keys.
    if (this.command(f, other, history)) {
      markActing(f);
      return;
    }
    // Actions 23/24: a grounded fighter turns before walking or idling again.
    // Any other input interrupts the turn, as it does standing.
    if (
      turning ||
      ((f.action === 'turn' || f.action === 'crouchTurn') &&
        f.age < animationDuration(f.action, f.who))
    ) {
      this.action(f, turning ? (crouched ? 'crouchTurn' : 'turn') : f.action);
      return;
    }
    if (
      f.action === 'crouchEnter' &&
      f.age < animationDuration('crouchEnter', f.who)
    )
      return;
    if (!airborne && crouched && !input.crouch) {
      this.action(f, 'stand');
      return;
    }
    if (!airborne && input.crouch) {
      this.action(f, crouched ? 'crouch' : 'crouchEnter');
      return;
    }
    if (!airborne) f.moving = direction * 2.8;
    this.action(
      f,
      airborne
        ? 'jump'
        : direction
          ? direction === f.facing
            ? 'walk'
            : 'backwalk'
          : 'idle',
    );
  }

  // A display carries the op 0x03, 0x04, 0x0e, 0x1f and 0x25 records its
  // action runs just before it (supers run their whole timelines in
  // fireEvents). The script steps into it before the hit test, so a fighter
  // enters it as it moves, a queued reaction or handler too; one the tick's
  // end starts (a released hold) is entered then.
  private enter(f: Fighter, index: number) {
    const pose = fighterPose(f);
    if (pose === f.entered) return;
    // A reaction that rolled its op 0x20 draws the branch, but first ran the
    // records before the roll; past it lies the sound the branch skips (75,
    // 76 and 80, PCs 795, 820, 910). A KO (+0x75a0, 0x40e83e) enters the
    // lose action 59 first: it deletes objects 7–9 and clears variables 6, 8
    // and 14, then jumps to KO Normal (PC 591). With global 0 at 10 it would
    // enter 'make hikari' (63) instead (PC 590). The title menu writes
    // global 0 only to 1 (KGT 78, PC 497). ponytail: LIZARD's chuck hit
    // lend writes 10 for its strike's tick (PCs 3703, 3712), as HISO's Fish
    // hit and FISH HIT BIG do (PCs 4483–4488, 4557–4562), so as player 2
    // their lethal strikes would send the victim there; the port keeps KO
    // Normal.
    const roll = f.branch && rolls(f.who)[f.action];
    const rolled = roll ? script(roll, f.who).events : [];
    const entry = f.entered
      ? []
      : roll
        ? rolled
            .slice(
              0,
              rolled.findIndex((e) => e.op === 'random'),
            )
            .filter((e) => (POSE_EVENTS as readonly string[]).includes(e.op))
        : f.action === 'down' || f.action === 'koAgain'
          ? script(twin(f.who, LOSE), f.who).events
          : [];
    const events = [...entry, ...(pose.events ?? [])];
    f.entered = pose;
    if (f.action === 'script') return;
    for (const event of events) this.runEvent(f, index, event);
  }

  step(player: Input = {}, opponent?: Input) {
    if (this.resultReady) return;
    this.sounds = [];
    // 0x412271: before its script each tick, frozen or not, an object with
    // an afterimage slot counts down and, past zero, samples its position,
    // facing and display.
    for (const actor of [...this.fighters, ...this.effects]) {
      const { trail } = actor;
      if (!trail || --trail.counter >= 0) continue;
      trail.counter = trail.spec.interval;
      trail.samples.push({
        x: actor.x,
        y: actor.y,
        facing: actor.facing,
        pose:
          'clip' in actor
            ? animationFrame(actor.clip, actor.age, actor.who)
            : fighterPose(actor),
      });
      if (trail.samples.length > trail.spec.count) trail.samples.shift();
    }
    // The HUD face (action 70, bucket 20) also runs first: in EX mode it
    // counts its cycle from the tick after the variable is set.
    for (const f of this.fighters) f.face = exMode(f) ? f.face + 1 : -1;
    // Action 43 runs in bucket 15, before the fighters' scripts (0x50): while
    // variable 14 is 100 it shows its panel one tick opaque (PC 431), then
    // five at 50% (PC 435), checking again after each (PCs 428, 433).
    for (const { black, variables } of this.fighters) {
      if (black.left > 1) black.left--;
      else if (black.shown === 'opaque')
        Object.assign(black, { shown: 'half', left: 5 });
      else
        Object.assign(black, {
          shown: variables[14] === 100 ? 'opaque' : 'none',
          left: 1,
        });
    }
    this.run(player, opponent);
    this.fighters.forEach((f, index) => this.enter(f, index));
    // The tick ends counting the faders down (0x404d97); each draw then
    // writes a running one over the colour of its player's objects.
    this.fighters.forEach((f, owner) => {
      const { fader } = f;
      // Type 3 (0x40cacf) blends by rand(); neither fighter's records use it.
      if (!fader?.left || !--fader.left || fader.type > 2) return;
      const blend = faderColor(fader);
      for (const actor of [f, ...this.effects.filter((e) => e.owner === owner)])
        actor.color = { ...actor.color, ...blend };
    });
    // Objects run by priority each tick (0x404d4c). KGT action 58, the stage
    // layout, counts global 6 down (PCs 366–371) at 0x65 (0x406890's callers),
    // after the fighters (0x50) and their axes and missiles (op 0x04 flag 1,
    // one in front), so it moves after they have read it.
    if (this.freeze > 0) this.freeze--;
    if (
      this.winner &&
      !this.matchOver &&
      this.endingTicks >= this.roundEnd + NEXT_ROUND_TICKS
    )
      this.nextRound();
  }

  private stepObjects(objects: Effect[]) {
    for (const e of objects) {
      if (!e.stage && !this.effects.includes(e)) continue;
      // A queued handler comes first, stopped or not (0x412327): an action
      // change that drops its boxes.
      if (e.pending !== undefined) {
        const key = e.pending;
        Object.assign(e, {
          box: null,
          boxes: [],
          responses: [],
          pending: undefined,
        });
        this.branchTo(e, key);
        continue;
      }
      // A stopped object skips its script step (0x412390).
      if (e.hitStop > 0) {
        e.hitStop--;
        continue;
      }
      // 0x41241c: an object falling to the floor (y 920) stops there, and
      // its landing handler (slot 1) enters its action, dropping its boxes.
      // A stage object skips this and the world bounds (0x4123cb).
      if (!e.stage && !e.screen && !e.follow && e.y >= 0 && e.vy > 0) {
        Object.assign(e, { y: 0, vx: 0, vy: 0, ax: 0, gravity: 0 });
        const land = e.onLand;
        if (land !== undefined) {
          Object.assign(e, { box: null, boxes: [], onLand: undefined });
          this.branchTo(e, land);
          continue;
        }
      }
      // A script without displays never advances, so its events all fire at
      // its first step (anime beam 296 only spawns 297 and 299).
      if (++e.age === 0 || e.age < animationDuration(e.clip, e.who) || loops(e))
        this.fireEffect(e);
      // A script that runs out after a display runs its last records first
      // (0x4125ea): LIZARD's dragon up handen (247) spawns call bird (249,
      // PC 3409). A stage object then restarts its first action (+0x34,
      // 0x4127b7).
      else if (
        e.age === animationDuration(e.clip, e.who) &&
        !this.fireEffect(e) &&
        e.stage &&
        script(e.clip, e.who).end === 'end'
      )
        this.branchTo(e, e.stage.home);
    }
    // A script that runs out reaches the next action's op 0x00, which
    // deletes an object (0x41273c, 0x413bc6); 0x4124c9 also culls one that
    // leaves the world unless it follows a parent.
    this.effects = this.effects.filter(
      (e) =>
        !objects.includes(e) ||
        ((e.age < animationDuration(e.clip, e.who) || loops(e)) &&
          (e.follow !== null ||
            inWorld(e.screen ? { x: e.x, y: e.y - 920 * 1.5 } : e))),
    );
    // Op 0x05 deletes a stage object too (0x412617), as Sakura Night's
    // petals (2–5) end; one holding a display stays.
    this.layers = this.layers.filter(
      (e) =>
        !objects.includes(e) ||
        e.age < animationDuration(e.clip, e.who) ||
        script(e.clip, e.who).end !== 'delete',
    );
  }

  private run(player: Input, opponent?: Input) {
    // The camera object runs with the scripts, before motion (0x40ffc0), so
    // the walls use the positions from the end of the last tick. In the Vs.
    // modes it moves halfway to its aim each tick (0x40b022–0x40b080).
    const view = this.view();
    const aim = this.aim();
    this.camera = clampCamera({
      x: Math.trunc((view.x + aim.x) / 2),
      y: Math.trunc((view.y + aim.y) / 2),
    });
    cameraLeft = this.camera.x;
    // Every script step runs (0x404d4c), then the contact passes (0x40eb60,
    // 0x40f010), then the motion pass (0x40f910: travel, moveObjects). Each
    // step first checks landing (0x41241c, 0x411810) and the world bounds
    // (0x4124c9) on last tick's motion. The pass takes the objects alive at
    // the tick's start by priority (0x404d0b): those behind the fighters,
    // the fighters, then the rest, so an object a step or a contact spawns
    // first steps in the next tick's pass. ponytail: within a priority it
    // keeps spawn order, where 0x406570 takes the first free slot.
    const objects = [...this.layers, ...this.effects].sort((a, b) => a.z - b.z);
    this.stepObjects(objects.filter((e) => e.z < FIGHTER_Z));
    // After a KO or time-out the round phase stays 1 (only a debug key sets
    // 2, 0x406231 and 0x408f38): fighters keep reading commands and
    // striking, and each takes its result's action once back in neutral
    // (0x410ff1). Only the timer stops (0x408e50).
    if (this.winner) this.endingTicks++;
    // Round phase 0 (0x47004c) lasts until the fight lettering sets 1:
    // commands (0x410069), the CPU (0x41130c) and the timer wait, and the
    // fighters finish their intro and stand.
    this.roundTicks++;
    this.cpuDriven =
      !opponent && (this.mode === 'cpu' || this.practice.partner === 'cpu');
    if (this.calls && this.roundTicks < FIGHT_TICK) {
      for (const [i, f] of this.fighters.entries()) {
        if (f.action !== 'intro') continue;
        f.age++;
        // EX_MODE: Zoma's, Kiki's and Yo's intros have no such check.
        const ex = EX_MODE[f.who];
        if (f.age === ex?.intro && [player, opponent][i]?.crouch)
          f.variables[0] = ex.value;
        const [vx, vy] = runVelocity(INTRO_MOTION[f.who], f.age - 1);
        f.x = clampX(f.x + f.facing * vx);
        // Past the floor, the fall lands (0x41187f).
        f.y = Math.min(0, f.y + vy);
        this.enter(f, i);
        if (f.age >= animationDuration('intro', f.who)) this.action(f, 'idle');
      }
      // History keeps recording, so a button held through the intro must be
      // pressed again once control begins.
      this.record(0, player);
      this.record(1, opponent ?? {});
      this.previous = [{ ...player }, { ...opponent }];
      this.stepObjects(objects.filter((e) => e.z >= FIGHTER_Z));
      this.moveObjects();
      return;
    }
    if (!this.winner) this.ticks++;
    if (this.mode === 'practice') {
      for (const f of this.fighters)
        if (this.practice.maxStock && f.action === 'idle') {
          f.stock = MAX_STOCK;
          f.power = 0;
        }
      // Authored: just under 30%, as Ryuko's hidden super, Zoma's Shin
      // Spark, G Suneo's hh, Yo's HIDDEN and SIN's NOZAN enter their
      // desperation forms only below it (op 0x11 at 153, 147, 150, 144 and
      // 165 or more; the rest at it or below).
      if (this.practice.lowHealth)
        this.fighters[0].hp = Math.min(
          this.fighters[0].hp,
          desperationOf(this.fighters[0].who) - 1,
        );
    }
    const inputs: [Input, Input] = [player, opponent ?? this.ai()];
    this.inputs = inputs;
    inputs.forEach((input, i) => this.record(i, input));
    const frozen = this.fighters.map((f) => f.hitStop > 0);
    this.koStop = 0;
    this.fighters.forEach((f, i) => {
      this.move(
        f,
        this.fighters[1 - i],
        inputs[i],
        this.previous[i],
        this.history[i],
      );
      this.enter(f, i);
    });
    // Applied after both steps, so a double KO holds once.
    for (const f of this.fighters) this.pause(f, this.koStop);
    this.stepObjects(objects.filter((e) => e.z >= FIGHTER_Z));
    this.previous = [{ ...inputs[0] }, { ...inputs[1] }];
    // The hit test meets the fighters and objects where last tick's motion
    // left them. Contacts are collected before any applies, so same-tick
    // attacks can trade.
    const contacts = [
      ...this.fighters.flatMap((f, i) =>
        !frozen[i] && f.action === 'script' ? this.boxContact(f, i) : [],
      ),
      ...this.effects.flatMap((e) => this.boxContact(e, e.owner)),
    ];
    const objectHits = this.objectHits(frozen);
    // The contact passes apply before the motion pass (0x40ffdc–0x40ffe6). A
    // box with damage clears both stop counters (0x40f692, 0x40f754: the
    // base stops at 0x43a299/0x43a29a are 0), so the victim and striker move
    // this tick, and the push and walls read the life, facing and reaction
    // bits a contact sets. It queues the victim's reaction (+0x38, 0x40f541),
    // which its next step enters (enterPending), so no stop that reaction
    // adds holds this motion pass.
    for (const {
      f,
      target,
      damage: strength,
      damaging,
      effect,
      hitStop,
      attackerStop,
      reaction,
      facing,
      x,
      y,
      blocked,
      source,
      bonus,
      own,
    } of contacts) {
      source.connected = true;
      if (!reaction) {
        target.facing = facing === 1 ? -1 : 1;
        continue;
      }
      // The contact handler (0x40eec4) raises the attacker's cancel counter.
      const body = source === f;
      if (body) f.contact = true;
      if (damaging) target.hitStop = source.hitStop = 0;
      const wasOut = target.hp === 0;
      f.damage += loseLife(target, strength);
      if (!blocked) f.hits++;
      // A loss that empties life, a chip's too (0x40e7c0), queues the lose
      // action instead (0x40e84b), so the reaction's records never run: no
      // op 0x15 power, no op 0x1a stops. The last box to reach the victim
      // sets its reaction, so DST's two missiles stop it once.
      if (target.hp > 0)
        this.queue(target, reaction, hitStop, attackerStop, bonus, own);
      else this.queue(target, knockedOut(wasOut));
      target.reaction = blocked
        ? target.reaction | 0xc
        : (target.reaction & ~4) | 8;
      // 0x40f8a4 records a fighter striking with its own box, 0x40f8ac an
      // object following its parent; other objects leave the striker as is.
      if (body) target.striker = 'body';
      else if ('clip' in source && source.follow) target.striker = 'object';
      target.facing = facing === 1 ? -1 : 1;
      // 0x40f567: a box with damage spawns its response's effect action (word
      // 2 of the entry) through 0x406570 at the contact, facing the striker,
      // in no slot at priority 0x5d (0x40f5d3; flags 4 | 2).
      if (effect)
        this.spawnObject({ x, y, facing }, this.fighters.indexOf(f), {
          flags: 6,
          action: effect,
          offset: 0,
          x: 0,
          y: 0,
          slot: 0,
          z: 0x5d,
        });
    }
    const [a, b] = this.fighters;
    // 0x40fce9: overlapping op 0x19 boxes of kind bit 0 push both fighters
    // apart by a quarter of the overlap (<< 14 in 16.16), boxes walked from
    // slot 19 down, in whole source pixels (x >> 16). Only the airborne one
    // (above the floor, 0x40fec9) moves when the other is grounded, and a
    // KO'd fighter (life +0xdf05 is 0) pushes no one. Held and hidden poses
    // set no such box, and hit stop doesn't stop the push.
    // 0x40f910 walks fighter 0, then fighter 1: each moves and settles, and
    // fighter 0 then pushes against fighter 1's boxes from the last tick, so
    // its own share stays unclamped until its next move.
    this.travel(a);
    const pixel = (v: number) => Math.floor(v / 1.5);
    for (const boxA of pushboxes(shown(a), a.age, a.who)) {
      const ax = pixel(a.x) + a.facing * boxA.x;
      const ay = pixel(a.y) + boxA.y;
      for (const boxB of pushboxes(shown(b), b.age, b.who)) {
        const bx = pixel(b.x) + b.facing * boxB.x;
        const by = pixel(b.y) + boxB.y;
        const overlap = boxA.w + boxB.w - Math.abs(ax - bx);
        if (overlap <= 0 || Math.abs(ay - by) >= boxA.h + boxB.h) continue;
        const push = ((ax > bx ? 1 : -1) * overlap * 1.5) / 4;
        if (b.hp > 0 && (a.y < 0 || b.y >= 0)) a.x += push;
        if (a.hp > 0 && (b.y < 0 || a.y >= 0)) b.x -= push;
      }
    }
    this.travel(b);
    this.moveObjects();
    // Op 0x02 slots 2 and 3: a script's own box queues its guard handler at
    // the contact (0x40f6f1), its hit handler after the motion pass
    // (0x40fffd), each only for a striker with nothing queued, so a reaction
    // takes an interrupted aerial drill whatever the fighters' order.
    for (const { f, blocked, source } of contacts) {
      if ('clip' in source) this.handle(source, blocked);
      const handler = blocked ? f.onGuard : f.onHit;
      if (source === f && f.action === 'script' && !f.pending && handler)
        f.pending = { key: handler };
    }
    for (const fire of objectHits) fire();
    this.holdVictims();
    if (!this.winner && (a.hp === 0 || b.hp === 0 || this.seconds === 0)) {
      this.winner =
        a.hp === b.hp ? 'draw' : a.hp > b.hp ? 'player' : 'opponent';
      // The result states credit the winner (0x40948a, 0x40955f), and a
      // draw or double KO both (0x409394, 0x40966b).
      if (this.winner !== 'opponent') this.wins[0]++;
      if (this.winner !== 'player') this.wins[1]++;
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
