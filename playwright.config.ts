import { defineConfig, devices } from '@playwright/test';

// Drives the production build in dist/, so run `bun run build` first. Built
// with VITE_ASSET_BASE set, the art and audio come from the R2 bucket; unset,
// from dist/assets (what `bun run build` exports locally).
export default defineConfig({
  testDir: 'e2e',
  // Booting loads the fighters' data and art, over the network from R2 in CI.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bunx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
