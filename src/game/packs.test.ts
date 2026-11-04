import { describe, expect, it } from 'vitest';
import { CHARACTERS } from './characters';
import { bytesOf, parsePack, selectAssets } from './packs';

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

  it("selectAssets lists Ryuko's select images and sounds", () => {
    const indexes = new Set(CHARACTERS.ryuko.images.map((i) => i.index));
    expect(selectAssets.ryuko.images.size).toBeGreaterThan(0);
    expect(
      [...selectAssets.ryuko.images].filter((i) => !indexes.has(i)),
    ).toEqual([]);
  });
});
