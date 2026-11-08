import { expect, test } from '@playwright/test';
import { USER, json, offlineGuard, stubGis } from './stubs';

test('failed sign-out keeps the identity and offers a retry', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  let signedIn = true;
  let networkDown = false;
  await offlineGuard(page);
  await page.route('**/api/me', (route) => {
    if (networkDown) return route.abort();
    return route.fulfill(json({ user: signedIn ? USER : null }));
  });
  await page.route('**/api/auth/signout', (route) => {
    if (networkDown) return route.abort();
    signedIn = false;
    return route.fulfill(json({ user: null }));
  });
  await stubGis(page);

  await page.goto('/profile.html');
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

test('a failed refresh after a successful sign-in keeps the exchanged identity', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  let meCalls = 0;
  await offlineGuard(page);
  await page.route('**/api/me', (route) => {
    meCalls += 1;
    if (meCalls === 1) return route.fulfill(json({ user: null }));
    return route.abort();
  });
  let googleCalls = 0;
  let releaseExchange: () => void = () => {};
  const exchangeGate = new Promise<void>((resolve) => {
    releaseExchange = resolve;
  });
  await page.route('**/api/auth/google', async (route) => {
    googleCalls += 1;
    await exchangeGate;
    return route.fulfill(json({ user: USER }));
  });
  await stubGis(page);

  await page.goto('/profile.html');
  const signIn = page.getByRole('button', { name: 'Sign in with Google' });
  await expect(signIn).toBeVisible();
  await expect.poll(() => meCalls).toBe(1);

  await signIn.click();
  await signIn.click();
  await page.waitForTimeout(500);
  releaseExchange();

  await expect(page.getByText('Ryuko').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(
    page.getByText("Couldn't refresh your sign-in — try again."),
  ).toBeVisible();
  expect(googleCalls).toBe(1);
  expect(errors).toEqual([]);
});

test('a delayed read cannot overwrite a newer sign-in', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const meReleases = new Map<number, () => void>();
  const meUser = new Map<number, unknown>();
  let meCalls = 0;
  await offlineGuard(page);
  await page.route('**/api/me', async (route) => {
    const call = ++meCalls;
    await new Promise<void>((resolve) => meReleases.set(call, resolve));
    return route.fulfill(json({ user: meUser.get(call) ?? null }));
  });
  const answerMe = async (call: number, user: unknown) => {
    meUser.set(call, user);
    await expect.poll(() => meReleases.has(call)).toBe(true);
    meReleases.get(call)!();
  };
  let releaseSignout: () => void = () => {};
  const signoutGate = new Promise<void>((resolve) => {
    releaseSignout = resolve;
  });
  await page.route('**/api/auth/signout', async (route) => {
    await signoutGate;
    return route.fulfill(json({ user: null }));
  });
  await page.route('**/api/auth/google', (route) =>
    route.fulfill(json({ user: USER })),
  );
  await stubGis(page);

  await page.goto('/profile.html');
  await answerMe(1, USER);
  const signOut = page.getByRole('button', { name: 'Sign out' });
  await expect(signOut).toBeVisible();
  await expect(page.getByText('Ryuko').first()).toBeVisible();

  await signOut.click();
  await expect(signOut).toBeDisabled();
  releaseSignout();
  await expect(page.getByText('Not signed in')).toBeVisible();

  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await answerMe(3, USER);
  await expect(page.getByText('Ryuko').first()).toBeVisible();
  await expect(signOut).toBeVisible();

  const staleResponse = page.waitForResponse('**/api/me');
  await answerMe(2, { ...USER, name: 'Stale identity' });
  await staleResponse;
  await expect(page.getByText('Ryuko').first()).toBeVisible();
  await expect(signOut).toBeVisible();
  await expect(page.getByText('Stale identity')).not.toBeVisible();
  expect(errors).toEqual([]);
});
