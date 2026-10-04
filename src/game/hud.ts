import type Phaser from 'phaser';
import { DESPERATION_HP, LIFE, POWER_PER_STOCK } from './match';
import type { Match } from './match';
import ui from './generated/ui.json';

// A KGT lettering: displays (image, ticks, top-left dx/dy in the 640 × 480
// screen, op 0x23 blit mode) with the sounds just before each, and the wait
// the round manager counts for it.
type Lettering = {
  wait: number;
  frames: {
    pc: number;
    image: number;
    duration: number;
    dx: number;
    dy: number;
    mode: number;
    sounds?: number[];
  }[];
};
const { ko, calls } = ui as unknown as {
  ko: Lettering;
  calls: { start: number } & Record<'logo' | 'dress' | 'fight', Lettering>;
};
export const KO_TICKS = ko.frames.reduce(
  (total, frame) => total + frame.duration,
  0,
);
// Leave the winner visible after the original lettering finishes.
export const ROUND_END_TICKS = KO_TICKS + 100;
// The round manager (0x408c24–0x408e41): round setup spawns the round-start
// animation (KGT 13) and counts its header's 350 ticks, then the round
// lettering (15, 'DRESS 1') and its 280, then the fight lettering (25, 'SHOW
// TIME') with round phase 1, when commands, the CPU and the timer start.
export const DRESS_TICK = calls.start + 1;
export const FIGHT_TICK = DRESS_TICK + calls.dress.wait;

function letteringFrame({ frames }: Lettering, age: number) {
  if (age < 0) return;
  for (const frame of frames) {
    if (age < frame.duration) return frame;
    age -= frame.duration;
  }
}
export const koFrame = (age: number) => letteringFrame(ko, age);

// The letterings a match shows, by age: in Vs. CPU the round-start logo wipe
// (13's 115), 'DRESS 1' and 'SHOW TIME'; then every result's KO lettering
// (26, or 28, 29, 32 and 33, which jump to it).
function letterings(match: Match): [Lettering, number][] {
  const shown: [Lettering, number][] = [];
  if (match.calls)
    shown.push(
      [calls.logo, match.roundTicks],
      [calls.dress, match.roundTicks - DRESS_TICK],
      [calls.fight, match.roundTicks - FIGHT_TICK],
    );
  if (match.winner) shown.push([ko, match.endingTicks]);
  return shown;
}

// The KGT sounds of the lettering displays starting at this tick.
export function letteringSounds(match: Match) {
  return letterings(match).flatMap(([{ frames }, age]) => {
    for (const frame of frames) {
      if (age === 0) return frame.sounds ?? [];
      age -= frame.duration;
    }
    return [];
  });
}

export function healthCrop(hp: number, right: boolean) {
  const width = Math.round((254 * Math.max(0, Math.min(LIFE, hp))) / LIFE);
  return { x: right ? 254 - width : 0, width };
}

// Object types 20/21 (0x40de1b/0x40de44) draw power × 126 / 100 pixels of the
// bar. Both keep the texture's right-hand columns; 2P shows them mirrored.
export function gaugeCrop(power: number) {
  const width = Math.floor((126 * Math.max(0, power)) / POWER_PER_STOCK);
  return { x: 126 - width, width };
}

// KGT actions 69/70: image 31 for 50 ticks, then shimmer frames 32–38.
export function gaugeImage(tick: number) {
  const time = tick % 85;
  return time < 50 ? 31 : 32 + Math.floor((time - 50) / 5);
}

// Action 70's HUD face: image 2001, or in EX mode 2002, 2001, 2000 and 2001
// for 40 ticks each (PCs 712–730).
export const faceImage = (face: number) =>
  face < 0 ? 2001 : [2002, 2001, 2000, 2001][Math.floor(face / 40) % 4];

// KGT actions 45–48 display the stock digits EMPTY, 100, 200 and 300.
const STOCK_OFFSETS = [
  [0, 0],
  [0, -1],
  [-4, -1],
  [-2, -2],
];

