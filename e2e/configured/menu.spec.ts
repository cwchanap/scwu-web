import { expect, test } from '@playwright/test';
import { USER, json } from './stubs';

test('configured menu reads /api/me on each open', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let user: unknown = { ...USER, avatarUrl: '/avatar.png' };
  let meStatus = 200;
  let meCalls = 0;
  let gisCalls = 0;
  await page.route('**/api/me', (route) => {
    meCalls += 1;
    return route.fulfill(json({ user }, meStatus));
  });
  await page.route('**/avatar.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    }),
  );
  await page.route('https://accounts.google.com/**', (route) => {
    gisCalls += 1;
    return route.abort();
  });

  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  expect(meCalls).toBe(0);

  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  const profile = dialog.getByRole('link', { name: 'Profile ↗' });
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute('href', 'profile.html');
  await expect(profile).toHaveAttribute('target', '_blank');
  await expect(profile).toHaveAttribute('rel', 'noopener');
  const row = profile.locator('..');
  await expect(row).toContainText('Ryuko');
  await expect(row.locator('img')).toHaveAttribute('src', /avatar\.png$/);
  await expect.poll(() => meCalls).toBe(1);

  // A failed read keeps the verified identity rather than signing it out.
  meStatus = 503;
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await expect(row).toContainText('Ryuko');
  await expect.poll(() => meCalls).toBe(2);

  meStatus = 200;
  user = null;
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await expect(row).toContainText('Not signed in');
  await expect(row.locator('img')).toHaveCount(0);
  await expect.poll(() => meCalls).toBe(3);
  expect(gisCalls).toBe(0);
  expect(errors).toEqual([]);
});

test('cheats settings live in the menu, persist and leave identity alone', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let meCalls = 0;
  await page.route('**/api/me', (route) => {
    meCalls += 1;
    return route.fulfill(json({ user: USER }));
  });

  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();

  // The Cheats block (HPA-767): a master switch, five values it keeps but
  // disables while off, and the hint that nothing applies mid-battle.
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  const cheatSwitch = dialog.getByLabel('Cheat mode');
  await expect(cheatSwitch).toBeVisible();
  await expect(cheatSwitch).not.toBeChecked();
  for (const name of [
    'Player HP',
    'Enemy HP',
    'Player damage',
    'Player EN limit',
    'Unlimited EN',
  ]) {
    await expect(dialog.getByLabel(name)).toBeDisabled();
  }
  await expect(
    dialog.getByText('Changes apply from the next match or battle.'),
  ).toBeVisible();

  await cheatSwitch.check();
  for (const name of [
    'Player HP',
    'Enemy HP',
    'Player damage',
    'Player EN limit',
    'Unlimited EN',
  ]) {
    await expect(dialog.getByLabel(name)).toBeEnabled();
  }
  const enemyHp = dialog.getByLabel('Enemy HP');
  await enemyHp.fill('0.5');
  await enemyHp.blur();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: true,
        playerHpMultiplier: 1,
        playerEnLimit: 3,
        unlimitedEn: false,
        enemyHpMultiplier: 0.5,
        playerDamageMultiplier: 1,
      }),
    );

  // An out-of-range entry normalizes to the bound and the field shows the
  // clamped value, not the raw entry: 9 over a held 5 reads back 5.
  const playerHp = dialog.getByLabel('Player HP');
  await playerHp.fill('5');
  await playerHp.blur();
  await playerHp.fill('9');
  await playerHp.blur();
  await expect(playerHp).toHaveValue('5');
  // Clearing the field keeps the held value instead of saving the default.
  await playerHp.fill('');
  await playerHp.blur();
  await expect(playerHp).toHaveValue('5');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: true,
        playerHpMultiplier: 5,
        playerEnLimit: 3,
        unlimitedEn: false,
        enemyHpMultiplier: 0.5,
        playerDamageMultiplier: 1,
      }),
    );
  // Reset it for the assertions below.
  await playerHp.fill('1');
  await playerHp.blur();

  // Keys stay contained to the dialog: a leaked Escape would pause, an R
  // reset; the close still behaves and nothing errors.
  await dialog.getByRole('button', { name: 'Close' }).focus();
  await page.keyboard.press('r');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The Profile row reads /api/me as before, untouched by the new block.
  await menu.click();
  await expect(dialog).toBeVisible();
  const profile = dialog.getByRole('link', { name: 'Profile ↗' });
  const row = profile.locator('..');
  await expect(row).toContainText('Ryuko');
  await expect.poll(() => meCalls).toBe(2);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  // A reload restores the saved cheats; the identity still reads the same.
  await page.reload();
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await expect(cheatSwitch).toBeChecked();
  await expect(dialog.getByLabel('Enemy HP')).toHaveValue('0.5');
  await expect(row).toContainText('Ryuko');
  await expect.poll(() => meCalls).toBe(3);
  expect(errors).toEqual([]);
});
