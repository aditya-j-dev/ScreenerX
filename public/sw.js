const CACHE_PREFIX = 'screenerx-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const APP_SHELL = '/';
const NEXT_STATIC_PREFIX = '/_next/static/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(APP_SHELL, { cache: 'reload' });
      if (!response.ok) throw new Error('Unable to cache app shell');
      const html = await response.clone().text();
      // Save initial JS/CSS even when registration happens after the page loaded them.
      const assets = new Set();
      for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
        const url = new URL(match[1], self.location.origin);
        if (url.origin === self.location.origin && url.pathname.startsWith(NEXT_STATIC_PREFIX))
          assets.add(url.href);
      }
      await Promise.all([...assets].map((url) => cache.add(url)));
      await cache.put(APP_SHELL, response);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Stock data is managed separately in IndexedDB; API responses are never cached here.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.status >= 500) throw new Error('App shell unavailable');
          if (response.ok && url.pathname === APP_SHELL) {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(APP_SHELL, response.clone());
            } catch {
              /* Serve the network response if storage fails. */
            }
          }
          return response;
        } catch {
          return (
            (await caches.match(APP_SHELL)) ||
            new Response('Offline app unavailable. Connect to the internet and reload.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            })
          );
        }
      })(),
    );
    return;
  }
  if (!url.pathname.startsWith(NEXT_STATIC_PREFIX)) return;
  event.respondWith(
    (async () => {
      let cache;
      try {
        cache = await caches.open(CACHE_NAME);
        const saved = await cache.match(event.request);
        if (saved) return saved;
      } catch {
        /* Network requests still work when Cache Storage is unavailable. */
      }
      const response = await fetch(event.request);
      if (response.ok && cache) {
        try {
          await cache.put(event.request, response.clone());
        } catch {
          /* Best effort. */
        }
      }
      return response;
    })(),
  );
});
