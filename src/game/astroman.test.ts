import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';

// ASTROMAN as player 1, `gap` from a standing Ryuko as player 2.
function astromanPlayer(gap = 90) {
  const match = new Match('practice', false, 3, ['astroman', 'ryuko']);
  const [astroman, other] = match.fighters;
  other.x = astroman.x + gap;
  const steps = (input: Input, ticks = 1) => {
    for (let t = 0; t < ticks; t++) match.step(input, {});
  };
  return { match, astroman, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// Inputs from `at(t)` for 1500 ticks: his actions, the damage Ryuko took, his
// stock and the life he gained from `hp`.
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, hp = lifeOf('astroman') } = {},
) {
  const { astroman, other, steps } = astromanPlayer(gap);
  astroman.stock = stock;
  astroman.hp = hp;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 1500; t++) {
    steps(at(t));
    if (mine.at(-1) !== now(astroman)) mine.push(now(astroman));
  }
  return {
    mine,
    damage: lifeOf('ryuko') - other.hp,
    stock: astroman.stock,
    healed: astroman.hp - hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const sounds = (action: 'win' | 'draw', age: number) =>
  animationFrame(action, age, 'astroman')
    .events?.filter((e) => e.op === 'sound')
    .map((e) => (e.op === 'sound' ? e.index : 0));

describe('ASTROMAN (40 ASTROMAN.PLAYER)', () => {
  it('takes 780 life from his parameter block, desperate at 234', () => {
    expect([lifeOf('astroman'), desperationOf('astroman')]).toEqual([780, 234]);
    const { astroman } = astromanPlayer();
    expect(astroman).toMatchObject({
      who: 'astroman',
      hp: 780,
      action: 'idle',
    });
  });

  it("pairs every victim action with Ryuko's", () => {
    const twins = CHARACTERS.astroman.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins
        ? [[ryuko, twins[ryuko], responsesOf('astroman')[id]]]
        : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([]);
    expect(CHARACTERS.astroman.aliases).toEqual({});
    // One before Ryuko's, two for her Shock rp and past her Chuck Hiso, and
    // his guards packed from 147.
    expect(
      [59, 60, 73, 88, 90, 91, 128, 137, 140, 145, 149, 172].map(
        (r) => twins[r],
      ),
    ).toEqual([58, 59, 72, 87, 88, 90, 127, 136, 138, 143, 147, 160]);
    // TTRO's Chuck Yo (70 ticks, PC 1712); HISO stop holds 33 ticks (PCs
    // 1499, 1516) to Ryuko's 36.
    expect(animationDuration('chuckYo', 'astroman')).toBe(70);
    expect(
      ['hisoStop', 'airHisoStop'].map((a) => [
        animationDuration(a as 'hisoStop', 'astroman'),
        animationDuration(a as 'hisoStop'),
      ]),
    ).toEqual([
      [64, 67],
      [39, 42],
    ]);
  });

  it('reads his command table; Hit Up names nothing', () => {
    expect(CHARACTERS.astroman.levels).toEqual({
      7: 255, // J 2
      8: 255, // J 2 F
      9: 255, // J 2 B
      13: 0, // DASH F
      14: 0, // DASH B
      17: 254, // Dash A F
      18: 254, // Dash A B
      164: 21, // P
      167: 21, // K
      169: 21, // P sit
      170: 21, // K sit
      172: 21, // P J
      176: 21, // K J
      181: 10, // Chuck start
      187: 10, // CC FAR
      188: 10, // CC Start
      193: 31, // Punch start
      201: 31, // Jump att
      205: 31, // GUN
      216: 41, // cannel start
      223: 41, // super P start
      237: 10, // SCC 300
      306: 0, // CPU D F
      307: 0, // CPU D B
    });
    expect(byKey({ hitUp: true }, { gap: 60 })).toEqual({
      mine: ['idle'],
      damage: 0,
      stock: 3,
      healed: 0,
    });
  });

  it('jabs with P, kicks twice with K, rushes with P sit and leaps with K sit', () => {
    for (const gap of [60, 400]) {
      expect(byKey({ punch: true }, { gap })).toEqual({
        mine: [164, 'idle'],
        damage: 33,
        stock: 3,
        healed: 0,
      });
      // Two boxes, 20 and 15 (PCs 2235, 2242).
      expect(byKey({ kick: true }, { gap })).toEqual({
        mine: [167, 'idle'],
        damage: 35,
        stock: 3,
        healed: 0,
      });
      // P sit rushes at raw 1300 (PC 2274).
      expect(byKey({ punch: true, crouch: true }, { gap })).toEqual({
        mine: [169, 'idle'],
        damage: 35,
        stock: 3,
        healed: 0,
      });
      // K sit leaps (PC 2303) and lands in K sit down (171, slot 1).
      expect(byKey({ kick: true, crouch: true }, { gap })).toEqual({
        mine: [170, 171, 'idle'],
        damage: 35,
        stock: 3,
        healed: 0,
      });
    }
  });

  it('strikes in the air, by variable 1 in his 2 and D forms', () => {
    expect(play(presses({ 0: { jump: true }, 30: { punch: true } }))).toEqual({
      mine: ['takeoff', 'jump', 172, 16, 'idle'],
      damage: 30,
      stock: 3,
      healed: 0,
    });
    expect(play(presses({ 0: { jump: true }, 30: { kick: true } }))).toEqual({
      mine: ['takeoff', 'jump', 176, 16, 'idle'],
      damage: 30,
      stock: 3,
      healed: 0,
    });
    // Its window (levels 22–255, PC 2323) takes Jump att on contact.
    expect(
      play(
        presses({
          0: { jump: true },
          30: { punch: true },
          60: { drill: true },
        }),
      ),
    ).toEqual({
      mine: ['takeoff', 'jump', 172, 201, '201+12', 202, 'idle'],
      damage: 80,
      stock: 3,
      healed: 0,
    });
    // P J and K J test variable 1 (PCs 2320–2322, 2398–2400): 10 after J 2
    // (PC 105), 20 after an air dash (PC 271) and 30 through DASH F (PC
    // 189).
    for (const [button, after2, afterD, inDash] of [
      ['punch', 174, 173, 175],
      ['kick', 178, 177, 179],
    ] as const) {
      expect(
        play(
          presses({
            0: { jump: true },
            20: { jump: true },
            30: { [button]: true },
          }),
        ).mine,
      ).toEqual(['takeoff', 'jump', 7, after2, 'land', 'idle']);
      expect(
        play(
          presses({
            0: { jump: true },
            20: { dash: true },
            35: { [button]: true },
          }),
          { gap: 400 },
        ),
      ).toEqual({
        mine: ['takeoff', 'jump', 17, afterD, 16, 'idle'],
        damage: 30,
        stock: 3,
        healed: 0,
      });
      expect(
        play(presses({ 0: { dash: true }, 10: { [button]: true } }), {
          gap: 200,
        }).mine,
      ).toEqual([13, inDash, 16, 'idle']);
    }
  });

  it('chucks within reach (box kind 138, PC 2495)', () => {
    for (const gap of [60, 250])
      expect(byKey({ throw: true }, { gap })).toEqual({
        mine: [181, 182, 183, 185, 'idle'],
        damage: 45,
        stock: 3,
        healed: 0,
      });
    expect(byKey({ throw: true }, { gap: 400 }).mine).toEqual([181, 'idle']);
  });

  it('stomps with Jump att, punches, fires ASS GUN and grabs with C Chuck, healing', () => {
    // Jump att rockets up (PC 2802) and lands in Jump Att lend (202, slot
    // 1), whose blast strikes 15 (PC 2827); in the air it skips its ground
    // smoke (op 0x16, PC 2797).
    for (const gap of [60, 400])
      expect(byKey({ drill: true }, { gap })).toEqual({
        mine: [201, 202, 'idle'],
        damage: 50,
        stock: 3,
        healed: 0,
      });
    expect(
      play(presses({ 0: { jump: true }, 20: { drill: true } }), { gap: 200 }),
    ).toEqual({
      mine: ['takeoff', 'jump', 201, '201+12', 202, 'idle'],
      damage: 50,
      stock: 3,
      healed: 0,
    });
    for (const gap of [60, 400])
      expect(byKey({ axe: true }, { gap })).toEqual({
        mine: [193, 'idle'],
        damage: 40,
        stock: 3,
        healed: 0,
      });
    // GUN calls GUN RP five times (PC 2861), each firing a bullet of 10.
    for (const gap of [60, 700])
      expect(byKey({ iori: true }, { gap })).toEqual({
        mine: [205, 'idle'],
        damage: 50,
        stock: 3,
        healed: 0,
      });
    // CC Start within 200 source pixels (+0x7ca3) grabs and gains 15 four
    // times (PCs 2618–2638) before its 40 (PC 2660); CC FAR beyond reaches
    // only 100 ahead (PC 2577).
    for (const gap of [60, 250])
      expect(byKey({ dst: true }, { gap, hp: 500 })).toEqual({
        mine: [188, 189, 'idle'],
        damage: 40,
        stock: 3,
        healed: 60,
      });
    expect(byKey({ dst: true }, { gap: 400 }).mine).toEqual([187, 'idle']);
  });

  it('cancels P and K on a hit through their windows (op 0x1e, PCs 2177, 2233)', () => {
    for (const [key, mine, damage] of [
      ['drill', [164, 201, 202, 'idle'], 83],
      ['axe', [164, 193, 'idle'], 73],
      ['iori', [164, 205, 'idle'], 83],
    ] as const)
      expect(
        play(presses({ 0: { punch: true }, 20: { [key]: true } })),
      ).toEqual({ mine, damage, stock: 3, healed: 0 });
    expect(play(presses({ 0: { kick: true }, 20: { axe: true } }))).toEqual({
      mine: [167, 193, 'idle'],
      damage: 60,
      stock: 3,
      healed: 0,
    });
    expect(
      play(presses({ 0: { punch: true }, 20: { musashi: true } })),
    ).toEqual({ mine: [164, 223, 'idle'], damage: 153, stock: 2, healed: 0 });
    // P pushes Ryuko into the beam's reach.
    expect(
      play(presses({ 0: { punch: true }, 20: { changeAttack: true } })),
    ).toEqual({ mine: [164, 216, 'idle'], damage: 213, stock: 2, healed: 0 });
    // K is level 21, C Chuck and SCC 300 10: below P's window (22).
    for (const key of [{ kick: true }, { dst: true }, { getterBeam: true }])
      expect(play(presses({ 0: { punch: true }, 20: key }))).toEqual({
        mine: [164, 'idle'],
        damage: 33,
        stock: 3,
        healed: 0,
      });
    // His specials open no window.
    for (const key of ['drill', 'axe', 'iori'] as const)
      expect(
        play(presses({ 0: { [key]: true }, 30: { musashi: true } })).stock,
      ).toBe(3);
    expect(
      play(presses({ 0: { punch: true }, 20: { drill: true } }), { gap: 700 })
        .mine,
    ).toEqual([164, 'idle']);
  });

  it('guards a box meeting P’s, K’s, Punch start’s or super P start’s in their GARDs (slot 5, 0x40eb60)', () => {
    // His key at 0, Ryuko's punch at `at`. SP GARD (224) sets variable 0 to
    // 10 (PC 3074), which super P start's tests take into SUPER P LV1
    // (228), 130.
    const guard = (key: Input, at: number) => {
      const { match, astroman, other } = astromanPlayer();
      astroman.stock = 3;
      const mine: unknown[] = [];
      for (let t = -5; t < 500; t++) {
        match.step(t ? {} : key, t === at ? { punch: true } : {});
        if (t >= 0 && mine.at(-1) !== now(astroman)) mine.push(now(astroman));
      }
      return [
        mine,
        lifeOf('astroman') - astroman.hp,
        lifeOf('ryuko') - other.hp,
      ];
    };
    expect(guard({ punch: true }, 0)).toEqual([[164, 165, 'idle'], 0, 39]);
    expect(guard({ kick: true }, 4)).toEqual([[167, 168, 'idle'], 0, 39]);
    expect(guard({ axe: true }, 0)).toEqual([[193, 194, 'idle'], 0, 40]);
    expect(guard({ musashi: true }, -3)).toEqual([
      [223, 224, 228, 'idle'],
      0,
      130,
    ]);
  });

  it('spends three stocks on S CC and one on SUPER P or ASS GUN SUPER, or enters No super', () => {
    // SCC 300 needs more than two stocks (op 0x10, PC 3215) and grabs (PC
    // 3224) into knees, blasts and kisses that gain 10 five times (PC 3329),
    // then 300 (PC 3309).
    for (const gap of [60, 250])
      expect(byKey({ getterBeam: true }, { gap, hp: 500 })).toEqual({
        mine: [237, 238, 'idle'],
        damage: 300,
        stock: 0,
        healed: 50,
      });
    expect(byKey({ getterBeam: true }, { gap: 400 })).toEqual({
      mine: [237, 'idle'],
      damage: 0,
      stock: 0,
      healed: 0,
    });
    expect(byKey({ getterBeam: true }, { stock: 2 })).toEqual({
      mine: [213, 'idle'],
      damage: 0,
      stock: 2,
      healed: 0,
    });
    // super P start falls through its tests of variable 0 (PCs 3052–3055),
    // which only its guard points set, into 120 (PC 3061).
    for (const gap of [60, 400])
      expect(byKey({ musashi: true }, { gap })).toEqual({
        mine: [223, 'idle'],
        damage: 120,
        stock: 2,
        healed: 0,
      });
    // CALL BEAM HANDEN (219) strikes 9 twenty times (PCs 3012–3014) from
    // 148 ahead, so it passes a foe at his feet.
    for (const [gap, damage] of [
      [60, 0],
      [250, 180],
      [700, 180],
    ])
      expect(byKey({ changeAttack: true }, { gap })).toEqual({
        mine: [216, 'idle'],
        damage,
        stock: 2,
        healed: 0,
      });
    for (const key of [{ musashi: true }, { changeAttack: true }])
      expect(byKey(key, { stock: 0 })).toEqual({
        mine: [213, 'idle'],
        damage: 0,
        stock: 0,
        healed: 0,
      });
  });

  it('darkens the court through variable 14, which his Black (43) tests', () => {
    const { astroman, steps } = astromanPlayer();
    astroman.stock = 3;
    steps({}, 2);
    steps({ musashi: true });
    // super P start sets it at age 0 (PC 3027).
    expect(astroman.variables[14]).toBe(100);
    const shown: string[] = [];
    while (astroman.black.shown !== 'none' || !shown.length) {
      steps({});
      shown.push(astroman.black.shown);
    }
    expect(shown.indexOf('half')).toBe(shown.lastIndexOf('opaque') + 1);
    expect(BLACK.astroman.opaque.image).toBe(1011);
  });

  it('hover-dashes on while → is held, hops back, double jumps and air dashes', () => {
    // DASH F's op 0x16 checks (PCs 205–212) carry its hover on while → is
    // held, then it falls (PC 214) into Dash Lend (16, slot 1).
    expect(byKey({ dash: true }, { gap: 600 }).mine).toEqual([
      13,
      '13+26',
      16,
      'idle',
    ]);
    expect(
      play((t) => (t === 0 ? { dash: true } : t < 100 ? { right: true } : {}), {
        gap: 900,
      }).mine,
    ).toEqual([13, '13+19', '13+22', '13+25', 16, 'idle']);
    expect(byKey({ dash: true, left: true }, { gap: 300 }).mine).toEqual([
      14,
      '14+26',
      16,
      'idle',
    ]);
    expect(
      play(presses({ 0: { jump: true }, 30: { jump: true } })).mine,
    ).toEqual(['takeoff', 'jump', 7, 'land', 'idle']);
    expect(
      play(presses({ 0: { jump: true }, 20: { dash: true } }), { gap: 400 })
        .mine,
    ).toEqual(['takeoff', 'jump', 17, 'land', 'idle']);
  });

  it('shakes the screen as he walks, and rockets up through his jumps', () => {
    // 前歩き's op 0x0e before its second pose (PC 30).
    const { match, steps } = astromanPlayer(600);
    steps({}, 2);
    steps({ right: true }, 40);
    expect(match.quake.y).toBeNull();
    steps({ right: true });
    expect(match.quake.y).toEqual({ type: 4, amplitude: 5, frames: 5 });
    expect(animationFrame('takeoff', 0, 'astroman').image).toBe(134);
    expect(
      [0, 49, 50, 1000].map(
        (age) => animationFrame('jump', age, 'astroman').image,
      ),
    ).toEqual([135, 135, 134, 134]);
  });

  it('bursts as he falls and fades on the floor', () => {
    // KO NORMAL 2nd lies on a 0-tick display (PC 694); KO down bursts on a
    // 20-tick pose (PCs 704–706) and fades his colour (PCs 710–719).
    expect(animationDuration('koAgain', 'astroman')).toBe(32);
    expect(animationDuration('koLand', 'astroman')).toBe(130);
    expect(
      [0, 10, 30, 80, 129].map((age) => [
        animationFrame('koLand', age, 'astroman').image,
        animationFrame('koLand', age, 'astroman').color?.r,
      ]),
    ).toEqual([
      [117, 11],
      [208, 11],
      [208, 11],
      [208, 8],
      [208, 0],
    ]);
  });

  it('charges two stocks through his Vs. intro, 開始時 BR (33)', () => {
    expect(animationDuration('intro', 'astroman')).toBe(273);
    const match = new Match('cpu', true, 0, ['astroman', 'zoma']);
    const astroman = match.fighters[0];
    let ticks = 0;
    while (astroman.action === 'intro') {
      match.step({});
      ticks++;
    }
    expect([ticks, astroman.stock]).toEqual([273, 2]);
    // Round 1 (34) + 2 bulks a slight boy up into his muscles.
    expect(
      [0, 119, 120, 135, 145, 155, 165, 264, 265, 272].map(
        (age) => animationFrame('intro', age, 'astroman').image,
      ),
    ).toEqual([151, 151, 150, 149, 148, 147, 146, 146, 145, 145]);
  });

  it('wins shrinking back into the boy (PC 637), and draws sitting down (PC 747)', () => {
    expect(animationDuration('win', 'astroman')).toBe(255);
    expect(
      [0, 47, 52, 60, 90, 100, 110, 120, 135, 195, 1000].map(
        (age) => animationFrame('win', age, 'astroman').image,
      ),
    ).toEqual([113, 114, 145, 146, 147, 148, 149, 150, 151, 151, 151]);
    // The pose at 60 carries only its afterimage (op 0x25, PC 623).
    expect([0, 60, 90, 135, 195].map((age) => sounds('win', age))).toEqual([
      undefined,
      [],
      [30],
      [2],
      undefined,
    ]);
    expect(animationDuration('draw', 'astroman')).toBe(82);
    expect(
      [0, 52, 62, 72, 1000].map(
        (age) => animationFrame('draw', age, 'astroman').image,
      ),
    ).toEqual([113, 119, 118, 118, 118]);
    expect([52, 62, 72].map((age) => sounds('draw', age))).toEqual([
      [37],
      [32],
      undefined,
    ]);
    expect(faceImage(-1, 'astroman')).toBe(2001);
  });

  it('stands through his idle program until it ends (PC 18)', () => {
    const vm = new StandingVM(CHARACTERS.astroman.idle);
    const images: number[] = [];
    while (!vm.ended) {
      vm.tick();
      if (vm.frame && images.at(-1) !== vm.frame.image)
        images.push(vm.frame.image);
    }
    expect(images).toEqual([113, 114, 115, 116, 115, 114]);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    // His CPU's own CPU D F (306), as well as his moves.
    for (const [seed, wanted] of [
      [19, [205, 201, 306, 164, 170, 181, 188, 193, 216, 213, 167]],
      [1, [175]],
    ] as const) {
      const match = new Match('cpu', true, seed, ['ryuko', 'astroman']);
      const astroman = match.fighters[1];
      const entered = new Set<unknown>();
      for (let t = 0; t < 4000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (astroman.action === 'script') entered.add(astroman.branch);
      }
      expect([...entered]).toEqual(expect.arrayContaining([...wanted]));
    }
  });
});
