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
        note: 'Power gauge: hits, blocking and taking damage fill it — up to three stocks for most fighters. Without enough stock, Ryuko shouts NO SUPER and gains a little power instead. Any connected punch or kick can be cancelled into a special or super.',
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
    role: 'Vanishing dragon strikes and falling bombs',
    tag: 'Chains three from any standing punch or kick; runs while forward is held, and below 30% health his fourth super becomes Shin Spark.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch / Kick chain',
            input:
              '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>, then again',
            desc: 'On a hit or block, press either again for the second strike, then again for the third. Hold ↓ for his crouching punch and sweep; in the air, his air punch and kick.',
            cost: 0,
          },
          {
            name: 'Run / Backdash',
            input: '<kbd>⇧</kbd> or <span class="motion">→→</span>',
            desc: 'Runs while forward is held; ↑ during the run leaps high. Back held hops back instead. ↑ in the air double jumps; →→ there air dashes.',
            cost: 0,
          },
          {
            name: 'Hit Up <em>+ chase</em>',
            input: '<kbd>K</kbd>',
            desc: 'Up on a hit chases.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A close grab that slams and tosses the opponent, then throws a hatchet.',
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
            name: 'DRAGON',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'Also in the air. After it connects, SPAKE or DST cancels it for two stocks.',
            cost: 0,
          },
          {
            name: 'FIRE',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'One fireball at a time; again while it flies, he punches.',
            cost: 0,
          },
          {
            name: 'dragon 2',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'Vanishes and strikes from ahead — <span class="motion">↓←</span><kbd>H</kbd> farther, <span class="motion">↓←</span><kbd>G</kbd>+<kbd>H</kbd> in place.',
            cost: 0,
          },
          {
            name: 'BOMB',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'Three bombs falling on marks ahead — five, then he reloads.',
            cost: 0,
          },
          {
            name: 'G Beam',
            input:
              '<kbd>E</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: '—',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'SPAKE',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A charging dash, also in the air.',
            cost: 1,
          },
          {
            name: 'DST',
            input:
              '<kbd>2</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'A close command grab that tosses, juggles and blasts the opponent.',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: '—',
            cost: 3,
          },
          {
            name: 'BOMB / Shin Spark',
            input:
              '<kbd>4</kbd> or <span class="motion">↓←↓→</span><kbd>H</kbd>',
            desc: 'Below 30% health, <b>Shin Spark</b> for three stocks; BOMB otherwise (no stock).',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding — <kbd>K</kbd> early, <kbd>G</kbd>+<kbd>H</kbd> late.',
            cost: 1,
          },
        ],
      },
    ],
  },
  kiki: {
    art: '/assets/kiki/312.png',
    nameplate: '/assets/kiki/217.png',
    role: "A branching K' and eleven fireballs",
    tag: "Chains as Zoma's; her K' branches into a dashing strike, a shot or BLACK OUT, and MAGIC FIRE throws eleven fireballs.",
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Zoma's; her third punch is a long lunge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Zoma's; her third kick is a flying fist. ↓ with <kbd>H</kbd> throws a hopping potato.",
            cost: 0,
          },
          {
            name: 'Hop / Backdash',
            input: '<kbd>⇧</kbd> or <span class="motion">→→</span>',
            desc: 'Hops forward, back held hops back; in the air, →→ air dashes.',
            cost: 0,
          },
          {
            name: 'Hit Up <em>+ chase</em>',
            input: '<kbd>K</kbd>',
            desc: 'Up on a hit chases.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A close grab that ends in a blast.',
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
            name: 'DRAGON O',
            input: '<kbd>U</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A rising multi-hit, also in the air.',
            cost: 0,
          },
          {
            name: "K'",
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'Then <span class="motion">→</span><kbd>H</kbd> a dashing strike (stronger if repeated soon after it hits), <span class="motion">→</span><kbd>G</kbd> a shot or <span class="motion">←</span><kbd>H</kbd> BLACK OUT.',
            cost: 0,
          },
          {
            name: 'TATUMAKI',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A hopping spin. As it lands, ranbu or MAGIC FIRE cancels it for two stocks.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'ranbu',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: 'A dash into a slam and flurry.',
            cost: 1,
          },
          {
            name: 'MAGIC FIRE',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'Eleven fireballs.',
            cost: 1,
          },
          {
            name: 'EN3 majic dance',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'For three stocks: lifts the opponent, then witches fly in and a beam hops them in and out.',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  chung: {
    art: '/assets/chung/116.png',
    nameplate: '/assets/chung/375.png',
    role: 'Wall kicks and thrown stars',
    tag: "Chains as Zoma's; his jump wall move clings to the wall, and gesar and lee turn Evil below 30% health.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Zoma's; his third punch is a strike that catches and blasts the opponent away.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Zoma's; ↓ with <kbd>H</kbd> is a burning kick that knocks down.",
            cost: 0,
          },
          {
            name: 'Dash / Backdash',
            input: '<kbd>⇧</kbd> or <span class="motion">→→</span>',
            desc: 'Dashes, back held dashes back; ↑ in the air double jumps, →→ there air dashes.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A close grab that hurls the opponent into the screen's edge.",
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'Also in the air.',
            cost: 0,
          },
          {
            name: 'Fire ball',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A thrown star.',
            cost: 0,
          },
          {
            name: 'orochi',
            input:
              '<kbd>F</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Burn Knock',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'jump wall move',
            input: '<span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A leap back that clings to the wall — <kbd>H</kbd> kicks off it, <kbd>G</kbd> or ↑ leaps away.',
            cost: 0,
          },
          {
            name: 'air fire',
            input: '<span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'In the air.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'gesar',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'In the air, nin star; below 30% health, <b>Evil gesar</b>.',
            cost: 1,
          },
          {
            name: 'lee',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'Kicks that carry the opponent up and leave them floating; below 30% health, <b>Evil Lee</b>.',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'For three stocks: shocks the opponent, then lifts and tosses them about.',
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
            desc: 'Half a stock each way; several of his moves take their EX forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  amiro: {
    art: '/assets/amiro/384.png',
    nameplate: '/assets/amiro/336.png',
    role: 'Meteor drops and beam drones',
    tag: "Chains as Chung's; her Coment chuck throws straight up, and NT, funnal and medeo take Evil forms below 30% health.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: her third punch lunges and hurls the opponent into the screen's edge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: her third kick throws a bouncing ball; ↓ with <kbd>H</kbd> sweeps.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab and a spinning toss.',
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'Also in the air.',
            cost: 0,
          },
          {
            name: 'BEAM',
            input:
              '<kbd>I</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Coment chuck',
            input:
              '<kbd>F</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: 'A grab that throws the opponent straight up.',
            cost: 0,
          },
          {
            name: 'morning star',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A flail.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'scc',
            input:
              '<kbd>1</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'A grab, a toss up and a beam.',
            cost: 1,
          },
          {
            name: 'medeo',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'A meteor drop; below 30% health, its <b>Evil</b> form.',
            cost: 3,
          },
          {
            name: 'NT',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'A flying unit that strikes from range; below 30% health, its <b>Evil</b> form.',
            cost: 1,
          },
          {
            name: 'funnal',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'Drones that fire beams; below 30% health, its <b>Evil</b> form.',
            cost: 1,
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
            desc: 'Half a stock each way; swaps her specials and supers for other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  anmc: {
    art: '/assets/anmc/291.png',
    nameplate: '/assets/anmc/183.png',
    role: 'Rocket leaps and beam-firing balls',
    tag: "Chains as Chung's; both of his shots also work in the air, and in EX mode he guards in a winged bird costume instead of his mecha suit.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: his third punch rushes in and hurls the opponent into the screen's edge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: his third kick blasts them away; ↓ with <kbd>H</kbd> knocks down.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab that spins the opponent away.',
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
            name: 'fly move',
            input: '<kbd>U</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A rocket leap.',
            cost: 0,
          },
          {
            name: 'fire ball',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'Lobbed in a high arc; also in the air.',
            cost: 0,
          },
          {
            name: 'twis att',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A spinning rush that a super can cancel.',
            cost: 0,
          },
          {
            name: 'ball fire',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A straight shot; also in the air.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'SUPER CHUCK',
            input:
              '<kbd>1</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'A grab and a beating.',
            cost: 1,
          },
          {
            name: 'super ball',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'Balls that fire beams.',
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A barrage of shots.',
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
            desc: 'Half a stock each way: he guards in a winged bird costume instead of his mecha suit, and his kicks, chuck and twis att take other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  giant: {
    art: '/assets/giant/165.png',
    nameplate: '/assets/giant/349.png',
    role: 'Rocket punches and baseball pitches',
    tag: "Chains as Chung's; his counter eats double damage before striking back, and his chuck ends with a song that explodes.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: his third punch knocks the opponent away.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: his third kick grabs and twists them away but knocks him down too.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'An uppercut or a sweep.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab, then a song that dazes the opponent until the music explodes, throwing you both.',
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
            name: 'Rock punch',
            input:
              '<kbd>U</kbd> or <span class="motion">→←↓→</span><kbd>G</kbd>',
            desc: 'A rocket punch that flies out from range.',
            cost: 0,
          },
          {
            name: 'base ball',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A pitch of random kind; in the air, a diving punch.',
            cost: 0,
          },
          {
            name: 'H PUNCH',
            input: '<kbd>F</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "A hammer punch that hurls the opponent into the screen's edge, which a super can cancel.",
            cost: 0,
          },
          {
            name: 'counter',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'Struck during its stance he takes double damage, then strikes back, rushing in to beat the opponent inside a cloud of dust.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'fire',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A fire beam, also in the air; below 30% health, <b>Evil fire</b>.',
            cost: 1,
          },
          {
            name: 'HARIKEN',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A whirlwind.',
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'Calls his friends, then a screen-wide barrage.',
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
            desc: 'Half a stock each way; swaps his third punch and kick, Hit Up, specials and supers for other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  suneo: {
    art: '/assets/suneo/376.png',
    nameplate: '',
    role: 'Lion rider',
    tag: "Chains as Chung's; her BIKE leaps on a golden lion, and below 30% health hh shocks the whole screen for three stocks.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: her third punch hurls the opponent into the screen's edge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: her third kick is a leaping kick that strikes again and again.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A rising punch or a sliding sweep.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab, a hop back and a leaping throw that spins the opponent away.',
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
            name: 'DRILL KNIEE',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: 'A rising knee, also in the air.',
            cost: 0,
          },
          {
            name: 'FIRE BALL',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A shot that speeds up, which a super can cancel.',
            cost: 0,
          },
          {
            name: 'G DRIVER',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A drill lance thrust that hurls the opponent into the screen's edge; in EX mode a shocking strike.",
            cost: 0,
          },
          {
            name: 'BIKE',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A leap on a golden lion, also in the air; in EX mode a wheel that strikes again and again.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'hh',
            input:
              '<kbd>1</kbd> or <kbd>H</kbd><kbd>H</kbd><span class="motion">←</span><kbd>G</kbd><kbd>H</kbd>',
            desc: 'Below 30% health only: a screen-wide shock into a long beating.',
            cost: 3,
          },
          {
            name: 'GP',
            input:
              '<kbd>2</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'A grab and a beating out of sight.',
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A shock, then a hammer.',
            cost: 3,
          },
          {
            name: 'BP',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A flying fist that strikes three times; a ring below 30% health.',
            cost: 1,
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
            desc: 'Half a stock each way; swaps her second kick, crouching and air attacks, Hit Up, chuck and specials for other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  yo: {
    art: '/assets/yo/3001.png',
    nameplate: '',
    role: 'Monster costume',
    tag: 'In a costume for most moves; ZOMBI WALK bites to heal her, and HIDDEN surfaces below 30% health.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: her third punch is a pistol shot.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: her third kick is a kick in a long coat.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A licker's tongue lash or a plant's lash into a knockdown.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A monster rising from the floor.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'Zombie hands burst from the floor to hold the opponent, then a kick.',
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A man springing out of a trunk with the opponent.',
            cost: 0,
          },
          {
            name: 'TOFU',
            input: '<kbd>I</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A gatling burst.',
            cost: 0,
          },
          {
            name: 'ZOMBI WALK',
            input:
              '<kbd>F</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: "A zombie's shuffle that grabs and bites the opponent, healing her; a super can cancel it.",
            cost: 0,
          },
          {
            name: 'Run in',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A monster's charge and claw.",
            cost: 0,
          },
          {
            name: 'Fire ball',
            input: '<span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'In the air: a rocket.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'GIGA PRESS',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: "A charge that carries the opponent into the screen's edge, then slams them.",
            cost: 1,
          },
          {
            name: 'HIDDEN',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: "Below 30% health only: a hidden brute's rush and beating.",
            cost: 1,
          },
          {
            name: 'snake',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'A giant snake rising from the floor.',
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A cannon blast across the screen.',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  sin: {
    art: '/assets/sin/241.png',
    nameplate: '',
    role: 'Shapeshifter',
    tag: 'Another guise for most moves; RUN CHUCK and Clack chuck hit harder below 30% health, where he stands in a red blaze.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: his second punch is a horned demon's dashing slash, his third a golden serpent's lunge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: his second kick a sweep, then a rising kick, his third a wolf's leap.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A chainsaw thrust or a low blade into a knockdown.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A masked man's grab and throw.",
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
            name: 'S PUNCH',
            input: '<kbd>U</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A dashing flurry of blasts; BAKU or SUP RUN C cancels it for two stocks.',
            cost: 0,
          },
          {
            name: 'low chuck',
            input:
              '<kbd>I</kbd> or <span class="motion">←↓→</span><kbd>G</kbd>',
            desc: "A hooked pole that catches the opponent's feet and flips them.",
            cost: 0,
          },
          {
            name: 'RUN CHUCK',
            input:
              '<kbd>F</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A dashing grab that leaps and drops the opponent on their head, also in the air; harder below 30% health.',
            cost: 0,
          },
          {
            name: 'Clack chuck',
            input:
              '<kbd>J</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: 'A grab, a leap and a slam; harder below 30% health.',
            cost: 0,
          },
          {
            name: 'WOLF att',
            input: '<span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A wolf's leap.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'BAKU',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: "A masked brute's charge.",
            cost: 1,
          },
          {
            name: 'SUP RUN C',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "RUN CHUCK into a clawed figure's slashes, also in the air.",
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>3</kbd> or <span class="motion">→↓←→↓←</span><kbd>G</kbd>',
            desc: 'A grab and machete cuts; in EX mode three lion-head pillars.',
            cost: 3,
          },
          {
            name: 'NOZAN',
            input:
              '<kbd>4</kbd> or <span class="motion">→↓←→↓←</span><kbd>H</kbd>',
            desc: 'Below 30% health only: a grab and a long beating out of sight.',
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
            desc: 'Half a stock each way; swaps his stance and his grabs for other forms. Below 30% health he stands in a red blaze.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  lizard: {
    art: '/assets/lizard/146.png',
    nameplate: '/assets/lizard/217.png',
    role: 'Mecha changer',
    tag: 'A man in a yellow suit who becomes a different mecha or armor for most moves; no EX mode, and HIDDEN waits below 30% health.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Chains as Chung's: his second punch is a purple mecha's blade slash, his third an orange-armored shield bash.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "Chains as Chung's: his second kick a red mecha's spinning kick, his third a winged white mecha's blade.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A prone rifle shot or a low swipe into a knockdown.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A black mecha's rising lance.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A blue-armored grab that spins the opponent away.',
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
            name: 'Cross',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A red mecha raising a pillar of red light.',
            cost: 0,
          },
          {
            name: 'FIRE',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A blast of red lightning.',
            cost: 0,
          },
          {
            name: 'jump att',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: "A purple mecha's leaping grab and throw, also in the air.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'HIDDEN',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: "Below 30% health only: a rush into a fanged maw's bite.",
            cost: 1,
          },
          {
            name: 'chuck sup',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: 'A leap that catches an opponent in the air, swallows them in a giant striped sphere and drops them.',
            cost: 1,
          },
          {
            name: 'dragon sp',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "A leap in a black slab's disguise whose hit calls a flight of white winged beasts down on the opponent.",
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>4</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "A pale spirit's orb that bursts into a dome of light.",
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  kay: {
    art: '/assets/kay/125.png',
    nameplate: '',
    role: 'Monkey-faced boy',
    tag: 'Dresses up as a different angel or mecha for most moves; EX swaps most of them, and his air guards free him after 6 ticks.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A swipe of his curl, a pink-haired figure's ribbon lashes, a gold-collared figure's paper blades; in EX mode a lance thrown from a red cross.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a striped sphere's swallow, a gold-masked figure's strike; in EX mode a stretching punch.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A blue crystal's jab or a black figure's low sweep.",
            cost: 0,
          },
          {
            name: 'Guard',
            input: 'hold away',
            desc: 'His air guards free him after 6 ticks.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A fishing rod's cast.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A nurse's syringe.",
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
            name: 'air chuck',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "A spider's leap that catches only an airborne opponent and crashes down with them, knocking him down too; also in the air.",
            cost: 0,
          },
          {
            name: 'Fire',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "A spinning red lance thrown from a cross; in EX mode a stance — <kbd>O</kbd> turns it into a dashing grab, <kbd>K</kbd> a claw's beam.",
            cost: 0,
          },
          {
            name: 'Counter',
            input:
              '<kbd>F</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A twin-colored stance that splits in two and slashes whoever strikes it. After its slash, KAORU or SUPER P cancels for two stocks.',
            cost: 0,
          },
          {
            name: 'Comment chuck',
            input:
              '<kbd>J</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: "A clawed black figure's grab; harder below 30% health, and in EX mode a pink figure's whips.",
            cost: 0,
          },
          {
            name: '12P / 12K',
            input: '<span class="motion">↓←</span><kbd>G</kbd> or <kbd>H</kbd>',
            desc: 'Black arms bursting from the ground at two distances; in EX mode a pillar of light at one, a decoy at the other.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'en300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "A purple mecha's grab and berserk mauling; in EX mode the mecha's claw wave.",
            cost: 3,
          },
          {
            name: 'KAORU',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "A silver-haired boy's low grab into a long scene with a giant purple hand; in EX mode a ribbon-armed figure's slashes.",
            cost: 1,
          },
          {
            name: 'SUPER P',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A wound-up stretching punch; in EX mode a blue crystal's beam.",
            cost: 1,
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
            desc: 'Half a stock each way; swaps most of his moves for other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  dido: {
    art: '/assets/dido/147.png',
    nameplate: '/assets/dido/258.png',
    role: 'Costume fighter',
    tag: 'A blonde girl in a black dress who dresses up as a different armored figure or mecha; ↑ during a forward dash is a long jump.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "An axe's swing, a red-armored figure's flying kick, a blue mecha's lance lunge.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a blue hover scooter's ram, an orange-armored figure's trident.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A sheep costume's crawl or a blue tail's low sweep.",
            cost: 0,
          },
          {
            name: 'Forward H',
            input: '<span class="motion">→</span><kbd>H</kbd>',
            desc: "A tiger-striped figure's dashing strike; ↑ during a forward dash is a long jump.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A maid's swing.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A green arm cannon's grab.",
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
            name: 'slid',
            input: '<kbd>U</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A low dive on a white jet sled.',
            cost: 0,
          },
          {
            name: 'fire',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "A gold-winged figure's blue flames; in the air a purple winged figure's, harder below 30% health.",
            cost: 0,
          },
          {
            name: 'RAiden',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: "A grey mecha's claw strike that <kbd>H</kbd> keeps striking.",
            cost: 0,
          },
          {
            name: 'doge',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A pink heart-armored figure's dash, low enough to pass under most strikes; it strikes once beside the opponent.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'Hidden En300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>H</kbd>',
            desc: "Below 30% health: a white-robed girl's magic circle whose catch plays a long scene of wings and water (slid otherwise).",
            cost: 3,
          },
          {
            name: 'Temjin fly',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A white-suited girl surfing a giant blade, also in the air.',
            cost: 1,
          },
          {
            name: 'dragon super',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: "A hooded figure's blue lightning dragon coiling around her.",
            cost: 1,
          },
          {
            name: 'Raiden',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A red mecha's barrage fired diagonally up the screen.",
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>5</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: "A purple winged mecha's dash whose catch sends giant hands sweeping across the stage behind her.",
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  sakuya: {
    art: '/assets/sakuya/414.png',
    nameplate: '/assets/sakuya/445.png',
    role: 'Swordswoman',
    tag: 'A brown-haired girl in purple who dresses up as a different swordswoman, armored figure or mecha; seven specials, two of them on <kbd>4</kbd> and <kbd>5</kbd>.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "Her sword's slash, a pink-kimono swordswoman's slash, a silver-armored figure's red blades.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a red-dressed girl's crossbow, a red-armored figure's chain claw that catches the opponent far out and pulls them back up.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A red-clad girl's jab or a purple maid's scythe sweep.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A giant teddy bear.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A scythe's grab.",
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
            name: 'Dragon punch',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'Rising on white wings.',
            cost: 0,
          },
          {
            name: 'FIRE',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A fireball, also in the air.',
            cost: 0,
          },
          {
            name: 'iori',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A dashing slash with two follow-ups on <span class="motion">↓←</span><kbd>G</kbd>.',
            cost: 0,
          },
          {
            name: 'counter',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A stance that grabs and throws whoever strikes her.',
            cost: 0,
          },
          {
            name: 'DRAGON KICK',
            input:
              '<kbd>4</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: 'A dash with red blades.',
            cost: 0,
          },
          {
            name: 'LOW FIRE',
            input: '<kbd>5</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A low staff sweep.',
            cost: 0,
          },
          {
            name: 'C C',
            input: '<span class="motion">←↓→</span><kbd>H</kbd>',
            desc: 'A blade rush that <span class="motion">↓→</span><kbd>H</kbd> or <kbd>G</kbd> turns into a mounted rider\'s charge.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'en300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: "A swordswoman's dash whose catch turns into a mecha girl's blade combo.",
            cost: 3,
          },
          {
            name: 'super HIT UP',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "A swing that calls an airship; in the air a mecha's diving dash.",
            cost: 1,
          },
          {
            name: 'SPARK',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A horned mecha girl's blade dash.",
            cost: 1,
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
            desc: 'Half a stock each way; most of her moves take other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  alex: {
    art: '/assets/alex/389.png',
    nameplate: '/assets/alex/362.png',
    role: 'Armored hero',
    tag: 'A boy in a cap who dresses up as a different armored hero or mecha for most moves; REFLACT turns projectiles back and en300 summons a white mecha dragon.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a red-armored figure's sword sweep, a grey-armored figure's lance gun.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a yellow-armored figure's twin daggers, a blue-armored figure's bow.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A red lance's jab or sweep.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'An uppercut.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A drill lance's grab.",
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
            name: 'dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A rising drill lance.',
            cost: 0,
          },
          {
            name: 'Arrow',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "In the air: a pink-armored archer's arrow.",
            cost: 0,
          },
          {
            name: 'REFLACT',
            input: '<kbd>F</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'An arm shield that turns an incoming projectile back.',
            cost: 0,
          },
          {
            name: 'counter',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A stance that slashes back at whoever strikes him.',
            cost: 0,
          },
          {
            name: 'HAOU',
            input:
              '<kbd>4</kbd> or <span class="motion">→←↓→</span><kbd>G</kbd>',
            desc: "A combined blaster's shot.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'en300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'Summons a white mecha dragon.',
            cost: 3,
          },
          {
            name: 'GYSA',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "A red-horned mecha's three sword strikes.",
            cost: 1,
          },
          {
            name: 'super fire',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A red dinosaur tank's cannon.",
            cost: 1,
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
            desc: 'Half a stock each way; most of his moves take other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  sou: {
    art: '/assets/sou/305.png',
    nameplate: '',
    role: 'Mecha pilot',
    tag: 'A boy in a white headband who dresses up as a black-armored mecha or a helmeted pilot; EX mode calls beast mechas — panther, lion, eagle jet and mammoth.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a soldier's punch, the mecha's arm punch.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A short sword's slash, the mecha's scythe sweep, a gunman's pistol shot.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A red-helmed figure's punch or a yellow-helmed one's.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "The pilot's uppercut.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "The mecha's grab.",
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
            name: 'AKUMA jump',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: "A leap that <kbd>G</kbd> or <kbd>H</kbd> turns into a diving punch or a flying kick; in EX mode the mecha's rising uppercut.",
            cost: 0,
          },
          {
            name: 'Fire Kick',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: "The mecha's low rifle shot; in the air a flying kick, in EX mode it calls a black panther.",
            cost: 0,
          },
          {
            name: 'IORI',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'The mecha\'s sword slashes, chained on <span class="motion">↓←</span><kbd>G</kbd>.',
            cost: 0,
          },
          {
            name: 'BK',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "The mecha's dashing punch; in EX mode it calls a yellow lion — in the air an eagle jet the pilot hangs from, steered with the directions for up to five seconds and dropped with <kbd>G</kbd>, <kbd>H</kbd> or <kbd>O</kbd>.",
            cost: 0,
          },
          {
            name: 'MID SLASS',
            input: '<span class="motion">↓←</span><kbd>H</kbd>',
            desc: "The mecha's sword slash; in EX mode a leaping ground slam.",
            cost: 0,
          },
          {
            name: 'HIDDEN A',
            input: '<span class="motion">↓→</span><kbd>K</kbd>',
            desc: 'A quick step; in EX mode it calls a white mammoth.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'KOKAKEN',
            input:
              '<kbd>1</kbd> or <kbd>O</kbd><kbd>G</kbd><span class="motion">←</span><kbd>H</kbd><kbd>K</kbd>',
            desc: "Below 30% health only: the pilot's sword dash.",
            cost: 3,
          },
          {
            name: 'Command 1',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓←</span><kbd>H</kbd>',
            desc: "The mecha's punch rush.",
            cost: 1,
          },
          {
            name: 'Beast att',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'The lion, panther and mammoth charging in turn.',
            cost: 3,
          },
          {
            name: 'SPARK',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A dive as a black jet, also in the air.',
            cost: 1,
          },
          {
            name: 'DANKU SHOT',
            input:
              '<kbd>5</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "The mecha's shoulder cannons.",
            cost: 1,
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
            desc: 'Half a stock each way; most of his moves take other forms, calling beast mechas among them.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  hiso: {
    art: '/assets/hiso/215.png',
    nameplate: '/assets/hiso/445.png',
    role: 'Boy in a red sleeveless top',
    tag: 'Dresses up as a different character for most moves; his counter stance has a machine-gun man fire back, and en300 for three stocks calls a dark giant.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a suited man's pointing jab, a girl in glasses swinging a vacuum cleaner's toothed hose.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a clown-faced boy's thrown rock, a muscled brawler's punch.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A samurai's sword slash or the brawler's punch.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'An uppercut.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "The clown-faced boy's grab and sliding kick.",
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
            name: 'Dragon p',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "A samurai's rising sword slashes, also in the air.",
            cost: 0,
          },
          {
            name: 'FIRE',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "The clown-faced boy's thrown card.",
            cost: 0,
          },
          {
            name: 'bannaku',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A headbanded knife fighter's dashing slash, which a super cancels for two stocks.",
            cost: 0,
          },
          {
            name: 'counter',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A stance with a phone: struck in it, a machine-gun man fires back.',
            cost: 0,
          },
          {
            name: 'striker',
            input: '<kbd>5</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A gunwoman behind him whose shot holds whoever it meets still.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'FISH',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: "A suited man's red book whose fish spirit seizes the opponent up close.",
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'For three stocks: a shirtless, tattooed man who calls a dark giant.',
            cost: 3,
          },
          {
            name: 'fly arm',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "The clown-faced boy's flying fists up close.",
            cost: 1,
          },
          {
            name: 'S Shoot',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A blue-coated boy's palm blast.",
            cost: 1,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  erus: {
    art: '/assets/erus/360.png',
    nameplate: '/assets/erus/366.png',
    role: 'Blond figure in a black coat',
    tag: 'Dresses up as a different character for most moves; her Coin lands seven times before every other press fails, and EX mode takes a full stock.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A chain swing, a blue-robed figure's chain whip, a suited man's knife thrust.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a spiky-haired boy's sliding kick, the suited man's briefcase swing.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A green-clad boy's slab strike or a cap-wearing figure's sword slash.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A girl in a red dress's rising punch.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "The blue-robed figure's chains.",
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
            name: 'INATUMA',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "The spiky-haired boy's electric strike.",
            cost: 0,
          },
          {
            name: 'VO5',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "The green-clad boy's punch; in the air he hurls a boulder; in EX mode she calls two headbanded boys who drop in and charge.",
            cost: 0,
          },
          {
            name: 'Coin',
            input: '<kbd>F</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: "The suited man's flicked coin, seven in all before every other press fails; in EX mode she calls a white-haired scythe fighter from a portal.",
            cost: 0,
          },
          {
            name: 'COUNTER',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: "The girl's stance: struck in it, she hits back; in EX mode a book that also answers specials.",
            cost: 0,
          },
          {
            name: 'TELP',
            input:
              '<span class="motion">↓←</span><kbd>G</kbd>, <kbd>H</kbd> or both',
            desc: "The spiky-haired boy's blur step.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'コマンド 3',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓←</span><kbd>H</kbd>',
            desc: 'Below 30% health only: a card that heals her or drops planks on the opponent.',
            cost: 3,
          },
          {
            name: 'lizard fly',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: "The spiky-haired boy's flying grab, which catches only an opponent in the air.",
            cost: 1,
          },
          {
            name: 'SCC',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'His rush up close.',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "For three stocks: a headbanded boy's punch rush.",
            cost: 3,
          },
          {
            name: 'Super slash',
            input:
              '<kbd>5</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "The cap-wearing figure's scythe slash.",
            cost: 1,
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
            desc: 'A stock each way; most of her moves take other forms.',
            cost: 1,
          },
        ],
      },
    ],
  },
  feng: {
    art: '/assets/feng/384.png',
    nameplate: '/assets/feng/449.png',
    role: 'Blue-haired boy in glasses',
    tag: "Dresses up as a different character for most moves; ↑ during a forward dash is a High Jump, and below 30% health his crouching punch, iori's sword and bp take their Evil forms.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a white-shirted fighter's crescent slash, a white-coated man's pistol shot.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a green-capped figure's high kick, a red-bandannaed fighter's kicks.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A headbanded figure's double stab (below 30% health, its <b>Evil</b> form) or a white-clad figure's slide with a black hound.",
            cost: 0,
          },
          {
            name: 'High Jump',
            input: '<span class="motion">↑</span> in a forward dash',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A blond girl in a white kimono's rising punch.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A shirtless man in sunglasses who turns the opponent into a strawberry shortcake.',
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
            name: 'dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: "A black-pompadoured man's punch.",
            cost: 0,
          },
          {
            name: 'Fire',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "A winged girl's arrow; in the air an orange-headbanded boy throws a yellow spirit.",
            cost: 0,
          },
          {
            name: 'iori',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A black-clad fighter\'s spear thrust, which <span class="motion">↓←</span><kbd>G</kbd> again takes on to a hooked blade and a sword (below 30% health, the sword\'s <b>Evil</b> form); a super cancels it for two stocks.',
            cost: 0,
          },
          {
            name: 'bp',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: "The sunglassed man's clawed lunge; below 30% health its <b>Evil</b> form.",
            cost: 0,
          },
          {
            name: 'SUCK',
            input:
              '<kbd>4</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: "A white-robed archer's line that reels the opponent in.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'EN300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'For three stocks: an orange-haired swordsman in red armour.',
            cost: 3,
          },
          {
            name: 'ICE punch',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓→</span><kbd>H</kbd>',
            desc: "A black-robed fighter's dashing punch that looses an ice wolf.",
            cost: 1,
          },
          {
            name: 'sshoot',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A blond-pigtailed girl's cannon.",
            cost: 1,
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
            desc: 'Half a stock each way; dragon, ICE punch, sshoot and the chuck take other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  sean: {
    art: '/assets/sean/140.png',
    nameplate: '/assets/sean/247.png',
    role: 'Bald old monk in green robes',
    tag: 'Calls up a different character for most moves; ↑ during a forward dash is a High Jump, and below 30% health S Shoot takes its Evil form.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a blue-haired girl's triple strike, a red-haired fighter's dive.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a white-armoured figure's exploding seal, a dark-clad swordsman's vortex dash.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A cloaked figure's sweep or a horned figure's low kick.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "A spiky-haired swordsman's dive or a kick from a figure in a white hood.",
            cost: 0,
          },
          {
            name: 'High Jump',
            input: '<span class="motion">↑</span> in a forward dash',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A chubby pigtailed figure's long tongue.",
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "A small red-robed man's crescent; a super cancels it for two stocks.",
            cost: 0,
          },
          {
            name: 'whip attack',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'An eye-patched man\'s five whips — <kbd>F</kbd> or <span class="motion">↓→</span><kbd>H</kbd> lashes farther off.',
            cost: 0,
          },
          {
            name: 'CC',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: "An elf-eared hooded figure's red card, a grab that also works in the air.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'EN300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'For three stocks: a rider on a yellow beast who calls down lightning.',
            cost: 3,
          },
          {
            name: 'SCC',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'An old man in yellow robes whose grab reaches across the screen.',
            cost: 1,
          },
          {
            name: 'S Shoot',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "The swordsman's crescent wave; below 30% health its <b>Evil</b> form.",
            cost: 1,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  gon: {
    art: '/assets/gon/488.png',
    nameplate: '',
    role: 'Brown-haired boy with goggles',
    tag: "Puts on a different creature's costume for most moves; ↑ during a forward dash is a High Jump, and only below 30% health does his Hidden en300 call a white-caped knight with him.",
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a yellow armoured beast's claw charge, a green robot's low grab.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a yellow fox's spinning tail (below 30% health its <b>Evil</b> form), a blue dinosaur's dashing punch.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A blue wolf's spinning uppercut or a blue-hooded dragon's low kick.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "The blue dinosaur's diving claw or a green insect's kick.",
            cost: 0,
          },
          {
            name: 'High Jump',
            input: '<span class="motion">↑</span> in a forward dash',
            desc: '—',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A dark winged demon's claws.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A blue metal dinosaur's jaws.",
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
            name: 'DRAGON',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A lion-maned figure\'s rising sword, which <span class="motion">→↓↘</span><kbd>G</kbd> again takes on to <b>Evil Dragon</b>.',
            cost: 0,
          },
          {
            name: 'fire ball',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "An orange armoured dragon's dark crescent; in the air a winged gunner's lightning ball.",
            cost: 0,
          },
          {
            name: 'DRILL',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "The yellow beast's spinning dive, also in the air; Super heart or KURENCOUNTER cancels it for two stocks.",
            cost: 0,
          },
          {
            name: 'COUNTER',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: 'A 0.4-second stance: struck in it, he takes double damage, then strikes back in three costumes.',
            cost: 0,
          },
          {
            name: 'dash move',
            input: '<span class="motion">↓→</span><kbd>H</kbd>',
            desc: "The yellow beast's charge.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'EN300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "For three stocks: a golden armoured beast's exploding sun.",
            cost: 3,
          },
          {
            name: 'KURENCOUNTER',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "A caped lancer's stance that counters a hit.",
            cost: 1,
          },
          {
            name: 'Super heart',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A yellow teddy bear's breaking heart.",
            cost: 1,
          },
          {
            name: 'Hidden en300',
            input:
              '<kbd>4</kbd> or <kbd>K</kbd><span class="motion">↓↓</span><kbd>G</kbd><kbd>O</kbd>',
            desc: 'Only below 30% health: an orange-haired girl who calls a white-caped knight with him.',
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
            desc: 'Half a stock each way; his P2, P3, K1, crouching and air punches, Hit Up, specials and supers take other forms.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  kate: {
    art: '/assets/kate/170.png',
    nameplate: '/assets/kate/276.png',
    role: 'Blue-haired girl in a pink top',
    tag: 'Puts on a different costume for most moves; her Air fire leaves a blue star hovering that the ground follow-up drops, and below 30% health SLASH SUPER takes its Evil form.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a blue-robed priest's staff thrust, a purple-eared swordswoman's crescent cut.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a green-masked swordsman's slash, a white-winged knight's low lance thrust that pins the opponent.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A pink-helmeted girl's spitting pet or a green-robed lancer's low thrust.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "A broadsword's downward cut or a red-clad fighter's kick.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A white-robed figure's trident, which ↑ chases into the air after a hit.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A white-suited figure's red crosshairs.",
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
            name: 'neko punch',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "A cat girl's rising paw.",
            cost: 0,
          },
          {
            name: 'Air fire',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'In the air, a turquoise mage leaves a blue star hovering for 6 seconds; on the ground her af add strikes and drops it onto whoever is below (<span class="motion">↓→</span><kbd>H</kbd> sends it down at a slant); BEAM or SLASH SUPER cancels af add for two stocks.',
            cost: 0,
          },
          {
            name: 'DASH ATTACK',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A ninja's dagger dash through the opponent, who is struck five more times behind her; in the air a diving kick.",
            cost: 0,
          },
          {
            name: 'Counter',
            input:
              '<kbd>J</kbd> or <span class="motion">→↓←</span><kbd>H</kbd>',
            desc: "A 0.3-second stance with a winged girl's axe: struck in it, she takes 30% of the damage and swings it.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'en300',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "For three stocks: a goggled sorcerer's yellow spirits.",
            cost: 3,
          },
          {
            name: 'SLASH SUPER',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "An archer's arrow that brings her lunging in with a halberd when it strikes; below 30% health its <b>Evil</b> form.",
            cost: 1,
          },
          {
            name: 'BEAM',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A red-clad fighter's long beam.",
            cost: 1,
          },
          {
            name: 'Counter ATT',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  remu: {
    art: '/assets/remu/293.png',
    nameplate: '/assets/remu/428.png',
    role: 'Blond fighter in a teal jacket',
    tag: 'Puts on a different costume for most moves; his MINAMI works only at 155 health or less, and GOLD HAND for three stocks lands well ahead of him.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a blue-helmeted hero's lunging punch in red and white armour, his leaping grab, which beats the opponent.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, the hero's two kicks, his flying kick.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "A blue-armoured swordsman's low cut or the hero's sliding kick.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "The swordsman's cut or the hero's kick.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "The hero's uppercut, which ↑ chases into the air after a hit.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A white and red horned robot's punches.",
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
            name: 'tatsumaki',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "The swordsman's swing that calls a grey whirlwind; Thander p, Phsy driver or MINAMI cancels it for two stocks.",
            cost: 0,
          },
          {
            name: 'slash',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "The swordsman's dashing cut; in the air a diving one, which slash again on landing after a hit follows with a quicker cut.",
            cost: 0,
          },
          {
            name: 'JET',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "The hero's call for a jet-backed robot's charging blade.",
            cost: 0,
          },
          {
            name: 'Drill',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'His call for a drill that bursts from the ground.',
            cost: 0,
          },
          {
            name: 'BAKURETU',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "The swordsman's thrust that fires a yellow beam.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'GOLD HAND',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>H</kbd>',
            desc: "For three stocks: the robot's climb and dive with a golden hand, which lands well ahead of him, into a long beating.",
            cost: 3,
          },
          {
            name: 'MINAMI',
            input:
              '<kbd>2</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'Only at 155 health or less (else it is Drill): a 1-second stance as the hero — struck in it, he takes 30% of the damage and strikes back.',
            cost: 1,
          },
          {
            name: 'Phsy driver',
            input:
              '<kbd>4</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "The robot's leaping kick into a piledriver.",
            cost: 1,
          },
          {
            name: 'Thander p',
            input:
              '<kbd>5</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "The robot's lightning-charged dashing punch.",
            cost: 1,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  rear: {
    art: '/assets/rear/385.png',
    nameplate: '/assets/rear/387.png',
    role: 'Masked blond fighter in a grey gi',
    tag: 'Puts on a different costume for most moves; his GYSA super raises a pink crystal (three, below 30% health), and evil en3 needs below 30% health and all three stocks.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A jab, a horned red robot's drill-armed thrust, its spinning strikes.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a purple and blue robot's low kicks, its kick that sends a green whirlwind along the floor.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "The red robot's thrust or the purple robot's beast-headed punch.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "A green-chested robot's punch or the purple robot's kick.",
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A blue horse's horn, which ↑ chases into the air after a hit.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A purple serpent's grab.",
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
            name: 'SAMA',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: "The purple robot's rising shield punch, also in the air.",
            cost: 0,
          },
          {
            name: 'Fire ball',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "The red robot's fireball; cancels into GYSA or VIPER FINAL for two stocks.",
            cost: 0,
          },
          {
            name: 'DOWN ATTACK',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: "A long leap that strikes as he lands, over a near opponent's head.",
            cost: 0,
          },
          {
            name: 'VIPER WHIP',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "The red robot's whip.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'GYSA',
            input:
              '<kbd>1</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: "The red robot's hammer that raises a pink crystal ahead of him; below 30% health its <b>Evil</b> form, three crystals.",
            cost: 1,
          },
          {
            name: 'VIPER FINAL',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A long whip that catches the opponent for a purple blast.',
            cost: 1,
          },
          {
            name: 'en300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "For three stocks: a giant sword's slashes, which miss an opponent standing close.",
            cost: 3,
          },
          {
            name: 'evil en3',
            input:
              '<kbd>4</kbd> or <kbd>K</kbd><kbd>H</kbd><span class="motion">→</span><kbd>G</kbd><kbd>O</kbd>',
            desc: 'Only below 30% health, with three stocks: spends one on a green clock shot; when it strikes he spends the other two, takes a winged form and fires seven beams.',
            cost: 3,
          },
          {
            name: 'Counter ATT',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  gigi: {
    art: '/assets/gigi/288.png',
    nameplate: '/assets/gigi/328.png',
    role: 'Big-headed grunt in a black mask',
    tag: 'An FK crest and a skeleton-striped suit; his Change form for half a stock swaps his specials and two supers, and DIVE sinks him into the floor.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: 'A jab, a lunging punch, a dash past the opponent that grabs them from behind and flips them over.',
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: 'A kick, a high kick, a hopping kick.',
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A leaping punch or a low drop kick.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A rolling headbutt, which ↑ chases into the air after a hit.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab that leaps up with the opponent and slams them down.',
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "A rising spin, also in the air; in Change form, Jump att, a leap that grabs the opponent's head.",
            cost: 0,
          },
          {
            name: "K'",
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A rifle butt that <span class="motion">→</span><kbd>G</kbd> follows with a shot or <span class="motion">→</span><kbd>H</kbd> with a swing; in Change form, Chuck ECC, a tumbling toy robot that bursts.',
            cost: 0,
          },
          {
            name: 'DIVE',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'Sinking into the floor, where ← and → move him and <kbd>G</kbd> or <kbd>H</kbd> comes up striking; in Change form, GIGI P, a rushing punch that <span class="motion">↓←</span><kbd>G</kbd> or <kbd>H</kbd> chains on. GIGI P cancels into Bean or Counter for two stocks.',
            cost: 0,
          },
          {
            name: 'Bike Doge D',
            input:
              '<kbd>J</kbd>, <kbd>4</kbd> or <kbd>5</kbd>, or <span class="motion">↓↓</span><kbd>G</kbd>, <kbd>H</kbd> or both',
            desc: 'A charge or a leap on an orange motorbike, also in the air; in Change form, Doge D, sinking into the floor to come up ahead or where he stands. Bike Doge D P cancels into Ranbu or S chuck for two stocks.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'Ranbu',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: "A punch flurry whose last blow ↑ or ↓ turns into a rising or a low strike; in Change form, Bean, a ray gun's beam across the screen, which misses an opponent standing close.",
            cost: 1,
          },
          {
            name: 'S chuck',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓←</span><kbd>H</kbd>',
            desc: 'A grab and a beating; in Change form, Counter, a stance — struck in it, he kicks back.',
            cost: 1,
          },
          {
            name: 'EN3',
            input:
              '<kbd>3</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'For three stocks: a stampede of GIGIs led by a blonde masked woman.',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding; after a heavy standing block, <kbd>G</kbd> and <kbd>H</kbd> together.',
            cost: 1,
          },
          {
            name: 'Change form',
            input: '<kbd>E</kbd> or <span class="motion">↓↓</span><kbd>K</kbd>',
            desc: 'Half a stock each way; swaps his specials and two supers.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  sww: {
    art: '/assets/sww/3001.png',
    nameplate: '/assets/sww/399.png',
    role: 'Red-haired boy in a red shirt',
    tag: 'Changes into a different suit of armour for each move, and into gold armour at 30% life or less; there ROLL CRASH for two stocks knocks out both fighters, and Healing restores 160 life.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: 'A jab, a lunging punch, a dash through the opponent that leaves a flurry of blows behind them.',
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: 'A kick, a high kick, a long chain lash.',
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A flaming punch or a sliding sweep.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A rising punch, which ↑ chases into the air after a hit.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab and a throw.',
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
            name: 'Dragon P',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A rising uppercut (EX: a flying knee).',
            cost: 0,
          },
          {
            name: 'ICE Punch',
            input: '<kbd>I</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A punch with an ice spark (EX: a dash through the opponent).',
            cost: 0,
          },
          {
            name: 'Chain att',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A chain lash across the screen, which again within a moment of a hit lashes once more (EX: EX Chain, a spinning chain — struck in it, he lashes back).',
            cost: 0,
          },
          {
            name: 'Ryuseiken',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A punch flurry that <span class="motion">↓→</span><kbd>G</kbd> follows with a dashing one; in the air a flaming bird (EX: fists of light flying across the screen). Cancels into SUPER RSK, GOD DRAGON or COUNTER CHAIN for two stocks.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'SUPER RSK',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A flurry under a winged horse (EX: Gysa, an ice blast that flies past an opponent standing close).',
            cost: 1,
          },
          {
            name: 'GOD DRAGON',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'Charging uppercuts (EX: a rising dragon).',
            cost: 1,
          },
          {
            name: 'COUNTER CHAIN',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'A stance: struck in it, he lashes back (EX: a dashing chain lash).',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>4</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'For three stocks: a winged charge across the whole screen.',
            cost: 3,
          },
          {
            name: 'Healing',
            input:
              '<kbd>5</kbd> or <span class="motion">↓←↓←</span><kbd>H</kbd>',
            desc: 'At 30% life or less: restores 160 life.',
            cost: 3,
          },
          {
            name: 'ROLL CRASH',
            input:
              '<kbd>G</kbd><kbd>G</kbd><span class="motion">→</span><kbd>H</kbd><kbd>G</kbd>',
            desc: 'Also at 30% life or less: a grab that leaps and crashes down, knocking out both fighters.',
            cost: 2,
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
            desc: 'Half a stock each way; swaps his specials and three supers.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  ogi: {
    art: '/assets/ogi/483.png',
    nameplate: '/assets/ogi/108.png',
    role: 'White-haired, green-armed strongman',
    tag: 'Suits up in a different robot armour, or a caped red coat, for most moves; his Rose attack lands far off, taking 35 power, and at 30% life or less his third kick is a longer beating.',
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: 'Three punches, a thrown hook, a dash with a chain whip.',
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: 'A kick, a dashing slash, a grab into a beating (at 30% life or less a longer one).',
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A long shield thrust or a burst of blasts.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A rapier lunge, which ↑ chases into the air after a hit.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab and a throw.',
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
            name: 'Dragon',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A rising claw.',
            cost: 0,
          },
          {
            name: 'Crush attack',
            input: '<kbd>I</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'A shield-bash dash; in the air a dive.',
            cost: 0,
          },
          {
            name: 'Rose attack',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A rose tossed in a high arc that lands far off, taking 35 power.',
            cost: 0,
          },
          {
            name: 'fire p',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A straight cannon shot; cancels into s shoot, SCC or S Crush for two stocks.',
            cost: 0,
          },
          {
            name: 'FIRE K',
            input: '<kbd>5</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A cannon shell that bounces along.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 's shoot',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A giant cannon blast, also in the air.',
            cost: 1,
          },
          {
            name: 'SCC',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'Close: a grab and a beam-saber stab, which <span class="motion">↓→</span><kbd>H</kbd> follows with an uppercut and <span class="motion">→↓←</span><kbd>H</kbd> with a throw; farther: a leap into a beating.',
            cost: 1,
          },
          {
            name: 'S Crush',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: 'A shield-bash dash and four more.',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>4</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'For three stocks: a blast thrown in a high arc that flies over a close opponent but drops short near a wall.',
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  ziro: {
    art: '/assets/ziro/420.png',
    nameplate: '/assets/ziro/478.png',
    role: 'Teal-haired young man',
    tag: 'Calls up a different robot suit, winged, caped, horned or heavily armed, for most moves; his Fire Ball throws two at 30% life or less, and below 30% life TWIN SHOT sweeps twin beams round the whole screen.',
    ex: true,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Punch chain',
            input:
              '<kbd>G</kbd><span class="sep">→</span><kbd>G</kbd><span class="sep">→</span><kbd>G</kbd>',
            desc: "A punch, a caped robot's scythe swing, a dragon-armed robot's trident flurry.",
            cost: 0,
          },
          {
            name: 'Kick chain',
            input:
              '<kbd>H</kbd><span class="sep">→</span><kbd>H</kbd><span class="sep">→</span><kbd>H</kbd>',
            desc: "A kick, a gunner robot's spinning volley, a horned robot's whip.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A gatling volley or a low whip.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "A girl's rising kick, which ↑ chases into the air after a hit.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'A grab and a throw.',
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
            name: 'Fire Ball',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>H</kbd>',
            desc: "A shell that speeds up as it flies, two at 30% life or less (EX: a winged robot's rising slash).",
            cost: 0,
          },
          {
            name: 'nataku p',
            input:
              '<kbd>I</kbd> or <span class="motion">←↓↙</span><kbd>G</kbd>',
            desc: 'A dragon arm thrust up and out, or <span class="motion">←↓↙</span><kbd>H</kbd> straight out (EX: a cloaked robot\'s charge); cancels into MISS ALL or RAMBU for two stocks.',
            cost: 0,
          },
          {
            name: 'telepot',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'Vanishing under a dark cloak to come out at the opponent, or with <span class="motion">↓←</span><kbd>G</kbd> into the air.',
            cost: 0,
          },
          {
            name: 'IORI3HIT',
            input: '<kbd>J</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A winged robot\'s dashing slash that <span class="motion">↓→</span><kbd>G</kbd> follows twice more; in the air a shot down at the floor (EX: a fire ball; in the air a spin).',
            cost: 0,
          },
          {
            name: 'CC',
            input:
              '<kbd>5</kbd> or <span class="motion">←↓→</span><kbd>H</kbd>',
            desc: 'A grab into blows and a leaping slam (EX: a trident flurry).',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'MISS ALL',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: "A gunner robot's barrage of bullets and missiles (EX: a winged robot's beam).",
            cost: 1,
          },
          {
            name: 'RAMBU',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: 'A dash into a rush of blows from each robot (EX: a grab into one).',
            cost: 1,
          },
          {
            name: 'EN300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓→</span><kbd>G</kbd>',
            desc: 'For three stocks: a winged robot rising to rain beams down, also in the air (EX: a diving slash).',
            cost: 3,
          },
          {
            name: 'TWIN SHOT',
            input: '<kbd>4</kbd> or a full turn of the stick and <kbd>G</kbd>',
            desc: 'Below 30% life only: twin beams swept round the whole screen (otherwise the CC).',
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
            desc: 'Half a stock each way; swaps his specials and supers.',
            cost: 0.5,
          },
        ],
      },
    ],
  },
  masa: {
    art: '/assets/masa/267.png',
    nameplate: '/assets/masa/139.png',
    role: 'Blond pilot in red armour',
    tag: "Swings a purple axe and swells into a bigger robot for his heaviest blows; his SCC super is a grab into the big robot's blows and a throw into the wall.",
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Axe swing',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'Swings the axe; <kbd>G</kbd> or <kbd>H</kbd> again at once swings twice, then <kbd>G</kbd> a third time or <kbd>H</kbd> into a leaping chop.',
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: 'A grenade that bounces along the floor or a low axe sweep.',
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: 'An axe swing or a gun shot.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: 'A rising axe slash, which ↑ chases into the air after a hit.',
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: "A grab into the big robot's blows.",
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
            name: 'SHORYU',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A rising uppercut that <span class="motion">→↓↘</span><kbd>G</kbd> follows twice more, also in the air.',
            cost: 0,
          },
          {
            name: '3Fire',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A kick that fires a missile, a second and third with → and <kbd>H</kbd>.',
            cost: 0,
          },
          {
            name: '3HIT',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: 'An axe rush that <span class="motion">↓←</span><kbd>G</kbd> follows twice more; cancels into SCC or RAMBU SUP for two stocks.',
            cost: 0,
          },
          {
            name: 'BANDO BOX',
            input: '<kbd>J</kbd> or <span class="motion">↓←</span><kbd>H</kbd>',
            desc: 'A bazooka\'s canister that arcs out and bursts, which <span class="motion">↓←</span><kbd>H</kbd> fires twice more.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'RAMBU SUP',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: "A dash into a rush of blows from the other fighters' shadows.",
            cost: 1,
          },
          {
            name: 'SCC',
            input:
              '<kbd>2</kbd> or <span class="motion">←↓→←↓→</span><kbd>H</kbd>',
            desc: "A grab into the big robot's blows and a throw into the wall.",
            cost: 1,
          },
          {
            name: 'MESATSU',
            input:
              '<kbd>3</kbd> or <kbd>G</kbd><kbd>G</kbd><span class="motion">→</span><kbd>H</kbd><kbd>G</kbd>',
            desc: 'For three stocks: a dash that grabs into a flurry of flashing blows.',
            cost: 3,
          },
          {
            name: 'Counter Attack',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
  },
  times: {
    art: '/assets/times/3001.png',
    nameplate: '/assets/times/139.png',
    role: 'Blond pilot with two shadows',
    tag: "A blond pilot in red armour like MASA's, swinging a purple axe; he dashes with two shadows of himself and has no Hit Up, chuck, double jump, air dash or Counter Attack.",
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Dashing axe swing',
            input: '<kbd>G</kbd>',
            desc: 'Strikes three times; cancels into <kbd>O</kbd> or a special.',
            cost: 0,
          },
          {
            name: 'Grenade',
            input: '<kbd>H</kbd>',
            desc: 'Lobbed to hop along the floor.',
            cost: 0,
          },
          {
            name: 'Heavy axe swing',
            input: '<kbd>O</kbd>',
            desc: 'Shakes the screen, standing or crouching; cancels into a special.',
            cost: 0,
          },
          {
            name: 'Air attack',
            input:
              '<kbd>G</kbd><span class="sep">/</span><kbd>O</kbd> or <kbd>H</kbd> in air',
            desc: '<kbd>G</kbd> or <kbd>O</kbd> swings the axe; <kbd>H</kbd> fires two shots angled down.',
            cost: 0,
          },
          {
            name: 'Run',
            input: '<kbd>⇧</kbd> or <span class="motion">→→</span>',
            desc: 'A run that goes on while → is held; ↑ leaps into a high jump. No Hit Up, chuck, double jump or air dash.',
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
            name: 'SHORYU',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: 'A crescent slash that rises forward.',
            cost: 0,
          },
          {
            name: 'FIRE',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>H</kbd>',
            desc: 'A pink crescent that flies across the screen.',
            cost: 0,
          },
          {
            name: 'DASH P',
            input: '<kbd>F</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: 'A dashing swing with two shadows of himself; cancels into a super.',
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'Rambu',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓←</span><kbd>G</kbd>',
            desc: "His armour bursting off for a dash into a rush of the other fighters' shadows.",
            cost: 1,
          },
          {
            name: 'SB',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'Fifteen grenades lobbed in a spread.',
            cost: 1,
          },
          {
            name: 'MESATSU',
            input:
              '<kbd>3</kbd> or <kbd>G</kbd><kbd>G</kbd><span class="motion">→</span><kbd>H</kbd><kbd>G</kbd>',
            desc: 'For three stocks: a cut-in, then a dash that grabs into a flurry.',
            cost: 3,
          },
        ],
      },
    ],
  },
  zenka: {
    art: '/assets/zenka/152.png',
    nameplate: '/assets/zenka/333.png',
    role: 'Silver-haired woman in a red coat',
    tag: "Fights with a knife and calls in robots — a blue drill robot, a red robot and her own purple armour; her En300 grab strips the opponent's clothes for 260 life.",
    ex: false,
    sections: [
      {
        title: 'Movement & basics',
        note: '',
        cost: false,
        rows: [
          {
            name: 'Knife slash',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "<kbd>G</kbd> a dashing knife slash, <kbd>H</kbd> a stepping one; after a hit, <kbd>G</kbd> brings the blue robot's sword thrust and <kbd>H</kbd> the red robot's drill flurry, then <kbd>G</kbd> the blue robot's overhead swing or <kbd>H</kbd> the red robot's sword swing.",
            cost: 0,
          },
          {
            name: 'Crouch',
            input:
              '<span class="motion">↓</span><kbd>G</kbd><span class="sep">/</span><kbd>H</kbd>',
            desc: "The blue robot's low thrust with <kbd>G</kbd>, the red robot's drill that rolls along the floor with <kbd>H</kbd>.",
            cost: 0,
          },
          {
            name: 'Air attack',
            input: '<kbd>G</kbd><span class="sep">/</span><kbd>H</kbd> in air',
            desc: "A robot's swing.",
            cost: 0,
          },
          {
            name: 'Double jump / air dash',
            input: '<kbd>W</kbd>, <span class="motion">→→</span> in air',
            desc: 'She double jumps and air dashes.',
            cost: 0,
          },
          {
            name: 'Hit Up',
            input: '<kbd>K</kbd>',
            desc: "The red robot's rising slash, which ↑ chases into the air after a hit.",
            cost: 0,
          },
          {
            name: 'Chuck',
            input: '<kbd>O</kbd> close',
            desc: 'The blue robot\'s sword skewering the opponent, which <span class="motion">↓↘→</span><kbd>H</kbd> follows with the red robot\'s leaping spin.',
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
            name: 'Dragon P',
            input:
              '<kbd>U</kbd> or <span class="motion">→↓↘</span><kbd>G</kbd>',
            desc: "The red robot's rising slash, also in the air.",
            cost: 0,
          },
          {
            name: 'FIRE BALL',
            input: '<kbd>I</kbd> or <span class="motion">↓→</span><kbd>G</kbd>',
            desc: "Her purple armour's slash across the screen; cancels into Ranbu or DAISHARIN for two stocks.",
            cost: 0,
          },
          {
            name: 'the new move',
            input: '<kbd>F</kbd> or <span class="motion">↓←</span><kbd>G</kbd>',
            desc: "A charge into a giant sword's thrust.",
            cost: 0,
          },
        ],
      },
      {
        title: 'Supers & system',
        note: 'Power gauge: hits, blocking and taking damage fill it — each full gauge becomes one stock, up to three for most fighters.',
        cost: true,
        rows: [
          {
            name: 'Ranbu',
            input:
              '<kbd>1</kbd> or <span class="motion">↓→↓→</span><kbd>H</kbd>',
            desc: 'A grab into blows from both robots and her own last slash.',
            cost: 1,
          },
          {
            name: 'DAISHARIN',
            input:
              '<kbd>2</kbd> or <span class="motion">↓→↓→</span><kbd>G</kbd>',
            desc: 'A giant sword hurled to spin out and back.',
            cost: 1,
          },
          {
            name: 'En300',
            input:
              '<kbd>3</kbd> or <span class="motion">↓←↓←</span><kbd>G</kbd>',
            desc: "For three stocks: warnings, then a leap that drops with a giant sword, whose grab strips the opponent's clothes for 260 life before flinging them.",
            cost: 3,
          },
          {
            name: 'Counter Hit',
            input: '<kbd>K</kbd> while blocking',
            desc: 'Spend a stock while guarding.',
            cost: 1,
          },
        ],
      },
    ],
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
