import type Phaser from 'phaser';
import { desperationOf, lifeOf, perStockOf } from './characters';
import type { Who } from './characters';
import { LIFE, ROUNDS_TO_WIN } from './match';
import type { Match } from './match';
import ui from './generated/ui.json';

// A KGT lettering: displays (image, ticks, top-left dx/dy in the 640 × 480
// screen, op 0x23 blit mode) with the sounds just before each, the wait the
// round manager counts for it, and the display a jump back repeats from.
type Lettering = {
  wait: number;
  loop?: number;
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
  calls: {
    start: number;
    rounds: Lettering[];
    results: Record<'win' | 'perfect' | 'draw', number>;
  } & Record<'logo' | 'fight' | 'transition', Lettering>;
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
export const FIGHT_TICK = DRESS_TICK + calls.rounds[0].wait;

// Counted from the KO lettering's spawn, the result states (0x409444–
// 0x4095e8) wait out KO (26) and 1P/2P WIN (30, 31), then at full life spawn
// PERFECT (27) and wait it out the tick after; a draw or double KO waits out
// DRAW or DOUBLE KO (32, 33). The tick after, state 900 (0x4096c0) spawns the
// transition (KGT 14), and when its wait runs out state 902 returns to round
// setup (state 100) for the next tick.
export function roundEndTick(winner: Match['winner'], perfect: boolean) {
  const { win, perfect: bonus, draw } = calls.results;
  if (winner === 'draw') return draw + 1;
  return ko.wait + win + (perfect ? bonus + 1 : 0) + 1;
}
export const NEXT_ROUND_TICKS = calls.transition.wait + 1;

function letteringFrame({ frames, loop }: Lettering, age: number) {
  if (age < 0) return;
  for (let i = 0; i < frames.length; i++) {
    if (age < frames[i].duration) return frames[i];
    age -= frames[i].duration;
    if (i === frames.length - 1 && loop !== undefined) i = loop - 1;
  }
}
export const koFrame = (age: number) => letteringFrame(ko, age);

// The letterings a match shows, by age: in Vs. CPU the round-start logo wipe
// (13's 115), the round's 'DRESS' and 'SHOW TIME'; then every result's KO
// lettering (26, or 28, 29, 32 and 33, which jump to it), and before another
// round 14's logo wipe back in (116). A match lasts at most five rounds.
function letterings(match: Match): [Lettering, number][] {
  const shown: [Lettering, number][] = [];
  if (match.calls)
    shown.push(
      [calls.logo, match.roundTicks],
      [calls.rounds[match.round - 1], match.roundTicks - DRESS_TICK],
      [calls.fight, match.roundTicks - FIGHT_TICK],
    );
  if (match.winner) shown.push([ko, match.endingTicks]);
  if (match.winner && !match.matchOver)
    shown.push([calls.transition, match.endingTicks - match.roundEnd]);
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

export function healthCrop(hp: number, right: boolean, life = LIFE) {
  const width = Math.round((254 * Math.max(0, Math.min(life, hp))) / life);
  return { x: right ? 254 - width : 0, width };
}

// Object types 20/21 (0x40de1b/0x40de44) draw power × 126 pixels of the bar
// over the power per stock (+0xdf21). Both keep the texture's right-hand
// columns; 2P shows them mirrored.
export function gaugeCrop(power: number, perStock = 100) {
  const width = Math.floor((126 * Math.max(0, power)) / perStock);
  return { x: 126 - width, width };
}

// KGT actions 69/70: image 31 for 50 ticks, then shimmer frames 32–38.
export function gaugeImage(tick: number) {
  const time = tick % 85;
  return time < 50 ? 31 : 32 + Math.floor((time - 50) / 5);
}

// Action 70's HUD face: image 2001, or in EX mode 2002, 2001, 2000 and 2001
// for 40 ticks each (PCs 712–730), as Chung's 73 (PCs 675–692), Amiro's 75
// (PCs 786–803), ANMC P's 72 (PCs 717–735), Giant's 74 (PCs 690–707),
// KAY's 73 (PCs 727–745), SOU's 79 (PCs 792–806), ERUS's 77 (PCs
// 757–773), GIGI's 72 in his Change form (PCs 730–746) and SWW's 72 (PCs
// 690–705); G Suneo's 81 shows
// 2006 for 2001's turns (PCs 845–863), as SIN's 73 (PCs 756–774), SAKUYA's
// 87 (PCs 847–861), ALEX's 75 (PCs 737–750), OS FENG's 85 (PCs 884–901),
// GON's 82 (PCs 884–897) and ZIRO's 87 do (PCs 999–1008). Zoma's and Kiki's action 71 shows 2001 (PCs 677,
// 666), Yo's and LIZARD's 73 (PCs 728, 764), DIDO's 76 (PC 817), HISO's
// KATE's and REMU's 76 (PCs 736, 754, 792), SEAN's and REAR's 75 (PCs
// 756, 726), OGI's 77 (PC 789), ZIRO's 87 (PC 994), MASA's 117 (PC
// 1056), 3-TIMES's 114 (PC 953), ZENKA's 92 (PC 934), Z-MEGA's 82 (PC
// 767), ALPHA's 108 (PC 1333), SHIN-Z's 84 (PC 846), ZAKU's 72 (PC 645),
// PAC-HELO's 72 (PC 652), GOLF's 56 (PC 511), ASURA's 56 (PC 511), TTRO's
// 71 (PC 674), ASTROMAN's 69 (PC 769), AYA's 100 (PC 747) and DoraEmon's 95
// (PC 1085). YINAN's 104
// shows 2001, or in EX
// mode 2002, 2007, 2008 and 2007 for 40 ticks each (PCs 1240–1256).
export const faceImage = (face: number, who?: Who) => {
  const side =
    who === 'suneo' ||
    who === 'sin' ||
    who === 'sakuya' ||
    who === 'alex' ||
    who === 'feng' ||
    who === 'gon' ||
    who === 'ziro'
      ? 2006
      : 2001;
  const cycle =
    who === 'yinan' ? [2002, 2007, 2008, 2007] : [2002, side, 2000, side];
  return face < 0 ? 2001 : cycle[Math.floor(face / 40) % 4];
};
// The *NAME action's image: Ryuko's 66 shows 464 (PC 675), Zoma's 64 340
// (PC 637), Kiki's 65 217 (PC 627), Chung's 65 375 (PC 635), Amiro's 67
// 427 (PC 746), ANMC P's 69 183 (PC 682), Giant's 68 349 (PC 652), G
// Suneo's 76 601 (PC 808), Yo's 66 390 (PC 688), SIN's 70 368 (PC 721),
// LIZARD's 69 217 (PC 727), KAY's 66 464 (PC 688), DIDO's 69 258 (PC 777),
// SAKUYA's 79 445 (PC 805), ALEX's 68 362 (PC 694), SOU's 71 329 (PC 748),
// HISO's 66 445 (PC 693), ERUS's 68 366 (PC 714), OS FENG's 76 449
// (PC 843), SEAN's 67 247 (PC 715), GON's 76 654 (PC 842), KATE's 66 276
// (PC 711), REMU's 69 428 (PC 752), REAR's 67 387 (PC 685), GIGI's 68
// 328 (PC 694), SWW's 65 399 (PC 649), OGI's 70 648 (PC 749), ZIRO's 79
// 478 (PC 952), MASA's 106 139 (PC 1012), 3-TIMES's 105 139 (PC 913),
// ZENKA's 85 333 (PC 891), Z-MEGA's 74 322 (PC 723), ALPHA's 99 576
// (PC 1289), SHIN-Z's 75 323 (PC 787), ZAKU's 68 139 (PC 609),
// PAC-HELO's 68 149 (PC 617), GOLF's 52 155 (PC 475), ASURA's 52 137
// (PC 479) and TTRO's 66 170 (PC 636); ASTROMAN, with no *NAME, shows VS
// NAME's (56) 170 (PC 610). YINAN's 99 and AYA's 93 show 349 (PCs 1197,
// 705), and DoraEmon's 83 SEAN's 247 (PC 1047).
const NAMES: Record<Who, number> = {
  ryuko: 464,
  zoma: 340,
  kiki: 217,
  chung: 375,
  amiro: 427,
  anmc: 183,
  giant: 349,
  suneo: 601,
  yo: 390,
  sin: 368,
  lizard: 217,
  kay: 464,
  dido: 258,
  sakuya: 445,
  alex: 362,
  sou: 329,
  hiso: 445,
  erus: 366,
  feng: 449,
  sean: 247,
  gon: 654,
  kate: 276,
  remu: 428,
  rear: 387,
  gigi: 328,
  sww: 399,
  ogi: 648,
  ziro: 478,
  masa: 139,
  times: 139,
  zenka: 333,
  zmega: 322,
  alpha: 576,
  shinz: 323,
  zaku: 139,
  pachelo: 149,
  golf: 155,
  asura: 137,
  ttro: 170,
  astroman: 170,
  yinan: 349,
  aya: 349,
  dora: 247,
};

// The stock count picks its digits from the word at 0x445202 + stock × 2
// (0x40a30b): KGT actions 45–51, images 17–23, EMPTY and 100–600.
const STOCK_OFFSETS = [
  [0, 0],
  [0, -1],
  [-4, -1],
  [-2, -2],
  [-3, -1],
  [-2, -1],
  [-2, -1],
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
  const names = [106, 474].map((x) =>
    scene.add
      .image(x * scale, 38 * scale, 'ryuko-464')
      .setScrollFactor(0)
      .setOrigin(0)
      .setScale(scale * 0.7)
      .setDepth(101),
  );
  // Type 13 (0x409d82) lines up a mark per round to win from the KGT 76/77
  // headers: 1P from (240, 40) stepping −35, 2P from (370, 40) stepping 35.
  // Each shows KGT 56 (112: image 30) until that round is won, when state 1
  // (0x40a584) switches the next to 55 (112 + 4: image 29 at +1, +1).
  const marks = [-35, 35].map((step, side) =>
    Array.from(
      { length: ROUNDS_TO_WIN },
      (_, i) => (side ? 370 : 240) + step * i,
    ),
  );
  const wins = marks.map((xs) => xs.map((x) => image(30, x, 40)));
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
      const crop = gaugeCrop(f.power, perStockOf(f.who));
      gauges[index]
        .setTexture(`ui-${gaugeImage(match.ticks)}`)
        .setCrop(crop.x, 0, crop.width, 20)
        .setVisible(crop.width > 0);
      const [dx, dy] = STOCK_OFFSETS[f.stock];
      stocks[index]
        .setTexture(`ui-${17 + f.stock}`)
        .setPosition(((index ? 545 : 49) + dx) * scale, (434 + dy) * scale);
      underPower[index]
        .setVisible(f.hp > 0 && f.hp <= desperationOf(f.who))
        .setAlpha(Math.floor(match.ticks / 15) % 2 ? 0.45 : 0.9);
      const face = faces[index].setTexture(
        `${f.who}-${faceImage(f.face, f.who)}`,
      );
      if (index) face.setX((609 - face.width) * scale);
      names[index].setTexture(`${f.who}-${NAMES[f.who]}`);
    });
    life.forEach((bar, index) => {
      const { hp, who } = match.fighters[index];
      const crop = healthCrop(hp, index === 1, lifeOf(who));
      bar.setCrop(crop.x, 0, crop.width, 14).setVisible(crop.width > 0);
      wins[index].forEach((mark, i) => {
        const won = match.wins[index] > i ? 1 : 0;
        mark
          .setTexture(`ui-${won ? 29 : 30}`)
          .setPosition((marks[index][i] + won) * scale, (40 + won) * scale);
      });
    });
    const finite = Number.isFinite(match.seconds);
    const value = String(match.seconds).padStart(2, '0');
    digits.forEach((digit, i) => {
      digit.setVisible(finite);
      if (finite) digit.setTexture(`ui-${47 + Number(value[i]) * 5}`);
    });
    infinity.setVisible(!finite);
    // Blitters by op 0x23 mode: 1 averages with the screen, 2 adds.
    const current = letterings(match).flatMap(
      (lettering) => letteringFrame(...lettering) ?? [],
    );
    shown.forEach((sprite, i) => {
      const frame = current.at(i);
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
