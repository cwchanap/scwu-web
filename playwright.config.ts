import { defineConfig, devices } from '@playwright/test';

// The server builds its own unconfigured and configured bundles first; the
// game's data and art must already be exported (`bun run assets`). Art comes
// from VITE_ASSET_BASE when set, or the bundled assets otherwise.
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
    command: 'bun scripts/build-e2e.ts && bun scripts/preview-e2e.ts',
    url: 'http://127.0.0.1:4173',
    timeout: 300_000,
    // Reusing a foreign server on this port (e.g. `bun run preview`) would
    // serve dist/ and silently skip the e2e builds; fail on the conflict.
    reuseExistingServer: false,
  },
});
