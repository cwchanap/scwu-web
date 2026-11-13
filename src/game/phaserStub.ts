// Test-only stand-in for the Phaser surface that scene.ts and packLoader.ts
// reach when Vitest imports them (Node: no canvas, WebAudio or game boot).
// Both test files mock 'phaser' with it, since isolate: false shares a
// worker's modules between files.

// Phaser's FILE_CONST values (loader/const.js).
const FILE_PENDING = 10;
const FILE_PROCESSING = 14;
const FILE_ERRORED = 16;
const FILE_COMPLETE = 17;

// Loader.File's two exits from processing (File.js); a test drives onProcess.
class File {
  state = FILE_PENDING;
  type: string;
  key: string;
  url: string;
  data: unknown;
  xhrLoader: unknown;

  constructor(
    public loader: { fileProcessComplete(file: File): void },
    config: { type: string; key: string; url: string },
  ) {
    this.type = config.type;
    this.key = config.key;
    this.url = config.url;
  }

  onProcessComplete() {
    this.state = FILE_COMPLETE;
    this.loader.fileProcessComplete(this);
  }

  onProcessError() {
    this.state = FILE_ERRORED;
    this.loader.fileProcessComplete(this);
  }
}

export default {
  Scene: class {},
  GameObjects: { Image: class {} },
  // Phaser's BlendModes enum (blendmodes.js).
  BlendModes: { NORMAL: 0, ADD: 1 },
  Loader: {
    File,
    Events: { COMPLETE: 'complete', FILE_LOAD_ERROR: 'loaderror' },
    FILE_PROCESSING,
    FILE_ERRORED,
    FILE_COMPLETE,
  },
};
