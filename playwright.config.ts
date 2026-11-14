import { defineConfig } from '@playwright/test';

// Browser tests (e2e/): the real game in Chromium, served by the Vite dev server so `window.colony` (the
// controller) and `window.colonyGame` (the Phaser game) are there to inspect.
//
//   npm run test:e2e
//
// E2E_PORT picks another port if 4317 is taken (two copies running side by side, say). E2E_BROWSER runs them in
// firefox or webkit instead (installed with `npx playwright install firefox webkit`), to check the other engines.
const port = Number(process.env.E2E_PORT ?? 4317);
const browserName = (process.env.E2E_BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';

export default defineConfig({
  testDir: 'e2e',
  // The game is one heavy page: tests run one at a time so a slow machine doesn't time them out.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName,
    viewport: { width: 1280, height: 800 },
    // WebGL in a headless browser without a GPU. (Chromium's flags; the others find their own way.)
    launchOptions:
      browserName === 'chromium'
        ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
        : {},
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
