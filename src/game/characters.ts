// Each player's exported container data: Ryuko's (01 RYUKO.PLAYER) and
// Zoma's (02 ZOMA.PLAYER); and each stage's objects, images and track.
import ryuko from './generated/assets.json';
import zoma from './generated/zoma.json';
import stages from './generated/stages.json';

export type Who = 'ryuko' | 'zoma';
export const CHARACTERS = { ryuko, zoma };
export type Stage = keyof typeof stages;
export const STAGES = stages;
// The container an object's scripts and images come from.
export type Container = Who | Stage;

// The life in the player's parameter block (+0x7caa): 510 and 490. Both
// blocks put the desperation threshold at 30% (+0x7ca6), which 0x40e7c0
// compares against.
export const lifeOf = (who: Who) => CHARACTERS[who].life;
export const desperationOf = (who: Who) => Math.trunc((lifeOf(who) * 30) / 100);

// A response id selects the victim action from the victim's own table
// (0x40f539) and the hit effect from the striker's (0x40f567).
export const responsesOf = (who: Who): readonly number[] =>
  CHARACTERS[who].responses;
export const responseEffectsOf = (who: Who): readonly number[] =>
  CHARACTERS[who].response_effects;

// export_zoma pairs Zoma's victim actions with Ryuko's through the response
// table and checks they play alike; the match runs a Zoma victim's through
// its Ryuko twin's rules.
const zomaTwins = new Map(
  Object.entries(zoma.twins).map(([r, z]) => [Number(r), z]),
);
const ryukoTwins = new Map([...zomaTwins].map(([r, z]) => [z, r]));
// Ryuko's source action `index` in the player's own container.
export function twin(who: Who, index: number) {
  if (who === 'ryuko') return index;
  const found = zomaTwins.get(index);
  if (found === undefined)
    throw new Error(`Zoma has no twin of Ryuko's action ${index}`);
  return found;
}
// The Ryuko action whose rules a player's victim action follows; 0 (none)
// stays 0.
export function ryukoTwin(who: Who, index: number) {
  if (who === 'ryuko' || !index) return index;
  const found = ryukoTwins.get(index);
  if (found === undefined)
    throw new Error(`Zoma's action ${index} has no Ryuko twin`);
  return found;
}
