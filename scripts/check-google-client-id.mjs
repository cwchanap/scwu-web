import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { loadEnv } from 'vite';

const { config, error } = ts.parseConfigFileTextToJson(
  'wrangler.jsonc',
  readFileSync('wrangler.jsonc', 'utf8'),
);
if (error)
  throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
// The ID the build will embed: exported vars and .env* files alike.
const viteId = loadEnv(
  'production',
  process.cwd(),
  'VITE_GOOGLE_CLIENT_ID',
).VITE_GOOGLE_CLIENT_ID;
const productionId = config.vars?.GOOGLE_CLIENT_ID;
const previewId = config.previews?.vars?.GOOGLE_CLIENT_ID;
if (process.env.WORKERS_CI && !viteId) {
  throw new Error('VITE_GOOGLE_CLIENT_ID is required on Workers Builds');
}
if (
  !productionId ||
  !previewId ||
  productionId !== previewId ||
  (viteId && viteId !== productionId)
) {
  throw new Error(
    'VITE_GOOGLE_CLIENT_ID and production and Preview GOOGLE_CLIENT_ID must match',
  );
}
