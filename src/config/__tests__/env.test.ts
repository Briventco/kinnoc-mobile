/** `env` reads EXPO_PUBLIC_* once, at import, so each case loads a fresh copy. */
function loadEnv(vars: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  let env!: typeof import('../env').env;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    env = (require('../env') as typeof import('../env')).env;
  });
  process.env = saved;
  return env;
}

describe('legal links', () => {
  it('are off until both published URLs are set', () => {
    expect(loadEnv({ EXPO_PUBLIC_TERMS_URL: '', EXPO_PUBLIC_PRIVACY_URL: '' }).legal).toBeNull();
    expect(loadEnv({ EXPO_PUBLIC_TERMS_URL: 'https://kinnoc.app/terms', EXPO_PUBLIC_PRIVACY_URL: '' }).legal).toBeNull();
  });

  it('accept only absolute https URLs', () => {
    expect(loadEnv({ EXPO_PUBLIC_TERMS_URL: 'http://kinnoc.app/terms', EXPO_PUBLIC_PRIVACY_URL: 'https://kinnoc.app/privacy' }).legal).toBeNull();
    expect(loadEnv({ EXPO_PUBLIC_TERMS_URL: 'kinnoc.app/terms', EXPO_PUBLIC_PRIVACY_URL: 'https://kinnoc.app/privacy' }).legal).toBeNull();
    expect(loadEnv({ EXPO_PUBLIC_TERMS_URL: ' https://kinnoc.app/terms ', EXPO_PUBLIC_PRIVACY_URL: 'https://kinnoc.app/privacy' }).legal).toEqual({
      termsUrl: 'https://kinnoc.app/terms',
      privacyUrl: 'https://kinnoc.app/privacy',
    });
  });
});
