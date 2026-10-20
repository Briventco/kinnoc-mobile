import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { preferences } from '@/lib/preferences';

interface OnboardingContextValue {
  /** Null while the stored flag loads. */
  completed: boolean | null;
  complete(): void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/** Remembers on this device that the intro has been seen. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [completed, setCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    preferences.hasCompletedOnboarding().then(setCompleted);
  }, []);

  const complete = useCallback(() => {
    setCompleted(true);
    void preferences.completeOnboarding();
  }, []);

  const value = useMemo(() => ({ completed, complete }), [completed, complete]);
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider');
  return ctx;
}
