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
  // The remaining 44 fighters arrive with their own tasks; declared as the
  // finished shape so pages can index by any Who (pages validate first).
} as Record<Who, FighterGuide>;
