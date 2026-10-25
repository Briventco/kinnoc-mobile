import { ApiError, codeForStatus } from '../errors';

export interface HttpClientOptions {
  /** Base URL including the API prefix, e.g. `https://kinnoc-api.onrender.com/api/v1`. */
  baseUrl: string;
  /**
   * Returns the current access token, or null when signed out. With `refresh`, the session is
   * refreshed first (used once after the API reports an expired or rejected token).
   */
  getAccessToken: (options?: { refresh?: boolean }) => Promise<string | null>;
  /** Called when the API still rejects the session after a refresh (401). */
  onUnauthorized: () => void;
  timeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

/** The API's error envelope: `{ "error": { code, message, details, requestId } }`. */
interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
}

function buildUrl(baseUrl: string, path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

/** `VALIDATION_FAILED` details are `[{ field, errors: [...] }]`; keep the first message per field. */
function fieldErrors(details: unknown): Record<string, string> {
  if (!Array.isArray(details)) return {};
  const fields: Record<string, string> = {};
  for (const entry of details) {
    const { field, errors } = (entry ?? {}) as { field?: unknown; errors?: unknown };
    if (typeof field === 'string' && Array.isArray(errors) && typeof errors[0] === 'string') {
      fields[field] = errors[0];
    }
  }
  return fields;
}

export function toApiError(status: number, payload: unknown): ApiError {
  const err = (payload ?? {}) as ErrorEnvelope;
  return new ApiError(
    codeForStatus(status),
    err.error?.message ?? `Request failed (${status})`,
    status,
    fieldErrors(err.error?.details),
    err.error?.code ?? null,
    err.error?.requestId ?? null,
  );
}

/** Token problems that a refreshed session can fix. */
const REFRESHABLE = new Set(['AUTH_TOKEN_EXPIRED', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_MISSING']);

/**
 * Thin fetch wrapper for the Kinnoc API: bearer auth, timeouts, JSON, the `{ data }` and
 * `{ error }` envelopes, and one error type. An expired token is refreshed and the request
 * retried once before the session is treated as ended.
 */
export function createHttpClient(options: HttpClientOptions) {
  const timeoutMs = options.timeoutMs ?? 15000;
  const doFetch = options.fetch ?? fetch;

  async function attempt(method: string, path: string, opts: RequestOptions, token: string | null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onAbort);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    try {
      return await doFetch(buildUrl(options.baseUrl, path, opts.query), { method, headers, body, signal: controller.signal });
    } catch {
      throw controller.signal.aborted && !opts.signal?.aborted
        ? new ApiError('timeout', 'Request timed out')
        : new ApiError('network', 'Network request failed');
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const token = await options.getAccessToken();
    let response = await attempt(method, path, opts, token);
    let payload = response.status === 204 ? null : await readJson(response);

    if (response.status === 401 && token) {
      const code = (payload as ErrorEnvelope | null)?.error?.code;
      if (!code || REFRESHABLE.has(code)) {
        const fresh = await options.getAccessToken({ refresh: true }).catch(() => null);
        if (fresh) {
          response = await attempt(method, path, opts, fresh);
          payload = response.status === 204 ? null : await readJson(response);
        }
      }
    }

    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized();
      throw toApiError(response.status, payload);
    }
    if (response.status === 204) return undefined as T;
    return (payload as { data: T } | null)?.data as T;
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
    post: <T>(path: string, opts?: RequestOptions) => request<T>('POST', path, opts),
    put: <T>(path: string, opts?: RequestOptions) => request<T>('PUT', path, opts),
    patch: <T>(path: string, opts?: RequestOptions) => request<T>('PATCH', path, opts),
    delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
