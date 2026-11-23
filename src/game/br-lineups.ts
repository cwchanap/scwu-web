import type { Who } from './characters';

// HPA-1035 §7 — the owner-approved B.R. lineups (16 Nov 2026), converted
// mechanically from the ticket table (one static table; no runtime solver).
// Each pair is [leader, second] in entering order. stage3 lists the four
// bosses in entering order (the last sets the arena). long is B.R. LONG's
// twelve enemies as six ordered pairs; its 38 rows are the 34 mode-select
// fighters plus the four bosses (a boss row is drawn from all 16 pairs
// since a boss has no pair; their B.R. ANOTHER draws stay seeded per
// HPA-858).
export type LineupPair = readonly [Who, Who];

// ANOTHER's seeded stage lineups, one row per eligible fighter.
export interface BrAnotherLineup {
  stage1: readonly [LineupPair, LineupPair, LineupPair];
  stage2: readonly [LineupPair, LineupPair, LineupPair];
  stage3: readonly [Who, Who, Who, Who];
}

export const BR_ANOTHER_LINEUPS: Partial<Record<Who, BrAnotherLineup>> = {
  ryuko: {
    stage1: [
      ['suneo', 'giant'],
      ['lizard', 'kay'],
      ['erus', 'hiso'],
    ],
    stage2: [
      ['ogi', 'ziro'],
      ['gigi', 'sww'],
      ['yinan', 'aya'],
    ],
    stage3: ['shinz', 'alpha', 'dora', 'zenka'],
  },
  zoma: {
    stage1: [
      ['kate', 'gon'],
      ['sakuya', 'dido'],
      ['sean', 'feng'],
    ],
    stage2: [
      ['times', 'masa'],
      ['yinan', 'aya'],
      ['ogi', 'ziro'],
    ],
    stage3: ['alpha', 'dora', 'shinz', 'zenka'],
  },
  kiki: {
    stage1: [
      ['anmc', 'amiro'],
      ['erus', 'hiso'],
      ['sou', 'alex'],
    ],
    stage2: [
      ['times', 'masa'],
      ['gigi', 'sww'],
      ['aya', 'yinan'],
    ],
    stage3: ['shinz', 'zenka', 'alpha', 'dora'],
  },
  chung: {
    stage1: [
      ['feng', 'sean'],
      ['lizard', 'kay'],
      ['amiro', 'anmc'],
    ],
    stage2: [
      ['ziro', 'ogi'],
      ['sww', 'gigi'],
      ['masa', 'times'],
    ],
    stage3: ['dora', 'alpha', 'shinz', 'zenka'],
  },
  amiro: {
    stage1: [
      ['kay', 'lizard'],
      ['sakuya', 'dido'],
      ['gon', 'kate'],
    ],
    stage2: [
      ['yinan', 'aya'],
      ['times', 'masa'],
      ['ogi', 'ziro'],
    ],
    stage3: ['alpha', 'zenka', 'dora', 'shinz'],
  },
  anmc: {
    stage1: [
      ['kiki', 'chung'],
      ['hiso', 'erus'],
      ['lizard', 'kay'],
    ],
    stage2: [
      ['gigi', 'sww'],
      ['yinan', 'aya'],
      ['masa', 'times'],
    ],
    stage3: ['zenka', 'shinz', 'dora', 'alpha'],
  },
  giant: {
    stage1: [
      ['feng', 'sean'],
      ['yo', 'sin'],
      ['remu', 'rear'],
    ],
    stage2: [
      ['aya', 'yinan'],
      ['masa', 'times'],
      ['gigi', 'sww'],
    ],
    stage3: ['alpha', 'shinz', 'zenka', 'dora'],
  },
  suneo: {
    stage1: [
      ['alex', 'sou'],
      ['kiki', 'chung'],
      ['feng', 'sean'],
    ],
    stage2: [
      ['sww', 'gigi'],
      ['times', 'masa'],
      ['yinan', 'aya'],
    ],
    stage3: ['zenka', 'shinz', 'dora', 'alpha'],
  },
  yo: {
    stage1: [
      ['zoma', 'ryuko'],
      ['chung', 'kiki'],
      ['sakuya', 'dido'],
    ],
    stage2: [
      ['gigi', 'sww'],
      ['ogi', 'ziro'],
      ['aya', 'yinan'],
    ],
    stage3: ['alpha', 'zenka', 'dora', 'shinz'],
  },
  sin: {
    stage1: [
      ['giant', 'suneo'],
      ['remu', 'rear'],
      ['chung', 'kiki'],
    ],
    stage2: [
      ['aya', 'yinan'],
      ['ogi', 'ziro'],
      ['sww', 'gigi'],
    ],
    stage3: ['dora', 'shinz', 'alpha', 'zenka'],
  },
  lizard: {
    stage1: [
      ['chung', 'kiki'],
      ['zoma', 'ryuko'],
      ['rear', 'remu'],
    ],
    stage2: [
      ['masa', 'times'],
      ['aya', 'yinan'],
      ['ziro', 'ogi'],
    ],
    stage3: ['alpha', 'dora', 'shinz', 'zenka'],
  },
  kay: {
    stage1: [
      ['sou', 'alex'],
      ['hiso', 'erus'],
      ['ryuko', 'zoma'],
    ],
    stage2: [
      ['gigi', 'sww'],
      ['yinan', 'aya'],
      ['ziro', 'ogi'],
    ],
    stage3: ['zenka', 'alpha', 'shinz', 'dora'],
  },
  dido: {
    stage1: [
      ['remu', 'rear'],
      ['amiro', 'anmc'],
      ['suneo', 'giant'],
    ],
    stage2: [
      ['gigi', 'sww'],
      ['times', 'masa'],
      ['ogi', 'ziro'],
    ],
    stage3: ['zenka', 'dora', 'alpha', 'shinz'],
  },
  sakuya: {
    stage1: [
      ['kiki', 'chung'],
      ['kay', 'lizard'],
      ['kate', 'gon'],
    ],
    stage2: [
      ['ziro', 'ogi'],
      ['aya', 'yinan'],
      ['sww', 'gigi'],
    ],
    stage3: ['shinz', 'zenka', 'dora', 'alpha'],
  },
  alex: {
    stage1: [
      ['sin', 'yo'],
      ['gon', 'kate'],
      ['rear', 'remu'],
    ],
    stage2: [
      ['times', 'masa'],
      ['ziro', 'ogi'],
      ['gigi', 'sww'],
    ],
    stage3: ['zenka', 'alpha', 'dora', 'shinz'],
  },
  sou: {
    stage1: [
      ['amiro', 'anmc'],
      ['giant', 'suneo'],
      ['kay', 'lizard'],
    ],
    stage2: [
      ['ogi', 'ziro'],
      ['aya', 'yinan'],
      ['times', 'masa'],
    ],
    stage3: ['dora', 'alpha', 'zenka', 'shinz'],
  },
  hiso: {
    stage1: [
      ['ryuko', 'zoma'],
      ['alex', 'sou'],
      ['kiki', 'chung'],
    ],
    stage2: [
      ['ziro', 'ogi'],
      ['sww', 'gigi'],
      ['aya', 'yinan'],
    ],
    stage3: ['shinz', 'dora', 'alpha', 'zenka'],
  },
  erus: {
    stage1: [
      ['sean', 'feng'],
      ['sou', 'alex'],
      ['dido', 'sakuya'],
    ],
    stage2: [
      ['aya', 'yinan'],
      ['ogi', 'ziro'],
      ['times', 'masa'],
    ],
    stage3: ['zenka', 'shinz', 'alpha', 'dora'],
  },
  feng: {
    stage1: [
      ['dido', 'sakuya'],
      ['giant', 'suneo'],
      ['zoma', 'ryuko'],
    ],
    stage2: [
      ['yinan', 'aya'],
      ['gigi', 'sww'],
      ['masa', 'times'],
    ],
    stage3: ['shinz', 'zenka', 'dora', 'alpha'],
  },
  sean: {
    stage1: [
      ['rear', 'remu'],
      ['zoma', 'ryuko'],
      ['amiro', 'anmc'],
    ],
    stage2: [
      ['aya', 'yinan'],
      ['masa', 'times'],
      ['ziro', 'ogi'],
    ],
    stage3: ['dora', 'zenka', 'alpha', 'shinz'],
  },
  gon: {
    stage1: [
      ['lizard', 'kay'],
      ['rear', 'remu'],
      ['sean', 'feng'],
    ],
    stage2: [
      ['masa', 'times'],
      ['ogi', 'ziro'],
      ['sww', 'gigi'],
    ],
    stage3: ['shinz', 'alpha', 'zenka', 'dora'],
  },
  kate: {
    stage1: [
      ['erus', 'hiso'],
      ['ryuko', 'zoma'],
      ['suneo', 'giant'],
    ],
    stage2: [
      ['ogi', 'ziro'],
      ['masa', 'times'],
      ['sww', 'gigi'],
    ],
    stage3: ['dora', 'zenka', 'shinz', 'alpha'],
  },
  remu: {
    stage1: [
      ['kate', 'gon'],
      ['chung', 'kiki'],
      ['giant', 'suneo'],
    ],
    stage2: [
      ['aya', 'yinan'],
      ['sww', 'gigi'],
      ['times', 'masa'],
    ],
    stage3: ['zenka', 'dora', 'shinz', 'alpha'],
  },
  rear: {
    stage1: [
      ['hiso', 'erus'],
      ['gon', 'kate'],
      ['sou', 'alex'],
    ],
    stage2: [
      ['ogi', 'ziro'],
      ['masa', 'times'],
      ['yinan', 'aya'],
    ],
    stage3: ['shinz', 'dora', 'zenka', 'alpha'],
  },
  gigi: {
    stage1: [
      ['yo', 'sin'],
      ['anmc', 'amiro'],
      ['gon', 'kate'],
    ],
    stage2: [
      ['masa', 'times'],
      ['ogi', 'ziro'],
      ['aya', 'yinan'],
    ],
    stage3: ['shinz', 'alpha', 'zenka', 'dora'],
  },
  sww: {
    stage1: [
      ['lizard', 'kay'],
      ['anmc', 'amiro'],
      ['alex', 'sou'],
    ],
    stage2: [
      ['ziro', 'ogi'],
      ['yinan', 'aya'],
      ['masa', 'times'],
    ],
    stage3: ['alpha', 'dora', 'zenka', 'shinz'],
  },
  ogi: {
    stage1: [
      ['giant', 'suneo'],
      ['feng', 'sean'],
      ['dido', 'sakuya'],
    ],
    stage2: [
      ['masa', 'times'],
      ['yinan', 'aya'],
      ['gigi', 'sww'],
    ],
    stage3: ['dora', 'shinz', 'zenka', 'alpha'],
  },
  ziro: {
    stage1: [
      ['alex', 'sou'],
      ['suneo', 'giant'],
      ['hiso', 'erus'],
    ],
    stage2: [
      ['sww', 'gigi'],
      ['aya', 'yinan'],
      ['times', 'masa'],
    ],
    stage3: ['shinz', 'dora', 'zenka', 'alpha'],
  },
  masa: {
    stage1: [
      ['yo', 'sin'],
      ['dido', 'sakuya'],
      ['kiki', 'chung'],
    ],
    stage2: [
      ['sww', 'gigi'],
      ['ziro', 'ogi'],
      ['yinan', 'aya'],
    ],
    stage3: ['dora', 'shinz', 'alpha', 'zenka'],
  },
  times: {
    stage1: [
      ['sakuya', 'dido'],
      ['kate', 'gon'],
      ['anmc', 'amiro'],
    ],
    stage2: [
      ['yinan', 'aya'],
      ['gigi', 'sww'],
      ['ogi', 'ziro'],
    ],
    stage3: ['alpha', 'shinz', 'dora', 'zenka'],
  },
  yinan: {
    stage1: [
      ['sakuya', 'dido'],
      ['sean', 'feng'],
      ['yo', 'sin'],
    ],
    stage2: [
      ['sww', 'gigi'],
      ['ziro', 'ogi'],
      ['times', 'masa'],
    ],
    stage3: ['alpha', 'zenka', 'shinz', 'dora'],
  },
  aya: {
    stage1: [
      ['gon', 'kate'],
      ['sin', 'yo'],
      ['kay', 'lizard'],
    ],
    stage2: [
      ['ziro', 'ogi'],
      ['times', 'masa'],
      ['gigi', 'sww'],
    ],
    stage3: ['dora', 'zenka', 'alpha', 'shinz'],
  },
  zmega: {
    stage1: [
      ['remu', 'rear'],
      ['sin', 'yo'],
      ['ryuko', 'zoma'],
    ],
    stage2: [
      ['times', 'masa'],
      ['sww', 'gigi'],
      ['ziro', 'ogi'],
    ],
    stage3: ['alpha', 'shinz', 'zenka', 'dora'],
  },
  rario: {
    stage1: [
      ['erus', 'hiso'],
      ['sean', 'feng'],
      ['sin', 'yo'],
    ],
    stage2: [
      ['yinan', 'aya'],
      ['ziro', 'ogi'],
      ['gigi', 'sww'],
    ],
    stage3: ['zenka', 'alpha', 'shinz', 'dora'],
  },
};

