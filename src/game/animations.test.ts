import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import data from './generated/assets.json';
import { animationDuration, animationFrame, animations } from './animations';

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
    expect(
      [0, 4, 7, 9, 12, 14, 16, 18].map(
        (age) => animationFrame('hitSpark', age).image,
      ),
    ).toEqual([160, 161, 162, 163, 164, 165, 166, 167]);
    expect(animationDuration('hitSpark')).toBe(21);
    expect(animationDuration('guardSpark')).toBe(22);
    expect(animationFrame('guardSpark', 2).image).toBe(224);
    expect(animationFrame('guardSpark', 19).image).toBe(229);
    expect(animationDuration('hitStreak')).toBe(18);
    expect(animationFrame('hitStreak', 17).image).toBe(192);
    expect(animations.hitStreak.frames.every((frame) => !frame.flip_x)).toBe(
      true,
    );
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

  it('plays the grab, release, floor impact, and get-up poses', () => {
    expect(animationFrame('grab', 0).image).toBe(103);
    expect(animationFrame('throw', 0).image).toBe(106);
    expect(
      [12, 17, 22, 27, 32].map((age) => animationFrame('throw', age).image),
    ).toEqual([107, 108, 107, 110, 107]);
    expect(animationFrame('throw', 22).flip_x).toBe(true);
    expect(animationFrame('grabbed', 12).flip_y).toBe(true);
    expect(animationFrame('throw', 72).image).toBe(111);
    expect(animationFrame('throw', 108).image).toBe(24);
    expect(animationFrame('grabbed', 0).image).toBe(47);
    expect(animationFrame('thrown', 0).image).toBe(52);
    expect(animationFrame('thrown', 6).image).toBe(60);
    expect(animationFrame('thrown', 100).image).toBe(61);
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
    expect(animationFrame('win', 20).image).toBe(366);
    expect(animationFrame('win', 10000).image).toBe(366);
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
