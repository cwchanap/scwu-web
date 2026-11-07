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

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isIsoUtc = (value: string) =>
  ISO_UTC.test(value) && !Number.isNaN(Date.parse(value));

const userOf = (body: unknown): ProfileUser | null => {
  if (typeof body !== 'object' || body === null) return null;
  const { user } = body as { user?: unknown };
  if (typeof user !== 'object' || user === null) return null;
  const { name, avatarUrl, createdAt } = user as Record<string, unknown>;
  if (typeof name !== 'string') return null;
  if (typeof createdAt !== 'string' || !isIsoUtc(createdAt)) return null;
  if (avatarUrl !== null && typeof avatarUrl !== 'string') return null;
  return { name, avatarUrl, createdAt };
};

const request = async (
  path: string,
  init: RequestInit,
  fetchImpl: FetchLike,
): Promise<ProfileUser | null> => {
  try {
    const response = await fetchImpl(path, {
      credentials: 'same-origin',
      ...init,
    });
    if (!response.ok) return null;
    return userOf(await response.json());
  } catch {
    return null;
  }
};

export const getMe = (
  fetchImpl: FetchLike = browserFetch,
): Promise<ProfileUser | null> =>
  request('/api/me', { cache: 'no-store' }, fetchImpl);

export const signInGoogle = (
  credential: string,
  fetchImpl: FetchLike = browserFetch,
): Promise<ProfileUser | null> =>
  request(
    '/api/auth/google',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    },
    fetchImpl,
  );

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
