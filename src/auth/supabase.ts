/**
 * Supabase Auth adapter. Uses only the public project URL and anon key; the backend verifies
 * the access token it receives. Sessions are kept in the device keychain via secureStorage.
 * Not yet tested against the Kinnoc Supabase project.
 */
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

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

export function createSupabaseAuth(url: string, anonKey: string): AuthService {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

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
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim(), username: username.trim().toLowerCase() } },
      });
      if (error) throw toAuthError(error);
      const session = toSession(data.session);
      return { session, needsEmailConfirmation: !session };
    },
    async requestPasswordReset(email) {
      // The reset link opens the Supabase-configured site URL; in-app reset is a follow-up.
      const { error } = await client.auth.resetPasswordForEmail(email.trim());
      if (error) throw toAuthError(error);
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session?.access_token ?? null;
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
      return () => data.subscription.unsubscribe();
    },
  };
}
