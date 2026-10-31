import type { Who } from '../game/characters';

// One page per fighter, laid out like the select screen. The face grid and the
// guide tables port docs/superpowers/specs/2026-10-31-guide-revamp-mockup.html.

// Grid order of the select screen (src/game/select.ts ROSTER); null = GATE LOCK.
export const GRID: readonly (string | null)[] = [
  'Ryuko',
  'Zoma',
  'Kiki',
  'Chung',
  'Amiro',
  'ANMC P',
  'Giant',
  'G Suneo',
  'Yo',
  'SIN',
  'LIZARD',
  'KAY',
  'DIDO',
  'SAKUYA',
  'ALEX',
  'SOU',
  'HISO',
  'ERUS',
  'OS FENG',
  'SEAN',
  'GON',
  'KATE',
  'REMU',
  'REAR',
  'GIGI',
  'SWW',
  'OGI',
  'ZIRO',
  'MASA',
  '3-TIMES',
  'ZENKA',
  'Z-MEGA',
  'ALPHA',
  'SHIN-Z',
  'ZAKU',
  'PAC-HELO',
  'GOLF',
  'ASURA',
  'TTRO',
  'ASTROMAN',
  'YINAN',
  'AYA',
  null,
  null,
  null,
  'DoraEmon',
  'RARIO',
  'TRAINING',
];

// Tile origins in the 206 x 417 sheet: columns come in pairs, odd columns sit 7px lower.
export const XS: readonly number[] = [0, 25, 52, 77, 104, 129, 157, 182];

// name/input/desc are authored static HTML, exactly the mockup's cell contents.
export interface FighterGuide {
  art: string;
  nameplate: string; // empty = render the fighter's display name as text
  role: string;
  tag: string;
  ex: boolean;
  sections: {
    title: string;
    // h2 side note on a section without a Cost column; the gauge note on one
    // with it (the mockup's only two note shapes).
    note: string;
    cost: boolean; // the section's table has a Cost column
    rows: { name: string; input: string; desc: string; cost: number }[];
  }[];
}

