import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type Phaser from 'phaser';
import { DEFAULT_CHEATS } from './cheats';
import { itWithArt } from './testing';
import ui from './generated/ui.json';
import {
  createHud,
  faceImage,
  gaugeCrop,
  gaugeImage,
  DRESS_TICK,
  FIGHT_TICK,
  koFrame,
  KO_TICKS,
  letteringSounds,
  NEXT_ROUND_TICKS,
  roundEndTick,
  ROUND_END_TICKS,
  healthCrop,
  stockTexture,
  screenDepth,
} from './hud';
import { Match } from './match';
import { scenarioOf } from './story';
import type { Battle } from './story';

// A stand-in Phaser scene for createHud: every image, rectangle and text
// records the texture, text, position, crop and visibility the HUD sets on
// it. `lifeBars`, `stocks`, `underPower` and `tag` follow createHud's
// construction order (hud.ts), as do the cheat marks, highlights and cut
// texts.
const hudScene = () => {
  const sprite = () => {
    const s = {
      texture: '',
      text: '',
      x: 0,
      y: 0,
      visible: true,
      crop: { x: 0, width: 0 },
      depth: 0,
      setTexture(texture: string) {
        this.texture = texture;
        return this;
      },
      setText(text: string) {
        this.text = text;
        return this;
      },
      setVisible(visible: boolean) {
        this.visible = visible;
        return this;
      },
      setCrop(x: number, _y: number, width: number) {
        this.crop = { x, width };
        return this;
      },
      setX(x: number) {
        this.x = x;
        return this;
      },
      setPosition(x: number, y: number) {
        this.x = x;
        this.y = y;
        return this;
      },
      setScrollFactor: () => s,
      setOrigin: () => s,
      setScale: () => s,
      setDepth(depth: number) {
        this.depth = depth;
        return s;
      },
      setAlpha: () => s,
      setBlendMode: () => s,
      setFlipX: () => s,
    };
    return s;
  };
  const images: ReturnType<typeof sprite>[] = [];
  const rects: ReturnType<typeof sprite>[] = [];
  const texts: ReturnType<typeof sprite>[] = [];
  const scene = {
    add: {
      image: () => {
        const s = sprite();
        images.push(s);
        return s;
      },
      rectangle: () => {
        const s = sprite();
        rects.push(s);
        return s;
      },
      text: () => {
        const s = sprite();
        texts.push(s);
        return s;
      },
    },
  };
  return {
    as: scene as unknown as Phaser.Scene,
    // createHud's own layout: the life bars (6th/7th image) and the stock
    // counters (23rd/24th).
    lifeBars: () => [images[5], images[6]],
    stocks: () => [images[22], images[23]],
    // The UNDER PW glow (2nd/3rd image), the cheat line's markers and
    // highlights, and the CHEAT tag plus the two Damage cut texts.
    underPower: () => [images[1], images[2]],
    marks: () => [rects[0], rects[1]],
    glows: () => [rects[2], rects[3]],
    tag: () => texts[0],
    cuts: () => [texts[1], texts[2]],
  };
};

it('draws the Damage cut labels over the face strips and names', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  match.useCheats({ ...DEFAULT_CHEATS, enabled: true });
  update(match);
  expect(hud.cuts().map((cut) => cut.depth)).toEqual([
    screenDepth(0x1a),
    screenDepth(0x1a),
  ]);
});

it('shows the CHEAT tag only for a battle whose effective cheats are on', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const native = new Match('cpu', true);
  update(native);
  expect(hud.tag().visible).toBe(false);
  const cheated = new Match('cpu', true);
  cheated.useCheats({ ...DEFAULT_CHEATS, enabled: true });
  update(cheated);
  expect(hud.tag().visible).toBe(true);
  update(native);
  expect(hud.tag().visible).toBe(false);
});

it('shows the CHEAT tag from a mid-match summon alone (HPA-972)', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  update(match);
  expect(hud.tag().visible).toBe(false);
  // A summon into a battle whose snapshot is still disabled marks it.
  match.summon('zoma', -1, DEFAULT_CHEATS);
  update(match);
  expect(hud.tag().visible).toBe(true);
  // The next battle's native match clears it again.
  update(new Match('cpu', true));
  expect(hud.tag().visible).toBe(false);
});

