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
  { open: (p) => p.locator('.screens button', { hasText: /^\?$/ }), dialog: 'How to play' },
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

test("the Schedule copies one colonist's hours to another, or to everyone, and warns of a day with no sleep", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await startColony(page);
  await page.locator('.screens button', { hasText: 'Schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Schedule' });
  const rows = dialog.locator('tbody tr').filter({ hasNot: page.locator('.slot-all') });
  // Paint the first colonist's whole day as Work: no sleep, and it says so.
  await dialog.getByRole('button', { name: 'Work', exact: true }).click();
  const first = rows.first();
  for (let h = 0; h < 24; h++) {
    await first.locator(`td[data-hour="${h}"]`).click();
  }
  await expect(first.getByText('no sleep')).toBeVisible();
  // Copied to the second: theirs is the same, warning and all.
  await first.getByRole('button', { name: /^Copy .*'s hours$/ }).click();
  await rows
    .nth(1)
    .getByRole('button', { name: /^Give .*'s hours$/ })
    .click();
  await expect(rows.nth(1).getByText('no sleep')).toBeVisible();
  // And to everyone.
  await dialog.getByRole('button', { name: 'Paste to all' }).click();
  await expect(rows.getByText('no sleep')).toHaveCount(await rows.count());
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
  const slot1 = page.getByRole('dialog', { name: 'Save or load' }).getByRole('row', { name: /Slot 1/ });
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

  test('on the Work grid, a tap raises a priority and a long press lowers it', async ({ page, browserName }) => {
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

    // A held finger. In Chromium, touch events through the DevTools protocol, so the browser makes the pointer
    // events of them; WebKit (Safari's engine, as on an iPhone) and Firefox have no way to hold a finger down from
    // here, so the touch pointer events, and the click that lifting a finger makes, are sent to the cell.
    const box = (await cell.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
    const finger = (type: 'pointerdown' | 'pointermove' | 'pointerup' | 'click', at = point) =>
      cell.evaluate(
        (el, { type, at }) => {
          const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y };
          el.dispatchEvent(
            type === 'click'
              ? new MouseEvent('click', init)
              : new PointerEvent(type, { ...init, pointerType: 'touch', pointerId: 7, isPrimary: true }),
          );
        },
        { type, at },
      );
    const down = () =>
      cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] }) : finger('pointerdown');
    const move = (to: { x: number; y: number }) =>
      cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] }) : finger('pointermove', to);
    const up = async (moved = false) => {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await finger('pointerup');
        // (A finger lifted where it went down is a click as well; one that moved off is a scroll.)
        if (!moved) {
          await finger('click');
        }
      }
    };

    await down();
    await page.waitForTimeout(700);
    await up();
    // One step back, and the tap the finger lifting would make doesn't count.
    await expect.poll(priority).toBe(start);
    await page.waitForTimeout(200);
    expect(await priority()).toBe(start);

    // A finger that moves off is a scroll, not a press.
    await down();
    await move({ x: point.x + 40, y: point.y });
    await page.waitForTimeout(700);
    await up(true);
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

