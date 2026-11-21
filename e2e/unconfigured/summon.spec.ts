import { expect, test } from '@playwright/test';

// HPA-972's summon journey the repeatable suite must never lose: both
// sides summon through the real pack loader, the close restores the
// frozen fight, and the Enemy HP bars checkbox stays a session option —
// saved cheats persist, it does not. The summoned fighters' rules and
// bars are covered by the Vitest suite (vs.test.ts, cheat-rules.test.ts);
// the HUD draws them on the canvas, which the browser-MCP screenshots
// in the task report show. The canvas CHEAT badge itself is asserted here
// as pixels (cheatBadgeGold) — the sr-only GameStatus announcement alone
// cannot prove the HUD draws it.

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

// The authored canvas CHEAT badge (hud.ts): gold italic text centred at
// (480, 66) of the 960×720 scene, a region the HUD's other art — timer box
// and digits above it, win marks and bars beside it — never reaches. Its
// #ffd24a fill is counted from a composited page screenshot (canvas
// .toDataURL is blank for this WebGL context), scaled through the canvas's
// box and devicePixelRatio as mode-select.spec.ts samples. Verified empty
// (0 gold pixels) through the VS splash and letterings and full (≈190)
// once the badge draws, so the count splits hard: 0 hidden, >20 shown.
const CHEAT_BADGE = { x: 445, y: 50, w: 70, h: 32 };
const cheatBadgeGold = async (page: import('@playwright/test').Page) => {
  const box = (await page.locator('.arena canvas').boundingBox())!;
  const shot = await page.screenshot();
  return page.evaluate(
    async ({ data, badge, box, ratio }) => {
      const img = new Image();
      img.src = data;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const x = Math.round((box.x + (badge.x / 960) * box.width) * ratio);
      const y = Math.round((box.y + (badge.y / 720) * box.height) * ratio);
      const w = Math.max(1, Math.round((badge.w / 960) * box.width * ratio));
      const h = Math.max(1, Math.round((badge.h / 720) * box.height * ratio));
      const d = ctx.getImageData(x, y, w, h).data;
      let gold = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
        if (r > 200 && g > 150 && g < 240 && b < 160 && r - b > 70) gold++;
      }
      return gold;
    },
    {
      badge: CHEAT_BADGE,
      data: 'data:image/png;base64,' + shot.toString('base64'),
      box,
      ratio: await page.evaluate(() => devicePixelRatio),
    },
  );
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

test('the first summon marks the run cheated at once and the CPU fights', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const { menu, dialog, health } = await bootIntoBattle(page);

  // Cheat mode on while a battle runs stays pending: nothing announces a
  // cheated run yet.
  await menu.click();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await dialog.getByLabel('Cheat mode').check();
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await expect(dialog).toBeHidden();
  await expect(health).not.toContainText('Cheat mode is on for this run.');
  // The canvas agrees in pixels: the CHEAT badge stays hidden while the
  // switch is only pending — a badge wired to the pending switch or the
  // run's announcement instead of match.cheated would already draw here.
  await expect.poll(() => cheatBadgeGold(page)).toBe(0);

  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  // Ryuko's pack is already resident: the summon lands at once.
  await dialog.getByRole('option').nth(0).click();
  await expect(dialog.locator('.note')).toContainText(
    'Ryuko joined the fight.',
    { timeout: 30_000 },
  );
  // GameStatus.cheated flips the moment the summon lands, with the
  // canvas HUD's CHEAT badge drawing from the same mark.
  await expect(health).toContainText('Cheat mode is on for this run.');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.arena canvas')).toBeFocused();
  // And the badge itself draws from the same mark: the summon's gold CHEAT
  // tag under the timer, not only the sr-only announcement.
  await expect.poll(() => cheatBadgeGold(page)).toBeGreaterThan(20);
  // The summoned CPU plays: one of the two standing fighters loses life
  // to it without any input.
  const meters = [
    page.getByRole('meter', { name: 'Player health' }),
    page.getByRole('meter', { name: 'Opponent health' }),
  ];
  await expect
    .poll(
      async () =>
        Math.min(
          ...(await Promise.all(
            meters.map(async (m) =>
              Number((await m.getAttribute('aria-valuenow')) ?? 510),
            ),
          )),
        ),
      { timeout: 45_000 },
    )
    .toBeLessThan(510);
  expect(errors).toEqual([]);
});

test('Escape during a slow pack load cancels without a late spawn', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  // Zoma's pack, held back so the dialog is mid-load while the keys are
  // tried. No artificial hooks: the delay is the network's, the rest is
  // the production build's own UI.
  let loaded = 0;
  await page.route('**/packs/fighter-zoma.bin', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    loaded++;
    await route.continue();
  });
  const { menu, dialog, health } = await bootIntoBattle(page);

  await menu.click();
  await dialog.getByRole('button', { name: 'Cheats' }).click();
  await dialog.getByLabel('Cheat mode').check();
  await dialog.getByRole('button', { name: '◂ Back to game' }).click();
  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('option').nth(1).click();
  await expect(dialog.locator('.note')).toContainText('Loading Zoma…');

  // The dialog holds focus through the load, so Esc stays the dialog's:
  // it closes, cancelling the summon and restoring the pause state.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('.arena canvas')).toBeFocused();
  await page.keyboard.press('p');
  await expect(
    page.getByRole('button', { name: 'Resume match' }),
  ).toBeVisible();
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Resume match' })).toBeHidden();
  await page.keyboard.down('d');
  await expect(health).toContainText(/Action: (back)?walk/);
  await page.keyboard.up('d');

  // The delayed response lands after the cancel: adopted, not spawned —
  // the run still reads uncheated.
  await expect.poll(() => loaded).toBe(1);
  await expect(health).not.toContainText('Cheat mode is on for this run.');
  // A fresh summon of the same fighter joins at once off the adopted
  // pack — and only now marks the run cheated.
  await page.keyboard.press('Control+Backquote');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('option').nth(1).click();
  await expect(dialog.locator('.note')).toContainText(
    'Zoma joined the fight.',
    { timeout: 10_000 },
  );
  await expect(health).toContainText('Cheat mode is on for this run.');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
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
