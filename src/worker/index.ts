import { handle, type Env } from './auth';

export type { Env } from './auth';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handle(request, env);
    }
    // Asset-first routing serves every real file in dist/ before this Worker
    // runs; anything left is a miss, never an SPA fallback.
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  },
};
