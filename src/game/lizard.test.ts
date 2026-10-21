import { describe, expect, it } from 'vitest';
import { CHARACTERS, desperationOf, lifeOf, responsesOf } from './characters';
import type { Who } from './characters';
import { animationFrame, BLACK } from './animations';
import { faceImage } from './hud';
import { Match } from './match';
import type { Fighter, Input } from './match';
import { StandingVM } from './standing';
import { brIntro, chuckKO } from './testing';

// LIZARD as player 1, `gap` from a standing opponent.
function lizardPlayer(gap = 90, opponent: Who = 'ryuko') {
  const match = new Match('practice', false, 3, ['lizard', opponent]);
  const [lizard, other] = match.fighters;
  other.x = lizard.x + gap;
  const steps = (input: Input, ticks = 1, theirs: Input = {}) => {
    for (let t = 0; t < ticks; t++) match.step(input, theirs);
  };
  return { match, lizard, other, steps };
}
const now = (f: Fighter) => (f.action === 'script' ? f.branch : f.action);
// A move entered by its key at `hp`, run until both are back on their feet,
// the opponent jumping at `jumpAt`: LIZARD's actions and the damage dealt.
function byKey(key: Input, { gap = 90, hp = 510, stock = 3, jumpAt = -1 }) {
  const { lizard, other, steps } = lizardPlayer(gap);
  lizard.hp = hp;
  lizard.stock = stock;
  steps({}, 2);
  const mine: unknown[] = [];
  for (let t = 0; t < 3000; t++) {
    steps(t ? {} : key, 1, t === jumpAt ? { jump: true } : {});
    if (mine.at(-1) !== now(lizard)) mine.push(now(lizard));
  }
  return { lizard, mine, damage: 510 - other.hp };
}

