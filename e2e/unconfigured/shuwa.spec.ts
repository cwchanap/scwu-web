import { expect, test, type Locator, type Page } from '@playwright/test';

// SHUWA (HPA-1304, HPA-1305, HPA-1308), the one authored fighter: his pack,
// drawings and placement are exported apart from the source roster, so this
// journey proves the production bundle seats and plays him — picked on the
// select screen's seat 42 in a non-default scheme for practice in 1P, then
// through the Menu's own controls as the Vs. CPU 2P. His rules are the Vitest
// suite's (shuwa.test.ts, exporter.test.ts); here only the browser path.

// Into a practice battle, as smoke.spec.ts boots: buttons skip T2 and pick
// VS single, then `picks` drives the select screen and the battle starts
// once the health line reads `life`.
const bootIntoBattle = async (page: Page, picks: string[], life: string) => {
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  const health = page.locator('[aria-label="Match health"]');
  await expect(async () => {
    await page.reload();
    await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
      timeout: 30_000,
    });
    for (const key of ['g', 's', 'g', ...picks]) {
      if (key === 'hover')
        await page.screenshot({
          path: test.info().outputPath('shuwa-select.png'),
        });
      else await page.keyboard.press(key);
      await page.waitForTimeout(80);
    }
    await expect(health).toContainText(life, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  return { menu, failed, health };
};

// His scheme 4 (Violet, chosen with J): two of his suit's oranges as it
// recolours them. Seen on the canvas, the scheme reached the battle; the
// lamp's blink below then checks it swaps on this recoloured drawing.
const VIOLETS = [0x7830b0, 0xb868e8];
const violets = (page: Page) =>
  page.evaluate(
    (VIOLETS) =>
      // A WebGL canvas reads back only while its frame is drawn.
      new Promise<number>((done) =>
        requestAnimationFrame(() => {
          const game = document.querySelector('canvas')!;
          const copy = document.createElement('canvas');
          [copy.width, copy.height] = [game.width, game.height];
          const context = copy.getContext('2d', {
            willReadFrequently: true,
          })!;
          context.drawImage(game, 0, 0);
          const { data } = context.getImageData(0, 0, copy.width, copy.height);
          let count = 0;
          for (let i = 0; i < data.length; i += 4) {
            const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
            if (VIOLETS.includes(c)) count++;
          }
          done(count);
        }),
      ),
    VIOLETS,
  );

// Steps a seat until its card names the fighter. Each step resets the
// match and the buttons stay disabled while it loads, so the click itself
// waits; the bound is the roster, which the step wraps.
const stepTo = async (seat: Locator, step: Locator, name: string) => {
  for (let i = 0; i < 46 && (await seat.textContent()) !== name; i++)
    await step.click();
  await expect(seat).toHaveText(name);
};

// SHUWA's chest lamp (HPA-1305) on the drawn canvas: the page copies each
// frame as it renders, so the 250 ms blink can't fall between two polls.
// It counts the lamp's blues and their reds, and for each change between
// lit and unlit compares the two frames around the lamp: when nothing else
// in that window changed (the drawing held), only blues swapped for reds,
// the swap is seen. Resolves after `frames` frames, or once `until` holds:
// four flips (red and blue in turn, twice) and a clean swap.
const BLUES = [0x68c8f8, 0x1870d8, 0x102868];
const REDS = [0xf88088, 0xe82028, 0xa81018];
type Lamp = {
  frames: number;
  blue: number;
  red: number;
  flips: number;
  swapped: boolean;
};
const watchLamp = (page: Page, frames: number, until?: 'blink') =>
  page.evaluate(
    ({ frames, until, BLUES, REDS }) =>
      new Promise<Lamp>((done) => {
        const game = document.querySelector('canvas')!;
        const copy = document.createElement('canvas');
        [copy.width, copy.height] = [game.width, game.height];
        const context = copy.getContext('2d', { willReadFrequently: true })!;
        const seen: Lamp = {
          frames: 0,
          blue: 0,
          red: 0,
          flips: 0,
          swapped: false,
        };
        let last: { data: Uint8ClampedArray; lit: boolean } | undefined;
        const color = (d: Uint8ClampedArray, i: number) =>
          (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        const frame = () => {
          context.drawImage(game, 0, 0);
          const { data } = context.getImageData(0, 0, copy.width, copy.height);
          let [blue, red] = [0, 0];
          let [x0, y0, x1, y1] = [copy.width, copy.height, 0, 0];
          for (let i = 0; i < data.length; i += 4) {
            const c = color(data, i);
            if (BLUES.includes(c)) blue++;
            else if (REDS.includes(c)) red++;
            else continue;
            const [x, y] = [
              (i / 4) % copy.width,
              Math.floor(i / 4 / copy.width),
            ];
            [x0, y0, x1, y1] = [
              Math.min(x0, x),
              Math.min(y0, y),
              Math.max(x1, x),
              Math.max(y1, y),
            ];
          }
          seen.frames++;
          if (blue) seen.blue++;
          if (red) seen.red++;
          const lit = red > 0;
          if (last && last.lit !== lit && blue + red) {
            seen.flips++;
            let [swaps, others] = [0, 0];
            for (
              let y = Math.max(0, y0 - 24);
              y <= Math.min(copy.height - 1, y1 + 24);
              y++
            )
              for (
                let x = Math.max(0, x0 - 24);
                x <= Math.min(copy.width - 1, x1 + 24);
                x++
              ) {
                const i = (y * copy.width + x) * 4;
                const [was, now] = [color(last.data, i), color(data, i)];
                if (was === now) continue;
                const [blueOf, redOf] = lit ? [was, now] : [now, was];
                const k = BLUES.indexOf(blueOf);
                if (k >= 0 && REDS[k] === redOf) swaps++;
                else others++;
              }
            seen.swapped ||= swaps > 0 && others === 0;
          }
          last = { data, lit };
          const blinked = seen.flips >= 4 && seen.swapped;
          if (seen.frames >= frames || (until === 'blink' && blinked))
            done(seen);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
    { frames, until, BLUES, REDS },
  );

test('SHUWA fights in practice and as the Vs. CPU opponent', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  // Practice: the 1P cursor leaves Ryuko's cell up, wrapping to the
  // bottom row, and two right reach seat 42, where his portrait and name
  // stand (captured). J picks him in scheme 4; G seats Ryuko in 2P. His 480
  // life (Ryuko's 510 is the other seat) is the sign his own data loaded.
  const { menu, failed, health } = await bootIntoBattle(
    page,
    ['w', 'd', 'd', 'hover', 'j', 'g'],
    '480 510',
  );
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  const seats = dialog.locator('.card .pickname');
  const player = page.getByRole('meter', { name: 'Player health' });
  const opponent = page.getByRole('meter', { name: 'Opponent health' });
  await expect(player).toHaveText('480');
  await expect(opponent).toHaveText('510');
  await expect(failed).toBeHidden();
  await menu.click();
  await expect(seats.nth(0)).toHaveText('SHUWA');
  await page.screenshot({ path: test.info().outputPath('shuwa-menu.png') });

  // A punch from neutral: once he stands idle, G takes him into a move.
  // The jab lasts about 280 ms, less than a loaded runner's round trip
  // from the press to a DOM read, so the page itself records a report
  // that left idle rather than a poll that may only arrive after it. A
  // press the game drops is pressed again rather than failing.
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await expect(health).toContainText('Action: idle', { timeout: 20_000 });
  expect(await violets(page), 'his scheme 4 suit').toBeGreaterThan(0);
  const moved = await health.evaluateHandle((el) => {
    const seen = { yes: false };
    new MutationObserver(() => {
      seen.yes ||= !el.textContent?.includes('Action: idle');
    }).observe(el, { subtree: true, childList: true, characterData: true });
    return seen;
  });
  await expect(async () => {
    await page.keyboard.press('g');
    await expect
      .poll(() => moved.evaluate((s) => s.yes), { timeout: 1_000 })
      .toBe(true);
  }).toPass({ timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('shuwa-practice.png') });

  // The lamp: blue at full life in every frame. Under the low-life line
  // (144 of 480) the practice Low health hold puts him at 143, and it
  // blinks red, the drawing's lamp blues swapped for reds and nothing
  // else around it changed.
  await expect(health).toContainText('Action: idle', { timeout: 20_000 });
  const full = await watchLamp(page, 20);
  expect(full).toMatchObject({ blue: full.frames, red: 0 });
  await menu.click();
  await dialog.getByLabel('Low health').check();
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await expect(player).toHaveText('143', { timeout: 10_000 });
  const low = await watchLamp(page, 600, 'blink');
  expect(low.blue, 'lamp blue between blinks').toBeGreaterThan(0);
  expect(low.red, 'lamp lit red').toBeGreaterThan(0);
  expect(low.flips, 'red and blue in turn, twice over').toBeGreaterThanOrEqual(
    4,
  );
  expect(low.swapped, 'only the lamp changed colour').toBe(true);
  await page.screenshot({ path: test.info().outputPath('shuwa-lamp.png') });
  await menu.click();
  await dialog.getByLabel('Low health').uncheck();

  // Vs. CPU: Ryuko back in 1P, SHUWA the CPU in 2P. Life reads per seat,
  // so 510 then 480 shows the pair went the right way round.
  await dialog.getByLabel('Opponent').selectOption('vsCpu');
  await stepTo(
    seats.nth(0),
    dialog.getByRole('button', { name: 'Next 1P fighter' }),
    'Ryuko',
  );
  await stepTo(
    seats.nth(1),
    dialog.getByRole('button', { name: 'Previous 2P fighter' }),
    'SHUWA',
  );
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await expect(opponent).toHaveText('480', { timeout: 30_000 });
  await expect(player).toHaveText('510');
  await expect(failed).toBeHidden();

  // The match plays on: the round clock, which starts after the intro,
  // counts down with no input from either side.
  const clock = async () =>
    Number(/Time: (\d+)/.exec((await health.textContent()) ?? '')?.[1]);
  const start = await clock();
  await expect.poll(clock, { timeout: 30_000 }).toBeLessThan(start);
  await expect(failed).toBeHidden();
  expect(errors).toEqual([]);
});
