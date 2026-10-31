import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../game/characters';
import { ROSTER } from './fighters';
import { GRID, GUIDES_DATA } from './moves';

const here = new URL('.', import.meta.url).pathname;
// `import type` lines are erased at build and so cannot pull the bundle in.
const stripTypeImports = (text: string) =>
  text.replace(/^\s*import type [^;]+;/gm, '');

describe('instructions page', () => {
  it('orders the grid over every fighter, GATE LOCK cells null', () => {
    const idOf = new Map(ROSTER.map((entry) => [entry.name, entry.id]));
    const ids = GRID.filter((name) => name !== null).map((name) =>
      idOf.get(name),
    );
    expect(ids).toEqual(Object.keys(CHARACTERS));
  });

  it('gives every fighter a complete guide', () => {
    for (const entry of ROSTER) {
      const guide = GUIDES_DATA[entry.id];
      expect(guide, entry.id).toBeTruthy();
      expect(guide.sections.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(
        guide.sections.reduce((n, section) => n + section.rows.length, 0),
        entry.id,
      ).toBeGreaterThanOrEqual(4);
      expect(guide.role.length, entry.id).toBeGreaterThan(0);
      expect(guide.art.length, entry.id).toBeGreaterThan(0);
    }
    expect(GUIDES_DATA.ryuko, 'ryuko ships with the framework').toBeTruthy();
  });

  it('gives every fighter real art and a plate or text fallback', () => {
    for (const entry of ROSTER) {
      const guide = GUIDES_DATA[entry.id];
      expect(guide, entry.id).toBeTruthy();
      expect(statSync(`public${guide.art}`).isFile(), entry.id).toBe(true);
      if (guide.nameplate !== '') {
        expect(statSync(`public${guide.nameplate}`).isFile(), entry.id).toBe(
          true,
        );
      }
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

  it('never pulls the guide data into the game page', () => {
    expect(readFileSync(here + '../App.svelte', 'utf8')).not.toMatch(
      /instructions\/(guides|moves)/,
    );
  });
});
