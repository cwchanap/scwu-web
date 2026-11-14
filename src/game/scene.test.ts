import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { CHARACTERS, lifeOf, STAGES } from './characters';
import type { Stage, Who } from './characters';
import { DEFAULT_CHEATS } from './cheats';
import type { CheatOptions } from './cheats';
import { Match, LIFE } from './match';
import { parsePack } from './packs';
import {
  CharacterSelect,
  Continue,
  ModeSelect,
  StoryDemo,
  Title,
} from './select';
import type { Demo } from './select';
import { scenarioOf, Story } from './story';
import type { Battle } from './story';
import type { GameStatus } from './scene';
import { PackFile } from './packLoader';
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
      get: () => ({ has: () => true, add: () => {} }),
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

// HPA-767's cheats in the scene: the pending values, the begin snapshot and
// the run's cheated mark.
describe('cheats (HPA-767)', () => {
  const cheats = (fields: Partial<CheatOptions> = {}): CheatOptions => ({
    ...DEFAULT_CHEATS,
    ...fields,
  });

  it('seats the pending cheats as the battle’s snapshot at begin only', () => {
    const { scene, artIn } = boot();
    artIn();
    scene.setCheats(cheats({ enabled: true, playerHpMultiplier: 2 }));
    // The match a reset replaces stays native until its begin.
    expect(scene.match.cheats.enabled).toBe(false);
    expect(scene.match.fighters[0].maxHp).toBe(510);
    scene.reset('practice');
    expect(scene.match.cheats.enabled).toBe(true);
    expect(scene.match.fighters[0].maxHp).toBe(1020);
    expect(scene.match.fighters[0].hp).toBe(1020);
    expect(scene.match.fighters[1].maxHp).toBe(490);
    // A switch flipped after begin cannot change the begun battle.
    scene.setCheats(cheats());
    expect(scene.match.cheats.enabled).toBe(true);
    expect(scene.match.fighters[0].maxHp).toBe(1020);
  });

  it('applies a switch changed during a pending load to the upcoming battle', () => {
    const { scene, finishLoad } = boot();
    scene.reset('practice');
    scene.setCheats(cheats({ enabled: true, playerHpMultiplier: 3 }));
    finishLoad();
    expect(scene.match.cheats.playerHpMultiplier).toBe(3);
    expect(scene.match.fighters[0].maxHp).toBe(1530);
  });

  it('marks a cheated run and resets it on a new non-story match', () => {
    const { scene, artIn, statuses } = boot();
    artIn();
    scene.setCheats(cheats({ enabled: true }));
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    // A clean match afterwards starts a fresh, unmarked run.
    scene.setCheats(cheats());
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(false);
  });

  it('ORs every story battle into the run mark and keeps it through the title', () => {
    const { scene, view, artIn, statuses } = boot();
    artIn();
    const story = new Story('ryuko');
    const battles: Battle[] = [];
    for (
      let next = story.next(510, 0);
      battles.length < 2;
      next = story.next(510, 0)
    ) {
      if (next.kind === 'battle') battles.push(next.battle);
      else if (next.kind === 'title') throw new Error('route ended early');
    }
    // A cheated battle marks the route...
    scene.setCheats(cheats({ enabled: true }));
    (view.begin as (match: Match) => void)(Match.story('ryuko', battles[0], 0));
    expect(statuses.at(-1)?.cheated).toBe(true);
    // ...and a later clean battle does not clear the mark.
    scene.setCheats(cheats());
    (view.begin as (match: Match) => void)(Match.story('ryuko', battles[1], 0));
    expect(scene.match.cheats.enabled).toBe(false);
    expect(statuses.at(-1)?.cheated).toBe(true);
    // The title keeps the finished route's mark for HPA-771 to read.
    (view.openTitle as () => void)();
    expect(view.select).toBeInstanceOf(Title);
    expect(statuses.at(-1)?.cheated).toBe(true);
  });

  it('resets the run mark when a story route is picked', async () => {
    const { scene, view, artIn, statuses, completes, finishLoad } = boot();
    artIn();
    scene.setCheats(cheats({ enabled: true }));
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    // Picking a story route starts a fresh run, clean while cheats are
    // off. An eligible pick (Ryuko's) goes through the mode select first
    // (HPA-765); the pick alone keeps the old run's mark.
    scene.setCheats(cheats());
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['ryuko', 'ryuko'];
    stepSelect(view);
    const mode = view.select as ModeSelect;
    expect(mode).toBeInstanceOf(ModeSelect);
    expect(statuses.at(-1)?.cheated).toBe(true);
    mode.stage = 1;
    mode.done = 'br-zero';
    stepSelect(view);
    await vi.waitFor(() => expect(completes).toHaveLength(1));
    finishLoad();
    expect(view.select).toBeInstanceOf(StoryDemo);
    expect(statuses.at(-1)?.cheated).toBe(false);
  });

  it('reports life and hp at the effective maximum', () => {
    const { scene, artIn, statuses } = boot();
    artIn();
    scene.setCheats(
      cheats({ enabled: true, playerHpMultiplier: 2, enemyHpMultiplier: 0.5 }),
    );
    scene.reset('practice');
    expect(statuses.at(-1)?.hp).toEqual([1020, 245]);
    expect(statuses.at(-1)?.life).toEqual([1020, 245]);
  });

  it('divides the world life bars by the effective maximum', () => {
    const { view, artIn } = boot();
    artIn();
    // A graphics recorder for drawLifeBars, and an anything-image for the
    // digit pool it grows.
    const drawn: {
      color: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    let color = 0;
    const graphics = {
      clear: () => {},
      fillStyle: (next: number) => (color = next),
      fillRect: (x: number, y: number, w: number, h: number) =>
        void drawn.push({ color, x, y, w, h }),
      setScrollFactor: () => graphics,
      setDepth: () => graphics,
    };
    const anySprite = new Proxy(
      {},
      {
        get: (_target, prop) => (prop === 'then' ? undefined : () => anySprite),
      },
    ) as unknown as Phaser.GameObjects.Image;
    view.add = { graphics: () => graphics, image: () => anySprite };
    // Ryuko's first story battle, its slot-0 seat (fighters[1]: the 1P's
    // own slot is null) given a life bar.
    const first = scenarioOf('ryuko')[0] as Battle;
    const match = Match.story(
      'ryuko',
      {
        ...first,
        slots: [
          { ...first.slots[0]!, flags: 1 },
          null,
          null,
          null,
          null,
          null,
          null,
        ],
      },
      0,
    );
    match.useCheats(cheats({ enabled: true, enemyHpMultiplier: 0.5 }));
    while (!match.lifeBars.length) match.step();
    const bar = match.lifeBars[0];
    bar.hp = 50;
    view.match = match;
    (view.drawLifeBars as () => void)();
    const backing = drawn.find((r) => r.color === 0 && r.h === 15)!;
    const green = drawn.find((r) => r.color === 0x00ff00)!;
    // The green row is 25 of the bar's 50 source pixels — half life against
    // the halved maximum, where the native maximum would fill all 50
    // (1.5× art scale, ±1px for the two rounded edges).
    expect(green.h).toBe(12);
    expect(backing.w - green.w).toBeGreaterThanOrEqual(37);
    expect(backing.w - green.w).toBeLessThanOrEqual(38);
  });

  it('reads the story route from the 1P’s native-equivalent life', async () => {
    // The runner’s jump values (Ryuko’s 162, 163 and 250) are native life:
    // matchOver converts the 1P’s ending life back to native units before
    // handing it to Story.next, so a scaled maximum keeps all four route
    // choices — including the tightly spaced 162/163 pair — where reading
    // the scaled life directly collapses them (HPA-767).
    const native = (life: number) => {
      const story = new Story('ryuko');
      story.next();
      const next = story.next(life, 0);
      return next.kind === 'battle'
        ? { kind: next.kind, battle: next.battle }
        : next;
    };
    const route = async (multiplier: number, hp: number) => {
      const { view, artIn, completes, finishLoad } = boot();
      artIn();
      const story = new Story('ryuko');
      const first = story.next();
      if (first.kind !== 'battle') throw new Error('expected a battle');
      view.story = story;
      const match = Match.story('ryuko', first.battle, 0);
      match.useCheats(
        cheats({ enabled: true, playerHpMultiplier: multiplier }),
      );
      match.wins = [1, 0];
      match.fighters[0].hp = hp;
      view.match = match;
      (view.matchOver as () => void)();
      if (view.wanted)
        return {
          kind: 'battle' as const,
          battle: (view.wanted as Match).battle,
        };
      await vi.waitFor(() => expect(completes).toHaveLength(1));
      finishLoad();
      return { kind: 'demo' as const, demo: (view.select as StoryDemo).index };
    };
    // ×0.5 (maximum 255): 81 and 80 scaled read as native 162 and 160 —
    // the tight pair’s lower edge and the route below it; 82 and 125 land
    // in the middle and top bands.
    expect(await route(0.5, 81)).toEqual(native(162));
    expect(await route(0.5, 80)).toEqual(native(160));
    expect(await route(0.5, 82)).toEqual(native(164));
    expect(await route(0.5, 125)).toEqual(native(250));
    // ×2 (maximum 1020): 325 reads as native 162, and 500 keeps the full-
    // life route.
    expect(await route(2, 325)).toEqual(native(162));
    expect(await route(2, 300)).toEqual(native(150));
    expect(await route(2, 500)).toEqual(native(250));
  });

  it('gives the idle interpreter the seat’s life and both maxima in scaled units', () => {
    const { scene, view, artIn } = boot();
    artIn();
    scene.setCheats(cheats({ enabled: true, playerHpMultiplier: 2 }));
    scene.reset('practice');
    // begin seated the fighters before their idle programs started, so
    // SIN-style op 0x11 marks (standing.ts) read the scaled life against
    // the scaled maximum over the native one.
    const [vm] = view.idle as {
      life: number;
      lifeMax: number;
      lifeNative: number;
    }[];
    expect(vm.life).toBe(1020);
    expect(vm.lifeMax).toBe(1020);
    expect(vm.lifeNative).toBe(LIFE);
  });
});

// HPA-765's quick mode select: the two-step menu an eligible story pick
// opens over the finished select, and its route start through the runner.
describe('mode select (HPA-765)', () => {
  const openMode = (view: { [key: string]: unknown }) => {
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['ryuko', 'ryuko'];
    stepSelect(view);
    return view.select as ModeSelect;
  };

  it('lands each press of a burst one tick would merge (CI stalls)', () => {
    // Under the runner's stalls whole presses queue between ticks: three
    // 'g' taps ahead of the next frame must still arm the title, pick
    // story and pick the fighter — a press is a count, not a bit level.
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('HTMLButtonElement', class {});
    const { view } = boot();
    view.drawSelect = () => {};
    // The title cues its T2 track and the cursor its ticks.
    const silent = { play() {}, stop() {}, pause() {} };
    (view.sound as { get: () => unknown }).get = () => silent;
    (view.sound as { add: () => unknown }).add = () => silent;
    (view as { play?: () => void }).play = () => {};
    const down = (code: string) =>
      (view.keydown as (e: unknown) => void)({
        code,
        repeat: false,
        target: {},
        preventDefault: () => {},
      });
    const up = (code: string) => (view.keyup as (e: unknown) => void)({ code });
    const frame = () => (view.update as (t: number, d: number) => void)(0, 10);
    view.select = new Title();
    frame(); // T2 loads; the menu waits for a press.
    for (let i = 0; i < 3; i++) {
      down('KeyG');
      up('KeyG');
    }
    for (let i = 0; i < 300 && !(view.select instanceof ModeSelect); i++)
      frame();
    expect(view.select).toBeInstanceOf(ModeSelect);
  });

  it('opens the selector on an eligible story pick instead of the sign battle', () => {
    const { view } = boot();
    const mode = openMode(view);
    expect(mode).toBeInstanceOf(ModeSelect);
    expect(mode.background.done).toEqual(['ryuko', 'ryuko']);
    // No Chii match is started and no demo loads yet.
    expect(view.loading).toBe(false);
    expect(view.wanted).toBeUndefined();
    expect(view.story).toBeNull();
    expect(mode.globals).toBe(view.globals);
  });

  it('keeps an excluded story on its direct start', () => {
    const { view } = boot();
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['shinz', 'shinz'];
    stepSelect(view);
    expect(view.select).toBe(select);
    expect(view.loading).toBe(true);
  });

  it('reads a pick key still down at the transition as held, not fresh on its repeat', () => {
    // open() clears held input; before the fix, a pick key still down
    // armed the selector on an empty tick and its next keyboard repeat
    // repopulated held — the held press then looked fresh and confirmed
    // the mode without the key ever coming up (HPA-765 review).
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('HTMLButtonElement', class {});
    const { view } = boot();
    // The frames below need no drawing; the menu's art has its own test.
    view.drawSelect = () => {};
    const down = (code: string, repeat = false) =>
      (view.keydown as (e: unknown) => void)({
        code,
        repeat,
        target: {},
        preventDefault: () => {},
      });
    const up = (code: string) => (view.keyup as (e: unknown) => void)({ code });
    const frame = () => (view.update as (t: number, d: number) => void)(0, 10);

    // The pick press (G = punch) — and a direction — still down as the
    // pick's done lands: the selector opens inside this frame.
    down('KeyG');
    down('ArrowRight');
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['ryuko', 'ryuko'];
    frame();
    const mode = view.select as ModeSelect;
    expect(mode).toBeInstanceOf(ModeSelect);
    const start = mode.choice;

    // The arm frame, then the held keys' repeats with no release: held
    // input is not fresh — it can neither confirm nor move.
    frame();
    down('KeyG', true);
    frame();
    down('ArrowRight', true);
    frame();
    frame();
    expect(mode.stage).toBe(0);
    expect(mode.choice).toBe(start);
    expect(mode.done).toBeNull();

    // A real release and a fresh press confirm the mode.
    up('KeyG');
    up('ArrowRight');
    frame();
    down('KeyG');
    frame();
    expect(mode.stage).toBe(1);
    expect(mode.done).toBeNull();
  });

  it('enters the picked route through the runner with the life its take left', async () => {
    const { view, completes, finishLoad } = boot();
    const mode = openMode(view);
    mode.stage = 1;
    mode.done = 'story-easy';
    stepSelect(view);
    expect(view.loading).toBe(true);
    const story = view.story as Story;
    expect(story.who).toBe('ryuko');
    // Ryuko easy: the runner lands on step 4's demo, the 1P at the native
    // life the skipped Chii battle would have left (510 − 1 − 100).
    expect(story.step).toBe(4);
    expect(view.storyLife).toBe(lifeOf('ryuko') - 1 - 100);
    expect(view.storyLost).toBe(0);
    expect(view.storyHeld).toEqual(mode.background.drawn);
    await vi.waitFor(() => expect(completes).toHaveLength(1));
    finishLoad();
    expect(view.select).toBeInstanceOf(StoryDemo);
  });

  it('resets the run’s cheated mark at the route pick, not the fighter pick', () => {
    const { scene, view, statuses, artIn } = boot();
    artIn();
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true });
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    scene.setCheats({ ...DEFAULT_CHEATS });
    const mode = openMode(view);
    // The fighter pick alone keeps the old run's mark.
    expect(statuses.at(-1)?.cheated).toBe(true);
    mode.stage = 1;
    mode.done = 'br-zero';
    stepSelect(view);
    (view.report as () => void)();
    expect(statuses.at(-1)?.cheated).toBe(false);
  });

  it('reports choosingMode and story mode while the selector carries a story session', () => {
    const { view, statuses } = boot();
    const story = new Story('ryuko');
    const first = story.next();
    if (first.kind !== 'battle') throw new Error('expected a battle');
    view.story = story;
    view.match = Match.story('ryuko', first.battle, 0);
    openMode(view);
    expect(statuses.at(-1)).toMatchObject({
      selecting: true,
      choosingMode: true,
      mode: 'story',
    });
  });

  it('Escape on the mode step reopens the story select; Escape on the route step steps back', () => {
    vi.stubGlobal('HTMLElement', class {});
    const { view } = boot();
    const mode = openMode(view);
    mode.stage = 1;
    esc(view);
    expect(view.select).toBe(mode);
    expect(mode.stage).toBe(0);
    esc(view);
    const select = view.select as CharacterSelect;
    expect(select).toBeInstanceOf(CharacterSelect);
    expect(select.story).toBe(true);
  });

  it('Escape after the route pick cancels the start still loading', async () => {
    vi.stubGlobal('HTMLElement', class {});
    const { view, finishLoad } = boot();
    const mode = openMode(view);
    mode.stage = 1;
    mode.done = 'story-easy';
    stepSelect(view);
    expect(view.loading).toBe(true);
    esc(view);
    expect(view.loading).toBe(false);
    expect(view.select).toBe(mode);
    expect(mode.stage).toBe(0);
    expect(mode.done).toBeNull();
    // The demo's module and art land cancelled: the menu stays.
    await vi.dynamicImportSettled();
    await new Promise((resolve) => setTimeout(resolve));
    finishLoad();
    expect(view.select).toBe(mode);
  });

  it('R on the selector returns to the title', () => {
    vi.stubGlobal('HTMLElement', class {});
    const { view } = boot();
    openMode(view);
    r(view);
    expect(view.select).toBeInstanceOf(Title);
  });

  it('Enter feeds a select press only while the selector is up', () => {
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('HTMLButtonElement', class {});
    const { scene, view } = boot();
    const enter = () =>
      (view.keydown as (e: unknown) => void)({
        code: 'Enter',
        repeat: false,
        target: {},
        preventDefault: () => {},
      });
    scene.openSelect();
    enter();
    expect((view.pressed as Map<string, number>).size).toBe(0);
    openMode(view);
    enter();
    expect((view.pressed as Map<string, number>).has('punch')).toBe(true);
  });

  it('leaves a focused button’s Enter — or one already taken — to the DOM', () => {
    // Tab → Menu → Enter must activate Menu, not confirm the route:
    // the keydown's preventDefault cancels a button's native activation
    // and its punch lands on the selector the same tick (HPA-765 final
    // review). The paused selector's Resume button is the same case.
    vi.stubGlobal('HTMLElement', class {});
    class Button extends (globalThis.HTMLElement as new () => object) {}
    vi.stubGlobal('HTMLButtonElement', Button);
    const { view } = boot();
    openMode(view);
    const down = (target: object, defaultPrevented = false) => {
      let prevented = 0;
      (view.keydown as (e: unknown) => void)({
        code: 'Enter',
        repeat: false,
        target,
        defaultPrevented,
        preventDefault: () => void prevented++,
      });
      return prevented;
    };
    // A focused DOM button keeps Enter's default action and feeds no
    // canvas punch; an event a handler already took is left alone too.
    expect(down(new Button())).toBe(0);
    expect((view.pressed as Map<string, number>).size).toBe(0);
    expect(down({}, true)).toBe(0);
    expect((view.pressed as Map<string, number>).size).toBe(0);
    // The canvas's own Enter still confirms.
    expect(down({})).toBe(1);
    expect((view.pressed as Map<string, number>).has('punch')).toBe(true);
  });

  it('keeps the finished select’s track across the overlay, as Music allows', () => {
    // open()'s stopAll silenced the select screen's track for good — the
    // selector sat silent even with Music ticked (HPA-765 final review).
    const { view } = boot();
    const track = { stop: () => {}, play: vi.fn(), pause: () => {} };
    view.selectTrack = track;
    openMode(view);
    expect(view.selectTrack).toBe(track);
    expect(track.play).toHaveBeenCalledTimes(1);
    // With Music off it stays quiet but keeps the track, so ticking it
    // on later still plays it, as on the select screens.
    view.music = false;
    openMode(view);
    expect(view.selectTrack).toBe(track);
    expect(track.play).toHaveBeenCalledTimes(1);
  });

  it('draws the selector’s player objects in the finished select’s palettes', () => {
    const { view } = boot();
    const mode = openMode(view);
    const background = mode.background;
    // Seat 0's palette (3, J), kept on the finished select.
    background.drawn[0] = 3;
    const textures = view.textures as { exists(key: string): boolean };
    textures.exists = (key) => key === 'ryuko-1@3';
    const calls: (string | undefined)[] = [];
    const sprite = new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (prop === 'then') return undefined;
          return (value?: unknown) => {
            if (prop === 'setTexture') calls.push(value as string);
            return sprite;
          };
        },
      },
    ) as unknown as Phaser.GameObjects.Image;
    const o = {
      container: 'ryuko',
      action: 0,
      pc: 0,
      timer: Infinity,
      frame: {
        pc: 0,
        image: 1,
        duration: 0,
        dx: 0,
        dy: 0,
        flip_x: false,
        flip_y: false,
        ignore_facing: false,
        packed_image: 1,
        extra_bytes: '',
      },
      displayed: true,
      x: 100,
      y: 200,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
      facing: 1 as const,
      z: 0x50,
      color: { mode: 0, r: 0, g: 0, b: 0, fade: 0 },
      locals: {},
      alive: true,
      born: 0,
      owner: 0,
      single: null,
      call: null,
    };
    (
      view.drawSelectObject as (
        sprite: Phaser.GameObjects.Image,
        o: unknown,
        index: number,
      ) => void
    )(sprite, o, 0);
    // Seat 0's palette (3, J) lives on the background's drawn: the object
    // takes its recoloured texture from there, not a palette of its own.
    expect(calls).toContain('ryuko-1@3');
  });

  it('confirms a canvas tap on a board into the same route entry as a key', async () => {
    const { view } = boot();
    const mode = openMode(view);
    mode.step();
    const tap = (x: number, y: number) =>
      (view.tap as (x: number, y: number) => void)(x, y);
    // The left board on each step — STORY, then ROUTE 1 — in the canvas's
    // game pixels lands the same 'story-easy' the button presses land.
    tap(242, 394);
    expect(mode.stage).toBe(1);
    tap(242, 469);
    expect(mode.done).toBe('story-easy');
    stepSelect(view);
    const story = view.story as Story;
    expect(story.step).toBe(4);
    expect(view.storyLife).toBe(lifeOf('ryuko') - 1 - 100);
    await vi.dynamicImportSettled();
  });

  it('reads a canvas tap on the lit board’s drawn box, not a stale rect', () => {
    const { view } = boot();
    const mode = openMode(view);
    mode.step();
    mode.choice = 1;
    mode.step();
    const tap = (x: number, y: number) =>
      (view.tap as (x: number, y: number) => void)(x, y);
    // With B.R. lit its board's pixels reach the pair's gap — but a tap
    // there picks nothing, not STORY under it (review, HPA-765).
    tap(470, 221);
    expect(mode.stage).toBe(0);
    // The board's own drawn edge picks it.
    tap(487, 394);
    expect(mode.stage).toBe(1);
    expect(
      (
        mode.objects.filter(
          (o) => o.alive && o.frame && o.container !== 'kgt',
        )[0].frame as { image: number }
      ).image,
    ).toBe(8006);
  });

  it('ignores canvas taps while the selector is frozen or a load is on', () => {
    const { scene, view } = boot();
    const mode = openMode(view);
    mode.step();
    const tap = (x: number, y: number) =>
      (view.tap as (x: number, y: number) => void)(x, y);
    view.paused = true;
    tap(242, 394);
    view.paused = false;
    scene.setModal(true);
    tap(242, 394);
    scene.setModal(false);
    view.loading = true;
    tap(242, 394);
    view.loading = false;
    expect(mode.stage).toBe(0);
    // Live again, the same tap picks.
    tap(242, 394);
    expect(mode.stage).toBe(1);
  });

  it('drops the selector for a menu reset instead of leaving a stale one', () => {
    const { scene, view, artIn } = boot();
    artIn();
    openMode(view);
    scene.reset('cpu');
    expect(view.select).toBeNull();
    expect(scene.match.mode).toBe('cpu');
  });
});
