import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exporterSha } from '../game/testing';

const build = resolve('scripts/build.sh');
const dirs: string[] = [];
function runBuild(config: string, vars: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'scwu-build-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin/bun'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(dir, 'bin/bunx'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  writeFileSync(join(dir, 'wrangler.jsonc'), config);
  return spawnSync('bash', [build], {
    cwd: dir,
    env: { PATH: `${join(dir, 'bin')}:${process.env.PATH}`, ...vars },
    encoding: 'utf8',
  });
}
afterEach(() =>
  dirs
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

describe('build client ID guard', () => {
  const config =
    '{ "url": "https://example.com", "vars": { "GOOGLE_CLIENT_ID": "client" }, "previews": { "vars": { "GOOGLE_CLIENT_ID": "client" } } }';
  it('accepts matching IDs in JSONC containing URLs', () => {
    expect(runBuild(config, { VITE_GOOGLE_CLIENT_ID: 'client' }).status).toBe(
      0,
    );
  });
  it('rejects missing Workers Builds IDs before fetching assets', () => {
    const result = runBuild(config, { WORKERS_CI: '1' });
    expect(result.stderr).toContain('VITE_GOOGLE_CLIENT_ID');
  });
  it('rejects missing or mismatched Worker IDs', () => {
    expect(
      runBuild(
        '{"vars":{},"previews":{"vars":{"GOOGLE_CLIENT_ID":"client"}}}',
        { VITE_GOOGLE_CLIENT_ID: 'client' },
      ).status,
    ).not.toBe(0);
    expect(
      runBuild(config.replaceAll('client', 'other'), {
        VITE_GOOGLE_CLIENT_ID: 'client',
      }).status,
    ).not.toBe(0);
    expect(
      runBuild(
        config.replace(
          '"GOOGLE_CLIENT_ID": "client" } }',
          '"GOOGLE_CLIENT_ID": "other" } }',
        ),
        { VITE_GOOGLE_CLIENT_ID: 'client' },
      ).status,
    ).not.toBe(0);
  });
});

// The Workers Builds fingerprint gate (scripts/build.sh under WORKERS_CI): a
// generated.tar.gz stands in for R2's, served from a local server, and stub
// bun/bunx skip the rest of the build. The sandbox symlinks art/ and scripts/
// so script_sha cats this checkout's exporter and committed art.
describe('Workers Builds fingerprint gate', () => {
  const sandbox = () => {
    const root = resolve('.');
    const dir = mkdtempSync(join(tmpdir(), 'scwu-workers-'));
    mkdirSync(join(dir, 'bin'));
    writeFileSync(join(dir, 'bin/bun'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(join(dir, 'bin/bunx'), '#!/bin/sh\nexit 0\n', {
      mode: 0o755,
    });
    symlinkSync(join(root, 'art'), join(dir, 'art'));
    symlinkSync(join(root, 'scripts'), join(dir, 'scripts'));
    writeFileSync(
      join(dir, 'wrangler.jsonc'),
      '{ "vars": { "GOOGLE_CLIENT_ID": "client" }, "previews": { "vars": { "GOOGLE_CLIENT_ID": "client" } } }',
    );
    return dir;
  };

  // The generated.tar.gz R2 would serve, holding one .exporter fingerprint.
  const tarball = (fingerprint: string) => {
    const www = mkdtempSync(join(tmpdir(), 'scwu-www-'));
    writeFileSync(join(www, '.exporter'), `${fingerprint}\n`);
    const out = join(www, 'generated.tar.gz');
    spawnSync('tar', ['-czf', out, '-C', www, '.exporter']);
    return { www, out };
  };

  async function runWorkersBuild(fingerprint: string) {
    const dir = sandbox();
    const { www, out } = tarball(fingerprint);
    const server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/gzip');
      createReadStream(out).pipe(response);
    });
    await new Promise<void>((listening) =>
      server.listen(0, '127.0.0.1', listening),
    );
    const { port } = server.address() as AddressInfo;
    try {
      return await new Promise<{ status: number | null; stderr: string }>(
        (done) => {
          let stderr = '';
          const child = spawn('bash', [resolve('scripts/build.sh')], {
            cwd: dir,
            env: {
              PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
              WORKERS_CI: '1',
              VITE_ASSET_BASE: `http://127.0.0.1:${port}`,
              VITE_GOOGLE_CLIENT_ID: 'client',
              no_proxy: '127.0.0.1,localhost',
              NO_PROXY: '127.0.0.1,localhost',
            },
          });
          child.stderr.on('data', (chunk) => (stderr += chunk));
          child.on('close', (code) => done({ status: code, stderr }));
        },
      );
    } finally {
      server.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(www, { recursive: true, force: true });
    }
  }

  it('builds on refreshed artifacts whose fingerprint matches', async () => {
    const result = await runWorkersBuild(exporterSha());
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('refuses a stale generated.tar.gz until upload:r2 runs', async () => {
    const result = await runWorkersBuild('0000000000000000');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('upload:r2');
  });
});
