import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { CHARACTERS, lifeOf, STAGES } from './characters';
import type { Stage, Who } from './characters';
import { DEFAULT_CHEATS } from './cheats';
import type { CheatOptions } from './cheats';
import { ART_SCALE, Match } from './match';
import type { Fighter } from './match';
import {
  MODE_SELECT_SIGN_KEYS,
  MODE_SELECT_SIGNS,
  parsePack,
  selectAssets,
} from './packs';
import {
  BOSSES,
  CharacterSelect,
  Continue,
  ModeSelect,
  StoryDemo,
  Title,
} from './select';
import type { Demo } from './select';
import { scenarioOf, Story, TAKES } from './story';
import type { Battle } from './story';
import { bossBrAnotherStory, brAnotherStages, brLongStory } from './br-another';
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
  const loadErrors: ((file: { key: string }) => void)[] = [];
  const shutdowns: (() => void)[] = [];
  // The packs the scene queued (boot, stage, fighter and demo), in order.
  const files: PackFile[] = [];
  let cached = false;
  // The resident texture keys a finished fighter pack leaves behind — the
  // first non-select image per fighter, what residentPack probes. A real
  // textures.remove drops them, so an evicted fighter reads non-resident
  // and queues its pack again rather than trusting art that is gone.
  const resident = new Set<string>();
  const residentKey = (who: Who) => {
    const { images } = CHARACTERS[who];
    const select = selectAssets[who];
    const signs = new Set(MODE_SELECT_SIGNS[who] ?? []);
    const rest = images.filter(
      (image) => !select.images.has(image.index) && !signs.has(image.index),
    );
    return `${who}-${rest[0]!.index}`;
  };
  const silent = { play: () => {}, stop: () => {}, pause: () => {} };
  // A chainable game object: every setter returns the object itself, enough
  // for the draw loop to run for real (poses, depths, life bars). Text and
  // position setters record what they were given, so a test can read back
  // drawLifeBars' pooled Damage cut labels.
  const object = () => {
    const o: {
      texture: string;
      text: string;
      x: number;
      y: number;
      visible: boolean;
      [key: string]: unknown;
    } = { texture: '', text: '', x: 0, y: 0, visible: true };
    for (const method of [
      'setTexture',
      'setText',
      'setVisible',
      'setCrop',
      'setX',
      'setPosition',
      'setScrollFactor',
      'setOrigin',
      'setScale',
      'setDepth',
      'setAlpha',
      'setBlendMode',
      'setFlip',
      'setFlipX',
      'clear',
      'fillStyle',
      'fillRect',
    ])
      o[method] = (...args: unknown[]) => {
        if (method === 'setTexture' && typeof args[0] === 'string')
          o.texture = args[0];
        if (method === 'setText' && typeof args[0] === 'string')
          o.text = args[0];
        if (method === 'setVisible') o.visible = !!args[0];
        if (method === 'setPosition') {
          o.x = args[0] as number;
          o.y = args[1] as number;
        }
        return o;
      };
    return o;
  };
  Object.assign(view, {
    sound: {
      pauseAll: () => {},
      resumeAll: () => {},
      stopAll: () => {},
      removeByKey: () => {},
      get: () => silent,
      add: () => silent,
    },
    load: {
      // Stage music is the one individual file left (playMusic).
      audio: () => {},
      addFile: (file: PackFile) => files.push(file),
      on: (event: string, done: (file: { key: string }) => void) => {
        if (event === 'loaderror') loadErrors.push(done);
      },
      once: (_event: string, done: () => void) => void completes.push(done),
      start: () => {},
    },
    textures: {
      exists: (key: string) => cached || resident.has(key),
      get: () => ({ has: () => true, add: () => {} }),
      getTextureKeys: () => [...resident],
      remove: (key: string) => void resident.delete(key),
    },
    children: { list: [] },
    cache: { audio: { exists: () => false, remove: () => {} } },
    add: {
      image: () => object(),
      ellipse: () => object(),
      rectangle: () => object(),
      text: () => object(),
      graphics: () => object(),
    },
    cameras: { main: { setScroll: () => {} } },
    events: {
      once: (_event: string, done: () => void) => void shutdowns.push(done),
      off: (_event: string, done: () => void) => {
        const at = shutdowns.indexOf(done);
        if (at >= 0) shutdowns.splice(at, 1);
      },
    },
  });
  view.ready = true;
  view.select = null;
  return {
    scene,
    view,
    statuses,
    completes,
    loadErrors,
    shutdowns,
    files,
    // The real preload, against the stubs: registers the loaderror handler
    // the way a Phaser boot does and queues the boot and stage packs.
    preload: () => scene.preload(),
    // Every player's art already in, so a match change starts at once.
    artIn: () => {
      cached = true;
      view.players = new Set(Object.keys(CHARACTERS) as Who[]);
    },
    // The fighters' own packs decoded into the caches (resident textures)
    // without seating anyone: what a finished pack load leaves behind.
    packIn: () => {
      for (const who of Object.keys(CHARACTERS) as Who[])
        resident.add(residentKey(who));
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
  // GOLF's story select confirmed: his opening demo (6) starts loading
  // while the select screen stays. A still-excluded non-boss story, since
  // the four bosses open the mode select instead (HPA-858).
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['golf', 'golf'];
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
  select.done = ['golf', 'golf'];
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
  select.done = ['golf', 'golf'];
  stepSelect(view);
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  finishLoad();
  expect(view.select).toBeInstanceOf(StoryDemo);
  expect(view.loading).toBe(false);
});

it('keeps the finished select up until the match it chose begins', () => {
  const { scene, view, packIn, finishLoad } = boot();
  const select = new CharacterSelect();
  view.select = select;
  select.done = ['kiki', 'zoma'];
  stepSelect(view);
  // The pair's art loads while the finished screen stays; dropping it
  // early would leave the old match's frozen frame up through the load.
  expect(view.select).toBe(select);
  expect(view.loading).toBe(true);
  packIn();
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
  const { scene, view, completes, packIn, finishLoad } = boot();
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['golf', 'golf'];
  stepSelect(view);
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  packIn();
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
  const { scene, view, packIn, finishLoad } = boot();
  scene.reset('cpu');
  expect(view.loading).toBe(true);
  // A quick follow-up joins the pending Vs. CPU — the practice match it
  // replaces would drop the request back to practice.
  scene.setStage('park');
  packIn();
  finishLoad();
  expect(scene.match.mode).toBe('cpu');
  expect(scene.match.stage).toBe('park');
});

