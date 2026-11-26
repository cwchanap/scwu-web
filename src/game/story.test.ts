import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { script } from './animations';
import { CHARACTERS, desperationOf, lifeOf, STAGES } from './characters';
import type { Who } from './characters';
import { Match } from './match';
import { BOSSES, ROSTER } from './select';
import {
  isModeSelectBattle,
  opensOnModeSelect,
  routeLife,
  Story,
  scenarioOf,
  TAKES,
} from './story';
import type { Battle, Next, SignRoute, Step } from './story';
import {
  bossBrAnotherStages,
  brAnotherStages,
  brLongBattle,
} from './br-another';
import { BR_LONG_LINEUPS } from './br-lineups';

const at = (story: Story) => story.step;

describe('story runner', () => {
  it('opens Ryuko’s story on her first battle', () => {
    const story = new Story('ryuko');
    const next = story.next();
    expect(at(story)).toBe(0);
    expect(next.kind).toBe('battle');
    if (next.kind !== 'battle') return;
    // Stage 1 (Sport Court), one round, ZAKU and PAC-HELO with reinforcements
    // that enter as players 1 and 2 fall.
    expect(next.battle).toMatchObject({ stage: 1, rounds: 1, x: 540 });
    expect(next.battle.slots.map((s) => s && [s.player, s.flags])).toEqual([
      [34, 0],
      [35, 0],
      [34, 4],
      [35, 4],
      [34, 4],
      [35, 4],
      null,
    ]);
  });

  it('takes the jumps on the 1P’s life after the battle', () => {
    // Steps 1–3 jump below 162, 163 and 250 life to steps 62, 47 and 21.
    for (const [life, step, demo] of [
      [510, 4, 3],
      [250, 4, 3],
      [249, 21, 3],
      [162, 47, 18],
      [161, 62, 4],
    ]) {
      const story = new Story('ryuko');
      story.next();
      expect(story.next(life, 0)).toEqual({ kind: 'demo', demo });
      expect(at(story)).toBe(step);
    }
  });

  it('jumps on a battle without a lost round', () => {
    // Step 40, Z-MEGA, then step 41 skips his win demo when no round was
    // lost.
    const story = new Story('ryuko');
    story.step = 40;
    expect(story.next(510, 0)).toEqual({ kind: 'demo', demo: 16 });
    story.step = 40;
    expect(story.next(510, 1)).toEqual({ kind: 'demo', demo: 15 });
  });

  it('ends at the title and retries a battle', () => {
    const story = new Story('ryuko');
    story.step = 60;
    expect(story.next()).toEqual({ kind: 'title' });
    story.step = 5;
    expect(story.retry()).toMatchObject({ kind: 'battle' });
    expect(at(story)).toBe(5);
  });

  it('runs every story to a battle, a demo or the title', () => {
    expect(scenarioOf('rario').length).toBeGreaterThan(0);
    expect(scenarioOf('training')).toEqual([]);
    expect(new Story('training').next()).toEqual({ kind: 'title' });
  });

  it("runs DoraEmon's authored story on SHIN-Z's route", () => {
    const dora = scenarioOf('dora');
    const shinz = scenarioOf('shinz');
    expect(dora).toHaveLength(27);
    const players = (step: number) =>
      (dora[step] as Battle).slots.flatMap((s) => (s ? [s.player] : []));
    expect(
      [1, 3, 5, 7, 9, 11, 15].map((step) => [step, players(step)]),
    ).toEqual([
      [1, [6]],
      [3, [14]],
      [5, [13, 3, 9, 8, 20, 21, 36]],
      [7, [26, 11, 15, 10, 5, 24, 37]],
      [9, [19, 0, 23, 17, 4, 16, 36]],
      [11, [7, 22, 18, 1, 12, 2, 37]],
      [15, [28, 27, 29, 25, 39, 38, 31]],
    ]);
    expect(dora[1]).toMatchObject({ stage: 8, flags: 1 });
    for (const step of [
      0, 2, 4, 6, 8, 10, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22,
    ])
      expect(dora[step]).toEqual(shinz[step]);
    expect(dora.slice(23)).toEqual([
      { type: 2, demo: 8 },
      { ...scenarioOf('alpha')[21], stage: 3 },
      { type: 2, demo: 89 },
      { type: 4 },
    ]);
    const story = new Story('dora');
    expect(story.next()).toEqual({ kind: 'demo', demo: 3 });
    const giant = story.next();
    expect(giant.kind === 'battle' && giant.battle.slots[0]?.player).toBe(6);
    expect(story.retry()).toEqual(giant);
  });

  it('opens the mode select only where a Chii battle leads', () => {
    // Every story that opens on the Chii battle (its slots only ZAKU and
    // PAC-HELO) takes each route to a distinct battle or demo step; the
    // steps the four takes reach form three families.
    const families = new Set<string>();
    const excluded: Who[] = [];
    for (const who of Object.keys(CHARACTERS) as Who[]) {
      if (!opensOnModeSelect(who)) {
        excluded.push(who);
        continue;
      }
      const steps = (Object.keys(TAKES) as SignRoute[]).map((route) => {
        const story = new Story(who);
        expect(story.startOnRoute(route).kind, `${who} ${route}`).not.toBe(
          'title',
        );
        return at(story);
      });
      expect(new Set(steps).size, who).toBe(4);
      families.add(steps.join('/'));
    }
    expect([...families].sort()).toEqual([
      '4/17/33/44',
      '4/21/47/62',
      '6/23/49/64',
    ]);
    // Stories without the Chii opener never open this menu.
    expect(excluded.sort()).toEqual([
      'alpha',
      'astroman',
      'asura',
      'dora',
      'golf',
      'pachelo',
      'shinz',
      'training',
      'ttro',
      'zaku',
      'zenka',
    ]);
    // Ryuko's Hard take lands on step 21's demo; its battle follows, and
    // retry replays it as next() always did.
    const story = new Story('ryuko');
    expect(story.startOnRoute('story-hard')).toEqual({
      kind: 'demo',
      demo: 3,
    });
    expect(at(story)).toBe(21);
    const battle = story.next();
    expect(battle.kind).toBe('battle');
    expect(at(story)).toBe(22);
    expect(story.retry()).toEqual(battle);
  });

  it('keeps the mode-select predicate to its 34 regular fighters', () => {
    // The bosses (30, 32, 33, 45) join the selector through BOSSES in
    // scene.ts, never through this predicate, whose callers build the
    // source-specific B.R. stories (authored, HPA-858).
    expect(
      (Object.keys(CHARACTERS) as Who[]).filter((who) =>
        opensOnModeSelect(who),
      ),
    ).toHaveLength(34);
  });

  it('records the active route: null on an ordinary story, a picked sign route, or boss-br', () => {
    const story = new Story('ryuko');
    expect([story.route, story.br]).toEqual([null, false]);
    // The route a route sign picked stays on the story (HPA-858), which
    // marks the battles it starts B.R.
    story.startOnRoute('br-zero');
    expect([story.route, story.br]).toEqual(['br-zero', true]);
    story.startOnRoute('br-another');
    expect([story.route, story.br]).toEqual(['br-another', true]);
    story.startOnRoute('story-easy');
    expect([story.route, story.br]).toEqual(['story-easy', false]);
    // The generated B.R. LONG route marks B.R. like the rest (HPA-1251).
    const long = new Story('ryuko', 'br-long');
    expect([long.route, long.br]).toEqual(['br-long', true]);
    // It opens on HERE COMES A NEW CHALLENGER, then its one battle.
    expect(long.next()).toEqual({ kind: 'demo', demo: 24 });
    expect(long.next()).toEqual({
      kind: 'battle',
      battle: brLongBattle('ryuko'),
    });
    expect(long.next()).toEqual({ kind: 'title' });
    // The bosses' generated B.R. ANOTHER route caches its steps by route
    // (HPA-858), its first battle behind ANOTHER's opening screen.
    const boss = new Story('shinz', 'boss-br');
    expect([boss.route, boss.br]).toEqual(['boss-br', true]);
    expect(boss.next()).toEqual({ kind: 'demo', demo: 4 });
    expect(boss.next()).toEqual({
      kind: 'battle',
      battle: bossBrAnotherStages('shinz').stage1,
    });
  });

  it('rejects a one-sign battle as the mode select', () => {
    const chii = scenarioOf('ryuko')[0] as Battle;
    expect(isModeSelectBattle(chii)).toBe(true);
    // A lone sign actor could not offer the four-way pick.
    const lone = {
      ...chii,
      slots: chii.slots.map((s, i) => (i === 0 ? s : null)),
    };
    expect(isModeSelectBattle(lone)).toBe(false);
    // Nor could seats the 1P does not fight (the ally flag 0x200).
    const allied = {
      ...chii,
      slots: chii.slots.map((s, i) =>
        i < 2 ? s && { ...s, flags: s.flags | 0x200 } : null,
      ),
    };
    expect(isModeSelectBattle(allied)).toBe(false);
  });

  it('pins TAKES and routeLife to the recovered Chii sign scripts (409/163/162/161)', () => {
    // Each Chii sign punches player 1 for its exact route life take in
    // zaku and pachelo's scripts 75/80/83; Single Start is -1 (normal start).
    const otherLife = (who: 'zaku' | 'pachelo', index: number) =>
      script(index, who).events.find((e) => e.op === 'power')?.otherLife;

    expect(otherLife('zaku', 75)).toBe(-1);
    expect(-otherLife('zaku', 80)!).toBe(TAKES['story-easy']);
    expect(-otherLife('pachelo', 80)!).toBe(TAKES['story-hard']);
    expect(-otherLife('zaku', 83)!).toBe(TAKES['br-zero']);
    expect(-otherLife('pachelo', 83)!).toBe(TAKES['br-another']);

    // And against Ryuko (life 510, minus the 1-tick death floor) those
    // exact script takes land on 409 / 163 / 162 / 161 (steps 4/21/47/62).
    expect(lifeOf('ryuko')).toBe(510);
    expect(routeLife('ryuko', 'story-easy')).toBe(409);
    expect(routeLife('ryuko', 'story-hard')).toBe(163);
    expect(routeLife('ryuko', 'br-zero')).toBe(162);
    expect(routeLife('ryuko', 'br-another')).toBe(161);
  });
});

