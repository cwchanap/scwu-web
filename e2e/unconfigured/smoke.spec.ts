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
  // The Menu is a full-window overlay of the paused arena (HPA-972), not a
  // centered small dialog: it covers the viewport at desktop and mobile
  // sizes.
  const covers = async () => {
    const box = (await dialog.boundingBox())!;
    const { width, height } = page.viewportSize()!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.y).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - width)).toBeLessThan(2);
    expect(Math.abs(box.height - height)).toBeLessThan(2);
  };
  await covers();
  await page.setViewportSize({ width: 390, height: 844 });
  await covers();
  await page.setViewportSize({ width: 1280, height: 720 });

  const opponent = dialog.getByLabel('Opponent');
  await expect(opponent).toBeEnabled();
  await expect(
    opponent.locator('option', { hasText: 'Vs. CPU' }),
  ).toBeAttached();
  // A partner pick while practice runs doesn't reset, keeping 'walk'.
  await opponent.selectOption('guard');

  // The Cheats live on their own tab (HPA-972): a master switch, the ten
  // values it keeps but disables while off, and the hint that nothing
  // applies mid-battle.
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  const cheatSwitch = dialog.getByLabel('Cheat mode');
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
  // A switch flipped over a running battle changes nothing in it: turning
  // cheats on and setting HP × to 2 leaves the live meter native — the
  // next match's begin (below) is what seats them.
  const player = page.getByLabel('Player health');
  await expect(player).toHaveText('510');
  await cheatSwitch.check();
  const playerHp = dialog.getByLabel('HP ×', { exact: true });
  await expect(playerHp).toBeEnabled();
  await playerHp.fill('2');
  await playerHp.blur();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('scwu.cheats')))
    .toBe(
      JSON.stringify({
        enabled: true,
        playerHpMultiplier: 2,
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
  await expect(player).toHaveText('510');

  // Keys go to a button: the scene's keydown ignores INPUT/SELECT/TEXTAREA,
  // so a <button> is the target the dialog's stopPropagation alone shields
  // the window handler from. A leaked R resets the match; a leaked P or
  // Escape pauses it, which the close keeps since the match was unpaused
  // when the dialog opened — either leak shows after it.
  await dialog.getByRole('button', { name: '◂ Back to game' }).focus();
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

  // The state-sensitive keyboard checks done, a Vs. CPU pick must drive
  // scene.reset('cpu') — the select then reports the CPU match's mode.
  await menu.click();
  await expect(dialog).toBeVisible();
  await opponent.selectOption('vsCpu');
  await expect(opponent).toHaveValue('vsCpu');
  // That pick starts a new match, whose begin installs the saved cheats:
  // the doubled player maximum reports at once, before its intro ends.
  await expect(player).toHaveText('1020', { timeout: 30_000 });

  // The cheats outlive a reload — device storage, no auth or network help.
  await page.reload();
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 30_000,
  });
  await expect(failed).toBeHidden();
  await menu.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await expect(cheatSwitch).toBeChecked();
  await expect(dialog.getByLabel('HP ×', { exact: true })).toHaveValue('2');
  expect(errors).toEqual([]);
});