test('focus goes back to the Menu button after Settings and back, then Resume', async ({ page }) => {
  // (The menu, reopened from Settings, remembered a button in Settings, gone by then: focus fell to the page.)
  const errors = watchErrors(page);
  await startColony(page);
  const menu = page.locator('.screens button', { hasText: /^Menu$/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await paused.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paused).toBeVisible();
  await paused.getByRole('button', { name: 'Resume' }).focus();
  await page.keyboard.press('Enter');
  await expect(paused).toBeHidden();
  await expect(menu).toBeFocused();
  expect(errors).toEqual([]);
});

test('orders can be given on the map from the keyboard alone', async ({ page }) => {
  // The tile in the middle of the view is the cursor: Enter starts an area, the arrows stretch it, Enter marks it.
  const errors = watchErrors(page);
  await startColony(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const zoned = () =>
    page.evaluate(() => {
      const w = (window as unknown as { colony: { sim: { world: { size: number; zone: Uint8Array } } } }).colony.sim
        .world;
      let n = 0;
      for (let i = 0; i < w.size; i++) {
        n += w.zone[i] ? 1 : 0;
      }
      return n;
    });
  expect(await zoned()).toBe(0);
  // Where the view is, in tiles: an arrow is held until it has moved a few (the view pans with the time a frame
  // took, and on a busy machine a fixed 400 ms moved it less than a tile).
  const view = () =>
    page.evaluate(() => {
      const cam = (
        window as unknown as {
          colonyGame: { scene: { scenes: { cameras: { main: { scrollX: number; scrollY: number } } }[] } };
        }
      ).colonyGame.scene.scenes[0].cameras.main;
      return { x: cam.scrollX / 16, y: cam.scrollY / 16 };
    });
  const hold = async (key: string, axis: 'x' | 'y') => {
    const from = (await view())[axis];
    await page.keyboard.down(key);
    await expect.poll(async () => (await view())[axis] - from, { timeout: 10_000 }).toBeGreaterThan(3);
    await page.keyboard.up(key);
  };
  await page.keyboard.press('z');
  await page.keyboard.press('Enter');
  await hold('ArrowRight', 'x');
  await hold('ArrowDown', 'y');
  await page.keyboard.press('Enter');
  await expect.poll(zoned).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('Shift and a number bookmarks the view, and the number goes back there', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // The middle of the view, in tiles.
  const centre = () =>
    page.evaluate(() => {
      const cam = (
        window as unknown as {
          colonyGame: { scene: { scenes: { cameras: { main: { midPoint: { x: number; y: number } } } }[] } };
        }
      ).colonyGame.scene.scenes[0].cameras.main;
      return { x: cam.midPoint.x / 16, y: cam.midPoint.y / 16 };
    });
  const bookmarks = () =>
    page.evaluate(
      () => (window as unknown as { colony: { sim: { bookmarks: Record<number, number> } } }).colony.sim.bookmarks,
    );
  const start = await centre();
  await page.keyboard.press('Shift+Digit4');
  await expect.poll(async () => Object.keys(await bookmarks())).toEqual(['4']);
  // Away from it, then back.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await centre()).x - start.x, { timeout: 10_000 }).toBeGreaterThan(6);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Digit4');
  await expect.poll(async () => Math.abs((await centre()).x - start.x), { timeout: 10_000 }).toBeLessThan(1.5);
  expect(errors).toEqual([]);
});

test('an autosave held back while the page is hidden never lands over a newer one', async ({ page }) => {
  const errors = watchErrors(page);
  await startColony(page);
  const result = await page.evaluate(async () => {
    type Meta = { slot: string; hour: number; day: number };
    const c = (
      window as unknown as {
        colony: {
          sim: { step(): void; hour: number; day: number };
          save(slot: string, auto?: boolean): Promise<boolean>;
          saves: Meta[];
        };
      }
    ).colony;
    // No frames come (as on a hidden page) until the page is shown or hidden.
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    const older = c.save('autosave', true);
    const olderHour = Math.floor(c.sim.hour);
    // Some hours on, the page is hidden: that save is written at once.
    for (let t = 0; t < 200 * 3; t++) {
      c.sim.step();
    }
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    const newer = c.save('autosave', true);
    const newerHour = Math.floor(c.sim.hour);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.all([older, newer]);
    window.requestAnimationFrame = raf;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const saved = c.saves.find((m) => m.slot === 'autosave')!;
    return { olderHour, newerHour, savedHour: saved.hour };
  });
  expect(result.newerHour).not.toBe(result.olderHour);
  expect(result.savedHour).toBe(result.newerHour);
  expect(errors).toEqual([]);
});

// A Chromebook: its user agent, and the page a 1366×768 screen at 125% leaves (1093×615).
test.describe('on a Chromebook', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (X11; CrOS x86_64 15917.71.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1093, height: 615 },
  });

  type Cam = { scrollX: number; scrollY: number; zoom: number };
  const camera = (page: Page) =>
    page.evaluate(() => {
      const scene = (window as unknown as { colonyGame: { scene: { scenes: { cameras: { main: Cam } }[] } } })
        .colonyGame.scene.scenes[0];
      const { scrollX, scrollY, zoom } = scene.cameras.main;
      return { scrollX, scrollY, zoom };
    });

  test('Chromebook mode is on: lighter drawing, and two fingers move the map while a pinch zooms', async ({ page }) => {
    const errors = watchErrors(page);
    await startColony(page);
    const state = await page.evaluate(() => {
      const w = window as unknown as {
        colony: { chromebook: boolean; scrollMoves: boolean };
        colonyGame: { loop: { fpsLimit: number }; canvas: HTMLCanvasElement };
      };
      return {
        chromebook: w.colony.chromebook,
        scrollMoves: w.colony.scrollMoves,
        fpsLimit: w.colonyGame.loop.fpsLimit,
        canvas: w.colonyGame.canvas.width,
        page: window.innerWidth,
      };
    });
    expect(state).toMatchObject({ chromebook: true, scrollMoves: true, fpsLimit: 30 });
    // Drawn at the page's resolution, not the screen's.
    expect(state.canvas).toBe(state.page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(400, 330);
    // Two fingers on the touchpad: the map moves, at the same zoom.
    const before = await camera(page);
    await page.mouse.wheel(60, 80);
    await expect.poll(async () => (await camera(page)).scrollY).toBeGreaterThan(before.scrollY);
    const moved = await camera(page);
    expect(moved.scrollX).toBeGreaterThan(before.scrollX);
    expect(moved.zoom).toBe(before.zoom);
    // A pinch (a wheel event with Ctrl held): it zooms.
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -20);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(moved.zoom);
    // And + zooms in, for a touchpad with no wheel.
    const pinched = (await camera(page)).zoom;
    await page.keyboard.press('Equal');
    await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(pinched);
    // Turned off and on again as the game runs, the map keeps drawing (turned off, the frame limit had frozen it).
    type Loop = { colonyGame: { loop: { fpsLimit: number }; events: { on(e: string, f: () => void): void } } };
    await page.evaluate(() => {
      const w = window as unknown as Loop & { drawn: number };
      w.drawn = 0;
      w.colonyGame.events.on('step', () => w.drawn++);
    });
    const drawing = async () => {
      const before = await page.evaluate(() => (window as unknown as { drawn: number }).drawn);
      await expect
        .poll(() => page.evaluate(() => (window as unknown as { drawn: number }).drawn))
        .toBeGreaterThan(before + 5);
    };
    for (const chromebook of [2, 1, 2]) {
      await page.evaluate(
        (value) =>
          (window as unknown as { colony: { setSettings(s: object): void } }).colony.setSettings({ chromebook: value }),
        chromebook,
      );
      expect(await page.evaluate(() => (window as unknown as Loop).colonyGame.loop.fpsLimit)).toBe(
        chromebook === 1 ? 30 : 0,
      );
      await drawing();
    }
    expect(errors).toEqual([]);
  });

  test('Backspace cancels an order on the selected tile (a Chromebook has no Delete key)', async ({ page }) => {
    const errors = watchErrors(page);
    await startColony(page);
    // A tree beside the first colonist, marked for chopping, and its tile selected.
    await page.evaluate(async () => {
      // (Served by the dev server: a path the type checker can't follow.)
      const defs = '/src/sim/defs.ts';
      const { featureId } = (await import(defs)) as { featureId(key: string): number };
      type W = {
        colony: {
          sim: {
            colonists: { tile: number }[];
            world: {
              xOf(i: number): number;
              yOf(i: number): number;
              idx(x: number, y: number): number;
              setFeature(i: number, f: number): void;
            };
            apply(cmd: unknown): void;
          };
          selectTile(i: number): void;
          publish(): void;
        };
      };
      const c = (window as unknown as W).colony;
      const w = c.sim.world;
      const x = w.xOf(c.sim.colonists[0].tile) + 2;
      const y = w.yOf(c.sim.colonists[0].tile);
      w.setFeature(w.idx(x, y), featureId('tree'));
      c.sim.apply({ type: 'designate', kind: 'chop', rect: { x0: x, y0: y, x1: x, y1: y } });
      c.selectTile(w.idx(x, y));
      c.publish();
      (document.activeElement as HTMLElement | null)?.blur();
    });
    const card = page.getByRole('region', { name: 'Tile details' });
    await expect(card.getByRole('button', { name: 'Cancel order' })).toBeVisible();
    await page.keyboard.press('Backspace');
    await expect(card.getByRole('button', { name: 'Cancel order' })).toBeHidden();
    await expect(card.getByRole('button', { name: 'Chop' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