export function createHud(scene: Phaser.Scene) {
  // SCWU.KGT actions 60, 71–77, 103, 106–112 use a 640 × 480 screen.
  // Keep the recovered screen positions and pixels at a uniform 1.5× scale.
  const scale = 1.5;
  const image = (index: number, x: number, y: number) =>
    scene.add
      .image(x * scale, y * scale, `ui-${index}`)
      .setScrollFactor(0)
      .setOrigin(0)
      .setScale(scale)
      .setDepth(100);
  image(25, 22, 20);
  const life = [image(27, 22, 20), image(28, 364, 20)];
  image(24, 10, 5);
  image(39, 292, 13);
  image(40, 31, 37);
  image(41, 472, 37);
  // The faces' display offsets put each image's top-left corner on the
  // anchor; mirrored, the top-right one, at 609.
  const faces = [31, 539].map((x) =>
    scene.add
      .image(x * scale, 36 * scale, 'ryuko-2001')
      .setScrollFactor(0)
      .setOrigin(0)
      .setScale(scale)
      .setFlipX(x > 320)
      .setDepth(101),
  );
  // Name placement is authored; portrait anchors above come from actions 72/73.
  scene.add
    .image(106 * scale, 38 * scale, 'ryuko-464')
    .setScrollFactor(0)
    .setOrigin(0)
    .setScale(scale * 0.7)
    .setDepth(101);
  scene.add
    .image(474 * scale, 38 * scale, 'ryuko-464')
    .setScrollFactor(0)
    .setOrigin(0)
    .setScale(scale * 0.7)
    .setDepth(101);
  const wins = [image(30, 240, 40), image(30, 370, 40)];
  image(26, 30, 443);
  const gauges = [image(31, 99, 443), image(31, 414, 443).setFlipX(true)];
  // Stock anchors come from KGT actions 74/75.
  const stocks = [image(17, 49, 434), image(17, 545, 434)];
  // KGT actions 104/105 blink image 135 over the low remaining life. The port's
  // life bars drain toward their outer edges, so it mirrors to those ends.
  const underPower = [
    image(135, 22, 20).setFlipX(true),
    image(135, 544, 20),
  ].map((bar) => bar.setBlendMode('ADD').setVisible(false));
  const digits = [image(47, 300, 16), image(47, 320, 16)];
  const infinity = scene.add
    .text(320 * scale, 27 * scale, '∞', {
      fontFamily: 'Arial',
      fontSize: '45px',
      color: '#bbf0ff',
      stroke: '#10283b',
      strokeThickness: 3,
    })
    .setScrollFactor(0)
    .setOrigin(0.5)
    .setDepth(101);
  const shown = [0, 1, 2, 3].map(() =>
    image(97, 0, 0).setDepth(110).setVisible(false),
  );

  return (match: Match) => {
    match.fighters.forEach((f, index) => {
      const crop = gaugeCrop(f.power);
      gauges[index]
        .setTexture(`ui-${gaugeImage(match.ticks)}`)
        .setCrop(crop.x, 0, crop.width, 20)
        .setVisible(crop.width > 0);
      const [dx, dy] = STOCK_OFFSETS[f.stock];
      stocks[index]
        .setTexture(`ui-${17 + f.stock}`)
        .setPosition(((index ? 545 : 49) + dx) * scale, (434 + dy) * scale);
      underPower[index]
        .setVisible(f.hp > 0 && f.hp <= DESPERATION_HP)
        .setAlpha(Math.floor(match.ticks / 15) % 2 ? 0.45 : 0.9);
      const face = faces[index].setTexture(`ryuko-${faceImage(f.face)}`);
      if (index) face.setX((609 - face.width) * scale);
    });
    life.forEach((bar, index) => {
      const crop = healthCrop(match.fighters[index].hp, index === 1);
      bar.setCrop(crop.x, 0, crop.width, 14).setVisible(crop.width > 0);
      wins[index].setTexture(
        `ui-${match.winner === (index === 0 ? 'player' : 'opponent') ? 29 : 30}`,
      );
    });
    const finite = Number.isFinite(match.seconds);
    const value = String(match.seconds).padStart(2, '0');
    digits.forEach((digit, i) => {
      digit.setVisible(finite);
      if (finite) digit.setTexture(`ui-${47 + Number(value[i]) * 5}`);
    });
    infinity.setVisible(!finite);
    // Blitters by op 0x23 mode: 1 averages with the screen, 2 adds.
    const current = letterings(match);
    shown.forEach((sprite, i) => {
      const frame = current[i] && letteringFrame(...current[i]);
      sprite.setVisible(!!frame);
      if (frame)
        sprite
          .setTexture(`ui-${frame.image}`)
          .setPosition(frame.dx * scale, frame.dy * scale)
          .setBlendMode(frame.mode === 2 ? 'ADD' : 'NORMAL')
          .setAlpha(frame.mode === 1 ? 0.5 : 1);
    });
  };
}
