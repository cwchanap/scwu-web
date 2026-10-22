import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationDuration, animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { exMode, Match } from './match';
import type { Fighter, Input } from './match';
import { brIntro } from './testing';

// SWW as player 1, `gap` from a standing opponent as player 2.
function swwPlayer(gap = 90, opponent: Who = 'ryuko', seed = 3) {
  const match = new Match('practice', false, seed, ['sww', opponent]);
  const [sww, other] = match.fighters;
  other.x = sww.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, sww, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
const noInput: (t: number) => Input = () => ({});
// Inputs from `at(t)` (and the opponent's from `theirs(t)`) for 3000 ticks:
// SWW's actions, the objects he spawned and the damage each took. `ex`
// starts him in EX mode (variable 0 at 100).
function play(
  at: (t: number) => Input,
  { gap = 90, stock = 3, hp = 0, ex = false, theirs = noInput } = {},
) {
  const { match, sww, other, steps } = swwPlayer(gap);
  sww.stock = stock;
  if (hp) sww.hp = hp;
  if (ex) sww.variables[0] = 100;
  steps({}, 2);
  const mine: unknown[] = [];
  const objects = new Set<unknown>();
  for (let t = 0; t < 3000; t++) {
    steps(at(t), 1, theirs(t));
    if (mine.at(-1) !== now(sww)) mine.push(now(sww));
    for (const e of match.effects) objects.add(e.clip);
  }
  return {
    match,
    sww,
    mine,
    objects,
    damage: lifeOf('ryuko') - other.hp,
    taken: (hp || lifeOf('sww')) - sww.hp,
  };
}
const byKey = (key: Input, options: Parameters<typeof play>[1] = {}) =>
  play((t) => (t ? {} : key), options);
const presses = (keys: Record<number, Input>) => (t: number) => keys[t] ?? {};
const J = { punch: true };
const K = { kick: true };
// ↓→ J from `at`, through ↘.
const downForward = (at: number) => ({
  [at]: { crouch: true },
  [at + 1]: { crouch: true, right: true },
  [at + 2]: { right: true },
  [at + 3]: J,
});

describe('SWW (26 SWW.PLAYER)', () => {
  it('takes 460 life from his parameter block, desperate at 138', () => {
    expect([lifeOf('sww'), desperationOf('sww')]).toEqual([460, 138]);
    const { sww } = swwPlayer();
    expect(sww).toMatchObject({ who: 'sww', hp: 460, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's, but for his UNCOUNTER reactions", () => {
    const twins = CHARACTERS.sww.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[ryuko, twins[ryuko], responsesOf('sww')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    // Responses 69 and 70 enter UNCOUNTER DOWN and Air Fire (123, 124)
    // where Ryuko's name DOWN and J atttack.
    expect(paired.filter(([, twin, own]) => twin !== own)).toEqual([
      [79, 81, 123],
      [77, 79, 124],
    ]);
    expect(CHARACTERS.sww.aliases).toEqual({ 123: 79, 124: 77 });
    // One before Ryuko's KOs, two after his hits, three for Twis 2 and the
    // shock, two from Shock, five for the rambu stops, his own FB where
    // Ryuko's is, two from HISO stop, four from Pull Back and three past
    // Chuck Hiso.
    expect(
      [59, 60, 73, 86, 87, 88, 90, 107, 108, 110, 113, 121, 140, 149].map(
        (r) => twins[r],
      ),
    ).toEqual([58, 59, 75, 88, 90, 91, 92, 109, 113, 110, 115, 125, 143, 152]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.sww.levels).toMatchObject({
      180: 21, // P1
      189: 10, // K1
      211: 31, // Chan
      214: 31, // Ryuseiken start
      227: 31, // Chain start
      235: 31, // ICE Punch start
      244: 31, // Dragon P START
      276: 31, // Phenix start
      289: 41, // DS start
      319: 41, // counter
      333: 41, // SUPER RSK Start
      357: 42, // Healing start
      371: 41, // roll crash start
      385: 42, // EN300 start
    });
    const { sww, steps } = swwPlayer();
    steps({}, 2);
    steps(K);
    expect(sww).toMatchObject({ action: 'script', branch: 189, age: 0 });
  });

  it('chains J and K through P1 hit or K1 hit into P2 or K2, then P3 or K3 (op 0x24)', () => {
    // P1 hit and K1 hit take J or K within 20 ticks (PCs 2491–2492,
    // 2669–2670), P2 and K2 within 30 (PCs 2515–2516, 2699–2700). P3 hit
    // dashes through into P3 Hit (184), whose P 3 obj (185) strikes behind.
    const p3 = play(presses({ 0: J, 14: J, 60: J }));
    expect(p3).toMatchObject({
      mine: [180, 181, 182, 183, 184, 'turn', 'idle'],
      damage: 66,
    });
    expect(p3.objects).toContain(185);
    expect(play(presses({ 0: K, 20: K, 50: K }))).toMatchObject({
      mine: [189, 190, 191, 192, 'idle'],
      damage: 34,
    });
    expect(play(presses({ 0: J, 14: J, 60: K }))).toMatchObject({
      mine: [180, 181, 182, 192, 'idle'],
      damage: 36,
    });
    // In EX mode P3 hit leaps as EX P3 (187, PC 2525).
    expect(play(presses({ 0: J, 14: J, 60: J }), { ex: true })).toMatchObject({
      mine: [180, 181, 182, 187, 188, 'idle'],
      damage: 66,
    });
    expect(byKey({ throw: true })).toMatchObject({
      mine: [207, 208, 'turn', 'idle'],
      damage: 20,
    });
    // Hit up hit (205) takes ↑ within 20 ticks (PC 2946) into Jump cancel.
    expect(
      play((t) =>
        t === 0 ? { hitUp: true } : t >= 10 && t < 400 ? { jump: true } : {},
      ),
    ).toMatchObject({ mine: [203, 205, 206, 'land', 'turn', 'idle'] });
  });

  it('plays his specials: Dragon P, ICE Punch, Chain att and Ryuseiken, which ↓→ J follows', () => {
    for (const [key, mine, damage] of [
      [{ drill: true }, [244, 245, 246, 248, 'idle'], 40],
      [{ axe: true }, [235, 'idle'], 20],
      [{ iori: true }, [227, 228, 'turn', 'idle'], 25],
      // Ryuseiken start calls RSK RP1 five times (PC 3074).
      [{ dst: true }, [214, 'idle'], 15],
    ] as const) {
      const move = byKey(key);
      expect(move).toMatchObject({ mine, damage });
      expect(move.sww.stock).toBe(3);
    }
    // ↓→ J within 35 ticks of PC 3076 or 3078 enters RSK add (216), as of
    // RSK RP1's PCs 3095 and 3103 within its calls, whose own calls (PCs
    // 3118–3119) leave none to return into: its 25 after RP1's 2 and 1 a
    // pass, cut at the first pass's first check or the last's.
    for (const [at, damage] of [
      [28, 27],
      [100, 39],
      [110, 40],
    ]) {
      expect(
        play(presses({ 0: { dst: true }, ...downForward(at) })),
      ).toMatchObject({ mine: [214, 216, 'idle'], damage });
    }
    // Chain start hit puts 技名12 (230) in slot 1 for 80 ticks (PC 3360);
    // Chain start's spawn into the busy slot enters Chain 2 (229, PC 3321).
    expect(
      play(presses({ 0: { iori: true }, 100: { iori: true } })),
    ).toMatchObject({ mine: [227, 228, 'turn', 229, 'idle'] });
    // In the air Ryuseiken is Phenix start (276).
    const phenix = play(presses({ 0: { jump: true }, 10: { dst: true } }));
    expect(phenix).toMatchObject({
      mine: ['takeoff', 'jump', 276, 279, 'idle'],
      damage: 25,
    });
    expect(phenix.objects).toContain(281);
  });

  it('launches an ICE Punch victim away with Hit up: its HIT UP tests variable 8 (PC 921) into HISA', () => {
    // The victim's reactions and, as Hit up's starts, both stops.
    const reactions = (victim: Who, ice: boolean) => {
      const { sww, other, steps } = swwPlayer(90, victim);
      steps({}, 2);
      const seen: unknown[][] = [];
      for (let t = 0; t < 400; t++) {
        steps(t === 0 && ice ? { axe: true } : t === 80 ? { hitUp: true } : {});
        if (seen.at(-1)?.[0] !== other.action)
          seen.push(
            t >= 80 && t < 120
              ? [other.action, other.hitStop, sww.hitStop]
              : [other.action],
          );
      }
      return seen;
    };
    for (const victim of ['ryuko', 'sou'] as const) {
      // ICE Punch sets variable 8 to 100 (PCs 1347, SOU's 1429); HISA, 13
      // stop ticks for both (PC 907), clears it.
      expect(reactions(victim, true)).toEqual([
        ['idle'],
        ['icePunch'],
        ['launchAway', 13, 13],
        ['knockdown'],
        ['getUp'],
        ['idle'],
      ]);
      expect(reactions(victim, false).slice(0, 2)).toEqual([
        ['idle'],
        ['launchUp', 10, 33],
      ]);
    }
  });

  it('turns ICE Punch, Dragon P, GOD DRAGON, EN300 and Healing into their G forms at or below 138 life (op 0x11)', () => {
    const low = { hp: 100 };
    for (const [key, mine, damage] of [
      [{ axe: true }, [237, 'idle'], 20],
      [{ drill: true }, [255, 256, 257, 259, 'idle'], 50],
      [{ musashi: true }, [294, 298, 299, 259, 'turn', 'idle'], 130],
      [{ blackRush: true }, [390, 'idle'], 230],
    ] as const)
      expect(byKey(key, low)).toMatchObject({ mine, damage });
    // Healing start enters Chain start (227) above it (PC 5737); below, it
    // spends three stocks and heals 160 through Call Healing (362).
    expect(byKey({ megaBeam: true })).toMatchObject({
      mine: [227, 228, 'turn', 'idle'],
      damage: 25,
    });
    const heal = byKey({ megaBeam: true }, low);
    expect([heal.mine, heal.taken, heal.sww.stock]).toEqual([
      [357, 'idle'],
      -160,
      0,
    ]);
  });

  it('spends 50 power on Chan (211), which sets variable 0 (PC 3031), and back (212)', () => {
    const chan = byKey({ ex: true });
    expect([chan.mine, exMode(chan.sww), chan.sww.stock]).toEqual([
      [211, 'idle'],
      true,
      2,
    ]);
    expect(chan.sww.power).toBe(50);
    const back = byKey({ ex: true }, { ex: true });
    expect([back.mine, exMode(back.sww), back.sww.stock]).toEqual([
      [212, 'idle'],
      false,
      2,
    ]);
  });

  it('turns his specials and supers into their EX forms in EX mode', () => {
    const ex = { ex: true };
    for (const [key, mine, damage] of [
      [{ drill: true }, [269, '270+20', 271, 'idle'], 38],
      [{ axe: true }, [242, 184, 'turn', 'idle'], 40],
      [{ dst: true }, [220, 'idle'], 18],
      [{ musashi: true }, [302, 304, 305, 308, 'idle'], 116],
      [{ changeAttack: true }, [327, 'idle'], 100],
    ] as const)
      expect(byKey(key, ex)).toMatchObject({ mine, damage });
    // EX RSK takes ↓→ J (PCs 3179–3188) into RSK SF 2 (222).
    expect(
      play(presses({ 0: { dst: true }, ...downForward(20) }), ex),
    ).toMatchObject({ mine: [220, 222, 'idle'], damage: 36 });
    // Gysa's > ICE PUNCH FIRE (343) has no box for 16 ticks (PCs 5547–5566),
    // flying past a near opponent.
    for (const [gap, damage] of [
      [90, 0],
      [250, 30],
    ])
      expect(byKey({ getterBeam: true }, { ex: true, gap })).toMatchObject({
        mine: [341, 'idle'],
        damage,
      });
  });

  it('spends a stock on SUPER RSK and GOD DRAGON, three on EN300', () => {
    for (const [key, mine, damage, left] of [
      ['getterBeam', [333, 'idle'], 100, 2],
      ['musashi', [289, 292, 293, 248, 'turn', 'idle'], 120, 2],
      ['blackRush', [385, 'idle'], 220, 0],
    ] as const) {
      const move = byKey({ [key]: true });
      expect([move.mine, move.damage, move.sww.stock]).toEqual([
        mine,
        damage,
        left,
      ]);
    }
    expect(byKey({ blackRush: true }, { stock: 2 })).toMatchObject({
      mine: [284, 'idle'],
      damage: 0,
    });
  });

  it('counters a strike in COUNTER CHAIN (variable 4 at 100) and EX Chain (200)', () => {
    // counter holds variable 4 at 100 for 70 ticks (PCs 4989–4994): struck
    // then, his reaction enters CHAIN COOUNTER SUCCESS (325).
    const struck = (at: number) =>
      byKey({ changeAttack: true }, { theirs: presses({ [at]: J }) });
    expect(struck(50)).toMatchObject({ mine: [319, 325, 'idle'], damage: 119 });
    expect(struck(120)).toMatchObject({
      mine: [319, 'hit', 'idle'],
      damage: 0,
    });
    // EX Chain holds it at 200 (PCs 3416–3431), entering EXC Att (233).
    const exStruck = (at: number) =>
      byKey({ iori: true }, { ex: true, theirs: presses({ [at]: J }) });
    expect(exStruck(20)).toMatchObject({
      mine: [232, 233, 'idle'],
      damage: 40,
    });
    expect(exStruck(90)).toMatchObject({
      mine: [232, 'hit', 'idle'],
      damage: 0,
    });
  });

  it('cancels Ryuseiken, which sets variable 6, into a super for two stocks', () => {
    for (const [key, mine, damage] of [
      ['getterBeam', [214, '287+9', 'idle'], 102],
      ['musashi', [214, 287, 292, 293, 248, 'turn', 'idle'], 122],
      ['changeAttack', [214, 320, 'idle'], 82],
    ] as const) {
      const move = play(presses({ 0: { dst: true }, 15: { [key]: true } }));
      expect([move.mine, move.damage, move.sww.stock]).toEqual([
        mine,
        damage,
        1,
      ]);
    }
    const sr = play(presses({ 0: { dst: true }, 15: { musashi: true } }), {
      ex: true,
    });
    expect([sr.mine, sr.damage, sr.sww.stock]).toEqual([
      [220, 303, 304, 305, 308, 'idle'],
      116,
      1,
    ]);
  });

  it('ends the round in a double KO with ROLL CRASH, only at or below 138 life', () => {
    // J J → K J within 85 ticks (entry 1).
    const roll = presses({ 0: J, 2: J, 4: { right: true }, 6: K, 8: J });
    expect(play(roll)).toMatchObject({ mine: [180, 181, 284, 'idle'] });
    // Roll Crash hit takes 1000 from both (PC 5957), then jumps to his HISA
    // (82, PC 5959); his own KO enters on the next step.
    const crash = play(roll, { hp: 100 });
    expect(crash).toMatchObject({
      mine: [180, 181, 371, 373, '373+18', 'launchAway', 'down', 'koLand'],
      damage: 510,
      taken: 100,
    });
    expect([crash.sww.stock, crash.match.winner]).toEqual([1, 'draw']);
  });

  it('charges two stocks through his Vs. intro and starts in EX mode while down is held at its check (PC 330)', () => {
    expect(animationDuration('32+3', 'sww')).toBe(200);
    for (const crouch of [false, true]) {
      // 開始時 BR keeps its 50-tick display, as KGT 13's global 14 fails its
      // jump past it (PC 317). The check enters EX CHANGE (37).
      const { path, f } = brIntro('sww', 0, () => ({ crouch }));
      // OP super Charge (39, PC 320) runs alongside.
      expect([path, exMode(f), f.stock]).toEqual([
        [30, 32, ...(crouch ? [37] : [])],
        crouch,
        2,
      ]);
    }
    expect([0, 40, 80, 120].map((face) => faceImage(face, 'sww'))).toEqual([
      2002, 2001, 2000, 2001,
    ]);
  });

  it('wins after Demo stand, looping PCs 542–559 (PC 560), and draws looping images 288–289 (PC 646)', () => {
    expect(
      [0, 58, 68, 230, 240, 250, 2000].map(
        (age) => animationFrame('win', age, 'sww').image,
      ),
    ).toEqual([113, 290, 291, 297, 291, 290, 301]);
    expect(
      [57, 58, 68, 81, 2000].map(
        (age) => animationFrame('draw', age, 'sww').image,
      ),
    ).toEqual([114, 288, 289, 288, 289]);
    expect(BLACK.sww.opaque.image).toBe(1009);
    expect(faceImage(-1, 'sww')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const match = new Match('cpu', false, 17, ['ryuko', 'sww']);
    const sww = match.fighters[1];
    const entered = new Set<unknown>();
    // Chain start, ICE Punch start, Dragon P START, DS start, RSK add and his
    // CPU's own CPU RSK.
    const wanted = [216, 227, 235, 244, 289, 454];
    for (let t = 0; t < 30000 && !wanted.every((b) => entered.has(b)); t++) {
      match.step({});
      if (sww.action === 'script') entered.add(sww.branch);
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
