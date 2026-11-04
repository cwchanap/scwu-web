import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Phaser from 'phaser';
import { PackFile, packUrl } from './packLoader';

// The same stub scene.test.ts mocks phaser with (isolate: false shares modules).
vi.mock('phaser', async () => ({
  default: (await import('./phaserStub')).default,
}));

// Each image is made in the order the pack lists it; its outcome is the next
// one here ('stall' never loads).
type Outcome = 'load' | 'error' | 'stall';
let outcomes: Outcome[] = [];
let made: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly outcome: Outcome = outcomes.shift() ?? 'load';

  constructor() {
    made.push(this);
  }

  set src(url: string) {
    if (!url.startsWith('blob:')) throw new Error(`not a blob URL: ${url}`);
    if (this.outcome === 'load') queueMicrotask(() => this.onload?.());
    if (this.outcome === 'error') queueMicrotask(() => this.onerror?.());
  }
}

let blobs: string[] = [];
beforeEach(() => {
  outcomes = [];
  made = [];
  blobs = [];
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => {
      const url = `blob:${blobs.length}`;
      blobs.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A pack from its entries, laid out as write_pack writes it (export_assets.py).
const pack = (
  images: Record<string, number[]>,
  sounds: Record<string, number[]> = {},
): ArrayBuffer => {
  const payload: number[] = [];
  const table = (entries: Record<string, number[]>) =>
    Object.fromEntries(
      Object.entries(entries).map(([key, bytes]) => {
        const range = [payload.length, bytes.length];
        payload.push(...bytes);
        return [key, range];
      }),
    );
  const header = new TextEncoder().encode(
    JSON.stringify({ images: table(images), sounds: table(sounds) }),
  );
  const bytes = new Uint8Array(4 + header.length + payload.length);
  new DataView(bytes.buffer).setUint32(0, header.length, true);
  bytes.set(header, 4);
  bytes.set(payload, 4 + header.length);
  return bytes.buffer;
};

// A sound decodes to a stand-in whose length is the bytes it was given.
const decoder = () => ({
  decodeAudioData: vi.fn(async (data: ArrayBuffer) => ({
    length: data.byteLength,
  })),
});

// The loader a file sees: its caches, the game's sound manager, and
// fileProcessComplete as Phaser runs it (a complete file adds itself).
const loader = ({
  sound = { context: decoder() },
  textures = [],
  audio = [],
}: {
  sound?: object;
  textures?: string[];
  audio?: string[];
} = {}) => ({
  emit: vi.fn(),
  fileProcessComplete: vi.fn((file: PackFile) => {
    if (file.state === Phaser.Loader.FILE_COMPLETE) file.addToCache();
  }),
  textureManager: {
    exists: vi.fn((key: string) => textures.includes(key)),
    addImage: vi.fn(),
  },
  cacheManager: {
    audio: {
      exists: vi.fn((key: string) => audio.includes(key)),
      add: vi.fn(),
    },
  },
  systems: { game: { sound } },
});
type Fake = ReturnType<typeof loader>;

// A pack file whose response is the XHR's, as onProcess reads it.
const fileWith = (
  fake: Fake,
  response: ArrayBuffer,
  resident = () => false,
) => {
  const file = new PackFile(
    fake as unknown as Phaser.Loader.LoaderPlugin,
    'fighter-yinan',
    resident,
  );
  file.xhrLoader = { response } as unknown as XMLHttpRequest;
  return file;
};

const settle = () => new Promise((resolve) => setTimeout(resolve));
const revoked = () =>
  vi.mocked(URL.revokeObjectURL).mock.calls.map(([url]) => url);

describe('PackFile', () => {
  it('loads the pack from its packUrl', () => {
    expect(fileWith(loader(), new ArrayBuffer(0)).url).toBe(
      packUrl('fighter-yinan'),
    );
  });

  it('decodes each sound from its own slice', async () => {
    const context = decoder();
    const sounds = {
      'fighter-yinan-sound-1': [1, 2, 3],
      'fighter-yinan-sound-2': [9, 8, 7, 6],
    };
    await fileWith(
      loader({ sound: { context } }),
      pack({}, sounds),
    ).onProcess();
    // decodeAudioData gets a copy of exactly its sound's bytes.
    expect(
      context.decodeAudioData.mock.calls.map(([data]) => [
        ...new Uint8Array(data),
      ]),
    ).toEqual([
      [1, 2, 3],
      [9, 8, 7, 6],
    ]);
    // A sound already in the audio cache is not decoded.
    const cached = decoder();
    await fileWith(
      loader({ sound: { context: cached }, audio: ['fighter-yinan-sound-1'] }),
      pack({}, sounds),
    ).onProcess();
    expect(cached.decodeAudioData).toHaveBeenCalledTimes(1);
    expect([
      ...new Uint8Array(cached.decodeAudioData.mock.calls[0][0]),
    ]).toEqual([9, 8, 7, 6]);
  });

  it('registers nothing until every entry has decoded', async () => {
    const entries = {
      images: { 'fighter-yinan-1': [1], 'fighter-yinan-2': [2] },
      sounds: { 'fighter-yinan-sound-1': [3] },
    };
    // The second image never loads.
    outcomes = ['load', 'stall'];
    const stuck = loader();
    void fileWith(stuck, pack(entries.images, entries.sounds)).onProcess();
    await settle();
    expect(stuck.textureManager.addImage).not.toHaveBeenCalled();
    expect(stuck.cacheManager.audio.add).not.toHaveBeenCalled();
    // Once every entry has loaded, all of them register.
    const loaded = loader();
    await fileWith(loaded, pack(entries.images, entries.sounds)).onProcess();
    expect(
      loaded.textureManager.addImage.mock.calls.map(([key]) => key),
    ).toEqual(['fighter-yinan-1', 'fighter-yinan-2']);
    expect(
      loaded.cacheManager.audio.add.mock.calls.map(([key]) => key),
    ).toEqual(['fighter-yinan-sound-1']);
  });

  it('skips the sounds, keeps the images, when the sound manager has no context', async () => {
    const fake = loader({ sound: {} });
    await fileWith(
      fake,
      pack({ 'fighter-yinan-1': [1] }, { 'fighter-yinan-sound-1': [3] }),
    ).onProcess();
    expect(fake.textureManager.addImage).toHaveBeenCalledWith(
      'fighter-yinan-1',
      expect.any(FakeImage),
    );
    expect(fake.cacheManager.audio.add).not.toHaveBeenCalled();
    expect(fake.emit).not.toHaveBeenCalled();
  });

  it('skips an image whose texture exists before decoding it', async () => {
    const fake = loader({ textures: ['fighter-yinan-1'] });
    await fileWith(
      fake,
      pack({ 'fighter-yinan-1': [1], 'fighter-yinan-2': [2] }),
    ).onProcess();
    expect(made).toHaveLength(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(fake.textureManager.addImage.mock.calls.map(([key]) => key)).toEqual(
      ['fighter-yinan-2'],
    );
  });

  it('hasCacheConflict follows resident()', () => {
    let resident = false;
    const file = fileWith(loader(), new ArrayBuffer(0), () => resident);
    expect(file.hasCacheConflict()).toBe(false);
    resident = true;
    expect(file.hasCacheConflict()).toBe(true);
  });

  it('a corrupt pack raises loaderror then errors the file', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fake = loader();
    // Shorter than its length prefix.
    const file = fileWith(fake, new Uint8Array([9, 9]).buffer);
    await file.onProcess();
    expect(logged).toHaveBeenCalledWith(
      new Error('pack is shorter than its length prefix'),
    );
    expect(fake.emit).toHaveBeenCalledOnce();
    expect(fake.emit).toHaveBeenCalledWith(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      file,
    );
    expect(file.state).toBe(Phaser.Loader.FILE_ERRORED);
    expect(fake.fileProcessComplete).toHaveBeenCalledWith(file);
    expect(fake.textureManager.addImage).not.toHaveBeenCalled();
  });

  it('an image that fails to decode, or a sound that is rejected, raises loaderror', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    outcomes = ['error'];
    const badImage = loader();
    const imageFile = fileWith(badImage, pack({ 'fighter-yinan-1': [1] }));
    await imageFile.onProcess();
    expect(badImage.emit).toHaveBeenCalledWith(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      imageFile,
    );
    expect(imageFile.state).toBe(Phaser.Loader.FILE_ERRORED);

    const rejecting = loader({
      sound: {
        context: {
          decodeAudioData: () => Promise.reject(new Error('EncodingError')),
        },
      },
    });
    const soundFile = fileWith(
      rejecting,
      pack({}, { 'fighter-yinan-sound-1': [1] }),
    );
    await soundFile.onProcess();
    expect(rejecting.emit).toHaveBeenCalledWith(
      Phaser.Loader.Events.FILE_LOAD_ERROR,
      soundFile,
    );
    expect(soundFile.state).toBe(Phaser.Loader.FILE_ERRORED);
    expect(rejecting.cacheManager.audio.add).not.toHaveBeenCalled();
  });

  it('revokes every image blob URL', async () => {
    // The failing case below logs its error.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const images = { 'fighter-yinan-1': [1], 'fighter-yinan-2': [2] };
    await fileWith(loader(), pack(images)).onProcess();
    expect(blobs).toHaveLength(2);
    expect(revoked()).toEqual(blobs);
    // On failure too, once every image has settled.
    blobs = [];
    vi.mocked(URL.revokeObjectURL).mockClear();
    outcomes = ['load', 'error'];
    await fileWith(loader(), pack(images)).onProcess();
    expect(revoked()).toEqual(blobs);
    expect(blobs).toHaveLength(2);
  });
});
