// The export pipeline's publication contract: the exporter fingerprint the
// Cloudflare builds check, the DOM art the scan publishes and the manifest it
// names. Python spawns need the handoff (`bun run assets` ran where these
// pass), so they skip on CI like the art tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAGES } from './game/characters';
import { bytesOf, parsePack } from './game/packs';
import { exporterSha, itWithArt } from './game/testing';
import manifest from './game/generated/assets-version.json';

const python = (expression: string) =>
  execFileSync('python3', ['-B', '-c', expression], {
    encoding: 'utf8',
  }).trim();

// The literal paths Menu.svelte names — the same broadened scan dom_art() runs
// (whole nested paths: a stage thumbnail is stages/<stage>/<image>.png).
const menuArt = () =>
  readFileSync(new URL('./Menu.svelte', import.meta.url), 'utf8').match(
    /(?:[a-z0-9]+\/)+[0-9]+\.png/g,
  ) ?? [];

// Each stage's thumbnail: its lowest-indexed frame; streetnight's is 4, the
// rest begin at 0 (generated stages.json).
const stageThumbnails = () =>
  Object.values(STAGES).map(
    (stage) =>
      stage.images.reduce((first, image) =>
        image.index < first.index ? image : first,
      ).filename,
  );

// The EN stock digits the Menu and HUD show: 100–600 from the source word
// (ui 18–23), 700–1000 the authored HPA-971 art (published en/7–10).
const EN_DIGITS = [
  'ui/18.png',
  'ui/19.png',
  'ui/20.png',
  'ui/21.png',
  'ui/22.png',
  'ui/23.png',
  'en/7.png',
  'en/8.png',
  'en/9.png',
  'en/10.png',
];

// The boot pack `bun run assets` wrote.
const bootPack = () =>
  parsePack(
    new Uint8Array(
      readFileSync(new URL('../public/assets/packs/boot.bin', import.meta.url)),
    ).buffer,
  );

describe('exporter fingerprint', () => {
  itWithArt('agrees between python, build.sh and the shared digest', () => {
    const want = exporterSha();
    const pythonValue = python(
      'import sys; sys.path.insert(0, "scripts"); import export_assets; print(export_assets.exporter())',
    );
    expect(pythonValue).toBe(want);
    const shell = spawnSync(
      'bash',
      [
        '-c',
        'eval "$(sed -n \'/^script_sha()/,/^}/p\' scripts/build.sh)"; script_sha',
      ],
      { encoding: 'utf8' },
    );
    expect(shell.status).toBe(0);
    expect(shell.stdout.trim()).toBe(want);
    // No longer the old script-plus-name-PNG fingerprint: the authored EN art
    // is inside, so editing any of those files invalidates every consumer.
    const legacy = createHash('sha256');
    for (const name of ['scripts/export_assets.py', 'art/dora/name.png'])
      legacy.update(readFileSync(new URL(`../${name}`, import.meta.url)));
    expect(legacy.digest('hex')).not.toBe(want);
  });
});

describe('DOM art publication', () => {
  it('publishes the EN digits and every stage thumbnail in the manifest', () => {
    const published = manifest.files;
    for (const name of EN_DIGITS) expect(published, name).toContain(name);
    for (const name of stageThumbnails())
      expect(published, name).toContain(name);
  });

  it('names the digits and thumbnails from Menu.svelte’s literal table', () => {
    const named = menuArt();
    for (const name of EN_DIGITS) expect(named, name).toContain(name);
    for (const name of stageThumbnails()) expect(named, name).toContain(name);
  });

  itWithArt(
    'has every scanned DOM path on disk, and the authored digits in the boot pack',
    () => {
      const named = JSON.parse(
        python(
          'import sys, json; sys.path.insert(0, "scripts"); import export_assets; print(json.dumps(export_assets.dom_art()))',
        ),
      ) as string[];
      expect(named).toEqual(expect.arrayContaining(EN_DIGITS));
      for (const name of named)
        expect(existsSync(`public/assets/${name}`), name).toBe(true);
      const boot = bootPack();
      for (const [stocks, art] of [
        [7, 'en-700'],
        [8, 'en-800'],
        [9, 'en-900'],
        [10, 'en-1000'],
      ] as const) {
        expect(boot.images[`en-${stocks}`], `en-${stocks}`).toBeDefined();
        expect([...bytesOf(boot, boot.images[`en-${stocks}`]!)]).toEqual([
          ...new Uint8Array(readFileSync(`art/hud/${art}.png`)),
        ]);
      }
    },
  );
});
