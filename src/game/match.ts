// New MVP rules. These are intentionally separate from recovered idle semantics.
import {
  animationDuration,
  animationFrame,
  clipPose,
  DORA_LANDING,
  entryColor,
  eventsAt,
  scriptTick,
  exported,
  heldFrame,
  hurtboxes,
  idlePower,
  pushboxes,
  NORMAL_COLOR,
  POSE_EVENTS,
  script,
  skippedBy,
  yowaiKey,
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
  ScriptEvent,
  SourceEvent,
  TrailSpec,
} from './animations';
import {
  CHARACTERS,
  countersOf,
  desperationOf,
  twinOf,
  lifeOf,
  neutralTestsOf,
  perStockOf,
  responseEffectsOf,
  responsesOf,
  STAGES,
  stocksOf,
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
  DRESS_TICK,
  dressLife,
  FIGHT_LIFE,
  FIGHT_TICK,
  NEXT_ROUND_TICKS,
  openingLife,
  openingObjects,
  PERFECT_TICK,
  resultLife,
  roundEndTick,
  ROUND_END_TICKS,
  storyEndTick,
  storyFightTick,
  WIN_TICK,
} from './hud';
import { ROSTER, takePalette } from './select';
import ui from './generated/ui.json';
import type { Battle, Slot } from './story';
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
export type Mode = 'practice' | 'cpu' | 'story';
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
// KAY's and ASTROMAN's HISO stop hold 33 ticks (116, 112; PCs 1559, 1499)
// to Ryuko's 36; GIGI's heavy and rapid crouching guards slide at raw −320
// unslowed (160, PC 2251) and −250 (169, PC 2382).
const OWN_SLIDES: Partial<Record<Who, typeof reactionSlides>> = {
  kay: { hisoStop: slide(39, -650, 10) },
  astroman: { hisoStop: slide(39, -650, 10) },
  gigi: {
    crouchBlockHeavy: slide(9, -320),
    crouchBlockRapid: slide(9, -250, 8),
  },
};
// ANMC P's time stop sit EX (195), which time stop sit (190) jumps to in EX
// mode (PC 2499), spawns SMOKE (365) and slides as his heavy guards do (PCs
// 2566–2567); the hidden super's guard alone reaches it.
const EX_SLIDES: Partial<Record<Who, typeof reactionSlides>> = {
  anmc: { crouchTimeStopGuard: slide(9, -650, 8) },
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
  // Response 38 → action 92, the same flight (PC 1103), whose wall handler
  // (PC 1102) also enters 94.
  twistSideHit: {
    tick: 6,
    vx: -1500,
    vy: -500,
    gravity: 0,
    land: 'knockdown',
    wall: 'twistWall',
  },
  twistWall: { tick: 8, vx: 700, vy: -800, gravity: 60, land: 'knockdown' },
  // Response 61 (Chung's lee) → action 137, floating from its first tick
  // (PC 1871) until its display ends (gonMiss).
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
// The same block's 510 life. Its 30% (153, desperationOf) selects desperation
// branches and, in 0x40e7c0, shrinks every loss to 60%.
export const LIFE = 510;
// Vs. single play's rounds to win (0x470048, 0x4087da): GAME.INI's
// Editor.TestPlay.VSSinglePlay, 3 (0x414afc).
export const ROUNDS_TO_WIN = 3;
// The globals a match starts with when no screen has run: 0, as the title's
// demos leave them, or as VS single's select screen leaves them (CHAR
// SELECT's 2 at 50, its 2P cursor's 1 at 1000 and 3 at 50, KGT PCs 549,
// 541) or VS multi's (TEAM VS's demo, 3 at 100).
const selected = (global3: number) => {
  const globals = Array<number>(64).fill(0);
  if (global3) Object.assign(globals, { 1: 1000, 2: 50, 3: global3 });
  return globals;
};
// Victim reaction scripts add opcode 0x15 power to themselves and the
// attacker. Most play from the victim's own exported timeline (ownPower),
// where 3-TIMES's, Z-MEGA's, SHIN-Z's, ZAKU's, PAC-HELO's, GOLF's, ASURA's,
// TTRO's, ASTROMAN's, RARIO's and TRAINING's guards add 2, 5 and 3 (3-TIMES's
// PCs 2176, 2209, 2275) for Ryuko's 1, 3 and 2; the rest take these.
const REACTION_POWER: Partial<Record<Action, [number, number]>> = {
  hit: [3, 2],
  hitRapid: [1, 0],
  rushAirHit: [1, 0],
};
for (const action of [
  'hitHeavy',
  'launchUp',
  'launchAway',
  'launchDown',
  'twist',
  'uppercut',
  'fireLaunch',
  'twistSide',
  'inatuma',
  'airInatuma',
  'icePunch',
  'hisoStop',
  'airHisoStop',
] as const)
  REACTION_POWER[action] = [5, 3];
// Action 135 credits only the victim, as does 134 (PC 1818).
REACTION_POWER.drillDown = [5, 0];
REACTION_POWER.chuckUp = [5, 0];
// KAY's Fire HISA (107) gives the attacker 13 (PC 1324); YINAN's, AYA's and
// DoraEmon's HISA Down (158, 154, 146) give it none (PCs 2389, 1775, 2037).
const OWN_REACTION_POWER: Partial<
  Record<Who, Partial<Record<Action, [number, number]>>>
> = {
  kay: { fireLaunch: [5, 13] },
  yinan: { launchDown: [5, 0] },
  aya: { launchDown: [5, 0] },
  dora: { launchDown: [5, 0] },
};
const reactionPower = (f: Fighter): [number, number] =>
  OWN_REACTION_POWER[f.who]?.[f.action] ?? REACTION_POWER[f.action] ?? [0, 0];
// DoraEmon's Br. intro's op 0x01 runs, as [ticks, raw vy, gravity] from the
// clip's start: after 開始時 BR's 50-tick display (PC 365), Round 1 (34)
// rises at −50 for 27 ticks (PC 381) after its first 100, stops (PC 393)
// and falls under gravity 50 (PC 398) until he lands (DORA_LANDING).
const DORA_MOTION = [
  [150, 0, 0],
  [27, -50, 0],
  [81, 0, 0],
  [DORA_LANDING - 258, 0, 50],
];
// The win's and draw's timelines when they roll, test or move
// (export_fighter).
const RESULT_SCRIPTS = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, data]) => [
    who,
    'resultScripts' in data ? data.resultScripts : {},
  ]),
) as Record<Who, Partial<Record<'win' | 'draw', ObjectKey>>>;
// His fall at `age`, its gravity added before each move.
const doraFall = (age: number) => {
  for (const [ticks, vy, ay] of DORA_MOTION) {
    if (age < ticks)
      return (
        vy * SOURCE_VELOCITY_SCALE + (age + 1) * ay * SOURCE_ACCELERATION_SCALE
      );
    age -= ticks;
  }
  return 0;
};
// Ryuko's lose action (+0x75a0), which jumps into KO Normal (60).
const LOSE = 59;
// Ryuko's and LIZARD's HISA Down Down lands into Chuck DOWN DOWN (147, PC
// 1664); every other player's into their Down normal (Zoma's 146, PC 1585),
// which lies 30 ticks less.
const BOUNCE_DOWN: readonly Who[] = ['ryuko', 'lizard'];
// The KOs that launch straight up and sink without sliding (moveKO).
const STRAIGHT_KO: readonly Who[] = ['rario', 'training'];
// Ryuko's knockdown, 'DOWN normal', and its get-up, 'Down Get up': Z-MEGA's
// GAISA FINAL ends in his (157) + 5 (PC 4137), at its roll.
const KNOCKDOWN = 146;
const GET_UP = 145;
const HISA = 80;
const GON_MISS = 137;
// MASA's and 3-TIMES's Down Get up (190, 187) picks its voice by a chain of
// rolls (PCs 2205–2226, 2114–2135); Z-MEGA's and SHIN-Z's (157, 159) roll
// rand % 6 > 2 and > 4 (PCs 1937, 2013) past a one-tick display whose hit
// and guard handlers and box (PCs 1938–1940), 9869 source pixels down, meet
// nothing, 30 ticks either way. Each rolls as it is entered (Match.action)
// and draws its clip, as every path does.
const GET_UP_ROLLS = new Set(
  (Object.keys(CHARACTERS) as Who[]).filter(
    (who) =>
      exported(twin(who, GET_UP), who) &&
      script(twin(who, GET_UP), who).events.some((e) => e.op === 'random'),
  ),
);
// 'fly side wall hit', which Chuck OGI BALL's wall handler enters (slot 4,
// PC 1885), as Chung's chuck's does (PC 1079).
const FLY_SIDE_WALL = 95;
// Ryuko's reactions that only some players' moves reach, which each victim
// plays from its own timeline (export_fighter's OWN_TIMELINES): Clothes off
// and its 500 form (101, 103; ZENKA's en300 and en500 grabs), the RARIO
// mushrooms' grow, YARA and 1UP (115–117), Chuck OGI BALL (138), and Chuck
// Zmega and Chuck ShinZ (141, 142), which Z-MEGA's and SHIN-Z's GIGA presses
// apply (op 0x14 responses 74, 75).
const OWN_TIMELINES = new Set([101, 103, 115, 116, 117, 138, 141, 142]);
// The victim's own timeline a response names, if it is one of those.
const ownTimeline = (who: Who, response: number) =>
  OWN_TIMELINES.has(responsesOf('ryuko')[response])
    ? responsesOf(who)[response] || undefined
    : undefined;
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
  // 136 does with 91's stops (PC 1096), its first three displays' body boxes
  // not pushing (kind 2, PC 1097) where 136's do (PC 1857).
  92: { action: 'twistSideHit', stop: 13 },
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
// Op 0x15 in FB (PC 1442) and FBH (PC 1448) credits the striker.
const STRIKER_POWER: Partial<Record<number, number>> = { 110: 10, 112: 10 };
// FB, FBB and FBH, which Ryuko's and most players' jump to hit heavy, BEAM
// Stand and HISA (PCs 1444, 1446, 1449). Giant's, KAY's, SAKUYA's, ALEX's,
// HISO's, ERUS's, GON's, KATE's, REMU's, GIGI's, SWW's, YINAN's and AYA's
// copy those records instead, with their own smoke, sounds, rolls, displays
// and power, as their UNCOUNTER DOWN and Air Fire copy DOWN and J Att
// (aliases): the reaction plays the copy (export_fighter's `copies`).
const FB = 110;
const FIRE = new Set([FB, 111, 112]);
const AIR_HIT_HEAVY = 76;
// Each jump hit (J atttack, 77) counts in variable 5 (PC 831), which its
// last record clears as it runs out (PC 849).
const JUMP_HIT = 77;
// DRAGON Fireball (125), which plays as the uppercut (96): FENG's, G
// Suneo's, Yo's, YINAN's and AYA's, which draw or cry otherwise, are copies
// (export_fighter).
const DRAGON_FIREBALL = 125;
const copyOf = (who: Who, own: number) => {
  const victim = twinOf(who, own) ?? 0;
  return exported(own, who) &&
    (FIRE.has(victim) ||
      victim === DRAGON_FIREBALL ||
      own !== twin(who, victim))
    ? own
    : undefined;
};
// An exported reaction's or copy's op 0x15s before its first display, which
// run as it is entered: YINAN's FB credits HISA's 13 after its 10 (PC
// 2068), KAY's FBH only HISA's 3 (PC 1408). GON MISS's come after (gonMiss).
const ownPower = (key: ObjectKey, who: Who) =>
  script(key, who).events.reduce<[number, number]>(
    ([self, other], e) =>
      e.op === 'power' && !e.t
        ? [self + e.selfPower, other + e.otherPower]
        : [self, other],
    [0, 0],
  );
// 0x40e7c0: at 30% life or less, a loss shrinks to the loser's percentage
// (+0x7ca7): 60, CHUNG's 65, ALPHA's 45 (at least 1). One
// that leaves life adds to what the life bar shows lost and holds it 20
// steps (0x40ea79); one that empties it clears both (0x40e855).
// +0xdf09, life per mille (0x408f68); a story's waiting slot keeps its full
// life over a maximum of 1 (0x4089a3, 0x411e4c).
const perMille = (f: Fighter) =>
  f.present ? Math.trunc((f.hp * 1000) / lifeOf(f.who)) : f.hp * 1000;

function loseLife(f: Fighter, loss: number) {
  if (loss && f.hp <= desperationOf(f.who))
    loss = Math.max(1, Math.trunc((loss * CHARACTERS[f.who].scale) / 100));
  f.hp = Math.max(0, f.hp - loss);
  if (loss) [f.lost, f.lostDelay] = f.hp ? [f.lost + loss, 20] : [0, 0];
  // A loss that leaves no life drops the player to priority 0x3c (0x40e8cd),
  // behind the other.
  if (f.hp === 0) f.z = 0x3c;
  return loss;
}
// A gain, up to full life (0x40ea9f), takes from what the bar shows lost,
// even one of 0.
function gainLife(f: Fighter, life: number) {
  f.hp = Math.min(lifeOf(f.who), f.hp + life);
  [f.lost, f.lostDelay] = [Math.max(0, f.lost - life), 20];
}
// 0x412522: each step a stop or a queued action doesn't skip counts the
// hold down, then drains what the bar shows lost by 1, and keeps where the
// player stands for the bar to draw from (+0xdf41, 0x412552), before the
// motion pass moves it.
function stepBar(f: Fighter) {
  f.bar = { x: f.x, y: f.y };
  if (!f.lost) return;
  if (f.lostDelay) f.lostDelay--;
  else f.lost--;
}
// 0x40f010: a guard takes the striker's chip percentage (+0x7ca5, 0x40f6be)
// only from a box of kind bit 2. A hit loses the striker's decay (+0x7ca8)
// percent per hit the victim has taken (+0xdf01, 0x40f795), then scales by
// the struck body box's percentage `taken`.
function boxDamage(
  box: ScriptBox,
  taken: number,
  blocked: boolean,
  striker: Who,
  struck: number,
) {
  const { damage } = box;
  const { chip, decay } = CHARACTERS[striker];
  if (blocked)
    return damage && box.kind & 4
      ? Math.max(1, Math.trunc((damage * chip) / 100))
      : 0;
  if (!damage) return 0;
  const decayed = Math.max(
    1,
    damage - Math.trunc((damage * decay * struck) / 100),
  );
  return Math.max(1, Math.trunc((decayed * taken) / 100));
}
// Op 0x17 lists six responses: standing, crouching and airborne, then the
// same three guarding. This picks the victim's: airborne above the floor
// (+0x58, 0x40f4a5), where the hit test, before the motion pass, finds it.
const responseSlot = (target: Fighter, guarding: boolean, crouching: boolean) =>
  (guarding ? 3 : 0) + (target.y < 0 ? 2 : crouching ? 1 : 0);
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
  if (target.bare) return;
  for (const body of hurtboxes(
    shown(target),
    target.age,
    target.who,
    yowai(target),
  )) {
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
        // Its centre in whole source pixels (0x40f1c8–0x40f21b).
        centre: {
          x: (Math.floor(target.x / 1.5) + target.facing * body.x) * 1.5,
          y: (Math.floor(target.y / 1.5) + body.y) * 1.5,
        },
      };
  }
}
// Ops 0x07 and 0x14 mark the player they hold or toss reeling and held
// (+0x15e & ~5 | 0xa, 0x413020 and 0x41314a).
// The twins whose op 0x01 flies at another raw vx: every HISA Down but
// Ryuko's, Zoma's, YINAN's (158, PC 2398), AYA's (154, PC 1784) and
// DoraEmon's (146, PC 2045) at −800 (Kiki's, Chung's,
// Amiro's, ANMC P's, Giant's, G Suneo's, Yo's, SIN's, LIZARD's, KAY's,
// DIDO's, SAKUYA's, ALEX's, SOU's and
// HISO's 124, 127, 128, 125, 130, 135, 126, 128, 126, 128, 129, 143, 132, 133
// and 131, PCs 1522, 1582, 1883, 1631, 1799, 1756, 1582, 1638, 1623, 1795,
// 1818, 1938, 1848, 1725 and 1814; ZENKA's 144, PC 1880; Z-MEGA's 135,
// PC 1624; ALPHA's 161, PC 2332; SHIN-Z's 137, PC 1702; ZAKU's 137, PC
// 1536; PAC-HELO's 137, PC 1582; GOLF's 109, PC 1272; ASURA's 109, PC
// 1283; TTRO's 124, PC 1494; ASTROMAN's 122, PC 1676; RARIO's 116, PC
// 1337), Amiro's
// Tatumaki >> (105) at −300 (PC 1398) and YINAN's and AYA's Chuck DOWN (170,
// 166) at −1000 (PCs 2593, 1965).
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
  feng: { launchDown: -800 },
  sean: { launchDown: -800 },
  gon: { launchDown: -800 },
  kate: { launchDown: -800 },
  remu: { launchDown: -800 },
  rear: { launchDown: -800 },
  gigi: { launchDown: -800 },
  sww: { launchDown: -800 },
  ogi: { launchDown: -800 },
  ziro: { launchDown: -800 },
  masa: { launchDown: -800 },
  times: { launchDown: -800 },
  zenka: { launchDown: -800 },
  zmega: { launchDown: -800 },
  alpha: { launchDown: -800 },
  shinz: { launchDown: -800 },
  zaku: { launchDown: -800 },
  pachelo: { launchDown: -800 },
  golf: { launchDown: -800 },
  asura: { launchDown: -800 },
  ttro: { launchDown: -800 },
  astroman: { launchDown: -800 },
  rario: { launchDown: -800 },
  training: { launchDown: -800 },
  yinan: { drillDown: -1000 },
  aya: { drillDown: -1000 },
};
// The darkening's variable: 14, or MASA's, 3-TIMES's, ZENKA's, ALPHA's,
// ZAKU's and PAC-HELO's 13, which their Black (75, 75, 54, 59, 55, 55) tests
// (PCs 664, 669; 573, 578; 602, 607; 816, 821; 463, 468; 471, 476) and
// clears (PCs 670, 579, 608, 822, 469, 477) as Ryuko's does 14 (PCs
// 428–434).
const darkening = (who: Who) =>
  who === 'masa' ||
  who === 'times' ||
  who === 'zenka' ||
  who === 'alpha' ||
  who === 'zaku' ||
  who === 'pachelo'
    ? 13
    : 14;
// Reactions whose script rolls op 0x20 on entry (PCs 794, 819, 909, 957, 982,
// 1159, 1215, 1238, 1403, 1425, 1619, 1711, 1787): 75, 76, 80, 96, 99, 100,
// 126 and 132 only skip a sound, while 83, 84, 108, 109 and 122 swap their
// first three poses. Ryuko's jump hit (77) has none, but Zoma's and Kiki's
// (78, PC 784) roll which displays play, Amiro's knockdown (84, PC 990)
// and ANMC P's Chuck Twis (131, PC 1719, his DST toss) whether to skip
// their sounds, as ASURA's KO NORMAL (46, PC 416) picks its voice.
const ROLLED: Partial<Record<Action, number>> = {
  down: 60,
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
  dstToss: 129,
  // KAY's Pull Back (126) and YO's and SIN's TWIS SIDE FLY (95, 96) roll
  // rand % 3 > 1 past their sounds (PCs 1735, 1072, 1116).
  hitPull: 121,
  twistSideHit: 92,
};
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
// The KO downs (62) that roll play from their timelines, as results do:
// ZIRO's (70) slides back at raw −200 for ten ticks (PCs 822–824), rolls
// its voice (PC 828) and Random lose (75, PC 834); otherwise it runs on
// into ko DOWN2 (71), which stops both players 13 ticks (PC 858), bursts
// and launches at raw 200/−2400 (PC 867) into ko down 2 fly (72), landing
// into ko DOWN3 (73, slot 1, PC 871), which slides at 200 for 10 (PC 890)
// and lies. ponytail: Random lose stands until struck, arming its box and
// clash handler (75 + 20) only at age 758 (PCs 909–914); the round ends
// first (resultReady), so neither runs.
const KO_DOWN = 62;
const KO_TIMELINES = new Set(
  (Object.keys(CHARACTERS) as Who[]).filter((who) =>
    script(twin(who, KO_DOWN), who).events.some((e) => e.op === 'random'),
  ),
);
// ZAKU's and PAC-HELO's KO downs (61) play from their timelines too, as
// their tests of variable 11 (PCs 535, 545), which their story rounds set
// (Round BR 2, PCs 342, 344), take KO Down BR (62): at 2 at once, at 1 once
// the 2000-tick pose has run (62 + 10). It lies 500 ticks, then, unless the
// round is over (PC 559), spawns KO BR HP (63, PC 560), which gains 2 life
// 101 times (PCs 565–566), and stands into neutral (PC 563).
const KO_SCRIPTS = new Set(
  (Object.keys(CHARACTERS) as Who[]).filter((who) =>
    script(twin(who, KO_DOWN), who).events.some(
      (e) => e.op === 'test' && e.selector >> 6 === 1,
    ),
  ),
);
const markHeld = (f: Fighter) => (f.reaction = (f.reaction & ~5) | 0xa);
// A looping script never runs out, so its object lives until deleted.
const loops = (e: Effect) => script(e.clip, e.who).end === 'loop';
// A KO timeline has settled on the floor once it won't move again.
const settled = (f: Fighter) => {
  const { end, events } = script(f.branch!, f.who);
  return (
    end !== 'jump' &&
    f.y === 0 &&
    !events.some((e) => e.op === 'motion' && e.t > f.age)
  );
};
// A jump target: an action, or "action+offset" entering mid-action.
const sourceKey = (action: number, offset: number): ObjectKey =>
  offset ? `${action}+${offset}` : action;
