import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { queryClient } from '@/lib/query';
import { auth, setMockViewer, setUnauthorizedHandler } from '@/services';

import type { AuthSession, SignUpInput, SignUpResult } from './types';

type Status = 'restoring' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: Status;
  session: AuthSession | null;
  isPreview: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: SignUpInput): Promise<SignUpResult>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('restoring');
  const [session, setSession] = useState<AuthSession | null>(null);

  const apply = useCallback((next: AuthSession | null) => {
    setSession(next);
    setMockViewer(next ? { displayName: next.user.displayName, username: next.user.username } : null);
    if (!next) {
      // Drop every cached response so the next person on this device sees none of it.
      queryClient.clear();
    }
    setStatus(next ? 'signedIn' : 'signedOut');
  }, []);

  useEffect(() => {
    let active = true;
    auth
      .restore()
      .catch(() => null)
      .then((restored) => active && apply(restored));
    const unsubscribe = auth.subscribe((next) => active && apply(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [apply]);

  const signOut = useCallback(async () => {
    try {
      await auth.signOut();
    } finally {
      apply(null);
    }
  }, [apply]);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      isPreview: auth.kind === 'preview',
      async signIn(email, password) {
        apply(await auth.signIn(email, password));
      },
      async signUp(input) {
        const result = await auth.signUp(input);
        if (result.session) apply(result.session);
        return result;
      },
      requestPasswordReset: (email) => auth.requestPasswordReset(email),
      signOut,
    }),
    [status, session, apply, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