// B.R. LONG's twelve enemies in entering order, one row per player (the 34
// fighters and the four bosses).
export const BR_LONG_LINEUPS: Partial<Record<Who, readonly LineupPair[]>> = {
  ryuko: [
    ['sww', 'gigi'],
    ['feng', 'sean'],
    ['kay', 'lizard'],
    ['kate', 'gon'],
    ['times', 'masa'],
    ['dido', 'sakuya'],
  ],
  zoma: [
    ['giant', 'suneo'],
    ['sin', 'yo'],
    ['sakuya', 'dido'],
    ['ogi', 'ziro'],
    ['chung', 'kiki'],
    ['kay', 'lizard'],
  ],
  kiki: [
    ['rear', 'remu'],
    ['masa', 'times'],
    ['sou', 'alex'],
    ['amiro', 'anmc'],
    ['yo', 'sin'],
    ['hiso', 'erus'],
  ],
  chung: [
    ['ziro', 'ogi'],
    ['amiro', 'anmc'],
    ['dido', 'sakuya'],
    ['zoma', 'ryuko'],
    ['gon', 'kate'],
    ['suneo', 'giant'],
  ],
  amiro: [
    ['gigi', 'sww'],
    ['chung', 'kiki'],
    ['hiso', 'erus'],
    ['sakuya', 'dido'],
    ['ogi', 'ziro'],
    ['rear', 'remu'],
  ],
  anmc: [
    ['sin', 'yo'],
    ['kate', 'gon'],
    ['ryuko', 'zoma'],
    ['yinan', 'aya'],
    ['sean', 'feng'],
    ['kay', 'lizard'],
  ],
  giant: [
    ['dido', 'sakuya'],
    ['sww', 'gigi'],
    ['kiki', 'chung'],
    ['kay', 'lizard'],
    ['sin', 'yo'],
    ['erus', 'hiso'],
  ],
  suneo: [
    ['yinan', 'aya'],
    ['dido', 'sakuya'],
    ['gigi', 'sww'],
    ['alex', 'sou'],
    ['amiro', 'anmc'],
    ['sean', 'feng'],
  ],
  yo: [
    ['chung', 'kiki'],
    ['anmc', 'amiro'],
    ['sakuya', 'dido'],
    ['giant', 'suneo'],
    ['remu', 'rear'],
    ['yinan', 'aya'],
  ],
  sin: [
    ['suneo', 'giant'],
    ['sou', 'alex'],
    ['times', 'masa'],
    ['erus', 'hiso'],
    ['zoma', 'ryuko'],
    ['kate', 'gon'],
  ],
  lizard: [
    ['anmc', 'amiro'],
    ['ogi', 'ziro'],
    ['suneo', 'giant'],
    ['remu', 'rear'],
    ['aya', 'yinan'],
    ['yo', 'sin'],
  ],
  kay: [
    ['zoma', 'ryuko'],
    ['remu', 'rear'],
    ['yinan', 'aya'],
    ['masa', 'times'],
    ['gon', 'kate'],
    ['sin', 'yo'],
  ],
  dido: [
    ['feng', 'sean'],
    ['gigi', 'sww'],
    ['ziro', 'ogi'],
    ['yinan', 'aya'],
    ['hiso', 'erus'],
    ['sou', 'alex'],
  ],
  sakuya: [
    ['hiso', 'erus'],
    ['ryuko', 'zoma'],
    ['alex', 'sou'],
    ['anmc', 'amiro'],
    ['yinan', 'aya'],
    ['feng', 'sean'],
  ],
  alex: [
    ['aya', 'yinan'],
    ['zoma', 'ryuko'],
    ['anmc', 'amiro'],
    ['suneo', 'giant'],
    ['dido', 'sakuya'],
    ['ogi', 'ziro'],
  ],
  sou: [
    ['yo', 'sin'],
    ['hiso', 'erus'],
    ['chung', 'kiki'],
    ['gon', 'kate'],
    ['rear', 'remu'],
    ['ziro', 'ogi'],
  ],
  hiso: [
    ['masa', 'times'],
    ['aya', 'yinan'],
    ['kate', 'gon'],
    ['feng', 'sean'],
    ['kay', 'lizard'],
    ['kiki', 'chung'],
  ],
  erus: [
    ['times', 'masa'],
    ['kay', 'lizard'],
    ['amiro', 'anmc'],
    ['ryuko', 'zoma'],
    ['sean', 'feng'],
    ['gigi', 'sww'],
  ],
  feng: [
    ['alex', 'sou'],
    ['dido', 'sakuya'],
    ['sww', 'gigi'],
    ['kiki', 'chung'],
    ['giant', 'suneo'],
    ['sin', 'yo'],
  ],
  sean: [
    ['suneo', 'giant'],
    ['rear', 'remu'],
    ['chung', 'kiki'],
    ['masa', 'times'],
    ['lizard', 'kay'],
    ['ryuko', 'zoma'],
  ],
  gon: [
    ['ogi', 'ziro'],
    ['amiro', 'anmc'],
    ['erus', 'hiso'],
    ['rear', 'remu'],
    ['sakuya', 'dido'],
    ['lizard', 'kay'],
  ],
  kate: [
    ['remu', 'rear'],
    ['ziro', 'ogi'],
    ['sin', 'yo'],
    ['dido', 'sakuya'],
    ['erus', 'hiso'],
    ['times', 'masa'],
  ],
  remu: [
    ['kate', 'gon'],
    ['erus', 'hiso'],
    ['yo', 'sin'],
    ['aya', 'yinan'],
    ['gigi', 'sww'],
    ['amiro', 'anmc'],
  ],
  rear: [
    ['feng', 'sean'],
    ['ogi', 'ziro'],
    ['lizard', 'kay'],
    ['sou', 'alex'],
    ['erus', 'hiso'],
    ['giant', 'suneo'],
  ],
  gigi: [
    ['anmc', 'amiro'],
    ['kiki', 'chung'],
    ['ogi', 'ziro'],
    ['hiso', 'erus'],
    ['sou', 'alex'],
    ['remu', 'rear'],
  ],
  sww: [
    ['gon', 'kate'],
    ['yinan', 'aya'],
    ['sean', 'feng'],
    ['ziro', 'ogi'],
    ['masa', 'times'],
    ['sakuya', 'dido'],
  ],
  ogi: [
    ['sean', 'feng'],
    ['alex', 'sou'],
    ['giant', 'suneo'],
    ['chung', 'kiki'],
    ['rear', 'remu'],
    ['zoma', 'ryuko'],
  ],
  ziro: [
    ['ryuko', 'zoma'],
    ['sean', 'feng'],
    ['aya', 'yinan'],
    ['gigi', 'sww'],
    ['alex', 'sou'],
    ['gon', 'kate'],
  ],
  masa: [
    ['kay', 'lizard'],
    ['giant', 'suneo'],
    ['remu', 'rear'],
    ['sin', 'yo'],
    ['ryuko', 'zoma'],
    ['sww', 'gigi'],
  ],
  times: [
    ['kate', 'gon'],
    ['lizard', 'kay'],
    ['feng', 'sean'],
    ['yo', 'sin'],
    ['anmc', 'amiro'],
    ['alex', 'sou'],
  ],
  yinan: [
    ['lizard', 'kay'],
    ['gon', 'kate'],
    ['zoma', 'ryuko'],
    ['sean', 'feng'],
    ['ziro', 'ogi'],
    ['sww', 'gigi'],
  ],
  aya: [
    ['sakuya', 'dido'],
    ['times', 'masa'],
    ['gon', 'kate'],
    ['lizard', 'kay'],
    ['suneo', 'giant'],
    ['chung', 'kiki'],
  ],
  zmega: [
    ['sou', 'alex'],
    ['suneo', 'giant'],
    ['rear', 'remu'],
    ['sww', 'gigi'],
    ['kiki', 'chung'],
    ['anmc', 'amiro'],
  ],
  rario: [
    ['amiro', 'anmc'],
    ['yo', 'sin'],
    ['sou', 'alex'],
    ['chung', 'kiki'],
    ['sww', 'gigi'],
    ['masa', 'times'],
  ],
  zenka: [
    ['erus', 'hiso'],
    ['gigi', 'sww'],
    ['aya', 'yinan'],
    ['times', 'masa'],
    ['feng', 'sean'],
    ['zoma', 'ryuko'],
  ],
  alpha: [
    ['kiki', 'chung'],
    ['hiso', 'erus'],
    ['times', 'masa'],
    ['lizard', 'kay'],
    ['kate', 'gon'],
    ['remu', 'rear'],
  ],
  shinz: [
    ['ziro', 'ogi'],
    ['sakuya', 'dido'],
    ['masa', 'times'],
    ['ryuko', 'zoma'],
    ['yinan', 'aya'],
    ['gon', 'kate'],
  ],
  dora: [
    ['zoma', 'ryuko'],
    ['giant', 'suneo'],
    ['yo', 'sin'],
    ['alex', 'sou'],
    ['kiki', 'chung'],
    ['aya', 'yinan'],
  ],
};
