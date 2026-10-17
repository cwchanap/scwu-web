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
// ZAKU.PLAYER), PAC-HELO's (36 PAC-HELO.PLAYER) and GOLF's (37
// GOLF.PLAYER); and each stage's objects, images and track.
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
  | 'golf';
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
};
// Each other fighter's export: Ryuko's keys, and the twins pairing its victim
// actions with hers (export_fighter). The export declares it for each file
// (*.d.json.ts), since inferring every fighter's JSON took most of the type
// check.
export type FighterData = typeof ryuko & {
  twins: Record<string, number>;
  aliases: Record<string, number>;
  counters: Record<string, [number, number, number][]>;
};
export type Stage = keyof typeof stages;
export const STAGES = stages;
// The container an object's scripts and images come from.
export type Container = Who | Stage;

// The life in the player's parameter block (+0x7caa): Ryuko's and Chung's
// 510, Zoma's and Kiki's 490, Amiro's 470, ANMC P's 450, Giant's 550, G
// Suneo's 500, Yo's 480, SIN's 550, LIZARD's 510, KAY's 500, DIDO's 490,
// SAKUYA's 470, ALEX's 450, SOU's and HISO's 480, ERUS's 450, OS FENG's 470,
// SEAN's 500, GON's 470, KATE's 430, REMU's 480, REAR's 470,
// GIGI's 500, SWW's 460, OGI's 500, ZIRO's 470, MASA's 450, 3-TIMES's 400,
// ZENKA's 480, Z-MEGA's 350, ALPHA's 500, SHIN-Z's 800, ZAKU's and
// PAC-HELO's 200, GOLF's 300.
// Each block puts the desperation threshold at 30% (+0x7ca6), which 0x40e7c0
// compares against.
export const lifeOf = (who: Who) => CHARACTERS[who].life;
export const desperationOf = (who: Who) => Math.trunc((lifeOf(who) * 30) / 100);

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
// reactions, in order: [variable, value, the action a test enters at that
// value, or 0 for a set] (export_fighter).
export const countersOf = (
  who: Who,
): Record<string, [number, number, number][]> =>
  (CHARACTERS[who] as { counters?: Record<string, [number, number, number][]> })
    .counters ?? {};
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
