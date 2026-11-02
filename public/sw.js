/* Kinnoc Web Push Service Worker */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function normalizeTargetUrl(url) {
  if (!url) return '/';
  try {
    let path = url;
    if (path.startsWith('kinnoc://')) {
      path = path.replace(/^kinnoc:\/\//, '/');
    } else if (path.includes('://')) {
      const parsed = new URL(path);
      path = parsed.pathname + parsed.search;
    }
    // /communities/:slug/chat -> /community/:slug
    path = path.replace(/^\/communities\/([^/?#]+)\/chat(?:\?(.*))?$/, (match, slug, query) => {
      return query ? `/community/${slug}?${query}` : `/community/${slug}`;
    });
    // /communities/:slug/requests -> /community/:slug/manage
    path = path.replace(/^\/communities\/([^/?#]+)\/requests(?:\?(.*))?$/, '/community/$1/manage');
    // /communities/:slug -> /community/:slug
    path = path.replace(/^\/communities\/([^/?#]+)(?:\?(.*))?$/, (match, slug, query) => {
      return query ? `/community/${slug}?${query}` : `/community/${slug}`;
    });
    // /feed?postId=:id -> /post/:id
    path = path.replace(/^\/feed\?.*postId=([^&#]+)/, '/post/$1');
    // /event/:slug -> /events/:slug
    path = path.replace(/^\/event\/([^/?#]+)(?:\?(.*))?$/, '/events/$1');
    // /invitation/:code -> /invite/:code
    path = path.replace(/^\/invitation\/([^/?#]+)(?:\?(.*))?$/, '/invite/$1');
    // /u/:username or /user/:username -> /profile/:username
    path = path.replace(/^\/(?:u|user)\/([^/?#]+)(?:\?(.*))?$/, '/profile/$1');
    if (path === '/feed') path = '/';
    if (path.startsWith('/settings/verification')) path = '/settings';
    return path;
  } catch (_e) {
    return url || '/';
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'Kinnoc', body: event.data.text() };
    }
  }

  const rawUrl = (data.data && data.data.url) || data.targetUrl || '/';
  const targetUrl = normalizeTargetUrl(rawUrl);

  const title = data.title || 'Kinnoc';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: {
      url: targetUrl,
    },
    vibrate: [100, 50, 100],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  const targetUrl = normalizeTargetUrl(rawUrl);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (const client of windowClients) {
        if ('focus' in client) {
          const clientPath = new URL(client.url).pathname;
          const targetPath = targetUrl.split('?')[0];
          if (clientPath === targetPath) {
            return client.focus();
          }
          if ('navigate' in client) {
            return client.navigate(targetUrl).then((c) => (c ? c.focus() : client.focus()));
          }
          return client.focus();
        }
      }
      // If no window open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});

