import type Phaser from 'phaser';
import type { Match } from './match';
import ui from './generated/ui.json';

export const KO_TICKS = ui.ko.reduce(
  (total, frame) => total + frame.duration,
  0,
);
// Leave the winner visible after the original lettering finishes.
export const ROUND_END_TICKS = KO_TICKS + 100;

export function koFrame(age: number) {
  for (const frame of ui.ko) {
    if (age < frame.duration) return frame;
    age -= frame.duration;
  }
}

export function healthCrop(hp: number, right: boolean) {
  const width = Math.round((254 * Math.max(0, Math.min(100, hp))) / 100);
  return { x: right ? 254 - width : 0, width };
}

export function createHud(scene: Phaser.Scene) {
  // SCWU.KGT actions 60, 71–77, 103, 106–112 use a 640 × 480 screen.
  // Keep the recovered screen positions and pixels at a uniform 1.5× scale.
  const scale = 1.5;
  const image = (index: number, x: number, y: number) =>
    scene.add
      .image(x * scale, y * scale, `ui-${index}`)
      .setOrigin(0)
      .setScale(scale)
      .setDepth(100);
  image(25, 22, 20);
  const life = [image(27, 22, 20), image(28, 364, 20)];
  image(24, 10, 5);
  image(39, 292, 13);
  image(40, 31, 37);
  image(41, 472, 37);
  scene.add
    .image(31 * scale, 36 * scale, 'ryuko-2001')
    .setOrigin(0)
    .setScale(scale)
    .setDepth(101);
  scene.add
    .image(539 * scale, 36 * scale, 'ryuko-2001')
    .setOrigin(0)
    .setScale(scale)
    .setFlipX(true)
    .setDepth(101);
  // Name placement is authored; portrait anchors above come from actions 72/73.
  scene.add
    .image(106 * scale, 38 * scale, 'ryuko-464')
    .setOrigin(0)
    .setScale(scale * 0.7)
    .setDepth(101);
  scene.add
    .image(474 * scale, 38 * scale, 'ryuko-464')
    .setOrigin(0)
    .setScale(scale * 0.7)
    .setDepth(101);
  const wins = [image(30, 240, 40), image(30, 370, 40)];
  image(26, 30, 443);
  // Special moves are deferred: show the source EMPTY stock, never fake energy.
  image(17, 49, 434);
  image(17, 545, 434);
  const digits = [image(47, 300, 16), image(47, 320, 16)];
  const infinity = scene.add
    .text(320 * scale, 27 * scale, '∞', {
      fontFamily: 'Arial',
      fontSize: '45px',
      color: '#bbf0ff',
      stroke: '#10283b',
      strokeThickness: 3,
    })
    .setOrigin(0.5)
    .setDepth(101);
  const ko = image(97, 183, 126).setDepth(110).setVisible(false);
  const timeout = scene.add
    .text(320 * scale, 185 * scale, 'TIME UP', {
      fontFamily: 'Arial Black, Arial',
      fontStyle: 'bold italic',
      fontSize: '64px',
      color: '#ffffff',
      stroke: '#555555',
      strokeThickness: 8,
    })
    .setOrigin(0.5)
    .setDepth(110)
    .setVisible(false);

  return (match: Match) => {
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
    const ending = match.winner !== null;
    const frame =
      ending && match.seconds !== 0 ? koFrame(match.endingTicks) : undefined;
    ko.setVisible(!!frame);
    if (frame)
      ko.setTexture(`ui-${frame.image}`).setPosition(
        frame.dx * scale,
        frame.dy * scale,
      );
    timeout.setVisible(
      ending && match.seconds === 0 && match.endingTicks < KO_TICKS,
    );
  };
}