it('crops the HUD life bar by the battle’s effective maximum', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const cheated = new Match('cpu', true);
  cheated.useCheats({
    ...DEFAULT_CHEATS,
    enabled: true,
    playerHpMultiplier: 2,
    enemyHpMultiplier: 2,
  });
  update(cheated);
  // Both bars full at their scaled maxima: 1020/1020 each.
  expect(hud.lifeBars().map((bar) => bar.crop)).toEqual([
    { x: 0, width: 254 },
    { x: 0, width: 254 },
  ]);
  // Half life shows half the bar against the doubled maximum, not none.
  cheated.fighters[0].hp = 510;
  update(cheated);
  expect(hud.lifeBars()[0].crop).toEqual({ x: 127, width: 127 });
});

it('keeps the native UNDER PW glow with cheats off', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  update(match);
  expect(hud.underPower().map((bar) => bar.visible)).toEqual([true, true]);
  expect(hud.marks().map((mark) => mark.visible)).toEqual([false, false]);
  expect(hud.glows().map((glow) => glow.visible)).toEqual([false, false]);
  expect(hud.cuts().map((cut) => cut.visible)).toEqual([false, false]);
});

it('freezes the absent rival’s glow across a blink boundary', () => {
  const hud = hudScene();
  // A tint stub that marks every tinted key, so the blink reads off the
  // recorded textures.
  const update = createHud(hud.as, (key) => `${key}·`);
  // A story round before its enemy sits: the 2P side has no fighter.
  const first = scenarioOf('ryuko')[0] as Battle;
  const match = Match.story('ryuko', first, 0);
  expect(match.rival).toBeNull();
  update(match);
  // The layout keeps the strip drawn with no enemy (0x40de7f), but its
  // blink only runs where a fighter does — the absent texture stays put.
  const [one, two] = hud.underPower();
  expect([one.visible, two.visible]).toEqual([true, true]);
  expect(one.texture).toBe('ui-135');
  expect(two.texture).toBe('');
  match.ticks = 15;
  update(match);
  expect(one.texture).toBe('ui-135·');
  expect(two.texture).toBe('');
  match.ticks = 30;
  update(match);
  expect(one.texture).toBe('ui-135');
  expect(two.texture).toBe('');
});

it('hides the fixed glow under cheats and marks the real line (10%–60%)', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  match.useCheats({ ...DEFAULT_CHEATS, enabled: true, lowHpLine: 60 });
  update(match);
  expect(hud.underPower().map((bar) => bar.visible)).toEqual([false, false]);
  // 1P's bar keeps its right columns: the 60% mark (306 of 510) sits at
  // 22 + 254·(1 − 306/510) in source pixels, at the 1.5× HUD scale.
  const [one] = match.fighters;
  expect(hud.marks()[0].x).toBeCloseTo(
    (22 + 254 - (254 * match.lifeLineMark(one)) / 510) * 1.5,
  );
  expect(hud.marks().map((mark) => mark.visible)).toEqual([true, true]);
  // Full HP stays above the line: no highlight yet.
  expect(hud.glows().map((glow) => glow.visible)).toEqual([false, false]);
  expect(hud.cuts()[0].text).toBe('Damage cut: 40%');
  // At the line the 1P side lights up; the rival at full HP stays dark.
  one.hp = 306;
  update(match);
  expect(hud.glows().map((glow) => glow.visible)).toEqual([true, false]);
  // One point above the line it goes out again.
  one.hp = 307;
  update(match);
  expect(hud.glows()[0].visible).toBe(false);
  // The 10% line reads 51 of 510: the marker sits just inside the bar.
  const low = new Match('cpu', true);
  low.useCheats({ ...DEFAULT_CHEATS, enabled: true, lowHpLine: 10 });
  low.fighters[0].hp = 51;
  update(low);
  expect(hud.glows()[0].visible).toBe(true);
  low.fighters[0].hp = 52;
  update(low);
  expect(hud.glows()[0].visible).toBe(false);
  // A dead fighter's strip draws no line, and a native battle restores
  // the fixed glow.
  one.hp = 0;
  update(match);
  expect(hud.marks()[0].visible).toBe(false);
  expect(hud.cuts()[0].visible).toBe(false);
  update(new Match('cpu', true));
  expect(hud.underPower()[0].visible).toBe(true);
  expect(hud.marks()[0].visible).toBe(false);
});

