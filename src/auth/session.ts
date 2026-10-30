/**
 * Whether cached data must be dropped when the session changes: on sign-out, or when another
 * account takes over without a sign-out in between (`previous` and `next` are user IDs).
 */
export const mustClearCache = (previous: string | null, next: string | null) => !next || (!!previous && previous !== next);
