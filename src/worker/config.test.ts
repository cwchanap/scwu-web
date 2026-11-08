import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface D1Binding {
  binding: string;
  database_name: string;
  database_id: string;
}

interface WorkerSettings {
  d1_databases?: D1Binding[];
  vars?: Record<string, string>;
}

interface WranglerConfig extends WorkerSettings {
  previews?: WorkerSettings;
}

const path = new URL('../../wrangler.jsonc', import.meta.url);
const parsed = ts.parseConfigFileTextToJson(
  path.pathname,
  readFileSync(path, 'utf8'),
);
if (parsed.error) {
  throw new Error(
    ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n'),
  );
}
const config = parsed.config as WranglerConfig;

describe('Worker configuration', () => {
  it('never binds Preview to the production D1 database', () => {
    const production = config.d1_databases?.find(
      (item) => item.binding === 'DB',
    );
    const preview = config.previews?.d1_databases?.find(
      (item) => item.binding === 'DB',
    );
    expect(production).toMatchObject({
      database_name: 'scwu-web',
      database_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      ),
    });
    expect(preview?.database_id).not.toBe(production?.database_id);
  });

  it('uses the same public Google client ID in production and Preview', () => {
    expect(config.vars?.GOOGLE_CLIENT_ID).toMatch(
      /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
    );
    expect(config.previews?.vars?.GOOGLE_CLIENT_ID).toBe(
      config.vars?.GOOGLE_CLIENT_ID,
    );
    expect(config.vars?.SESSION_SECRET).toBeUndefined();
    expect(config.previews?.vars?.SESSION_SECRET).toBeUndefined();
  });
});
