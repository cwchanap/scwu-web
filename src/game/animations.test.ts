import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from './generated/assets.json';
import {
  animationDuration,
  animationFrame,
  animations,
  DST_TOSS_TICK,
  dstHold,
  eventsAt,
  heldFrame,
  isBlank,
  RESPONSE_EFFECTS,
  RESPONSES,
  script,
  THROW_TOSS_TICK,
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
      airPunch: [
        { image: 53 },
        { image: 54 },
        { image: 55 },
        { image: 56 },
        { image: 55 },
        { image: 15 },
      ],
      win: [{ image: 295 }, { image: 31 }, { image: 366 }],
      draw: [{ image: 24 }, { image: 420 }],
    });
  });

  it('has loadable, non-empty textures for every selected display', () => {
    for (const image of data.images) {
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
  });

  it('plays the selected mobility and special poses across authored transitions', () => {
    expect(animationFrame('doubleJump', 0).image).toBe(29);
    expect(animationFrame('doubleJump', 8).image).toBe(30);
    expect(animationFrame('airDash', 3).image).toBe(45);
    expect(animationFrame('drill', 23).image).toBe(121);
    expect(animationDuration('airDrill')).toBe(22);
    expect(animationFrame('airDrill', 21).image).toBe(120);
    expect(
      [0, 3, 6].map((age) => animationFrame('airDrillSpin', age).image),
    ).toEqual([136, 137, 136]);
    expect(animationFrame('airDrillContact', 9).image).toBe(136);
    expect(animationFrame('drillLand', 13).image).toBe(17);
    expect(animationFrame('axeThrow', 16).image).toBe(325);
    expect(
      [0, 3, 6, 9, 12].map((age) => animationFrame('axeFlight', age).image),
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
    const impact = data.clips.axeHit[0].duration;
    expect(animationFrame('axeHit', impact - 1).color).toBeUndefined();
    expect(animationFrame('axeHit', impact).color).toEqual({
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
    expect(animationDuration('dst')).toBe(58);
    expect(
      [0, 4, 5, 13, 53].map((age) => animationFrame('dst', age).image),
    ).toEqual([103, 103, 104, 105, 104]);
    // 106, three 20-tick spins (199), ten 12-tick spins (217), then the toss.
    expect(DST_TOSS_TICK).toBe(185);
    expect(animationDuration('dstHit')).toBe(368);
    expect(
      [0, 5, 10, 15, 20, 65, 68, 71, 74, 185, 268, 358].map(
        (age) => animationFrame('dstHit', age).image,
      ),
    ).toEqual([106, 107, 108, 107, 110, 107, 108, 107, 110, 111, 237, 24]);
    expect(animationFrame('dstHit', 15).flip_x).toBe(true);
    expect(animationDuration('dstHeld')).toBe(185);
    expect(animationFrame('dstHeld', 0)).toMatchObject({ image: 47, dx: -13 });
    expect(animationFrame('dstHeld', 5)).toMatchObject({
      image: 47,
      dx: -84,
      dy: -159,
      flip_x: true,
    });
    expect(animationFrame('dstHeld', 184).flip_x).toBe(false);
    // Op 0x14 places at age 0 and 199's op 0x07s as their displays start;
    // 217's (from 65) re-place every tick.
    expect([0, 4, 5, 64, 65, 184, 185].map((age) => dstHold(age))).toEqual([
      { x: 60, same: false, behind: false, place: true },
      { x: 60, same: false, behind: false, place: false },
      { x: 60, same: true, behind: true, place: true },
      { x: 0, same: false, behind: false, place: false },
      { x: 60, same: true, behind: true, place: true },
      { x: 0, same: false, behind: false, place: true },
      null,
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
    expect(animationFrame('dstMissile', 1000).image).toBe(239);
  });

  it('flattens super timelines with inlined calls, loops and entry checks', () => {
    // Action 264: 24, 304, 305, 306, twenty calls of 266, then 306, 24, 31.
    expect(
      [0, 30, 75, 80, 95, 350, 365].map(
        (age) => animationFrame('getterBeam', age).image,
      ),
    ).toEqual([24, 304, 305, 306, 306, 24, 31]);
    expect(eventsAt(264, 0)).toEqual(
      expect.arrayContaining([
        { t: 0, op: 'stock', target: 251, min: 0, add: -1 },
        { t: 0, op: 'life', target: 278, below: true, value: 153 },
        { t: 0, op: 'stop', self: 0, other: 10 },
      ]),
    );
    expect(eventsAt(292, 0)).toContainEqual({
      t: 0,
      op: 'stock',
      target: 251,
      min: 2,
      add: -3,
    });
    // Object 269 re-arms its hit box every 10 ticks through 19 calls of 270.
    expect(
      script(269).events.filter((e) => e.op === 'box' && e.slot === 0),
    ).toHaveLength(20);
    // Action 257 jumps to FLY NO HIT (97), which loops 98 until landing.
    expect(script(257)).toMatchObject({ end: 'jump', next: 97 });
    expect(animationDuration('musashiHit')).toBe(578);
    expect(script(97)).toMatchObject({ end: 'loop', loop: 3 });
    expect(animationFrame('fly', 6).image).toBe(102);
    expect(animationFrame('fly', 22)).toEqual(animationFrame('fly', 6));
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
      [0, 13, 21, 29, 49, 54].map((age) => animationFrame('iori', age).image),
    ).toEqual([12, 432, 433, 434, 435, 321]);
    expect(
      [0, 8, 23, 31, 51, 56].map((age) => animationFrame('iori2', age).image),
    ).toEqual([435, 437, 439, 440, 441, 321]);
    expect(
      [0, 8, 21, 26, 34, 61, 66].map(
        (age) => animationFrame('iori3', age).image,
      ),
    ).toEqual([440, 443, 445, 446, 447, 436, 31]);
    expect(
      ['iori', 'iori2', 'iori3'].map((action) =>
        animationDuration(action as 'iori' | 'iori2' | 'iori3'),
      ),
    ).toEqual([59, 61, 71]);
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
      [0, 14, 15, 24, 25, 50, 65].map(
        (age) => animationFrame('hitUp', age).image,
      ),
    ).toEqual([112, 115, 117, 117, 116, 114, 113]);
    expect(animationDuration('hitUp')).toBe(75);
    expect(
      [0, 5, 25, 40].map((age) => animationFrame('hitUpRecover', age).image),
    ).toEqual([117, 116, 114, 113]);
    expect(animationDuration('hitUpRecover')).toBe(50);
    expect(
      [0, 8, 21, 26, 41].map((age) => animationFrame('hitUpJump', age).image),
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
      expect(animationFrame('kick3', age).image).toBe(82);
      expect(animationFrame('kick3', age + 3).image).toBe(83);
    }
    expect(animationFrame('kick3', 63).image).toBe(82);
    expect(animationFrame('kick3', 78).image).toBe(34);
    expect(animationDuration('kick3')).toBe(88);
  });

  it('plays the grab, the Chuck Hit spins and recovery, floor impact, and get-up poses', () => {
    expect(animationFrame('grab', 0).image).toBe(103);
    // Action 197: five ticks, three calls of 199 (PC 2767), then its recovery.
    expect(animationFrame('throw', 0).image).toBe(106);
    expect(
      [5, 10, 15, 20, 25].map((age) => animationFrame('throw', age).image),
    ).toEqual([107, 108, 107, 110, 107]);
    expect(animationFrame('throw', 15).flip_x).toBe(true);
    expect(THROW_TOSS_TICK).toBe(65);
    expect(
      [64, 65, 155, 185, 195].map((age) => animationFrame('throw', age).image),
    ).toEqual([110, 111, 106, 94, 24]);
    expect(animationDuration('throw')).toBe(205);
    expect(animationFrame('dstHeld', 0).image).toBe(47);
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
    expect(animationFrame('lose', 0).image).toBe(24);
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
