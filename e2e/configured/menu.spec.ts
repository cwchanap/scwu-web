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
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await expect(row).toContainText('Ryuko');
  await expect.poll(() => meCalls).toBe(2);

  meStatus = 200;
  user = null;
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
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

  // The Cheats tab (HPA-767, HPA-972): a master switch, the values it
  // keeps but disables while off, and the hint that nothing applies
  // mid-battle.
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  const cheatSwitch = dialog.getByLabel('Cheat mode');
  await expect(cheatSwitch).toBeVisible();
  await expect(cheatSwitch).not.toBeChecked();
  for (const name of [
    'HP ×',
    'Enemy HP ×',
    'Damage ×',
    'Max EN',
    'Unlimited EN',
  ]) {
    await expect(dialog.getByLabel(name, { exact: true })).toBeDisabled();
  }
  await expect(
    dialog.getByText('Changes apply from the next match or battle.'),
  ).toBeVisible();

  await cheatSwitch.check();
  for (const name of [
    'HP ×',
    'Enemy HP ×',
    'Damage ×',
    'Max EN',
    'Unlimited EN',
  ]) {
    await expect(dialog.getByLabel(name, { exact: true })).toBeEnabled();
  }
  const enemyHp = dialog.getByLabel('Enemy HP ×', { exact: true });
  await enemyHp.fill('2');
  await enemyHp.blur();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: true,
        playerHpMultiplier: 1,
        playerMaxEn: 300,
        unlimitedEn: false,
        enemyHpMultiplier: 2,
        playerDamageMultiplier: 1,
        partnerHpMultiplier: 1,
        enemyStocksMultiplier: 1,
        lowHpLine: 30,
        damageCutMultiplier: 1,
        lowHpSupers: false,
        brNoPartner: false,
        brHpPerKill: null,
        brEnPerKill: null,
      }),
    );

  // An out-of-range entry normalizes to the bound and the field shows the
  // clamped value, not the raw entry: 150 over a held 5 reads back 100.
  const playerHp = dialog.getByLabel('HP ×', { exact: true });
  await playerHp.fill('5');
  await playerHp.blur();
  await playerHp.fill('150');
  await playerHp.blur();
  await expect(playerHp).toHaveValue('100');
  // Clearing the field keeps the held value instead of saving the default.
  await playerHp.fill('');
  await playerHp.blur();
  await expect(playerHp).toHaveValue('100');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: true,
        playerHpMultiplier: 100,
        playerMaxEn: 300,
        unlimitedEn: false,
        enemyHpMultiplier: 2,
        playerDamageMultiplier: 1,
        partnerHpMultiplier: 1,
        enemyStocksMultiplier: 1,
        lowHpLine: 30,
        damageCutMultiplier: 1,
        lowHpSupers: false,
        brNoPartner: false,
        brHpPerKill: null,
        brEnPerKill: null,
      }),
    );
  // Reset it for the assertions below.
  await playerHp.fill('1');
  await playerHp.blur();

  // Left/right arrows inside a stepper's number input move the caret
  // without stepping the stored value or discarding uncommitted text.
  await playerHp.focus();
  await playerHp.fill('25');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(playerHp).toHaveValue('25');
  await playerHp.fill('1');
  await playerHp.blur();

  // Max EN shows the actual stock-digit art (HPA-971's en/7–10): each
  // authored digit decodes in the browser, not merely a 200 over HTTP.
  const maxEn = dialog.getByLabel('Max EN', { exact: true });
  for (const en of [700, 800, 900, 1000]) {
    await maxEn.fill(String(en));
    await maxEn.blur();
    const digit = dialog.locator(`img.digit[alt="${en} EN"]`);
    await expect(digit).toHaveCount(1);
    // Decoded pixels, not a 200 over HTTP: the bitmap is really there.
    await expect
      .poll(
        () => digit.evaluate((img) => (img as HTMLImageElement).naturalWidth),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);
    await expect(digit).toHaveJSProperty('complete', true);
  }
  // Put the default back before the persistence assertions.
  await maxEn.fill('300');
  await maxEn.blur();

  // Keys stay contained to the dialog: a leaked Escape would pause, an R
  // reset; the close still behaves and nothing errors.
  await dialog.getByRole('button', { name: '◂ Back to game' }).focus();
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
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();

  // A reload restores the saved cheats; the identity still reads the same.
  await page.reload();
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await expect(cheatSwitch).toBeChecked();
  await expect(dialog.getByLabel('Enemy HP ×', { exact: true })).toHaveValue(
    '2',
  );
  await expect(row).toContainText('Ryuko');
  await expect.poll(() => meCalls).toBe(3);
  expect(errors).toEqual([]);
});

test('Reset all returns the cheats to their defaults (HPA-972)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/me', (route) => route.fulfill(json({ user: USER })));

  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();

  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  const cheatSwitch = dialog.getByLabel('Cheat mode');
  await cheatSwitch.check();
  const hp = dialog.getByLabel('HP ×', { exact: true });
  await hp.fill('5');
  await hp.blur();
  const enemyHp = dialog.getByLabel('Enemy HP ×', { exact: true });
  await enemyHp.fill('150');
  await enemyHp.blur();
  // The out-of-range entry clamped to its bound counts as changed too.
  await expect(enemyHp).toHaveValue('100');
  await expect(dialog.getByText('2 changed')).toBeVisible();

  await dialog.getByRole('button', { name: 'Reset all' }).click();
  await expect(cheatSwitch).not.toBeChecked();
  await expect(hp).toHaveValue('1');
  await expect(enemyHp).toHaveValue('1');
  await expect(hp).toBeDisabled();
  await expect(enemyHp).toBeDisabled();
  await expect(dialog.getByText('changed')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: false,
        playerHpMultiplier: 1,
        playerMaxEn: 300,
        unlimitedEn: false,
        enemyHpMultiplier: 1,
        playerDamageMultiplier: 1,
        partnerHpMultiplier: 1,
        enemyStocksMultiplier: 1,
        lowHpLine: 30,
        damageCutMultiplier: 1,
        lowHpSupers: false,
        brNoPartner: false,
        brHpPerKill: null,
        brEnPerKill: null,
      }),
    );
  expect(errors).toEqual([]);
});
