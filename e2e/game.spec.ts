import { expect, test, type Page } from '@playwright/test';

// The game in a real browser: starting a colony, every top-bar screen, saving and loading, and a phone.

// Console errors and uncaught exceptions on the page, gathered so each test can check there were none.
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// Title screen → New colony → Start, then the welcome help (shown on a first colony) closed with Esc.
async function startColony(page: Page, seed = 'e2e'): Promise<void> {
  await page.goto('/');
  const title = page.getByRole('dialog', { name: 'Colony Alpha' });
  await expect(title).toBeVisible();
  await title.getByRole('button', { name: 'New colony' }).click();
  await title.getByLabel('Seed').fill(seed);
  await title.getByRole('button', { name: 'Start colony' }).click();
  const welcome = page.getByRole('dialog', { name: 'Welcome to Colony Alpha' });
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toBeHidden();
  await expect(page.locator('.screens')).toBeVisible();
}

// The screens on the top bar ("Story" only there: a goal's header says it too), and the colonists overview.
const SCREENS: { open: (page: Page) => ReturnType<Page['locator']>; dialog: string }[] = [
  { open: (p) => p.locator('.screens button', { hasText: 'Work' }), dialog: 'Work priorities' },
  { open: (p) => p.locator('.screens button', { hasText: 'Schedule' }), dialog: 'Schedule' },
  { open: (p) => p.locator('.screens button', { hasText: 'Production' }), dialog: 'Production' },
  { open: (p) => p.locator('.screens button', { hasText: 'Research' }), dialog: 'Research' },
  { open: (p) => p.locator('.screens button', { hasText: 'Story' }), dialog: 'The story so far' },
  { open: (p) => p.locator('.screens button', { hasText: 'Village' }), dialog: 'Village' },
  { open: (p) => p.locator('.screens button', { hasText: /^Factions/ }), dialog: 'Factions' },
  { open: (p) => p.locator('.screens button', { hasText: /^\?$/ }), dialog: 'Welcome to Colony Alpha' },
  { open: (p) => p.getByRole('button', { name: 'All colonists' }), dialog: 'Colonists' },
];

test('title, new colony, and the welcome closes', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  // The colony is under way: colonists on the bar, and the Phaser game running.
  await expect(page.locator('.colonist-bar .chip').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { colonyGame?: unknown }).colonyGame !== undefined)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});