describe('source route reachability', () => {
  const routes = Object.keys(TAKES) as SignRoute[];
  const sharedRoutes: SignRoute[] = ['story-easy', 'story-hard', 'br-zero'];
  const parsed = new Map<Who, readonly Step[]>();
  const source = (who: Who) => {
    let steps = parsed.get(who);
    if (!steps) {
      steps = (
        JSON.parse(
          readFileSync(
            new URL(
              `./generated/${who === 'ryuko' ? 'assets' : who}.json`,
              import.meta.url,
            ),
            'utf8',
          ),
        ) as { scenario: readonly Step[] }
      ).scenario;
      parsed.set(who, steps);
    }
    return steps;
  };
  const eligible = (Object.keys(CHARACTERS) as Who[]).filter((who) =>
    opensOnModeSelect(who),
  );
  const miniBosses: Who[] = ['masa', 'times', 'zmega', 'rario'];
  const twins: Who[] = ['yinan', 'aya'];
  const regulars = eligible.filter(
    (who) => !miniBosses.includes(who) && !twins.includes(who),
  );
  const familyOf = (who: Who) =>
    miniBosses.includes(who)
      ? 'mini-bosses'
      : twins.includes(who)
        ? 'twins'
        : 'regulars';
  const brOnlyOf = (who: Who) =>
    familyOf(who) === 'mini-bosses'
      ? [44, 45, 46, 47, 48, 49]
      : familyOf(who) === 'twins'
        ? [64, 65, 66, 67, 68]
        : [62, 63, 64, 65, 66];
  const sharedOf = (who: Who) =>
    who === 'rario'
      ? [50, 51, 52, 53, 54]
      : who === 'zmega'
        ? [50, 51, 52]
        : familyOf(who) === 'mini-bosses'
          ? [50, 51]
          : familyOf(who) === 'twins'
            ? [62, 63]
            : [60, 61];

  const enter = (steps: readonly Step[], life: number) => {
    let step = 0;
    for (let runs = 1; runs <= 200; runs++) {
      if (++step < 0 || step >= 100) return -1;
      const s: Step | undefined = steps[step];
      if (s === undefined || s.type === 0 || s.type === 4) return -1;
      if (s.type === 1) {
        if (s.stage) return step;
      } else if (s.type === 2) {
        if (s.demo) return step;
      } else if (s.type === 3) {
        if ([true, false, life < s.value, true][s.condition])
          step += s.offset - 1;
      }
    }
    return -1;
  };

  const sort = (ns: number[]) => ns.sort((a, b) => a - b);
  const reach = (steps: readonly Step[], start: number) => {
    const seen = new Set<number>();
    const battles: number[] = [];
    const demos: number[] = [];
    const ends: number[] = [];
    const queue = [start];
    while (queue.length) {
      const i = queue.pop()!;
      if (i < 0 || i >= 100 || seen.has(i)) continue;
      seen.add(i);
      const step: Step | undefined = steps[i];
      if (step === undefined || step.type === 0 || step.type === 4) {
        if (step?.type === 4) ends.push(i);
        continue;
      }
      if (step.type === 3) {
        if (step.condition === 0) queue.push(i + step.offset);
        else if (step.condition === 1) queue.push(i + 1);
        else queue.push(i + 1, i + step.offset);
        continue;
      }
      if (step.type === 1 && step.stage) battles.push(i);
      if (step.type === 2 && step.demo) demos.push(i);
      queue.push(i + 1);
    }
    return {
      seen,
      battles: sort(battles),
      demos: sort(demos),
      ends: sort(ends),
    };
  };

  const graphs = (steps: readonly Step[], who: Who) =>
    Object.fromEntries(
      routes.map((route) => [
        route,
        reach(steps, enter(steps, routeLife(who, route))),
      ]),
    ) as Record<SignRoute, ReturnType<typeof reach>>;

  const demoId = (steps: readonly Step[], i: number) => {
    const step: Step | undefined = steps[i];
    return step?.type === 2 ? step.demo : undefined;
  };

  const checkPreserved = (steps: readonly Step[], who: Who) => {
    const base = source(who);
    const free = new Set(brOnlyOf(who));
    base.forEach((step, i) => {
      if (!free.has(i)) expect(steps[i], `${who} step ${i}`).toEqual(step);
    });
    const before = graphs(base, who);
    const after = graphs(steps, who);
    for (const route of sharedRoutes)
      expect(
        {
          seen: after[route].seen,
          battles: after[route].battles,
          demos: after[route].demos,
          ends: after[route].ends,
        },
        `${who} ${route}`,
      ).toEqual({
        seen: before[route].seen,
        battles: before[route].battles,
        demos: before[route].demos,
        ends: before[route].ends,
      });
  };

  it('pins each eligible fighter’s BR Another-only and shared steps', () => {
    expect(eligible).toHaveLength(34);
    expect(regulars).toHaveLength(28);
    const entry = {
      regulars: [4, 21, 47, 62],
      twins: [6, 23, 49, 64],
      'mini-bosses': [4, 17, 33, 44],
    } as const;
    const brGraph = (who: Who) =>
      familyOf(who) === 'regulars'
        ? {
            battles: [63, 65],
            demos: [
              [60, 25],
              [62, 4],
              [64, 7],
            ],
            ends: [61],
          }
        : familyOf(who) === 'twins'
          ? {
              battles: [65, 67],
              demos: [
                [62, 25],
                [64, 4],
                [66, 7],
              ],
              ends: [63],
            }
          : who === 'rario'
            ? {
                battles: [45, 47, 49, 52],
                demos: [
                  [44, 4],
                  [46, 4],
                  [48, 7],
                  [50, 25],
                  [51, 91],
                  [53, 92],
                ],
                ends: [54],
              }
            : who === 'zmega'
              ? {
                  battles: [45, 47, 49],
                  demos: [
                    [44, 4],
                    [46, 4],
                    [48, 7],
                    [50, 25],
                    [51, 89],
                  ],
                  ends: [52],
                }
              : {
                  battles: [45, 47, 49],
                  demos: [
                    [44, 4],
                    [46, 4],
                    [48, 7],
                    [50, 25],
                  ],
                  ends: [51],
                };
    for (const who of eligible) {
      const steps = source(who);
      const g = graphs(steps, who);
      expect(
        routes.map((route) => enter(steps, routeLife(who, route))),
        who,
      ).toEqual(entry[familyOf(who)]);
      const others = new Set<number>(
        sharedRoutes.flatMap((route) => [...g[route].seen]),
      );
      expect(
        sort([...g['br-another'].seen].filter((i) => !others.has(i))),
        `${who} BR Another-only`,
      ).toEqual(brOnlyOf(who));
      expect(
        sort([...g['br-another'].seen].filter((i) => others.has(i))),
        `${who} shared`,
      ).toEqual(sharedOf(who));
      expect(
        {
          battles: g['br-another'].battles,
          demos: g['br-another'].demos.map((i) => [i, demoId(steps, i)]),
          ends: g['br-another'].ends,
        },
        who,
      ).toEqual(brGraph(who));
    }
  });

  it('lets only BR Another-only and appended steps differ from the source', () => {
    for (const who of eligible) {
      const authored = scenarioOf(who);
      expect(authored.length, who).toBeGreaterThanOrEqual(source(who).length);
      checkPreserved(authored, who);
    }
  });

  it('flags a changed shared step and accepts appended BR overflow', () => {
    const patched = structuredClone(source('ryuko')) as Step[];
    (patched[5] as Battle).recover = 50;
    expect(() => checkPreserved(patched, 'ryuko')).toThrow();
    const grown = structuredClone(source('ryuko')) as Step[];
    grown[63] = { type: 2, demo: 90 };
    grown.push({ type: 2, demo: 93 }, { type: 4 });
    expect(() => checkPreserved(grown, 'ryuko')).not.toThrow();
  });

  it('records every route’s reachable battle, demo and ending steps', () => {
    const record = (who: Who) => {
      const steps = source(who);
      const g = graphs(steps, who);
      return Object.fromEntries(
        routes.map((route) => [
          route,
          {
            battles: g[route].battles,
            demos: g[route].demos.map((i) => [i, demoId(steps, i)]),
            ends: g[route].ends,
          },
        ]),
      );
    };
    expect(record('ryuko')).toEqual({
      'story-easy': {
        battles: [5, 7, 9, 11, 13, 15, 17, 19, 40, 45, 67, 70, 76],
        demos: [
          [4, 3],
          [6, 3],
          [8, 3],
          [10, 23],
          [12, 3],
          [14, 3],
          [16, 3],
          [18, 5],
          [37, 12],
          [39, 14],
          [42, 15],
          [44, 16],
          [60, 25],
          [69, 13],
          [71, 31],
          [73, 30],
          [74, 25],
          [75, 91],
          [77, 92],
        ],
        ends: [61, 78],
      },
      'story-hard': {
        battles: [22, 24, 26, 28, 30, 32, 34, 36, 40, 45, 67, 70, 76],
        demos: [
          [21, 3],
          [23, 3],
          [25, 3],
          [27, 23],
          [29, 23],
          [31, 5],
          [33, 5],
          [35, 5],
          [37, 12],
          [39, 14],
          [42, 15],
          [44, 16],
          [60, 25],
          [69, 13],
          [71, 31],
          [73, 30],
          [74, 25],
          [75, 91],
          [77, 92],
        ],
        ends: [61, 78],
      },
      'br-zero': {
        battles: [48, 50, 52, 54, 56, 58],
        demos: [
          [47, 18],
          [49, 6],
          [51, 19],
          [53, 20],
          [55, 24],
          [57, 21],
          [59, 22],
          [60, 25],
        ],
        ends: [61],
      },
      'br-another': {
        battles: [63, 65],
        demos: [
          [60, 25],
          [62, 4],
          [64, 7],
        ],
        ends: [61],
      },
    });
    expect(record('kiki')).toEqual({
      'story-easy': {
        battles: [5, 7, 9, 11, 13, 15, 17, 19, 40, 45, 67, 70, 77],
        demos: [
          [4, 3],
          [6, 3],
          [8, 23],
          [10, 3],
          [12, 3],
          [14, 3],
          [16, 3],
          [18, 5],
          [37, 12],
          [39, 14],
          [42, 15],
          [44, 16],
          [60, 25],
          [69, 13],
          [71, 39],
          [73, 17],
          [74, 38],
          [75, 25],
          [76, 91],
          [78, 92],
        ],
        ends: [61, 79],
      },
      'story-hard': {
        battles: [22, 24, 26, 28, 30, 32, 34, 36, 40, 45, 67, 70, 77],
        demos: [
          [21, 3],
          [23, 3],
          [25, 3],
          [27, 23],
          [29, 23],
          [31, 5],
          [33, 5],
          [35, 5],
          [37, 12],
          [39, 14],
          [42, 15],
          [44, 16],
          [60, 25],
          [69, 13],
          [71, 39],
          [73, 17],
          [74, 38],
          [75, 25],
          [76, 91],
          [78, 92],
        ],
        ends: [61, 79],
      },
      'br-zero': {
        battles: [48, 50, 52, 54, 56, 58],
        demos: [
          [47, 18],
          [49, 6],
          [51, 19],
          [53, 20],
          [55, 24],
          [57, 21],
          [59, 22],
          [60, 25],
        ],
        ends: [61],
      },
      'br-another': {
        battles: [63, 65],
        demos: [
          [60, 25],
          [62, 4],
          [64, 7],
        ],
        ends: [61],
      },
    });
    expect(record('masa')).toEqual({
      'story-easy': {
        battles: [5, 7, 9, 11, 13, 15, 28, 30, 54],
        demos: [
          [4, 4],
          [6, 4],
          [8, 4],
          [10, 4],
          [12, 4],
          [14, 5],
          [27, 8],
          [29, 8],
          [31, 29],
          [52, 25],
          [53, 91],
          [55, 92],
        ],
        ends: [56],
      },
      'story-hard': {
        battles: [18, 20, 22, 24, 26, 28, 30, 54],
        demos: [
          [17, 4],
          [19, 4],
          [21, 27],
          [23, 4],
          [25, 5],
          [27, 8],
          [29, 8],
          [31, 29],
          [52, 25],
          [53, 91],
          [55, 92],
        ],
        ends: [56],
      },
      'br-zero': {
        battles: [34, 36, 38, 40, 42],
        demos: [
          [33, 6],
          [35, 26],
          [37, 26],
          [39, 27],
          [41, 7],
          [50, 25],
        ],
        ends: [51],
      },
      'br-another': {
        battles: [45, 47, 49],
        demos: [
          [44, 4],
          [46, 4],
          [48, 7],
          [50, 25],
        ],
        ends: [51],
      },
    });
    expect(record('rario')).toEqual({
      'story-easy': {
        battles: [5, 7, 9, 11, 13, 15, 28, 30, 52],
        demos: [
          [4, 4],
          [6, 4],
          [8, 4],
          [10, 4],
          [12, 4],
          [14, 5],
          [27, 8],
          [29, 8],
          [31, 29],
          [50, 25],
          [51, 91],
          [53, 92],
        ],
        ends: [54],
      },
      'story-hard': {
        battles: [18, 20, 22, 24, 26, 28, 30, 52],
        demos: [
          [17, 4],
          [19, 4],
          [21, 4],
          [23, 27],
          [25, 5],
          [27, 8],
          [29, 8],
          [31, 29],
          [50, 25],
          [51, 91],
          [53, 92],
        ],
        ends: [54],
      },
      'br-zero': {
        battles: [34, 36, 38, 40, 42, 52],
        demos: [
          [33, 6],
          [35, 26],
          [37, 26],
          [39, 6],
          [41, 7],
          [50, 25],
          [51, 91],
          [53, 92],
        ],
        ends: [54],
      },
      'br-another': {
        battles: [45, 47, 49, 52],
        demos: [
          [44, 4],
          [46, 4],
          [48, 7],
          [50, 25],
          [51, 91],
          [53, 92],
        ],
        ends: [54],
      },
    });
    expect(record('yinan')).toEqual({
      'story-easy': {
        battles: [7, 9, 11, 13, 15, 17, 19, 21, 42, 47, 69, 72, 78],
        demos: [
          [6, 3],
          [8, 3],
          [10, 3],
          [12, 3],
          [14, 3],
          [16, 3],
          [18, 3],
          [20, 5],
          [39, 12],
          [41, 14],
          [44, 15],
          [46, 16],
          [62, 25],
          [71, 13],
          [73, 87],
          [75, 86],
          [76, 25],
          [77, 91],
          [79, 92],
        ],
        ends: [63, 80],
      },
      'story-hard': {
        battles: [24, 26, 28, 30, 32, 34, 36, 38, 42, 47, 69, 72, 78],
        demos: [
          [23, 3],
          [25, 3],
          [27, 3],
          [29, 3],
          [31, 23],
          [33, 5],
          [35, 5],
          [37, 5],
          [39, 12],
          [41, 14],
          [44, 15],
          [46, 16],
          [62, 25],
          [71, 13],
          [73, 87],
          [75, 86],
          [76, 25],
          [77, 91],
          [79, 92],
        ],
        ends: [63, 80],
      },
      'br-zero': {
        battles: [50, 52, 54, 56, 58, 60],
        demos: [
          [49, 18],
          [51, 6],
          [53, 19],
          [55, 20],
          [57, 24],
          [59, 21],
          [61, 22],
          [62, 25],
        ],
        ends: [63],
      },
      'br-another': {
        battles: [65, 67],
        demos: [
          [62, 25],
          [64, 4],
          [66, 7],
        ],
        ends: [63],
      },
    });
  });

  it('keeps RARIO’s shared tail and every story route’s DoraEmon fight', () => {
    const base = source('rario');
    expect(base[32]).toEqual({ type: 3, condition: 0, value: 0, offset: 18 });
    expect(base[43]).toEqual({ type: 3, condition: 0, value: 0, offset: 7 });
    expect(base.slice(50)).toEqual([
      { type: 2, demo: 25 },
      { type: 2, demo: 91 },
      expect.objectContaining({ type: 1, stage: 3, koScorer: 2 }),
      { type: 2, demo: 92 },
      { type: 4 },
    ]);
    expect(scenarioOf('rario').slice(50, 55)).toEqual(base.slice(50, 55));
    for (const who of eligible) {
      const steps = source(who);
      const g = graphs(steps, who);
      const dora = steps.flatMap((step, i) =>
        step.type === 1 && step.slots.some((s) => s?.player === 45) ? [i] : [],
      );
      const [index] = dora;
      expect(dora, who).toEqual([steps.length - (who === 'zmega' ? 4 : 3)]);
      expect(steps[index - 1], `${who} demo`).toEqual({
        type: 2,
        demo: 91,
      });
      expect(steps[index + 1], `${who} demo`).toEqual({
        type: 2,
        demo: 92,
      });
      const battle = steps[index] as Battle;
      expect(battle, who).toMatchObject({
        type: 1,
        stage: 3,
        rounds: 2,
        recover: 100,
        flags: 1,
        time: 0,
        x: 520,
        letterings: 7,
        timeUp: 100,
        koScorer: who === 'hiso' ? 0 : 2,
        koPoints: 100,
      });
      expect(
        battle.slots.map(
          (s) =>
            s && [s.player, s.flags, s.level, s.enemies, s.points, s.scorer],
        ),
        who,
      ).toEqual([
        [45, 0, 100, 1, 1, who === 'yo' ? 0 : 1],
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
      expect(
        routes.filter((route) => g[route].battles.includes(index)),
        who,
      ).toEqual(who === 'rario' ? routes : ['story-easy', 'story-hard']);
    }
  });

  it('pins the source BR Another battle templates', () => {
    const stageKeys = Object.keys(STAGES);
    const brBattles = (who: Who) =>
      brOnlyOf(who)
        .filter((i) => source(who)[i].type === 1)
        .map((i) => source(who)[i] as Battle);
    const stageKeysOf = (who: Who): string[] =>
      (
        ({
          masa: ['japan', 'sakura', 'boss'],
          times: ['sakura', 'japan', 'office2'],
          zmega: ['court', 'train', 'office2'],
          rario: ['train', 'court', 'boss'],
        }) as Partial<Record<Who, string[]>>
      )[who] ?? ['sakura', ROSTER.indexOf(who) & 1 ? 'office2' : 'boss'];
    const allyOf = (who: Who): Who =>
      who === 'zmega'
        ? 'rario'
        : who === 'rario'
          ? 'zmega'
          : ROSTER[ROSTER.indexOf(who) ^ 1]!;
    const battleX: Partial<Record<Who, number>> = {
      amiro: 300,
      yo: 420,
      lizard: 220,
      kay: 420,
      sin: 550,
      rear: 200,
      masa: 300,
    };
    const allyX: Partial<Record<Who, number>> = { sin: 750, kay: 550 };
    for (const who of eligible) {
      const steps = source(who);
      const battles = brBattles(who);
      expect(
        battles.map((b) => stageKeys[b.stage - 1]),
        who,
      ).toEqual(stageKeysOf(who));
      const fin = battles.at(-1)!;
      expect(
        {
          type: fin.type,
          stage: fin.stage,
          rounds: fin.rounds,
          recover: fin.recover,
          flags: fin.flags,
          time: fin.time,
          letterings: fin.letterings,
          timeUp: fin.timeUp,
          koScorer: fin.koScorer,
          koPoints: fin.koPoints,
          x: fin.x,
        },
        who,
      ).toEqual({
        type: 1,
        stage: stageKeys.indexOf(stageKeysOf(who).at(-1)!) + 1,
        rounds: 1,
        recover: 100,
        flags: 1,
        time: 0,
        letterings: 3,
        timeUp: 100,
        koScorer: 0,
        koPoints: 100,
        x: battleX[who] ?? 520,
      });
      const slots = fin.slots;
      expect(
        slots.map((s) => s?.flags),
        who,
      ).toEqual([0x100, 0x104, 0x104, 0x104, 0x104, 0x4, 0x305]);
      expect(
        slots.map((s) => s?.enemies),
        who,
      ).toEqual([249, 249, 231, 231, 223, 191, 126]);
      expect(
        slots.map((s) => s?.level),
        who,
      ).toEqual([100, 100, 100, 100, 100, 100, 100]);
      expect(
        slots.map((s) => s?.delay),
        who,
      ).toEqual(
        who === 'times' ? [1, 0, 0, 0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0],
      );
      expect(
        slots.map((s) => s?.watch),
        who,
      ).toEqual([0, 1, 2, 3, 4, 5, 0]);
      expect(
        slots.map((s) => s?.x),
        who,
      ).toEqual([850, 450, 850, 450, 850, 450, allyX[who] ?? 850]);
      expect(
        slots.map((s) => s?.points),
        who,
      ).toEqual([0, 0, 0, 0, 0, 100, 0]);
      expect(
        slots.map((s) => s?.scorer),
        who,
      ).toEqual(
        who === 'ryuko' ? [1, 0, 0, 0, 0, 1, 0] : [0, 0, 0, 0, 0, 1, 0],
      );
      const below = [
        0,
        ...slots.slice(0, 5).map((s) => desperationOf(ROSTER[s!.player]!)),
        desperationOf(who),
      ];
      if (who === 'alex') below[2] = 142;
      expect(
        slots.map((s) => s?.below),
        who,
      ).toEqual(below);
      expect(ROSTER[slots[6]!.player], who).toBe(allyOf(who));
      const open = battles[0]!;
      expect(
        open.slots.map((s) => s && s.flags),
        who,
      ).toEqual(
        familyOf(who) === 'mini-bosses'
          ? [0x100, 0x104, 0x104, 0x4, null, null, 0x305]
          : who === 'remu'
            ? [0x100, 0x104, 0x84, 0x104, 0x104, 0x4, 0x305]
            : [0x100, 0x104, 0x104, 0x104, 0x104, 0x4, 0x305],
      );
      expect(
        open.slots.map((s) => s && s.level),
        who,
      ).toEqual(
        familyOf(who) === 'mini-bosses'
          ? [60, 60, 60, 60, null, null, 100]
          : [100, 100, 100, 100, 100, 100, 100],
      );
      if (familyOf(who) === 'mini-bosses')
        expect(
          battles[1]!.slots.map((s) => s && s.level),
          who,
        ).toEqual([80, 80, 80, 80, null, null, 100]);
      const endDemos = sharedOf(who).flatMap((i) => {
        const demo = demoId(steps, i);
        return demo === undefined ? [] : [[i, demo]];
      });
      expect(endDemos, who).toEqual(
        who === 'rario'
          ? [
              [50, 25],
              [51, 91],
              [53, 92],
            ]
          : who === 'zmega'
            ? [
                [50, 25],
                [51, 89],
              ]
            : [[sharedOf(who)[0], 25]],
      );
    }
    const first = source('ryuko')[63] as Battle;
    expect(first).toMatchObject({
      type: 1,
      stage: 9,
      rounds: 1,
      recover: 100,
      flags: 1,
      time: 0,
      x: 520,
      letterings: 3,
      timeUp: 100,
      koScorer: 0,
      koPoints: 100,
    });
    expect(first.slots.map((s) => s && [s.player, s.flags])).toEqual([
      [16, 0x100],
      [17, 0x104],
      [2, 0x104],
      [3, 0x104],
      [14, 0x104],
      [15, 0x4],
      [1, 0x305],
    ]);
    expect(first.slots.map((s) => s?.enemies)).toEqual([
      249, 249, 231, 231, 159, 159, 126,
    ]);
    expect(first.slots.map((s) => s?.level)).toEqual([
      100, 100, 100, 100, 100, 100, 100,
    ]);
  });

  describe('BR Another staged scenarios', () => {
    const stagedWalk = (who: Who) => {
      const story = new Story(who);
      const path: { step: number; next: Next }[] = [];
      for (let next = story.startOnRoute('br-another'); ; next = story.next()) {
        path.push({ step: at(story), next });
        if (next.kind === 'title') return path;
        if (next.kind === 'battle')
          expect(story.retry(), `${who} retry ${at(story)}`).toEqual(next);
        expect(path.length, `${who} route bound`).toBeLessThan(100);
      }
    };

    it('runs every staged story through its three battles and shared ending', () => {
      for (const who of eligible) {
        const { stage1, stage2, stage3 } = brAnotherStages(who);
        const family = familyOf(who);
        const len = source(who).length;
        const path = stagedWalk(who);
        expect(
          path.map((p) => [p.step, p.next.kind]),
          who,
        ).toEqual(
          who === 'rario'
            ? [
                [44, 'demo'],
                [45, 'battle'],
                [46, 'demo'],
                [47, 'battle'],
                [48, 'demo'],
                [len, 'battle'],
                [len + 1, 'demo'],
                [len + 2, 'title'],
              ]
            : family === 'mini-bosses'
              ? [
                  [44, 'demo'],
                  [45, 'battle'],
                  [46, 'demo'],
                  [47, 'battle'],
                  [48, 'demo'],
                  [49, 'battle'],
                  [50, 'demo'],
                  ...(who === 'zmega'
                    ? [
                        [51, 'demo'],
                        [52, 'title'],
                      ]
                    : [[51, 'title']]),
                ]
              : family === 'twins'
                ? [
                    [64, 'demo'],
                    [65, 'battle'],
                    [66, 'demo'],
                    [67, 'battle'],
                    [len, 'demo'],
                    [len + 1, 'battle'],
                    [62, 'demo'],
                    [63, 'title'],
                  ]
                : [
                    [62, 'demo'],
                    [63, 'battle'],
                    [64, 'demo'],
                    [65, 'battle'],
                    [len, 'demo'],
                    [len + 1, 'battle'],
                    [60, 'demo'],
                    [61, 'title'],
                  ],
        );
        const battles = path.flatMap((p) =>
          p.next.kind === 'battle' ? [p.next.battle] : [],
        );
        expect(battles, who).toEqual([stage1, stage2, stage3]);
        const demos = path.flatMap((p) =>
          p.next.kind === 'demo' ? [p.next.demo] : [],
        );
        expect(demos, who).toEqual(
          who === 'zmega' ? [4, 5, 7, 25, 89] : [4, 5, 7, 25],
        );
      }
    });

    it('overwrites only each family’s BR block and appends its overflow', () => {
      for (const who of eligible) {
        const base = source(who);
        const steps = scenarioOf(who);
        const chars = CHARACTERS[who].scenario as readonly Step[];
        const { stage1, stage2, stage3 } = brAnotherStages(who);
        expect(steps.length, who).toBeLessThanOrEqual(100);
        if (familyOf(who) === 'mini-bosses') {
          expect(steps.length, who).toBe(
            base.length + (who === 'rario' ? 3 : 0),
          );
          expect(steps.slice(44, 50), who).toEqual([
            { type: 2, demo: 4 },
            stage1,
            { type: 2, demo: 5 },
            stage2,
            { type: 2, demo: 7 },
            who === 'rario'
              ? { type: 3, condition: 0, value: 0, offset: base.length - 49 }
              : stage3,
          ]);
          if (who === 'rario')
            expect(steps.slice(50), who).toEqual([
              ...base.slice(50),
              stage3,
              { type: 2, demo: 25 },
              { type: 4 },
            ]);
        } else {
          const finale = familyOf(who) === 'twins' ? 67 : 65;
          const ending = finale - 5;
          expect(steps.length, who).toBe(base.length + 3);
          expect(steps[finale - 3], `${who} intro demo`).toBe(
            chars[finale - 3],
          );
          expect(steps[finale - 2], who).toEqual(stage1);
          expect(steps[finale - 1], who).toEqual({ type: 2, demo: 5 });
          expect(steps[finale], who).toEqual(stage2);
          expect(steps[finale + 1], who).toEqual({
            type: 3,
            condition: 0,
            value: 0,
            offset: base.length - (finale + 1),
          });
          expect(steps.slice(base.length), who).toEqual([
            { type: 2, demo: 7 },
            stage3,
            {
              type: 3,
              condition: 0,
              value: 0,
              offset: ending - (base.length + 2),
            },
          ]);
        }
      }
    });

    it('gives BR Another its staged battles and shared ending on the graph', () => {
      for (const who of eligible) {
        const steps = scenarioOf(who);
        const len = source(who).length;
        const family = familyOf(who);
        const graph = reach(steps, enter(steps, routeLife(who, 'br-another')));
        expect(
          {
            battles: graph.battles,
            demos: graph.demos.map((i) => [i, demoId(steps, i)]),
            ends: graph.ends,
          },
          who,
        ).toEqual(
          who === 'rario'
            ? {
                battles: [45, 47, 55],
                demos: [
                  [44, 4],
                  [46, 5],
                  [48, 7],
                  [56, 25],
                ],
                ends: [57],
              }
            : family === 'mini-bosses'
              ? who === 'zmega'
                ? {
                    battles: [45, 47, 49],
                    demos: [
                      [44, 4],
                      [46, 5],
                      [48, 7],
                      [50, 25],
                      [51, 89],
                    ],
                    ends: [52],
                  }
                : {
                    battles: [45, 47, 49],
                    demos: [
                      [44, 4],
                      [46, 5],
                      [48, 7],
                      [50, 25],
                    ],
                    ends: [51],
                  }
              : family === 'twins'
                ? {
                    battles: [65, 67, len + 1],
                    demos: [
                      [62, 25],
                      [64, 4],
                      [66, 5],
                      [len, 7],
                    ],
                    ends: [63],
                  }
                : {
                    battles: [63, 65, len + 1],
                    demos: [
                      [60, 25],
                      [62, 4],
                      [64, 5],
                      [len, 7],
                    ],
                    ends: [61],
                  },
        );
      }
    });

    it('builds each staged scenario once and leaves every source untouched', () => {
      for (const who of Object.keys(CHARACTERS) as Who[]) {
        expect(scenarioOf(who), who).toBe(scenarioOf(who));
        const base = CHARACTERS[who].scenario as readonly Step[];
        if (eligible.includes(who)) {
          expect(scenarioOf(who), who).not.toBe(base);
          expect(base, who).toEqual(source(who));
        } else if (who !== 'dora') {
          expect(scenarioOf(who), who).toBe(base);
        }
      }
    });

    it('keeps RARIO’s steps 50–54 reachable on its other routes only', () => {
      const run = (route: SignRoute) => {
        const story = new Story('rario');
        const path: number[] = [];
        for (let next = story.startOnRoute(route); ; next = story.next()) {
          path.push(at(story));
          if (next.kind === 'title') return path;
          expect(path.length, route).toBeLessThan(100);
        }
      };
      for (const route of sharedRoutes) {
        const path = run(route);
        expect(path, route).toContain(52);
        expect(path, route).toContain(54);
        expect(path, route).not.toContain(55);
        expect(path, route).not.toContain(56);
      }
      expect(run('br-another')).toEqual([44, 45, 46, 47, 48, 55, 56, 57]);
    });

    it('lands every route on its native entry step', () => {
      const entry = {
        regulars: [4, 21, 47, 62],
        twins: [6, 23, 49, 64],
        'mini-bosses': [4, 17, 33, 44],
      } as const;
      for (const who of eligible)
        for (const [i, route] of routes.entries()) {
          const story = new Story(who);
          story.startOnRoute(route);
          expect(at(story), `${who} ${route}`).toBe(entry[familyOf(who)][i]);
        }
    });

    it('plays RARIO’s three staged battles only, while his other routes still seat the DoraEmon tail', () => {
      const tail = CHARACTERS['rario'].scenario[52] as Battle;
      const battlesOf = (route: SignRoute) => {
        const story = new Story('rario');
        const battles: { step: number; battle: Battle }[] = [];
        for (
          let next = story.startOnRoute(route), yields = 1;
          next.kind !== 'title';
          next = story.next(), yields++
        ) {
          if (next.kind === 'battle')
            battles.push({ step: at(story), battle: next.battle });
          expect(yields, route).toBeLessThan(100);
        }
        return battles;
      };
      const another = battlesOf('br-another');
      expect(another.map((b) => b.step)).toEqual([45, 47, 55]);
      for (const { step, battle } of another)
        expect(battle, `step ${step}`).toBe(scenarioOf('rario')[step]);
      for (const route of ['story-easy', 'br-zero'] as SignRoute[]) {
        const hit = battlesOf(route).find((b) => b.step === 52);
        expect(hit?.battle, route).toBe(tail);
        expect(
          Match.story('rario', tail).fighters.map((f) => f.who),
          route,
        ).toEqual(['rario', 'dora']);
      }
    });

    it('seats the battles its STORY and BR ZERO routes keep, unchanged from their source steps', () => {
      for (const who of ['ryuko', 'rario'] as Who[]) {
        const chars = CHARACTERS[who].scenario as readonly Step[];
        for (const route of ['story-easy', 'br-zero'] as SignRoute[]) {
          const story = new Story(who);
          for (
            let next = story.startOnRoute(route), yields = 1;
            next.kind !== 'title';
            next = story.next(), yields++
          ) {
            expect(yields, `${who} ${route} bound`).toBeLessThan(100);
            if (next.kind !== 'battle') continue;
            const i = at(story);
            expect(next.battle, `${who} ${route} ${i}`).toBe(chars[i]);
            const match = Match.story(who, next.battle);
            expect(
              match.fighters.map((f) => f.who),
              `${who} ${route} ${i}`,
            ).toEqual([
              who,
              ...next.battle.slots.flatMap((s) =>
                s ? [ROSTER[s.player]!] : [],
              ),
            ]);
          }
        }
      }
    });
  });
});

describe('B.R. LONG route', () => {
  const rows = Object.keys(BR_LONG_LINEUPS) as Who[];

  it('keys one row by the 34 ordinary players and the four bosses', () => {
    const ordinary = (Object.keys(CHARACTERS) as Who[]).filter(
      opensOnModeSelect,
    );
    expect(ordinary).toHaveLength(34);
    expect([...rows].sort(), 'LONG rows').toEqual(
      [...ordinary, ...BOSSES].sort(),
    );
  });

  it('marks the route B.R. and walks every row: its battle, then the end', () => {
    expect(rows).toHaveLength(38);
    for (const who of rows) {
      const story = new Story(who, 'br-long');
      expect([story.route, story.br], who).toEqual(['br-long', true]);
      const next = story.next();
      expect(at(story), who).toBe(0);
      expect(next.kind, who).toBe('battle');
      if (next.kind !== 'battle') continue;
      // Sakura Street, bit 0 keeping the Continue screen on a player KO.
      expect(next.battle.stage, who).toBe(9);
      expect(next.battle.flags & 1, who).toBe(1);
      // The route marker survives the walk, a retry replays the same
      // lineup and a winner's run ends at the title.
      expect([story.route, story.br], who).toEqual(['br-long', true]);
      expect(story.retry(), `retry ${who}`).toEqual(next);
      expect(story.next(lifeOf(who), 0), `win ${who}`).toEqual({
        kind: 'title',
      });
    }
  });
});
