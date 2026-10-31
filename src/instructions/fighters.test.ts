import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../game/characters';
import { ROSTER } from './fighters';
import { GUIDE_TEXT } from './guides';

const here = new URL('.', import.meta.url).pathname;
// `import type` lines are erased at build and so cannot pull the bundle in.
const stripTypeImports = (text: string) =>
  text.replace(/^\s*import type [^;]+;/gm, '');

describe('instructions page', () => {
  it('lists every fighter in roster order', () => {
    expect(ROSTER.map((entry) => entry.id)).toEqual(Object.keys(CHARACTERS));
  });

  it('gives every fighter real guide text', () => {
    for (const entry of ROSTER) {
      expect(GUIDE_TEXT[entry.id].length, entry.id).toBeGreaterThan(200);
    }
  });

  it('imports nothing from the game or Phaser at runtime', () => {
    const sources = readdirSync(here).filter(
      (name) => /\.(ts|svelte)$/.test(name) && name !== 'fighters.test.ts',
    );
    for (const name of sources) {
      expect(
        stripTypeImports(readFileSync(here + name, 'utf8')),
        name,
      ).not.toMatch(/from '[^']*(game\/|\bphaser\b)/);
    }
    expect(readFileSync(here + '../../instructions.html', 'utf8')).toContain(
      'src/instructions/main.ts',
    );
  });
});
