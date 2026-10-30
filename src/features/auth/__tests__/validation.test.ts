import { passwordChecks, validatePassword } from '../validation';

describe('new-password rules', () => {
  it('ticks each rule as it is met, and the form accepts only when both are', () => {
    expect(passwordChecks('').map((c) => c.met)).toEqual([false, false]);
    expect(passwordChecks('abc12').map((c) => c.met)).toEqual([false, true]);
    expect(passwordChecks('abcdefgh').map((c) => c.met)).toEqual([true, false]);
    expect(passwordChecks('abcdefg1').map((c) => c.met)).toEqual([true, true]);
    expect(validatePassword('abc12', 'sign-up')).toBe('Use at least 8 characters.');
    expect(validatePassword('abcdefgh', 'sign-up')).toBe('Use a mix of letters and numbers.');
    expect(validatePassword('abcdefg1', 'sign-up')).toBeNull();
  });

  it('only asks for a password on sign-in', () => {
    expect(validatePassword('', 'sign-in')).toBe('Enter your password.');
    expect(validatePassword('x', 'sign-in')).toBeNull();
  });
});
