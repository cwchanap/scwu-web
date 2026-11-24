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
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES } from './game/characters';
import { bytesOf, parsePack } from './game/packs';
import { heldPlacement, type Frame as Placed } from './game/standing';
import { exporterSha, itWithArt, shuwaArt } from './game/testing';
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
        ...shuwaArt(),
        'src/App.svelte',
        'src/Menu.svelte',
        'src/instructions/fighters.ts',
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

// SHUWA's export (export_authored) against his spec (art/shuwa/game) and
// RYUKO's, the donor's, export.
interface Frame {
  image: number;
}
interface Event {
  op: string;
  action?: number;
  offset?: number;
  busy?: number;
  busyOffset?: number;
  target?: number;
}
interface Script {
  end: string;
  next: number;
  offset?: number;
  frames: Frame[];
  events: Event[];
}
interface Export {
  scripts: Record<string, Script>;
  clips: Record<string, Frame[]>;
  held: Frame[];
  idle: { records: number[][] };
  images: { index: number; width: number; height: number; own?: boolean }[];
  commands: { entries: Record<'air' | 'near' | 'far' | 'crouch', number>[] };
  responses: number[];
  start: number;
  jumps: number[];
  walks: number[];
  fall: number;
}
const json = <T>(path: string) => JSON.parse(readFileSync(path, 'utf8')) as T;
const ART = 'art/shuwa/game';
const spec = json<{
  commands: { keep: number[] };
  images: Record<string, string>;
  scriptImages: Record<string, Record<string, string>>;
  fx: number[];
  blank: number[];
  drop: Record<string, number[]>;
  cutInputs: number[];
  ui: { portrait: string; faceTile: string; hudFace: string };
}>(`${ART}/spec.json`);
const anchors = json<
  Record<string, { anchor: [number, number]; size: [number, number] }>
>(`${ART}/anchors.json`);
const ryuko = json<Export>('src/game/generated/assets.json');
const shuwa = json<Export>('src/game/generated/shuwa.json');
const pngSize = (path: string) => {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};
const actionsOf = (entry: Export['commands']['entries'][number]) =>
  [entry.air, entry.near, entry.far, entry.crouch].filter(Boolean);
// The scripts his own timeline plays from `roots`: export_assets.py's
// fighter_scripts, every edge but a spawn (which makes an object).
function fighterScripts(scripts: Export['scripts'], roots: number[]) {
  const key = (action: number, offset = 0) =>
    offset ? `${action}+${offset}` : `${action}`;
  const seen = new Set<string>();
  const todo = roots.map((root) => `${root}`);
  while (todo.length) {
    const at = todo.pop()!;
    const script = scripts[at];
    if (!script || seen.has(at)) continue;
    seen.add(at);
    if (script.end === 'jump') todo.push(key(script.next, script.offset));
    for (const e of script.events)
      if (e.op === 'spawn') {
        if (e.busy) todo.push(key(e.busy, e.busyOffset));
      } else if (
        ['handler', 'random', 'input', 'test', 'command'].includes(e.op)
      ) {
        if (e.action) todo.push(key(e.action, e.offset));
      } else if (e.op === 'call') todo.push(`${e.action}`);
      else if ((e.op === 'stock' || e.op === 'life') && e.target)
        todo.push(key(e.target, e.offset));
  }
  return seen;
}

