import Phaser from 'phaser';
import { ASSET_BASE as BASE } from './assetBase';
import { CHARACTERS, lifeOf, STAGES } from './characters';
import type { Container, Stage, Who } from './characters';
import ui from './generated/ui.json';
import selectData from './generated/select.json';
import t1 from './generated/t1.json';
import t2 from './generated/t2.json';
import {
  battlePalettes,
  CharacterSelect,
  Continue,
  StoryDemo,
  TEAM_DEMO,
  Title,
  TITLE,
} from './select';
import type { Demo, SelectObject } from './select';
import { Story } from './story';
import type { Battle, Next } from './story';
import {
  createHud,
  depthOf,
  HUD_ORDER,
  letteringSounds,
  screenDepth,
} from './hud';
import { StandingVM, heldPlacement, placement } from './standing';
import { animationFrame, BLACK, isBlank, NORMAL_COLOR } from './animations';
import type { Color, Pose } from './animations';
import {
  afterimageColor,
  drawnColor,
  fighterPose,
  FixedClock,
  GROUND,
  HEIGHT,
  LIFE,
  Match,
  stepShake,
  WIDTH,
} from './match';
import type {
  Control,
  Effect,
  Fighter,
  Mode,
  PracticeOptions,
  ShakeAxis,
} from './match';

export interface GameStatus {
  ready: boolean;
  paused: boolean;
  hp: [number, number];
  life: [number, number];
  seconds: number;
  hits: number;
  damage: number;
  action: string;
  winner: Match['winner'];
  matchWinner: Match['winner'];
  resultReady: boolean;
  error: string;
  // On the title or the character select screen, and the pair it last chose.
  selecting: boolean;
  fighters: [Who, Who];
  // In a story battle.
  story: boolean;
  // The match's mode: TEAM VS's is always Vs. CPU.
  mode: Mode;
}
export const initialStatus: GameStatus = {
  ready: false,
  paused: false,
  hp: [LIFE, LIFE],
  life: [LIFE, LIFE],
  seconds: Infinity,
  hits: 0,
  damage: 0,
  action: 'idle',
  winner: null,
  matchWinner: null,
  resultReady: false,
  error: '',
  selecting: true,
  fighters: ['ryuko', 'zoma'],
  story: false,
  mode: 'practice',
};
const ART_SCALE = 1.5;
const DEMOS = { select: selectData, t1, t2 };
// A story's demos, loaded as they play.
type StoryDemoData = Demo & {
  images: { index: number; width: number; height: number; filename: string }[];
  sounds: { index: number; filename: string; seconds: number }[];
};
const STORY_DEMOS = import.meta.glob<StoryDemoData>(
  './generated/demos/*.json',
  { import: 'default' },
);
// Authored: a story demo's sounds of five seconds or more are its tracks,
// which play only with Music ticked, as the stages' and the title's do.
const TRACK_SECONDS = 5;
// The images and sounds each player's select-screen programs show and play
// (ops 0x0c and 0x03, select.ts), which load at start and stay; the rest of
// a player's load with the matches that seat it (whenReady).
const selectAssets = Object.fromEntries(
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
// Objects draw by priority, then slot (hud.ts `depthOf`): the slots below
// `setup`, round setup's stage objects, before the HUD, later ones after it.
// The depth carries the slot, as a reused sprite keeps a stale place in
// Phaser's list.
const objectDepth = (e: Effect, setup: number) =>
  depthOf(e.z, e.index < setup ? 8 + e.index : HUD_ORDER + e.index);
const still = (): ShakeAxis => ({
  type: 0,
  amplitude: 0,
  frames: 0,
  offset: 0,
  left: 0,
});
// Authored: each match seeds its CPU afresh.
const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
// Authored keys. The source guards holding back (0x40f42c), so no key
// does; the practice partners' guard control holds a guard pose.
const keyMap: Record<string, Control> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  ArrowDown: 'crouch',
  KeyS: 'crouch',
  KeyG: 'punch',
  KeyH: 'kick',
  KeyK: 'hitUp',
  KeyF: 'iori',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyU: 'drill',
  KeyI: 'axe',
  KeyO: 'throw',
  KeyJ: 'dst',
  KeyE: 'ex',
  Digit1: 'getterBeam',
  Digit2: 'musashi',
  Digit3: 'changeAttack',
  Digit4: 'blackRush',
  Digit5: 'megaBeam',
};

// The free state's program (action 1), which reads the fighter's variable 0
// (EX mode) and, for SIN and SOU, its life: SOU's on its first tick (PC 8).
const idleVM = (f: Fighter, seed?: number) =>
  Object.assign(
    new StandingVM(CHARACTERS[f.who].idle, seed, 10, {
      0x40: f.variables[0] ?? 0,
    }),
    { life: f.hp },
  );

