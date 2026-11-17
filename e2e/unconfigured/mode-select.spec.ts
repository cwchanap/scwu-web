import { expect, test, type Page } from '@playwright/test';

// The quick mode select (HPA-765): SINGLE's story pick opens the authored
// two-step selector — STORY/B.R. sign boards, then the mode's routes — and a
// confirmed route starts in the original's demos and battles. The four
// bosses (HPA-858) confirm on that first step — STORY starts their story,
// B.R. their generated route — so their cases also watch that no route
// substep ever appears. The boards
// draw only on the canvas, so beyond the DOM health/pad signals this spec
// samples scene pixels: a sign board's region is white-bright when lit
// (full alpha), far dimmer when tinted, and the route step's small
// header sign lights a band that is plain dim backdrop on the mode step.
// Independent of Google auth — the unconfigured bundle is used.
test.use({ hasTouch: true });

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
// The inner — always opaque — area of each sign's drawn box in the 960×720
// scene's pixels (select.ts SIGN_SPOTS/HEADER_SPOT, any pick's scale):
// mode-step boards hang at top 250, route boards at 285, the mode's
// smaller header at (414..546, 40..144).
const MODE_LEFT: Rect = { x: 160, y: 320, w: 180, h: 140 };
const MODE_RIGHT: Rect = { x: 620, y: 320, w: 180, h: 140 };
const ROUTE_LEFT: Rect = { x: 160, y: 390, w: 180, h: 130 };
const ROUTE_RIGHT: Rect = { x: 620, y: 390, w: 180, h: 130 };
const HEADER: Rect = { x: 440, y: 65, w: 80, h: 65 };
// A board lighting means a whole screen chain ran — several opens and the
// picked select's hundred-tick wait — so the pixel polls share the slack
// the route check already gives confirmRoute, not the five-second default.
const VIEW = { timeout: 15_000 };

