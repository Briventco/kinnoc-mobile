import * as WebBrowser from 'expo-web-browser';

import { isWebUrl, openExternal } from '../links';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

describe('openExternal', () => {
  it('opens web pages in the in-app browser', () => {
    openExternal(' https://kinnoc.com/jobs ');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://kinnoc.com/jobs');
  });

  it('ignores every other scheme', () => {
    for (const url of ['javascript:alert(1)', 'intent://scan#Intent;end', 'kinnoc://settings', 'file:///etc/hosts', 'tel:123', 'https://', '']) {
      expect(isWebUrl(url)).toBe(false);
    }
  });
});
