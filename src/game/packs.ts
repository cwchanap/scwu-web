import { CHARACTERS } from './characters';
import type { Who } from './characters';

// An entry's place in the payload: its offset and its length.
export type PackRange = [offset: number, length: number];
export interface Pack {
  images: Record<string, PackRange>;
  sounds: Record<string, PackRange>;
  payload: Uint8Array<ArrayBuffer>;
}

// A pack is a little-endian u32 header length, the UTF-8 JSON header (each
// cache key's range), then the payload that the ranges are relative to.
export function parsePack(buffer: ArrayBuffer): Pack {
  if (buffer.byteLength < 4)
    throw new Error('pack is shorter than its length prefix');
  const headerEnd = 4 + new DataView(buffer).getUint32(0, true);
  if (headerEnd > buffer.byteLength)
    throw new Error('pack header runs past the file');
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 4, headerEnd - 4)),
  );
  const isTable = (table: unknown) =>
    typeof table === 'object' && table !== null && !Array.isArray(table);
  if (!isTable(header?.images) || !isTable(header?.sounds))
    throw new Error('pack header lacks its images or sounds table');
  const { images, sounds }: Omit<Pack, 'payload'> = header;
  const payload = new Uint8Array(buffer, headerEnd);
  for (const [key, [offset, length]] of [
    ...Object.entries(images),
    ...Object.entries(sounds),
  ]) {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset + length > payload.length
    )
      throw new Error(`pack entry ${key} lies outside the payload`);
  }
  return { images, sounds, payload };
}

// An entry's bytes: a view into the payload, not a copy.
export const bytesOf = (
  pack: Pack,
  range: PackRange,
): Uint8Array<ArrayBuffer> =>
  pack.payload.subarray(range[0], range[0] + range[1]);

// The images and sounds each player's select-screen programs show and play
// (ops 0x0c and 0x03, select.ts), which load at start and stay; the rest of
// a player's load with the matches that seat it (whenReady).
export const selectAssets = Object.fromEntries(
  (Object.keys(CHARACTERS) as Who[]).map((who) => {
    const records = Object.values(
      CHARACTERS[who].select.actions as Record<string, number[][]>,
    ).flat();
    const used = (op: number, read: (r: number[]) => number) =>
      new Set(records.filter((r) => r[0] === op).map(read));
    return [
      who,
      {
        images: used(0x0c, (r) => (r[3] | (r[4] << 8)) & 8191),
        sounds: used(0x03, (r) => r[2] | (r[3] << 8)),
      },
    ];
  }),
) as Record<Who, { images: Set<number>; sounds: Set<number> }>;
