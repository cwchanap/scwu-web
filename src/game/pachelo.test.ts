import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// PAC-HELO as player 1, `gap` from a standing Ryuko as player 2.
function pacPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['pachelo', 'ryuko']);
  const [pac, other] = match.fighters;
  other.x = pac.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, pac, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 1 } = {}) {
  const { pac, other, steps } = pacPlayer(gap);
  pac.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 1500; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(pac)) mine.push(now(pac));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: pac.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};

describe('PAC-HELO (36 PAC-HELO.PLAYER)', () => {
  it('takes 200 life from his parameter block, desperate at 60', () => {
    expect([lifeOf('pachelo'), desperationOf('pachelo')]).toEqual([200, 60]);
    const { pac } = pacPlayer();
    expect(pac).toMatchObject({ who: 'pachelo', hp: 200, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's, as ZAKU's sit", () => {
    const twins = CHARACTERS.pachelo.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('pachelo')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(twins).toEqual(CHARACTERS.zaku.twins);
    // Ryuko's Down Get up, three 10-tick displays (PCs 1866–1868); his
    // guards hold their last display 33 ticks (PC 1940).
    expect(animationDuration('getUp', 'pachelo')).toBe(30);
    expect(animationDuration('blockHeavy', 'pachelo')).toBe(42);
  });

  it('reads his command table; Hit Up, Chuck and Jump 2 name nothing', () => {
    expect(CHARACTERS.pachelo.levels).toEqual({
      21: 0, // Dash F
      22: 10, // Dash B
      186: 21, // P
      187: 22, // K
      188: 21, // P J
      192: 31, // LIGHTING ATT
      195: 31, // roll air
      196: 31, // Roling attack
      206: 41, // Super roo air
      207: 41, // super roll start
      213: 41, // Super roo air cpu
      214: 41, // Super roo cpu
      271: 10, // CPU dash
      272: 10, // CPU DASH J
    });
    for (const key of [{ hitUp: true }, { throw: true }])
      expect(byKey(key, { gap: 60 })).toEqual({
        mine: ['idle'],
        damage: 0,
        stock: 1,
      });
  });

  it('punches with P, standing or crouching, kicks with K, and strikes P J for either in the air', () => {
    for (const key of [{ punch: true }, { punch: true, crouch: true }])
      expect(byKey(key)).toEqual({ mine: [186, 'idle'], damage: 10, stock: 1 });
    expect(byKey({ kick: true })).toEqual({
      mine: [187, 'idle'],
      damage: 8,
      stock: 1,
    });
    for (const button of [{ punch: true }, { kick: true }])
      expect(play(presses({ 0: { jump: true }, 20: button }))).toEqual({
        mine: ['takeoff', 'jump', 188, 'land', 'idle'],
        damage: 4,
        stock: 1,
      });
  });

  it("sparks on five P presses, elertic's mash step (0x4102ed), and sparks on while P comes within 20 ticks", () => {
    // Four presses only punch; a fifth within 100 ticks enters LIGHTING ATT
    // once the punch ends.
    const mash = (n: number) =>
      play((t) => (t < n * 6 && t % 6 === 0 ? { punch: true } : {}), {
        gap: 400,
      }).mine;
    expect(mash(4)).toEqual([186, 'idle']);
    expect(mash(5)).toEqual([186, 192, 'idle']);
    // The key writes the presses as the CPU does (0x411681), within the 20
    // ticks the match keeps (0x41073e), so LIGHTING ATT's check sees them (PC
    // 2191): light rp (193) once.
    expect(byKey({ axe: true }, { gap: 400 }).mine).toEqual([
      192,
      193,
      192,
      'idle',
    ]);
    // Its first box launches Ryuko (25); the rest (kind 0x87, PCs 2193,
    // 2228) skip her while she reels (0x40f18e), however long it sparks.
    expect(
      play((t) =>
        t ? (t < 300 && t % 6 === 0 ? { punch: true } : {}) : { axe: true },
      ),
    ).toEqual({ mine: [192, 193, 'idle'], damage: 25, stock: 1 });
  });

  it("rolls on F + P after holding back 60 ticks, roll's hold step (0x410473)", () => {
    const charge = (held: number, at: number) =>
      play(
        (t) =>
          t < held
            ? { left: true }
            : t === at
              ? { right: true, punch: true }
              : {},
        { gap: 400 },
      ).mine;
    expect(charge(60, 61)).toEqual(['backwalk', 'idle', 196, 198, 200, 'idle']);
    expect(charge(59, 60)).toEqual(['backwalk', 'idle', 186, 'idle']);
    // The window (35) holds the step before the hold, not the hold itself.
    expect(charge(60, 92)).toEqual(['backwalk', 'idle', 196, 198, 200, 'idle']);
    expect(charge(60, 93)).toEqual(['backwalk', 'idle', 186, 'idle']);
    // ralling rp (197) twice (PC 2286); a hit or guard bounces him off
    // (rallhit, 198), as running out does.
    for (const gap of [90, 300])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [196, 198, 200, 'idle'],
        damage: 20,
        stock: 1,
      });
    expect(
      play(presses({ 0: { jump: true }, 20: { drill: true } }), { gap: 300 }),
    ).toEqual({
      mine: ['takeoff', 'jump', 195, 198, 200, 'idle'],
      damage: 20,
      stock: 1,
    });
  });

  it('cancels P or K on a hit through their windows (op 0x1e, PCs 2101, 2121)', () => {
    expect(play(presses({ 0: { punch: true }, 35: { kick: true } }))).toEqual({
      mine: [186, 187, 'idle'],
      damage: 18,
      stock: 1,
    });
    expect(play(presses({ 0: { punch: true }, 25: { drill: true } }))).toEqual({
      mine: [186, 196, 198, 200, 'idle'],
      damage: 30,
      stock: 1,
    });
    expect(
      play(presses({ 0: { punch: true }, 25: { getterBeam: true } })),
    ).toEqual({ mine: [186, 207, 209, 200, 'idle'], damage: 70, stock: 0 });
    expect(
      play(presses({ 0: { kick: true }, 30: { getterBeam: true } })),
    ).toEqual({ mine: [187, 207, 209, 200, 'idle'], damage: 68, stock: 0 });
    expect(
      play(presses({ 0: { punch: true }, 25: { drill: true } }), { gap: 400 })
        .mine,
    ).toEqual([186, 'idle']);
  });

  it('spends a stock on the super roll and steers it (SR Stop, 211), or enters No super', () => {
    for (const gap of [90, 300])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [207, 209, 200, 'idle'],
        damage: 60,
        stock: 0,
      });
    expect(
      play(presses({ 0: { jump: true }, 20: { getterBeam: true } }), {
        gap: 300,
      }),
    ).toEqual({
      mine: ['takeoff', 'jump', 206, 209, 200, 'idle'],
      damage: 60,
      stock: 0,
    });
    // A direction held into SR Stop picks 技名6's motion (212); the ground
    // roll enters it at B (PC 2427), so down ones keep it rolling forward.
    const steer = (held: Input) =>
      play((t) => (t ? (t < 40 ? held : {}) : { getterBeam: true }), {
        gap: 300,
      });
    expect(steer({ left: true })).toEqual({
      mine: [207, '212+7', '207+29', 'idle'],
      damage: 0,
      stock: 0,
    });
    expect(steer({ jump: true }).mine).toEqual([207, '212+11', 200, 'idle']);
    expect(steer({ right: true, jump: true })).toEqual({
      mine: [207, '212+13', 209, 200, 'idle'],
      damage: 60,
      stock: 0,
    });
    expect(steer({ crouch: true }).mine).toEqual([207, 209, 200, 'idle']);
    expect(byKey({ getterBeam: true }, { stock: 0 })).toEqual({
      mine: [203, 'idle'],
      damage: 0,
      stock: 0,
    });
    expect(
      play(presses({ 0: { jump: true }, 20: { getterBeam: true } }), {
        stock: 0,
      }).mine,
    ).toEqual(['takeoff', 'jump', 202, 'land', 'idle']);
  });

  it('darkens the court through variable 13, which his Black (55) tests', () => {
    const { pac, steps } = pacPlayer();
    pac.stock = 1;
    steps({}, 2);
    steps({ getterBeam: true });
    // super roll start sets it at age 0 (PC 2412).
    expect(pac.variables[13]).toBe(100);
    const shown: string[] = [];
    while (pac.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(pac.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.pachelo.opaque.image).toBe(1011);
  });

  it('fills his one stock through his Vs. intro, 開始時 BR (38)', () => {
    expect(animationDuration('intro', 'pachelo')).toBe(259);
    const match = new Match('cpu', true, 0, ['pachelo', 'zoma']);
    const pac = match.fighters[0];
    let ticks = 0;
    while (pac.action === 'intro') {
      match.step({});
      ticks++;
    }
    // Its 200 power fills his one stock (+0x7cb2).
    expect([ticks, pac.stock]).toEqual([259, 1]);
    // Round 1 (39) shows nothing for 50 ticks, then fades his stance in
    // (PCs 333–344) and calls Demo stand five times (PC 345).
    expect(
      [0, 49, 50, 65, 84, 99, 258].map(
        (age) => animationFrame('intro', age, 'pachelo').image,
      ),
    ).toEqual([0, 0, 115, 116, 115, 116, 116]);
  });

  it('wins after four Demo stands, looping his stance (PC 488), and draws looping it', () => {
    expect(animationDuration('win', 'pachelo')).toBe(210);
    expect(
      [0, 15, 35, 139, 140, 175, 190, 210, 225].map(
        (age) => animationFrame('win', age, 'pachelo').image,
      ),
    ).toEqual([115, 116, 115, 116, 115, 115, 116, 115, 116]);
    expect(
      [0, 15, 35, 50, 1015].map(
        (age) => animationFrame('draw', age, 'pachelo').image,
      ),
    ).toEqual([115, 116, 115, 116, 115]);
    expect(faceImage(-1, 'pachelo')).toBe(2001);
  });

  it('stands through his idle program, past its tests (PCs 2–3), until it ends (PC 15)', () => {
    const vm = new StandingVM(CHARACTERS.pachelo.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([115, 116]);
  });

  it('plays his own CPU table in Vs. CPU, rolling and sparking as the CPU writes them', () => {
    // The CPU writes roll's hold and elertic's presses in full (0x4116c6,
    // 0x411681), and enters Super roo cpu (214) and its own dashes.
    for (const [seed, wanted] of [
      [0, [196, 192, 214, 271, 272]],
      [2, [196, 192, 193, 214]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'pachelo']);
      const pac = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (pac.action === 'script') entered.add(pac.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
