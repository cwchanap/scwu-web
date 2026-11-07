import { beforeAll, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTVerifyGetKey,
} from 'jose';
import {
  handle,
  type D1Database,
  type D1PreparedStatement,
  type Env,
} from './auth';
import worker from './index';

const CLIENT_ID = 'test.apps.googleusercontent.com';
const SESSION_SECRET = 'local-test-session-secret-0123456789';
const ORIGIN = 'https://scwu-web.test';
const MIGRATION = new URL('../../migrations/0001_users.sql', import.meta.url)
  .pathname;

function sqliteD1(): D1Database & { db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(MIGRATION, 'utf8'));
  const statement = (sql: string, values: unknown[]): D1PreparedStatement => {
    const stmt = db.prepare(sql);
    return {
      bind: (...next: unknown[]) => statement(sql, next),
      first<T>(colName?: string): Promise<T | null> {
        const row = stmt.get(...(values as never[]));
        if (row === undefined || row === null) return Promise.resolve(null);
        return Promise.resolve(
          (colName === undefined
            ? row
            : (row as Record<string, unknown>)[colName]) as T,
        );
      },
      run(): Promise<unknown> {
        return Promise.resolve(stmt.run(...(values as never[])));
      },
    };
  };
  return {
    db,
    prepare(query: string) {
      return statement(query, []);
    },
  };
}

function testEnv(overrides: Partial<Env> = {}): {
  env: Env;
  db: DatabaseSync;
} {
  const d1 = sqliteD1();
  return {
    db: d1.db,
    env: {
      DB: d1,
      GOOGLE_CLIENT_ID: CLIENT_ID,
      SESSION_SECRET,
      ...overrides,
    },
  };
}

const postJson = (path: string, body?: unknown, init?: RequestInit) =>
  new Request(ORIGIN + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
    ...init,
  });

const get = (path: string, init?: RequestInit) =>
  new Request(ORIGIN + path, init);

let privateKey: CryptoKey;
let keys: JWTVerifyGetKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  jwk.kid = 'test-key';
  keys = createLocalJWKSet({ keys: [jwk] });
});

async function googleToken(
  claims: {
    iss?: string;
    sub?: string | null;
    aud?: string;
    exp?: number | string;
    name?: string;
    given_name?: string;
    picture?: string;
  } = {},
): Promise<string> {
  const payload: Record<string, unknown> = {};
  for (const claim of ['name', 'given_name', 'picture'] as const) {
    if (claims[claim] !== undefined) payload[claim] = claims[claim];
  }
  const jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(claims.iss ?? 'https://accounts.google.com')
    .setAudience(claims.aud ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '1h');
  const sub = claims.sub === undefined ? 'sub-1' : claims.sub;
  if (sub !== null) jwt.setSubject(sub);
  return jwt.sign(privateKey);
}

function tampered(jwt: string): string {
  const parts = jwt.split('.');
  const sig = parts[2];
  const at = Math.floor(sig.length / 2);
  parts[2] =
    sig.slice(0, at) + (sig[at] === 'A' ? 'B' : 'A') + sig.slice(at + 1);
  return parts.join('.');
}

const sessionKey = new TextEncoder().encode(SESSION_SECRET);

async function sessionToken(
  sub: string,
  exp: number | string = '7d',
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(sessionKey);
}

function scwuSession(res: Response): string {
  const pair = (res.headers.get('set-cookie') ?? '').split(';')[0];
  expect(pair.startsWith('scwu_session=')).toBe(true);
  return pair;
}

