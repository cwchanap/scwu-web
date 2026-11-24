// Each player's exported container data: Ryuko's (01 RYUKO.PLAYER), Zoma's
// (02 ZOMA.PLAYER), Kiki's (03 KIKI.PLAYER), Chung's (04 CHUNG.PLAYER),
// Amiro's (05 AMIRO.PLAYER), ANMC P's (06 ANMC P.PLAYER), Giant's
// (07 GIANT.PLAYER), G Suneo's (08 G SUNEO.PLAYER), Yo's (09 YO.PLAYER),
// SIN's (10 SIN.PLAYER), LIZARD's (11 LIZARD.PLAYER), KAY's (12 KAY.PLAYER),
// DIDO's (13 DIDO.PLAYER), SAKUYA's (14 SAKUYA.PLAYER), ALEX's
// (15 ALEX.PLAYER), SOU's (16 SOU.PLAYER), HISO's (17 HISO.PLAYER),
// ERUS's (18 ERUS.PLAYER), OS FENG's (19 OS FENG.PLAYER), SEAN's
// (20 SEAN.PLAYER), GON's (21 GON.PLAYER), KATE's (22 KATE.PLAYER),
// REMU's (23 REMU.PLAYER), REAR's (24 REAR.PLAYER), GIGI's
// (25 GIGI.PLAYER), SWW's (26 SWW.PLAYER), OGI's (27 OGI.PLAYER), ZIRO's
// (28 ZIRO.PLAYER), MASA's (29 MASA.PLAYER), 3-TIMES's (30
// 3-TIMES.PLAYER), ZENKA's (31 ZENKA.PLAYER), Z-MEGA's (32 Z-MEGA.PLAYER),
// ALPHA's (33 ALPHA.PLAYER), SHIN-Z's (34 SHIN-Z.PLAYER), ZAKU's (35
// ZAKU.PLAYER), PAC-HELO's (36 PAC-HELO.PLAYER), GOLF's (37 GOLF.PLAYER),
// ASURA's (38 ASURA.PLAYER), TTRO's (39 TTRO.PLAYER), ASTROMAN's (40
// ASTROMAN.PLAYER), YINAN's (41 YINAN.PLAYER), AYA's (42 AYA.PLAYER),
// DoraEmon's (46 B6.PLAYER), RARIO's (47 RARIO.PLAYER) and TRAINING's (48
// TRAINING.PLAYER); SHUWA's, an authored fighter with no file of his own
// (RYUKO's export with his drawings, export_authored); and each stage's
// objects, images and track.
import ryuko from './generated/assets.json';
import zoma from './generated/zoma.json';
import kiki from './generated/kiki.json';
import chung from './generated/chung.json';
import amiro from './generated/amiro.json';
import anmc from './generated/anmc.json';
import giant from './generated/giant.json';
import suneo from './generated/suneo.json';
import yo from './generated/yo.json';
import sin from './generated/sin.json';
import lizard from './generated/lizard.json';
import kay from './generated/kay.json';
import dido from './generated/dido.json';
import sakuya from './generated/sakuya.json';
import alex from './generated/alex.json';
import sou from './generated/sou.json';
import hiso from './generated/hiso.json';
import erus from './generated/erus.json';
import feng from './generated/feng.json';
import sean from './generated/sean.json';
import gon from './generated/gon.json';
import kate from './generated/kate.json';
import remu from './generated/remu.json';
import rear from './generated/rear.json';
import gigi from './generated/gigi.json';
import sww from './generated/sww.json';
import ogi from './generated/ogi.json';
import ziro from './generated/ziro.json';
import masa from './generated/masa.json';
import times from './generated/times.json';
import zenka from './generated/zenka.json';
import zmega from './generated/zmega.json';
import alpha from './generated/alpha.json';
import shinz from './generated/shinz.json';
import zaku from './generated/zaku.json';
import pachelo from './generated/pachelo.json';
import golf from './generated/golf.json';
import asura from './generated/asura.json';
import ttro from './generated/ttro.json';
import astroman from './generated/astroman.json';
import yinan from './generated/yinan.json';
import aya from './generated/aya.json';
import dora from './generated/dora.json';
import rario from './generated/rario.json';
import training from './generated/training.json';
import shuwa from './generated/shuwa.json';
import stages from './generated/stages.json';

