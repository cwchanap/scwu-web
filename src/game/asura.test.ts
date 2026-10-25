import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro } from './testing';

// ASURA as player 1, `gap` from a standing Ryuko as player 2.
function asuraPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['asura', 'ryuko']);
  const [asura, other] = match.fighters;
  other.x = asura.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, asura, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took and
// his stock.
function play(at: (t: number) => Input, { gap = 90, stock = 2 } = {}) {
  const { asura, other, steps } = asuraPlayer(gap);
  asura.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 1500; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(asura)) mine.push(now(asura));
  }
  return { mine, damage: lifeOf('ryuko') - other.hp, stock: asura.stock };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const sounds = (action: 'win' | 'draw' | 'down', age: number) =>
  animationFrame(action, age, 'asura')
    .events?.filter((e) => e.op === 'sound')
    .map((e) => (e.op === 'sound' ? e.index : 0));

describe('ASURA (38 ASURA.PLAYER)', () => {
  it('takes 300 life from his parameter block, desperate at 90', () => {
    expect([lifeOf('asura'), desperationOf('asura')]).toEqual([300, 90]);
    const { asura } = asuraPlayer();
    expect(asura).toMatchObject({ who: 'asura', hp: 300, action: 'idle' });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.asura.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('asura')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.asura.aliases).toEqual({});
    // As GOLF's to Chuck 消える (128), then one before them.
    expect(
      [59, 60, 73, 74, 75, 88, 104, 128, 140, 145, 149, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([45, 46, 59, 60, 61, 74, 90, 114, 125, 130, 134, 147]);
    // Ryuko's Down Get up and GIANT!! MUSIC ATTACK; ZAKU's guards.
    expect(animationDuration('getUp', 'asura')).toBe(30);
    expect(animationDuration('blockHeavy', 'asura')).toBe(32);
    expect(animationDuration('musicAttack', 'asura')).toBe(10);
  });

  it('reads his command table; Hit Up, Chuck and Jump 2 name nothing', () => {
    expect(CHARACTERS.asura.levels).toEqual({
      11: 0, // DASH
      12: 10, // DASH B
      151: 21, // P
      152: 22, // K
      153: 21, // P sit
      154: 21, // K sit
      155: 21, // PJ
      156: 22, // K J
      159: 31, // air tatu
      160: 31, // TATU START
      167: 41, // air super tatu
      168: 41, // super tatu start
      226: 0, // cpu dash
      227: 0, // cpu DJ
    });
    for (const key of [{ hitUp: true }, { throw: true }])
      expect(byKey(key, { gap: 60 })).toEqual({
        mine: ['idle'],
        damage: 0,
        stock: 2,
      });
  });

  it('jabs and kicks three times each, hops crouching, and strikes PJ or KJ in the air', () => {
    // Each box (kind 3, PCs 1722, 1727, 1733) re-arms at its display.
    for (const key of [{ punch: true }, { kick: true }])
      for (const gap of [60, 200])
        expect(byKey(key, { gap })).toEqual({
          mine: [key.punch ? 151 : 152, 'idle'],
          damage: 16,
          stock: 2,
        });
    // P sit and K sit hop (PCs 1779, 1806) and land in 153 + 22 and 154 + 18.
    expect(byKey({ punch: true, crouch: true })).toEqual({
      mine: [153, '153+22', 'idle'],
      damage: 15,
      stock: 2,
    });
    expect(byKey({ kick: true, crouch: true }, { gap: 400 })).toEqual({
      mine: [154, '154+18', 'idle'],
      damage: 15,
      stock: 2,
    });
    expect(play(presses({ 0: { jump: true }, 50: { punch: true } }))).toEqual({
      mine: ['takeoff', 'jump', 155, 'land', 'idle'],
      damage: 15,
      stock: 2,
    });
    expect(play(presses({ 0: { jump: true }, 30: { kick: true } }))).toEqual({
      mine: ['takeoff', 'jump', 156, 'land', 'idle'],
      damage: 18,
      stock: 2,
    });
  });

  it('spins up through tatumaki, calling TATU RP five times, or spins in the air', () => {
    // Each TATU RP strikes in front (PC 1927) and behind (PC 1933).
    for (const [gap, damage] of [
      [90, 18],
      [400, 12],
    ])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [160, '160+21', 'idle'],
        damage,
        stock: 2,
      });
    expect(play(presses({ 0: { jump: true }, 10: { drill: true } }))).toEqual({
      mine: ['takeoff', 'jump', 159, '160+21', 'idle'],
      damage: 15,
      stock: 2,
    });
    // The back jump (7) sets variable 0 to 10 (PC 74), so air tatu turns
    // back into air tatu back (158, PC 1877).
    expect(
      play(presses({ 0: { jump: true, left: true }, 10: { drill: true } }), {
        gap: 200,
      }).mine,
    ).toEqual(['takeoff', 'jump', 158, '160+21', 'idle']);
  });

  it('cancels on a hit through his windows (op 0x1e, PCs 1715, 1741, 1767, 1840, 1893)', () => {
    expect(play(presses({ 0: { punch: true }, 12: { kick: true } }))).toEqual({
      mine: [151, 152, 'idle'],
      damage: 19,
      stock: 2,
    });
    // P sit is level 21, below P's window (22).
    expect(
      play(presses({ 0: { punch: true }, 12: { punch: true, crouch: true } })),
    ).toEqual({ mine: [151, 'idle'], damage: 16, stock: 2 });
    expect(play(presses({ 0: { punch: true }, 12: { drill: true } }))).toEqual({
      mine: [151, 160, '160+21', 'idle'],
      damage: 21,
      stock: 2,
    });
    expect(
      play(presses({ 0: { kick: true }, 30: { getterBeam: true } })),
    ).toEqual({
      mine: [152, 168, '168+41', 'idle', 'turn', 'idle'],
      damage: 92,
      stock: 1,
    });
    // P sit's hop and tatumaki's rise are airborne, so the commands enter
    // their air forms.
    expect(
      play(presses({ 0: { punch: true, crouch: true }, 16: { drill: true } })),
    ).toEqual({
      mine: [153, 159, '160+21', 'idle'],
      damage: 30,
      stock: 2,
    });
    expect(
      play(presses({ 0: { drill: true }, 20: { getterBeam: true } })),
    ).toEqual({
      mine: [160, 167, '167+41', 'idle', 'turn', 'idle'],
      damage: 79,
      stock: 1,
    });
    expect(
      play(
        presses({ 0: { jump: true }, 30: { kick: true }, 46: { drill: true } }),
      ).mine,
    ).toEqual(['takeoff', 'jump', 156, 159, '160+21', 'turn', 'idle']);
    expect(
      play(presses({ 0: { punch: true }, 12: { drill: true } }), { gap: 700 })
        .mine,
    ).toEqual([151, 'idle']);
  });

  it('spends a stock on Shinku TATU, standing or in the air, or enters No super', () => {
    // super tatu start calls sp tatu rp five times (PC 2036), whose
    // Tatumaki << and >> (responses 44, 45) carry Ryuko round him.
    for (const gap of [60, 200])
      expect(byKey({ getterBeam: true }, { gap })).toEqual({
        mine: [168, '168+41', 'idle', 'turn', 'idle'],
        damage: 76,
        stock: 1,
      });
    expect(
      play(presses({ 0: { jump: true }, 20: { getterBeam: true } }), {
        gap: 200,
      }),
    ).toEqual({
      mine: ['takeoff', 'jump', 167, '167+41', 'idle', 'turn', 'idle'],
      damage: 76,
      stock: 1,
    });
    expect(byKey({ getterBeam: true }, { stock: 0 })).toEqual({
      mine: [164, 'idle'],
      damage: 0,
      stock: 0,
    });
    expect(
      play(presses({ 0: { jump: true }, 20: { getterBeam: true } }), {
        stock: 0,
      }).mine,
    ).toEqual(['takeoff', 'jump', 163, 'land', 'idle']);
  });

  it('darkens the court through variable 14, which his Black (43) tests', () => {
    const { asura, steps } = asuraPlayer();
    asura.stock = 2;
    steps({}, 2);
    steps({ getterBeam: true });
    // super tatu start sets it at age 0 (PC 2015).
    expect(asura.variables[14]).toBe(100);
    const shown: string[] = [];
    while (asura.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(asura.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.asura.opaque.image).toBe(1011);
  });

  it('runs on while → is held, into a high jump on ↑, and hops back', () => {
    // DASH's op 0x16 checks (PCs 123–142) loop it while → is held, and its
    // op 0x24s enter High Jump (6) on ↑.
    expect(
      play((t) => (t < 100 ? { right: true, dash: true } : {}), { gap: 600 })
        .mine,
    ).toEqual([
      11,
      ...Array(3).fill(['11+10', '11+14', '11+20', '11+24']).flat(),
      'idle',
    ]);
    expect(
      play(
        (t) =>
          t === 0
            ? { dash: true }
            : t < 20
              ? { right: true }
              : t < 30
                ? { right: true, jump: true }
                : {},
        { gap: 900 },
      ).mine,
    ).toEqual([11, '11+10', '11+14', 6, 'land', 'idle']);
    expect(byKey({ dash: true, left: true }, { gap: 300 }).mine).toEqual([
      12,
      13,
      'idle',
    ]);
  });

  it('charges two stocks through his Vs. intro, 開始時 BR (28)', () => {
    expect(animationDuration(28, 'asura')).toBe(242);
    const { path, ticks, f } = brIntro('asura');
    expect([path, ticks, f.stock]).toEqual([[26, 28], 244, 2]);
    // Round 1 (29) shows nothing for 50 ticks, then his stance, and calls
    // demo stand three times (PC 263).
    expect(
      [0, 49, 50, 68, 80, 98, 106, 241].map(
        (age) => animationFrame(28, age, 'asura').image,
      ),
    ).toEqual([0, 0, 113, 114, 115, 113, 113, 114]);
  });

  it('wins after a demo stand, voicing it once (PC 393), and draws into his win (PC 478)', () => {
    expect(animationDuration('win', 'asura')).toBe(144);
    expect(
      [0, 12, 24, 36, 48, 96, 143, 1000].map(
        (age) => animationFrame('win', age, 'asura').image,
      ),
    ).toEqual([113, 114, 115, 114, 113, 113, 114, 114]);
    expect([0, 48, 96, 144].map((age) => sounds('win', age))).toEqual([
      undefined,
      [1],
      undefined,
      undefined,
    ]);
    // The draw's own stance, then 勝ち's demo stand with its voice, then that
    // stand's loop, replayed once before the clip loops it.
    expect(animationDuration('draw', 'asura')).toBe(240);
    expect([0, 48, 96, 144].map((age) => sounds('draw', age))).toEqual([
      undefined,
      undefined,
      [1],
      undefined,
    ]);
    expect(faceImage(-1, 'asura')).toBe(2001);
  });

  it("rolls his KO's voice (PC 416): 8 through its fall-through, or 7", () => {
    expect(sounds('down', 0)).toEqual([18, 8]);
    const voices = [0, 1, 2, 3, 4, 5].map((seed) => {
      const match = new Match('practice', false, seed, ['ryuko', 'asura']);
      const [ryuko, asura] = match.fighters;
      asura.x = ryuko.x + 90;
      asura.hp = 1;
      match.step();
      match.step();
      const cued: [number, number, string][] = [];
      for (let t = 0; t < 200; t++) {
        match.step(t === 0 ? { punch: true } : {});
        for (const { owner, index } of match.sounds)
          if (owner === 1) cued.push([t, index, asura.action]);
      }
      return cued;
    });
    // Both rejoin at 46 + 15, so he lands alike.
    const ko = (voice: number) => [
      [8, 18, 'down'],
      [8, voice, 'down'],
      [118, 17, 'koLand'],
    ];
    expect(voices).toEqual([ko(7), ko(8), ko(8), ko(8), ko(7), ko(8)]);
  });

  it('stands through his idle program until it ends (PC 15)', () => {
    const vm = new StandingVM(CHARACTERS.asura.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([113, 114, 115, 114]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His CPU's own cpu dash, and cpu DJ, which runs into his high jump (PC
    // 2579).
    for (const [seed, wanted] of [
      [0, [154, 168, 152, 226, 160, 227]],
      [1, [160, 152, 154, 156, 227]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'asura']);
      const asura = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (asura.action === 'script') entered.add(asura.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
