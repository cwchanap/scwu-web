import { expect, test, type Locator, type Page } from '@playwright/test';

// SHUWA (HPA-1304), the one authored fighter: his pack, drawings and
// placement are exported apart from the source roster, so this journey
// proves the production bundle seats and plays him through the Menu's own
// controls — practice in 1P, then Vs. CPU in 2P. His rules are the Vitest
// suite's (shuwa.test.ts, exporter.test.ts); here only the browser path.

// Into a practice battle, as smoke.spec.ts boots: buttons skip T2, pick
// VS single, both cursors rest on Ryuko and start.
const bootIntoBattle = async (page: Page) => {
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  const health = page.locator('[aria-label="Match health"]');
  await expect(async () => {
    await page.reload();
    await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
      timeout: 30_000,
    });
    for (const key of ['g', 's', 'g', 'g', 'g']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(80);
    }
    await expect(health).toContainText('510 510', { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  return { menu, failed, health };
};

// Steps a seat until its card names the fighter. Each step resets the
// match and the buttons stay disabled while it loads, so the click itself
// waits; the bound is the roster, which the step wraps.
const stepTo = async (seat: Locator, step: Locator, name: string) => {
  for (let i = 0; i < 46 && (await seat.textContent()) !== name; i++)
    await step.click();
  await expect(seat).toHaveText(name);
};

test('SHUWA fights in practice and as the Vs. CPU opponent', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  const { menu, failed, health } = await bootIntoBattle(page);
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  const seats = dialog.locator('.card .pickname');
  const player = page.getByRole('meter', { name: 'Player health' });
  const opponent = page.getByRole('meter', { name: 'Opponent health' });

  // Practice: he sits between AYA and DoraEmon, so stepping back from
  // Ryuko reaches him in four (TRAINING, RARIO, DoraEmon, SHUWA) — each
  // one a pack fetch, fewer than the forty-odd forward. His 480 life
  // (Ryuko's 510 is the other seat) is the sign his own data loaded.
  await menu.click();
  await stepTo(
    seats.nth(0),
    dialog.getByRole('button', { name: 'Previous 1P fighter' }),
    'SHUWA',
  );
  await expect(player).toHaveText('480', { timeout: 30_000 });
  await expect(opponent).toHaveText('510');
  await expect(failed).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('shuwa-menu.png') });

  // A punch from neutral: once he stands idle, G takes him into a move.
  // A jab is short and the DOM reports per frame, so a missed sample
  // presses again rather than failing.
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await expect(health).toContainText('Action: idle', { timeout: 20_000 });
  await expect(async () => {
    await page.keyboard.press('g');
    await expect(health).not.toContainText('Action: idle', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.screenshot({ path: test.info().outputPath('shuwa-practice.png') });

  // Vs. CPU: Ryuko back in 1P, SHUWA the CPU in 2P. Life reads per seat,
  // so 510 then 480 shows the pair went the right way round.
  await menu.click();
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
