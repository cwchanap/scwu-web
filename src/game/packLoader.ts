import Phaser from 'phaser';
import { ASSET_BASE } from './assetBase';
import { bytesOf, parsePack } from './packs';

// Where a pack is served: beside the art and sounds it packs.
export const packUrl = (name: string) => `${ASSET_BASE}packs/${name}.bin`;

// A pack's decoded entries, by the cache keys they register under.
interface Decoded {
  images: Map<string, HTMLImageElement>;
  sounds: Map<string, AudioBuffer>;
}

const revoke = (urls: string[]) =>
  urls.forEach((url) => URL.revokeObjectURL(url));

// A pack as one loader file (packs.ts). Its images and sounds register in one
// synchronous addToCache(), once every entry has decoded, so a pack that fails
// leaves neither cache with any of its keys.
export class PackFile extends Phaser.Loader.File {
  constructor(
    loader: Phaser.Loader.LoaderPlugin,
    name: string,
    // Whether the pack's contents are already loaded.
    private readonly resident: () => boolean,
  ) {
    super(loader, {
      type: 'pack',
      cache: false,
      key: name,
      url: packUrl(name),
      extension: 'bin',
      responseType: 'arraybuffer',
    });
  }

  // A resident pack is a key conflict, so the loader never queues it again.
  hasCacheConflict() {
    return this.resident();
  }

  // Phaser ignores the promise; a test can await it.
  async onProcess() {
    this.state = Phaser.Loader.FILE_PROCESSING;
    const urls: string[] = [];
    let decoded: Decoded;
    try {
      decoded = await this.decode(urls);
    } catch {
      revoke(urls);
      // onProcessError alone never emits loaderror (File.js), which the
      // scene's overlay listens for.
      this.loader.emit(Phaser.Loader.Events.FILE_LOAD_ERROR, this);
      this.onProcessError();
      return;
    }
    revoke(urls);
    this.data = decoded;
    this.onProcessComplete();
  }

  addToCache() {
    const { images, sounds } = this.data as Decoded;
    for (const [key, image] of images)
      this.loader.textureManager.addImage(key, image);
    for (const [key, buffer] of sounds)
      this.loader.cacheManager.audio.add(key, buffer);
  }

  // Decodes every entry its cache lacks. It rejects, once all have settled,
  // if any failed.
  private async decode(urls: string[]): Promise<Decoded> {
    const pack = parsePack(this.xhrLoader!.response as ArrayBuffer);
    const images = new Map<string, HTMLImageElement>();
    const sounds = new Map<string, AudioBuffer>();
    const jobs: Promise<void>[] = [];
    for (const [key, range] of Object.entries(pack.images)) {
      if (this.loader.textureManager.exists(key)) continue;
      const url = URL.createObjectURL(
        new Blob([bytesOf(pack, range)], { type: 'image/png' }),
      );
      urls.push(url);
      const image = new Image();
      images.set(key, image);
      jobs.push(
        new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error(`image ${key} did not decode`));
          image.src = url;
        }),
      );
    }
    // ponytail: WebAudio only. Without a context (HTML5 audio) the sounds are
    // skipped, so sound.add fails for them.
    const { context } = this.loader.systems.game
      .sound as Partial<Phaser.Sound.WebAudioSoundManager>;
    if (context)
      for (const [key, range] of Object.entries(pack.sounds)) {
        if (this.loader.cacheManager.audio.exists(key)) continue;
        // decodeAudioData detaches the buffer it is given, so it gets a copy.
        jobs.push(
          context
            .decodeAudioData(bytesOf(pack, range).slice().buffer)
            .then((buffer) => {
              sounds.set(key, buffer);
            }),
        );
      }
    const failed = (await Promise.allSettled(jobs)).find(
      (result) => result.status === 'rejected',
    );
    if (failed) throw failed.reason;
    return { images, sounds };
  }
}
