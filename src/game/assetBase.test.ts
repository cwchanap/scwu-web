import { afterEach, describe, expect, it, vi } from 'vitest';
import version from './generated/assets-version.json';

// ASSET_BASE is read at import, so each case loads the module afresh with its
// own VITE_ASSET_BASE (undefined: unset).
const assetBaseWith = async (remote: string | undefined) => {
  vi.stubEnv('VITE_ASSET_BASE', remote);
  vi.resetModules();
  return (await import('./assetBase')).ASSET_BASE;
};

describe('ASSET_BASE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // Otherwise the case's module stays in the registry, and a later file in
    // this worker (isolate: false) would import an assetBase with its base.
    vi.resetModules();
  });

  it('serves from /assets/ with no version when VITE_ASSET_BASE is unset', async () => {
    const base = await assetBaseWith(undefined);
    expect(base.endsWith('assets/')).toBe(true);
    expect(base).not.toContain(version.version);
  });

  it.each(['https://cdn.test', 'https://cdn.test/', 'https://cdn.test//'])(
    'serves from %s under the export version',
    async (remote) => {
      expect(version.version).toMatch(/^[0-9a-f]{16}$/);
      expect(await assetBaseWith(remote)).toBe(
        `https://cdn.test/${version.version}/`,
      );
    },
  );
});