describe('POST /api/auth/google', () => {
  async function signIn(
    credential: string,
    env: Env,
    url = `${ORIGIN}/api/auth/google`,
  ) {
    const res = await handle(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential }),
      }),
      env,
      keys,
    );
    return { res, body: await res.json() };
  }

  it.each(['https://accounts.google.com', 'accounts.google.com'])(
    'accepts a valid token with issuer %s',
    async (iss) => {
      const { env } = testEnv();
      const { res, body } = await signIn(
        await googleToken({ iss, name: 'Ryuko', picture: 'https://a/b.png' }),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(body.user.name).toBe('Ryuko');
      expect(body.user.avatarUrl).toBe('https://a/b.png');
      expect(body.user.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
      );
      const cookie = res.headers.get('set-cookie') ?? '';
      expect(cookie).toContain('scwu_session=');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('Max-Age=604800');
    },
  );

  it('rejects an invalid issuer', async () => {
    const { env } = testEnv();
    const { res } = await signIn(
      await googleToken({ iss: 'https://evil.example.com' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a token for a different audience', async () => {
    const { env } = testEnv();
    const { res } = await signIn(
      await googleToken({ aud: 'someone-else.apps.googleusercontent.com' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { env } = testEnv();
    const { res } = await signIn(
      await googleToken({ exp: Math.floor(Date.now() / 1000) - 60 }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('rejects a tampered token', async () => {
    const { env } = testEnv();
    const { res } = await signIn(tampered(await googleToken()), env);
    expect(res.status).toBe(401);
  });

  it('rejects a non-RS256 token', async () => {
    const { env } = testEnv();
    const hs = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(CLIENT_ID)
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(sessionKey);
    const { res } = await signIn(hs, env);
    expect(res.status).toBe(401);
  });

  it.each([{ sub: '' }, { sub: null }])(
    'rejects a token with a missing or empty sub (%o)',
    async ({ sub }) => {
      const { env } = testEnv();
      const { res } = await signIn(await googleToken({ sub }), env);
      expect(res.status).toBe(401);
    },
  );

  it.each([
    [{ name: 'Full Name', given_name: 'Given' }, 'Full Name'],
    [{ given_name: 'Given' }, 'Given'],
    [{}, 'Player'],
    [{ name: '', given_name: 'Given' }, 'Given'],
  ])(
    'falls back through display name claims %o to %s',
    async (claims, expected) => {
      const { env, db } = testEnv();
      const { res } = await signIn(await googleToken(claims), env);
      expect(res.status).toBe(200);
      const row = db
        .prepare('SELECT display_name FROM users WHERE google_sub = ?')
        .get('sub-1') as { display_name: string };
      expect(row.display_name).toBe(expected);
    },
  );

  it('rejects a request without a credential', async () => {
    const { env } = testEnv();
    for (const request of [
      postJson('/api/auth/google', {}),
      postJson('/api/auth/google', { credential: 42 }),
      new Request(`${ORIGIN}/api/auth/google`, {
        method: 'POST',
        body: 'not json',
      }),
    ]) {
      const res = await handle(request, env, keys);
      expect(res.status).toBe(400);
    }
  });

  it('upserts on repeat sign-in and preserves created_at', async () => {
    const { env, db } = testEnv();
    await signIn(await googleToken({ name: 'First' }), env);
    db.exec(
      "UPDATE users SET created_at = '2020-01-02T03:04:05Z' WHERE google_sub = 'sub-1'",
    );
    const { res, body } = await signIn(
      await googleToken({ name: 'Renamed', picture: 'https://a/new.png' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(body.user.name).toBe('Renamed');
    expect(body.user.avatarUrl).toBe('https://a/new.png');
    expect(body.user.createdAt).toBe('2020-01-02T03:04:05Z');
    const count = db.prepare('SELECT COUNT(*) AS n FROM users').get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it('omits Secure on the session cookie over plain HTTP', async () => {
    const { env } = testEnv();
    const { res } = await signIn(
      await googleToken(),
      env,
      'http://127.0.0.1:8787/api/auth/google',
    );
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('scwu_session=');
    expect(cookie).not.toContain('Secure');
  });
});

describe('GET /api/me', () => {
  it('returns {user:null} with no cookie', async () => {
    const { env } = testEnv();
    const res = await handle(get('/api/me'), env, keys);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns the signed-in user from the session cookie', async () => {
    const { env } = testEnv();
    const signIn = await handle(
      postJson('/api/auth/google', {
        credential: await googleToken({ name: 'Ryuko' }),
      }),
      env,
      keys,
    );
    const res = await handle(
      get('/api/me', { headers: { cookie: scwuSession(signIn) } }),
      env,
      keys,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Ryuko');
    expect(body.user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns {user:null} for a tampered cookie', async () => {
    const { env } = testEnv();
    const res = await handle(
      get('/api/me', {
        headers: {
          cookie: `scwu_session=${tampered(await sessionToken('sub-1'))}`,
        },
      }),
      env,
      keys,
    );
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns {user:null} for an expired cookie', async () => {
    const { env } = testEnv();
    const res = await handle(
      get('/api/me', {
        headers: {
          cookie: `scwu_session=${await sessionToken('sub-1', Math.floor(Date.now() / 1000) - 60)}`,
        },
      }),
      env,
      keys,
    );
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns {user:null} for a cookie signed with a different secret', async () => {
    const { env } = testEnv();
    const foreign = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(new TextEncoder().encode('some-other-secret-with-32-plus-bytes'));
    const res = await handle(
      get('/api/me', { headers: { cookie: `scwu_session=${foreign}` } }),
      env,
      keys,
    );
    expect(await res.json()).toEqual({ user: null });
  });

  it('returns {user:null} when the session subject has no user row', async () => {
    const { env } = testEnv();
    const res = await handle(
      get('/api/me', {
        headers: {
          cookie: `scwu_session=${await sessionToken('no-such-sub')}`,
        },
      }),
      env,
      keys,
    );
    expect(await res.json()).toEqual({ user: null });
  });
});

describe('POST /api/auth/signout', () => {
  it('expires the session cookie', async () => {
    const { env } = testEnv();
    const res = await handle(postJson('/api/auth/signout'), env, keys);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ user: null });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('scwu_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('configuration guard', () => {
  const requests = () => [
    get('/api/me'),
    postJson('/api/auth/google', { credential: 'x' }),
    postJson('/api/auth/signout'),
    get('/api/anything'),
  ];

  it('returns 500 missing DB without a D1 binding', async () => {
    const { env } = testEnv({ DB: undefined });
    for (const request of requests()) {
      const res = await handle(request, env, keys);
      expect(res.status).toBe(500);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'missing DB' });
    }
  });

  it.each([undefined, ''])(
    'returns 500 missing GOOGLE_CLIENT_ID (%o)',
    async (id) => {
      const { env } = testEnv({ GOOGLE_CLIENT_ID: id });
      for (const request of requests()) {
        const res = await handle(request, env, keys);
        expect(await res.json()).toEqual({ error: 'missing GOOGLE_CLIENT_ID' });
      }
    },
  );

  it.each([undefined, ''])(
    'returns 500 missing SESSION_SECRET (%o)',
    async (secret) => {
      const { env } = testEnv({ SESSION_SECRET: secret });
      for (const request of requests()) {
        const res = await handle(request, env, keys);
        expect(await res.json()).toEqual({ error: 'missing SESSION_SECRET' });
      }
    },
  );

  it('returns 500 for a SESSION_SECRET under 32 UTF-8 bytes', async () => {
    const { env } = testEnv({ SESSION_SECRET: 'x'.repeat(31) });
    for (const request of requests()) {
      const res = await handle(request, env, keys);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'invalid SESSION_SECRET' });
    }
    const multibyte = testEnv({ SESSION_SECRET: 'あ'.repeat(10) });
    const res = await handle(get('/api/me'), multibyte.env, keys);
    expect(res.status).toBe(500);
    const full = testEnv({ SESSION_SECRET: 'あ'.repeat(11) });
    expect((await handle(get('/api/me'), full.env, keys)).status).toBe(200);
  });
});

describe('worker routing', () => {
  it('dispatches /api/* to the handler', async () => {
    const { env } = testEnv({ DB: undefined });
    const res = await worker.fetch(get('/api/me'), env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'missing DB' });
  });

  it('returns JSON 404 for unsupported API routes', async () => {
    const { env } = testEnv();
    for (const request of [
      get('/api/nope'),
      postJson('/api/me'),
      get('/api/auth/google'),
      get('/api'),
    ]) {
      const res = await worker.fetch(request, env);
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('content-type')).toContain('application/json');
    }
  });

  it('does not fall back to an SPA page for non-API misses', async () => {
    const { env } = testEnv();
    const res = await worker.fetch(get('/no-such-page'), env);
    expect(res.status).toBe(404);
  });
});
