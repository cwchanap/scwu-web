// The command recognizer. Every tick the engine records each player's input
// as a word (0x4146d0 via 0x414340): bit 1 back, 2 forward, 4 up and 8 down,
// then the buttons K 0x10, Hit Up 0x20, P 0x80 and Chuck 0x100 (0x40 only
// appears in CPU IORI's command). Left and right count from the opponent's
// side, and 0x40e6c2 flips the tick's word when that changes; Ryuko's
// +0x7cb6 lacks bit 8, so neither check below mirrors.
import type { Who } from './characters';
import data from './generated/assets.json';
import zoma from './generated/zoma.json';
import kiki from './generated/kiki.json';
import chung from './generated/chung.json';
import amiro from './generated/amiro.json';
import anmc from './generated/anmc.json';
import giant from './generated/giant.json';
import suneo from './generated/suneo.json';
import yo from './generated/yo.json';
import sin from './generated/sin.json';
import lizard from './generated/lizard.json';
import kay from './generated/kay.json';
import dido from './generated/dido.json';
import sakuya from './generated/sakuya.json';
import alex from './generated/alex.json';
import sou from './generated/sou.json';
import hiso from './generated/hiso.json';
import erus from './generated/erus.json';
import feng from './generated/feng.json';
import sean from './generated/sean.json';
import gon from './generated/gon.json';
import kate from './generated/kate.json';
import remu from './generated/remu.json';
import rear from './generated/rear.json';
import gigi from './generated/gigi.json';
import sww from './generated/sww.json';
import ogi from './generated/ogi.json';
import ziro from './generated/ziro.json';
import masa from './generated/masa.json';
import times from './generated/times.json';
import zenka from './generated/zenka.json';
import zmega from './generated/zmega.json';
import alpha from './generated/alpha.json';
import shinz from './generated/shinz.json';
import zaku from './generated/zaku.json';
import pachelo from './generated/pachelo.json';
import golf from './generated/golf.json';
import asura from './generated/asura.json';
import ttro from './generated/ttro.json';
import astroman from './generated/astroman.json';
import yinan from './generated/yinan.json';
import aya from './generated/aya.json';
import dora from './generated/dora.json';
import rario from './generated/rario.json';
import training from './generated/training.json';
import type { Control, Input } from './match';

export interface CommandEntry {
  name: string;
  window: number;
  air: number;
  near: number;
  far: number;
  crouch: number;
  steps: number[];
  // Each step's u16 (+0x3e), exported where a step is typed.
  params?: number[];
}
// Each player's entries (player +0x4da2: Ryuko's 23, Zoma's 25, Kiki's 20,
// Chung's 22, Amiro's 20, ANMC P's 21, Giant's 18, G Suneo's 20, Yo's 23,
// SIN's 25, LIZARD's 21, KAY's 22, DIDO's 24, SAKUYA's 26, ALEX's 28, SOU's
// 31, HISO's 25, ERUS's 29, OS FENG's 26, SEAN's 29, GON's 30, KATE's 27,
// REMU's 26, REAR's 30, GIGI's 28, SWW's 25, OGI's 30, ZIRO's 30, MASA's
// 21, 3-TIMES's 19, ZENKA's 23, Z-MEGA's 29, ALPHA's 28, SHIN-Z's 29, ZAKU's
// 16, PAC-HELO's 18, GOLF's 16, ASURA's 17, TTRO's 21, ASTROMAN's 22,
// YINAN's 29, AYA's 22) and
// the distance in source pixels that splits their near and far actions
// (+0x7ca3): GIGI's 130, though each of his entries names the same action
// for both, OGI's 140, which picks SCC's near or far start, ZIRO's 130,
// RAMBU's and the telepots', and MASA's 130, his SCC's; 3-TIMES's 130
// splits nothing, ZENKA's 130 his Ranbu's, Z-MEGA's 110 nothing, ALPHA's
// 140 his SCC's and CC's, SHIN-Z's 130 nothing, ZAKU's, PAC-HELO's, GOLF's
// and ASURA's 0 nothing, TTRO's 180 his SCC's and CC's, ASTROMAN's 200
// his C Chuck's, YINAN's 110 her Venom Doll's and CPU Driver's, and AYA's
// 110 nothing.
// Authored: DoraEmon's file gives his motions 10 ticks, his dashes 3 and
// Jump 2 1, which never matches its two steps: too short to enter by hand.
// Entries 1–29 take the windows the other files give the same steps; his
// one-step and CPU entries keep his.
const DORA_WINDOWS = [
  85, // 激神超抱擁
  ...Array<number>(10).fill(50), // FK之意思 to 魔神空大砲
  10, // ---
  40, // 機猫神天翔
  40,
  ...Array<number>(6).fill(35), // 機猫神双槌, 機猫神空砲 and 機猫神突進
  ...Array<number>(4).fill(30), // 機猫神瞬移
  10, // Jump 2
  10,
  10,
  13, // Dash F
  13,
];
const TABLES: Record<Who, { entries: readonly CommandEntry[]; near: number }> =
  {
    ryuko: data.commands,
    zoma: zoma.commands,
    kiki: kiki.commands,
    chung: chung.commands,
    amiro: amiro.commands,
    anmc: anmc.commands,
    giant: giant.commands,
    suneo: suneo.commands,
    yo: yo.commands,
    sin: sin.commands,
    lizard: lizard.commands,
    kay: kay.commands,
    dido: dido.commands,
    sakuya: sakuya.commands,
    alex: alex.commands,
    sou: sou.commands,
    hiso: hiso.commands,
    erus: erus.commands,
    feng: feng.commands,
    sean: sean.commands,
    gon: gon.commands,
    kate: kate.commands,
    remu: remu.commands,
    rear: rear.commands,
    gigi: gigi.commands,
    sww: sww.commands,
    ogi: ogi.commands,
    ziro: ziro.commands,
    masa: masa.commands,
    times: times.commands,
    zenka: zenka.commands,
    zmega: zmega.commands,
    alpha: alpha.commands,
    shinz: shinz.commands,
    zaku: zaku.commands,
    pachelo: pachelo.commands,
    golf: golf.commands,
    asura: asura.commands,
    ttro: ttro.commands,
    astroman: astroman.commands,
    yinan: yinan.commands,
    aya: aya.commands,
    dora: {
      ...dora.commands,
      entries: dora.commands.entries.map((entry, i) => ({
        ...entry,
        window: DORA_WINDOWS[i] ?? entry.window,
      })),
    },
    rario: rario.commands,
    training: training.commands,
  };
