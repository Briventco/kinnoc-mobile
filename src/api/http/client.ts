import { ApiError, codeForStatus } from '../errors';

export interface HttpClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Called once when the server rejects the session (401). */
  onUnauthorized: () => void;
  timeoutMs?: number;
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Multipart uploads pass FormData; JSON is the default. */
  form?: FormData;
  signal?: AbortSignal;
}

function buildUrl(baseUrl: string, path: string, query?: Query) {
  const qs = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${baseUrl}${path}${qs ? `?${qs}` : ''}`;
}

/** Thin fetch wrapper: bearer auth, timeouts, JSON, and one error type. */
export function createHttpClient(options: HttpClientOptions) {
  const timeoutMs = options.timeoutMs ?? 15000;

  async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const token = await options.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal?.addEventListener('abort', () => controller.abort());

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (opts.form) {
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await fetch(buildUrl(options.baseUrl, path, opts.query), {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted && !opts.signal?.aborted
        ? new ApiError('timeout', 'Request timed out')
        : new ApiError('network', 'Network request failed');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized();
      const err = (payload ?? {}) as { error?: { message?: string; fields?: Record<string, string> } };
      throw new ApiError(
        codeForStatus(response.status),
        err.error?.message ?? `Request failed (${response.status})`,
        response.status,
        err.error?.fields ?? {},
      );
    }
    return payload as T;
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
