import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  desperationOf,
  lifeOf,
  perStockOf,
  responsesOf,
  stocksOf,
} from './characters';
import { animationDuration, animationFrame } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// TRAINING as player 1, `gap` from Ryuko as player 2.
function trainingPlayer(gap = 90, seed = 3) {
  const match = new Match('practice', false, seed, ['training', 'ryuko']);
  const [training, other] = match.fighters;
  other.x = training.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, training, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)`: his actions, the damage Ryuko took, his life and the
// objects that ran.
function play(
  at: (t: number) => Input,
  { gap = 120, ticks = 800, hp = 500 } = {},
) {
  const { match, training, other, steps } = trainingPlayer(gap);
  training.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  const clips = new Set<unknown>();
  for (let t = 0; t < ticks; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(training)) mine.push(now(training));
    for (const e of match.effects) clips.add(e.clip);
  }
  return {
    mine,
    damage: lifeOf('ryuko') - other.hp,
    hp: training.hp,
    clips,
  };
}
type Options = Parameters<typeof play>[1];
const byKey = (key: Input, options: Options = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('TRAINING (48 TRAINING.PLAYER)', () => {
  it('takes 500 life and three stocks of 100 from his parameter block', () => {
    expect([lifeOf('training'), desperationOf('training')]).toEqual([500, 150]);
    expect([perStockOf('training'), stocksOf('training')]).toEqual([100, 3]);
    expect(trainingPlayer().training).toMatchObject({
      who: 'training',
      hp: 500,
      action: 'idle',
    });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.training.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins
        ? [[ryuko, twins[ryuko], responsesOf('training')[id]]]
        : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.training.aliases).toEqual({});
    // 24 before Ryuko's KOs, 26 before her hits, 27 from her Shock rp, 26
    // from her INATUMA rp, 22 from her Chuck GON MISS, 23 from her Chuck
    // Yo, 33 before her DOWN section, and his guards from 122.
    expect(
      [
        59, 60, 61, 62, 73, 88, 90, 118, 119, 136, 137, 140, 143, 145, 147, 149,
        172,
      ].map((r) => twins[r]),
    ).toEqual([
      35, 36, 37, 38, 47, 62, 63, 91, 93, 110, 115, 117, 120, 112, 114, 122,
      135,
    ]);
  });

  it('enters each command at its level', () => {
    // No Jump 2 entry names an action, nor any entry an air one.
    expect(CHARACTERS.training.levels).toEqual({
      10: 30, // Dash F
      11: 10, // Dash B
      139: 10, // P-HP
      140: 10, // K+HP
      142: 10, // HITUP attack
      143: 10, // CHUCK KO
      144: 10, // 技名3
    });
  });

  it("runs the opponent's life from his buttons, and knocks himself out", () => {
    // P-HP takes 100 at any range (op 0x15, PC 1629).
    expect(byKey({ punch: true }, { gap: 600, ticks: 60 })).toMatchObject({
      mine: [139, 'idle'],
      damage: 100,
    });
    // K+HP refills it (PC 1633), up to full life (0x40ea9f).
    const { other, steps } = trainingPlayer(600);
    other.hp = 50;
    steps({ kick: true });
    expect(other.hp).toBe(510);
    // CHUCK KO takes 1000 of his own (PC 1662).
    expect(byKey({ throw: true }, { ticks: 300 })).toMatchObject({
      mine: [143, 'down', 'koLand'],
      hp: 0,
    });
  });

  it("refills his life, empties his power and fills the opponent's as he stands", () => {
    const { training, other, steps } = trainingPlayer(300);
    Object.assign(training, { hp: 100, power: 50, stock: 1 });
    Object.assign(other, { power: 0, stock: 0 });
    // 通常立ち's op 0x15 runs after its first 98 ticks (PC 24).
    steps({}, 97);
    expect([training.age, training.hp, training.stock]).toEqual([97, 100, 1]);
    steps({});
    expect([training.age, training.hp, training.power, training.stock]).toEqual(
      [98, 500, 0, 0],
    );
    expect([other.power, other.stock]).toEqual([0, 3]);
  });

  it('dashes both ways, with no air attacks or double jump', () => {
    expect(byKey({ dash: true }, { gap: 400, ticks: 100 }).mine).toEqual([
      10,
      'idle',
    ]);
    expect(byKey({ dash: true, left: true }, { ticks: 100 }).mine).toEqual([
      11,
      'idle',
    ]);
    expect(
      play(presses({ 0: { jump: true }, 30: { punch: true } }), { ticks: 200 }),
    ).toMatchObject({ mine: ['takeoff', 'jump', 'land', 'idle'], damage: 0 });
    expect(
      play(presses({ 0: { jump: true }, 20: {}, 21: { jump: true } }), {
        ticks: 200,
      }).mine,
    ).toEqual(['takeoff', 'jump', 'land', 'idle']);
  });

  it('counts down before his Hit Up and his fireball', () => {
    // HITUP attack holds its crouch 298 ticks (PC 1647) while *OBJ counting
    // (141) shows 3, 2 and 1, then strikes for 10 (PC 1653).
    const hitUp = byKey({ hitUp: true }, { ticks: 600 });
    expect([hitUp.mine, hitUp.damage, hitUp.clips.has(141)]).toEqual([
      [142, 'idle'],
      10,
      true,
    ]);
    expect(
      [0, 100, 200].map((age) => animationFrame(141, age, 'training').image),
    ).toEqual([113, 114, 160]);
    // 技名3 counts down too, then throws 技名4 (145, PC 1675), which rolls
    // into 技名5 (146, slot 1) and bounces on, carrying 技名6 (147), until
    // its hit handler enters Nothing (197).
    const fb = byKey({ drill: true }, { gap: 500 });
    expect([fb.mine, fb.damage]).toEqual([[144, 'idle'], 10]);
    expect([141, 145, 146, 147, 197].every((c) => fb.clips.has(c))).toBe(true);
  });

  it('jumps straight up when knocked out and sinks through the floor', () => {
    const match = new Match('practice', false, 3, ['ryuko', 'training']);
    const [ryuko, training] = match.fighters;
    training.x = ryuko.x + 90;
    training.hp = 1;
    match.step({}, {});
    match.step({}, {});
    let launchX = 0;
    let peak = 0;
    let landed = 0;
    for (let t = 0; t < 400; t++) {
      match.step(t ? {} : { punch: true }, {});
      if (training.action === 'down' && training.age === 14)
        launchX = training.x;
      peak = Math.min(peak, training.y);
      if (training.action === 'koLand' && !landed) landed = t;
    }
    // KO NORMAL launches at raw 0/−1820, gravity 90 (PC 400); KO down has no
    // slide and shows image 207 lower each 2 ticks, then 8191 (PCs 423–431).
    expect([landed, training.x - launchX]).toEqual([129, 0]);
    expect(peak).toBeCloseTo(-446.245, 3);
    expect(animationDuration('koLand', 'training')).toBe(66);
  });

  it('dashes unseen, stands and calls Demo stand four times through his Vs. intro', () => {
    expect(animationDuration('intro', 'training')).toBe(320);
    const match = new Match('cpu', true, 0, ['training', 'zoma']);
    const training = match.fighters[0];
    const xs: number[] = [];
    while (training.action === 'intro') {
      match.step({});
      xs.push(training.x / 1.5);
    }
    expect([xs.length, training.stock, training.y]).toEqual([320, 0, 0]);
    // From 390 source pixels (0x408ac3) the dash back (PC 229) meets the
    // camera's left bound at once, 50 in from its scroll of 320; the dash in
    // (PC 231) then carries him 15 ticks at raw 2870.
    expect(xs[5]).toBe(320 + 50);
    expect(xs[29] - xs[14]).toBeCloseTo(15 * 2870 * (655 / 65536), 6);
    expect(
      [0, 29, 30, 99, 100, 319].map(
        (age) => animationFrame('intro', age, 'training').image,
      ),
    ).toEqual([0, 0, 115, 115, 115, 116]);
  });

  it('wins and draws after three Demo stands', () => {
    // Three 55-tick stands, 勝ち's six poses, then its loop from PC 370.
    expect(animationDuration('win', 'training')).toBe(245);
    expect(
      [0, 165, 173, 197, 213, 1000].map(
        (age) => animationFrame('win', age, 'training').image,
      ),
    ).toEqual([115, 225, 226, 229, 227, 229]);
    expect(animationDuration('draw', 'training')).toBe(197);
    expect(
      [164, 165, 181, 1000].map(
        (age) => animationFrame('draw', age, 'training').image,
      ),
    ).toEqual([116, 225, 227, 227]);
    // Action 44's face (PC 472).
    expect(faceImage(-1, 'training')).toBe(2001);
  });

  it('stands through his idle program, past its op 0x15', () => {
    const vm = new StandingVM(CHARACTERS.training.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([
      115, 116, 117, 118, 119, 118, 117, 116, 115, 116, 117, 118, 140, 225, 140,
    ]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const wanted = [10, 139, 140];
    const entered = new Set<unknown>();
    for (const seed of [0, 4]) {
      const match = new Match('cpu', true, seed, ['ryuko', 'training']);
      const training = match.fighters[1];
      for (let t = 0; t < 6000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (training.action === 'script') entered.add(training.branch);
      }
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
