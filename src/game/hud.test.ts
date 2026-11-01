import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { itWithArt } from './testing';
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
