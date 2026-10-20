export type ApiErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'unknown';

/** The single error type every API adapter throws, so screens handle failures one way. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** Field-level messages from validation failures, keyed by field name. */
  readonly fields: Record<string, string>;

  constructor(code: ApiErrorCode, message: string, status: number | null = null, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }

  get retryable() {
    return this.code === 'network' || this.code === 'timeout' || this.code === 'server' || this.code === 'rate_limited';
  }
}

export function codeForStatus(status: number): ApiErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Plain-language message for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'network':
        return "You're offline or the connection dropped.";
      case 'timeout':
        return 'That took too long to load.';
      case 'unauthorized':
        return 'Your session has ended. Sign in again.';
      case 'forbidden':
        return "You don't have access to this.";
      case 'not_found':
        return "This isn't available any more.";
      case 'rate_limited':
        return 'Too many attempts. Wait a moment and try again.';
      case 'server':
        return 'Something went wrong on our side.';
      default:
        return error.message || 'Something went wrong.';
    }
  }
  return 'Something went wrong.';
}
