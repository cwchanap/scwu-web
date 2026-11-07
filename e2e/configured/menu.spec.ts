import { expect, test } from '@playwright/test';
import { USER, json } from './stubs';

// Runs only in the 'configured' project, whose build carries the throwaway
// VITE_GOOGLE_CLIENT_ID; the game's art loads normally (R2 in CI, dist/assets
// locally) and only the auth endpoints are stubbed.
test('configured menu reads /api/me on each open', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let user: unknown = { ...USER, avatarUrl: '/avatar.png' };
  let meCalls = 0;
  let gisCalls = 0;
  await page.route('**/api/me', (route) => {
    meCalls += 1;
    return route.fulfill(json({ user }));
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

  user = null;
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await expect(row).toContainText('Not signed in');
  await expect(row.locator('img')).toHaveCount(0);
  await expect.poll(() => meCalls).toBe(2);
  expect(gisCalls).toBe(0);
  expect(errors).toEqual([]);
});