export const entriesOf = (who: Who) => TABLES[who].entries;
export const nearOf = (who: Who) => TABLES[who].near;
export const ENTRIES = entriesOf('ryuko');
export const NEAR = nearOf('ryuko');
export const DOWN = 8;
const BUTTONS: Partial<Record<Control, number>> = {
  kick: 0x10,
  hitUp: 0x20,
  punch: 0x80,
  throw: 0x100,
};
// Authored: DoraEmon's attacks each take two of the source's six buttons
// (A–F, bits 4–9, 0x414340), which no two keys press on one tick, so his
// keys press both: G LP (C, D), H LK (A, B), K HP (D, E), J HK (B, C), O
// his chuck (C, D, E) and E, held, EN (E, F).
const OWN_BUTTONS: Partial<Record<Who, Partial<Record<Control, number>>>> = {
  dora: {
    punch: 0xc0,
    kick: 0x30,
    hitUp: 0x180,
    dst: 0x60,
    throw: 0x1c0,
    ex: 0x300,
  },
};
export const buttonsOf = (who: Who) => OWN_BUTTONS[who] ?? BUTTONS;
// Whether a button key enters anything by itself: some one-step entry with
// an action takes all its buttons. 3-TIMES's, Z-MEGA's (whose B only ends
// TYPE CHANGE), SHIN-Z's, ZAKU's, PAC-HELO's, GOLF's, ASURA's, TTRO's,
// ASTROMAN's and RARIO's tables have no Hit Up, and ZAKU's, PAC-HELO's,
// GOLF's, ASURA's and RARIO's no chuck.
export const usesButton = (who: Who, control: Control) => {
  const bits = buttonsOf(who)[control];
  return (
    bits !== undefined &&
    entriesOf(who).some(
      ({ air, near, far, crouch, steps }) =>
        (air || near || far || crouch) &&
        steps.length === 1 &&
        (steps[0] & bits) === bits,
    )
  );
};
// Entries (1-based) as the port's controls, with the direction a jump or
// dash carries.
export const CONTROLS: Record<number, [Control, string?]> = {
  1: ['changeAttack'],
  2: ['megaBeam'],
  3: ['musashi'],
  4: ['getterBeam'],
  5: ['blackRush'],
  6: ['axe'],
  7: ['dst'],
  8: ['drill'],
  9: ['iori'],
  10: ['jump'],
  11: ['jump', 'F'],
  12: ['jump', 'B'],
  13: ['dash'],
  14: ['dash', 'B'],
  15: ['ex'],
  17: ['hitUp'],
  18: ['throw'],
  19: ['punch'],
  20: ['kick'],
  22: ['cpuIori'],
};
// Authored: the port's command keys, in the order one is taken when several
// are pressed together. Each writes its entry's steps as the CPU does,
// spacing a repeated button (inject).
const RYUKO_KEYS: [Control, number][] = [
  ['getterBeam', 4],
  ['musashi', 3],
  ['changeAttack', 1],
  ['blackRush', 5],
  ['megaBeam', 2],
  ['drill', 8],
  ['iori', 9],
  ['cpuIori', 22],
  ['dst', 7],
  ['axe', 6],
  ['ex', 15],
  // Shift: DASH F, or DASH B (14) while back is held (Match.record).
  ['dash', 13],
];
// Zoma's moves take Ryuko's keys: SPAKE (3), DST (1), EN300 (4) and his
// 'コマンド 1', Shin Spark (2), on 1-4, DRAGON (6), dragon 2 p (9), BOMB
// (11), FIRE (10) and g beam (5), then DASH F (15) and DASH B (16).
export const KEYS: Record<Who, [Control, number][]> = {
  ryuko: RYUKO_KEYS,
  zoma: [
    ['getterBeam', 3],
    ['musashi', 1],
    ['changeAttack', 4],
    ['blackRush', 2],
    ['drill', 6],
    ['iori', 9],
    ['dst', 11],
    ['axe', 10],
    ['ex', 5],
    ['dash', 15],
  ],
  // Kiki's supers ranbu, MAGIC FIRE and EN3 majic dance on 1-3, and her
  // specials DRAGON O (5), K' (4) and TATUMAKI (6) on Ryuko's special keys,
  // then DASH F (11) and DASH B (12).
  kiki: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 5],
    ['iori', 6],
    ['axe', 4],
    ['dash', 11],
  ],
  // Chung's supers gesar, KICK UP and EN3 on 1-3; his specials Dragon (6),
  // orochi (4), BK (8) and Fire ball (7) on Ryuko's special keys, --TYPE--
  // (13, TO EX) on EX, then Dash F (14) and Dash B (15). Jump wall move (5)
  // and air fire (9) take their commands only.
  chung: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 6],
    ['iori', 4],
    ['dst', 8],
    ['axe', 7],
    ['ex', 13],
    ['dash', 14],
  ],
  // Amiro's supers scc, medeo, NT and funnal on 1-4; her specials Dragon (7),
  // Coment chuck (6), morning star (8) and BEAM (5) on Ryuko's special keys,
  // ----- (9, EX Ch) on EX, then Dash F (13) and Dash B (14).
  amiro: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['drill', 7],
    ['iori', 6],
    ['dst', 8],
    ['axe', 5],
    ['ex', 9],
    ['dash', 13],
  ],
  // ANMC P's supers SUPER CHUCK, super ball and en300 on 1-3; his specials
  // fly move (7), twis att (6), ball fire (4) and fire ball (5) on Ryuko's
  // special keys, --TYPE CHANGE-- (13, to ex) on EX, then Dash F (11) and
  // Dash B (12).
  anmc: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 7],
    ['iori', 6],
    ['dst', 4],
    ['axe', 5],
    ['ex', 13],
    ['dash', 11],
  ],
  // Giant's supers fire, HARIKEN and en300 on 1-3; his specials Rock punch
  // (5), H PUNCH (7), counter (6) and base ball (8) on Ryuko's special keys,
  // --TYPE-- (9, TO EX) on EX, then Dash F (13) and Dash B (14).
  giant: [
    ['getterBeam', 2],
    ['musashi', 3],
    ['changeAttack', 1],
    ['drill', 5],
    ['iori', 7],
    ['dst', 6],
    ['axe', 8],
    ['ex', 9],
    ['dash', 13],
  ],
  // G Suneo's supers hh, GP and en300 on 1-3 and BP on 4; her specials
  // DRILL KNIEE (5), G DRIVER (7), BIKE (8) and FIRE BALL (6) on Ryuko's
  // special keys, --TYPE CHANGE-- (9, TO EX) on EX, then DASH F (13) and
  // DASH B (14).
  suneo: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 4],
    ['blackRush', 3],
    ['drill', 5],
    ['iori', 7],
    ['dst', 8],
    ['axe', 6],
    ['ex', 9],
    ['dash', 13],
  ],
  // Yo's supers GIGA PRESS, HIDDEN, snake and en300 on 1-4; her specials
  // Dragon (6), ZOMBI WALK (5), Run in (8) and TOFU (9) on Ryuko's special
  // keys, then Dash F (13) and Dash B (14). Fire ball (7), in the air, takes
  // its command only.
  yo: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['drill', 6],
    ['iori', 5],
    ['dst', 8],
    ['axe', 9],
    ['dash', 13],
  ],
  // SIN's supers BAKU (2), SUP RUN C (4), EN300 (1) and NOZAN (3) on 1-4;
  // his specials S PUNCH (11), RUN CHUCK (6), Clack chuck (7) and low chuck
  // (5) on Ryuko's special keys, --TYPE Change-- (12, TO EX) on EX, then
  // Dash F (16) and Dash B (17). WOLF att (9) takes its command only.
  sin: [
    ['getterBeam', 2],
    ['musashi', 4],
    ['changeAttack', 1],
    ['blackRush', 3],
    ['drill', 11],
    ['iori', 6],
    ['dst', 7],
    ['axe', 5],
    ['ex', 12],
    ['dash', 16],
  ],
  // LIZARD's supers HIDDEN, chuck sup, dragon sp and en300 on 1-4; his
  // specials Cross (6), jump att (5) and FIRE (7) on Ryuko's special keys,
  // then DASSH F (12) and DASH B (13).
  lizard: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['drill', 6],
    ['iori', 5],
    ['axe', 7],
    ['dash', 12],
  ],
  // KAY's supers en300, KAORU and SUPER P on 1-3; his specials air chuck
  // (7), Counter (6), Comment chuck (5) and Fire (8) on Ryuko's special
  // keys, ------ (11, EX) on EX, then Dash F (15) and Dash B (16). 12P (9)
  // and 12K (10) take their commands only.
  kay: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 7],
    ['iori', 6],
    ['dst', 5],
    ['axe', 8],
    ['ex', 11],
    ['dash', 15],
  ],
  // DIDO's supers Hidden300, Temjin fly, dragon super, Raiden and EN300 on
  // 1-5; her specials slid (9), RAiden (6), doge (7) and fire (8) on Ryuko's
  // special keys, then Dash F (14) and Dash B (15).
  dido: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['megaBeam', 5],
    ['drill', 9],
    ['iori', 6],
    ['dst', 7],
    ['axe', 8],
    ['dash', 14],
  ],
  // SAKUYA's supers en300, super HIT UP and SPARK on 1-3, her specials DRAGON
  // KICK (8) and LOW FIRE (11) on 4-5, Dragon punch (9), iori (10), counter
  // (7) and FIRE (12) on Ryuko's special keys, --TYPE-- (13, TO EX) on EX,
  // then Dash F (17) and Dash B (18). C C (6) takes its command only.
  sakuya: [
    ['getterBeam', 2],
    ['musashi', 3],
    ['changeAttack', 4],
    ['blackRush', 8],
    ['megaBeam', 11],
    ['drill', 9],
    ['iori', 10],
    ['dst', 7],
    ['axe', 12],
    ['ex', 13],
    ['dash', 17],
  ],
  // ALEX's supers en300, GYSA, super fire and haou on 1-4, his specials
  // dragon (15), fire (17, in the air only), reflect (16) and counter (12) on
  // Ryuko's special keys, --TYPE CHANGE-- (18, TO EX) on EX, then Dash F (22)
  // and Dash B (23).
  alex: [
    ['getterBeam', 1],
    ['musashi', 3],
    ['changeAttack', 5],
    ['blackRush', 7],
    ['drill', 15],
    ['axe', 17],
    ['iori', 16],
    ['dst', 12],
    ['ex', 18],
    ['dash', 22],
  ],
  // SOU's supers KOKAKEN, Command 1, Beast att, SPARK and DANKU SHOT on 1-5;
  // his specials AKUMA jump (11), IORI (14), BK (13) and Fire Kick (15) on
  // Ryuko's special keys, TYPE CHANGE (6) on EX, then Dash F (20) and Dash B
  // (21). MID SLASS (12) and HIDDEN A (16) take their commands only.
  sou: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['megaBeam', 5],
    ['drill', 11],
    ['iori', 14],
    ['dst', 13],
    ['axe', 15],
    ['ex', 6],
    ['dash', 20],
  ],
  // HISO's supers FISH, en300, fly arm and S Shoot on 1-4, his special
  // striker (14) on 5, Dragon p (11), bannaku (13), counter (9) and FIRE
  // (15) on Ryuko's special keys, then Dash F (20) and Dash B (21).
  hiso: [
    ['getterBeam', 1],
    ['musashi', 3],
    ['changeAttack', 4],
    ['blackRush', 5],
    ['megaBeam', 14],
    ['drill', 11],
    ['iori', 13],
    ['dst', 9],
    ['axe', 15],
    ['dash', 20],
  ],
  // ERUS's supers コマンド 3 (Hidden EN3), lizard fly, SCC, EN300 and Super
  // slash on 1-5; her specials INATUMA (10), Coin (14), COUNTER (9) and VO5
  // (15) on Ryuko's special keys, コマンド 1 (16, Type to EX) on EX, then
  // Dash F (20) and Dash B (21). TELP PK, K and P (11-13) take their
  // commands only.
  erus: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 4],
    ['blackRush', 5],
    ['megaBeam', 6],
    ['drill', 10],
    ['iori', 14],
    ['dst', 9],
    ['axe', 15],
    ['ex', 16],
    ['dash', 20],
  ],
  // OS FENG's supers EN300, ICE punch and sshoot on 1-3, his special SUCK (6)
  // on 4, dragon (7), iori (8), bp (9) and Fire (11) on Ryuko's special keys,
  // TYPE Change (12) on EX, then Dash F (16) and Dash B (17).
  feng: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 6],
    ['drill', 7],
    ['iori', 8],
    ['dst', 9],
    ['axe', 11],
    ['ex', 12],
    ['dash', 16],
  ],
  // SEAN's supers en300, SCC and S shoot (5-7) on 1-3; his specials Dragon
  // (13), whip attack (15) and Whip attack K (16) on Ryuko's drill, axe and
  // iori keys and his grab CC (14) on DST's, then Dash F (21) and Dash B
  // (22).
  sean: [
    ['getterBeam', 5],
    ['musashi', 6],
    ['changeAttack', 7],
    ['drill', 13],
    ['axe', 15],
    ['iori', 16],
    ['dst', 14],
    ['dash', 21],
  ],
  // GON's supers EN300, KURENCOUNTER and Super heart (4, 3, 5) on 1-3 and
  // the hidden en300 (A22PC, 1) on 4; his specials DRAGON (11), DRILL (13),
  // COUNTER (9) and fire ball (15) on Ryuko's drill, iori, DST and axe keys,
  // --Type-- (16) on EX, then Dash F (20) and Dash B (21). dash move (14)
  // takes its command only.
  gon: [
    ['getterBeam', 4],
    ['musashi', 3],
    ['changeAttack', 5],
    ['blackRush', 1],
    ['drill', 11],
    ['iori', 13],
    ['dst', 9],
    ['axe', 15],
    ['ex', 16],
    ['dash', 20],
  ],
  // KATE's supers en300, SLASH SUPER and BEAM (4-6) on 1-3; her specials
  // neko punch (10), Air fire (14), DASH ATTACK (13) and Counter (9) on
  // Ryuko's drill, axe, iori and DST keys, then Dash F (19) and Dash B (20).
  // AIR FIRE K (12) takes its command only.
  kate: [
    ['getterBeam', 4],
    ['musashi', 5],
    ['changeAttack', 6],
    ['drill', 10],
    ['axe', 14],
    ['iori', 13],
    ['dst', 9],
    ['dash', 19],
  ],
  // REMU's supers EN300, MINAMI, BAKURETU, Phsy driver and Thander p on
  // 1-5; his specials tatsumaki (10), slash (14), JET (12) and Drill (11) on
  // Ryuko's drill, axe, iori and DST keys, then Dash F (19) and Dash B (20).
  remu: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['blackRush', 4],
    ['megaBeam', 5],
    ['drill', 10],
    ['axe', 14],
    ['iori', 12],
    ['dst', 11],
    ['dash', 19],
  ],
  // REAR's supers GYSA, VIPER FINAL and en300 (5, 7, 6) on 1-3 and evil
  // en3 (1) on 4; his specials SAMA (11), Fire ball (16), DOWN ATTACK (13)
  // and VIPER WHIP (14) on Ryuko's drill, axe, iori and DST keys, then Dash
  // F (21) and Dash B (22).
  rear: [
    ['getterBeam', 5],
    ['musashi', 7],
    ['changeAttack', 6],
    ['blackRush', 1],
    ['drill', 11],
    ['axe', 16],
    ['iori', 13],
    ['dst', 14],
    ['dash', 21],
  ],
  // GIGI's supers Rambu Beam, S chuck and EN3 (2, 1, 3) on 1-3 and his
  // specials Bike Doge D K and D PK (11, 9) on 4 and 5; Dragon (5), K' (7),
  // DIVE GIGI P (6) and Bike Doge D P (10) on Ryuko's drill, axe, iori and
  // DST keys, his Change (12) on EX, then Dash F (16) and Dash B (17).
  gigi: [
    ['getterBeam', 2],
    ['musashi', 1],
    ['changeAttack', 3],
    ['blackRush', 11],
    ['megaBeam', 9],
    ['drill', 5],
    ['axe', 7],
    ['iori', 6],
    ['dst', 10],
    ['ex', 12],
    ['dash', 16],
  ],
  // SWW's supers SUPER RSK, GOD DRAGON, COUNTER CHAIN, EN300 and Healing (7,
  // 6, 5, 3, 4) on 1-5; his specials Dragon P (10), ICE Punch (11), Chain att
  // (12) and Ryuseiken (13) on Ryuko's drill, axe, iori and DST keys, --------
  // (14, Chan) on EX, then Dash F (18) and Dash B (19). ROLL CRASH (1) takes
  // its command only.
  sww: [
    ['getterBeam', 7],
    ['musashi', 6],
    ['changeAttack', 5],
    ['blackRush', 3],
    ['megaBeam', 4],
    ['drill', 10],
    ['axe', 11],
    ['iori', 12],
    ['dst', 13],
    ['ex', 14],
    ['dash', 18],
  ],
  // OGI's supers s shoot, SCC, S Crush and EN300 (7, 6, 5, 4) on 1-4 and his
  // special FIRE K (15) on 5; Dragon (12), Crush attack (13), Rose attack
  // (14) and fire p (16) on Ryuko's drill, axe, iori and DST keys, then Dash
  // F (21) and Dash B (22).
  ogi: [
    ['getterBeam', 7],
    ['musashi', 6],
    ['changeAttack', 5],
    ['blackRush', 4],
    ['megaBeam', 15],
    ['drill', 12],
    ['axe', 13],
    ['iori', 14],
    ['dst', 16],
    ['dash', 21],
  ],
  // ZIRO's supers MISS ALL, RAMBU, EN300 and TWIN SHOT (4, 3, 2, 1) on 1-4
  // and his special CC (8) on 5; Fire Ball (10), nataku p (12), telepot (13)
  // and IORI3HIT (15) on Ryuko's drill, axe, iori and DST keys, --TYPE-- (16)
  // on her EX key, then Dash F (20) and Dash B (21).
  ziro: [
    ['getterBeam', 4],
    ['musashi', 3],
    ['changeAttack', 2],
    ['blackRush', 1],
    ['megaBeam', 8],
    ['drill', 10],
    ['axe', 12],
    ['iori', 13],
    ['dst', 15],
    ['ex', 16],
    ['dash', 20],
  ],
  // MASA's supers RAMBU SUP, SCC and MESATSU (3, 2, 1) on 1-3; his specials
  // SHORYU (4), 3Fire (7), 3HIT (6) and BANDO BOX (5) on Ryuko's drill, axe,
  // iori and DST keys, then Dash F (11) and Dash B (12).
  masa: [
    ['getterBeam', 3],
    ['musashi', 2],
    ['changeAttack', 1],
    ['drill', 4],
    ['axe', 7],
    ['iori', 6],
    ['dst', 5],
    ['dash', 11],
  ],
  // 3-TIMES's supers Rambu, SB and MESATSU (2, 3, 1) on 1-3; his specials
  // SHORYU (4), Fire (5) and DASH (6) on Ryuko's drill, axe and iori keys,
  // then Dash F (10) and Dash B (11).
  times: [
    ['getterBeam', 2],
    ['musashi', 3],
    ['changeAttack', 1],
    ['drill', 4],
    ['axe', 5],
    ['iori', 6],
    ['dash', 10],
  ],
  // ZENKA's supers Ranbu, DAISHARIN and en500 (4, 3, 2) on 1-3; his
  // specials DRAGON (6), FIRE (7) and NEW MOVE (8) on Ryuko's drill, axe and
  // iori keys, then Dash F (12) and Dash B (13).
  zenka: [
    ['getterBeam', 4],
    ['musashi', 3],
    ['changeAttack', 2],
    ['drill', 6],
    ['axe', 7],
    ['iori', 8],
    ['dash', 12],
  ],
  // Z-MEGA's supers GAISA, SGIGA and AKUMA SP (5, 4, 1) on 1-3; his specials
  // SAMA (12), Fire BALL (14), GIGA (11) and REFLACT (13) on Ryuko's drill,
  // axe, iori and DST keys, TYPE CHANGE (15) on EX, then Dash F (19) and
  // Dash B (20).
  zmega: [
    ['getterBeam', 5],
    ['musashi', 4],
    ['changeAttack', 1],
    ['drill', 12],
    ['axe', 14],
    ['iori', 11],
    ['dst', 13],
    ['ex', 15],
    ['dash', 19],
  ],
  // ALPHA's supers SNAKE FIRE, RYUON HASANKEN, Rambu, --BK8 (NEW EN3) and
  // SCC (6, 5, 3, 2, 1) on 1-5; his specials CC (9), Munt (10) and NC START
  // (13) on Ryuko's drill, axe and iori keys, then Dash F (20) and Dash B
  // (21).
  alpha: [
    ['getterBeam', 6],
    ['musashi', 5],
    ['changeAttack', 3],
    ['blackRush', 2],
    ['megaBeam', 1],
    ['drill', 9],
    ['axe', 10],
    ['iori', 13],
    ['dash', 20],
  ],
  // SHIN-Z's supers KAISA SUPER, SGIGA and AKUMA SP (6, 4, 1) on 1-3; his
  // specials SAMA (12), Fire BALL (14), GIGA (11) and REFLACT (13) on Ryuko's
  // drill, axe, iori and DST keys, GAISA (5) on EX, then Dash F (19) and Dash
  // B (20).
  shinz: [
    ['getterBeam', 6],
    ['musashi', 4],
    ['changeAttack', 1],
    ['drill', 12],
    ['axe', 14],
    ['iori', 11],
    ['dst', 13],
    ['ex', 5],
    ['dash', 19],
  ],
  // ZAKU's supers Super p and Super K (1, 2) on 1-2; his special sp p (3) on
  // Ryuko's drill key, then Dash F (7) and Dash B (8).
  zaku: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['drill', 3],
    ['dash', 7],
  ],
  // PAC-HELO's super super roll (1) on 1; his specials roll (5) and elertic
  // (6) on Ryuko's drill and axe keys, then Dash F (10) and Dash B (11).
  pachelo: [
    ['getterBeam', 1],
    ['drill', 5],
    ['axe', 6],
    ['dash', 10],
  ],
  // GOLF's super p (1) on 1; his specials sp p (3) and SP K (2) on Ryuko's
  // drill and axe keys, as ZAKU's sp p, then Dash F (7) and Dash B (8).
  golf: [
    ['getterBeam', 1],
    ['drill', 3],
    ['axe', 2],
    ['dash', 7],
  ],
  // ASURA's super Shinku TATU (1) on 1; his special tatumaki (3) on Ryuko's
  // drill key, as ZAKU's sp p, then Dash F (8) and Dash B (9).
  asura: [
    ['getterBeam', 1],
    ['drill', 3],
    ['dash', 8],
  ],
  // TTRO's supers SCC, SUPER FIRE and EN300 on 1-3; his specials DASH P (9),
  // Fire (7), DASH K (8) and CC (5) on Ryuko's drill, axe, iori and DST
  // keys, then Dash F (14) and Dash B (15).
  ttro: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 9],
    ['axe', 7],
    ['iori', 8],
    ['dst', 5],
    ['dash', 14],
  ],
  // ASTROMAN's supers S CC, SUPER P and ASS GUN SUPER on 1-3; his specials
  // Jump att (6), Punch (7), ASS GUN (8) and C Chuck (5) on Ryuko's drill,
  // axe, iori and DST keys, then Dash F (13) and Dash B (14).
  astroman: [
    ['getterBeam', 1],
    ['musashi', 2],
    ['changeAttack', 3],
    ['drill', 6],
    ['axe', 7],
    ['iori', 8],
    ['dst', 5],
    ['dash', 13],
  ],
  // YINAN's supers SS, EN Driver, Eat, EN Chuck and R300 (3, 4, 5, 1, 2) on
  // 1-5; her specials Driver (10), Assault (9), DogeAttack (8) and ECS P (11)
  // on Ryuko's drill, axe, iori and DST keys, her type change (13, TO EX) on
  // EX, then Dash F (17) and Dash B (18). EN3 (6) and ECS K (12) take their
  // commands only.
  yinan: [
    ['getterBeam', 3],
    ['musashi', 4],
    ['changeAttack', 5],
    ['blackRush', 1],
    ['megaBeam', 2],
    ['drill', 10],
    ['axe', 9],
    ['iori', 8],
    ['dst', 11],
    ['ex', 13],
    ['dash', 17],
  ],
  // AYA's supers Slash, Rocket and EN3 (2, 3, 1) on 1-3; her specials FB
  // (9), DH (8), SHO (5) and TE P (7) on Ryuko's drill, axe, iori and DST
  // keys, TE K (6) on EX, then Dash F (14) and Dash B (15).
  aya: [
    ['getterBeam', 2],
    ['musashi', 3],
    ['changeAttack', 1],
    ['drill', 9],
    ['axe', 8],
    ['iori', 5],
    ['dst', 7],
    ['ex', 6],
    ['dash', 14],
  ],
  // DoraEmon's supers 魔神空大砲 HP (10), 秘神具騒嵐 HP (6), 鬼神双乱槌 HP
  // (8), 覇神極突貫 HK (4) and 激神超抱擁 (1) on 1-5; his specials 機猫神空砲
  // HP (17), 機猫神天翔 HP (13) and 機猫神突進 HK (19) on Ryuko's drill, axe
  // and iori keys, then Dash F (28) and Dash B (29). FK之意思 (2, 3),
  // 機猫神双槌 (15, 16) and 機猫神瞬移 (21–24) take their commands only.
  dora: [
    ['getterBeam', 10],
    ['musashi', 6],
    ['changeAttack', 8],
    ['blackRush', 4],
    ['megaBeam', 1],
    ['drill', 17],
    ['axe', 13],
    ['iori', 19],
    ['dash', 28],
  ],
  // RARIO's supers Shinku hado (2), for a stock, and Shin Shoryu (1), for
  // two, on 1-2; his specials HADO (6), DRAGON (4) and tatumaki (5) on
  // Ryuko's drill, axe and iori keys, then Dash F (11) and Dash B (12).
  rario: [
    ['getterBeam', 2],
    ['musashi', 1],
    ['drill', 6],
    ['axe', 4],
    ['iori', 5],
    ['dash', 11],
  ],
  // TRAINING's special fb (6) on Ryuko's drill key, then Dash F (4) and
  // Dash B (5).
  training: [
    ['drill', 6],
    ['dash', 4],
  ],
};
export const BACK_DASH: Record<Who, number> = {
  ryuko: 14,
  zoma: 16,
  kiki: 12,
  chung: 15,
  amiro: 14,
  anmc: 12,
  giant: 14,
  suneo: 14,
  yo: 14,
  sin: 17,
  lizard: 13,
  kay: 16,
  dido: 15,
  sakuya: 18,
  alex: 23,
  sou: 21,
  hiso: 21,
  erus: 21,
  feng: 17,
  sean: 22,
  gon: 21,
  kate: 20,
  remu: 20,
  rear: 22,
  gigi: 17,
  sww: 19,
  ogi: 22,
  ziro: 21,
  masa: 12,
  times: 11,
  zenka: 13,
  zmega: 20,
  alpha: 21,
  shinz: 20,
  zaku: 8,
  pachelo: 11,
  golf: 8,
  asura: 9,
  ttro: 15,
  astroman: 14,
  yinan: 18,
  aya: 15,
  dora: 29,
  rario: 12,
  training: 5,
};
// Long enough for the longest window (PAC-HELO's elertic, 100) and the tick
// before it.
export const HISTORY_TICKS = 128;

