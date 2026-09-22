import Phaser from 'phaser';
import data from './generated/assets.json';
import ui from './generated/ui.json';
import { createHud } from './hud';
import { StandingVM, placement } from './standing';
import { animationDuration, animationFrame, throwHold } from './animations';
import type { Pose } from './animations';
import { FixedClock, GROUND, HEIGHT, Match, WIDTH } from './match';
import type { Control, Mode } from './match';

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
  hp: [100, 100],
  seconds: Infinity,
  hits: 0,
  damage: 0,
  action: 'idle',
  winner: null,
  resultReady: false,
  error: '',
};
const ART_SCALE = 1.5;
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
  KeyL: 'guard',
  ShiftLeft: 'dash',
  ShiftRight: 'dash',
  KeyU: 'drill',
  KeyI: 'axe',
  KeyO: 'throw',
};

export class TrainingScene extends Phaser.Scene {
  match = new Match();
  paused = false;
  private clock = new FixedClock();
  private held = new Set<string>();
  private virtual = new Set<Control>();
  private pressed = new Set<Control>();
  private sprites: Phaser.GameObjects.Image[] = [];
  private shadows: Phaser.GameObjects.Ellipse[] = [];
  private projectileSprites: Phaser.GameObjects.Image[] = [];
  private idle = [new StandingVM(data.idle), new StandingVM(data.idle, 1)];
  private impactSprites: Phaser.GameObjects.Image[][] = [];
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
      this.shadows.push(
        this.add.ellipse(f.x, GROUND - 1, 94, 13, 0x171311, 0.3),
      );
      this.sprites.push(
        this.add.image(f.x, GROUND, 'ryuko-3').setOrigin(0).setScale(ART_SCALE),
      );
    }
    this.projectileSprites = this.match.fighters.map(() =>
      this.add
        .image(0, 0, 'ryuko-424')
        .setScale(ART_SCALE)
        .setDepth(4)
        .setVisible(false),
    );
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
  reset(mode: Mode) {
    this.match = new Match(mode);
    this.idle = [new StandingVM(data.idle), new StandingVM(data.idle, 1)];
    this.idle.forEach((vm) => vm.tick());
    this.paused = false;
    this.clearInput();
    this.report();
  }

  private pose(index: number): Pose {
    const f = this.match.fighters[index];
    if (f.action === 'idle') {
      const frame = this.idle[index].frame!;
      const image = data.images.find((image) => image.index === frame.image)!;
      return { ...frame, width: image.width, height: image.height };
    }
    return animationFrame(f.action, f.action === 'jump' ? f.airAge : f.age);
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
      this.cameras.main.setScroll(this.match.cameraX, this.match.cameraY);
      this.sprites.forEach((sprite, i) => {
        const f = this.match.fighters[i];
        const pose = this.pose(i);
        const p = placement(
          pose,
          pose.width,
          pose.height,
          f.x / ART_SCALE,
          (GROUND + f.y) / ART_SCALE,
          f.facing === -1,
        );
        sprite
          .setTexture(`ryuko-${pose.image}`)
          .setDepth(
            f.action === 'grabbed' ? (throwHold(f.age).behind ? 1 : 3) : 2,
          )
          .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
          .setFlip(p.flip_x, p.flip_y);
        const shadow = this.shadows[i];
        shadow
          .setPosition(f.x, GROUND - 1)
          .setAlpha(Math.max(0.1, 0.3 + f.y / 1000));
      });
      this.projectileSprites.forEach((sprite, owner) => {
        const projectile = this.match.projectiles.find(
          (p) => p.owner === owner,
        );
        sprite.setVisible(!!projectile);
        if (!projectile) return;
        const pose = animationFrame(
          projectile.hit ? 'axeHit' : 'axeFlight',
          projectile.age,
        );
        // Projectile flight uses an authored center anchor, independent of fighter offsets.
        sprite
          .setTexture(`ryuko-${pose.image}`)
          .setPosition(projectile.x, GROUND + projectile.y)
          .setFlipX(projectile.facing === -1);
      });
      this.updateHud?.(this.match);
      while (this.impactSprites.length < this.match.impacts.length) {
        this.impactSprites.push(
          [0, 1].map(() =>
            this.add
              .image(0, 0, 'ryuko-160')
              .setOrigin(0)
              .setScale(ART_SCALE)
              .setDepth(20)
              .setBlendMode(Phaser.BlendModes.ADD),
          ),
        );
      }
      this.impactSprites.forEach((layers, index) => {
        const impact = this.match.impacts[index];
        layers.forEach((sprite, layer) => {
          const visible =
            !!impact &&
            (layer === 0 ||
              (!impact.blocked &&
                impact.heavy &&
                impact.age < animationDuration('hitStreak')));
          sprite.setVisible(visible);
          if (!visible) return;
          const pose = animationFrame(
            layer === 0 ? impact.effect : 'hitStreak',
            impact.age,
          );
          const p = placement(
            pose,
            pose.width,
            pose.height,
            impact.x / ART_SCALE,
            impact.y / ART_SCALE,
            impact.facing === -1,
          );
          sprite
            .setTexture(`ryuko-${pose.image}`)
            .setPosition(p.left * ART_SCALE, p.top * ART_SCALE)
            .setFlip(p.flip_x, p.flip_y);
        });
      });
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
