// Each player's exported container data: Ryuko's (01 RYUKO.PLAYER), Zoma's
// (02 ZOMA.PLAYER), Kiki's (03 KIKI.PLAYER), Chung's (04 CHUNG.PLAYER) and
// Amiro's (05 AMIRO.PLAYER);
// and each stage's objects, images and track.
import ryuko from './generated/assets.json';
import zoma from './generated/zoma.json';
import kiki from './generated/kiki.json';
import chung from './generated/chung.json';
import amiro from './generated/amiro.json';
import stages from './generated/stages.json';

export type Who = 'ryuko' | 'zoma' | 'kiki' | 'chung' | 'amiro';
export const CHARACTERS = { ryuko, zoma, kiki, chung, amiro };
export type Stage = keyof typeof stages;
export const STAGES = stages;
// The container an object's scripts and images come from.
export type Container = Who | Stage;

// The life in the player's parameter block (+0x7caa): Ryuko's and Chung's
// 510, Zoma's and Kiki's 490, Amiro's 470. Each block puts the desperation threshold at 30% (+0x7ca6),
// which 0x40e7c0 compares against.
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
// theirs through their Ryuko twins' rules.
const twins = Object.fromEntries(
  (['zoma', 'kiki', 'chung', 'amiro'] as const).map((who) => {
    const own = new Map(
      Object.entries(CHARACTERS[who].twins).map(([r, z]) => [Number(r), z]),
    );
    return [who, { own, ryuko: new Map([...own].map(([r, z]) => [z, r])) }];
  }),
);
const named = (who: Who) => who[0].toUpperCase() + who.slice(1);
// Ryuko's source action `index` in the player's own container.
export function twin(who: Who, index: number) {
  if (who === 'ryuko') return index;
  const found = twins[who].own.get(index);
  if (found === undefined)
    throw new Error(`${named(who)} has no twin of Ryuko's action ${index}`);
  return found;
}
// The Ryuko action whose rules a player's victim action follows; 0 (none)
// stays 0.
export function ryukoTwin(who: Who, index: number) {
  if (who === 'ryuko' || !index) return index;
  const found = twins[who].ryuko.get(index);
  if (found === undefined)
    throw new Error(`${named(who)}'s action ${index} has no Ryuko twin`);
  return found;
}
