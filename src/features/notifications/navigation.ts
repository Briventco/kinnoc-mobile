import { normalizeDeepLinkTarget } from '@/lib/deepLinks';

/**
 * Normalizes notification destination URLs to ensure valid Expo Router routes.
 * Re-exports normalizeDeepLinkTarget for complete backwards compatibility.
 */
export function normalizeNotificationTarget(targetUrl?: string | null): string {
  return normalizeDeepLinkTarget(targetUrl);
}
