import { handle, type Env } from './auth';

export type { Env } from './auth';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return handle(request, env);
    }
    return Promise.resolve(new Response('Not Found', { status: 404 }));
  },
};
