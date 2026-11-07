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

const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isIsoUtc = (value: string) => {
  const match = ISO_UTC.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 && leap ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return (
    Number(match[3]) >= 1 &&
    Number(match[3]) <= days &&
    Number(match[4]) <= 23 &&
    Number(match[5]) <= 59 &&
    Number(match[6]) <= 59
  );
};

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
  if (typeof name !== 'string') return { ok: false, user: null };
  if (typeof createdAt !== 'string' || !isIsoUtc(createdAt))
    return { ok: false, user: null };
  if (avatarUrl !== null && typeof avatarUrl !== 'string')
    return { ok: false, user: null };
  return { ok: true, user: { name, avatarUrl, createdAt } };
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
