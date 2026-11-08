import { describe, expect, it } from 'vitest';
import {
  getMe,
  readMe,
  signInGoogle,
  signOut,
  type FetchLike,
  type ProfileUser,
} from './api';

const USER: ProfileUser = {
  name: 'Ryuko',
  avatarUrl: 'https://example.test/avatar.png',
  createdAt: '2026-11-06T05:53:34Z',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stubFetch = (respond: () => Response | Promise<Response>) => {
  const calls: { input: string; init?: RequestInit }[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return respond();
  };
  return { calls, fetchImpl };
};

const rejectingFetch =
  (error: Error): FetchLike =>
  () =>
    Promise.reject(error);

describe('getMe', () => {
  it('returns the signed-in user', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: USER }));
    expect(await getMe(fetchImpl)).toEqual(USER);
  });

  it('returns null for a signed-out body', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: null }));
    expect(await getMe(fetchImpl)).toBeNull();
  });

  it('requests /api/me as a credentialed same-origin GET', async () => {
    const { calls, fetchImpl } = stubFetch(() => jsonResponse({ user: null }));
    await getMe(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('/api/me');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect(calls[0].init?.credentials).toBe('same-origin');
  });

  it('returns null on a network error', async () => {
    expect(
      await getMe(rejectingFetch(new TypeError('fetch failed'))),
    ).toBeNull();
  });

  it.each([401, 403, 404, 500])(
    'returns null on a non-2xx response (%i)',
    async (status) => {
      const { fetchImpl } = stubFetch(() =>
        jsonResponse({ error: 'missing DB' }, status),
      );
      expect(await getMe(fetchImpl)).toBeNull();
    },
  );

  it("returns null on Vite's HTML fallback body", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    );
    expect(await getMe(fetchImpl)).toBeNull();
  });

  it.each([
    ['a JSON error body', { error: 'missing DB' }],
    ['a JSON array', []],
    ['a JSON string', '"signed in"'],
    ['a non-object user', { user: 42 }],
    ['a non-string name', { user: { ...USER, name: 7 } }],
    ['a non-string createdAt', { user: { ...USER, createdAt: null } }],
    ['a non-string avatarUrl', { user: { ...USER, avatarUrl: 3 } }],
    ['a non-date createdAt', { user: { ...USER, createdAt: 'not-a-date' } }],
    ['an empty createdAt', { user: { ...USER, createdAt: '' } }],
    [
      'an out-of-range createdAt',
      { user: { ...USER, createdAt: '2026-13-40T99:99:99Z' } },
    ],
  ])('returns null on %s', async (_label, body) => {
    const { fetchImpl } = stubFetch(() => jsonResponse(body));
    expect(await getMe(fetchImpl)).toBeNull();
  });

  it.each([
    '2026-11-06T05:53:34.123Z',
    '2026-11-06T07:53:34+02:00',
    '2026-11-06 05:53:34',
    '2028-02-29T05:53:34Z',
    '2000-02-29T00:00:00Z',
  ])('accepts valid date format %s', async (createdAt) => {
    const user = { ...USER, createdAt };
    const { fetchImpl } = stubFetch(() => jsonResponse({ user }));
    expect(await getMe(fetchImpl)).toEqual(user);
  });
});

describe('readMe', () => {
  it('reports ok with the signed-in user', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: USER }));
    expect(await readMe(fetchImpl)).toEqual({ ok: true, user: USER });
  });

  it('reports ok with null for an authoritative signed-out body', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: null }));
    expect(await readMe(fetchImpl)).toEqual({ ok: true, user: null });
  });

  it('requests /api/me as a credentialed same-origin GET', async () => {
    const { calls, fetchImpl } = stubFetch(() => jsonResponse({ user: null }));
    await readMe(fetchImpl);
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('/api/me');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect(calls[0].init?.credentials).toBe('same-origin');
  });

  it('fails on a network error', async () => {
    expect(await readMe(rejectingFetch(new TypeError('fetch failed')))).toEqual(
      { ok: false, user: null },
    );
  });

  it.each([401, 403, 404, 500])(
    'fails on a non-2xx response (%i)',
    async (status) => {
      const { fetchImpl } = stubFetch(() =>
        jsonResponse({ error: 'missing DB' }, status),
      );
      expect(await readMe(fetchImpl)).toEqual({ ok: false, user: null });
    },
  );

  it("fails on Vite's HTML fallback body", async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        }),
    );
    expect(await readMe(fetchImpl)).toEqual({ ok: false, user: null });
  });

  it.each([
    ['a JSON error body', { error: 'missing DB' }],
    ['a JSON array', []],
    ['a JSON string', '"signed in"'],
    ['a missing user', {}],
    ['a non-object user', { user: 42 }],
    ['a non-string name', { user: { ...USER, name: 7 } }],
    ['a non-string createdAt', { user: { ...USER, createdAt: null } }],
    ['a non-date createdAt', { user: { ...USER, createdAt: 'not-a-date' } }],
  ])('fails on %s rather than reporting signed out', async (_label, body) => {
    const { fetchImpl } = stubFetch(() => jsonResponse(body));
    expect(await readMe(fetchImpl)).toEqual({ ok: false, user: null });
  });
});

describe('signInGoogle', () => {
  it('POSTs the credential as JSON to /api/auth/google', async () => {
    const { calls, fetchImpl } = stubFetch(() => jsonResponse({ user: USER }));
    await signInGoogle('id-token', fetchImpl);
    expect(calls).toHaveLength(1);
    const { input, init } = calls[0];
    expect(input).toBe('/api/auth/google');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect((init?.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      credential: 'id-token',
    });
  });

  it('returns the signed-in user on success', async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ user: USER }));
    expect(await signInGoogle('id-token', fetchImpl)).toEqual(USER);
  });

  it.each([400, 401, 415, 500])(
    'returns null when the exchange fails (%i)',
    async (status) => {
      const { fetchImpl } = stubFetch(() =>
        jsonResponse({ error: 'invalid token' }, status),
      );
      expect(await signInGoogle('id-token', fetchImpl)).toBeNull();
    },
  );

  it('returns null on a network error or non-JSON body', async () => {
    expect(
      await signInGoogle('id-token', rejectingFetch(new Error('down'))),
    ).toBeNull();
    const { fetchImpl } = stubFetch(
      () => new Response('OK', { headers: { 'content-type': 'text/plain' } }),
    );
    expect(await signInGoogle('id-token', fetchImpl)).toBeNull();
  });
});

describe('signOut', () => {
  it('POSTs to /api/auth/signout and reports success', async () => {
    const { calls, fetchImpl } = stubFetch(() => jsonResponse({ user: null }));
    expect(await signOut(fetchImpl)).toBe(true);
    expect(calls[0].input).toBe('/api/auth/signout');
    expect(calls[0].init?.method).toBe('POST');
    expect(calls[0].init?.credentials).toBe('same-origin');
  });

  it.each([500, 404])('reports failure on a non-2xx (%i)', async (status) => {
    const { fetchImpl } = stubFetch(() => jsonResponse({}, status));
    expect(await signOut(fetchImpl)).toBe(false);
  });

  it('reports failure on a network error', async () => {
    expect(await signOut(rejectingFetch(new Error('down')))).toBe(false);
  });
});