export type Who =
  | 'ryuko'
  | 'zoma'
  | 'kiki'
  | 'chung'
  | 'amiro'
  | 'anmc'
  | 'giant'
  | 'suneo'
  | 'yo'
  | 'sin'
  | 'lizard'
  | 'kay'
  | 'dido'
  | 'sakuya'
  | 'alex'
  | 'sou'
  | 'hiso'
  | 'erus'
  | 'feng'
  | 'sean'
  | 'gon'
  | 'kate'
  | 'remu'
  | 'rear'
  | 'gigi'
  | 'sww'
  | 'ogi'
  | 'ziro'
  | 'masa'
  | 'times'
  | 'zenka'
  | 'zmega'
  | 'alpha'
  | 'shinz'
  | 'zaku'
  | 'pachelo'
  | 'golf'
  | 'asura'
  | 'ttro'
  | 'astroman'
  | 'yinan'
  | 'aya'
  | 'dora'
  | 'rario'
  | 'training'
  | 'shuwa';
export const CHARACTERS = {
  ryuko,
  zoma,
  kiki,
  chung,
  amiro,
  anmc,
  giant,
  suneo,
  yo,
  sin,
  lizard,
  kay,
  dido,
  sakuya,
  alex,
  sou,
  hiso,
  erus,
  feng,
  sean,
  gon,
  kate,
  remu,
  rear,
  gigi,
  sww,
  ogi,
  ziro,
  masa,
  times,
  zenka,
  zmega,
  alpha,
  shinz,
  zaku,
  pachelo,
  golf,
  asura,
  ttro,
  astroman,
  yinan,
  aya,
  dora,
  rario,
  training,
  shuwa,
};
// Each other fighter's export: Ryuko's keys, and the twins pairing its victim
// actions with hers (export_fighter). The export declares it for each file
// (*.d.json.ts), since inferring every fighter's JSON took most of the type
// check.
export type FighterData = typeof ryuko & {
  // The win's and draw's timelines when they roll, test or move
  // (export_fighter).
  resultScripts: Partial<Record<'win' | 'draw', string>>;
  twins: Record<string, number>;
  aliases: Record<string, number>;
  counters: Record<string, [number, number, number][]>;
  neutralTests: Record<string, GlobalTest[]>;
};
// An op 0x1f test of a global.
export type GlobalTest = {
  op: 'test';
  selector: number;
  compare: number;
  value: number;
  action: number;
  offset: number;
};
export type Stage = keyof typeof stages;
export const STAGES = stages;
// The container an object's scripts and images come from: a player's, the
// stage's, or SCWU.KGT's (the hit count's objects, export_ui).
export type Container = Who | Stage | 'kgt';

// The life in the player's parameter block (+0x7caa): Ryuko's and Chung's
// 510, Zoma's and Kiki's 490, Amiro's 470, ANMC P's 450, Giant's 550, G
// Suneo's 500, Yo's 480, SIN's 550, LIZARD's 510, KAY's 500, DIDO's 490,
// SAKUYA's 470, ALEX's 450, SOU's and HISO's 480, ERUS's 450, OS FENG's 470,
// SEAN's 500, GON's 470, KATE's 430, REMU's 480, REAR's 470,
// GIGI's 500, SWW's 460, OGI's 500, ZIRO's 470, MASA's 450, 3-TIMES's 400,
// ZENKA's 480, Z-MEGA's 350, ALPHA's 500, SHIN-Z's 800, ZAKU's and
// PAC-HELO's 200, GOLF's and ASURA's 300, TTRO's 820, ASTROMAN's 780,
// YINAN's 450, AYA's 500, DoraEmon's 600, RARIO's 450 and TRAINING's 500.
// Each block puts the desperation threshold at 30% (+0x7ca6), which 0x40e7c0
// compares against.
export const lifeOf = (who: Who) => CHARACTERS[who].life;
export const desperationOf = (who: Who) => Math.trunc((lifeOf(who) * 30) / 100);
// Round 1 sets the power per stock (+0x7cae) and the stock cap (+0x7cb2,
// 0x411f50–0x411f64), which 0x40e6f0 fills to: 100 and three, but ZAKU's and
// PAC-HELO's one, GOLF's and ASURA's two, ZENKA's, Z-MEGA's and ALPHA's five,
// SHIN-Z's six, and DoraEmon's five of 90.
export const perStockOf = (who: Who) => CHARACTERS[who].perStock;
export const stocksOf = (who: Who) => CHARACTERS[who].stocks;

// A response id selects the victim action from the victim's own table
// (0x40f539) and the hit effect from the striker's (0x40f567).
export const responsesOf = (who: Who): readonly number[] =>
  CHARACTERS[who].responses;
export const responseEffectsOf = (who: Who): readonly number[] =>
  CHARACTERS[who].response_effects;