// Every case opens its own fresh page — the selector's remembered mode is
// the default STORY and the select cursor starts on Ryuko's cell — over
// this shared boot wait, DOM signals and canvas pixel probes. boot()
// re-runs the wait after a reload, which drops the session's selector
// memory and cursor for a second boss on the same page.
const openArena = async (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const canvas = page.locator('.arena canvas');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  const boot = async () => {
    await page.goto('/');
    await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
      timeout: 60_000,
    });
    await expect(failed).toBeHidden();
  };
  await boot();
  // While a select screen is up the pad is the eight select controls —
  // the four directions and the four palette-picking buttons (HPA-765
  // review); a battle shows the fighter's own (Ryuko has more).
  const pad = page.locator('.touch-controls button');
  const player = page.getByLabel('Player health');
  const opponent = page.getByLabel('Opponent health');
  const health = page.locator('[aria-label="Match health"]');

  // Presses 90 ms apart: keys landing on one 10 ms tick merge, so each key
  // gets ticks of its own (smoke.spec.ts).
  const press = async (key: string) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(90);
  };

  // Mean r/g/b/luminance of a scene-pixel rect, sampled from a composited
  // screenshot — canvas.toDataURL is blank for this WebGL context, but the
  // page screenshot composites it (device pixels: scale by the ratio).
  const sample = async (rects: Record<string, Rect>) => {
    const box = (await canvas.boundingBox())!;
    const shot = await page.screenshot();
    return page.evaluate(
      async ({ data, rects, box, ratio }) => {
        const img = new Image();
        img.src = data;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const out: Record<
          string,
          { r: number; g: number; b: number; lum: number }
        > = {};
        for (const [name, rect] of Object.entries(rects)) {
          const x = Math.round((box.x + (rect.x / 960) * box.width) * ratio);
          const y = Math.round((box.y + (rect.y / 720) * box.height) * ratio);
          const w = Math.max(1, Math.round((rect.w / 960) * box.width * ratio));
          const h = Math.max(
            1,
            Math.round((rect.h / 720) * box.height * ratio),
          );
          const d = ctx.getImageData(x, y, w, h).data;
          let r = 0,
            g = 0,
            b = 0;
          for (let i = 0; i < d.length; i += 4) {
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
          }
          const n = d.length / 4;
          out[name] = {
            r: r / n,
            g: g / n,
            b: b / n,
            lum: (r + g + b) / (3 * n),
          };
        }
        return out;
      },
      {
        data: 'data:image/png;base64,' + shot.toString('base64'),
        rects,
        box,
        ratio: await page.evaluate(() => devicePixelRatio),
      },
    );
  };
  const lum = async (name: string, rect: Rect) =>
    (await sample({ [name]: rect }))[name].lum;
  // lit minus dim luminance across the two boards, in one screenshot.
  const boards = async (left: Rect, right: Rect) => {
    const s = await sample({ left, right });
    return s.left.lum - s.right.lum;
  };

  // A canvas tap at a 960×720 game point — the same conversion Phaser's
  // Scale.FIT applies to a real touch. The settle wait lets a pick land
  // before the next read; a confirming tap passes 0 so the caller's watch
  // starts with no blind gap after it.
  const tap = async (gx: number, gy: number, settle = 150) => {
    const box = (await canvas.boundingBox())!;
    await page.touchscreen.tap(
      box.x + (gx / 960) * box.width,
      box.y + (gy / 720) * box.height,
    );
    if (settle) await page.waitForTimeout(settle);
  };

  // A route-confirming key or tap must leave the selector on its own,
  // proven where highlighting can't reach: the mode's small header sign
  // draws only while the route step is up, and it holds fixed opaque
  // values there — flipping the pick (a direction, or a tap that
  // selected without confirming) dims a board but never touches it.
  // Read it before the one confirm input, then require it to change
  // with nothing else pressed — a dropped Enter or tap, or an input
  // that only moved the highlight, leaves it fixed and times the poll
  // out. Without this gate skipToBattle's own 'g' would confirm the
  // highlighted route and mask the miss (both screens show the same
  // eight pad buttons).
  const confirmRoute = async (send: () => Promise<void>) => {
    const h0 = await lum('h', HEADER);
    await send();
    await expect
      .poll(async () => Math.abs((await lum('h', HEADER)) - h0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(25);
  };
  // A boss's confirm starts the story or generated route itself, so the
  // route step's small header sign must never light. The band is read
  // dark before the confirm and then sampled with no blind gap after it.
  // A route has no demo: the pad stops being the eight select controls
  // only when the battle renders, and the pad re-check after each sample
  // drops one that landed mid-transition — the band is never read once
  // the arena's pad shows. A story keeps the eight controls through its
  // demo, so the mode boards are the selector's trace instead: while they
  // draw the band must stay dark, and the sample where they leave must
  // find it dark too — a buggy route step lights the band as it replaces
  // the boards and never leaves on its own, so only the direct exit's
  // demo follows. Demo-skip presses wait for all of that.
  const confirmDirect = async (send: () => Promise<void>, demo: boolean) => {
    expect(await lum('h', HEADER), 'boss header before confirm').toBeLessThan(
      160,
    );
    await send();
    const deadline = Date.now() + 120_000;
    if (!demo) {
      while ((await pad.count()) <= 8 && Date.now() < deadline) {
        const header = await lum('h', HEADER);
        if ((await pad.count()) > 8) break;
        expect(header, 'boss header while selector visible').toBeLessThan(160);
        await page.waitForTimeout(150);
      }
      await expect
        .poll(() => pad.count(), { timeout: 30_000 })
        .toBeGreaterThan(8);
      return;
    }
    let exited = false;
    while (Date.now() < deadline) {
      const s = await sample({ h: HEADER, l: MODE_LEFT });
      if (s.l.lum <= 170) {
        expect(s.h.lum, 'boss header as the mode boards leave').toBeLessThan(
          160,
        );
        exited = true;
        break;
      }
      expect(s.h.lum, 'boss header while the mode boards draw').toBeLessThan(
        160,
      );
    }
    expect(exited, 'mode boards leave after a boss STORY confirm').toBe(true);
  };
  // A route's opening demo skips on a fresh button once armed; keep
  // pressing until the battle's own pad shows (an early press queueing
  // through the load lands on the demo's or battle's first tick).
  const skipToBattle = async () => {
    const deadline = Date.now() + 45_000;
    while ((await pad.count()) <= 8 && Date.now() < deadline) {
      await page.keyboard.press('g');
      await page.waitForTimeout(300);
    }
    await expect
      .poll(() => pad.count(), { timeout: 30_000 })
      .toBeGreaterThan(8);
  };

  // From a live story battle back to the selector: Menu's Character select
  // opens the VS form, Escape the title, then SINGLE → the pick again.
  const backToModeSelect = async () => {
    await menu.click();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await dialog.getByRole('button', { name: 'Character select' }).click();
    await expect(dialog).toBeHidden();
    await press('Escape');
    await press('g');
    await press('g');
    await press('g');
  };

  return {
    errors,
    boot,
    menu,
    pad,
    player,
    opponent,
    health,
    press,
    sample,
    lum,
    boards,
    tap,
    confirmRoute,
    confirmDirect,
    skipToBattle,
    backToModeSelect,
  };
};

test('mode select: two-step routes by keyboard, Enter, Escape and taps', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const {
    errors,
    pad,
    player,
    opponent,
    health,
    press,
    lum,
    boards,
    tap,
    confirmRoute,
    skipToBattle,
    backToModeSelect,
  } = await openArena(page);

  // SINGLE → Ryuko: T2's press, the menu's SINGLE and the 1P cursor's own
  // cell open the selector, STORY MODE lit and B.R. MODE dimmed.
  await press('g');
  await press('g');
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);
  // The select pad keeps every button the screens' word reads: each of
  // G/H/K/J picks its palette on the character select, not just G
  // confirming (HPA-765 review).
  await expect(pad).toHaveCount(8);
  for (const name of ['Punch', 'Kick', 'Hit Up', 'Throw'])
    await expect(
      page.locator('.touch-controls').getByRole('button', { name }),
    ).toBeVisible();

  // Escape on the mode step returns to the select screen; picking again
  // reopens the selector the same way. A failed Escape would leave the
  // selector up — the 'g' would confirm STORY and the next checks would
  // meet a lit header and, later, ROUTE 1's battle (500, not 200/470).
  await press('Escape');
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);

  // Enter confirms STORY MODE; the route step heads its boards with the
  // mode's small sign, lighting a band the mode step leaves dark.
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await press('d');
  await expect
    .poll(() => boards(ROUTE_RIGHT, ROUTE_LEFT), VIEW)
    .toBeGreaterThan(30);

  // Escape on the route step comes back to the modes — STORY lit again —
  // and the pick flips to B.R. MODE. If the Escape had done nothing the
  // same keys would land ROUTE 1's battle (500), not B.R. ZERO's (200).
  await press('Escape');
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  // B.R.'s routes rest on ZERO, ANOTHER dimmed.
  await confirmRoute(() => press('Enter'));
  await skipToBattle();
  // B.R. ZERO's opening brawl seats ZAKU first (200) and runs untimed.
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '200', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  // Session memory: the selector reopens on the last mode, B.R. lit —
  // and a B.R. remembered while STORY's route still defaults to ROUTE 1.
  await backToModeSelect();
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  // Back to STORY; ROUTE 2 (Hard) reaches the Sakuya duel (470), a timed
  // battle — a lapsed memory would land ROUTE 1's KAY duel (500) instead.
  await press('a');
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await press('d');
  await expect
    .poll(() => boards(ROUTE_RIGHT, ROUTE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await confirmRoute(() => press('Enter'));
  await skipToBattle();
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '470', {
    timeout: 30_000,
  });
  await expect(health).toContainText(/Time: \d/);

  // Direct canvas taps: a tap in the boards' gap is ignored, a tap on a
  // sign picks and confirms it like a button — B.R. then B.R. ANOTHER.
  await backToModeSelect();
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  // The gap tap lands ignored, proven before the next tap: STORY stays
  // lit over dimmed B.R. and no route header lights — a mistaken pick or
  // confirm would have flipped the boards or lit the header band.
  await tap(480, 394);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  expect(await lum('h', HEADER)).toBeLessThan(160);
  await tap(720, 300);
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await confirmRoute(() => tap(720, 400));
  await skipToBattle();
  // B.R. ANOTHER's brawl seats HISO first (480), also untimed.
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '480', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  expect(errors).toEqual([]);
});

