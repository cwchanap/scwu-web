import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import {
  animationDuration,
  animationFrame,
  ANMC_INTRO_EX_TICK,
  BLACK,
} from './animations';
import type { Action } from './animations';
import { exMode, fighterPose, Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { enter } from './testing';

const VELOCITY = (655 / 65536) * 1.5;
const raw = (f: Fighter) => [f.vx / f.facing / VELOCITY, f.vy / VELOCITY];

// ANMC P as player 1, `gap` from a standing Ryuko.
function anmcPlayer(gap = 90) {
  const match = new Match('practice', false, 0, ['anmc', 'ryuko']);
  const [anmc, ryuko] = match.fighters;
  ryuko.x = anmc.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input);
  };
  return { match, anmc, ryuko, steps };
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
// The source actions a fighter plays while pressing `input` every sixth tick.
function chain(f: Fighter, steps: (input: Input) => void, input: Input) {
  const seen: unknown[] = [];
  for (let t = 0; t < 400; t++) {
    steps(t % 6 ? {} : input);
    const now = f.action === 'script' ? f.branch : f.action;
    if (seen.at(-1) !== now) seen.push(now);
  }
  return seen;
}

describe('ANMC P (06 ANMC P.PLAYER)', () => {
  it('takes 450 life from his parameter block, desperate at 135', () => {
    expect([lifeOf('anmc'), desperationOf('anmc')]).toEqual([450, 135]);
    const { anmc } = anmcPlayer();
    expect(anmc).toMatchObject({ who: 'anmc', hp: 450, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's through his 84-entry response table", () => {
    // The loader reads the table's own count (0x403b87); no op 0x17 or
    // 0x14 names the 84th.
    expect(responsesOf('anmc')).toHaveLength(84);
    const twins = CHARACTERS.anmc.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('anmc')[id]]] : [],
    );
    expect(paired).toHaveLength(69);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("reads his own command table, entering each move's source action", () => {
    expect(CHARACTERS.anmc.levels).toMatchObject({
      14: 0, // DASH F
      203: 21, // P1
      242: 31, // to ex
      245: 31, // Fire start
      283: 41, // super ball start
      303: 42, // EN 300 START
    });
    const { anmc, steps } = anmcPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(anmc).toMatchObject({ action: 'script', branch: 203, age: 0 });
  });

  it('chucks with cHUCK NEW (232), or CHUCK (238) in EX mode (PC 3143)', () => {
    for (const [ex, moves, toss] of [
      [0, [232, 233], 'twist'],
      // CHUCK HIT tosses through response 38 (PC 3265): Fly twis (92), which
      // flies as Chuck Twis side does.
      [100, [238, 239], 'twistSide'],
    ] as const) {
      const { anmc, ryuko, steps } = anmcPlayer();
      anmc.variables[0] = ex;
      steps({}, 2);
      const seen = new Set<unknown>();
      for (let t = 0; ryuko.hp === 510 && t < 400; t++) {
        steps(t % 6 ? {} : { throw: true });
        if (anmc.action === 'script') seen.add(anmc.branch);
      }
      expect([...seen]).toEqual(expect.arrayContaining([...moves]));
      expect([ryuko.hp, ryuko.action]).toEqual([485, toss]);
    }
  });

  it('kicks through K2 NEW and K3 NEW, or K 2 and K3 in EX mode (PCs 2737, 2838)', () => {
    for (const [ex, moves] of [
      [0, [207, 208, 209, 214]],
      [100, [207, 208, 210, 216]],
    ] as const) {
      const { anmc, steps } = anmcPlayer();
      anmc.variables[0] = ex;
      steps({}, 2);
      expect(chain(anmc, steps, { kick: true }).slice(0, 4)).toEqual(moves);
    }
  });

  it('toggles EX mode with --TYPE CHANGE--: to ex (242) sets variable 0 to 100 for half a stock, TO NOR clears it', () => {
    const { match, anmc } = anmcPlayer();
    anmc.stock = 1;
    enter(match, anmc, 242);
    expect([anmc.variables[0], exMode(anmc), anmc.stock, anmc.power]).toEqual([
      100,
      true,
      0,
      50,
    ]);
    until(match, () => anmc.action === 'idle');
    enter(match, anmc, 242);
    expect([anmc.branch, anmc.variables[0], exMode(anmc)]).toEqual([
      243,
      0,
      false,
    ]);
  });

  it('repeats the end of his idle three times when it rolls (op 0x09, PC 20)', () => {
    const images = (seed: number) => {
      const vm = new StandingVM(CHARACTERS.anmc.idle, seed);
      while (!vm.ended) vm.tick();
      return vm.events.map((e) => e.image);
    };
    // Rand % 3 > 1 (PC 14) jumps to the call of PCs 24–27, which returns to
    // PC 21.
    expect(images(0)).toEqual([
      113,
      114,
      ...Array(3).fill([115, 116, 117]).flat(),
      114,
    ]);
    expect(images(2)).toEqual([113, 114, 115, 116, 117, 114]);
  });

  it('guards in his EX costume while variable 0 is 100 (op 0x1f, PC 1970)', () => {
    const { anmc } = anmcPlayer();
    const image = (action: Action) => {
      Object.assign(anmc, { action, age: 0 });
      return fighterPose(anmc).image;
    };
    expect([image('block'), image('crouchBlock')]).toEqual([133, 134]);
    anmc.variables[0] = 100;
    // EX Gard S St (152) and S Si (156).
    expect([image('block'), image('crouchBlock')]).toEqual([262, 264]);
  });

  it('takes 5 power and gives 3 in Tatumaki >> (PC 1229), and flies out of HISA Down at −800 (PC 1631)', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'anmc']);
    const [ryuko, anmc] = match.fighters;
    react(match, anmc, 'tatumakiOut');
    expect([anmc.power, ryuko.power]).toEqual([5, 3]);
    react(match, anmc, 'launchDown');
    until(match, () => anmc.age === 9);
    expect(raw(anmc)[0]).toBeCloseTo(-800, 6);
  });

  it('enters EX mode with down held as his Vs. intro checks it (PC 363)', () => {
    expect([ANMC_INTRO_EX_TICK, animationDuration('intro', 'anmc')]).toEqual([
      156, 200,
    ]);
    const match = new Match('cpu', true, 0, ['anmc', 'zoma']);
    const anmc = match.fighters[0];
    const { x } = anmc;
    for (let t = 0; t < 200; t++) match.step({ crouch: t >= 150 });
    // Round 1 (35) has no op 0x01: he stands where he starts.
    expect([anmc.action, anmc.x, exMode(anmc)]).toEqual(['idle', x, true]);
  });

  it('wins with DEMO STAND (30), then holds image 324 (PCs 571–582)', () => {
    expect(
      [0, 15, 41, 48, 56, 64, 72, 500].map(
        (age) => animationFrame('win', age, 'anmc').image,
      ),
    ).toEqual([113, 114, 122, 163, 322, 323, 324, 324]);
    expect(BLACK.anmc.opaque.image).toBe(1009);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'anmc']);
    const anmc = match.fighters[1];
    const entered = new Set<unknown>();
    // Fire start, fly move and cpu DJ (375), which has no key.
    const wanted = [245, 268, 375];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (anmc.action === 'script') entered.add(anmc.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
