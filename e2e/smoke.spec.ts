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
