import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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
