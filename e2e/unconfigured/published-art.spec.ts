import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// HPA-972 published the authored EN stock digits (en/7–10) and the Menu's
// stage thumbnails: a production-like browser fetches each published path
// under the asset base without a 404. The bundle serves the exported art
// same-origin (CI fetches from R2 and has no art, so it skips — the render
// that shows these is the Menu UI's, task 5).
test.skip(
  !existsSync('public/assets/en/7.png'),
  'run bun run assets to export the art',
);

test('serves the published EN digits and stage thumbnails', async ({
  request,
}) => {
  for (const path of [
    '/assets/en/7.png',
    '/assets/en/8.png',
    '/assets/en/9.png',
    '/assets/en/10.png',
    '/assets/ui/18.png',
    '/assets/ui/23.png',
    '/assets/stages/streetnight/4.png',
    '/assets/stages/court/0.png',
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect((await response.body()).subarray(1, 4).toString(), path).toBe('PNG');
  }
});
