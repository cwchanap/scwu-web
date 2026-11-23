// The export pipeline's publication contract: the exporter fingerprint the
// Cloudflare builds check, the DOM art the scan publishes and the manifest it
// names. Python spawns need the handoff (`bun run assets` ran where these
// pass), so they skip on CI like the art tests.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

  itWithArt('moves when an authored PNG is edited, in an isolated copy', () => {
    // The art-edit invalidation experiment: edit a copy of the checkout, not
    // the real art. export_assets.py needs the handoff parsers at import and
    // dom_art()'s scanned sources for inputs(), so the copy carries exactly
    // those; the fingerprints read nothing else.
    const realEn700 = readFileSync(
      new URL('../art/hud/en-700.png', import.meta.url),
    );
    const root = mkdtempSync(join(tmpdir(), 'exporter-art-edit-'));
    try {
      for (const name of [
        'scripts/export_assets.py',
        'scripts/build.sh',
        'art/hud/en-700.png',
        'art/hud/en-800.png',
        'art/hud/en-900.png',
        'art/hud/en-1000.png',
        'art/dora/name.png',
        'src/App.svelte',
        'src/Menu.svelte',
        'src/instructions/Instructions.svelte',
        'src/instructions/moves.ts',
        'src/instructions/page.ts',
        'src/profile/Profile.svelte',
        'src/profile/main.ts',
        'scwu-web-handoff/research/tools/scwu_images.py',
        'scwu-web-handoff/research/tools/scwu_animation.py',
      ]) {
        const target = join(root, name);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(new URL(`../${name}`, import.meta.url), target);
      }
      const fingerprints = () => {
        const [inputs, exporter] = execFileSync(
          'python3',
          [
            '-B',
            '-c',
            'import sys; sys.path.insert(0, "scripts"); import export_assets; print(export_assets.inputs(), export_assets.exporter())',
          ],
          { encoding: 'utf8', cwd: root },
        )
          .trim()
          .split(' ');
        const shell = spawnSync(
          'bash',
          [
            '-c',
            'eval "$(sed -n \'/^script_sha()/,/^}/p\' scripts/build.sh)"; script_sha',
          ],
          { encoding: 'utf8', cwd: root },
        );
        expect(shell.status).toBe(0);
        return {
          inputs: inputs!,
          exporter: exporter!,
          shell: shell.stdout.trim(),
        };
      };

      const before = fingerprints();
      // The copy is faithful: its exporter() matches the real checkout's.
      expect(before.exporter).toBe(exporterSha());
      expect(before.shell).toBe(before.exporter);

      // Edit the authored PNG in the copy only.
      const victim = join(root, 'art/hud/en-700.png');
      writeFileSync(
        victim,
        Buffer.concat([readFileSync(victim), Buffer.from('art-edit')]),
      );

      const after = fingerprints();
      expect(after.exporter, 'python exporter()').not.toBe(before.exporter);
      expect(after.inputs, 'python inputs()').not.toBe(before.inputs);
      expect(after.shell, 'shell script_sha').not.toBe(before.shell);
      expect(after.shell).toBe(after.exporter);

      // The real art was only ever read.
      expect(
        readFileSync(new URL('../art/hud/en-700.png', import.meta.url)),
      ).toEqual(realEn700);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
