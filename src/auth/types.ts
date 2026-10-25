export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  username: string;
}

export interface AuthSession {
  user: AuthUser;
}

export interface SignUpInput {
  displayName: string;
  username: string;
  email: string;
  password: string;
}

export interface SignUpResult {
  /** Null when the provider requires the user to confirm their email first. */
  session: AuthSession | null;
  needsEmailConfirmation: boolean;
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'username_taken'
  | 'weak_password'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/**
 * What the app needs from an identity provider. Implemented by `supabase.ts` (production
 * path) and `preview.ts` (development only, not real authentication).
 */
export interface AuthService {
  readonly kind: 'supabase' | 'preview';
  restore(): Promise<AuthSession | null>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * A fresh access token for API calls, refreshed if needed. Null when signed out. `refresh`
   * forces a refresh, for when the API has rejected the current token.
   */
  getAccessToken(options?: { refresh?: boolean }): Promise<string | null>;
  /** Fires when the provider changes the session (refresh failure, sign-out elsewhere). */
  subscribe(listener: (session: AuthSession | null) => void): () => void;
}
