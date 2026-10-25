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
  /** The connected backend does not offer this feature yet. */
  | 'unsupported'
  | 'unknown';

/** The single error type every API adapter throws, so screens handle failures one way. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  /** Field-level messages from validation failures, keyed by field name. */
  readonly fields: Record<string, string>;
  /** The API's stable error code, e.g. `OWNER_CANNOT_LEAVE`. Null for client-side failures. */
  readonly serverCode: string | null;
  /** The API's request ID, to quote when reporting a problem. */
  readonly requestId: string | null;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number | null = null,
    fields: Record<string, string> = {},
    serverCode: string | null = null,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
    this.serverCode = serverCode;
    this.requestId = requestId;
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

/** Thrown by adapters for features the connected backend does not offer yet. */
export const unsupported = (feature: string) =>
  new ApiError('unsupported', `${feature} isn't available yet.`);

export const isApiError = (error: unknown, serverCode?: string): error is ApiError =>
  error instanceof ApiError && (serverCode === undefined || error.serverCode === serverCode);

/** Messages for API codes where the generic status message would be unhelpful. */
const SERVER_MESSAGES: Record<string, string> = {
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  ACCOUNT_DEACTIVATED: 'This account has been deactivated.',
  AUTH_UNAVAILABLE: "We can't check your sign-in right now. Try again in a moment.",
  PROFILE_REQUIRED: 'Finish setting up your profile first.',
  INVITATION_REQUIRED: 'This community is invitation only.',
  MEMBERSHIP_REQUIRED: 'Only members can see this.',
  INSUFFICIENT_COMMUNITY_ROLE: "Your role in this community doesn't allow that.",
  OWNER_CANNOT_LEAVE: 'Owners can’t leave. Transfer ownership to another member first.',
  ALREADY_MEMBER: 'They are already a member.',
  ALREADY_INVITED: 'They already have an invitation.',
  JOIN_REQUEST_PENDING: 'They have already asked to join. Review their request instead.',
  SLUG_TAKEN: 'That community address is taken.',
  UNKNOWN_CATEGORY: 'Choose one of the listed categories.',
  INVALID_COMMUNITY_SETTINGS: 'Private communities can only grow by invitation.',
  INVALID_IMAGE_KEY: "That image couldn't be attached. Upload it again.",
  CANNOT_TARGET_SELF: "You can't do that to yourself.",
  COMMUNITY_NOT_FOUND: "This community isn't available.",
  MEMBER_NOT_FOUND: "They aren't a member any more.",
  JOIN_REQUEST_NOT_FOUND: 'That request was already handled.',
  INVITATION_NOT_FOUND: 'That invitation is no longer valid.',
  PROFILE_NOT_FOUND: 'No one has that username.',
  MESSAGE_NOT_FOUND: 'That message is no longer available.',
  INVALID_REPLY: "You can't reply to that message.",
  USERNAME_TAKEN: 'That username is taken.',
  RATE_LIMITED: "You're sending messages too quickly. Wait a moment.",
};

/** Plain-language message for any thrown value. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.serverCode && SERVER_MESSAGES[error.serverCode]) return SERVER_MESSAGES[error.serverCode];
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
      case 'unsupported':
        return error.message;
      default:
        return error.message || 'Something went wrong.';
    }
  }
  return 'Something went wrong.';
}
