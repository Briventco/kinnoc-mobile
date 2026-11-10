import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { FeedbackDevice } from '@/api/types';

/** The API stores at most 50 characters for each version. */
const clip = (value: string | null | undefined) => (value ? String(value).trim().slice(0, 50) || null : null);

/**
 * What the app already knows about where it runs, for bug reports: its version, the platform and
 * the OS version. Nothing identifying the device or the person is read.
 */
export function currentDevice(): FeedbackDevice {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web' ? Platform.OS : 'other';
  let osVersion: string | null = null;
  if (Platform.OS === 'ios') osVersion = clip(String(Platform.Version));
  else if (Platform.OS === 'android') {
    // "14" rather than the API level (34) where React Native exposes it.
    const release = (Platform.constants as { Release?: string } | undefined)?.Release;
    osVersion = clip(release ?? `API ${Platform.Version}`);
  }
  return { appVersion: clip(Constants.expoConfig?.version), platform, osVersion };
}
