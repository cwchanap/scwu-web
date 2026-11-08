import { serve } from 'bun';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const distUnconfiguredDir = resolve(
  import.meta.dir,
  '..',
  'dist-e2e-unconfigured',
);
const distConfiguredDir = resolve(import.meta.dir, '..', 'dist-e2e-configured');

const server = serve({
  port: 4173,
  hostname: '127.0.0.1',
  fetch(req) {
    const url = new URL(req.url);
    const cookie = req.headers.get('cookie') || '';
    const isConfigured = cookie.includes('e2e_configured=1');
    const rootDir = isConfigured ? distConfiguredDir : distUnconfiguredDir;

    let reqPath: string;
    try {
      reqPath = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (reqPath === '/' || reqPath === '') {
      reqPath = '/index.html';
    }

    const safePath = resolve(rootDir, '.' + reqPath);
    const isContained =
      safePath === rootDir || safePath.startsWith(rootDir + '/');
    if (!isContained) {
      return new Response('Forbidden', { status: 403 });
    }

    if (existsSync(safePath)) {
      const stat = statSync(safePath);
      if (stat.isFile()) {
        const file = Bun.file(safePath);
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
