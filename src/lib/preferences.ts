import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Non-sensitive device preferences (onboarding progress and similar).
 * Never store tokens, passwords or personal data here; use auth/secureStorage for secrets.
 */
const KEYS = {
  onboardingDone: 'kinnoc.onboarding.v1',
} as const;

async function read(key: string) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // A failed write only means onboarding shows again next launch.
  }
}

export const preferences = {
  async hasCompletedOnboarding() {
    return (await read(KEYS.onboardingDone)) === 'true';
  },
  completeOnboarding() {
    return write(KEYS.onboardingDone, 'true');
  },
};
