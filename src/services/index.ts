/**
 * The only place that chooses between real and development implementations.
 * Screens and hooks import `api`, `realtime` and `auth` from here and never from an adapter.
 */
import type { KinnocApi } from '@/api/contract';
import { createHttpClient } from '@/api/http/client';
import { createHttpApi } from '@/api/http';
import { createMockBackend, type MockViewer } from '@/api/mock';
import { noopRealtime, type RealtimeClient } from '@/api/realtime';
import { createPreviewAuth } from '@/auth/preview';
import { createSupabaseAuth } from '@/auth/supabase';
import type { AuthService } from '@/auth/types';
import { env } from '@/config/env';

export const auth: AuthService =
  env.authMode === 'supabase' && env.supabaseUrl && env.supabaseAnonKey
    ? createSupabaseAuth(env.supabaseUrl, env.supabaseAnonKey)
    : createPreviewAuth();

let viewer: MockViewer | null = null;
/** Lets the mock adapter show the signed-in name. No effect on the HTTP adapter. */
export function setMockViewer(next: MockViewer | null) {
  viewer = next;
}

let unauthorizedHandler: () => void = () => {};
/** Registered by AuthProvider: a 401 from the API signs the user out. */
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

function createBackend(): { api: KinnocApi; realtime: RealtimeClient } {
  if (env.apiMode === 'http' && env.apiUrl) {
    const client = createHttpClient({
      baseUrl: env.apiUrl,
      getAccessToken: () => auth.getAccessToken(),
      onUnauthorized: () => unauthorizedHandler(),
    });
    // Realtime transport is not chosen yet; conversations refresh by polling until it is.
    return { api: createHttpApi(client), realtime: noopRealtime };
  }
  return createMockBackend(() => viewer);
}

const backend = createBackend();
export const api = backend.api;
export const realtime = backend.realtime;
