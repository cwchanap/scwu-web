import { expect, test, type Page } from '@playwright/test';

// The quick mode select (HPA-765): SINGLE's story pick opens the authored
// two-step selector — STORY/B.R. sign boards, then the mode's routes — and a
// confirmed route starts in the original's demos and battles. A boss's STORY
// sign still confirms on that first step, starting her story; her B.R. now
// opens the route step too (HPA-1251), two boards — ANOTHER, LONG — where a
// regular fighter's offers three. The boards
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
// scene's pixels (select.ts signRow/HEADER_SPOT at any pick's scale):
// the mode step's two boards keep HPA-765's 300/660 spots at 0.8×/0.85×
// hanging at top 250, a two-board route step (a boss's, or STORY's) the
// same spots at top 285, and a regular B.R. route step's three boards
// spread their centres 240/480/720 at ≈0.52×/≈0.57× (HPA-1251) — so the
// middle board is ANOTHER and the right one LONG. The mode's smaller
// header sits at (414..546, 40..144).
const MODE_LEFT: Rect = { x: 160, y: 320, w: 180, h: 140 };
const MODE_RIGHT: Rect = { x: 620, y: 320, w: 180, h: 140 };
const ROUTE_LEFT: Rect = { x: 160, y: 390, w: 180, h: 130 };
const ROUTE_RIGHT: Rect = { x: 620, y: 390, w: 180, h: 130 };
const B3_LEFT: Rect = { x: 160, y: 300, w: 160, h: 130 };
const B3_MID: Rect = { x: 400, y: 300, w: 160, h: 130 };
const B3_RIGHT: Rect = { x: 640, y: 300, w: 160, h: 130 };
const HEADER: Rect = { x: 440, y: 65, w: 80, h: 65 };
// The route steps' cursor bands — the bobbing 1P arrow rides 35px lower
// than on the mode step (boards at top 285, not 250). ROW3 covers the
// three-sign row (centres 240/480/720), ROW2 the boss two-sign row
// (300/660) with 'c' the plain gap between its two boards.
const ROW3: Record<'a' | 'b' | 'c', Rect> = {
  a: { x: 200, y: 240, w: 80, h: 40 },
  b: { x: 440, y: 240, w: 80, h: 40 },
  c: { x: 680, y: 240, w: 80, h: 40 },
};
const ROW2: Record<'a' | 'b' | 'c', Rect> = {
  a: { x: 260, y: 240, w: 80, h: 40 },
  b: { x: 620, y: 240, w: 80, h: 40 },
  c: { x: 440, y: 240, w: 80, h: 40 },
};
// The LONG ally's initial trace on the fight's canvas (HPA-1251): the
// first-tick Dora is short, so his blue sprite fills the low 'ally' band
// at his stand and never the 'tall' one above it — which stays clear
// until the first hostile rises from his entry door (blue too, and tall),
// so the boss route's ally-less opening can't fake the probe and the
// hostile's emergence can't read as the ally.
const ALLY: Record<'ally' | 'tall', Rect> = {
  ally: { x: 690, y: 505, w: 115, h: 140 },
  tall: { x: 690, y: 300, w: 115, h: 170 },
};
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
  // An optional clip (one rect covering all given ones) composites only
  // that region — the ally watch uses it to fit many more samples into
  // the fight's first second under runner load.
  const sample = async (rects: Record<string, Rect>, clip?: Rect) => {
    const box = (await canvas.boundingBox())!;
    const shot = clip
      ? await page.screenshot({
          clip: {
            x: box.x + (clip.x / 960) * box.width,
            y: box.y + (clip.y / 720) * box.height,
            width: (clip.w / 960) * box.width,
            height: (clip.h / 720) * box.height,
          },
        })
      : await page.screenshot();
    // Where the image starts, in page CSS pixels (0 for a full capture,
    // the clip's own corner otherwise) — rect positions subtract it.
    const origin = clip
      ? {
          x: box.x + (clip.x / 960) * box.width,
          y: box.y + (clip.y / 720) * box.height,
        }
      : { x: 0, y: 0 };
    return page.evaluate(
      async ({ data, rects, box, origin, ratio }) => {
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
          { r: number; g: number; b: number; lum: number; blue: number }
        > = {};
        for (const [name, rect] of Object.entries(rects)) {
          const x = Math.round(
            (box.x + (rect.x / 960) * box.width - origin.x) * ratio,
          );
          const y = Math.round(
            (box.y + (rect.y / 720) * box.height - origin.y) * ratio,
          );
          const w = Math.max(1, Math.round((rect.w / 960) * box.width * ratio));
          const h = Math.max(
            1,
            Math.round((rect.h / 720) * box.height * ratio),
          );
          const d = ctx.getImageData(x, y, w, h).data;
          let r = 0,
            g = 0,
            b = 0,
            blue = 0;
          for (let i = 0; i < d.length; i += 4) {
            r += d[i];
            g += d[i + 1];
            b += d[i + 2];
            if (d[i + 2] - d[i] > 40) blue++;
          }
          const n = d.length / 4;
          out[name] = {
            r: r / n,
            g: g / n,
            b: b / n,
            lum: (r + g + b) / (3 * n),
            blue: blue / n,
          };
        }
        return out;
      },
      {
        data: 'data:image/png;base64,' + shot.toString('base64'),
        rects,
        box,
        origin,
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
  // The KGT 1P cursor bobs just above the pick's board top-centre and is
  // the only thing drawing there — the bands sit over the dimmed select
  // screen, sampled in one screenshot so their background difference is
  // fixed. The side it brightens follows the pick, so a signed flip is
  // its appearance and placement in one probe.
  const cursorOver = async (side: 'l' | 'r') => {
    const s = await sample({
      l: { x: 260, y: 205, w: 80, h: 45 },
      r: { x: 620, y: 205, w: 80, h: 45 },
    });
    return side === 'l' ? s.l.lum - s.r.lum : s.r.lum - s.l.lum;
  };
  // The route steps' cursor: only the pick's band holds the bobbing
  // arrow, the others plain dim backdrop, so the pick's band must
  // out-shine both others.
  const routeCursorOver = async (
    bands: Record<'a' | 'b' | 'c', Rect>,
    pick: 'a' | 'b' | 'c',
  ) => {
    const s = await sample(bands);
    const others = (['a', 'b', 'c'] as const).filter((k) => k !== pick);
    return Math.min(...others.map((k) => s[pick].lum - s[k].lum));
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
  // With `ally`, every screenshot this helper already takes — the
  // pre-input read and each poll iteration, including the one that
  // detects the flip — also records the two ally bands: a separate
  // probe started after the poll returns would first sample past the
  // first hostile's rise (an irreversible window), and a parallel
  // capture stream would contend with this one for the same page's
  // serialized screenshots under runner load. The frames carry plain
  // blue fractions for the caller's discriminator.
  const confirmRoute = async (send: () => Promise<void>, ally?: boolean) => {
    const rects: Record<string, Rect> = ally
      ? { h: HEADER, ally: ALLY.ally, tall: ALLY.tall }
      : { h: HEADER };
    const s0 = await sample(rects);
    const h0 = s0.h.lum;
    const frames: { ally: number; tall: number }[] = ally
      ? [{ ally: s0.ally.blue, tall: s0.tall.blue }]
      : [];
    await send();
    await expect
      .poll(
        async () => {
          const s = await sample(rects);
          if (ally) frames.push({ ally: s.ally.blue, tall: s.tall.blue });
          return Math.abs(s.h.lum - h0);
        },
        {
          timeout: 15_000,
        },
      )
      .toBeGreaterThan(25);
    return frames;
  };
  // A boss's confirm starts the story or generated route itself, so the
  // route step's small header sign must never light. The band is read
  // dark before the confirm and then sampled with no blind gap after it.
  // A route has no demo: the pad stops being the eight select controls
  // only when the battle renders, and the pad re-check after each sample
  // drops one that landed mid-transition — the band is never read once
  // the arena's pad shows. A story keeps the eight controls through its
  // demo, so the mode boards are the selector's trace instead: while they
  // draw the band must stay dark — a buggy route step lights the band and
  // holds its own boards lit over the left one's spot, so it fails the
  // check without reaching the exit. Once the boards leave the band reads
  // the demo's own art (a story's panels fill the top of the screen), so
  // only their leaving proves the direct exit. Demo-skip presses wait for
  // all of that.
  const confirmDirect = async (send: () => Promise<void>, demo: boolean) => {
    expect(await lum('h', HEADER), 'boss header before confirm').toBeLessThan(
      160,
    );
    const deadline = Date.now() + 120_000;
    if (!demo) {
      await send();
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
    let demoLoaded = false;
    const onResponse = (res: { url(): string; ok(): boolean }) => {
      if (res.url().includes('demo-3.bin') && res.ok()) demoLoaded = true;
    };
    page.on('response', onResponse);
    try {
      await send();
      let exited = false;
      while (Date.now() < deadline) {
        if (demoLoaded) {
          exited = true;
          break;
        }
        const s = await sample({ h: HEADER, l: MODE_LEFT });
        if (demoLoaded || s.l.lum <= 170) {
          exited = true;
          break;
        }
        expect(s.h.lum, 'boss header while the mode boards draw').toBeLessThan(
          160,
        );
        await page.waitForTimeout(150);
      }
      expect(exited, 'mode boards leave after a boss STORY confirm').toBe(true);
      await expect
        .poll(() => lum('l', MODE_LEFT), VIEW)
        .toBeLessThanOrEqual(170);
    } finally {
      page.off('response', onResponse);
    }
  };
  // The tail of the ally capture: from after the route step's flip
  // through skipToBattle. confirmRoute's own ally-watched screenshots
  // cover the confirm itself; this clipped loop extends the same frames
  // over the fight's first seconds — the composite costs a fraction of
  // a full frame, so scheduling delays leave more samples inside the
  // window — and the caller asserts the unchanged discriminator over
  // the whole span. stop() ends the loop; it dies quietly if the page
  // goes away, where the test body fails on its own reads.
  const watchAlly = () => {
    const frames: { ally: number; tall: number }[] = [];
    let live = true;
    const loop = (async () => {
      while (live) {
        try {
          const s = await sample(
            ALLY,
            // One clip covering both bands: the screenshot composites only
            // this strip, so each sample costs a fraction of a full-frame
            // capture and scheduling delays leave more of them inside the
            // window.
            {
              x: ALLY.ally.x,
              y: ALLY.tall.y,
              w: ALLY.ally.w,
              h: ALLY.ally.y + ALLY.ally.h - ALLY.tall.y,
            },
          );
          frames.push({ ally: s.ally.blue, tall: s.tall.blue });
        } catch {
          break; // page gone — the test body fails on its own reads
        }
        await new Promise((r) => setTimeout(r, 40));
      }
    })();
    return {
      frames,
      stop: async () => {
        live = false;
        await loop;
      },
    };
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
    await dialog
      .getByRole('button', { name: 'Character select', exact: true })
      .click();
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
    cursorOver,
    routeCursorOver,
    tap,
    confirmRoute,
    confirmDirect,
    skipToBattle,
    backToModeSelect,
    watchAlly,
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
  // Three boards now (HPA-1251): the middle one is ANOTHER, its box
  // centred on 480 at top 285 — the old right-hand spot holds LONG.
  await confirmRoute(() => tap(480, 400));
  await skipToBattle();
  // B.R. ANOTHER's brawl seats G SUNEO first (500) out of the approved
  // lineup table, also untimed.
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '500', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  expect(errors).toEqual([]);
});

// The regular B.R. route step offers three signs (HPA-1251): B.R. ZERO,
// ANOTHER and the blank LONG board. The keyboard walk lights each board
// under its arrow and a tap on LONG's drawn box starts the twelve-enemy
// brawl — the touch route start on the third sign (the remembered tap
// then starts ANOTHER). The brawl's first-tick Dora ally draws no bar
// (his donated slot carries no life-bar flag) — his sprite is the ally's
// visible trace, probed at the fight's first second; the DOM meters hold
// the initial fighter and first enemy.
test('regular B.R.: three signs walk to a tapped LONG, then a remembered tap to ANOTHER', async ({
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
    routeCursorOver,
    tap,
    confirmRoute,
    skipToBattle,
    backToModeSelect,
    watchAlly,
  } = await openArena(page);

  // Title → SINGLE → Ryuko's cell opens the selector; once STORY MODE
  // has drawn (the pick's own closing wait runs first — keys before it
  // are cleared), right to B.R. and Enter opens its three-sign route
  // step, ZERO picked over ANOTHER.
  await press('g');
  await press('g');
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await expect.poll(() => boards(B3_LEFT, B3_MID), VIEW).toBeGreaterThan(30);
  await expect.poll(() => routeCursorOver(ROW3, 'a'), VIEW).toBeGreaterThan(5);

  // Right twice walks ANOTHER then LONG, each board lighting under the
  // arrow as the previous dims.
  await press('d');
  await expect.poll(() => boards(B3_MID, B3_LEFT), VIEW).toBeGreaterThan(30);
  await expect.poll(() => routeCursorOver(ROW3, 'b'), VIEW).toBeGreaterThan(5);
  await press('d');
  await expect.poll(() => boards(B3_RIGHT, B3_MID), VIEW).toBeGreaterThan(30);
  await expect.poll(() => routeCursorOver(ROW3, 'c'), VIEW).toBeGreaterThan(5);

  // LONG confirmed by touch: a tap on its drawn box — the blank board's
  // centre at 720, the spot the walk's arrow sits over — picks and
  // confirms it like a button. The keyboard confirm of a remembered
  // regular LONG stays in the next test. The twelve-enemy brawl on
  // Sakura Street: SWW first (460), untimed — Ryuko's 510 bar beside it.
  // The ally's own initial trace, captured while the confirm lands and
  // carried through skipToBattle: confirmRoute(…, true) records the ally
  // bands on its own pre-input read and every header-poll screenshot
  // (the flip-detecting frame included), and watchAlly extends the same
  // frames over the fight's first second however slowly the poll
  // returned. Every pre-battle frame fails the signature (the
  // selector's own right half is blue, so its tall band reads high),
  // and so do the fight's later frames once the first hostile — blue
  // too, and tall — rises out of his door: a missing ally can't fake
  // the probe, and neither can a sample that arrives after him. No
  // combat loop, no production API, no ally bar read (his donated slot
  // carries none).
  const frames = await confirmRoute(() => tap(720, 400), true);
  const tail = watchAlly();
  try {
    await skipToBattle();
  } finally {
    await tail.stop();
  }
  const seen = frames.concat(tail.frames);
  expect(
    seen.some((f) => f.ally > 0.08 && f.tall < 0.03),
    `ally sprite in ${seen.length} captured frames: ${JSON.stringify(seen)}`,
  ).toBe(true);
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '460', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  // Session memory: the selector reopens on B.R., whose route step
  // remembers LONG — lit, arrow over it. The reopen rides the pick's
  // closing wait, which clears input, so the wait for it is action-free:
  // the lit B.R. board's own brightness (a character grid never reads
  // that bright — the mode step only) tells the step is up and taking
  // input, and ONE Enter then opens the route step. A tap on the middle
  // board confirms ANOTHER through the same geometry the walk used.
  await backToModeSelect();
  await expect.poll(() => lum('r', MODE_RIGHT), VIEW).toBeGreaterThan(170);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await expect.poll(() => boards(B3_RIGHT, B3_MID), VIEW).toBeGreaterThan(30);
  await expect.poll(() => routeCursorOver(ROW3, 'c'), VIEW).toBeGreaterThan(5);
  await confirmRoute(() => tap(480, 400));
  await skipToBattle();
  // B.R. ANOTHER's brawl seats G SUNEO first (500), also untimed.
  await expect(player).toHaveAttribute('aria-valuemax', '510');
  await expect(opponent).toHaveAttribute('aria-valuemax', '500', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');

  expect(errors).toEqual([]);
});

// Remembered routes ride value, not index (HPA-1251): a regular LONG
// remembered on the three-sign step resolves to the boss route step's own
// second board — the same two signs ANOTHER shares — instead of an
// out-of-range index, and Enter there starts the boss's twelve-enemy LONG:
// no ally, twelve tough seats.
test('regular→boss: the remembered LONG lands on the boss route step', async ({
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
    routeCursorOver,
    tap,
    confirmRoute,
    skipToBattle,
    backToModeSelect,
  } = await openArena(page);

  // Ryuko's B.R. route step: right, right to LONG, Enter starts it —
  // the keyboard confirm (the previous test taps the same sign). SWW
  // first (460), untimed. STORY draws first; the pick's closing wait
  // clears earlier keys.
  await press('g');
  await press('g');
  await press('g');
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await press('d');
  await press('d');
  await expect.poll(() => boards(B3_RIGHT, B3_MID), VIEW).toBeGreaterThan(30);
  await confirmRoute(() => press('Enter'));
  await skipToBattle();
  await expect(opponent).toHaveAttribute('aria-valuemax', '460', {
    timeout: 30_000,
  });

  // Back out and pick ZENKA on the same session — the selector reopens
  // on Ryuko's mode step with B.R. still lit (the remembered mode; the
  // poll also waits out the pick's own hundred-tick closing wait before
  // anything else is pressed); Escape to the grid and walk to ZENKA
  // (cell 6,3), whose pick opens the boss selector on the same session.
  await backToModeSelect();
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await press('Escape');
  for (const key of ['d', 'd', 'd', 'd', 'd', 'd', 's', 's', 's'])
    await press(key);
  await press('g');
  // ZENKA's selector opens on the remembered B.R. — its lit board's own
  // brightness is the action-free readiness check (a character grid never
  // reads that bright, and while it holds the pick's closing wait may
  // still be draining input), so the ONE Enter below always lands on the
  // mode step. Her route step then opens on the remembered LONG.
  await expect.poll(() => lum('r', MODE_RIGHT), VIEW).toBeGreaterThan(170);
  await press('Enter');
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  // The boss step resolves the remembered LONG onto its own second
  // board — lit under the arrow, ANOTHER dimmed beside it.
  await expect
    .poll(() => boards(ROUTE_RIGHT, ROUTE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await expect.poll(() => routeCursorOver(ROW2, 'b'), VIEW).toBeGreaterThan(5);

  // A tap on LONG's drawn box — the blank right board's centre at 660,
  // the spot the arrow sits over — confirms it: the boss step's touch
  // route start (the keyboard confirms on this step take ANOTHER in the
  // bosses' own tests). ZENKA's LONG brawl — no ally, twelve tough
  // enemies, ERUS first at twice his native 450 — 900 — untimed.
  await confirmRoute(() => tap(660, 400));
  await skipToBattle();
  await expect(player).toHaveAttribute('aria-valuemax', '480');
  await expect(opponent).toHaveAttribute('aria-valuemax', '900', {
    timeout: 30_000,
  });
  await expect(health).toContainText('Time: Unlimited');
  expect(errors).toEqual([]);
});

// The four bosses (HPA-858) joined the selector with a direct B.R. start;
// HPA-1251 keeps their STORY confirm on the first step — while the
// selector is up after it the route step's header band must stay the mode
// step's dark backdrop, and it is not read once the arena renders — but
// routes her B.R. through the two-sign step like any fighter's.
test('bosses: B.R. MODE opens the two-sign route step, ANOTHER starts stage 1 twice native', async ({
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
    cursorOver,
    tap,
    confirmRoute,
    skipToBattle,
  } = await openArena(page);

  // Title → SINGLE → the grid: six rights and three downs put the cursor
  // on ZENKA (cell 6,3), whose pick opens the selector like any fighter's.
  await press('g');
  await press('g');
  for (const key of ['d', 'd', 'd', 'd', 'd', 'd', 's', 's', 's'])
    await press(key);
  await press('g');
  // STORY lit left over the dimmed B.R. board, the 1P cursor over it.
  await expect.poll(() => lum('l', MODE_LEFT), VIEW).toBeGreaterThan(170);
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(40);
  await expect.poll(() => cursorOver('l'), VIEW).toBeGreaterThan(5);

  // A tap on the B.R. sign picks and confirms it, and the confirm opens
  // the boss route step (HPA-1251): two boards — ANOTHER picked, LONG
  // dimmed — under the lit mode header, where a regular fighter's offers
  // three. The header lighting after the tap proves the step, and Enter
  // then confirms ANOTHER off it.
  await tap(720, 300, 0);
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await expect
    .poll(() => boards(ROUTE_LEFT, ROUTE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  await confirmRoute(() => press('Enter'));
  await skipToBattle();

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
    cursorOver,
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
  // right to B.R., back to STORY, lit again — then Enter confirms. The
  // cursor bob follows each flip; a boss's STORY confirm starts her story
  // itself; skipToBattle then only skips the story's own opening demo.
  await press('d');
  await expect
    .poll(() => boards(MODE_RIGHT, MODE_LEFT), VIEW)
    .toBeGreaterThan(30);
  await expect.poll(() => cursorOver('r'), VIEW).toBeGreaterThan(5);
  await press('a');
  await expect
    .poll(() => boards(MODE_LEFT, MODE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  await expect.poll(() => cursorOver('l'), VIEW).toBeGreaterThan(5);
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

// The other two bosses take the same automated choices — SHIN-Z's B.R.
// through his two-sign route step to ANOTHER (by tap, the touch route
// start), DoraEmon straight into his own story — each to its expected
// battle HUD.
test('bosses: SHIN-Z routes to B.R. ANOTHER, DoraEmon his own story', async ({
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
    confirmRoute,
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

  // B.R. opens his two-sign route step (HPA-1251), then a tap on
  // ANOTHER's drawn box confirms it — the touch route start — and the
  // route's stage 1 seats SHIN-Z native (800) over the drawn pair's
  // first fighter feng at twice her native 470 — 940 — the donor
  // header's time 0 running untimed.
  await tap(720, 300, 0);
  await expect.poll(() => lum('h', HEADER), VIEW).toBeGreaterThan(160);
  await expect
    .poll(() => boards(ROUTE_LEFT, ROUTE_RIGHT), VIEW)
    .toBeGreaterThan(30);
  await confirmRoute(() => tap(300, 400));
  await skipToBattle();
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
