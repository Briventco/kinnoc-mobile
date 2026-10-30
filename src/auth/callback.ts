import { Platform } from 'react-native';

export interface AuthUrlFeedback {
  type: 'error' | 'success';
  message: string;
}

/**
 * Checks for Supabase Auth redirect parameters in the browser URL (hash or query),
 * cleans sensitive tokens / error codes from the URL bar, and returns user-friendly feedback.
 */
export function consumeAuthUrlFeedback(): AuthUrlFeedback | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  try {
    const hash = window.location.hash?.slice(1) || '';
    const search = window.location.search?.slice(1) || '';
    const params = new URLSearchParams(hash || search);

    const errorCode = params.get('error_code');
    const errorDescription = params.get('error_description');

    if (errorCode || errorDescription) {
      window.history.replaceState(null, '', window.location.pathname);

      if (errorCode === 'otp_expired') {
        return {
          type: 'error',
          message: 'This email confirmation link has expired. Please sign in or request a new one.',
        };
      }
      if (errorCode === 'access_denied') {
        return {
          type: 'error',
          message: 'Access was denied. The confirmation link may be invalid or already used.',
        };
      }
      return {
        type: 'error',
        message: errorDescription?.replace(/\+/g, ' ') || 'Authentication link is invalid or has expired.',
      };
    }

    const type = params.get('type');
    const accessToken = params.get('access_token');
    if (accessToken) {
      window.history.replaceState(null, '', window.location.pathname);
      if (type === 'signup') {
        return {
          type: 'success',
          message: 'Email confirmed! Welcome to Kinnoc.',
        };
      }
      if (type === 'recovery') {
        return {
          type: 'success',
          message: 'Password reset link verified.',
        };
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}
