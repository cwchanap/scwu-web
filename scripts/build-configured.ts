import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dir, '..');
const outDir = resolve(root, 'dist-e2e-configured');
const publicDir = resolve(root, 'public');

await build({
  configFile: resolve(root, 'vite.config.ts'),
  build: {
    outDir,
    copyPublicDir: false,
    emptyOutDir: true,
  },
  define: {
    'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(
      'e2e-throwaway.apps.googleusercontent.com',
    ),
  },
});

// Symlink public assets into outDir without copying hundreds of megabytes
if (existsSync(resolve(publicDir, 'fonts'))) {
  const target = resolve(outDir, 'fonts');
  if (!existsSync(target)) {
    symlinkSync(resolve(publicDir, 'fonts'), target);
  }
}

const publicAssets = resolve(publicDir, 'assets');
const outAssets = resolve(outDir, 'assets');
if (existsSync(publicAssets)) {
  mkdirSync(outAssets, { recursive: true });
  for (const entry of readdirSync(publicAssets)) {
    const dest = resolve(outAssets, entry);
    if (!existsSync(dest)) {
      symlinkSync(resolve(publicAssets, entry), dest);
    }
  }
}