it('keeps the low-HP line visible on a living fighter whose bar crops to 0 wide', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  match.useCheats({ ...DEFAULT_CHEATS, enabled: true, lowHpLine: 10 });
  // 2 of 510 rounds the fill to floor(254·2/510) = 0 — the strip draws
  // nothing natively, but the fighter is alive: the line, highlight and
  // cut stay.
  match.fighters[0].hp = 2;
  update(match);
  expect(hud.marks()[0].visible).toBe(true);
  expect(hud.glows()[0].visible).toBe(true);
  expect(hud.cuts()[0].visible).toBe(true);
  // A dead fighter keeps every part hidden.
  match.fighters[0].hp = 0;
  update(match);
  expect(hud.marks()[0].visible).toBe(false);
  expect(hud.glows()[0].visible).toBe(false);
  expect(hud.cuts()[0].visible).toBe(false);
});

it('keeps the low-HP highlight independent of a 0× Damage cut', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  match.useCheats({
    ...DEFAULT_CHEATS,
    enabled: true,
    damageCutMultiplier: 0,
    lowHpLine: 60,
  });
  match.fighters[0].hp = 100;
  update(match);
  expect(hud.glows()[0].visible).toBe(true);
  expect(hud.cuts()[0].visible).toBe(true);
  expect(hud.cuts()[0].text).toBe('Damage cut: 0%');
});

it('shows each side its own Damage cut', () => {
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('practice', false, 0, ['ryuko', 'alpha']);
  match.useCheats({ ...DEFAULT_CHEATS, enabled: true, lowHpLine: 100 });
  update(match);
  // Ryuko keeps 60% of a loss, ALPHA her native 45%: at the 100% line
  // both sides light up with their own number.
  expect(hud.cuts()[0].text).toBe('Damage cut: 40%');
  expect(hud.cuts()[1].text).toBe('Damage cut: 55%');
  expect(hud.glows().map((glow) => glow.visible)).toEqual([true, true]);
});

it('draws the stock count from the source 0–6 digits and the authored 7–10 art', () => {
  for (const index of [17, 18, 19, 20, 21, 22, 23])
    expect(ui.images.some((image) => image.index === index)).toBe(true);
  // The source word ends at 600 (six stocks); 700–1000 are HPA-971's authored
  // digits, shipped in the boot pack as en-7 … en-10.
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(stockTexture)).toEqual([
    'ui-17',
    'ui-18',
    'ui-19',
    'ui-20',
    'ui-21',
    'ui-22',
    'ui-23',
    'en-7',
    'en-8',
    'en-9',
    'en-10',
  ]);
  const hud = hudScene();
  const update = createHud(hud.as, (key) => key);
  const match = new Match('cpu', true);
  for (let stock = 0; stock <= 10; stock++) {
    match.fighters[0].stock = stock;
    update(match);
    expect(hud.stocks()[0].texture).toBe(stockTexture(stock));
    expect(hud.stocks()[0].visible).toBe(true);
  }
});

it('plays the recovered KO displays through the squash-out before showing rematch', () => {
  expect(KO_TICKS).toBe(166);
  expect(koFrame(0)?.image).toBe(97);
  expect(koFrame(11)?.image).toBe(98);
  expect(koFrame(100)?.image).toBe(101);
  expect(koFrame(165)?.image).toBe(110);
  expect(koFrame(166)).toBeUndefined();
  const match = new Match();
  match.fighters[1].hp = 0;
  // The KO, state 300, then the result state, which spawns KO.
  for (let i = 0; i < 3; i++) match.step();
  for (let i = 0; i < KO_TICKS; i++) match.step();
  expect(match.resultReady).toBe(false);
  for (let i = KO_TICKS; i < ROUND_END_TICKS; i++) match.step();
  expect(match.resultReady).toBe(true);
});

it("keeps each life bar's inner columns, truncating, without stretching the gradient", () => {
  expect(healthCrop(255, false)).toEqual({ x: 127, width: 127 });
  expect(healthCrop(255, true)).toEqual({ x: 0, width: 127 });
  expect(healthCrop(0, true)).toEqual({ x: 0, width: 0 });
  expect(healthCrop(510, false)).toEqual({ x: 0, width: 254 });
  // 2 × 254 / 510 truncates to 0 (0x40ddcd).
  expect(healthCrop(2, false)).toEqual({ x: 254, width: 0 });
  // UNDER PW's 74 pixels show once Ryuko's bar is under them: 148 life.
  expect(healthCrop(149, false).width).toBe(74);
  expect(healthCrop(148, false).width).toBe(73);
});

it('anchors power bars at their inner ends and cycles the recovered shimmer', () => {
  expect(gaugeCrop(0)).toEqual({ x: 126, width: 0 });
  expect(gaugeCrop(40)).toEqual({ x: 76, width: 50 });
  expect(gaugeCrop(99)).toEqual({ x: 2, width: 124 });
  expect([0, 49, 50, 55, 84, 85].map(gaugeImage)).toEqual([
    31, 31, 32, 33, 38, 31,
  ]);
  for (const index of [17, 18, 19, 20, 31, 38, 135])
    expect(ui.images.some((image) => image.index === index)).toBe(true);
});

