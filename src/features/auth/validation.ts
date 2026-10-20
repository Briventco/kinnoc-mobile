export function validateEmail(value: string) {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter an email like name@example.com.';
  return null;
}

export function validatePassword(value: string, mode: 'sign-in' | 'sign-up') {
  if (!value) return 'Enter your password.';
  if (mode === 'sign-up') {
    if (value.length < 8) return 'Use at least 8 characters.';
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Use a mix of letters and numbers.';
  }
  return null;
}

export function validateName(value: string) {
  const v = value.trim();
  if (!v) return 'Add your name so people know who you are.';
  if (v.length > 50) return 'Keep your name under 50 characters.';
  return null;
}

export function validateUsername(value: string) {
  const v = value.trim();
  if (!v) return 'Choose a username.';
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(v)) return 'Use 3 to 20 letters, numbers or underscores.';
  return null;
}
