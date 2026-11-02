import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { isEmail, isMailtoUrl, isPhoneNumber, isTelUrl, isWebUrl, openExternal } from '../links';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({})) }));

describe('openExternal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens web pages in the in-app browser', async () => {
    await expect(openExternal(' https://kinnoc.com/jobs ')).resolves.toBe(true);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://kinnoc.com/jobs');
  });

  it('reports a refused link or a browser that failed to open', async () => {
    await expect(openExternal('javascript:alert(1)')).resolves.toBe(false);
    (WebBrowser.openBrowserAsync as jest.Mock).mockRejectedValueOnce(new Error('No browser'));
    await expect(openExternal('https://kinnoc.com')).resolves.toBe(false);
  });

  it('ignores every other scheme for isWebUrl', () => {
    for (const url of ['javascript:alert(1)', 'intent://scan#Intent;end', 'kinnoc://settings', 'file:///etc/hosts', 'tel:123', 'https://', '']) {
      expect(isWebUrl(url)).toBe(false);
    }
  });

  it('handles mailto and email addresses', async () => {
    expect(isEmail('support@kinnoc.app')).toBe(true);
    expect(isMailtoUrl('mailto:support@kinnoc.app')).toBe(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined as never);
    await expect(openExternal('mailto:support@kinnoc.app')).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith('mailto:support@kinnoc.app');

    await expect(openExternal('support@kinnoc.app')).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith('mailto:support@kinnoc.app');
  });

  it('handles tel and phone numbers', async () => {
    expect(isPhoneNumber('+1-555-123-4567')).toBe(true);
    expect(isTelUrl('tel:+15551234567')).toBe(true);
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(undefined as never);
    await expect(openExternal('tel:+15551234567')).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith('tel:+15551234567');

    await expect(openExternal('+1 555 123 4567')).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith('tel:+15551234567');
  });
});
