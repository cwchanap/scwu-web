import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, STAGES } from './characters';
import type { Stage, Who } from './characters';
import ui from './generated/ui.json';
import select from './generated/select.json';
import t2 from './generated/t2.json';
import { bytesOf, parsePack, selectAssets } from './packs';
import type { Pack } from './packs';
import { itWithArt } from './testing';

// A pack from a raw header and payload: the header's u32 length, its JSON,
// then the payload.
const assemble = (header: unknown, payload: Uint8Array): ArrayBuffer => {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const bytes = new Uint8Array(4 + json.length + payload.length);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  bytes.set(payload, 4 + json.length);
  return bytes.buffer;
};

// A well-formed pack: each entry's bytes follow the entries before it.
const build = (
  images: Record<string, Uint8Array>,
  sounds: Record<string, Uint8Array>,
): ArrayBuffer => {
  const payload: number[] = [];
  const table = (entries: Record<string, Uint8Array>) =>
    Object.fromEntries(
      Object.entries(entries).map(([key, bytes]) => {
        const range = [payload.length, bytes.length];
        payload.push(...bytes);
        return [key, range];
      }),
    );
  const header = { images: table(images), sounds: table(sounds) };
  return assemble(header, new Uint8Array(payload));
};

describe('pack files', () => {
  it('parsePack reads every entry back', () => {
    const pack = parsePack(
      build(
        {
          'ryuko-1': new Uint8Array([1, 2, 3]),
          'ryuko-2': new Uint8Array([9, 8]),
        },
        { 'ryuko-s1': new Uint8Array([42, 43, 44, 45]) },
      ),
    );
    expect([...bytesOf(pack, pack.images['ryuko-1'])]).toEqual([1, 2, 3]);
    expect([...bytesOf(pack, pack.images['ryuko-2'])]).toEqual([9, 8]);
    expect([...bytesOf(pack, pack.sounds['ryuko-s1'])]).toEqual([
      42, 43, 44, 45,
    ]);
  });

  it('parsePack rejects a header longer than the file', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setUint32(0, 1000, true);
    expect(() => parsePack(bytes.buffer)).toThrow(/header runs past the file/);
  });

  it('parsePack rejects an entry that runs past the payload', () => {
    const bytes = assemble(
      { images: { 'ryuko-1': [0, 5] }, sounds: {} },
      new Uint8Array([1, 2, 3]),
    );
    expect(() => parsePack(bytes)).toThrow(/lies outside the payload/);
  });

  it('parsePack rejects a buffer under 4 bytes', () => {
    expect(() => parsePack(new ArrayBuffer(3))).toThrow(/length prefix/);
  });

  it('parsePack rejects a header whose tables are arrays', () => {
    const bytes = assemble(
      { images: [[0, 1]], sounds: {} },
      new Uint8Array([1]),
    );
    expect(() => parsePack(bytes)).toThrow(/images or sounds table/);
  });

  it("selectAssets lists Ryuko's select images and sounds", () => {
    const indexes = new Set(CHARACTERS.ryuko.images.map((i) => i.index));
    expect(selectAssets.ryuko.images.size).toBeGreaterThan(0);
    expect(
      [...selectAssets.ryuko.images].filter((i) => !indexes.has(i)),
    ).toEqual([]);
  });
});

// The packs `bun run assets` writes (export_packs), checked against the
// exported JSON and files they were built from.
type Entry = { index: number; filename: string };
const PACKS = new URL('../../public/assets/packs/', import.meta.url);
// The pack files in PACKS; a Finder .DS_Store is not one of them.
const packFiles = () =>
  readdirSync(PACKS).filter((name) => name.endsWith('.bin'));
const ASSETS = new URL('../../public/assets/', import.meta.url);
const fighters = Object.keys(CHARACTERS) as Who[];
const demos = import.meta.glob<{
  default: { images: Entry[]; sounds: Entry[] };
}>('./generated/demos/*.json', { eager: true });
// Each generated/demos/<n>.json: its number, images and sounds.
const demoList = Object.entries(demos).map(([path, { default: demo }]) => ({
  n: path.replace(/^.*\/|\.json$/g, ''),
  ...demo,
}));
const hasAny = (part: { images: unknown[]; sounds: unknown[] }) =>
  part.images.length + part.sounds.length > 0;
// A fighter's exported files, split by whether its select programs use them
// (selectAssets): `boot` is the select subset, `rest` its fighter pack.
const split = (who: Who) => {
  const images = CHARACTERS[who].images as Entry[];
  const sounds = CHARACTERS[who].sounds as Entry[];
  const shown = selectAssets[who];
  return {
    boot: {
      images: images.filter((i) => shown.images.has(i.index)),
      sounds: sounds.filter((s) => shown.sounds.has(s.index)),
    },
    rest: {
      images: images.filter((i) => !shown.images.has(i.index)),
      sounds: sounds.filter((s) => !shown.sounds.has(s.index)),
    },
  };
};
// A pack, or a pointer to the command that writes it.
const readPack = (name: string): Pack => {
  const url = new URL(name, PACKS);
  if (!existsSync(url))
    throw new Error(`${name} is missing: run bun run assets`);
  return parsePack(new Uint8Array(readFileSync(url)).buffer);
};