export function inputWord(
  input: Input,
  forwardIsRight: boolean,
  who: Who = 'ryuko',
) {
  let word = (input.jump ? 4 : 0) | (input.crouch ? DOWN : 0);
  if (input.left) word |= forwardIsRight ? 1 : 2;
  if (input.right) word |= forwardIsRight ? 2 : 1;
  for (const [control, bit] of Object.entries(buttonsOf(who)))
    if (input[control as Control]) word |= bit;
  return word;
}

// 0x41f138: a step's direction nibble as input bits. 2–9 are F, DF, D, DB, B,
// UB, U and UF; 10–13 are back, up, forward and down.
const DIRECTIONS = [0, 0, 2, 10, 8, 9, 1, 5, 4, 6, 1, 4, 2, 8, 0, 0];

// 0x410acf–0x410c24 (and the scan's 0x4101a7–0x4102e8): nibble 0 takes any
// direction, 1–9 exactly theirs (1 none), 10–13 any that has their bit. The
// buttons, bits 4–9, must all be held.
function holds(step: number, word: number) {
  const nibble = step & 15;
  const direction = word & 15;
  const buttons = step & 0x3f0;
  return (
    (!nibble ||
      (nibble < 10
        ? direction === DIRECTIONS[nibble]
        : nibble < 14 && (direction & DIRECTIONS[nibble]) > 0)) &&
    (word & buttons) === buttons
  );
}
// An untyped step's buttons, besides, are none of them held the tick before.
const stepMatches = (step: number, word: number, before: number) =>
  holds(step, word) && !(before & step & 0x3f0);

