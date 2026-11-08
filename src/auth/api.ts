export interface ProfileUser {
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const browserFetch: FetchLike = (input, init) => fetch(input, init);

const isValidDate = (value: string): boolean =>
  value.length > 0 && !Number.isNaN(Date.parse(value));

// SQLite's default timestamp shape ('YYYY-MM-DD HH:MM:SS') is UTC, but
// Date parses the space-separated form as local time; make the zone explicit.
const normalizeCreatedAt = (value: string): string =>
  value.replace(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/,
    '$1T$2Z',
  );

export interface MeResult {
  ok: boolean;
  user: ProfileUser | null;
}

const parseMe = (body: unknown): MeResult => {
  if (typeof body !== 'object' || body === null)
    return { ok: false, user: null };
  const { user } = body as { user?: unknown };
  if (user === null) return { ok: true, user: null };
  if (typeof user !== 'object') return { ok: false, user: null };
  const { name, avatarUrl, createdAt } = user as Record<string, unknown>;
  if (typeof name !== 'string' || typeof createdAt !== 'string')
    return { ok: false, user: null };
  const at = normalizeCreatedAt(createdAt);
  if (!isValidDate(at)) return { ok: false, user: null };
  if (avatarUrl !== null && typeof avatarUrl !== 'string')
    return { ok: false, user: null };
  return { ok: true, user: { name, avatarUrl, createdAt: at } };
};

const request = async (
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<MeResult> => {
  try {
    const response = await fetchImpl(path, {
      credentials: 'same-origin',
      ...init,
    });
    if (!response.ok) return { ok: false, user: null };
    return parseMe(await response.json());
  } catch {
    return { ok: false, user: null };
  }
};

export const readMe = (
  fetchImpl: FetchLike = browserFetch,
): Promise<MeResult> => request('/api/me', { cache: 'no-store' }, fetchImpl);

export const getMe = (
  fetchImpl: FetchLike = browserFetch,
): Promise<ProfileUser | null> =>
  readMe(fetchImpl).then((result) => (result.ok ? result.user : null));

export const signInGoogle = async (
  credential: string,
  fetchImpl: FetchLike = browserFetch,
): Promise<ProfileUser | null> => {
  const result = await request(
    '/api/auth/google',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    },
    fetchImpl,
  );
  return result.ok ? result.user : null;
};

export const signOut = async (
  fetchImpl: FetchLike = browserFetch,
): Promise<boolean> => {
  try {
    const response = await fetchImpl('/api/auth/signout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    return response.ok;
  } catch {
    return false;
  }
};
