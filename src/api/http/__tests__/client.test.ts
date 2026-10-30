import { ApiError } from '../../errors';
import { createHttpClient } from '../client';

type Reply = { status: number; body?: unknown };

/** A fetch stand-in that answers from a queue and records each request. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new TypeError('Network request failed');
    return {
      status: reply.status,
      ok: reply.status >= 200 && reply.status < 300,
      json: async () => {
        if (reply.body === undefined) throw new SyntaxError('no body');
        return reply.body;
      },
    } as Response;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function setup(replies: Reply[], tokens: (string | null)[] = ['token-1']) {
  const { fetch, calls } = fakeFetch(replies);
  const getAccessToken = jest.fn(async (options?: { refresh?: boolean }) => (options?.refresh ? (tokens[1] ?? null) : tokens[0]));
  const onUnauthorized = jest.fn();
  const client = createHttpClient({ baseUrl: 'https://api.test/api/v1', getAccessToken, onUnauthorized, fetch });
  return { client, calls, getAccessToken, onUnauthorized };
}

const headers = (init: RequestInit) => init.headers as Record<string, string>;

describe('createHttpClient', () => {
  it('fails with a retryable timeout when the session never yields a token', async () => {
    jest.useFakeTimers();
    try {
      const { fetch, calls } = fakeFetch([{ status: 200, body: { data: {} } }]);
      // A session refresh stuck on a bad connection: the token never arrives.
      const getAccessToken = () => new Promise<string | null>(() => {});
      const client = createHttpClient({ baseUrl: 'https://api.test/api/v1', getAccessToken, onUnauthorized: jest.fn(), fetch, timeoutMs: 15000 });
      const request = client.post('/users/provision');
      jest.advanceTimersByTime(15000);
      await expect(request).rejects.toMatchObject({ code: 'timeout', retryable: true, serverCode: 'SESSION_TIMEOUT' });
      expect(calls).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('sends the bearer token and unwraps the { data } envelope', async () => {
    const { client, calls } = setup([{ status: 200, body: { data: { id: 'c1' } } }]);
    await expect(client.get('/communities/c1')).resolves.toEqual({ id: 'c1' });
    expect(calls[0].url).toBe('https://api.test/api/v1/communities/c1');
    expect(headers(calls[0].init).Authorization).toBe('Bearer token-1');
  });

  it('builds query strings without empty values', async () => {
    const { client, calls } = setup([{ status: 200, body: { data: { items: [], nextCursor: null } } }]);
    await client.get('/communities', { query: { q: 'design lab', category: null, cursor: undefined, limit: 20 } });
    expect(calls[0].url).toBe('https://api.test/api/v1/communities?q=design%20lab&limit=20');
  });

  it('sends JSON bodies', async () => {
    const { client, calls } = setup([{ status: 201, body: { data: {} } }]);
    await client.post('/communities', { body: { name: 'Design Lab' } });
    expect(calls[0].init.method).toBe('POST');
    expect(headers(calls[0].init)['Content-Type']).toBe('application/json');
    expect(calls[0].init.body).toBe('{"name":"Design Lab"}');
  });

  it('returns undefined for 204', async () => {
    const { client } = setup([{ status: 204 }]);
    await expect(client.post('/communities/c1/leave')).resolves.toBeUndefined();
  });

  it('turns the { error } envelope into an ApiError with the API code, fields and request ID', async () => {
    const { client } = setup([
      {
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            details: [{ field: 'name', errors: ['name must be longer than or equal to 3 characters'] }],
            requestId: 'req-1',
          },
        },
      },
    ]);
    const error = await client.post('/communities', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'validation',
      status: 400,
      serverCode: 'VALIDATION_FAILED',
      requestId: 'req-1',
      fields: { name: 'name must be longer than or equal to 3 characters' },
    });
  });

  it('maps statuses to error codes', async () => {
    const { client } = setup([
      { status: 403, body: { error: { code: 'MEMBERSHIP_REQUIRED', message: 'x' } } },
      { status: 404, body: { error: { code: 'COMMUNITY_NOT_FOUND', message: 'x' } } },
      { status: 409, body: { error: { code: 'OWNER_CANNOT_LEAVE', message: 'x' } } },
      { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'x' } } },
      { status: 503, body: { error: { code: 'AUTH_UNAVAILABLE', message: 'x' } } },
    ]);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push(((await client.get('/x').catch((e: unknown) => e)) as ApiError).code);
    expect(codes).toEqual(['forbidden', 'not_found', 'conflict', 'rate_limited', 'server']);
  });

  it('refreshes an expired token once and retries, without signing out', async () => {
    const { client, calls, onUnauthorized, getAccessToken } = setup(
      [
        { status: 401, body: { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'expired' } } },
        { status: 200, body: { data: 'ok' } },
      ],
      ['old-token', 'new-token'],
    );
    await expect(client.get('/users/me')).resolves.toBe('ok');
    expect(getAccessToken).toHaveBeenCalledWith({ refresh: true });
    expect(headers(calls[1].init).Authorization).toBe('Bearer new-token');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('ends the session when the API still rejects the refreshed token', async () => {
    const expired = { status: 401, body: { error: { code: 'AUTH_TOKEN_EXPIRED', message: 'expired' } } };
    const { client, onUnauthorized } = setup([expired, expired], ['old-token', 'new-token']);
    await expect(client.get('/users/me')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not sign out when Supabase keys are unreachable (503)', async () => {
    const { client, onUnauthorized } = setup([{ status: 503, body: { error: { code: 'AUTH_UNAVAILABLE', message: 'x' } } }]);
    await expect(client.get('/users/me')).rejects.toMatchObject({ code: 'server', retryable: true });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('reports a failed connection as a network error', async () => {
    const { client } = setup([]);
    await expect(client.get('/users/me')).rejects.toMatchObject({ code: 'network' });
  });
});
