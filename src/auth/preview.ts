/**
 * DEVELOPMENT PREVIEW SIGN-IN — NOT REAL AUTHENTICATION.
 * Lets the app be reviewed before an identity provider is configured. It checks only that
 * the form is well formed, never sends credentials anywhere and never stores passwords.
 * `env.configProblems` blocks it in release builds unless EXPO_PUBLIC_ALLOW_PREVIEW=true.
 *
 * Dev affordances: the password "wrong-password" fails sign-in, and the email
 * "taken@example.com" fails sign-up, to exercise the error states.
 */
import { secureStorage } from './secureStorage';
import { AuthError, type AuthService, type AuthSession } from './types';

const KEY = 'kinnoc.preview-session';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const nameFromEmail = (email: string) => {
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Kinnoc Member';
};

export function createPreviewAuth(): AuthService {
  const listeners = new Set<(s: AuthSession | null) => void>();
  let current: AuthSession | null = null;

  async function persist(session: AuthSession | null) {
    current = session;
    if (session) await secureStorage.setItem(KEY, JSON.stringify(session));
    else await secureStorage.removeItem(KEY);
  }

  return {
    kind: 'preview',
    async restore() {
      try {
        const raw = await secureStorage.getItem(KEY);
        current = raw ? (JSON.parse(raw) as AuthSession) : null;
      } catch {
        current = null;
      }
      return current;
    },
    async signIn(email, password) {
      await wait(700);
      if (password === 'wrong-password') {
        throw new AuthError('invalid_credentials', "That email and password don't match.");
      }
      const session: AuthSession = {
        user: {
          id: 'u_me',
          email: email.trim().toLowerCase(),
          displayName: nameFromEmail(email),
          username: email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
        },
      };
      await persist(session);
      return session;
    },
    async signUp({ displayName, username, email }) {
      await wait(900);
      if (email.trim().toLowerCase() === 'taken@example.com') {
        throw new AuthError('email_taken', 'An account already uses this email. Sign in instead.');
      }
      const session: AuthSession = {
        user: { id: 'u_me', email: email.trim().toLowerCase(), displayName: displayName.trim(), username: username.trim().toLowerCase() },
      };
      await persist(session);
      return { session, needsEmailConfirmation: false };
    },
    async requestPasswordReset() {
      await wait(700);
    },
    async signOut() {
      await persist(null);
      listeners.forEach((l) => l(null));
    },
    async getAccessToken() {
      // The mock API needs no token; the HTTP API cannot be used with preview sign-in.
      return null;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
