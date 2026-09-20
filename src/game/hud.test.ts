import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import ui from './generated/ui.json';
import { koFrame, KO_TICKS, ROUND_END_TICKS, healthCrop } from './hud';
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
  expect(healthCrop(50, false)).toEqual({ x: 0, width: 127 });
  expect(healthCrop(50, true)).toEqual({ x: 127, width: 127 });
  expect(healthCrop(0, true)).toEqual({ x: 254, width: 0 });
  expect(healthCrop(100, false)).toEqual({ x: 0, width: 254 });
});

it('exports every HUD and KO texture at its original dimensions', () => {
  for (const image of ui.images) {
    const png = readFileSync(
      new URL(`../../public/assets/${image.filename}`, import.meta.url),
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(image.width);
    expect(png.readUInt32BE(20)).toBe(image.height);
  }
  for (const frame of ui.ko) {
    expect(ui.images.some((image) => image.index === frame.image)).toBe(true);
    expect(frame.duration).toBeGreaterThan(0);
  }
});
