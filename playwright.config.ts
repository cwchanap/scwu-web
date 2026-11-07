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
  projects: [
    {
      name: 'unconfigured',
      testMatch: 'unconfigured/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:43173' },
    },
    {
      name: 'configured',
      testMatch: 'configured/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:43174' },
    },
  ],
  webServer: [
    {
      command: 'bunx vite preview --host 127.0.0.1 --port 43173 --strictPort',
      url: 'http://127.0.0.1:43173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'bunx vite build --outDir dist-e2e-configured && bunx vite preview --host 127.0.0.1 --port 43174 --strictPort --outDir dist-e2e-configured',
      url: 'http://127.0.0.1:43174',
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_GOOGLE_CLIENT_ID: 'e2e-throwaway.apps.googleusercontent.com',
      },
    },
  ],
});
