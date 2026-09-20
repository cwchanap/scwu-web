import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
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
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