it('keeps the requested mode when a fighter pick lands mid-load', () => {
  const { scene, packIn, finishLoad } = boot();
  scene.reset('cpu');
  scene.setFighter('kiki');
  packIn();
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
  // GOLF's story select confirmed: his opening demo starts loading while
  // the finished screen stays.
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['golf', 'golf'];
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

it('replays a lost staged battle through Continue on the story’s own held array', async () => {
  const { scene, view, completes, finishLoad, artIn } = boot();
  artIn();
  const textures = view.textures as { exists: (key: string) => boolean };
  const origExists = textures.exists;
  textures.exists = () => true;
  const select = new CharacterSelect(undefined, true);
  view.select = select;
  select.done = ['rario', 'rario'];
  stepSelect(view);
  textures.exists = origExists;
  const mode = view.select as ModeSelect;
  mode.stage = 1;
  mode.done = 'br-another';
  stepSelect(view);
  const story = view.story as Story;
  const held = view.storyHeld as number[];
  story.next();
  story.next();
  const next = story.next();
  if (next.kind !== 'battle') throw new Error('expected a battle');
  (view.runStory as (n: typeof next) => void)(next);
  const first = scene.match;
  expect(first.battle).toBe(next.battle);
  expect(first.held).toBe(held);
  expect(held).toHaveLength(8);
  expect(first.stage).toBe('sakuranight');
  const lineup = first.fighters.map((f) => f.who);
  expect(lineup).toHaveLength(8);
  const one = first.fighters[0];
  one.hp = 1;
  for (let i = 0; i < 200 && !first.fighters[7]?.present; i++) first.step();
  expect(first.fighters[7]?.present).toBe(true);
  expect(held[7]).toBeGreaterThanOrEqual(0);
  one.hp = 0;
  for (let i = 0; i < 1000 && !first.resultReady; i++) first.step();
  expect(first.matchWinner).toBe('opponent');
  const carried = [...held];
  const palettes = first.palettes;
  (view.matchOver as () => void)();
  await vi.waitFor(() => expect(completes).toHaveLength(1));
  finishLoad();
  expect(view.select).toBeInstanceOf(Continue);
  stepSelect(view);
  (view.stepSelect as (input: object) => void)({ kick: true });
  const second = scene.match;
  expect(second).not.toBe(first);
  expect(second.battle).toBe(next.battle);
  expect(second.held).toBe(held);
  expect(second.stage).toBe('sakuranight');
  expect(second.fighters.map((f) => f.who)).toEqual(lineup);
  expect(second.palettes).toEqual(palettes);
  expect(held).toEqual(carried);
  expect(story.step).toBe(47);
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
  const { scene, view, files, packIn, finishLoad } = boot();
  scene.setFighter('kiki');
  packIn();
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
    const doneSelect = new CharacterSelect(undefined, true);
    doneSelect.done = ['ryuko', 'ryuko'];
    (view.openModeSelect as (select: CharacterSelect) => void)(doneSelect);
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
    const { scene, packIn, finishLoad } = boot();
    scene.reset('practice');
    scene.setCheats(cheats({ enabled: true, playerHpMultiplier: 3 }));
    packIn();
    finishLoad();
    expect(scene.match.cheats.playerHpMultiplier).toBe(3);
    expect(scene.match.fighters[0].maxHp).toBe(1530);
  });

  it('reads the No-partner reseating’s palettes at begin, paused start included', () => {
    const { scene, view } = boot();
    // The B.R. ANOTHER stage-2 battle seats its donated ally last, so the
    // No-partner reseat drops the highest native seat — the seating the
    // displayed palettes must read after the snapshot installs.
    const battle = brAnotherStages('masa').stage2!;
    const match = Match.story('masa', battle, 0, undefined, undefined, true);
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true, brNoPartner: true });
    (view.begin as (m: Match, paused?: boolean) => void)(match, true);
    expect(match.cheats.brNoPartner).toBe(true);
    const shown = view as unknown as { palettes: number[] };
    expect(shown.palettes).toEqual(match.palettes);
    expect(shown.palettes).toHaveLength(match.fighters.length);
    expect(match.fighters.length).toBeLessThan(battle.slots.length + 1);
    // The battle began paused and stays paused.
    expect(scene.paused).toBe(true);
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
      cheats({ enabled: true, playerHpMultiplier: 2, enemyHpMultiplier: 2 }),
    );
    scene.reset('practice');
    expect(statuses.at(-1)?.hp).toEqual([1020, 980]);
    expect(statuses.at(-1)?.life).toEqual([1020, 980]);
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
    view.add = {
      graphics: () => graphics,
      image: () => anySprite,
      text: () => anySprite,
    };
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
    match.useCheats(cheats({ enabled: true, enemyHpMultiplier: 2 }));
    while (!match.lifeBars.length) match.step();
    const bar = match.lifeBars[0];
    bar.hp = 200;
    view.match = match;
    (view.drawLifeBars as () => void)();
    const backing = drawn.find((r) => r.color === 0 && r.h === 15)!;
    const green = drawn.find((r) => r.color === 0x00ff00)!;
    // The green row is 25 of the bar's 50 source pixels — half life against
    // the doubled maximum, where the native maximum would fill all 50
    // (1.5× art scale, ±1px for the two rounded edges).
    expect(green.h).toBe(12);
    expect(backing.w - green.w).toBeGreaterThanOrEqual(37);
    expect(backing.w - green.w).toBeLessThanOrEqual(38);
  });

  it('marks the arena bars from Match under cheats', () => {
    const { view, artIn } = boot();
    artIn();
    // drawLifeBars' graphics recorder, and the pooled cut labels it grows.
    const drawn: {
      color: number;
      alpha: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    let color = 0;
    let alpha = 1;
    const graphics = {
      clear: () => {},
      fillStyle: (next: number, fade?: number) => {
        color = next;
        alpha = fade ?? 1;
      },
      fillRect: (x: number, y: number, w: number, h: number) =>
        void drawn.push({ color, alpha, x, y, w, h }),
      setScrollFactor: () => graphics,
      setDepth: () => graphics,
    };
    const anySprite = new Proxy(
      {},
      {
        get: (_target, prop) => (prop === 'then' ? undefined : () => anySprite),
      },
    ) as unknown as Phaser.GameObjects.Image;
    const texts: { text: string; x: number; y: number; visible: boolean }[] =
      [];
    const text = () => {
      const t = {
        text: '',
        x: 0,
        y: 0,
        visible: false,
        setText: (value: string) => {
          t.text = value;
          return t;
        },
        setPosition: (x: number, y: number) => {
          t.x = x;
          t.y = y;
          return t;
        },
        setVisible: (v: boolean) => {
          t.visible = v;
          return t;
        },
        setOrigin: () => t,
        setScrollFactor: () => t,
        setDepth: () => t,
      };
      texts.push(t);
      return t;
    };
    view.add = { graphics: () => graphics, image: () => anySprite, text };
    // Ryuko's first story battle, its slot-0 seat (fighters[1]) given a
    // life bar over the enemy seats' ×2 bar.
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
    match.useCheats(cheats({ enabled: true, enemyHpMultiplier: 2 }));
    while (!match.lifeBars.length) match.step();
    const bar = match.lifeBars[0];
    // The seat's ×2 bar: the native 30% line reads 120 of 400, and ZAKU
    // keeps 55% of a loss there.
    bar.hp = 120;
    view.match = match;
    (view.drawLifeBars as () => void)();
    const tick = drawn.find((r) => r.color === 0xffd24a)!;
    const wash = drawn.find((r) => r.color === 0xff3020)!;
    expect(tick).toBeDefined();
    expect(wash).toBeDefined();
    expect(wash.alpha).toBe(0.4);
    // The gold tick stands at the mark's share of the 50-pixel bar (±1px
    // of edge rounding), the wash over the life row.
    const left = Math.round(
      (Math.trunc(bar.bar.x / ART_SCALE) - 25) * ART_SCALE - match.cameraX,
    );
    const markShare = (50 * match.lifeLineMark(bar)) / bar.maxHp;
    expect(
      Math.abs(tick.x + tick.w / 2 - (left + markShare * ART_SCALE)),
    ).toBeLessThanOrEqual(2);
    const cut = texts[0]!;
    expect(cut.visible).toBe(true);
    expect(cut.text).toBe('Damage cut: 45%');
    expect(cut.x).toBeGreaterThanOrEqual(0);
    expect(cut.x).toBeLessThanOrEqual(960);
    expect(cut.y).toBeGreaterThanOrEqual(0);
    expect(cut.y).toBeLessThanOrEqual(720);
    // One point above the line the wash clears; the tick and label stay.
    drawn.length = 0;
    bar.hp = 121;
    (view.drawLifeBars as () => void)();
    expect(drawn.some((r) => r.color === 0xff3020)).toBe(false);
    expect(drawn.some((r) => r.color === 0xffd24a)).toBe(true);
    expect(texts[0]!.text).toBe('Damage cut: 45%');
    // And a bar far past the canvas clamps its label inside [0,960] ×
    // [0,720].
    bar.bar.x = 9000;
    bar.hp = 120;
    (view.drawLifeBars as () => void)();
    expect(texts[texts.length - 1]!.x).toBe(960);
    expect(texts[texts.length - 1]!.visible).toBe(true);
  });

  it('leaves the arena bars native with cheats off', () => {
    const { view, artIn } = boot();
    artIn();
    const drawn: { color: number }[] = [];
    let color = 0;
    const graphics = {
      clear: () => {},
      fillStyle: (next: number) => (color = next),
      fillRect: () => void drawn.push({ color }),
      setScrollFactor: () => graphics,
      setDepth: () => graphics,
    };
    const anySprite = new Proxy(
      {},
      {
        get: (_target, prop) => (prop === 'then' ? undefined : () => anySprite),
      },
    ) as unknown as Phaser.GameObjects.Image;
    const texts: unknown[] = [];
    view.add = {
      graphics: () => graphics,
      image: () => anySprite,
      text: () => {
        const t = {};
        texts.push(t);
        return t;
      },
    };
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
    while (!match.lifeBars.length) match.step();
    view.match = match;
    (view.drawLifeBars as () => void)();
    expect(
      drawn.some((r) => r.color === 0xffd24a || r.color === 0xff3020),
    ).toBe(false);
    expect(texts).toHaveLength(0);
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
    // ×4 (maximum 2040): 648 and 640 scaled read as native 162 and 160 —
    // the tight pair's lower edge and the route below it; 656 and 1000 land
    // in the middle and top bands.
    expect(await route(4, 648)).toEqual(native(162));
    expect(await route(4, 640)).toEqual(native(160));
    expect(await route(4, 656)).toEqual(native(164));
    expect(await route(4, 1000)).toEqual(native(250));
    // ×2 (maximum 1020): 325 reads as native 162, and 500 keeps the full-
    // life route.
    expect(await route(2, 325)).toEqual(native(162));
    expect(await route(2, 300)).toEqual(native(150));
    expect(await route(2, 500)).toEqual(native(250));
  });

  it('gives the idle interpreter the seat’s life, maxima and Low HP line before its first tick', () => {
    const { scene, view, artIn } = boot();
    artIn();
    scene.setCheats(
      cheats({ enabled: true, playerHpMultiplier: 2, lowHpLine: 100 }),
    );
    scene.setFighter('sou');
    // begin seated the fighters and set every seat's lifeLine before
    // resetIdle ticked their idle programs, so SOU's first-tick op 0x11
    // check (PC 8) already sees the 100% line on both seats.
    const [vm, opponentVm] = view.idle as {
      life: number;
      lifeMax: number;
      lifeNative: number;
      lifeLine: number;
      events: { image: number }[];
      tick(): void;
    }[];
    expect(vm.life).toBe(960);
    expect(vm.lifeMax).toBe(960);
    expect(vm.lifeNative).toBe(lifeOf('sou'));
    expect(vm.lifeLine).toBe(100);
    expect(opponentVm.lifeLine).toBe(100);
    for (let t = 0; t < 40; t++) vm.tick();
    expect(vm.events.some((e) => e.image === 360)).toBe(true);
  });
});

