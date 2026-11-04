import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { CHARACTERS, STAGES } from './characters';
import type { Stage, Who } from './characters';
import { Match } from './match';
import { parsePack } from './packs';
import { CharacterSelect, Continue, StoryDemo, Title } from './select';
import type { Demo } from './select';
import type { GameStatus } from './scene';
import { PackFile } from './packLoader';
import { Story } from './story';
import { itWithArt } from './testing';

// scene.ts imports Phaser at runtime, which a browser-only module; phaserStub.ts
// holds the surfaces the pause, reset and pack paths driven here touch.
vi.mock('phaser', async () => ({
  default: (await import('./phaserStub')).default,
}));

import { TrainingScene } from './scene';

// Tests share globals between files (isolate: false), so every stubbed one
// is restored after each test.
afterEach(() => vi.unstubAllGlobals());

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
  // The packs the scene queued (boot, stage, fighter and demo), in order.
  const files: PackFile[] = [];
  let cached = false;
  Object.assign(view, {
    sound: {
      pauseAll: () => {},
      resumeAll: () => {},
      stopAll: () => {},
      removeByKey: () => {},
    },
    load: {
      // Stage music is the one individual file left (playMusic).
      audio: () => {},
      addFile: (file: PackFile) => files.push(file),
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
    files,
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

// The Escape and R keydowns, and one screen step through the scene's
// dispatcher.
const esc = (view: { [key: string]: unknown }) =>
  (view.keydown as (e: unknown) => void)({
    code: 'Escape',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
const r = (view: { [key: string]: unknown }) =>
  (view.keydown as (e: unknown) => void)({
    code: 'KeyR',
    repeat: false,
    target: {},
    preventDefault: () => {},
  });
const stepSelect = (view: { [key: string]: unknown }) =>
  (view.stepSelect as (input: object) => void)({});

it('keeps the pause a match was under when the menu changes the fighter', () => {
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

it('keeps the pause for a fighter whose art is still loading when the menu closes', () => {
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

it('leaves an unpaused match unpaused across a menu change', () => {
  const { scene, artIn } = boot();
  artIn();
  scene.setModal(true);
  scene.setFighter('zoma');
  scene.setModal(false);
  expect(scene.paused).toBe(false);
});

it('restores the pause when the menu closes without changing anything', () => {
  const { scene } = boot();
  scene.togglePause();
  scene.setModal(true);
  scene.setModal(false);
  expect(scene.paused).toBe(true);
});

it('lets a menu reset unpause, as before', () => {
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

it('drops a menu reset still loading when the character select opens', () => {
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

it('keeps a resume pressed while a menu reset is still loading', () => {
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

it('keeps the finished select up until the match it chose begins', () => {
  const { scene, view, finishLoad } = boot();
  const select = new CharacterSelect();
  view.select = select;
  select.done = ['kiki', 'zoma'];
  stepSelect(view);
  // The pair's art loads while the finished screen stays; dropping it
  // early would leave the old match's frozen frame up through the load.
  expect(view.select).toBe(select);
  expect(view.loading).toBe(true);
  finishLoad();
  expect(view.select).toBeNull();
  expect(scene.match.mode).toBe('practice');
  expect(scene.match.fighters.map((f) => f.who)).toEqual(['kiki', 'zoma']);
});

it('returns to the title on R while a lost story’s continue loads', async () => {
  vi.stubGlobal('HTMLElement', class {});
  const { view, finishLoad } = boot();
  // A story battle lost: matchOver's Continue screen is still loading with
  // no screen up yet.
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', { ...first.battle, flags: 1 }, 0);
  (view.matchOver as () => void)();
  expect(view.loading).toBe(true);
  // R must not replay the finished battle; the title is the way back.
  r(view);
  expect(view.select).toBeInstanceOf(Title);
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve));
  finishLoad();
  expect(view.select).toBeInstanceOf(Title);
});

it('starts free practice on a stage picked over a finished story, not the battle left', () => {
  const { scene, view, artIn } = boot();
  artIn();
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', first.battle, 0);
  // The battle was left for the select screen; the session is over, so a
  // Menu pick can't restart it.
  scene.openSelect();
  scene.setStage('park');
  expect(scene.match.mode).toBe('practice');
  expect(scene.match.battle).toBeNull();
});

it('drops a playing story demo once a menu pick’s match begins', async () => {
  const { scene, view, completes, finishLoad } = boot();
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['shinz', 'shinz'];
  stepSelect(view);
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  finishLoad();
  expect(view.select).toBeInstanceOf(StoryDemo);
  // Vs. CPU in the Menu: the demo stays through the load, then goes with
  // the match start so the story runner can't replace it after.
  scene.reset('cpu');
  expect(view.select).toBeInstanceOf(StoryDemo);
  expect(view.loading).toBe(true);
  finishLoad();
  expect(view.select).toBeNull();
  expect(scene.match.mode).toBe('cpu');
});

it('reports the requested match’s mode while it loads', () => {
  const { scene, statuses } = boot();
  scene.reset('cpu');
  expect(statuses.at(-1)?.mode).toBe('cpu');
  expect(scene.match.mode).toBe('practice');
});

it('keeps the requested mode when a pick lands mid-load', () => {
  const { scene, view, finishLoad } = boot();
  scene.reset('cpu');
  expect(view.loading).toBe(true);
  // A quick follow-up joins the pending Vs. CPU — the practice match it
  // replaces would drop the request back to practice.
  scene.setStage('park');
  finishLoad();
  expect(scene.match.mode).toBe('cpu');
  expect(scene.match.stage).toBe('park');
});

it('keeps the requested mode when a fighter pick lands mid-load', () => {
  const { scene, finishLoad } = boot();
  scene.reset('cpu');
  scene.setFighter('kiki');
  finishLoad();
  expect(scene.match.mode).toBe('cpu');
  expect(scene.match.fighters.map((f) => f.who)).toEqual(['kiki', 'zoma']);
});

it('leaves the next story battle alone on R while it loads', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { view, completes } = boot();
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', first.battle, 0);
  // Its successor is mid-load: replaying the finished battle would skip it.
  const pending = Match.story('ryuko', { ...first.battle }, 0);
  view.wanted = pending;
  r(view);
  expect(view.wanted).toBe(pending);
  expect(completes).toHaveLength(0);
});

it('starts a menu reset over a finished select, not the screen it replays', () => {
  const { scene, view, artIn } = boot();
  artIn();
  // SHIN-Z's story select confirmed: his opening demo starts loading while
  // the finished screen stays.
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['shinz', 'shinz'];
  stepSelect(view);
  expect(view.loading).toBe(true);
  // Vs. CPU picked in the Menu: the demo load drops and the finished select
  // goes with it, so closing the Menu can't replay the story pick.
  scene.reset('cpu');
  expect(view.select).toBeNull();
  expect(view.loading).toBe(false);
  expect(scene.match.mode).toBe('cpu');
});

it('reports free practice once a finished story is left behind', () => {
  vi.stubGlobal('HTMLElement', class {});
  const { scene, view, statuses } = boot();
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', first.battle, 0);
  // The battle kept under a screen that ends the session reports the mode
  // a reset resolves 'story' to, not the finished match's own.
  scene.openSelect();
  expect(statuses.at(-1)?.mode).toBe('practice');
  esc(view);
  expect(view.select).toBeInstanceOf(Title);
  expect(statuses.at(-1)?.mode).toBe('practice');
});

it('keeps reporting story on the story’s own screens and while a battle loads', () => {
  const { scene, view, statuses } = boot();
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', first.battle, 0);
  // The story's 1P select steps back into the runner: session alive.
  view.select = new CharacterSelect(undefined, true);
  (view.report as () => void)();
  expect(statuses.at(-1)?.mode).toBe('story');
  // A story match loading behind any screen reports its own mode.
  scene.openSelect();
  view.wanted = Match.story('ryuko', first.battle, 0);
  (view.report as () => void)();
  expect(statuses.at(-1)?.mode).toBe('story');
});

it('keeps reporting story while a lost battle’s continue screen is up', async () => {
  const { view, statuses, completes, finishLoad } = boot();
  const story = new Story('ryuko');
  const first = story.next();
  if (first.kind !== 'battle') throw new Error('expected a battle');
  view.story = story;
  view.match = Match.story('ryuko', { ...first.battle, flags: 1 }, 0);
  (view.matchOver as () => void)();
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  finishLoad();
  expect(view.select).toBeInstanceOf(Continue);
  expect(statuses.at(-1)?.mode).toBe('story');
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

it('a fighter evicted by unloadPlayers is queued as a pack again', () => {
  const { scene, view, files, finishLoad } = boot();
  scene.setFighter('kiki');
  finishLoad();
  // Ryuko's match starts without Kiki, so its start drops her (unloadPlayers).
  scene.setFighter('ryuko');
  finishLoad();
  expect(view.players.has('kiki')).toBe(false);
  // Kiki's next match queues her pack again.
  scene.setFighter('kiki');
  expect(files.at(-1)).toBeInstanceOf(PackFile);
  expect(files.at(-1)?.key).toBe('fighter-kiki');
});

it("the first match queues the boot stage's pack as already resident", () => {
  const { scene, view, files } = boot();
  // preload loaded the boot stage's art (court), so its first texture is in.
  const first = `court-${STAGES.court.images[0].index}`;
  (view.textures as { exists(key: string): boolean }).exists = (key) =>
    key === first;
  scene.reset('practice');
  const pack = files.find((file) => file.key === 'stage-court');
  expect(pack).toBeInstanceOf(PackFile);
  expect(pack?.hasCacheConflict()).toBe(true);
});

it('a demo with no files queues no pack and still opens', async () => {
  const { view, files, completes, finishLoad } = boot();
  // Demo 29 exports no images or sounds.
  (view.openDemo as (index: number, make: (demo: Demo) => StoryDemo) => void)(
    29,
    (demo) => new StoryDemo(29, demo),
  );
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  expect(files).toHaveLength(0);
  finishLoad();
  expect(view.select).toBeInstanceOf(StoryDemo);
  expect(view.loading).toBe(false);
});

// The packs on disk, by name (the .bin files, as packs.test.ts reads them).
const PACKS = new URL('../../public/assets/packs/', import.meta.url);
const packNames = () =>
  readdirSync(PACKS)
    .filter((name) => name.endsWith('.bin'))
    .map((name) => name.slice(0, -'.bin'.length));
// A pack's cache keys, its images and sounds, read from its own header.
const packKeys = (name: string) => {
  const pack = parsePack(
    new Uint8Array(readFileSync(new URL(`${name}.bin`, PACKS))).buffer,
  );
  return [...Object.keys(pack.images), ...Object.keys(pack.sounds)];
};
// Each generated demo's data, to know which demos have a pack.
const demos = import.meta.glob<{
  default: { images: unknown[]; sounds: unknown[] };
}>('./generated/demos/*.json', { eager: true });

itWithArt(
  'queues every pack on disk, and each pack resident only once its own keys are cached',
  async () => {
    const { view, files } = boot();
    // The cache holds boot's keys, then each pack's as it is added.
    const cached = new Set(packKeys('boot'));
    (view.textures as { exists(key: string): boolean }).exists = (key) =>
      cached.has(key);
    const audio = (view.cache as { audio: { exists(key: string): boolean } })
      .audio;
    audio.exists = (key) => cached.has(key);
    for (const who of Object.keys(CHARACTERS) as Who[])
      (view.loadPlayer as (who: Who) => void)(who);
    for (const stage of Object.keys(STAGES) as Stage[])
      (view.loadStage as (stage: Stage) => void)(stage);
    // Each demo's file lands before the next, since a newer openDemo
    // supersedes a pending one.
    for (const [path, { default: demo }] of Object.entries(demos)) {
      if (!demo.images.length && !demo.sounds.length) continue;
      const n = Number(path.replace(/^.*\/|\.json$/g, ''));
      (
        view.openDemo as (
          index: number,
          make: (demo: Demo) => StoryDemo,
        ) => void
      )(n, (d) => new StoryDemo(n, d));
      await vi.waitFor(() => expect(files.at(-1)?.key).toBe(`demo-${n}`));
    }
    expect(files.map((file) => file.key).sort()).toEqual(
      packNames()
        .filter((name) => name !== 'boot')
        .sort(),
    );
    for (const file of files) {
      expect(file.hasCacheConflict(), file.key).toBe(false);
      for (const key of packKeys(file.key)) cached.add(key);
      expect(file.hasCacheConflict(), file.key).toBe(true);
    }
  },
);

it('preload queues the stage pack, then boot, and boot is resident once its text is in', () => {
  const { scene, view, files } = boot();
  scene.preload();
  const stage = view.stage as Stage;
  expect(files.map((file) => file.key)).toEqual([`stage-${stage}`, 'boot']);
  const bootFile = files.find((file) => file.key === 'boot');
  expect(bootFile?.hasCacheConflict()).toBe(false);
  (view.textures as { exists(key: string): boolean }).exists = (key) =>
    key === 'text';
  expect(bootFile?.hasCacheConflict()).toBe(true);
});
