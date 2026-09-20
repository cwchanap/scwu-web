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
    expect(animationFrame('down', 10000).image).toBe(63);
    for (const action of Object.keys(
      animations,
    ) as (keyof typeof animations)[]) {
      const end = animationDuration(action);
      for (let age = 0; age <= end; age++)
        expect(animationFrame(action, age)).toBeDefined();
    }
  });
});
