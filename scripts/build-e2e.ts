import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';

const root = resolve(import.meta.dir, '..');
const publicDir = resolve(root, 'public');

// Symlink public assets into outDir without copying hundreds of megabytes
const linkPublic = (outDir: string) => {
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
};

const bundle = async (name: string, clientIdDefine: string) => {
  const outDir = resolve(root, name);
  await build({
    configFile: resolve(root, 'vite.config.ts'),
    build: {
      outDir,
      copyPublicDir: false,
      emptyOutDir: true,
    },
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': clientIdDefine,
    },
  });
  linkPublic(outDir);
};

// Each suite gets its own bundle so results do not depend on how the
// developer's dist/ was built; 'undefined' wins over ambient env vars.
await bundle('dist-e2e-unconfigured', 'undefined');
await bundle(
  'dist-e2e-configured',
  JSON.stringify('e2e-throwaway.apps.googleusercontent.com'),
);
