import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../game/characters';
import type { Who } from '../game/characters';
import { ROSTER } from './fighters';
import { GRID, GUIDES_DATA, FACES, SHARED, STOCKS, XS, YS } from './moves';

const here = new URL('.', import.meta.url).pathname;
// `import type` lines are erased at build and so cannot pull the bundle in.
const stripTypeImports = (text: string) =>
  text.replace(/^\s*import type [^;]+;/gm, '');

describe('instructions page', () => {
  it('orders the grid over every fighter, GATE LOCK cells null', () => {
    expect(GRID.filter((id) => id !== null)).toEqual(Object.keys(CHARACTERS));
  });

  it('tiles the roster inside the 206 x 417 face sheet', () => {
    expect(GRID.length).toBe(XS.length * YS.length);
    for (let i = 0; i < GRID.length; i++) {
      if (GRID[i] === null) continue;
      expect(XS[i % XS.length] + 24, `col of ${GRID[i]}`).toBeLessThanOrEqual(
        206,
      );
      expect(
        YS[Math.floor(i / XS.length)] + (i % 2 ? 7 : 0) + 60,
        `row of ${GRID[i]}`,
      ).toBeLessThanOrEqual(417);
    }
  });

  it("matches each fighter's power-gauge stock cap to the game data", () => {
    for (const entry of ROSTER)
      expect(STOCKS[entry.id] ?? 3, entry.id).toBe(CHARACTERS[entry.id].stocks);
  });

  it('keeps the shared how-to-play rules ahead of every guide', () => {
    expect(SHARED[0].title).toBe('How to play');
    expect(SHARED[0].rows.length).toBeGreaterThanOrEqual(3);
    for (const row of SHARED[0].rows) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.desc.length).toBeGreaterThan(0);
    }
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
  });

  it('gives every fighter real art and a plate or text fallback', () => {
    for (const entry of ROSTER) {
      const guide = GUIDES_DATA[entry.id];
      expect(guide, entry.id).toBeTruthy();
      expect(statSync(`public/assets/${guide.art}`).isFile(), entry.id).toBe(
        true,
      );
      if (guide.nameplate !== '') {
        expect(
          statSync(`public/assets/${guide.nameplate}`).isFile(),
          entry.id,
        ).toBe(true);
      }
    }
  });

  it("uses each fighter's in-game name lettering as the header plate", () => {
    // The *name action the Vs. intro shows: a looping, facing-independent
    // script whose 100-tick first frame is a banner no taller than 40 px.
    // ASTROMAN's VS NAME is a portrait, DoraEmon's is SEAN's lettering and
    // TRAINING has no banner, so those three draw their name as text.
    type Script = {
      loop: number;
      frames: {
        image: number;
        duration: number;
        width: number;
        height: number;
        ignore_facing: boolean;
      }[];
    };
    const plateOf = (id: Who) => {
      const { scripts } = CHARACTERS[id] as unknown as {
        scripts: Record<string, Script>;
      };
      const found = Object.entries(scripts).flatMap(([name, script]) => {
        const f = script.frames[0];
        return !name.includes('+') &&
          script.loop === -1 &&
          f?.ignore_facing &&
          f.duration === 100 &&
          f.height <= 40 &&
          f.width <= 260
          ? [f.image]
          : [];
      });
      expect(found.length, id).toBe(1);
      return `${id}/${found[0]}.png`;
    };
    for (const entry of ROSTER) {
      const plate = GUIDES_DATA[entry.id].nameplate;
      if (['astroman', 'dora', 'training'].includes(entry.id)) {
        expect(plate, entry.id).toBe('');
      } else {
        expect(plate, entry.id).toBe(plateOf(entry.id));
      }
    }
  });

  it('shows each fighter their own select-screen portrait as hero art', () => {
    for (const entry of ROSTER) {
      expect(GUIDES_DATA[entry.id].art, entry.id).toBe(FACES[entry.id]);
    }
  });

  it('names art by ASSET_BASE, never a hardcoded /assets/', () => {
    // The Cloudflare build serves art from R2, so a root-relative URL 404s there.
    for (const name of ['moves.ts', 'Instructions.svelte']) {
      expect(readFileSync(here + name, 'utf8'), name).not.toMatch(
        /['"`(]\/assets\//,
      );
    }
  });

  it('imports nothing from the game or Phaser at runtime, but ASSET_BASE', () => {
    const sources = readdirSync(here).filter(
      (name) => /\.(ts|svelte)$/.test(name) && name !== 'fighters.test.ts',
    );
    for (const name of sources) {
      expect(
        stripTypeImports(readFileSync(here + name, 'utf8')),
        name,
      ).not.toMatch(/from '(?![^']*game\/assetBase')[^']*(game\/|\bphaser\b)/);
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
