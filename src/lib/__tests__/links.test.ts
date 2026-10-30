import * as WebBrowser from 'expo-web-browser';

import { isWebUrl, openExternal } from '../links';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

describe('openExternal', () => {
  it('opens web pages in the in-app browser', async () => {
    await expect(openExternal(' https://kinnoc.com/jobs ')).resolves.toBe(true);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://kinnoc.com/jobs');
  });

  it('reports a refused link or a browser that failed to open', async () => {
    await expect(openExternal('javascript:alert(1)')).resolves.toBe(false);
    (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValueOnce(new Error('No browser'));
    await expect(openExternal('https://kinnoc.com')).resolves.toBe(false);
  });

  it('ignores every other scheme', () => {
    for (const url of ['javascript:alert(1)', 'intent://scan#Intent;end', 'kinnoc://settings', 'file:///etc/hosts', 'tel:123', 'https://', '']) {
      expect(isWebUrl(url)).toBe(false);
    }
  });
});
