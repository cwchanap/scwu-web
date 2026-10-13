import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import {
  animationDuration,
  animationFrame,
  BLACK,
  CHUNG_INTRO_EX_TICK,
} from './animations';
import type { Action } from './animations';
import { exMode, fighterPose, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { enter, pose } from './testing';

const VELOCITY = (655 / 65536) * 1.5;
const raw = (f: Fighter) => [f.vx / f.facing / VELOCITY, f.vy / VELOCITY];

// Chung as player 1, `gap` from a standing Ryuko.
function chungPlayer(gap = 120) {
  const match = new Match('practice', false, 0, ['chung', 'ryuko']);
  const [chung, ryuko] = match.fighters;
  ryuko.x = chung.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input);
  };
  return { match, chung, ryuko, steps };
}
const until = (match: Match, done: () => boolean, limit = 3000) => {
  for (let t = 0; t < limit; t++) {
    if (done()) return t;
    match.step();
  }
  throw new Error('never happened');
};
// Queues a victim action as a contact does, entered at the next step.
function react(match: Match, f: Fighter, action: Action) {
  (match as unknown as { queue(f: Fighter, a: Action): void }).queue(f, action);
  match.step();
}

describe('Chung (04 CHUNG.PLAYER)', () => {
  it("takes Ryuko's life from his parameter block: 510, desperate at 153", () => {
    expect([lifeOf('chung'), desperationOf('chung')]).toEqual([510, 153]);
    const { chung } = chungPlayer();
    expect(chung).toMatchObject({ who: 'chung', hp: 510, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.chung.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('chung')[id]]] : [],
    );
    expect(paired).toHaveLength(69);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("reads his own command table, entering each move's source action", () => {
    expect(CHARACTERS.chung.levels).toMatchObject({
      13: 30, // Dash F
      181: 21, // P1
      229: 31, // TO EX
      281: 41, // lee
      329: 42, // en300 start
    });
    const { chung, steps } = chungPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(chung).toMatchObject({ action: 'script', branch: 181, age: 0 });
  });

  it('flies out of HISA Down (127) at raw −800 (PC 1582), as Kiki does', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'chung']);
    const victim = match.fighters[1];
    pose(match, victim, 'launchDown', 0);
    while (victim.age < 9) match.step();
    expect(raw(victim)[0]).toBeCloseTo(-800, 6);
  });

  it('burns his crouching kick’s victim through Fire HISA (response 48, action 104)', () => {
    expect(responsesOf('ryuko')[48]).toBe(104);
    const { match, chung, ryuko } = chungPlayer(100);
    enter(match, chung, 206);
    expect(until(match, () => ryuko.action === 'fireLaunch')).toBe(31);
    // Op 0x15 (PC 1304), op 0x1a (PC 1307) and op 0x23's colour (PC 1309).
    expect(ryuko).toMatchObject({ hp: 492, hitStop: 13, power: 5 });
    expect(fighterPose(ryuko).color).toMatchObject({ mode: 0, r: 10, g: 5 });
    until(match, () => ryuko.age === 6);
    match.step();
    // HISA's flight (PC 1318), with Ryuko's own fire objects (403, PC 1311).
    expect(raw(ryuko)[0]).toBeCloseTo(-600, 6);
    expect(match.effects.some((e) => e.who === 'ryuko' && e.clip === 403)).toBe(
      true,
    );
    until(match, () => ryuko.action !== 'fireLaunch');
    expect(ryuko.action).toBe('knockdown');
  });

  it('throws his chuck’s victim flat out to the wall (response 37, op 0x02 slot 4)', () => {
    expect(responsesOf('ryuko')[37]).toBe(91);
    const { match, chung, ryuko } = chungPlayer(80);
    enter(match, chung, 221);
    until(match, () => ryuko.action === 'flySide');
    until(match, () => ryuko.age === 7);
    // PC 1081: −1500 and −500, with no fall.
    expect(raw(ryuko)).toEqual([
      expect.closeTo(-1500, 6),
      expect.closeTo(-500, 6),
    ]);
    expect(ryuko.gravity).toBe(0);
    // The wall stops it (0x40fcab) and queues 95, which holds it there.
    const t = until(match, () => ryuko.action === 'flySideWall');
    expect(t).toBe(26);
    const { x, y } = ryuko;
    until(match, () => ryuko.age === 17);
    expect([ryuko.x, ryuko.y]).toEqual([x, y]);
    // PC 1141 drops it at age 18, landing into 146 (PC 1140).
    match.step();
    expect(ryuko.y).toBeGreaterThan(y);
    until(match, () => ryuko.action !== 'flySideWall');
    expect([ryuko.action, ryuko.y]).toEqual(['knockdown', 0]);
  });

  it('clings to the wall his jump move reaches (op 0x02 slot 4, PC 3846), kicking off it with K', () => {
    for (const [press, after, damage] of [
      [{}, 7, 0],
      [{ kick: true }, 269, 30],
      [{ punch: true }, 273, 0],
    ] as const) {
      const { match, chung, ryuko } = chungPlayer(375);
      chung.x = 225;
      match.step();
      enter(match, chung, 266);
      // JUMP WALL (267) stops him there, then 'wall rp' (268) checks K, P
      // and up every 5 ticks (PCs 3859–3861) and falls (7) once they run out.
      until(match, () => chung.branch === 267);
      const x = chung.x;
      until(match, () => chung.age === 8);
      match.step(press);
      until(match, () => chung.branch !== 267);
      expect([chung.branch, x, ryuko.hp]).toEqual([after, 75, 510]);
      until(match, () => chung.action === 'idle');
      expect(510 - ryuko.hp).toBe(damage);
    }
  });

  it('spins EN300’s victim to the wall, which bounces it back into 87 (responses 57, 94)', () => {
    expect(responsesOf('ryuko')[57]).toBe(136);
    const { match, ryuko } = chungPlayer();
    ryuko.y = -300;
    react(match, ryuko, 'twistSide');
    until(match, () => ryuko.action === 'twistWall');
    // PC 1126: back out at +700 and −800 at age 8, spinning until landing.
    until(match, () => ryuko.age === 8);
    match.step();
    expect(raw(ryuko)[0]).toBeCloseTo(700, 6);
    until(match, () => ryuko.action !== 'twistWall');
    expect(ryuko.action).toBe('knockdown');
  });

  it('plays EN300 through its shock, hold and tosses', () => {
    const { match, chung, ryuko } = chungPlayer();
    chung.stock = 3;
    enter(match, chung, 329);
    const seen = new Set<Action>();
    until(match, () => {
      seen.add(ryuko.action);
      return ryuko.action === 'knockdown';
    });
    // Response 33's shock, then op 0x07 holds it (PC 5090) and op 0x14
    // applies 82, 76, 41, 56 and 57 (PCs 5100–5196).
    for (const action of [
      'shock',
      'liftUp',
      'rushAirHit',
      'chuckToss',
      'drillDown',
      'twistSide',
      'fly',
    ] as const)
      expect(seen).toContain(action);
    expect(ryuko.hp).toBe(289);
  });

  it('floats GON MISS’s victim 70 ticks, then takes 40 life into HISA (PCs 1871–1875)', () => {
    expect(responsesOf('ryuko')[61]).toBe(137);
    const { match, chung, ryuko } = chungPlayer();
    ryuko.y = -200;
    react(match, ryuko, 'gonMiss');
    expect(raw(ryuko)).toEqual([
      expect.closeTo(-330, 6),
      expect.closeTo(-430, 6),
    ]);
    until(match, () => ryuko.action !== 'gonMiss');
    expect(ryuko).toMatchObject({
      action: 'launchAway',
      age: 0,
      hp: 470,
      hitStop: 13,
      // GON MISS's own op 0x15 and HISA's.
      power: 10,
    });
    expect([chung.power, chung.hitStop]).toEqual([6, 13]);
  });

  it('toggles EX mode with --TYPE--: TO EX (229) sets variable 0 to 100, TO NOR clears it', () => {
    const { match, chung } = chungPlayer();
    chung.stock = 1;
    enter(match, chung, 229);
    expect([chung.variables[0], exMode(chung), chung.stock]).toEqual([
      100,
      true,
      0,
    ]);
    // His HUD face cycles as Ryuko's does (action 73, PCs 675–692).
    until(match, () => chung.action === 'idle');
    match.step();
    expect(chung.face).toBeGreaterThan(0);
    enter(match, chung, 229);
    expect([chung.branch, chung.variables[0], exMode(chung)]).toEqual([
      230,
      0,
      false,
    ]);
  });

  it('stands in his EX stance while variable 0 is 100 (idle PC 9 jumps to PC 18)', () => {
    const first = (ex: number) => {
      const vm = new StandingVM(CHARACTERS.chung.idle, 0, 10, { 0x40: ex });
      vm.tick();
      return vm.frame?.image;
    };
    expect([first(0), first(100)]).toEqual([113, 372]);
  });

  it('enters EX mode with down held as his Vs. intro checks it (PC 338)', () => {
    expect(CHUNG_INTRO_EX_TICK).toBe(150);
    expect(animationDuration('intro', 'chung')).toBe(150);
    const match = new Match('cpu', true, 0, ['chung', 'ryuko']);
    const chung = match.fighters[0];
    for (let t = 0; t < 150; t++) match.step({ crouch: true });
    expect([chung.action, exMode(chung)]).toEqual(['idle', true]);
    const late = new Match('cpu', true, 0, ['chung', 'ryuko']);
    for (let t = 0; t < 150; t++) late.step({});
    expect(exMode(late.fighters[0])).toBe(false);
  });

  it('wins with Demo stand (27), then smoke behind a blank display (PCs 543–548)', () => {
    expect(
      [0, 15, 25, 40, 50, 69, 70].map(
        (age) => animationFrame('win', age, 'chung').image,
      ),
    ).toEqual([113, 114, 115, 114, 8191, 8191, 293]);
    expect(animationDuration('win', 'chung')).toBe(75);
    expect(BLACK.chung.opaque.image).toBe(1009);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'chung']);
    const chung = match.fighters[1];
    const entered = new Set<unknown>();
    // Fire ball, lee and cpu jump wall (410), which has no key.
    const wanted = [233, 281, 410];
    for (let t = 0; t < 6000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (chung.action === 'script') entered.add(chung.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
