/**
 * Supabase Auth adapter. Uses only the public project URL and anon key; the backend verifies
 * the access token it receives. Sessions are kept in the device keychain via secureStorage.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { secureStorage } from './secureStorage';
import { AuthError, type AuthService, type AuthSession } from './types';

function toSession(session: Session | null): AuthSession | null {
  if (!session) return null;
  const meta = (session.user.user_metadata ?? {}) as { display_name?: string; username?: string };
  return {
    user: {
      id: session.user.id,
      email: session.user.email ?? '',
      displayName: meta.display_name ?? session.user.email?.split('@')[0] ?? 'Kinnoc member',
      username: meta.username ?? '',
    },
  };
}

function toAuthError(error: { code?: string; message: string; status?: number }): AuthError {
  switch (error.code) {
    case 'invalid_credentials':
      return new AuthError('invalid_credentials', "That email and password don't match.");
    case 'user_already_exists':
    case 'email_exists':
      return new AuthError('email_taken', 'An account already uses this email. Sign in instead.');
    case 'weak_password':
      return new AuthError('weak_password', 'Choose a stronger password: at least 8 characters with a mix of letters and numbers.');
    case 'email_not_confirmed':
      return new AuthError('email_not_confirmed', 'Confirm your email first. We sent you a link.');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AuthError('rate_limited', 'Too many attempts. Wait a minute and try again.');
  }
  if (error.status === 0 || /network|fetch/i.test(error.message)) {
    return new AuthError('network', "You're offline. Check your connection and try again.");
  }
  return new AuthError('unknown', 'Something went wrong. Try again.');
}

/** Auth requests (sign-in, token refresh) give up after this, so a stalled network cannot hold startup. */
const AUTH_TIMEOUT_MS = 20_000;
const WEB_APP_URL = 'https://web.kinnoc.app';

/**
 * Returns the appropriate redirect URL for auth confirmation and password recovery emails.
 * On web, resolves to the actual browser origin (e.g. https://web.kinnoc.app) so links work
 * across production and development environments.
 */
export function getAuthRedirectUrl(): string | undefined {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/`;
    }
    return `${WEB_APP_URL}/`;
  }
  return undefined;
}

/**
 * `fetch` with a time limit for Supabase Auth calls. Storage uploads keep no limit: a large photo
 * on a slow connection can legitimately take longer. A timed-out refresh fails like being offline.
 */
export const authFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes('/auth/v1/') || init?.signal) return fetch(input, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/** Creates the Supabase client used for sign-in and for uploads to Storage with the user's session. */
export function createSupabaseClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { fetch: authFetch },
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

export function createSupabaseAuth(client: SupabaseClient): AuthService {
  // Refresh tokens only while the app is in the foreground, as Supabase recommends for React Native.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });

  return {
    kind: 'supabase',
    async restore() {
      const { data } = await client.auth.getSession();
      return toSession(data.session);
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw toAuthError(error);
      const session = toSession(data.session);
      if (!session) throw new AuthError('unknown', 'Sign-in did not return a session.');
      return session;
    },
    async signUp({ displayName, username, email, password }) {
      const emailRedirectTo = getAuthRedirectUrl();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim(), username: username.trim().toLowerCase() },
          ...(emailRedirectTo ? { emailRedirectTo } : {}),
        },
      });
      if (error) throw toAuthError(error);
      const session = toSession(data.session);
      return { session, needsEmailConfirmation: !session };
    },
    async requestPasswordReset(email) {
      // The reset link opens the configured site/redirect URL.
      const redirectTo = getAuthRedirectUrl();
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        ...(redirectTo ? { redirectTo } : {}),
      });
      if (error) throw toAuthError(error);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      // supabase-js keeps the stored session when it cannot read it first (an expired token it
      // failed to refresh, say offline). Remove it here, or the next launch would sign back in.
      if (error) {
        const { storageKey } = client.auth as unknown as { storageKey?: string };
        if (storageKey) await secureStorage.removeItem(storageKey).catch(() => undefined);
      }
    },
    async getAccessToken(options) {
      if (options?.refresh) {
        const { data, error } = await client.auth.refreshSession();
        // A refresh can fail offline; the caller then treats the session as still unknown.
        if (!error) return data.session?.access_token ?? null;
      }
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
  };
}