// The timeline a scripted fighter runs.
const timeline = (f: Fighter) => f.branch!;
// Op 0x1f player variable 0 at 10: Ryuko's EX mode, which EX Ch (204, PC
// 2867) sets and NOR Ch (205, PC 2880) clears; Chung's at 100, set by TO EX
// (229, PC 3191) and cleared by TO NOR (230, PC 3204). Zoma's counts his
// bombs. Each intro's op 0x16 jumps while down is held as it checks:
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
// to the same call of STAND DEMO (37 + 24, PC 522), which there jumps to
// Skill1 (32, PC 296), her EX stance (animations.ts). ALEX's at 100, set by TO EX (225,
// PC 3315) and cleared by TO NORMAL (226, PC 3328); his intro's (PC 356)
// enters EX change (39), which sets it (PC 412) and jumps back (33 + 18, PC
// 413). SOU's at 10, set by TYPE CHANGE to EX (222, PC 3006) and cleared by
// TYPE CHANGE to NOR (223, PC 3019), which the first enters while it is set
// (PC 3003); his intro's (PC 415) enters Change Character (41), which sets
// it (PC 464) and jumps back (37 + 12, PC 465). OS FENG's at 100, set by
// Type to EX (240, PC 3264) and cleared by Typpe to Normal (241, PC 3277),
// which the first enters while it is set (PC 3261); his intro's (PC 393)
// enters OP TYPE CHANGE (52), which sets it (PC 582) and jumps back (35 +
// 19, PC 583). GON's at 100, set by Type to EX (247, PC 3701) and cleared
// by Type to Normal (248, PC 3714), which the first enters while it is set
// (PC 3698); his intro's (PC 466), as he lands, enters TYPE
// CHANGE (49), which sets it (PC 542) and jumps back (39 + 28, PC 543).
// GIGI's Change form at 100, set by Change (216, PC 3125) and cleared by
// Change ex (217, PC 3137), which the first enters while it is set (PC
// 3122); his intro's (PC 361) jumps to 開始時 2P (31) + 13, which sets it
// (PC 345) before the same call of Demo stand (PC 346). SWW's at 100, set
// by Chan (211, PC 3031) and cleared by EX Chan (212, PC 3043), which the
// first enters while it is set (PC 3028); his intro's (PC 330) enters EX
// CHANGE (37), which sets it (PC 374) and jumps back (33 + 8, PC 375).
// ZIRO's at 100, set by TO EX (251, PC 3757) and cleared by TO NOR (252, PC
// 3770), which the first enters while it is set (PC 3754); his intro's (PC
// 486), 68 ticks after he lands, enters Change EX (43), which sets it (PC
// 548) and jumps back (39 + 35, PC 549).
export const EX_MODE: Partial<Record<Who, number>> = {
  ryuko: 10,
  chung: 100,
  amiro: 100,
  anmc: 100,
  giant: 100,
  suneo: 100,
  sin: 10,
  kay: 100,
  sakuya: 100,
  alex: 100,
  sou: 10,
  erus: 10,
  feng: 100,
  gon: 100,
  gigi: 100,
  sww: 100,
  ziro: 100,
  yinan: 100,
};
// Zoma, Kiki and Yo have none, whatever their variable 0 holds.
export const exMode = (f: Fighter) => {
  const ex = EX_MODE[f.who];
  return ex !== undefined && f.variables[0] === ex;
};
// ZENKA's and ALPHA's yowai forms (hurtboxes, yowaiKey): each round their
// 開始時 enters 開始時 yowai at global 1 = 1000, as VS's select screen leaves
// it, which sets variable 14 to 10 (PCs 478, 479), and nothing of theirs
// clears it. Only their clips have yowai forms.
const yowai = (f: Fighter) => f.variables[14] === 10;
// The clips' EX forms follow the guards' and demo stands' tests of variable
// 0: EX mode's, and Z-MEGA's Shin form, 100, whose DEMO stand plays DEMO
// stand sp (31, PC 342) in his draw (PC 716), though no face of his reads it.
const clipEx = (f: Fighter) =>
  exMode(f) || (f.who === 'zmega' && f.variables[0] === 100);
// What a fighter shows: under 'script', its source action's timeline.
const JUMP_CLIPS = [
  ['takeoff', 'jump'],
  ['takeoffForward', 'jumpForward'],
  ['takeoffBack', 'jumpBack'],
  ['fall', 'fall'],
] as const;
const shown = (f: Fighter): Shown =>
  f.action === 'script' || (f.action === 'koLand' && f.branch)
    ? f.branch!
    : f.action === 'takeoff' || f.action === 'jump'
      ? JUMP_CLIPS[f.jump][Number(f.action === 'jump')]
      : f.action;