// The four bosses (HPA-858) reach the same two signs, but confirm on that
// first step: STORY starts their own story, B.R. the generated route — no
// route substep ever shows, so while the selector is up the route step's
// header band must stay the mode step's dark backdrop, and it is not read
// once the arena renders.
test('bosses: B.R. MODE starts the generated route straight off, stage 1 twice native', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const {
    errors,
    player,
    opponent,
    health,
    press,
    lum,
    boards,
    tap,
    confirmDirect,
  } = await openArena(page);

  // Title → SINGLE → the grid: six rights and three downs put the cursor
  // on ZENKA (cell 6,3), whose pick opens the selector like any fighter's.
  await press('g');
  await press('g');
  for (const key of ['d', 'd', 'd', 'd', 'd', 'd', 's', 's', 's'])
    await press(key);
  await press('g');
  // STORY lit left over the dimmed B.R. board.
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);

  // A tap on the B.R. sign picks and confirms it, and a boss's confirm is
  // the start itself. confirmDirect reads the header band dark before the
  // tap and resumes sampling with no settle gap, so a route step could
  // not appear and leave unobserved in the old 150 ms blind window; the
  // band is sampled only while the select pad is still the eight
  // controls, never the arena's.
  await confirmDirect(() => tap(720, 300, 0), false);

  // The route's stage 1 seats ZENKA native (480) over the drawn pair's
  // first fighter KIKI at twice her native 490 — 980 — and the opener
  // header's time 0 runs untimed.
  await expect(player).toBeVisible();
  await expect(opponent).toBeVisible();
  await expect(player).toHaveAttribute('aria-valuemax', '480');
  await expect(opponent).toHaveAttribute('aria-valuemax', '980', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');
  expect(errors).toEqual([]);
});

