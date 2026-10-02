import Phaser from 'phaser';
import data from './generated/assets.json';
import ui from './generated/ui.json';
import { createHud } from './hud';
import { StandingVM, heldPlacement, placement } from './standing';
import {
  animationFrame,
  BLACK,
  dstHold,
  isBlank,
  NORMAL_COLOR,
} from './animations';
import type { Color, Pose } from './animations';
import {
  afterimageColor,
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
  Mode,
  PracticeOptions,
  ShakeAxis,
} from './match';

export interface GameStatus {
  ready: boolean;
  paused: boolean;
  hp: [number, number];
  seconds: number;
  hits: number;
  damage: number;
  action: string;
  winner: Match['winner'];
  resultReady: boolean;
  error: string;
}
export const initialStatus: GameStatus = {
  ready: false,
  paused: false,
  hp: [LIFE, LIFE],
  seconds: Infinity,
  hits: 0,
  damage: 0,
  action: 'idle',
  winner: null,
  resultReady: false,
  error: '',
};
const ART_SCALE = 1.5;
const effectDepth = (e: Effect) => (e.screen ? 5 : e.front ? 4 : 1);
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
  Digit1: 'getterBeam',
  Digit2: 'musashi',
  Digit3: 'changeAttack',
  Digit4: 'blackRush',
  Digit5: 'megaBeam',
};

export class TrainingScene extends Phaser.Scene {
  match = new Match('practice', false, randomSeed());
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
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private effectSprites: Phaser.GameObjects.Image[] = [];
  private trailSprites: Phaser.GameObjects.Image[] = [];
  // Op 0x0e's shake, stepped once per drawn frame like the source's draw
  // loop, and the drawn-frame count whose parity flips it.
  private shake: Record<'x' | 'y', ShakeAxis> = { x: still(), y: still() };
  private quake: Match['quake'] = { x: null, y: null };
  private frame = 0;
  private idle = [new StandingVM(data.idle), new StandingVM(data.idle, 1)];
  private ready = false;
  private error = '';
  private lastStatus = '';
  private updateHud?: ReturnType<typeof createHud>;

  constructor(private onStatus: (status: GameStatus) => void) {
    super('training');
  }

  preload() {
    this.load.image('court', `${BASE}sport-court.png`);
    for (const image of data.images)
      this.load.image(`ryuko-${image.index}`, BASE + image.filename);
    for (const image of ui.images)
      this.load.image(`ui-${image.index}`, BASE + image.filename);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.error = `Could not load ${file.key}. Run bun run assets, then reload.`;
      this.report();
    });
  }

  create() {
    if (this.error) return;
    // Mirror the single-screen court to extend it without a hard tile seam.
    for (const x of [0, WIDTH])
      this.add
        .image(x, HEIGHT - 960 * 1.5, 'court')
        .setOrigin(0)
        .setScale(1.5)
        .setFlipX(x !== 0);
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
    this.clearInput();
    this.report();
  }
  setPractice(options: PracticeOptions) {
    this.practice = { ...options };
    this.match.practice = { ...options };
  }
  reset(mode: Mode) {
    // Vs. CPU rounds open with the recovered walk-in; practice starts at once.
    this.match = new Match(mode, mode === 'cpu', randomSeed());
    this.match.practice = { ...this.practice };
    this.shake = { x: still(), y: still() };
    this.quake = this.match.quake;
    this.idle = [new StandingVM(data.idle), new StandingVM(data.idle, 1)];
    this.idle.forEach((vm) => vm.tick());
    this.paused = false;
    this.clearInput();
    this.report();
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
  private texture(image: number, { r, g, b }: Color) {
    const key = `ryuko-${image}`;
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
  private paint(sprite: Phaser.GameObjects.Image, pose: Pose, color: Color) {
    if (isBlank(pose)) return sprite.setVisible(false);
    return sprite
      .setVisible(true)
      .setTexture(this.texture(pose.image, color))
      .setBlendMode(
        color.mode === 2 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL,
      )
      .setAlpha(color.mode === 1 ? 0.5 : 1 - color.fade / 32);
  }

  private place(
    sprite: Phaser.GameObjects.Image,
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
    this.paint(sprite, pose, color)
      .setOrigin(0)
      .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
      .setFlip(p.flip_x, p.flip_y);
  }

  private pose(index: number): Pose {
    const f = this.match.fighters[index];
    if (f.action === 'idle') {
      const frame = this.idle[index].frame!;
      const image = data.images.find((image) => image.index === frame.image)!;
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
          this.match.step(
            Object.fromEntries([...controls].map((control) => [control, true])),
          );
          this.idle.forEach((vm, i) => {
            if (
              frozen[i] ||
              this.match.fighters[i].action !== 'idle' ||
              this.match.fighters[i].hitStop > 0
            )
              return;
            if (vm.ended) this.idle[i] = new StandingVM(data.idle, vm.seed);
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
        const behind =
          f.action === 'dstHeld'
            ? dstHold(holder.age)?.behind
            : f.action === 'superHeld'
              ? ((f.held?.flags ?? 0) & 1) !== 0
              : undefined;
        this.paint(sprite, pose, this.faded(f.color, i))
          .setDepth(behind === undefined ? 2 : behind ? 1 : 3)
          .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
          .setFlip(p.flip_x, p.flip_y);
        const { shown } = f.black;
        if (shown === 'none') this.blacks[i].setVisible(false);
        else
          this.place(
            this.blacks[i],
            BLACK[shown],
            327 * ART_SCALE,
            498 * ART_SCALE,
            1,
          );
        const shadow = this.shadows[i];
        shadow
          .setPosition(f.x, GROUND - 1)
          .setAlpha(Math.max(0.1, 0.3 + f.y / 1000));
      });
      const { projectiles, effects } = this.match;
      this.pool(this.projectileSprites, projectiles.length).forEach(
        (sprite, index) => {
          const projectile = projectiles[index];
          sprite.setVisible(!!projectile);
          if (!projectile) return;
          const pose = animationFrame(
            projectile.kind === 'missile'
              ? 'dstMissile'
              : projectile.hit
                ? 'axeHit'
                : 'axeFlight',
            projectile.age,
          );
          this.place(
            sprite,
            pose,
            projectile.x,
            GROUND + projectile.y,
            projectile.facing,
          );
        },
      );
      this.pool(this.effectSprites, effects.length).forEach((sprite, index) => {
        const effect = effects[index];
        sprite.setVisible(!!effect);
        if (!effect) return;
        // Viewport objects (op 0x04 flag 0x40) ignore the camera. A clip
        // effect's frames carry their colour; a source object's events set it.
        const pose = animationFrame(effect.clip, effect.age);
        this.place(
          sprite
            .setDepth(effectDepth(effect))
            .setScrollFactor(effect.screen ? 0 : 1),
          pose,
          effect.x,
          effect.screen ? effect.y : GROUND + effect.y,
          effect.facing,
          pose.color ?? this.faded(effect.color, effect.owner),
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
      seconds: this.match.seconds,
      hits: a.hits,
      damage: a.damage,
      action: a.action.replace(/([A-Z])/g, ' $1'),
      winner: this.match.winner,
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
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    banner: false,
  });
  return { game, scene };
}
