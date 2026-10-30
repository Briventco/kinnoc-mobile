import * as WebBrowser from 'expo-web-browser';

/** Only web pages open from content; any other scheme (javascript:, intent:, app links) is ignored. */
export const isWebUrl = (url: string) => /^https?:\/\/[^\s/]+/i.test(url.trim());

/**
 * Opens a link from content (a post, message, event or profile) in the in-app browser. Links come
 * from other people, so they never reach the system URL handler, which would open other apps.
 * Resolves false when the link was refused or the browser could not open, so callers can say so.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!isWebUrl(url)) return false;
  try {
    await WebBrowser.openBrowserAsync(url.trim());
    return true;
  } catch {
    return false;
  }
}
