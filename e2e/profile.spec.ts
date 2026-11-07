import { expect, test } from '@playwright/test';

test('failed sign-out keeps the identity and offers a retry', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  let signedIn = true;
  let networkDown = false;
  await page.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === '127.0.0.1' || hostname === 'localhost'
      ? route.continue()
      : route.abort();
  });
  await page.route('**/api/me', (route) => {
    if (networkDown) return route.abort();
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: signedIn
          ? {
              name: 'Ryuko',
              avatarUrl: null,
              createdAt: '2026-11-06T05:53:34Z',
            }
          : null,
      }),
    });
  });
  await page.route('**/api/auth/signout', (route) => {
    if (networkDown) return route.abort();
    signedIn = false;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    });
  });
  await page.route('**/api/auth/google', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'invalid token' }),
    }),
  );
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: 'window.google={accounts:{id:{initialize(){},renderButton(el){el.textContent="Sign in with Google"}}}};',
    }),
  );

  await page.goto('/profile.html');
  test.skip(
    await page.getByText('Sign-in unavailable').first().isVisible(),
    'served profile page is unconfigured',
  );

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText('Ryuko').first()).toBeVisible();
  await expect(page.getByText('Signed in with')).toBeVisible();

  networkDown = true;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Sign-out failed — try again.')).toBeVisible();
  await expect(page.getByText('Ryuko').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();

  networkDown = false;
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Not signed in')).toBeVisible();
  await expect(
    page.getByText('Sign-out failed — try again.'),
  ).not.toBeVisible();
  expect(errors).toEqual([]);
});