export class TrainingScene extends Phaser.Scene {
  private fighter: Who = 'ryuko';
  private opponent: Who = 'zoma';
  // Whether the select screen chose the pair: its Vs. CPU battles take the
  // VS paths (global 3 at 50), as VS single's do. VS multi's teams, whose
  // first members are the pair, with the palettes their seats took.
  private chosen = false;
  private teams: { who: Who; palette: number }[][] | null = null;
  private stage: Stage = 'court';
  match = new Match(
    'practice',
    false,
    randomSeed(),
    [this.fighter, this.opponent],
    this.stage,
  );
  // Kept across resets and mode changes; only free practice reads them.
  private practice: PracticeOptions = { ...this.match.practice };
  paused = false;
  private clock = new FixedClock();
  private held = new Set<string>();
  private virtual = new Set<Control>();
  private pressed = new Set<Control>();
  private sprites: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private blacks: Phaser.GameObjects.Image[] = [];
  private effectSprites: Phaser.GameObjects.Image[] = [];
  private layerSprites: Phaser.GameObjects.Image[] = [];
  private trailSprites: Phaser.GameObjects.Image[] = [];
  // A story's life bars (lifeBars) and their digits.
  private bars?: Phaser.GameObjects.Graphics;
  private digitSprites: Phaser.GameObjects.Image[] = [];
  // Op 0x0e's shake, stepped once per drawn frame like the source's draw
  // loop, and the drawn-frame count whose parity flips it.
  private shake: Record<'x' | 'y', ShakeAxis> = { x: still(), y: still() };
  private quake: Match['quake'] = { x: null, y: null };
  private frame = 0;
  private idle = this.match.fighters.map((f, i) => idleVM(f, i));
  // Whether each fighter's idle program ran on the last unfrozen step.
  private idling = [true, true];
  private ready = false;
  private error = '';
  private lastStatus = '';
  private updateHud?: ReturnType<typeof createHud>;
  // 0x403430 stops and rewinds every buffer of a sound before playing it
  // (0x415f00), so each player's copy of a sound restarts rather than
  // overlapping itself; different sounds mix.
  private voices = new Map<string, Phaser.Sound.BaseSound>();
  // The stage's music: the last track or jingle its scripts cued since they
  // last stopped every sound (export_stage). Authored: it plays only with
  // Music ticked, off by default, and loads on first use.
  private music = false;
  private cue?: { index: number; filename: string; loop: boolean };
  private track?: Phaser.Sound.BaseSound;
  // The character select screen (select.ts) the game opens on, and returns
  // to from the toolbar, before the match it chooses.
  // The title, which the game opens on, then the select screen, or story
  // mode's demos and continue screen.
  private select: Title | CharacterSelect | StoryDemo | Continue | null =
    new Title();
  // Story mode: the story running (story.ts), its 1P's palette, and the
  // 1P's life and the rounds it lost or drew as its last battle ended, which
  // the runner's jumps read; and whether a demo or stage is loading.
  private story: Story | null = null;
  // The seats' palettes a story keeps from battle to battle (+0xe00b).
  private storyHeld: number[] = [];
  private storyLife = 0;
  private storyLost = 0;
  // Op 0x1f's globals (0x4456b0), which every screen and the matches they
  // start share, as the engine keeps one set for the session.
  private globals = Array<number>(64).fill(0);
  private loading = false;
  // The players whose images and sounds are all in, and the match whenReady
  // last loaded for.
  private players = new Set<Who>();
  private wanted?: Match;
  // The tracks the loaded demos cue, by sound key.
  private demoTracks = new Set<string>();
  private selectSprites: Phaser.GameObjects.Image[] = [];
  // The palette each player's objects draw with, from the select's buttons.
  private palettes = [0, 0];
  // The title's or the select screen's track.
  private selectTrack?: Phaser.Sound.BaseSound;

  constructor(private onStatus: (status: GameStatus) => void) {
    super('training');
  }

