import * as WebBrowser from 'expo-web-browser';

/** Only web pages open from content; any other scheme (javascript:, intent:, app links) is ignored. */
export const isWebUrl = (url: string) => /^https?:\/\/[^\s/]+/i.test(url.trim());

/**
 * Opens a link from content (a post, message, event or profile) in the in-app browser. Links come
 * from other people, so they never reach the system URL handler, which would open other apps.
 */
export function openExternal(url: string) {
  if (!isWebUrl(url)) return;
  void WebBrowser.openBrowserAsync(url.trim()).catch(() => undefined);
}