// 0x41061a–0x410714: a turn step's first F, D, B or U scanned back (table
// 0x410a00: DF counts as F, DB as D, UF as U, UB as B) starts two counts at
// its u16 × 4 (0x41062a). One drops at each earlier exact F, D, B, U in turn
// (0x410a28), the other each the other way round (0x410a38), and the step
// matches once either falls below 2: a whole turn, either way.
const TURN_START: Partial<Record<number, number>> = {
  1: 3,
  2: 1,
  4: 0,
  5: 3,
  6: 0,
  8: 2,
  9: 2,
  10: 1,
};
const TURN = [2, 8, 1, 4];

// The last step marked 0x2000 matches first, then each earlier step on an
// earlier tick, all within the last `window` ticks (op 0x24's 0x410a50 and
// the scan's 0x410171–0x410878).
export function commanded(
  history: readonly number[],
  steps: readonly number[],
  window: number,
  params: readonly number[] = [],
) {
  let k = steps.length - 1;
  while (k >= 0 && !(steps[k] & 0x2000)) k--;
  if (k < 0) return false;
  const now = history.length - 1;
  // A mash step's count (+0x10: the last marked step's u16 × 4, then each
  // earlier step's u16 once one matches, 0x410854) and whether its press is
  // still held (+0x30).
  let left = (params[k] ?? 0) * 4;
  let pressed = false;
  // The turn's states and counts, one each way round.
  let ahead = -1;
  let back = -1;
  let aheadLeft = 0;
  let backLeft = 0;
  for (let t = now; t > now - window; t--) {
    const word = history[t] ?? 0;
    const type = steps[k] >> 14;
    let matched = false;
    if (!type) matched = stepMatches(steps[k], word, history[t - 1] ?? 0);
    else if (type === 1) {
      // 0x4102ed: a mash (PAC-HELO's elertic) counts 4 off for each tick
      // that holds the step after one with no button (scanning back), and
      // matches once the count is spent.
      if (pressed) pressed = (word & 0x3f0) > 0;
      else if (holds(steps[k], word)) {
        pressed = true;
        left -= 4;
        matched = left <= 0;
      }
    } else if (type === 2) {
      // 0x410473: a hold (PAC-HELO's roll) matches once the step holds for
      // its u16 ticks running back from this one, past the window.
      let held = 0;
      while (held < (params[k] ?? 0) && holds(steps[k], history[t - held] ?? 0))
        held++;
      matched = held === (params[k] ?? 0);
    } else if (ahead < 0) {
      ahead = back = TURN_START[word & 15] ?? -1;
      aheadLeft = backLeft = (params[k] ?? 0) * 4;
      matched = false;
    } else {
      if ((word & 15) === TURN[ahead & 3]) {
        ahead++;
        aheadLeft--;
      }
      if ((word & 15) === TURN[(back + 2) & 3]) {
        back += 3;
        backLeft--;
      }
      matched = aheadLeft < 2 || backLeft < 2;
    }
    if (matched) {
      if (--k < 0) return true;
      left = params[k] ?? 0;
    }
  }
  return false;
}