describe('exported packs', () => {
  itWithArt('has every expected pack file and no other', () => {
    const expected = [
      'boot.bin',
      ...fighters
        .filter((who) => hasAny(split(who).rest))
        .map((who) => `fighter-${who}.bin`),
      ...(Object.keys(STAGES) as Stage[]).map((stage) => `stage-${stage}.bin`),
      ...demoList.filter(hasAny).map((demo) => `demo-${demo.n}.bin`),
    ];
    const found = existsSync(PACKS) ? packFiles() : [];
    expect(found.sort(), 'run bun run assets to write the packs').toEqual(
      expected.sort(),
    );
  });

  itWithArt(
    "boot holds exactly the UI, text, select/t2 art and every fighter's select subset",
    () => {
      const boot = readPack('boot.bin');
      expect(Object.keys(boot.images).sort()).toEqual(
        [
          ...ui.images.map((i) => `ui-${i.index}`),
          'text',
          ...select.images.map((i) => `select-${i.index}`),
          ...t2.images.map((i) => `t2-${i.index}`),
          ...fighters.flatMap((who) =>
            split(who).boot.images.map((i) => `${who}-${i.index}`),
          ),
        ].sort(),
      );
      expect(Object.keys(boot.sounds).sort()).toEqual(
        [
          ...ui.sounds.map((s) => `kgt-sound-${s.index}`),
          ...select.sounds.map((s) => `select-sound-${s.index}`),
          ...t2.sounds.map((s) => `t2-sound-${s.index}`),
          ...fighters.flatMap((who) =>
            split(who).boot.sounds.map((s) => `${who}-sound-${s.index}`),
          ),
        ].sort(),
      );
    },
  );

  itWithArt('each fighter pack holds exactly the rest', () => {
    for (const who of fighters) {
      const { rest } = split(who);
      if (!hasAny(rest)) continue;
      const pack = readPack(`fighter-${who}.bin`);
      expect(Object.keys(pack.images).sort(), who).toEqual(
        rest.images.map((i) => `${who}-${i.index}`).sort(),
      );
      expect(Object.keys(pack.sounds).sort(), who).toEqual(
        rest.sounds.map((s) => `${who}-sound-${s.index}`).sort(),
      );
    }
  });

  itWithArt(
    "each stage pack holds exactly the stage's images and no sounds",
    () => {
      for (const stage of Object.keys(STAGES) as Stage[]) {
        const pack = readPack(`stage-${stage}.bin`);
        const images = STAGES[stage].images as Entry[];
        expect(Object.keys(pack.images).sort(), stage).toEqual(
          images.map((i) => `${stage}-${i.index}`).sort(),
        );
        expect(pack.sounds, stage).toEqual({});
      }
    },
  );

  itWithArt('each demo pack matches its json', () => {
    for (const demo of demoList) {
      const name = `demo-${demo.n}.bin`;
      if (!hasAny(demo)) {
        expect(existsSync(new URL(name, PACKS)), name).toBe(false);
        continue;
      }
      const pack = readPack(name);
      expect(Object.keys(pack.images).sort(), name).toEqual(
        demo.images.map((i) => `demo${demo.n}-${i.index}`).sort(),
      );
      expect(Object.keys(pack.sounds).sort(), name).toEqual(
        demo.sounds.map((s) => `demo${demo.n}-sound-${s.index}`).sort(),
      );
    }
    // Demo 29 (END A) exports nothing, so it has no pack.
    expect(existsSync(new URL('demo-29.bin', PACKS))).toBe(false);
  });

  itWithArt('no key is in two packs', () => {
    const keys = packFiles().flatMap((name) => {
      const pack = readPack(name);
      return [...Object.keys(pack.images), ...Object.keys(pack.sounds)];
    });
    expect(keys.length - new Set(keys).size, 'keys held by two packs').toBe(0);
  });

  itWithArt("every pack entry is the exported file's bytes", () => {
    // Ryuko's art and sounds (split between boot and his fighter pack) and one
    // stage's images, each against the file its JSON names.
    const exported = new Map<string, string>([
      ...CHARACTERS.ryuko.images.map((i): [string, string] => [
        `ryuko-${i.index}`,
        i.filename,
      ]),
      ...CHARACTERS.ryuko.sounds.map((s): [string, string] => [
        `ryuko-sound-${s.index}`,
        s.filename,
      ]),
      ...(STAGES.court.images as Entry[]).map((i): [string, string] => [
        `court-${i.index}`,
        i.filename,
      ]),
    ]);
    let checked = 0;
    for (const name of ['boot.bin', 'fighter-ryuko.bin', 'stage-court.bin']) {
      const pack = readPack(name);
      for (const [key, range] of [
        ...Object.entries(pack.images),
        ...Object.entries(pack.sounds),
      ]) {
        const filename = exported.get(key);
        if (filename === undefined) continue;
        const file = readFileSync(new URL(filename, ASSETS));
        expect(Buffer.from(bytesOf(pack, range)).equals(file), key).toBe(true);
        checked++;
      }
    }
    expect(checked).toBe(
      CHARACTERS.ryuko.images.length +
        CHARACTERS.ryuko.sounds.length +
        STAGES.court.images.length,
    );
  });
});
