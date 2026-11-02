import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/** Only web pages open from content; any other scheme (javascript:, intent:, app links) is ignored. */
export const isWebUrl = (url: string) => /^https?:\/\/[^\s/]+/i.test(url.trim());

/** Email detection */
export const isEmail = (url: string) => /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(url.trim());
export const isMailtoUrl = (url: string) => /^mailto:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i.test(url.trim());

/** Telephone detection */
export const isTelUrl = (url: string) => /^tel:[+0-9\-().\s]+$/i.test(url.trim());
export function isPhoneNumber(text: string): boolean {
  const cleaned = text.trim();
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  return /^\+?[0-9\s\-().]{7,25}$/.test(cleaned);
}

/**
 * Opens a link from content (a post, message, event or profile).
 * Web links open in the in-app browser (or a new tab on web).
 * Email and telephone links open via the platform handler.
 * Resolves false when the link was refused or could not open.
 */
export async function openExternal(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (isWebUrl(trimmed)) {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(trimmed, '_blank', 'noopener,noreferrer');
        return true;
      }
      await WebBrowser.openBrowserAsync(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  let actionUrl: string | null = null;
  if (isMailtoUrl(trimmed) || isTelUrl(trimmed)) {
    actionUrl = trimmed;
  } else if (isEmail(trimmed)) {
    actionUrl = `mailto:${trimmed}`;
  } else if (isPhoneNumber(trimmed)) {
    actionUrl = `tel:${trimmed.replace(/[\s\-().]/g, '')}`;
  }

  if (actionUrl) {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = actionUrl;
        return true;
      }
      const canOpen = await Linking.canOpenURL(actionUrl);
      if (canOpen) {
        await Linking.openURL(actionUrl);
        return true;
      }
      await Linking.openURL(actionUrl);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
