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
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'unconfigured',
      testMatch: 'unconfigured/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4173' },
    },
    {
      name: 'configured',
      testMatch: 'configured/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4173',
        storageState: {
          cookies: [
            {
              name: 'e2e_configured',
              value: '1',
              domain: '127.0.0.1',
              path: '/',
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        },
      },
    },
  ],
  webServer: {
    command:
      'bunx vite build --outDir dist-e2e-configured && bun scripts/preview-e2e.ts',
    url: 'http://127.0.0.1:4173',
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_GOOGLE_CLIENT_ID: 'e2e-throwaway.apps.googleusercontent.com',
    },
  },
});