itWithArt(
  'exports every HUD and lettering texture at its original dimensions',
  () => {
    for (const image of ui.images) {
      const png = readFileSync(
        new URL(`../../public/assets/${image.filename}`, import.meta.url),
      );
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(image.width);
      expect(png.readUInt32BE(20)).toBe(image.height);
    }
    const { logo, rounds, fight, transition, vs } = ui.calls;
    for (const { frames } of [
      ui.ko,
      logo,
      ...rounds,
      fight,
      transition,
      ...vs.first,
      ...vs.later,
      ...vs.team,
    ])
      for (const frame of frames) {
        expect(ui.images.some((image) => image.index === frame.image)).toBe(
          true,
        );
        expect(frame.duration).toBeGreaterThan(0);
      }
  },
);

it("cycles Ryuko's HUD face in EX mode (action 70, PCs 712–730)", () => {
  expect(
    [-1, 0, 39, 40, 80, 120, 159, 160].map((face) => faceImage(face)),
  ).toEqual([2001, 2002, 2002, 2001, 2000, 2001, 2001, 2002]);
});

it("voices the KO lettering's 'KO' (KGT sound 1, PC 180) for every result", () => {
  expect(koFrame(31)?.pc).toBe(181);
  for (const timeUp of [false, true]) {
    const match = new Match('cpu');
    if (timeUp) match.ticks = 5999;
    else match.fighters[1].hp = 1;
    match.fighters[0].x = match.fighters[1].x - 130;
    for (let tick = 0; !match.winner; tick++) match.step({ punch: tick === 0 });
    const heard: number[] = [];
    while (match.endingTicks < 40) {
      match.step();
      if (letteringSounds(match).length) heard.push(match.endingTicks);
    }
    // At its age 31, its first step being the tick after its spawn.
    expect(heard).toEqual([32]);
  }
});

it('calls the Vs. CPU round: DRESS 1, then SHOW TIME and control', () => {
  expect([DRESS_TICK, FIGHT_TICK]).toEqual([351, 631]);
  const match = new Match('cpu', true);
  const heard: [number, number[]][] = [];
  while (match.roundTicks <= FIGHT_TICK) {
    match.step({ punch: true });
    const sounds = letteringSounds(match);
    if (sounds.length) heard.push([match.roundTicks, sounds]);
  }
  // 15 plays 7 and 3 ('ROUND1'); 25 plays 2 ('FIGHT') and 8, each on its
  // first step, the tick after it spawns.
  expect(heard).toEqual([
    [352, [7, 3]],
    [632, [2, 8]],
  ]);
  // And the select screen's decided cursors' 9 (KGT PCs 555, 591), the
  // title cursor's 10 (KGT PC 498) and VS L's 12 (KGT PC 863).
  expect(ui.sounds.map((s) => s.index)).toEqual([
    1, 2, 3, 4, 5, 7, 8, 9, 10, 12,
  ]);
});

it("waits out the results, then calls round 2 with 'DRESS 2' (KGT 16, sound 4)", () => {
  expect([
    roundEndTick('player', false),
    roundEndTick('opponent', true),
    roundEndTick('draw', false),
    NEXT_ROUND_TICKS,
  ]).toEqual([651, 652, 301, 51]);
  const match = new Match('cpu', true);
  while (match.roundTicks < FIGHT_TICK) match.step();
  match.fighters[1].hp = 0;
  match.step();
  const heard: [number, number[]][] = [];
  while (match.round === 1 || match.roundTicks <= DRESS_TICK) {
    match.step();
    const sounds = letteringSounds(match);
    if (sounds.length) heard.push([match.round, sounds]);
  }
  // KO (26) voices 1 at age 31; the transition (116) is silent.
  expect(heard).toEqual([
    [1, [1]],
    [2, [7, 4]],
  ]);
});

