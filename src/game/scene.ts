import Phaser from 'phaser';
import { CHARACTERS, lifeOf, STAGES } from './characters';
import type { Container, Stage, Who } from './characters';
import ui from './generated/ui.json';
import selectData from './generated/select.json';
import t1 from './generated/t1.json';
import t2 from './generated/t2.json';
import { battlePalettes, CharacterSelect, Title } from './select';
import type { SelectObject } from './select';
import { createHud, letteringSounds } from './hud';
import { StandingVM, heldPlacement, placement } from './standing';
import { animationFrame, BLACK, isBlank, NORMAL_COLOR } from './animations';
import type { Color, Pose } from './animations';
import {
  afterimageColor,
  faderColor,
  fighterPose,
  FIGHTER_Z,
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
};
const ART_SCALE = 1.5;
const DEMOS = { select: selectData, t1, t2 };
// The draw walks the priority lists lowest first, the players' slots before
// any object's within one (0x404df1). A viewport object behind the fighters
// (the KO flash, z 15 like action 43) sits over the court. Within its band a
// higher z draws in front: ANMC P's EN300 cut-in (305, z 50) over its
// background (304, z 49).
const worldDepth = (z: number, slot: number) => 1 + (z + slot / 4) / 1000;
const effectDepth = (e: Effect) =>
  e.screen ? (e.z >= FIGHTER_Z ? 5 : 0.6) + e.z / 1000 : worldDepth(e.z, 2);
