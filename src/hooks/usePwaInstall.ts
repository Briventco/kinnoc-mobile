import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

const DISMISS_KEY = 'kinnoc:pwa_prompt_dismissed';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

function checkStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const standaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const nav = window.navigator as unknown as { standalone?: boolean };
  return standaloneMedia || Boolean(nav.standalone);
}

function checkIOS(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) && !('MSStream' in window);
}

function checkDismissed(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

export function usePwaInstall() {
  const [isStandalone, setIsStandalone] = useState(checkStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(checkDismissed);
  const [isIOS] = useState(checkIOS);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || isStandalone) return;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, [isStandalone]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {}
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsStandalone(true);
      }
      setDeferredPrompt(null);
      return choice.outcome === 'accepted';
    } catch {
      return false;
    }
  }, [deferredPrompt]);

  const canPrompt =
    Platform.OS === 'web' &&
    !isStandalone &&
    !isDismissed &&
    (isIOS || deferredPrompt !== null);

  return {
    canPrompt,
    isStandalone,
    isIOS,
    hasNativePrompt: deferredPrompt !== null,
    install,
    dismiss,
  };
}