test('bosses: STORY MODE keeps the boss’s own story at native seats', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const {
    errors,
    player,
    opponent,
    health,
    press,
    lum,
    boards,
    confirmDirect,
    skipToBattle,
  } = await openArena(page);

  // Title → SINGLE → ALPHA (cell 0,4): four downs, then her pick.
  await press('g');
  await press('g');
  for (const key of ['s', 's', 's', 's']) await press(key);
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);

  // Set the pick explicitly instead of trusting the fresh-page default —
  // right to B.R., back to STORY, lit again — then Enter confirms. A
  // boss's STORY confirm starts her story itself; skipToBattle then only
  // skips the story's own opening demo.
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('a');
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  // confirmDirect proves the selector left for her demo with the route
  // band never lit before skipToBattle sends its first demo-skip press —
  // a buggy route step would still be up with its band lit, and those
  // presses would confirm its default route into the same duel.
  await confirmDirect(() => press('Enter'), true);
  await skipToBattle();

  // Her own story opens on YO at native 480 — the boss route would seat
  // the drawn stage-1 pairs at twice native — and the duel is timed,
  // where a boss B.R. stage reads Unlimited.
  await expect(player).toHaveAttribute('aria-valuemax', '500');
  await expect(opponent).toHaveAttribute('aria-valuemax', '480', {
    timeout: 30_000,
  });
  await expect(health).toContainText(/Time: \d/);
  expect(errors).toEqual([]);
});

// The other two bosses confirm like the first pair — SHIN-Z straight into
// his generated route, DoraEmon into his own story — so all four take an
// automated direct choice, each to its expected battle HUD.
test('bosses: SHIN-Z starts B.R. straight off, DoraEmon his own story', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const {
    errors,
    boot,
    player,
    opponent,
    health,
    press,
    lum,
    boards,
    tap,
    confirmDirect,
    skipToBattle,
  } = await openArena(page);

  // Title → SINGLE → SHIN-Z (cell 1,4): one right, four downs, pick.
  await press('g');
  await press('g');
  await press('d');
  for (const key of ['s', 's', 's', 's']) await press(key);
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);

  // B.R. confirmed straight to the route's stage 1: SHIN-Z native (800)
  // over the drawn pair's first fighter feng at twice her native 470 —
  // 940 — and the donor header's time 0 runs untimed.
  await confirmDirect(() => tap(720, 300, 0), false);
  await expect(player).toBeVisible();
  await expect(opponent).toBeVisible();
  await expect(player).toHaveAttribute('aria-valuemax', '800');
  await expect(opponent).toHaveAttribute('aria-valuemax', '940', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  // DoraEmon on a fresh session — the reload drops the first leg's
  // selector memory and cursor with the page load. Title → SINGLE →
  // his cell (5,5): five rights, five downs, pick.
  await boot();
  await press('g');
  await press('g');
  for (const key of ['d', 'd', 'd', 'd', 'd', 's', 's', 's', 's', 's'])
    await press(key);
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);

  // Set the pick explicitly instead of trusting the fresh-page default —
  // right to B.R., back to STORY, lit again — then Enter confirms.
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('a');
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);

  // STORY confirmed straight to his story's opening demo — the selector
  // proven gone before the demo-skip presses — and his own story opens
  // on GIANT at native 550 over DoraEmon's native 600, timed, where a
  // boss B.R. stage would seat doubles and read Unlimited.
  await confirmDirect(() => press('Enter'), true);
  await skipToBattle();
  await expect(player).toHaveAttribute('aria-valuemax', '600');
  await expect(opponent).toHaveAttribute('aria-valuemax', '550', {
    timeout: 30_000,
  });
  await expect(health).toContainText(/Time: \d/);
  expect(errors).toEqual([]);
});
