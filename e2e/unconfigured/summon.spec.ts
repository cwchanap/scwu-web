import { expect, test } from '@playwright/test';

// HPA-972's summon journey the repeatable suite must never lose: both
// sides summon through the real pack loader, the close restores the
// frozen fight, and the Enemy HP bars checkbox stays a session option —
// saved cheats persist, it does not. The summoned fighters' rules and
// bars are covered by the Vitest suite (vs.test.ts, cheat-rules.test.ts);
// the HUD draws them on the canvas, which the browser-MCP screenshots
// in the task report show.

// Into a practice battle, as the smoke journeys: buttons skip T2, pick
// VS single, both cursors rest on Ryuko and start.
const bootIntoBattle = async (page: import('@playwright/test').Page) => {
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
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
  return { menu, dialog: page.getByRole('dialog', { name: 'Menu' }), health };
};

test('summons an enemy and a partner, then the fight resumes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const { menu, dialog, health } = await bootIntoBattle(page);

  // Cheats on first, so the localStorage key set is settled before the
  // session-option comparison below.
  await menu.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await dialog.getByLabel('Cheat mode').check();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .not.toBeNull();

  // The Enemy HP bars checkbox is a live session option (HPA-972): it
  // joins no saved JSON — toggling it writes nothing, and a reload
  // drops it while the cheats persist.
  await dialog.getByRole('button', { name: 'Match', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Enemy HP bars' }).check();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain('scwu.cheats');

  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  const tiles = dialog.getByRole('option');
  await expect(tiles).toHaveCount(44);

  // The summon view opens on the enemy side with the cursor on Ryuko
  // and focus on the dialog's back button, so the pick goes by pointer:
  // a tile click loads her pack and joins her against 1P.
  await expect(dialog.getByRole('button', { name: 'Enemy' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await tiles.nth(0).click();
  await expect(dialog.locator('.note')).toContainText(
    'Ryuko joined the fight.',
    { timeout: 30_000 },
  );

  // Partner side: one → moves the cursor onto Zoma, whose pack loads
  // from the same pack store on its way in beside 1P.
  await dialog.getByRole('button', { name: 'Partner' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.note')).toContainText(
    'Zoma joined the fight.',
    { timeout: 30_000 },
  );

  // Esc closes; the modal pause lifts with it, focus returns to the
  // arena and the fight plays on — a held direction walks.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.arena canvas')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Resume match' })).toBeHidden();
  await page.keyboard.down('d');
  await expect(health).toContainText(/Action: (back)?walk/);
  await page.keyboard.up('d');

  // A reload keeps the saved cheats but not the session's Enemy HP
  // bars pick, and wrote no other key.
  await page.reload();
  const { menu: reloaded, dialog: reopened } = await bootIntoBattle(page);
  await reloaded.click();
  await expect(reopened).toBeVisible();
  await expect(
    reopened.getByRole('checkbox', { name: 'Enemy HP bars' }),
  ).not.toBeChecked();
  expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(
    keys,
  );
  const cheats = await page.evaluate(() => localStorage.getItem('scwu.cheats'));
  expect(JSON.parse(cheats!).enabled).toBe(true);
  expect(errors).toEqual([]);
});

test.describe('at a phone size', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('summon works by touch', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    // Entering the battle needs the keyboard journeys; the menu and the
    // summon grid themselves run on taps here.
    const { menu, dialog, health } = await bootIntoBattle(page);

    await menu.tap();
    await expect(dialog).toBeVisible();
    // At ≤700px the rail is the horizontal tab row.
    await dialog.getByRole('button', { name: 'Cheats' }).tap();
    await dialog.getByLabel('Cheat mode').tap();
    await expect(dialog.getByLabel('Cheat mode')).toBeChecked();
    await dialog.getByRole('button', { name: 'Match', exact: true }).tap();
    await dialog.getByRole('checkbox', { name: 'Enemy HP bars' }).tap();
    await expect(
      dialog.getByRole('checkbox', { name: 'Enemy HP bars' }),
    ).toBeChecked();
    await dialog.getByRole('button', { name: '◂ Back to game' }).tap();
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Control+Backquote');
    await expect(dialog).toBeVisible();
    const tiles = dialog.getByRole('option');
    await expect(tiles).toHaveCount(44);
    // A tap on a tile picks and confirms it: Zoma loads his pack and joins
    // the enemy side (the view's default).
    await tiles.nth(1).tap();
    await expect(dialog.locator('.note')).toContainText(
      'Zoma joined the fight.',
      { timeout: 30_000 },
    );
    // The other side takes its tap too: Ryuko beside 1P.
    await dialog.getByRole('button', { name: 'Partner' }).tap();
    await tiles.nth(0).tap();
    await expect(dialog.locator('.note')).toContainText(
      'Ryuko joined the fight.',
      { timeout: 30_000 },
    );

    await dialog.getByRole('button', { name: '◂ Back to game' }).tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.arena canvas')).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Resume match' }),
    ).toBeHidden();
    await page.keyboard.down('d');
    await expect(health).toContainText(/Action: (back)?walk/);
    await page.keyboard.up('d');
    expect(errors).toEqual([]);
  });
});
