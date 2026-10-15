// Each player's exported container data: Ryuko's (01 RYUKO.PLAYER), Zoma's
// (02 ZOMA.PLAYER), Kiki's (03 KIKI.PLAYER), Chung's (04 CHUNG.PLAYER),
// Amiro's (05 AMIRO.PLAYER), ANMC P's (06 ANMC P.PLAYER), Giant's
// (07 GIANT.PLAYER), G Suneo's (08 G SUNEO.PLAYER), Yo's (09 YO.PLAYER),
// SIN's (10 SIN.PLAYER), LIZARD's (11 LIZARD.PLAYER), KAY's (12 KAY.PLAYER),
// DIDO's (13 DIDO.PLAYER), SAKUYA's (14 SAKUYA.PLAYER) and ALEX's
// (15 ALEX.PLAYER);
// and each stage's objects, images and track.
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
  | 'alex';
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
};
export type Stage = keyof typeof stages;
export const STAGES = stages;
// The container an object's scripts and images come from.
export type Container = Who | Stage;

// The life in the player's parameter block (+0x7caa): Ryuko's and Chung's
// 510, Zoma's and Kiki's 490, Amiro's 470, ANMC P's 450, Giant's 550, G
// Suneo's 500, Yo's 480, SIN's 550, LIZARD's 510, KAY's 500, DIDO's 490,
// SAKUYA's 470, ALEX's 450.
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
// Giant's reactions that open by testing his counter's variable 4, with the
// action it enters at 100, or 0 for those that clear it (export_fighter).
export const countersOf = (who: Who): Record<string, number> =>
  (CHARACTERS[who] as { counters?: Record<string, number> }).counters ?? {};
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
// The same, required; 0 (none) stays 0.
export function ryukoTwin(who: Who, index: number) {
  if (who === 'ryuko' || !index) return index;
  const found = twinOf(who, index);
  if (found === undefined)
    throw new Error(`${named(who)}'s action ${index} has no Ryuko twin`);
  return found;
}