test('arrow keys walk menu rows; summon Enter follows the highlight', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  // Into a practice battle, as the boot journey above: buttons skip T2,
  // pick VS single, both cursors rest on Ryuko and start.
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

  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  // Where focus sits, named by its control's accessible label.
  const focusName = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return (
        el?.getAttribute('aria-label') ??
        el?.closest('label')?.textContent?.trim() ??
        el?.tagName.toLowerCase()
      );
    });

  // ↑/↓ walk the Match tab's rows and land on an enabled control each
  // time; ←/→ adjusts the row focus sits on (HPA-972 review: the cards,
  // checkbox labels and cheat rows are real navigation targets).
  await dialog.getByRole('checkbox', { name: 'Music' }).click();
  await page.keyboard.press('ArrowDown');
  expect(await focusName()).toBe('Enemy HP bars');
  await page.keyboard.press('ArrowUp');
  expect(await focusName()).toBe('Music');
  await page.keyboard.press('ArrowUp');
  expect(await focusName()).toBe('Previous stage');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.locator('.card.stage .pickname')).toHaveText(
    'Train Morning',
  );

  // The Cheats tab: the walk starts at the master row, ←/→ flips the
  // switch and steps the steppers, and ↑/↓ still moves off a number
  // input instead of being swallowed by it.
  await page.keyboard.press('e');
  await page.keyboard.press('ArrowDown');
  expect(await focusName()).toBe('Cheat mode');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByLabel('Cheat mode')).toBeChecked();
  await page.keyboard.press('ArrowDown');
  expect(await focusName()).toBe('Decrease HP ×');
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByLabel('HP ×', { exact: true })).toHaveValue('2');
  await page.keyboard.press('ArrowDown');
  expect(await focusName()).toBe('Decrease Damage ×');
  await dialog.getByLabel('HP ×', { exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  expect(await focusName()).toBe('Decrease Damage ×');

  // Summon (Ctrl+Backquote, cheats now on): navigating the grid rides
  // focus with the cursor, so Enter confirms the highlighted fighter,
  // not whichever tile focus happened to sit on (HPA-972 review).
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  const tiles = dialog.getByRole('option');
  await expect(tiles).toHaveCount(45);
  // Even with another button focused — the side switch — the first arrow
  // hands focus to the cursor's tile, so Enter confirms the highlight,
  // not the focused button.
  await dialog.getByRole('button', { name: 'Partner' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(8)).toHaveAttribute('aria-selected', 'true');
  expect(
    await tiles.nth(8).evaluate((el) => document.activeElement === el),
  ).toBe(true);
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.note')).toContainText('Yo joined the fight.', {
    timeout: 30_000,
  });
  // From the settled cursor a later arrow still rides focus with it, and
  // its Enter confirms the new highlight.
  await page.keyboard.press('ArrowRight');
  await expect(tiles.nth(9)).toHaveAttribute('aria-selected', 'true');
  expect(
    await tiles.nth(9).evaluate((el) => document.activeElement === el),
  ).toBe(true);
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.note')).toContainText('SIN joined the fight.', {
    timeout: 30_000,
  });
  // Desktop's rendered grid is the stylesheet's 8 columns: one ↓ is one
  // source row.
  await page.keyboard.press('ArrowDown');
  await expect(tiles.nth(17)).toHaveAttribute('aria-selected', 'true');

  // Phone width renders four columns (≤700px): one ↓ becomes one
  // displayed row — the walk reads the rendered tracks, and the
  // scrollable grid keeps the pick in view.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.keyboard.press('ArrowDown');
  const rowDown = tiles.nth(21);
  await expect(rowDown).toHaveAttribute('aria-selected', 'true');
  expect(await rowDown.evaluate((el) => document.activeElement === el)).toBe(
    true,
  );
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown');
  const last = tiles.nth(44);
  await expect(last).toHaveAttribute('aria-selected', 'true');
  expect(await last.evaluate((el) => document.activeElement === el)).toBe(true);
  await expect(last).toBeInViewport();
  expect(errors).toEqual([]);
});

test('↑/↓ past the Opponent row leave the Vs. CPU match running', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  // Into a practice battle, as the journeys above.
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

  // From practice into a Vs. CPU match: the Opponent row's chooser
  // reports the running mode.
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  const opponent = dialog.getByLabel('Opponent');
  await opponent.selectOption('vsCpu');
  await expect(opponent).toHaveValue('vsCpu');
  await expect(opponent).toBeEnabled();

  // ↑/↓ navigate rows, never the select: landing on Opponent focuses the
  // row itself — a focused closed select would read ↑ as a pick, and
  // resetModeOf would replace the paused match with free practice
  // (HPA-972 review). Walk past it both ways and back.
  await dialog.getByRole('checkbox', { name: 'Music' }).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  const fieldRow = dialog.locator('label.field');
  expect(await fieldRow.evaluate((row) => document.activeElement === row)).toBe(
    true,
  );
  await page.keyboard.press('ArrowUp'); // wraps to Character select
  await expect(
    dialog.getByRole('button', { name: 'Character select', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown'); // back to the Opponent row
  expect(await fieldRow.evaluate((row) => document.activeElement === row)).toBe(
    true,
  );
  await page.keyboard.press('ArrowDown'); // the 1P card
  await expect(
    dialog.getByRole('button', { name: /1P .* open character select/ }),
  ).toBeFocused();
  await page.keyboard.press('ArrowUp'); // Opponent row again
  expect(await fieldRow.evaluate((row) => document.activeElement === row)).toBe(
    true,
  );
  // The mode and the match behind it never moved: the select still reads
  // the CPU match — a stray pick would have flipped it to a partner and
  // restarted as practice.
  await expect(opponent).toHaveValue('vsCpu');
  // Enter is the row's chooser key: it opens the picker (and nothing
  // commits until the picker's own Enter).
  await page.keyboard.press('Enter');
  await expect(opponent).toHaveValue('vsCpu');
  expect(errors).toEqual([]);
});

test('the Opponent chooser still focuses without showPicker', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Stable Safari lacks HTMLSelectElement.showPicker; Enter on the row
  // must still hand the select focus for its native keys rather than
  // throwing and stranding it (Tab skips the tabindex=-1 select).
  await page.addInitScript(() => {
    delete (HTMLSelectElement.prototype as Partial<HTMLSelectElement>)
      .showPicker;
  });
  await page.goto('/');
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

  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  const opponent = dialog.getByLabel('Opponent');
  // As the ↑/↓ walk leaves it: focus on the row itself, then Enter.
  const fieldRow = dialog.locator('label.field');
  await fieldRow.focus();
  await page.keyboard.press('Enter');
  await expect(opponent).toBeFocused();
  expect(errors).toEqual([]);
});

test('clamped summon navigation still hands focus to the highlight', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  const failed = page.getByText('Couldn’t enter the arena.');
  await expect(menu.and(page.locator(':enabled')).or(failed)).toBeVisible({
    timeout: 60_000,
  });
  await expect(failed).toBeHidden();
  // Into a practice battle, as the journeys above.
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

  // Summon needs cheats on; the master switch applies at once.
  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await dialog.getByLabel('Cheat mode').click();
  await expect(dialog.getByLabel('Cheat mode')).toBeChecked();
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  const tiles = dialog.getByRole('option');
  await expect(tiles).toHaveCount(45);

  // Boundary case (HPA-972 review round 2): the cursor rests on tile 0,
  // so ←/↑ are clamped — the cursor cannot move, but focus must still
  // ride to the highlight, or Enter would activate whichever button
  // focus sat on instead of summoning.
  await dialog.getByRole('button', { name: 'Partner' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(tiles.nth(0)).toHaveAttribute('aria-selected', 'true');
  expect(
    await tiles.nth(0).evaluate((el) => document.activeElement === el),
  ).toBe(true);
  await page.keyboard.press('ArrowUp');
  await expect(tiles.nth(0)).toHaveAttribute('aria-selected', 'true');
  expect(
    await tiles.nth(0).evaluate((el) => document.activeElement === el),
  ).toBe(true);
  // Enter now confirms the highlighted fighter.
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.note')).toContainText(
    'Ryuko joined the fight.',
    { timeout: 30_000 },
  );
  expect(errors).toEqual([]);
});

test('a close event arriving after a reopen cannot close the menu', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
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

  await menu.click();
  const dialog = page.getByRole('dialog', { name: 'Menu' });
  await expect(dialog).toBeVisible();
  // close() queues its close event as a task, so a reopen that runs
  // before it — a fast Ctrl+Backquote, whose input Chrome may dispatch
  // ahead of queued tasks — leaves the stale close to fire on the open
  // dialog. Replaying that window in one turn makes the race
  // deterministic: without the Menu's guard the late close tears the
  // reopened dialog down (and releases the frozen match with it).
  await page.evaluate(() => {
    const d = document.querySelector<HTMLDialogElement>('dialog.menu')!;
    d.close();
    d.showModal();
  });
  await page.waitForTimeout(250);
  await expect(dialog).toBeVisible();
  // The dialog still owns its keys, and a real close afterwards still
  // hands the arena back its focus and its pause.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.arena canvas')).toBeFocused();
  expect(errors).toEqual([]);
});

