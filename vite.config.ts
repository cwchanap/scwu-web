import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // The exports load as one JSON.parse each: as object literals they bring
  // source maps five times their size, which every test worker kept (2 GB).
  // The code imports them only by default.
  json: { stringify: true, namedExports: false },
  server: {
    fs: { deny: ['**/scwu-web-handoff/**', '**/.git/**', '**/.env*'] },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'phaser', test: /node_modules\/phaser/ }],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Each file imports every fighter's export (44 MB of JSON); sharing a
    // worker's modules across files saves importing it again for each. No
    // test changes module state.
    isolate: false,
    // The tests are deterministic simulations, so a slow one means a busy
    // machine, not a hang (the minute of every stage's objects takes 30 s
    // among match.test.ts's others).
    testTimeout: 120000,
  },
});