test('every top-bar screen opens and closes with Esc', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  for (const screen of SCREENS) {
    await screen.open(page).click();
    const dialog = page.getByRole('dialog', { name: screen.dialog, exact: false });
    await expect(dialog, screen.dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog, screen.dialog).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('the Story screen shows the history graphs once there are days to show', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  const story = page.locator('.screens button', { hasText: 'Story' });
  await story.click();
  const dialog = page.getByRole('dialog', { name: 'The story so far' });
  await expect(dialog.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(dialog.getByText('graphs start after a couple of days')).toBeVisible();
  await page.keyboard.press('Escape');
  // A few dawns written straight into the record (playing them out would take a while).
  await page.evaluate(() => {
    const colony = (
      window as unknown as {
        colony: { sim: { history: number[][] }; publish: () => void };
      }
    ).colony;
    colony.sim.history.push([1, 3, 50, 900, 6], [2, 3, 55, 1200, 5.5], [3, 4, 52, 1500, 5]);
    colony.publish();
  });
  await story.click();
  await expect(dialog.locator('.history-chart')).toHaveCount(4);
  await expect(dialog.getByText('1.5k silver')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('save to a slot and load it back', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page, 'save-me');
  const names = await page.locator('.colonist-bar .chip').allInnerTexts();
  const seed = await page.evaluate(() => (window as unknown as { colony: { sim: { seed: number } } }).colony.sim.seed);

  // Menu → Save or load → Slot 1.
  await page.locator('.screens button', { hasText: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Paused' });
  await menu.getByRole('button', { name: 'Save or load' }).click();
  const slot1 = menu.getByRole('row', { name: /Slot 1/ });
  await expect(slot1).toContainText('Empty');
  await slot1.getByRole('button', { name: 'Save' }).click();
  await expect(slot1).toContainText('Day 1');

  // A fresh page (saves are kept in the browser), then Load game → Slot 1 from the title screen.
  await page.reload();
  const title = page.getByRole('dialog', { name: 'Colony Alpha' });
  await title.getByRole('button', { name: 'Load game' }).click();
  await title
    .getByRole('row', { name: /Slot 1/ })
    .getByRole('button', { name: 'Load' })
    .click();
  await expect(page.locator('.screens')).toBeVisible();
  // A loaded colony isn't a first one: no welcome.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { colony: { sim: { seed: number } } }).colony.sim.seed)).toBe(
    seed,
  );
  expect(await page.locator('.colonist-bar .chip').allInnerTexts()).toEqual(names);
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('no dialog is wider than the screen', async ({ page }) => {
    const errors = watchErrors(page);
    await startColony(page);
    const tooWide: string[] = [];
    for (const screen of SCREENS) {
      await screen.open(page).click();
      const dialog = page.getByRole('dialog', { name: screen.dialog, exact: false });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > 390 + 0.5) {
        tooWide.push(`${screen.dialog}: ${JSON.stringify(box)}`);
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }
    // And the page itself doesn't scroll sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    expect(tooWide).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('on the Work grid, a tap raises a priority and a long press lowers it', async ({ page }) => {
    const errors = watchErrors(page);
    await startColony(page);
    await page.locator('.screens button', { hasText: 'Work' }).click();
    const cell = page.locator('.work-grid button.priority').first();
    const label = async () => (await cell.getAttribute('aria-label')) ?? '';
    const priority = async () => {
      const m = /priority (\d)|off$/.exec(await label());
      return m?.[1] ? Number(m[1]) : 0;
    };
    const forward = (v: number) => (v === 0 ? 1 : v === 4 ? 0 : v + 1);
    const start = await priority();

    await cell.tap();
    await expect.poll(priority).toBe(forward(start));

    // A held finger: touch events through the DevTools protocol, so the browser makes pointer events of them.
    const box = (await cell.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // One step back, and the tap the finger lifting would make doesn't count.
    await expect.poll(priority).toBe(start);
    await page.waitForTimeout(200);
    expect(await priority()).toBe(start);

    // A finger that moves off is a scroll, not a press.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x + 40, y: point.y }],
    });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    expect(await priority()).toBe(start);
    expect(errors).toEqual([]);
  });
});

test('right-click on the Work grid still lowers a priority', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  await page.locator('.screens button', { hasText: 'Work' }).click();
  const cell = page.locator('.work-grid button.priority').first();
  const before = (await cell.getAttribute('aria-label')) ?? '';
  await cell.click();
  await expect(cell).not.toHaveAttribute('aria-label', before);
  await cell.click({ button: 'right' });
  await expect(cell).toHaveAttribute('aria-label', before);
  expect(errors).toEqual([]);
});

test('a waiting ship stays one click away after its dialog is closed', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page, 'ship');
  // The ship set down beside the beacon (playing out the weeks to it would take a while).
  await page.evaluate(() => {
    const colony = (
      window as unknown as {
        colony: { sim: { tick: number; beacon: { landed?: boolean; landsAt?: number } }; publish: () => void };
      }
    ).colony;
    colony.sim.beacon.landed = true;
    colony.sim.beacon.landsAt = colony.sim.tick;
    colony.publish();
  });
  const ship = page.getByRole('dialog', { name: 'The ship has landed' });
  await expect(ship).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ship).toBeHidden();
  await page.locator('.screens button', { hasText: /^Ship$/ }).click();
  await expect(ship).toBeVisible();
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('a drag that ends outside a dialog does not close it', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  await page.locator('.screens button', { hasText: 'Work' }).click();
  const dialog = page.getByRole('dialog', { name: 'Work priorities' });
  const box = (await dialog.boundingBox())!;
  // Pressed on the dialog's heading, let go over the backdrop: a slider overshot, or text selected.
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 4 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  // A click on the backdrop itself still closes it.
  await page.mouse.click(box.x + box.width / 2, box.y - 60);
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});

test('keyboard focus goes back to the Menu button when the pause menu closes', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  const menu = page.locator('.screens button', { hasText: /^Menu$/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  // Resume, which has the focus as the menu opens, isn't where it goes back to.
  await page.keyboard.press('Escape');
  await expect(paused).toBeHidden();
  await expect(menu).toBeFocused();
  expect(errors).toEqual([]);
});
