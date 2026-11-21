// The summon side switch wears white 15px bold text over a red gradient
// (the c7ffe72 mockup coding): WCAG AA needs 4.5:1 on every gradient stop,
// and sRGB interpolation is monotone in luminance, so the stops are the
// extremes. Pins the fix for the original #ff6a5a→#ee2421 ramp (2.8–4.3:1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const white = [1, 1, 1];
const srgb = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const luminance = (rgb: number[]) =>
  0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const parse = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const enemyRule = () => {
  const block = readFileSync(
    new URL('./Menu.svelte', import.meta.url),
    'utf8',
  ).match(/\.side\.enemy\.on \{([^}]*)\}/)?.[1];
  if (!block) throw new Error('.side.enemy.on is gone from Menu.svelte');
  return block;
};
const gradientStops = (block: string) =>
  block
    .match(/linear-gradient\(([^)]*)\)/)?.[1]
    .split(',')
    .map((stop) => stop.trim().split(/\s+/)[0]) ?? [];

describe('Menu Enemy side switch contrast', () => {
  it('keeps the white label at AA (4.5:1) on every gradient stop', () => {
    const stops = gradientStops(enemyRule());
    expect(stops).toHaveLength(2);
    for (const stop of stops)
      expect(contrast(parse(stop), white)).toBeGreaterThanOrEqual(4.5);
  });

  it('stays red-coded with the red border, per the mockup', () => {
    const block = enemyRule();
    expect(block).toContain('color: #fff');
    expect(block).toContain('border-color: var(--red)');
    for (const stop of gradientStops(block)) {
      const [r, g, b] = parse(stop).map((c) => c * 255);
      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    }
  });
});