  preload() {
    this.loadStage(this.stage);
    for (const who of Object.keys(CHARACTERS) as Who[])
      this.loadPlayer(who, false);
    for (const image of ui.images)
      this.load.image(`ui-${image.index}`, BASE + image.filename);
    this.load.image('text', BASE + 'text.png');
    for (const [demo, { images, sounds }] of Object.entries(DEMOS)) {
      for (const image of images)
        this.load.image(`${demo}-${image.index}`, BASE + image.filename);
      for (const sound of sounds)
        this.load.audio(`${demo}-sound-${sound.index}`, BASE + sound.filename);
    }
    for (const sound of ui.sounds)
      this.load.audio(`kgt-sound-${sound.index}`, BASE + sound.filename);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.error = `Could not load ${file.key}. Run bun run assets, then reload.`;
      this.report();
    });
  }

  create() {
    if (this.error) return;
    // Phaser 4's roundPixels skips scaled objects by default; round the 1.5×
    // art too, as Phaser 3 did.
    this.events.on(
      Phaser.Scenes.Events.ADDED_TO_SCENE,
      (object: Phaser.GameObjects.GameObject) =>
        object.setVertexRoundMode('fullAuto'),
    );
    this.growFighters(this.match.fighters.length);
    this.updateHud = createHud(this, (key, color) => this.tint(key, color));
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute(
      'aria-label',
      'Training arena keyboard controls',
    );
    this.ready = true;
    this.idle.forEach((vm) => vm.tick());
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.keydown);
      window.removeEventListener('keyup', this.keyup);
      window.removeEventListener('blur', this.blur);
      document.removeEventListener('visibilitychange', this.visibility);
      this.clearInput();
    });
    this.report();
  }

  private keydown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLElement &&
      (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) ||
        e.target.isContentEditable)
    )
      return;
    if (keyMap[e.code] && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      this.held.add(e.code);
      if (!e.repeat) this.pressed.add(keyMap[e.code]);
    }
    if (!e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) {
      e.preventDefault();
      this.togglePause();
    }
    if (!e.repeat && e.code === 'KeyR')
      if (this.select instanceof CharacterSelect)
        this.open(
          new CharacterSelect(undefined, this.select.story, this.select.team),
        );
      else if (this.select) this.openTitle();
      else this.reset(this.match.mode);
  };
  private keyup = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private blur = () => {
    this.clearInput();
    if (this.ready && !this.match.resultReady) {
      this.paused = true;
      this.sound.pauseAll();
      this.report();
    }
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };

  clearInput() {
    this.match.clearInput();
    this.held.clear();
    this.virtual.clear();
    this.pressed.clear();
    this.clock.reset();
  }
  control(control: Control, down: boolean) {
    if (down) {
      this.virtual.add(control);
      this.pressed.add(control);
    } else this.virtual.delete(control);
  }
  togglePause() {
    if (!this.ready || (this.match.resultReady && !this.select)) return;
    this.paused = !this.paused;
    if (this.paused) this.sound.pauseAll();
    else this.sound.resumeAll();
    this.clearInput();
    this.report();
  }
  // Back to the character select screen, which opens afresh.
  openSelect() {
    this.open(new CharacterSelect());
  }
  // VS multi's, once its demo loads.
  private openTeamSelect() {
    this.openDemo(
      TEAM_DEMO,
      (demo) => new CharacterSelect(undefined, false, demo),
    );
  }
  private openTitle() {
    this.open(new Title());
  }
  private open(screen: NonNullable<TrainingScene['select']>) {
    screen.globals = this.globals;
    this.select = screen;
    this.sound.stopAll();
    this.selectTrack = undefined;
    this.paused = false;
    this.clearInput();
    this.report();
  }
  // A step of the title or the select screen with this tick's controls. VS
  // single on the title opens the select screen; once both sides have
  // chosen, the match starts with them.
  private stepSelect(input: Partial<Record<Control, boolean>>) {
    const select = this.select!;
    select.step(input);
    for (const { container, index } of select.sounds) {
      const key = `${container}-sound-${index}`;
      // Authored: the title's 126-second track (T2's sound 1), the select
      // screen's 57-second one (CHAR SELECT's) and a story demo's play only
      // with Music ticked, as the stages' do; ticking it later starts the
      // last one cued.
      if (
        ((container === 't2' || container === 'select') && index === 1) ||
        this.demoTracks.has(key)
      ) {
        this.selectTrack?.stop();
        this.selectTrack = this.sound.get(key) ?? this.sound.add(key);
        if (this.music) this.selectTrack.play();
      }
      // CHAR SELECT's sound 0, which its closing panels cue, is empty.
      else if (this.cache.audio.exists(key)) this.play(key);
    }
    if (!select.done) return;
    if (select instanceof Title)
      return select.done === 'story'
        ? this.open(new CharacterSelect(undefined, true))
        : select.done === 'multi'
          ? this.openTeamSelect()
          : this.openSelect();
    if (select instanceof StoryDemo)
      return this.runStory(this.story!.next(this.storyLife, this.storyLost));
    if (select instanceof Continue)
      return select.done === 'yes'
        ? this.runStory(this.story!.retry())
        : this.openTitle();
    // The story's first step (0x4069b0), its counter reset by the title.
    if (select.story) {
      this.story = new Story(select.done[0]);
      this.storyHeld = [...select.drawn];
      this.teams = null;
      return this.runStory(this.story.next());
    }
    [this.fighter, this.opponent] = select.done;
    this.chosen = true;
    this.teams = select.team ? select.teams : null;
    this.palettes = battlePalettes(select.palettes);
    this.reset(this.teams ? 'cpu' : this.match.mode, true);
  }

  private leaveScreen() {
    this.select = null;
    this.selectTrack?.stop();
    for (const sprite of this.selectSprites) sprite.setVisible(false);
  }

  // The story runner's step (0x4069b0): a battle (object type 14), a demo
  // (16) or the title (12).
  private runStory(next: Next) {
    if (next.kind === 'title') return this.openTitle();
    if (next.kind === 'demo')
      return this.openDemo(
        next.demo,
        (demo) => new StoryDemo(next.demo, demo, randomSeed()),
      );
    this.startBattle(next.battle);
  }

  // A story battle on its stage, once its images load.
  private startBattle(battle: Battle) {
    const match = Match.story(
      this.story!.who,
      battle,
      randomSeed(),
      this.storyHeld,
      this.globals,
    );
    this.whenReady(match, () => {
      this.leaveScreen();
      this.begin(match);
    });
  }

  // A won Vs. match returns to the select screen (state 902 spawns object
  // type 10, 0x40982b), VS multi's to its own; a story battle runs the story
  // on, unless the 1P won no more rounds than the CPUs and the step's flag
  // bit 0 opens the continue screen (0x40983b).
  private matchOver() {
    const { battle, fighters, lost } = this.match;
    if (!battle)
      return this.match.teams ? this.openTeamSelect() : this.openSelect();
    [this.storyLife, this.storyLost] = [fighters[0].hp, lost];
    if (this.match.matchWinner !== 'player' && battle.flags & 1)
      return this.openDemo(9, (demo) => new Continue(demo));
    this.runStory(this.story!.next(this.storyLife, this.storyLost));
  }

  // A story demo's records, images and sounds load before it opens; the
  // last screen stays until then.
  private openDemo(
    index: number,
    make: (demo: StoryDemoData) => StoryDemo | Continue | CharacterSelect,
  ) {
    this.loading = true;
    void STORY_DEMOS[`./generated/demos/${index}.json`]().then((demo) => {
      const prefix = `demo${index}`;
      for (const image of demo.images) {
        selectSizes.set(`${prefix}-${image.index}`, image);
        this.load.image(`${prefix}-${image.index}`, BASE + image.filename);
      }
      for (const sound of demo.sounds) {
        const key = `${prefix}-sound-${sound.index}`;
        if (sound.seconds >= TRACK_SECONDS) this.demoTracks.add(key);
        this.load.audio(key, BASE + sound.filename);
      }
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.loading = false;
        this.open(make(demo));
      });
      this.load.start();
    });
  }

  // Runs once a match's stage and every player it can seat (a story's
  // waiting slots, both VS multi teams) are in, the last screen or match
  // staying until then; the players it drops then free all but their select
  // screens' images and sounds. All 45 players' images decode to about 6 GB.
  // Only the last match asked for starts.
  private whenReady(match: Match, then: () => void) {
    this.wanted = match;
    const players = new Set([
      ...match.fighters.map((f) => f.who),
      ...(match.teams?.flat() ?? []),
    ]);
    const missing = [...players].filter((who) => !this.players.has(who));
    const start = () => {
      for (const who of missing) this.players.add(who);
      if (this.wanted !== match) return;
      this.loading = false;
      this.unloadPlayers(players);
      then();
    };
    const { stage } = match;
    if (
      !missing.length &&
      this.textures.exists(`${stage}-${STAGES[stage].images[0].index}`)
    )
      return start();
    this.loading = true;
    this.loadStage(stage);
    for (const who of missing) this.loadPlayer(who, true);
    this.load.once(Phaser.Loader.Events.COMPLETE, start);
    this.load.start();
  }
  // A player's images and sounds: all of them, or its select screens'. The
  // loader skips those already in.
  private loadPlayer(who: Who, all: boolean) {
    const { images, sounds } = CHARACTERS[who];
    const select = selectAssets[who];
    for (const image of images)
      if (all || select.images.has(image.index))
        this.load.image(`${who}-${image.index}`, BASE + image.filename);
    for (const sound of sounds)
      if (all || select.sounds.has(sound.index))
        this.load.audio(`${who}-sound-${sound.index}`, BASE + sound.filename);
  }
  private unloadPlayers(keep: Set<Who>) {
    const textures = new Set<string>();
    const sounds = new Set<string>();
    for (const who of this.players) {
      if (keep.has(who)) continue;
      this.players.delete(who);
      const select = selectAssets[who];
      // Its recoloured and tinted copies too (`${key}@palette`, `${key}:rgb`).
      for (const key of this.textures.getTextureKeys()) {
        const [, owner, image] = /^([a-z]+)-(\d+)/.exec(key) ?? [];
        if (owner === who && !select.images.has(Number(image)))
          textures.add(key);
      }
      for (const { index } of CHARACTERS[who].sounds)
        if (!select.sounds.has(index)) sounds.add(`${who}-sound-${index}`);
    }
    for (const object of this.children.list)
      if (
        object instanceof Phaser.GameObjects.Image &&
        textures.has(object.texture.key)
      )
        object.setTexture('__DEFAULT');
    for (const key of textures) this.textures.remove(key);
    for (const key of sounds) {
      this.sound.removeByKey(key);
      this.cache.audio.remove(key);
    }
    for (const id of this.voices.keys())
      if (sounds.has(id.slice(id.indexOf(':') + 1))) this.voices.delete(id);
  }
  // Demo and KGT objects draw their display's top left at their offset; a
  // player's select face and name stand on their ground point (placement).
  private drawSelect() {
    const objects = this.select!.objects.filter((o) => o.frame);
    this.pool(this.selectSprites, objects.length).forEach((sprite, index) => {
      const o = objects[index];
      if (!o) return sprite.setVisible(false);
      this.drawSelectObject(sprite, o, index);
    });
  }
  private drawSelectObject(
    sprite: Phaser.GameObjects.Image,
    o: SelectObject,
    index: number,
  ) {
    const frame = o.frame!;
    const prefix = o.container === 'kgt' ? 'ui' : o.container;
    const size = selectImage(prefix, frame.image);
    if (!size) return sprite.setVisible(false);
    const pose: Pose = { ...frame, ...size };
    const player = o.container in CHARACTERS;
    const p = player
      ? placement(pose, size.width, size.height, o.x, o.y, o.facing === -1)
      : {
          left: Math.trunc(o.x) + frame.dx,
          top: Math.trunc(o.y) + frame.dy,
          flip_x: frame.flip_x,
          flip_y: frame.flip_y,
        };
    const palette =
      player && this.select instanceof CharacterSelect
        ? Math.max(0, this.select.drawn[o.owner])
        : 0;
    this.paint(sprite, pose, o.color, prefix as Container, palette)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(200 + o.z / 256 + index / 1e6)
      .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
      .setFlip(p.flip_x, p.flip_y);
  }

  setPractice(options: PracticeOptions) {
    this.practice = { ...options };
    this.match.practice = { ...options };
  }
  setFighter(who: Who) {
    this.fighter = who;
    this.chosen = false;
    this.teams = null;
    this.reset(this.match.mode);
  }
  setOpponent(who: Who) {
    this.opponent = who;
    this.chosen = false;
    this.teams = null;
    this.reset(this.match.mode);
  }
  // A stage's images load when it is first picked (whenReady).
  setStage(stage: Stage) {
    this.stage = stage;
    this.reset(this.match.mode);
  }
  private loadStage(stage: Stage) {
    for (const image of STAGES[stage].images)
      this.load.image(`${stage}-${image.index}`, BASE + image.filename);
  }
  // `leave` closes the screen that chose the match once it starts.
  reset(mode: Mode, leave = false) {
    // A story battle starts over.
    if (mode === 'story') {
      if (this.match.battle) this.startBattle(this.match.battle);
      return;
    }
    // Vs. CPU rounds open with the recovered walk-in; practice starts at once.
    // Authored: free practice and the CPU match no select screen chose keep
    // their own globals.
    const vs = this.chosen && mode === 'cpu';
    const match =
      this.teams && mode === 'cpu'
        ? Match.team(
            this.teams.map((team) => team.map(({ who }) => who)),
            this.stage,
            randomSeed(),
            this.globals,
          )
        : new Match(
            mode,
            mode === 'cpu',
            randomSeed(),
            [this.fighter, this.opponent],
            this.stage,
            vs,
            null,
            undefined,
            vs ? this.globals : undefined,
          );
    this.whenReady(match, () => {
      if (leave) this.leaveScreen();
      this.begin(match);
    });
  }
  private begin(match: Match) {
    this.match = match;
    this.roundPalettes();
    this.match.practice = { ...this.practice };
    // A match the toolbar restarts behind a screen leaves its sounds playing.
    if (!this.select) this.sound.stopAll();
    this.cue = undefined;
    this.shake = { x: still(), y: still() };
    this.quake = this.match.quake;
    this.resetIdle();
    this.paused = false;
    this.clearInput();
    this.report();
  }

  // A story's players take their palettes as they enter; VS multi's round
  // start gives each fighter its member's, and free practice after it has
  // the first members.
  private roundPalettes() {
    if (this.match.battle) this.palettes = this.match.palettes;
    else if (this.teams) {
      const members = this.match.teams ? this.match.members : [0, 0];
      this.palettes = battlePalettes(
        members.map((m, p) => this.teams![p][m].palette),
      );
    }
  }

  // Each round's fighters start their idle programs afresh.
  private resetIdle() {
    this.idle = this.match.fighters.map((f, i) => idleVM(f, i));
    this.idling = this.match.fighters.map(() => true);
    this.idle.forEach((vm) => vm.tick());
  }

  setMusic(on: boolean) {
    this.music = on;
    if (this.select) {
      if (on) this.selectTrack?.play();
      else this.selectTrack?.stop();
      return;
    }
    this.playMusic();
  }
  // A sound the stage's export lacks is its empty one, which stops every
  // sound (0x4034e0).
  private stageSound(index: number) {
    const { stage } = this.match;
    this.cue = STAGES[stage].sounds.find((s) => s.index === index);
    if (this.cue) this.playMusic();
    else this.sound.stopAll();
  }
  private playMusic() {
    this.track?.stop();
    const cue = this.cue;
    if (!this.music || !cue) return;
    const key = `${this.match.stage}-sound-${cue.index}`;
    if (!this.cache.audio.exists(key)) {
      this.load.audio(key, BASE + cue.filename);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.cue === cue) this.playMusic();
      });
      this.load.start();
      return;
    }
    this.track = this.sound.get(key) ?? this.sound.add(key, { loop: cue.loop });
    this.track.play();
    if (this.paused) this.track.pause();
  }

  private play(key: string, owner = 0) {
    const id = `${owner}:${key}`;
    let voice = this.voices.get(id);
    if (!voice) this.voices.set(id, (voice = this.sound.add(key)));
    voice.stop();
    voice.play();
  }

  // Grow a hidden sprite pool to the current object count.
  // Each fighter's sprite, shadow and action-43 black, grown as a story seats
  // more.
  private growFighters(count: number) {
    while (this.sprites.length < count) {
      // Action 43, a viewport object at (327, 498) in bucket 15 (op 0x04
      // flags 0x46 at PCs 300/325): over the court, behind every object.
      this.blacks.push(
        this.add
          .image(0, 0, '__DEFAULT')
          .setScale(ART_SCALE)
          .setScrollFactor(0)
          .setDepth(screenDepth(15))
          .setVisible(false),
      );
      this.shadows.push(this.add.ellipse(0, GROUND - 1, 94, 13, 0x171311, 0.3));
      this.sprites.push(
        this.add.image(0, GROUND, '__DEFAULT').setOrigin(0).setScale(ART_SCALE),
      );
    }
  }

  private pool(sprites: Phaser.GameObjects.Image[], count: number) {
    while (sprites.length < count)
      sprites.push(
        this.add
          .image(0, 0, '__DEFAULT')
          .setScale(ART_SCALE)
          .setDepth(4)
          .setVisible(false),
      );
    return sprites;
  }

  // A player's objects draw with its palette (0x40ccf2), but for images with
  // their own; each recoloured image is drawn once and cached.
  private recolored(image: number, who: Container, palette: number) {
    const key = `${who === 'kgt' ? 'ui' : who}-${image}`;
    if (!palette || !(who in CHARACTERS)) return key;
    const recolored = `${key}@${palette}`;
    if (this.textures.exists(recolored)) return recolored;
    const { images, palettes } = CHARACTERS[who as Who];
    if (images.find((i) => i.index === image)?.own) return key;
    const colors = new Map(palettes.map((row) => [row[0], row[palette]]));
    const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
    const canvas = this.textures.createCanvas(
      recolored,
      source.width,
      source.height,
    )!;
    canvas.context.drawImage(source, 0, 0);
    const pixels = canvas.getData(0, 0, source.width, source.height);
    const { data } = pixels;
    for (let i = 0; i < data.length; i += 4) {
      const color = colors.get(
        (data[i] << 16) | (data[i + 1] << 8) | data[i + 2],
      );
      if (!data[i + 3] || color === undefined) continue;
      [data[i], data[i + 1], data[i + 2]] = [
        color >> 16,
        (color >> 8) & 255,
        color & 255,
      ];
      // Black draws nothing.
      if (!color) data[i + 3] = 0;
    }
    canvas.putData(pixels, 0, 0).refresh();
    return recolored;
  }

  private texture(
    image: number,
    color: Color,
    who: Container,
    palette: number,
  ) {
    return this.tint(this.recolored(image, who, palette), color);
  }

  // 0x404e2d draws each bar after every object, in source pixels from the
  // player's feet less the scroll, not the shake: a 50×10 box at half
  // brightness, the life left on its inner row in green, then what the bar
  // shows lost in red. SCWU.KGT's system flag 0x20 (0x4438a4) adds the
  // life's digits 18 left of it and the lost life's, 32 redder (0x40b5cf),
  // 40 into it, each counted leftward from its units (0x40bed0). It draws
  // from where the player stood as its last unstopped step began (+0xdf41,
  // 0x412552), a tick's motion behind it.
  private drawLifeBars() {
    const bars = (this.bars ??= this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(150));
    bars.clear();
    const { cameraX, cameraY } = this.match;
    const screen = (x: number, y: number) => [
      Math.round(x * ART_SCALE - cameraX),
      Math.round(y * ART_SCALE - cameraY),
    ];
    const rect = (x: number, y: number, w: number, h: number) => {
      const [left, top] = screen(x, y);
      const [right, bottom] = screen(x + w, y + h);
      bars.fillRect(left, top, right - left, bottom - top);
    };
    const digits: { key: string; digit: number; x: number; y: number }[] = [];
    const count = (value: number, x: number, y: number, key: string) => {
      for (; value > 0; value = Math.trunc(value / 10), x -= 10)
        digits.push({ key, digit: value % 10, x, y });
    };
    for (const f of this.match.lifeBars) {
      const life = lifeOf(f.who);
      const x = Math.trunc(f.bar.x / ART_SCALE) - 25;
      const y = Math.trunc((GROUND + f.bar.y) / ART_SCALE);
      const green = Math.trunc((f.hp * 50) / life);
      bars.fillStyle(0, 0.5);
      rect(x, y, 50, 10);
      bars.fillStyle(0x00ff00);
      rect(x, y + 1, green, 8);
      bars.fillStyle(0xff0000);
      rect(x + green, y + 1, Math.trunc((f.lost * 50) / life), 8);
      if (!(TITLE.flags & 0x20)) continue;
      count(f.hp, x - 18, y, 'text');
      count(f.lost, x + 40, y, this.tint('text', { r: 32, g: 0, b: 0 }));
    }
    this.pool(this.digitSprites, digits.length).forEach((sprite, index) => {
      const digit = digits[index];
      sprite.setVisible(!!digit);
      if (!digit) return;
      const texture = this.textures.get(digit.key);
      const frame = String(digit.digit);
      if (!texture.has(frame))
        texture.add(frame, 0, digit.digit * 16, 0, 10, 16);
      sprite
        .setTexture(digit.key, frame)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(150.1)
        .setPosition(...screen(digit.x, digit.y));
    });
  }

  // Op 0x23's offsets add to each 5-bit palette channel, clamped (0x40d070);
  // each tinted image is drawn once and cached.
  private tint(key: string, { r, g, b }: Pick<Color, 'r' | 'g' | 'b'>) {
    if (!r && !g && !b) return key;
    const tinted = `${key}:${r},${g},${b}`;
    if (this.textures.exists(tinted)) return tinted;
    const source = this.textures.get(key).getSourceImage() as
      HTMLImageElement | HTMLCanvasElement;
    const canvas = this.textures.createCanvas(
      tinted,
      source.width,
      source.height,
    )!;
    canvas.context.drawImage(source, 0, 0);
    const pixels = canvas.getData(0, 0, source.width, source.height);
    const shift = (value: number, by: number) => {
      const channel = Math.min(31, Math.max(0, (value >> 3) + by));
      return (channel << 3) | (channel >> 2);
    };
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = shift(pixels.data[i], r);
      pixels.data[i + 1] = shift(pixels.data[i + 1], g);
      pixels.data[i + 2] = shift(pixels.data[i + 2], b);
    }
    canvas.putData(pixels, 0, 0).refresh();
    return tinted;
  }

  // An object draws with its owner's palette when it comes from the owner's
  // container (kinds 0 and 1); the stage's and the KGT's have one.
  private paletteOf(who: Container, owner: number) {
    return this.match.fighters[owner]?.who === who ? this.palettes[owner] : 0;
  }

  // Each object's colour as the match held it at its last draw, and what it
  // drew (drawnColor). Authored: a type-3 fader rolls its own rand, not the
  // shared one, as the type-4 shake does.
  private drawn = new WeakMap<Fighter | Effect, [Color, Color]>();
  private faded(actor: Fighter | Effect, owner: number): Color {
    const drawn = drawnColor(
      actor.color,
      this.match.fighters[owner].fader,
      this.frame,
      Math.floor(Math.random() * 100),
      this.drawn.get(actor),
    );
    this.drawn.set(actor, drawn);
    return drawn[1];
  }

  // Blitters 0x40c840 by op 0x23 mode: 1 averages with the screen, 2 adds,
  // 4 fades by fade/32.
  private paint(
    sprite: Phaser.GameObjects.Image,
    pose: Pose,
    color: Color,
    who: Container,
    palette = 0,
  ) {
    if (isBlank(pose, who)) return sprite.setVisible(false);
    return sprite
      .setVisible(true)
      .setTexture(this.texture(pose.image, color, who, palette))
      .setBlendMode(
        color.mode === 2 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      )
      .setAlpha(color.mode === 1 ? 0.5 : 1 - color.fade / 32);
  }

  private place(
    sprite: Phaser.GameObjects.Image,
    who: Container,
    pose: Pose,
    x: number,
    y: number,
    facing: -1 | 1,
    color = pose.color ?? NORMAL_COLOR,
    palette = 0,
  ) {
    const p = placement(
      pose,
      pose.width,
      pose.height,
      x / ART_SCALE,
      y / ART_SCALE,
      facing === -1,
    );
    this.paint(sprite, pose, color, who, palette)
      .setOrigin(0)
      .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
      .setFlip(p.flip_x, p.flip_y);
  }

  private pose(index: number): Pose {
    const f = this.match.fighters[index];
    if (f.action === 'idle') {
      const frame = this.idle[index].frame!;
      const image = CHARACTERS[f.who].images.find(
        (image) => image.index === frame.image,
      )!;
      return { ...frame, width: image.width, height: image.height };
    }
    return fighterPose(f);
  }

  update(_time: number, delta: number) {
    if (!this.ready || this.error || this.loading) return;
    try {
      if (this.select) {
        if (!this.paused)
          this.clock.advance(delta, () => {
            // A screen that finished waits for what it opens to load.
            if (!this.select || this.loading) return;
            const controls = new Set([
              ...this.virtual,
              ...this.pressed,
              ...[...this.held].map((key) => keyMap[key]),
            ]);
            this.pressed.clear();
            this.stepSelect(
              Object.fromEntries(
                [...controls].map((control) => [control, true]),
              ),
            );
          });
        if (this.select) {
          this.drawSelect();
          this.report();
          return;
        }
      }
      if (!this.paused && !this.match.resultReady)
        this.clock.advance(delta, () => {
          // The match is over once it opens a screen or loads the next.
          if (this.select || this.loading) return;
          const controls = new Set([
            ...this.virtual,
            ...this.pressed,
            ...[...this.held].map((key) => keyMap[key]),
          ]);
          this.pressed.clear();
          const frozen = this.match.fighters.map((f) => f.hitStop > 0);
          const { round } = this.match;
          this.match.step(
            Object.fromEntries([...controls].map((control) => [control, true])),
          );
          if (this.match.round !== round) this.resetIdle();
          this.roundPalettes();
          if (this.match.resultReady) this.matchOver();
          // A sound a fighter's export lacks is an empty one, which stops
          // every sound (0x4034e0): TRAINING's 開始時 ERROR's (PC 256).
          for (const { owner, index } of this.match.sounds) {
            const key = `${this.match.fighters[owner]?.who}-sound-${index}`;
            if (owner < 0) this.stageSound(index);
            else if (this.cache.audio.exists(key)) this.play(key, owner);
            else this.sound.stopAll();
          }
          for (const index of letteringSounds(this.match))
            this.play(`kgt-sound-${index}`);
          this.idle.forEach((vm, i) => {
            const f = this.match.fighters[i];
            if (!f.present || frozen[i] || f.hitStop > 0) return;
            if (f.action !== 'idle') {
              this.idling[i] = false;
              return;
            }
            // Entering action 1 starts its program again (0x410cf0).
            if (vm.ended || !this.idling[i]) this.idle[i] = idleVM(f, vm.seed);
            this.idling[i] = true;
            this.idle[i].life = f.hp;
            this.idle[i].tick();
            for (const index of this.idle[i].sounds.splice(0))
              this.play(`${f.who}-sound-${index}`, i);
          });
        });
      for (const axis of ['x', 'y'] as const) {
        const quake = this.match.quake[axis];
        if (quake !== this.quake[axis] && quake)
          this.shake[axis] = { ...quake, offset: 0, left: quake.frames };
        // ponytail: the source's type-4 shake draws from the shared rand
        // (0x417a22) once per drawn frame, so its later rolls depend on the
        // display rate; this one keeps its own so the 10 ms match stays
        // deterministic.
        stepShake(this.shake[axis], this.frame, () =>
          Math.floor(Math.random() * 32768),
        );
      }
      this.quake = this.match.quake;
      // World objects draw at their position less the scroll and the shake
      // (0x40d82f); viewport objects and the HUD do not move.
      this.cameras.main.setScroll(
        this.match.cameraX + this.shake.x.offset * ART_SCALE,
        this.match.cameraY + this.shake.y.offset * ART_SCALE,
      );
      // A stage object draws its display's top left at its offset, less the
      // scroll times its start record's percentages (0x40da41–0x40dcf3), so
      // a 0% one stays on the screen. It adds the shake whole (0x40da94),
      // moving opposite the world objects, where Phaser takes it from the
      // camera scaled by the percentages.
      const { layers } = this.match;
      const setup = 2 + STAGES[this.match.stage].objects.length;
      const shake = {
        x: this.shake.x.offset * ART_SCALE,
        y: this.shake.y.offset * ART_SCALE,
      };
      this.pool(this.layerSprites, layers.length).forEach((sprite, index) => {
        const layer = layers[index];
        sprite.setVisible(!!layer && layer.age >= 0);
        if (!layer || layer.age < 0) return;
        const pose = animationFrame(layer.clip, layer.age, layer.who);
        const { x, y } = layer.stage!;
        this.paint(sprite, pose, layer.color, layer.who)
          .setOrigin(0)
          .setDepth(objectDepth(layer, setup))
          .setScrollFactor(x / 100, y / 100)
          .setPosition(
            layer.x + pose.dx * ART_SCALE + shake.x * (1 + x / 100),
            layer.y +
              (920 + pose.dy - 4.8 * y) * ART_SCALE +
              shake.y * (1 + y / 100),
          )
          .setFlip(pose.flip_x, pose.flip_y);
      });
      this.growFighters(this.match.fighters.length);
      this.sprites.forEach((sprite, i) => {
        const f = this.match.fighters[i];
        // A story's player draws once it has entered and shown a display.
        if (!f?.present || !f.shown) {
          sprite.setVisible(false);
          this.shadows[i].setVisible(false);
          this.blacks[i].setVisible(false);
          return;
        }
        this.shadows[i].setVisible(true);
        const pose = this.pose(i);
        // A held pose places by its holder's facing.
        const by = f.caught;
        const holder =
          (by && !('clip' in by) ? by : this.match.fighters[1 - i]) ?? f;
        const p = (pose.held ? heldPlacement : placement)(
          pose,
          pose.width,
          pose.height,
          f.x / ART_SCALE,
          (GROUND + f.y) / ART_SCALE,
          (pose.held ? holder : f).facing === -1,
        );
        this.paint(sprite, pose, this.faded(f, i), f.who, this.palettes[i])
          .setDepth(depthOf(f.z, i))
          .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
          .setFlip(p.flip_x, p.flip_y);
        const { shown } = f.black;
        if (shown === 'none') this.blacks[i].setVisible(false);
        else
          this.place(
            this.blacks[i],
            f.who,
            BLACK[f.who][shown],
            327 * ART_SCALE,
            498 * ART_SCALE,
            1,
            undefined,
            this.palettes[i],
          );
        const shadow = this.shadows[i];
        shadow
          .setPosition(f.x, GROUND - 1)
          .setAlpha(Math.max(0.1, 0.3 + f.y / 1000));
      });
      const { effects } = this.match;
      this.pool(this.effectSprites, effects.length).forEach((sprite, index) => {
        const effect = effects[index];
        // The draw lists only the objects alive at the tick's start
        // (0x404df1), and one yet to step has no display.
        sprite.setVisible(!!effect && effect.age >= 0);
        if (!effect || effect.age < 0) return;
        // Viewport objects (op 0x04 flag 0x40) ignore the camera.
        const pose = animationFrame(effect.clip, effect.age, effect.who);
        // A KGT object draws its display's top left at its offset (0x40d39b),
        // with no player's fader or palette.
        if (effect.who === 'kgt') {
          this.paint(sprite, pose, effect.color, effect.who)
            .setDepth(objectDepth(effect, setup))
            .setScrollFactor(1)
            .setOrigin(0)
            .setFlip(false, false)
            .setPosition(
              effect.x + pose.dx * ART_SCALE,
              GROUND + effect.y + pose.dy * ART_SCALE,
            );
          return;
        }
        this.place(
          sprite
            .setDepth(objectDepth(effect, setup))
            .setScrollFactor(effect.screen ? 0 : 1),
          effect.who,
          pose,
          effect.x,
          effect.screen ? effect.y : GROUND + effect.y,
          effect.facing,
          this.faded(effect, effect.owner),
          this.paletteOf(effect.who, effect.owner),
        );
      });
      // Each object draws its afterimages, oldest first, just before itself
      // (0x40cd15–0x40d4cf).
      const afterimages = [...this.match.fighters, ...effects].flatMap(
        (actor, index) => {
          const { trail } = actor;
          if (!trail) return [];
          const object = 'clip' in actor ? actor : null;
          const depth = object
            ? objectDepth(object, setup)
            : this.sprites[index].depth;
          const skipped = trail.spec.count - trail.samples.length;
          const owner = object?.owner ?? index;
          return trail.samples.map((sample, i) => ({
            ...sample,
            who: actor.who,
            palette: this.paletteOf(actor.who, owner),
            depth: depth - 1e-8 + i * 1e-10,
            screen: object?.screen ?? false,
            color: afterimageColor(
              trail,
              skipped + i,
              this.faded(actor, owner),
            ),
          }));
        },
      );
      this.pool(this.trailSprites, afterimages.length).forEach(
        (sprite, index) => {
          const image = afterimages[index];
          sprite.setVisible(!!image);
          if (!image) return;
          this.place(
            sprite.setDepth(image.depth).setScrollFactor(image.screen ? 0 : 1),
            image.who,
            image.pose,
            image.x,
            image.screen ? image.y : GROUND + image.y,
            image.facing,
            image.color,
            image.palette,
          );
        },
      );
      this.drawLifeBars();
      this.frame++;
      this.updateHud?.(this.match);
      this.report();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.paused = true;
      this.report();
    }
  }

  private report() {
    const [a] = this.match.fighters;
    const b = this.match.rival ?? this.match.fighters[1] ?? a;
    // A story battle's result goes once the story moves on.
    const over = this.match.resultReady && !(this.select && this.match.battle);
    const status: GameStatus = {
      ready: this.ready,
      paused: this.paused,
      hp: [a.hp, b.hp],
      life: [lifeOf(a.who), lifeOf(b.who)],
      seconds: this.match.seconds,
      hits: a.hits,
      damage: a.damage,
      // Zoma's moves are source actions, named by number.
      action:
        a.action === 'script'
          ? `action ${a.branch}`
          : a.action.replace(/([A-Z])/g, ' $1'),
      winner: this.match.winner,
      matchWinner: over ? this.match.matchWinner : null,
      resultReady: over,
      error: this.error,
      selecting: !!this.select,
      fighters: [this.fighter, this.opponent],
      story: !this.select && !!this.match.battle,
      mode: this.match.mode,
    };
    const serialized = JSON.stringify(status);
    if (serialized !== this.lastStatus) {
      this.lastStatus = serialized;
      this.onStatus(status);
    }
  }
}

// An exported title or select-screen image's size: a demo's ('t1', 't2',
// 'select'), the KGT's ('ui') or a player's.
const selectSizes = new Map<string, { width: number; height: number }>(
  [
    ...Object.entries(DEMOS).flatMap(([demo, { images }]) =>
      images.map((i) => [`${demo}-${i.index}`, i] as const),
    ),
    ...ui.images.map((i) => [`ui-${i.index}`, i] as const),
    ...Object.entries(CHARACTERS).flatMap(([who, { images }]) =>
      images.map((i) => [`${who}-${i.index}`, i] as const),
    ),
  ].map(([key, { width, height }]) => [key, { width, height }]),
);
const selectImage = (prefix: string, image: number) =>
  selectSizes.get(`${prefix}-${image}`);

export function createGame(
  parent: HTMLElement,
  onStatus: (status: GameStatus) => void,
) {
  const scene = new TrainingScene(onStatus);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: WIDTH,
    height: HEIGHT,
    backgroundColor: '#191c21',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    banner: false,
    // The art may come from another origin (the R2 bucket); WebGL refuses
    // those textures unless the request is CORS.
    loader: { crossOrigin: 'anonymous' },
  });
  return { game, scene };
}