const still = (): ShakeAxis => ({
  type: 0,
  amplitude: 0,
  frames: 0,
  offset: 0,
  left: 0,
});
// Authored: each match seeds its CPU afresh.
const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
const BASE = `${import.meta.env.BASE_URL}assets/`;
const keyMap: Record<string, Control> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  ArrowDown: 'crouch',
  KeyS: 'crouch',
  KeyJ: 'punch',
  KeyK: 'kick',
  KeyH: 'hitUp',
  KeyF: 'iori',
  KeyL: 'guard',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyU: 'drill',
  KeyI: 'axe',
  KeyO: 'throw',
  KeyG: 'dst',
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
  // VS paths (global 3 at 50), as VS single's do.
  private chosen = false;
  private stage: Stage = 'court';
  private wantedStage = this.stage;
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
  // The title, which the game opens on, then the select screen.
  private select: Title | CharacterSelect | null = new Title();
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
    for (const [who, { images }] of Object.entries(CHARACTERS))
      for (const image of images)
        this.load.image(`${who}-${image.index}`, BASE + image.filename);
    for (const image of ui.images)
      this.load.image(`ui-${image.index}`, BASE + image.filename);
    for (const [demo, { images, sounds }] of Object.entries(DEMOS)) {
      for (const image of images)
        this.load.image(`${demo}-${image.index}`, BASE + image.filename);
      for (const sound of sounds)
        this.load.audio(`${demo}-sound-${sound.index}`, BASE + sound.filename);
    }
    for (const [who, { sounds }] of Object.entries(CHARACTERS))
      for (const sound of sounds)
        this.load.audio(`${who}-sound-${sound.index}`, BASE + sound.filename);
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
    for (const f of this.match.fighters) {
      // Action 43, a viewport object at (327, 498) in bucket 15 (op 0x04
      // flags 0x46 at PCs 300/325): over the court, behind every object.
      this.blacks.push(
        this.add
          .image(0, 0, 'ryuko-294')
          .setScale(ART_SCALE)
          .setScrollFactor(0)
          .setDepth(0.5)
          .setVisible(false),
      );
      this.shadows.push(
        this.add.ellipse(f.x, GROUND - 1, 94, 13, 0x171311, 0.3),
      );
      this.sprites.push(
        this.add.image(f.x, GROUND, 'ryuko-3').setOrigin(0).setScale(ART_SCALE),
      );
    }
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
      if (this.select instanceof Title) this.openTitle();
      else if (this.select) this.openSelect();
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
  private openTitle() {
    this.open(new Title());
  }
  private open(screen: Title | CharacterSelect) {
    this.select = screen;
    this.sound.stopAll();
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
      // Authored: the title's 126-second track (T2's sound 1) and the select
      // screen's 57-second one (CHAR SELECT's) play only with Music ticked,
      // as the stages' do.
      if ((container === 't2' || container === 'select') && index === 1) {
        if (this.music) {
          const key = `${container}-sound-1`;
          this.selectTrack = this.sound.get(key) ?? this.sound.add(key);
          this.selectTrack.play();
        }
        continue;
      }
      // CHAR SELECT's sound 0, which its closing panels cue, is empty.
      const key = `${container}-sound-${index}`;
      if (this.cache.audio.exists(key)) this.play(key);
    }
    if (!select.done) return;
    if (select instanceof Title) return this.openSelect();
    [this.fighter, this.opponent] = select.done;
    this.chosen = true;
    this.palettes = battlePalettes(select.palettes);
    this.select = null;
    this.selectTrack?.stop();
    for (const sprite of this.selectSprites) sprite.setVisible(false);
    this.reset(this.match.mode);
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
    const player = !(o.container in DEMOS) && o.container !== 'kgt';
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
    this.reset(this.match.mode);
  }
  setOpponent(who: Who) {
    this.opponent = who;
    this.chosen = false;
    this.reset(this.match.mode);
  }
  // A stage's images load when it is first picked; the current one plays on
  // until they arrive.
  setStage(stage: Stage) {
    this.wantedStage = stage;
    const start = () => {
      if (this.wantedStage !== stage) return;
      this.stage = stage;
      this.reset(this.match.mode);
    };
    if (this.textures.exists(`${stage}-${STAGES[stage].images[0].index}`))
      return start();
    this.loadStage(stage);
    this.load.once(Phaser.Loader.Events.COMPLETE, start);
    this.load.start();
  }
  private loadStage(stage: Stage) {
    for (const image of STAGES[stage].images)
      this.load.image(`${stage}-${image.index}`, BASE + image.filename);
  }
  reset(mode: Mode) {
    // Vs. CPU rounds open with the recovered walk-in; practice starts at once.
    this.match = new Match(
      mode,
      mode === 'cpu',
      randomSeed(),
      [this.fighter, this.opponent],
      this.stage,
      this.chosen && mode === 'cpu',
    );
    this.match.practice = { ...this.practice };
    this.sound.stopAll();
    this.cue = undefined;
    this.shake = { x: still(), y: still() };
    this.quake = this.match.quake;
    this.resetIdle();
    this.paused = false;
    this.clearInput();
    this.report();
  }

  // Each round's fighters start their idle programs afresh.
  private resetIdle() {
    this.idle = this.match.fighters.map((f, i) => idleVM(f, i));
    this.idling = [true, true];
    this.idle.forEach((vm) => vm.tick());
  }

  setMusic(on: boolean) {
    this.music = on;
    if (this.select) {
      if (!on) this.selectTrack?.stop();
      return;
    }
    this.playMusic();
  }
  // A sound the stage's export lacks is its empty one, which stops every
  // sound (0x4034e0).
  private stageSound(index: number) {
    this.cue = STAGES[this.stage].sounds.find((s) => s.index === index);
    if (this.cue) this.playMusic();
    else this.sound.stopAll();
  }
  private playMusic() {
    this.track?.stop();
    const cue = this.cue;
    if (!this.music || !cue) return;
    const key = `${this.stage}-sound-${cue.index}`;
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
  private pool(sprites: Phaser.GameObjects.Image[], count: number) {
    while (sprites.length < count)
      sprites.push(
        this.add
          .image(0, 0, 'ryuko-424')
          .setScale(ART_SCALE)
          .setDepth(4)
          .setVisible(false),
      );
    return sprites;
  }

  // A player's objects draw with its palette (0x40ccf2), but for images with
  // their own; each recoloured image is drawn once and cached.
  private recolored(image: number, who: Container, palette: number) {
    const key = `${who}-${image}`;
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

  // A running type-2 fader shows its start colour on odd drawn frames
  // (0x40cb72; 0x4456fc counts them), and a type-3 one blends at rand() %
  // 100 each draw (0x40cacf): ANMC P's K 2 (210, PC 2774). ponytail: that
  // rand is the shared one, as the type-4 shake's, and its last blend stays
  // until an op 0x23 (K 2's at age 55); this one keeps its own and leaves
  // the start colour.
  private faded(color: Color, owner: number): Color {
    const { fader } = this.match.fighters[owner];
    if (!fader?.left) return color;
    if (fader.type === 2 && this.frame & 1) return { ...color, ...fader.start };
    if (fader.type === 3)
      return {
        ...color,
        ...faderColor(fader, Math.floor(Math.random() * 100)),
      };
    return color;
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
    if (!this.ready || this.error) return;
    try {
      if (this.select) {
        if (!this.paused)
          this.clock.advance(delta, () => {
            if (!this.select) return;
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
          // A won Vs. match returns to the select screen (state 902 spawns
          // object type 10, 0x40982b).
          if (this.match.resultReady) this.openSelect();
          for (const { owner, index } of this.match.sounds)
            if (owner < 0) this.stageSound(index);
            else
              this.play(
                `${this.match.fighters[owner].who}-sound-${index}`,
                owner,
              );
          for (const index of letteringSounds(this.match))
            this.play(`kgt-sound-${index}`);
          this.idle.forEach((vm, i) => {
            const f = this.match.fighters[i];
            if (frozen[i] || f.hitStop > 0) return;
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
          .setDepth(layer.z < FIGHTER_Z ? 0.1 : 4.5)
          .setScrollFactor(x / 100, y / 100)
          .setPosition(
            layer.x + pose.dx * ART_SCALE + shake.x * (1 + x / 100),
            layer.y +
              (920 + pose.dy - 4.8 * y) * ART_SCALE +
              shake.y * (1 + y / 100),
          )
          .setFlip(pose.flip_x, pose.flip_y);
      });
      this.sprites.forEach((sprite, i) => {
        const f = this.match.fighters[i];
        const pose = this.pose(i);
        const holder = this.match.fighters[1 - i];
        const p = (pose.held ? heldPlacement : placement)(
          pose,
          pose.width,
          pose.height,
          f.x / ART_SCALE,
          (GROUND + f.y) / ART_SCALE,
          (pose.held ? holder : f).facing === -1,
        );
        this.paint(
          sprite,
          pose,
          this.faded(f.color, i),
          f.who,
          this.palettes[i],
        )
          .setDepth(worldDepth(f.z, i))
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
        this.place(
          sprite
            .setDepth(effectDepth(effect))
            .setScrollFactor(effect.screen ? 0 : 1),
          effect.who,
          pose,
          effect.x,
          effect.screen ? effect.y : GROUND + effect.y,
          effect.facing,
          this.faded(effect.color, effect.owner),
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
            ? effectDepth(object)
            : this.sprites[index].depth;
          const skipped = trail.spec.count - trail.samples.length;
          const owner = object?.owner ?? index;
          return trail.samples.map((sample, i) => ({
            ...sample,
            who: actor.who,
            palette: this.paletteOf(actor.who, owner),
            depth: depth - 1e-4,
            screen: object?.screen ?? false,
            color: afterimageColor(
              trail,
              skipped + i,
              this.faded(actor.color, owner),
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
    const [a, b] = this.match.fighters;
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
      matchWinner: this.match.resultReady ? this.match.matchWinner : null,
      resultReady: this.match.resultReady,
      error: this.error,
      selecting: !!this.select,
      fighters: [this.fighter, this.opponent],
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
const selectSizes = new Map(
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
  });
  return { game, scene };
}