// 0x410060, in free actions and op 0x1e windows: the first entry in table
// order whose steps match and that has an action for the fighter. Airborne
// it takes the air action, though none within 50 source pixels of the floor
// on the way down (0x410096); on the ground and still, the crouching one
// while down is held, else the near or far one (0x4107b7–0x41083a).
export type Stance = 'air' | 'near' | 'far' | 'crouch';
export function scan(
  history: number[],
  fighter: { air: boolean; still: boolean; landing: boolean; near: boolean },
  who: Who = 'ryuko',
): { entry: number; stance: Stance } | null {
  if (fighter.landing) return null;
  const now = history[history.length - 1];
  for (const [index, entry] of entriesOf(who).entries()) {
    if (!entry.window) continue;
    // An entry without steps ends the scan (0x410141).
    if (!entry.steps.length) return null;
    if (!commanded(history, entry.steps, entry.window, entry.params)) continue;
    // 0x41073e: matching a command whose window exceeds 29 clears all but
    // the last 20 ticks, whether or not it has an action.
    if (entry.window > 29) history.fill(0, 0, history.length - 20);
    const stance: Stance | null = fighter.air
      ? 'air'
      : !fighter.still
        ? null
        : now & DOWN
          ? 'crouch'
          : fighter.near
            ? 'near'
            : 'far';
    if (stance && entry[stance]) return { entry: index + 1, stance };
  }
  return null;
}

