import { expect, it, vi } from 'vitest';
import { CHARACTERS } from './characters';
import type { Who } from './characters';
import { CharacterSelect } from './select';
import type { GameStatus } from './scene';

// scene.ts imports Phaser at runtime, which a browser-only module; the pause
// and reset paths driven here touch only these three of its surfaces.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    GameObjects: { Image: class {} },
    Loader: { Events: { COMPLETE: 'complete' } },
  },
}));

import { TrainingScene } from './scene';

// A TrainingScene mid-match (no screen) with the systems a Phaser boot
// injects stubbed; `load.once(COMPLETE)` captures the callback so a test
// finishes a fighter's load when it chooses.
const boot = () => {
  const statuses: GameStatus[] = [];
  const scene = new TrainingScene((status) => statuses.push(status));
  const view = scene as unknown as {
    ready: boolean;
    loading: boolean;
    select: unknown;
    players: Set<Who>;
    blur(): void;
    [key: string]: unknown;
  };
  const completes: (() => void)[] = [];
  let cached = false;
  Object.assign(view, {
    sound: {
      pauseAll: () => {},
      resumeAll: () => {},
      stopAll: () => {},
      removeByKey: () => {},
    },
    load: {
      image: () => {},
      audio: () => {},
      on: () => {},
      once: (_event: string, done: () => void) => void completes.push(done),
      start: () => {},
    },
    textures: {
      exists: () => cached,
      getTextureKeys: () => [] as string[],
      remove: () => {},
    },
    children: { list: [] },
    cache: { audio: { exists: () => false, remove: () => {} } },
  });
  view.ready = true;
  view.select = null;
  return {
    scene,
    view,
    statuses,
    // Every player's art already in, so a match change starts at once.
    artIn: () => {
      cached = true;
      view.players = new Set(Object.keys(CHARACTERS) as Who[]);
    },
    finishLoad: () => {
      for (const done of completes.splice(0)) done();
    },
  };
};

it('keeps the pause a match was under when Settings changes the fighter', () => {
  const { scene, artIn } = boot();
  artIn();
  scene.togglePause();
  scene.setModal(true);
  scene.setFighter('zoma');
  // The reset inside the dialog holds the pause it found.
  expect(scene.paused).toBe(true);
  scene.setModal(false);
  expect(scene.paused).toBe(true);
});

it('keeps the pause for a fighter whose art is still loading when Settings closes', () => {
  const { scene, view, finishLoad } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.setFighter('zoma');
  expect(view.loading).toBe(true);
  scene.setModal(false);
  finishLoad();
  expect(view.loading).toBe(false);
  expect(scene.paused).toBe(true);
});

it('leaves an unpaused match unpaused across a Settings change', () => {
  const { scene, artIn } = boot();
  artIn();
  scene.setModal(true);
  scene.setFighter('zoma');
  scene.setModal(false);
  expect(scene.paused).toBe(false);
});

it('restores the pause when Settings closes without changing anything', () => {
  const { scene } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.setModal(false);
  expect(scene.paused).toBe(true);
});

it('lets a toolbar reset unpause, as before', () => {
  const { scene, artIn } = boot();
  artIn();
  scene.togglePause();
  scene.reset('practice');
  expect(scene.paused).toBe(false);
});

it('opens the character select unpaused, dropping the held pause', () => {
  const { scene, view } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.openSelect();
  scene.setModal(false);
  expect(view.select).toBeInstanceOf(CharacterSelect);
  expect(scene.paused).toBe(false);
});

it('keeps a pause taken while the dialog is up', () => {
  const { scene, view } = boot();
  scene.setModal(true);
  view.blur();
  scene.setModal(false);
  expect(scene.paused).toBe(true);
});

it('drops a Settings reset still loading when the character select opens', () => {
  const { scene, view, finishLoad } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.setFighter('zoma');
  expect(view.loading).toBe(true);
  scene.openSelect();
  scene.setModal(false);
  finishLoad();
  expect(view.select).toBeInstanceOf(CharacterSelect);
  expect(view.loading).toBe(false);
  expect(scene.paused).toBe(false);
});

it('keeps a pause taken while a reset is still loading', () => {
  const { scene, view, finishLoad } = boot();
  scene.setModal(true);
  scene.setFighter('zoma');
  view.blur();
  scene.setModal(false);
  finishLoad();
  expect(scene.paused).toBe(true);
});

it('keeps a resume pressed while a Settings reset is still loading', () => {
  const { scene, finishLoad } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.setFighter('zoma');
  scene.setModal(false);
  scene.togglePause();
  finishLoad();
  expect(scene.paused).toBe(false);
});
