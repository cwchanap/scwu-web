import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from './generated/assets.json';
import { CHARACTERS, STAGES } from './characters';
import {
  animationDuration,
  animationFrame,
  animations,
  eventsAt,
  heldFrame,
  isBlank,
  RESPONSE_EFFECTS,
  RESPONSES,
  script,
} from './animations';

describe('selected core animation assets', () => {
  it('exports the backward, crouching, airborne, and ending pose sequences', () => {
    expect(data.clips).toMatchObject({
      backwalk: [{ image: 10 }, { image: 11 }, { image: 10 }, { image: 9 }],
      land: [{ image: 17 }, { image: 18 }],
      crouch: [
        { image: 25 },
        { image: 26 },
        { image: 27 },
        { image: 26 },
        { image: 27 },
        { image: 28 },
      ],
      win: [{ image: 295 }, { image: 31 }, { image: 366 }],
      draw: [{ image: 24 }, { image: 420 }],
    });
    // P Jump (182) runs into the fall (7) it jumps to, waiting there to land.
    expect(script(182).frames.map((f) => f.image)).toEqual([
      53, 54, 55, 56, 55, 15, 16,
    ]);
  });

  it("exports each stage's track for the optional music", () => {
    for (const [stage, seconds] of [
      ['court', 75],
      ['train', 139],
      ['sakuranight', 131],
      ['trainnight', 114],
      ['dojin', 170],
      ['japan', 99],
      ['park', 126],
      ['parknight', 120],
      ['sakura', 129],
      ['greek', 129],
      ['space', 94],
      ['boss', 126],
      ['office', 116],
      ['office2', 155],
      ['brboss', 129],
      ['gi', 134],
      ['spacenight', 91],
      ['streetnight', 82],
    ] as const) {
      const wav = readFileSync(
        new URL(
          `../../public/assets/${STAGES[stage].music.filename}`,
          import.meta.url,
        ),
      );
      expect(wav.subarray(8, 12).toString()).toBe('WAVE');
      // Seconds: payload bytes over the fmt chunk's byte rate.
      expect(Math.round(wav.length / wav.readUInt32LE(28))).toBe(seconds);
    }
  });

  it('has loadable, non-empty textures for every selected display', () => {
    const sources = [...Object.values(CHARACTERS), ...Object.values(STAGES)];
    for (const image of sources.flatMap(({ images }) => images)) {
      const png = readFileSync(
        new URL(`../../public/assets/${image.filename}`, import.meta.url),
      );
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(image.width);
      expect(png.readUInt32BE(20)).toBe(image.height);
    }
    for (const frames of Object.values(data.clips)) {
      expect(frames.length).toBeGreaterThan(0);
      for (const frame of frames) {
        expect(frame.width).toBeGreaterThan(0);
        expect(frame.height).toBeGreaterThan(0);
        expect(
          data.images.find((image) => image.index === frame.image),
        ).toMatchObject({ width: frame.width, height: frame.height });
      }
    }
    // Every fighter's exported PNGs: past the 5 s default under the full suite.
  }, 30_000);

  it('plays the selected mobility and special poses across authored transitions', () => {
    expect(animationFrame(10, 0).image).toBe(29);
    expect(animationFrame(10, 8).image).toBe(30);
    expect(animationFrame(16, 3).image).toBe(45);
    expect(animationFrame(207, 23).image).toBe(121);
    // Air Drill (208) holds 22 ticks, then jumps into 209's looping spin.
    expect(animationFrame(208, 21).image).toBe(120);
    expect([22, 25, 28].map((age) => animationFrame(208, age).image)).toEqual([
      136, 137, 136,
    ]);
    expect(animationFrame('209+12', 0).image).toBe(136);
    expect(animationFrame(212, 13).image).toBe(17);
    expect(animationFrame(226, 16).image).toBe(325);
    expect(
      [0, 3, 6, 9, 12].map((age) => animationFrame(227, age).image),
    ).toEqual([424, 425, 426, 427, 424]);
  });

  it('plays the recovered hit and guard effects with their display timings', () => {
    // Responses name 339–344 (sparks 345/346), 370 (guard) and 406 (beam).
    expect(RESPONSE_EFFECTS.slice(1, 13)).toEqual([
      339, 339, 340, 340, 340, 342, 340, 341, 341, 342, 342, 342,
    ]);
    expect(RESPONSE_EFFECTS.slice(22, 30).every((e) => e === 370)).toBe(true);
    expect(
      [0, 4, 7, 9, 12, 14, 16, 18].map((age) => animationFrame(339, age).image),
    ).toEqual([160, 161, 162, 163, 164, 165, 166, 167]);
    expect(animationDuration(339)).toBe(21);
    expect(animationDuration(370)).toBe(22);
    expect(animationFrame(370, 2).image).toBe(224);
    expect(animationFrame(370, 19).image).toBe(229);
    // Op 0x20 at PC 5147 jumps to 348's mirrored copy at offset 17 when
    // rand() % 3 > 1; each branch chains on to 349 and 350 the same way.
    expect(script(348).events[0]).toMatchObject({
      op: 'random',
      divisor: 3,
      above: 1,
      action: 348,
      offset: 17,
    });
    expect(animationDuration(348)).toBe(18);
    expect(animationFrame(348, 17).image).toBe(192);
    expect(script(348).frames.every((frame) => !frame.flip_x)).toBe(true);
    expect(script('348+17').frames.every((frame) => frame.flip_x)).toBe(true);
    expect(script('348+17').events[0]).toMatchObject({ action: 349 });
    expect(script('349+17').events[0]).toMatchObject({ action: 350 });
    expect(animationDuration('350+17')).toBe(17);
  });

  it('carries op 0x23 colour on clip frames and object scripts', () => {
    // Axe impact 230 halves its second display (PC 3337, mode 1).
    expect(script(230).events.find((e) => e.op === 'color')).toEqual({
      t: 5,
      op: 'color',
      mode: 1,
      r: 0,
      g: 0,
      b: 0,
      fade: 0,
    });
    // DST fire 385 adds, with signed offsets (PC 5566).
    expect(script(385).events.find((e) => e.op === 'color')).toMatchObject({
      mode: 2,
      r: 0,
      g: -6,
      b: -7,
    });
    // Hit sparks add tinted r −14, g −5, b +7; mode 4 keeps r[5] as its fade.
    expect(script(347).events.find((e) => e.op === 'color')).toMatchObject({
      mode: 2,
      r: -14,
      g: -5,
      b: 7,
      fade: 0,
    });
    expect(script(294).events.find((e) => e.op === 'color')).toMatchObject({
      mode: 4,
      fade: 29,
    });
  });

  it('expands DST calls and holds the victim in the recovered held pose', () => {
    expect(animationDuration(214)).toBe(58);
    expect(
      [0, 4, 5, 13, 53].map((age) => animationFrame(214, age).image),
    ).toEqual([103, 103, 104, 105, 104]);
    // 106, three 20-tick spins (199), ten 12-tick spins (217), then the toss.
    const applies = (index: number) =>
      script(index).events.flatMap((e) =>
        e.op === 'apply' ? [[e.t, e.response, e.x, e.y]] : [],
      );
    expect(applies(215)).toEqual([
      [0, 30, 60, 0],
      [185, 31, 14, -96],
    ]);
    expect(animationDuration(215)).toBe(368);
    expect(
      [0, 5, 10, 15, 20, 65, 68, 71, 74, 185, 268, 358].map(
        (age) => animationFrame(215, age).image,
      ),
    ).toEqual([106, 107, 108, 107, 110, 107, 108, 107, 110, 111, 237, 24]);
    expect(animationFrame(215, 15).flip_x).toBe(true);
    // Op 0x07 before each spin display: offset, flags (bit 0 behind, bit 2
    // the holder's facing), held pose 1.
    expect(
      script(215)
        .events.flatMap((e) =>
          e.op === 'hold' ? [[e.t, e.x, e.flags, e.pose]] : [],
        )
        .slice(0, 4),
    ).toEqual([
      [5, 60, 5, 1],
      [10, -10, 5, 1],
      [15, -60, 1, 1],
      [20, 0, 0, 1],
    ]);
    expect(heldFrame(1, 4)).toMatchObject({
      image: 47,
      dx: -84,
      dy: -159,
      flip_x: true,
    });
    // PCs 3127–3128: two missiles (218) as DST Hit slides back.
    expect(
      script(215).events.flatMap((e) =>
        e.op === 'spawn' && e.action === 218 ? [[e.t, e.x, e.y]] : [],
      ),
    ).toEqual([
      [268, 30, -80],
      [268, 71, -78],
    ]);
    // Numeric loops replay only the source loop target, not the entry pose.
    expect(animationFrame('dstToss', 2)).toMatchObject({
      flip_x: true,
      flip_y: true,
    });
    expect(animationFrame('dstToss', 3)).toMatchObject({
      flip_x: false,
      flip_y: true,
    });
    expect(animationFrame('dstToss', 11)).toEqual(animationFrame('dstToss', 3));
    expect(animationFrame('twist', 9).image).toBe(52);
    expect(
      [10, 13, 16, 19, 34].map((age) => animationFrame('twist', age).image),
    ).toEqual([102, 233, 61, 234, 102]);
    expect(animationFrame('tossBounce', 0).image).toBe(62);
    expect(animationFrame(218, 1000).image).toBe(239);
  });

  it('flattens super timelines with inlined calls, loops and entry checks', () => {
    // Action 264: 24, 304, 305, 306, twenty calls of 266, then 306, 24, 31.
    expect(
      [0, 30, 75, 80, 95, 350, 365].map(
        (age) => animationFrame(264, age).image,
      ),
    ).toEqual([24, 304, 305, 306, 306, 24, 31]);
    expect(eventsAt(264, 0)).toEqual(
      expect.arrayContaining([
        {
          t: 0,
          op: 'stock',
          target: 251,
          offset: 0,
          min: 0,
          add: -1,
          atLeast: false,
        },
        {
          t: 0,
          op: 'life',
          target: 278,
          offset: 0,
          below: true,
          value: 153,
        },
        { t: 0, op: 'stop', self: 0, other: 10 },
      ]),
    );
    expect(eventsAt(292, 0)).toContainEqual({
      t: 0,
      op: 'stock',
      target: 251,
      offset: 0,
      min: 2,
      add: -3,
      atLeast: false,
    });
    // Object 269 re-arms its hit box every 10 ticks through 19 calls of 270.
    expect(
      script(269).events.filter((e) => e.op === 'box' && e.slot === 0),
    ).toHaveLength(20);
    // Action 257 jumps to FLY NO HIT (97), which loops 98 until landing.
    expect(script(257)).toMatchObject({ end: 'jump', next: 97 });
    expect(animationDuration(257)).toBe(578);
    // It clears variable 2 (PC 1187) before jumping to 98, whose loop
    // replays a copy of its displays without that.
    expect(script(97)).toMatchObject({ end: 'loop', loop: 11 });
    expect(animationFrame('fly', 6).image).toBe(102);
    expect(animationFrame('fly', 22)).toMatchObject({
      image: 102,
      events: [{ op: 'sound', index: 37 }],
    });
    // Objects play by source action; 296 only spawns children.
    expect(animationDuration(371)).toBe(65);
    expect(animationDuration(296)).toBe(0);
    expect(animationFrame(269, 0)).toSatisfy(isBlank);
    // Response ids select victim actions: grab, toss, shock, fly and FBH.
    expect([30, 31, 33, 43, 58].map((id) => RESPONSES[id])).toEqual([
      128, 129, 88, 97, 112,
    ]);
    expect(heldFrame(2, 4)).toMatchObject({
      image: 102,
      dx: -45,
      dy: -53,
      flip_x: true,
      flip_y: false,
    });
  });

  it('aligns IORI strikes and recoveries with the source displays', () => {
    expect(
      [0, 13, 21, 29, 49, 54].map((age) => animationFrame(246, age).image),
    ).toEqual([12, 432, 433, 434, 435, 321]);
    expect(
      [0, 8, 23, 31, 51, 56].map((age) => animationFrame(247, age).image),
    ).toEqual([435, 437, 439, 440, 441, 321]);
    expect(
      [0, 8, 21, 26, 34, 61, 66].map((age) => animationFrame(248, age).image),
    ).toEqual([440, 443, 445, 446, 447, 436, 31]);
    expect([246, 247, 248].map((index) => animationDuration(index))).toEqual([
      59, 61, 71,
    ]);
    expect(animationFrame('launchDown', 8).image).toBe(60);
    expect(animationFrame('launchDown', 1000)).toMatchObject({
      image: 52,
      flip_x: true,
      flip_y: true,
    });
    expect(animationFrame('slamBounce', 9).image).toBe(62);
    expect(animationFrame('slamBounce', 10).image).toBe(61);
    expect(animationFrame('slamBounce', 1000).image).toBe(60);
    expect(animationDuration('bounceDown')).toBe(90);
  });

  it('aligns Hit Up strike, recovery, chase and launch poses with their source boundaries', () => {
    expect(
      [0, 14, 15, 24, 25, 50, 65].map((age) => animationFrame(200, age).image),
    ).toEqual([112, 115, 117, 117, 116, 114, 113]);
    expect(animationDuration(200)).toBe(75);
    expect([0, 5, 25, 40].map((age) => animationFrame(201, age).image)).toEqual(
      [117, 116, 114, 113],
    );
    expect(animationDuration(201)).toBe(50);
    expect(
      [0, 8, 21, 26, 41].map((age) => animationFrame(202, age).image),
    ).toEqual([12, 13, 14, 15, 16]);
    expect(animationFrame('launchUp', 24).dy).toBe(-10);
    expect(animationFrame('launchUp', 25).dy).toBe(-10);
    expect(animationFrame('launchUp', 55).image).toBe(60);
    expect(animationFrame('launchUp', 10000)).toMatchObject({
      image: 102,
      flip_y: true,
    });
    expect(animationFrame('launchAway', 5).image).toBe(52);
    expect(animationFrame('launchAway', 6).image).toBe(60);
    expect(animationFrame('launchAway', 10000).image).toBe(61);
  });

  it('plays all eight third-kick strike and recovery pairs before ending', () => {
    for (const age of [15, 21, 27, 33, 39, 45, 51, 57]) {
      expect(animationFrame(189, age).image).toBe(82);
      expect(animationFrame(189, age + 3).image).toBe(83);
    }
    expect(animationFrame(189, 63).image).toBe(82);
    expect(animationFrame(189, 78).image).toBe(34);
    expect(animationDuration(189)).toBe(88);
  });

  it('plays the grab, the Chuck Hit spins and recovery, floor impact, and get-up poses', () => {
    expect(animationFrame(196, 0).image).toBe(103);
    // Action 197: five ticks, three calls of 199 (PC 2767), then its recovery.
    expect(animationFrame(197, 0).image).toBe(106);
    expect(
      [5, 10, 15, 20, 25].map((age) => animationFrame(197, age).image),
    ).toEqual([107, 108, 107, 110, 107]);
    expect(animationFrame(197, 15).flip_x).toBe(true);
    expect(
      script(197).events.flatMap((e) => (e.op === 'apply' ? [e.t] : [])),
    ).toEqual([0, 65]);
    expect(
      [64, 65, 155, 185, 195].map((age) => animationFrame(197, age).image),
    ).toEqual([110, 111, 106, 94, 24]);
    expect(animationDuration(197)).toBe(205);
    expect(animationFrame('superHeld', 0).image).toBe(47);
    expect(animationFrame('knockdown', 0).image).toBe(62);
    expect(animationFrame('knockdown', 10).image).toBe(63);
    expect(
      [0, 10, 20].map((age) => animationFrame('getUp', age).image),
    ).toEqual([68, 69, 70]);
  });

  it('advances on frame boundaries, loops movement, and holds ending poses', () => {
    expect(animationFrame('land', 4).image).toBe(17);
    expect(animationFrame('land', 5).image).toBe(18);
    expect(animationFrame('backwalk', animationDuration('backwalk'))).toEqual(
      animationFrame('backwalk', 0),
    );
    expect(animationFrame('crouch', animationDuration('crouch') + 6)).toEqual(
      animationFrame('crouch', 6),
    );
    // WIN STAND (action 58) plays for 115 ticks before action 57's own poses.
    expect(
      [0, 30, 114, 115, 125, 134, 135].map(
        (age) => animationFrame('win', age).image,
      ),
    ).toEqual([295, 1, 1, 295, 31, 31, 366]);
    expect(animationFrame('win', 10000).image).toBe(366);
    expect(animationFrame('draw', 114).image).toBe(1);
    expect(animationFrame('draw', 115).image).toBe(24);
    expect(animationFrame('draw', 10000).image).toBe(420);
    // Action 60 holds its falling pose until action 62 is entered on landing.
    expect(animationFrame('down', 13).image).toBe(52);
    expect(animationFrame('down', 14).image).toBe(60);
    expect(animationFrame('down', 38).image).toBe(60);
    expect(animationFrame('down', 10000).image).toBe(61);
    expect(animationFrame('koLand', 0).image).toBe(62);
    expect(animationFrame('koLand', 10).image).toBe(63);
    expect(animationFrame('koLand', 10000).image).toBe(63);
    for (const action of Object.keys(
      animations,
    ) as (keyof typeof animations)[]) {
      const end = animationDuration(action);
      for (let age = 0; age <= end; age++)
        expect(animationFrame(action, age)).toBeDefined();
    }
  });
});
