import Phaser from 'phaser';
import { CHARACTERS, lifeOf, STAGES } from './characters';
import type { Container, Stage, Who } from './characters';
import ui from './generated/ui.json';
import { createHud, letteringSounds } from './hud';
import { StandingVM, heldPlacement, placement } from './standing';
import { animationFrame, BLACK, isBlank, NORMAL_COLOR } from './animations';
import type { Color, Pose } from './animations';
import {
  afterimageColor,
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
};
const ART_SCALE = 1.5;
// A viewport object behind the fighters (the KO flash, z 15 like action 43)
// sits over the court. Within its band a higher z draws in front: ANMC P's
// EN300 cut-in (305, z 50) over its background (304, z 49).
const effectDepth = (e: Effect) =>
  (e.z >= FIGHTER_Z ? (e.screen ? 5 : 4) : e.screen ? 0.6 : 1) + e.z / 1000;
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
// (EX mode).
const idleVM = (f: Fighter, seed?: number) =>
  new StandingVM(CHARACTERS[f.who].idle, seed, 10, {
    0x40: f.variables[0] ?? 0,
  });

export class TrainingScene extends Phaser.Scene {
  private fighter: Who = 'ryuko';
  private opponent: Who = 'zoma';
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
  // Authored: the stage's looping track, off by default and loaded on first
  // use. The original plays it only after SIN's, KAY's or DIDO's supers; like
  // a stage load (0x40677c), each match starts it over.
  private music = false;
  private track?: Phaser.Sound.BaseSound;

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
    this.updateHud = createHud(this);
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
    if (!e.repeat && e.code === 'KeyR') this.reset(this.match.mode);
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
    if (!this.ready || this.match.resultReady) return;
    this.paused = !this.paused;
    if (this.paused) this.sound.pauseAll();
    else this.sound.resumeAll();
    this.clearInput();
    this.report();
  }
  setPractice(options: PracticeOptions) {
    this.practice = { ...options };
    this.match.practice = { ...options };
  }
  setFighter(who: Who) {
    this.fighter = who;
    this.reset(this.match.mode);
  }
  setOpponent(who: Who) {
    this.opponent = who;
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
    );
    this.match.practice = { ...this.practice };
    this.sound.stopAll();
    this.playMusic();
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
    this.playMusic();
  }
  private playMusic() {
    this.track?.stop();
    if (!this.music) return;
    const key = `music-${this.stage}`;
    if (!this.cache.audio.exists(key)) {
      this.load.audio(key, BASE + STAGES[this.stage].music.filename);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => this.playMusic());
      this.load.start();
      return;
    }
    this.track = this.sound.get(key) ?? this.sound.add(key, { loop: true });
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

  // Op 0x23's offsets add to each 5-bit palette channel, clamped (0x40d070);
  // each tinted image is drawn once and cached.
  private texture(image: number, { r, g, b }: Color, who: Container) {
    const key = `${who}-${image}`;
    if (!r && !g && !b) return key;
    const tinted = `${key}:${r},${g},${b}`;
    if (this.textures.exists(tinted)) return tinted;
    const source = this.textures.get(key).getSourceImage() as HTMLImageElement;
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

  // A running type-2 fader shows its start colour on odd drawn frames
  // (0x40cb72; 0x4456fc counts them).
  private faded(color: Color, owner: number): Color {
    const { fader } = this.match.fighters[owner];
    return fader?.type === 2 && fader.left && this.frame & 1
      ? { ...color, ...fader.start }
      : color;
  }

  // Blitters 0x40c840 by op 0x23 mode: 1 averages with the screen, 2 adds,
  // 4 fades by fade/32.
  private paint(
    sprite: Phaser.GameObjects.Image,
    pose: Pose,
    color: Color,
    who: Container,
  ) {
    if (isBlank(pose, who)) return sprite.setVisible(false);
    return sprite
      .setVisible(true)
      .setTexture(this.texture(pose.image, color, who))
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
  ) {
    const p = placement(
      pose,
      pose.width,
      pose.height,
      x / ART_SCALE,
      y / ART_SCALE,
      facing === -1,
    );
    this.paint(sprite, pose, color, who)
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
          for (const { owner, index } of this.match.sounds)
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
            this.idle[i].tick();
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
        // Op 0x07 flag bit 0 draws the held victim behind its holder.
        const behind =
          f.action === 'superHeld'
            ? ((f.held?.flags ?? 0) & 1) !== 0
            : undefined;
        // A KO (0x40e8cd) drops the fighter to z 0x3c, behind the other
        // fighter and the objects drawn behind it.
        this.paint(sprite, pose, this.faded(f.color, i), f.who)
          .setDepth(
            f.hp === 0 ? 0.9 : behind === undefined ? 2 : behind ? 1 : 3,
          )
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
          return trail.samples.map((sample, i) => ({
            ...sample,
            who: actor.who,
            depth: depth - 0.1,
            screen: object?.screen ?? false,
            color: afterimageColor(
              trail,
              skipped + i,
              this.faded(actor.color, object?.owner ?? index),
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
    };
    const serialized = JSON.stringify(status);
    if (serialized !== this.lastStatus) {
      this.lastStatus = serialized;
      this.onStatus(status);
    }
  }
}

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