// HPA-765's quick mode select: the two-step menu an eligible story pick
// opens over the finished select, and its route start through the runner.
describe('mode select (HPA-765)', () => {
  const openMode = (view: { [key: string]: unknown }) => {
    const textures = view.textures as { exists: (key: string) => boolean };
    const origExists = textures.exists;
    textures.exists = () => true;
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['ryuko', 'ryuko'];
    stepSelect(view);
    textures.exists = origExists;
    return view.select as ModeSelect;
  };

  it('lands each press of a burst without merging, and drops presses across open()', () => {
    // Under stalls whole presses queue between ticks: two 'g' taps queued
    // ahead of a frame on an armed ModeSelect must pick the mode and then
    // the route across ticks — a press is a count, not a bit level.
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('HTMLButtonElement', class {});
    const { view, finishLoad } = boot();
    view.drawSelect = () => {};
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

    // Pressing before a screen transition opens must not leak onto the
    // new screen's first tick: open() clears queued presses.
    view.select = new Title();
    frame();
    down('KeyG');
    up('KeyG');
    (view.open as (s: unknown) => void)(new CharacterSelect(undefined, true));
    expect((view.pressed as Map<string, number>).size).toBe(0);
    frame();
    expect((view.select as CharacterSelect).decided).toEqual([false, false]);

    // On an armed ModeSelect, two queued 'g' presses step mode then route
    // across released ticks rather than collapsing into one hold.
    const mode = openMode(view);
    frame(); // arm tick
    down('KeyG');
    up('KeyG');
    down('KeyG');
    up('KeyG');
    for (let i = 0; i < 20 && !mode.done; i++) frame();
    expect(mode.done).toBeTruthy();
    finishLoad();
  });

  it('takes a held pad’s repeated downs as one press, not a burst', () => {
    // A focused pad button's keydown fires on every auto-repeat, each a
    // control(..., true) with no up between. Counted, they would pulse a
    // fresh edge apiece and walk the mode pick straight through the route
    // step — a down still held is the same press.
    const { view } = boot();
    view.drawSelect = () => {};
    const silent = { play() {}, stop() {}, pause() {} };
    (view.sound as { get: () => unknown }).get = () => silent;
    (view.sound as { add: () => unknown }).add = () => silent;
    const mode = openMode(view);
    const frame = () => (view.update as (t: number, d: number) => void)(0, 10);
    const press = () =>
      (view.control as (control: string, down: boolean) => void)('punch', true);
    frame(); // the arm tick: the pick's button can't also choose
    for (let i = 0; i < 20; i++) {
      press();
      frame();
    }
    // The one real edge picks the mode; the held level latches the route
    // step, which phantom presses would have confirmed too.
    expect(mode.stage).toBe(1);
    expect(mode.done).toBeNull();
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
    // GOLF opens no mode select and starts his story directly (HPA-858:
    // only the 34 regular Chii openers and the four bosses take the
    // selector).
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['golf', 'golf'];
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
    const { view, artIn } = boot();
    artIn();
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

  it('reports story mode without an extra choosingMode flag while selecting', () => {
    const { view, statuses } = boot();
    const story = new Story('ryuko');
    const first = story.next();
    if (first.kind !== 'battle') throw new Error('expected a battle');
    view.story = story;
    view.match = Match.story('ryuko', first.battle, 0);
    openMode(view);
    const last = statuses.at(-1)!;
    expect(last).toMatchObject({
      selecting: true,
      mode: 'story',
    });
    expect('choosingMode' in last).toBe(false);
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

  it('keeps the finished select’s track running across the overlay without stopping or restarting it', () => {
    const { view } = boot();
    const stopAll = vi.fn();
    (view.sound as { stopAll: () => void }).stopAll = stopAll;
    const track = { stop: vi.fn(), play: vi.fn(), pause: () => {} };
    view.selectTrack = track;
    openMode(view);
    expect(view.selectTrack).toBe(track);
    expect(stopAll).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(track.play).not.toHaveBeenCalled();
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

    // A sign board object has owner -1; drawing it must use palette 0, not
    // look up drawn[-1] -> NaN.
    calls.length = 0;
    textures.exists = (key) => key === 'zaku-8001';
    (
      view.drawSelectObject as (
        sprite: Phaser.GameObjects.Image,
        o: unknown,
        index: number,
      ) => void
    )(
      sprite,
      {
        ...o,
        container: 'zaku',
        owner: -1,
        frame: { ...o.frame, image: 8001 },
      },
      1,
    );
    expect(calls).toEqual(['zaku-8001']);
  });

  it('omits the select demo’s closing action 13 overlay while ModeSelect draws', () => {
    const { view } = boot();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    const node = (): Record<string, unknown> => {
      const self: Record<string, unknown> = {
        setOrigin: () => self,
        setScrollFactor: () => self,
        setDepth: () => self,
        setVisible: () => self,
        setScale: () => self,
      };
      return self;
    };
    view.add = { rectangle: node, image: node };
    const select = new CharacterSelect(undefined, true);
    select.step();
    select.step({ punch: true });
    while (!select.done) select.step();
    const overlay = select.objects.find(
      (o) => o.container === 'select' && o.action === 13,
    );
    expect(overlay?.alive && overlay.frame).toBeTruthy();
    view.select = select;
    stepSelect(view);
    const mode = view.select as ModeSelect;
    expect(mode).toBeInstanceOf(ModeSelect);
    mode.step();
    const drawn: { container: string; action: number }[] = [];
    view.drawSelectObject = (
      _sprite: unknown,
      o: { container: string; action: number },
    ) => {
      drawn.push({ container: o.container, action: o.action });
    };
    (view.drawSelect as () => void)();
    expect(drawn.some((o) => o.container === 'select' && o.action === 13)).toBe(
      false,
    );
    expect(drawn.some((o) => o.container === 'select')).toBe(true);
    expect(drawn.some((o) => o.container === 'zaku')).toBe(true);
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
    for (let i = 0; i < 15; i++) mode.step();
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
    // With B.R. lit its board's left edge lies between these two
    // coordinates, so a tap outside it picks nothing.
    tap(494, 394);
    expect(mode.stage).toBe(0);
    // The board's own drawn edge picks it.
    tap(495, 394);
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

  it('guards ModeSelect Escape against frozen state and unrelated loads', () => {
    vi.stubGlobal('HTMLElement', class {});
    const { scene, view } = boot();
    const mode = openMode(view);
    mode.stage = 1;

    // Paused without a modal: Escape unpauses rather than stepping back.
    view.paused = true;
    esc(view);
    expect(view.paused).toBe(false);
    expect(mode.stage).toBe(1);

    // Modal open: Escape does nothing at all.
    scene.setModal(true);
    esc(view);
    expect(view.select).toBe(mode);
    expect(mode.stage).toBe(1);
    scene.setModal(false);

    // An unrelated load in flight on stage 1 is left untouched by Escape.
    const unrelated = { kind: 'practice' };
    view.wanted = unrelated;
    view.loading = true;
    esc(view);
    expect(view.wanted).toBe(unrelated);
    expect(view.loading).toBe(true);
    expect(mode.stage).toBe(1);
  });

  it('keeps a control high while held by another key or touch input', () => {
    vi.stubGlobal('HTMLElement', class {});
    vi.stubGlobal('HTMLButtonElement', class {});
    const { view } = boot();
    const down = (code: string) =>
      (view.keydown as (e: unknown) => void)({
        code,
        repeat: false,
        target: {},
        preventDefault: () => {},
      });
    const up = (code: string) => (view.keyup as (e: unknown) => void)({ code });
    const read = () => (view.controls as () => Set<string>)();

    // Hold ArrowLeft across tick 1, then release & re-tap ArrowLeft while
    // KeyA holds the same 'left' control: because 'left' is still held,
    // consuming/deferring the queued press must not force it low.
    down('ArrowLeft');
    expect(read().has('left')).toBe(true);
    up('ArrowLeft');
    down('KeyA');
    down('ArrowLeft');
    expect(read().has('left')).toBe(true);
    up('KeyA');
    expect(read().has('left')).toBe(true);

    // Touch button held while key queues a press stays continuous too.
    (view.clearInput as () => void)();
    (view.control as (c: string, d: boolean) => void)('left', true);
    expect(read().has('left')).toBe(true);
    down('KeyA');
    up('KeyA');
    down('KeyA');
    expect(read().has('left')).toBe(true);
  });

  it('loads mode-select.bin on demand and unloads its sign textures on leave', () => {
    const { view, files, finishLoad } = boot();
    const loaded = new Set<string>();
    const removed: string[] = [];
    view.textures = {
      exists: (k: string) => loaded.has(k),
      get: () => ({ has: () => true, add: () => {} }),
      getTextureKeys: () => [...loaded],
      remove: (k: string) => {
        loaded.delete(k);
        removed.push(k);
      },
    };
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = ['ryuko', 'ryuko'];
    stepSelect(view);

    // Sign textures were not resident, so mode-select pack loads on demand.
    expect(view.select).toBe(select);
    expect(view.loading).toBe(true);
    expect(files.some((f) => f.key === 'mode-select')).toBe(true);

    for (const k of MODE_SELECT_SIGN_KEYS) loaded.add(k);
    finishLoad();
    expect(view.loading).toBe(false);
    expect(view.select).toBeInstanceOf(ModeSelect);

    // Returning to title unloads every sign texture.
    (view.openTitle as () => void)();
    expect(removed).toEqual([...MODE_SELECT_SIGN_KEYS]);
    expect(loaded.size).toBe(0);
  });
});

// HPA-858: the four bosses join the selector, and each of their signs
// starts its own story path — STORY their default story, B.R. the
// generated route a new Story owns.
describe('mode select (HPA-858 bosses)', () => {
  // A finished story select whose pick is the given fighter, with the
  // selector's sign pack resident, for the menu to sit over.
  const openBossPick = (view: { [key: string]: unknown }, who: Who) => {
    const textures = view.textures as { exists: (key: string) => boolean };
    const origExists = textures.exists;
    textures.exists = () => true;
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = [who, who];
    stepSelect(view);
    textures.exists = origExists;
    return view.select as ModeSelect;
  };

  it('opens the selector for each of the four bosses instead of a direct start', () => {
    const { view } = boot();
    for (const who of BOSSES) {
      const mode = openBossPick(view, who);
      expect(mode).toBeInstanceOf(ModeSelect);
      expect(mode.background.done).toEqual([who, who]);
      // No story starts and no demo loads until a sign confirms.
      expect(view.story).toBeNull();
      expect(view.loading).toBe(false);
      expect(view.wanted).toBeUndefined();
    }
  });

  it('STORY starts each boss’s own default story, on its opening demo', async () => {
    const { view, completes, finishLoad } = boot();
    for (const who of BOSSES) {
      const mode = openBossPick(view, who);
      mode.done = 'story';
      stepSelect(view);
      const story = view.story as Story;
      // The fighter's default story: no route.
      expect(story.who).toBe(who);
      expect(story.route).toBeNull();
      expect(story.br).toBe(false);
      // All four open on their own demo 3.
      expect(story.step).toBe(0);
      await vi.waitFor(() => expect(completes).toHaveLength(1));
      finishLoad();
      expect(view.select).toBeInstanceOf(StoryDemo);
      expect((view.select as StoryDemo).index).toBe(3);
      completes.length = 0;
    }
  });

  it('B.R. starts a boss on the generated route a new Story owns, marked B.R.', () => {
    const { scene, view, artIn, statuses } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true; // the sign pack and stage are resident
    const mode = openBossPick(view, 'shinz');
    mode.done = 'boss-br';
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('boss-br');
    expect(story.br).toBe(true);
    // The generated route's own first battle starts directly: no
    // routeLife take (the generated path has no Chii-sign jumps) and no
    // ordinary story runner call.
    expect(story.step).toBe(0);
    expect(view.storyLife).toBe(0);
    expect(view.storyLost).toBe(0);
    // The battle is on, marked B.R., on Sakura Street with the 1P and its
    // six enemies.
    expect(view.select).toBeNull();
    expect(scene.match.br).toBe(true);
    expect(scene.match.battle).toEqual(bossBrAnotherStory('shinz')[0]);
    expect(scene.match.stage).toBe('sakura');
    expect(scene.match.fighters[0].who).toBe('shinz');
    expect(scene.match.fighters).toHaveLength(7);
    // The route's own hardening seats without cheats: every enemy at the
    // route's ×2 with five stocks, and the run stays unmarked.
    expect(scene.match.cheats).toEqual(DEFAULT_CHEATS);
    expect(statuses.at(-1)?.cheated).toBe(false);
    for (const f of scene.match.fighters.slice(1))
      expect(f, f.who).toMatchObject({
        hp: 2 * lifeOf(f.who),
        maxHp: 2 * lifeOf(f.who),
        maxStock: 5,
      });
  });

  it('marks an ordinary fighter’s B.R. ZERO route B.R. too', async () => {
    const { scene, view, artIn, completes, finishLoad } = boot();
    artIn();
    const mode = openBossPick(view, 'ryuko');
    mode.stage = 1;
    mode.done = 'br-zero';
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('br-zero');
    // Ryuko br-zero: the runner lands on step 47's demo, then the route's
    // battle follows marked B.R.
    expect(view.storyLife).toBe(lifeOf('ryuko') - 1 - TAKES['br-zero']);
    await vi.waitFor(() => expect(completes).toHaveLength(1));
    finishLoad();
    const demo = view.select as StoryDemo;
    expect(demo).toBeInstanceOf(StoryDemo);
    demo.done = true;
    stepSelect(view);
    expect(view.select).toBeNull();
    expect(scene.match.br).toBe(true);
    expect(scene.match.fighters[0].who).toBe('ryuko');
  });

  it('keeps an ordinary route’s battles unmarked', async () => {
    const { scene, view, artIn, completes, finishLoad } = boot();
    artIn();
    const mode = openBossPick(view, 'ryuko');
    mode.stage = 1;
    mode.done = 'story-easy';
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('story-easy');
    await vi.waitFor(() => expect(completes).toHaveLength(1));
    finishLoad();
    const demo = view.select as StoryDemo;
    demo.done = true;
    stepSelect(view);
    expect(scene.match.br).toBe(false);
  });

  it('practice matches stay unmarked', () => {
    const { scene, artIn } = boot();
    artIn();
    scene.reset('practice');
    expect(scene.match.br).toBe(false);
  });

  it('Escape over a stage-0 boss confirmation cancels the pending battle load and restores the cheated mark', async () => {
    vi.stubGlobal('HTMLElement', class {});
    const { scene, view, artIn, statuses, finishLoad } = boot();
    artIn();
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true });
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    scene.setCheats({ ...DEFAULT_CHEATS });

    const mode = openBossPick(view, 'shinz');
    mode.done = 'boss-br';
    stepSelect(view);
    // The generated battle's stage and fighters load while the selector
    // stays up.
    expect(view.loading).toBe(true);
    expect(view.select).toBe(mode);
    esc(view);
    // The cancelled pick steps back to the mode sign, still at stage 0,
    // and keeps the previous run's cheated mark since no new run started.
    expect(view.loading).toBe(false);
    expect(view.select).toBe(mode);
    expect(mode.stage).toBe(0);
    expect(mode.done).toBeNull();
    expect(statuses.at(-1)?.cheated).toBe(true);
    // The load lands cancelled: no battle starts, the pick is not replayed.
    finishLoad();
    expect(view.select).toBe(mode);
    expect(view.wanted).toBeUndefined();
    expect(scene.match.mode).toBe('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
  });

  it('Escape over a regular route load restores the cheated mark too', () => {
    vi.stubGlobal('HTMLElement', class {});
    const { scene, view, artIn, statuses, finishLoad } = boot();
    artIn();
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true });
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    scene.setCheats({ ...DEFAULT_CHEATS });

    const mode = openBossPick(view, 'ryuko');
    mode.stage = 1;
    mode.done = 'br-zero';
    stepSelect(view);
    expect(view.loading).toBe(true);
    esc(view);
    expect(view.loading).toBe(false);
    expect(statuses.at(-1)?.cheated).toBe(true);
    finishLoad();
    expect(statuses.at(-1)?.cheated).toBe(true);
  });
});

// HPA-1251: the generated B.R. LONG route through the selector — the real
// select → scene → Story → Match path keeps the route marker, Story.br and
// the HPA-972 no-partner behavior.
describe('mode select (HPA-1251 LONG route)', () => {
  // A finished story select whose pick is the given fighter, with the
  // selector's sign pack resident, for the menu to sit over.
  const openPick = (view: { [key: string]: unknown }, who: Who) => {
    const textures = view.textures as { exists: (key: string) => boolean };
    const origExists = textures.exists;
    textures.exists = () => true;
    const select = new CharacterSelect(undefined, true);
    view.select = select;
    select.done = [who, who];
    stepSelect(view);
    textures.exists = origExists;
    return view.select as ModeSelect;
  };
  // Keyboard to B.R.'s route step and onto its index-th board: each press
  // waits a release tick first — a press is a fresh edge — and the walk
  // wraps so any remembered cursor lands there.
  const confirmRoute = (mode: ModeSelect, index: number) => {
    mode.step(); // the arm tick
    mode.choice = 1;
    mode.step({});
    mode.step({ punch: true });
    expect(mode.stage).toBe(1);
    for (let i = 0; i < 4 && mode.choice !== index; i++) {
      mode.step({});
      mode.step({ right: true });
    }
    expect(mode.choice).toBe(index);
    mode.step({});
    mode.step({ punch: true });
  };
  // The sign's drawn box, read off its object as the sprite draws it.
  const boxOf = (o: { x: number; y: number; scale?: number }) => {
    const s = o.scale ?? 1;
    return {
      x: (o.x - 130) * 1.5,
      y: (o.y - 204) * 1.5,
      w: 390 * s,
      h: 306 * s,
    };
  };

  it('carries a keyboard LONG pick through Story into a B.R. match with its Dora ally', () => {
    const { scene, view, artIn } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true; // the sign pack and stage are resident
    const mode = openPick(view, 'ryuko');
    confirmRoute(mode, 2); // ZERO, ANOTHER, LONG
    expect(mode.done).toBe('br-long');
    stepSelect(view);
    const story = view.story as Story;
    // The generated route a fresh Story owns, marked B.R. from the pick.
    expect(story.who).toBe('ryuko');
    expect(story.route).toBe('br-long');
    expect(story.br).toBe(true);
    // It starts straight in — no routeLife take, no Chii-sign jumps.
    expect(story.step).toBe(0);
    expect(view.storyLife).toBe(0);
    expect(view.storyLost).toBe(0);
    // The route's first battle is on: Sakura Street, marked B.R., with
    // the 1P, its twelve enemies and the first-tick Dora ally (14 seats).
    expect(view.select).toBeNull();
    expect(scene.match.br).toBe(true);
    expect(scene.match.battle).toEqual(brLongStory('ryuko')[0]);
    expect(scene.match.stage).toBe('sakura');
    expect(scene.match.fighters).toHaveLength(14);
    expect(scene.match.fighters.at(-1)?.who).toBe('dora');
    expect(scene.match.fighters.at(-1)?.present).toBe(true);
  });

  it('a lost LONG battle runs the scene’s Continue into an identical retry, the route kept', async () => {
    const { scene, view, artIn, completes, finishLoad } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    const mode = openPick(view, 'ryuko');
    confirmRoute(mode, 2);
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('br-long');
    const first = scene.match;
    // The 1P falls: the battle's Continue flag (bit 0) opens the screen.
    first.fighters[0]!.hp = 0;
    for (let i = 0; i < 4000 && !first.resultReady; i++) first.step();
    (view.matchOver as () => void)();
    await vi.waitFor(() => expect(completes).toHaveLength(1));
    finishLoad();
    expect(view.select).toBeInstanceOf(Continue);
    // YES replays the same battle through the runner, still on the route.
    stepSelect(view); // the arm tick
    (view.stepSelect as (input: object) => void)({ kick: true });
    const second = scene.match;
    expect(second).not.toBe(first);
    expect(second.battle).toEqual(brLongStory('ryuko')[0]);
    expect(second.fighters).toHaveLength(14);
    expect(second.fighters.at(-1)?.who).toBe('dora');
    expect(story.route).toBe('br-long');
  });

  it('the HPA-972 no-partner cheat drops the ally from the LONG match', () => {
    const { scene, view, artIn } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true, brNoPartner: true });
    const mode = openPick(view, 'ryuko');
    confirmRoute(mode, 2);
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('br-long');
    expect(story.br).toBe(true);
    expect(scene.match.br).toBe(true);
    expect(scene.match.fighters).toHaveLength(13);
    expect(scene.match.fighters.map((f) => f.who)).not.toContain('dora');
  });

  it('a boss’s LONG pick starts the generated route a fresh Story owns', () => {
    const { scene, view, artIn } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    const mode = openPick(view, 'shinz');
    confirmRoute(mode, 1); // ANOTHER, LONG
    expect(mode.done).toBe('br-long');
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('br-long');
    expect(story.br).toBe(true);
    expect(scene.match.br).toBe(true);
    expect(scene.match.battle).toEqual(brLongStory('shinz')[0]);
    // No ally: thirteen native seats, the twelve tough hostiles.
    expect(scene.match.fighters).toHaveLength(13);
    expect(scene.match.fighters.map((f) => f.who)).not.toContain('dora');
    for (const f of scene.match.fighters.slice(1))
      expect(f, f.who).toMatchObject({ maxStock: 5 });
  });

  it('a tap on the blank LONG board starts the route (touch)', () => {
    const { scene, view, artIn } = boot();
    artIn();
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    const mode = openPick(view, 'ryuko');
    mode.step(); // the arm tick
    mode.choice = 1;
    mode.step({});
    mode.step({ punch: true }); // B.R.'s three boards
    const long = (
      mode.objects.filter(
        (o) => o.alive && o.frame && o.container !== 'kgt',
      ) as { x: number; y: number; scale?: number }[]
    ).map(boxOf)[2];
    expect(mode.tap(long.x + 1, long.y + 1)).toBe(true);
    expect(mode.done).toBe('br-long');
    stepSelect(view);
    const story = view.story as Story;
    expect(story.route).toBe('br-long');
    expect(story.br).toBe(true);
    expect(scene.match.br).toBe(true);
  });

  it('Escape backs the boss B.R. route step out and cancels its start', () => {
    vi.stubGlobal('HTMLElement', class {});
    const { scene, view, artIn, statuses, finishLoad } = boot();
    artIn();
    scene.setCheats({ ...DEFAULT_CHEATS, enabled: true });
    scene.reset('practice');
    expect(statuses.at(-1)?.cheated).toBe(true);
    scene.setCheats({ ...DEFAULT_CHEATS });
    const textures = view.textures as { exists: (key: string) => boolean };
    textures.exists = () => true;
    const mode = openPick(view, 'zenka');
    mode.step();
    mode.choice = 1;
    mode.step({});
    mode.step({ punch: true });
    expect([mode.stage, mode.done]).toEqual([1, null]);
    esc(view);
    expect([mode.stage, mode.done, mode.choice]).toEqual([0, null, 1]);
    // The same sign reopens the route step; confirm the generated
    // ANOTHER route there, then cancel it while loading.
    mode.step({});
    mode.step({ punch: true });
    expect([mode.stage, mode.done]).toEqual([1, null]);
    mode.choice = 0;
    mode.step({});
    mode.step({ punch: true });
    expect(mode.done).toBe('boss-br');
    stepSelect(view);
    expect(view.loading).toBe(true);
    esc(view);
    expect(view.loading).toBe(false);
    expect(view.select).toBe(mode);
    expect(mode.stage).toBe(0);
    expect(mode.done).toBeNull();
    expect(statuses.at(-1)?.cheated).toBe(true);
    finishLoad();
    expect(view.select).toBe(mode);
    expect(view.wanted).toBeUndefined();
  });
});

describe('scene summon (HPA-972)', () => {
  const idleOf = (scene: TrainingScene, index: number) =>
    (scene as unknown as { idle: { frame: unknown; seed: number }[] }).idle[
      index
    ];
  const state = (scene: TrainingScene) =>
    scene as unknown as {
      idle: unknown[];
      idling: boolean[];
      palettes: number[];
      players: Set<Who>;
      sprites: { texture: string; visible: boolean }[];
      modal: boolean;
      summonRequest: unknown;
      pendingCheats: CheatOptions;
    };

  it('spawns a resident fighter at once, extending the scene arrays', async () => {
    const { scene, artIn } = boot();
    artIn();
    scene.setModal(true);
    await scene.summon('golf', 1);
    const view = state(scene);
    expect(scene.match.fighters).toHaveLength(3);
    expect(scene.match.fighters[2]!.who).toBe('golf');
    expect(view.idle).toHaveLength(3);
    expect(view.idling).toEqual([true, true, false]);
    // The new VM already ticked: it holds a frame for the draw loop.
    expect(idleOf(scene, 2).frame).toBeTruthy();
    // A non-story battle's summon draws with palette 0.
    expect(view.palettes).toHaveLength(3);
    expect(view.palettes[2]).toBe(0);
    expect(view.players.has('golf')).toBe(true);
    expect(view.sprites).toHaveLength(3);
    // The modal held for the summon stays held; the dialog close lifts it.
    expect(view.modal).toBe(true);
  });

  it('waits for the fighter pack, then registers the player and spawns', async () => {
    const { scene, view, files, finishLoad } = boot();
    const pending = scene.summon('golf', 1);
    // The pack queued and the fight held while it loads.
    expect(files.some((file) => file.key === 'fighter-golf')).toBe(true);
    expect(view.loading).toBe(false);
    expect(state(scene).players.has('golf')).toBe(false);
    expect(state(scene).idle).toHaveLength(2);
    let done = false;
    void pending.then(() => {
      done = true;
    });
    finishLoad();
    await pending;
    expect(done).toBe(true);
    const summoned = state(scene);
    expect(summoned.players.has('golf')).toBe(true);
    expect(scene.match.fighters).toHaveLength(3);
    expect(summoned.idle).toHaveLength(3);
    expect(summoned.idling).toEqual([true, true, false]);
    expect(summoned.palettes[2]).toBe(0);
    expect(summoned.sprites).toHaveLength(3);
  });

  it('renders the idle summon on the next unfrozen frame', async () => {
    const { scene, view, artIn } = boot();
    artIn();
    await scene.summon('golf', 1);
    scene.setModal(false);
    // A full unfrozen update: the draw loop reads every fighter's pose, so
    // a missing idle VM would crash here.
    (view.update as (t: number, d: number) => void)(0, 10);
    expect((scene as unknown as { error: string }).error).toBe('');
    const sprite = state(scene).sprites[2]!;
    expect(sprite.visible).toBe(true);
    expect(sprite.texture).toMatch(/^golf-/);
  });

  it('rejects without freezing when there is no live match to join', async () => {
    const { scene, view } = boot();
    view.ready = false;
    await expect(scene.summon('golf', 1)).rejects.toThrow('ready');
    expect(state(scene).modal).toBe(false);
    view.ready = true;
    view.select = new Title();
    await expect(scene.summon('golf', 1)).rejects.toThrow('match');
    view.select = null;
    view.loading = true;
    await expect(scene.summon('golf', 1)).rejects.toThrow('match');
    view.loading = false;
    // A full arena never opens the modal either.
    const filler = { who: 'golf' } as Fighter;
    for (let i = 0; i < 8; i++) scene.match.fighters.push(filler);
    await expect(scene.summon('golf', 1)).rejects.toThrow('full');
    expect(state(scene).modal).toBe(false);
    expect(scene.match.fighters).toHaveLength(10);
    // A finished match takes no summon either: its result transition has
    // run out (the fields the resultReady getter reads).
    while (scene.match.fighters.length > 2) scene.match.fighters.pop();
    const finished = scene.match as unknown as {
      calls: boolean;
      winner: string | null;
      wins: number[];
      endingTicks: number;
      roundEnd: number;
    };
    finished.calls = true;
    finished.winner = 'opponent';
    finished.wins = [3, 0];
    finished.endingTicks = finished.roundEnd + 999;
    expect(scene.match.resultReady).toBe(true);
    await expect(scene.summon('golf', 1)).rejects.toThrow('match');
  });

  it('fails the summon alone when its pack fails, match intact', async () => {
    const { scene, view, loadErrors, finishLoad, preload } = boot();
    preload();
    const pending = scene.summon('golf', 1);
    let failed: unknown = null;
    pending.catch((error: unknown) => {
      failed = error;
    });
    // The summon's own pack errors — every other load still poisons the
    // scene, so the handler keys on the pack's key.
    expect(loadErrors).toHaveLength(1);
    loadErrors[0]!({ key: 'golf-419' });
    await Promise.resolve();
    expect(failed).toBeTruthy();
    const view_ = state(scene);
    expect(view_.summonRequest).toBeUndefined();
    // The scene is unharmed: no error, the match and its arrays untouched.
    expect((scene as unknown as { error: string }).error).toBe('');
    expect(scene.match.fighters).toHaveLength(2);
    expect(view_.idle).toHaveLength(2);
    expect((view as { error?: string }).error ?? '').toBe('');
    // A later COMPLETE (a match load) spawns nothing.
    finishLoad();
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('fails the scene as before when an unrelated load errors', () => {
    const { scene, loadErrors, preload } = boot();
    preload();
    expect(loadErrors).toHaveLength(1);
    loadErrors[0]!({ key: 'court-3' });
    expect((scene as unknown as { error: string }).error).toContain('court-3');
  });

  it('cancels a summon when the dialog closes, restoring the pause', async () => {
    const { scene, finishLoad } = boot();
    scene.togglePause();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    scene.setModal(false);
    // The pre-existing pause comes back with the modal; the request's
    // await still settles with its pack — the load's COMPLETE rejects it
    // 'moved on' and spawns nothing.
    expect(scene.paused).toBe(true);
    finishLoad();
    await expect(pending).rejects.toThrow('moved on');
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('tracks a cancelled summon’s finished pack and frees it at the next match', async () => {
    const { scene, view, finishLoad, packIn } = boot();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    scene.setModal(false);
    // The pack's late completion decoded its art: no spawn, the request
    // settles 'moved on', and the resident fighter joins the loaded
    // players so the caches stay accountable.
    packIn();
    finishLoad();
    await expect(pending).rejects.toThrow('moved on');
    const state_ = state(scene);
    expect(state_.players.has('golf')).toBe(true);
    expect(scene.match.fighters).toHaveLength(2);
    // A second summon of the same fighter finds it resident at once.
    scene.setModal(true);
    await scene.summon('golf', 1);
    expect(scene.match.fighters).toHaveLength(3);
    scene.setModal(false);
    // The next match that doesn't seat golf frees the adopted art: the
    // unload runs through the same cache cleanup a native player takes.
    const removed: string[] = [];
    (view.cache as { audio: { remove: (key: string) => void } }).audio.remove =
      (key: string) => void removed.push(key);
    scene.setFighter('zoma');
    finishLoad();
    expect(state(scene).players.has('golf')).toBe(false);
    expect(removed.some((key) => key.startsWith('golf-sound-'))).toBe(true);
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('a cancelled summon failing later leaves the scene intact', async () => {
    const { scene, loadErrors, finishLoad, preload } = boot();
    preload();
    scene.togglePause();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    scene.setModal(false);
    // The cancelled pack is still outstanding; its failure settles the
    // request with the load's own error and must not poison the
    // preserved match with the global scene error.
    loadErrors[0]!({ key: 'golf-419' });
    await expect(pending).rejects.toThrow('Could not load golf');
    await Promise.resolve();
    expect((scene as unknown as { error: string }).error).toBe('');
    expect(scene.match.fighters).toHaveLength(2);
    expect(scene.paused).toBe(true);
    // A later COMPLETE spawns nothing either.
    finishLoad();
    expect(scene.match.fighters).toHaveLength(2);
    // Tracking settles with the pack: a fresh summon still owns its own
    // failure alone, and an unrelated key still fails the scene.
    const second = scene.summon('golf', 1);
    loadErrors[0]!({ key: 'golf-401' });
    await expect(second).rejects.toThrow('Could not load golf');
    expect((scene as unknown as { error: string }).error).toBe('');
    loadErrors[0]!({ key: 'court-3' });
    expect((scene as unknown as { error: string }).error).toContain('court-3');
  });

  it('leaves a stale summon unmatched when the match was replaced', async () => {
    const { scene, view, finishLoad } = boot();
    const pending = scene.summon('golf', 1);
    // A reset inside the dialog (or any pick) swaps the match while the
    // pack loads.
    scene.match = new Match('cpu', true);
    finishLoad();
    await expect(pending).rejects.toThrow('moved on');
    expect(scene.match.fighters).toHaveLength(2);
    expect(state(scene).idle).toHaveLength(2);
    expect(view.loading).toBe(false);
  });

  it('rejects an in-flight summon when the scene shuts down', async () => {
    const { scene, shutdowns } = boot();
    const pending = scene.summon('golf', 1);
    for (const done of [...shutdowns]) done();
    await expect(pending).rejects.toThrow('shut down');
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('settles a cancelled summon’s outstanding pack on shutdown', async () => {
    const { scene, shutdowns } = boot();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    scene.setModal(false);
    // The cancel dropped the request's own hook and armed the scene's
    // sweep for the still-outstanding pack — its await's last settler
    // now that the loader's listeners die with the scene (HPA-972
    // review: the Menu's confirm otherwise waited on it forever).
    expect(shutdowns).toHaveLength(1);
    for (const done of [...shutdowns]) done();
    await expect(pending).rejects.toThrow('shut down');
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('settles each summon’s shutdown hook, leaving none behind', async () => {
    const { scene, shutdowns, finishLoad } = boot();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    expect(shutdowns).toHaveLength(1);
    // A cancel takes its hook off with it, arming the scene's sweep for
    // the outstanding pack; the await still settles when its pack's load
    // does — or when another summon supersedes it.
    scene.setModal(false);
    expect(shutdowns).toHaveLength(1);
    // The next summon adds its own hook beside the armed sweep; summoning
    // the same fighter supersedes the cancelled one's outstanding load
    // and settles its await there.
    scene.setModal(true);
    const second = scene.summon('golf', 1);
    expect(shutdowns).toHaveLength(2);
    await expect(pending).rejects.toThrow('took over the load');
    // A cancel while the pack is still loading drops that hook, leaving
    // the armed sweep, and the pack's late completion settles the second
    // request's own.
    scene.setModal(false);
    expect(shutdowns).toHaveLength(1);
    const settled = expect(second).rejects.toThrow('moved on');
    finishLoad();
    await settled;
    expect(shutdowns).toHaveLength(1);
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('summons with the pending cheats after a mid-battle enable', async () => {
    const { scene, artIn } = boot();
    artIn();
    // The battle's snapshot stays native: setCheats only holds the next
    // battle's values — the explicit summon reads them now.
    scene.setCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      enemyHpMultiplier: 3,
    });
    await scene.summon('zoma', -1);
    expect(scene.match.cheats.enabled).toBe(false);
    expect(scene.match.fighters[2]!.maxHp).toBe(lifeOf('zoma') * 3);
    // With the snapshot already enabled, it — not the pending edit — wins.
    const { scene: second, artIn: artIn2 } = boot();
    artIn2();
    second.match.useCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      enemyHpMultiplier: 2,
    });
    second.setCheats({
      ...DEFAULT_CHEATS,
      enabled: true,
      enemyHpMultiplier: 3,
    });
    await second.summon('zoma', -1);
    expect(second.match.fighters[2]!.maxHp).toBe(lifeOf('zoma') * 2);
    // A disabled pending set leaves the new fighter native.
    const { scene: third, artIn: artIn3 } = boot();
    artIn3();
    third.setCheats({ ...DEFAULT_CHEATS });
    await third.summon('zoma', -1);
    expect(third.match.fighters[2]!.maxHp).toBe(lifeOf('zoma'));
    expect(third.match.fighters[2]!.maxStock).toBe(
      third.match.fighters[1]!.maxStock,
    );
  });

  it('marks the run cheated and reports it the moment the summon lands', async () => {
    const { scene, artIn, statuses } = boot();
    artIn();
    await scene.summon('golf', 1);
    // The modal's opening report ran before the summon, the landing one
    // after: the run's cheated mark flips between them.
    expect(statuses[0]?.cheated).toBe(false);
    expect(statuses.at(-1)?.cheated).toBe(true);
    expect(scene.match.cheated).toBe(true);
  });

  it('gives a story summon the story palette', async () => {
    const { scene, artIn } = boot();
    artIn();
    const battle = scenarioOf('rario').find((step) => step.type === 1);
    expect(battle?.type).toBe(1);
    scene.match = Match.story('rario', battle as Battle);
    // begin() would have synced the seats' palettes; mirror it.
    (state(scene) as unknown as { palettes: number[] }).palettes = [
      ...scene.match.palettes,
    ];
    await scene.summon('shinz', 1);
    const view = state(scene);
    const index = scene.match.fighters.length - 1;
    expect(scene.match.fighters[index]!.who).toBe('shinz');
    expect(scene.match.battle).toBeTruthy();
    expect(view.palettes[index]).toBe(scene.match.palettes[index]);
    expect(view.palettes[index]).toBeGreaterThanOrEqual(0);
  });

  it('refuses a second summon while one loads', async () => {
    const { scene, finishLoad } = boot();
    const first = scene.summon('golf', 1);
    await expect(scene.summon('zoma', -1)).rejects.toThrow('already');
    finishLoad();
    await first;
    expect(scene.match.fighters.map((f) => f.who)).toContain('golf');
  });

  it('settles a failed summon’s shutdown hook with the request', async () => {
    const { scene, shutdowns, loadErrors, preload } = boot();
    preload();
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    expect(shutdowns).toHaveLength(1);
    loadErrors[0]!({ key: 'golf-419' });
    await expect(pending).rejects.toThrow('Could not load golf');
    // The rejection settles the request like a cancel does — without it
    // the dead hook would reject every later summon on shutdown.
    expect(shutdowns).toHaveLength(0);
  });

  it('fails the scene when a pack a cancelled summon shared errors', async () => {
    const { scene, loadErrors, finishLoad, preload } = boot();
    preload();
    state(scene).players.add('ryuko');
    scene.setModal(true);
    const pending = scene.summon('golf', 1);
    scene.setModal(false);
    // The pick's match load re-queues the same pack while the cancelled
    // summon's copy is still outstanding; the summon claims the error —
    // settling its own await with it — but nothing decoded, so the match
    // must not begin on the absent art.
    scene.setOpponent('golf');
    loadErrors[0]!({ key: 'golf-419' });
    await expect(pending).rejects.toThrow('Could not load golf');
    finishLoad();
    expect((scene as unknown as { error: string }).error).toContain(
      'fighter-golf',
    );
    expect(scene.match.fighters.map((f) => f.who)).not.toContain('golf');
  });

  it('adopts a pack that finished after the match left its summon', async () => {
    const { scene, packIn, finishLoad } = boot();
    const pending = scene.summon('golf', 1);
    scene.match = new Match('cpu', true);
    packIn();
    finishLoad();
    await expect(pending).rejects.toThrow('moved on');
    // The decode landed, so the fighter joins the loaded players — the
    // next match change's unload can account for its art.
    expect(state(scene).players.has('golf')).toBe(true);
    expect(scene.match.fighters).toHaveLength(2);
  });

  it('writes a summon’s palette at its index, past a stale tail', async () => {
    const { scene, artIn } = boot();
    artIn();
    const view = state(scene);
    // A story reset can leave the held array longer than the roster; a
    // push would append past the summon and leave the stale entry at its
    // slot.
    view.palettes.push(99);
    await scene.summon('golf', 1);
    expect(view.palettes).toHaveLength(3);
    expect(view.palettes[2]).toBe(0);
  });
});
