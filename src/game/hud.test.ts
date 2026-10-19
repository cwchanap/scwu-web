import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import ui from './generated/ui.json';
import {
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
} from './hud';
import { Match } from './match';

it('plays the recovered KO displays through the squash-out before showing rematch', () => {
  expect(KO_TICKS).toBe(166);
  expect(koFrame(0)?.image).toBe(97);
  expect(koFrame(11)?.image).toBe(98);
  expect(koFrame(100)?.image).toBe(101);
  expect(koFrame(165)?.image).toBe(110);
  expect(koFrame(166)).toBeUndefined();
  const match = new Match();
  match.fighters[1].hp = 0;
  match.step();
  for (let i = 0; i < KO_TICKS; i++) match.step();
  expect(match.resultReady).toBe(false);
  for (let i = KO_TICKS; i < ROUND_END_TICKS; i++) match.step();
  expect(match.resultReady).toBe(true);
});

it('crops opposing life bars toward their outside edges without stretching the gradient', () => {
  expect(healthCrop(255, false)).toEqual({ x: 0, width: 127 });
  expect(healthCrop(255, true)).toEqual({ x: 127, width: 127 });
  expect(healthCrop(0, true)).toEqual({ x: 254, width: 0 });
  expect(healthCrop(510, false)).toEqual({ x: 0, width: 254 });
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

it('exports every HUD and lettering texture at its original dimensions', () => {
  for (const image of ui.images) {
    const png = readFileSync(
      new URL(`../../public/assets/${image.filename}`, import.meta.url),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(image.width);
    expect(png.readUInt32BE(20)).toBe(image.height);
  }
  const { logo, rounds, fight, transition } = ui.calls;
  for (const { frames } of [ui.ko, logo, ...rounds, fight, transition])
    for (const frame of frames) {
      expect(ui.images.some((image) => image.index === frame.image)).toBe(true);
      expect(frame.duration).toBeGreaterThan(0);
    }
});

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
    expect(heard).toEqual([31]);
  }
});

it('calls the Vs. CPU round: DRESS 1, then SHOW TIME and control', () => {
  expect([DRESS_TICK, FIGHT_TICK]).toEqual([351, 631]);
  const match = new Match('cpu', true);
  const heard: [number, number[]][] = [];
  while (match.roundTicks < FIGHT_TICK) {
    match.step({ punch: true });
    const sounds = letteringSounds(match);
    if (sounds.length) heard.push([match.roundTicks, sounds]);
  }
  // 15 plays 7 and 3 ('ROUND1'); 25 plays 2 ('FIGHT') and 8.
  expect(heard).toEqual([
    [351, [7, 3]],
    [631, [2, 8]],
  ]);
  // And the select screen's decided cursors' 9 (KGT PCs 555, 591) and the
  // title cursor's 10 (KGT PC 498).
  expect(ui.sounds.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10]);
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
  while (match.round === 1 || match.roundTicks < DRESS_TICK) {
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