describe("SHUWA's authored export", () => {
  it('keeps only actions the donor has, as its kept entries name them', () => {
    for (const entry of spec.commands.keep)
      expect(actionsOf(shuwa.commands.entries[entry - 1]), `${entry}`).toEqual(
        actionsOf(ryuko.commands.entries[entry - 1]),
      );
    const kept = spec.commands.keep.flatMap((entry) =>
      actionsOf(ryuko.commands.entries[entry - 1]),
    );
    // Counter Hit (174), and the actions drop and scriptImages name.
    for (const action of [
      ...kept,
      174,
      ...Object.keys(spec.drop),
      ...Object.keys(spec.scriptImages),
    ])
      expect(`${action}` in ryuko.scripts, `${action}`).toBe(true);
  });

  it('shows only images his spec maps to a drawing, a blank or an fx', () => {
    const moves = shuwa.commands.entries.flatMap(actionsOf);
    const own = fighterScripts(shuwa.scripts, [
      ...moves,
      174,
      ...shuwa.responses.filter(Boolean),
      shuwa.start,
      ...shuwa.jumps,
      ...shuwa.walks,
      shuwa.fall,
    ]);
    const shown = new Set([
      ...[...own].flatMap((key) =>
        shuwa.scripts[key].frames.map((f) => f.image),
      ),
      ...Object.entries(shuwa.clips)
        // The darkening panel behind a super is an object of RYUKO's.
        .filter(([name]) => name !== 'black')
        .flatMap(([, frames]) => frames.map((f) => f.image)),
      ...shuwa.held.map((f) => f.image),
      ...shuwa.idle.records
        .filter((r) => r[0] === 0x0c)
        .map((r) => (r[3] | (r[4] << 8)) & 8191),
    ]);
    const mapped = new Set([
      0,
      8191,
      ...Object.keys(spec.images).map(Number),
      ...spec.fx,
      ...spec.blank,
      ...Object.values(spec.scriptImages).flatMap((images) =>
        Object.keys(images).map((image) => 10000 + Number(image)),
      ),
    ]);
    expect([...shown].filter((image) => !mapped.has(image))).toEqual([]);
    const ownImages = new Set(
      shuwa.images.filter((image) => image.own).map(({ index }) => index),
    );
    expect(
      [...shown].filter(
        (image) => image && image !== 8191 && !ownImages.has(image),
      ),
    ).toEqual([]);
    // The moves he lacks are left out, and with her intro's input checks to
    // them cut (cutInputs), so is Chage Character (37), her EX mode.
    const cut = new Set(spec.cutInputs);
    expect(cut).toEqual(new Set([37]));
    expect([...own].filter((key) => cut.has(parseInt(key)))).toEqual([]);
    expect(
      Object.values(shuwa.scripts).flatMap(({ events }) =>
        events.filter((e) => e.op === 'input' && cut.has(e.action!)),
      ),
    ).toEqual([]);
    expect(own.has('256')).toBe(false);
  });

  it('has every drawing and fx it names, anchored and sized', () => {
    const drawings = new Set([
      ...Object.values(spec.images),
      ...Object.values(spec.scriptImages).flatMap(Object.values),
      spec.ui.portrait,
    ]);
    for (const name of drawings) {
      const path = `${ART}/drawings/${name}.png`;
      expect(existsSync(path), path).toBe(true);
      expect(pngSize(path), path).toEqual(anchors[name]?.size);
    }
    // Each fx is the donor image's exact size, so her offsets and boxes stay
    // true.
    const donor = new Map(ryuko.images.map((image) => [image.index, image]));
    for (const id of spec.fx) {
      const { width, height } = donor.get(id)!;
      expect(pngSize(`${ART}/fx/${id}.png`), `${id}`).toEqual([width, height]);
    }
    for (const id of spec.blank) expect(donor.has(id), `${id}`).toBe(true);
    for (const path of [spec.ui.faceTile, spec.ui.hudFace])
      expect(existsSync(`${ART}/${path}`), path).toBe(true);
  });

  it('holds his drawings where her held poses held hers', () => {
    // Op 0x07's held poses draw from the image's corner (heldPlacement), the
    // rest from its bottom centre (placement). A drawing's anchor stands for
    // the point of her image that his normal frames put it on, or, for an
    // image she only shows held, its bottom centre.
    const size = new Map(
      ryuko.images.map((i) => [i.index, [i.width, i.height] as const]),
    );
    const drawing = (image: number) => anchors[spec.images[image]];
    const placed = (f: Frame) =>
      f as Placed & { width: number; height: number };
    const donor = new Map<number, [number, number]>();
    const pairs = [
      ...Object.keys(ryuko.clips).map((k) => [ryuko.clips[k], shuwa.clips[k]]),
      ...Object.keys(ryuko.scripts).map((k) => [
        ryuko.scripts[k].frames,
        shuwa.scripts[k]?.frames ?? [],
      ]),
    ];
    for (const [hers, his] of pairs)
      if (hers.length === his.length)
        hers.forEach((f, i) => {
          const [her, him] = [placed(f), placed(his[i])];
          if (him.image !== her.image || !drawing(her.image)) return;
          const {
            anchor,
            size: [w, h],
          } = drawing(her.image);
          const [wd, hd] = size.get(her.image)!;
          // placement: his anchor and this point of hers land together.
          const point: [number, number] = [
            him.dx -
              Math.floor(w / 2) +
              anchor[0] -
              her.dx +
              Math.floor(wd / 2),
            him.dy - h + anchor[1] - her.dy + hd,
          ];
          expect(donor.get(her.image) ?? point, `${her.image}`).toEqual(point);
          donor.set(her.image, point);
        });
    const at = (
      { left, top, flip_x, flip_y }: ReturnType<typeof heldPlacement>,
      [w, h]: readonly [number, number],
      [ax, ay]: readonly [number, number],
    ) => [flip_x ? left + w - ax : left + ax, flip_y ? top + h - ay : top + ay];
    const held = ryuko.held.filter((f) => drawing(f.image));
    expect(held).toHaveLength(13);
    expect(held.map((f) => f.image).filter((i) => !donor.has(i))).toEqual([
      422,
    ]);
    ryuko.held.forEach((f, i) => {
      if (!drawing(f.image)) return;
      const [her, him] = [placed(f), placed(shuwa.held[i])];
      const {
        anchor,
        size: [w, h],
      } = drawing(her.image);
      const [wd, hd] = size.get(her.image)!;
      expect(him.image).toBe(her.image);
      expect([him.width, him.height]).toEqual([w, h]);
      const point = donor.get(her.image) ?? [Math.floor(wd / 2), hd];
      for (const holderLeft of [false, true])
        for (const flip_x of [false, true])
          for (const flip_y of [false, true]) {
            const pose = (p: Placed) => ({ ...p, flip_x, flip_y });
            expect(
              at(
                heldPlacement(pose(him), w, h, 100, 50, holderLeft),
                [w, h],
                anchor,
              ),
              `${i} ${holderLeft} ${flip_x} ${flip_y}`,
            ).toEqual(
              at(
                heldPlacement(pose(her), wd, hd, 100, 50, holderLeft),
                [wd, hd],
                point,
              ),
            );
          }
    });
  });

  itWithArt('cuts nothing under art/ from the game', () => {
    const sha = (path: string) =>
      createHash('sha256').update(readFileSync(path)).digest('hex');
    const art = new Map<string, string>();
    const sizes = new Set<number>();
    for (const name of readdirSync('art', {
      recursive: true,
      encoding: 'utf8',
    }))
      if (name.endsWith('.png')) {
        art.set(sha(`art/${name}`), `art/${name}`);
        sizes.add(statSync(`art/${name}`).size);
      }
    // The exporter's own copies of the art: his images, the EN digits and
    // DoraEmon's name plate.
    const copies = (path: string) =>
      path.startsWith('shuwa/') ||
      [
        'en/7.png',
        'en/8.png',
        'en/9.png',
        'en/10.png',
        'dora/247.png',
      ].includes(path);
    const found: string[] = [];
    for (const name of readdirSync('public/assets', {
      recursive: true,
      encoding: 'utf8',
    })) {
      const path = `public/assets/${name}`;
      const stat = statSync(path);
      if (stat.isFile() && sizes.has(stat.size) && art.has(sha(path)))
        if (!copies(name)) found.push(`${name} = ${art.get(sha(path))}`);
    }
    expect(art.size).toBeGreaterThan(100);
    expect(found).toEqual([]);
  });
});
