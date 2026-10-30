export function validateEmail(value: string) {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter an email like name@example.com.';
  return null;
}

/** The new-password rules, for the live checklist on sign-up. `validatePassword` enforces the same. */
export function passwordChecks(value: string) {
  return [
    { label: '8 or more characters', met: value.length >= 8 },
    { label: 'Letters and numbers', met: /[A-Za-z]/.test(value) && /\d/.test(value) },
  ];
}

export function validatePassword(value: string, mode: 'sign-in' | 'sign-up') {
  if (!value) return 'Enter your password.';
  if (mode === 'sign-up') {
    const [length, mix] = passwordChecks(value);
    if (!length.met) return 'Use at least 8 characters.';
    if (!mix.met) return 'Use a mix of letters and numbers.';
  }
  return null;
}

export function validateName(value: string) {
  const v = value.trim();
  if (!v) return 'Add your name so people know who you are.';
  if (v.length > 60) return 'Keep your name under 60 characters.';
  return null;
}

/** Same rules as the Kinnoc API (case-insensitive, stored in lowercase). */
const RESERVED_USERNAMES = ['admin', 'administrator', 'api', 'brivent', 'help', 'kinnoc', 'me', 'moderator', 'null', 'official', 'root', 'security', 'staff', 'support', 'system', 'undefined'];

export function validateUsername(value: string) {
  const v = value.trim().toLowerCase();
  if (!v) return 'Choose a username.';
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(v)) return 'Use 3 to 30 letters, numbers or underscores, starting with a letter.';
  if (RESERVED_USERNAMES.includes(v)) return 'That username is reserved. Try another.';
  return null;
}