// Each player's engine states by number (the export's `neutral`), which a
// handler enters as the port's actions, and their moves' levels (header r[2]).
const NEUTRAL = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, { neutral }]) => [who, neutral]),
) as unknown as Record<Who, Record<string, Action>>;
const LEVELS = Object.fromEntries(
  Object.entries(CHARACTERS).map(([who, { levels }]) => [who, levels]),
) as unknown as Record<Who, Record<string, number>>;
// SOU's crouch (20) rolls rand % 6 > 3 as its last display runs out (PC
// 290): past it, it blinks again from its start; otherwise it holds image
// 126 another 100 ticks (20 + 5, PC 291), the loop its timeline keeps.
const CROUCH_ROLLS = Object.fromEntries(
  (Object.keys(CHARACTERS) as Who[]).flatMap((who) => {
    const index = Number(
      Object.keys(NEUTRAL[who]).find((k) => NEUTRAL[who][k] === 'crouch'),
    );
    if (!exported(index, who)) return [];
    const { events, frames, loop } = script(index, who);
    const roll = events.find((e) => e.op === 'random');
    const hold = frames
      .slice(0, Number(loop))
      .reduce((t, frame) => t + frame.duration, 0);
    return roll?.op === 'random' ? [[who, { ...roll, hold }]] : [];
  }),
) as Partial<Record<Who, { divisor: number; above: number; hold: number }>>;
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
// The KGT's responses flagged as hits (0x438694 bit 0).
const HIT_RESPONSES = new Set(ui.hits);
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
  // +0xdf25: life a loss took that a story's life bar still shows in red,
  // and +0xdf29, the steps before it drains (lifeBars).
  lost: number;
  lostDelay: number;
  // +0xdf41: where the player stood as its last unstopped step began, which
  // its life bar draws from (stepBar).
  bar: { x: number; y: number };
  facing: -1 | 1;
  action: Action;
  age: number;
  airAge: number;
  // The jump the takeoff entered: 0 up, 1 forward, 2 back (jumpClips); 3
  // the fall.
  jump: 0 | 1 | 2 | 3;
  hitStop: number;
  // The input word op 0x1a's stop saved (+0x4dfd83), while its flag
  // (+0x4dfd7f) holds.
  stopInput: Input | null;
  connected: boolean;
  // Damaging hits taken (+0xdf01, 0x40f807), which a run-out (0x412719) and
  // round set-up (0x411f35) clear.
  struck: number;
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
  // Slot 5 (+0x74): what another side's box meeting one of its own enters
  // (clashBoxes).
  onClash: ObjectKey;
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
  // Op 0x07 cleared its body boxes (0x40e550), which only its own op 0x19s
  // set again, as the next action it enters runs them.
  bare: boolean;
  // The cancel counter (+0xdf85): op 0x18 arms it with r[10] bit 0 or
  // disarms it (0x412d2b, 0x412d37), and a contact by any of the player's
  // boxes, its objects' too, raises an armed one to 2 (0x40f384), which an
  // op 0x1e mode 1 window needs (0x41194d). A run-out (0x412713, runOut
  // and the free state's) and a window's cancel (0x4119f7) clear it; other
  // action changes keep it: the free state's moves (0x411a01), an air
  // reaction's landing (0x4124c3) and op 0x0a jumps, until the next op 0x18.
  contact: number;
  // The op 0x20 branch this reaction rolled on entry, drawn instead of its
  // clip, or the op 0x16 branch EX Fire's charge took, run instead of its
  // timeline.
  branch: ObjectKey | null;
  // The victim's own copy this reaction plays (copyOf): drawn, rolled and
  // entered in place of its clip.
  copy: number | null;
  // Raw velocity J atttack 2's op 0x01 sets the jump hit sliding at, which
  // its slide adds to (enterPending).
  slideBase: number;
  // Where a result branch's check that jumped out of a call returns, as an
  // object's does (Effect's resume).
  resume?: { clip: ObjectKey; t: number; skip: number };
  // The cycle of the HUD face (action 70's object variable 0) from EX mode's
  // first tick, or −1.
  face: number;
  // Op 0x1f's player variables by number (0x4dfa75 + player). Ryuko's: 0 is
  // EX mode (exMode), 1 is 10 after a double jump and 20 in an air dash, 6 is
  // 100 through an IORI stage, 12 is 10 from EX Fire 2 (232, PC 3364) until
  // EX Fire (231, PC 3341) or its shot's hit (235, PC 3438) clears it, and
  // 14 (selector 0x4e) is 100 through a super, which darkens the stage
  // (MASA's, 3-TIMES's and ZENKA's 13, darkening).
  // Zoma's 0 counts his bombs, ten each, and 6 marks DRAGON.
  variables: Record<number, number>;
  // The object's own variables (+0x131, op 0x1f below selector 0x40):
  // YINAN's Fist S and p90 count their passes in 0.
  locals: Record<number, number>;
  // +0x15e bits 0–3: a hit sets 8 and a guard 12 (0x40f7a8, 0x40f6a2), a
  // hold 0xa (0x413020). Action changes (0x410cf0) keep them until the
  // fighter returns to neutral. `striker` (+0xdefd): the opponent's own box
  // ('body', 0x40f8a4) or an object following it ('object', 0x40f8ac).
  reaction: number;
  striker: 'body' | 'object' | null;
  // +0xdef9: what a contact of a player's own box last joined this one to
  // (0x40f2da, 0x40f2e0): the other player, or the object whose body its box
  // met. Only the round's setup clears it (0x411f7c), so ops 0x07 and 0x14
  // reach it long after.
  caught: Fighter | Effect | null;
  // +0xdefd's player: whose box, or object following it, last struck this
  // one (0x40f8a4, 0x40f8ac).
  struckBy: Fighter | null;
  // +0xdf69: the nearest player it fights, which it faces, measures its
  // commands' near and far from and plays its CPU against (retarget); and
  // the players it fights (+0xdfb7, a bit each): every other one in VS
  // (0x411cc0 clears only its own bit, which no check reads).
  target: Fighter | null;
  enemies: number;
  // +0xdf51: which way the target lies, which the input word and the free
  // state's facing take.
  toward: -1 | 1;
  // +0x2238 and +0xe00f: whether the player has entered, which a story's
  // waiting slot hasn't, and whether it has shown a display since, which one
  // stopped for its entry's seconds hasn't. Neither is targeted (0x40e5f7),
  // struck, pushed or drawn before.
  present: boolean;
  shown: boolean;
  // +0xdfbb: a story's points, which KOs (knockOut) and a time-up
  // (storyResult) score; 100 ends the round (0x408ef1).
  points: number;
  // Priority (+4): the step and the draw take it at the tick's start. Each
  // contact and ops 0x07/0x14 set it about its plane's base (0x41f130), and
  // a KO drops it to 0x3c (0x40e8cd).
  z: number;
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
// The players' priority at creation (0x408a38) and their plane's base
// (0x41f130 by +0x14 bit 0, set at the first step, 0x411c83): 80 for plane
// 0, where both play, since only a debug toggle moves one to plane 1 (70,
// 0x411262), which the hit test keeps apart (0x40f0e4).
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
  // Its place in the object table (0x4701e0), past the players' 0 and 1.
  index: number;
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
  // Its own variables (+0x131), zeroed as it spawns.
  locals: Record<number, number>;
  // Op 0x02 handlers: what a hit (slot 2) or a guard (slot 3) enters.
  onHit?: ObjectKey;
  onGuard?: ObjectKey;
  // Slot 1: what landing on the floor enters (0x41241c).
  onLand?: ObjectKey;
  // Slot 5 (+0x74): what another side's box meeting one of its own enters
  // (clashBoxes).
  onClash?: ObjectKey;
  // The handler a contact queued (+0x38), which the next step enters.
  pending?: ObjectKey;
  // Where a check that jumped out of a call returns once its target runs
  // out (0x4125ea): the timeline, its tick and the events to pass over.
  resume?: { clip: ObjectKey; t: number; skip: number };
  // A stage object: the action it restarts and its scroll percentages.
  stage?: { home: number; x: number; y: number };
  // Object type 7 (0x40ab10), a victim's hit count: the count it shows
  // (+0x156), whose count it watches (+0x15e) and its steps (+0x15a).
  counter?: { count: number; victim: Fighter; steps: number };
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
// falls; type 2 also shows `start` on odd drawn frames, and type 3 draws at
// a random point between the two (scene.ts).
export interface Fader {
  type: number;
  start: Omit<Color, 'mode'>;
  target: Omit<Color, 'mode'>;
  left: number;
  ticks: number;
}
export function faderColor(
  { start, target, left, ticks }: Fader,
  p = Math.trunc((left * 100) / ticks),
) {
  const mix = (to: number, from: number) =>
    Math.trunc((to * (100 - p) + from * p) / 100);
  return {
    r: mix(target.r, start.r),
    g: mix(target.g, start.g),
    b: mix(target.b, start.b),
    fade: mix(target.fade, start.fade),
  };
}
// What an object draws with, from the colour the match holds and the
// `kept` pair of that colour and what it drew last (0x40d596). A running
// type-1 or type-2 fader draws the match's blend, a type-2 one its start on
// odd drawn frames (0x40cb72; 0x4456fc counts them), and a type-3 one a
// blend at `roll`, rand() % 100, each draw (0x40cacf): ANMC P's K 2 (210, PC
// 2774). Each draw writes it over the object's colour (+0x44–0x50), so once
// the fader runs out the last stays until the match sets another: K 2's op
// 0x23 at age 55.
export function drawnColor(
  color: Color,
  fader: Fader | null,
  frame: number,
  roll: number,
  kept?: [Color, Color],
): [Color, Color] {
  const type = fader?.left ? fader.type : 0;
  if (type === 2 && frame & 1) return [color, { ...color, ...fader!.start }];
  if (type === 3) return [color, { ...color, ...faderColor(fader!, roll) }];
  if (type || kept?.[0] !== color) return [color, color];
  return kept;
}
// The display a fighter shows.
export function fighterPose(f: Fighter): Pose {
  // Op 0x07 replaces a held player's display, whatever its action: Giant's
  // counter hit holds a vanished victim (PC 4334).
  if (f.held?.pose) return heldFrame(f.held.pose, f.held.flags, f.who);
  // A rolled branch that jumps on draws its reaction's clip past its own
  // displays: ANMC P's Chuck Twis + 12 enters his spin (132, PC 1722).
  if (
    f.branch &&
    !(
      f.action !== 'script' &&
      script(f.branch, f.who).end === 'jump' &&
      f.age >= animationDuration(f.branch, f.who)
    )
  )
    return animationFrame(f.branch, f.age, f.who);
  return clipPose(
    shown(f),
    f.action === 'jump' ? f.airAge : f.age,
    f.who,
    clipEx(f),
    yowai(f),
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
  index: 2,
  screen: false,
  follow: null,
  box: null,
  boxes: [],
  responses: [],
  connected: false,
  hitStop: 0,
  color: NORMAL_COLOR,
  trail: null,
  locals: {},
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
  lost: 0,
  lostDelay: 0,
  bar: { x, y: 0 },
  facing,
  action: 'idle',
  age: 0,
  airAge: 0,
  jump: 0,
  hitStop: 0,
  stopInput: null,
  connected: false,
  struck: 0,
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
  onClash: 0,
  window: null,
  color: NORMAL_COLOR,
  trail: null,
  entered: null,
  fader: null,
  black: { shown: 'none', left: 1 },
  held: null,
  bare: false,
  contact: 0,
  reaction: 0,
  striker: null,
  caught: null,
  struckBy: null,
  target: null,
  enemies: -1,
  toward: facing,
  present: true,
  shown: true,
  points: 0,
  z: FIGHTER_Z,
  branch: null,
  copy: null,
  slideBase: 0,
  face: -1,
  variables: {},
  locals: {},
  stopped: 0,
  transfer: 0,
  moving: 0,
  pending: null,
});
// Camera scroll (0x447f2c) in source pixels, which the walls read this tick,
// and whether they stand at the stage's ends instead.
let cameraLeft = 0;
let stageWalls = false;
// In the Vs. modes (0x470058 1 or 2) a player's motion step clamps x to 50
// and 590 source pixels from the camera (0x40fba2–0x40fca2). A story without
// letterings bit 2 clamps it to the stage's 50 and 1230 (0x40fac3), but for
// a player with a wall handler (+0x70). Moves stop at the walls at once;
// settle hands on the distance stopped. The camera's left wall measures it
// as (50 − camera) − x (0x40fbdd), not from the wall. True when a wall
// stopped it.
function placeX(f: Fighter, x: number) {
  const handler =
    launchMotion[f.action]?.wall || (f.action === 'script' && f.onWall);
  const left = stageWalls && !handler ? 0 : cameraLeft;
  const right = stageWalls && !handler ? 1180 : cameraLeft + 540;
  f.x = Math.max((left + 50) * 1.5, Math.min((right + 50) * 1.5, x));
  f.stopped += f.x > x ? Math.max(0, (50 - left) * 1.5 - x) : f.x - x;
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
// Forward enters the default-action table's walk and back its back walk
// (+0x757c, 0x4111b3–0x411209), each moving at its own op 0x01: Ryuko's raw
// 230 and −180 (PCs 32, 41), 3-TIMES's 350 and −300.
function walkSpeed(who: Who, back: boolean) {
  const { events } = script(CHARACTERS[who].walks[Number(back)], who);
  const launch = events.find((event) => event.op === 'motion');
  return launch?.op === 'motion' ? launch.vx * SOURCE_VELOCITY_SCALE : 0;
}

// Routine 0x40e6f0 carries full gauges into stock, up to the fighter's cap,
// and borrows stock back; none at the start (+0x7cc2).
export function addPower(f: Fighter, amount: number) {
  f.power += amount;
  while (f.power < 0) {
    if (f.stock === 0) f.power = 0;
    else {
      f.stock--;
      f.power += perStockOf(f.who);
    }
  }
  while (f.power >= perStockOf(f.who) && f.stock < stocksOf(f.who)) {
    f.power -= perStockOf(f.who);
    f.stock++;
  }
  if (f.stock >= stocksOf(f.who)) {
    f.stock = stocksOf(f.who);
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
// 0x406570: the first slot no live object holds.
const firstFree = (objects: Effect[]) => {
  const taken = new Set(objects.map((e) => e.index));
  let index = 2;
  while (taken.has(index)) index++;
  return index;
};
const stageObjects = (stage: Stage) =>
  STAGES[stage].objects.map(({ action, z }, i) =>
    newEffect({
      clip: action,
      who: stage,
      age: -1,
      y: -920 * 1.5,
      z,
      owner: -1,
      index: 2 + i,
      stage: stageScroll(stage, action),
    }),
  );

// The HUD faces' points in viewport coordinates, KGT 72's and 73's (31, 36)
// and (609, 36) (0x409f84, 0x409ff6), which their objects keep to.
export const HUD_FACES: Spawner[] = [31, 609].map((x) => ({
  x: x * 1.5,
  y: 36 * 1.5,
  facing: 1,
  screen: true,
  z: 0x65,
}));

// Every round set-up places the players at 390 and 890 source pixels
// (0x408a2e, 0x408ac3), and their Br. intros move them from there.
const introFighters = ([a, b]: [Who, Who]): [Fighter, Fighter] => [
  { ...fighter(390 * 1.5, 1, a), action: 'intro' },
  { ...fighter(890 * 1.5, -1, b), action: 'intro' },
];

export class Match {
  // The players by slot: 1P, then the CPU or 2P.
  fighters: Fighter[];
  ticks = 0;
  winner: 'player' | 'opponent' | 'draw' | null = null;
  endingTicks = 0;
  // State 300 (0x408ec7), and the result it picks the tick after, which its
  // result state acts on the tick after that (step).
  private picking: { winner: Match['winner'] } | null = null;
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
  // Deleted objects, whose slots (state 1, 0x40e505) stay taken until their
  // own turn in a step pass frees them (0x4069a0).
  private freeing: Effect[] = [];
  // The round's KGT objects (0x4068e0), which hud.ts draws: KGT 13 and what
  // its first step spawns, DRESS n, SHOW TIME, the result's lettering, 1P or
  // 2P WIN, PERFECT, and KGT 14 with what it spawns. Each holds a slot until
  // the tick its displays run out, or for the round while it loops or holds
  // a display of 0 (WIN, PERFECT, 14). The camera, the round controller and
  // the HUD manager with its faces (0x408c4a–0x408c69) hold theirs for the
  // round from before any player's object, which leaves the others' order
  // as it is, so they hold none here.
  private kgt: { e: Effect; until: number }[] = [];
  // The jumps chained in this step (branchTo).
  private jumps = 0;
  // Global 6 (0x4456bc): supers and COUNTER HIT add their freeze to it (op
  // 0x1f var 0x86), and KGT action 58 counts it down each tick unless paused
  // (PCs 366–371).
  freeze = 0;
  // PC 611's hold this tick, applied to both fighters after they move.
  private koStop = 0;
  // This tick's op 0x03 cues: each fighter's sound table (+0x221c), or the
  // stage's (owner −1), and index.
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
  // Each player's CPU (+0xdf5d), player 2's in VS.
  cpus: (CpuVM | null)[];
  // A story's seat for each fighter (+0x156: the 1P 0, slot n's player n +
  // 1; an empty slot seats no one), each slot (waits, which entry keeps
  // until it enters), the results the round gave (+0xe007: 1 win, 2 lose, 3
  // draw), and the rounds the 1P lost or drew (0x424e64).
  private seats = [0, 1];
  private slots: (Slot | null)[] = [];
  private waits: (Slot | null)[] = [];
  private results: number[] = [];
  lost = 0;
  // VS multi's teams (0x47006c) and the member each side fights with
  // (0x4700ec, 0x4700f0).
  teams: Who[][] | null = null;
  members = [0, 0];
  // 0x4701c4: the player the 1P last struck (0x40f2ef) or whose box the 1P's
  // met (0x40ed54), for the story HUD,
  // until 1000 ticks pass (0x4701c8, 0x409d00), or −1.
  enemy = -1;
  private enemyTicks = 0;
  // This tick's opponent input comes from the CPU (none was supplied, in Vs.
  // CPU or with the CPU practice partner).
  private cpuDriven = false;
  private previous: Input[] = [];
  // This tick's input, which op 0x16 reads.
  private inputs: Input[] = [];
  private history: number[][] = [];
  // Whether a command key's command waits in its player's history, and the
  // ticks recorded since one was entered (-1 for none).
  private keyed: boolean[] = [];
  private spent: number[] = [];

  constructor(
    public mode: Mode = 'practice',
    intro = false,
    seed = 0,
    // Player 1's and player 2's characters: in VS multi, the round's members.
    public characters: [Who, Who] = ['ryuko', 'ryuko'],
    readonly stage: Stage = 'court',
    // Whether the select screen started it, which leaves global 3 at 50 (KGT
    // PCs 541, 548, 585): VS single. Otherwise the title's demos clear it.
    readonly vs = false,
    // A story step's battle (story.ts), which seats the players.
    readonly battle: Battle | null = null,
    // Each seat's palette (+0xe00b), −1 for none, which a story keeps from
    // battle to battle.
    readonly held = Array<number>(8).fill(-1),
    // Op 0x1f's globals (0x4456b0) by index, which nothing in the engine
    // clears: the session's, shared with the screens (select.ts). The
    // title's demos clear all but 6 (T1's and T2's System V); CHAR SELECT
    // sets 3 and 10 to 10, which VS single's 2P cursor makes 50 and 0 (KGT
    // PCs 541, 542) and story mode, with no 2P cursor, keeps; TEAM VS's demo
    // sets 3 to 100 and clears 8–11; a story's demos set theirs (its NEXT
    // demos 10 to 100). Global 3 above 0 plays the ZA hits (Chuck Hit ZA,
    // 198, PC 2761, and the like), and it and global 10 at 10 pick each
    // 開始時's path (Ryuko's PCs 286, 287); at global 1 = 1000, which both
    // select screens set, ZENKA's and ALPHA's take 開始時 yowai (PCs 443,
    // 442).
    // At global 0 = 10, which LIZARD's, HISO's, SEAN's and G Suneo's lethal
    // blows hold for their strike's tick, a KO enters make hikari; ALPHA's
    // KO sets global 10 to 10000 or 20000. At 11 = 10, which MASA's and
    // 3-TIMES's 開始時 set, the stage plays no track; while 14 is 200,
    // which SIN's, KAY's and DIDO's supers hold, it stops every sound
    // (export_stage), and KGT 13 holds it at 10 for each round's first 10
    // ticks (`step`).
    readonly globals = selected(vs ? 50 : 0),
  ) {
    this.layers = stageObjects(stage);
    const cpu = characters[1];
    this.cpus = [
      null,
      new CpuVM(CPU_TABLES[cpu], CPU_LEVEL, seed, CPU_CONTROLS[cpu]),
    ];
    this.calls = intro;
    if (battle) this.seat(battle, seed);
    this.fighters = battle
      ? this.storyFighters()
      : intro
        ? this.entrants()
        : [fighter(300, 1, characters[0]), fighter(660, -1, characters[1])];
    this.clearInput();
    // Round setup makes KGT 13 after the stage's objects (0x408ce9).
    if (intro) this.hold(0x65, openingLife(this));
  }

  // A story battle (0x406aa3) on its stage (+1: stage file n − 1, in the
  // export's order), with the story's player as the 1P, its seats holding
  // the palettes the story's select screen and earlier battles left.
  static story(
    who: Who,
    battle: Battle,
    seed = 0,
    held?: number[],
    globals?: number[],
  ) {
    return new Match(
      'story',
      true,
      seed,
      [who, who],
      (Object.keys(STAGES) as Stage[])[battle.stage - 1],
      false,
      battle,
      held,
      globals,
    );
  }

  // VS multi (TEAM VS, mode 2) pits each side's first member against the
  // other's (0x408a07); its select screen leaves global 3 at 100.
  static team(teams: Who[][], stage: Stage, seed = 0, globals = selected(100)) {
    const match = new Match(
      'cpu',
      true,
      seed,
      [teams[0][0], teams[1][0]],
      stage,
      true,
      null,
      undefined,
      globals,
    );
    match.teams = teams;
    return match;
  }

  // State 100 spawns a story's 1P, then each slot's player (0x408b14), every
  // slot a CPU of its level (0x408bb0, 0–100). Authored: they roll the
  // first one's rand, as the engine's CPUs share one.
  private seat(battle: Battle, seed: number) {
    this.seats = [0];
    this.slots = [null];
    battle.slots.forEach((slot, i) => {
      if (!slot) return;
      const who = ROSTER[slot.player]!;
      const level = Math.max(0, Math.min(100, slot.level));
      const vm = new CpuVM(CPU_TABLES[who], level, seed, CPU_CONTROLS[who]);
      if (this.seats.length > 1) vm.shared = this.cpus[1]!;
      this.cpus[this.seats.length] = vm;
      this.seats.push(i + 1);
      this.slots.push(slot);
    });
  }

  // The fighter in a seat, if a slot seats one.
  private bySeat(seat: number): Fighter | undefined {
    return this.fighters[this.seats.indexOf(seat)];
  }

  // Each player's story set-up (0x411d0a) at its first step: the 1P fights
  // every player but its allies (a slot's flag bit 9), a slot those its +6
  // names (a bit per seat), and faces left unless an ally. A slot enters at
  // once (bits 1–2 0); after its seconds (+0xb, plus rand % +0xc), stopped
  // that long as +0x40 (1); or once its watched player's (+0xd) life falls
  // below its mark (+0xe), retrying each step until then (2).
  private storyFighters() {
    const battle = this.battle!;
    // Masks by seat, as fighter indices.
    const bits = (mask: number) =>
      this.seats.reduce(
        (bits, seat, i) => bits | (((mask >> seat) & 1) << i),
        0,
      );
    const allies = this.slots.reduce(
      (mask, slot, i) =>
        slot && slot.flags & 0x200 ? mask | (1 << this.seats[i]) : mask,
      0,
    );
    this.waits = this.slots.map(() => null);
    return this.slots.map((slot, i) => {
      const who = slot ? ROSTER[slot.player]! : this.characters[0];
      const ally = !slot || slot.flags & 0x200;
      const f = fighter((slot ?? battle).x * 1.5, ally ? 1 : -1, who);
      f.enemies = bits(slot ? slot.enemies : ~1 & ~allies);
      const entry = slot ? (slot.flags >> 1) & 3 : 0;
      if (entry === 2) {
        Object.assign(f, { present: false, shown: false });
        this.waits[i] = slot;
        return f;
      }
      this.takeSeat(i);
      this.opening(f);
      if (entry === 1) {
        f.hitStop = slot!.delay * 100;
        if (slot!.random) f.hitStop += (this.cpu.random() % slot!.random) * 100;
        f.shown = f.hitStop === 0;
      }
      return f;
    });
  }

  // The tick phase 1 begins: FIGHT's, or a story's without ROUND n or FIGHT
  // (letterings bits 0, 1) a tick after each skipped one (0x408d4b,
  // 0x408dde).
  get fightTick() {
    return this.battle ? storyFightTick(this.battle.letterings) : FIGHT_TICK;
  }

  // State 300 in a story (0x409062). At a time-up, seat 1 scores the step's
  // +0x11 for more life than the 1P and the 1P each slot's +0x14 for more
  // than that slot's player, by per mille. The 1P's side then counts the
  // most of the 1P's points and its allies' of 100 or more, the enemies the
  // most of theirs of 100 or more: more wins (410), fewer loses (420), the
  // same draws (430); a loss or draw counts in 0x424e64. The results go to
  // the 1P and the slots (0x409262–0x409389): a win gives enemies 2, or 3 at
  // a time-up, and allies 1; a loss the 1P 2, or 3 at a time-up, enemies 1
  // and allies 3; a draw everyone 3.
  private storyResult() {
    const battle = this.battle!;
    const [one] = this.fighters;
    const timeUp = this.seconds === 0;
    if (timeUp) {
      const first = this.bySeat(1);
      if (first && perMille(one) < perMille(first))
        first.points += battle.timeUp;
      this.fighters.forEach((f, i) => {
        if (i && perMille(f) < perMille(one))
          one.points += this.slots[i]!.timeUp;
      });
    }
    const ally = (i: number) => !i || this.slots[i]!.flags & 0x200;
    let [ours, theirs] = [one.points, 0];
    this.fighters.forEach((f, i) => {
      if (!i || f.points < 100) return;
      if (ally(i)) ours = Math.max(ours, f.points);
      else theirs = Math.max(theirs, f.points);
    });
    const winner =
      ours === theirs ? 'draw' : ours > theirs ? 'player' : 'opponent';
    if (winner !== 'player') this.lost++;
    const lose = timeUp ? 3 : 2;
    this.results = this.fighters.map((_, i) =>
      winner === 'draw'
        ? 3
        : winner === 'player'
          ? ally(i)
            ? 1
            : lose
          : !i
            ? lose
            : ally(i)
              ? 3
              : 1,
    );
    return winner;
  }

  // A waiting slot's step retries its set-up (0x411e7e): it enters once its
  // watched seat's life is below the mark, an empty seat's being 0.
  private arrive(f: Fighter, i: number) {
    const slot = this.waits[i]!;
    if ((this.bySeat(slot.watch)?.hp ?? 0) >= slot.below) return;
    this.waits[i] = null;
    f.present = true;
    this.takeSeat(i);
    this.opening(f);
  }

  // Each player's set-up takes its palette (0x412056): a slot's player
  // enters with none (0x411edf), so palette 0, and every player moves on
  // from one any other seat holds, this battle's or one an earlier battle
  // seated, which keeps it.
  private takeSeat(i: number) {
    const seat = this.seats[i];
    if (seat) this.held[seat] = -1;
    takePalette(this.held, seat, Math.max(0, this.held[seat]));
  }

  // Each fighter's palette.
  get palettes() {
    return this.seats.map((seat) => Math.max(0, this.held[seat]));
  }
  get cpu() {
    return this.cpus[1]!;
  }

  set cpu(vm: CpuVM) {
    this.cpus[1] = vm;
  }

  // Each set-up enters each player's 開始時 (+0x759c, 0x412180), which plays
  // as a script from the round's first step: VS single's intro for global 3
  // = 50, and otherwise its jump to 開始時 BR, the Br. intro. DoraEmon's
  // exports none (his BR first jumps into a scene with SEAN), so he plays
  // the authored Br. intro clip, whatever the mode.
  private entrants() {
    const fighters = introFighters(this.characters);
    fighters.forEach((f) => this.opening(f));
    return fighters;
  }

  private opening(f: Fighter) {
    const start = CHARACTERS[f.who].start;
    if (!exported(start, f.who)) {
      f.action = 'intro';
      return;
    }
    this.action(f, 'script', true, start);
    f.age = -1;
  }

  // Round set-up makes the HUD manager (type 15, 0x408c4a), whose first
  // step makes each player's HUD face (+0x75a6) in the Vs. modes (0x470058 1
  // and 2; a story's only the 1P's, 0x40a059) at KGT 72's and 73's points,
  // (31, 36) and (609, 36), at 0x65, owned by that player (+0x156, 0x409fca,
  // 0x40a036). The face's first step spawns the object in front of it that
  // keeps to it (op 0x04 flags 0x65: Ryuko's 70 + 26, PC 708), which first
  // steps in the round's third tick: past x 320 (PC 733) it sets player
  // variable 2 to 1 (Team VS 2P + 2, PC 481), which each 開始時 tests in its
  // sixth (PC 289), so player 2 enters 開始時 2P. SWW's sets 13, ALPHA's
  // 12 as well, and Z-MEGA's sets 2 again every 5 ticks. In TEAM VS (global
  // 3 above 99, PC 732) it enters Team VS 1P or 2P (44, 49) from the start,
  // which spawns its side's checker (44 + 4, 49 + 5): it reads the round's
  // winner's life from global 8 or 9 (see the result's 1P and 2P WIN).
  // Where a 開始時 leaves the mark, 通常立ち's clears (Ryuko's PCs 2–8,
  // which its idle clip's first frame carries) end it. A story's 1P face
  // takes KGT 72's point too (0x40a098 reads its start), where only SWW's
  // object acts, at global 3 above 1 (PC 710): his Team VS 1P + 2 sets
  // variable 12, which One Only tests (380, PC 6014).
  private spawnFaces() {
    HUD_FACES.slice(0, this.battle ? 1 : 2).forEach((face, owner) => {
      const [action, offset] = CHARACTERS[this.fighters[owner].who].faceHelper;
      if (action === undefined) return;
      this.spawnObject(face, owner, {
        flags: 0x65,
        action,
        offset,
        x: 0,
        y: 0,
        slot: 0,
        z: 0,
      });
    });
  }

  // The rounds to win (0x470048): a story step's (+2), VS multi's team
  // size (0x408797), or three.
  get rounds() {
    return this.battle?.rounds ?? this.teams?.[0].length ?? ROUNDS_TO_WIN;
  }

  // 0x404e2d: in a story, a life bar under each player past the 1P whose
  // slot sets bit 0 (+0xdf0d), the allies, once it has entered and shown a
  // display, while it has life.
  get lifeBars() {
    return this.fighters.filter(
      (f, i) => (this.slots[i]?.flags ?? 0) & 1 && f.present && f.shown && f.hp,
    );
  }

  // State 902 (0x40970a) ends a Vs. match once either side has won enough
  // rounds; a single round otherwise.
  // The fighter the HUD's 2P side shows: player 2, or in a story the enemy
  // (0x40dde6), and none while there is none.
  get rival(): Fighter | null {
    if (!this.battle) return this.fighters[1];
    return this.fighters[this.enemy] ?? null;
  }

  get matchOver() {
    return !this.calls || this.wins.some((wins) => wins >= this.rounds);
  }

  get matchWinner() {
    if (!this.calls) return this.winner;
    const [a, b] = this.wins.map((wins) => wins >= this.rounds);
    return a && b ? 'draw' : a ? 'player' : b ? 'opponent' : null;
  }

  // Ticks after the KO until the transition (state 900, 0x4096c0) to another
  // round or the match's end; free practice's single round is authored: the
  // KO lettering and one more second.
  get roundEnd() {
    if (!this.calls) return ROUND_END_TICKS;
    if (this.battle) return storyEndTick(this.winner);
    const winner = this.fighters[this.winner === 'player' ? 0 : 1];
    return roundEndTick(this.winner, winner.hp === lifeOf(winner.who));
  }

  // State 100 (0x408970) counts the round and sets it up again: the fighters
  // re-enter at full life (0x411ca5) with their variables cleared
  // (0x4121cc), keeping their stock and power from round 2 (0x411f2d). In
  // VS multi state 902 has moved on the member of each side that lost or
  // drew (0x409764–0x4097a1), whom its seat loads (0x408a07) with its stock
  // and power: as many as the other side's wins. The life, power and stock
  // it saves of the winner (0x4097ab) are never restored, as round setup
  // clears whose they are (0x4089e6) before the players' set-up reads it
  // (0x4120ce); the winner's own Team VS objects carry its life instead
  // (spawnFaces). Every set-up clears its CPU's state (0x411f82).
  // Authored: player 2's CPU plays the new member's table, rolling on.
  private nextRound() {
    for (const vm of this.cpus) vm?.reset();
    if (this.teams) {
      this.members = [this.wins[1], this.wins[0]];
      this.characters = [
        this.teams[0][this.members[0]],
        this.teams[1][this.members[1]],
      ];
      const who = this.characters[1];
      this.cpu.reset(CPU_TABLES[who], CPU_CONTROLS[who]);
    }
    const fighters = this.battle ? this.storyFighters() : this.entrants();
    fighters.forEach((f, i) => {
      f.stock = this.fighters[i].stock;
      f.power = this.fighters[i].power;
    });
    this.fighters = fighters;
    this.round++;
    this.ticks = 0;
    this.winner = null;
    this.picking = null;
    this.endingTicks = 0;
    this.roundTicks = 0;
    this.effects = [];
    this.freeing = [];
    this.kgt = [];
    this.layers = stageObjects(this.stage);
    this.hold(0x65, openingLife(this));
    this.freeze = 0;
    this.koStop = 0;
    this.quake.x = this.quake.y = null;
    this.camera = null;
    this.results = [];
    this.enemy = -1;
    this.enemyTicks = 0;
    this.clearInput();
  }

  // 0x4146d0 records each player's input word every tick, frozen or not.
  // The CPU clears its history first (0x411307, `clear`), then writes the
  // command it enters (commands.ts). Authored: the player's command keys do
  // the same, so a key enters its own command whatever was typed before it.
  private record(i: number, input: Input, clear = false) {
    const history = this.history[i];
    const f = this.fighters[i];
    const key = KEYS[f.who].find(
      ([control]) => input[control] && !this.previous[i][control],
    );
    if (key || clear) history.fill(0);
    if (key) [this.keyed[i], this.spent[i]] = [true, -1];
    // The word mirrors by +0xdf51 (0x414368), which the step's retarget turns
    // along with this tick's word (0x40e6df): it reads the nearest now.
    const target = this.nearest(f);
    const right = target ? f.x < target.x : f.toward === 1;
    const word = inputWord(input, right, f.who);
    history.push(word);
    history.shift();
    if (this.spent[i] >= 0) this.spent[i]++;
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
    const seats = this.fighters.map(() => 0);
    this.previous = seats.map(() => ({}));
    this.inputs = seats.map(() => ({}));
    this.history = seats.map(blankHistory);
    this.keyed = seats.map(() => false);
    this.spent = seats.map(() => -1);
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
  // 480 (0x407094) does for fighters centred on the stage. A story's set-up
  // centres it on every seat (0x408c1f).
  private view() {
    if (this.camera) return this.camera;
    if (!this.battle) return clampCamera(this.aim());
    const xs = this.fighters.map((f) => Math.trunc(f.x / 1.5));
    const x = Math.trunc(xs.reduce((a, b) => a + b) / xs.length) - 320;
    return clampCamera({ x, y: this.aim().y });
  }

  // The camera in a story (0x40b08a) follows the 1P's y halfway. With
  // letterings bit 2 its x moves halfway to the mean of the live players;
  // otherwise, the 1P alive, a quarter of the way to the midpoint of the 1P
  // and the mean of the live players who have entered, kept within 280 of
  // the 1P; with the 1P KO'd, a sixteenth of the way to that mean.
  private storyCamera(view: { x: number; y: number }) {
    const [one] = this.fighters;
    const half = (a: number, b: number) => Math.trunc((a + b) / 2);
    const px = (f: Fighter) => Math.trunc(f.x / 1.5);
    const y = half(Math.trunc(920 + one.y / 1.5) + view.y, -320);
    const live = this.fighters.filter((f) => f.hp && f.present);
    if (!live.length) return { x: view.x, y };
    const mean = Math.trunc(live.reduce((t, f) => t + px(f), 0) / live.length);
    if (this.battle!.letterings & 4) return { x: half(mean + view.x, -320), y };
    if (!one.hp)
      return { x: view.x + Math.trunc((mean - view.x - 320) / 16), y };
    const aim = Math.max(
      px(one) - 280,
      Math.min(px(one) + 280, half(mean, px(one))),
    );
    return { x: view.x + Math.trunc((aim - view.x - 320) / 4), y };
  }

  get cameraX() {
    return this.view().x * 1.5;
  }

  // A story step sets its own time (+6), or none (0x408c26).
  get seconds() {
    const time = this.battle ? this.battle.time || Infinity : 60;
    return this.mode === 'practice'
      ? Infinity
      : Math.max(0, time - Math.floor(this.ticks / 100));
  }

  get cameraY() {
    return (this.view().y - 480) * 1.5;
  }

  get resultReady() {
    // State 902 (0x40970a) ends a match as it would start another round,
    // once the transition's wait runs out, however the fighters stand.
    if (this.calls)
      return (
        this.winner !== null &&
        this.matchOver &&
        this.endingTicks >= this.roundEnd + NEXT_ROUND_TICKS
      );
    // Authored: free practice waits after the lettering for each fighter to
    // take its result or lie KO'd, as moves now run on past the round's end;
    // a KO timeline (KO_TIMELINES) once it stops moving on the floor: ZIRO's
    // in ko DOWN3, or standing in Random lose; or vanished there in make
    // hikari. A victim its settled holder still holds (+0x40 at -1) or
    // shocks never takes it.
    return (
      this.winner !== null &&
      this.endingTicks >= this.roundEnd &&
      this.fighters.every(
        (f) =>
          !f.present ||
          f.action === 'win' ||
          f.action === 'draw' ||
          (!f.pending &&
            (f.hitStop < 0 ||
              f.action === 'shock' ||
              f.action === 'musicAttack')) ||
          (f.action === 'koLand' && (!f.branch || settled(f))) ||
          (f.action === 'script' && f.hp === 0 && settled(f)),
      )
    );
  }

  // Op 0x1a's stops (0x413637 self, 0x4136ae other) reach a player and
  // every object following it (+0x28 bit 0x20000000, op 0x04 flag 0x20).
  // Each saves the player's input word this tick (0x413676, 0x413715).
  // Op 0x1a's stop for the others reaches every other player and the objects
  // following each (0x4136ae–0x413774).
  private pauseOthers(f: Fighter, ticks: number) {
    for (const other of this.fighters)
      if (other !== f && other.present) this.pause(other, ticks);
  }

  // Op 0x15 reaches the player +0xdef9's object belongs to, or with none its
  // target (0x413259–0x413278).
  private met(f: Fighter) {
    const { caught } = f;
    if (!caught) return f.target;
    return 'clip' in caught ? (this.fighters[caught.owner] ?? null) : caught;
  }

  // Whom a player's boxes and objects may strike (0x40f0ed–0x40f118): another
  // player it fights. The test of +0x60 is the owner's: a player's first step
  // (in every mode, 0–2) and its object's copy +0x156 there (0x411cb7,
  // 0x411f0c, 0x412218); the KGT's and stage's objects, at 0, hold no box.
  private hostile(owner: number, other: number) {
    return (
      owner !== other && Boolean((this.fighters[owner]?.enemies >> other) & 1)
    );
  }

  // Whether a CPU plays this player this tick (+0xdf5d).
  private driven(f: Fighter) {
    const i = this.fighters.indexOf(f);
    return i > 0 && this.cpuDriven && Boolean(this.cpus[i]);
  }

  // 0x40e5f7: the nearest other player by x it fights (+0xdfb7), not KO'd,
  // entered and shown.
  private nearest(f: Fighter) {
    const self = this.fighters.indexOf(f);
    let [distance, target] = [Infinity, null as Fighter | null];
    this.fighters.forEach((o, i) => {
      const near = Math.abs(o.x - f.x) < distance;
      if (o.hp && o.shown && this.hostile(self, i) && near)
        [distance, target] = [Math.abs(o.x - f.x), o];
    });
    return target;
  }

  // 0x40e7c0 queues the lose action as a loss empties life (0x40e84b), and in
  // a story scores the step's points (0x40e863): the 1P's KO gives its +0x13
  // to +0x12's player (0 the striker, +0xdef9's, n seat n − 1), another's its
  // slot's +0xf to that slot's +0x12; and that slot's KO bonus (bits 7–8)
  // gives its life and power (+0x10, +0x11) to the 1P (1) or the striker (2).
  private knockOut(f: Fighter) {
    this.queue(f, 'down');
    const { battle } = this;
    if (!battle) return;
    const slot = this.slots[this.fighters.indexOf(f)];
    const { caught } = f;
    const striker =
      caught && ('clip' in caught ? this.fighters[caught.owner] : caught);
    const pick = (n: number) =>
      n === 0 ? striker : n <= 8 ? this.bySeat(n - 1) : null;
    const scorer = pick(slot ? slot.scorer : battle.koScorer);
    if (scorer) scorer.points += slot ? slot.points : battle.koPoints;
    const bonus =
      slot && [null, this.fighters[0], striker][(slot.flags >> 7) & 3];
    if (!bonus) return;
    // The life, a signed byte (0x40e984), goes through the life routine
    // (0x40e7c0), which would take a loss or KO a taker at 0 for a bonus of
    // 0, but every story's is 30 to 100: a gain.
    gainLife(bonus, slot.life);
    addPower(bonus, slot.power);
  }

  // 0x40e5c0, on each step a stop or a queued action doesn't skip
  // (0x412518): the nearest becomes the player's target, and which side of
  // it the player is (+0xdf51) the way the free state faces; with no target
  // that stays as it was.
  private retarget(f: Fighter) {
    f.target = this.nearest(f);
    if (f.target) f.toward = f.x >= f.target.x ? -1 : 1;
  }

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
  private roll(who: Who, rolled: number | undefined): ObjectKey | null {
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
    // A neutral action takes its tests of a global first (export_fighter):
    // ZAKU's and PAC-HELO's of global 10 for 10, as story's select screen
    // leaves it, enter their mode select's stance from 通常立ち (PC 3), which
    // ends each tick back into neutral (PC 22), and from their turns
    // ボタンガード立ち (31, PCs 246, 250), which runs out.
    const test = neutralTestsOf(f.who)[action]?.find((e) =>
      this.passes(f, f, e),
    );
    if (test) return this.enterSource(f, test.action, test.offset);
    if (action !== 'jump') f.jump = 0;
    // KO Normal's PC 607 adds ten stop ticks to the other fighter.
    if (action === 'down') this.pauseOthers(f, 10);
    f.action = action;
    f.age = 0;
    f.connected = false;
    // Air reactions land straight into idle, as landing without a handler
    // clears the bits too (0x4124c3).
    if (neutralActions.has(action)) toNeutral(f);
    f.branch =
      branch === undefined ? this.roll(f.who, rolls(f.who)[action]) : branch;
    if (action === 'down') {
      f.branch ??= this.koTest(f);
      this.koFreeze(f);
    }
    f.copy = null;
    f.slideBase = 0;
    f.resume = undefined;
    if (action === 'getUp' && GET_UP_ROLLS.has(f.who))
      this.rollPass(f, twin(f.who, GET_UP), true);
    // 0x410d50 stops a player entering an action on the ground, and keeps an
    // airborne one's motion: Zoma's moves take this.
    const flying = action === 'script' && (f.y < 0 || f.vy !== 0);
    f.fired = -1;
    if (!flying) f.ax = 0;
    f.box = null;
    f.boxes = [];
    f.responses = [];
    f.bare = false;
    // 0x40e510 clears the handlers.
    f.onHit = f.onGuard = f.onLand = f.onWall = f.onClash = 0;
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
      // CHUCK HIT's op 0x01 drops its victim from rest at gravity 80
      // (Ryuko's PC 1730; every twin's alike), on the floor too, where it
      // sinks a tick's motion and lands at the next step (0x41187f). Op
      // 0x14 holds nothing (only op 0x07 sets +0x40), so Chuck Hit's (PC
      // 2765) runs it again for another tick before action 199 holds it;
      // one op 0x07 holds is stopped for good (0x40f963) and never moves.
      if (action === 'superHeld' && !f.held?.pose) {
        f.gravity = 80 * SOURCE_ACCELERATION_SCALE;
        f.moving = 'velocity';
      }
    } else if (f.gravity === 0) f.gravity = 0.24;
    if (action === 'down' || action === 'koAgain') {
      f.vx = 0;
      f.gravity = 0.24;
      f.moving = 0;
    }
  }

  // The action of a standing fighter's round result (+0xe007): 1 win (57),
  // or 3 draw (65), which the result states (0x409444, 0x409519) also give
  // the loser once the timer (0x470050) has run out. A story's may be 2, the
  // lose action (0x411038).
  private result(f: Fighter) {
    const index = this.fighters.indexOf(f);
    if (this.battle)
      return (['win', 'lose', 'draw'] as const)[this.results[index] - 1];
    return this.winner !== 'draw' &&
      (this.winner === 'player') === (index === 0)
      ? 'win'
      : 'draw';
  }

  // A result rolls its op 0x20s at their records (0x417a22), and takes its
  // op 0x1f tests of a player variable: G Suneo's 勝ち rolls into Random win
  // (52, PC 696), YINAN's tests variable 0 for Win 1 EX (81, PC 909). A
  // branch taken plays its target's timeline from there, its records at
  // once, rolling, testing, moving and setting handlers as it goes: TTRO's
  // WIN 2 (58) floats up at raw −200. Run out, it jumps on: Z-MEGA's
  // Shin-form Win2 (66) back into 勝ち + 9 (PC 634), YINAN's Stop (97) into
  // her draw + 14 (PC 1157). A draw moves by its own op 0x01s: ERUS's
  // hops (PC 701) and lands into its handler (67 + 18, PC 706).
  private rollResult(f: Fighter) {
    const result = f.action === 'win' || f.action === 'draw' ? f.action : null;
    const key = result
      ? (f.branch ?? RESULT_SCRIPTS[f.who][result])
      : f.action === 'koLand' && f.branch;
    if (!key || this.resultEvents(f, key, f.age)) return;
    // Its records at the tick it runs out run before its jump.
    const ran = f.branch && script(f.branch, f.who);
    // An EX stand returns into the call its demo stand's test jumped out of
    // (0x4125ea): YINAN's Win 2 and Win 3 (82, 90) call Demo Stand (36, PCs
    // 953, 1046), whose test of variable 0 for 100 (PC 543) enters her EX
    // stance (35), and GON's RANDOM WIN (68) Stand DEMO (31, PC 719), whose
    // test (PC 335) enters Stand DEMO 2 (32).
    if (
      ran &&
      ran.end === 'end' &&
      f.resume &&
      f.age === animationDuration(f.branch!, f.who)
    ) {
      const { clip, t, skip } = f.resume;
      [f.branch, f.age, f.resume] = [clip, t, undefined];
      this.resultEvents(f, clip, t, skip);
      return;
    }
    if (
      ran &&
      ran.end === 'jump' &&
      ran.next !== null &&
      f.age === animationDuration(f.branch!, f.who) &&
      this.enterResult(f, sourceKey(ran.next, ran.offset ?? 0))
    )
      return;
    if (f.vx || f.vy || f.y < 0) f.moving = 'velocity';
  }

  // A result timeline's records at `age`, past `skip`; true once one
  // branches.
  private resultEvents(f: Fighter, key: ObjectKey, age: number, skip = 0) {
    const owner = this.fighters.indexOf(f);
    // Its displays carry its sounds; one with none cues them here, as the
    // drawn branch does those past its last: ZIRO's KO voice (PC 829). A
    // result's clip carries its own.
    const { frames, end } = script(key, f.who);
    const carried = !frames.length
      ? 0
      : key === f.branch && end === 'jump'
        ? animationDuration(key, f.who)
        : Infinity;
    for (const event of eventsAt(key, age, f.who).slice(skip)) {
      if (
        event.op === 'motion' ||
        event.op === 'handler' ||
        event.op === 'stop' ||
        (event.op === 'sound' && event.t >= carried)
      )
        this.runEvent(f, owner, event);
      // SOU's demo stand checks his life (op 0x11, PC 308) into DEMO stand 3
      // (31) at 144 or less, before its EX test: his win and draw call it.
      if (event.op === 'life') {
        if (event.below ? f.hp > event.value : f.hp < event.value) continue;
        if (event.resume) f.resume = { clip: key, ...event.resume };
        if (this.enterResult(f, sourceKey(event.target, event.offset)))
          return true;
        continue;
      }
      if (event.op !== 'random' && event.op !== 'test') continue;
      // A drawn branch takes a test out of a call, returning into it; the
      // result's own clip draws its EX stands (exStands).
      if (
        event.op === 'random'
          ? this.cpu.random() % event.divisor <= event.above
          : event.called ||
            (event.resume && key !== f.branch) ||
            !this.passes(f, f, event)
      )
        continue;
      if (event.op === 'test' && event.resume)
        f.resume = { clip: key, ...event.resume };
      if (this.enterResult(f, sourceKey(event.action, event.offset)))
        return true;
    }
    return false;
  }

  // A branch with no display runs at once, on into its closing jump:
  // 3-TIMES's voice picks (94 + 6, ..., PCs 770–788) cue a sound and jump
  // to his stance (94 + 22). One that ends there keeps the fall-through.
  private enterResult(f: Fighter, key: ObjectKey): boolean {
    const { frames, end, next, offset = 0 } = script(key, f.who);
    if (frames.length) {
      [f.branch, f.age] = [key, 0];
      this.rollResult(f);
      return true;
    }
    if (this.resultEvents(f, key, 0)) return true;
    return (
      end === 'jump' &&
      next !== null &&
      this.enterResult(f, sourceKey(next, offset))
    );
  }

  // Ryuko's KO Normal tests global 3 for 0 (PC 597), jumping to + 5 past
  // setting variable 3 to 100 (PC 598) outside a story; enter runs the
  // records before the test, as before a roll.
  private koTest(f: Fighter) {
    const ko = twin(f.who, LOSE + 1);
    const test = script(ko, f.who).events.find(
      (e) => !e.t && e.op === 'test' && e.action === ko && this.passes(f, f, e),
    );
    return test?.op === 'test' ? sourceKey(test.action, test.offset) : null;
  }

  // KO Normal's freeze (global 6) at the fighter's age, from the timeline
  // it draws: Ryuko's adds 10 (PC 606), then 40 at age 5 (PC 610). ASURA's
  // voice roll (PC 416) jumps past its 10 to + 15 (PC 418) when it fails.
  private koFreeze(f: Fighter) {
    let key: ObjectKey = f.branch ?? twin(f.who, LOSE + 1);
    const { end, next, offset = 0 } = script(key, f.who);
    if (!animationDuration(key, f.who) && end === 'jump' && next !== null)
      key = sourceKey(next, offset);
    for (const event of eventsAt(key, f.age, f.who))
      if (event.op === 'freeze') this.freeze += event.add;
  }

  // KO Normal (60) holds both fighters 40 ticks at age 5 (PC 611) and
  // launches at age 14 (PC 617); KO NORMAL 2nd (61) launches at age 6 (PC
  // 631). Each lands into KO DOWN (62), which slides back for ten ticks
  // (PCs 641–644; Amiro's 63 for 12, PCs 710–714), then lies while the round
  // is over (PC 645). RARIO's launch straight up at −1820 (PCs 487, 500),
  // and his KO down (54) sinks through the floor in its displays (PCs
  // 509–516) without sliding; TRAINING's alike (PCs 400, 413, 423–430).
  private moveKO(f: Fighter) {
    if (f.action === 'koLand' && f.branch) {
      this.rollResult(f);
      return true;
    }
    if (f.action === 'koLand') {
      this.slideDown(f);
      return true;
    }
    const launch = f.action === 'down' ? 14 : f.action === 'koAgain' ? 6 : 0;
    if (!launch) return false;
    if (f.action === 'down' && f.age === 5) {
      this.koFreeze(f);
      this.koStop += 40;
    }
    if (f.age === launch) {
      const straight = STRAIGHT_KO.includes(f.who);
      f.vx = straight ? 0 : -f.facing * 500 * SOURCE_VELOCITY_SCALE;
      f.vy = (straight ? -1820 : -1520) * SOURCE_VELOCITY_SCALE;
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
      f.age >= animationDuration(f.action, f.who)
    )
      this.action(f, 'getUp');
  }

  // GIANT!! MUSIC ATTACK (133) loops until another action takes the victim,
  // each pass first running its records: Ryuko's rolls rand() % 31 > 1 to
  // jump past its sound (PCs 1803–1807); Giant's spawns love heart (440, PC
  // 1944). MASA's and 3-TIMES's roll rand() % 3 > 1 (PCs 2036, 1936) past a
  // voice that a chain of rolls picks (PCs 2040–2061, 1940–1961), each pick
  // jumping on into their call of its two displays.
  private musicAttack(f: Fighter) {
    if (f.action !== 'musicAttack') return false;
    if (f.age % animationDuration('musicAttack', f.who)) return true;
    this.rollPass(f, twin(f.who, 133));
    return true;
  }

  // A pass's first records (or only its sounds), through its rolls and its
  // jumps with no display.
  private rollPass(f: Fighter, key: ObjectKey, sounds = false): void {
    const { events, frames, end, next, offset = 0 } = script(key, f.who);
    for (const event of events) {
      if (event.t) return;
      if (event.op === 'random') {
        if (this.cpu.random() % event.divisor > event.above)
          return this.rollPass(
            f,
            sourceKey(event.action, event.offset),
            sounds,
          );
      } else if (!sounds || event.op === 'sound')
        this.runEvent(f, this.fighters.indexOf(f), event);
    }
    if (!frames.length && end === 'jump' && next !== null)
      this.rollPass(f, sourceKey(next, offset), sounds);
  }

  // Each jump's own op 0x01: Ryuko's up at raw −1450, forward and back at
  // ±400 and −1400, under gravity 80 (PCs 54, 69, 84); 3-TIMES's at −1650
  // under 100. ALPHA's then rolls rand % 3 > 1 past his voice (PCs 51, 83,
  // 108; 66 yowai), which jumpClips leaves to it.
  private launchJump(f: Fighter) {
    const index = CHARACTERS[f.who].jumps[f.jump];
    const { events } = script(yowai(f) ? yowaiKey(index, f.who) : index, f.who);
    const launch = events.find((event) => event.op === 'motion');
    if (launch?.op === 'motion') motion(f, launch);
    f.airAge = 0;
    const at = events.findIndex((e) => e.op === 'random' && e.t === launch?.t);
    const roll = events[at];
    if (roll?.op === 'random' && this.cpu.random() % roll.divisor <= roll.above)
      for (const event of skippedBy(events, at))
        this.runEvent(f, this.fighters.indexOf(f), event);
  }

  // Chuck 消える (143) holds its blank display for 100 ticks, then jumps into
  // rambu AIR (122, PC 1965), running its first records at once.
  private vanish(f: Fighter) {
    if (f.action !== 'vanish') return false;
    if (f.age >= animationDuration('vanish', f.who)) {
      this.queue(f, 'rushAirHit');
      this.enterPending(f);
    }
    return true;
  }

  // GON MISS (137) floats until its display ends (PC 1873). Then its op
  // 0x15 (PC 1874) takes 40 life from the victim and adds 5 power to it and
  // 3 to the striker; ALPHA's and ZENKA's take 40 more unless their yowai
  // form holds variable 14 at 10 (PCs 2570–2571, 2110–2111). PC 1875 jumps
  // into HISA (80), running its first records at once: 13 stop ticks for
  // both and its own power. Life that runs out queues the lose action.
  private gonMiss(f: Fighter) {
    const end = animationDuration('gonMiss', f.who);
    if (f.action !== 'gonMiss' || f.age < end) return false;
    const striker = this.met(f);
    for (const event of script(twin(f.who, GON_MISS), f.who).events) {
      if (event.t !== end) continue;
      if (event.op === 'test' && this.passes(f, f, event)) break;
      if (event.op !== 'power') continue;
      const damage = loseLife(f, -event.selfLife);
      if (striker) striker.damage += damage;
      addPower(f, event.selfPower);
      if (striker) addPower(striker, event.otherPower);
    }
    this.queue(f, 'launchAway', 13, 13);
    this.enterPending(f);
    if (f.hp === 0) this.knockOut(f);
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
    const slide =
      (clipEx(f) && EX_SLIDES[f.who]?.[f.action]) ||
      (OWN_SLIDES[f.who]?.[f.action] ?? reactionSlides[f.action]);
    if (slide) {
      if (
        f.age >=
        (slide.until ?? animationDuration(f.action as AnimatedAction, f.who))
      )
        f.vx = 0;
      else if (f.age >= slide.start) {
        f.vx =
          f.facing *
          ((slide.velocity + f.slideBase) * SOURCE_VELOCITY_SCALE +
            (f.age - slide.start + 1) *
              slide.acceleration *
              SOURCE_ACCELERATION_SCALE);
        f.moving = f.vx;
      } else if (f.slideBase)
        f.moving = f.vx = f.facing * f.slideBase * SOURCE_VELOCITY_SCALE;
    }
    this.slideDown(f);
  }

  // Down normal and Chuck DOWN DOWN (146, 147; PCs 1985, 2001), every
  // player's, and KO DOWN (62, PC 641) slide back at raw −200 for their first
  // 10 ticks, Amiro's KO DOWN for 12 (PCs 710–714), from the tick they're
  // entered, a landing's too: the landing step enters them before the motion
  // pass (0x412564).
  private slideDown(f: Fighter) {
    const ticks =
      f.action === 'knockdown' || f.action === 'bounceDown'
        ? 10
        : f.action === 'koLand' && !f.branch && !STRAIGHT_KO.includes(f.who)
          ? f.who === 'amiro'
            ? 12
            : 10
          : 0;
    if (f.age < ticks) f.moving = -f.facing * 200 * SOURCE_VELOCITY_SCALE;
  }

  // A victim follows its holder's script until an action is queued for it
  // (0x412331), by the holder's op 0x14 or a strike, whatever the holder
  // does meanwhile: one op 0x07 holds stays stopped (+0x40 at -1, 0x412397),
  // and HIT SHOCK INFIN (88) and GIANT!! MUSIC ATTACK (133) loop.
  private holdVictims() {
    this.fighters.forEach((target) => {
      if (target.pending) return;
      // No op 0x07 holding it, CHUCK HIT runs its 10- and 30-tick displays
      // (Ryuko's PCs 1733, 1737; every twin's alike) out into neutral
      // (0x4126de): KATE's Dash att Hit (245) never holds its victim.
      if (
        target.action === 'superHeld' &&
        !target.held?.pose &&
        target.age >= animationDuration('superHeld', target.who) &&
        !this.runOut(target)
      )
        this.action(target, 'idle');
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
  // source action runs its timeline. A reaction entered so runs its op
  // 0x15 power and op 0x1a stops; export_fighter checks no offset goes past
  // its first display.
  private enterSource(f: Fighter, index: number, offset = 0) {
    const ryuko = twinOf(f.who, index) ?? 0;
    const named =
      (offset ? undefined : NEUTRAL[f.who][index]) ??
      (ryuko === KNOCKDOWN
        ? 'knockdown'
        : ryuko === GET_UP
          ? 'getUp'
          : ryuko === FLY_SIDE_WALL
            ? 'flySideWall'
            : RESPONSE_REACTIONS[ryuko]?.action);
    const key = sourceKey(index, offset);
    if (named) {
      this.action(f, named, true);
      // Its records before its first display run as it is entered
      // (0x412564): Giant's K3 hit (197) ends in his own HISA (84, PC 2843),
      // whose op 0x15 credits the opponent 5 and op 0x1a stops both 13 (PCs
      // 890, 893). An offset past them skips them, as Drop P lend's TWIS
      // HIT + 12 (90, PC 5137) does.
      if (exported(key, f.who))
        for (const event of script(key, f.who).events)
          if (!event.t && (event.op === 'power' || event.op === 'stop'))
            this.runEvent(f, this.fighters.indexOf(f), event);
      // Clothes off runs out into FLY NO HIT + 19 (PC 1267), past its
      // displays to its launch (PC 1186), entered at that age
      // (export_fighter checks every player's).
      if (named === 'fly' && offset) {
        f.age = launchMotion.fly!.tick;
        this.moveLaunch(f);
      }
      return;
    }
    // A target one past its action's end runs out at once (0x4125ea): DIDO's
    // >HE300 Hit5 lands in en300 hit + 28 (slot 1, PC 5047), so she stands;
    // RARIO 1UP (117) has no display, so its op 0x15 runs and it runs out.
    // Both in the step that enters it: a landing or handler zeroes the wait
    // (+0x3c), and the record loop then meets the end first (0x4125bc).
    if (!animationDuration(key, f.who) && script(key, f.who).end === 'end') {
      for (const event of script(key, f.who).events)
        this.runEvent(f, this.fighters.indexOf(f), event);
      if (!this.runOut(f)) this.action(f, 'idle');
      return;
    }
    this.action(f, 'script', true);
    f.branch = key;
    this.fireEvents(f);
    // One with no display runs on through its last op 0x0a in the same step:
    // GIGI's 技名11 (285), his Air Bike K's landing (slot 1, PC 4353), spawns
    // Fly bike (284, PC 4517) and enters Dragon lend (240, PC 4518).
    const { end, next, offset: at = 0 } = script(key, f.who);
    if (
      f.action === 'script' &&
      f.branch === key &&
      end === 'jump' &&
      next !== null &&
      !animationDuration(key, f.who)
    )
      this.enterSource(f, next, at);
  }

  // A handler's target, "action+offset" entering mid-action.
  private enterKey(f: Fighter, key: ObjectKey) {
    const [index, offset = 0] = String(key).split('+').map(Number);
    this.enterSource(f, index, offset);
  }

  // A jump to another timeline (ops 0x16, 0x1f, 0x20 and 0x24) runs its
  // first records at once, in place of the rest of this step's. The step's
  // record loop gives up past 300 records (0x4125c0), deleting the object
  // (0x413b7b, 0x40e4a0) with a ScriptMainLoopError: RARIO's Team VS 1P 270
  // (40) jumps to itself while his life is below 180 (PC 350), where his
  // other checkers jump on to the next. ponytail: it counts chained jumps,
  // each two records at the least, not records; a fighter, whose own
  // deletion the port can't play, stays where it is.
  private branchTo(actor: Fighter | Effect, key: ObjectKey): boolean {
    if (this.jumps === 150) {
      if ('clip' in actor) this.delete(actor);
      return true;
    }
    this.jumps++;
    try {
      return this.jump(actor, key);
    } finally {
      this.jumps--;
    }
  }

  private jump(actor: Fighter | Effect, key: ObjectKey) {
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
      // The record loop runs on through one with no display in the same step
      // (0x4125e8), as an entered one does (enterSource): in a TEAM VS round
      // after his win SEAN's Team VS Start (37) finds his variable 15 set
      // (PC 406), and Skill7 (39) clears it and globals 8 and 9 (PCs
      // 453–455), then jumps past 開始時's end (PC 456): he stands at once.
      const { end, next, offset = 0 } = script(key, actor.who);
      if (
        actor.action !== 'script' ||
        actor.branch !== key ||
        animationDuration(key, actor.who)
      )
        return true;
      if (end === 'end' && !this.runOut(actor)) this.action(actor, 'idle');
      if (end === 'jump' && next !== null)
        this.enterSource(actor, next, offset);
    }
    return true;
  }

  // Op 0x1f's checks (0x4137a4) of the actor's own variables (below selector
  // 0x40), player variables (0x40 up), globals (0x80 up) and global 6 (the
  // freeze), which `pre` sets or adds to first (0x4138df): == (1), > (2) or
  // < (3).
  private passes(
    self: Fighter,
    actor: Fighter | Effect,
    { selector, compare, value, pre }: Extract<SourceEvent, { op: 'test' }>,
  ) {
    // Each 開始時 copies the round (0x470044) into its variable 1 first, and
    // YINAN's Flash Att its own x in source pixels ([esi + 8] >> 16), as
    // ANMC P's HUD face object does into global 7 (PC 738).
    if (pre) {
      const set = pre.round
        ? { value: this.round, add: false }
        : pre.x
          ? { value: Math.floor(actor.x / 1.5), add: false }
          : pre;
      const write = (old = 0) =>
        set.add
          ? Math.max(-30000, Math.min(30000, old + set.value))
          : set.value;
      if (selector < 0x40) this.setLocal(actor, selector, set);
      else if (selector === 0x86) this.freeze = write(this.freeze);
      else if (selector < 0x80)
        self.variables[selector & 0x3f] = write(
          self.variables[selector & 0x3f],
        );
      else this.globals[selector & 0x3f] = write(this.globals[selector & 0x3f]);
    }
    const variable =
      selector < 0x40
        ? (actor.locals[selector] ?? 0)
        : selector === 0x86
          ? this.freeze
          : selector >= 0x80
            ? (this.globals[selector & 0x3f] ?? 0)
            : (self.variables[selector & 0x3f] ?? 0);
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
      else if (this.passes(this.fighters[owner], actor, event))
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
    // Ops 0x07, 0x14 and 0x15 reach +0xdef9's player (met). A stage's
    // objects have no player.
    const other = self && this.met(self);
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
        // A zero width or height clears the slot (0x412cfc, 0x412d0f).
        const box =
          event.w && event.h
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
        // arms its cancel counter by kind bit 0 (0x412d24): ERUS's K3 (196)
        // strikes with kind 0 (PC 2729), so its hit never opens its window (PC
        // 2708).
        if (box && !('clip' in actor)) {
          actor.contact = box.kind & 1;
          if (box.kind & 2) actor.connected = false;
        }
        break;
      }
      case 'responses':
        actor.responses = event.ids;
        break;
      case 'stop':
        this.pauseOthers(self, event.other);
        if (actor === self) this.pause(self, event.self);
        break;
      case 'freeze':
        this.freeze = (event.set ? 0 : this.freeze) + event.add;
        break;
      case 'global':
        this.globals[event.index] = event.add
          ? Math.max(
              -30000,
              Math.min(30000, this.globals[event.index] + event.value),
            )
          : event.value;
        break;
      // Action 0 clears the slot (0x40f6e6 tests it): LIZARD's SHOOT OBJ
      // EXPLO (290) clears its own (PCs 3940–3942) before it strikes. Slot 5
      // (+0x74) is the box-against-box pass's (clashBoxes): Kiki's potatoes
      // (189, 190) enter POTETO HIT (194, 195), TTRO's P (166) P gard (167).
      case 'handler':
        if (!('clip' in actor)) {
          const key = event.action && sourceKey(event.action, event.offset);
          if (event.slot === 1) actor.onLand = key;
          else if (event.slot === 2) actor.onHit = key;
          else if (event.slot === 3) actor.onGuard = key;
          else if (event.slot === 4) actor.onWall = key;
          else if (event.slot === 5) actor.onClash = key;
        } else {
          const field = (
            { 1: 'onLand', 2: 'onHit', 3: 'onGuard', 5: 'onClash' } as const
          )[event.slot as 1 | 2 | 3 | 5];
          if (field)
            actor[field] = event.action
              ? sourceKey(event.action, event.offset)
              : undefined;
        }
        break;
      case 'call':
        this.runCall(actor, owner, event.action);
        break;
      // An object and Zoma take their checks' jumps; Ryuko's are his
      // entry's.
      case 'test':
        // A fighter's that jump out of a call are only demo stands' tests
        // of variable 0, which set-up clears before each 開始時; a result
        // takes them in its drawn branches (resultEvents).
        if (event.resume && !('clip' in actor)) break;
        if (
          ('clip' in actor || actor.action === 'script') &&
          this.passes(self, actor, event)
        ) {
          if (event.resume && 'clip' in actor)
            actor.resume = { clip: actor.clip, ...event.resume };
          return event.rewind
            ? this.rewind(actor, owner, event.rewind)
            : event.called
              ? this.rejoin(actor, owner, event)
              : this.branchTo(actor, sourceKey(event.action, event.offset));
        }
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
        // Both bring the holder 1 in front of its plane's priority and the
        // target 1 behind with flag bit 0, the other way round without
        // (0x412eba, 0x413065), and clear the holder's boxes (0x40e550; the
        // export drops its bodies). On an object they place it as they would
        // the player, op 0x07 zeroing its motion (0x412f66) and stopping it
        // for good (+0x40 at -1, which only the step reads, 0x412397), then
        // skip the player's pose and response (0x412f72, 0x41310f).
        this.seize(self, event.flags);
        if (self.caught && 'clip' in self.caught) {
          this.placeHeld(self, self.caught, event);
          Object.assign(self.caught, {
            vx: 0,
            vy: 0,
            ax: 0,
            gravity: 0,
            hitStop: -1,
          });
          break;
        }
        if (!other || !this.struck(self, other)) break;
        other.held = {
          pose: event.pose,
          flags: event.flags,
          x: event.x,
          y: event.y,
        };
        // The hold replaces the victim's stop (+0x40 at -1, 0x41303a) and
        // zeroes its motion (0x412f66). It clears the victim's boxes and
        // bodies (0x40e550) and op 0x17 responses (+0x129, 0x40e540): no box
        // strikes it, nor does it push, until it enters another action.
        other.hitStop = -1;
        Object.assign(other, { vx: 0, vy: 0, ax: 0, gravity: 0, moving: 0 });
        Object.assign(other, { box: null, boxes: [], responses: [] });
        other.bare = true;
        this.placeHeld(self, other);
        break;
      case 'apply': {
        this.seize(self, event.flags);
        if (self.caught && 'clip' in self.caught) {
          this.placeHeld(self, self.caught, event);
          break;
        }
        // REAR's 255 applies Chuck OGI BALL (response 62, Ryuko's 138),
        // which the victim plays from its own timeline (ownTimeline).
        if (!other) break;
        const own = responsesOf(other.who)[event.response];
        const reaction = RESPONSE_REACTIONS[twinOf(other.who, own) ?? 0];
        const timeline = reaction
          ? undefined
          : ownTimeline(other.who, event.response);
        if ((!reaction && !timeline) || !this.struck(self, other)) break;
        other.held = { pose: 0, flags: event.flags, x: event.x, y: event.y };
        this.placeHeld(self, other);
        // Like a contact it queues the reaction (0x413136), and it clears
        // the victim's stop (0x413147).
        other.hitStop = 0;
        if (timeline) {
          other.pending = { key: timeline };
          break;
        }
        this.queue(
          other,
          reaction!.action,
          reaction.stop,
          reaction.attackerStop ?? reaction.stop,
          0,
          own,
        );
        break;
      }
      case 'power':
        // 0x40e7c0 changes the player's own life as it does the opponent's
        // (0x41323a, 0x413298), a gain up to full life (0x40ea9f): Yo's
        // ZOMBI WALK bite, 2 a pass through ZOMBI RP (PC 3056), then 6 (PC
        // 3011). SWW's Roll Crash hit takes 1000 from both (PC 5957), his
        // own first: a double KO. TRAINING's K refills the opponent's life
        // (PC 1633), his P takes 100 (PC 1629) and his chuck KOs himself
        // (PC 1662).
        if (event.selfLife > 0) gainLife(self, event.selfLife);
        if (event.selfLife < 0) {
          loseLife(self, -event.selfLife);
          if (self.hp === 0) this.knockOut(self);
        }
        if (!other) {
          addPower(self, event.selfPower);
          break;
        }
        if (event.otherLife > 0) gainLife(other, event.otherLife);
        if (event.otherLife < 0) {
          const damage = loseLife(other, -event.otherLife);
          self.hits++;
          self.damage += damage;
          if (other.hp === 0) this.knockOut(other);
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
      case 'local':
        this.setLocal(actor, event.index, event);
        break;
      // Ops 0x10 and 0x11 (0x413500, 0x413164) jump to their target on too
      // little stock, which otherwise pays the super, or past a life
      // threshold. Op 0x10 without r[5] bit 0 (0x4135eb) jumps on enough
      // stock instead and pays nothing (EX Ch, PC 2861). An object's op 0x11
      // reads its player's life (+0xdf05): OBJ TO SHIN HP0 holds Z-MEGA's
      // drain at 1 (PC 2422).
      case 'stock':
        if ('clip' in actor || actor.action !== 'script') break;
        if (event.atLeast) {
          if (self.stock >= event.min)
            return this.branchTo(actor, sourceKey(event.target, event.offset));
          break;
        }
        if (self.stock <= event.min)
          return this.branchTo(actor, sourceKey(event.target, event.offset));
        self.stock = Math.max(
          0,
          Math.min(stocksOf(self.who), self.stock + event.add),
        );
        if (self.stock === stocksOf(self.who)) self.power = 0;
        break;
      case 'life':
        if (
          ('clip' in actor || actor.action === 'script') &&
          event.target &&
          (event.below ? self.hp <= event.value : self.hp >= event.value)
        )
          return this.branchTo(actor, sourceKey(event.target, event.offset));
        break;
      case 'screen':
        // Op 0x0e flag 1 (0x41330b) starts the owner's fader from the
        // actor's colour, and flag 2 (0x41336c) that of the player whatever
        // +0xdef9 holds belongs to from 0: OS FENG's New Chuck Hit (231)
        // tints his catch blue (PC 3089). ponytail: flags 4 and 8 (global
        // faders, 0x4133cd–0x413481) are left out: no player's records use
        // 8, and 4 only fades the round intro's screen fader from 0 to 0
        // (PCs 303, 327).
        if (event.fader) {
          const { type, r, g, b, fade, ticks, flags } = event.fader;
          const fader = (start: Omit<Color, 'mode'>): Fader => ({
            type,
            start,
            target: { r, g, b, fade },
            left: ticks,
            ticks,
          });
          const { color } = actor;
          if (flags & 1)
            self.fader = fader({
              r: color.r,
              g: color.g,
              b: color.b,
              fade: color.fade,
            });
          const { caught } = self;
          if (flags & 2 && caught)
            ('clip' in caught ? this.fighters[caught.owner] : caught).fader =
              fader({ r: 0, g: 0, b: 0, fade: 0 });
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
        return event.called
          ? this.rejoin(actor, owner, event)
          : this.branchTo(actor, sourceKey(event.action, event.offset));
    }
    return false;
  }

  // Op 0x1f sets an object's own variable, or adds to it within ±30000
  // (0x4138f0–0x41391d).
  private setLocal(
    actor: Fighter | Effect,
    index: number,
    { value, add }: { value: number; add: boolean },
  ) {
    actor.locals[index] = add
      ? Math.max(-30000, Math.min(30000, (actor.locals[index] ?? 0) + value))
      : value;
  }

  // A roll or test in a call jumps within the called action, rejoining this
  // path at its next display (Giant's super base ball picks a ball, PC 5358):
  // the target's records up to there replace this tick's rest. A test whose
  // target comes within the tick passes over the tick's events up to it
  // instead (ALPHA's No super rp skips its power, PC 4475).
  private rejoin(
    actor: Fighter | Effect,
    owner: number,
    event: Extract<SourceEvent, { op: 'test' | 'random' }>,
  ) {
    if ('skip' in event && event.skip !== undefined) {
      const tick = eventsAt(
        'clip' in actor ? actor.clip : timeline(actor),
        actor.age,
        actor.who,
      );
      const at = tick.indexOf(event as ScriptEvent);
      if (at < 0) throw new Error(`Skip outside its tick: ${actor.who}`);
      for (const next of tick.slice(at + 1 + event.skip))
        if (this.runEvent(actor, owner, next)) break;
      return true;
    }
    for (const next of script(sourceKey(event.action, event.offset), actor.who)
      .events) {
      if (next.t) break;
      this.runEvent(actor, owner, next);
    }
    return true;
  }

  // A test in a call that jumps back within the called action keeps the call
  // (0x4125ea): the timeline goes back to its target's tick, running that
  // tick's events from the target on at once, so an object's Beam Obj 0.5
  // waits out the freeze (YINAN's PC 8215).
  private rewind(
    actor: Fighter | Effect,
    owner: number,
    { t, skip }: { t: number; skip: number },
  ) {
    // One back into its own tick spins out the step's 300 records, which
    // deletes an object (branchTo): KATE's *ATT HANDEN RP while frozen (PC
    // 4287). The exporter checks no events precede it.
    if (t === actor.age) {
      if ('clip' in actor) this.delete(actor);
      else actor.age = actor.fired = t - 1;
      return true;
    }
    const key = 'clip' in actor ? actor.clip : timeline(actor);
    actor.age = t;
    if (!('clip' in actor)) actor.fired = t;
    rearm(actor, key, t);
    for (const next of eventsAt(key, t, actor.who).slice(skip))
      if (this.runEvent(actor, owner, next)) break;
    return true;
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

  // Ops 0x07 and 0x14 on whatever +0xdef9 holds, before either acts.
  private seize(self: Fighter, flags: number) {
    if (!self.caught) return;
    const front = flags & 1 ? 1 : -1;
    self.z = FIGHTER_Z + front;
    self.caught.z = FIGHTER_Z - front;
    Object.assign(self, { box: null, boxes: [] });
  }

  // Ops 0x07 (0x412e93) and 0x14 (0x413057) reach the player this one's
  // last contact joined it to (+0xdef9), held, KO'd or not: DST juggles its
  // tossed victim, and GON's Kuren under seizes whoever struck him.
  private struck(self: Fighter, target: Fighter) {
    return (
      this.catchHeld(target) ||
      (self.caught === target && Boolean(markHeld(target)))
    );
  }

  // Ops 0x07 and 0x14, and a flag-0x10 hold's motion step, place the victim
  // from the holder past walls and floor alike; its own motion step then
  // clamps it to the walls (settle).
  private placeHeld(
    holder: Fighter,
    target: Fighter | Effect,
    held: Pick<
      NonNullable<Fighter['held']>,
      'flags' | 'x' | 'y'
    > | null = 'clip' in target ? null : target.held,
  ) {
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
      for (const e of this.effects)
        if (e.owner === owner && e.slot === event.slot) this.delete(e);
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
    this.take(child);
  }

  private take(child: Effect) {
    child.index = firstFree(this.taken());
    // 0x406570 takes the first free slot and runs no script: the object
    // first steps in the next tick's pass (stepObjects), which lists only the
    // objects alive at its start. A follower keeps to its spawner's slot
    // (+0x17a, 0x40f99b), so one that met its parent's slot freed follows
    // the object taking it: ZENKA's 328 and 329, stopped past their 255's
    // end, follow the 303 taking its slot. ponytail: a KGT object taking one
    // (hold) has no place in the port, so its follower keeps to the parent's.
    for (const e of [...this.layers, ...this.effects])
      if (e.follow && 'index' in e.follow.parent)
        if (e.follow.parent.index === child.index) e.follow.parent = child;
    const list = child.stage ? this.layers : this.effects;
    const at = list.findIndex((e) => e.index > child.index);
    list.splice(at < 0 ? list.length : at, 0, child);
  }

  // A player's motion step (0x40fa09–0x40fc9f) adds its transfer (+0xdf49),
  // then clamps it to the walls. Reeling from a strike and not KO'd, it hands
  // the distance the walls stopped to the striker's owner (0x40fb08), unless
  // the striker is reeling from a hit itself (0x40faf0); guarding, it still
  // takes it. An object striker's bits stay clear, so its owner always does.
  // Fighter 1 moves it this tick, fighter 0 the next.
  private settle(f: Fighter, walled = false) {
    const other = this.met(f);
    f.x += f.transfer;
    f.transfer = 0;
    // 0x40fa29: a hold with flag 0x10 places its victim here, before the
    // holder's walls, until op 0x14 clears it (0x41314c). A victim moving
    // later in the pass clamps itself; fighter 0 stays where it is put.
    if (
      other?.action === 'superHeld' &&
      !other.pending &&
      (other.held?.flags ?? 0) & 0x10
    )
      this.placeHeld(f, other);
    walled = placeX(f, f.x) || walled;
    // 0x40fcab: stopped by a wall, a player with a wall handler (op 0x02 slot
    // 4, +0x70) queues its action (+0x38), over a reaction this tick's
    // contacts queued: a flight's, or a move's, as Yo's Press Hit carrying
    // its victim (PC 3291).
    const wall = launchMotion[f.action]?.wall;
    if (walled && wall) this.queue(f, wall);
    else if (walled && f.action === 'script' && f.onWall)
      f.pending = { key: f.onWall };
    const by = f.striker ? f.struckBy : null;
    const reeling = f.striker === 'body' && ((by?.reaction ?? 0) & 12) === 8;
    if (f.hp > 0 && f.reaction & 8 && by && !reeling) by.transfer += f.stopped;
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

  // The pass then moves each unstopped object, the stage's too, in table
  // order, and one following its parent takes the parent's position plus its
  // offset, mirrored by the parent's facing, stopped or not
  // (0x40f992–0x40f9d9). A parent later in the table hasn't moved yet, so
  // its follower keeps to where it was: Giant's 435 trails his 369 by a tick.
  private moveObjects() {
    const objects = [...this.layers, ...this.effects].sort(
      (a, b) => a.index - b.index,
    );
    for (const e of objects) {
      if (e.hitStop === 0) {
        e.vx += e.ax;
        e.vy += e.gravity;
        e.x += e.vx;
        e.y += e.vy;
      }
      if (e.follow) {
        const { parent, x, y } = e.follow;
        e.x = parent.x + parent.facing * x * 1.5;
        e.y = parent.y + y * 1.5;
      }
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
    // A result lands into its handler, whose records run at once: Z-MEGA's
    // Random win1 (53) into 53 + 4.
    if (
      f.action === 'win' ||
      f.action === 'draw' ||
      (f.action === 'koLand' && f.branch)
    ) {
      f.gravity = 0;
      if (f.onLand) [f.branch, f.age, f.onLand] = [f.onLand, 0, 0];
      this.rollResult(f);
      return true;
    }
    // CHUCK HIT's landing handlers enter 128 + 11 (PC 1729) or, once its
    // first display has run out, + 15 (PC 1734): the display it lands in,
    // again. The controller lands it before the display counts (0x41251d),
    // and the landing zeroes its gravity (0x411894).
    if (f.action === 'superHeld') {
      const first = animationFrame('superHeld', 0, f.who).duration;
      f.gravity = 0;
      f.age = f.age > first ? first : 0;
      return true;
    }
    f.gravity = 0.24;
    if (f.action === 'down' || f.action === 'koAgain') {
      if (KO_SCRIPTS.has(f.who)) {
        this.enterSource(f, twin(f.who, KO_DOWN));
        return true;
      }
      const timeline = KO_TIMELINES.has(f.who) && twin(f.who, KO_DOWN);
      this.action(f, 'koLand', false, timeline || undefined);
      if (f.branch) this.rollResult(f);
      this.slideDown(f);
      return true;
    }
    f.variables[1] = 0;
    const launch = launchMotion[f.action];
    if (launch) {
      this.action(
        f,
        f.action === 'slamBounce' && !BOUNCE_DOWN.includes(f.who)
          ? 'knockdown'
          : launch.land,
      );
      this.slideDown(f);
    }
    // The air reactions have no handler; the free state reads commands on
    // the same tick.
    else if (AIR_REACTIONS[f.action]) {
      this.action(f, 'idle');
      return false;
    } else {
      markActing(f);
      if (f.onLand) this.enterKey(f, f.onLand);
      else this.action(f, 'land');
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
    f.contact = f.struck = 0;
    if (f.y < 0) {
      this.fall(f);
      return true;
    }
    f.vx = f.vy = 0;
    return false;
  }

  // Airborne, return to neutral enters the default-action table's fall, word
  // 6 (+0x7586, 0x411a80), which the port draws as a jump. 0x410cf0 keeps the
  // motion, and its op 0x01 (Ryuko's PC 99, flags 0xe) keeps vx, vy and ax
  // and sets its own gravity: 80, MASA's 120, ZENKA's 60, or 80 in her
  // yowai form (PC 172). Its landing handler is the jump's, but RARIO's and
  // TRAINING's crouch (12).
  private fall(f: Fighter) {
    const { ax } = f;
    const { fall } = CHARACTERS[f.who];
    this.action(f, 'jump');
    [f.jump, f.ax, f.airAge, f.moving] = [3, ax, 0, 'velocity'];
    for (const event of script(yowai(f) ? yowaiKey(fall, f.who) : fall, f.who)
      .events)
      if (event.op === 'motion' || event.op === 'handler')
        this.runEvent(f, this.fighters.indexOf(f), event);
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
  // Each player it may strike, in slot order, meets the first box that
  // reaches it (0x40f0d0): a box takes every victim it reaches that tick.
  private boxContact(source: Fighter | Effect, owner: number) {
    if (source.connected) return [];
    return this.fighters.flatMap((target, i) =>
      this.hostile(owner, i) && target.shown
        ? this.contact(source, owner, target)
        : [],
    );
  }

  private contact(source: Fighter | Effect, owner: number, target: Fighter) {
    const attacker = this.fighters[owner];
    const box = [source.box, ...source.boxes].find(
      (box) =>
        box &&
        !skips(box, target) &&
        struck(this.origin(source), source.facing, box, target),
    );
    if (!box) return [];
    const body = struck(this.origin(source), source.facing, box, target)!;
    const guarding = this.guarding(target, box);
    let slot = responseSlot(target, guarding, this.crouching(target));
    // 0x40f4c9, 0x40f4fa: a CPU guarding on its feet whose guard response
    // is a hit takes the other height's, so it guards Ryuko's punch 3 (25,
    // 77) crouching too.
    if (
      slot < 5 &&
      guarding &&
      this.driven(target) &&
      HIT_RESPONSES.has(source.responses[slot])
    )
      slot = 7 - slot;
    const response = source.responses[slot];
    // 0x40f539: a response id selects the victim action from the victim's
    // own table. Another player's follows its Ryuko twin's rules
    // (export_fighter), so `victim` is Ryuko's number for it; the reactions
    // only some moves reach play from the victim's own timeline: ZENKA's
    // En300 grab strips the victim in Clothes off (response 46, 101), which
    // takes 260 life (op 0x15, PC 1265).
    const own = responsesOf(target.who)[response];
    const victim = twinOf(target.who, own) ?? 0;
    const reaction = RESPONSE_REACTIONS[victim];
    const timeline = reaction ? undefined : ownTimeline(target.who, response);
    // 0x40f527: response 0 names no reaction, but a box without damage
    // still meets the victim, turning it and taking the striker's handler
    // (0x40f73c, 0x40f6e6, 0x40f885): LIZARD's dragon up handen (247) so
    // finds whom his birds strike. One with damage reports 'reaction error'
    // to the debug log (0x40f65b, 0x415190) and leaves the victim as it is,
    // past the striker's mark and the pair's priorities and +0xdef9: a guard
    // spends ANMC P's 234, whose guard half is 0. No box names a response
    // whose victim action is 0 (0x40f640).
    const error = !reaction && !timeline && box.damage > 0;
    // A guarded contact (the guard half, 0x40f4be) stays one unless its
    // response is a hit (0x40f544), as a guard half naming a hit is; a hit
    // half naming a guard, YINAN's R300 Hit's time stop (response 80, PC
    // 10429), is a hit.
    const blocked = guarding && !HIT_RESPONSES.has(response);
    return [
      {
        f: attacker,
        target,
        box,
        taken: body.taken,
        damaging: box.damage > 0,
        effect: box.damage ? responseEffectsOf(attacker.who)[response] : 0,
        hitStop: reaction?.stop ?? 0,
        // The reaction's other stop (0x4136ae) reaches the striker's owner
        // whether its body or one of its objects struck.
        attackerStop: reaction?.attackerStop ?? reaction?.stop ?? 0,
        reaction: reaction?.action as AnimatedAction | undefined,
        timeline,
        facing: source.facing,
        x: body.x,
        y: body.y,
        centre: body.centre,
        blocked,
        source,
        bonus: STRIKER_POWER[victim] ?? 0,
        own,
        error,
      },
    ];
  }

  // 0x40eb60, before the hit test (0x40ffdc): each attack box of each object,
  // slots 19 down to 0, against those of every later object (slot order) of
  // the other player, but a player reeling (+0x15e & 8) only as the earlier
  // one. Where two meet, both objects lose every box (0x403300) if neither
  // has damage; otherwise each one's slot 5 handler (+0x74) is queued
  // (+0x38) and cleared, both losing their boxes with it, and boxes without
  // one pass through. The box first found keeps meeting the later objects.
  // Its clash effect and stops (0x40ee0e) need system flag 2 (0x4438a4),
  // which SCWU.KGT leaves clear (0x7d), and no player's box sets byte 11's
  // bit 0x80 (0x40ef4d). Boxes meeting with the earlier one player 1's mark
  // the later one's player for the story HUD (0x40ed54), as a hit does.
  private clashBoxes() {
    type Holder = Fighter | Effect;
    const holders: [Holder, number][] = [
      ...this.fighters.map((f, owner): [Holder, number] => [f, owner]),
      ...this.effects.map((e): [Holder, number] => [e, e.owner]),
    ];
    const boxAt = (o: Holder, slot: number) =>
      (slot ? o.boxes[slot] : o.box) ?? null;
    const strip = (...holders: Holder[]) =>
      holders.forEach((o) => Object.assign(o, { box: null, boxes: [] }));
    holders.forEach(([a, owner], i) => {
      const at = this.origin(a);
      for (let slot = 19; slot >= 0; slot--) {
        const box = boxAt(a, slot);
        if (!box) continue;
        for (const [b, other] of holders.slice(i + 1)) {
          if (!this.hostile(owner, other) || (!('clip' in b) && b.reaction & 8))
            continue;
          const to = this.origin(b);
          for (let s = 19; s >= 0; s--) {
            const met = boxAt(b, s);
            if (
              !met ||
              Math.abs(
                at.x + a.facing * box.x * 1.5 - to.x - b.facing * met.x * 1.5,
              ) >=
                (box.w + met.w) * 1.5 ||
              Math.abs(at.y + box.y * 1.5 - to.y - met.y * 1.5) >=
                (box.h + met.h) * 1.5
            )
              continue;
            if (owner === 0) [this.enemy, this.enemyTicks] = [other, 1000];
            if (!box.damage && !met.damage) {
              strip(a, b);
              continue;
            }
            for (const o of [a, b]) {
              if (!o.onClash) continue;
              if ('clip' in o) [o.pending, o.onClash] = [o.onClash, undefined];
              else [o.pending, o.onClash] = [{ key: o.onClash }, 0];
              strip(a, b);
            }
          }
        }
      }
    });
  }

  // 0x40f010 tests every box of every object, fighters' too, against the
  // other side's objects' bodies. Ryuko's objects meet 2000 pixels down: an
  // axe's box and body (PCs 3290–3291), the beams' boxes (270, 277), B G's
  // lunge box (292) and its stage-wide bodies (303). His Black and OP super
  // Charge (39) follows him with a body 9900 down for AYA's 257 and 258 and
  // DoraEmon's 421 to strike, and YINAN's dash leaves 21 + 22 standing with
  // his bodies. An object victim (+0x15a 1)
  // only fires the striker's hit handler (0x40f36a, taken up next tick) and
  // marks it as having hit (0x40f31c), which 0x40f010 checks only before the
  // striker's pass: axes break into 230 without damage, stop or effect, even
  // held by the freeze; B G's lunge enters 294; a beam, which sets no
  // handler, waits for its next box. The lunge records the axe as caught
  // (+0xdef9, 0x40f2e0), but only grab-entered actions and Air Drill's hit
  // branch hold or toss with ops 0x07/0x14, so the axe flies on.
  private objectHits() {
    type At = { x: number; y: number; facing: -1 | 1; owner: number };
    const bodies: [At, Omit<BodyBox, 'kind' | 'taken'>, Effect][] = [];
    const strikers: [At, (ScriptBox | null)[], Fighter | Effect][] = [];
    // An object yet to step shows nothing.
    for (const e of this.effects.filter((e) => e.age >= 0)) {
      const at = { ...this.origin(e), facing: e.facing, owner: e.owner };
      for (const body of animationFrame(e.clip, e.age, e.who).body ?? [])
        if (body.kind & 6) bodies.push([at, body, e]);
      // Every slot: ALEX's REF OBJ (265) strikes 2000 pixels down from slot
      // 0 (PC 3842).
      if (!e.connected) strikers.push([at, [e.box, ...e.boxes], e]);
    }
    this.fighters.forEach((f, owner) => {
      if (f.connected) return;
      strikers.push([{ ...f, owner }, [f.box, ...f.boxes], f]);
    });
    // A later victim (slot order) wins.
    return strikers.flatMap(([a, boxes, striker]) => {
      const met = bodies.filter(
        ([b, body]) =>
          this.hostile(a.owner, b.owner) &&
          boxes.some(
            (box) =>
              box &&
              Math.abs(
                a.x + a.facing * box.x * 1.5 - b.x - b.facing * body.x * 1.5,
              ) <
                (box.w + body.w) * 1.5 &&
              Math.abs(a.y + box.y * 1.5 - b.y - body.y * 1.5) <
                (box.h + body.h) * 1.5,
          ),
      );
      return met.length ? [[striker, met.at(-1)![2]] as const] : [];
    });
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
  private think(f: Fighter) {
    const i = this.fighters.indexOf(f);
    // With no target it clears its history and enters nothing (0x4112a1).
    const input = (this.inputs[i] = f.target
      ? this.cpus[i]!.input(f, f.target)
      : {});
    this.record(i, input, true);
    return input;
  }

  // 0x40f3a2: a CPU victim ignores its input. Free (+0x15e & 0xc is 0) it
  // guards on rand % 100 < level (0x40f3c2); another guards holding back in
  // its side's terms (bit 1, 0x40f3bd, as no block sets +0x7cb6 bit 8), which
  // the guard key stands for, wherever the striker is or faces. In a guard
  // reaction (0xc) any player keeps guarding, whichever way it faces
  // (0x40f449). Ryuko's +0x7cb6 bit 2 lets it guard in the air (0x40f475).
  // A box of kind 0x40 can't be guarded (0x40f469): Musashi's finish (257)
  // and COUNTER HIT (174).
  private guarding(target: Fighter, box: ScriptBox) {
    const bits = target.reaction & 0xc;
    const guard =
      bits === 0xc ||
      (this.driven(target)
        ? bits === 0 && this.cpus[this.fighters.indexOf(target)]!.guards()
        : guards.has(target.action));
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
    history: number[],
    ok: (level: number, action?: number) => boolean = () => true,
  ) {
    const found = scan(
      history,
      {
        air: f.y < 0,
        still: f.y === 0 && f.vy === 0,
        landing: f.y < 0 && f.y > -50 * 1.5 && f.vy > 0,
        // With no target, the far action (0x4107fa).
        near:
          !!f.target &&
          Math.trunc(Math.abs(f.x - f.target.x) / 1.5) <= nearOf(f.who),
      },
      f.who,
    );
    if (!found) return false;
    // Each entry enters its stance's action, which plays from its own
    // timeline; a window passes it by that action's level.
    const index = entriesOf(f.who)[found.entry - 1][found.stance];
    if (!ok(LEVELS[f.who][index], index)) return false;
    this.enterSource(f, index);
    const i = this.fighters.indexOf(f);
    if (this.keyed[i]) [this.keyed[i], this.spent[i]] = [false, 0];
    return true;
  }

  // Op 0x1e windows, read after the landing check (0x41193a) on steps a stop
  // doesn't skip (0x412390), so a press made during a stop enters once it
  // ends, while still in its command's window. Scripts and clips set the
  // window themselves: mode 1 once the move's box has connected, 2 always;
  // type 0 passes a command whose action's level lies in [min, max], type 1
  // only the action it names.
  private cancel(f: Fighter, history: number[]) {
    const window = f.window;
    if (
      !window ||
      !(window.mode === 2 || (window.mode === 1 && f.contact === 2))
    )
      return false;
    return this.command(f, history, (level, action) => {
      const passes =
        window.type === 0
          ? level >= window.min && level <= window.max
          : window.type === 1 && action === window.action;
      if (passes) f.contact = 0;
      return passes;
    });
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
  private enterPending(f: Fighter) {
    const pending = f.pending!;
    f.pending = null;
    if ('key' in pending) return this.enterKey(f, pending.key);
    let { action, stop, attackerStop, power, own } = pending;
    // The lose action takes its first test that passes, after the records
    // before it: make hikari (63) while global 0 is 10 (PC 590), after
    // deleting objects 7–9 and clearing variables 6, 8 and 14; Start KO 3
    // for variable 0 (SHIN-Z's PC 705); ALPHA's KO Boss for global 10 (PC
    // 1029). Its jump to KO Normal (PC 591) plays as `down`, past KO
    // Normal's first checks, which take the first that passes: DoraEmon's
    // op 0x10 (PC 775) enters KO RELOAD (72) with three stocks, and his test
    // of global 3 for 10 (PC 776) KO NORMAL CPU (70) in a story. Its test of
    // variable 3, which a KO sets (Ryuko's 50, PC 596) and getting up clears
    // (PC 1968), plays KO NORMAL 2nd as `koAgain` (PC 595), whatever the
    // life: Zoma's chuck and Musashi grab hold it at 30 (201, 253). ALPHA's
    // yowai form skips his KO Boss tests (PC 1025, into 83 + 13), testing
    // global 0 before his KO Normal.
    for (
      let key: ObjectKey | null =
        action === 'down' || action === 'koAgain' ? twin(f.who, LOSE) : null;
      key !== null;
    ) {
      const { events: lose, next, offset = 0 } = script(key, f.who);
      const ko =
        next === null ? [] : script(sourceKey(next, offset), f.who).events;
      const checks = ko.slice(
        0,
        ko.findIndex((e) => e.t || (e.op !== 'stock' && e.op !== 'test')),
      );
      const check = checks.find((e) =>
        e.op === 'stock'
          ? e.atLeast && f.stock >= e.min
          : e.op === 'test' && this.passes(f, f, e),
      );
      const again = check?.op === 'test' && check.selector === 0x43;
      const jump =
        lose.find(
          (e): e is Extract<ScriptEvent, { op: 'test' }> =>
            e.op === 'test' && this.passes(f, f, e),
        ) ??
        (check?.op === 'stock'
          ? { action: check.target, offset: check.offset }
          : check?.op === 'test' && !again
            ? { action: check.action, offset: check.offset }
            : undefined);
      if (!jump) {
        action = again ? 'koAgain' : 'down';
        break;
      }
      for (const event of lose.slice(
        0,
        'op' in jump ? lose.indexOf(jump) : lose.length,
      ))
        this.runEvent(f, this.fighters.indexOf(f), event);
      if (jump.action !== twin(f.who, LOSE))
        return this.enterSource(f, jump.action, jump.offset);
      key = sourceKey(jump.action, jump.offset);
    }
    // HIT UP tests variable 8 above 99 (PC 921), which only ICE Punch sets
    // (PCs 1347, 1371) and the idle clears (PC 3), into HISA (80) and its
    // records, 13 stop ticks for both (PC 907): SWW's ICE Punch, then his
    // Hit up, launches away. HISA's counter records are HIT UP's (HISO's
    // come before the test, PC 933), so they run past the jump.
    if (action === 'launchUp' && f.variables[8] > 99)
      [action, stop, attackerStop, own] = [
        'launchAway',
        13,
        13,
        twin(f.who, HISA),
      ];
    // FB's op 0x16 (PC 1443) enters heavy air hit off the floor after its op
    // 0x15, before any copy's records: the striker keeps its 10, and 76's
    // counter records run.
    if (f.y < 0 && own !== undefined && twinOf(f.who, own) === FB)
      [action, own] = ['airHitHeavy', twin(f.who, AIR_HIT_HEAVY)];
    const copy = own === undefined ? undefined : copyOf(f.who, own);
    // Above 4 a jump hit's count enters J atttack 2 (78, PC 830), above 7
    // its + 11 (PC 829): J atttack's records (PCs 831–838) but for an op
    // 0x01 that adds raw −250 or −500 to the halted victim's velocity (PCs
    // 859, 869), then a jump back to its first display (+ 15) and so its
    // roll (Zoma's PC 784). KAY's tests both above 4 (PCs 845–846). A copy
    // plays its own records instead: Giant's Air Fire clears the count at
    // once (PC 1720).
    const count =
      action === 'jumpHit' &&
      !copy &&
      script(twin(f.who, JUMP_HIT), f.who).events.find(
        (e) => e.op === 'test' && e.selector === 0x45 && this.passes(f, f, e),
      );
    const boost =
      count &&
      count.op === 'test' &&
      script(sourceKey(count.action, count.offset), f.who).events.find(
        (e) => e.op === 'motion',
      );
    // Giant's reactions open by testing his counter's variable 4 (PCs 723,
    // 763, ...): at 100, which counter start (278) holds for 72 ticks (PCs
    // 4271–4282), they enter counter hit (279) before their stops and power.
    // Most others clear it (PCs 744, 788, ...). ERUS's also clear her Book's
    // variable 2 or test it at 10 (PCs 787, 1254, ...). ZAKU's and PAC-HELO's
    // test global 10 for 10 (PCs 751, 758, ...), as story's select screen
    // leaves it, into their mode select's Hit Mode (177, 178).
    for (const [index, value, target] of own === undefined
      ? []
      : (countersOf(f.who)[own] ?? [])) {
      if (!target) f.variables[index] = value;
      else if (
        (index & 0x80 ? this.globals[index & 0x3f] : f.variables[index]) ===
        value
      )
        return this.enterSource(f, target);
    }
    // ERUS INATUMA's op 0x16 (PC 1541) enters its AIR form off the floor, as
    // HISO stop's does (PC 1455).
    this.action(
      f,
      (f.y < 0 && AIR_FORMS[action]) || action,
      true,
      copy && (this.roll(f.who, copy) ?? copy),
    );
    if (copy) [f.copy, power] = [copy, 0];
    f.vx = f.vy = 0;
    f.moving = 0;
    if (boost && boost.op === 'motion') f.slideBase = boost.vx;
    this.pause(f, stop);
    this.pauseOthers(f, attackerStop);
    const [victimPower, attackerPower] = f.copy
      ? ownPower(f.copy, f.who)
      : own !== undefined && exported(own, f.who)
        ? ownPower(own, f.who)
        : reactionPower(f);
    addPower(f, victimPower);
    const striker = this.met(f);
    if (striker) addPower(striker, attackerPower + power);
  }

  private move(f: Fighter, input: Input, previous: Input, history: number[]) {
    if (f.pending) this.enterPending(f);
    else {
      // Held by op 0x07 (+0x40 at -1), the step returns at once (0x412397).
      if (f.hitStop < 0) return;
      if (f.hitStop === 0) {
        // 0x4123c5: an unstopped step drops the word a stop saved.
        f.stopInput = null;
        stepBar(f);
        f.shown = true;
        this.retarget(f);
        if (this.driven(f)) input = this.think(f);
        // An op 0x1a stop adds to the -1 (0x4136fb), as a struck holder's
        // reaction does to its victim, which counts it down and then runs on
        // from where op 0x07 left it, action 0's offset 1 (0x412fc5), past
        // its end, into neutral; with no fall, it doesn't land (0x41187f).
        if (f.held?.pose) {
          if (!this.runOut(f)) this.action(f, 'idle');
          return;
        }
        f.age++;
        f.moving = 0;
        if (this.land(f)) return;
        if (this.cancel(f, history)) return;
        if (f.action === 'idle')
          for (const event of idlePower(f.who, f.age))
            this.runEvent(f, this.fighters.indexOf(f), event);
      } else {
        f.hitStop--;
        return;
      }
    }
    if (f.action === 'superHeld' && !f.held?.pose && f.gravity)
      f.moving = 'velocity';
    if (f.action === 'superHeld' || f.action === 'shock') return;
    // A fighter holds its result (0x410ff1), moving only by its own runs
    // from the tick their op 0x01 runs, and lands as the source's step does
    // (0x41187f).
    if (f.action === 'win' || f.action === 'draw') {
      this.rollResult(f);
      return;
    }
    if (this.musicAttack(f) || this.vanish(f)) return;
    if (this.moveKO(f)) return;
    if (this.counter(f, history)) return;
    // 通常立ち's own branches stay neutral, where the free state takes the
    // round's result whatever their PC (0x410ff1): the vanished Chii's loop
    // (ZAKU's 1 + 27, PC 31) enters his lose action, and so INAI (11).
    const neutral =
      f.action === 'script' &&
      NEUTRAL[f.who][String(f.branch).split('+')[0]] === 'idle' &&
      this.winner &&
      this.result(f);
    if (f.action === 'script' && !neutral && this.moveScripted(f)) return;
    if (this.gonMiss(f)) return;
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
      if (f.age < animationDuration(JUMP_CLIPS[f.jump][0], f.who)) return;
      // A jump's op 0x01 follows its takeoff displays (Ryuko's PC 54), so
      // the jump moves on this tick.
      this.launchJump(f);
      this.action(f, 'jump');
      f.moving = 'velocity';
      return;
    }
    if (
      f.action !== 'idle' &&
      f.action !== 'script' &&
      (reactions.has(f.action) ||
        ['land', 'stand', 'getUp'].includes(f.action)) &&
      // ZENKA's yowai J LEND holds one display, 8 ticks (PC 203).
      f.age < animationDuration(f.action, f.who, false, yowai(f))
    )
      return;
    // One that ran out did so into the free state (0x412713).
    if (reactions.has(f.action) || f.action === 'land' || f.action === 'getUp')
      f.contact = f.struck = 0;
    if (f.action === 'jumpHit')
      for (const event of script(f.copy ?? twin(f.who, JUMP_HIT), f.who).events)
        if (
          event.op === 'variable' &&
          event.t >= animationDuration(f.action, f.who)
        )
          this.runEvent(f, this.fighters.indexOf(f), event);
    const airborne = f.y < 0 || f.vy < 0;
    // An air reaction that ends airborne falls (0x411a80), which frees the
    // fighter.
    if (airborne && AIR_REACTIONS[f.action]) {
      toNeutral(f);
      this.fall(f);
    }
    // Back in neutral once the round is decided, 0x410ff1 enters the result's
    // action instead of reading commands; airborne, the fall reads them. A
    // loser KO'd takes 2, the lose action (0x40948b): TRAINING's make hikari
    // flies him off (PC 441) and he gets up at 0 life.
    const result = this.winner && !airborne && (f.hp ? this.result(f) : 'lose');
    if (result === 'lose') {
      this.queue(f, 'down');
      return this.enterPending(f);
    }
    if (result) {
      this.action(f, result);
      this.rollResult(f);
      return;
    }
    const direction =
      Number(Boolean(input.right)) - Number(Boolean(input.left));
    const crouched = f.action.startsWith('crouch');
    const facing = f.toward;
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
    // Up enters the default-action table's up jump, with forward or back
    // its forward or back one (0x4110f0).
    if (input.jump && !previous.jump && !airborne) {
      this.action(f, 'takeoff');
      f.jump = !direction ? 0 : direction === f.facing ? 1 : 2;
      return;
    }
    // Authored: a key's command enters once. Back in the free state, its
    // history drops what came before the entry, as the CPU's clears every
    // step it thinks (0x411307); 0x41073e keeps the last 20 ticks, which
    // hold a key's steps, so a long window would enter it again (ALPHA's
    // SCC, 90, outlasts No super's 40). Op 0x24 checks within the move
    // still see it.
    const i = this.fighters.indexOf(f);
    if (this.spent[i] >= 0) {
      history.fill(0, 0, history.length - this.spent[i]);
      this.spent[i] = -1;
    }
    // The free state scans commands (0x411a01) after the port's own guard
    // and jump keys.
    if (this.command(f, history)) {
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
      const blink = CROUCH_ROLLS[f.who];
      if (
        blink &&
        f.action === 'crouch' &&
        f.age >= animationDuration('crouch', f.who)
      )
        f.age =
          this.cpu.random() % blink.divisor > blink.above ? 0 : blink.hold;
      this.action(f, crouched ? 'crouch' : 'crouchEnter');
      return;
    }
    if (!airborne)
      f.moving =
        direction && f.facing * walkSpeed(f.who, direction !== f.facing);
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
  // end starts (CHUCK HIT run out) is entered then.
  private enter(f: Fighter, index: number) {
    const pose = fighterPose(f);
    if (pose === f.entered) return;
    // A reaction that rolled its op 0x20 draws the branch, but first ran the
    // records before the roll; past it lies the sound the branch skips (75,
    // 76 and 80, PCs 795, 820, 910). A KO (+0x75a0, 0x40e83e) enters the
    // lose action 59 first: it deletes objects 7–9 and clears variables 6, 8
    // and 14, then jumps to KO Normal (PC 591), or with global 0 at 10 to
    // make hikari (63, PC 590; enterPending).
    const roll =
      f.branch !== f.copy &&
      f.branch &&
      (f.copy ??
        rolls(f.who)[f.action] ??
        (f.action === 'down' ? twin(f.who, LOSE + 1) : null));
    const rolled = roll ? script(roll, f.who).events : [];
    const entry = f.entered
      ? []
      : [
          ...(f.action === 'down' || f.action === 'koAgain'
            ? script(twin(f.who, LOSE), f.who).events
            : []),
          ...rolled
            .slice(
              0,
              rolled.findIndex(
                (e) =>
                  e.op === 'random' ||
                  (e.op === 'test' &&
                    sourceKey(e.action, e.offset) === f.branch),
              ),
            )
            .filter((e) => (POSE_EVENTS as readonly string[]).includes(e.op)),
        ];
    const events = [...entry, ...(pose.events ?? [])];
    f.entered = pose;
    if (f.action === 'script') return;
    for (const event of events) this.runEvent(f, index, event);
  }

  step(player: Input = {}, opponent?: Input) {
    if (this.resultReady) return;
    this.sounds = [];
    if (this.enemyTicks && !--this.enemyTicks) this.enemy = -1;
    // The story HUD (0x40a36e) takes the only other player with life.
    if (this.battle) {
      const alive = this.fighters.flatMap((f, i) => (i && f.hp ? [i] : []));
      if (alive.length === 1) this.enemy = alive[0];
    }
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
    // variable 14 is 100 it shows its panel opaque a tick at a time (PCs
    // 428–433); once it isn't, PC 434 sets it to 0 and the panel shows five
    // ticks at 50% (PC 436).
    for (const { black, variables, who } of this.fighters) {
      const index = darkening(who);
      if (black.left > 1) black.left--;
      else if (variables[index] === 100)
        Object.assign(black, { shown: 'opaque', left: 1 });
      else if (black.shown === 'opaque') {
        variables[index] = 0;
        Object.assign(black, { shown: 'half', left: 5 });
      } else Object.assign(black, { shown: 'none', left: 1 });
    }
    this.run(player, opponent);
    this.fighters.forEach((f, index) => this.enter(f, index));
    // The tick ends counting the faders down (0x404d97); each draw then
    // writes a running one over the colour of its player's objects (kinds 0,
    // 1 and 5, 0x40e42c), not the hit count's KGT ones.
    this.fighters.forEach((f, owner) => {
      const { fader } = f;
      // Type 3 blends at draw time (scene.ts).
      if (!fader?.left || !--fader.left || fader.type > 2) return;
      const blend = faderColor(fader);
      for (const actor of [
        f,
        ...this.effects.filter((e) => e.owner === owner && e.who !== 'kgt'),
      ])
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

  private taken() {
    return [
      ...this.layers,
      ...this.effects,
      ...this.freeing,
      ...this.kgt.map(({ e }) => e),
    ];
  }

  // A KGT object spawning, which holds a slot for `life` more steps (a
  // stand-in, whose clip nothing reads).
  private hold(z: number, life = Infinity) {
    const e = newEffect({ clip: 0, who: this.stage, z });
    e.index = firstFree(this.taken());
    this.kgt.push({ e, until: this.roundTicks + 1 + life });
  }

  private delete(e: Effect) {
    if (this.freeing.includes(e)) return;
    if (e.stage) this.layers = this.layers.filter((layer) => layer !== e);
    else this.effects = this.effects.filter((other) => other !== e);
    this.freeing.push(e);
  }

  private stepObjects(objects: Effect[]) {
    for (const e of objects) {
      if (this.freeing.includes(e)) {
        this.freeing = this.freeing.filter((other) => other !== e);
        continue;
      }
      if (!e.stage && !this.effects.includes(e)) continue;
      if (e.counter) {
        this.stepCount(e);
        continue;
      }
      // 0x4124fb: past its handler and stop, one following an object whose
      // slot is deleted (state 1) is deleted too, its step still running:
      // ERUS's 335 + 43 goes with its 338. One meeting the slot freed (its
      // parent deleted by another's spawn, and stepping between the two)
      // keeps to it, and follows whatever takes the slot (spawnObject).
      const orphan =
        !e.stage &&
        e.pending === undefined &&
        !e.hitStop &&
        this.freeing.some((other) => other === e.follow?.parent);
      this.stepObject(e);
      // A script that runs out reaches the next action's op 0x00, which
      // deletes an object (0x41273c, 0x413bc6), its slot free for a spawn
      // from its next turn; 0x4124c9 also culls one that leaves the world unless it
      // follows a parent. Op 0x05 deletes a stage object too (0x412617), as
      // Sakura Night's petals (2–5) end; one holding a display stays.
      // A KGT object (+0x15a 2) skips the bounds too, and the hit count's run
      // out into deletion (flag 0x20, 0x41279b; export_ui).
      const running =
        e.age < animationDuration(e.clip, e.who) ||
        (e.stage ? script(e.clip, e.who).end !== 'delete' : loops(e));
      if ((e.stage || e.who === 'kgt') && !running) this.delete(e);
      else if (
        !e.stage &&
        e.who !== 'kgt' &&
        (orphan ||
          !(
            running &&
            (e.follow !== null ||
              inWorld(e.screen ? { x: e.x, y: e.y - 920 * 1.5 } : e))
          ))
      )
        this.delete(e);
    }
  }

  // 0x40ab10: the hit count's first step spawns HIT and the count's digits,
  // ones first, `width` apart leftward, as KGT objects at 0x65 (0x406890) in
  // the world (+0x28 bit 0x40000000). It lives 200 steps, or one past the
  // victim's count passing its own, then frees its slot at its next (type 1,
  // 0x4069a0).
  private stepCount(e: Effect) {
    const counter = e.counter!;
    if (!counter.steps) {
      const { label, digits, width } = ui.combo;
      const show = (action: number, x: number) =>
        this.take(
          newEffect({ clip: action, who: 'kgt', age: -1, x, y: e.y, z: 0x65 }),
        );
      show(label, e.x);
      for (let n = counter.count, x = e.x; n; n = Math.trunc(n / 10)) {
        show(digits[n % 10], x);
        x -= width * 1.5;
      }
    }
    if (counter.count < counter.victim.struck) counter.steps = 1000;
    if (++counter.steps > 200) this.delete(e);
  }

  private stepObject(e: Effect) {
    // A queued handler comes first, stopped or not (0x412327): an action
    // change that drops its boxes and, for a fighter's objects (+0x15a 1,
    // 0x412c00–0x412c4c), every handler (0x40e510): Z-MEGA's *Fire ball 01
    // (202) that strikes falls on as ***ball hit (201), not into *Fire ball
    // 02 (203, slot 1).
    if (e.pending !== undefined) {
      const key = e.pending;
      Object.assign(e, {
        box: null,
        boxes: [],
        responses: [],
        pending: undefined,
        onLand: e.stage ? e.onLand : undefined,
        onClash: e.stage ? e.onClash : undefined,
        // It ends any call too (0x410d50), as landing does.
        resume: undefined,
      });
      this.branchTo(e, key);
      return;
    }
    // A stopped object skips its script step (0x412390), for good at -1.
    if (e.hitStop) {
      if (e.hitStop > 0) e.hitStop--;
      return;
    }
    // 0x41241c: an object falling to the floor (y 920) stops there, and
    // its landing handler (slot 1) enters its action, dropping its boxes.
    // A stage or KGT object skips this and the world bounds (0x4123cb).
    if (
      !e.stage &&
      e.who !== 'kgt' &&
      !e.screen &&
      !e.follow &&
      e.y >= 0 &&
      e.vy > 0
    ) {
      Object.assign(e, { y: 0, vx: 0, vy: 0, ax: 0, gravity: 0 });
      const land = e.onLand;
      if (land !== undefined) {
        Object.assign(e, {
          box: null,
          boxes: [],
          onLand: undefined,
          resume: undefined,
        });
        this.branchTo(e, land);
        return;
      }
    }
    // A script without displays never advances, so its events all fire at
    // its first step (anime beam 296 only spawns 297 and 299).
    if (++e.age === 0 || e.age < animationDuration(e.clip, e.who) || loops(e))
      this.fireEffect(e);
    // A script that runs out after a display runs its last records first
    // (0x4125ea): LIZARD's dragon up handen (247) spawns call bird (249,
    // PC 3409). One a check jumped into out of a call then returns into the
    // call, and a stage object restarts its first action (+0x34, 0x4127b7).
    else if (
      e.age === animationDuration(e.clip, e.who) &&
      !this.fireEffect(e) &&
      script(e.clip, e.who).end === 'end'
    ) {
      if (e.resume) this.resume(e);
      else if (e.stage) this.branchTo(e, e.stage.home);
    }
  }

  // The call's pass runs out where the check jumped out of it, running that
  // tick's events from there at once: MASA's #Fly Missile (260) waits out
  // the freeze in Skill6 (261, PC 3419), then flies on into its next pass.
  private resume(e: Effect) {
    const { clip, t, skip } = e.resume!;
    Object.assign(e, { clip, age: t, resume: undefined });
    rearm(e, clip, t);
    for (const next of eventsAt(clip, t, e.who).slice(skip))
      if (this.runEvent(e, e.owner, next)) break;
  }

  private run(player: Input, opponent?: Input) {
    // The camera object runs with the scripts, before motion (0x40ffc0), so
    // the walls use the positions from the end of the last tick. In the Vs.
    // modes it moves halfway to its aim each tick (0x40b022–0x40b080).
    const view = this.view();
    const aim = this.aim();
    this.camera = clampCamera(
      this.battle
        ? this.storyCamera(view)
        : {
            x: Math.trunc((view.x + aim.x) / 2),
            y: Math.trunc((view.y + aim.y) / 2),
          },
    );
    cameraLeft = this.camera.x;
    stageWalls = Boolean(this.battle && !(this.battle.letterings & 4));
    // Every script step runs (0x404d4c), then the contact passes (0x40eb60,
    // 0x40f010), then the motion pass (0x40f910: travel, moveObjects). Each
    // step first checks landing (0x41241c, 0x411810) and the world bounds
    // (0x4124c9) on last tick's motion. The pass takes the objects alive at
    // the tick's start by priority (0x404d0b), the players' slots before any
    // object's within one, so an object a step or a contact spawns first
    // steps in the next tick's pass, and one a player's step moves keeps its
    // place; within a priority they go in slot order. A KGT object deleted
    // last tick (kgt) frees its slot at its turn.
    for (const { e, until } of this.kgt)
      if (until <= this.roundTicks) this.freeing.push(e);
    this.kgt = this.kgt.filter(({ until }) => until > this.roundTicks);
    const order = this.fighters
      .map((_, i) => i)
      .sort((a, b) => this.fighters[a].z - this.fighters[b].z || a - b);
    // The objects below a player's priority step before it.
    const below = order.map(() => [] as Effect[]);
    const objects: Effect[] = [];
    for (const e of [...this.layers, ...this.effects, ...this.freeing].sort(
      (a, b) => a.z - b.z || a.index - b.index,
    )) {
      const k = order.findIndex((i) => e.z < this.fighters[i].z);
      (k < 0 ? objects : below[k]).push(e);
    }
    // After a KO or time-out the round phase stays 1 (only a debug key sets
    // 2, 0x406231 and 0x408f38): fighters keep reading commands and
    // striking, and each takes its result's action once back in neutral
    // (0x410ff1). Only the timer stops, as only the fight state counts it
    // (0x408e50).
    if (this.winner) this.endingTicks++;
    // Round phase 0 (0x47004c) lasts until the fight lettering sets 1:
    // commands (0x410069), the CPU (0x41130c) and the timer wait, and the
    // fighters finish their intro and stand. The round controller, stepping
    // last, sets it at the fight tick's end, so the players' steps read it
    // from the tick after.
    this.roundTicks++;
    this.cpuDriven =
      !opponent &&
      (this.mode !== 'practice' || this.practice.partner === 'cpu');
    if (this.calls && this.roundTicks <= this.fightTick) {
      this.inputs = this.fighters.map((_, i) =>
        i === 0 ? player : i === 1 ? (opponent ?? {}) : {},
      );
      this.cpuDriven = false;
      this.koStop = 0;
      for (const [k, i] of order.entries()) {
        const f = this.fighters[i];
        this.stepObjects(below[k]);
        if (!f.present) {
          this.arrive(f, i);
          continue;
        }
        // The step enters a queued action whatever the phase (0x412327):
        // SHIN-Z's VS Start KO takes 1000 of his life (PC 505), and his lose
        // action runs before FIGHT. Only the KO check waits for the fight
        // state (0x408eda).
        if (f.pending || !['script', 'intro', 'idle'].includes(f.action)) {
          this.move(f, {}, {}, []);
          this.enter(f, i);
          continue;
        }
        if (f.hitStop > 0) {
          f.hitStop--;
          continue;
        }
        stepBar(f);
        f.shown = true;
        this.retarget(f);
        // A VS 開始時 steps as any script does, and runs out into idle.
        if (f.action === 'script') {
          f.age++;
          if (!this.land(f) && !this.moveScripted(f)) this.action(f, 'idle');
          continue;
        }
        // DoraEmon's Br. intro clip.
        if (f.action !== 'intro') continue;
        f.age++;
        // Past the floor, the fall lands (0x41187f).
        f.y = Math.min(0, f.y + doraFall(f.age - 1));
        this.enter(f, i);
        if (f.age >= animationDuration('intro', f.who)) this.action(f, 'idle');
      }
      // History keeps recording, so a button held through the intro must be
      // pressed again once control begins.
      this.inputs.forEach((input, i) => this.record(i, input));
      this.previous = this.inputs.map((input) => ({ ...input }));
      for (const f of this.fighters) if (f.present) this.pause(f, this.koStop);
      // KGT 13, which round setup spawns after the players at priority 0x65
      // (0x408ce9), steps after the objects below it: it clears global 15
      // (PC 69), the round over, and holds global 14 at 10 for its first 10
      // ticks (PCs 70, 78, 88, 97), so a 開始時 BR that tests it after the
      // first tick keeps its display (Ryuko's PC 323).
      // KGT 13 also spawns its opening's objects on its first step.
      this.stepObjects(objects.filter((e) => e.z < 0x65));
      if (this.roundTicks === 1) {
        [this.globals[15], this.globals[14]] = [0, 10];
        for (const { z, life } of openingObjects(this)) this.hold(z, life);
      }
      if (this.roundTicks === 11) this.globals[14] = 0;
      if (this.roundTicks === 2) this.spawnFaces();
      this.stepObjects(objects.filter((e) => e.z >= 0x65));
      // The round controller, last, spawns DRESS n (0x408d7c), then SHOW
      // TIME (0x408e03), whose wait of 0 runs out at once into the fight
      // state and round phase 1 (0x408e37, 0x408e41).
      const bits = this.battle?.letterings ?? 3;
      if (this.roundTicks === DRESS_TICK && bits & 1)
        this.hold(0x65, dressLife(this.round));
      if (this.roundTicks === this.fightTick && bits & 2)
        this.hold(0x65, FIGHT_LIFE);
      this.hitTest();
      return;
    }
    if (!this.winner && !this.picking) this.ticks++;
    if (this.mode === 'practice') {
      for (const f of this.fighters)
        if (this.practice.maxStock && f.action === 'idle') {
          f.stock = stocksOf(f.who);
          f.power = 0;
        }
      // Authored: just under 30%, as Ryuko's hidden super, Zoma's Shin
      // Spark, G Suneo's hh, Yo's HIDDEN, SIN's NOZAN and GON's Hidden en300
      // enter their desperation forms only below it (op 0x11 at 153, 147,
      // 150, 144, 165 and 141 or more; the rest at it or below).
      if (this.practice.lowHealth)
        this.fighters[0].hp = Math.min(
          this.fighters[0].hp,
          desperationOf(this.fighters[0].who) - 1,
        );
    }
    const inputs = this.fighters.map((_, i) =>
      i === 0 ? player : i === 1 ? (opponent ?? this.ai()) : {},
    );
    this.inputs = inputs;
    inputs.forEach((input, i) => this.record(i, input));
    this.koStop = 0;
    for (const [k, i] of order.entries()) {
      const f = this.fighters[i];
      this.stepObjects(below[k]);
      if (!f.present) {
        this.arrive(f, i);
        continue;
      }
      this.move(f, inputs[i], this.previous[i], this.history[i]);
      this.enter(f, i);
    }
    // Applied after both steps, so a double KO holds once; like op 0x1a's
    // other stop it skips a slot still waiting to enter (+0x2238, 0x4136ae).
    for (const f of this.fighters) if (f.present) this.pause(f, this.koStop);
    // The HUD faces, at 0x65 after KGT 13, spawn their objects on their
    // first step (spawnFaces), and KGT 14 the transition's.
    this.stepObjects(objects.filter((e) => e.z < 0x65));
    if (this.roundTicks === 2) this.spawnFaces();
    // 116, or VS multi's 120 and 121 (KGT PCs 103, 110–111).
    if (this.calls && this.winner && this.endingTicks === this.roundEnd + 1) {
      this.hold(0x7f);
      if (this.teams) this.hold(0x7f);
    }
    this.stepObjects(objects.filter((e) => e.z >= 0x65));
    // Each result lettering (KO 26, YOU WIN 28, YOU LOSE 29, DRAW 32, DOUBLE
    // KO 33), spawned as the round controller sees the result, sets global
    // 15 to 100 on its first step, at 0x65 (KGT PCs 171, 199, 225, 257,
    // 260): the round over, for which the KO downs skip their life check
    // (Ryuko's PC 645), each VS CHARGE stops clearing it (PCs 405, 413) and
    // some moves end (GIGI's DIVE, PC 3316).
    if (this.endingTicks === 1) this.globals[15] = 100;
    // The Vs. result states spawn 1P or 2P WIN (KGT 30, 31; 0x4094ad,
    // 0x409582), whose first step, at 0x65, sets global 8 or 9 to 1 (KGT PCs
    // 251, 254), for the TEAM VS winner's objects to carry its life.
    if (
      this.calls &&
      !this.battle &&
      this.endingTicks === WIN_TICK + 1 &&
      (this.winner === 'player' || this.winner === 'opponent')
    )
      this.globals[this.winner === 'player' ? 8 : 9] = 1;
    // The round controller (type 0xe, 0x4086a0) steps last, at priority
    // 0x7f: its fight state reads the lives after every step (0x408e90), so
    // a lose action that restores life on its first step (ALPHA's KO Boss,
    // PC 1037) is never seen at 0. A story's ends as the 1P is KO'd or any
    // player reaches 100 points (0x408eda). Seeing the end it sets state 300
    // (0x408ec7), which picks the result the tick after from the lives then,
    // by per mille (+0xdf09, 0x408f68) as lives differ, or a story's
    // (0x409062). The tick after that the result state credits the winner,
    // or both for a draw or double KO (0x40948a, 0x40955f, 0x409394,
    // 0x40966b), gives the players their results (+0xe007) and spawns its
    // lettering.
    const [one, two] = this.fighters;
    const over = this.battle
      ? !one.hp || this.fighters.some((f) => f.points >= 100)
      : !one.hp || !two.hp;
    if (this.picking?.winner) {
      this.winner = this.picking.winner;
      this.picking = null;
      if (this.winner !== 'opponent') this.wins[0]++;
      if (this.winner !== 'player') this.wins[1]++;
      this.hold(0x65, resultLife(this));
    } else if (this.picking) {
      if (this.battle) this.picking.winner = this.storyResult();
      else {
        const [a, b] = [perMille(one), perMille(two)];
        this.picking.winner = a === b ? 'draw' : a > b ? 'player' : 'opponent';
      }
    } else if (!this.winner && (over || this.seconds === 0))
      this.picking = { winner: null };
    // It spawns the result states' letterings that hold a display: 1P or 2P
    // WIN, PERFECT, and KGT 14.
    if (this.calls && this.winner) {
      const won = !this.battle && this.winner !== 'draw';
      const perfect = this.roundEnd === roundEndTick(this.winner, true);
      if (won && this.endingTicks === WIN_TICK) this.hold(0x65);
      if (won && perfect && this.endingTicks === PERFECT_TICK) this.hold(0x65);
      if (this.endingTicks === this.roundEnd) this.hold(0x65);
    }
    this.previous = inputs.map((input) => ({ ...input }));
    this.hitTest();
  }

  // The main loop calls the hit test (0x40ffc0) after each tick's script
  // pass, whatever the round phase (0x404d8b): only the players' commands
  // and CPU read it. Before FIGHT, RARIO's 開始時 object (34) finds the
  // marker (39, 41) of ZENKA's or ALPHA's 開始時 yowai, its hit handler (35)
  // setting his variable 15 to 100, and in a Br. intro Ryuko and REAR, among
  // others, push apart from tick 250.
  private hitTest() {
    this.clashBoxes();
    // The hit test meets the fighters and objects where last tick's motion
    // left them. Contacts are collected before any applies, so same-tick
    // attacks can trade.
    const contacts = [
      ...this.fighters.flatMap((f, i) =>
        f.action === 'script' ? this.boxContact(f, i) : [],
      ),
      ...this.effects.flatMap((e) => this.boxContact(e, e.owner)),
    ];
    const objectHits = this.objectHits();
    // 0x40f2c2–0x40f355 at each contact, strikers in slot order (the players,
    // then the objects; the other player before any object): a player's own
    // box joins it to what it met and that one's owner to it (+0xdef9), and
    // brings it 1 in front of its plane's priority, and a player struck goes
    // 1 behind it.
    const meet = (striker: Fighter | Effect, victim: Fighter | Effect) => {
      // A 1P's box, its objects' too, marks the player it met (0x40f2e6).
      const by =
        'clip' in striker ? striker.owner : this.fighters.indexOf(striker);
      if (by === 0 && !('clip' in victim))
        [this.enemy, this.enemyTicks] = [this.fighters.indexOf(victim), 1000];
      if (!('clip' in victim)) victim.z = FIGHTER_Z - 1;
      if ('clip' in striker) return;
      striker.z = FIGHTER_Z + 1;
      const owner = 'clip' in victim ? this.fighters[victim.owner] : victim;
      [striker.caught, owner.caught] = [victim, striker];
    };
    for (const f of this.fighters) {
      for (const c of contacts) if (c.source === f) meet(f, c.target);
      for (const [striker, met] of objectHits) if (striker === f) meet(f, met);
    }
    for (const c of contacts) if (c.source !== c.f) meet(c.source, c.target);
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
      box,
      taken,
      damaging,
      effect,
      hitStop,
      attackerStop,
      reaction,
      timeline,
      facing,
      x,
      y,
      centre,
      blocked,
      source,
      bonus,
      own,
      error,
    } of contacts) {
      source.connected = true;
      // 0x40f384 raises the striker's player's armed counter before the
      // response is read, its objects' contacts too.
      if (f.contact) f.contact = 2;
      if (error) continue;
      if (!reaction && !timeline) {
        target.facing = facing === 1 ? -1 : 1;
        continue;
      }
      const body = source === f;
      if (damaging) target.hitStop = source.hitStop = 0;
      const strength = boxDamage(box, taken, blocked, f.who, target.struck);
      const loss = loseLife(target, strength);
      if (!blocked && strength) target.struck++;
      f.damage += loss;
      if (!blocked) f.hits++;
      // A loss that empties life, a chip's too (0x40e7c0), queues the lose
      // action instead (0x40e84b), so the reaction's records never run: no
      // op 0x15 power, no op 0x1a stops. The last box to reach the victim
      // sets its reaction, so DST's two missiles stop it once. A KO'd
      // victim KOs again, scoring again, but a box without damage takes
      // nothing and so doesn't (0x40f689, 0x40f747).
      if (loss && target.hp === 0) this.knockOut(target);
      else if (timeline) target.pending = { key: timeline };
      else this.queue(target, reaction!, hitStop, attackerStop, bonus, own);
      target.reaction = blocked
        ? target.reaction | 0xc
        : (target.reaction & ~4) | 8;
      // 0x40f8a4 records a fighter striking with its own box, 0x40f8ac an
      // object following its parent; other objects leave the striker as is.
      if (body || ('clip' in source && source.follow))
        [target.striker, target.struckBy] = [body ? 'body' : 'object', f];
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
      // 0x40f81e: past the victim's first, a hit that takes life spawns its
      // hit count (object type 7) at the struck body box's centre, at 0x5e.
      // It has no display, so the draw and the hit test pass it (age −1).
      if (!blocked && strength && target.struck > 1)
        this.take(
          newEffect({
            clip: 0,
            who: 'kgt',
            age: -1,
            ...centre,
            z: 0x5e,
            counter: { count: target.struck, victim: target, steps: 0 },
          }),
        );
    }
    // 0x40f36a: a player's box meeting an object's body queues its hit
    // handler at the contact, over whatever is queued, a reaction or KO an
    // earlier player's box queued among them; only a later striker's (a
    // later player's or any object's) replaces it.
    for (const [striker] of objectHits) {
      if ('clip' in striker || !striker.onHit) continue;
      const i = this.fighters.indexOf(striker);
      const later = contacts.some(
        (c) =>
          c.target === striker &&
          !c.error &&
          (c.reaction || c.timeline) &&
          ('clip' in c.source || this.fighters.indexOf(c.f) > i),
      );
      if (!later) striker.pending = { key: striker.onHit };
    }
    // 0x40fce9: overlapping op 0x19 boxes of kind bit 0 push both fighters
    // apart by a quarter of the overlap (<< 14 in 16.16), boxes walked from
    // slot 19 down, in whole source pixels (x >> 16). Only the airborne one
    // (above the floor, 0x40fec9) moves when the other is grounded, and a
    // KO'd fighter (life +0xdf05 is 0) pushes no one. Held and hidden poses
    // set no such box, and hit stop doesn't stop the push.
    // 0x40f910 walks the players in slot order: each moves and settles, then
    // pushes against every later one's boxes, which haven't moved yet, so its
    // own share stays unclamped until its next move. Allies push too.
    const pixel = (v: number) => Math.floor(v / 1.5);
    this.fighters.forEach((a, i) => {
      if (!a.present) return;
      this.travel(a);
      if (!a.shown || a.bare) return;
      for (const boxA of pushboxes(shown(a), a.age, a.who)) {
        const ax = pixel(a.x) + a.facing * boxA.x;
        const ay = pixel(a.y) + boxA.y;
        for (const b of this.fighters
          .slice(i + 1)
          .filter((b) => b.shown && !b.bare))
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
    });
    this.moveObjects();
    // Op 0x02 slots 2 and 3: a script's own box queues its guard handler at
    // the contact (0x40f6f1), its hit handler after the motion pass only for
    // a striker with nothing queued (0x40fffd), so a reaction takes an
    // interrupted aerial drill whatever the fighters' order. An own box
    // landing unguarded marks its player (+0xdf2d) and the one it struck
    // (+0xdf31, 0x40f863–0x40f87d), and the hit handler also waits for the
    // player it met to be struck and to have landed none (0x410023): FENG's
    // Evil IORI P3 (252) finds Ryuko without damage as her punch 1 lands,
    // so it stays out of its hit branch (179).
    // ponytail: both wait for a striker with nothing queued. The engine's
    // guard handler overwrites a reaction an earlier striker queued, but a
    // striker guarded while struck would need a box in a guard reaction or
    // the free state, which no fighter's records hold.
    const landed = contacts.filter(
      (c) => c.source === c.f && !c.blocked && !c.error,
    );
    for (const { f, blocked, source, error } of contacts) {
      if (error) continue;
      if ('clip' in source) this.handle(source, blocked);
      const handler = blocked ? f.onGuard : f.onHit;
      const met = this.met(f);
      if (
        source === f &&
        f.action === 'script' &&
        !f.pending &&
        handler &&
        (blocked ||
          (landed.some((c) => c.target === met) &&
            !landed.some((c) => c.f === met)))
      )
        f.pending = { key: handler };
    }
    for (const [striker] of objectHits) {
      striker.connected = true;
      if ('clip' in striker) this.handle(striker, false);
    }
    this.holdVictims();
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
