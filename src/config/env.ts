/**
 * Public runtime configuration. Everything here ships inside the app bundle and can be read
 * by anyone who has the app, so only public values belong here (EXPO_PUBLIC_*).
 * Never put database URLs, service-role keys or other server secrets in these variables.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time, so each variable must be read
 * with its full literal name.
 */

export type ApiMode = 'mock' | 'http';
export type AuthMode = 'preview' | 'supabase';

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || undefined;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || undefined;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || undefined;

/** Development builds may use sample data and preview sign-in; release builds must opt in explicitly. */
const previewAllowed = __DEV__ || process.env.EXPO_PUBLIC_ALLOW_PREVIEW === 'true';

const apiMode: ApiMode = process.env.EXPO_PUBLIC_API_MODE === 'http' ? 'http' : 'mock';

/**
 * The Socket.IO endpoint for community chat, derived from the API URL: the server's origin
 * and `<API prefix>/socket.io`. `https://host/api/v1` → `https://host` + `/api/v1/socket.io`.
 */
function socketEndpoint(url: string | undefined) {
  const match = url?.match(/^(https?:\/\/[^/?#]+)(\/[^?#]*)?$/i);
  if (!match) return undefined;
  return { url: match[1], path: `${(match[2] ?? '').replace(/\/+$/, '')}/socket.io` };
}
const authMode: AuthMode = supabaseUrl && supabaseAnonKey ? 'supabase' : 'preview';

function collectProblems(): string[] {
  const problems: string[] = [];
  if (apiMode === 'http' && !apiUrl) {
    problems.push('EXPO_PUBLIC_API_MODE is "http" but EXPO_PUBLIC_API_URL is not set.');
  }
  if (apiMode === 'http' && apiUrl && !socketEndpoint(apiUrl)) {
    problems.push('EXPO_PUBLIC_API_URL must be a full URL such as https://kinnoc-api.onrender.com/api/v1.');
  }
  if (apiMode === 'http' && apiUrl && !__DEV__ && !apiUrl.startsWith('https://')) {
    problems.push('EXPO_PUBLIC_API_URL must use https in a release build.');
  }
  if (apiMode === 'mock' && !previewAllowed) {
    problems.push('This release build has no backend configured. Set EXPO_PUBLIC_API_MODE=http and EXPO_PUBLIC_API_URL.');
  }
  if (apiMode === 'http' && authMode === 'preview') {
    problems.push('The Kinnoc API needs real sign-in. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (authMode === 'preview' && !previewAllowed) {
    problems.push('This release build has no sign-in provider. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return problems;
}

export const env = {
  apiMode,
  apiUrl,
  socket: socketEndpoint(apiUrl),
  authMode,
  supabaseUrl,
  supabaseAnonKey,
  /** True when the app shows sample fixtures instead of the Kinnoc backend. */
  usesSampleData: apiMode === 'mock',
  /** True when sign-in is the local, non-production preview. */
  usesPreviewAuth: authMode === 'preview',
  configProblems: collectProblems(),
} as const;