// export_fighter pairs each other player's victim actions with Ryuko's
// through the response table and checks they play alike; the match runs
// theirs through their Ryuko twins' rules. Giant's UNCOUNTER reactions (126,
// 127) also follow DOWN's and J Att's.
const twins = Object.fromEntries(
  (
    [
      'zoma',
      'kiki',
      'chung',
      'amiro',
      'anmc',
      'giant',
      'suneo',
      'yo',
      'sin',
      'lizard',
      'kay',
      'dido',
      'sakuya',
      'alex',
      'sou',
      'hiso',
      'erus',
      'feng',
      'sean',
      'gon',
      'kate',
      'remu',
      'rear',
      'gigi',
      'sww',
      'ogi',
      'ziro',
      'masa',
      'times',
      'zenka',
      'zmega',
      'alpha',
      'shinz',
      'zaku',
      'pachelo',
      'golf',
      'asura',
      'ttro',
      'astroman',
      'yinan',
      'aya',
      'dora',
      'rario',
      'training',
      'shuwa',
    ] as const
  ).map((who) => {
    const own = new Map(
      Object.entries(CHARACTERS[who].twins).map(([r, z]) => [Number(r), z]),
    );
    const aliases: Record<string, number> = CHARACTERS[who].aliases;
    return [
      who,
      {
        own,
        ryuko: new Map([
          ...[...own].map(([r, z]) => [z, r] as const),
          ...Object.entries(aliases).map(([z, r]) => [Number(z), r] as const),
        ]),
      },
    ];
  }),
);
// The op 0x1f records on variables 2 and 4 that open Giant's and ERUS's
// reactions, and on global 10 ZAKU's and PAC-HELO's, in order: [variable, or
// a global's selector (0x80 up), value, the action a test enters at that
// value, or 0 for a set] (export_fighter).
export const countersOf = (
  who: Who,
): Record<string, [number, number, number][]> =>
  (CHARACTERS[who] as { counters?: Record<string, [number, number, number][]> })
    .counters ?? {};
// Each neutral action's tests of a global before its first display, which
// entering it takes (export_fighter).
export const neutralTestsOf = (
  who: Who,
): Record<string, readonly GlobalTest[] | undefined> =>
  (CHARACTERS[who] as { neutralTests?: Record<string, GlobalTest[]> })
    .neutralTests ?? {};
const named = (who: Who) => who[0].toUpperCase() + who.slice(1);
// Ryuko's source action `index` in the player's own container.
export function twin(who: Who, index: number) {
  if (who === 'ryuko') return index;
  const found = twins[who].own.get(index);
  if (found === undefined)
    throw new Error(`${named(who)} has no twin of Ryuko's action ${index}`);
  return found;
}
// The Ryuko action whose rules a player's victim action follows, if any.
export const twinOf = (who: Who, index: number) =>
  who === 'ryuko' ? index : twins[who].ryuko.get(index);

// Authored (HPA-858): per-fighter seat rules (DoraEmon's EN-charge actions,
// CPU EN command id, and KO RELOAD target action), replacing hard-coded
// action/command numbers in shared engine paths.
export interface SeatGate {
  readonly enChargeActions: ReadonlySet<number>;
  readonly enChargeCpuCommands: ReadonlySet<number>;
  readonly koReload: number;
}
export const SEAT_GATES: Partial<Record<Who, SeatGate>> = {
  dora: {
    enChargeActions: new Set([239, 240, 421]),
    enChargeCpuCommands: new Set([42]),
    koReload: 72,
  },
};

