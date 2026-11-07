import { serve } from 'bun';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dir, '..', 'dist');
const distConfiguredDir = resolve(import.meta.dir, '..', 'dist-e2e-configured');

const server = serve({
  port: 4173,
  hostname: '127.0.0.1',
  fetch(req) {
    const url = new URL(req.url);
    const cookie = req.headers.get('cookie') || '';
    const isConfigured = cookie.includes('e2e_configured=1');
    const primaryDir = isConfigured ? distConfiguredDir : distDir;
    const secondaryDir = isConfigured ? distDir : distConfiguredDir;

    let reqPath = decodeURIComponent(url.pathname);
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    const safePrimaryPath = resolve(primaryDir, '.' + reqPath);
    if (safePrimaryPath.startsWith(primaryDir) && existsSync(safePrimaryPath)) {
      const stat = statSync(safePrimaryPath);
      if (stat.isFile()) {
        const file = Bun.file(safePrimaryPath);
        return new Response(file, {
          headers: {
            'content-type': file.type,
            'cache-control': 'no-cache',
          },
        });
      }
    }

    const safeSecondaryPath = resolve(secondaryDir, '.' + reqPath);
    if (
      safeSecondaryPath.startsWith(secondaryDir) &&
      existsSync(safeSecondaryPath)
    ) {
      const stat = statSync(safeSecondaryPath);
      if (stat.isFile()) {
        const file = Bun.file(safeSecondaryPath);
        return new Response(file, {
          headers: {
            'content-type': file.type,
            'cache-control': 'no-cache',
          },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`E2E preview server running at http://127.0.0.1:${server.port}`);