// Stocks on the power gauge: 0.5/1/2/3, 0 = none.
export const GUIDES_DATA = {
  ryuko: {
    art: '/assets/ryuko/419.png',
    nameplate: '/assets/ryuko/464.png',
    role: 'Getter pilot',
    tag: 'All-round hero. Chains up to three from any standing punch or kick, and cancels any connected hit into his specials and supers.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Walk / Crouch',
            input:
              '<kbd>A</kbd><kbd>D</kbd><span class="sep">/</span><kbd>S</kbd>',
            desc: 'Arrow keys also move. Hold <kbd>S</kbd> or ↓ to crouch.',
            cost: 0,
          },
          {
            name: 'Guard',
            input: 'hold away',
            desc: 'Jumping attacks break a crouching guard.',
            cost: 0,
          },
          {
            name: 'Jump / Double Jump',
            input: '<kbd>W</kbd><span class="sep">,</span><kbd>W</kbd> in air',
            desc: 'In the air, release every direction then press jump again; steer with left or right. One double jump and one air dash per jump.',
            cost: 0,
          },
          {
            name: 'Dash / Backdash',
            input: '<kbd>⇧</kbd> or <span class="motion">→→</span>',
            desc: 'Double-tap a direction, letting go in between, on the ground or in the air. Hold away with <kbd>⇧</kbd> to backdash.',
            cost: 0,
          },
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: 'Tap again when a standing punch hits or is blocked, up to three; the second punch strikes 3×. Chains can cross with the kick chain. A missed attack has no follow-up; holding a button never repeats.',
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: 'Third standing kick strikes 8×; jumping kick strikes 3×.',
            cost: 0,
          },
          {
            name: 'Hit Up <em>+ chase</em>',
            input:
              '<kbd>K</kbd><span class="sep">,</span> then <kbd>W</kbd> on hit',
            desc: "Upward kick. Press or hold Jump near the end of the impact pause (or just after) to chase into the air. Blocked or missed kicks can't chase.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Specials',
        note: 'No stock cost',
        cost: false,
        rows: [
          {
            name: 'Drill Punch',
            input: '<kbd>U</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'Six hits on the ground; aerial drill while jumping — first hit lifts, each hit or block adds a weaker strike while in range. Landing ends it in recovery.',
            cost: 0,
          },
          {
            name: 'Spinning Axe',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'One axe out at a time; pressing again while it flies only makes Ryuko stand.',
            cost: 0,
          },
          {
            name: 'IORI <em>×3</em>',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'Advancing strike; press again near the end for the second, then the knockdown finisher. Holding performs one stage. Cancels into a super (2 stocks, faster form).',
            cost: 0,
          },
          {
            name: 'Throw',
            input: '<kbd>O</kbd> close',
            desc: 'Grab and throw even through guard. A miss leaves recovery; jumping avoids it, a strike interrupts startup.',
            cost: 0,
          },
          {
            name: 'Daisetsuzan',
            input:
              '<kbd>J</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: 'Command throw: transforms, spins the opponent overhead, hurls them skyward, two missiles catch the fall. Long recovery on a miss; started far, its shorter grab stays open through it. Below 30% health becomes <b>EVIL DST</b> (five strikes first).',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — up to three stocks. Without enough stock, Ryuko shouts NO SUPER and gains a little power instead. Any connected punch or kick can be cancelled into a special or super.',
        cost: true,
        rows: [
          {
            name: 'Getter Beam',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'Also in the air. Below 30% health takes its stronger form.',
            cost: 1,
          },
          {
            name: 'Musashi',
            input:
              '<kbd>2</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'Grabs at close range.',
            cost: 1,
          },
          {
            name: 'Getter Change Attack',
            input:
              '<kbd>3</kbd> or <span class="motion">→↓←→↓←</span><kbd>H</kbd>',
            desc: 'Grabs at close range.',
            cost: 1,
          },
          {
            name: 'Axe / Black Rush',
            input:
              '<kbd>4</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'Throws an axe; below 30% health becomes the Black Getter Mega Rush.',
            cost: 1,
          },
          {
            name: 'Mega Getter Beam',
            input:
              '<kbd>5</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'Needs all three stocks.',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
          {
            name: 'EX Mode',
            input: '<kbd>E</kbd> or <span class="motion">↓↓</span><kbd>K</kbd>',
            desc: 'Toggle. In EX: <kbd>I</kbd> fires EX Fire (hold forward to charge; full charge launches), <kbd>1</kbd> fires EFS (four shots + launcher). Vs. CPU: hold ↓ as the round begins.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  // The 44 below ship their hero art and nameplate now; role/tag/sections
  // arrive with each fighter's content task (empty = the page renders just
  // the hero until then). Art/plate indices were picked from contact sheets
  // of every exported frame; '' plate = the fighter has no VS banner, so the
  // page draws its display name as text.
  zoma: {
    art: '/assets/zoma/174.png',
    nameplate: '/assets/zoma/340.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  kiki: {
    art: '/assets/kiki/312.png',
    nameplate: '/assets/kiki/217.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  chung: {
    art: '/assets/chung/116.png',
    nameplate: '/assets/chung/375.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  amiro: {
    art: '/assets/amiro/384.png',
    nameplate: '/assets/amiro/336.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  anmc: {
    art: '/assets/anmc/291.png',
    nameplate: '/assets/anmc/183.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  giant: {
    art: '/assets/giant/165.png',
    nameplate: '/assets/giant/349.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  suneo: {
    art: '/assets/suneo/376.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  yo: {
    art: '/assets/yo/3001.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  sin: {
    art: '/assets/sin/241.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  lizard: {
    art: '/assets/lizard/146.png',
    nameplate: '/assets/lizard/217.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  kay: {
    art: '/assets/kay/125.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  dido: {
    art: '/assets/dido/147.png',
    nameplate: '/assets/dido/258.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  sakuya: {
    art: '/assets/sakuya/414.png',
    nameplate: '/assets/sakuya/445.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  alex: {
    art: '/assets/alex/389.png',
    nameplate: '/assets/alex/362.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  sou: {
    art: '/assets/sou/305.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  hiso: {
    art: '/assets/hiso/215.png',
    nameplate: '/assets/hiso/445.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  erus: {
    art: '/assets/erus/360.png',
    nameplate: '/assets/erus/366.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  feng: {
    art: '/assets/feng/384.png',
    nameplate: '/assets/feng/449.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  sean: {
    art: '/assets/sean/140.png',
    nameplate: '/assets/sean/247.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  gon: {
    art: '/assets/gon/488.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  kate: {
    art: '/assets/kate/170.png',
    nameplate: '/assets/kate/276.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  remu: {
    art: '/assets/remu/293.png',
    nameplate: '/assets/remu/428.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  rear: {
    art: '/assets/rear/385.png',
    nameplate: '/assets/rear/387.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  gigi: {
    art: '/assets/gigi/288.png',
    nameplate: '/assets/gigi/328.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  sww: {
    art: '/assets/sww/3001.png',
    nameplate: '/assets/sww/399.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  ogi: {
    art: '/assets/ogi/483.png',
    nameplate: '/assets/ogi/108.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  ziro: {
    art: '/assets/ziro/420.png',
    nameplate: '/assets/ziro/478.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  masa: {
    art: '/assets/masa/267.png',
    nameplate: '/assets/masa/139.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  times: {
    art: '/assets/times/3001.png',
    nameplate: '/assets/times/139.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  zenka: {
    art: '/assets/zenka/152.png',
    nameplate: '/assets/zenka/333.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  zmega: {
    art: '/assets/zmega/3001.png',
    nameplate: '/assets/zmega/322.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  alpha: {
    art: '/assets/alpha/3001.png',
    nameplate: '/assets/alpha/576.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  shinz: {
    art: '/assets/shinz/3001.png',
    nameplate: '/assets/shinz/323.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  zaku: {
    art: '/assets/zaku/118.png',
    nameplate: '/assets/zaku/139.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  pachelo: {
    art: '/assets/pachelo/134.png',
    nameplate: '/assets/pachelo/149.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  golf: {
    art: '/assets/golf/129.png',
    nameplate: '/assets/golf/155.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  asura: {
    art: '/assets/asura/129.png',
    nameplate: '/assets/asura/137.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  ttro: {
    art: '/assets/ttro/142.png',
    nameplate: '/assets/ttro/170.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  astroman: {
    art: '/assets/astroman/186.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  yinan: {
    art: '/assets/yinan/132.png',
    nameplate: '/assets/yinan/205.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  aya: {
    art: '/assets/aya/4137.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  dora: {
    art: '/assets/dora/273.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  rario: {
    art: '/assets/rario/169.png',
    nameplate: '/assets/rario/235.png',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
  training: {
    art: '/assets/training/150.png',
    nameplate: '',
    role: '',
    tag: '',
    ex: false,
    sections: [],
  },
} as Record<Who, FighterGuide>;
