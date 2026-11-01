import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '@/services';

export function isWebPushSupported(): boolean {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.warn('[WebPush] Service Worker registration failed:', err);
    return null;
  }
}

export async function getPushPermissionState(): Promise<NotificationPermission | 'unsupported'> {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToWebPush(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: 'Web Push is not supported in this browser' };
  }

  try {
    // 1. Ensure service worker is registered
    const registration = await registerServiceWorker();
    if (!registration) {
      return { success: false, error: 'Could not register service worker' };
    }

    // 2. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: `Notification permission ${permission}` };
    }

    // 3. Fetch VAPID public key from backend
    if (!api.notifications.vapidPublicKey) {
      return { success: false, error: 'Notifications API is not configured' };
    }
    const vapidKey = await api.notifications.vapidPublicKey();
    if (!vapidKey) {
      return { success: false, error: 'VAPID public key not available from server' };
    }

    // 4. Subscribe to PushManager
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey as unknown as BufferSource,
    });

    // 5. Convert keys to base64 strings
    const p256dhKey = subscription.getKey('p256dh');
    const authKey = subscription.getKey('auth');
    if (!p256dhKey || !authKey) {
      return { success: false, error: 'Could not extract subscription keys' };
    }

    const p256dh = btoa(String.fromCharCode(...new Uint8Array(p256dhKey)));
    const auth = btoa(String.fromCharCode(...new Uint8Array(authKey)));

    // 6. Register with backend
    if (api.notifications.subscribePush) {
      await api.notifications.subscribePush({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: { p256dh, auth },
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('[WebPush] Subscription error:', err);
    return { success: false, error: err?.message || 'Failed to subscribe' };
  }
}

export async function unsubscribeFromWebPush(): Promise<{ success: boolean; error?: string }> {
  if (!isWebPushSupported()) return { success: false };

  try {
    const subscription = await getCurrentPushSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      if (api.notifications.unsubscribePush) {
        await api.notifications.unsubscribePush(endpoint).catch(() => undefined);
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('[WebPush] Unsubscription error:', err);
    return { success: false, error: err?.message || 'Failed to unsubscribe' };
  }
}

export function useWebPushStatus() {
  const [supported] = useState(() => isWebPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (!isWebPushSupported()) return 'unsupported';
    return typeof Notification !== 'undefined' ? Notification.permission : 'default';
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    void getCurrentPushSubscription().then((sub) => {
      if (!cancelled) {
        setIsSubscribed(Boolean(sub));
        if (typeof Notification !== 'undefined') {
          setPermission(Notification.permission);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [supported]);

  const refresh = async () => {
    if (!supported) return;
    const perm = await getPushPermissionState();
    setPermission(perm);
    const sub = await getCurrentPushSubscription();
    setIsSubscribed(Boolean(sub));
  };

  const toggle = async () => {
    setLoading(true);
    try {
      if (isSubscribed) {
        await unsubscribeFromWebPush();
      } else {
        await subscribeToWebPush();
      }
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return {
    supported,
    permission,
    isSubscribed,
    loading,
    refresh,
    toggle,
  };
}