// 0x4115e3–0x411777: the CPU enters a command by writing its marked steps
// into its history, the last at this tick, each as its direction's bits from
// 0x41f138 plus its buttons, and `direction`'s bits.
export function inject(
  history: number[],
  entry: number,
  who: Who = 'ryuko',
  direction = 0,
  spaced = false,
) {
  const { steps, params = [] } = entriesOf(who)[entry - 1];
  const words = steps
    .flatMap((step, k) => {
      if (!(step & 0x2000)) return [];
      const word = DIRECTIONS[step & 15] | (step & 0x3f0) | direction;
      const times = params[k] ?? 0;
      switch (step >> 14) {
        // 0x411681: a mash (PAC-HELO's elertic) writes its u16 presses, each
        // with a blank after;
        case 1:
          return Array.from({ length: times }, () => [word, 0]).flat();
        // 0x4116c6: a hold (his roll's) its u16 ticks;
        case 2:
          return Array<number>(times).fill(word);
        // 0x4116f7: a turn its u16 rounds of U, B, D and F, which no CPU table
        // enters. Authored: a key writes ZIRO's TWIN SHOT turn as F, D, B and
        // U.
        case 3:
          return spaced
            ? [2, 8, 1, 4]
            : Array.from({ length: times }, () =>
                [4, 1, 8, 2].map((bit) => word | bit),
              ).flat();
      }
      return [word];
    })
    // Authored: a key puts a blank tick before a button its last step held,
    // the fresh press each step needs (G Suneo's hh: K, K, ←, J, K).
    .flatMap((word, k, words) =>
      spaced && k && word & words[k - 1] & 0x3f0 ? [0, word] : [word],
    );
  history.splice(history.length - words.length, words.length, ...words);
}
