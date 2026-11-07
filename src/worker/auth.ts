import {
  createRemoteJWKSet,
  jwtVerify,
  SignJWT,
  type JWTVerifyGetKey,
} from 'jose';

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface Env {
  DB?: D1Database;
  GOOGLE_CLIENT_ID?: string;
  SESSION_SECRET?: string;
}

type Configured = Required<Env>;

interface UserRow {
  display_name: string;
  avatar_url: string | null;
  created_at: string;
}

interface ProfileUser {
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

const SESSION_COOKIE = 'scwu_session';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let remoteKeys: JWTVerifyGetKey | undefined;

function googleKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(
    new URL('https://www.googleapis.com/oauth2/v3/certs'),
  );
  return remoteKeys;
}

export async function handle(
  request: Request,
  env: Env,
  keys: JWTVerifyGetKey = googleKeys(),
): Promise<Response> {
  const unconfigured = configError(env);
  if (unconfigured) return unconfigured;
  try {
    const configured = env as Configured;
    const { pathname } = new URL(request.url);
    if (pathname === '/api/auth/google' && request.method === 'POST') {
      if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
      return await signInWithGoogle(request, configured, keys);
    }
    if (pathname === '/api/auth/signout' && request.method === 'POST') {
      if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403);
      return signOut(request);
    }
    if (pathname === '/api/me' && request.method === 'GET') {
      return await me(request, configured);
    }
    return json({ error: 'not found' }, 404);
  } catch {
    return json({ error: 'internal error' }, 500);
  }
}

function configError(env: Env): Response | null {
  if (!env.DB) return json({ error: 'missing DB' }, 500);
  if (!env.GOOGLE_CLIENT_ID)
    return json({ error: 'missing GOOGLE_CLIENT_ID' }, 500);
  if (!env.SESSION_SECRET)
    return json({ error: 'missing SESSION_SECRET' }, 500);
  if (new TextEncoder().encode(env.SESSION_SECRET).length < 32) {
    return json({ error: 'invalid SESSION_SECRET' }, 500);
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function signInWithGoogle(
  request: Request,
  env: Configured,
  keys: JWTVerifyGetKey,
): Promise<Response> {
  const contentType = request.headers.get('content-type');
  if (
    contentType === null ||
    contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
  ) {
    return json({ error: 'unsupported content type' }, 415);
  }
  const body = await request
    .json()
    .then((parsed: unknown) => parsed)
    .catch(() => null);
  const credential =
    body !== null &&
    typeof body === 'object' &&
    typeof (body as { credential?: unknown }).credential === 'string'
      ? (body as { credential: string }).credential
      : null;
  if (!credential) return json({ error: 'missing credential' }, 400);

  let sub: string;
  let name: string;
  let avatarUrl: string | null;
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: env.GOOGLE_CLIENT_ID,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'exp'],
    });
    if (!payload.sub) return json({ error: 'invalid token' }, 401);
    sub = payload.sub;
    name =
      stringClaim(payload.name) ?? stringClaim(payload.given_name) ?? 'Player';
    avatarUrl = stringClaim(payload.picture) ?? null;
  } catch {
    return json({ error: 'invalid token' }, 401);
  }

  await env.DB.prepare(
    'INSERT INTO users (google_sub, display_name, avatar_url) VALUES (?, ?, ?) ' +
      'ON CONFLICT (google_sub) DO UPDATE SET ' +
      'display_name = excluded.display_name, avatar_url = excluded.avatar_url',
  )
    .bind(sub, name, avatarUrl)
    .run();
  const row = await env.DB.prepare(
    'SELECT display_name, avatar_url, created_at FROM users WHERE google_sub = ?',
  )
    .bind(sub)
    .first<UserRow>();
  if (!row) return json({ error: 'user write failed' }, 500);

  const session = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(sessionKey(env.SESSION_SECRET));
  const res = json({ user: profileUser(row) });
  res.headers.set(
    'set-cookie',
    sessionCookie(session, isSecure(request), SESSION_MAX_AGE),
  );
  return res;
}

async function me(request: Request, env: Configured): Promise<Response> {
  const sub = await sessionSub(request, env);
  if (!sub) return json({ user: null });
  const row = await env.DB.prepare(
    'SELECT display_name, avatar_url, created_at FROM users WHERE google_sub = ?',
  )
    .bind(sub)
    .first<UserRow>();
  return json({ user: row ? profileUser(row) : null });
}

function signOut(request: Request): Response {
  const res = json({ user: null });
  res.headers.set('set-cookie', sessionCookie('', isSecure(request), 0));
  return res;
}

async function sessionSub(
  request: Request,
  env: Configured,
): Promise<string | null> {
  const header = request.headers.get('cookie');
  if (!header) return null;
  const token = cookieValue(header, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey(env.SESSION_SECRET), {
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'exp'],
    });
    return payload.sub || null;
  } catch {
    return null;
  }
}

function sessionKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function sessionCookie(value: string, secure: boolean, maxAge: number): string {
  const cookie = `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  return secure ? `${cookie}; Secure` : cookie;
}

function cookieValue(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function profileUser(row: UserRow): ProfileUser {
  return {
    name: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}
