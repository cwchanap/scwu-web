import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import {
  AMIRO_INTRO_EX_TICK,
  animationDuration,
  animationFrame,
  BLACK,
  script,
} from './animations';
import type { Action } from './animations';
import { exMode, Match, STAGE_WIDTH } from './match';
import type { Fighter, Input } from './match';
import { enter } from './testing';

const VELOCITY = (655 / 65536) * 1.5;
const raw = (f: Fighter) => [f.vx / f.facing / VELOCITY, f.vy / VELOCITY];

// Amiro as player 1, `gap` from a standing Ryuko.
function amiroPlayer(gap = 120) {
  const match = new Match('practice', false, 0, ['amiro', 'ryuko']);
  const [amiro, ryuko] = match.fighters;
  ryuko.x = amiro.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input);
  };
  return { match, amiro, ryuko, steps };
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

describe('Amiro (05 AMIRO.PLAYER)', () => {
  it('takes 470 life from her parameter block, desperate at 141', () => {
    expect([lifeOf('amiro'), desperationOf('amiro')]).toEqual([470, 141]);
    const { amiro } = amiroPlayer();
    expect(amiro).toMatchObject({ who: 'amiro', hp: 470, action: 'idle' });
  });

  it("pairs her victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.amiro.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('amiro')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    for (const [twin, own] of paired) expect(twin).toBe(own);
  });

  it("reads her own command table, entering each move's source action", () => {
    expect(CHARACTERS.amiro.levels).toMatchObject({
      13: 30, // Dash F
      182: 21, // P1
      214: 31, // EX Ch
      275: 41, // funnal start
      324: 42, // EN3 start
    });
    const { amiro, steps } = amiroPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(amiro).toMatchObject({ action: 'script', branch: 182, age: 0 });
  });

  it('drives in on her car in her Vs. intro, Round BR (33)', () => {
    const match = new Match('cpu', true, 0, ['amiro', 'zoma']);
    const amiro = match.fighters[0];
    // Raw 600 for 32 ticks (PC 367), then 60 for 15 (PC 372).
    expect(STAGE_WIDTH / 2 - 180 - amiro.x).toBeCloseTo(
      (600 * 32 + 60 * 15) * VELOCITY,
      6,
    );
    match.step();
    // PC 364: her car (35) follows her in slot 9 (op 0x04 flags 0x21).
    expect(match.effects.find((e) => e.clip === 35)).toMatchObject({
      owner: 0,
      slot: 9,
      follow: expect.anything(),
    });
    // Round BR then calls Demo stand once (PC 388).
    expect([AMIRO_INTRO_EX_TICK, animationDuration('intro', 'amiro')]).toEqual([
      63, 198,
    ]);
    for (let t = 1; t < 115; t++) match.step({ crouch: t >= 60 });
    // PCs 375–377: a free copy (35 + 10) replaces it and drives away.
    expect(match.effects.map((e) => e.clip)).toContain('35+10');
    expect(match.effects.map((e) => e.clip)).not.toContain(35);
    for (let t = 115; t < 198; t++) match.step({ crouch: true });
    expect(amiro.action).toBe('idle');
    expect(amiro.x).toBeCloseTo(STAGE_WIDTH / 2 - 180, 6);
    // PC 382 enters EX CHANGE (39) + 3 while down is held.
    expect(exMode(amiro)).toBe(true);
  });

  it('flies out of HISA Down (128) at −800 and Tatumaki >> (105) at −300', () => {
    const match = new Match('practice', false, 0, ['ryuko', 'amiro']);
    const victim = match.fighters[1];
    react(match, victim, 'tatumakiOut');
    expect(raw(victim)[0]).toBeCloseTo(-300, 6);
    react(match, victim, 'launchDown');
    until(match, () => victim.age === 9);
    expect(raw(victim)[0]).toBeCloseTo(-800, 6);
  });

  it('throws Coment chuck’s victim straight up through Chuck up (response 52, action 134)', () => {
    expect(responsesOf('ryuko')[52]).toBe(134);
    const { match, amiro, ryuko } = amiroPlayer(100);
    enter(match, amiro, 242);
    until(match, () => ryuko.action === 'chuckUp');
    // cc hit's op 0x14 (PC 3738) after 30 damage; Chuck up's op 0x15 gives
    // the victim 5 power (PC 1818).
    expect(ryuko).toMatchObject({ hp: 480, power: 5 });
    until(match, () => ryuko.age === 2);
    // PC 1825, after its first display.
    expect(raw(ryuko)[0]).toBeCloseTo(-160, 6);
    until(match, () => ryuko.action !== 'chuckUp');
    expect([ryuko.action, ryuko.y]).toEqual(['knockdown', 0]);
  });

  it('rolls whether her knockdown (84) skips its sound (PC 990)', () => {
    const branches = [0, 1, 2, 3, 4, 5, 6, 7].map((seed) => {
      const match = new Match('practice', false, seed, ['ryuko', 'amiro']);
      const [ryuko, amiro] = match.fighters;
      amiro.x = ryuko.x + 100;
      match.step();
      enter(match, ryuko, 194);
      until(match, () => amiro.action === 'sweep');
      return amiro.branch;
    });
    expect(new Set(branches)).toEqual(new Set(['84+21', null]));
  });

  it('toggles EX mode with -----: EX Ch (214) sets variable 0 to 100 for half a stock, NOR Ch clears it', () => {
    const { match, amiro } = amiroPlayer();
    amiro.stock = 1;
    enter(match, amiro, 214);
    expect([
      amiro.variables[0],
      exMode(amiro),
      amiro.stock,
      amiro.power,
    ]).toEqual([100, true, 0, 50]);
    until(match, () => amiro.action === 'idle');
    enter(match, amiro, 214);
    expect([amiro.branch, amiro.variables[0], exMode(amiro)]).toEqual([
      215,
      0,
      false,
    ]);
  });

  it("plays NT's flying object through its calls' offsets and Nt Rp's own call", () => {
    const frames = script(314, 'amiro').frames.map((f) => [
      f.image,
      f.duration,
    ]);
    // Op 0x09 enters Skill6 (315) and Skill7 (316) at + 5 (PCs 4866–4867);
    // Nt Rp (318) and Nt Rp 2 (319), called three and two times (PCs
    // 4868–4869), each call their rest once more (op 0x0b + 3, PCs 4902,
    // 4930): three displays, twice per call.
    expect(frames).toEqual([
      [370, 6],
      ...Array(10).fill([370, 1]),
      ...Array(16).fill([371, 1]),
      ...Array(30).fill([372, 4]),
      ...Array(8).fill([371, 1]),
      [376, 8],
    ]);
  });

  it('wins with Demo stand (27), then poses (PCs 638–649)', () => {
    expect(
      [0, 40, 83, 88, 93, 101, 106].map(
        (age) => animationFrame('win', age, 'amiro').image,
      ),
    ).toEqual([113, 117, 179, 197, 198, 197, 199]);
    expect(BLACK.amiro.opaque.image).toBe(1009);
  });

  it('plays her own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 0, ['ryuko', 'amiro']);
    const amiro = match.fighters[1];
    const entered = new Set<unknown>();
    // BEAM, funnal and cpu mornign (445), which has no key.
    const wanted = [230, 275, 445];
    for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (amiro.action === 'script') entered.add(amiro.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