it("opens a VS round with KGT 13's VS splash, then demo black (117)", () => {
  // VS L, VS R, V and S where 13 spawns them (PCs 82–85), at z 0x7b.
  const { first, later } = ui.calls.vs;
  expect(
    first.map(({ z, frames: [frame] }) => [z, frame.image, frame.dx, frame.dy]),
  ).toEqual([
    [0x7b, 191, 0, 0],
    [0x7b, 192, 206, 0],
    [0x7b, 193, 300, 140],
    [0x7b, 194, 270, 280],
  ]);
  // The halves hold 150 ticks, then slide apart over 23; V and S fade out
  // by 10 and 20 of 32 (PCs 934, 936) over their last 10.
  expect(first.map(({ frames }) => frames.at(-1)!.dx)).toEqual([
    -440, 646, 300, 270,
  ]);
  expect(
    first[2].frames
      .slice(-3)
      .map((frame) => ('fade' in frame ? frame.fade : 0)),
  ).toEqual([0, 10, 20]);
  // V and S flash in: op 0x23 adds 32, 20, then 10 to each channel over
  // their first 40 ticks (PCs 916–922).
  for (const { frames } of first.slice(2))
    expect(
      frames
        .slice(0, 4)
        .map((frame) => [frame.duration, 'tint' in frame ? frame.tint : null]),
    ).toEqual([
      [30, [32, 32, 32]],
      [5, [20, 20, 20]],
      [5, [10, 10, 10]],
      [50, null],
    ]);
  // From round 2 the logo holds 110 ticks, then wipes away over 39.
  expect(later.map(({ z, frames }) => [z, frames[0].image])).toEqual([
    [0x7f, 182],
  ]);
  const match = new Match('cpu', true, 0, ['ryuko', 'zoma'], 'court', true);
  const heard: [number, number, number[]][] = [];
  while (match.round === 1 || match.roundTicks < DRESS_TICK) {
    if (match.round === 1 && match.roundTicks === FIGHT_TICK)
      match.fighters[1].hp = 0;
    match.step();
    const sounds = letteringSounds(match);
    if (sounds.length) heard.push([match.round, match.roundTicks, sounds]);
  }
  // VS L's slide plays 12 in round 1 only, at its age 150 from its first
  // step at tick 2; demo black is silent.
  expect(heard.filter(([, , sounds]) => sounds.includes(12))).toEqual([
    [1, 152, [12]],
  ]);
});

it('opens every VS multi round with the VS splash, and between rounds slides VS L and VS R in (120, 121)', () => {
  // KGT 14's TEAM VS path (PC 102) spawns them from the screen's edges
  // (PCs 110–111); they meet where the splash stands 23 ticks in and hold.
  const { first, team } = ui.calls.vs;
  expect(
    team.map(({ z, loop, frames }) => [
      z,
      loop,
      frames[0].image,
      frames[0].dx,
      frames.at(-1)!.dx,
      frames.reduce((ticks, frame) => ticks + frame.duration, 0),
    ]),
  ).toEqual([
    [0x7f, 7, 191, -440, 0, 28],
    [0x7f, 7, 192, 646, first[1].frames[0].dx, 28],
  ]);
  const match = Match.team(
    [
      ['ryuko', 'zoma', 'kiki'],
      ['zoma', 'kiki', 'chung'],
    ],
    'court',
  );
  const heard: [number, number, number[]][] = [];
  while (match.round === 1 || match.roundTicks < DRESS_TICK) {
    if (match.round === 1 && match.roundTicks === FIGHT_TICK)
      match.fighters[1].hp = 0;
    match.step();
    const sounds = letteringSounds(match);
    if (sounds.length)
      heard.push([
        match.round,
        match.winner ? match.endingTicks - match.roundEnd : match.roundTicks,
        sounds,
      ]);
  }
  // VS L's slide plays 12 each round, and 120 as it meets VS R, its first
  // step two ticks after state 900 spawns KGT 14.
  expect(heard.filter(([, , sounds]) => sounds.includes(12))).toEqual([
    [1, 152, [12]],
    [1, 25, [12]],
    [2, 152, [12]],
  ]);
});

it('slides VS L and VS R in after the last round too, then ends the match (states 900, 902)', () => {
  const match = Match.team(
    [
      ['ryuko', 'zoma', 'kiki'],
      ['zoma', 'kiki', 'chung'],
    ],
    'court',
  );
  const heard: number[][] = [];
  while (!match.resultReady) {
    if (match.roundTicks === FIGHT_TICK) match.fighters[1].hp = 0;
    match.step();
    if (match.winner && letteringSounds(match).includes(12))
      heard.push([match.round, match.endingTicks - match.roundEnd]);
  }
  expect(heard).toEqual([
    [1, 25],
    [2, 25],
    [3, 25],
  ]);
  expect(match.endingTicks - match.roundEnd).toBe(NEXT_ROUND_TICKS);
});
