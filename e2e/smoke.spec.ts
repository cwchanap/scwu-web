import { expect, test } from '@playwright/test';

// The one journey that must never break: the built app boots, loads its data
// and art from the asset base, and hands the player a ready arena. Match rules
// are deterministic and covered by the Vitest suite, not here.
test('boots into a ready arena', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  // The bucket's CORS allows only the production origin, not this preview
  // server's, so the browser would block every texture. Add the header here;
  // the bytes are still the bucket's. Unset (local build), art is same-origin.
  const bucket = process.env.VITE_ASSET_BASE;
  if (bucket)
    await page.route(`${new URL(bucket).origin}/**`, async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      });
    });

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'SCWU TRAINING' }),
  ).toBeVisible();
  await expect(page.getByRole('application').locator('canvas')).toBeVisible();
  // Disabled until the scene has loaded; the overlay replaces "Loading" on error.
  await expect(page.getByRole('button', { name: 'Free practice' })).toBeEnabled(
    { timeout: 60_000 },
  );
  await expect(page.getByText('Couldn’t enter the arena.')).toBeHidden();
  expect(errors).toEqual([]);
});
