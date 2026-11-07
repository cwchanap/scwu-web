import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { isFileLoadingAllowed, resolveConfig } from 'vite';

describe('dev server filesystem deny policy', () => {
  it('denies .dev.vars secret files while serving project files', async () => {
    const root = new URL('..', import.meta.url).pathname;
    const config = await resolveConfig(
      {
        root,
        configFile: resolve(root, 'vite.config.ts'),
        logLevel: 'silent',
      },
      'serve',
    );
    for (const file of [
      '.dev.vars',
      '.dev.vars.local',
      '.dev.vars.preview',
      '.dev.vars.production',
      '.env',
    ]) {
      expect(isFileLoadingAllowed(config, resolve(root, file))).toBe(false);
    }
    expect(isFileLoadingAllowed(config, resolve(root, 'package.json'))).toBe(
      true,
    );
  });
});
