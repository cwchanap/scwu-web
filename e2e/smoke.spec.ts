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
  // Disabled until the scene has loaded; the overlay replaces "Loading" on error.
  const settings = page.getByRole('button', { name: 'Settings' });
  await expect(settings).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByText('Couldn’t enter the arena.')).toBeHidden();

  // The mode switch lives in the Settings dialog now.
  await settings.click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Free practice' }),
  ).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Vs. CPU' })).toBeEnabled();
  expect(errors).toEqual([]);
});
