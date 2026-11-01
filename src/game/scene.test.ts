import { expect, it, vi } from 'vitest';
import { CHARACTERS } from './characters';
import type { Who } from './characters';
import { Match } from './match';
import { CharacterSelect, StoryDemo, Title } from './select';
import type { GameStatus } from './scene';
import { Story } from './story';

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
    completes,
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

// The Escape keydown, and one screen step through the scene's dispatcher.
const esc = (view: { [key: string]: unknown }) =>
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
const stepSelect = (view: { [key: string]: unknown }) =>
  (view.stepSelect as (input: object) => void)({});

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

it('opens the title when Escape is pressed on the character select', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view } = boot();
  scene.openSelect();
  expect(view.select).toBeInstanceOf(CharacterSelect);
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
  expect(view.select).toBeInstanceOf(Title);
});

it('still pauses on Escape during a match', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view } = boot();
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
  expect(scene.paused).toBe(true);
});

it('starts the pair a select picked after Escape left a story, not the battle it left', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view, artIn } = boot();
  artIn();
  // A story battle running: the match's mode is 'story'.
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', first.battle, 0);
  expect(scene.match.mode).toBe('story');
  // Menu → Character select, then Escape back to the title.
  scene.openSelect();
  esc(view);
  expect(view.select).toBeInstanceOf(Title);
  // VS on the title opens the select screen; both picks complete it.
  (view.select as Title).done = 'vs';
  stepSelect(view);
  const select = view.select as CharacterSelect;
  expect(select).toBeInstanceOf(CharacterSelect);
  select.done = ['kiki', 'zoma'];
  stepSelect(view);
  // The match starts in free practice with the pair, not in the story.
  expect(view.select).toBeNull();
  expect(scene.match.mode).toBe('practice');
  expect(scene.match.battle).toBeNull();
  expect(scene.match.fighters.map((f) => f.who)).toEqual(['kiki', 'zoma']);
});

it('cancels a story demo still loading when Escape returns to the title', async () => {
  vi.stubGlobal('HTMLElement', class {});
  const { view, finishLoad } = boot();
  // SHIN-Z's story select confirmed: his opening demo (3) starts loading
  // while the select screen stays.
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['shinz', 'shinz'];
  stepSelect(view);
  expect(view.loading).toBe(true);
  // Escape opens the title before the demo's module lands.
  esc(view);
  expect(view.select).toBeInstanceOf(Title);
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve));
  finishLoad();
  expect(view.select).toBeInstanceOf(Title);
});

it('drops a story demo whose art lands after Escape to the title', async () => {
  vi.stubGlobal('HTMLElement', class {});
  const { view, completes, finishLoad } = boot();
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['shinz', 'shinz'];
  stepSelect(view);
  // The demo's module landed and its art is loading; then Escape.
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  esc(view);
  expect(view.select).toBeInstanceOf(Title);
  finishLoad();
  expect(view.select).toBeInstanceOf(Title);
});

it('opens a story demo once its records and art finish loading', async () => {
  const { view, completes, finishLoad } = boot();
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['shinz', 'shinz'];
  stepSelect(view);
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  finishLoad();
  expect(view.select).toBeInstanceOf(StoryDemo);
  expect(view.loading).toBe(false);
});

it('reports music on by default and follows setMusic', () => {
  const { scene, view, statuses } = boot();
  (view.report as () => void)();
  expect(statuses.at(-1)?.music).toBe(true);
  scene.setMusic(false);
  expect(statuses.at(-1)?.music).toBe(false);
});

it('reports music while a screen is open', () => {
  const { scene, statuses } = boot();
  scene.openSelect();
  scene.setMusic(false);
  expect(statuses.at(-1)?.music).toBe(false);
});