describe('LIZARD (11 LIZARD.PLAYER)', () => {
  it('takes 510 life from his parameter block, desperate at 153', () => {
    expect([lifeOf('lizard'), desperationOf('lizard')]).toEqual([510, 153]);
    const { lizard } = lizardPlayer();
    expect(lizard).toMatchObject({ who: 'lizard', hp: 510, action: 'idle' });
  });

  it("pairs his victim actions with Ryuko's through the response table", () => {
    const twins = CHARACTERS.lizard.twins as Record<string, number>;
    const paired = responsesOf('ryuko').flatMap((ryuko, id) =>
      ryuko in twins ? [[twins[ryuko], responsesOf('lizard')[id]]] : [],
    );
    expect(paired).toHaveLength(73);
    expect(paired.filter(([twin, own]) => twin !== own)).toEqual([]);
    // Three after Ryuko's, four for the twists and the shock, three from
    // Shock rp and two past Ryuko's Chuck Hiso (139).
    expect([60, 73, 85, 86, 88, 90, 140, 149].map((r) => twins[r])).toEqual([
      63, 76, 88, 90, 92, 93, 142, 151,
    ]);
  });

  it("reads his command table, entering each move's source action", () => {
    expect(CHARACTERS.lizard.levels).toMatchObject({
      180: 21, // P1
      202: 22, // K j
      214: 31, // FIRE BALL START
      227: 31, // dragon start
      279: 41, // HID START
      287: 42, // en3 start
    });
    const { lizard, steps } = lizardPlayer();
    steps({}, 2);
    steps({ punch: true });
    expect(lizard).toMatchObject({ action: 'script', branch: 180, age: 0 });
  });

  it('plays his specials: FIRE for 30, Cross for 30 and jump att for 40, also in the air', () => {
    expect(byKey({ axe: true }, {})).toMatchObject({
      mine: [214, 'idle'],
      damage: 30,
    });
    expect(byKey({ drill: true }, {})).toMatchObject({
      mine: [227, 'idle'],
      damage: 30,
    });
    expect(byKey({ iori: true }, {})).toMatchObject({
      mine: [230, 234, 233, 'idle'],
      damage: 40,
    });
  });

  it('turns HIDDEN into FIRE at 153 life or more (op 0x11, PC 3749)', () => {
    expect(byKey({ getterBeam: true }, {})).toMatchObject({
      mine: [214, 'idle'],
      damage: 30,
    });
    const hidden = byKey({ getterBeam: true }, { hp: 152 });
    expect(hidden).toMatchObject({ mine: [279, 282, 'idle'], damage: 80 });
    expect(hidden.lizard.stock).toBe(2);
  });

  it('catches only an airborne opponent with chuck sup (box kind 0x10, PC 3594)', () => {
    expect(byKey({ musashi: true }, {})).toMatchObject({
      mine: [263, 276, 'turn', 'idle'],
      damage: 0,
    });
    expect(byKey({ musashi: true }, { jumpAt: 50 })).toMatchObject({
      mine: [263, 264, 273, 'idle'],
      damage: 60,
    });
  });

  it('sends the victim of a lethal chuck hit lend into make hikari, on either side (global 0 = 10, PCs 3703, 3712)', () => {
    for (const side of [0, 1]) {
      const { match, path, entry } = chuckKO(side, 'ryuko');
      // KO'd at priority 0x3c, the victim steps before LIZARD clears global
      // 0, so its lose action jumps to make hikari (63, PC 590), which
      // passes global 3 = 0 to 63 + 5 (PC 651) and lands into 63 + 12.
      expect(path).toEqual([
        'idle',
        'takeoff',
        'jump',
        'superHeld',
        'vanish',
        'rushAirHit',
        '63+5',
        '63+12',
      ]);
      expect(entry).toEqual({
        sounds: [24, 16].map((index) => ({ owner: 1 - side, index })),
        screen: ['59+9'],
      });
      expect(match.resultReady).toBe(true);
    }
  });

  it('calls his birds with dragon sp: its rising probe meets the opponent with no response and calls them there', () => {
    // dragon up handen (247) has no op 0x17, so its damage-0 box queues its
    // hit handler, call bird st (248, PC 3399), without a reaction; it also
    // runs out into 248 (PC 3406), whose records run as its display ends.
    expect(byKey({ changeAttack: true }, {})).toMatchObject({
      mine: [245, 246, '246+7', 'idle'],
      damage: 115,
    });
    // Meeting no one, the probe calls them as it runs out, 60 ticks in.
    const { match, lizard, other, steps } = lizardPlayer();
    lizard.stock = 3;
    steps({}, 2);
    steps({ changeAttack: true });
    const probe = () => match.effects.find((e) => e.clip === 247);
    while (!probe()) steps({});
    other.x = lizard.x + 1300;
    const ages: number[] = [];
    for (let t = 0; t < 70; t++) {
      const age = probe()?.age;
      steps({});
      if (match.effects.some((e) => e.clip === 249)) ages.push(age!);
    }
    expect(ages[0]).toBe(59);
  });

  it('strikes through en300 for 201: its explosion clears its handlers with action 0 (PCs 3940–3942)', () => {
    const en300 = byKey({ blackRush: true }, {});
    expect(en300).toMatchObject({ mine: [287, 'idle'], damage: 201 });
    expect(en300.lizard.stock).toBe(0);
  });

  it('stands in action 1 until it runs out (PC 27), with no EX or life check', () => {
    const vm = new StandingVM(CHARACTERS.lizard.idle);
    const seen: number[] = [];
    for (let t = 0; t < 400 && !vm.ended; t++) {
      vm.tick();
      if (vm.frame && seen.at(-1) !== vm.frame.image) seen.push(vm.frame.image);
    }
    expect([vm.ended, seen.slice(0, 7)]).toEqual([
      true,
      [113, 114, 115, 116, 117, 118, 117],
    ]);
  });

  it('leaps in from above in his Vs. intro, landing into OP lend, charged with two stocks', () => {
    // 開始時 BR (33) from PC 367: unseen at first, then the leap's 396 (PC
    // 378) and 132.
    expect(
      [0, 104, 165].map((age) => animationFrame('33+3', age, 'lizard').image),
    ).toEqual([0, 396, 132]);
    const { path, ticks, f, match, heights, images } = brIntro('lizard');
    // Up 80 source pixels in two ticks (PC 372), after 開始時's (31) blank
    // display; the leap's fall passes the floor on its 62nd move, and the
    // landing (0x41187f) enters OP lend (36, slot 1 at PC 383) a tick later.
    expect(heights[5] / 1.5).toBeCloseTo(-79.96, 2);
    expect(heights[165] / 1.5).toBeCloseTo(-9.23, 2);
    expect([heights[166] > 0, heights[167], images[167]]).toEqual([
      true,
      0,
      126,
    ]);
    expect([path, ticks]).toEqual([[31, '33+3', 36], 218]);
    // From 390 source pixels (0x408ac3), raw 400 through the leap.
    expect(f.x).toBeCloseTo(390 * 1.5 + 62 * 400 * (655 / 65536) * 1.5, 6);
    // OP super Charge (42, PC 369) takes 300 power, borrowing stocks down to
    // none (0x40e6f0), then calls 43 a hundred times for 2 each (PC 481).
    for (let t = 0; t < 100; t++) match.step({});
    expect([f.stock, f.power]).toEqual([2, 0]);
  });

  it('wins with DEMO STAND, ten passes of win RP (PC 629) after the sound before them (PC 628), then holds 409', () => {
    expect(
      [0, 170, 171, 176, 270, 271, 301, 805].map(
        (age) => animationFrame('win', age, 'lizard').image,
      ),
    ).toEqual([113, 121, 402, 403, 403, 404, 409, 409]);
    const sounds = (age: number) =>
      (animationFrame('win', age, 'lizard').events ?? []).flatMap((e) =>
        e.op === 'sound' ? [e.index] : [],
      );
    expect([sounds(170), sounds(171), sounds(271)]).toEqual([[], [10], []]);
    expect(animationFrame('draw', 1000, 'lizard').image).toBe(134);
    expect(BLACK.lizard.opaque.image).toBe(1009);
    expect(faceImage(-1, 'lizard')).toBe(2001);
  });

  it('plays his own CPU table in Vs. CPU', () => {
    const entered = new Set<unknown>();
    // FIRE, chuck sup and dragon sp, over two seeds.
    const wanted = [214, 263, 245];
    for (const seed of [1, 4]) {
      const match = new Match('cpu', false, seed, ['ryuko', 'lizard']);
      const lizard = match.fighters[1];
      for (let t = 0; t < 8000 && !wanted.every((b) => entered.has(b)); t++) {
        match.step({});
        if (lizard.action === 'script') entered.add(lizard.branch);
      }
    }
    expect([...entered]).toEqual(expect.arrayContaining(wanted));
  });
});
