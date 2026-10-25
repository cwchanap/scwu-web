import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte(),
    // Vite 8's dev server sent each JSON export with an inline source map
    // seven times its size (sou.json's 4.5 MB as 38 MB), whose text the page
    // kept (2.2 GB of heap): its JSON plugin's map comes out as none, and the
    // server then maps the whole module. It adds none to code that names its
    // own map, so each export names an empty one.
    {
      name: 'json-without-source-maps',
      apply: 'serve',
      enforce: 'post',
      transform: (code, id) =>
        /\.json($|\?)/.test(id)
          ? `${code}\n//# sourceMappingURL=data:application/json;base64,${btoa(
              '{"version":3,"sources":[],"names":[],"mappings":""}',
            )}`
          : null,
    },
  ],
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
