/**
 * The only place that chooses between real and development implementations.
 * Screens and hooks import `api`, `realtime` and `auth` from here and never from an adapter.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { KinnocApi } from '@/api/contract';
import { unsupported } from '@/api/errors';
import { createHttpClient } from '@/api/http/client';
import { createHttpApi } from '@/api/http';
import { createSocketRealtime } from '@/api/http/socket';
import { createCommunityImageUploader } from '@/api/http/storage';
import { createMockBackend, type MockViewer } from '@/api/mock';
import { noopRealtime, type RealtimeClient } from '@/api/realtime';
import { createPreviewAuth } from '@/auth/preview';
import { createSupabaseAuth, createSupabaseClient } from '@/auth/supabase';
import type { AuthService } from '@/auth/types';
import { env } from '@/config/env';

const supabase: SupabaseClient | null =
  env.authMode === 'supabase' && env.supabaseUrl && env.supabaseAnonKey ? createSupabaseClient(env.supabaseUrl, env.supabaseAnonKey) : null;

export const auth: AuthService = supabase ? createSupabaseAuth(supabase) : createPreviewAuth();

let viewer: MockViewer | null = null;
/** Lets the mock adapter show the signed-in name. No effect on the HTTP adapter. */
export function setMockViewer(next: MockViewer | null) {
  viewer = next;
}

let unauthorizedHandler: () => void = () => {};
/** Registered by AuthProvider: a 401 the API still returns after a token refresh signs the user out. */
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

function createBackend(): { api: KinnocApi; realtime: RealtimeClient } {
  if (env.apiMode === 'http' && env.apiUrl) {
    const getAccessToken = (options?: { refresh?: boolean }) => auth.getAccessToken(options);
    const client = createHttpClient({
      baseUrl: env.apiUrl,
      getAccessToken,
      onUnauthorized: () => unauthorizedHandler(),
    });
    const api = createHttpApi(client, {
      // Images go to Supabase Storage with the user's own session; without Supabase there is no upload.
      uploadCommunityImage: supabase ? createCommunityImageUploader(supabase) : () => Promise.reject(unsupported('Image upload')),
    });
    const realtime = env.socket ? createSocketRealtime({ ...env.socket, getAccessToken, appState: AppState }) : noopRealtime;
    return { api, realtime };
  }
  return createMockBackend(() => viewer);
}

const backend = createBackend();
export const api = backend.api;
export const realtime = backend.realtime;
