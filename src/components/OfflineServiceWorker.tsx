'use client';

import { useEffect } from 'react';

/** Registers the app-shell cache; the separately managed IndexedDB cache supplies stock data offline. */
export function OfflineServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .catch(() => undefined);
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  return null;
}
