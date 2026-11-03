import { expect, test } from '@playwright/test';

// The one journey that must never break: the built app boots, loads its data
// and art from the asset base, and hands the player a ready arena. Match rules
// are deterministic and covered by the Vitest suite, not here.
test('boots into a ready arena', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // Built with VITE_ASSET_BASE, every texture request is a real CORS read of
  // the R2 bucket (loader.crossOrigin 'anonymous'), so this also checks the
  // bucket's policy (scripts/r2_cors.json) is live. Unset, art is same-origin.
  await page.goto('/');

  await expect(page.getByRole('application').locator('canvas')).toBeVisible();
  // Disabled until the scene has loaded; the overlay replaces "Loading" on
  // error. Wait for either so a failed load names the overlay, not a Menu
  // timeout.
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  await expect(menu).toBeEnabled();

  const health = page.locator('[aria-label="Match health"]');
  // Through the title menu to a battle: a button skips T2 to its menu, down
  // picks VS single, a button chooses, and both select cursors rest on
  // Ryuko, so two more buttons start Ryuko vs Ryuko. The screens draw no
  // DOM to wait on, and presses landing on one 10 ms tick collapse, so the
  // run is retried from a reload — which also reseats the menu cursor —
  // until the battle's life meters announce it: Zoma's 490 becomes a
  // second Ryuko's 510.
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
  // begin() clears the held keys, so the direction goes down only now — a
  // held key walks her, taking the action off 'idle'; the menu's modal then
  // freezes it mid-walk, so an R that reached the window handler would show
  // a reset ('walk' → 'idle').
  await page.keyboard.down('d');
  await expect(health).toContainText(/Action: (back)?walk/);

  await menu.click();
  await page.keyboard.up('d');
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  // m-auto centers the modal at desktop and mobile sizes rather than
  // trusting the UA margin, which a base reset would zero.
  const centered = async () => {
    const box = (await dialog.boundingBox())!;
    const { width, height } = page.viewportSize()!;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - height / 2)).toBeLessThan(2);
  };
  await centered();
  await page.setViewportSize({ width: 390, height: 844 });
  await centered();
  await page.setViewportSize({ width: 1280, height: 720 });

  const opponent = dialog.getByLabel('Opponent');
  await expect(opponent).toBeEnabled();
  await expect(
    opponent.locator('option', { hasText: 'Vs. CPU' }),
  ).toBeAttached();
  // A partner pick while practice runs doesn't reset, keeping 'walk'.
  await opponent.selectOption('guard');

  // Keys go to a button: the scene's keydown ignores INPUT/SELECT/TEXTAREA,
  // so a <button> is the target the dialog's stopPropagation alone shields
  // the window handler from. A leaked R resets the match; a leaked P or
  // Escape pauses it, which the close keeps since the match was unpaused
  // when the dialog opened — either leak shows after it.
  await dialog.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('r');
  await expect(health).toContainText(/Action: (back)?walk/);
  await page.keyboard.press('p');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  const resume = page.getByRole('button', { name: 'Resume match' });
  await expect(resume).toBeHidden();
  await expect(page.locator('.arena canvas')).toBeFocused();
  await page.keyboard.press('p');
  await expect(resume).toBeVisible();
  expect(errors).toEqual([]);
});
