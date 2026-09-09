const CACHE_NAME = 'screenerx-shell-v2';
const APP_SHELL = '/';
const NEXT_STATIC_PREFIX = '/_next/static/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// IndexedDB owns offline stock data and its stale-data state. This worker caches only
// immutable, hashed Next.js assets needed to reopen the shell while offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(APP_SHELL)));
    return;
  }

  if (!url.pathname.startsWith(NEXT_STATIC_PREFIX)) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        if (response.ok)
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      });
    }),
  );
});