test('profile shows sign-in unavailable when unconfigured', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/profile.html');
  await expect(page.getByText('Not signed in')).toBeVisible();
  await expect(page.getByText('Sign-in unavailable').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('guide links SHUWA by his seat on the select sheet and opens his page', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/instructions.html');
  const link = page.getByRole('link', { name: 'SHUWA', exact: true });
  await expect(link).toBeVisible();
  // Seat 42 (HPA-1308): the sheet's third column, sixth row.
  await expect(link).toHaveAttribute('style', /--x: 52; --y: 350/);
  await link.click();
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('heading', { name: 'SHUWA', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('row').filter({
      has: page.getByRole('cell', { name: 'SPECIUM RAY', exact: true }),
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('guide keeps the backdrop, back link and DoraEmon move descriptions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/instructions.html');
  await expect(page.getByRole('link', { name: /Back to game/ })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundImage),
    )
    .toContain('select/15.png');
  await page.getByRole('link', { name: 'DoraEmon', exact: true }).click();
  const row = (name: string) =>
    page.getByRole('row').filter({
      has: page.getByRole('cell', { name, exact: true }),
    });
  await expect(row('Twin Hammer')).toContainText(
    'Protected during casting, but vulnerable during the hit follow-up.',
  );
  await expect(row('Fists')).toContainText(
    'Active punches clash with strikes up front, but his body remains vulnerable.',
  );
  await expect(row('Pierce')).toContainText(
    'Protected from strikes and grabs for the first second of the move only.',
  );
  await expect(row('Counter Hit').locator('.input')).toHaveText(
    'K while blocking',
  );
  await expect(row('Counter Hit')).toContainText(
    'Press K during any standing or crouching block to spend a stock and counter.',
  );
  await expect(row('EN')).toContainText(
    'Unavailable to you in every mode, and to any DoraEmon in a B.R. route — only a CPU DoraEmon elsewhere charges.',
  );
  expect(errors).toEqual([]);
});

test('unconfigured menu has no profile row and makes no /api/me request', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let meCalls = 0;
  await page.route('**/api/me', (route) => {
    meCalls += 1;
    return route.continue();
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
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Profile ↗' })).toHaveCount(0);
  await expect(dialog.getByText('Not signed in')).toHaveCount(0);
  expect(meCalls).toBe(0);
  expect(errors).toEqual([]);
});