// Authored (HPA-972): the verified low-HP super gates — the op 0x11 life
// checks (value above 1) on the fighters' move scripts whose jump selects
// or unblocks a super's desperation form, keyed by (who, sourceKey). Each
// timeline holds exactly one such event, so no target or tick is needed to
// find it. The generated SourceEvent records carry no source PC: the PCs
// below are provenance from the engine reads (docs/evidence.md), not
// runtime keys. `below` true jumps into the super at the mark or under;
// false jumps away to the normal move at the mark or over, so the super is
// the fall-through.
export interface SuperGate {
  readonly below: boolean;
  readonly value: number;
}
export const SUPER_GATES: Partial<Record<Who, Record<string, SuperGate>>> = {
  // G BEAM EVIL (278/280) at 153 or less (Supers); the hidden super throws
  // the axe (226) at 153 or more, and its cancel bails to NO SUPER (251)
  // at 150 or more (Supers).
  ryuko: {
    '263': { below: true, value: 153 },
    '264': { below: true, value: 153 },
    '265': { below: true, value: 153 },
    '254+9': { below: false, value: 150 },
    '286': { below: false, value: 153 },
  },
  // SHUWA's SPECIUM RAY is her G BEAM (export_authored).
  shuwa: {
    '263': { below: true, value: 153 },
    '264': { below: true, value: 153 },
    '265': { below: true, value: 153 },
  },
  // Shin Spark (279) turns into BOMB at 147 or more (Zoma's supers).
  zoma: { '279': { below: false, value: 147 } },
  // lee and gesar turn into Evil Lee (295) and Evil gesar (307) at 153 or
  // less (Chung).
  chung: {
    '281': { below: true, value: 153 },
    '282+13': { below: true, value: 153 },
    '305': { below: true, value: 153 },
  },
  // funnal, NT and EN3 (medeo) turn into evil funnal (279), EVIL NT (295)
  // and Evil En3 (331) at 141 or less (Amiro).
  amiro: {
    '275': { below: true, value: 141 },
    '311': { below: true, value: 141 },
    '324': { below: true, value: 141 },
  },
  // At 165 or less Fire Start enters EVIL Fire (310, PC 4675), which rolls
  // into hidden fire start (318), and Air Fire EVIL Fire air (311,
  // PC 4645) (Giant).
  giant: {
    '300': { below: true, value: 165 },
    '304': { below: true, value: 165 },
    '305': { below: true, value: 165 },
  },
  // BP START enters BP EVIL (288) at 150 or less (PC 4209), and HH Start
  // enters no super at 150 or more (PC 5436) (G Suneo).
  suneo: {
    '279': { below: true, value: 150 },
    '281': { below: true, value: 150 },
    '345': { below: false, value: 150 },
  },
  // HIDDEN runs only below 150 on its SC path (PC 3180), and hidden start
  // throws the tofu (225) at 144 or more (PC 3361) (Yo).
  yo: {
    '233+9': { below: false, value: 150 },
    '245': { below: false, value: 144 },
  },
  // At 165 or less NOZAN takes its desperation form (252), otherwise its
  // start plays RUN CHUCK (PC 4537) (SIN).
  sin: {
    '250': { below: true, value: 165 },
    '310': { below: false, value: 165 },
  },
  // HID START plays as FIRE BALL START (214) at 153 or more
  // (PC 3749, LIZARD).
  lizard: { '279': { below: false, value: 153 } },
  // Hidden En300 (334) enters Sliding start (231) at 147 or more
  // (PC 4526, DIDO).
  dido: { '334': { below: false, value: 147 } },
  // Hidden EN3 (416) enters No super (357) above 135
  // (PC 6782, ERUS).
  erus: { '416': { below: false, value: 135 } },
  // Below 30% health SUPER SHOOT START takes EXIL SS (316) at 150 or less
  // (PC 4490, OS FENG).
  feng: {
    '309': { below: true, value: 150 },
    '311': { below: true, value: 150 },
  },
  // Below 30% health Super shoot start (241) takes EVIL SHOOT START (249)
  // at 150 or less (PC 3579, SEAN); its SC path (245) takes the same.
  sean: {
    '241': { below: true, value: 150 },
    '245': { below: true, value: 150 },
  },
  // Hidden en300 (446) enters Chuck (241) at 141 or more
  // (PC 7543, GON).
  gon: { '446': { below: false, value: 141 } },
  // At 129 or less EN slash start (268) enters EN slash evil start (275)
  // (PC 3859, KATE); its SC path (252+6) takes the same.
  kate: {
    '252+6': { below: true, value: 129 },
    '268': { below: true, value: 129 },
  },
  // NANAMI start (329) enters CALL DRILL (256) at 156 or more
  // (PC 4745, REMU), and its SC path (305+9) enters No super (302) at 156
  // or more (PC 4389).
  remu: {
    '305+9': { below: false, value: 156 },
    '329': { below: false, value: 156 },
  },
  // Evil EN3 (282) enters No super at 141 or more
  // (PC 4149, REAR).
  rear: { '282': { below: false, value: 141 } },
  // Above 138 roll crash start (371) enters no super (284)
  // (PC 5853, SWW).
  sww: { '371': { below: false, value: 138 } },
  // HiddenEN3 (494) enters CC START at 141 or more
  // (PC 8353, ZIRO).
  ziro: { '494': { below: false, value: 141 } },
  // R100 (519) and R300 (532) jump to Driver at 150 or more (PCs 9971 and
  // 10272, YINAN); 520, their shared second form, checks the same.
  yinan: {
    '519': { below: false, value: 150 },
    '520': { below: false, value: 150 },
    '532': { below: false, value: 150 },
  },
  // DANKU SHOT (373) takes EVIL DANKU LOW (375) at 144 or less
  // (PC 5870), and KOKAKEN (438) enters No super (353) at 144 or more
  // (PC 7014) (SOU).
  sou: {
    '373': { below: true, value: 144 },
    '438': { below: false, value: 144 },
  },
};
export const superGateOf = (who: Who, key: string): SuperGate | undefined =>
  SUPER_GATES[who]?.[key];
